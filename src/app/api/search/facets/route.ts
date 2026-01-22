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
import { prisma } from "@/lib/prisma";
import { parseSearchParams } from "@/lib/search-params";
import { unstable_cache } from "next/cache";
import { withRateLimitRedis } from "@/lib/with-rate-limit-redis";
import {
  createContextFromHeaders,
  runWithRequestContext,
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

// Cache TTL in seconds
const CACHE_TTL = 30;

// Maximum results per facet to prevent expensive aggregations
const MAX_FACET_RESULTS = 100;

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
    bounds?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  },
  excludeFilter?: "amenities" | "houseRules" | "roomType" | "price",
): WhereBuilder {
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
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM unnest($${paramIndex++}::text[]) AS search_term
        WHERE NOT EXISTS (
          SELECT 1 FROM unnest(d.amenities_lower) AS la
          WHERE la LIKE '%' || search_term || '%'
        )
      )`);
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

  return { conditions, params, paramIndex };
}

/**
 * Get amenities facet counts
 */
async function getAmenitiesFacet(
  filterParams: Parameters<typeof buildFacetWhereConditions>[0],
): Promise<Record<string, number>> {
  const { conditions, params, paramIndex } = buildFacetWhereConditions(
    filterParams,
    "amenities",
  );
  const whereClause = conditions.join(" AND ");

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

  const results = await prisma.$queryRawUnsafe<
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
): Promise<Record<string, number>> {
  const { conditions, params, paramIndex } = buildFacetWhereConditions(
    filterParams,
    "houseRules",
  );
  const whereClause = conditions.join(" AND ");

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

  const results = await prisma.$queryRawUnsafe<
    { rule: string; count: bigint }[]
  >(query, ...params, MAX_FACET_RESULTS);

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
): Promise<Record<string, number>> {
  const { conditions, params, paramIndex } = buildFacetWhereConditions(
    filterParams,
    "roomType",
  );
  const whereClause = conditions.join(" AND ");

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

  const results = await prisma.$queryRawUnsafe<
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
): Promise<{ min: number | null; max: number | null; median: number | null }> {
  const { conditions, params } = buildFacetWhereConditions(
    filterParams,
    "price",
  );
  const whereClause = conditions.join(" AND ");

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

  const results = await prisma.$queryRawUnsafe<
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
  // Run all facet queries in parallel for efficiency
  const [amenities, houseRules, roomTypes, priceRanges] = await Promise.all([
    getAmenitiesFacet(filterParams),
    getHouseRulesFacet(filterParams),
    getRoomTypesFacet(filterParams),
    getPriceRanges(filterParams),
  ]);

  return {
    amenities,
    houseRules,
    roomTypes,
    priceRanges,
  };
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
              headers: { "Cache-Control": "private, no-store" },
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
              headers: { "Cache-Control": "private, no-store" },
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

      const facets = await cachedFn();

      return NextResponse.json(facets, {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Cache-TTL": String(CACHE_TTL),
        },
      });
    } catch (error) {
      console.error("[search/facets] Error fetching facets:", error);

      return NextResponse.json(
        { error: "Failed to fetch facets" },
        { status: 500 },
      );
    }
  });
}
