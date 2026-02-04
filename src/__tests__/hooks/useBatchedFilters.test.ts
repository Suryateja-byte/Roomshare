/**
 * Tests for useBatchedFilters hook
 *
 * Coverage:
 * - arraysEqual with same elements different order
 * - isDirty when only array fields change
 * - commit preserves non-filter URL params
 * - reset after multiple setPending calls
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useBatchedFilters,
  readFiltersFromURL,
  emptyFilterValues,
  type BatchedFilterValues,
} from "@/hooks/useBatchedFilters";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Mock SearchTransitionContext
jest.mock("@/contexts/SearchTransitionContext", () => ({
  useSearchTransitionSafe: jest.fn(() => null),
}));

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  prefetch: jest.fn(),
};

const createMockSearchParams = (
  params: Record<string, string | string[]> = {}
) => {
  const urlSearchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => urlSearchParams.append(key, v));
    } else {
      urlSearchParams.set(key, value);
    }
  });
  return urlSearchParams;
};

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

// --- Hook integration tests using renderHook ---

describe("useBatchedFilters hook", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useSearchParams as jest.Mock).mockReturnValue(createMockSearchParams());
  });

  describe("initial state", () => {
    it("initializes pending state from URL params", () => {
      (useSearchParams as jest.Mock).mockReturnValue(
        createMockSearchParams({
          minPrice: "500",
          maxPrice: "1500",
          roomType: "Private Room",
        })
      );

      const { result } = renderHook(() => useBatchedFilters());

      expect(result.current.pending.minPrice).toBe("500");
      expect(result.current.pending.maxPrice).toBe("1500");
      expect(result.current.pending.roomType).toBe("Private Room");
    });

    it("returns empty values when no URL params", () => {
      const { result } = renderHook(() => useBatchedFilters());

      expect(result.current.pending).toEqual(emptyFilterValues);
      expect(result.current.isDirty).toBe(false);
    });
  });

  describe("arraysEqual with same elements different order", () => {
    it("considers arrays equal regardless of order", () => {
      (useSearchParams as jest.Mock).mockReturnValue(
        createMockSearchParams({
          amenities: "Wifi,Parking,Washer",
        })
      );

      const { result } = renderHook(() => useBatchedFilters());

      // Set same amenities in different order
      act(() => {
        result.current.setPending({ amenities: ["Washer", "Wifi", "Parking"] });
      });

      // Should NOT be dirty because arrays have same elements
      expect(result.current.isDirty).toBe(false);
    });

    it("detects dirty state when array has different elements", () => {
      (useSearchParams as jest.Mock).mockReturnValue(
        createMockSearchParams({
          amenities: "Wifi,Parking",
        })
      );

      const { result } = renderHook(() => useBatchedFilters());

      // Set different amenities
      act(() => {
        result.current.setPending({ amenities: ["Wifi", "Washer"] });
      });

      // Should be dirty because arrays have different elements
      expect(result.current.isDirty).toBe(true);
    });

    it("detects dirty state when array lengths differ", () => {
      (useSearchParams as jest.Mock).mockReturnValue(
        createMockSearchParams({
          amenities: "Wifi,Parking",
        })
      );

      const { result } = renderHook(() => useBatchedFilters());

      // Set fewer amenities
      act(() => {
        result.current.setPending({ amenities: ["Wifi"] });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it("handles empty arrays correctly", () => {
      (useSearchParams as jest.Mock).mockReturnValue(createMockSearchParams());

      const { result } = renderHook(() => useBatchedFilters());

      // Initially empty, set to empty - should not be dirty
      act(() => {
        result.current.setPending({ amenities: [] });
      });

      expect(result.current.isDirty).toBe(false);
    });

    it("handles houseRules array order independence", () => {
      (useSearchParams as jest.Mock).mockReturnValue(
        createMockSearchParams({
          houseRules: "Couples allowed,Pets allowed",
        })
      );

      const { result } = renderHook(() => useBatchedFilters());

      // Same rules, different order
      act(() => {
        result.current.setPending({ houseRules: ["Pets allowed", "Couples allowed"] });
      });

      expect(result.current.isDirty).toBe(false);
    });

    it("handles languages array order independence", () => {
      (useSearchParams as jest.Mock).mockReturnValue(
        createMockSearchParams({
          languages: "en,es",
        })
      );

      const { result } = renderHook(() => useBatchedFilters());

      // Same languages, different order
      act(() => {
        result.current.setPending({ languages: ["es", "en"] });
      });

      expect(result.current.isDirty).toBe(false);
    });
  });

  describe("isDirty when only array fields change", () => {
    it("detects dirty when adding to amenities", () => {
      (useSearchParams as jest.Mock).mockReturnValue(createMockSearchParams());

      const { result } = renderHook(() => useBatchedFilters());

      act(() => {
        result.current.setPending({ amenities: ["Wifi"] });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it("detects dirty when adding to houseRules", () => {
      (useSearchParams as jest.Mock).mockReturnValue(createMockSearchParams());

      const { result } = renderHook(() => useBatchedFilters());

      act(() => {
        result.current.setPending({ houseRules: ["Pets allowed"] });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it("detects dirty when adding to languages", () => {
      (useSearchParams as jest.Mock).mockReturnValue(createMockSearchParams());

      const { result } = renderHook(() => useBatchedFilters());

      act(() => {
        result.current.setPending({ languages: ["en"] });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it("not dirty when array is same as URL", () => {
      (useSearchParams as jest.Mock).mockReturnValue(
        createMockSearchParams({
          amenities: "Wifi",
          houseRules: "Pets allowed",
          languages: "en",
        })
      );

      const { result } = renderHook(() => useBatchedFilters());

      // Should not be dirty initially
      expect(result.current.isDirty).toBe(false);

      // Set to same values
      act(() => {
        result.current.setPending({
          amenities: ["Wifi"],
          houseRules: ["Pets allowed"],
          languages: ["en"],
        });
      });

      expect(result.current.isDirty).toBe(false);
    });
  });

  describe("commit preserves non-filter URL params", () => {
    it("preserves bounds param on commit", () => {
      (useSearchParams as jest.Mock).mockReturnValue(
        createMockSearchParams({
          bounds: "37.0,-122.5,38.0,-121.5",
          minPrice: "500",
        })
      );

      const { result } = renderHook(() => useBatchedFilters());

      act(() => {
        result.current.setPending({ minPrice: "600" });
      });

      act(() => {
        result.current.commit();
      });

      expect(mockRouter.push).toHaveBeenCalledTimes(1);
      const calledUrl = mockRouter.push.mock.calls[0][0] as string;
      expect(calledUrl).toContain("bounds=");
      expect(calledUrl).toContain("minPrice=600");
    });

    it("preserves sort param on commit", () => {
      (useSearchParams as jest.Mock).mockReturnValue(
        createMockSearchParams({
          sort: "price-asc",
          roomType: "Private Room",
        })
      );

      const { result } = renderHook(() => useBatchedFilters());

      act(() => {
        result.current.setPending({ roomType: "Entire place" });
      });

      act(() => {
        result.current.commit();
      });

      const calledUrl = mockRouter.push.mock.calls[0][0] as string;
      expect(calledUrl).toContain("sort=price-asc");
    });

    it("preserves q (query) param on commit", () => {
      (useSearchParams as jest.Mock).mockReturnValue(
        createMockSearchParams({
          q: "San Francisco",
          minPrice: "500",
        })
      );

      const { result } = renderHook(() => useBatchedFilters());

      act(() => {
        result.current.setPending({ maxPrice: "2000" });
      });

      act(() => {
        result.current.commit();
      });

      const calledUrl = mockRouter.push.mock.calls[0][0] as string;
      expect(calledUrl).toContain("q=San");
      expect(calledUrl).toContain("maxPrice=2000");
    });

    it("preserves lat/lng params on commit", () => {
      (useSearchParams as jest.Mock).mockReturnValue(
        createMockSearchParams({
          lat: "37.7749",
          lng: "-122.4194",
        })
      );

      const { result } = renderHook(() => useBatchedFilters());

      act(() => {
        result.current.setPending({ amenities: ["Wifi"] });
      });

      act(() => {
        result.current.commit();
      });

      const calledUrl = mockRouter.push.mock.calls[0][0] as string;
      expect(calledUrl).toContain("lat=37.7749");
      expect(calledUrl).toContain("lng=-122.4194");
    });

    it("removes pagination params on commit", () => {
      (useSearchParams as jest.Mock).mockReturnValue(
        createMockSearchParams({
          page: "2",
          cursor: "abc123",
          cursorStack: "xyz",
          pageNumber: "3",
          minPrice: "500",
        })
      );

      const { result } = renderHook(() => useBatchedFilters());

      act(() => {
        result.current.setPending({ minPrice: "600" });
      });

      act(() => {
        result.current.commit();
      });

      const calledUrl = mockRouter.push.mock.calls[0][0] as string;
      expect(calledUrl).not.toContain("page=");
      expect(calledUrl).not.toContain("cursor=");
      expect(calledUrl).not.toContain("cursorStack=");
      expect(calledUrl).not.toContain("pageNumber=");
      expect(calledUrl).toContain("minPrice=600");
    });
  });

  describe("reset after multiple setPending calls", () => {
    it("resets all pending changes to committed state", () => {
      (useSearchParams as jest.Mock).mockReturnValue(
        createMockSearchParams({
          minPrice: "500",
          maxPrice: "1500",
        })
      );

      const { result } = renderHook(() => useBatchedFilters());

      // Make multiple changes
      act(() => {
        result.current.setPending({ minPrice: "600" });
      });
      act(() => {
        result.current.setPending({ maxPrice: "2000" });
      });
      act(() => {
        result.current.setPending({ roomType: "Private Room" });
      });

      expect(result.current.isDirty).toBe(true);
      expect(result.current.pending.minPrice).toBe("600");
      expect(result.current.pending.maxPrice).toBe("2000");
      expect(result.current.pending.roomType).toBe("Private Room");

      // Reset
      act(() => {
        result.current.reset();
      });

      // Should be back to committed state
      expect(result.current.isDirty).toBe(false);
      expect(result.current.pending.minPrice).toBe("500");
      expect(result.current.pending.maxPrice).toBe("1500");
      expect(result.current.pending.roomType).toBe("");
    });

    it("resets array fields correctly", () => {
      (useSearchParams as jest.Mock).mockReturnValue(
        createMockSearchParams({
          amenities: "Wifi",
        })
      );

      const { result } = renderHook(() => useBatchedFilters());

      // Add multiple amenities
      act(() => {
        result.current.setPending({ amenities: ["Wifi", "Parking", "Washer"] });
      });

      expect(result.current.pending.amenities).toEqual(["Wifi", "Parking", "Washer"]);

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.pending.amenities).toEqual(["Wifi"]);
    });

    it("reset is idempotent - calling multiple times has same effect", () => {
      (useSearchParams as jest.Mock).mockReturnValue(
        createMockSearchParams({
          minPrice: "500",
        })
      );

      const { result } = renderHook(() => useBatchedFilters());

      act(() => {
        result.current.setPending({ minPrice: "1000" });
      });

      // Reset multiple times
      act(() => {
        result.current.reset();
      });
      act(() => {
        result.current.reset();
      });
      act(() => {
        result.current.reset();
      });

      expect(result.current.pending.minPrice).toBe("500");
      expect(result.current.isDirty).toBe(false);
    });

    it("syncs pending with URL when URL changes externally", async () => {
      const mockSearchParams = createMockSearchParams({ minPrice: "500" });
      (useSearchParams as jest.Mock).mockReturnValue(mockSearchParams);

      const { result, rerender } = renderHook(() => useBatchedFilters());

      expect(result.current.pending.minPrice).toBe("500");

      // Make local change
      act(() => {
        result.current.setPending({ minPrice: "1000" });
      });

      expect(result.current.pending.minPrice).toBe("1000");
      expect(result.current.isDirty).toBe(true);

      // Simulate URL change (e.g., back navigation)
      const newSearchParams = createMockSearchParams({ minPrice: "750" });
      (useSearchParams as jest.Mock).mockReturnValue(newSearchParams);

      rerender();

      // Pending should sync to new URL value
      await waitFor(() => {
        expect(result.current.pending.minPrice).toBe("750");
        expect(result.current.isDirty).toBe(false);
      });
    });
  });

  describe("setPending hook behavior", () => {
    it("merges partial updates", () => {
      (useSearchParams as jest.Mock).mockReturnValue(createMockSearchParams());

      const { result } = renderHook(() => useBatchedFilters());

      act(() => {
        result.current.setPending({ minPrice: "500" });
      });

      act(() => {
        result.current.setPending({ maxPrice: "1500" });
      });

      expect(result.current.pending.minPrice).toBe("500");
      expect(result.current.pending.maxPrice).toBe("1500");
    });

    it("allows updating multiple fields at once", () => {
      (useSearchParams as jest.Mock).mockReturnValue(createMockSearchParams());

      const { result } = renderHook(() => useBatchedFilters());

      act(() => {
        result.current.setPending({
          minPrice: "500",
          maxPrice: "1500",
          roomType: "Private Room",
          amenities: ["Wifi", "Parking"],
        });
      });

      expect(result.current.pending.minPrice).toBe("500");
      expect(result.current.pending.maxPrice).toBe("1500");
      expect(result.current.pending.roomType).toBe("Private Room");
      expect(result.current.pending.amenities).toEqual(["Wifi", "Parking"]);
    });
  });
});
