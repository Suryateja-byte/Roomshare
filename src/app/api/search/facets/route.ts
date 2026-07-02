/**
 * /api/search/facets - Return counts per filter option
 *
 * Returns facet counts for filter options based on current filter state:
 * - amenities: { "Wifi": 45, "Parking": 23 }
 * - houseRules: { "Pets allowed": 30 }
 * - roomTypes: { "Private Room": 50, "Shared Room": 20 }
 * - priceRanges: { min: 500, max: 3000, median: 1200 }
 *
 * Uses GROUP BY queries with LIMIT 100 to cap expensive aggregations.
 * Cached with 30s TTL.
 *
 * Performance considerations:
 * - Queries are run in parallel for efficiency
 * - Results are cached to avoid redundant database calls
 * - LIMIT 100 prevents expensive aggregations on large datasets
 */

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { parseSearchParams } from "@/lib/search-params";
import { unstable_cache } from "next/cache";
import { withRateLimitRedis } from "@/lib/with-rate-limit-redis";
import {
  createContextFromHeaders,
  runWithRequestContext,
  getRequestId,
} from "@/lib/request-context";
import { crossesAntimeridian } from "@/lib/data";
import { clampBoundsToMaxSpan } from "@/lib/validation";
import {
  MAP_FETCH_MAX_LAT_SPAN,
  MAP_FETCH_MAX_LNG_SPAN,
} from "@/lib/constants";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { withTimeout, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";
import { features } from "@/lib/env";
import { joinWhereClauseWithSecurityInvariant } from "@/lib/sql-safety";
import { SEARCH_DOC_ALLOWED_SQL_LITERALS } from "@/lib/search/search-doc-queries";
import { buildFacetWhereConditions } from "@/lib/search/facet-where";

// Cache TTL in seconds
const CACHE_TTL = 30;
const FACET_QUERY_TIMEOUT_MS = 5000;

// Maximum results per facet to prevent expensive aggregations
const MAX_FACET_RESULTS = 100;

/**
 * Prisma interactive-transaction client used by facet query helpers.
 * All five facet queries share a single transaction with one
 * SET LOCAL statement_timeout for the whole batch.
 *
 * SECURITY AUDIT: $queryRawUnsafe used with parameterized queries ($N placeholders).
 * All user-supplied values MUST be in the `params` array. The `query` string must
 * contain ONLY hard-coded SQL with $N parameter placeholders — never interpolate
 * user input directly. The SET LOCAL uses a hard-coded constant (FACET_QUERY_TIMEOUT_MS).
 */
type FacetTxClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $executeRawUnsafe(query: string, ...values: any[]): Promise<number>;
};

/**
 * A single histogram bucket for price distribution
 */
export interface PriceHistogramBucket {
  min: number;
  max: number;
  count: number;
}

/**
 * Response shape for facets endpoint
 */
export interface FacetsResponse {
  amenities: Record<string, number>;
  houseRules: Record<string, number>;
  roomTypes: Record<string, number>;
  priceRanges: {
    min: number | null;
    max: number | null;
    median: number | null;
  };
  priceHistogram: {
    bucketWidth: number;
    buckets: PriceHistogramBucket[];
  } | null;
}

// L2 fix: Use shared parseLocalDate from @/lib/utils


/**
 * Get amenities facet counts
 */
async function getAmenitiesFacet(
  filterParams: Parameters<typeof buildFacetWhereConditions>[0],
  tx: FacetTxClient
): Promise<Record<string, number>> {
  const { conditions, params, paramIndex } = buildFacetWhereConditions(
    filterParams,
    "amenities"
  );
  const whereClause = joinWhereClauseWithSecurityInvariant(
    conditions,
    SEARCH_DOC_ALLOWED_SQL_LITERALS
  );

  // Unnest amenities array and count occurrences
  // Use original amenities array (not lowercase) for display
  const query = `
    SELECT
      amenity,
      COUNT(DISTINCT d.id) as count
    FROM listing_search_docs d
    JOIN "Listing" l ON l.id = d.id
    JOIN "User" u ON u.id = l."ownerId"
    CROSS JOIN LATERAL unnest(d.amenities) AS amenity
    WHERE ${whereClause}
    GROUP BY amenity
    ORDER BY count DESC
    LIMIT $${paramIndex}
  `;

  // SECURITY INVARIANT: query string is static SQL, dynamic values are passed only via $N placeholders in params.
  const results = await tx.$queryRawUnsafe<
    { amenity: string; count: bigint }[]
  >(query, ...params, MAX_FACET_RESULTS);

  const facets: Record<string, number> = {};
  for (const row of results) {
    facets[row.amenity] = Number(row.count);
  }
  return facets;
}

/**
 * Get house rules facet counts
 */
async function getHouseRulesFacet(
  filterParams: Parameters<typeof buildFacetWhereConditions>[0],
  tx: FacetTxClient
): Promise<Record<string, number>> {
  const { conditions, params, paramIndex } = buildFacetWhereConditions(
    filterParams,
    "houseRules"
  );
  const whereClause = joinWhereClauseWithSecurityInvariant(
    conditions,
    SEARCH_DOC_ALLOWED_SQL_LITERALS
  );

  // Unnest house_rules array and count occurrences
  const query = `
    SELECT
      rule,
      COUNT(DISTINCT d.id) as count
    FROM listing_search_docs d
    JOIN "Listing" l ON l.id = d.id
    JOIN "User" u ON u.id = l."ownerId"
    CROSS JOIN LATERAL unnest(d.house_rules) AS rule
    WHERE ${whereClause}
    GROUP BY rule
    ORDER BY count DESC
    LIMIT $${paramIndex}
  `;

  // SECURITY INVARIANT: query string is static SQL, dynamic values are passed only via $N placeholders in params.
  const results = await tx.$queryRawUnsafe<{ rule: string; count: bigint }[]>(
    query,
    ...params,
    MAX_FACET_RESULTS
  );

  const facets: Record<string, number> = {};
  for (const row of results) {
    facets[row.rule] = Number(row.count);
  }
  return facets;
}

/**
 * Get room types facet counts
 */
async function getRoomTypesFacet(
  filterParams: Parameters<typeof buildFacetWhereConditions>[0],
  tx: FacetTxClient
): Promise<Record<string, number>> {
  const { conditions, params, paramIndex } = buildFacetWhereConditions(
    filterParams,
    "roomType"
  );
  const whereClause = joinWhereClauseWithSecurityInvariant(
    conditions,
    SEARCH_DOC_ALLOWED_SQL_LITERALS
  );

  // Simple GROUP BY on room_type column
  const query = `
    SELECT
      d.room_type as "roomType",
      COUNT(*) as count
    FROM listing_search_docs d
    JOIN "Listing" l ON l.id = d.id
    JOIN "User" u ON u.id = l."ownerId"
    WHERE ${whereClause}
      AND d.room_type IS NOT NULL
    GROUP BY d.room_type
    ORDER BY count DESC
    LIMIT $${paramIndex}
  `;

  // SECURITY INVARIANT: query string is static SQL, dynamic values are passed only via $N placeholders in params.
  const results = await tx.$queryRawUnsafe<
    { roomType: string; count: bigint }[]
  >(query, ...params, MAX_FACET_RESULTS);

  const facets: Record<string, number> = {};
  for (const row of results) {
    facets[row.roomType] = Number(row.count);
  }
  return facets;
}

/**
 * Get price range statistics
 */
async function getPriceRanges(
  filterParams: Parameters<typeof buildFacetWhereConditions>[0],
  tx: FacetTxClient
): Promise<{ min: number | null; max: number | null; median: number | null }> {
  const { conditions, params } = buildFacetWhereConditions(
    filterParams,
    "price"
  );
  const whereClause = joinWhereClauseWithSecurityInvariant(
    conditions,
    SEARCH_DOC_ALLOWED_SQL_LITERALS
  );

  // Get min, max, and median (50th percentile) for prices
  const query = `
    SELECT
      MIN(d.price) as min,
      MAX(d.price) as max,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY d.price) as median
    FROM listing_search_docs d
    JOIN "Listing" l ON l.id = d.id
    JOIN "User" u ON u.id = l."ownerId"
    WHERE ${whereClause}
      AND d.price IS NOT NULL
  `;

  // SECURITY INVARIANT: query string is static SQL, dynamic values are passed only via $N placeholders in params.
  const results = await tx.$queryRawUnsafe<
    { min: number | null; max: number | null; median: number | null }[]
  >(query, ...params);

  const row = results[0];
  return {
    min: row?.min !== null ? Number(row.min) : null,
    max: row?.max !== null ? Number(row.max) : null,
    median: row?.median !== null ? Number(row.median) : null,
  };
}

/**
 * Compute adaptive bucket width based on price range.
 * Targets 10-30 buckets for good visual density.
 */
function computeBucketWidth(min: number, max: number): number {
  const range = max - min;
  if (range <= 1000) return 50;
  if (range <= 5000) return 250;
  if (range <= 10000) return 500;
  return 1000;
}

/**
 * Get price histogram with adaptive bucket sizing.
 * Uses sticky faceting (excludes price filter) so the histogram
 * shows the full distribution regardless of slider position.
 */
async function getPriceHistogram(
  filterParams: Parameters<typeof buildFacetWhereConditions>[0],
  priceMin: number | null,
  priceMax: number | null,
  tx: FacetTxClient
): Promise<FacetsResponse["priceHistogram"]> {
  if (priceMin === null || priceMax === null || priceMin >= priceMax) {
    return null;
  }

  const bucketWidth = computeBucketWidth(priceMin, priceMax);

  const { conditions, params, paramIndex } = buildFacetWhereConditions(
    filterParams,
    "price"
  );
  const whereClause = joinWhereClauseWithSecurityInvariant(
    conditions,
    SEARCH_DOC_ALLOWED_SQL_LITERALS
  );

  const query = `
    SELECT
      floor(d.price / $${paramIndex}) * $${paramIndex} AS bucket_min,
      COUNT(*) AS count
    FROM listing_search_docs d
    JOIN "Listing" l ON l.id = d.id
    JOIN "User" u ON u.id = l."ownerId"
    WHERE ${whereClause}
      AND d.price IS NOT NULL
    GROUP BY bucket_min
    ORDER BY bucket_min
  `;

  // SECURITY INVARIANT: query string is static SQL, dynamic values are passed only via $N placeholders in params.
  const results = await tx.$queryRawUnsafe<
    { bucket_min: number; count: bigint }[]
  >(query, ...params, bucketWidth);

  const buckets: PriceHistogramBucket[] = results.map((row) => ({
    min: Number(row.bucket_min),
    max: Number(row.bucket_min) + bucketWidth,
    count: Number(row.count),
  }));

  return { bucketWidth, buckets };
}

/**
 * Generate cache key for facets request
 */
function generateFacetsCacheKey(
  filterParams: Parameters<typeof buildFacetWhereConditions>[0]
): string {
  // P3 fix: Sort keys explicitly for deterministic JSON.stringify output
  const normalized: Record<string, string | number | boolean> = {
    amenities: [...(filterParams.amenities || [])].sort().join(","),
    bounds: filterParams.bounds
      ? `${filterParams.bounds.minLng.toFixed(4)},${filterParams.bounds.minLat.toFixed(4)},${filterParams.bounds.maxLng.toFixed(4)},${filterParams.bounds.maxLat.toFixed(4)}`
      : "",
    houseRules: [...(filterParams.houseRules || [])].sort().join(","),
    languages: [...(filterParams.languages || [])].sort().join(","),
    leaseDuration: filterParams.leaseDuration?.toLowerCase() || "",
    maxPrice: filterParams.maxPrice ?? "",
    minPrice: filterParams.minPrice ?? "",
    moveInDate: filterParams.moveInDate || "",
    endDate: filterParams.endDate || "",
    // Mirror buildFacetWhereConditions: "any" applies no WHERE filter, so it
    // must share a key with the absent case — but real values must NOT share
    // a key with each other (omitting these served one user's counts to
    // another whose search differed only by gender filter).
    genderPreference:
      filterParams.genderPreference && filterParams.genderPreference !== "any"
        ? filterParams.genderPreference
        : "",
    householdGender:
      filterParams.householdGender && filterParams.householdGender !== "any"
        ? filterParams.householdGender
        : "",
    q: filterParams.query?.toLowerCase().trim() || "",
    roomType: filterParams.roomType?.toLowerCase() || "",
    bookingMode: filterParams.bookingMode || "",
    minAvailableSlots: filterParams.minAvailableSlots ?? "",
  };
  return JSON.stringify(normalized);
}

/**
 * Internal facets fetch function (to be cached)
 */
async function getFacetsInternal(
  filterParams: Parameters<typeof buildFacetWhereConditions>[0]
): Promise<FacetsResponse> {
  // Single transaction for all facet queries — reduces connection pool usage
  // from 5 separate transactions to 1. Promise.all inside the callback still
  // runs queries concurrently; a single SET LOCAL timeout covers them all.
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL statement_timeout = ${FACET_QUERY_TIMEOUT_MS}`
      );

      // Run amenity/houseRule/roomType/priceRange queries in parallel
      const [amenities, houseRules, roomTypes, priceRanges] = await Promise.all(
        [
          getAmenitiesFacet(filterParams, tx),
          getHouseRulesFacet(filterParams, tx),
          getRoomTypesFacet(filterParams, tx),
          getPriceRanges(filterParams, tx),
        ]
      );

      // Histogram depends on priceRanges (needs min/max for bucket sizing)
      const priceHistogram = await getPriceHistogram(
        filterParams,
        priceRanges.min,
        priceRanges.max,
        tx
      );

      return { amenities, houseRules, roomTypes, priceRanges, priceHistogram };
    },
    { timeout: FACET_QUERY_TIMEOUT_MS * 2 }
  );
}

/**
 * GET /api/search/facets
 *
 * Returns facet counts for all filter options based on current filters.
 * Cached with 30s TTL.
 */
export async function GET(request: NextRequest) {
  const context = createContextFromHeaders(request.headers);

  return runWithRequestContext(context, async () => {
    // Rate limiting (uses search-count bucket as they serve similar purposes)
    const rateLimitResponse = await withRateLimitRedis(request, {
      type: "search-count",
    });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    try {
      // Parse URL params into FilterParams
      const searchParams = request.nextUrl.searchParams;
      const rawParams: Record<string, string | string[] | undefined> = {};
      searchParams.forEach((value, key) => {
        const existing = rawParams[key];
        if (existing !== undefined) {
          rawParams[key] = Array.isArray(existing)
            ? [...existing, value]
            : [existing, value];
        } else {
          rawParams[key] = value;
        }
      });

      const parsed = parseSearchParams(rawParams);
      const { filterParams } = parsed;
      // Immutable working copy — may be replaced with clamped bounds below
      let effectiveFilterParams = filterParams;

      // Security: Return empty facets for unbounded requests to prevent
      // full-table GROUP BY aggregation DoS (5 parallel scans with no WHERE bounds).
      if (!filterParams.bounds && !filterParams.query && !filterParams.vibeQuery) {
        logger.debug(
          "[search/facets] Unbounded browse — returning empty facets",
          {
            hasQuery: false,
            hasBounds: false,
          }
        );
        return NextResponse.json(
          {
            amenities: {},
            houseRules: {},
            roomTypes: {},
            priceRanges: { min: null, max: null, median: null },
            priceHistogram: null,
          } satisfies FacetsResponse,
          {
            headers: {
              "Cache-Control": "private, no-store",
              "x-request-id": getRequestId(),
            },
          }
        );
      }

      // P1 Fix: Validate bounds when text query is present (DoS prevention)
      // Text search without bounds allows full-table scans - block early
      // P2-NEW Fix: Use filterParams.bounds (which derives bounds from lat/lng)
      // instead of raw URL params. parseSearchParams() creates ~10km radius
      // bounds from lat/lng, enabling normal SearchForm flow (q+lat+lng).
      if (parsed.boundsRequired) {
        // Check if bounds are missing (neither explicit bounds nor derived from lat/lng)
        if (!filterParams.bounds) {
          // P1-5 FIX: Return HTTP 200 with empty FacetsResponse + boundsRequired flag.
          // Previously returned HTTP 400, which was semantically wrong ("needs location"
          // is not a client error) and required useFacets to special-case the 400 status.
          // Now aligned with /api/search-count which also returns 200 for boundsRequired.
          logger.debug(
            "[search/facets] Query without bounds — returning empty facets",
            {
              hasQuery: Boolean(filterParams.query || filterParams.vibeQuery),
              hasBounds: false,
            }
          );
          return NextResponse.json(
            {
              amenities: {},
              houseRules: {},
              roomTypes: {},
              priceRanges: { min: null, max: null, median: null },
              priceHistogram: null,
              boundsRequired: true,
            } satisfies FacetsResponse & { boundsRequired: true },
            {
              status: 200,
              headers: {
                "Cache-Control": "private, no-store",
                "x-request-id": getRequestId(),
              },
            }
          );
        }

        const { bounds } = filterParams;

        // Check for NaN/Infinity (invalid coordinates)
        if (
          !Number.isFinite(bounds.minLng) ||
          !Number.isFinite(bounds.maxLng) ||
          !Number.isFinite(bounds.minLat) ||
          !Number.isFinite(bounds.maxLat)
        ) {
          logger.warn("[search/facets] Invalid coordinates rejected", {
            minLng: bounds.minLng,
            maxLng: bounds.maxLng,
            minLat: bounds.minLat,
            maxLat: bounds.maxLat,
          });
          return NextResponse.json(
            { error: "Invalid coordinate values" },
            {
              status: 400,
              headers: {
                "Cache-Control": "private, no-store",
                "x-request-id": getRequestId(),
              },
            }
          );
        }

        // Check if bounds are oversized and clamp silently if needed
        const latSpan = bounds.maxLat - bounds.minLat;
        const lngSpan = crossesAntimeridian(bounds.minLng, bounds.maxLng)
          ? 180 - bounds.minLng + (bounds.maxLng + 180)
          : bounds.maxLng - bounds.minLng;

        if (
          latSpan > MAP_FETCH_MAX_LAT_SPAN ||
          lngSpan > MAP_FETCH_MAX_LNG_SPAN
        ) {
          // Clamp bounds silently (user preference: silent clamp over rejection)
          const clampedBounds = clampBoundsToMaxSpan(
            bounds,
            MAP_FETCH_MAX_LAT_SPAN,
            MAP_FETCH_MAX_LNG_SPAN
          );
          // Immutable: create new object instead of mutating parseSearchParams output
          effectiveFilterParams = { ...filterParams, bounds: clampedBounds };
          logger.debug("[search/facets] Oversized bounds clamped", {
            original: {
              latSpan: latSpan.toFixed(2),
              lngSpan: lngSpan.toFixed(2),
            },
            clamped: {
              latSpan: (clampedBounds.maxLat - clampedBounds.minLat).toFixed(2),
              lngSpan: (clampedBounds.maxLng - clampedBounds.minLng).toFixed(2),
            },
          });
        }
      }

      // Build cache key and fetch with caching
      const cacheKey = generateFacetsCacheKey(effectiveFilterParams);

      const facets = await withTimeout(
        unstable_cache(
          async () => getFacetsInternal(effectiveFilterParams),
          ["search-facets", cacheKey],
          { revalidate: CACHE_TTL }
        )(),
        DEFAULT_TIMEOUTS.DATABASE,
        "search-facets-getFacetsInternal"
      );

      return NextResponse.json(facets, {
        headers: {
          // Facets use "private, no-store" because facet counts may vary based on
          // user-specific filters and are cached server-side via unstable_cache.
          // This differs from /api/search/v2 which uses "public, s-maxage=60"
          // because search results are identical for the same query params.
          "Cache-Control": "private, no-store",
          "X-Cache-TTL": String(CACHE_TTL),
          "x-request-id": getRequestId(),
        },
      });
    } catch (error) {
      const requestId = getRequestId();
      logger.sync.error("[search/facets] Error fetching facets", {
        error: sanitizeErrorMessage(error),
        requestId,
      });
      Sentry.captureException(error, {
        tags: { route: "/api/search/facets", method: "GET" },
      });

      return NextResponse.json(
        { error: "Failed to fetch facets" },
        {
          status: 500,
          headers: { "x-request-id": requestId },
        }
      );
    }
  });
}
