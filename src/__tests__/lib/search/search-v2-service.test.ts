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
  sanitizeErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : "Unknown error"
  ),
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

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/availability", () => ({
  getAvailabilityForListings: jest.fn(),
}));

jest.mock("@/lib/embeddings/version", () => ({
  getCurrentEmbeddingVersion: jest.fn(() => "gemini-embedding-2-preview"),
}));

// Mock search-doc-queries
jest.mock("@/lib/search/search-doc-queries", () => ({
  isSearchDocEnabled: jest.fn(),
  getSearchDocListingsPaginated: jest.fn(),
  getSearchDocMapListings: jest.fn(),
  getSearchDocListingsWithKeyset: jest.fn(),
  getSearchDocListingsFirstPage: jest.fn(),
  semanticSearchQuery: jest.fn(),
  mapSemanticRowsToListingData: jest.fn(),
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
}));

// Mock env
jest.mock("@/lib/env", () => ({
  features: {
    searchKeyset: false,
    searchRanking: false,
    searchDebugRanking: false,
    searchDoc: false,
    semanticSearch: false,
  },
  CURSOR_SECRET: "",
}));

// Mock timeout-wrapper to pass through promises directly
jest.mock("@/lib/timeout-wrapper", () => ({
  withTimeout: jest.fn(<T>(promise: Promise<T>) => promise),
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
  semanticSearchQuery,
  mapSemanticRowsToListingData,
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
import { buildPublicAvailability } from "@/lib/search/public-availability";
import { SEARCH_DOC_PROJECTION_VERSION } from "@/lib/search/search-doc-sync";
import { prisma } from "@/lib/prisma";
import { getAvailabilityForListings } from "@/lib/availability";
import { getCurrentEmbeddingVersion } from "@/lib/embeddings/version";

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
const mockSemanticSearchQuery = semanticSearchQuery as jest.MockedFunction<
  typeof semanticSearchQuery
>;
const mockMapSemanticRowsToListingData =
  mapSemanticRowsToListingData as jest.MockedFunction<
    typeof mapSemanticRowsToListingData
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
const mockPrismaListingFindMany = prisma.listing.findMany as jest.MockedFunction<
  typeof prisma.listing.findMany
>;
const mockGetAvailabilityForListings =
  getAvailabilityForListings as jest.MockedFunction<
    typeof getAvailabilityForListings
  >;
const mockGetCurrentEmbeddingVersion =
  getCurrentEmbeddingVersion as jest.MockedFunction<
    typeof getCurrentEmbeddingVersion
  >;

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
  const listing = {
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

  return {
    ...listing,
    publicAvailability:
      overrides.publicAvailability ??
      buildPublicAvailability({
        availableSlots: listing.availableSlots,
        totalSlots: listing.totalSlots,
        moveInDate: listing.moveInDate,
      }),
  };
}

function makeMapListingData(
  overrides: Partial<MapListingData> = {}
): MapListingData {
  const listing = {
    id: "map-listing-1",
    title: "Map Listing",
    price: 1500,
    availableSlots: 1,
    totalSlots: 2,
    images: ["img1.jpg"],
    location: { lat: 37.77, lng: -122.42 },
    ...overrides,
  };

  return {
    ...listing,
    publicAvailability:
      overrides.publicAvailability ??
      buildPublicAvailability({
        availableSlots: listing.availableSlots,
        totalSlots: listing.totalSlots ?? listing.availableSlots,
        moveInDate: listing.moveInDate,
      }),
  };
}

function defaultParsedSearchParams(
  overrides: Partial<{
    boundsRequired: boolean;
    filterParams: Record<string, unknown>;
    requestedPage: number;
  }> = {}
) {
  return {
    q: undefined,
    what: undefined,
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
  mockSemanticSearchQuery.mockResolvedValue(null);
  mockMapSemanticRowsToListingData.mockImplementation((rows) => rows as never);
  (mockPrismaListingFindMany as unknown as jest.Mock).mockImplementation(
    async (args?: { where?: { id?: { in?: string[] } } }) => {
      const ids = args?.where?.id?.in ?? [];
      return ids.map((id) => ({
        id,
        availabilitySource: "LEGACY_BOOKING" as const,
        status: "ACTIVE",
        statusReason: null,
        totalSlots: 2,
        availableSlots: 1,
        openSlots: null,
        moveInDate: null,
        availableUntil: null,
        minStayMonths: 1,
        lastConfirmedAt: null,
      }));
    }
  );
  mockGetAvailabilityForListings.mockResolvedValue(new Map());
  mockGetCurrentEmbeddingVersion.mockReturnValue(
    "gemini-embedding-2-preview"
  );
  mockTransformToListItems.mockImplementation((items) =>
    items.map((l) => ({
      id: l.id,
      title: l.title,
      price: l.price,
      image: l.images[0] ?? null,
      lat: l.location.lat,
      lng: l.location.lng,
      availableSlots: l.availableSlots,
      totalSlots: l.totalSlots,
      publicAvailability: l.publicAvailability,
    }))
  );
  mockTransformToMapResponse.mockReturnValue({
    geojson: { type: "FeatureCollection", features: [] },
    pins: mapListings.map((m) => ({
      id: m.id,
      lat: m.location.lat,
      lng: m.location.lng,
      price: m.price,
      publicAvailability: m.publicAvailability,
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
    (features as Record<string, unknown>).semanticSearch = false;
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
      expect(result.response!.meta.projectionVersion).toBeUndefined();
      expect(result.response!.meta.embeddingVersion).toBeUndefined();
      expect(result.response!.list.items).toHaveLength(1);
      expect(result.response!.list.items[0].id).toBe("l-1");
      expect(result.response!.list.items[0].publicAvailability).toEqual(
        buildPublicAvailability({
          availableSlots: 1,
          totalSlots: 2,
        })
      );
      expect(result.response!.list.total).toBe(1);
      expect(result.response!.map).toBeDefined();

      // paginatedResult has the raw listing data
      expect(result.paginatedResult!.items).toHaveLength(1);
      expect(result.paginatedResult!.items[0].id).toBe("l-1");
      expect(result.paginatedResult!.items[0].publicAvailability).toEqual(
        buildPublicAvailability({
          availableSlots: 1,
          totalSlots: 2,
        })
      );
    });

    it("preserves host-managed publicAvailability across list and map response surfaces", async () => {
      const hostManagedAvailability = buildPublicAvailability({
        availabilitySource: "HOST_MANAGED",
        openSlots: 2,
        totalSlots: 4,
        availableFrom: "2026-06-01",
        availableUntil: "2026-12-01",
        minStayMonths: 3,
        lastConfirmedAt: "2026-04-15T12:30:00.000Z",
      });
      const listItems = [
        makeListingData({
          id: "host-listing",
          availableSlots: 2,
          totalSlots: 4,
          availabilitySource: "HOST_MANAGED",
          openSlots: 2,
          availableUntil: new Date("2026-12-01T00:00:00.000Z"),
          minStayMonths: 3,
          lastConfirmedAt: new Date("2026-04-15T12:30:00.000Z"),
          publicAvailability: hostManagedAvailability,
        }),
      ];
      const mapItems = [
        makeMapListingData({
          id: "host-listing",
          availableSlots: 2,
          totalSlots: 4,
          availabilitySource: "HOST_MANAGED",
          openSlots: 2,
          availableUntil: new Date("2026-12-01T00:00:00.000Z"),
          minStayMonths: 3,
          lastConfirmedAt: new Date("2026-04-15T12:30:00.000Z"),
          publicAvailability: hostManagedAvailability,
        }),
      ];
      setupDefaultMocks({ listItems, mapListings: mapItems });

      const result = await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
        },
      });

      expect(result.response?.list.items[0]?.publicAvailability).toEqual(
        hostManagedAvailability
      );
      expect(result.paginatedResult?.items[0]?.publicAvailability).toEqual(
        hostManagedAvailability
      );
      expect(result.response?.map.pins?.[0]?.publicAvailability).toEqual(
        hostManagedAvailability
      );
    });

    it("adds projectionVersion to meta when projection-backed search is active", async () => {
      setupDefaultMocks({ useSearchDoc: true });
      mockIsSearchDocEnabled.mockReturnValue(true);

      const result = await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
          searchDoc: "1",
        },
      });

      expect(result.response?.meta.projectionVersion).toBe(
        SEARCH_DOC_PROJECTION_VERSION
      );
      expect(result.response?.meta.embeddingVersion).toBeUndefined();
    });

    it("adds embeddingVersion to meta when semantic search powers the list response", async () => {
      (features as Record<string, unknown>).semanticSearch = true;
      setupDefaultMocks({ useSearchDoc: false });
      mockParseSearchParams.mockReturnValue(
        defaultParsedSearchParams({
          filterParams: {
            bounds: BOUNDS,
            vibeQuery: "bright airy loft",
          },
        })
      );

      mockSemanticSearchQuery.mockResolvedValue([
        {
          id: "semantic-1",
          title: "Semantic Listing",
          description: "Sunny shared home",
          price: 1800,
          images: ["semantic.jpg"],
          room_type: "private",
          lease_duration: "6_months",
          available_slots: 1,
          total_slots: 2,
          amenities: [],
          house_rules: [],
          household_languages: ["english"],
          primary_home_language: "english",
          gender_preference: "any",
          household_gender: "mixed",
          booking_mode: "shared",
          move_in_date: null,
          address: null,
          city: "San Francisco",
          state: "CA",
          zip: null,
          lat: 37.77,
          lng: -122.42,
          owner_id: "owner-1",
          avg_rating: 4.5,
          review_count: 10,
          view_count: 42,
          listing_created_at: new Date("2026-04-20T00:00:00.000Z"),
          recommended_score: 0.9,
          semantic_similarity: 0.88,
          keyword_rank: 0.2,
          combined_score: 0.61,
        },
      ] as never);
      mockMapSemanticRowsToListingData.mockReturnValue([
        makeListingData({
          id: "semantic-1",
          title: "Semantic Listing",
          price: 1800,
        }),
      ]);

      const result = await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
          vibeQuery: "bright airy loft",
        },
      });

      expect(result.response?.meta.projectionVersion).toBe(
        SEARCH_DOC_PROJECTION_VERSION
      );
      expect(result.response?.meta.embeddingVersion).toBe(
        "gemini-embedding-2-preview"
      );
      expect(result.response?.list.items[0]?.id).toBe("semantic-1");
      expect(mockGetListingsPaginated).not.toHaveBeenCalled();
      expect(mockGetCurrentEmbeddingVersion).toHaveBeenCalled();
    });

    it("uses vibeQuery for semantic ranking while preserving the location query", async () => {
      setupDefaultMocks();
      (features as Record<string, unknown>).semanticSearch = true;
      mockParseSearchParams.mockReturnValue(
        defaultParsedSearchParams({
          filterParams: {
            query: "Irving",
            vibeQuery: "quiet roommates",
            bounds: BOUNDS,
          },
        })
      );
      const semanticListing = makeListingData({ id: "semantic-1" });
      mockSemanticSearchQuery.mockResolvedValue([{ id: "semantic-row-1" }] as never);
      mockMapSemanticRowsToListingData.mockReturnValue([semanticListing]);

      const result = await executeSearchV2({
        rawParams: {
          q: "Irving",
          what: "quiet roommates",
          minLat: "32.8",
          maxLat: "32.9",
          minLng: "-96.99",
          maxLng: "-96.9",
        },
      });

      expect(mockSemanticSearchQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "Irving",
          vibeQuery: "quiet roommates",
        }),
        expect.any(Number),
        0
      );
      expect(mockGetListingsPaginated).not.toHaveBeenCalled();
      expect(mockGetMapListings).toHaveBeenCalledWith(
        expect.objectContaining({
          query: undefined,
          vibeQuery: "quiet roommates",
        })
      );
      expect(result.paginatedResult?.items[0]?.id).toBe("semantic-1");
    });

    it("filters semantic candidates through the canonical public list-search predicate", async () => {
      setupDefaultMocks();
      (features as Record<string, unknown>).semanticSearch = true;
      mockParseSearchParams.mockReturnValue(
        defaultParsedSearchParams({
          filterParams: {
            query: "Irving",
            vibeQuery: "quiet roommates",
            bounds: BOUNDS,
          },
        })
      );

      const now = new Date();
      const moveInDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const availableUntil = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);
      const staleConfirmedAt = new Date(
        now.getTime() - 22 * 24 * 60 * 60 * 1000
      );
      const semanticItems = [
        makeListingData({ id: "eligible-host", availableSlots: 4, totalSlots: 4 }),
        makeListingData({ id: "invalid-host", availableSlots: 4, totalSlots: 4 }),
        makeListingData({ id: "stale-host", availableSlots: 4, totalSlots: 4 }),
        makeListingData({ id: "legacy-review", availableSlots: 2, totalSlots: 2 }),
      ];

      mockSemanticSearchQuery.mockResolvedValue(
        [{ id: "row-1" }, { id: "row-2" }, { id: "row-3" }, { id: "row-4" }] as never
      );
      mockMapSemanticRowsToListingData.mockReturnValue(semanticItems);
      mockPrismaListingFindMany.mockResolvedValue([
        {
          id: "eligible-host",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          statusReason: null,
          needsMigrationReview: false,
          totalSlots: 4,
          availableSlots: 4,
          openSlots: 2,
          moveInDate,
          availableUntil,
          minStayMonths: 2,
          lastConfirmedAt: now,
        },
        {
          id: "invalid-host",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          statusReason: null,
          needsMigrationReview: false,
          totalSlots: 4,
          availableSlots: 4,
          openSlots: 0,
          moveInDate,
          availableUntil,
          minStayMonths: 2,
          lastConfirmedAt: now,
        },
        {
          id: "stale-host",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          statusReason: null,
          needsMigrationReview: false,
          totalSlots: 4,
          availableSlots: 4,
          openSlots: 2,
          moveInDate,
          availableUntil,
          minStayMonths: 2,
          lastConfirmedAt: staleConfirmedAt,
        },
        {
          id: "legacy-review",
          availabilitySource: "LEGACY_BOOKING",
          status: "ACTIVE",
          statusReason: "MIGRATION_REVIEW",
          needsMigrationReview: true,
          totalSlots: 2,
          availableSlots: 2,
          openSlots: null,
          moveInDate,
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: null,
        },
      ] as never);
      mockGetAvailabilityForListings.mockResolvedValue(
        new Map([
          [
            "legacy-review",
            {
              listingId: "legacy-review",
              effectiveAvailableSlots: 2,
              totalSlots: 2,
              heldSlots: 0,
              acceptedSlots: 0,
              rangeVersion: 1,
              asOf: new Date().toISOString(),
            },
          ],
        ])
      );

      const result = await executeSearchV2({
        rawParams: {
          q: "Irving",
          what: "quiet roommates",
          minLat: "32.8",
          maxLat: "32.9",
          minLng: "-96.99",
          maxLng: "-96.9",
        },
      });

      expect(result.paginatedResult?.items.map((item) => item.id)).toEqual([
        "eligible-host",
      ]);
      expect(result.response?.list.items.map((item) => item.id)).toEqual([
        "eligible-host",
      ]);
      expect(mockPrismaListingFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            needsMigrationReview: true,
          }),
        })
      );
    });

    it("fills semantic page 1 from later eligible matches and computes next page from eligible rows", async () => {
      setupDefaultMocks();
      (features as Record<string, unknown>).semanticSearch = true;
      mockParseSearchParams.mockReturnValue(
        defaultParsedSearchParams({
          filterParams: {
            query: "Irving",
            vibeQuery: "quiet roommates",
            bounds: BOUNDS,
          },
        })
      );

      const now = new Date("2026-04-15T12:30:00.000Z");
      const staleConfirmedAt = new Date("2026-03-20T12:30:00.000Z");
      const moveInDate = new Date("2026-06-01T00:00:00.000Z");
      const availableUntil = new Date("2026-12-01T00:00:00.000Z");
      const semanticRows = [
        { id: "filtered-invalid" },
        { id: "filtered-stale" },
        { id: "eligible-1" },
        { id: "eligible-2" },
        { id: "eligible-3" },
        { id: "eligible-4" },
      ];
      const listingRowsById: Record<string, Record<string, unknown>> = {
        "filtered-invalid": {
          id: "filtered-invalid",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          statusReason: null,
          needsMigrationReview: false,
          totalSlots: 4,
          availableSlots: 4,
          openSlots: 0,
          moveInDate,
          availableUntil,
          minStayMonths: 2,
          lastConfirmedAt: now,
        },
        "filtered-stale": {
          id: "filtered-stale",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          statusReason: null,
          needsMigrationReview: false,
          totalSlots: 4,
          availableSlots: 4,
          openSlots: 2,
          moveInDate,
          availableUntil,
          minStayMonths: 2,
          lastConfirmedAt: staleConfirmedAt,
        },
        "eligible-1": {
          id: "eligible-1",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          statusReason: null,
          needsMigrationReview: false,
          totalSlots: 4,
          availableSlots: 4,
          openSlots: 2,
          moveInDate,
          availableUntil,
          minStayMonths: 2,
          lastConfirmedAt: now,
        },
        "eligible-2": {
          id: "eligible-2",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          statusReason: null,
          needsMigrationReview: false,
          totalSlots: 4,
          availableSlots: 4,
          openSlots: 2,
          moveInDate,
          availableUntil,
          minStayMonths: 2,
          lastConfirmedAt: now,
        },
        "eligible-3": {
          id: "eligible-3",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          statusReason: null,
          needsMigrationReview: false,
          totalSlots: 4,
          availableSlots: 4,
          openSlots: 2,
          moveInDate,
          availableUntil,
          minStayMonths: 2,
          lastConfirmedAt: now,
        },
        "eligible-4": {
          id: "eligible-4",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          statusReason: null,
          needsMigrationReview: false,
          totalSlots: 4,
          availableSlots: 4,
          openSlots: 2,
          moveInDate,
          availableUntil,
          minStayMonths: 2,
          lastConfirmedAt: now,
        },
      };

      mockSemanticSearchQuery.mockImplementation(
        async (_filters, limit = 0, offset = 0) =>
          semanticRows.slice(offset, offset + limit) as never
      );
      mockMapSemanticRowsToListingData.mockImplementation(
        (rows) =>
          (rows as Array<{ id: string }>).map(({ id }) =>
            makeListingData({ id, availableSlots: 4, totalSlots: 4 })
          ) as never
      );
      (mockPrismaListingFindMany as unknown as jest.Mock).mockImplementation(
        async (args?: { where?: { id?: { in?: string[] } } }) =>
          (args?.where?.id?.in ?? []).map((id) => listingRowsById[id]) as never
      );

      const result = await executeSearchV2({
        rawParams: {
          q: "Irving",
          what: "quiet roommates",
          minLat: "32.8",
          maxLat: "32.9",
          minLng: "-96.99",
          maxLng: "-96.9",
        },
        limit: 2,
      });

      expect(result.paginatedResult?.items.map((item) => item.id)).toEqual([
        "eligible-1",
        "eligible-2",
      ]);
      expect(result.paginatedResult?.hasNextPage).toBe(true);
      expect(result.paginatedResult?.nextCursor).toBe("cursor-page-2");
      expect(result.response?.list.items.map((item) => item.id)).toEqual([
        "eligible-1",
        "eligible-2",
      ]);
      expect(result.response?.list.nextCursor).toBe("cursor-page-2");
      expect(mockSemanticSearchQuery.mock.calls.map((call) => call[2])).toEqual([
        0,
        3,
      ]);
    });

    it("keeps later semantic pages stable after filtering ineligible ranked matches", async () => {
      setupDefaultMocks();
      (features as Record<string, unknown>).semanticSearch = true;
      mockParseSearchParams.mockReturnValue(
        defaultParsedSearchParams({
          requestedPage: 2,
          filterParams: {
            query: "Irving",
            vibeQuery: "quiet roommates",
            bounds: BOUNDS,
          },
        })
      );

      const now = new Date("2026-04-15T12:30:00.000Z");
      const staleConfirmedAt = new Date("2026-03-20T12:30:00.000Z");
      const moveInDate = new Date("2026-06-01T00:00:00.000Z");
      const availableUntil = new Date("2026-12-01T00:00:00.000Z");
      const semanticRows = [
        { id: "filtered-invalid" },
        { id: "filtered-stale" },
        { id: "eligible-1" },
        { id: "eligible-2" },
        { id: "eligible-3" },
        { id: "eligible-4" },
      ];
      const listingRowsById: Record<string, Record<string, unknown>> = {
        "filtered-invalid": {
          id: "filtered-invalid",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          statusReason: null,
          needsMigrationReview: false,
          totalSlots: 4,
          availableSlots: 4,
          openSlots: 0,
          moveInDate,
          availableUntil,
          minStayMonths: 2,
          lastConfirmedAt: now,
        },
        "filtered-stale": {
          id: "filtered-stale",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          statusReason: null,
          needsMigrationReview: false,
          totalSlots: 4,
          availableSlots: 4,
          openSlots: 2,
          moveInDate,
          availableUntil,
          minStayMonths: 2,
          lastConfirmedAt: staleConfirmedAt,
        },
        "eligible-1": {
          id: "eligible-1",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          statusReason: null,
          needsMigrationReview: false,
          totalSlots: 4,
          availableSlots: 4,
          openSlots: 2,
          moveInDate,
          availableUntil,
          minStayMonths: 2,
          lastConfirmedAt: now,
        },
        "eligible-2": {
          id: "eligible-2",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          statusReason: null,
          needsMigrationReview: false,
          totalSlots: 4,
          availableSlots: 4,
          openSlots: 2,
          moveInDate,
          availableUntil,
          minStayMonths: 2,
          lastConfirmedAt: now,
        },
        "eligible-3": {
          id: "eligible-3",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          statusReason: null,
          needsMigrationReview: false,
          totalSlots: 4,
          availableSlots: 4,
          openSlots: 2,
          moveInDate,
          availableUntil,
          minStayMonths: 2,
          lastConfirmedAt: now,
        },
        "eligible-4": {
          id: "eligible-4",
          availabilitySource: "HOST_MANAGED",
          status: "ACTIVE",
          statusReason: null,
          needsMigrationReview: false,
          totalSlots: 4,
          availableSlots: 4,
          openSlots: 2,
          moveInDate,
          availableUntil,
          minStayMonths: 2,
          lastConfirmedAt: now,
        },
      };

      mockSemanticSearchQuery.mockImplementation(
        async (_filters, limit = 0, offset = 0) =>
          semanticRows.slice(offset, offset + limit) as never
      );
      mockMapSemanticRowsToListingData.mockImplementation(
        (rows) =>
          (rows as Array<{ id: string }>).map(({ id }) =>
            makeListingData({ id, availableSlots: 4, totalSlots: 4 })
          ) as never
      );
      (mockPrismaListingFindMany as unknown as jest.Mock).mockImplementation(
        async (args?: { where?: { id?: { in?: string[] } } }) =>
          (args?.where?.id?.in ?? []).map((id) => listingRowsById[id]) as never
      );

      const result = await executeSearchV2({
        rawParams: {
          q: "Irving",
          what: "quiet roommates",
          minLat: "32.8",
          maxLat: "32.9",
          minLng: "-96.99",
          maxLng: "-96.9",
        },
        limit: 2,
      });

      expect(result.paginatedResult?.items.map((item) => item.id)).toEqual([
        "eligible-3",
        "eligible-4",
      ]);
      expect(result.paginatedResult?.hasNextPage).toBe(false);
      expect(result.paginatedResult?.nextCursor).toBeNull();
      expect(result.paginatedResult?.total).toBe(4);
      expect(result.paginatedResult?.totalPages).toBe(2);
      expect(mockEncodeCursor).not.toHaveBeenCalled();
      expect(mockSemanticSearchQuery.mock.calls.map((call) => call[2])).toEqual([
        0,
        3,
        6,
      ]);
    });

    it("falls back to broadened area results when semantic ranking returns no rows", async () => {
      const listItems = [
        makeListingData({
          id: "generic",
          title: "Sunny home",
          description: "Bright room near transit",
        }),
        makeListingData({
          id: "quiet",
          title: "Quiet roommates welcome",
          description: "Calm home with respectful housemates",
        }),
      ];
      setupDefaultMocks({ listItems });
      (features as Record<string, unknown>).semanticSearch = true;
      mockParseSearchParams.mockReturnValue(
        defaultParsedSearchParams({
          filterParams: {
            query: "Irving",
            vibeQuery: "quiet roommates",
            bounds: BOUNDS,
          },
        })
      );
      mockSemanticSearchQuery.mockResolvedValue(null);

      const result = await executeSearchV2({
        rawParams: {
          q: "Irving",
          what: "quiet roommates",
          minLat: "32.8",
          maxLat: "32.9",
          minLng: "-96.99",
          maxLng: "-96.9",
        },
      });

      expect(result.response?.meta.warnings).toContain("VIBE_SOFT_FALLBACK");
      expect(mockGenerateQueryHash).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "Irving",
          vibeQuery: "quiet roommates",
        })
      );
      expect(result.paginatedResult?.items.map((item) => item.id)).toEqual([
        "quiet",
        "generic",
      ]);
    });

    it("handles map query timeout gracefully (returns list only)", async () => {
      setupDefaultMocks();

      // Make withTimeout reject for map query (second call) while passing for list
      let callCount = 0;
      mockWithTimeout.mockImplementation(<T>(promise: Promise<T>) => {
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
        })
      );

      // Response should have warnings about map failure (spread dynamically, not in TS type)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.response!.meta as any).warnings).toContain(
        "MAP_QUERY_FAILED"
      );
    });

    it("handles list query failure gracefully (returns empty)", async () => {
      setupDefaultMocks();

      // Make withTimeout reject for list query (first call)
      let callCount = 0;
      mockWithTimeout.mockImplementation(<T>(_promise: Promise<T>) => {
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
        })
      );
    });

    it("returns list results even when map query fails (C1.1)", async () => {
      const listItems = [
        makeListingData({ id: "surviving-1" }),
        makeListingData({ id: "surviving-2" }),
      ];
      setupDefaultMocks({ listItems });

      // Map query fails (rejected), list query succeeds
      let callCount = 0;
      mockWithTimeout.mockImplementation(<T>(promise: Promise<T>) => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error("map query database timeout"));
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

      // C1.1: List results must survive independently of map failure
      expect(result.response).not.toBeNull();
      expect(result.paginatedResult).not.toBeNull();
      expect(result.paginatedResult!.items).toHaveLength(2);
      expect(result.paginatedResult!.items[0].id).toBe("surviving-1");
      expect(result.error).toBeUndefined();

      // Map data should be empty (graceful degradation), not cause total failure
      expect(mockTransformToMapResponse).toHaveBeenCalledWith(
        [],
        expect.any(Object)
      );
    });

    it("returns map results even when list query fails (C1.1)", async () => {
      const mapItems = [
        makeMapListingData({ id: "map-surviving-1" }),
        makeMapListingData({ id: "map-surviving-2" }),
      ];
      setupDefaultMocks({ mapListings: mapItems });

      // List query fails (rejected), map query succeeds
      let callCount = 0;
      mockWithTimeout.mockImplementation(<T>(_promise: Promise<T>) => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("list query database timeout"));
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

      // C1.1: Current behavior — list query failure is treated as fatal
      // because list results are the primary search output. The service
      // returns an error rather than a partial response without list data.
      // Map query still ran independently via Promise.allSettled, but the
      // service prioritizes list results for response construction.
      expect(result.response).toBeNull();
      expect(result.error).toBe("Search temporarily unavailable");

      // Verify both queries were dispatched independently (Promise.allSettled)
      // — the map query was NOT cancelled by the list query failure
      expect(logger.sync.error).toHaveBeenCalledWith(
        "[SearchV2] List query failed",
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    it("applies ranking when feature flag enabled", async () => {
      const mapItems = Array.from({ length: 10 }, (_, i) =>
        makeMapListingData({ id: `m-${i}` })
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
        })
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
        })
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
        })
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
        })
      );
    });

    it("returns geojson mode when mapCount >= CLUSTER_THRESHOLD", async () => {
      // Create 60 map listings (above CLUSTER_THRESHOLD of 50)
      const manyMapListings = Array.from({ length: 60 }, (_, i) =>
        makeMapListingData({ id: `m-${i}` })
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
        defaultParsedSearchParams({ boundsRequired: true })
      );

      const result = await executeSearchV2({
        rawParams: { q: "test" },
      });

      expect(result.response).toBeNull();
      expect(result.paginatedResult).toBeNull();
      expect(result.unboundedSearch).toBe(true);
    });

    it("passes bounds through unclamped for list query; clamps only for map query", async () => {
      const oversizedBounds = {
        minLat: 30,
        maxLat: 45,
        minLng: -130,
        maxLng: -110,
      };
      const mapClampedBounds = {
        minLat: 35,
        maxLat: 40,
        minLng: -125,
        maxLng: -120,
      };

      mockParseSearchParams.mockReturnValue(
        defaultParsedSearchParams({
          filterParams: { bounds: oversizedBounds },
        })
      );
      // clampBoundsToMaxSpan is only called for the map query (with MAP_FETCH_MAX params)
      mockClampBoundsToMaxSpan.mockReturnValue(mapClampedBounds);

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

      // clampBoundsToMaxSpan called once for map query with MAP_FETCH_MAX params
      expect(mockClampBoundsToMaxSpan).toHaveBeenCalledTimes(1);
      expect(mockClampBoundsToMaxSpan).toHaveBeenCalledWith(
        oversizedBounds,
        60,
        130
      );

      // List query receives original unclamped bounds
      expect(mockGetListingsPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ bounds: oversizedBounds })
      );

      // Map query receives clamped bounds
      expect(mockGetMapListings).toHaveBeenCalledWith(
        expect.objectContaining({ bounds: mapClampedBounds })
      );
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
        })
      );
    });

    it("includes debug signals when debugRank=1 and ranking enabled", async () => {
      const mapItems = Array.from({ length: 5 }, (_, i) =>
        makeMapListingData({ id: `m-${i}` })
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
        {
          id: "m-0",
          quality: 0.8,
          rating: 0.7,
          price: 0.9,
          recency: 0.5,
          geo: 0.6,
          total: 0.9,
        },
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
        })
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
        })
      );
    });

    it("skips ranking when shouldIncludePins returns false (geojson mode)", async () => {
      const manyMapListings = Array.from({ length: 60 }, (_, i) =>
        makeMapListingData({ id: `m-${i}` })
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

      const keysetCursor = {
        v: 1 as const,
        s: "newest" as const,
        k: ["1500"],
        id: "abc",
      };
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
        "recommended"
      );
      expect(mockGetSearchDocListingsWithKeyset).toHaveBeenCalledWith(
        expect.any(Object),
        keysetCursor,
        expect.objectContaining({
          engine: "searchdoc-keyset",
          embeddingVersion: null,
        })
      );
    });

    it("returns snapshotExpired when a version-pinned keyset cursor no longer matches the server snapshot", async () => {
      (features as Record<string, unknown>).searchKeyset = true;
      setupDefaultMocks({ useSearchDoc: true });
      mockIsSearchDocEnabled.mockReturnValue(true);

      mockDecodeCursorAny.mockReturnValue({
        type: "keyset" as const,
        cursor: {
          v: 2 as const,
          s: "recommended" as const,
          k: ["85.50", "2024-01-15T10:00:00.000Z"],
          id: "abc",
          snapshot: {
            engine: "searchdoc-keyset" as const,
            responseVersion: "stale-contract",
            projectionVersion: 0,
            embeddingVersion: null,
          },
        },
      });

      const result = await executeSearchV2({
        rawParams: {
          minLat: "37.7",
          maxLat: "37.85",
          minLng: "-122.52",
          maxLng: "-122.35",
          cursor: "keyset-cursor-token",
        },
      });

      expect(result).toEqual({
        response: null,
        paginatedResult: null,
        snapshotExpired: {
          queryHash: "abcdef1234567890",
          reason: "search_contract_changed",
        },
      });
      expect(mockGetSearchDocListingsWithKeyset).not.toHaveBeenCalled();
    });
  });
});
