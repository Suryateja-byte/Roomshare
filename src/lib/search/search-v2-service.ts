/**
 * Search API v2 - Shared Server Function
 *
 * Extracted from /api/search/v2/route.ts for direct server-side invocation.
 * Avoids HTTP self-call overhead when page.tsx needs unified search data.
 */

import { getListingsPaginated, getMapListings } from "@/lib/data";
import { parseSearchParams } from "@/lib/search-params";
import { features } from "@/lib/env";
import {
  isSearchDocEnabled,
  getSearchDocListingsPaginated,
  getSearchDocMapListings,
  getSearchDocListingsWithKeyset,
  getSearchDocListingsFirstPage,
} from "@/lib/search/search-doc-queries";
import {
  generateQueryHash,
  encodeCursor,
  decodeCursor,
  decodeCursorAny,
  type KeysetCursor,
  type SortOption,
} from "@/lib/search/hash";
import {
  transformToListItems,
  transformToMapResponse,
  determineMode,
  shouldIncludePins,
} from "@/lib/search/transform";
import {
  isRankingEnabled,
  buildScoreMap,
  computeMedianPrice,
  getBoundsCenter,
  getDebugSignals,
  RANKING_VERSION,
  type RankingContext,
  type RankableListing,
} from "@/lib/search/ranking";
import type { SearchV2Response } from "@/lib/search/types";
import type { PaginatedResultHybrid, ListingData, MapListingData } from "@/lib/data";
import {
  clampBoundsToMaxSpan,
  MAX_LAT_SPAN,
  MAX_LNG_SPAN,
} from "@/lib/validation";
import { logger } from "@/lib/logger";

/**
 * Extract first value from a param that may be string, string[], or undefined.
 * Used for single-value params like cursor, searchDoc, ranker, debugRank.
 */
function getFirstValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export interface SearchV2Params {
  /** Raw search params from URL (will be parsed internally) */
  rawParams: Record<string, string | string[] | undefined>;
  /** Items per page (optional, defaults to service's internal default) */
  limit?: number;
}

export interface SearchV2Result {
  /** Full v2 response on success */
  response: SearchV2Response | null;
  /**
   * Raw paginated result with full ListingData for ListingCard rendering.
   * The v2 list.items is a simplified shape, but ListingCard needs full data.
   */
  paginatedResult: PaginatedResultHybrid<ListingData> | null;
  /** Error message if failed */
  error?: string;
  /**
   * True when the search was blocked because it had a text query but no
   * geographic bounds. UI should prompt user to select a location.
   */
  unboundedSearch?: boolean;
}

/**
 * Execute unified search and return v2 response shape.
 *
 * This is the core search logic extracted from the API route handler.
 * Called directly by page.tsx for SSR, avoiding HTTP self-call overhead.
 *
 * @param params - Search parameters from URL
 * @returns SearchV2Result with response or error
 */
export async function executeSearchV2(
  params: SearchV2Params,
): Promise<SearchV2Result> {
  try {
    const searchStartTime = performance.now();

    // Parse and validate search params
    const parsed = parseSearchParams(params.rawParams);

    // Clamp bounds if they exceed max span (security: prevent expensive wide-area queries)
    // Unlike map-listings which rejects oversized bounds, we silently clamp for list queries
    if (parsed.filterParams.bounds) {
      const { minLat, maxLat, minLng, maxLng } = parsed.filterParams.bounds;
      const latSpan = maxLat - minLat;
      const crossesAntimeridian = minLng > maxLng;
      const lngSpan = crossesAntimeridian
        ? (180 - minLng) + (maxLng + 180)
        : maxLng - minLng;

      if (latSpan > MAX_LAT_SPAN || lngSpan > MAX_LNG_SPAN) {
        parsed.filterParams.bounds = clampBoundsToMaxSpan(parsed.filterParams.bounds);
      }
    }

    // Block unbounded searches: text query without geographic bounds
    // This prevents full-table scans that are expensive and not useful
    if (parsed.boundsRequired) {
      return {
        response: null,
        paginatedResult: null,
        unboundedSearch: true,
      };
    }

    // Check if features are enabled
    const useSearchDoc = isSearchDocEnabled(
      getFirstValue(params.rawParams.searchDoc),
    );
    const useKeyset = features.searchKeyset && useSearchDoc;

    // Get sort option from parsed params (default to recommended)
    const sortOption: SortOption =
      (parsed.filterParams.sort as SortOption) || "recommended";

    // Handle cursor-based pagination
    const cursorStr = getFirstValue(params.rawParams.cursor);
    let page = parsed.requestedPage;
    let keysetCursor: KeysetCursor | null = null;

    if (cursorStr && useKeyset) {
      // Try to decode as keyset or legacy cursor
      const decoded = decodeCursorAny(cursorStr, sortOption);
      if (decoded?.type === "keyset") {
        keysetCursor = decoded.cursor;
      } else if (decoded?.type === "legacy") {
        // Legacy cursor - use page number, but return keyset cursor going forward
        page = decoded.page;
      }
      // If invalid cursor, start from beginning (page 1, no keyset cursor)
    } else if (cursorStr) {
      // Keyset disabled - use legacy cursor decoding
      const decodedPage = decodeCursor(cursorStr);
      if (decodedPage !== null) {
        page = decodedPage;
      }
    }

    // Build filter params with page and limit
    const filterParams = {
      ...parsed.filterParams,
      page,
      ...(params.limit && { limit: params.limit }),
    };

    // TTFB optimization: Execute list and map queries in parallel
    // These are independent database queries that don't depend on each other
    const listPromise = (async (): Promise<{
      listResult: PaginatedResultHybrid<ListingData>;
      nextCursor: string | null;
    }> => {
      if (useKeyset) {
        // Keyset pagination path
        if (keysetCursor) {
          // Use keyset cursor for stable pagination
          const keysetResult = await getSearchDocListingsWithKeyset(
            filterParams,
            keysetCursor,
          );
          return { listResult: keysetResult, nextCursor: keysetResult.nextCursor };
        } else {
          // First page or invalid cursor - get first page with keyset cursor
          const firstPageResult =
            await getSearchDocListingsFirstPage(filterParams);
          return { listResult: firstPageResult, nextCursor: firstPageResult.nextCursor };
        }
      } else {
        // Offset pagination path (legacy or SearchDoc disabled)
        if (useSearchDoc) {
          const result = await getSearchDocListingsPaginated(filterParams);
          return {
            listResult: result,
            nextCursor: result.hasNextPage ? encodeCursor(page + 1) : null,
          };
        } else {
          // Legacy path: PaginatedResult doesn't have hasNextPage, compute from totalPages
          const result = await getListingsPaginated(filterParams);
          const hasNext = result.page < result.totalPages;
          return {
            listResult: {
              ...result,
              totalPages: result.totalPages,
              hasNextPage: hasNext,
              hasPrevPage: result.page > 1,
            },
            nextCursor: hasNext ? encodeCursor(page + 1) : null,
          };
        }
      }
    })();

    // Map query runs in parallel with list query
    const mapPromise = useSearchDoc
      ? getSearchDocMapListings(filterParams)
      : getMapListings(filterParams);

    // Execute both queries concurrently with partial failure tolerance
    const [listSettled, mapSettled] = await Promise.allSettled([
      listPromise,
      mapPromise,
    ]);

    // Handle partial failures gracefully
    let listResult: PaginatedResultHybrid<ListingData>;
    let nextCursor: string | null;
    let mapListings: MapListingData[];

    if (listSettled.status === "fulfilled") {
      ({ listResult, nextCursor } = listSettled.value);
    } else {
      console.error("[SearchV2] List query failed, returning empty results", {
        error: listSettled.reason instanceof Error ? listSettled.reason.message : "Unknown",
      });
      listResult = { items: [], hasNextPage: false, hasPrevPage: false, total: 0, totalPages: 0, page: 1, limit: 20 };
      nextCursor = null;
    }

    if (mapSettled.status === "fulfilled") {
      mapListings = mapSettled.value;
    } else {
      console.error("[SearchV2] Map query failed, returning empty map data", {
        error: mapSettled.reason instanceof Error ? mapSettled.reason.message : "Unknown",
      });
      mapListings = [];
    }

    // Determine mode based on mapListings count (not list total)
    const mode = determineMode(mapListings.length);

    // Generate query hash for caching (excludes pagination)
    const queryHash = generateQueryHash({
      query: parsed.filterParams.query,
      minPrice: parsed.filterParams.minPrice,
      maxPrice: parsed.filterParams.maxPrice,
      amenities: parsed.filterParams.amenities,
      houseRules: parsed.filterParams.houseRules,
      languages: parsed.filterParams.languages,
      roomType: parsed.filterParams.roomType,
      leaseDuration: parsed.filterParams.leaseDuration,
      moveInDate: parsed.filterParams.moveInDate,
      bounds: parsed.filterParams.bounds,
      nearMatches: parsed.filterParams.nearMatches,
    });

    // Transform list items
    const listItems = transformToListItems(listResult.items);

    // Check if ranking is enabled (URL override or env flag)
    const rankerEnabled = isRankingEnabled(
      getFirstValue(params.rawParams.ranker),
    );
    // Debug output only allowed when searchDebugRanking is enabled (non-production or explicit env flag)
    // This prevents production users from accessing debug signals via ?debugRank=1
    const debugRank =
      features.searchDebugRanking &&
      getFirstValue(params.rawParams.debugRank) === "1";

    // Compute scoreMap for pin tiering when ranking is enabled and in pins mode
    let scoreMap: Map<string, number> | undefined;
    let debugSignals:
      | Array<{
          id: string;
          quality: number;
          rating: number;
          price: number;
          recency: number;
          geo: number;
          total: number;
        }>
      | undefined;

    if (rankerEnabled && shouldIncludePins(mapListings.length)) {
      // Adapt mapListings to RankableListing interface
      const rankableListings: RankableListing[] = mapListings.map(
        (listing) => ({
          id: listing.id,
          price: listing.price,
          lat: listing.location.lat,
          lng: listing.location.lng,
          // SearchDoc fields (may be undefined for legacy path)
          recommendedScore: (listing as { recommendedScore?: number | null })
            .recommendedScore,
          avgRating: (listing as { avgRating?: number | null }).avgRating,
          reviewCount: (listing as { reviewCount?: number | null }).reviewCount,
          createdAt: (listing as { createdAt?: Date | string | null })
            .createdAt,
        }),
      );

      // Build ranking context from map candidates
      // Convert filterParams bounds format to sw/ne format for getBoundsCenter
      const boundsForRanking = parsed.filterParams.bounds
        ? {
            sw: {
              lat: parsed.filterParams.bounds.minLat,
              lng: parsed.filterParams.bounds.minLng,
            },
            ne: {
              lat: parsed.filterParams.bounds.maxLat,
              lng: parsed.filterParams.bounds.maxLng,
            },
          }
        : undefined;

      const context: RankingContext = {
        sort: sortOption,
        center: boundsForRanking
          ? getBoundsCenter(boundsForRanking)
          : undefined,
        localMedianPrice: computeMedianPrice(rankableListings),
      };

      // Compute scores for pin tiering
      scoreMap = buildScoreMap(rankableListings, context);

      // Generate debug signals if requested (no PII, capped to 5)
      if (debugRank) {
        debugSignals = getDebugSignals(rankableListings, scoreMap, context, 5);
      }
    }

    // Transform map data (geojson always, pins only when sparse)
    // Pass scoreMap for score-based pin tiering when ranking is enabled
    const mapResponse = transformToMapResponse(mapListings, scoreMap);

    // Build response
    const response: SearchV2Response = {
      meta: {
        queryHash,
        generatedAt: new Date().toISOString(),
        mode,
        // Debug fields (only when debugRank=1)
        ...(debugRank && rankerEnabled
          ? {
              rankingVersion: RANKING_VERSION,
              rankingEnabled: true,
              topSignals: debugSignals,
            }
          : {}),
      },
      list: {
        items: listItems,
        nextCursor,
        total: listResult.total,
      },
      map: mapResponse,
    };

    const searchDurationMs = Math.round(performance.now() - searchStartTime);
    console.log(JSON.stringify({
      event: "search_latency",
      durationMs: searchDurationMs,
      listCount: listResult?.items?.length ?? 0,
      mapCount: mapListings?.length ?? 0,
      mode,
      cached: false,
    }));

    return { response, paginatedResult: listResult };
  } catch (error) {
    // Log without PII (no user data, just error context)
    logger.sync.error("SearchV2 service error", {
      action: "executeSearchV2",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      response: null,
      paginatedResult: null,
      error: "Failed to fetch search results",
    };
  }
}
