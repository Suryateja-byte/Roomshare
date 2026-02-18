import {
  urlToFilterChips,
  removeFilterFromUrl,
  clearAllFilters,
  hasFilterChips,
  type FilterChipData,
} from "@/components/filters/filter-chip-utils";

describe("filter-chip-utils", () => {
  describe("urlToFilterChips", () => {
    describe("price range handling", () => {
      it("creates combined chip for both min and max price", () => {
        const params = new URLSearchParams("minPrice=500&maxPrice=1500");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(1);
        expect(chips[0]).toEqual({
          id: "price-range",
          label: "$500 - $1,500",
          paramKey: "price-range",
        });
      });

      it("creates min-only chip when only minPrice present", () => {
        const params = new URLSearchParams("minPrice=500");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(1);
        expect(chips[0]).toEqual({
          id: "minPrice",
          label: "Min $500",
          paramKey: "minPrice",
        });
      });

      it("creates max-only chip when only maxPrice present", () => {
        const params = new URLSearchParams("maxPrice=1500");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(1);
        expect(chips[0]).toEqual({
          id: "maxPrice",
          label: "Max $1,500",
          paramKey: "maxPrice",
        });
      });

      it("formats large prices with thousands separators", () => {
        const params = new URLSearchParams("minPrice=10000&maxPrice=50000");
        const chips = urlToFilterChips(params);

        expect(chips[0].label).toBe("$10,000 - $50,000");
      });

      it("supports zero as a valid min price", () => {
        const params = new URLSearchParams("minPrice=0");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(1);
        expect(chips[0]).toEqual({
          id: "minPrice",
          label: "Min $0",
          paramKey: "minPrice",
        });
      });
    });

    describe("move-in date handling", () => {
      beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date("2026-01-01T12:00:00Z"));
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it("formats date correctly", () => {
        const params = new URLSearchParams("moveInDate=2026-02-15");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(1);
        expect(chips[0]).toEqual({
          id: "moveInDate",
          label: "Move-in: Feb 15, 2026",
          paramKey: "moveInDate",
        });
      });
    });

    describe("room type handling", () => {
      it("creates chip for room type", () => {
        const params = new URLSearchParams("roomType=Private%20Room");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(1);
        expect(chips[0]).toEqual({
          id: "roomType",
          label: "Private Room",
          paramKey: "roomType",
        });
      });
    });

    describe("lease duration handling", () => {
      it("creates chip for lease duration", () => {
        const params = new URLSearchParams("leaseDuration=6%20months");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(1);
        expect(chips[0]).toEqual({
          id: "leaseDuration",
          label: "6 months",
          paramKey: "leaseDuration",
        });
      });
    });

    describe("amenities handling", () => {
      it("creates separate chips for each amenity", () => {
        const params = new URLSearchParams("amenities=Wifi,AC,Parking");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(3);
        expect(chips).toContainEqual({
          id: "amenities:Wifi",
          label: "Wifi",
          paramKey: "amenities",
          paramValue: "Wifi",
        });
        expect(chips).toContainEqual({
          id: "amenities:AC",
          label: "AC",
          paramKey: "amenities",
          paramValue: "AC",
        });
        expect(chips).toContainEqual({
          id: "amenities:Parking",
          label: "Parking",
          paramKey: "amenities",
          paramValue: "Parking",
        });
      });

      it("handles single amenity", () => {
        const params = new URLSearchParams("amenities=Wifi");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(1);
        expect(chips[0].paramValue).toBe("Wifi");
      });

      it("handles repeated and CSV amenity params together", () => {
        const params = new URLSearchParams(
          "amenities=Wifi&amenities=AC,Parking&amenities=Wifi",
        );
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(3);
        expect(chips.map((chip) => chip.id).sort()).toEqual([
          "amenities:AC",
          "amenities:Parking",
          "amenities:Wifi",
        ]);
      });
    });

    describe("house rules handling", () => {
      it("creates separate chips for each rule", () => {
        const params = new URLSearchParams(
          "houseRules=Pets%20allowed,Smoking%20allowed",
        );
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(2);
        expect(chips).toContainEqual({
          id: "houseRules:Pets allowed",
          label: "Pets allowed",
          paramKey: "houseRules",
          paramValue: "Pets allowed",
        });
        expect(chips).toContainEqual({
          id: "houseRules:Smoking allowed",
          label: "Smoking allowed",
          paramKey: "houseRules",
          paramValue: "Smoking allowed",
        });
      });
    });

    describe("languages handling", () => {
      it("converts language codes to display names", () => {
        const params = new URLSearchParams("languages=en,es,te");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(3);
        expect(chips).toContainEqual({
          id: "languages:en",
          label: "English",
          paramKey: "languages",
          paramValue: "en",
        });
        expect(chips).toContainEqual({
          id: "languages:es",
          label: "Spanish",
          paramKey: "languages",
          paramValue: "es",
        });
        expect(chips).toContainEqual({
          id: "languages:te",
          label: "Telugu",
          paramKey: "languages",
          paramValue: "te",
        });
      });

      it("supports repeated language params and deduplicates chips", () => {
        const params = new URLSearchParams(
          "languages=en&languages=te,es&languages=te",
        );
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(3);
        expect(chips.map((chip) => chip.id).sort()).toEqual([
          "languages:en",
          "languages:es",
          "languages:te",
        ]);
      });
    });

    describe("nearMatches handling", () => {
      it("creates chip when nearMatches is 1", () => {
        const params = new URLSearchParams("nearMatches=1");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(1);
        expect(chips[0]).toEqual({
          id: "nearMatches",
          label: "Near matches",
          paramKey: "nearMatches",
        });
      });

      it("creates chip when nearMatches is true", () => {
        const params = new URLSearchParams("nearMatches=true");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(1);
        expect(chips[0]).toEqual({
          id: "nearMatches",
          label: "Near matches",
          paramKey: "nearMatches",
        });
      });

      it("does not create chip when nearMatches is 0", () => {
        const params = new URLSearchParams("nearMatches=0");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(0);
      });

      it("does not create chip when nearMatches is absent", () => {
        const params = new URLSearchParams("");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(0);
      });
    });

    describe("preserved params are ignored", () => {
      it("does not create chips for location params", () => {
        const params = new URLSearchParams(
          "q=downtown&lat=37.7749&lng=-122.4194&minLat=37.7&maxLat=37.8&minLng=-122.5&maxLng=-122.3",
        );
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(0);
      });

      it("does not create chips for sort param", () => {
        const params = new URLSearchParams("sort=price_asc");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(0);
      });
    });

    describe("UI state params are ignored", () => {
      it("does not create chips for page param", () => {
        const params = new URLSearchParams("page=3");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(0);
      });

      it("does not create chips for view param", () => {
        const params = new URLSearchParams("view=map");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(0);
      });

      it("does not create chips for drawerOpen param", () => {
        const params = new URLSearchParams("drawerOpen=true");
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(0);
      });
    });

    describe("combined filters", () => {
      it("handles multiple filter types together", () => {
        const params = new URLSearchParams(
          "minPrice=500&maxPrice=1500&amenities=Wifi,AC&roomType=Private%20Room&languages=en",
        );
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(5); // price-range + 2 amenities + roomType + 1 language
      });

      it("handles filters mixed with preserved params", () => {
        const params = new URLSearchParams(
          "q=downtown&minPrice=500&sort=newest&amenities=Wifi",
        );
        const chips = urlToFilterChips(params);

        expect(chips).toHaveLength(2); // minPrice + Wifi
        expect(chips.map((c) => c.id)).not.toContain("q");
        expect(chips.map((c) => c.id)).not.toContain("sort");
      });
    });
  });

  describe("removeFilterFromUrl", () => {
    describe("simple param removal", () => {
      it("removes minPrice param", () => {
        const params = new URLSearchParams("minPrice=500&maxPrice=1500");
        const chip: FilterChipData = {
          id: "minPrice",
          label: "Min $500",
          paramKey: "minPrice",
        };

        const result = removeFilterFromUrl(params, chip);

        expect(result).toBe("maxPrice=1500");
      });

      it("removes roomType param", () => {
        const params = new URLSearchParams("roomType=Private%20Room");
        const chip: FilterChipData = {
          id: "roomType",
          label: "Private Room",
          paramKey: "roomType",
        };

        const result = removeFilterFromUrl(params, chip);

        expect(result).toBe("");
      });
    });

    describe("price-range removal", () => {
      it("removes both minPrice and maxPrice for price-range chip", () => {
        const params = new URLSearchParams(
          "minPrice=500&maxPrice=1500&amenities=Wifi",
        );
        const chip: FilterChipData = {
          id: "price-range",
          label: "$500 - $1,500",
          paramKey: "price-range",
        };

        const result = removeFilterFromUrl(params, chip);

        expect(result).toBe("amenities=Wifi");
      });
    });

    describe("array param removal", () => {
      it("removes single value from amenities array", () => {
        const params = new URLSearchParams("amenities=Wifi,AC,Parking");
        const chip: FilterChipData = {
          id: "amenities:AC",
          label: "AC",
          paramKey: "amenities",
          paramValue: "AC",
        };

        const result = removeFilterFromUrl(params, chip);

        expect(result).toBe("amenities=Wifi%2CParking");
      });

      it("removes entire param when last array value removed", () => {
        const params = new URLSearchParams("amenities=Wifi");
        const chip: FilterChipData = {
          id: "amenities:Wifi",
          label: "Wifi",
          paramKey: "amenities",
          paramValue: "Wifi",
        };

        const result = removeFilterFromUrl(params, chip);

        expect(result).toBe("");
      });

      it("removes single language from languages array", () => {
        const params = new URLSearchParams("languages=en,es,te");
        const chip: FilterChipData = {
          id: "languages:es",
          label: "Spanish",
          paramKey: "languages",
          paramValue: "es",
        };

        const result = removeFilterFromUrl(params, chip);

        expect(result).toBe("languages=en%2Cte");
      });

      it("removes from repeated language params and normalizes result", () => {
        const params = new URLSearchParams("languages=en&languages=es,te");
        const chip: FilterChipData = {
          id: "languages:es",
          label: "Spanish",
          paramKey: "languages",
          paramValue: "es",
        };

        const result = removeFilterFromUrl(params, chip);

        expect(result).toBe("languages=en%2Cte");
      });
    });

    describe("page reset on filter change", () => {
      it("removes page param when removing filter", () => {
        const params = new URLSearchParams("amenities=Wifi&page=3");
        const chip: FilterChipData = {
          id: "amenities:Wifi",
          label: "Wifi",
          paramKey: "amenities",
          paramValue: "Wifi",
        };

        const result = removeFilterFromUrl(params, chip);

        expect(result).toBe("");
        expect(result).not.toContain("page");
      });

      it("removes keyset pagination params when removing filter", () => {
        const params = new URLSearchParams(
          "languages=en,te&cursor=abc&cursorStack=a,b&pageNumber=4",
        );
        const chip: FilterChipData = {
          id: "languages:te",
          label: "Telugu",
          paramKey: "languages",
          paramValue: "te",
        };

        const result = removeFilterFromUrl(params, chip);

        expect(result).toBe("languages=en");
        expect(result).not.toContain("cursor=");
        expect(result).not.toContain("cursorStack=");
        expect(result).not.toContain("pageNumber=");
      });
    });

    describe("preserves other params", () => {
      it("preserves location and sort params", () => {
        const params = new URLSearchParams(
          "q=downtown&sort=newest&amenities=Wifi",
        );
        const chip: FilterChipData = {
          id: "amenities:Wifi",
          label: "Wifi",
          paramKey: "amenities",
          paramValue: "Wifi",
        };

        const result = removeFilterFromUrl(params, chip);

        expect(result).toContain("q=downtown");
        expect(result).toContain("sort=newest");
      });
    });
  });

  describe("clearAllFilters", () => {
    it("removes all filter params", () => {
      const params = new URLSearchParams(
        "minPrice=500&maxPrice=1500&amenities=Wifi,AC&roomType=Private%20Room",
      );

      const result = clearAllFilters(params);

      expect(result).toBe("");
    });

    it("preserves location params", () => {
      const params = new URLSearchParams(
        "q=downtown&lat=37.7&lng=-122.4&minPrice=500",
      );

      const result = clearAllFilters(params);

      expect(result).toContain("q=downtown");
      expect(result).toContain("lat=37.7");
      expect(result).toContain("lng=-122.4");
      expect(result).not.toContain("minPrice");
    });

    it("preserves bounds params", () => {
      const params = new URLSearchParams(
        "minLat=37.7&maxLat=37.8&minLng=-122.5&maxLng=-122.3&amenities=Wifi",
      );

      const result = clearAllFilters(params);

      expect(result).toContain("minLat=37.7");
      expect(result).toContain("maxLat=37.8");
      expect(result).toContain("minLng=-122.5");
      expect(result).toContain("maxLng=-122.3");
      expect(result).not.toContain("amenities");
    });

    it("preserves sort param", () => {
      const params = new URLSearchParams("sort=price_asc&minPrice=500");

      const result = clearAllFilters(params);

      expect(result).toContain("sort=price_asc");
      expect(result).not.toContain("minPrice");
    });

    it("clears nearMatches filter", () => {
      const params = new URLSearchParams("nearMatches=1&amenities=Wifi");

      const result = clearAllFilters(params);

      expect(result).not.toContain("nearMatches");
      expect(result).not.toContain("amenities");
    });

    it("handles all preserved params combined", () => {
      const params = new URLSearchParams(
        "q=downtown&lat=37.7&lng=-122.4&minLat=37.7&maxLat=37.8&minLng=-122.5&maxLng=-122.3&sort=newest&minPrice=500&amenities=Wifi&nearMatches=1",
      );

      const result = clearAllFilters(params);
      const preserved = new URLSearchParams(result);

      // Should preserve these
      expect(preserved.get("q")).toBe("downtown");
      expect(preserved.get("lat")).toBe("37.7");
      expect(preserved.get("lng")).toBe("-122.4");
      expect(preserved.get("sort")).toBe("newest");

      // Should remove these
      expect(preserved.get("minPrice")).toBeNull();
      expect(preserved.get("amenities")).toBeNull();
      expect(preserved.get("nearMatches")).toBeNull();
    });
  });

  describe("hasFilterChips", () => {
    it("returns true when filters are present", () => {
      const params = new URLSearchParams("minPrice=500");

      expect(hasFilterChips(params)).toBe(true);
    });

    it("returns false when no filters present", () => {
      const params = new URLSearchParams("");

      expect(hasFilterChips(params)).toBe(false);
    });

    it("returns false when only preserved params present", () => {
      const params = new URLSearchParams("q=downtown&sort=newest&lat=37.7");

      expect(hasFilterChips(params)).toBe(false);
    });

    it("returns false when only UI state params present", () => {
      const params = new URLSearchParams("page=3&view=map");

      expect(hasFilterChips(params)).toBe(false);
    });

    it("returns true when filters mixed with preserved params", () => {
      const params = new URLSearchParams("q=downtown&minPrice=500");

      expect(hasFilterChips(params)).toBe(true);
    });
  });
});
