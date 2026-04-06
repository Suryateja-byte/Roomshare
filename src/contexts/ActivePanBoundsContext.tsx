"use client";

/**
 * ActivePanBoundsContext - Dedicated context for map drag pan bounds.
 *
 * Split into State + Setter contexts to prevent re-render propagation:
 * - ActivePanBoundsStateContext: changes every ~200ms during drag.
 *   Only PersistentMapWrapper subscribes (needs it for proactive fetch).
 * - ActivePanBoundsSetterContext: stable callback, never changes.
 *   Map.tsx subscribes (only needs to SET bounds, never reads them).
 *
 * This split ensures Map.tsx does NOT re-render during drag.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { MapBoundsCoords } from "./MapBoundsContext";

// ── State context (changes on every drag update) ────────────────────────────

interface ActivePanBoundsStateValue {
  activePanBounds: MapBoundsCoords | null;
}

const ActivePanBoundsStateContext =
  createContext<ActivePanBoundsStateValue | null>(null);

const SSR_STATE_FALLBACK: ActivePanBoundsStateValue = {
  activePanBounds: null,
};

// ── Setter context (stable, never causes re-renders) ────────────────────────

interface ActivePanBoundsSetterValue {
  setActivePanBounds: (bounds: MapBoundsCoords | null) => void;
}

const ActivePanBoundsSetterContext =
  createContext<ActivePanBoundsSetterValue | null>(null);

const SSR_SETTER_FALLBACK: ActivePanBoundsSetterValue = {
  setActivePanBounds: () => {},
};

// ── Provider ────────────────────────────────────────────────────────────────

export function ActivePanBoundsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activePanBounds, setActivePanBoundsState] =
    useState<MapBoundsCoords | null>(null);

  const setActivePanBounds = useCallback((bounds: MapBoundsCoords | null) => {
    setActivePanBoundsState(bounds);
  }, []);

  const stateValue = useMemo(() => ({ activePanBounds }), [activePanBounds]);

  const setterValue = useMemo(
    () => ({ setActivePanBounds }),
    [setActivePanBounds]
  );

  return (
    <ActivePanBoundsStateContext.Provider value={stateValue}>
      <ActivePanBoundsSetterContext.Provider value={setterValue}>
        {children}
      </ActivePanBoundsSetterContext.Provider>
    </ActivePanBoundsStateContext.Provider>
  );
}

// ── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Read activePanBounds state. Re-renders every ~200ms during drag.
 * Use ONLY in PersistentMapWrapper for proactive fetch.
 */
export function useActivePanBoundsState(): ActivePanBoundsStateValue {
  const context = useContext(ActivePanBoundsStateContext);
  return context ?? SSR_STATE_FALLBACK;
}

/**
 * Get the setter only. Stable reference, never causes re-renders.
 * Use in Map.tsx to SET activePanBounds during drag events.
 */
export function useActivePanBoundsSetter(): ActivePanBoundsSetterValue {
  const context = useContext(ActivePanBoundsSetterContext);
  return context ?? SSR_SETTER_FALLBACK;
}

/**
 * Combined hook (backward compat). Re-renders on state changes.
 * Prefer useActivePanBoundsState() or useActivePanBoundsSetter() instead.
 */
export function useActivePanBounds(): ActivePanBoundsStateValue &
  ActivePanBoundsSetterValue {
  const state = useActivePanBoundsState();
  const setter = useActivePanBoundsSetter();
  return useMemo(() => ({ ...state, ...setter }), [state, setter]);
}
