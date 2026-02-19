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
import {
  sanitizeSearchQuery,
  isValidQuery,
  crossesAntimeridian,
} from "@/lib/data";
import {
  clampBoundsToMaxSpan,
  MAX_LAT_SPAN,
  MAX_LNG_SPAN,
} from "@/lib/validation";
import { logger } from "@/lib/logger";
import { withTimeout, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";

// Cache TTL in seconds
const CACHE_TTL = 30;
const FACET_QUERY_TIMEOUT_MS = 5000;

// Maximum results per facet to prevent expensive aggregations
const MAX_FACET_RESULTS = 100;

const ALLOWED_SQL_STRING_LITERALS = new Set(["ACTIVE", "english"]);

function assertParameterizedWhereClause(whereClause: string): void {
  const literalPattern = /'([^']*)'/g;
  for (const match of whereClause.matchAll(literalPattern)) {
    const literalValue = match[1];
    if (!ALLOWED_SQL_STRING_LITERALS.has(literalValue)) {
      throw new Error(
        "SECURITY: Raw string detected in whereClause — use parameterized $N placeholders",
      );
    }
  }
}

function joinWhereClauseWithSecurityInvariant(conditions: string[]): string {
  const whereClause = conditions.join(" AND ");
  assertParameterizedWhereClause(whereClause);
  return whereClause;
}

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

/**
 * Parse date string to Date object
 */
function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Build base WHERE conditions for facet queries.
 * Similar to buildSearchDocWhereConditions but excludes the filter
 * we're aggregating to show all options.
 */
interface WhereBuilder {
  conditions: string[];
  params: unknown[];
  paramIndex: number;
}

function buildFacetWhereConditions(
  filterParams: {
    query?: string;
    minPrice?: number;
    maxPrice?: number;
    amenities?: string[];
    moveInDate?: string;
    leaseDuration?: string;
    houseRules?: string[];
    roomType?: string;
    languages?: string[];
    genderPreference?: string;
    householdGender?: string;
    bounds?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  },
  excludeFilter?: "amenities" | "houseRules" | "roomType" | "price",
): WhereBuilder {
  // SECURITY INVARIANT:
  // - All user-derived values must be pushed to `params` and referenced as $N placeholders.
  // - `conditions` entries must remain static SQL fragments.
  // - Never inject user input directly into a condition string.
  const {
    query,
    minPrice,
    maxPrice,
    amenities,
    moveInDate,
    leaseDuration,
    houseRules,
    roomType,
    languages,
    bounds,
    // Note: genderPreference and householdGender accessed via filterParams below
  } = filterParams;

  // Base conditions
  const conditions: string[] = [
    "d.available_slots > 0",
    "d.status = 'ACTIVE'",
    "d.lat IS NOT NULL",
    "d.lng IS NOT NULL",
  ];
  const params: unknown[] = [];
  let paramIndex = 1;

  // Geographic bounds filter
  if (bounds) {
    if (crossesAntimeridian(bounds.minLng, bounds.maxLng)) {
      conditions.push(`(
        d.location_geog && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, 180, $${paramIndex + 2}, 4326)::geography
        OR d.location_geog && ST_MakeEnvelope(-180, $${paramIndex + 1}, $${paramIndex + 3}, $${paramIndex + 2}, 4326)::geography
      )`);
      params.push(bounds.minLng, bounds.minLat, bounds.maxLat, bounds.maxLng);
      paramIndex += 4;
    } else {
      conditions.push(
        `d.location_geog && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)::geography`,
      );
      params.push(bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat);
      paramIndex += 4;
    }
  }

  // Price range filter (exclude when aggregating price facet)
  if (excludeFilter !== "price") {
    if (minPrice !== undefined && minPrice !== null) {
      conditions.push(`d.price >= $${paramIndex++}`);
      params.push(minPrice);
    }
    if (maxPrice !== undefined && maxPrice !== null) {
      conditions.push(`d.price <= $${paramIndex++}`);
      params.push(maxPrice);
    }
  }

  // Text search filter using FTS (aligned with search-doc-queries.ts)
  // Uses plainto_tsquery for semantic search consistency
  if (query && isValidQuery(query)) {
    const sanitizedQuery = sanitizeSearchQuery(query);
    if (sanitizedQuery) {
      // P2a Fix: Use FTS instead of LIKE for semantic alignment
      // plainto_tsquery handles multi-word queries as AND by default
      conditions.push(`d.search_tsv @@ plainto_tsquery('english', $${paramIndex})`);
      params.push(sanitizedQuery);
      paramIndex++;
    }
  }

  // Room type filter (exclude when aggregating roomType facet)
  if (excludeFilter !== "roomType" && roomType) {
    conditions.push(`LOWER(d.room_type) = LOWER($${paramIndex++})`);
    params.push(roomType);
  }

  // Lease duration filter
  if (leaseDuration) {
    conditions.push(`LOWER(d.lease_duration) = LOWER($${paramIndex++})`);
    params.push(leaseDuration);
  }

  // Move-in date filter
  if (moveInDate) {
    conditions.push(
      `(d.move_in_date IS NULL OR d.move_in_date <= $${paramIndex++})`,
    );
    params.push(parseDateOnly(moveInDate));
  }

  // Languages filter (OR logic)
  if (languages?.length) {
    const normalized = languages
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);
    if (normalized.length > 0) {
      conditions.push(
        `d.household_languages_lower && $${paramIndex++}::text[]`,
      );
      params.push(normalized);
    }
  }

  // Amenities filter (AND logic) - exclude when aggregating amenities facet
  if (excludeFilter !== "amenities" && amenities?.length) {
    const normalizedAmenities = amenities
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);
    if (normalizedAmenities.length > 0) {
      // Use @> (array contains) operator - GIN indexed
      conditions.push(`d.amenities_lower @> $${paramIndex++}::text[]`);
      params.push(normalizedAmenities);
    }
  }

  // House rules filter (AND logic) - exclude when aggregating houseRules facet
  if (excludeFilter !== "houseRules" && houseRules?.length) {
    const normalizedRules = houseRules
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);
    if (normalizedRules.length > 0) {
      conditions.push(`d.house_rules_lower @> $${paramIndex++}::text[]`);
      params.push(normalizedRules);
    }
  }

  // Gender preference filter (e.g., "female", "male", "any")
  if (filterParams.genderPreference && filterParams.genderPreference !== "any") {
    conditions.push(`d.gender_preference = $${paramIndex++}`);
    params.push(filterParams.genderPreference);
  }

  // Household gender filter (e.g., "female", "male", "mixed")
  if (filterParams.householdGender && filterParams.householdGender !== "any") {
    conditions.push(`d.household_gender = $${paramIndex++}`);
    params.push(filterParams.householdGender);
  }

  return { conditions, params, paramIndex };
}

/**
 * Get amenities facet counts
 */
async function getAmenitiesFacet(
  filterParams: Parameters<typeof buildFacetWhereConditions>[0],
  tx: FacetTxClient,
): Promise<Record<string, number>> {
  const { conditions, params, paramIndex } = buildFacetWhereConditions(
    filterParams,
    "amenities",
  );
  const whereClause = joinWhereClauseWithSecurityInvariant(conditions);

  // Unnest amenities array and count occurrences
  // Use original amenities array (not lowercase) for display
  const query = `
    SELECT
      amenity,
      COUNT(DISTINCT d.id) as count
    FROM listing_search_docs d,
         unnest(d.amenities) AS amenity
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
  tx: FacetTxClient,
): Promise<Record<string, number>> {
  const { conditions, params, paramIndex } = buildFacetWhereConditions(
    filterParams,
    "houseRules",
  );
  const whereClause = joinWhereClauseWithSecurityInvariant(conditions);

  // Unnest house_rules array and count occurrences
  const query = `
    SELECT
      rule,
      COUNT(DISTINCT d.id) as count
    FROM listing_search_docs d,
         unnest(d.house_rules) AS rule
    WHERE ${whereClause}
    GROUP BY rule
    ORDER BY count DESC
    LIMIT $${paramIndex}
  `;

  // SECURITY INVARIANT: query string is static SQL, dynamic values are passed only via $N placeholders in params.
  const results = await tx.$queryRawUnsafe<{ rule: string; count: bigint }[]>(
    query,
    ...params,
    MAX_FACET_RESULTS,
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
  tx: FacetTxClient,
): Promise<Record<string, number>> {
  const { conditions, params, paramIndex } = buildFacetWhereConditions(
    filterParams,
    "roomType",
  );
  const whereClause = joinWhereClauseWithSecurityInvariant(conditions);

  // Simple GROUP BY on room_type column
  const query = `
    SELECT
      d.room_type as "roomType",
      COUNT(*) as count
    FROM listing_search_docs d
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
  tx: FacetTxClient,
): Promise<{ min: number | null; max: number | null; median: number | null }> {
  const { conditions, params } = buildFacetWhereConditions(
    filterParams,
    "price",
  );
  const whereClause = joinWhereClauseWithSecurityInvariant(conditions);

  // Get min, max, and median (50th percentile) for prices
  const query = `
    SELECT
      MIN(d.price) as min,
      MAX(d.price) as max,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY d.price) as median
    FROM listing_search_docs d
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
  tx: FacetTxClient,
): Promise<FacetsResponse["priceHistogram"]> {
  if (priceMin === null || priceMax === null || priceMin >= priceMax) {
    return null;
  }

  const bucketWidth = computeBucketWidth(priceMin, priceMax);

  const { conditions, params, paramIndex } = buildFacetWhereConditions(
    filterParams,
    "price",
  );
  const whereClause = joinWhereClauseWithSecurityInvariant(conditions);

  const query = `
    SELECT
      floor(d.price / $${paramIndex}) * $${paramIndex} AS bucket_min,
      COUNT(*) AS count
    FROM listing_search_docs d
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
  filterParams: Parameters<typeof buildFacetWhereConditions>[0],
): string {
  const normalized = {
    q: filterParams.query?.toLowerCase().trim() || "",
    minPrice: filterParams.minPrice ?? "",
    maxPrice: filterParams.maxPrice ?? "",
    amenities: [...(filterParams.amenities || [])].sort().join(","),
    houseRules: [...(filterParams.houseRules || [])].sort().join(","),
    languages: [...(filterParams.languages || [])].sort().join(","),
    roomType: filterParams.roomType?.toLowerCase() || "",
    leaseDuration: filterParams.leaseDuration?.toLowerCase() || "",
    moveInDate: filterParams.moveInDate || "",
    bounds: filterParams.bounds
      ? `${filterParams.bounds.minLng.toFixed(4)},${filterParams.bounds.minLat.toFixed(4)},${filterParams.bounds.maxLng.toFixed(4)},${filterParams.bounds.maxLat.toFixed(4)}`
      : "",
  };
  return JSON.stringify(normalized);
}

/**
 * Internal facets fetch function (to be cached)
 */
async function getFacetsInternal(
  filterParams: Parameters<typeof buildFacetWhereConditions>[0],
): Promise<FacetsResponse> {
  // Single transaction for all facet queries — reduces connection pool usage
  // from 5 separate transactions to 1. Promise.all inside the callback still
  // runs queries concurrently; a single SET LOCAL timeout covers them all.
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL statement_timeout = ${FACET_QUERY_TIMEOUT_MS}`,
      );

      // Run amenity/houseRule/roomType/priceRange queries in parallel
      const [amenities, houseRules, roomTypes, priceRanges] =
        await Promise.all([
          getAmenitiesFacet(filterParams, tx),
          getHouseRulesFacet(filterParams, tx),
          getRoomTypesFacet(filterParams, tx),
          getPriceRanges(filterParams, tx),
        ]);

      // Histogram depends on priceRanges (needs min/max for bucket sizing)
      const priceHistogram = await getPriceHistogram(
        filterParams,
        priceRanges.min,
        priceRanges.max,
        tx,
      );

      return { amenities, houseRules, roomTypes, priceRanges, priceHistogram };
    },
    { timeout: FACET_QUERY_TIMEOUT_MS * 2 },
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

      const { filterParams } = parseSearchParams(rawParams);

      // P1 Fix: Validate bounds when text query is present (DoS prevention)
      // Text search without bounds allows full-table scans - block early
      // P2-NEW Fix: Use filterParams.bounds (which derives bounds from lat/lng)
      // instead of raw URL params. parseSearchParams() creates ~10km radius
      // bounds from lat/lng, enabling normal SearchForm flow (q+lat+lng).
      if (filterParams.query) {
        // Check if bounds are missing (neither explicit bounds nor derived from lat/lng)
        if (!filterParams.bounds) {
          logger.warn("[search/facets] Query without bounds rejected", {
            hasQuery: true,
            hasBounds: false,
          });
          return NextResponse.json(
            {
              error: "Please select a location",
              boundsRequired: true,
            },
            {
              status: 400,
              headers: {
                "Cache-Control": "private, no-store",
                "x-request-id": getRequestId(),
              },
            },
          );
        }

        // Validate coordinate values from filterParams.bounds
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
            },
          );
        }

        // Check if bounds are oversized and clamp silently if needed
        const latSpan = bounds.maxLat - bounds.minLat;
        const lngSpan = crossesAntimeridian(bounds.minLng, bounds.maxLng)
          ? 180 - bounds.minLng + (bounds.maxLng + 180)
          : bounds.maxLng - bounds.minLng;

        if (latSpan > MAX_LAT_SPAN || lngSpan > MAX_LNG_SPAN) {
          // Clamp bounds silently (user preference: silent clamp over rejection)
          const clampedBounds = clampBoundsToMaxSpan(bounds);
          filterParams.bounds = clampedBounds;
          logger.debug("[search/facets] Oversized bounds clamped", {
            original: { latSpan: latSpan.toFixed(2), lngSpan: lngSpan.toFixed(2) },
            clamped: {
              latSpan: (clampedBounds.maxLat - clampedBounds.minLat).toFixed(2),
              lngSpan: (clampedBounds.maxLng - clampedBounds.minLng).toFixed(2),
            },
          });
        }
      }

      // Build cache key and fetch with caching
      const cacheKey = generateFacetsCacheKey(filterParams);

      const cachedFn = unstable_cache(
        async () => getFacetsInternal(filterParams),
        ["search-facets", cacheKey],
        { revalidate: CACHE_TTL },
      );

      const facets = await withTimeout(
        cachedFn(),
        DEFAULT_TIMEOUTS.DATABASE,
        "search-facets-getFacetsInternal",
      );

      return NextResponse.json(facets, {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Cache-TTL": String(CACHE_TTL),
          "x-request-id": getRequestId(),
        },
      });
    } catch (error) {
      const requestId = getRequestId();
      logger.sync.error("[search/facets] Error fetching facets", {
        error: error instanceof Error ? error.message : "Unknown",
        requestId,
      });
      Sentry.captureException(error, { tags: { route: "/api/search/facets", method: "GET" } });

      return NextResponse.json(
        { error: "Failed to fetch facets" },
        {
          status: 500,
          headers: { "x-request-id": requestId },
        },
      );
    }
  });
}
