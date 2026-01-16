/**
 * Unit tests for ListingFocusContext
 *
 * Tests the new API shape with activeId + scrollRequest pattern.
 * These tests define the expected behavior:
 * 1. setActive should persist (no auto-clear)
 * 2. requestScrollTo should create new nonce each time
 * 3. ackScrollTo should only clear when nonce matches
 * 4. clearFocus should clear all state
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  ListingFocusProvider,
  useListingFocus,
  useIsListingFocused,
} from "@/contexts/ListingFocusContext";

// Wrapper component for hooks
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ListingFocusProvider>{children}</ListingFocusProvider>
);

describe("ListingFocusContext", () => {
  describe("setActive", () => {
    it("should persist activeId (no auto-clear after 1s)", async () => {
      const { result } = renderHook(() => useListingFocus(), { wrapper });

      act(() => {
        result.current.setActive("listing-123");
      });

      expect(result.current.activeId).toBe("listing-123");

      // Wait 1.2 seconds - activeId should still be set (no auto-clear)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      });

      expect(result.current.activeId).toBe("listing-123");
    });

    it("should replace previous activeId when called with new id", () => {
      const { result } = renderHook(() => useListingFocus(), { wrapper });

      act(() => {
        result.current.setActive("listing-123");
      });
      expect(result.current.activeId).toBe("listing-123");

      act(() => {
        result.current.setActive("listing-456");
      });
      expect(result.current.activeId).toBe("listing-456");
    });

    it("should clear activeId when called with null", () => {
      const { result } = renderHook(() => useListingFocus(), { wrapper });

      act(() => {
        result.current.setActive("listing-123");
      });
      expect(result.current.activeId).toBe("listing-123");

      act(() => {
        result.current.setActive(null);
      });
      expect(result.current.activeId).toBeNull();
    });
  });

  describe("requestScrollTo", () => {
    it("should create scrollRequest with id and nonce", () => {
      const { result } = renderHook(() => useListingFocus(), { wrapper });

      act(() => {
        result.current.requestScrollTo("listing-123");
      });

      expect(result.current.scrollRequest).not.toBeNull();
      expect(result.current.scrollRequest?.id).toBe("listing-123");
      expect(typeof result.current.scrollRequest?.nonce).toBe("number");
    });

    it("should create new nonce even for same id consecutively", () => {
      const { result } = renderHook(() => useListingFocus(), { wrapper });

      act(() => {
        result.current.requestScrollTo("listing-abc");
      });
      const firstNonce = result.current.scrollRequest?.nonce;

      // Acknowledge the first request
      act(() => {
        result.current.ackScrollTo(firstNonce!);
      });

      // Request same id again
      act(() => {
        result.current.requestScrollTo("listing-abc");
      });
      const secondNonce = result.current.scrollRequest?.nonce;

      expect(secondNonce).not.toBe(firstNonce);
    });

    it("should increment nonce on consecutive requests", () => {
      const { result } = renderHook(() => useListingFocus(), { wrapper });

      const nonces: number[] = [];

      act(() => {
        result.current.requestScrollTo("listing-1");
      });
      nonces.push(result.current.scrollRequest!.nonce);

      act(() => {
        result.current.requestScrollTo("listing-2");
      });
      nonces.push(result.current.scrollRequest!.nonce);

      act(() => {
        result.current.requestScrollTo("listing-3");
      });
      nonces.push(result.current.scrollRequest!.nonce);

      // Each nonce should be unique and incrementing
      expect(nonces[1]).toBeGreaterThan(nonces[0]);
      expect(nonces[2]).toBeGreaterThan(nonces[1]);
    });
  });

  describe("ackScrollTo", () => {
    it("should clear scrollRequest when nonce matches", () => {
      const { result } = renderHook(() => useListingFocus(), { wrapper });

      act(() => {
        result.current.requestScrollTo("listing-123");
      });
      const nonce = result.current.scrollRequest!.nonce;

      act(() => {
        result.current.ackScrollTo(nonce);
      });

      expect(result.current.scrollRequest).toBeNull();
    });

    it("should NOT clear scrollRequest when nonce does not match", () => {
      const { result } = renderHook(() => useListingFocus(), { wrapper });

      act(() => {
        result.current.requestScrollTo("listing-123");
      });
      const originalNonce = result.current.scrollRequest!.nonce;

      // Try to ack with wrong nonce
      act(() => {
        result.current.ackScrollTo(originalNonce + 999);
      });

      // scrollRequest should still exist
      expect(result.current.scrollRequest).not.toBeNull();
      expect(result.current.scrollRequest?.nonce).toBe(originalNonce);
    });

    it("should handle ack for stale nonce (newer request exists)", () => {
      const { result } = renderHook(() => useListingFocus(), { wrapper });

      // First request
      act(() => {
        result.current.requestScrollTo("listing-old");
      });
      const oldNonce = result.current.scrollRequest!.nonce;

      // Second request (newer)
      act(() => {
        result.current.requestScrollTo("listing-new");
      });
      const newNonce = result.current.scrollRequest!.nonce;

      // Try to ack old nonce - should NOT clear because nonce doesn't match
      act(() => {
        result.current.ackScrollTo(oldNonce);
      });

      // New request should still exist
      expect(result.current.scrollRequest?.id).toBe("listing-new");
      expect(result.current.scrollRequest?.nonce).toBe(newNonce);
    });
  });

  describe("clearFocus", () => {
    it("should clear hovered, active, and scrollRequest", () => {
      const { result } = renderHook(() => useListingFocus(), { wrapper });

      // Set all states
      act(() => {
        result.current.setHovered("hovered-id");
        result.current.setActive("active-id");
        result.current.requestScrollTo("scroll-id");
      });

      expect(result.current.hoveredId).toBe("hovered-id");
      expect(result.current.activeId).toBe("active-id");
      expect(result.current.scrollRequest).not.toBeNull();

      // Clear all
      act(() => {
        result.current.clearFocus();
      });

      expect(result.current.hoveredId).toBeNull();
      expect(result.current.activeId).toBeNull();
      expect(result.current.scrollRequest).toBeNull();
    });
  });

  describe("setHovered", () => {
    it("should set and clear hoveredId", () => {
      const { result } = renderHook(() => useListingFocus(), { wrapper });

      act(() => {
        result.current.setHovered("hover-123");
      });
      expect(result.current.hoveredId).toBe("hover-123");

      act(() => {
        result.current.setHovered(null);
      });
      expect(result.current.hoveredId).toBeNull();
    });
  });

  describe("useIsListingFocused", () => {
    it("should return isActive true when activeId matches", () => {
      const { result } = renderHook(
        () => ({
          focus: useListingFocus(),
          isFocused: useIsListingFocused("listing-123"),
        }),
        { wrapper },
      );

      act(() => {
        result.current.focus.setActive("listing-123");
      });

      expect(result.current.isFocused.isActive).toBe(true);
      expect(result.current.isFocused.isFocused).toBe(true);
    });

    it("should return isHovered true when hoveredId matches", () => {
      const { result } = renderHook(
        () => ({
          focus: useListingFocus(),
          isFocused: useIsListingFocused("listing-123"),
        }),
        { wrapper },
      );

      act(() => {
        result.current.focus.setHovered("listing-123");
      });

      expect(result.current.isFocused.isHovered).toBe(true);
      expect(result.current.isFocused.isFocused).toBe(true);
    });

    it("should return isFocused true when either hovered or active", () => {
      const { result } = renderHook(
        () => ({
          focus: useListingFocus(),
          isFocused: useIsListingFocused("listing-123"),
        }),
        { wrapper },
      );

      // Initially not focused
      expect(result.current.isFocused.isFocused).toBe(false);

      // Active makes focused
      act(() => {
        result.current.focus.setActive("listing-123");
      });
      expect(result.current.isFocused.isFocused).toBe(true);

      // Clear active but set hovered
      act(() => {
        result.current.focus.setActive(null);
        result.current.focus.setHovered("listing-123");
      });
      expect(result.current.isFocused.isFocused).toBe(true);
    });
  });

  describe("SSR fallback", () => {
    it("should return stable fallback when used outside provider", () => {
      // Render without wrapper (outside provider)
      const { result: result1 } = renderHook(() => useListingFocus());
      const { result: result2 } = renderHook(() => useListingFocus());

      // Both should return null states
      expect(result1.current.hoveredId).toBeNull();
      expect(result1.current.activeId).toBeNull();
      expect(result1.current.scrollRequest).toBeNull();

      // Functions should be no-ops (not throw)
      expect(() => result1.current.setHovered("test")).not.toThrow();
      expect(() => result1.current.setActive("test")).not.toThrow();
      expect(() => result1.current.requestScrollTo("test")).not.toThrow();
      expect(() => result1.current.ackScrollTo(1)).not.toThrow();
      expect(() => result1.current.clearFocus()).not.toThrow();

      // Reference should be stable (same object)
      expect(result1.current).toBe(result2.current);
    });
  });
});
