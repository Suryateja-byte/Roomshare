"use client";

/**
 * MobileSearchContext - Coordinates mobile search bar state
 *
 * Allows the layout to control the collapsed/expanded state of the
 * mobile search bar and provides callbacks to open the filter drawer.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";

interface MobileSearchContextValue {
  /** Whether the search is forcibly expanded (overrides scroll collapse) */
  isExpanded: boolean;
  /** Expand the search bar */
  expand: () => void;
  /** Collapse the search bar (let scroll behavior take over) */
  collapse: () => void;
  /** Callback to open filter drawer (registered by SearchForm) */
  openFilters: () => void;
  /** Register the filter drawer opener (called by SearchForm) */
  registerOpenFilters: (handler: () => void) => void;
}

const MobileSearchContext = createContext<MobileSearchContextValue | null>(
  null,
);

// Module-level stable fallback (created once, never changes)
// This prevents infinite re-render loops when useMobileSearch() is called
// outside the provider context - each call returns the same object reference
const FALLBACK_CONTEXT: MobileSearchContextValue = {
  isExpanded: false,
  expand: () => {},
  collapse: () => {},
  openFilters: () => {},
  registerOpenFilters: () => {},
};

export function MobileSearchProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Use ref instead of state - updates don't cause re-renders!
  // This prevents the infinite loop caused by handler registration
  const openFiltersHandlerRef = useRef<(() => void) | null>(null);

  const expand = useCallback(() => {
    setIsExpanded(true);
    // Scroll to top smoothly when expanding
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const collapse = useCallback(() => {
    setIsExpanded(false);
  }, []);

  // No dependency needed - ref is always current
  const openFilters = useCallback(() => {
    openFiltersHandlerRef.current?.();
  }, []);

  // No state update - just stores in ref (no re-render!)
  const registerOpenFilters = useCallback((handler: () => void) => {
    openFiltersHandlerRef.current = handler;
  }, []);

  const value = useMemo(
    () => ({
      isExpanded,
      expand,
      collapse,
      openFilters,
      registerOpenFilters,
    }),
    [isExpanded, expand, collapse, openFilters, registerOpenFilters],
  );

  return (
    <MobileSearchContext.Provider value={value}>
      {children}
    </MobileSearchContext.Provider>
  );
}

export function useMobileSearch(): MobileSearchContextValue {
  const context = useContext(MobileSearchContext);
  // Return stable fallback when used outside provider
  // Using module-level constant prevents infinite re-render loops
  return context ?? FALLBACK_CONTEXT;
}
