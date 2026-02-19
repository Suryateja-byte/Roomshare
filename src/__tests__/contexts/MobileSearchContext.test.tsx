/**
 * Unit tests for MobileSearchContext
 *
 * Tests the mobile search bar coordination:
 * 1. expand() sets isExpanded to true and scrolls to top
 * 2. collapse() sets isExpanded to false
 * 3. isExpanded reflects current state
 * 4. openFilters() calls registered handler
 * 5. registerOpenFilters() stores handler via ref (no re-render)
 * 6. Stable fallback when used outside provider
 */

import { renderHook, act } from "@testing-library/react";
import {
  MobileSearchProvider,
  useMobileSearch,
} from "@/contexts/MobileSearchContext";

// Mock window.scrollTo
const mockScrollTo = jest.fn();
Object.defineProperty(window, "scrollTo", {
  value: mockScrollTo,
  writable: true,
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MobileSearchProvider>{children}</MobileSearchProvider>
);

describe("MobileSearchContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("initial state", () => {
    it("isExpanded is false by default", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });
      expect(result.current.isExpanded).toBe(false);
    });

    it("provides all expected methods", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });
      expect(typeof result.current.expand).toBe("function");
      expect(typeof result.current.collapse).toBe("function");
      expect(typeof result.current.openFilters).toBe("function");
      expect(typeof result.current.registerOpenFilters).toBe("function");
    });
  });

  describe("expand", () => {
    it("sets isExpanded to true", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });

      act(() => {
        result.current.expand();
      });

      expect(result.current.isExpanded).toBe(true);
    });

    it("scrolls to top on expand", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });

      act(() => {
        result.current.expand();
      });

      expect(mockScrollTo).toHaveBeenCalledWith({
        top: 0,
        behavior: "smooth",
      });
    });
  });

  describe("collapse", () => {
    it("sets isExpanded to false", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });

      // Expand first
      act(() => {
        result.current.expand();
      });
      expect(result.current.isExpanded).toBe(true);

      // Then collapse
      act(() => {
        result.current.collapse();
      });
      expect(result.current.isExpanded).toBe(false);
    });
  });

  describe("expand/collapse toggle", () => {
    it("toggles isExpanded between true and false", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });

      expect(result.current.isExpanded).toBe(false);

      act(() => {
        result.current.expand();
      });
      expect(result.current.isExpanded).toBe(true);

      act(() => {
        result.current.collapse();
      });
      expect(result.current.isExpanded).toBe(false);

      act(() => {
        result.current.expand();
      });
      expect(result.current.isExpanded).toBe(true);
    });
  });

  describe("openFilters", () => {
    it("calls registered filter handler", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });
      const handler = jest.fn();

      act(() => {
        result.current.registerOpenFilters(handler);
      });

      act(() => {
        result.current.openFilters();
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("does not throw when no handler is registered", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });

      expect(() => {
        act(() => {
          result.current.openFilters();
        });
      }).not.toThrow();
    });

    it("uses the most recently registered handler", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      act(() => {
        result.current.registerOpenFilters(handler1);
      });

      act(() => {
        result.current.registerOpenFilters(handler2);
      });

      act(() => {
        result.current.openFilters();
      });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe("fallback when used outside provider", () => {
    it("returns stable fallback context", () => {
      const { result: result1 } = renderHook(() => useMobileSearch());
      const { result: result2 } = renderHook(() => useMobileSearch());

      expect(result1.current.isExpanded).toBe(false);
      expect(typeof result1.current.expand).toBe("function");
      expect(typeof result1.current.collapse).toBe("function");
      expect(typeof result1.current.openFilters).toBe("function");
      expect(typeof result1.current.registerOpenFilters).toBe("function");

      // Same object reference (module-level constant)
      expect(result1.current).toBe(result2.current);
    });

    it("fallback functions are no-ops and do not throw", () => {
      const { result } = renderHook(() => useMobileSearch());

      expect(() => result.current.expand()).not.toThrow();
      expect(() => result.current.collapse()).not.toThrow();
      expect(() => result.current.openFilters()).not.toThrow();
      expect(() => result.current.registerOpenFilters(() => {})).not.toThrow();
    });
  });
});
