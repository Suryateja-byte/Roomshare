/**
 * Unit tests for SearchV2DataContext
 *
 * Tests the selector hooks and data versioning logic:
 * 1. Default context values
 * 2. useV2MapData returns map data
 * 3. useIsV2Enabled returns enabled state and setter
 * 4. useDataVersion tracks version changes
 * 5. setV2MapData with version guards (stale data rejection)
 * 6. useV2MapDataSetter returns stable setter + version
 * 7. Fallback behavior when used outside provider
 */

// Mocks MUST come before imports (ESM compatibility)
const mockSearchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/lib/search-params", () => ({
  buildCanonicalFilterParamsFromSearchParams: (sp: URLSearchParams) => {
    // Return a minimal URLSearchParams for test determinism
    const result = new URLSearchParams();
    const q = sp.get("q");
    if (q) result.set("q", q);
    const amenities = sp.get("amenities");
    if (amenities) result.set("amenities", amenities);
    return result;
  },
}));

import { renderHook, act } from "@testing-library/react";
import {
  SearchV2DataProvider,
  useSearchV2Data,
  useV2MapData,
  useV2MapDataSetter,
  useIsV2Enabled,
  useDataVersion,
} from "@/contexts/SearchV2DataContext";
import type { V2MapData } from "@/contexts/SearchV2DataContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SearchV2DataProvider>{children}</SearchV2DataProvider>
);

const makeMapData = (overrides?: Partial<V2MapData>): V2MapData => ({
  geojson: { type: "FeatureCollection", features: [] },
  mode: "geojson",
  ...overrides,
});

describe("SearchV2DataContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset search params between tests
    Array.from(mockSearchParams.keys()).forEach((key) =>
      mockSearchParams.delete(key),
    );
  });

  describe("default values", () => {
    it("provides v2MapData as null initially", () => {
      const { result } = renderHook(() => useSearchV2Data(), { wrapper });
      expect(result.current.v2MapData).toBeNull();
    });

    it("provides isV2Enabled as false initially", () => {
      const { result } = renderHook(() => useSearchV2Data(), { wrapper });
      expect(result.current.isV2Enabled).toBe(false);
    });

    it("provides dataVersion as 0 initially", () => {
      const { result } = renderHook(() => useSearchV2Data(), { wrapper });
      expect(result.current.dataVersion).toBe(0);
    });
  });

  describe("useV2MapData", () => {
    it("returns null initially", () => {
      const { result } = renderHook(() => useV2MapData(), { wrapper });
      expect(result.current).toBeNull();
    });

    it("returns map data after setV2MapData", () => {
      const { result } = renderHook(
        () => ({
          data: useV2MapData(),
          full: useSearchV2Data(),
        }),
        { wrapper },
      );

      const testData = makeMapData();

      act(() => {
        result.current.full.setV2MapData(testData);
      });

      expect(result.current.data).toEqual(testData);
    });
  });

  describe("useIsV2Enabled", () => {
    it("returns isV2Enabled and setIsV2Enabled", () => {
      const { result } = renderHook(() => useIsV2Enabled(), { wrapper });

      expect(result.current.isV2Enabled).toBe(false);
      expect(typeof result.current.setIsV2Enabled).toBe("function");
    });

    it("toggles isV2Enabled via setIsV2Enabled", () => {
      const { result } = renderHook(() => useIsV2Enabled(), { wrapper });

      act(() => {
        result.current.setIsV2Enabled(true);
      });

      expect(result.current.isV2Enabled).toBe(true);

      act(() => {
        result.current.setIsV2Enabled(false);
      });

      expect(result.current.isV2Enabled).toBe(false);
    });
  });

  describe("useDataVersion", () => {
    it("returns 0 initially", () => {
      const { result } = renderHook(() => useDataVersion(), { wrapper });
      expect(result.current).toBe(0);
    });
  });

  describe("useV2MapDataSetter", () => {
    it("returns setV2MapData function and dataVersion", () => {
      const { result } = renderHook(() => useV2MapDataSetter(), { wrapper });

      expect(typeof result.current.setV2MapData).toBe("function");
      expect(result.current.dataVersion).toBe(0);
    });

    it("setV2MapData updates v2MapData", () => {
      const { result } = renderHook(
        () => ({
          setter: useV2MapDataSetter(),
          data: useV2MapData(),
        }),
        { wrapper },
      );

      const testData = makeMapData({ mode: "pins" });

      act(() => {
        result.current.setter.setV2MapData(testData);
      });

      expect(result.current.data).toEqual(testData);
    });
  });

  describe("version-guarded setV2MapData", () => {
    it("accepts data when no version is specified", () => {
      const { result } = renderHook(
        () => ({
          full: useSearchV2Data(),
          data: useV2MapData(),
        }),
        { wrapper },
      );

      const testData = makeMapData();

      act(() => {
        result.current.full.setV2MapData(testData);
      });

      expect(result.current.data).toEqual(testData);
    });

    it("accepts data when version matches current dataVersion", () => {
      const { result } = renderHook(
        () => ({
          full: useSearchV2Data(),
          data: useV2MapData(),
        }),
        { wrapper },
      );

      const testData = makeMapData();

      act(() => {
        // Version 0 matches initial dataVersion
        result.current.full.setV2MapData(testData, 0);
      });

      expect(result.current.data).toEqual(testData);
    });

    it("rejects data when version does not match current dataVersion", () => {
      const { result } = renderHook(
        () => ({
          full: useSearchV2Data(),
          data: useV2MapData(),
        }),
        { wrapper },
      );

      const staleData = makeMapData({ mode: "pins" });

      act(() => {
        // Version 99 does not match current version 0
        result.current.full.setV2MapData(staleData, 99);
      });

      // Data should remain null (stale data rejected)
      expect(result.current.data).toBeNull();
    });
  });

  describe("setV2MapData can clear data", () => {
    it("sets data to null", () => {
      const { result } = renderHook(
        () => ({
          full: useSearchV2Data(),
          data: useV2MapData(),
        }),
        { wrapper },
      );

      const testData = makeMapData();

      act(() => {
        result.current.full.setV2MapData(testData);
      });

      expect(result.current.data).not.toBeNull();

      act(() => {
        result.current.full.setV2MapData(null);
      });

      expect(result.current.data).toBeNull();
    });
  });

  describe("context outside provider", () => {
    it("useSearchV2Data returns default values outside provider", () => {
      const { result } = renderHook(() => useSearchV2Data());

      expect(result.current.v2MapData).toBeNull();
      expect(result.current.isV2Enabled).toBe(false);
      expect(result.current.dataVersion).toBe(0);
      expect(typeof result.current.setV2MapData).toBe("function");
      expect(typeof result.current.setIsV2Enabled).toBe("function");
    });

    it("useV2MapData returns null outside provider", () => {
      const { result } = renderHook(() => useV2MapData());
      expect(result.current).toBeNull();
    });

    it("useIsV2Enabled returns defaults outside provider", () => {
      const { result } = renderHook(() => useIsV2Enabled());
      expect(result.current.isV2Enabled).toBe(false);
    });

    it("useDataVersion returns 0 outside provider", () => {
      const { result } = renderHook(() => useDataVersion());
      expect(result.current).toBe(0);
    });

    it("no-op setV2MapData does not throw outside provider", () => {
      const { result } = renderHook(() => useSearchV2Data());
      expect(() => result.current.setV2MapData(makeMapData())).not.toThrow();
    });
  });
});
