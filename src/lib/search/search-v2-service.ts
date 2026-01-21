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
import type { PaginatedResultHybrid, ListingData } from "@/lib/data";
import {
  clampBoundsToMaxSpan,
  MAX_LAT_SPAN,
  MAX_LNG_SPAN,
} from "@/lib/validation";

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

    // Fetch list data based on keyset mode
    let listResult: PaginatedResultHybrid<ListingData>;
    let nextCursor: string | null;

    if (useKeyset) {
      // Keyset pagination path
      if (keysetCursor) {
        // Use keyset cursor for stable pagination
        const keysetResult = await getSearchDocListingsWithKeyset(
          filterParams,
          keysetCursor,
        );
        listResult = keysetResult;
        nextCursor = keysetResult.nextCursor;
      } else {
        // First page or invalid cursor - get first page with keyset cursor
        const firstPageResult =
          await getSearchDocListingsFirstPage(filterParams);
        listResult = firstPageResult;
        nextCursor = firstPageResult.nextCursor;
      }
    } else {
      // Offset pagination path (legacy or SearchDoc disabled)
      listResult = useSearchDoc
        ? await getSearchDocListingsPaginated(filterParams)
        : await getListingsPaginated(filterParams);
      nextCursor = listResult.hasNextPage ? encodeCursor(page + 1) : null;
    }

    // Fetch map data (independent of pagination mode)
    const mapListings = useSearchDoc
      ? await getSearchDocMapListings(filterParams)
      : await getMapListings(filterParams);

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

    return { response, paginatedResult: listResult };
  } catch (error) {
    // Log without PII (no user data, just error context)
    console.error("SearchV2 service error:", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      response: null,
      paginatedResult: null,
      error: "Failed to fetch search results",
    };
  }
}
