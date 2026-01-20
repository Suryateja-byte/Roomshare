"use client";

/**
 * FilterStateContext - Shares pending filter state across components
 *
 * This context allows components outside the filter drawer (like SearchLayoutView)
 * to know when there are pending filter changes that haven't been applied yet.
 * This enables showing a "Pending changes" banner above the results list.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";

interface FilterStateContextValue {
  /** Whether there are pending filter changes */
  isDirty: boolean;
  /** Number of pending filter changes */
  changeCount: number;
  /** Whether the filter drawer is currently open */
  isDrawerOpen: boolean;
  /** Update dirty state (called by SearchForm) */
  setDirtyState: (isDirty: boolean, changeCount: number) => void;
  /** Update drawer open state (called by SearchForm) */
  setDrawerOpen: (isOpen: boolean) => void;
  /** Callback to open the filter drawer (set by SearchForm) */
  openDrawer: () => void;
  /** Register the open drawer callback (called by SearchForm) */
  registerOpenDrawer: (callback: () => void) => void;
}

const FilterStateContext = createContext<FilterStateContextValue | null>(null);

export function FilterStateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isDirty, setIsDirty] = useState(false);
  const [changeCount, setChangeCount] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Use ref for callback to avoid re-renders when registering
  // This prevents infinite loops when SearchForm registers its callback
  const openDrawerCallbackRef = useRef<() => void>(() => {});

  const setDirtyState = useCallback((dirty: boolean, count: number) => {
    setIsDirty(dirty);
    setChangeCount(count);
  }, []);

  const setDrawerOpen = useCallback((isOpen: boolean) => {
    setIsDrawerOpen(isOpen);
  }, []);

  // Use ref assignment instead of state to prevent re-renders
  const registerOpenDrawer = useCallback((callback: () => void) => {
    openDrawerCallbackRef.current = callback;
  }, []);

  // Stable function that reads from ref
  const openDrawer = useCallback(() => {
    openDrawerCallbackRef.current();
  }, []);

  // Memoize context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo(
    () => ({
      isDirty,
      changeCount,
      isDrawerOpen,
      setDirtyState,
      setDrawerOpen,
      openDrawer,
      registerOpenDrawer,
    }),
    [
      isDirty,
      changeCount,
      isDrawerOpen,
      setDirtyState,
      setDrawerOpen,
      openDrawer,
      registerOpenDrawer,
    ],
  );

  return (
    <FilterStateContext.Provider value={contextValue}>
      {children}
    </FilterStateContext.Provider>
  );
}

/**
 * Hook to access filter state context
 * Returns null if used outside provider (safe fallback)
 */
export function useFilterStateSafe() {
  return useContext(FilterStateContext);
}

/**
 * Hook to access filter state context
 * Throws if used outside provider
 */
export function useFilterState() {
  const context = useContext(FilterStateContext);
  if (!context) {
    throw new Error("useFilterState must be used within FilterStateProvider");
  }
  return context;
}
