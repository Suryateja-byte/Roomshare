/**
 * Unit tests for FilterStateContext
 *
 * Tests the shared filter pending-state context:
 * 1. Provider renders children
 * 2. Initial state: isDirty=false, changeCount=0, isDrawerOpen=false
 * 3. setDirtyState updates both isDirty and changeCount
 * 4. setDrawerOpen toggles isDrawerOpen
 * 5. registerOpenDrawer + openDrawer calls registered callback
 * 6. useFilterState inside provider returns context value
 * 7. useFilterState outside provider throws error
 * 8. useFilterStateSafe inside provider returns context
 * 9. useFilterStateSafe outside provider returns null (not throws)
 * 10. Reset state by setting isDirty=false, changeCount=0
 * 11. Multiple registerOpenDrawer calls — last callback wins
 * 12. openDrawer is a no-op when no callback registered
 */

import React from "react";
import { render, renderHook, act, screen } from "@testing-library/react";
import {
  FilterStateProvider,
  useFilterState,
  useFilterStateSafe,
} from "@/contexts/FilterStateContext";

// Convenience wrapper for hooks that need the provider
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <FilterStateProvider>{children}</FilterStateProvider>
);

describe("FilterStateContext", () => {
  // ── Test 1: Provider renders children ─────────────────────────────────────

  it("renders children inside FilterStateProvider", () => {
    render(
      <FilterStateProvider>
        <div data-testid="child">hello</div>
      </FilterStateProvider>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  // ── Test 2: Initial state ─────────────────────────────────────────────────

  it("provides initial state: isDirty=false, changeCount=0, isDrawerOpen=false", () => {
    const { result } = renderHook(() => useFilterState(), { wrapper });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.changeCount).toBe(0);
    expect(result.current.isDrawerOpen).toBe(false);
  });

  // ── Test 3: setDirtyState updates isDirty and changeCount ─────────────────

  it("setDirtyState updates isDirty and changeCount together", () => {
    const { result } = renderHook(() => useFilterState(), { wrapper });

    act(() => {
      result.current.setDirtyState(true, 3);
    });

    expect(result.current.isDirty).toBe(true);
    expect(result.current.changeCount).toBe(3);
  });

  it("setDirtyState can reset isDirty and changeCount to clean state", () => {
    const { result } = renderHook(() => useFilterState(), { wrapper });

    act(() => {
      result.current.setDirtyState(true, 5);
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.setDirtyState(false, 0);
    });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.changeCount).toBe(0);
  });

  // ── Test 4: setDrawerOpen toggles isDrawerOpen ────────────────────────────

  it("setDrawerOpen(true) sets isDrawerOpen to true", () => {
    const { result } = renderHook(() => useFilterState(), { wrapper });

    act(() => {
      result.current.setDrawerOpen(true);
    });

    expect(result.current.isDrawerOpen).toBe(true);
  });

  it("setDrawerOpen(false) sets isDrawerOpen back to false", () => {
    const { result } = renderHook(() => useFilterState(), { wrapper });

    act(() => {
      result.current.setDrawerOpen(true);
    });
    act(() => {
      result.current.setDrawerOpen(false);
    });

    expect(result.current.isDrawerOpen).toBe(false);
  });

  // ── Test 5: registerOpenDrawer + openDrawer ───────────────────────────────

  it("openDrawer calls the callback registered via registerOpenDrawer", () => {
    const { result } = renderHook(() => useFilterState(), { wrapper });

    const callback = jest.fn();

    act(() => {
      result.current.registerOpenDrawer(callback);
    });

    act(() => {
      result.current.openDrawer();
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  // ── Test 6: useFilterState inside provider returns context value ──────────

  it("useFilterState returns context value inside provider", () => {
    const { result } = renderHook(() => useFilterState(), { wrapper });

    // All required fields exist
    expect(typeof result.current.isDirty).toBe("boolean");
    expect(typeof result.current.changeCount).toBe("number");
    expect(typeof result.current.isDrawerOpen).toBe("boolean");
    expect(typeof result.current.setDirtyState).toBe("function");
    expect(typeof result.current.setDrawerOpen).toBe("function");
    expect(typeof result.current.openDrawer).toBe("function");
    expect(typeof result.current.registerOpenDrawer).toBe("function");
  });

  // ── Test 7: useFilterState outside provider throws ────────────────────────

  it("useFilterState throws when used outside FilterStateProvider", () => {
    // Suppress the expected console.error from React
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => {
      renderHook(() => useFilterState());
    }).toThrow("useFilterState must be used within FilterStateProvider");

    consoleError.mockRestore();
  });

  // ── Test 8: useFilterStateSafe inside provider returns context ────────────

  it("useFilterStateSafe returns context value inside provider", () => {
    const { result } = renderHook(() => useFilterStateSafe(), { wrapper });

    expect(result.current).not.toBeNull();
    expect(typeof result.current!.isDirty).toBe("boolean");
    expect(typeof result.current!.openDrawer).toBe("function");
  });

  // ── Test 9: useFilterStateSafe outside provider returns null ──────────────

  it("useFilterStateSafe returns null when used outside provider (no throw)", () => {
    // No wrapper — outside provider
    const { result } = renderHook(() => useFilterStateSafe());

    expect(result.current).toBeNull();
  });

  // ── Test 10: Reset state ──────────────────────────────────────────────────

  it("resets dirty state and count back to initial values", () => {
    const { result } = renderHook(() => useFilterState(), { wrapper });

    act(() => {
      result.current.setDirtyState(true, 7);
    });
    expect(result.current.isDirty).toBe(true);
    expect(result.current.changeCount).toBe(7);

    // Reset
    act(() => {
      result.current.setDirtyState(false, 0);
    });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.changeCount).toBe(0);
  });

  // ── Test 11: Multiple registrations — last callback wins ─────────────────

  it("registerOpenDrawer replaces previous callback — last one wins", () => {
    const { result } = renderHook(() => useFilterState(), { wrapper });

    const firstCallback = jest.fn();
    const secondCallback = jest.fn();

    act(() => {
      result.current.registerOpenDrawer(firstCallback);
    });
    act(() => {
      result.current.registerOpenDrawer(secondCallback);
    });

    act(() => {
      result.current.openDrawer();
    });

    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).toHaveBeenCalledTimes(1);
  });

  // ── Test 12: openDrawer is a no-op when no callback registered ───────────

  it("openDrawer does not throw when no callback has been registered", () => {
    const { result } = renderHook(() => useFilterState(), { wrapper });

    // The initial ref is an empty function () => {} — calling openDrawer should be safe
    expect(() => {
      act(() => {
        result.current.openDrawer();
      });
    }).not.toThrow();
  });
});
