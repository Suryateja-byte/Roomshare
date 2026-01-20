/**
 * Search Orchestrator Integration Tests
 *
 * Tests the v2→v1 fallback behavior extracted from src/app/search/page.tsx.
 * These tests cover Journey D scenarios that cannot be tested via E2E
 * because executeSearchV2() runs server-side during SSR.
 */
import { orchestrateSearch } from "@/lib/search/search-orchestrator";
import { executeSearchV2 } from "@/lib/search/search-v2-service";
import { getListingsPaginated } from "@/lib/data";
import type { FilterParams } from "@/lib/search-params";
import type { PaginatedResult, ListingData } from "@/lib/data";
import type { SearchV2Result } from "@/lib/search/search-v2-service";

jest.mock("@/lib/search/search-v2-service");
jest.mock("@/lib/data");

const mockExecuteSearchV2 = executeSearchV2 as jest.MockedFunction<
  typeof executeSearchV2
>;
const mockGetListingsPaginated = getListingsPaginated as jest.MockedFunction<
  typeof getListingsPaginated
>;

describe("orchestrateSearch - v2→v1 fallback behavior", () => {
  const baseParams: Record<string, string> = {
    minLat: "37.7",
    maxLat: "37.85",
    minLng: "-122.52",
    maxLng: "-122.35",
  };

  const filterParams: FilterParams = {
    bounds: {
      minLat: 37.7,
      maxLat: 37.85,
      minLng: -122.52,
      maxLng: -122.35,
    },
  };

  const mockV1Result: PaginatedResult<ListingData> = {
    items: [
      {
        id: "v1-listing-1",
        title: "V1 Listing",
        description: "A test listing",
        price: 1500,
        images: [],
        availableSlots: 1,
        totalSlots: 2,
        amenities: [],
        houseRules: [],
        householdLanguages: [],
        location: {
          address: "123 Main St",
          city: "San Francisco",
          state: "CA",
          zip: "94102",
          lat: 37.77,
          lng: -122.42,
        },
      },
    ],
    total: 1,
    totalPages: 1,
    page: 1,
    limit: 12,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("falls back to v1 when v2 returns null response", async () => {
    // Arrange: v2 fails with null response
    mockExecuteSearchV2.mockResolvedValue({
      response: null,
      paginatedResult: null,
      error: "V2 service unavailable",
    });
    mockGetListingsPaginated.mockResolvedValue(mockV1Result);

    // Act
    const result = await orchestrateSearch(
      baseParams,
      filterParams,
      1,
      12,
      true, // useV2 = true
    );

    // Assert: v2 was called, then v1 was called as fallback
    expect(mockExecuteSearchV2).toHaveBeenCalledTimes(1);
    expect(mockExecuteSearchV2).toHaveBeenCalledWith({
      rawParams: baseParams,
      limit: 12,
    });
    expect(mockGetListingsPaginated).toHaveBeenCalledTimes(1);
    expect(mockGetListingsPaginated).toHaveBeenCalledWith({
      ...filterParams,
      page: 1,
      limit: 12,
    });

    // Assert: result contains v1 data with fallback flag
    expect(result.paginatedResult.items[0].id).toBe("v1-listing-1");
    expect(result.usedV1Fallback).toBe(true);
    expect(result.fetchError).toBe("V2 service unavailable");
    expect(result.v2MapData).toBeNull();
  });

  it("uses v2 result when v2 succeeds (no v1 call)", async () => {
    // Arrange: v2 succeeds with valid response
    const mockV2Result: SearchV2Result = {
      response: {
        meta: {
          queryHash: "abc123",
          generatedAt: new Date().toISOString(),
          mode: "pins",
        },
        list: {
          items: [],
          nextCursor: null,
          total: 5,
        },
        map: {
          geojson: { type: "FeatureCollection", features: [] },
          pins: [
            {
              id: "pin-1",
              lat: 37.77,
              lng: -122.42,
              price: 1500,
              tier: "primary",
            },
          ],
        },
      },
      paginatedResult: {
        items: [
          {
            id: "v2-listing-1",
            title: "V2 Listing",
            description: "A v2 test listing",
            price: 2000,
            images: [],
            availableSlots: 2,
            totalSlots: 3,
            amenities: ["wifi"],
            houseRules: [],
            householdLanguages: [],
            location: {
              address: "456 Market St",
              city: "San Francisco",
              state: "CA",
              zip: "94103",
              lat: 37.77,
              lng: -122.42,
            },
          },
        ],
        total: 5,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
        page: 1,
        limit: 12,
      },
      error: undefined,
    };
    mockExecuteSearchV2.mockResolvedValue(mockV2Result);

    // Act
    const result = await orchestrateSearch(
      baseParams,
      filterParams,
      1,
      12,
      true, // useV2 = true
    );

    // Assert: v2 was called, v1 was NOT called
    expect(mockExecuteSearchV2).toHaveBeenCalledTimes(1);
    expect(mockGetListingsPaginated).not.toHaveBeenCalled();

    // Assert: result contains v2 data
    expect(result.paginatedResult.items[0].id).toBe("v2-listing-1");
    expect(result.usedV1Fallback).toBe(false);
    expect(result.fetchError).toBeNull();
    expect(result.v2MapData).not.toBeNull();
    expect(result.v2MapData?.pins).toHaveLength(1);
    expect(result.v2MapData?.mode).toBe("pins");
  });

  it("uses v1 directly when v2 is disabled (no fallback flag)", async () => {
    // Arrange: v2 disabled, v1 available
    mockGetListingsPaginated.mockResolvedValue(mockV1Result);

    // Act
    const result = await orchestrateSearch(
      baseParams,
      filterParams,
      1,
      12,
      false, // useV2 = false
    );

    // Assert: v2 was NOT called, v1 was called directly
    expect(mockExecuteSearchV2).not.toHaveBeenCalled();
    expect(mockGetListingsPaginated).toHaveBeenCalledTimes(1);

    // Assert: result contains v1 data WITHOUT fallback flag
    // (usedV1Fallback is only true when v2 was attempted and failed)
    expect(result.paginatedResult.items[0].id).toBe("v1-listing-1");
    expect(result.usedV1Fallback).toBe(false);
    expect(result.fetchError).toBeNull();
    expect(result.v2MapData).toBeNull();
  });

  it("returns empty result with error when both v1 and v2 fail", async () => {
    // Arrange: v2 fails, then v1 also fails
    mockExecuteSearchV2.mockResolvedValue({
      response: null,
      paginatedResult: null,
      error: "V2 database error",
    });
    mockGetListingsPaginated.mockRejectedValue(
      new Error("Database connection failed"),
    );

    // Act
    const result = await orchestrateSearch(
      baseParams,
      filterParams,
      1,
      12,
      true, // useV2 = true
    );

    // Assert: both services were called
    expect(mockExecuteSearchV2).toHaveBeenCalledTimes(1);
    expect(mockGetListingsPaginated).toHaveBeenCalledTimes(1);

    // Assert: result is empty fallback with v1 error message
    expect(result.paginatedResult.items).toHaveLength(0);
    expect(result.paginatedResult.total).toBe(0);
    expect(result.fetchError).toBe("Database connection failed");
    expect(result.usedV1Fallback).toBe(true);
    expect(result.v2MapData).toBeNull();
  });

  it("preserves v1 error message when v1 throws non-Error", async () => {
    // Arrange: v2 fails, v1 throws non-Error value
    mockExecuteSearchV2.mockResolvedValue({
      response: null,
      paginatedResult: null,
      error: "V2 failed",
    });
    mockGetListingsPaginated.mockRejectedValue("String error message");

    // Act
    const result = await orchestrateSearch(
      baseParams,
      filterParams,
      1,
      12,
      true,
    );

    // Assert: generic error message used for non-Error
    expect(result.fetchError).toBe(
      "Unable to load listings. Please try again.",
    );
    expect(result.paginatedResult.items).toHaveLength(0);
  });
});
