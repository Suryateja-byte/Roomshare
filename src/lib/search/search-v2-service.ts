/**
 * Search API v2 - Shared Server Function
 *
 * Extracted from /api/search/v2/route.ts for direct server-side invocation.
 * Avoids HTTP self-call overhead when page.tsx needs unified search data.
 */

import {
  getListingsPaginated,
  getMapListings,
  sanitizeSearchQuery,
} from "@/lib/data";
import { parseSearchParams } from "@/lib/search-params";
import { features } from "@/lib/env";
import {
  isSearchDocEnabled,
  getSearchDocListingsPaginated,
  getSearchDocMapListings,
  getSearchDocListingsWithKeyset,
  getSearchDocListingsFirstPage,
  semanticSearchQuery,
  mapSemanticRowsToListingData,
  type MapListingsResult,
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
import type {
  PaginatedResultHybrid,
  ListingData,
  MapListingData,
} from "@/lib/data";
import { clampBoundsToMaxSpan } from "@/lib/validation";
import {
  DEFAULT_PAGE_SIZE,
  MAP_FETCH_MAX_LAT_SPAN,
  MAP_FETCH_MAX_LNG_SPAN,
} from "@/lib/constants";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { withTimeout, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";
import { getAvailabilityForListings } from "@/lib/availability";

const VIBE_SOFT_FALLBACK_WARNING = "VIBE_SOFT_FALLBACK";

function normalizeForVibeMatch(value: string | undefined | null): string {
  return sanitizeSearchQuery(value ?? "").toLowerCase();
}

function tokenizeVibeQuery(vibeQuery: string): string[] {
  return Array.from(
    new Set(
      normalizeForVibeMatch(vibeQuery)
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  );
}

function computeVibeSoftMatchScore(
  listing: ListingData,
  vibeQuery: string,
  tokens: string[]
): number {
  const normalizedPhrase = normalizeForVibeMatch(vibeQuery);
  const title = normalizeForVibeMatch(listing.title);
  const description = normalizeForVibeMatch(listing.description);
  const amenities = normalizeForVibeMatch(listing.amenities.join(" "));
  const houseRules = normalizeForVibeMatch(listing.houseRules.join(" "));
  const languages = normalizeForVibeMatch(listing.householdLanguages.join(" "));
  const roomType = normalizeForVibeMatch(listing.roomType);
  const leaseDuration = normalizeForVibeMatch(listing.leaseDuration);

  let score = 0;

  if (normalizedPhrase) {
    if (title.includes(normalizedPhrase)) score += 8;
    if (description.includes(normalizedPhrase)) score += 4;
  }

  for (const token of tokens) {
    if (title.includes(token)) score += 3;
    if (description.includes(token)) score += 1.5;
    if (amenities.includes(token)) score += 1.25;
    if (houseRules.includes(token)) score += 1;
    if (languages.includes(token)) score += 0.75;
    if (roomType.includes(token)) score += 1;
    if (leaseDuration.includes(token)) score += 0.5;
  }

  return score;
}

function rerankListingsByVibe(
  items: ListingData[],
  vibeQuery: string
): ListingData[] {
  const tokens = tokenizeVibeQuery(vibeQuery);
  if (tokens.length === 0) {
    return items;
  }

  return items
    .map((listing, index) => ({
      listing,
      index,
      score: computeVibeSoftMatchScore(listing, vibeQuery, tokens),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.listing);
}

/**
 * Extract first value from a param that may be string, string[], or undefined.
 * Used for single-value params like cursor, searchDoc, ranker, debugRank.
 */
function getFirstValue(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parseDateParam(value?: string): Date | undefined {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00.000Z`);
}

export interface SearchV2Params {
  /** Raw search params from URL (will be parsed internally) */
  rawParams: Record<string, string | string[] | undefined>;
  /** Items per page (optional, defaults to service's internal default) */
  limit?: number;
  /** Skip map query work when the caller only needs list data */
  includeMap?: boolean;
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
  params: SearchV2Params
): Promise<SearchV2Result> {
  try {
    const searchStartTime = performance.now();

    // Parse and validate search params
    const parsed = parseSearchParams(params.rawParams);

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
      getFirstValue(params.rawParams.searchDoc)
    );
    const useKeyset = features.searchKeyset && useSearchDoc;

    // Get sort option from parsed params (default to recommended)
    const sortOption: SortOption =
      (parsed.filterParams.sort as SortOption) || "recommended";
    const vibeQuery = parsed.filterParams.vibeQuery?.trim();
    const shouldUseRecommendedVibeRanking =
      Boolean(vibeQuery) && sortOption === "recommended";

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
        // Clamp to prevent unbounded OFFSET from crafted cursors (DoS prevention)
        page = Math.min(decoded.page, 100);
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
      usedSoftVibeFallback: boolean;
    }> => {
      const finalizeListResult = (
        listResult: PaginatedResultHybrid<ListingData>,
        nextCursor: string | null
      ) => {
        const usedSoftVibeFallback =
          Boolean(vibeQuery) &&
          shouldUseRecommendedVibeRanking &&
          listResult.items.length > 0;

        return {
          listResult:
            usedSoftVibeFallback && vibeQuery
              ? {
                  ...listResult,
                  items: rerankListingsByVibe(listResult.items, vibeQuery),
                }
              : listResult,
          nextCursor,
          usedSoftVibeFallback,
        };
      };

      // Semantic search branch — text queries with "recommended" sort
      if (
        features.semanticSearch &&
        vibeQuery &&
        vibeQuery.length >= 3 &&
        shouldUseRecommendedVibeRanking
      ) {
        const pageSize = filterParams.limit || DEFAULT_PAGE_SIZE;
        const offset = (page - 1) * pageSize;
        const semanticRows = await semanticSearchQuery(
          {
            ...filterParams,
            minAvailableSlots: 0,
          },
          pageSize + 1,
          offset
        );

        if (semanticRows && semanticRows.length > 0) {
          const hasNextPage = semanticRows.length > pageSize;
          let items = mapSemanticRowsToListingData(
            semanticRows.slice(0, pageSize)
          );
          const availabilityByListing = await getAvailabilityForListings(
            items.map((item) => item.id),
            {
              startDate: parseDateParam(filterParams.moveInDate),
              endDate: parseDateParam(filterParams.endDate),
            }
          );
          const requiredSlots = Math.max(filterParams.minAvailableSlots ?? 1, 1);
          items = items
            .map((item) => {
              const availability = availabilityByListing.get(item.id);
              return availability
                ? {
                    ...item,
                    availableSlots: availability.effectiveAvailableSlots,
                    totalSlots: availability.totalSlots,
                  }
                : item;
            })
            .filter((item) => item.availableSlots >= requiredSlots);
          const semanticResult: PaginatedResultHybrid<ListingData> = {
            items,
            total: hasNextPage ? null : items.length,
            page,
            limit: pageSize,
            totalPages: hasNextPage ? null : 1,
            hasNextPage,
            nextCursor: hasNextPage ? encodeCursor(page + 1) : null,
          };
          return {
            listResult: semanticResult,
            nextCursor: semanticResult.nextCursor ?? null,
            usedSoftVibeFallback: false,
          };
        }
        // Fall through to bounded structural search if semantic matching is
        // unavailable or returns no rows. Vibe becomes a soft ranking signal.
      }

      if (useKeyset) {
        // Keyset pagination path
        if (keysetCursor) {
          // Use keyset cursor for stable pagination
          const keysetResult = await getSearchDocListingsWithKeyset(
            filterParams,
            keysetCursor
          );
          return finalizeListResult(keysetResult, keysetResult.nextCursor);
        } else if (page > 1) {
          // Legacy cursor with page offset (e.g., semantic→FTS fallback with {p:N} cursor).
          // Route to offset-based pagination so the page number is respected,
          // preventing duplicate results when the ranking engine changes mid-session.
          const result = await getSearchDocListingsPaginated(filterParams);
          return finalizeListResult(
            result,
            result.hasNextPage ? encodeCursor(page + 1) : null
          );
        } else {
          // First page - get first page with keyset cursor
          const firstPageResult =
            await getSearchDocListingsFirstPage(filterParams);
          return finalizeListResult(
            firstPageResult,
            firstPageResult.nextCursor
          );
        }
      } else {
        // Offset pagination path (legacy or SearchDoc disabled)
        if (useSearchDoc) {
          const result = await getSearchDocListingsPaginated(filterParams);
          return finalizeListResult(
            result,
            result.hasNextPage ? encodeCursor(page + 1) : null
          );
        } else {
          // Legacy path: PaginatedResult doesn't have hasNextPage, compute from totalPages
          const result = await getListingsPaginated(filterParams);
          const hasNext = result.page < result.totalPages;
          return finalizeListResult(
            {
              ...result,
              totalPages: result.totalPages,
              hasNextPage: hasNext,
              hasPrevPage: result.page > 1,
            },
            hasNext ? encodeCursor(page + 1) : null
          );
        }
      }
    })();

    // Map query uses bounds clamped to 60°/130° (wider than list needs, covers full viewport)
    const mapBounds = parsed.filterParams.bounds
      ? clampBoundsToMaxSpan(
          parsed.filterParams.bounds,
          MAP_FETCH_MAX_LAT_SPAN,
          MAP_FETCH_MAX_LNG_SPAN
        )
      : null;
    // When semantic search is active, strip the text query from map params.
    // The list uses vector similarity (matches natural language), but the map uses FTS
    // (keyword matching) which fails for descriptive queries like "bright sunny studio".
    // Stripping `query` lets the map show all listings in bounds matching structural filters.
    const hasSemanticVibeQuery =
      typeof vibeQuery === "string" && vibeQuery.length >= 3;
    const isSemanticActive =
      features.semanticSearch &&
      hasSemanticVibeQuery &&
      shouldUseRecommendedVibeRanking;
    const mapFilterParams = {
      ...filterParams,
      ...(mapBounds ? { bounds: mapBounds } : {}),
      ...(isSemanticActive ? { query: undefined } : {}),
    };

    const shouldIncludeMap = params.includeMap !== false;
    const mapPromise: Promise<MapListingsResult | MapListingData[]> | null =
      shouldIncludeMap
        ? useSearchDoc
          ? getSearchDocMapListings(mapFilterParams)
          : getMapListings(mapFilterParams)
        : null;

    // Execute list query and, when requested, map query with partial failure tolerance.
    const settledResults = await Promise.allSettled([
      withTimeout(listPromise, DEFAULT_TIMEOUTS.DATABASE, "search-list-query"),
      ...(mapPromise
        ? [
            withTimeout(
              mapPromise,
              DEFAULT_TIMEOUTS.DATABASE,
              "search-map-query"
            ),
          ]
        : []),
    ]);
    const [listSettled, mapSettled] = settledResults;

    // Handle partial failures gracefully
    let listResult: PaginatedResultHybrid<ListingData>;
    let nextCursor: string | null;
    let usedSoftVibeFallback = false;
    let mapListings: MapListingData[];
    let mapTruncated: boolean | undefined;
    let mapTotalCandidates: number | undefined;
    const warnings: string[] = [];

    if (listSettled.status === "fulfilled") {
      ({ listResult, nextCursor, usedSoftVibeFallback } = listSettled.value);
    } else {
      logger.sync.error("[SearchV2] List query failed", {
        error:
          listSettled.reason instanceof Error
            ? listSettled.reason.message
            : "Unknown",
      });
      return {
        response: null,
        paginatedResult: null,
        error: "Search temporarily unavailable",
      };
    }

    if (mapSettled?.status === "fulfilled") {
      const mapResult = mapSettled.value;
      // Handle both SearchDoc result shape and legacy plain array
      if ("listings" in mapResult) {
        // SearchDoc path: { listings, truncated, totalCandidates }
        mapListings = mapResult.listings;
        mapTruncated = mapResult.truncated;
        mapTotalCandidates = mapResult.totalCandidates;
      } else {
        // Legacy path: plain MapListingData[]
        mapListings = mapResult;
      }
    } else if (mapSettled?.status === "rejected") {
      logger.sync.error("[SearchV2] Map query failed", {
        error:
          mapSettled.reason instanceof Error
            ? mapSettled.reason.message
            : "Unknown",
      });
      mapListings = [];
      warnings.push("MAP_QUERY_FAILED");
    } else {
      mapListings = [];
    }

    if (usedSoftVibeFallback) {
      warnings.push(VIBE_SOFT_FALLBACK_WARNING);
    }

    // Determine mode based on mapListings count (not list total)
    const mode = determineMode(mapListings.length);

    // Generate query hash for caching (excludes pagination)
    const queryHash = generateQueryHash({
      query: parsed.filterParams.query,
      vibeQuery: parsed.filterParams.vibeQuery,
      minPrice: parsed.filterParams.minPrice,
      maxPrice: parsed.filterParams.maxPrice,
      amenities: parsed.filterParams.amenities,
      houseRules: parsed.filterParams.houseRules,
      languages: parsed.filterParams.languages,
      roomType: parsed.filterParams.roomType,
      leaseDuration: parsed.filterParams.leaseDuration,
      moveInDate: parsed.filterParams.moveInDate,
      endDate: parsed.filterParams.endDate,
      bounds: parsed.filterParams.bounds,
      nearMatches: parsed.filterParams.nearMatches,
    });

    // Transform list items
    const listItems = transformToListItems(listResult.items);

    // Check if ranking is enabled (URL override or env flag)
    const rankerEnabled = isRankingEnabled(
      getFirstValue(params.rawParams.ranker)
    );
    // Debug output only allowed when searchDebugRanking feature flag is enabled.
    // In production, features.searchDebugRanking is false, so the ?debugRank=1
    // query param is ignored — no ranking signals are exposed to end users.
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
          // MapListingData now includes all ranking fields (C1 fix)
          avgRating: listing.avgRating,
          reviewCount: listing.reviewCount,
          recommendedScore: listing.recommendedScore ?? null,
          createdAt: listing.createdAt ?? null,
        })
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
    // Include truncation info when map results exceed MAX_MAP_MARKERS
    const mapResponse = transformToMapResponse(mapListings, {
      scoreMap,
      truncated: mapTruncated,
      totalCandidates: mapTotalCandidates,
    });

    // Build response
    const response: SearchV2Response = {
      meta: {
        queryHash,
        generatedAt: new Date().toISOString(),
        mode,
        ...(warnings.length > 0 ? { warnings } : {}),
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
    logger.sync.info("search_latency", {
      durationMs: searchDurationMs,
      listCount: listResult?.items?.length ?? 0,
      mapCount: mapListings?.length ?? 0,
      mode,
      cached: false,
    });

    return { response, paginatedResult: { ...listResult, nextCursor } };
  } catch (error) {
    // Log without PII (no user data, just error context)
    logger.sync.error("SearchV2 service error", {
      action: "executeSearchV2",
      error: sanitizeErrorMessage(error),
    });
    return {
      response: null,
      paginatedResult: null,
      error: "Failed to fetch search results",
    };
  }
}
