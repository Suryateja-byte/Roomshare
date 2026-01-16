/**
 * Tests for map marker utility functions
 *
 * Tests coordinate-based grouping and price range formatting
 * for stacked markers on the map.
 */

import {
  COORD_PRECISION,
  groupListingsByCoord,
  formatStackPriceRange,
  type MapMarkerListing,
  type ListingGroup,
} from "@/lib/maps/marker-utils";

describe("marker-utils", () => {
  describe("COORD_PRECISION", () => {
    it("should be 5 decimal places (~1.1m at equator)", () => {
      expect(COORD_PRECISION).toBe(5);
    });
  });

  describe("groupListingsByCoord", () => {
    const createListing = (
      id: string,
      lat: number,
      lng: number,
      price: number = 1000,
    ): MapMarkerListing => ({
      id,
      title: `Listing ${id}`,
      price,
      availableSlots: 1,
      location: { lat, lng },
    });

    it("should return empty array for empty input", () => {
      expect(groupListingsByCoord([])).toEqual([]);
    });

    it("should create one group for a single listing", () => {
      const listings = [createListing("1", 37.7749, -122.4194, 1500)];
      const groups = groupListingsByCoord(listings);

      expect(groups).toHaveLength(1);
      expect(groups[0].listings).toHaveLength(1);
      expect(groups[0].listings[0].id).toBe("1");
      expect(groups[0].lat).toBe(37.7749);
      expect(groups[0].lng).toBe(-122.4194);
    });

    it("should create separate groups for different coordinates", () => {
      const listings = [
        createListing("1", 37.7749, -122.4194),
        createListing("2", 37.785, -122.41),
        createListing("3", 37.8, -122.4),
      ];
      const groups = groupListingsByCoord(listings);

      expect(groups).toHaveLength(3);
      expect(groups.map((g) => g.listings.length)).toEqual([1, 1, 1]);
    });

    it("should group 3 listings at exact same coordinates into 1 group", () => {
      const listings = [
        createListing("1", 37.7749, -122.4194, 900),
        createListing("2", 37.7749, -122.4194, 1100),
        createListing("3", 37.7749, -122.4194, 1000),
      ];
      const groups = groupListingsByCoord(listings);

      expect(groups).toHaveLength(1);
      expect(groups[0].listings).toHaveLength(3);
      expect(groups[0].listings.map((l) => l.id).sort()).toEqual([
        "1",
        "2",
        "3",
      ]);
    });

    it("should use TRUE coordinates (first listing) for group position", () => {
      // Two listings at exact same 5-decimal coord
      const listings = [
        createListing("1", 37.7749, -122.4194),
        createListing("2", 37.7749, -122.4194),
      ];
      const groups = groupListingsByCoord(listings);

      // Should group together and use first listing's coords
      expect(groups).toHaveLength(1);
      expect(groups[0].lat).toBe(37.7749);
      expect(groups[0].lng).toBe(-122.4194);
      expect(groups[0].listings).toHaveLength(2);
    });

    it("should group listings within precision (~1.1m) together", () => {
      // These coordinates differ by less than 0.00001 degrees (~1.1m)
      const listings = [
        createListing("1", 37.7749, -122.4194),
        createListing("2", 37.774905, -122.419405), // ~0.5m difference
      ];
      const groups = groupListingsByCoord(listings);

      expect(groups).toHaveLength(1);
      expect(groups[0].listings).toHaveLength(2);
    });

    it("should NOT group listings beyond precision (~11m apart)", () => {
      // These coordinates differ by 0.0001 degrees (~11m)
      const listings = [
        createListing("1", 37.7749, -122.4194),
        createListing("2", 37.775, -122.4194), // ~11m north
      ];
      const groups = groupListingsByCoord(listings);

      expect(groups).toHaveLength(2);
    });

    it("should generate unique keys for each group", () => {
      const listings = [
        createListing("1", 37.7749, -122.4194),
        createListing("2", 37.7849, -122.4094),
      ];
      const groups = groupListingsByCoord(listings);

      const keys = groups.map((g) => g.key);
      expect(new Set(keys).size).toBe(2);
      expect(keys[0]).toContain("37.77490");
      expect(keys[0]).toContain("-122.41940");
    });

    it("should support custom precision", () => {
      const listings = [
        createListing("1", 37.77, -122.41),
        createListing("2", 37.78, -122.42), // Different at precision 2
      ];

      // With precision 2, these should be different groups
      const groups2 = groupListingsByCoord(listings, 2);
      expect(groups2).toHaveLength(2);

      // With precision 1, they should be same group
      const groups1 = groupListingsByCoord(listings, 1);
      expect(groups1).toHaveLength(1);
    });
  });

  describe("formatStackPriceRange", () => {
    const createListing = (price: number): MapMarkerListing => ({
      id: "1",
      title: "Test",
      price,
      availableSlots: 1,
      location: { lat: 0, lng: 0 },
    });

    it("should return empty string for empty array", () => {
      expect(formatStackPriceRange([])).toBe("");
    });

    it("should format single listing price", () => {
      const listings = [createListing(1200)];
      expect(formatStackPriceRange(listings)).toBe("$1,200");
    });

    it("should format single price when all listings have same price", () => {
      const listings = [
        createListing(1500),
        createListing(1500),
        createListing(1500),
      ];
      expect(formatStackPriceRange(listings)).toBe("$1,500");
    });

    it("should format price range when listings have different prices", () => {
      const listings = [
        createListing(850),
        createListing(1200),
        createListing(1050),
      ];
      // Should show min–max: $850–$1,200
      expect(formatStackPriceRange(listings)).toBe("$850–$1,200");
    });

    it("should handle large prices with proper comma formatting", () => {
      const listings = [createListing(10000), createListing(15000)];
      expect(formatStackPriceRange(listings)).toBe("$10,000–$15,000");
    });

    it("should handle decimal prices (rounds in display)", () => {
      // Even though they round to same display value, the comparison
      // happens on raw numbers so this shows a range
      const listings = [createListing(999.99), createListing(1000.01)];
      expect(formatStackPriceRange(listings)).toBe("$1,000–$1,000");

      // When prices are truly equal, shows single price
      const samePrices = [createListing(1000), createListing(1000)];
      expect(formatStackPriceRange(samePrices)).toBe("$1,000");
    });

    it("should use en-dash (–) not hyphen (-) for range", () => {
      const listings = [createListing(800), createListing(1200)];
      const result = formatStackPriceRange(listings);
      expect(result).toContain("–"); // en-dash U+2013
      expect(result).not.toMatch(/\$\d+-\$\d+/); // not hyphen
    });
  });
});
