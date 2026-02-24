/**
 * search-v2-service test suite
 *
 * Tests the core executeSearchV2() orchestration function which:
 * - Runs list + map queries in parallel
 * - Handles partial failures (map timeout, list failure)
 * - Applies ranking when feature flag is enabled
 * - Supports pagination cursors
 * - Logs search_latency metrics
 * - Determines geojson vs pins mode from map count
 */

// ============================================================================
// Mocks — MUST be before imports for ESM compatibility
// ============================================================================

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    },
  },
}));

// Mock next/cache (used by search-doc-queries via unstable_cache)
jest.mock("next/cache", () => ({
  unstable_cache: jest.fn((fn: () => unknown) => fn),
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));

// Mock data layer
jest.mock("@/lib/data", () => ({
  getListingsPaginated: jest.fn(),
  getMapListings: jest.fn(),
  sanitizeSearchQuery: jest.fn((q: string) => q),
  isValidQuery: jest.fn(() => true),
  crossesAntimeridian: jest.fn(() => false),
}));

// Mock search-doc-queries
jest.mock("@/lib/search/search-doc-queries", () => ({
  isSearchDocEnabled: jest.fn(),
  getSearchDocListingsPaginated: jest.fn(),
  getSearchDocMapListings: jest.fn(),
  getSearchDocListingsWithKeyset: jest.fn(),
  getSearchDocListingsFirstPage: jest.fn(),
  MAX_UNBOUNDED_RESULTS: 48,
}));

// Mock ranking module
jest.mock("@/lib/search/ranking", () => ({
  isRankingEnabled: jest.fn(),
  buildScoreMap: jest.fn(),
  computeMedianPrice: jest.fn(),
  getBoundsCenter: jest.fn(),
  getDebugSignals: jest.fn(),
  RANKING_VERSION: "v1-heuristic",
}));

// Mock transform module
jest.mock("@/lib/search/transform", () => ({
  transformToListItems: jest.fn(),
  transformToMapResponse: jest.fn(),
  determineMode: jest.fn(),
  shouldIncludePins: jest.fn(),
}));

// Mock hash module
jest.mock("@/lib/search/hash", () => ({
  generateQueryHash: jest.fn(),
  encodeCursor: jest.fn(),
  decodeCursor: jest.fn(),
  decodeCursorAny: jest.fn(),
}));

// Mock search-params
jest.mock("@/lib/search-params", () => ({
  parseSearchParams: jest.fn(),
}));

// Mock validation
jest.mock("@/lib/validation", () => ({
  clampBoundsToMaxSpan: jest.fn(),
  MAX_LAT_SPAN: 10,
  MAX_LNG_SPAN: 10,
}));

// Mock env
jest.mock("@/lib/env", () => ({
  features: {
    searchKeyset: false,
    searchRanking: false,
    searchDebugRanking: false,
    searchDoc: false,
  },
  CURSOR_SECRET: "",
}));

// Mock timeout-wrapper to pass through promises directly
jest.mock("@/lib/timeout-wrapper", () => ({
  withTimeout: jest.fn(
    <T,>(promise: Promise<T>) => promise,
  ),
  DEFAULT_TIMEOUTS: {
    DATABASE: 10000,
    LLM_STREAM: 30000,
    REDIS: 1000,
    EXTERNAL_API: 5000,
    EMAIL: 15000,
  },
}));

// ============================================================================
// Imports — AFTER mocks
// ============================================================================

import { executeSearchV2 } from "@/lib/search/search-v2-service";
import { getListingsPaginated, getMapListings } from "@/lib/data";
import {
  isSearchDocEnabled,
  getSearchDocListingsPaginated,
  getSearchDocMapListings,
  getSearchDocListingsWithKeyset,
  getSearchDocListingsFirstPage,
} from "@/lib/search/search-doc-queries";
import {
  isRankingEnabled,
  buildScoreMap,
  computeMedianPrice,
  getBoundsCenter,
  getDebugSignals,
} from "@/lib/search/ranking";
import {
  transformToListItems,
  transformToMapResponse,
  determineMode,
  shouldIncludePins,
} from "@/lib/search/transform";
import {
  generateQueryHash,
  encodeCursor,
  decodeCursor,
  decodeCursorAny,
} from "@/lib/search/hash";
import { parseSearchParams } from "@/lib/search-params";
import { clampBoundsToMaxSpan } from "@/lib/validation";
import { features } from "@/lib/env";
import { logger } from "@/lib/logger";
import { withTimeout } from "@/lib/timeout-wrapper";
import type { ListingData, MapListingData } from "@/lib/data";

// ============================================================================
// Cast mocks for type-safe access
// ============================================================================

const mockGetListingsPaginated = getListingsPaginated as jest.MockedFunction<
  typeof getListingsPaginated
>;
const mockGetMapListings = getMapListings as jest.MockedFunction<
  typeof getMapListings
>;
const mockIsSearchDocEnabled = isSearchDocEnabled as jest.MockedFunction<
  typeof isSearchDocEnabled
>;
const mockGetSearchDocListingsPaginated =
  getSearchDocListingsPaginated as jest.MockedFunction<
    typeof getSearchDocListingsPaginated
  >;
const mockGetSearchDocMapListings =
  getSearchDocMapListings as jest.MockedFunction<
    typeof getSearchDocMapListings
  >;
const mockGetSearchDocListingsWithKeyset =
  getSearchDocListingsWithKeyset as jest.MockedFunction<
    typeof getSearchDocListingsWithKeyset
  >;
const mockGetSearchDocListingsFirstPage =
  getSearchDocListingsFirstPage as jest.MockedFunction<
    typeof getSearchDocListingsFirstPage
  >;
const mockIsRankingEnabled = isRankingEnabled as jest.MockedFunction<
  typeof isRankingEnabled
>;
const mockBuildScoreMap = buildScoreMap as jest.MockedFunction<
  typeof buildScoreMap
>;
const mockComputeMedianPrice = computeMedianPrice as jest.MockedFunction<
  typeof computeMedianPrice
>;
const mockGetBoundsCenter = getBoundsCenter as jest.MockedFunction<
  typeof getBoundsCenter
>;
const mockGetDebugSignals = getDebugSignals as jest.MockedFunction<
  typeof getDebugSignals
>;
const mockTransformToListItems = transformToListItems as jest.MockedFunction<
  typeof transformToListItems
>;
const mockTransformToMapResponse =
  transformToMapResponse as jest.MockedFunction<typeof transformToMapResponse>;
const mockDetermineMode = determineMode as jest.MockedFunction<
  typeof determineMode
>;
const mockShouldIncludePins = shouldIncludePins as jest.MockedFunction<
  typeof shouldIncludePins
>;
const mockGenerateQueryHash = generateQueryHash as jest.MockedFunction<
  typeof generateQueryHash
>;
const mockEncodeCursor = encodeCursor as jest.MockedFunction<
  typeof encodeCursor
>;
const mockDecodeCursor = decodeCursor as jest.MockedFunction<
  typeof decodeCursor
>;
const mockDecodeCursorAny = decodeCursorAny as jest.MockedFunction<
  typeof decodeCursorAny
>;
const mockParseSearchParams = parseSearchParams as jest.MockedFunction<
  typeof parseSearchParams
>;
const mockClampBoundsToMaxSpan = clampBoundsToMaxSpan as jest.MockedFunction<
  typeof clampBoundsToMaxSpan
>;
const mockWithTimeout = withTimeout as jest.MockedFunction<typeof withTimeout>;

// ============================================================================
// Shared test fixtures
// ============================================================================

const BOUNDS = {
  minLat: 37.7,
  maxLat: 37.85,
  minLng: -122.52,
  maxLng: -122.35,
};

function makeListingData(overrides: Partial<ListingData> = {}): ListingData {
  return {
    id: "listing-1",
    title: "Test Listing",
    description: "A test listing",
    price: 1500,
    images: ["img1.jpg"],
    availableSlots: 1,
    totalSlots: 2,
    amenities: [],
    houseRules: [],
    householdLanguages: [],
    location: {
      city: "San Francisco",
      state: "CA",
      lat: 37.77,
      lng: -122.42,
    },
    ...overrides,
  };
}

function makeMapListingData(
  overrides: Partial<MapListingData> = {},
): MapListingData {
  return {
    id: "map-listing-1",
    title: "Map Listing",
    price: 1500,
    availableSlots: 1,

    images: ["img1.jpg"],
    location: { lat: 37.77, lng: -122.42 },
    ...overrides,
  };
}

function defaultParsedSearchParams(
  overrides: Partial<{
    boundsRequired: boolean;
    filterParams: Record<string, unknown>;
    requestedPage: number;
  }> = {},
) {
  return {
    q: undefined,
    requestedPage: overrides.requestedPage ?? 1,
    sortOption: "recommended" as const,
    filterParams: {
      bounds: BOUNDS,
      ...(overrides.filterParams ?? {}),
    },
    boundsRequired: overrides.boundsRequired ?? false,
    browseMode: false,
  };
}

/** Set up the standard "happy path" mocks for a basic search */
function setupDefaultMocks({
  listItems = [makeListingData()],
  mapListings = [makeMapListingData()],
  mode = "pins" as const,
  useSearchDoc = false,
}: {
  listItems?: ListingData[];
  mapListings?: MapListingData[];
  mode?: "geojson" | "pins";
  useSearchDoc?: boolean;
} = {}) {
  mockParseSearchParams.mockReturnValue(defaultParsedSearchParams());
  mockIsSearchDocEnabled.mockReturnValue(useSearchDoc);
  mockIsRankingEnabled.mockReturnValue(false);

  // Legacy path (non-searchDoc)
  mockGetListingsPaginated.mockResolvedValue({
    items: listItems,
    total: listItems.length,
    page: 1,
    limit: 12,
    totalPages: 1,
  });
  mockGetMapListings.mockResolvedValue(mapListings);

  // SearchDoc path
  mockGetSearchDocListingsPaginated.mockResolvedValue({
    items: listItems,
    total: listItems.length,
    page: 1,
    limit: 12,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  mockGetSearchDocMapListings.mockResolvedValue({
    listings: mapListings,
    truncated: false,
  });
  mockGetSearchDocListingsFirstPage.mockResolvedValue({
    items: listItems,
    total: listItems.length,
    page: 1,
    limit: 12,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
    nextCursor: null,
  });

  mockDetermineMode.mockReturnValue(mode);
  mockShouldIncludePins.mockReturnValue(mode === "pins");
  mockGenerateQueryHash.mockReturnValue("abcdef1234567890");
  mockTransformToListItems.mockReturnValue(
    listItems.map((l) => ({
      id: l.id,
      title: l.title,
      price: l.price,
      image: l.images[0] ?? null,
      lat: l.location.lat,
      lng: l.location.lng,
    })),
  );
  mockTransformToMapResponse.mockReturnValue({
    geojson: { type: "FeatureCollection", features: [] },
    pins: mapListings.map((m) => ({
      id: m.id,
      lat: m.location.lat,
      lng: m.location.lng,
      price: m.price,
    })),
  });
  mockEncodeCursor.mockReturnValue("cursor-page-2");
}

// ============================================================================
// Tests
// ============================================================================

describe("search-v2-service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset features to defaults
    (features as Record<string, unknown>).searchKeyset = false;
    (features as Record<string, unknown>).searchRanking = false;
    (features as Record<string, unknown>).searchDebugRanking = false;
  });

  describe("executeSearchV2", () => {
    it("returns paginated list results and map data", async () => {
      const listItems = [makeListingData({ id: "l-1" })];
      const mapItems = [makeMapListingData({ id: "m-1" })];
      setupDefaultMocks({ listItems, mapListings: mapItems });

      const result = await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
        },
      });

      // Should succeed with response and paginatedResult
      expect(result.response).not.toBeNull();
      expect(result.paginatedResult).not.toBeNull();
      expect(result.error).toBeUndefined();

      // Response structure checks
      expect(result.response!.meta.queryHash).toBe("abcdef1234567890");
      expect(result.response!.meta.mode).toBe("pins");
      expect(result.response!.list.items).toHaveLength(1);
      expect(result.response!.list.items[0].id).toBe("l-1");
      expect(result.response!.list.total).toBe(1);
      expect(result.response!.map).toBeDefined();

      // paginatedResult has the raw listing data
      expect(result.paginatedResult!.items).toHaveLength(1);
      expect(result.paginatedResult!.items[0].id).toBe("l-1");
    });

    it("handles map query timeout gracefully (returns list only)", async () => {
      setupDefaultMocks();

      // Make withTimeout reject for map query (second call) while passing for list
      let callCount = 0;
      mockWithTimeout.mockImplementation(<T,>(promise: Promise<T>) => {
        callCount++;
        if (callCount === 2) {
          // Map query times out
          return Promise.reject(new Error("search-map-query timed out"));
        }
        return promise;
      });

      const result = await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
        },
      });

      // Should still succeed (partial failure tolerance)
      expect(result.response).not.toBeNull();
      expect(result.paginatedResult).not.toBeNull();
      expect(result.error).toBeUndefined();

      // Map query failure is logged
      expect(logger.sync.error).toHaveBeenCalledWith(
        "[SearchV2] Map query failed",
        expect.objectContaining({
          error: expect.any(String),
        }),
      );

      // Response should have warnings about map failure (spread dynamically, not in TS type)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.response!.meta as any).warnings).toContain("MAP_QUERY_FAILED");
    });

    it("handles list query failure gracefully (returns empty)", async () => {
      setupDefaultMocks();

      // Make withTimeout reject for list query (first call)
      let callCount = 0;
      mockWithTimeout.mockImplementation(<T,>(_promise: Promise<T>) => {
        callCount++;
        if (callCount === 1) {
          // List query fails
          return Promise.reject(new Error("search-list-query timed out"));
        }
        return _promise;
      });

      const result = await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
        },
      });

      // When list query fails, return null response with error
      expect(result.response).toBeNull();
      expect(result.paginatedResult).toBeNull();
      expect(result.error).toBe("Search temporarily unavailable");

      // List query failure is logged
      expect(logger.sync.error).toHaveBeenCalledWith(
        "[SearchV2] List query failed",
        expect.objectContaining({
          error: expect.any(String),
        }),
      );
    });

    it("applies ranking when feature flag enabled", async () => {
      const mapItems = Array.from({ length: 10 }, (_, i) =>
        makeMapListingData({ id: `m-${i}` }),
      );
      setupDefaultMocks({ mapListings: mapItems });

      // Enable ranking
      mockIsRankingEnabled.mockReturnValue(true);
      mockShouldIncludePins.mockReturnValue(true);

      const mockScoreMap = new Map([["m-0", 0.9]]);
      mockBuildScoreMap.mockReturnValue(mockScoreMap);
      mockComputeMedianPrice.mockReturnValue(1500);
      mockGetBoundsCenter.mockReturnValue({ lat: 37.775, lng: -122.435 });

      const result = await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
        },
      });

      expect(result.response).not.toBeNull();

      // Ranking functions should have been called
      expect(mockBuildScoreMap).toHaveBeenCalled();
      expect(mockComputeMedianPrice).toHaveBeenCalled();
      expect(mockGetBoundsCenter).toHaveBeenCalled();

      // transformToMapResponse should receive scoreMap
      expect(mockTransformToMapResponse).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          scoreMap: mockScoreMap,
        }),
      );
    });

    it("skips ranking when feature flag disabled", async () => {
      setupDefaultMocks();
      mockIsRankingEnabled.mockReturnValue(false);

      const result = await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
        },
      });

      expect(result.response).not.toBeNull();

      // Ranking functions should NOT have been called
      expect(mockBuildScoreMap).not.toHaveBeenCalled();
      expect(mockComputeMedianPrice).not.toHaveBeenCalled();

      // transformToMapResponse should be called without scoreMap
      expect(mockTransformToMapResponse).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          scoreMap: undefined,
        }),
      );
    });

    it("logs search_latency metrics", async () => {
      setupDefaultMocks();

      await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
        },
      });

      expect(logger.sync.info).toHaveBeenCalledWith(
        "search_latency",
        expect.objectContaining({
          durationMs: expect.any(Number),
          listCount: expect.any(Number),
          mapCount: expect.any(Number),
          mode: expect.any(String),
          cached: false,
        }),
      );
    });

    it("respects pagination cursor (legacy offset)", async () => {
      setupDefaultMocks();
      mockIsSearchDocEnabled.mockReturnValue(false);

      // decodeCursor returns page 3 for the cursor token
      mockDecodeCursor.mockReturnValue(3);

      await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
          cursor: "some-cursor-token",
        },
      });

      // getListingsPaginated should have been called with page 3
      expect(mockGetListingsPaginated).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 3,
        }),
      );
    });

    it("returns geojson mode when mapCount >= CLUSTER_THRESHOLD", async () => {
      // Create 60 map listings (above CLUSTER_THRESHOLD of 50)
      const manyMapListings = Array.from({ length: 60 }, (_, i) =>
        makeMapListingData({ id: `m-${i}` }),
      );
      setupDefaultMocks({
        mapListings: manyMapListings,
        mode: "geojson",
      });
      mockShouldIncludePins.mockReturnValue(false);

      const result = await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
        },
      });

      expect(result.response).not.toBeNull();
      expect(result.response!.meta.mode).toBe("geojson");

      // determineMode should have been called with the map listings count
      expect(mockDetermineMode).toHaveBeenCalledWith(60);
    });

    it("returns unboundedSearch when boundsRequired is true", async () => {
      mockParseSearchParams.mockReturnValue(
        defaultParsedSearchParams({ boundsRequired: true }),
      );

      const result = await executeSearchV2({
        rawParams: { q: "test" },
      });

      expect(result.response).toBeNull();
      expect(result.paginatedResult).toBeNull();
      expect(result.unboundedSearch).toBe(true);
    });

    it("clamps oversized bounds before querying", async () => {
      const oversizedBounds = {
        minLat: 30,
        maxLat: 45,
        minLng: -130,
        maxLng: -110,
      };
      const clampedBounds = {
        minLat: 35,
        maxLat: 40,
        minLng: -125,
        maxLng: -120,
      };

      mockParseSearchParams.mockReturnValue(
        defaultParsedSearchParams({
          filterParams: { bounds: oversizedBounds },
        }),
      );
      mockClampBoundsToMaxSpan.mockReturnValue(clampedBounds);

      // Set up remaining mocks
      mockIsSearchDocEnabled.mockReturnValue(false);
      mockIsRankingEnabled.mockReturnValue(false);
      mockGetListingsPaginated.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 12,
        totalPages: 0,
      });
      mockGetMapListings.mockResolvedValue([]);
      mockDetermineMode.mockReturnValue("pins");
      mockShouldIncludePins.mockReturnValue(true);
      mockGenerateQueryHash.mockReturnValue("hash123");
      mockTransformToListItems.mockReturnValue([]);
      mockTransformToMapResponse.mockReturnValue({
        geojson: { type: "FeatureCollection", features: [] },
        pins: [],
      });

      await executeSearchV2({
        rawParams: {
          minLat: "30",
          maxLat: "45",
          minLng: "-130",
          maxLng: "-110",
        },
      });

      // clampBoundsToMaxSpan should have been called
      expect(mockClampBoundsToMaxSpan).toHaveBeenCalledWith(oversizedBounds);
    });

    it("uses SearchDoc path when enabled", async () => {
      setupDefaultMocks({ useSearchDoc: true });
      mockIsSearchDocEnabled.mockReturnValue(true);

      await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
        },
      });

      // Should use SearchDoc functions, not legacy
      expect(mockGetSearchDocListingsPaginated).toHaveBeenCalled();
      expect(mockGetSearchDocMapListings).toHaveBeenCalled();
      expect(mockGetListingsPaginated).not.toHaveBeenCalled();
      expect(mockGetMapListings).not.toHaveBeenCalled();
    });

    it("uses legacy path when SearchDoc disabled", async () => {
      setupDefaultMocks({ useSearchDoc: false });

      await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
        },
      });

      // Should use legacy functions, not SearchDoc
      expect(mockGetListingsPaginated).toHaveBeenCalled();
      expect(mockGetMapListings).toHaveBeenCalled();
      expect(mockGetSearchDocListingsPaginated).not.toHaveBeenCalled();
      expect(mockGetSearchDocMapListings).not.toHaveBeenCalled();
    });

    it("returns error on unexpected exception", async () => {
      mockParseSearchParams.mockImplementation(() => {
        throw new Error("Unexpected parse error");
      });

      const result = await executeSearchV2({
        rawParams: { q: "test" },
      });

      expect(result.response).toBeNull();
      expect(result.paginatedResult).toBeNull();
      expect(result.error).toBe("Failed to fetch search results");
      expect(logger.sync.error).toHaveBeenCalledWith(
        "SearchV2 service error",
        expect.objectContaining({
          action: "executeSearchV2",
          error: "Unexpected parse error",
        }),
      );
    });

    it("includes debug signals when debugRank=1 and ranking enabled", async () => {
      const mapItems = Array.from({ length: 5 }, (_, i) =>
        makeMapListingData({ id: `m-${i}` }),
      );
      setupDefaultMocks({ mapListings: mapItems });

      // Enable ranking and debug
      (features as Record<string, unknown>).searchDebugRanking = true;
      mockIsRankingEnabled.mockReturnValue(true);
      mockShouldIncludePins.mockReturnValue(true);

      const mockScoreMap = new Map([["m-0", 0.9]]);
      mockBuildScoreMap.mockReturnValue(mockScoreMap);
      mockComputeMedianPrice.mockReturnValue(1500);
      mockGetBoundsCenter.mockReturnValue({ lat: 37.775, lng: -122.435 });

      const debugSignals = [
        { id: "m-0", quality: 0.8, rating: 0.7, price: 0.9, recency: 0.5, geo: 0.6, total: 0.9 },
      ];
      mockGetDebugSignals.mockReturnValue(debugSignals);

      const result = await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
          ranker: "1",
          debugRank: "1",
        },
      });

      expect(result.response).not.toBeNull();
      expect(result.response!.meta.rankingVersion).toBe("v1-heuristic");
      expect(result.response!.meta.rankingEnabled).toBe(true);
      expect(result.response!.meta.topSignals).toEqual(debugSignals);
      expect(mockGetDebugSignals).toHaveBeenCalled();
    });

    it("handles SearchDoc map result with truncated flag", async () => {
      setupDefaultMocks({ useSearchDoc: true });
      mockIsSearchDocEnabled.mockReturnValue(true);

      // SearchDoc map returns truncated result
      mockGetSearchDocMapListings.mockResolvedValue({
        listings: [makeMapListingData()],
        truncated: true,
        totalCandidates: 500,
      });

      const result = await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
        },
      });

      expect(result.response).not.toBeNull();

      // transformToMapResponse should receive truncation info
      expect(mockTransformToMapResponse).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          truncated: true,
          totalCandidates: 500,
        }),
      );
    });

    it("generates nextCursor for legacy path with more pages", async () => {
      setupDefaultMocks({ useSearchDoc: false });
      mockIsSearchDocEnabled.mockReturnValue(false);

      // Multiple pages
      mockGetListingsPaginated.mockResolvedValue({
        items: [makeListingData()],
        total: 36,
        page: 1,
        limit: 12,
        totalPages: 3,
      });
      mockEncodeCursor.mockReturnValue("cursor-for-page-2");

      const result = await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
        },
      });

      expect(result.response).not.toBeNull();
      expect(result.response!.list.nextCursor).toBe("cursor-for-page-2");
      expect(mockEncodeCursor).toHaveBeenCalledWith(2);
    });

    it("returns null nextCursor on last page", async () => {
      setupDefaultMocks({ useSearchDoc: false });
      mockIsSearchDocEnabled.mockReturnValue(false);

      // Last page
      mockGetListingsPaginated.mockResolvedValue({
        items: [makeListingData()],
        total: 12,
        page: 1,
        limit: 12,
        totalPages: 1,
      });

      const result = await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
        },
      });

      expect(result.response).not.toBeNull();
      expect(result.response!.list.nextCursor).toBeNull();
      expect(mockEncodeCursor).not.toHaveBeenCalled();
    });

    it("passes custom limit from params", async () => {
      setupDefaultMocks({ useSearchDoc: false });

      await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
        },
        limit: 24,
      });

      expect(mockGetListingsPaginated).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 24,
        }),
      );
    });

    it("skips ranking when shouldIncludePins returns false (geojson mode)", async () => {
      const manyMapListings = Array.from({ length: 60 }, (_, i) =>
        makeMapListingData({ id: `m-${i}` }),
      );
      setupDefaultMocks({ mapListings: manyMapListings, mode: "geojson" });

      mockIsRankingEnabled.mockReturnValue(true);
      mockShouldIncludePins.mockReturnValue(false);

      await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
        },
      });

      // Ranking should be skipped because shouldIncludePins is false
      expect(mockBuildScoreMap).not.toHaveBeenCalled();
    });

    it("uses keyset pagination when searchKeyset feature is on and SearchDoc enabled", async () => {
      (features as Record<string, unknown>).searchKeyset = true;
      setupDefaultMocks({ useSearchDoc: true });
      mockIsSearchDocEnabled.mockReturnValue(true);

      // No cursor provided - first page
      await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
        },
      });

      // Should use first-page keyset function
      expect(mockGetSearchDocListingsFirstPage).toHaveBeenCalled();
      expect(mockGetSearchDocListingsPaginated).not.toHaveBeenCalled();
    });

    it("decodes keyset cursor when searchKeyset is enabled", async () => {
      (features as Record<string, unknown>).searchKeyset = true;
      setupDefaultMocks({ useSearchDoc: true });
      mockIsSearchDocEnabled.mockReturnValue(true);

      const keysetCursor = { v: 1 as const, s: "newest" as const, k: ["1500"], id: "abc" };
      mockDecodeCursorAny.mockReturnValue({
        type: "keyset" as const,
        cursor: keysetCursor,
      });

      mockGetSearchDocListingsWithKeyset.mockResolvedValue({
        items: [makeListingData()],
        total: 10,
        page: 1,
        limit: 12,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
        nextCursor: null,
      });

      await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
          cursor: "keyset-cursor-token",
        },
      });

      expect(mockDecodeCursorAny).toHaveBeenCalledWith(
        "keyset-cursor-token",
        "recommended",
      );
      expect(mockGetSearchDocListingsWithKeyset).toHaveBeenCalledWith(
        expect.any(Object),
        keysetCursor,
      );
    });
  });
});
