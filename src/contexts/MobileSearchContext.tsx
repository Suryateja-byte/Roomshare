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
  /** Callback to open the highest-priority registered filter drawer */
  openFilters: () => void;
  /** Register a filter drawer opener and return a cleanup callback */
  registerOpenFilters: (
    handler: () => void,
    priority?: number
  ) => () => void;
}

const MobileSearchContext = createContext<MobileSearchContextValue | null>(
  null
);

// Module-level stable fallback (created once, never changes)
// This prevents infinite re-render loops when useMobileSearch() is called
// outside the provider context - each call returns the same object reference
const FALLBACK_CONTEXT: MobileSearchContextValue = {
  isExpanded: false,
  expand: () => {},
  collapse: () => {},
  openFilters: () => {},
  registerOpenFilters: () => () => {},
};

export function MobileSearchProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Store registrations in refs so handlers can be added/removed without re-rendering.
  const openFiltersRegistrationsRef = useRef<
    Array<{ id: number; priority: number; handler: () => void }>
  >([]);
  const nextRegistrationIdRef = useRef(0);

  const expand = useCallback(() => {
    setIsExpanded(true);
    // Scroll to top smoothly when expanding
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const collapse = useCallback(() => {
    setIsExpanded(false);
  }, []);

  const openFilters = useCallback(() => {
    const registrations = openFiltersRegistrationsRef.current;
    if (registrations.length === 0) return;

    let selected = registrations[0];
    for (const registration of registrations) {
      const isHigherPriority = registration.priority > selected.priority;
      const isNewerSamePriority =
        registration.priority === selected.priority &&
        registration.id > selected.id;

      if (isHigherPriority || isNewerSamePriority) {
        selected = registration;
      }
    }

    selected.handler();
  }, []);

  const registerOpenFilters = useCallback(
    (handler: () => void, priority = 0) => {
      const id = nextRegistrationIdRef.current++;
      openFiltersRegistrationsRef.current = [
        ...openFiltersRegistrationsRef.current,
        { id, priority, handler },
      ];

      return () => {
        openFiltersRegistrationsRef.current =
          openFiltersRegistrationsRef.current.filter(
            (registration) => registration.id !== id
          );
      };
    },
    []
  );

  const value = useMemo(
    () => ({
      isExpanded,
      expand,
      collapse,
      openFilters,
      registerOpenFilters,
    }),
    [isExpanded, expand, collapse, openFilters, registerOpenFilters]
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
