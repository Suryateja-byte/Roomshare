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
  getSearchDocListingsByIds,
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
  encodeSnapshotCursor,
  decodeCursor,
  decodeCursorAny,
  type KeysetCursor,
  type SnapshotCursor,
  type SortOption,
} from "@/lib/search/hash";
import { SEARCH_DOC_PROJECTION_VERSION } from "@/lib/search/search-doc-sync";
import { getSearchV2VersionMeta } from "@/lib/search/meta";
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
import { SEARCH_RESPONSE_VERSION } from "@/lib/search/search-response";
import {
  createQuerySnapshot,
  loadValidQuerySnapshot,
  QUERY_SNAPSHOT_MAX_LISTING_IDS,
  toSnapshotResponseMeta,
  type SnapshotExpiredReason,
} from "@/lib/search/query-snapshots";
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
import { prisma } from "@/lib/prisma";
import {
  isListingEligibleForPublicSearch,
  resolvePublicAvailabilityForListings,
} from "@/lib/search/public-availability";
import type { FilterParams } from "@/lib/search-types";
import { isPhase04ProjectionReadsEnabled } from "@/lib/flags/phase04";
import { executeProjectionSearchV2 } from "@/lib/search/projection-search";
import type { SearchAdmissionError } from "@/lib/search/search-spec";

const VIBE_SOFT_FALLBACK_WARNING = "VIBE_SOFT_FALLBACK";
const SEARCH_PAGINATION_SNAPSHOT_VERSION = `${SEARCH_RESPONSE_VERSION}.searchdoc-keyset`;

function getEmptyMapResponse(): SearchV2Response["map"] {
  return {
    geojson: {
      type: "FeatureCollection",
      features: [],
    },
  };
}

function getSnapshotMapMode(mapPayload: SearchV2Response["map"]): "geojson" | "pins" {
  return mapPayload.pins ? "pins" : "geojson";
}

function buildSnapshotExpired(
  queryHash: string,
  reason: SnapshotExpiredReason
): NonNullable<SearchV2Result["snapshotExpired"]> {
  return { queryHash, reason };
}

function createSnapshotPageCursor(input: {
  snapshotId: string;
  offset: number;
  limit: number;
  queryHash: string;
}): string {
  return encodeSnapshotCursor({
    v: 3,
    snapshotId: input.snapshotId,
    offset: input.offset,
    limit: input.limit,
    queryHash: input.queryHash,
    responseVersion: SEARCH_RESPONSE_VERSION,
  });
}

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

interface SemanticListingAvailabilityRow {
  id: string;
  availabilitySource: "LEGACY_BOOKING" | "HOST_MANAGED" | null;
  status: string | null;
  statusReason: string | null;
  needsMigrationReview: boolean | null;
  totalSlots: number | null;
  availableSlots: number | null;
  openSlots: number | null;
  moveInDate: Date | null;
  availableUntil: Date | null;
  minStayMonths: number | null;
  lastConfirmedAt: Date | null;
}

async function resolveEligibleSemanticItems(
  items: ListingData[],
  filterParams: Pick<FilterParams, "moveInDate" | "endDate" | "minAvailableSlots">
): Promise<ListingData[]> {
  if (items.length === 0) {
    return [];
  }

  const listingRows = await prisma.listing.findMany({
    where: { id: { in: items.map((item) => item.id) } },
    select: {
      id: true,
      availabilitySource: true,
      status: true,
      statusReason: true,
      needsMigrationReview: true,
      totalSlots: true,
      availableSlots: true,
      openSlots: true,
      moveInDate: true,
      availableUntil: true,
      minStayMonths: true,
      lastConfirmedAt: true,
    },
  });
  const listingRowsById = new Map<string, SemanticListingAvailabilityRow>(
    listingRows.map((listing) => [listing.id, listing])
  );
  const legacyIds = listingRows
    .filter((listing) => listing.availabilitySource === "LEGACY_BOOKING")
    .map((listing) => listing.id);
  const availabilityByListing =
    legacyIds.length > 0
      ? await getAvailabilityForListings(legacyIds, {
          startDate: parseDateParam(filterParams.moveInDate),
          endDate: parseDateParam(filterParams.endDate),
        })
      : new Map();
  const resolvedAvailabilityByListing = resolvePublicAvailabilityForListings(
    items.map((item) => ({
      ...item,
      ...(listingRowsById.get(item.id) ?? {}),
    })),
    {
      legacyAvailabilityByListing: availabilityByListing,
    }
  );
  const requiredSlots = Math.max(filterParams.minAvailableSlots ?? 1, 1);

  return items
    .map((item) => {
      const resolvedAvailability = resolvedAvailabilityByListing.get(item.id);
      return resolvedAvailability
        ? {
            ...item,
            availabilitySource: resolvedAvailability.availabilitySource,
            availableSlots: resolvedAvailability.effectiveAvailableSlots,
            totalSlots: resolvedAvailability.totalSlots,
            openSlots: resolvedAvailability.openSlots,
            availableUntil: resolvedAvailability.availableUntil
              ? new Date(`${resolvedAvailability.availableUntil}T00:00:00.000Z`)
              : null,
            minStayMonths: resolvedAvailability.minStayMonths,
            lastConfirmedAt: resolvedAvailability.lastConfirmedAt
              ? new Date(resolvedAvailability.lastConfirmedAt)
              : null,
            status: listingRowsById.get(item.id)?.status ?? undefined,
            statusReason:
              listingRowsById.get(item.id)?.statusReason ?? undefined,
            publicAvailability: resolvedAvailability,
          }
        : item;
    })
    .filter((item) => {
      const resolvedAvailability = resolvedAvailabilityByListing.get(item.id);
      const listingRow = listingRowsById.get(item.id);

      return Boolean(
        listingRow &&
          resolvedAvailability &&
          isListingEligibleForPublicSearch({
            needsMigrationReview: listingRow?.needsMigrationReview,
            statusReason: listingRow?.statusReason,
            resolvedAvailability,
          }) &&
          item.availableSlots >= requiredSlots
      );
    });
}

async function getSemanticEligibleListPage(
  filterParams: FilterParams,
  page: number,
  pageSize: number
): Promise<PaginatedResultHybrid<ListingData> | null> {
  const pageOffset = (page - 1) * pageSize;
  const requiredEligibleCount = pageOffset + pageSize + 1;
  const rawBatchSize = pageSize + 1;
  const eligibleItems: ListingData[] = [];
  const seenListingIds = new Set<string>();
  let rawOffset = 0;
  let sawSemanticRows = false;

  while (eligibleItems.length < requiredEligibleCount) {
    const semanticRows = await semanticSearchQuery(
      {
        ...filterParams,
        minAvailableSlots: 0,
      },
      rawBatchSize,
      rawOffset
    );

    if (semanticRows === null) {
      break;
    }

    sawSemanticRows = true;

    const batchItems = mapSemanticRowsToListingData(semanticRows).filter((item) => {
      if (seenListingIds.has(item.id)) {
        return false;
      }

      seenListingIds.add(item.id);
      return true;
    });

    eligibleItems.push(
      ...(await resolveEligibleSemanticItems(batchItems, filterParams))
    );

    rawOffset += rawBatchSize;
  }

  if (!sawSemanticRows || eligibleItems.length === 0) {
    return null;
  }

  const hasNextPage = eligibleItems.length > pageOffset + pageSize;
  const items = eligibleItems.slice(pageOffset, pageOffset + pageSize);
  const total = hasNextPage ? null : eligibleItems.length;

  return {
    items,
    total,
    page,
    limit: pageSize,
    totalPages: hasNextPage || total === null ? null : Math.ceil(total / pageSize),
    hasNextPage,
    nextCursor: hasNextPage ? encodeCursor(page + 1) : null,
  };
}

async function collectSnapshotListingIds(options: {
  filterParams: FilterParams;
  useSearchDoc: boolean;
  useKeyset: boolean;
  vibeQuery?: string;
  shouldUseRecommendedVibeRanking: boolean;
  keysetSnapshot?: {
    engine: "searchdoc-keyset";
    responseVersion: string;
    projectionVersion: number;
    embeddingVersion: string | null;
  };
}): Promise<string[]> {
  const snapshotFilterParams = {
    ...options.filterParams,
    page: 1,
    limit: QUERY_SNAPSHOT_MAX_LISTING_IDS,
  };

  if (
    features.semanticSearch &&
    options.vibeQuery &&
    options.vibeQuery.length >= 3 &&
    options.shouldUseRecommendedVibeRanking
  ) {
    const semanticResult = await getSemanticEligibleListPage(
      snapshotFilterParams,
      1,
      QUERY_SNAPSHOT_MAX_LISTING_IDS
    );
    if (semanticResult) {
      return semanticResult.items.map((item) => item.id);
    }
  }

  if (options.useKeyset) {
    const result = await getSearchDocListingsFirstPage(
      snapshotFilterParams,
      options.keysetSnapshot
    );
    return result.items.map((item) => item.id);
  }

  if (options.useSearchDoc) {
    const result = await getSearchDocListingsPaginated(snapshotFilterParams);
    return result.items.map((item) => item.id);
  }

  const result = await getListingsPaginated(snapshotFilterParams);
  return result.items.map((item) => item.id);
}

async function hydrateSnapshotPage(options: {
  cursor: SnapshotCursor;
  queryHash: string;
  includeMap: boolean;
}): Promise<SearchV2Result> {
  if (options.cursor.v !== 3) {
    return {
      response: null,
      paginatedResult: null,
      snapshotExpired: buildSnapshotExpired(
        options.queryHash,
        "search_contract_changed"
      ),
    };
  }

  if (
    options.cursor.queryHash !== options.queryHash ||
    options.cursor.responseVersion !== SEARCH_RESPONSE_VERSION
  ) {
    return {
      response: null,
      paginatedResult: null,
      snapshotExpired: buildSnapshotExpired(
        options.queryHash,
        "search_contract_changed"
      ),
    };
  }

  const snapshotResult = await loadValidQuerySnapshot(options.cursor.snapshotId);
  if (!snapshotResult.ok) {
    return {
      response: null,
      paginatedResult: null,
      snapshotExpired: buildSnapshotExpired(options.queryHash, snapshotResult.reason),
    };
  }

  const snapshot = snapshotResult.snapshot;
  const sliceStart = options.cursor.offset;
  const sliceEnd = sliceStart + options.cursor.limit;
  const listingIds = snapshot.orderedListingIds.slice(sliceStart, sliceEnd);
  const items = await getSearchDocListingsByIds(listingIds);
  const nextOffset = sliceStart + listingIds.length;
  const hasNextPage = nextOffset < snapshot.orderedListingIds.length;
  const nextCursor = hasNextPage
    ? createSnapshotPageCursor({
        snapshotId: snapshot.id,
        offset: nextOffset,
        limit: options.cursor.limit,
        queryHash: snapshot.queryHash,
      })
    : null;
  const mapPayload =
    options.includeMap && snapshot.mapPayload
      ? (snapshot.mapPayload as unknown as SearchV2Response["map"])
      : getEmptyMapResponse();
  const total = snapshot.total ?? null;

  return {
    response: {
      meta: {
        ...toSnapshotResponseMeta(snapshot),
        generatedAt: new Date().toISOString(),
        mode: getSnapshotMapMode(mapPayload),
      },
      list: {
        items: transformToListItems(items),
        fullItems: items,
        nextCursor,
        total,
      },
      map: mapPayload,
    },
    paginatedResult: {
      items,
      total,
      page: null,
      limit: options.cursor.limit,
      totalPages:
        total !== null ? Math.ceil(total / options.cursor.limit) : null,
      hasNextPage,
      hasPrevPage: sliceStart > 0,
      nextCursor,
    },
  };
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
  /** Structured admission error for pathological requests. */
  admissionError?: SearchAdmissionError;
  /** The cursor's pinned search snapshot no longer matches current server state. */
  snapshotExpired?: {
    queryHash: string;
    reason: SnapshotExpiredReason;
  };
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

    if (isPhase04ProjectionReadsEnabled()) {
      return executeProjectionSearchV2({ params, parsed });
    }

    // Check if features are enabled
    const useSearchDoc = isSearchDocEnabled(
      getFirstValue(params.rawParams.searchDoc)
    );
    const useKeyset = features.searchKeyset && useSearchDoc;
    const snapshotContractEnabled = features.searchSnapshotContract;
    const shouldIncludeMap = params.includeMap !== false;

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

    // Get sort option from parsed params (default to recommended)
    const sortOption: SortOption =
      (parsed.filterParams.sort as SortOption) || "recommended";
    const vibeQuery = parsed.filterParams.vibeQuery?.trim();
    const shouldUseRecommendedVibeRanking =
      Boolean(vibeQuery) && sortOption === "recommended";
    const rankerEnabled = isRankingEnabled(
      getFirstValue(params.rawParams.ranker)
    );
    const keysetSnapshot = useKeyset
      ? {
          engine: "searchdoc-keyset" as const,
          responseVersion: SEARCH_PAGINATION_SNAPSHOT_VERSION,
          projectionVersion: SEARCH_DOC_PROJECTION_VERSION,
          embeddingVersion: null,
        }
      : undefined;

    // Handle cursor-based pagination
    const cursorStr = getFirstValue(params.rawParams.cursor);
    let page = parsed.requestedPage;
    let keysetCursor: KeysetCursor | null = null;
    let snapshotCursor: SnapshotCursor | null = null;

    if (cursorStr) {
      const decoded = decodeCursorAny(cursorStr, sortOption);
      if (decoded?.type === "snapshot") {
        snapshotCursor = decoded.cursor;
      } else if (useKeyset && decoded?.type === "keyset") {
        if (
          keysetSnapshot &&
          decoded.cursor.v === 2 &&
          (decoded.cursor.snapshot.engine !== keysetSnapshot.engine ||
            decoded.cursor.snapshot.responseVersion !==
              keysetSnapshot.responseVersion ||
            decoded.cursor.snapshot.projectionVersion !==
              keysetSnapshot.projectionVersion ||
            decoded.cursor.snapshot.embeddingVersion !==
              keysetSnapshot.embeddingVersion)
        ) {
          return {
            response: null,
            paginatedResult: null,
            snapshotExpired: buildSnapshotExpired(
              queryHash,
              "search_contract_changed"
            ),
          };
        }
        keysetCursor = decoded.cursor;
      } else if (decoded?.type === "legacy") {
        // Clamp to prevent unbounded OFFSET from crafted cursors.
        page = Math.min(decoded.page, 100);
      } else if (!useKeyset) {
        const decodedPage = decodeCursor(cursorStr);
        if (decodedPage !== null) {
          page = decodedPage;
        }
      }
    }

    // Build filter params with page and limit
    const filterParams = {
      ...parsed.filterParams,
      page,
      ...(params.limit && { limit: params.limit }),
    };

    if (snapshotContractEnabled && snapshotCursor) {
      return hydrateSnapshotPage({
        cursor: snapshotCursor,
        queryHash,
        includeMap: shouldIncludeMap,
      });
    }

    // TTFB optimization: Execute list and map queries in parallel
    // These are independent database queries that don't depend on each other
    const listPromise = (async (): Promise<{
      listResult: PaginatedResultHybrid<ListingData>;
      nextCursor: string | null;
      usedSoftVibeFallback: boolean;
      usedSemanticSearch: boolean;
    }> => {
      const finalizeListResult = (
        listResult: PaginatedResultHybrid<ListingData>,
        nextCursor: string | null,
        usedSemanticSearch: boolean = false
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
          usedSemanticSearch,
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
        const semanticResult = await getSemanticEligibleListPage(
          filterParams,
          page,
          pageSize
        );

        if (semanticResult) {
          return {
            listResult: semanticResult,
            nextCursor: semanticResult.nextCursor ?? null,
            usedSoftVibeFallback: false,
            usedSemanticSearch: true,
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
            keysetCursor,
            keysetSnapshot
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
            await getSearchDocListingsFirstPage(
              filterParams,
              keysetSnapshot
            );
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
    let usedSemanticSearch = false;
    let mapListings: MapListingData[];
    let mapTruncated: boolean | undefined;
    let mapTotalCandidates: number | undefined;
    const warnings: string[] = [];

    if (listSettled.status === "fulfilled") {
      ({
        listResult,
        nextCursor,
        usedSoftVibeFallback,
        usedSemanticSearch,
      } = listSettled.value);
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
    const versionMeta = getSearchV2VersionMeta({
      useSearchDoc,
      usedSemanticSearch,
      rankerEnabled,
    });

    // Transform list items
    const listItems = transformToListItems(listResult.items);

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

    let responseMetaBase: import("@/lib/search/search-response").SearchResponseMeta = {
      queryHash,
      backendSource: "v2",
      responseVersion: SEARCH_RESPONSE_VERSION,
      ...versionMeta,
    };
    let listNextCursor = nextCursor;

    if (snapshotContractEnabled && !snapshotCursor && !keysetCursor) {
      const orderedListingIds = await collectSnapshotListingIds({
        filterParams,
        useSearchDoc,
        useKeyset,
        vibeQuery,
        shouldUseRecommendedVibeRanking,
        keysetSnapshot,
      });
      const querySnapshot = await createQuerySnapshot({
        queryHash,
        backendSource: "v2",
        responseVersion: SEARCH_RESPONSE_VERSION,
        projectionVersion: versionMeta.projectionVersion,
        embeddingVersion: versionMeta.embeddingVersion,
        rankerProfileVersion: versionMeta.rankerProfileVersion,
        orderedListingIds,
        mapPayload: shouldIncludeMap ? mapResponse : null,
        total: listResult.total,
      });
      responseMetaBase = toSnapshotResponseMeta(querySnapshot);

      const pageLimit = filterParams.limit || DEFAULT_PAGE_SIZE;
      const alreadyConsumed = (page - 1) * pageLimit + listResult.items.length;
      listNextCursor =
        alreadyConsumed < orderedListingIds.length
          ? createSnapshotPageCursor({
              snapshotId: querySnapshot.id,
              offset: alreadyConsumed,
              limit: pageLimit,
              queryHash,
            })
          : null;
    }

    // Build response
    const response: SearchV2Response = {
      meta: {
        queryHash: responseMetaBase.queryHash,
        ...(responseMetaBase.querySnapshotId
          ? { querySnapshotId: responseMetaBase.querySnapshotId }
          : {}),
        generatedAt: new Date().toISOString(),
        mode,
        ...(responseMetaBase.projectionVersion !== undefined
          ? { projectionVersion: responseMetaBase.projectionVersion }
          : {}),
        ...(responseMetaBase.embeddingVersion
          ? { embeddingVersion: responseMetaBase.embeddingVersion }
          : {}),
        ...(responseMetaBase.rankerProfileVersion
          ? { rankerProfileVersion: responseMetaBase.rankerProfileVersion }
          : {}),
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
        fullItems: listResult.items,
        nextCursor: listNextCursor,
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

    return {
      response,
      paginatedResult: { ...listResult, nextCursor: listNextCursor },
    };
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
