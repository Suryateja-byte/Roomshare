/**
 * Tests for Hybrid Count Threshold (EC-21)
 *
 * These tests verify the HYBRID_COUNT_THRESHOLD behavior in getSearchDocLimitedCount().
 *
 * The hybrid count optimization:
 * - Uses LIMIT 101 subquery to efficiently check if count > 100
 * - Returns exact count when count <= 100
 * - Returns null when count > 100 (unknown total, "100+ results")
 *
 * This prevents expensive COUNT(*) operations on large result sets
 * while providing exact counts for smaller result sets.
 */

// Mock next/cache before imports
jest.mock("next/cache", () => ({
  unstable_cache: jest.fn((fn) => fn),
}));

// Mock prisma before imports — $transaction delegates to the same $queryRawUnsafe mock
jest.mock("@/lib/prisma", () => {
  const qru = jest.fn();
  return {
    prisma: {
      $queryRawUnsafe: qru,
      $transaction: jest.fn((fn: any) =>
        fn({
          $executeRawUnsafe: jest.fn(),
          $queryRawUnsafe: qru,
        })
      ),
    },
  };
});

import { prisma } from "@/lib/prisma";
import { getSearchDocLimitedCount } from "@/lib/search/search-doc-queries";

// Note: HYBRID_COUNT_THRESHOLD = 100 in source (see file header for details)

describe("hybrid-count-threshold", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getSearchDocLimitedCount threshold behavior", () => {
    // These tests require bounds to avoid the unbounded browse null return
    const validBounds = {
      minLat: 37.7,
      maxLat: 37.8,
      minLng: -122.5,
      maxLng: -122.4,
    };

    it("returns exact count when count <= 100", async () => {
      // Arrange: Mock returns 50 results (under threshold)
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { count: BigInt(50) },
      ]);

      // Act
      const result = await getSearchDocLimitedCount({ bounds: validBounds });

      // Assert: Should return the exact count
      expect(result).toBe(50);
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    });

    it("returns null when count > 100", async () => {
      // Arrange: Mock returns 150 results (over threshold)
      // The actual query uses LIMIT 101, so it would return 101
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { count: BigInt(101) },
      ]);

      // Act
      const result = await getSearchDocLimitedCount({ bounds: validBounds });

      // Assert: Should return null (count exceeds threshold)
      expect(result).toBeNull();
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    });

    it("returns 100 at exactly 100 results (boundary - under threshold)", async () => {
      // Arrange: Mock returns exactly 100 results (at threshold)
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { count: BigInt(100) },
      ]);

      // Act
      const result = await getSearchDocLimitedCount({ bounds: validBounds });

      // Assert: Should return 100 (exactly at threshold is still valid)
      expect(result).toBe(100);
    });

    it("returns null at exactly 101 results (boundary - over threshold)", async () => {
      // Arrange: Mock returns exactly 101 results (just over threshold)
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { count: BigInt(101) },
      ]);

      // Act
      const result = await getSearchDocLimitedCount({ bounds: validBounds });

      // Assert: Should return null (101 > 100 threshold)
      expect(result).toBeNull();
    });

    it("returns 0 for zero results", async () => {
      // Arrange: Mock returns 0 results
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { count: BigInt(0) },
      ]);

      // Act
      const result = await getSearchDocLimitedCount({ bounds: validBounds });

      // Assert: Should return 0
      expect(result).toBe(0);
    });

    it("returns 1 for single result", async () => {
      // Arrange: Mock returns 1 result
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { count: BigInt(1) },
      ]);

      // Act
      const result = await getSearchDocLimitedCount({ bounds: validBounds });

      // Assert: Should return 1
      expect(result).toBe(1);
    });

    it("handles empty result array gracefully", async () => {
      // Arrange: Mock returns empty array (edge case)
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([]);

      // Act
      const result = await getSearchDocLimitedCount({ bounds: validBounds });

      // Assert: Should return 0 (no count found)
      expect(result).toBe(0);
    });
  });

  describe("hybrid count + filters interaction", () => {
    const validBounds = {
      minLat: 37.7,
      maxLat: 37.8,
      minLng: -122.5,
      maxLng: -122.4,
    };

    it("applies filters before threshold check", async () => {
      // Arrange: Filtered results return 30 (under threshold)
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { count: BigInt(30) },
      ]);

      // Act: Apply price + amenity filters with bounds
      const result = await getSearchDocLimitedCount({
        bounds: validBounds,
        minPrice: 500,
        maxPrice: 1500,
        amenities: ["Wifi", "Parking"],
      });

      // Assert: Should return exact filtered count
      expect(result).toBe(30);

      // Verify the query was called (filters are applied in WHERE clause)
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
      const queryCall = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[0][0];
      // Query should contain filter conditions
      expect(queryCall).toContain("price >=");
      expect(queryCall).toContain("price <=");
    });

    it("returns null for filtered large result sets with bounds", async () => {
      // Arrange: Even with filters, result exceeds threshold
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { count: BigInt(101) },
      ]);

      // Act: Filters that still return many results
      const result = await getSearchDocLimitedCount({
        bounds: validBounds,
        roomType: "Private Room",
      });

      // Assert: Should return null (filtered count still > 100)
      expect(result).toBeNull();
    });

    it("returns null for unfiltered large result sets with bounds", async () => {
      // Arrange: Large bounds area returns many results
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { count: BigInt(101) },
      ]);

      // Act: Only bounds, no other filters
      const result = await getSearchDocLimitedCount({
        bounds: {
          minLat: 30.0,
          maxLat: 45.0,
          minLng: -130.0,
          maxLng: -100.0,
        },
      });

      // Assert: Should return null
      expect(result).toBeNull();
    });
  });

  describe("text search + hybrid count", () => {
    const validBounds = {
      minLat: 37.7,
      maxLat: 37.8,
      minLng: -122.5,
      maxLng: -122.4,
    };

    it("returns exact count for text search with bounds (small result)", async () => {
      // Arrange: Text search returns few results
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { count: BigInt(25) },
      ]);

      // Act: Text search within bounds
      const result = await getSearchDocLimitedCount({
        query: "cozy downtown studio",
        bounds: validBounds,
      });

      // Assert: Should return exact count
      expect(result).toBe(25);

      // Verify FTS was included in query
      const queryCall = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[0][0];
      expect(queryCall).toContain("search_tsv");
      expect(queryCall).toContain("plainto_tsquery");
    });

    it("returns null for text search with bounds (large result)", async () => {
      // Arrange: Text search still returns many results
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { count: BigInt(101) },
      ]);

      // Act: Common search term
      const result = await getSearchDocLimitedCount({
        query: "room",
        bounds: validBounds,
      });

      // Assert: Should return null (count > threshold)
      expect(result).toBeNull();
    });

    it("executes text search without bounds (count allowed, pagination blocked)", async () => {
      // Note: The unbounded browse protection in getSearchDocLimitedCount
      // only blocks when BOTH query AND bounds are missing.
      // Text search without bounds IS allowed for counting (useful for showing
      // "X results for 'apartment'" before user provides location).
      // The pagination function (getSearchDocListingsPaginated) is where
      // unbounded text search is blocked to prevent expensive full-table scans.
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { count: BigInt(50) },
      ]);

      // Act: Text search without bounds
      const result = await getSearchDocLimitedCount({
        query: "apartment",
      });

      // Assert: Should return the count (text search without bounds is allowed for count)
      expect(result).toBe(50);
      // Prisma SHOULD be called - this is allowed
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    });
  });

  describe("SQL query structure verification", () => {
    const validBounds = {
      minLat: 37.7,
      maxLat: 37.8,
      minLng: -122.5,
      maxLng: -122.4,
    };

    it("uses LIMIT 101 subquery pattern for efficient counting", async () => {
      // Arrange
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { count: BigInt(50) },
      ]);

      // Act
      await getSearchDocLimitedCount({ bounds: validBounds });

      // Assert: Verify query structure uses LIMIT 101 pattern
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
      const queryCall = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[0][0];

      // Should have subquery with LIMIT threshold+1
      expect(queryCall).toContain("LIMIT 101");
      expect(queryCall).toContain("SELECT COUNT(*)");
    });
  });
});
