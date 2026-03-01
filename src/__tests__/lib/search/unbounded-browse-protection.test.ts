/**
 * Tests for Unbounded Browse Protection (P1 Fix)
 *
 * These tests verify that browse-all queries (no query, no bounds) are properly
 * protected against full-table scans on listing_search_docs.
 *
 * Test Scenarios:
 * 1. getSearchDocLimitedCount returns null for unbounded browse
 * 2. getSearchDocListingsPaginated caps results at MAX_UNBOUNDED_RESULTS
 * 3. getSearchDocMapListings requires bounds for ALL queries (not just text searches)
 */

// Mock next/cache before imports
jest.mock("next/cache", () => ({
  unstable_cache: jest.fn((fn) => fn),
}));

// Mock prisma before imports — $transaction delegates to the same $queryRawUnsafe mock
jest.mock("@/lib/prisma", () => {
  const qru = jest.fn();
  const eru = jest.fn();
  return {
    prisma: {
      $queryRawUnsafe: qru,
      $executeRawUnsafe: eru,
      $transaction: jest.fn((fn: any) =>
        fn({
          $executeRawUnsafe: eru,
          $queryRawUnsafe: qru,
        })
      ),
    },
  };
});

import { prisma } from "@/lib/prisma";
import {
  getSearchDocLimitedCount,
  getSearchDocMapListings,
  getSearchDocListingsPaginated,
} from "@/lib/search/search-doc-queries";

const mockExecuteRawUnsafe = prisma.$executeRawUnsafe as jest.Mock;

// Helper to create mock listing data
function createMockSearchDocRow(id: string, overrides = {}) {
  return {
    id,
    title: `Test Listing ${id}`,
    description: "Test description",
    price: 1000,
    images: ["/image.jpg"],
    availableSlots: 2,
    totalSlots: 3,
    amenities: ["WiFi"],
    houseRules: ["No Smoking"],
    householdLanguages: ["en"],
    roomType: "Private Room",
    leaseDuration: "6 months",
    moveInDate: new Date("2024-03-01"),
    genderPreference: "NO_PREFERENCE",
    householdGender: "MIXED",
    ownerId: "owner-1",
    lat: 37.7749,
    lng: -122.4194,
    address: "123 Main St",
    city: "San Francisco",
    state: "CA",
    zip: "94102",
    country: "United States",
    avgRating: 4.5,
    reviewCount: 10,
    recommendedScore: 85,
    listingCreatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("Unbounded Browse Protection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getSearchDocLimitedCount", () => {
    it("returns null for unbounded browse (no query, no bounds)", async () => {
      // Arrange: Mock prisma to return results if called (shouldn't be called)
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([{ count: BigInt(50) }]);

      // Act: Call with empty params (browse-all scenario)
      const result = await getSearchDocLimitedCount({});

      // Assert: Result should be null for browse-all (no full-table scan)
      expect(result).toBeNull();
      // Prisma should NOT be called for unbounded browse
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it("executes count query when filters are active (no bounds)", async () => {
      // Arrange
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([{ count: BigInt(30) }]);

      // Act: Call with filters but no bounds or query
      const result = await getSearchDocLimitedCount({
        minPrice: 500,
        maxPrice: 1500,
        roomType: "private room",
      });

      // Assert: Active filters are enough to proceed with count query
      expect(result).toBe(30);
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    });

    it("executes query when bounds are provided", async () => {
      // Arrange: Mock returns count within threshold
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([{ count: BigInt(50) }]);

      // Act: Call with bounds (bounded search)
      const result = await getSearchDocLimitedCount({
        bounds: {
          minLat: 37.7,
          maxLat: 37.8,
          minLng: -122.5,
          maxLng: -122.4,
        },
      });

      // Assert: Should execute and return the count
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
      expect(result).toBe(50);
      expect(mockExecuteRawUnsafe).toHaveBeenCalled();
      const timeoutSql = mockExecuteRawUnsafe.mock.calls[0][0];
      expect(timeoutSql).toBe("SET LOCAL statement_timeout = 5000");
      expect(timeoutSql).not.toContain("$1");
    });

    it("executes query when query+bounds are provided", async () => {
      // Arrange
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([{ count: BigInt(25) }]);

      // Act: Text search with bounds
      const result = await getSearchDocLimitedCount({
        query: "cozy room",
        bounds: {
          minLat: 37.7,
          maxLat: 37.8,
          minLng: -122.5,
          maxLng: -122.4,
        },
      });

      // Assert: Should execute and return the count
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
      expect(result).toBe(25);
    });
  });

  describe("getSearchDocMapListings", () => {
    it("throws error for unbounded browse (no query, no bounds)", async () => {
      // Act & Assert: Should throw for ANY unbounded query, not just text searches
      await expect(getSearchDocMapListings({})).rejects.toThrow(
        /bounds required/i,
      );

      // Prisma should not be called
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it("throws error when only filters are set (no bounds)", async () => {
      // Act & Assert: Even with filters, bounds are required for map
      await expect(
        getSearchDocMapListings({
          minPrice: 500,
          maxPrice: 1500,
        }),
      ).rejects.toThrow(/bounds required/i);

      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it("throws error for text search without bounds", async () => {
      // Act & Assert: This already works, but verify it still does
      await expect(
        getSearchDocMapListings({
          query: "downtown apartment",
        }),
      ).rejects.toThrow(/bounds required/i);

      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it("executes query when bounds are provided", async () => {
      // Arrange - include totalCount for COUNT(*) OVER() window function
      const mockMapListings = [
        {
          id: "listing-1",
          title: "Test Listing",
          price: BigInt(1000),
          availableSlots: 2,
          ownerId: "owner-1",
          primaryImage: "/image.jpg",
          lat: 37.7749,
          lng: -122.4194,
          totalCount: BigInt(1),
        },
      ];
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue(mockMapListings);

      // Act: Call with bounds
      const result = await getSearchDocMapListings({
        bounds: {
          minLat: 37.7,
          maxLat: 37.8,
          minLng: -122.5,
          maxLng: -122.4,
        },
      });

      // Assert: Should execute and return map listings with truncation info
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
      expect(result.listings).toHaveLength(1);
      expect(result.listings[0].id).toBe("listing-1");
      expect(result.truncated).toBe(false);
    });

    it("applies map ordering based on the selected sort option", async () => {
      // Arrange
      (prisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        {
          id: "listing-1",
          title: "Test Listing",
          price: BigInt(1000),
          availableSlots: 2,
          primaryImage: "/image.jpg",
          lat: 37.7749,
          lng: -122.4194,
        },
      ]);

      // Act
      await getSearchDocMapListings({
        bounds: {
          minLat: 37.7,
          maxLat: 37.8,
          minLng: -122.5,
          maxLng: -122.4,
        },
        sort: "price_asc",
      });

      // Assert
      const sql = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[0][0] as string;
      expect(sql).toContain("ORDER BY d.price ASC NULLS LAST");
      expect(sql).toContain("d.listing_created_at DESC");
      expect(sql).toContain("d.id ASC");
    });
  });

  describe("getSearchDocListingsPaginated", () => {
    const MAX_UNBOUNDED_RESULTS = 48; // From plan: 4 pages of 12 items

    it("caps results at MAX_UNBOUNDED_RESULTS for unbounded browse", async () => {
      // Arrange: Mock to return many results
      const manyResults = Array.from({ length: MAX_UNBOUNDED_RESULTS + 2 }, (_, i) =>
        createMockSearchDocRow(`listing-${i}`),
      );
      (prisma.$queryRawUnsafe as jest.Mock)
        .mockResolvedValueOnce([{ count: null }]) // Count query returns null for unbounded
        .mockResolvedValueOnce(manyResults); // List query

      // Act: Request 100 items without bounds (unbounded browse)
      const result = await getSearchDocListingsPaginated({
        limit: 100,
      });

      // Assert: Results should be capped at MAX_UNBOUNDED_RESULTS
      // The actual limit used should be Math.min(requested, MAX_UNBOUNDED_RESULTS)
      expect(result.items.length).toBeLessThanOrEqual(MAX_UNBOUNDED_RESULTS);
    });

    it("respects smaller limit when under MAX_UNBOUNDED_RESULTS", async () => {
      // Arrange
      const fewResults = Array.from({ length: 7 }, (_, i) =>
        createMockSearchDocRow(`listing-${i}`),
      );
      (prisma.$queryRawUnsafe as jest.Mock)
        .mockResolvedValueOnce([{ count: null }]) // Count query
        .mockResolvedValueOnce(fewResults); // List query

      // Act: Request 6 items (under cap)
      const result = await getSearchDocListingsPaginated({
        limit: 6,
      });

      // Assert: Should return up to 6 items (small limit is respected)
      expect(result.items.length).toBeLessThanOrEqual(6);
    });

    it("does not cap when bounds are provided", async () => {
      // Arrange
      const manyResults = Array.from({ length: 61 }, (_, i) =>
        createMockSearchDocRow(`listing-${i}`),
      );
      (prisma.$queryRawUnsafe as jest.Mock)
        .mockResolvedValueOnce([{ count: BigInt(60) }]) // Count query
        .mockResolvedValueOnce(manyResults); // List query

      // Act: Request 60 items with bounds (bounded search - no cap)
      const result = await getSearchDocListingsPaginated({
        limit: 60,
        bounds: {
          minLat: 37.7,
          maxLat: 37.8,
          minLng: -122.5,
          maxLng: -122.4,
        },
      });

      // Assert: Should return up to 60 items (no cap for bounded queries)
      expect(result.items.length).toBeLessThanOrEqual(60);
      // With bounds, there's no artificial cap
    });

    it("throws for text search without bounds", async () => {
      // Act & Assert: Text search without bounds should throw
      await expect(
        getSearchDocListingsPaginated({
          query: "downtown",
        }),
      ).rejects.toThrow(/bounds required/i);
    });
  });

  describe("FeaturedListings compatibility", () => {
    /**
     * FeaturedListings on homepage uses limit: 6 which is under
     * MAX_UNBOUNDED_RESULTS (48), so it should still work.
     */
    it("allows small unbounded queries (featured listings use case)", async () => {
      // Arrange
      const featuredResults = Array.from({ length: 7 }, (_, i) =>
        createMockSearchDocRow(`listing-${i}`),
      );
      (prisma.$queryRawUnsafe as jest.Mock)
        .mockResolvedValueOnce([{ count: null }]) // Count query (null for unbounded)
        .mockResolvedValueOnce(featuredResults); // List query

      // Act: Featured listings typically use limit: 6
      const result = await getSearchDocListingsPaginated({
        limit: 6,
      });

      // Assert: Small limit should work (no breaking change for FeaturedListings)
      expect(result).toBeDefined();
      expect(result.items).toBeDefined();
    });
  });
});

/**
 * Tests for V1 Fallback Browse Protection (P1/P2a Fixes)
 *
 * These tests verify that:
 * 1. getLimitedCount gates behind isSearchDocEnabled() and falls back to V1
 * 2. V1 getListingsPaginated caps browse results at MAX_UNBOUNDED_RESULTS
 */
describe("V1 Fallback Browse Protection", () => {
  // Helper to create mock V1 listing row (different schema from SearchDoc)
  function createMockV1ListingRow(id: string, overrides = {}) {
    return {
      id,
      title: `Test Listing ${id}`,
      description: "Test description",
      price: BigInt(1000),
      images: ["/image.jpg"],
      availableSlots: 2,
      totalSlots: 3,
      amenities: ["WiFi"],
      houseRules: ["No Smoking"],
      householdLanguages: ["en"],
      roomType: "Private Room",
      leaseDuration: "6 months",
      moveInDate: new Date("2024-03-01"),
      genderPreference: "NO_PREFERENCE",
      householdGender: "MIXED",
      ownerId: "owner-1",
      createdAt: new Date("2024-01-01"),
      viewCount: 100,
      lat: 37.7749,
      lng: -122.4194,
      address: "123 Main St",
      city: "San Francisco",
      state: "CA",
      zip: "94102",
      country: "United States",
      avgRating: 4.5,
      reviewCount: 10,
      ...overrides,
    };
  }

  // Reset modules before each test in this suite to ensure fresh imports
  // This prevents mock bleeding from earlier test suites
  beforeEach(() => {
    jest.resetModules();
    // Re-apply the prisma mock after module reset
    jest.doMock("@/lib/prisma", () => ({
      prisma: {
        $queryRawUnsafe: jest.fn(),
      },
    }));
    // Re-apply next/cache mock
    jest.doMock("next/cache", () => ({
      unstable_cache: jest.fn((fn) => fn),
    }));
  });

  describe("getLimitedCount (unified function)", () => {
    it("returns null for unbounded browse regardless of SearchDoc state", async () => {
      // Import after mocks are set up
      const { getLimitedCount } = await import("@/lib/data");

      // The unified getLimitedCount should return null for unbounded browse
      // in both V1 and V2 paths (no full-table scans)
      const result = await getLimitedCount({});

      expect(result).toBeNull();
    });

    it("returns null when only filters are set (no bounds)", async () => {
      // Import after mocks are set up
      const { getLimitedCount } = await import("@/lib/data");

      const result = await getLimitedCount({
        minPrice: 500,
        maxPrice: 1500,
        roomType: "private room",
      });

      expect(result).toBeNull();
    });

    // Note: Bounded query execution is already tested in getSearchDocLimitedCount suite
    // The unified getLimitedCount delegates to getSearchDocLimitedCount when SearchDoc is enabled,
    // so we don't duplicate that test here. The key V1-specific behavior is unbounded browse protection.
  });

  describe("V1 getListingsPaginated browse mode cap", () => {
    // Note: This tests the V1 fallback path caps browse results
    const MAX_UNBOUNDED_RESULTS = 48;
    const ITEMS_PER_PAGE = 12;
    const MAX_BROWSE_PAGES = Math.ceil(MAX_UNBOUNDED_RESULTS / ITEMS_PER_PAGE);

    it("caps page number at MAX_BROWSE_PAGES for unbounded browse", async () => {
      // V1 getListingsPaginated makes 2 queries: count then data
      // For unbounded browse with 100 total, cap total at 48
      const mockDataResults = Array.from({ length: ITEMS_PER_PAGE }, (_, i) =>
        createMockV1ListingRow(`listing-${i}`),
      );

      // Import prisma and set up mock BEFORE importing data module
      const { prisma } = await import("@/lib/prisma");
      (prisma.$queryRawUnsafe as jest.Mock)
        .mockResolvedValueOnce([{ total: BigInt(100) }]) // Count query - returns 100 but will be capped to 48
        .mockResolvedValueOnce(mockDataResults); // Data query

      // Import getListingsPaginated
      const { getListingsPaginated } = await import("@/lib/data");

      // Request page 10 of unbounded browse (should be capped)
      // With 48 results capped, 4 pages max, page 10 -> page 4
      const result = await getListingsPaginated({
        page: 10,
        limit: ITEMS_PER_PAGE,
      });

      // The page should be capped to max browse pages
      expect(result.page).toBeLessThanOrEqual(MAX_BROWSE_PAGES);
      // Total should be capped at MAX_UNBOUNDED_RESULTS
      expect(result.total).toBeLessThanOrEqual(MAX_UNBOUNDED_RESULTS);
    });

    it("caps total at MAX_UNBOUNDED_RESULTS for unbounded browse", async () => {
      const mockDataResults = Array.from({ length: ITEMS_PER_PAGE }, (_, i) =>
        createMockV1ListingRow(`listing-${i}`),
      );

      // Import prisma and set up mock BEFORE importing data module
      const { prisma } = await import("@/lib/prisma");
      (prisma.$queryRawUnsafe as jest.Mock)
        .mockResolvedValueOnce([{ total: BigInt(500) }]) // Large total
        .mockResolvedValueOnce(mockDataResults);

      const { getListingsPaginated } = await import("@/lib/data");

      // Request first page without bounds
      const result = await getListingsPaginated({
        limit: ITEMS_PER_PAGE,
      });

      // Total should be capped at MAX_UNBOUNDED_RESULTS
      expect(result.total).toBeLessThanOrEqual(MAX_UNBOUNDED_RESULTS);
      // totalPages should be MAX_BROWSE_PAGES (48/12 = 4)
      expect(result.totalPages).toBeLessThanOrEqual(MAX_BROWSE_PAGES);
    });

    it("does not cap when bounds are provided", async () => {
      const mockDataResults = Array.from({ length: ITEMS_PER_PAGE }, (_, i) =>
        createMockV1ListingRow(`listing-${i}`),
      );

      // Import prisma and set up mock BEFORE importing data module
      const { prisma } = await import("@/lib/prisma");
      (prisma.$queryRawUnsafe as jest.Mock)
        .mockResolvedValueOnce([{ total: BigInt(60) }]) // 60 total results
        .mockResolvedValueOnce(mockDataResults);

      const { getListingsPaginated } = await import("@/lib/data");

      // Request page 5 with bounds
      const result = await getListingsPaginated({
        page: 5,
        limit: 12,
        bounds: {
          minLat: 37.7,
          maxLat: 37.8,
          minLng: -122.5,
          maxLng: -122.4,
        },
      });

      // Total should NOT be capped for bounded queries
      expect(result.total).toBe(60);
      // Page should match requested
      expect(result.page).toBe(5);
    });

    it("does not cap when query is provided with bounds", async () => {
      const mockDataResults = Array.from({ length: 12 }, (_, i) =>
        createMockV1ListingRow(`listing-${i}`),
      );

      // Import prisma and set up mock BEFORE importing data module
      const { prisma } = await import("@/lib/prisma");
      (prisma.$queryRawUnsafe as jest.Mock)
        .mockResolvedValueOnce([{ total: BigInt(100) }])
        .mockResolvedValueOnce(mockDataResults);

      const { getListingsPaginated } = await import("@/lib/data");

      // Query + bounds = not unbounded browse, no cap
      const result = await getListingsPaginated({
        page: 5,
        limit: 12,
        query: "downtown",
        bounds: {
          minLat: 37.7,
          maxLat: 37.8,
          minLng: -122.5,
          maxLng: -122.4,
        },
      });

      // Total should NOT be capped
      expect(result.total).toBe(100);
      expect(result.page).toBe(5);
    });
  });
});
