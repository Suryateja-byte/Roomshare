import { pendingToFilterParams } from "@/lib/pending-to-filter-params";
import type { BatchedFilterValues } from "@/hooks/useBatchedFilters";

describe("pendingToFilterParams", () => {
  it("converts empty BatchedFilterValues to FilterParams with all undefined", () => {
    const pending: BatchedFilterValues = {
      minPrice: "",
      maxPrice: "",
      roomType: "",
      leaseDuration: "",
      moveInDate: "",
      amenities: [],
      houseRules: [],
      languages: [],
      genderPreference: "",
      householdGender: "",
    };

    const result = pendingToFilterParams(pending);

    expect(result.minPrice).toBeUndefined();
    expect(result.maxPrice).toBeUndefined();
    expect(result.roomType).toBeUndefined();
    expect(result.leaseDuration).toBeUndefined();
    expect(result.moveInDate).toBeUndefined();
    expect(result.amenities).toBeUndefined();
    expect(result.houseRules).toBeUndefined();
  });

  it("converts populated values (strings to numbers for price)", () => {
    const pending: BatchedFilterValues = {
      minPrice: "500",
      maxPrice: "1500",
      roomType: "Private Room",
      leaseDuration: "6 months",
      moveInDate: "2026-06-01",
      amenities: ["Wifi", "AC"],
      houseRules: ["No Smoking"],
      languages: ["en"],
      genderPreference: "female",
      householdGender: "ALL_FEMALE",
    };

    const result = pendingToFilterParams(pending);

    expect(result.minPrice).toBe(500);
    expect(result.maxPrice).toBe(1500);
    expect(result.roomType).toBe("Private Room");
    expect(result.leaseDuration).toBe("6 months");
    expect(result.moveInDate).toBe("2026-06-01");
    expect(result.amenities).toEqual(["Wifi", "AC"]);
    expect(result.houseRules).toEqual(["No Smoking"]);
  });

  it('handles minPrice="0" correctly (falsy but valid)', () => {
    const pending: BatchedFilterValues = {
      minPrice: "0",
      maxPrice: "1000",
      roomType: "",
      leaseDuration: "",
      moveInDate: "",
      amenities: [],
      houseRules: [],
      languages: [],
      genderPreference: "",
      householdGender: "",
    };

    const result = pendingToFilterParams(pending);

    expect(result.minPrice).toBe(0);
    expect(result.maxPrice).toBe(1000);
  });

  it("handles non-numeric price strings gracefully", () => {
    const pending: BatchedFilterValues = {
      minPrice: "abc",
      maxPrice: "",
      roomType: "",
      leaseDuration: "",
      moveInDate: "",
      amenities: [],
      houseRules: [],
      languages: [],
      genderPreference: "",
      householdGender: "",
    };

    const result = pendingToFilterParams(pending);

    expect(result.minPrice).toBeUndefined();
  });
});
