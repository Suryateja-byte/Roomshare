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
    getOptionalCursorSecret: jest.fn().mockReturnValue(""),
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
  overrides: Partial<ListingData & { _cursorCreatedAt?: string }> = {}
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
  total: number = items.length
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
        createMockKeysetResult(mockListings, mockNextCursor, 100)
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
        createMockKeysetResult(mockListings, mockNextCursor, 100)
      );
      (getSearchDocMapListings as jest.Mock).mockResolvedValue([]);

      const result = await executeSearchV2({
        rawParams: { cursor: cursorStr },
      });

      expect(getSearchDocListingsWithKeyset).toHaveBeenCalledWith(
        expect.any(Object),
        cursor
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
        createMockKeysetResult(page1Items, page1Cursor, 100)
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
        createMockKeysetResult(page2Items, page2Cursor, 100)
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
      // Legacy cursor format (offset-based) — page 2
      const legacyCursor = encodeCursor(2);

      const mockListings = [
        createMockListingData("3"),
        createMockListingData("4"),
      ];

      // When legacy cursor has page > 1, the service routes to offset-based
      // pagination (getSearchDocListingsPaginated) to correctly respect the page
      // number. This prevents duplicate results when the ranking engine changes
      // mid-session (e.g., semantic → FTS fallback).
      const { getSearchDocListingsPaginated } = jest.requireMock(
        "@/lib/search/search-doc-queries"
      );
      getSearchDocListingsPaginated.mockResolvedValue({
        items: mockListings,
        total: 100,
        page: 2,
        totalPages: 10,
        hasNextPage: true,
        hasPrevPage: true,
      });
      (getSearchDocMapListings as jest.Mock).mockResolvedValue([]);

      const result = await executeSearchV2({
        rawParams: { cursor: legacyCursor },
      });

      // Should return a legacy cursor (offset-based) for page 3
      const expectedLegacyCursor = encodeCursor(3);
      expect(result.response?.list.nextCursor).toBe(expectedLegacyCursor);
      expect(getSearchDocListingsPaginated).toHaveBeenCalled();
    });

    it("should return null cursor on last page", async () => {
      const mockListings = [createMockListingData("1")];

      (getSearchDocListingsFirstPage as jest.Mock).mockResolvedValue(
        createMockKeysetResult(mockListings, null, 1)
      );
      (getSearchDocMapListings as jest.Mock).mockResolvedValue([]);

      const result = await executeSearchV2({ rawParams: {} });

      expect(result.response?.list.nextCursor).toBeNull();
    });

    it("should handle empty results", async () => {
      (getSearchDocListingsFirstPage as jest.Mock).mockResolvedValue(
        createMockKeysetResult([], null, 0)
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
        createMockKeysetResult(mockListings, null, 1)
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
        "@/lib/search/search-doc-queries"
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
        Buffer.from(nextCursor!, "base64url").toString("utf-8")
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
        Buffer.from(encoded, "base64url").toString("utf-8")
      );

      // Verify precision is preserved
      expect(decoded.k[0]).toBe("85.123456789");
    });
  });
});

/**
 * Rating sort keyset cursor correctness (#29)
 *
 * ORDER BY: avg_rating DESC NULLS LAST, review_count DESC, listing_created_at DESC, id ASC
 *
 * Note: review_count is NOT NULL DEFAULT 0 in the DB schema, so review_count
 * will never be NULL in production data. However the cursor encoding uses
 * `row.review_count ?? null`, so a crafted/legacy cursor COULD have null count.
 * The keyset WHERE clause must handle this defensively.
 *
 * The existing cc !== null branch includes `d.review_count IS NULL` for NULLs-sort-last
 * semantics. The cc === null branch was missing `d.review_count IS NOT NULL` for
 * non-NULL rows that sort after NULL in DESC order.
 */
describe("Rating keyset cursor correctness (#29)", () => {
  // Dataset with review_count always non-null (matches real schema: NOT NULL DEFAULT 0)
  // Sorted by: avg_rating DESC NULLS LAST, review_count DESC, listing_created_at DESC, id ASC
  const dataset = [
    { id: "r1", avg_rating: 5.0 as number | null, review_count: 100, created_at: "2026-01-10" },
    { id: "r2", avg_rating: 5.0, review_count: 50,  created_at: "2026-01-09" },
    { id: "r3", avg_rating: 5.0, review_count: 0,   created_at: "2026-01-08" },
    { id: "r4", avg_rating: 4.5, review_count: 30,  created_at: "2026-01-07" },
    { id: "r5", avg_rating: 4.5, review_count: 30,  created_at: "2026-01-06" },
    { id: "r6", avg_rating: 4.5, review_count: 10,  created_at: "2026-01-05" },
    { id: "r7", avg_rating: 4.5, review_count: 0,   created_at: "2026-01-04" },
    { id: "r8", avg_rating: 4.0, review_count: 20,  created_at: "2026-01-03" },
    { id: "r9", avg_rating: null, review_count: 0,   created_at: "2026-01-02" },
  ];

  /**
   * Simulate the keyset WHERE clause for sort="rating".
   * Mirrors the SQL in buildKeysetWhereClause (cc !== null branch).
   */
  function isAfterCursor(
    row: (typeof dataset)[0],
    cursor: { avg_rating: number | null; review_count: number; created_at: string; id: string }
  ): boolean {
    const cr = cursor.avg_rating;
    const cc = cursor.review_count;
    const cd = cursor.created_at;
    const ci = cursor.id;

    if (cr === null) {
      // cursorRating === null: only NULL-rating rows after cursor by date/id
      return (
        row.avg_rating === null &&
        (row.created_at < cd || (row.created_at === cd && row.id > ci))
      );
    }

    // Standard multi-column keyset (review_count always non-null in real data)
    return (
      (row.avg_rating !== null && row.avg_rating < cr) ||
      row.avg_rating === null ||
      (row.avg_rating === cr && row.review_count < cc) ||
      (row.avg_rating === cr && row.review_count === cc && row.created_at < cd) ||
      (row.avg_rating === cr && row.review_count === cc && row.created_at === cd && row.id > ci)
    );
  }

  it("cursor at boundary between rating groups includes all lower groups", () => {
    // Cursor at r3 (last row of rating=5.0 group)
    const cursor = { avg_rating: 5.0, review_count: 0, created_at: "2026-01-08", id: "r3" };
    const nextPage = dataset.filter((row) => isAfterCursor(row, cursor));

    expect(nextPage.map((r) => r.id)).toEqual(["r4", "r5", "r6", "r7", "r8", "r9"]);
  });

  it("cursor within same rating/count group uses date tiebreaker", () => {
    // Cursor at r4 (rating=4.5, count=30, date=2026-01-07)
    const cursor = { avg_rating: 4.5, review_count: 30, created_at: "2026-01-07", id: "r4" };
    const nextPage = dataset.filter((row) => isAfterCursor(row, cursor));

    // r5 has same rating+count but earlier date → included
    expect(nextPage.map((r) => r.id)).toEqual(["r5", "r6", "r7", "r8", "r9"]);
  });

  it("null rating cursor returns only later null-rating rows", () => {
    const cursor = { avg_rating: null, review_count: 0, created_at: "2026-01-02", id: "r9" };
    const nextPage = dataset.filter((row) => isAfterCursor(row, cursor));

    expect(nextPage).toEqual([]);
  });

  it("full walk-through: every row seen exactly once (zero gaps, zero duplicates)", () => {
    const pageSize = 3;
    const seen: string[] = [];
    let cursorRow: (typeof dataset)[0] | null = null;

    for (let page = 0; page < 10; page++) {
      let candidates: typeof dataset;
      if (cursorRow === null) {
        candidates = [...dataset];
      } else {
        candidates = dataset.filter((row) => isAfterCursor(row, cursorRow!));
      }

      const pageItems = candidates.slice(0, pageSize);
      if (pageItems.length === 0) break;

      seen.push(...pageItems.map((r) => r.id));
      cursorRow = pageItems[pageItems.length - 1];
    }

    // Every row seen exactly once
    expect(seen).toEqual(dataset.map((r) => r.id));
    expect(new Set(seen).size).toBe(dataset.length);
  });

  it("walk-through with page size 1 (worst case for boundary bugs)", () => {
    const seen: string[] = [];
    let cursorRow: (typeof dataset)[0] | null = null;

    for (let page = 0; page < 20; page++) {
      let candidates: typeof dataset;
      if (cursorRow === null) {
        candidates = [...dataset];
      } else {
        candidates = dataset.filter((row) => isAfterCursor(row, cursorRow!));
      }

      const pageItems = candidates.slice(0, 1);
      if (pageItems.length === 0) break;

      seen.push(pageItems[0].id);
      cursorRow = pageItems[0];
    }

    expect(seen).toEqual(dataset.map((r) => r.id));
  });

  it("SQL clause for null-count cursor contains IS NOT NULL branch (defensive)", () => {
    // Even though review_count is NOT NULL in the schema, the cursor could
    // theoretically have null from a crafted/legacy cursor. The SQL must handle it.
    const { buildKeysetWhereClause } = jest.requireActual(
      "@/lib/search/search-doc-queries"
    ) as { buildKeysetWhereClause: typeof import("@/lib/search/search-doc-queries").buildKeysetWhereClause };

    const cursor: KeysetCursor = {
      v: 1,
      s: "rating",
      k: ["4.5", null, "2026-01-07T00:00:00.000Z"],
      id: "test-id",
    };

    const result = buildKeysetWhereClause(cursor, "rating", 10);
    expect(result.clause).toContain("d.review_count IS NOT NULL");
    expect(result.params).toEqual([4.5, null, "2026-01-07T00:00:00.000Z", "test-id"]);
    expect(result.nextParamIndex).toBe(14);
  });

  it("SQL clause for non-null-count cursor has correct structure", () => {
    const { buildKeysetWhereClause } = jest.requireActual(
      "@/lib/search/search-doc-queries"
    ) as { buildKeysetWhereClause: typeof import("@/lib/search/search-doc-queries").buildKeysetWhereClause };

    const cursor: KeysetCursor = {
      v: 1,
      s: "rating",
      k: ["4.5", "30", "2026-01-07T00:00:00.000Z"],
      id: "test-id",
    };

    const result = buildKeysetWhereClause(cursor, "rating", 10);
    // Should have branches for: lower rating, NULL rating, lower count, NULL count, date tiebreaker, id tiebreaker
    expect(result.clause).toContain("d.avg_rating <");
    expect(result.clause).toContain("d.avg_rating IS NULL");
    expect(result.clause).toContain("d.review_count <");
    expect(result.clause).toContain("d.review_count IS NULL");
    expect(result.clause).toContain("d.listing_created_at <");
    expect(result.clause).toContain("d.id >");
    expect(result.params).toEqual([4.5, 30, "2026-01-07T00:00:00.000Z", "test-id"]);
  });
});
