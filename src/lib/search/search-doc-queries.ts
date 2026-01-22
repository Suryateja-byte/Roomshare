/**
 * SearchDoc Query Functions
 *
 * Optimized queries reading from denormalized listing_search_docs table.
 * Replaces multi-table joins with single-table reads for faster search.
 *
 * Feature flag: ENABLE_SEARCH_DOC=true or ?searchDoc=1 URL override
 *
 * Performance improvements:
 * - No JOINs: Single table read vs Listing + Location + Review
 * - Precomputed: lat/lng, avg_rating, recommended_score already calculated
 * - GIN indexes: Direct @> containment for amenities/rules/languages
 * - PostGIS: geography type with GIST index for spatial queries
 */

import { prisma } from "@/lib/prisma";
import { wrapDatabaseError } from "@/lib/errors";
import { unstable_cache } from "next/cache";
import type {
  FilterParams,
  ListingData,
  MapListingData,
  PaginatedResultHybrid,
} from "@/lib/data";
import {
  sanitizeSearchQuery,
  isValidQuery,
  crossesAntimeridian,
} from "@/lib/data";
import {
  LOW_RESULTS_THRESHOLD,
  expandFiltersForNearMatches,
  isNearMatch,
} from "@/lib/near-matches";
import { features } from "@/lib/env";
import type { KeysetCursor, SortOption, CursorRowData } from "./cursor";
import { buildCursorFromRow, encodeKeysetCursor } from "./cursor";

// Maximum results to return for map markers
const MAX_MAP_MARKERS = 200;

// Threshold for full COUNT vs hybrid mode
const HYBRID_COUNT_THRESHOLD = 100;

// ============================================
// Cache Key Generators
// ============================================

function createSearchDocListCacheKey(params: FilterParams): string {
  const normalized = {
    q: params.query?.toLowerCase().trim() || "",
    minPrice: params.minPrice ?? "",
    maxPrice: params.maxPrice ?? "",
    amenities: [...(params.amenities || [])].sort().join(","),
    houseRules: [...(params.houseRules || [])].sort().join(","),
    languages: [...(params.languages || [])].sort().join(","),
    roomType: params.roomType?.toLowerCase() || "",
    leaseDuration: params.leaseDuration?.toLowerCase() || "",
    moveInDate: params.moveInDate || "",
    bounds: params.bounds
      ? `${params.bounds.minLng.toFixed(4)},${params.bounds.minLat.toFixed(4)},${params.bounds.maxLng.toFixed(4)},${params.bounds.maxLat.toFixed(4)}`
      : "",
    page: params.page ?? 1,
    limit: params.limit ?? 12,
    sort: params.sort || "recommended",
    nearMatches: params.nearMatches ?? false,
  };
  return JSON.stringify(normalized);
}

function createSearchDocMapCacheKey(params: FilterParams): string {
  const normalized = {
    q: params.query?.toLowerCase().trim() || "",
    minPrice: params.minPrice ?? "",
    maxPrice: params.maxPrice ?? "",
    amenities: [...(params.amenities || [])].sort().join(","),
    houseRules: [...(params.houseRules || [])].sort().join(","),
    languages: [...(params.languages || [])].sort().join(","),
    roomType: params.roomType?.toLowerCase() || "",
    leaseDuration: params.leaseDuration?.toLowerCase() || "",
    moveInDate: params.moveInDate || "",
    bounds: params.bounds
      ? `${params.bounds.minLng.toFixed(4)},${params.bounds.minLat.toFixed(4)},${params.bounds.maxLng.toFixed(4)},${params.bounds.maxLat.toFixed(4)}`
      : "",
  };
  return JSON.stringify(normalized);
}

function createSearchDocCountCacheKey(params: FilterParams): string {
  const normalized = {
    q: params.query?.toLowerCase().trim() || "",
    minPrice: params.minPrice ?? "",
    maxPrice: params.maxPrice ?? "",
    amenities: [...(params.amenities || [])].sort().join(","),
    houseRules: [...(params.houseRules || [])].sort().join(","),
    languages: [...(params.languages || [])].sort().join(","),
    roomType: params.roomType?.toLowerCase() || "",
    leaseDuration: params.leaseDuration?.toLowerCase() || "",
    moveInDate: params.moveInDate || "",
    genderPreference: params.genderPreference || "",
    householdGender: params.householdGender || "",
    bounds: params.bounds
      ? `${params.bounds.minLng.toFixed(4)},${params.bounds.minLat.toFixed(4)},${params.bounds.maxLng.toFixed(4)},${params.bounds.maxLat.toFixed(4)}`
      : "",
    // NOTE: No page or limit - intentionally excluded for cross-page caching
  };
  return JSON.stringify(normalized);
}

// ============================================
// Helper: Parse date string to Date
// ============================================

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// ============================================
// Keyset Pagination Helpers
// ============================================

/**
 * Build keyset WHERE clause for cursor-based pagination.
 *
 * CRITICAL: Do NOT use PostgreSQL tuple comparison (a, b) < (x, y).
 * Tuple comparisons use ASC/ASC semantics and don't work for mixed DESC/ASC.
 * Use explicit OR-chains that respect each column's sort direction.
 *
 * @param cursor - The keyset cursor from the previous page
 * @param sort - The sort option being used
 * @param startParamIndex - Starting parameter index for SQL placeholders
 * @returns Object with WHERE clause fragment and params
 */
function buildKeysetWhereClause(
  cursor: KeysetCursor,
  sort: SortOption,
  startParamIndex: number,
): { clause: string; params: unknown[]; nextParamIndex: number } {
  const params: unknown[] = [];
  let paramIndex = startParamIndex;

  // Helper to get next param placeholder
  const nextParam = () => `$${paramIndex++}`;

  let clause: string;

  switch (sort) {
    case "recommended": {
      // ORDER BY: recommended_score DESC, listing_created_at DESC, id ASC
      // k[0] = recommended_score, k[1] = listing_created_at
      const scoreParam = nextParam();
      const dateParam = nextParam();
      const idParam = nextParam();

      // Cast string cursor values back to proper types
      params.push(
        cursor.k[0] !== null ? parseFloat(cursor.k[0]) : null,
        cursor.k[1],
        cursor.id,
      );

      clause = `(
        (d.recommended_score < ${scoreParam}::float8)
        OR (d.recommended_score = ${scoreParam}::float8 AND d.listing_created_at < ${dateParam}::timestamptz)
        OR (d.recommended_score = ${scoreParam}::float8 AND d.listing_created_at = ${dateParam}::timestamptz AND d.id > ${idParam})
      )`;
      break;
    }

    case "newest": {
      // ORDER BY: listing_created_at DESC, id ASC
      // k[0] = listing_created_at
      const dateParam = nextParam();
      const idParam = nextParam();

      params.push(cursor.k[0], cursor.id);

      clause = `(
        (d.listing_created_at < ${dateParam}::timestamptz)
        OR (d.listing_created_at = ${dateParam}::timestamptz AND d.id > ${idParam})
      )`;
      break;
    }

    case "price_asc": {
      // ORDER BY: price ASC NULLS LAST, listing_created_at DESC, id ASC
      // k[0] = price, k[1] = listing_created_at
      const priceParam = nextParam();
      const dateParam = nextParam();
      const idParam = nextParam();

      params.push(
        cursor.k[0] !== null ? parseFloat(cursor.k[0]) : null,
        cursor.k[1],
        cursor.id,
      );

      // For ASC NULLS LAST: values after cursor are > cursor OR cursor is NOT NULL and value IS NULL
      clause = `(
        (d.price > ${priceParam}::numeric OR (d.price IS NULL AND ${priceParam}::numeric IS NOT NULL))
        OR (d.price = ${priceParam}::numeric AND d.listing_created_at < ${dateParam}::timestamptz)
        OR (d.price = ${priceParam}::numeric AND d.listing_created_at = ${dateParam}::timestamptz AND d.id > ${idParam})
      )`;
      break;
    }

    case "price_desc": {
      // ORDER BY: price DESC NULLS LAST, listing_created_at DESC, id ASC
      // k[0] = price, k[1] = listing_created_at
      const priceParam = nextParam();
      const dateParam = nextParam();
      const idParam = nextParam();

      params.push(
        cursor.k[0] !== null ? parseFloat(cursor.k[0]) : null,
        cursor.k[1],
        cursor.id,
      );

      // For DESC NULLS LAST: values after cursor are < cursor OR cursor is NULL (at end)
      clause = `(
        (d.price < ${priceParam}::numeric)
        OR (d.price = ${priceParam}::numeric AND d.listing_created_at < ${dateParam}::timestamptz)
        OR (d.price = ${priceParam}::numeric AND d.listing_created_at = ${dateParam}::timestamptz AND d.id > ${idParam})
        OR (${priceParam}::numeric IS NULL AND d.price IS NOT NULL)
      )`;
      break;
    }

    case "rating": {
      // ORDER BY: avg_rating DESC NULLS LAST, review_count DESC, listing_created_at DESC, id ASC
      // k[0] = avg_rating, k[1] = review_count, k[2] = listing_created_at
      const ratingParam = nextParam();
      const countParam = nextParam();
      const dateParam = nextParam();
      const idParam = nextParam();

      params.push(
        cursor.k[0] !== null ? parseFloat(cursor.k[0]) : null,
        cursor.k[1] !== null ? parseInt(cursor.k[1], 10) : null,
        cursor.k[2],
        cursor.id,
      );

      clause = `(
        (d.avg_rating < ${ratingParam}::float8)
        OR (d.avg_rating = ${ratingParam}::float8 AND d.review_count < ${countParam}::int)
        OR (d.avg_rating = ${ratingParam}::float8 AND d.review_count = ${countParam}::int AND d.listing_created_at < ${dateParam}::timestamptz)
        OR (d.avg_rating = ${ratingParam}::float8 AND d.review_count = ${countParam}::int AND d.listing_created_at = ${dateParam}::timestamptz AND d.id > ${idParam})
        OR (${ratingParam}::float8 IS NULL AND d.avg_rating IS NOT NULL)
      )`;
      break;
    }

    default:
      // Fallback to recommended sort
      return buildKeysetWhereClause(
        { ...cursor, s: "recommended" },
        "recommended",
        startParamIndex,
      );
  }

  return { clause, params, nextParamIndex: paramIndex };
}

// ============================================
// Build WHERE conditions for SearchDoc queries
// ============================================

interface WhereBuilder {
  conditions: string[];
  params: unknown[];
  paramIndex: number;
  /** Index of the FTS query param (if FTS is active), used for ts_rank_cd */
  ftsQueryParamIndex: number | null;
}

function buildSearchDocWhereConditions(
  filterParams: FilterParams,
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
    genderPreference,
    householdGender,
    bounds,
  } = filterParams;

  // Base conditions for SearchDoc
  const conditions: string[] = [
    "d.available_slots > 0",
    "d.status = 'ACTIVE'",
    "d.lat IS NOT NULL",
    "d.lng IS NOT NULL",
  ];
  const params: unknown[] = [];
  let paramIndex = 1;
  let ftsQueryParamIndex: number | null = null;

  // Geographic bounds filter using PostGIS geography
  if (bounds) {
    if (crossesAntimeridian(bounds.minLng, bounds.maxLng)) {
      // Antimeridian crossing: split into two ranges
      conditions.push(`(
        d.location_geog && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, 180, $${paramIndex + 2}, 4326)::geography
        OR d.location_geog && ST_MakeEnvelope(-180, $${paramIndex + 1}, $${paramIndex + 3}, $${paramIndex + 2}, 4326)::geography
      )`);
      params.push(bounds.minLng, bounds.minLat, bounds.maxLat, bounds.maxLng);
      paramIndex += 4;
    } else {
      // Normal bounding box using geography operator
      conditions.push(
        `d.location_geog && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)::geography`,
      );
      params.push(bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat);
      paramIndex += 4;
    }
  }

  // Price range filter
  if (minPrice !== undefined && minPrice !== null) {
    conditions.push(`d.price >= $${paramIndex++}`);
    params.push(minPrice);
  }
  if (maxPrice !== undefined && maxPrice !== null) {
    conditions.push(`d.price <= $${paramIndex++}`);
    params.push(maxPrice);
  }

  // Text search filter using full-text search (tsvector/plainto_tsquery)
  // Falls back to LIKE if search_tsv column is not yet populated
  if (query && isValidQuery(query)) {
    const sanitizedQuery = sanitizeSearchQuery(query);
    if (sanitizedQuery) {
      // Use FTS: search_tsv @@ plainto_tsquery('english', $N)
      // plainto_tsquery handles multi-word queries as AND by default
      ftsQueryParamIndex = paramIndex; // Track for ts_rank_cd in ORDER BY
      conditions.push(`d.search_tsv @@ plainto_tsquery('english', $${paramIndex})`);
      params.push(sanitizedQuery);
      paramIndex++;
    }
  }

  // Room type filter (uses lowercase comparison)
  if (roomType) {
    conditions.push(`LOWER(d.room_type) = LOWER($${paramIndex++})`);
    params.push(roomType);
  }

  // Lease duration filter (uses lowercase comparison)
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

  // Languages filter (OR logic) - uses lowercase arrays with GIN index
  if (languages?.length) {
    const normalized = languages
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);
    if (normalized.length > 0) {
      // GIN array overlap - returns true if any element matches
      conditions.push(
        `d.household_languages_lower && $${paramIndex++}::text[]`,
      );
      params.push(normalized);
    }
  }

  // Amenities filter (AND logic) - uses lowercase arrays with GIN index
  // Uses partial match pattern - 'pool' matches 'pool access'
  if (amenities?.length) {
    const normalizedAmenities = amenities
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);
    if (normalizedAmenities.length > 0) {
      // For each search term, ensure at least one amenity contains it
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

  // House rules filter (AND logic) - uses lowercase arrays with GIN index
  if (houseRules?.length) {
    const normalizedRules = houseRules
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);
    if (normalizedRules.length > 0) {
      // Exact match containment using @> operator
      conditions.push(`d.house_rules_lower @> $${paramIndex++}::text[]`);
      params.push(normalizedRules);
    }
  }

  // Gender preference filter - matches exact enum value (excludes 'any')
  if (genderPreference && genderPreference !== "any") {
    conditions.push(`d.gender_preference = $${paramIndex++}`);
    params.push(genderPreference);
  }

  // Household gender filter - matches exact enum value (excludes 'any')
  if (householdGender && householdGender !== "any") {
    conditions.push(`d.household_gender = $${paramIndex++}`);
    params.push(householdGender);
  }

  return { conditions, params, paramIndex, ftsQueryParamIndex };
}

// ============================================
// ORDER BY Clause Builder with FTS Ranking
// ============================================

/**
 * Build ORDER BY clause with optional ts_rank_cd tie-breaker.
 *
 * When FTS is active (ftsQueryParamIndex is set), adds ts_rank_cd as secondary
 * sort factor to break ties within primary sort. This leverages tsvector weights
 * (A=title, B=city/state, C=description) for relevance ranking.
 *
 * Stable ORDER BY pattern: primarySort, ts_rank_cd DESC, listing_created_at DESC, id ASC
 *
 * @param sort - Sort option
 * @param ftsQueryParamIndex - Index of FTS query param (or null if no FTS)
 * @returns ORDER BY clause string
 */
function buildOrderByClause(
  sort: SortOption,
  ftsQueryParamIndex: number | null,
): string {
  // ts_rank_cd expression (only used when FTS is active)
  const tsRankExpr = ftsQueryParamIndex !== null
    ? `ts_rank_cd(d.search_tsv, plainto_tsquery('english', $${ftsQueryParamIndex})) DESC, `
    : "";

  switch (sort) {
    case "price_asc":
      return `d.price ASC NULLS LAST, ${tsRankExpr}d.listing_created_at DESC, d.id ASC`;
    case "price_desc":
      return `d.price DESC NULLS LAST, ${tsRankExpr}d.listing_created_at DESC, d.id ASC`;
    case "newest":
      return `d.listing_created_at DESC, ${tsRankExpr}d.id ASC`;
    case "rating":
      return `d.avg_rating DESC NULLS LAST, d.review_count DESC, ${tsRankExpr}d.listing_created_at DESC, d.id ASC`;
    case "recommended":
    default:
      return `d.recommended_score DESC, ${tsRankExpr}d.listing_created_at DESC, d.id ASC`;
  }
}

// ============================================
// Limited Count Query (Hybrid Pagination)
// ============================================

async function getSearchDocLimitedCountInternal(
  params: FilterParams,
): Promise<number | null> {
  const { conditions, params: queryParams } =
    buildSearchDocWhereConditions(params);
  const whereClause = conditions.join(" AND ");

  // Use subquery with LIMIT 101 to efficiently check if count > threshold
  const limitedCountQuery = `
    SELECT COUNT(*) as count
    FROM (
      SELECT d.id
      FROM listing_search_docs d
      WHERE ${whereClause}
      LIMIT ${HYBRID_COUNT_THRESHOLD + 1}
    ) subq
  `;

  const result = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    limitedCountQuery,
    ...queryParams,
  );

  const count = Number(result[0]?.count || 0);

  // If count > threshold, return null (unknown total)
  if (count > HYBRID_COUNT_THRESHOLD) {
    return null;
  }

  return count;
}

export async function getSearchDocLimitedCount(
  params: FilterParams,
): Promise<number | null> {
  const cacheKey = createSearchDocCountCacheKey(params);

  const cachedFn = unstable_cache(
    async () => getSearchDocLimitedCountInternal(params),
    ["searchdoc-limited-count", cacheKey],
    { revalidate: 60 },
  );

  return cachedFn();
}

// ============================================
// Map Listings Query (SearchDoc)
// ============================================

async function getSearchDocMapListingsInternal(
  params: FilterParams,
): Promise<MapListingData[]> {
  // Defense in depth: block unbounded text searches
  if (params.query && !params.bounds) {
    throw new Error(
      "Unbounded text search not allowed: geographic bounds required when query is present",
    );
  }

  const {
    conditions,
    params: queryParams,
    paramIndex,
  } = buildSearchDocWhereConditions(params);
  const whereClause = conditions.join(" AND ");

  // Query with minimal fields for map markers
  // Uses precomputed lat/lng from SearchDoc (no ST_X/ST_Y needed)
  const sqlQuery = `
    SELECT
      d.id,
      d.title,
      d.price,
      d.available_slots as "availableSlots",
      d.owner_id as "ownerId",
      d.images[1] as "primaryImage",
      d.lat,
      d.lng
    FROM listing_search_docs d
    WHERE ${whereClause}
    ORDER BY d.listing_created_at DESC
    LIMIT $${paramIndex}
  `;

  try {
    const listings = await prisma.$queryRawUnsafe<any[]>(
      sqlQuery,
      ...queryParams,
      MAX_MAP_MARKERS,
    );

    return listings.map((l) => ({
      id: l.id,
      title: l.title,
      price: Number(l.price),
      availableSlots: l.availableSlots,
      ownerId: l.ownerId,
      images: l.primaryImage ? [l.primaryImage] : [],
      location: {
        lat: Number(l.lat) || 0,
        lng: Number(l.lng) || 0,
      },
    }));
  } catch (error) {
    const dataError = wrapDatabaseError(error, "getSearchDocMapListings");
    dataError.log({
      operation: "getSearchDocMapListings",
      hasBounds: !!params?.bounds,
    });
    throw dataError;
  }
}

/**
 * Get map listings from SearchDoc (denormalized table).
 * Cached with 60s TTL.
 */
export async function getSearchDocMapListings(
  params: FilterParams = {},
): Promise<MapListingData[]> {
  const cacheKey = createSearchDocMapCacheKey(params);

  const cachedFn = unstable_cache(
    async () => getSearchDocMapListingsInternal(params),
    ["searchdoc-map-listings", cacheKey],
    { revalidate: 60 },
  );

  return cachedFn();
}

// ============================================
// Paginated Listings Query (SearchDoc)
// ============================================

async function getSearchDocListingsPaginatedInternal(
  params: FilterParams = {},
): Promise<PaginatedResultHybrid<ListingData>> {
  const { sort = "recommended", page = 1, limit = 12, nearMatches } = params;

  // Defense in depth: block unbounded text searches
  if (params.query && !params.bounds) {
    throw new Error(
      "Unbounded text search not allowed: geographic bounds required when query is present",
    );
  }

  try {
    const {
      conditions,
      params: queryParams,
      paramIndex: startParamIndex,
      ftsQueryParamIndex,
    } = buildSearchDocWhereConditions(params);
    const whereClause = conditions.join(" AND ");

    // Build ORDER BY clause with ts_rank_cd tie-breaker when FTS is active
    const orderByClause = buildOrderByClause(sort, ftsQueryParamIndex);

    // Hybrid pagination: Use getLimitedCount for efficient counting
    const limitedCount = await getSearchDocLimitedCount(params);

    const total = limitedCount;
    const totalPages =
      limitedCount !== null ? Math.ceil(limitedCount / limit) : null;

    // Calculate safe page
    let safePage: number;
    if (totalPages !== null) {
      safePage = totalPages > 0 ? Math.max(1, Math.min(page, totalPages)) : 1;
    } else {
      safePage = Math.max(1, page);
    }
    const offset = (safePage - 1) * limit;

    // Fetch limit+1 items to determine hasNextPage
    const fetchLimit = limit + 1;
    let paramIndex = startParamIndex;

    // Main query - reads from denormalized SearchDoc
    const dataQuery = `
      SELECT
        d.id,
        d.title,
        d.description,
        d.price,
        d.images,
        d.available_slots as "availableSlots",
        d.total_slots as "totalSlots",
        d.amenities,
        d.house_rules as "houseRules",
        d.household_languages as "householdLanguages",
        d.primary_home_language as "primaryHomeLanguage",
        d.lease_duration as "leaseDuration",
        d.room_type as "roomType",
        d.move_in_date as "moveInDate",
        d.listing_created_at as "createdAt",
        d.view_count as "viewCount",
        d.city,
        d.state,
        d.lat,
        d.lng,
        d.avg_rating as "avgRating",
        d.review_count as "reviewCount"
      FROM listing_search_docs d
      WHERE ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const dataParams = [...queryParams, fetchLimit, offset];

    const listings = await prisma.$queryRawUnsafe<any[]>(
      dataQuery,
      ...dataParams,
    );

    // Map results to ListingData
    const results = listings.map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description,
      price: Number(l.price),
      images: l.images || [],
      availableSlots: l.availableSlots,
      totalSlots: l.totalSlots,
      amenities: l.amenities || [],
      houseRules: l.houseRules || [],
      householdLanguages: l.householdLanguages || [],
      primaryHomeLanguage: l.primaryHomeLanguage,
      leaseDuration: l.leaseDuration,
      roomType: l.roomType,
      moveInDate: l.moveInDate ? new Date(l.moveInDate) : undefined,
      createdAt: l.createdAt ? new Date(l.createdAt) : new Date(),
      viewCount: Number(l.viewCount) || 0,
      avgRating: Number(l.avgRating) || 0,
      reviewCount: Number(l.reviewCount) || 0,
      location: {
        city: l.city,
        state: l.state,
        lat: Number(l.lat) || 0,
        lng: Number(l.lng) || 0,
      },
    }));

    // Determine hasNextPage using limit+1 pattern
    const hasNextPage = results.length > limit;

    // Only return `limit` items
    let items: ListingData[] = hasNextPage ? results.slice(0, limit) : results;

    // Near-match expansion: if enabled and low results on page 1, fetch near matches
    let nearMatchCount = 0;
    let nearMatchExpansion: string | undefined;

    if (
      nearMatches &&
      items.length < LOW_RESULTS_THRESHOLD &&
      items.length > 0 &&
      safePage === 1
    ) {
      const expansion = expandFiltersForNearMatches(params);

      if (expansion.expandedDimension !== null) {
        nearMatchExpansion = expansion.expansionDescription ?? undefined;

        // Run expanded query (without nearMatches flag to prevent recursion)
        const expandedResult = await getSearchDocListingsPaginatedInternal({
          ...expansion.expanded,
          nearMatches: false,
          page: 1,
          limit: LOW_RESULTS_THRESHOLD * 2,
        });

        // Get IDs of exact matches to dedupe
        const exactIds = new Set(items.map((item) => item.id));

        // Filter to only near matches and tag them
        const nearMatchItems = expandedResult.items
          .filter((item) => !exactIds.has(item.id))
          .slice(0, LOW_RESULTS_THRESHOLD)
          .map((item) => {
            const availableFromStr = item.moveInDate
              ? item.moveInDate.toISOString().split("T")[0]
              : null;
            const isNearMatchResult = isNearMatch(
              { price: item.price, available_from: availableFromStr },
              params,
              expansion.expandedDimension,
            );
            return {
              ...item,
              isNearMatch: isNearMatchResult,
            };
          })
          .filter((item) => item.isNearMatch);

        nearMatchCount = nearMatchItems.length;

        // Merge results: exact matches first, then near matches
        items = [...items, ...nearMatchItems];
      }
    }

    return {
      items,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage: safePage > 1,
      page: safePage,
      limit,
      nearMatchCount: nearMatchCount > 0 ? nearMatchCount : undefined,
      nearMatchExpansion,
    };
  } catch (error) {
    const dataError = wrapDatabaseError(error, "getSearchDocListingsPaginated");
    dataError.log({
      operation: "getSearchDocListingsPaginated",
      hasQuery: !!params.query,
      hasBounds: !!params.bounds,
      page: params.page,
      sortOption: params.sort,
    });
    throw dataError;
  }
}

/**
 * Get paginated listings from SearchDoc (denormalized table).
 * Cached with 60s TTL. Uses hybrid pagination for cost efficiency.
 */
export async function getSearchDocListingsPaginated(
  params: FilterParams = {},
): Promise<PaginatedResultHybrid<ListingData>> {
  const cacheKey = createSearchDocListCacheKey(params);

  const cachedFn = unstable_cache(
    async () => getSearchDocListingsPaginatedInternal(params),
    ["searchdoc-listings-paginated", cacheKey],
    { revalidate: 60 },
  );

  return cachedFn();
}

// ============================================
// Keyset Paginated Listings Query (SearchDoc)
// ============================================

/**
 * Extended result type with keyset cursor support.
 * Used by v2 API for stable cursor-based pagination.
 */
export interface KeysetPaginatedResult<T> extends PaginatedResultHybrid<T> {
  nextCursor: string | null;
}

/**
 * Get paginated listings using keyset cursor pagination.
 *
 * When cursor is provided, uses keyset WHERE clause instead of OFFSET
 * for stable pagination that prevents result drift.
 *
 * Feature flag: ENABLE_SEARCH_KEYSET=true
 *
 * @param params - Filter parameters
 * @param cursor - Optional decoded keyset cursor from previous page
 * @returns Paginated results with nextCursor for next page
 */
export async function getSearchDocListingsWithKeyset(
  params: FilterParams = {},
  cursor: KeysetCursor | null = null,
): Promise<KeysetPaginatedResult<ListingData>> {
  // Defense in depth: block unbounded text searches
  if (params.query && !params.bounds) {
    throw new Error(
      "Unbounded text search not allowed: geographic bounds required when query is present",
    );
  }

  const { sort = "recommended", limit = 12 } = params;
  const sortOption = sort as SortOption;

  // If keyset is disabled or no cursor, use offset-based pagination
  if (!features.searchKeyset || !cursor) {
    const result = await getSearchDocListingsPaginated(params);

    // Note: For offset-based fallback, we don't have raw row data to build keyset cursor
    // Return null and the service layer will fall back to legacy cursor format
    return {
      ...result,
      nextCursor: null,
    };
  }

  // Keyset pagination is enabled and we have a cursor
  try {
    const {
      conditions,
      params: queryParams,
      paramIndex: startParamIndex,
      ftsQueryParamIndex,
    } = buildSearchDocWhereConditions(params);

    // Add keyset WHERE clause
    const keysetResult = buildKeysetWhereClause(
      cursor,
      sortOption,
      startParamIndex,
    );
    conditions.push(keysetResult.clause);
    const allParams = [...queryParams, ...keysetResult.params];
    let paramIndex = keysetResult.nextParamIndex;

    const whereClause = conditions.join(" AND ");

    // Build ORDER BY clause with ts_rank_cd tie-breaker when FTS is active
    const orderByClause = buildOrderByClause(sortOption, ftsQueryParamIndex);

    // Fetch limit+1 items to determine hasNextPage
    const fetchLimit = limit + 1;

    // Main query with cursor row data columns for building next cursor
    // Note: Numeric values are cast to text to preserve precision for cursor encoding
    const dataQuery = `
      SELECT
        d.id,
        d.title,
        d.description,
        d.price,
        d.images,
        d.available_slots as "availableSlots",
        d.total_slots as "totalSlots",
        d.amenities,
        d.house_rules as "houseRules",
        d.household_languages as "householdLanguages",
        d.primary_home_language as "primaryHomeLanguage",
        d.lease_duration as "leaseDuration",
        d.room_type as "roomType",
        d.move_in_date as "moveInDate",
        d.listing_created_at as "createdAt",
        d.view_count as "viewCount",
        d.city,
        d.state,
        d.lat,
        d.lng,
        d.avg_rating as "avgRating",
        d.review_count as "reviewCount",
        -- Cursor row data columns (text for float precision)
        d.recommended_score::text as "_cursorRecommendedScore",
        d.price::text as "_cursorPrice",
        d.avg_rating::text as "_cursorAvgRating",
        d.review_count::text as "_cursorReviewCount",
        d.listing_created_at::text as "_cursorCreatedAt"
      FROM listing_search_docs d
      WHERE ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT $${paramIndex++}
    `;

    const dataParams = [...allParams, fetchLimit];

    const listings = await prisma.$queryRawUnsafe<any[]>(
      dataQuery,
      ...dataParams,
    );

    // Map results to ListingData
    const results = listings.map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description,
      price: Number(l.price),
      images: l.images || [],
      availableSlots: l.availableSlots,
      totalSlots: l.totalSlots,
      amenities: l.amenities || [],
      houseRules: l.houseRules || [],
      householdLanguages: l.householdLanguages || [],
      primaryHomeLanguage: l.primaryHomeLanguage,
      leaseDuration: l.leaseDuration,
      roomType: l.roomType,
      moveInDate: l.moveInDate ? new Date(l.moveInDate) : undefined,
      createdAt: l.createdAt ? new Date(l.createdAt) : new Date(),
      viewCount: Number(l.viewCount) || 0,
      avgRating: Number(l.avgRating) || 0,
      reviewCount: Number(l.reviewCount) || 0,
      location: {
        city: l.city,
        state: l.state,
        lat: Number(l.lat) || 0,
        lng: Number(l.lng) || 0,
      },
    }));

    // Determine hasNextPage using limit+1 pattern
    const hasNextPage = results.length > limit;

    // Only return `limit` items
    const items: ListingData[] = hasNextPage ? results.slice(0, limit) : results;

    // Build nextCursor from the last item
    let nextCursor: string | null = null;
    if (hasNextPage && listings.length > 0) {
      // Use the last item within limit (not the extra one)
      const lastRawItem = listings[limit - 1];
      const cursorRowData: CursorRowData = {
        id: lastRawItem.id,
        listing_created_at: lastRawItem._cursorCreatedAt,
        recommended_score: lastRawItem._cursorRecommendedScore,
        price: lastRawItem._cursorPrice,
        avg_rating: lastRawItem._cursorAvgRating,
        review_count: lastRawItem._cursorReviewCount,
      };
      const keysetCursor = buildCursorFromRow(cursorRowData, sortOption);
      nextCursor = encodeKeysetCursor(keysetCursor);
    }

    // Near-match expansion for keyset pagination (only on first page, i.e., no cursor)
    // Since we have a cursor, we're not on the first page, so skip near-match logic
    // Near matches are only shown on page 1 which uses offset-based pagination

    // Hybrid count - use cached count for consistency
    const limitedCount = await getSearchDocLimitedCount(params);
    const total = limitedCount;
    const totalPages =
      limitedCount !== null ? Math.ceil(limitedCount / limit) : null;

    return {
      items,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage: true, // Always true for keyset pagination (we have a cursor)
      page: null as unknown as number, // Page number is not meaningful for keyset
      limit,
      nextCursor,
    };
  } catch (error) {
    const dataError = wrapDatabaseError(
      error,
      "getSearchDocListingsWithKeyset",
    );
    dataError.log({
      operation: "getSearchDocListingsWithKeyset",
      hasQuery: !!params.query,
      hasBounds: !!params.bounds,
      sortOption: sort,
      hasCursor: !!cursor,
    });
    throw dataError;
  }
}

/**
 * Get first page of listings with keyset cursor support.
 *
 * This is used for initial page load (no cursor) but returns a keyset cursor
 * for subsequent pages.
 *
 * @param params - Filter parameters
 * @returns Paginated results with nextCursor for next page
 */
export async function getSearchDocListingsFirstPage(
  params: FilterParams = {},
): Promise<KeysetPaginatedResult<ListingData>> {
  // Defense in depth: block unbounded text searches
  if (params.query && !params.bounds) {
    throw new Error(
      "Unbounded text search not allowed: geographic bounds required when query is present",
    );
  }

  const { sort = "recommended", limit = 12, nearMatches } = params;
  const sortOption = sort as SortOption;

  // If keyset is disabled, use offset-based pagination
  if (!features.searchKeyset) {
    const result = await getSearchDocListingsPaginated(params);
    return {
      ...result,
      nextCursor: null,
    };
  }

  try {
    const {
      conditions,
      params: queryParams,
      paramIndex: startParamIndex,
      ftsQueryParamIndex,
    } = buildSearchDocWhereConditions(params);
    const whereClause = conditions.join(" AND ");

    // Build ORDER BY clause with ts_rank_cd tie-breaker when FTS is active
    const orderByClause = buildOrderByClause(sortOption, ftsQueryParamIndex);

    // Hybrid count
    const limitedCount = await getSearchDocLimitedCount(params);
    const total = limitedCount;
    const totalPages =
      limitedCount !== null ? Math.ceil(limitedCount / limit) : null;

    // Fetch limit+1 items to determine hasNextPage
    const fetchLimit = limit + 1;
    let paramIndex = startParamIndex;

    // Main query with cursor row data columns
    const dataQuery = `
      SELECT
        d.id,
        d.title,
        d.description,
        d.price,
        d.images,
        d.available_slots as "availableSlots",
        d.total_slots as "totalSlots",
        d.amenities,
        d.house_rules as "houseRules",
        d.household_languages as "householdLanguages",
        d.primary_home_language as "primaryHomeLanguage",
        d.lease_duration as "leaseDuration",
        d.room_type as "roomType",
        d.move_in_date as "moveInDate",
        d.listing_created_at as "createdAt",
        d.view_count as "viewCount",
        d.city,
        d.state,
        d.lat,
        d.lng,
        d.avg_rating as "avgRating",
        d.review_count as "reviewCount",
        -- Cursor row data columns (text for float precision)
        d.recommended_score::text as "_cursorRecommendedScore",
        d.price::text as "_cursorPrice",
        d.avg_rating::text as "_cursorAvgRating",
        d.review_count::text as "_cursorReviewCount",
        d.listing_created_at::text as "_cursorCreatedAt"
      FROM listing_search_docs d
      WHERE ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT $${paramIndex++}
    `;

    const dataParams = [...queryParams, fetchLimit];

    const listings = await prisma.$queryRawUnsafe<any[]>(
      dataQuery,
      ...dataParams,
    );

    // Map results to ListingData
    const results = listings.map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description,
      price: Number(l.price),
      images: l.images || [],
      availableSlots: l.availableSlots,
      totalSlots: l.totalSlots,
      amenities: l.amenities || [],
      houseRules: l.houseRules || [],
      householdLanguages: l.householdLanguages || [],
      primaryHomeLanguage: l.primaryHomeLanguage,
      leaseDuration: l.leaseDuration,
      roomType: l.roomType,
      moveInDate: l.moveInDate ? new Date(l.moveInDate) : undefined,
      createdAt: l.createdAt ? new Date(l.createdAt) : new Date(),
      viewCount: Number(l.viewCount) || 0,
      avgRating: Number(l.avgRating) || 0,
      reviewCount: Number(l.reviewCount) || 0,
      location: {
        city: l.city,
        state: l.state,
        lat: Number(l.lat) || 0,
        lng: Number(l.lng) || 0,
      },
    }));

    // Determine hasNextPage using limit+1 pattern
    const hasNextPage = results.length > limit;

    // Only return `limit` items
    let items: ListingData[] = hasNextPage ? results.slice(0, limit) : results;

    // Near-match expansion: if enabled and low results on page 1, fetch near matches
    let nearMatchCount = 0;
    let nearMatchExpansion: string | undefined;

    if (
      nearMatches &&
      items.length < LOW_RESULTS_THRESHOLD &&
      items.length > 0
    ) {
      const expansion = expandFiltersForNearMatches(params);

      if (expansion.expandedDimension !== null) {
        nearMatchExpansion = expansion.expansionDescription ?? undefined;

        // Run expanded query (without nearMatches flag to prevent recursion)
        const expandedResult = await getSearchDocListingsFirstPage({
          ...expansion.expanded,
          nearMatches: false,
          page: 1,
          limit: LOW_RESULTS_THRESHOLD * 2,
        });

        // Get IDs of exact matches to dedupe
        const exactIds = new Set(items.map((item) => item.id));

        // Filter to only near matches and tag them
        const nearMatchItems = expandedResult.items
          .filter((item) => !exactIds.has(item.id))
          .slice(0, LOW_RESULTS_THRESHOLD)
          .map((item) => {
            const availableFromStr = item.moveInDate
              ? item.moveInDate.toISOString().split("T")[0]
              : null;
            const isNearMatchResult = isNearMatch(
              { price: item.price, available_from: availableFromStr },
              params,
              expansion.expandedDimension,
            );
            return {
              ...item,
              isNearMatch: isNearMatchResult,
            };
          })
          .filter((item) => item.isNearMatch);

        nearMatchCount = nearMatchItems.length;

        // Merge results: exact matches first, then near matches
        items = [...items, ...nearMatchItems];
      }
    }

    // Build nextCursor from the last item
    let nextCursor: string | null = null;
    if (hasNextPage && listings.length > 0) {
      // Use the last item within limit (not the extra one)
      const lastRawItem = listings[Math.min(limit - 1, listings.length - 1)];
      const cursorRowData: CursorRowData = {
        id: lastRawItem.id,
        listing_created_at: lastRawItem._cursorCreatedAt,
        recommended_score: lastRawItem._cursorRecommendedScore,
        price: lastRawItem._cursorPrice,
        avg_rating: lastRawItem._cursorAvgRating,
        review_count: lastRawItem._cursorReviewCount,
      };
      const keysetCursor = buildCursorFromRow(cursorRowData, sortOption);
      nextCursor = encodeKeysetCursor(keysetCursor);
    }

    return {
      items,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage: false, // First page has no previous
      page: 1,
      limit,
      nearMatchCount: nearMatchCount > 0 ? nearMatchCount : undefined,
      nearMatchExpansion,
      nextCursor,
    };
  } catch (error) {
    const dataError = wrapDatabaseError(error, "getSearchDocListingsFirstPage");
    dataError.log({
      operation: "getSearchDocListingsFirstPage",
      hasQuery: !!params.query,
      hasBounds: !!params.bounds,
      sortOption: sort,
    });
    throw dataError;
  }
}

// ============================================
// Feature Flag Check
// ============================================

/**
 * Check if SearchDoc feature is enabled.
 * Controlled by:
 * - ENABLE_SEARCH_DOC env var (global enable via features.searchDoc)
 * - ?searchDoc=1 URL param (per-request override for testing)
 *
 * CRITICAL: When disabled, falls back to slow LIKE queries.
 * In production, this should always be enabled for performance.
 */
export function isSearchDocEnabled(urlSearchDoc?: string | null): boolean {
  // URL override for testing (allows ?searchDoc=1 to enable on specific requests)
  if (urlSearchDoc === "1" || urlSearchDoc === "true") {
    return true;
  }
  if (urlSearchDoc === "0" || urlSearchDoc === "false") {
    return false;
  }

  // Read directly from process.env to avoid caching issues in tests
  // The typed features.searchDoc getter caches values, which breaks test isolation
  return process.env.ENABLE_SEARCH_DOC === "true";
}
