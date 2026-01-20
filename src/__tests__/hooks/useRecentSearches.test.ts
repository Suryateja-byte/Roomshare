/**
 * Unit tests for useRecentSearches hook
 *
 * Tests recent search management including:
 * - Storing searches with full filter state
 * - Migration from legacy format
 * - Formatting for display
 * - localStorage persistence
 */

import { renderHook, act } from "@testing-library/react";
import {
  useRecentSearches,
  formatRecentSearch,
  getFilterSummary,
  type RecentSearch,
  type RecentSearchFilters,
} from "@/hooks/useRecentSearches";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("useRecentSearches", () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  describe("initialization", () => {
    it("should start with empty array when localStorage is empty", () => {
      const { result } = renderHook(() => useRecentSearches());

      expect(result.current.recentSearches).toEqual([]);
      expect(result.current.isLoaded).toBe(true);
    });

    it("should load existing searches from localStorage", () => {
      const existingSearches: RecentSearch[] = [
        {
          id: "test-1",
          location: "Austin, TX",
          timestamp: Date.now(),
          filters: { minPrice: "500" },
        },
      ];
      localStorageMock.getItem.mockReturnValueOnce(
        JSON.stringify(existingSearches),
      );

      const { result } = renderHook(() => useRecentSearches());

      expect(result.current.recentSearches).toHaveLength(1);
      expect(result.current.recentSearches[0].location).toBe("Austin, TX");
    });
  });

  describe("legacy format migration", () => {
    it("should migrate legacy format (without id and filters) to new format", () => {
      const legacySearches = [
        {
          location: "Denver, CO",
          coords: { lat: 39.7392, lng: -104.9903 },
          timestamp: 1700000000000,
        },
      ];
      localStorageMock.getItem.mockReturnValueOnce(
        JSON.stringify(legacySearches),
      );

      const { result } = renderHook(() => useRecentSearches());

      expect(result.current.recentSearches).toHaveLength(1);
      const migrated = result.current.recentSearches[0];
      expect(migrated.id).toBeDefined();
      expect(migrated.filters).toEqual({});
      expect(migrated.location).toBe("Denver, CO");
      expect(migrated.coords).toEqual({ lat: 39.7392, lng: -104.9903 });
    });

    it("should persist migrated format back to localStorage", () => {
      const legacySearches = [
        {
          location: "Seattle, WA",
          timestamp: 1700000000000,
        },
      ];
      localStorageMock.getItem.mockReturnValueOnce(
        JSON.stringify(legacySearches),
      );

      renderHook(() => useRecentSearches());

      // Should have called setItem to save migrated format
      expect(localStorageMock.setItem).toHaveBeenCalled();
      const savedData = JSON.parse(
        localStorageMock.setItem.mock.calls[0][1],
      ) as RecentSearch[];
      expect(savedData[0].id).toBeDefined();
      expect(savedData[0].filters).toEqual({});
    });
  });

  describe("saveRecentSearch", () => {
    it("should save a new search with filters", () => {
      const { result } = renderHook(() => useRecentSearches());

      act(() => {
        result.current.saveRecentSearch(
          "Austin, TX",
          { lat: 30.2672, lng: -97.7431 },
          { minPrice: "500", maxPrice: "1500", amenities: ["Wifi", "Parking"] },
        );
      });

      expect(result.current.recentSearches).toHaveLength(1);
      const saved = result.current.recentSearches[0];
      expect(saved.location).toBe("Austin, TX");
      expect(saved.filters.minPrice).toBe("500");
      expect(saved.filters.maxPrice).toBe("1500");
      expect(saved.filters.amenities).toEqual(["Wifi", "Parking"]);
    });

    it("should deduplicate by location (case-insensitive)", () => {
      const { result } = renderHook(() => useRecentSearches());

      act(() => {
        result.current.saveRecentSearch("Austin, TX", undefined, {
          minPrice: "500",
        });
      });
      act(() => {
        result.current.saveRecentSearch("austin, tx", undefined, {
          minPrice: "1000",
        });
      });

      expect(result.current.recentSearches).toHaveLength(1);
      // Should keep the newer one with updated filters
      expect(result.current.recentSearches[0].filters.minPrice).toBe("1000");
    });

    it("should limit to 5 recent searches", () => {
      const { result } = renderHook(() => useRecentSearches());

      act(() => {
        for (let i = 1; i <= 7; i++) {
          result.current.saveRecentSearch(`City ${i}`);
        }
      });

      expect(result.current.recentSearches).toHaveLength(5);
      // Should keep the 5 most recent (City 7, 6, 5, 4, 3)
      expect(result.current.recentSearches[0].location).toBe("City 7");
      expect(result.current.recentSearches[4].location).toBe("City 3");
    });

    it("should not save empty location", () => {
      const { result } = renderHook(() => useRecentSearches());

      act(() => {
        result.current.saveRecentSearch("   ");
      });

      expect(result.current.recentSearches).toHaveLength(0);
    });

    it("should trim location string", () => {
      const { result } = renderHook(() => useRecentSearches());

      act(() => {
        result.current.saveRecentSearch("  Austin, TX  ");
      });

      expect(result.current.recentSearches[0].location).toBe("Austin, TX");
    });
  });

  describe("removeRecentSearch", () => {
    it("should remove a search by id", () => {
      const existingSearches: RecentSearch[] = [
        {
          id: "test-1",
          location: "Austin, TX",
          timestamp: Date.now(),
          filters: {},
        },
        {
          id: "test-2",
          location: "Denver, CO",
          timestamp: Date.now(),
          filters: {},
        },
      ];
      localStorageMock.getItem.mockReturnValueOnce(
        JSON.stringify(existingSearches),
      );

      const { result } = renderHook(() => useRecentSearches());

      act(() => {
        result.current.removeRecentSearch("test-1");
      });

      expect(result.current.recentSearches).toHaveLength(1);
      expect(result.current.recentSearches[0].location).toBe("Denver, CO");
    });
  });

  describe("clearRecentSearches", () => {
    it("should clear all searches and remove from localStorage", () => {
      const existingSearches: RecentSearch[] = [
        {
          id: "test-1",
          location: "Austin, TX",
          timestamp: Date.now(),
          filters: {},
        },
      ];
      localStorageMock.getItem.mockReturnValueOnce(
        JSON.stringify(existingSearches),
      );

      const { result } = renderHook(() => useRecentSearches());

      act(() => {
        result.current.clearRecentSearches();
      });

      expect(result.current.recentSearches).toHaveLength(0);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "roomshare-recent-searches",
      );
    });
  });
});

describe("formatRecentSearch", () => {
  it("should format location only", () => {
    const search: RecentSearch = {
      id: "1",
      location: "Austin, TX",
      timestamp: Date.now(),
      filters: {},
    };

    expect(formatRecentSearch(search)).toBe("Austin, TX");
  });

  it("should format location with price range", () => {
    const search: RecentSearch = {
      id: "1",
      location: "Austin, TX",
      timestamp: Date.now(),
      filters: { minPrice: "500", maxPrice: "1500" },
    };

    expect(formatRecentSearch(search)).toBe("Austin, TX · $500-1500");
  });

  it("should use defaults for partial price range", () => {
    const searchMin: RecentSearch = {
      id: "1",
      location: "Austin, TX",
      timestamp: Date.now(),
      filters: { minPrice: "500" },
    };
    const searchMax: RecentSearch = {
      id: "2",
      location: "Denver, CO",
      timestamp: Date.now(),
      filters: { maxPrice: "1500" },
    };

    expect(formatRecentSearch(searchMin)).toBe("Austin, TX · $500-∞");
    expect(formatRecentSearch(searchMax)).toBe("Denver, CO · $0-1500");
  });

  it("should include room type", () => {
    const search: RecentSearch = {
      id: "1",
      location: "Austin, TX",
      timestamp: Date.now(),
      filters: { roomType: "Private Room" },
    };

    expect(formatRecentSearch(search)).toBe("Austin, TX · Private Room");
  });

  it("should format amenities (max 2 shown)", () => {
    const search: RecentSearch = {
      id: "1",
      location: "Austin, TX",
      timestamp: Date.now(),
      filters: { amenities: ["Wifi", "Parking", "Laundry"] },
    };

    expect(formatRecentSearch(search)).toBe("Austin, TX · Wifi, Parking +1");
  });

  it("should format full search with all filters", () => {
    const search: RecentSearch = {
      id: "1",
      location: "Austin, TX",
      timestamp: Date.now(),
      filters: {
        minPrice: "500",
        maxPrice: "1500",
        roomType: "Private Room",
        amenities: ["Wifi"],
      },
    };

    expect(formatRecentSearch(search)).toBe(
      "Austin, TX · $500-1500 · Private Room · Wifi",
    );
  });
});

describe("getFilterSummary", () => {
  it("should return null for empty filters", () => {
    const filters: RecentSearchFilters = {};
    expect(getFilterSummary(filters)).toBeNull();
  });

  it("should summarize price range", () => {
    const filters: RecentSearchFilters = { minPrice: "500", maxPrice: "1500" };
    expect(getFilterSummary(filters)).toBe("$500-1500");
  });

  it("should summarize room type", () => {
    const filters: RecentSearchFilters = { roomType: "Private Room" };
    expect(getFilterSummary(filters)).toBe("Private Room");
  });

  it("should summarize lease duration", () => {
    const filters: RecentSearchFilters = { leaseDuration: "6 months" };
    expect(getFilterSummary(filters)).toBe("6 months");
  });

  it("should count amenities and house rules", () => {
    const filters: RecentSearchFilters = {
      amenities: ["Wifi", "Parking"],
      houseRules: ["No smoking"],
    };
    expect(getFilterSummary(filters)).toBe("3 filters");
  });

  it("should combine multiple filter types", () => {
    const filters: RecentSearchFilters = {
      minPrice: "500",
      roomType: "Private Room",
      amenities: ["Wifi"],
    };
    expect(getFilterSummary(filters)).toBe("$500-∞ · Private Room · 1 filter");
  });
});
