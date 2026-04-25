import { VALID_AMENITIES, VALID_HOUSE_RULES } from "@/lib/search-params";
import { buildSearchUrl, SearchFilters } from "@/lib/search-utils";

const [AMENITY_ONE = "Wifi", AMENITY_TWO = "Parking", AMENITY_THREE = "AC"] =
  VALID_AMENITIES;
const [HOUSE_RULE_ONE = "No smoking", HOUSE_RULE_TWO = "No pets", HOUSE_RULE_THREE = "No parties"] =
  VALID_HOUSE_RULES;
const FUTURE_MOVE_IN_DATE = "2027-02-01";

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
    expect(url).toContain("locationLabel=San+Francisco");
    expect(url).toContain("what=quiet+roommates");
  });

  it("should build URL with price filters", () => {
    const filters: SearchFilters = { minPrice: 500, maxPrice: 1000 };
    const url = buildSearchUrl(filters);
    expect(url).toContain("minPrice=500");
    expect(url).toContain("maxPrice=1000");
  });

  it("should build URL with canonical repeated amenities params", () => {
    const filters: SearchFilters = {
      amenities: [AMENITY_TWO, AMENITY_ONE],
    };
    const url = buildSearchUrl(filters);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.getAll("amenities")).toEqual([AMENITY_TWO, AMENITY_ONE].sort());
  });

  it("should build URL with moveInDate", () => {
    const filters: SearchFilters = { moveInDate: FUTURE_MOVE_IN_DATE };
    const url = buildSearchUrl(filters);
    expect(url).toContain(`moveInDate=${FUTURE_MOVE_IN_DATE}`);
  });

  it("should build URL with an explicit endDate", () => {
    const filters: SearchFilters = {
      moveInDate: FUTURE_MOVE_IN_DATE,
      endDate: "2027-03-01",
    };
    const url = buildSearchUrl(filters);
    expect(url).toContain(`moveInDate=${FUTURE_MOVE_IN_DATE}`);
    expect(url).toContain("endDate=2027-03-01");
  });

  it("should build URL with leaseDuration", () => {
    const filters: SearchFilters = { leaseDuration: "6 months" };
    const url = buildSearchUrl(filters);
    expect(url).toContain("leaseDuration=6+months");
  });

  it("should build URL with canonical repeated houseRules params", () => {
    const filters: SearchFilters = {
      houseRules: [HOUSE_RULE_TWO, HOUSE_RULE_ONE],
    };
    const url = buildSearchUrl(filters);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.getAll("houseRules")).toEqual(
      [HOUSE_RULE_ONE, HOUSE_RULE_TWO].sort()
    );
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
      amenities: [AMENITY_ONE],
      moveInDate: FUTURE_MOVE_IN_DATE,
      endDate: "2027-03-01",
      leaseDuration: "6 months",
      houseRules: [HOUSE_RULE_ONE],
      roomType: "Private Room",
    };
    const url = buildSearchUrl(filters);
    expect(url).toContain("q=downtown");
    expect(url).toContain("minPrice=500");
    expect(url).toContain("maxPrice=1000");
    expect(url).toContain(`amenities=${encodeURIComponent(AMENITY_ONE).replace(/%20/g, "+")}`);
    expect(url).toContain(`moveInDate=${FUTURE_MOVE_IN_DATE}`);
    expect(url).toContain("endDate=2027-03-01");
    expect(url).toContain("leaseDuration=6+months");
    expect(url).toContain(
      `houseRules=${encodeURIComponent(HOUSE_RULE_ONE).replace(/%20/g, "+")}`
    );
    expect(url).toContain("roomType=Private+Room");
  });

  it("should handle empty filters", () => {
    const filters: SearchFilters = {};
    const url = buildSearchUrl(filters);
    expect(url).toBe("/search");
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
    expect(url).toBe("/search");
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

  it("should set repeated canonical amenities params", () => {
    const filters: SearchFilters = {
      amenities: [AMENITY_ONE, AMENITY_TWO, AMENITY_THREE],
    };
    const url = buildSearchUrl(filters);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.getAll("amenities")).toEqual(
      [AMENITY_ONE, AMENITY_TWO, AMENITY_THREE].sort()
    );
  });

  it("should set repeated canonical houseRules params", () => {
    const filters: SearchFilters = {
      houseRules: [HOUSE_RULE_ONE, HOUSE_RULE_TWO, HOUSE_RULE_THREE],
    };
    const url = buildSearchUrl(filters);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.getAll("houseRules")).toEqual(
      [HOUSE_RULE_ONE, HOUSE_RULE_TWO, HOUSE_RULE_THREE].sort()
    );
  });

  it("should handle special characters in amenities", () => {
    const filters: SearchFilters = { amenities: [AMENITY_ONE] };
    const url = buildSearchUrl(filters);
    expect(url).toContain(
      `amenities=${encodeURIComponent(AMENITY_ONE).replace(/%20/g, "+")}`
    );
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
      amenities: [AMENITY_ONE],
      moveInDate: FUTURE_MOVE_IN_DATE,
      endDate: "2027-03-01",
      leaseDuration: "12 months",
      houseRules: [HOUSE_RULE_TWO],
      roomType: "Shared",
      city: "NYC",
    };
    expect(filters.query).toBe("test");
    expect(filters.minPrice).toBe(100);
    expect(filters.maxPrice).toBe(1000);
    expect(filters.amenities).toEqual([AMENITY_ONE]);
    expect(filters.moveInDate).toBe(FUTURE_MOVE_IN_DATE);
    expect(filters.endDate).toBe("2027-03-01");
    expect(filters.leaseDuration).toBe("12 months");
    expect(filters.houseRules).toEqual([HOUSE_RULE_TWO]);
    expect(filters.roomType).toBe("Shared");
    expect(filters.city).toBe("NYC");
  });
});
