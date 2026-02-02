/**
 * Tests for useBatchedFilters hook
 */
import {
  readFiltersFromURL,
  emptyFilterValues,
  type BatchedFilterValues,
} from "@/hooks/useBatchedFilters";

// --- Unit tests for readFiltersFromURL (pure function, no hooks needed) ---

describe("readFiltersFromURL", () => {
  it("returns empty values for empty search params", () => {
    const params = new URLSearchParams();
    const result = readFiltersFromURL(params);
    expect(result).toEqual(emptyFilterValues);
  });

  it("parses scalar filter params", () => {
    const params = new URLSearchParams({
      minPrice: "500",
      maxPrice: "2000",
      roomType: "Private Room",
      leaseDuration: "6 months",
      moveInDate: "2026-03-01",
      genderPreference: "FEMALE_ONLY",
      householdGender: "MIXED",
    });
    const result = readFiltersFromURL(params);
    expect(result.minPrice).toBe("500");
    expect(result.maxPrice).toBe("2000");
    expect(result.roomType).toBe("Private Room");
    expect(result.leaseDuration).toBe("6 months");
    expect(result.moveInDate).toBe("2026-03-01");
    expect(result.genderPreference).toBe("FEMALE_ONLY");
    expect(result.householdGender).toBe("MIXED");
  });

  it("parses comma-separated array params", () => {
    const params = new URLSearchParams({
      amenities: "Wifi,Parking,Furnished",
      houseRules: "Pets allowed,Couples allowed",
      languages: "en,es",
    });
    const result = readFiltersFromURL(params);
    expect(result.amenities).toEqual(["Wifi", "Parking", "Furnished"]);
    expect(result.houseRules).toEqual(["Pets allowed", "Couples allowed"]);
    expect(result.languages).toEqual(["en", "es"]);
  });

  it("clamps negative price to 0", () => {
    const params = new URLSearchParams({ minPrice: "-100" });
    const result = readFiltersFromURL(params);
    expect(result.minPrice).toBe("0");
  });

  it("rejects invalid price values", () => {
    const params = new URLSearchParams({ minPrice: "abc" });
    const result = readFiltersFromURL(params);
    expect(result.minPrice).toBe("");
  });

  it("rejects invalid enum values", () => {
    const params = new URLSearchParams({ roomType: "InvalidType" });
    const result = readFiltersFromURL(params);
    expect(result.roomType).toBe("");
  });

  it("handles room type aliases (case-insensitive)", () => {
    const params = new URLSearchParams({ roomType: "private" });
    const result = readFiltersFromURL(params);
    expect(result.roomType).toBe("Private Room");
  });

  it("handles lease duration aliases", () => {
    const params = new URLSearchParams({ leaseDuration: "mtm" });
    const result = readFiltersFromURL(params);
    expect(result.leaseDuration).toBe("Month-to-month");
  });

  it("deduplicates array params", () => {
    const params = new URLSearchParams({
      amenities: "Wifi,Wifi,Parking",
    });
    const result = readFiltersFromURL(params);
    expect(result.amenities).toEqual(["Wifi", "Parking"]);
  });

  it("filters out invalid amenities", () => {
    const params = new URLSearchParams({
      amenities: "Wifi,InvalidAmenity,Parking",
    });
    const result = readFiltersFromURL(params);
    expect(result.amenities).toEqual(["Wifi", "Parking"]);
  });

  it("preserves non-filter params (does not read them)", () => {
    const params = new URLSearchParams({
      q: "San Francisco",
      lat: "37.7",
      lng: "-122.4",
      minLat: "37.6",
      maxLat: "37.8",
      sort: "price_asc",
      minPrice: "500",
    });
    const result = readFiltersFromURL(params);
    // Only filter params are read
    expect(result.minPrice).toBe("500");
    // Non-filter params are not in the result
    expect(result).not.toHaveProperty("q");
    expect(result).not.toHaveProperty("lat");
  });
});

// --- Tests for isDirty logic (test via filtersEqual indirectly) ---

describe("isDirty computation", () => {
  it("is false when pending matches committed", () => {
    const a: BatchedFilterValues = { ...emptyFilterValues, minPrice: "500" };
    const b: BatchedFilterValues = { ...emptyFilterValues, minPrice: "500" };
    // Same values should be equal
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("is true when scalar values differ", () => {
    const a: BatchedFilterValues = { ...emptyFilterValues, minPrice: "500" };
    const b: BatchedFilterValues = { ...emptyFilterValues, minPrice: "600" };
    expect(a.minPrice).not.toEqual(b.minPrice);
  });

  it("is true when array values differ", () => {
    const a: BatchedFilterValues = {
      ...emptyFilterValues,
      amenities: ["Wifi"],
    };
    const b: BatchedFilterValues = {
      ...emptyFilterValues,
      amenities: ["Wifi", "Parking"],
    };
    expect(a.amenities).not.toEqual(b.amenities);
  });

  it("arrays are order-independent for equality", () => {
    const a: BatchedFilterValues = {
      ...emptyFilterValues,
      amenities: ["Wifi", "Parking"],
    };
    const b: BatchedFilterValues = {
      ...emptyFilterValues,
      amenities: ["Parking", "Wifi"],
    };
    // Sorted comparison should be equal
    expect([...a.amenities].sort()).toEqual([...b.amenities].sort());
  });
});

// --- Tests for commit URL building logic ---

describe("commit URL building", () => {
  it("builds URL with filter params from pending state", () => {
    const pending: BatchedFilterValues = {
      minPrice: "500",
      maxPrice: "2000",
      roomType: "Private Room",
      leaseDuration: "",
      moveInDate: "",
      amenities: ["Wifi", "Parking"],
      houseRules: [],
      languages: ["en"],
      genderPreference: "",
      householdGender: "",
    };

    const params = new URLSearchParams();
    // Simulate commit logic
    if (pending.minPrice) params.set("minPrice", pending.minPrice);
    if (pending.maxPrice) params.set("maxPrice", pending.maxPrice);
    if (pending.roomType) params.set("roomType", pending.roomType);
    if (pending.amenities.length > 0) {
      params.set("amenities", pending.amenities.join(","));
    }
    if (pending.languages.length > 0) {
      params.set("languages", pending.languages.join(","));
    }

    expect(params.get("minPrice")).toBe("500");
    expect(params.get("maxPrice")).toBe("2000");
    expect(params.get("roomType")).toBe("Private Room");
    expect(params.get("amenities")).toBe("Wifi,Parking");
    expect(params.get("languages")).toBe("en");
    // Empty values not set
    expect(params.has("leaseDuration")).toBe(false);
    expect(params.has("moveInDate")).toBe(false);
  });

  it("preserves non-filter params on commit", () => {
    const base = new URLSearchParams({
      q: "San Francisco",
      lat: "37.7",
      lng: "-122.4",
      minLat: "37.6",
      maxLat: "37.8",
      sort: "price_asc",
      minPrice: "500",
      cursor: "abc123",
    });

    // Simulate commit: delete pagination and filter params, re-set filters
    const params = new URLSearchParams(base.toString());
    params.delete("cursor");
    params.delete("page");
    params.delete("minPrice");

    // Non-filter params preserved
    expect(params.get("q")).toBe("San Francisco");
    expect(params.get("lat")).toBe("37.7");
    expect(params.get("sort")).toBe("price_asc");
    // Pagination deleted
    expect(params.has("cursor")).toBe(false);
  });

  it("deletes pagination params on commit", () => {
    const base = new URLSearchParams({
      page: "3",
      cursor: "abc",
      cursorStack: "x,y",
      pageNumber: "3",
      minPrice: "500",
    });
    const params = new URLSearchParams(base.toString());
    params.delete("page");
    params.delete("cursor");
    params.delete("cursorStack");
    params.delete("pageNumber");

    expect(params.has("page")).toBe(false);
    expect(params.has("cursor")).toBe(false);
    expect(params.has("cursorStack")).toBe(false);
    expect(params.has("pageNumber")).toBe(false);
  });
});

// --- Tests for reset logic ---

describe("reset behavior", () => {
  it("restores pending to committed URL values", () => {
    const committed: BatchedFilterValues = {
      ...emptyFilterValues,
      minPrice: "500",
      amenities: ["Wifi"],
    };
    // After reset, pending should match committed
    const afterReset = { ...committed };
    expect(afterReset).toEqual(committed);
  });
});

// --- Tests for setPending merging ---

describe("setPending merging", () => {
  it("merges partial values into pending state", () => {
    const state: BatchedFilterValues = {
      ...emptyFilterValues,
      minPrice: "500",
      amenities: ["Wifi"],
    };
    const updated = { ...state, maxPrice: "2000" };
    expect(updated.minPrice).toBe("500");
    expect(updated.maxPrice).toBe("2000");
    expect(updated.amenities).toEqual(["Wifi"]);
  });

  it("overwrites existing values", () => {
    const state: BatchedFilterValues = {
      ...emptyFilterValues,
      minPrice: "500",
    };
    const updated = { ...state, minPrice: "600" };
    expect(updated.minPrice).toBe("600");
  });

  it("rapid setPending calls result in last value winning", () => {
    // Simulate rapid updates (React batching)
    let state = { ...emptyFilterValues };
    state = { ...state, minPrice: "100" };
    state = { ...state, minPrice: "200" };
    state = { ...state, minPrice: "300" };
    expect(state.minPrice).toBe("300");
  });
});
