/**
 * Tests for near-match filter expansion applied to map listings.
 *
 * Validates that expandFiltersForNearMatches produces correct expanded
 * params that would be used in getSearchDocMapListingsInternal when
 * nearMatches=true is set.
 */
import { expandFiltersForNearMatches, NEAR_MATCH_RULES } from "@/lib/near-matches";
import type { FilterParams } from "@/lib/search-params";

describe("expandFiltersForNearMatches for map listings", () => {
  it("returns listings in expanded price range when nearMatches=true", () => {
    const params: FilterParams = {
      maxPrice: 1000,
      bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.3 },
      nearMatches: true,
    };

    const { expanded, expandedDimension } = expandFiltersForNearMatches(params);

    expect(expandedDimension).toBe("price");
    // maxPrice should be expanded by +10%: 1000 * 1.1 = 1100
    expect(expanded.maxPrice).toBe(Math.ceil(1000 * (1 + NEAR_MATCH_RULES.price.expandPercent / 100)));
    expect(expanded.maxPrice).toBe(1100);
    // Bounds should be preserved
    expect(expanded.bounds).toEqual(params.bounds);
  });

  it("expands minPrice down by percentage", () => {
    const params: FilterParams = {
      minPrice: 500,
      maxPrice: 1000,
      bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.3 },
      nearMatches: true,
    };

    const { expanded } = expandFiltersForNearMatches(params);

    // minPrice should be expanded by -10%: 500 * 0.9 = 450
    expect(expanded.minPrice).toBe(Math.floor(500 * (1 - NEAR_MATCH_RULES.price.expandPercent / 100)));
    expect(expanded.minPrice).toBe(450);
    expect(expanded.maxPrice).toBe(1100);
  });

  it("expands moveInDate when no price filters", () => {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 2);
    const dateStr = futureDate.toISOString().split("T")[0];

    const params: FilterParams = {
      moveInDate: dateStr,
      bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.3 },
      nearMatches: true,
    };

    const { expanded, expandedDimension } = expandFiltersForNearMatches(params);

    expect(expandedDimension).toBe("date");
    // Date should be expanded back by 7 days
    const expandedDate = new Date(expanded.moveInDate + "T00:00:00");
    const originalDate = new Date(dateStr + "T00:00:00");
    const daysDiff = Math.round(
      (originalDate.getTime() - expandedDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(daysDiff).toBe(NEAR_MATCH_RULES.date.expandDays);
  });

  it("returns null expansion when no expandable filters", () => {
    const params: FilterParams = {
      roomType: "Private Room",
      bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.3 },
      nearMatches: true,
    };

    const { expandedDimension } = expandFiltersForNearMatches(params);

    expect(expandedDimension).toBeNull();
  });

  it("preserves all non-expanded filter params", () => {
    const params: FilterParams = {
      maxPrice: 1000,
      roomType: "Private Room",
      amenities: ["Wifi", "AC"],
      bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.3 },
      nearMatches: true,
    };

    const { expanded } = expandFiltersForNearMatches(params);

    expect(expanded.roomType).toBe("Private Room");
    expect(expanded.amenities).toEqual(["Wifi", "AC"]);
    expect(expanded.bounds).toEqual(params.bounds);
  });
});
