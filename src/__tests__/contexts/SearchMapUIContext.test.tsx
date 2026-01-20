/**
 * Unit tests for SearchMapUIContext
 *
 * Tests the card-to-map focus coordination:
 * 1. focusListingOnMap should store pending focus AND call showMap
 * 2. acknowledgeFocus should clear only when nonce matches
 * 3. pendingFocus should persist until acknowledged or replaced
 * 4. Graceful fallback when used outside provider
 *
 * TDD: These tests define expected behavior for the hydration race condition fix:
 * - pendingFocus must be stored even if showMap is a no-op (during hydration)
 * - When showMap becomes functional later, the pending focus should still trigger
 */

import { renderHook, act } from "@testing-library/react";
import {
  SearchMapUIProvider,
  useSearchMapUI,
  usePendingMapFocus,
} from "@/contexts/SearchMapUIContext";

// Wrapper factory that accepts showMap and shouldShowMap props
const createWrapper = (showMap: () => void, shouldShowMap: boolean) => {
  return ({ children }: { children: React.ReactNode }) => (
    <SearchMapUIProvider showMap={showMap} shouldShowMap={shouldShowMap}>
      {children}
    </SearchMapUIProvider>
  );
};

describe("SearchMapUIContext", () => {
  describe("focusListingOnMap", () => {
    it("should store pendingFocus with listing ID and nonce", () => {
      const showMap = jest.fn();
      const wrapper = createWrapper(showMap, false);

      const { result } = renderHook(() => useSearchMapUI(), { wrapper });

      act(() => {
        result.current.focusListingOnMap("listing-123");
      });

      expect(result.current.pendingFocus).not.toBeNull();
      expect(result.current.pendingFocus?.listingId).toBe("listing-123");
      expect(typeof result.current.pendingFocus?.nonce).toBe("number");
    });

    it("should call showMap when map is not visible", () => {
      const showMap = jest.fn();
      const wrapper = createWrapper(showMap, false);

      const { result } = renderHook(() => useSearchMapUI(), { wrapper });

      act(() => {
        result.current.focusListingOnMap("listing-123");
      });

      expect(showMap).toHaveBeenCalledTimes(1);
    });

    it("should NOT call showMap when map is already visible", () => {
      const showMap = jest.fn();
      const wrapper = createWrapper(showMap, true);

      const { result } = renderHook(() => useSearchMapUI(), { wrapper });

      act(() => {
        result.current.focusListingOnMap("listing-123");
      });

      expect(showMap).not.toHaveBeenCalled();
    });

    it("should store pendingFocus even when showMap is a no-op (hydration scenario)", () => {
      // This is the critical test for the hydration bug fix
      // During hydration, showMap is () => {} which does nothing
      // But pendingFocus MUST still be stored so it can be processed later
      const noOpShowMap = jest.fn(); // no-op like during hydration
      const wrapper = createWrapper(noOpShowMap, false);

      const { result } = renderHook(() => useSearchMapUI(), { wrapper });

      act(() => {
        result.current.focusListingOnMap("listing-456");
      });

      // Even though showMap does nothing, pendingFocus must be stored
      expect(result.current.pendingFocus).not.toBeNull();
      expect(result.current.pendingFocus?.listingId).toBe("listing-456");
    });

    it("should increment nonce on consecutive focus requests", () => {
      const showMap = jest.fn();
      const wrapper = createWrapper(showMap, false);

      const { result } = renderHook(() => useSearchMapUI(), { wrapper });

      const nonces: number[] = [];

      act(() => {
        result.current.focusListingOnMap("listing-1");
      });
      nonces.push(result.current.pendingFocus!.nonce);

      act(() => {
        result.current.focusListingOnMap("listing-2");
      });
      nonces.push(result.current.pendingFocus!.nonce);

      act(() => {
        result.current.focusListingOnMap("listing-3");
      });
      nonces.push(result.current.pendingFocus!.nonce);

      // Each nonce should be unique and incrementing
      expect(nonces[1]).toBeGreaterThan(nonces[0]);
      expect(nonces[2]).toBeGreaterThan(nonces[1]);
    });

    it("should replace previous pending focus with new one (rapid clicks)", () => {
      const showMap = jest.fn();
      const wrapper = createWrapper(showMap, false);

      const { result } = renderHook(() => useSearchMapUI(), { wrapper });

      act(() => {
        result.current.focusListingOnMap("listing-old");
      });

      act(() => {
        result.current.focusListingOnMap("listing-new");
      });

      // Only the latest focus should be pending
      expect(result.current.pendingFocus?.listingId).toBe("listing-new");
    });
  });

  describe("acknowledgeFocus", () => {
    it("should clear pendingFocus when nonce matches", () => {
      const showMap = jest.fn();
      const wrapper = createWrapper(showMap, true);

      const { result } = renderHook(() => useSearchMapUI(), { wrapper });

      act(() => {
        result.current.focusListingOnMap("listing-123");
      });
      const nonce = result.current.pendingFocus!.nonce;

      act(() => {
        result.current.acknowledgeFocus(nonce);
      });

      expect(result.current.pendingFocus).toBeNull();
    });

    it("should NOT clear pendingFocus when nonce does not match", () => {
      const showMap = jest.fn();
      const wrapper = createWrapper(showMap, true);

      const { result } = renderHook(() => useSearchMapUI(), { wrapper });

      act(() => {
        result.current.focusListingOnMap("listing-123");
      });
      const originalNonce = result.current.pendingFocus!.nonce;

      // Try to acknowledge with wrong nonce
      act(() => {
        result.current.acknowledgeFocus(originalNonce + 999);
      });

      // pendingFocus should still exist
      expect(result.current.pendingFocus).not.toBeNull();
      expect(result.current.pendingFocus?.nonce).toBe(originalNonce);
    });

    it("should ignore stale acknowledgment (newer request exists)", () => {
      const showMap = jest.fn();
      const wrapper = createWrapper(showMap, true);

      const { result } = renderHook(() => useSearchMapUI(), { wrapper });

      // First request
      act(() => {
        result.current.focusListingOnMap("listing-old");
      });
      const oldNonce = result.current.pendingFocus!.nonce;

      // Second request (newer, replaces first)
      act(() => {
        result.current.focusListingOnMap("listing-new");
      });
      const newNonce = result.current.pendingFocus!.nonce;

      // Try to ack old nonce - should NOT clear because nonce doesn't match
      act(() => {
        result.current.acknowledgeFocus(oldNonce);
      });

      // New request should still be pending
      expect(result.current.pendingFocus?.listingId).toBe("listing-new");
      expect(result.current.pendingFocus?.nonce).toBe(newNonce);
    });
  });

  describe("clearPendingFocus", () => {
    it("should clear pendingFocus regardless of nonce", () => {
      const showMap = jest.fn();
      const wrapper = createWrapper(showMap, true);

      const { result } = renderHook(() => useSearchMapUI(), { wrapper });

      act(() => {
        result.current.focusListingOnMap("listing-123");
      });
      expect(result.current.pendingFocus).not.toBeNull();

      act(() => {
        result.current.clearPendingFocus();
      });

      expect(result.current.pendingFocus).toBeNull();
    });
  });

  describe("dismiss", () => {
    it("should call registered dismiss function", () => {
      const showMap = jest.fn();
      const dismissFn = jest.fn();
      const wrapper = createWrapper(showMap, true);

      const { result } = renderHook(() => useSearchMapUI(), { wrapper });

      act(() => {
        result.current.registerDismiss(dismissFn);
      });

      act(() => {
        result.current.dismiss();
      });

      expect(dismissFn).toHaveBeenCalledTimes(1);
    });

    it("should not throw when no dismiss function registered", () => {
      const showMap = jest.fn();
      const wrapper = createWrapper(showMap, true);

      const { result } = renderHook(() => useSearchMapUI(), { wrapper });

      expect(() => {
        act(() => {
          result.current.dismiss();
        });
      }).not.toThrow();
    });
  });

  describe("usePendingMapFocus", () => {
    it("should provide pendingFocus and acknowledgeFocus", () => {
      const showMap = jest.fn();
      const wrapper = createWrapper(showMap, true);

      const { result } = renderHook(() => usePendingMapFocus(), { wrapper });

      expect(result.current.pendingFocus).toBeNull();
      expect(typeof result.current.acknowledgeFocus).toBe("function");
      expect(typeof result.current.clearPendingFocus).toBe("function");
    });
  });

  describe("SSR fallback (outside provider)", () => {
    it("should return stable no-op fallback when used outside provider", () => {
      // Render without wrapper (outside provider)
      const { result: result1 } = renderHook(() => useSearchMapUI());
      const { result: result2 } = renderHook(() => useSearchMapUI());

      // Should return null state
      expect(result1.current.pendingFocus).toBeNull();

      // Functions should be no-ops (not throw)
      expect(() => result1.current.focusListingOnMap("test")).not.toThrow();
      expect(() => result1.current.acknowledgeFocus(1)).not.toThrow();
      expect(() => result1.current.clearPendingFocus()).not.toThrow();
      expect(() => result1.current.registerDismiss(() => {})).not.toThrow();
      expect(() => result1.current.dismiss()).not.toThrow();

      // Both hooks should return the same fallback shape
      expect(result1.current.pendingFocus).toBeNull();
      expect(result2.current.pendingFocus).toBeNull();
    });
  });

  describe("hydration race condition fix", () => {
    /**
     * This test suite specifically targets the bug where:
     * 1. During hydration, SearchLayoutView passes showMap={() => {}} (no-op)
     * 2. User clicks "View on Map" button
     * 3. focusListingOnMap is called but showMap does nothing
     * 4. Map never shows, focus is lost
     *
     * The fix should:
     * 1. Store pendingFocus even with no-op showMap
     * 2. Queue the showMap request
     * 3. Execute queued showMap when hydration completes
     */

    it("should persist pendingFocus through provider prop changes", () => {
      // Simulate hydration: start with no-op showMap
      const noOpShowMap = jest.fn();

      // Start with no-op (hydration state)
      const { result, rerender } = renderHook(() => useSearchMapUI(), {
        wrapper: createWrapper(noOpShowMap, false),
      });

      // User clicks View on Map during hydration
      act(() => {
        result.current.focusListingOnMap("listing-hydration-test");
      });

      expect(result.current.pendingFocus?.listingId).toBe(
        "listing-hydration-test",
      );
      expect(noOpShowMap).toHaveBeenCalledTimes(1);

      // Rerender (simulating post-hydration)
      // NOTE: This test documents that pendingFocus persists
      // The actual fix needs to be in SearchLayoutView to queue and replay showMap
      rerender();

      // pendingFocus should still be present for the Map to consume
      expect(result.current.pendingFocus?.listingId).toBe(
        "listing-hydration-test",
      );
    });

    it("should handle focus request while shouldShowMap is false", () => {
      const showMap = jest.fn();

      // shouldShowMap = false means map is hidden
      const wrapper = createWrapper(showMap, false);
      const { result } = renderHook(() => useSearchMapUI(), { wrapper });

      act(() => {
        result.current.focusListingOnMap("listing-hidden-map");
      });

      // showMap should be called to reveal the map
      expect(showMap).toHaveBeenCalledTimes(1);
      // pendingFocus should be stored for the map to process once visible
      expect(result.current.pendingFocus?.listingId).toBe("listing-hidden-map");
    });
  });
});
