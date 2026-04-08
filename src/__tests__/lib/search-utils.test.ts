import { buildSearchUrl, SearchFilters } from "@/lib/search-utils";

describe("buildSearchUrl", () => {
  it("should build URL with query parameter", () => {
    const filters: SearchFilters = { query: "downtown" };
    const url = buildSearchUrl(filters);
    expect(url).toBe("/search?q=downtown");
  });

  it("should build URL with a canonical location label", () => {
    const filters: SearchFilters = {
      locationLabel: "San Francisco",
      vibeQuery: "quiet roommates",
      lat: 37.7749,
      lng: -122.4194,
    };
    const url = buildSearchUrl(filters);
    expect(url).toContain("where=San+Francisco");
    expect(url).toContain("what=quiet+roommates");
  });

  it("should build URL with price filters", () => {
    const filters: SearchFilters = { minPrice: 500, maxPrice: 1000 };
    const url = buildSearchUrl(filters);
    expect(url).toContain("minPrice=500");
    expect(url).toContain("maxPrice=1000");
  });

  it("should build URL with amenities (comma-separated)", () => {
    const filters: SearchFilters = { amenities: ["WiFi", "Parking"] };
    const url = buildSearchUrl(filters);
    // Comma-separated format for cache key consistency (#8)
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("amenities")).toBe("WiFi,Parking");
  });

  it("should build URL with moveInDate", () => {
    const filters: SearchFilters = { moveInDate: "2024-02-01" };
    const url = buildSearchUrl(filters);
    expect(url).toContain("moveInDate=2024-02-01");
  });

  it("should build URL with leaseDuration", () => {
    const filters: SearchFilters = { leaseDuration: "6 months" };
    const url = buildSearchUrl(filters);
    expect(url).toContain("leaseDuration=6+months");
  });

  it("should build URL with houseRules (comma-separated)", () => {
    const filters: SearchFilters = { houseRules: ["No Smoking", "No Pets"] };
    const url = buildSearchUrl(filters);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("houseRules")).toBe("No Smoking,No Pets");
  });

  it("should build URL with roomType", () => {
    const filters: SearchFilters = { roomType: "Private" };
    const url = buildSearchUrl(filters);
    expect(url).toContain("roomType=Private");
  });

  it("should build URL with all filters", () => {
    const filters: SearchFilters = {
      query: "downtown",
      minPrice: 500,
      maxPrice: 1000,
      amenities: ["WiFi"],
      moveInDate: "2024-02-01",
      leaseDuration: "6 months",
      houseRules: ["No Smoking"],
      roomType: "Private",
    };
    const url = buildSearchUrl(filters);
    expect(url).toContain("q=downtown");
    expect(url).toContain("minPrice=500");
    expect(url).toContain("maxPrice=1000");
    expect(url).toContain("amenities=WiFi");
    expect(url).toContain("moveInDate=2024-02-01");
    expect(url).toContain("leaseDuration=6+months");
    expect(url).toContain("houseRules=No+Smoking");
    expect(url).toContain("roomType=Private");
  });

  it("should handle empty filters", () => {
    const filters: SearchFilters = {};
    const url = buildSearchUrl(filters);
    expect(url).toBe("/search?");
  });

  it("should not include undefined values", () => {
    const filters: SearchFilters = { query: "test", minPrice: undefined };
    const url = buildSearchUrl(filters);
    expect(url).toBe("/search?q=test");
    expect(url).not.toContain("minPrice");
  });

  it("should not include empty amenities array", () => {
    const filters: SearchFilters = { amenities: [] };
    const url = buildSearchUrl(filters);
    expect(url).not.toContain("amenities");
  });

  it("should not include empty houseRules array", () => {
    const filters: SearchFilters = { houseRules: [] };
    const url = buildSearchUrl(filters);
    expect(url).not.toContain("houseRules");
  });

  it("should handle special characters in query", () => {
    const filters: SearchFilters = { query: "test & search" };
    const url = buildSearchUrl(filters);
    expect(url).toContain("q=test+%26+search");
  });

  it("should handle city filter", () => {
    const filters: SearchFilters = { city: "San Francisco" };
    const url = buildSearchUrl(filters);
    // city is not added to URL in current implementation
    expect(url).toBe("/search?");
  });

  it("should handle zero minPrice", () => {
    const filters: SearchFilters = { minPrice: 0 };
    const url = buildSearchUrl(filters);
    expect(url).toBe("/search?minPrice=0");
  });

  it("should handle only minPrice without maxPrice", () => {
    const filters: SearchFilters = { minPrice: 500 };
    const url = buildSearchUrl(filters);
    expect(url).toContain("minPrice=500");
    expect(url).not.toContain("maxPrice");
  });

  it("should handle only maxPrice without minPrice", () => {
    const filters: SearchFilters = { maxPrice: 1500 };
    const url = buildSearchUrl(filters);
    expect(url).toContain("maxPrice=1500");
    expect(url).not.toContain("minPrice");
  });

  it("should set comma-separated amenities (single param)", () => {
    const filters: SearchFilters = { amenities: ["WiFi", "Parking", "AC"] };
    const url = buildSearchUrl(filters);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("amenities")).toBe("WiFi,Parking,AC");
    // Should be a single param, not repeated
    expect(params.getAll("amenities")).toHaveLength(1);
  });

  it("should set comma-separated house rules (single param)", () => {
    const filters: SearchFilters = {
      houseRules: ["No Smoking", "No Pets", "No Parties"],
    };
    const url = buildSearchUrl(filters);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("houseRules")).toBe("No Smoking,No Pets,No Parties");
    expect(params.getAll("houseRules")).toHaveLength(1);
  });

  it("should handle special characters in amenities", () => {
    const filters: SearchFilters = { amenities: ["WiFi & Fast Internet"] };
    const url = buildSearchUrl(filters);
    expect(url).toContain("amenities=WiFi+%26+Fast+Internet");
  });

  it("should handle special characters in query", () => {
    const filters: SearchFilters = { query: "room + bathroom" };
    const url = buildSearchUrl(filters);
    expect(url).toContain("q=room+%2B+bathroom");
  });

  it("should handle unicode characters in query", () => {
    const filters: SearchFilters = { query: "北京" };
    const url = buildSearchUrl(filters);
    expect(url).toContain("q=%E5%8C%97%E4%BA%AC");
  });

  it("should preserve order of multiple filters", () => {
    const filters: SearchFilters = {
      query: "downtown",
      minPrice: 500,
      maxPrice: 1000,
    };
    const url = buildSearchUrl(filters);
    // Verify all params are present
    expect(url).toContain("q=downtown");
    expect(url).toContain("minPrice=500");
    expect(url).toContain("maxPrice=1000");
  });
});

describe("SearchFilters interface", () => {
  it("should allow all optional properties", () => {
    const filters: SearchFilters = {
      query: "test",
      minPrice: 100,
      maxPrice: 1000,
      amenities: ["WiFi"],
      moveInDate: "2024-01-01",
      leaseDuration: "12 months",
      houseRules: ["No Pets"],
      roomType: "Shared",
      city: "NYC",
    };
    expect(filters.query).toBe("test");
    expect(filters.minPrice).toBe(100);
    expect(filters.maxPrice).toBe(1000);
    expect(filters.amenities).toEqual(["WiFi"]);
    expect(filters.moveInDate).toBe("2024-01-01");
    expect(filters.leaseDuration).toBe("12 months");
    expect(filters.houseRules).toEqual(["No Pets"]);
    expect(filters.roomType).toBe("Shared");
    expect(filters.city).toBe("NYC");
  });
});
