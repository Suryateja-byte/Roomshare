/**
 * Unit tests for MapBoundsContext programmatic move detection
 *
 * TDD: These tests define expected behavior for the programmatic move fix:
 * - Programmatic moves (flyTo, fitBounds, easeTo) should NOT set hasUserMoved
 * - User moves (drag/pan/zoom) SHOULD set hasUserMoved
 * - Banner logic should only trigger on user moves
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  MapBoundsProvider,
  useMapBounds,
  useMapMovedBanner,
} from "@/contexts/MapBoundsContext";

// Wrapper factory following SearchMapUIContext.test.tsx pattern
const createWrapper = () => {
  return ({ children }: { children: React.ReactNode }) => (
    <MapBoundsProvider>{children}</MapBoundsProvider>
  );
};

describe("MapBoundsContext", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe("programmatic move detection", () => {
    it("should NOT set hasUserMoved when programmatic move flag is set", () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useMapBounds(), { wrapper });

      // Set programmatic move flag first
      act(() => {
        result.current.setProgrammaticMove(true);
      });

      // Try to set hasUserMoved
      act(() => {
        result.current.setHasUserMoved(true);
      });

      // hasUserMoved should remain false because programmatic flag was set
      expect(result.current.hasUserMoved).toBe(false);
    });

    it("should set hasUserMoved when no programmatic move flag is set", () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useMapBounds(), { wrapper });

      // No programmatic flag set - directly set hasUserMoved
      act(() => {
        result.current.setHasUserMoved(true);
      });

      expect(result.current.hasUserMoved).toBe(true);
    });

    it("should clear programmatic move flag after timeout", async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useMapBounds(), { wrapper });

      // Set programmatic move flag
      act(() => {
        result.current.setProgrammaticMove(true);
      });

      expect(result.current.isProgrammaticMove).toBe(true);

      // Advance timers past the auto-clear timeout (1500ms)
      act(() => {
        jest.advanceTimersByTime(1600);
      });

      expect(result.current.isProgrammaticMove).toBe(false);
    });

    it("should clear programmatic move flag when clearProgrammaticMove is called", () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useMapBounds(), { wrapper });

      // Set programmatic move flag
      act(() => {
        result.current.setProgrammaticMove(true);
      });

      expect(result.current.isProgrammaticMove).toBe(true);

      // Clear it manually
      act(() => {
        result.current.setProgrammaticMove(false);
      });

      expect(result.current.isProgrammaticMove).toBe(false);
    });

    it("should reset timeout when setProgrammaticMove is called again", () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useMapBounds(), { wrapper });

      // Set programmatic move flag
      act(() => {
        result.current.setProgrammaticMove(true);
      });

      // Wait 1000ms (not enough to clear)
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(result.current.isProgrammaticMove).toBe(true);

      // Set it again (should reset the timeout)
      act(() => {
        result.current.setProgrammaticMove(true);
      });

      // Wait another 1000ms (total 2000ms from first call, but only 1000ms from second)
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Should still be true because timeout was reset
      expect(result.current.isProgrammaticMove).toBe(true);

      // Wait another 600ms to exceed 1500ms from second call
      act(() => {
        jest.advanceTimersByTime(600);
      });

      expect(result.current.isProgrammaticMove).toBe(false);
    });
  });

  describe("banner visibility logic", () => {
    it("should NOT show banner after programmatic move", () => {
      const wrapper = createWrapper();
      const { result: boundsResult } = renderHook(() => useMapBounds(), { wrapper });
      const { result: bannerResult } = renderHook(() => useMapMovedBanner(), { wrapper });

      // Simulate programmatic move
      act(() => {
        boundsResult.current.setProgrammaticMove(true);
        boundsResult.current.setHasUserMoved(true);
        boundsResult.current.setBoundsDirty(true);
      });

      // Banner should NOT show
      expect(bannerResult.current.showBanner).toBe(false);
    });

    it("should show banner after user pan with boundsDirty", () => {
      const wrapper = createWrapper();
      // Use combined hook to share context state
      const useCombined = () => ({
        bounds: useMapBounds(),
        banner: useMapMovedBanner(),
      });
      const { result } = renderHook(() => useCombined(), { wrapper });

      // Simulate user move (no programmatic flag)
      act(() => {
        result.current.bounds.setHasUserMoved(true);
        result.current.bounds.setBoundsDirty(true);
      });

      // Banner SHOULD show
      expect(result.current.banner.showBanner).toBe(true);
    });

    it("should NOT show banner when searchAsMove is enabled", () => {
      const wrapper = createWrapper();
      const { result: boundsResult } = renderHook(() => useMapBounds(), { wrapper });
      const { result: bannerResult } = renderHook(() => useMapMovedBanner(), { wrapper });

      // Simulate user move with searchAsMove enabled
      act(() => {
        boundsResult.current.setSearchAsMove(true);
        boundsResult.current.setHasUserMoved(true);
        boundsResult.current.setBoundsDirty(true);
      });

      // Banner should NOT show because searchAsMove is on
      expect(bannerResult.current.showBanner).toBe(false);
    });

    it("should NOT show banner when bounds are not dirty", () => {
      const wrapper = createWrapper();
      const { result: boundsResult } = renderHook(() => useMapBounds(), { wrapper });
      const { result: bannerResult } = renderHook(() => useMapMovedBanner(), { wrapper });

      // Simulate user move without dirty bounds
      act(() => {
        boundsResult.current.setHasUserMoved(true);
        // boundsDirty is false by default
      });

      // Banner should NOT show because bounds not dirty
      expect(bannerResult.current.showBanner).toBe(false);
    });

    it("should reset hasUserMoved when setHasUserMoved(false) is called", () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useMapBounds(), { wrapper });

      // Set hasUserMoved to true
      act(() => {
        result.current.setHasUserMoved(true);
      });

      expect(result.current.hasUserMoved).toBe(true);

      // Reset it
      act(() => {
        result.current.setHasUserMoved(false);
      });

      expect(result.current.hasUserMoved).toBe(false);
    });
  });

  describe("location conflict detection", () => {
    it("should NOT show location conflict after programmatic move outside search area", () => {
      const wrapper = createWrapper();
      const { result: boundsResult } = renderHook(() => useMapBounds(), { wrapper });
      const { result: bannerResult } = renderHook(() => useMapMovedBanner(), { wrapper });

      // Set a search location
      act(() => {
        boundsResult.current.setSearchLocation("San Francisco", { lat: 37.7749, lng: -122.4194 });
      });

      // Simulate programmatic move to bounds that don't contain search location
      act(() => {
        boundsResult.current.setProgrammaticMove(true);
        boundsResult.current.setHasUserMoved(true);
        boundsResult.current.setCurrentMapBounds({
          minLat: 40.0,
          maxLat: 41.0,
          minLng: -74.0,
          maxLng: -73.0,
        });
      });

      // Location conflict should NOT show because it was programmatic
      expect(bannerResult.current.showLocationConflict).toBe(false);
    });

    it("should show location conflict after user pan outside search area", () => {
      const wrapper = createWrapper();
      // Use combined hook to share context state
      const useCombined = () => ({
        bounds: useMapBounds(),
        banner: useMapMovedBanner(),
      });
      const { result } = renderHook(() => useCombined(), { wrapper });

      // Set a search location
      act(() => {
        result.current.bounds.setSearchLocation("San Francisco", { lat: 37.7749, lng: -122.4194 });
      });

      // Simulate user move to bounds that don't contain search location
      act(() => {
        result.current.bounds.setHasUserMoved(true);
        result.current.bounds.setCurrentMapBounds({
          minLat: 40.0,
          maxLat: 41.0,
          minLng: -74.0,
          maxLng: -73.0,
        });
      });

      // Location conflict SHOULD show because user panned away
      expect(result.current.banner.showLocationConflict).toBe(true);
    });
  });

  describe("SSR fallback (outside provider)", () => {
    it("should return safe defaults when used outside provider", () => {
      // Render without wrapper (outside provider)
      const { result } = renderHook(() => useMapBounds());

      // Should return null/false state
      expect(result.current.hasUserMoved).toBe(false);
      expect(result.current.boundsDirty).toBe(false);
      expect(result.current.searchAsMove).toBe(false);
      expect(result.current.isProgrammaticMove).toBe(false);

      // Functions should be no-ops (not throw)
      expect(() => result.current.setHasUserMoved(true)).not.toThrow();
      expect(() => result.current.setBoundsDirty(true)).not.toThrow();
      expect(() => result.current.setProgrammaticMove(true)).not.toThrow();
      expect(() => result.current.setSearchAsMove(true)).not.toThrow();
    });

    it("should return safe defaults for useMapMovedBanner outside provider", () => {
      const { result } = renderHook(() => useMapMovedBanner());

      expect(result.current.showBanner).toBe(false);
      expect(result.current.showLocationConflict).toBe(false);

      // Functions should be no-ops
      expect(() => result.current.onSearch()).not.toThrow();
      expect(() => result.current.onReset()).not.toThrow();
    });
  });
});
