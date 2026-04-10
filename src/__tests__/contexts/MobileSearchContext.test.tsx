/**
 * Unit tests for MobileSearchContext
 *
 * Tests the mobile search bar coordination:
 * 1. expand() sets isExpanded to true and scrolls to top
 * 2. collapse() sets isExpanded to false
 * 3. isExpanded reflects current state
 * 4. openFilters() calls registered handler
 * 5. registerOpenFilters() supports cleanup and priority without re-rendering
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
      expect(typeof result.current.searchResultsLabel).toBe("string");
      expect(result.current.mobileSheetOverrideLabel).toBeNull();
      expect(result.current.mobileResultsView).toBe("map");
      expect(result.current.mobileResultsViewPreference).toBeNull();
      expect(typeof result.current.expand).toBe("function");
      expect(typeof result.current.collapse).toBe("function");
      expect(typeof result.current.setSearchResultsLabel).toBe("function");
      expect(typeof result.current.setMobileSheetOverrideLabel).toBe(
        "function"
      );
      expect(typeof result.current.setMobileResultsView).toBe("function");
      expect(typeof result.current.setMobileResultsViewPreference).toBe(
        "function"
      );
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

    it("restores the previous handler when the latest registration is cleaned up", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      let unregisterLatest = () => {};

      act(() => {
        result.current.registerOpenFilters(handler1);
        unregisterLatest = result.current.registerOpenFilters(handler2);
      });

      act(() => {
        unregisterLatest();
      });

      act(() => {
        result.current.openFilters();
      });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).not.toHaveBeenCalled();
    });

    it("prefers a higher-priority handler over later default registrations", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });
      const defaultHandler = jest.fn();
      const highPriorityHandler = jest.fn();

      act(() => {
        result.current.registerOpenFilters(defaultHandler);
        result.current.registerOpenFilters(highPriorityHandler, 10);
        result.current.registerOpenFilters(jest.fn());
      });

      act(() => {
        result.current.openFilters();
      });

      expect(defaultHandler).not.toHaveBeenCalled();
      expect(highPriorityHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("searchResultsLabel", () => {
    it("defaults to a generic search results label", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });
      expect(result.current.searchResultsLabel).toBe("Search results");
    });

    it("updates the label and restores the default when cleared", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });

      act(() => {
        result.current.setSearchResultsLabel("24 places");
      });
      expect(result.current.searchResultsLabel).toBe("24 places");

      act(() => {
        result.current.setSearchResultsLabel(null);
      });
      expect(result.current.searchResultsLabel).toBe("Search results");
    });
  });

  describe("mobileSheetOverrideLabel", () => {
    it("defaults to null", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });
      expect(result.current.mobileSheetOverrideLabel).toBeNull();
    });

    it("updates the override label and clears it back to null", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });

      act(() => {
        result.current.setMobileSheetOverrideLabel("No places in this area");
      });
      expect(result.current.mobileSheetOverrideLabel).toBe(
        "No places in this area"
      );

      act(() => {
        result.current.setMobileSheetOverrideLabel(null);
      });
      expect(result.current.mobileSheetOverrideLabel).toBeNull();
    });
  });

  describe("mobileResultsView", () => {
    it('defaults to "map"', () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });
      expect(result.current.mobileResultsView).toBe("map");
    });

    it("updates the view mode", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });

      act(() => {
        result.current.setMobileResultsView("peek");
      });
      expect(result.current.mobileResultsView).toBe("peek");

      act(() => {
        result.current.setMobileResultsView("list");
      });
      expect(result.current.mobileResultsView).toBe("list");

      act(() => {
        result.current.setMobileResultsView("map");
      });
      expect(result.current.mobileResultsView).toBe("map");
    });
  });

  describe("mobileResultsViewPreference", () => {
    it("defaults to null", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });
      expect(result.current.mobileResultsViewPreference).toBeNull();
    });

    it("updates the preferred view and clears back to null", () => {
      const { result } = renderHook(() => useMobileSearch(), { wrapper });

      act(() => {
        result.current.setMobileResultsViewPreference("map");
      });
      expect(result.current.mobileResultsViewPreference).toBe("map");

      act(() => {
        result.current.setMobileResultsViewPreference("peek");
      });
      expect(result.current.mobileResultsViewPreference).toBe("peek");

      act(() => {
        result.current.setMobileResultsViewPreference(null);
      });
      expect(result.current.mobileResultsViewPreference).toBeNull();
    });
  });

  describe("fallback when used outside provider", () => {
    it("returns stable fallback context", () => {
      const { result: result1 } = renderHook(() => useMobileSearch());
      const { result: result2 } = renderHook(() => useMobileSearch());

      expect(result1.current.isExpanded).toBe(false);
      expect(result1.current.searchResultsLabel).toBe("Search results");
      expect(result1.current.mobileSheetOverrideLabel).toBeNull();
      expect(result1.current.mobileResultsView).toBe("map");
      expect(result1.current.mobileResultsViewPreference).toBeNull();
      expect(typeof result1.current.expand).toBe("function");
      expect(typeof result1.current.collapse).toBe("function");
      expect(typeof result1.current.setSearchResultsLabel).toBe("function");
      expect(typeof result1.current.setMobileSheetOverrideLabel).toBe(
        "function"
      );
      expect(typeof result1.current.setMobileResultsView).toBe("function");
      expect(typeof result1.current.setMobileResultsViewPreference).toBe(
        "function"
      );
      expect(typeof result1.current.openFilters).toBe("function");
      expect(typeof result1.current.registerOpenFilters).toBe("function");

      // Same object reference (module-level constant)
      expect(result1.current).toBe(result2.current);
    });

    it("fallback functions are no-ops and do not throw", () => {
      const { result } = renderHook(() => useMobileSearch());

      expect(() => result.current.expand()).not.toThrow();
      expect(() => result.current.collapse()).not.toThrow();
      expect(() => result.current.setSearchResultsLabel("12 places")).not.toThrow();
      expect(() =>
        result.current.setMobileSheetOverrideLabel("No places in this area")
      ).not.toThrow();
      expect(() => result.current.setMobileResultsView("list")).not.toThrow();
      expect(() =>
        result.current.setMobileResultsViewPreference("map")
      ).not.toThrow();
      expect(() => result.current.openFilters()).not.toThrow();
      expect(() => result.current.registerOpenFilters(() => {})).not.toThrow();
    });
  });
});
