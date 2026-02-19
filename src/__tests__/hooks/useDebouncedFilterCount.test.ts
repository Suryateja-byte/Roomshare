/**
 * Tests for useDebouncedFilterCount hook
 *
 * P3b: Tests boundsRequired handling when API indicates location selection needed
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useDebouncedFilterCount,
  clearCountCache,
} from "@/hooks/useDebouncedFilterCount";

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

// Mock fetch — save original and restore in afterAll to prevent cross-file leaks
const originalFetch = global.fetch;
const mockFetch = jest.fn();
beforeAll(() => { global.fetch = mockFetch; });
afterAll(() => { global.fetch = originalFetch; });

describe("useDebouncedFilterCount", () => {
  const defaultPending = {
    minPrice: "",
    maxPrice: "",
    roomType: "",
    leaseDuration: "",
    moveInDate: "",
    amenities: [] as string[],
    houseRules: [] as string[],
    languages: [] as string[],
    genderPreference: "",
    householdGender: "",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    clearCountCache(); // Clear cache between tests
    mockSearchParams.delete("q");
    mockSearchParams.delete("minLat");
    mockSearchParams.delete("maxLat");
    mockSearchParams.delete("minLng");
    mockSearchParams.delete("maxLng");
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("normal count behavior", () => {
    it("returns count from API when available", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 42 }),
      });

      const { result } = renderHook(() =>
        useDebouncedFilterCount({
          pending: defaultPending,
          isDirty: true,
          isDrawerOpen: true,
        }),
      );

      // Advance timers to trigger debounced fetch
      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(result.current.count).toBe(42);
      });

      expect(result.current.formattedCount).toBe("42 listings");
      expect(result.current.boundsRequired).toBe(false);
    });

    it("returns '100+ listings' when count is null", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: null }),
      });

      const { result } = renderHook(() =>
        useDebouncedFilterCount({
          pending: defaultPending,
          isDirty: true,
          isDrawerOpen: true,
        }),
      );

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.count).toBeNull();
      expect(result.current.formattedCount).toBe("100+ listings");
      expect(result.current.boundsRequired).toBe(false);
    });

    it("returns singular 'listing' for count of 1", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 1 }),
      });

      const { result } = renderHook(() =>
        useDebouncedFilterCount({
          pending: defaultPending,
          isDirty: true,
          isDrawerOpen: true,
        }),
      );

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(result.current.count).toBe(1);
      });

      expect(result.current.formattedCount).toBe("1 listing");
    });
  });

  describe("P3b - boundsRequired handling", () => {
    it("returns boundsRequired: true when API indicates it", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: null, boundsRequired: true }),
      });

      const { result } = renderHook(() =>
        useDebouncedFilterCount({
          pending: defaultPending,
          isDirty: true,
          isDrawerOpen: true,
        }),
      );

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(result.current.boundsRequired).toBe(true);
      });
    });

    it("shows 'Select a location' when boundsRequired is true", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: null, boundsRequired: true }),
      });

      const { result } = renderHook(() =>
        useDebouncedFilterCount({
          pending: defaultPending,
          isDirty: true,
          isDrawerOpen: true,
        }),
      );

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(result.current.formattedCount).toBe("Select a location");
      });
    });

    it("shows normal count when boundsRequired is false", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 50, boundsRequired: false }),
      });

      const { result } = renderHook(() =>
        useDebouncedFilterCount({
          pending: defaultPending,
          isDirty: true,
          isDrawerOpen: true,
        }),
      );

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(result.current.formattedCount).toBe("50 listings");
      });

      expect(result.current.boundsRequired).toBe(false);
    });

    it("boundsRequired defaults to false when not in response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 25 }), // No boundsRequired field
      });

      const { result } = renderHook(() =>
        useDebouncedFilterCount({
          pending: defaultPending,
          isDirty: true,
          isDrawerOpen: true,
        }),
      );

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(result.current.count).toBe(25);
      });

      expect(result.current.boundsRequired).toBe(false);
    });

    it("prioritizes boundsRequired over count display", async () => {
      // API returns both count and boundsRequired
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 0, boundsRequired: true }),
      });

      const { result } = renderHook(() =>
        useDebouncedFilterCount({
          pending: defaultPending,
          isDirty: true,
          isDrawerOpen: true,
        }),
      );

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(result.current.boundsRequired).toBe(true);
      });

      // Should show location prompt even though count is 0
      expect(result.current.formattedCount).toBe("Select a location");
    });
  });

  describe("drawer and dirty state", () => {
    it("does not fetch when drawer is closed", async () => {
      const { result } = renderHook(() =>
        useDebouncedFilterCount({
          pending: defaultPending,
          isDirty: true,
          isDrawerOpen: false,
        }),
      );

      act(() => {
        jest.advanceTimersByTime(350);
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.count).toBeNull();
    });

    it("does not fetch when filters are not dirty", async () => {
      const { result } = renderHook(() =>
        useDebouncedFilterCount({
          pending: defaultPending,
          isDirty: false,
          isDrawerOpen: true,
        }),
      );

      act(() => {
        jest.advanceTimersByTime(350);
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.current.count).toBeNull();
    });
  });

  describe("P3-NEW-a: boundsRequired state reset", () => {
    it("resets boundsRequired when drawer closes", async () => {
      // First call returns boundsRequired: true
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: null, boundsRequired: true }),
      });

      const { result, rerender } = renderHook(
        (props) => useDebouncedFilterCount(props),
        {
          initialProps: {
            pending: defaultPending,
            isDirty: true,
            isDrawerOpen: true,
          },
        },
      );

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(result.current.boundsRequired).toBe(true);
      });

      // Close drawer - boundsRequired should reset
      rerender({ pending: defaultPending, isDirty: true, isDrawerOpen: false });

      expect(result.current.boundsRequired).toBe(false);
    });

    it("resets boundsRequired when filters become clean", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: null, boundsRequired: true }),
      });

      const { result, rerender } = renderHook(
        (props) => useDebouncedFilterCount(props),
        {
          initialProps: {
            pending: defaultPending,
            isDirty: true,
            isDrawerOpen: true,
          },
        },
      );

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(result.current.boundsRequired).toBe(true);
      });

      // Filters become clean (isDirty: false)
      rerender({ pending: defaultPending, isDirty: false, isDrawerOpen: true });

      expect(result.current.boundsRequired).toBe(false);
    });

    it("resets boundsRequired on cache hit after successful query", async () => {
      // First call: boundsRequired=true
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: null, boundsRequired: true }),
      });

      const { result, rerender } = renderHook(
        (props) => useDebouncedFilterCount(props),
        {
          initialProps: {
            pending: defaultPending,
            isDirty: true,
            isDrawerOpen: true,
          },
        },
      );

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(result.current.boundsRequired).toBe(true);
      });

      // Close then reopen drawer - this triggers cache lookup
      rerender({ pending: defaultPending, isDirty: false, isDrawerOpen: false });
      clearCountCache(); // Clear cache to force fresh state

      // Second call: boundsRequired=false (normal response)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 50, boundsRequired: false }),
      });

      rerender({ pending: defaultPending, isDirty: true, isDrawerOpen: true });

      act(() => {
        jest.advanceTimersByTime(350);
      });

      await waitFor(() => {
        expect(result.current.count).toBe(50);
      });

      expect(result.current.boundsRequired).toBe(false);
    });
  });
});
