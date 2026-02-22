/**
 * Integration tests for Search API v2 - Keyset Pagination
 *
 * Tests cursor-based keyset pagination to prevent result drift
 * when inventory changes during scrolling.
 */

import {
  encodeKeysetCursor,
  buildCursorFromRow,
  type KeysetCursor,
  type CursorRowData,
} from "@/lib/search/cursor";
import { encodeCursor } from "@/lib/search/hash";

// Mock env to enable features
jest.mock("@/lib/env", () => {
  const mockFeatures = {
    searchKeyset: true,
    searchV2: true,
  };
  return {
    __esModule: true,
    features: mockFeatures,
    serverEnv: { ENABLE_SEARCH_V2: "true", ENABLE_SEARCH_KEYSET: "true" },
    clientEnv: {},
    getCursorSecret: jest.fn().mockReturnValue(""),
  };
});

// Mock data module
jest.mock("@/lib/data", () => ({
  getListingsPaginated: jest.fn(),
  getMapListings: jest.fn(),
}));

// Mock search-doc-queries module
jest.mock("@/lib/search/search-doc-queries", () => ({
  isSearchDocEnabled: jest.fn().mockReturnValue(true),
  getSearchDocListingsPaginated: jest.fn(),
  getSearchDocMapListings: jest.fn(),
  getSearchDocListingsWithKeyset: jest.fn(),
  getSearchDocListingsFirstPage: jest.fn(),
}));

import { features } from "@/lib/env";
import {
  getSearchDocListingsWithKeyset,
  getSearchDocListingsFirstPage,
  getSearchDocMapListings,
} from "@/lib/search/search-doc-queries";
import { executeSearchV2 } from "@/lib/search/search-v2-service";
import type { ListingData } from "@/lib/data";

const mockFeatures = features as { searchKeyset: boolean; searchV2: boolean };

// Helper to create mock listing data
function createMockListingData(
  id: string,
  overrides: Partial<ListingData & { _cursorCreatedAt?: string }> = {},
): ListingData {
  return {
    id,
    title: `Listing ${id}`,
    description: "Test listing",
    price: 1500,
    images: ["img.jpg"],
    availableSlots: 1,
    totalSlots: 1,
    amenities: [],
    houseRules: [],
    householdLanguages: [],
    location: {
      address: "123 Test St",
      city: "San Francisco",
      state: "CA",
      zip: "94102",
      lat: 37.7749,
      lng: -122.4194,
    },
    isNearMatch: false,
    ...overrides,
  };
}

// Helper to create mock keyset result
function createMockKeysetResult(
  items: ListingData[],
  nextCursor: string | null,
  total: number = items.length,
) {
  return {
    items,
    hasNextPage: nextCursor !== null,
    hasPrevPage: false,
    total,
    totalPages: Math.ceil(total / 20),
    page: 1,
    limit: 20,
    nextCursor,
  };
}

describe("Keyset Pagination Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFeatures.searchKeyset = true;
    mockFeatures.searchV2 = true;
  });

  describe("Service layer keyset integration", () => {
    it("should use getSearchDocListingsFirstPage when no cursor", async () => {
      const mockListings = [
        createMockListingData("1"),
        createMockListingData("2"),
      ];
      const mockNextCursor = encodeKeysetCursor({
        v: 1,
        s: "recommended",
        k: ["85.00", "2024-01-15T10:00:00.000Z"],
        id: "2",
      });

      (getSearchDocListingsFirstPage as jest.Mock).mockResolvedValue(
        createMockKeysetResult(mockListings, mockNextCursor, 100),
      );
      (getSearchDocMapListings as jest.Mock).mockResolvedValue([]);

      const result = await executeSearchV2({
        rawParams: {},
      });

      expect(getSearchDocListingsFirstPage).toHaveBeenCalled();
      expect(result.response?.list.nextCursor).toBe(mockNextCursor);
    });

    it("should use getSearchDocListingsWithKeyset when cursor provided", async () => {
      const cursor: KeysetCursor = {
        v: 1,
        s: "recommended",
        k: ["85.00", "2024-01-15T10:00:00.000Z"],
        id: "prev-id",
      };
      const cursorStr = encodeKeysetCursor(cursor);

      const mockListings = [
        createMockListingData("3"),
        createMockListingData("4"),
      ];
      const mockNextCursor = encodeKeysetCursor({
        v: 1,
        s: "recommended",
        k: ["80.00", "2024-01-14T10:00:00.000Z"],
        id: "4",
      });

      (getSearchDocListingsWithKeyset as jest.Mock).mockResolvedValue(
        createMockKeysetResult(mockListings, mockNextCursor, 100),
      );
      (getSearchDocMapListings as jest.Mock).mockResolvedValue([]);

      const result = await executeSearchV2({
        rawParams: { cursor: cursorStr },
      });

      expect(getSearchDocListingsWithKeyset).toHaveBeenCalledWith(
        expect.any(Object),
        cursor,
      );
      expect(result.response?.list.nextCursor).toBe(mockNextCursor);
    });

    it("should return different items on page 2 vs page 1", async () => {
      // Page 1
      const page1Items = [
        createMockListingData("1"),
        createMockListingData("2"),
      ];
      const page1Cursor = encodeKeysetCursor({
        v: 1,
        s: "recommended",
        k: ["85.00", "2024-01-15T10:00:00.000Z"],
        id: "2",
      });

      (getSearchDocListingsFirstPage as jest.Mock).mockResolvedValue(
        createMockKeysetResult(page1Items, page1Cursor, 100),
      );
      (getSearchDocMapListings as jest.Mock).mockResolvedValue([]);

      const result1 = await executeSearchV2({ rawParams: {} });
      const page1Ids = result1.response?.list.items.map((i) => i.id);

      // Page 2
      const page2Items = [
        createMockListingData("3"),
        createMockListingData("4"),
      ];
      const page2Cursor = encodeKeysetCursor({
        v: 1,
        s: "recommended",
        k: ["75.00", "2024-01-14T10:00:00.000Z"],
        id: "4",
      });

      (getSearchDocListingsWithKeyset as jest.Mock).mockResolvedValue(
        createMockKeysetResult(page2Items, page2Cursor, 100),
      );

      const result2 = await executeSearchV2({
        rawParams: { cursor: page1Cursor },
      });
      const page2Ids = result2.response?.list.items.map((i) => i.id);

      // Verify no overlap
      const overlap = page1Ids?.filter((id) => page2Ids?.includes(id));
      expect(overlap).toHaveLength(0);
    });

    it("should handle legacy cursor and return keyset cursor going forward", async () => {
      // Legacy cursor format (offset-based)
      const legacyCursor = encodeCursor(2); // Page 2

      const mockListings = [
        createMockListingData("3"),
        createMockListingData("4"),
      ];
      const mockNextCursor = encodeKeysetCursor({
        v: 1,
        s: "recommended",
        k: ["80.00", "2024-01-14T10:00:00.000Z"],
        id: "4",
      });

      // When legacy cursor is used, it falls back to first page with keyset
      // (since we can't convert offset to keyset position)
      (getSearchDocListingsFirstPage as jest.Mock).mockResolvedValue(
        createMockKeysetResult(mockListings, mockNextCursor, 100),
      );
      (getSearchDocMapListings as jest.Mock).mockResolvedValue([]);

      const result = await executeSearchV2({
        rawParams: { cursor: legacyCursor },
      });

      // Should return keyset cursor for subsequent requests
      expect(result.response?.list.nextCursor).toBe(mockNextCursor);
    });

    it("should return null cursor on last page", async () => {
      const mockListings = [createMockListingData("1")];

      (getSearchDocListingsFirstPage as jest.Mock).mockResolvedValue(
        createMockKeysetResult(mockListings, null, 1),
      );
      (getSearchDocMapListings as jest.Mock).mockResolvedValue([]);

      const result = await executeSearchV2({ rawParams: {} });

      expect(result.response?.list.nextCursor).toBeNull();
    });

    it("should handle empty results", async () => {
      (getSearchDocListingsFirstPage as jest.Mock).mockResolvedValue(
        createMockKeysetResult([], null, 0),
      );
      (getSearchDocMapListings as jest.Mock).mockResolvedValue([]);

      const result = await executeSearchV2({ rawParams: {} });

      expect(result.response?.list.items).toHaveLength(0);
      expect(result.response?.list.nextCursor).toBeNull();
    });

    it("should validate cursor sort matches query sort", async () => {
      // Cursor is for "newest" sort
      const cursor: KeysetCursor = {
        v: 1,
        s: "newest",
        k: ["2024-01-15T10:00:00.000Z"],
        id: "test-id",
      };
      const cursorStr = encodeKeysetCursor(cursor);

      const mockListings = [createMockListingData("1")];

      // When cursor sort doesn't match, it should restart from beginning
      (getSearchDocListingsFirstPage as jest.Mock).mockResolvedValue(
        createMockKeysetResult(mockListings, null, 1),
      );
      (getSearchDocMapListings as jest.Mock).mockResolvedValue([]);

      // Query with "recommended" sort but cursor has "newest"
      // The cursor should be rejected and first page returned
      await executeSearchV2({
        rawParams: { cursor: cursorStr, sort: "recommended" },
      });

      // Should have called first page (cursor rejected due to sort mismatch)
      expect(getSearchDocListingsFirstPage).toHaveBeenCalled();
      expect(getSearchDocListingsWithKeyset).not.toHaveBeenCalled();
    });
  });

  describe("Keyset disabled fallback", () => {
    beforeEach(() => {
      mockFeatures.searchKeyset = false;
    });

    it("should use offset pagination when keyset is disabled", async () => {
      const { getSearchDocListingsPaginated } = jest.requireMock(
        "@/lib/search/search-doc-queries",
      );

      const mockListings = [createMockListingData("1")];
      getSearchDocListingsPaginated.mockResolvedValue({
        items: mockListings,
        hasNextPage: true,
        hasPrevPage: false,
        total: 100,
        totalPages: 5,
        page: 1,
        limit: 20,
      });
      (getSearchDocMapListings as jest.Mock).mockResolvedValue([]);

      const result = await executeSearchV2({ rawParams: {} });

      expect(getSearchDocListingsPaginated).toHaveBeenCalled();
      expect(getSearchDocListingsFirstPage).not.toHaveBeenCalled();
      expect(getSearchDocListingsWithKeyset).not.toHaveBeenCalled();

      // Should return legacy cursor format (page number encoded)
      const nextCursor = result.response?.list.nextCursor;
      expect(nextCursor).not.toBeNull();
      // Legacy cursor should be decodable to page 2
      const decoded = JSON.parse(
        Buffer.from(nextCursor!, "base64url").toString("utf-8"),
      );
      expect(decoded.p).toBe(2);
    });
  });

  describe("Cursor building", () => {
    it("should build cursor with correct values from row data", () => {
      const row: CursorRowData = {
        id: "test-listing",
        listing_created_at: "2024-01-15T10:00:00.000Z",
        recommended_score: "85.50",
        price: "1500.00",
        avg_rating: "4.50",
        review_count: "10",
      };

      const cursor = buildCursorFromRow(row, "recommended");

      expect(cursor.v).toBe(1);
      expect(cursor.s).toBe("recommended");
      expect(cursor.k).toEqual(["85.50", "2024-01-15T10:00:00.000Z"]);
      expect(cursor.id).toBe("test-listing");
    });

    it("should preserve float precision in cursor", () => {
      const row: CursorRowData = {
        id: "test-listing",
        listing_created_at: "2024-01-15T10:00:00.000Z",
        recommended_score: "85.123456789",
      };

      const cursor = buildCursorFromRow(row, "recommended");
      const encoded = encodeKeysetCursor(cursor);
      const decoded = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf-8"),
      );

      // Verify precision is preserved
      expect(decoded.k[0]).toBe("85.123456789");
    });
  });
});
