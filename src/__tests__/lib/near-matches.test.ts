/**
 * Tests for near-matches filter expansion logic.
 */

import {
  LOW_RESULTS_THRESHOLD,
  NEAR_MATCH_RULES,
  expandFiltersForNearMatches,
  isNearMatch,
  generateFilterSuggestions,
} from "@/lib/near-matches";
import type { FilterParams } from "@/lib/search-params";

describe("near-matches", () => {
  describe("constants", () => {
    it("should have LOW_RESULTS_THRESHOLD of 5", () => {
      expect(LOW_RESULTS_THRESHOLD).toBe(5);
    });

    it("should have price expansion of 10%", () => {
      expect(NEAR_MATCH_RULES.price.expandPercent).toBe(10);
    });

    it("should have date expansion of 7 days", () => {
      expect(NEAR_MATCH_RULES.date.expandDays).toBe(7);
    });
  });

  describe("expandFiltersForNearMatches", () => {
    describe("price expansion", () => {
      it("should expand maxPrice by 10% upward", () => {
        const params: FilterParams = { maxPrice: 1000 };
        const result = expandFiltersForNearMatches(params);

        expect(result.expandedDimension).toBe("price");
        expect(result.expanded.maxPrice).toBe(1100); // 1000 * 1.10 = 1100
        expect(result.expansionDescription).toContain("max $1100");
      });

      it("should expand minPrice by 10% downward", () => {
        const params: FilterParams = { minPrice: 1000 };
        const result = expandFiltersForNearMatches(params);

        expect(result.expandedDimension).toBe("price");
        expect(result.expanded.minPrice).toBe(900); // 1000 * 0.90 = 900
        expect(result.expansionDescription).toContain("min $900");
      });

      it("should expand both minPrice and maxPrice", () => {
        const params: FilterParams = { minPrice: 500, maxPrice: 1500 };
        const result = expandFiltersForNearMatches(params);

        expect(result.expandedDimension).toBe("price");
        expect(result.expanded.minPrice).toBe(450); // 500 * 0.90
        // Note: Math.ceil(1500 * 1.10) = 1651 due to floating point (1500 * 1.10 = 1650.0000000000002)
        expect(result.expanded.maxPrice).toBe(1651);
        expect(result.expansionDescription).toContain("min $450");
        expect(result.expansionDescription).toContain("max $1651");
      });

      it("should not expand minPrice if it's 0", () => {
        const params: FilterParams = { minPrice: 0, maxPrice: 1000 };
        const result = expandFiltersForNearMatches(params);

        expect(result.expandedDimension).toBe("price");
        expect(result.expanded.minPrice).toBe(0); // 0 stays 0
        expect(result.expanded.maxPrice).toBe(1100);
      });

      it("should use Math.floor for minPrice and Math.ceil for maxPrice", () => {
        const params: FilterParams = { minPrice: 333, maxPrice: 777 };
        const result = expandFiltersForNearMatches(params);

        // minPrice: floor(333 * 0.9) = floor(299.7) = 299
        // maxPrice: ceil(777 * 1.1) = ceil(854.7) = 855
        expect(result.expanded.minPrice).toBe(299);
        expect(result.expanded.maxPrice).toBe(855);
      });
    });

    describe("date expansion", () => {
      it("should expand moveInDate by 7 days earlier", () => {
        // Use a date far in the future to avoid "past date" logic
        const params: FilterParams = { moveInDate: "2030-06-15" };
        const result = expandFiltersForNearMatches(params);

        expect(result.expandedDimension).toBe("date");
        expect(result.expanded.moveInDate).toBe("2030-06-08"); // 7 days earlier
      });

      it("should not expand date to past dates", () => {
        // If moveInDate is within 7 days of today, expansion should clamp to today
        // Use the same timezone-aware logic as the implementation
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const threeDaysFromNow = new Date(today);
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
        const dateStr = threeDaysFromNow.toISOString().split("T")[0];

        const params: FilterParams = { moveInDate: dateStr };
        const result = expandFiltersForNearMatches(params);

        // The expanded date should be today (clamped), not 3 days ago
        // Use the same format as the implementation
        const expectedDate = today.toISOString().split("T")[0];
        expect(result.expanded.moveInDate).toBe(expectedDate);
      });

      it("should prioritize price over date when both are set", () => {
        const params: FilterParams = {
          maxPrice: 1000,
          moveInDate: "2030-06-15",
        };
        const result = expandFiltersForNearMatches(params);

        // Price takes priority
        expect(result.expandedDimension).toBe("price");
        expect(result.expanded.maxPrice).toBe(1100);
        // moveInDate should remain unchanged
        expect(result.expanded.moveInDate).toBe("2030-06-15");
      });
    });

    describe("no expansion", () => {
      it("should return null expansion when no expandable filters", () => {
        const params: FilterParams = {
          roomType: "Private",
          amenities: ["WiFi"],
        };
        const result = expandFiltersForNearMatches(params);

        expect(result.expandedDimension).toBeNull();
        expect(result.expansionDescription).toBeNull();
        expect(result.expanded).toEqual(params);
      });

      it("should return null expansion for empty params", () => {
        const params: FilterParams = {};
        const result = expandFiltersForNearMatches(params);

        expect(result.expandedDimension).toBeNull();
        expect(result.expansionDescription).toBeNull();
      });
    });
  });

  describe("isNearMatch", () => {
    describe("price dimension", () => {
      it("should return true when listing price is below original minPrice", () => {
        const listing = { price: 450, available_from: null };
        const params: FilterParams = { minPrice: 500, maxPrice: 1000 };

        expect(isNearMatch(listing, params, "price")).toBe(true);
      });

      it("should return true when listing price is above original maxPrice", () => {
        const listing = { price: 1100, available_from: null };
        const params: FilterParams = { minPrice: 500, maxPrice: 1000 };

        expect(isNearMatch(listing, params, "price")).toBe(true);
      });

      it("should return false when listing price is within original range", () => {
        const listing = { price: 750, available_from: null };
        const params: FilterParams = { minPrice: 500, maxPrice: 1000 };

        expect(isNearMatch(listing, params, "price")).toBe(false);
      });

      it("should return false when no price filters set", () => {
        const listing = { price: 500, available_from: null };
        const params: FilterParams = {};

        expect(isNearMatch(listing, params, "price")).toBe(false);
      });
    });

    describe("date dimension", () => {
      it("should return true when listing available_from is after original moveInDate", () => {
        const listing = { price: 500, available_from: "2030-06-20" };
        const params: FilterParams = { moveInDate: "2030-06-15" };

        expect(isNearMatch(listing, params, "date")).toBe(true);
      });

      it("should return false when listing available_from is before original moveInDate", () => {
        const listing = { price: 500, available_from: "2030-06-10" };
        const params: FilterParams = { moveInDate: "2030-06-15" };

        expect(isNearMatch(listing, params, "date")).toBe(false);
      });

      it("should return false when listing has no available_from", () => {
        const listing = { price: 500, available_from: null };
        const params: FilterParams = { moveInDate: "2030-06-15" };

        expect(isNearMatch(listing, params, "date")).toBe(false);
      });
    });

    describe("null dimension", () => {
      it("should return false when expandedDimension is null", () => {
        const listing = { price: 500, available_from: null };
        const params: FilterParams = { minPrice: 600 };

        expect(isNearMatch(listing, params, null)).toBe(false);
      });
    });
  });

  describe("generateFilterSuggestions", () => {
    it("should generate price suggestion when price filters set", () => {
      const params: FilterParams = { minPrice: 500, maxPrice: 1000 };
      const suggestions = generateFilterSuggestions(params, 2);

      const priceSuggestion = suggestions.find((s) => s.type === "price");
      expect(priceSuggestion).toBeDefined();
      expect(priceSuggestion?.label).toContain("$500");
      expect(priceSuggestion?.label).toContain("$1000");
      expect(priceSuggestion?.priority).toBe(1);
    });

    it("should generate maxPrice-only suggestion", () => {
      const params: FilterParams = { maxPrice: 1500 };
      const suggestions = generateFilterSuggestions(params, 2);

      const priceSuggestion = suggestions.find((s) => s.type === "price");
      expect(priceSuggestion?.label).toContain("Increase max price");
      expect(priceSuggestion?.label).toContain("$1500");
    });

    it("should generate minPrice-only suggestion", () => {
      const params: FilterParams = { minPrice: 800 };
      const suggestions = generateFilterSuggestions(params, 2);

      const priceSuggestion = suggestions.find((s) => s.type === "price");
      expect(priceSuggestion?.label).toContain("Lower min price");
      expect(priceSuggestion?.label).toContain("$800");
    });

    it("should generate date suggestion when moveInDate set", () => {
      const params: FilterParams = { moveInDate: "2030-02-15" };
      const suggestions = generateFilterSuggestions(params, 2);

      const dateSuggestion = suggestions.find((s) => s.type === "date");
      expect(dateSuggestion).toBeDefined();
      expect(dateSuggestion?.label).toContain("Flexible on move-in date");
      expect(dateSuggestion?.priority).toBe(2);
    });

    it("should generate roomType suggestion when roomType set", () => {
      const params: FilterParams = { roomType: "Private" };
      const suggestions = generateFilterSuggestions(params, 2);

      const roomTypeSuggestion = suggestions.find((s) => s.type === "roomType");
      expect(roomTypeSuggestion).toBeDefined();
      expect(roomTypeSuggestion?.label).toContain("Any room type");
      expect(roomTypeSuggestion?.label).toContain("Private");
      expect(roomTypeSuggestion?.priority).toBe(3);
    });

    it("should generate amenities suggestion when amenities set", () => {
      const params: FilterParams = { amenities: ["WiFi", "Pool", "Gym"] };
      const suggestions = generateFilterSuggestions(params, 2);

      const amenitiesSuggestion = suggestions.find(
        (s) => s.type === "amenities",
      );
      expect(amenitiesSuggestion).toBeDefined();
      expect(amenitiesSuggestion?.label).toContain("Fewer amenities");
      expect(amenitiesSuggestion?.label).toContain("3 selected");
      expect(amenitiesSuggestion?.priority).toBe(4);
    });

    it("should generate leaseDuration suggestion when leaseDuration set", () => {
      const params: FilterParams = { leaseDuration: "1 year" };
      const suggestions = generateFilterSuggestions(params, 2);

      const leaseSuggestion = suggestions.find(
        (s) => s.type === "leaseDuration",
      );
      expect(leaseSuggestion).toBeDefined();
      expect(leaseSuggestion?.label).toContain("Any lease duration");
      expect(leaseSuggestion?.priority).toBe(5);
    });

    it("should return suggestions sorted by priority", () => {
      const params: FilterParams = {
        amenities: ["WiFi"],
        minPrice: 500,
        moveInDate: "2030-06-15",
      };
      const suggestions = generateFilterSuggestions(params, 2);

      // Check that they're ordered by priority
      expect(suggestions[0].type).toBe("price"); // priority 1
      expect(suggestions[1].type).toBe("date"); // priority 2
      expect(suggestions[2].type).toBe("amenities"); // priority 4
    });

    it("should return at most 4 suggestions", () => {
      const params: FilterParams = {
        minPrice: 500,
        maxPrice: 1000,
        moveInDate: "2030-06-15",
        roomType: "Private",
        amenities: ["WiFi", "Pool"],
        leaseDuration: "1 year",
      };
      const suggestions = generateFilterSuggestions(params, 2);

      expect(suggestions.length).toBeLessThanOrEqual(4);
    });

    it("should return empty array when no filters set", () => {
      const params: FilterParams = {};
      const suggestions = generateFilterSuggestions(params, 2);

      expect(suggestions).toEqual([]);
    });

    it("should not generate amenities suggestion for empty amenities array", () => {
      const params: FilterParams = { amenities: [] };
      const suggestions = generateFilterSuggestions(params, 2);

      const amenitiesSuggestion = suggestions.find(
        (s) => s.type === "amenities",
      );
      expect(amenitiesSuggestion).toBeUndefined();
    });
  });
});
