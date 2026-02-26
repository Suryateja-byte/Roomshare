"use client";

/**
 * MapBoundsContext - Shared state for map bounds dirty tracking
 *
 * This context enables the "Map moved - results not updated" banner to show
 * in BOTH locations:
 * 1. On the map itself (floating overlay)
 * 2. Above the list results (inline banner)
 *
 * The Map component is the source of truth for:
 * - hasUserMoved: Whether user has manually panned/zoomed
 * - boundsDirty: Whether current map bounds differ from URL bounds
 * - searchAsMove: Whether auto-search on move is enabled
 * - locationConflict: Whether map has been panned away from search location
 *
 * SearchLayoutView consumes this to show the list banner.
 *
 * SELECTOR PATTERN USAGE:
 * This context is split into State and Actions for optimal re-render behavior.
 * Use these hooks instead of the full `useMapBounds()`:
 *
 * - `useMapBoundsState()` - State only, re-renders when state changes
 * - `useMapBoundsActions()` - Actions only, stable refs that never cause re-renders
 * - `useMapMovedBanner()` - Derived state for banner display logic
 * - `useAreaCount()` - Area count state only
 * - `useSearchAsMove()` - Toggle state and setter only
 *
 * Example:
 * ```tsx
 * // BAD: Re-renders on ANY context change
 * const { setHasUserMoved, setBoundsDirty } = useMapBounds();
 *
 * // GOOD: Actions are stable, never cause re-renders
 * const { setHasUserMoved, setBoundsDirty } = useMapBoundsActions();
 * ```
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { useSearchParams } from "next/navigation";
import { rateLimitedFetch, RateLimitError } from "@/lib/rate-limit-client";
import { buildCanonicalFilterParamsFromSearchParams } from "@/lib/search-params";
import { PROGRAMMATIC_MOVE_TIMEOUT_MS, AREA_COUNT_DEBOUNCE_MS, AREA_COUNT_CACHE_TTL_MS } from "@/lib/constants";

/** Coordinates for map bounds */
export interface MapBoundsCoords {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

/** Coordinates for a point */
export interface PointCoords {
  lat: number;
  lng: number;
}

interface MapBoundsState {
  /** Whether user has manually moved the map (not programmatic flyTo) */
  hasUserMoved: boolean;
  /** Whether map bounds differ from URL bounds (results stale) */
  boundsDirty: boolean;
  /** Whether "search as I move" toggle is ON */
  searchAsMove: boolean;
  /** Whether current map movement is programmatic (flyTo/fitBounds/easeTo) */
  isProgrammaticMove: boolean;
  /** Original search location name (from q param) */
  searchLocationName: string | null;
  /** Original search location center coordinates */
  searchLocationCenter: PointCoords | null;
  /** Whether map viewport no longer contains the search location */
  locationConflict: boolean;
  /** Trigger search with current map bounds */
  searchCurrentArea: () => void;
  /** Reset map view to URL bounds */
  resetToUrlBounds: () => void;
  /** Active pan bounds updated continuously during map drag (for proactive fetching) */
  activePanBounds: MapBoundsCoords | null;
}

interface MapAreaCount {
  /** Count of listings in current map area (null = 100+) */
  areaCount: number | null;
  /** Whether area count is loading */
  isAreaCountLoading: boolean;
}

interface MapBoundsContextValue extends MapBoundsState, MapAreaCount {
  /** Update hasUserMoved (called by Map) */
  setHasUserMoved: (value: boolean) => void;
  /** Update boundsDirty (called by Map) */
  setBoundsDirty: (value: boolean) => void;
  /** Update searchAsMove (called by Map) */
  setSearchAsMove: (value: boolean) => void;
  /** Set programmatic move flag (called before flyTo/fitBounds/easeTo) */
  setProgrammaticMove: (value: boolean) => void;
  /** Update search location info (called when URL changes) */
  setSearchLocation: (name: string | null, center: PointCoords | null) => void;
  /** Update current map bounds (called by Map on moveend) */
  setCurrentMapBounds: (bounds: MapBoundsCoords | null) => void;
  /** Register search handler (called by Map) */
  setSearchHandler: (handler: () => void) => void;
  /** Register reset handler (called by Map) */
  setResetHandler: (handler: () => void) => void;
  /** Update active pan bounds (called by Map during drag) */
  setActivePanBounds: (bounds: MapBoundsCoords | null) => void;
  /** Ref for synchronous programmatic move check (used in Mapbox event handlers) */
  isProgrammaticMoveRef: React.RefObject<boolean>;
}

const MapBoundsContext = createContext<MapBoundsContextValue | null>(null);

// ============================================================================
// SPLIT CONTEXTS - Separate State (changes frequently) from Actions (stable)
// ============================================================================

/**
 * State-only context value for consumers that only need to read state.
 * Changes when any state value changes.
 */
interface MapBoundsStateValue {
  hasUserMoved: boolean;
  boundsDirty: boolean;
  searchAsMove: boolean;
  isProgrammaticMove: boolean;
  searchLocationName: string | null;
  searchLocationCenter: PointCoords | null;
  locationConflict: boolean;
  areaCount: number | null;
  isAreaCountLoading: boolean;
  activePanBounds: MapBoundsCoords | null;
}

/**
 * Actions-only context value for consumers that only need to dispatch actions.
 * These are stable callbacks that never change, so consumers won't re-render.
 */
interface MapBoundsActionsValue {
  searchCurrentArea: () => void;
  resetToUrlBounds: () => void;
  setHasUserMoved: (value: boolean) => void;
  setBoundsDirty: (value: boolean) => void;
  setSearchAsMove: (value: boolean) => void;
  setProgrammaticMove: (value: boolean) => void;
  setSearchLocation: (name: string | null, center: PointCoords | null) => void;
  setCurrentMapBounds: (bounds: MapBoundsCoords | null) => void;
  setSearchHandler: (handler: () => void) => void;
  setResetHandler: (handler: () => void) => void;
  setActivePanBounds: (bounds: MapBoundsCoords | null) => void;
  isProgrammaticMoveRef: React.RefObject<boolean>;
}

const MapBoundsStateContext = createContext<MapBoundsStateValue | null>(null);
const MapBoundsActionsContext = createContext<MapBoundsActionsValue | null>(null);

/**
 * Module-level SSR fallback for state context.
 */
const SSR_STATE_FALLBACK: MapBoundsStateValue = {
  hasUserMoved: false,
  boundsDirty: false,
  searchAsMove: false,
  isProgrammaticMove: false,
  searchLocationName: null,
  searchLocationCenter: null,
  locationConflict: false,
  areaCount: null,
  isAreaCountLoading: false,
  activePanBounds: null,
};

/**
 * Module-level SSR fallback for actions context.
 */
const SSR_ACTIONS_FALLBACK: MapBoundsActionsValue = {
  searchCurrentArea: () => { },
  resetToUrlBounds: () => { },
  setHasUserMoved: () => { },
  setBoundsDirty: () => { },
  setSearchAsMove: () => { },
  setProgrammaticMove: () => { },
  setSearchLocation: () => { },
  setCurrentMapBounds: () => { },
  setSearchHandler: () => { },
  setResetHandler: () => { },
  setActivePanBounds: () => { },
  isProgrammaticMoveRef: { current: false },
};

/**
 * Module-level SSR fallback to avoid creating new objects per call.
 * Used when useMapBounds() is called outside the provider (e.g., during SSR).
 */
const SSR_FALLBACK: MapBoundsContextValue = {
  hasUserMoved: false,
  boundsDirty: false,
  searchAsMove: false,
  isProgrammaticMove: false,
  searchLocationName: null,
  searchLocationCenter: null,
  locationConflict: false,
  areaCount: null,
  isAreaCountLoading: false,
  activePanBounds: null,
  searchCurrentArea: () => { },
  resetToUrlBounds: () => { },
  setHasUserMoved: () => { },
  setBoundsDirty: () => { },
  setSearchAsMove: () => { },
  setProgrammaticMove: () => { },
  setSearchLocation: () => { },
  setCurrentMapBounds: () => { },
  setSearchHandler: () => { },
  setResetHandler: () => { },
  setActivePanBounds: () => { },
  isProgrammaticMoveRef: { current: false },
};

/**
 * Check if a point is within map bounds (with small padding for edge cases)
 */
function isPointInBounds(point: PointCoords, bounds: MapBoundsCoords): boolean {
  return (
    point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lng >= bounds.minLng &&
    point.lng <= bounds.maxLng
  );
}



export function MapBoundsProvider({ children }: { children: React.ReactNode }) {
  const [hasUserMoved, setHasUserMovedState] = useState(false);
  const [boundsDirty, setBoundsDirtyState] = useState(false);
  const [searchAsMove, setSearchAsMoveState] = useState(true);

  // P2-4 FIX: Wrap setters in useCallback with empty deps to prevent unnecessary re-renders
  const setBoundsDirty = useCallback((value: boolean) => {
    setBoundsDirtyState(value);
  }, []);

  const setSearchAsMove = useCallback((value: boolean) => {
    setSearchAsMoveState(value);
  }, []);
  const [isProgrammaticMove, setIsProgrammaticMoveState] = useState(false);
  const [searchLocationName, setSearchLocationName] = useState<string | null>(
    null,
  );
  const [searchLocationCenter, setSearchLocationCenter] =
    useState<PointCoords | null>(null);
  const [currentMapBounds, setCurrentMapBoundsState] =
    useState<MapBoundsCoords | null>(null);
  const [activePanBoundsState, setActivePanBoundsState] =
    useState<MapBoundsCoords | null>(null);
  // P1-FIX (#68): Use refs instead of state for handler storage.
  // Refs don't cause re-renders when updated and always hold the current handler.
  // This prevents stale closure issues where handlers capture outdated state.
  const searchHandlerRef = useRef<(() => void) | null>(null);
  const resetHandlerRef = useRef<(() => void) | null>(null);

  // Ref to track programmatic move state for the safe setter callback
  const isProgrammaticMoveRef = useRef(false);
  // Ref to track timeout for cleanup
  const programmaticMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to track previous search params for route change detection
  const prevSearchParamsRef = useRef<string | null>(null);
  // P2-FIX (#67): Track mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Get search params for route change detection
  const searchParams = useSearchParams();

  // Reset map state when route changes to prevent stale state
  // (e.g., showing "map moved" banner from NYC when user navigates to LA)
  // Only reset on non-bounds param changes — bounds changes from map panning
  // should NOT reset handlers or the search-as-move cycle breaks.
  useEffect(() => {
    const currentParams = searchParams.toString();
    if (
      prevSearchParamsRef.current !== null &&
      prevSearchParamsRef.current !== currentParams
    ) {
      // Compare non-bounds params to detect true route changes
      const BOUNDS_KEYS = ['minLat', 'maxLat', 'minLng', 'maxLng'];
      const stripBounds = (raw: string) => {
        const sp = new URLSearchParams(raw);
        BOUNDS_KEYS.forEach((k) => sp.delete(k));
        sp.sort();
        return sp.toString();
      };
      const prevNonBounds = stripBounds(prevSearchParamsRef.current);
      const currNonBounds = stripBounds(currentParams);

      if (prevNonBounds !== currNonBounds) {
        // True route change (filters, query, etc.) — reset everything
        setHasUserMovedState(false);
        setBoundsDirtyState(false);
        // P1-FIX (#68): Clear refs instead of state
        searchHandlerRef.current = null;
        resetHandlerRef.current = null;
      } else {
        // Bounds-only change from map panning — reset dirty state but keep handlers
        setHasUserMovedState(false);
        setBoundsDirtyState(false);
      }
    }
    prevSearchParamsRef.current = currentParams;
  }, [searchParams]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (programmaticMoveTimeoutRef.current) {
        clearTimeout(programmaticMoveTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Set programmatic move flag with auto-clear timeout
   * Call this BEFORE flyTo/fitBounds/easeTo to prevent banner showing
   */
  const setProgrammaticMove = useCallback((value: boolean) => {
    setIsProgrammaticMoveState(value);
    isProgrammaticMoveRef.current = value;

    // Clear any existing timeout
    if (programmaticMoveTimeoutRef.current) {
      clearTimeout(programmaticMoveTimeoutRef.current);
      programmaticMoveTimeoutRef.current = null;
    }

    // Auto-clear after animation duration
    if (value) {
      programmaticMoveTimeoutRef.current = setTimeout(() => {
        setIsProgrammaticMoveState(false);
        isProgrammaticMoveRef.current = false;
      }, PROGRAMMATIC_MOVE_TIMEOUT_MS);
    }
  }, []);

  /**
   * Safe setter for hasUserMoved that checks programmatic move flag
   * Only sets hasUserMoved to true if NOT a programmatic move
   */
  const setHasUserMoved = useCallback((value: boolean) => {
    // Always allow setting to false (reset)
    if (!value) {
      setHasUserMovedState(false);
      return;
    }
    // Only set to true if NOT a programmatic move
    if (!isProgrammaticMoveRef.current) {
      setHasUserMovedState(true);
    }
  }, []);

  // P1-FIX (#68): Handlers now update refs instead of state.
  // This ensures the latest handler is always called, not a stale closure.
  const setSearchHandler = useCallback((handler: () => void) => {
    searchHandlerRef.current = handler;
  }, []);

  const setResetHandler = useCallback((handler: () => void) => {
    resetHandlerRef.current = handler;
  }, []);

  // P1-FIX (#68): Call the current ref value to always use the latest handler.
  // Empty deps array is intentional - the ref itself is stable, we read .current at call time.
  const searchCurrentArea = useCallback(() => {
    searchHandlerRef.current?.();
  }, []);

  const resetToUrlBounds = useCallback(() => {
    resetHandlerRef.current?.();
  }, []);

  const setSearchLocation = useCallback(
    (name: string | null, center: PointCoords | null) => {
      setSearchLocationName(name);
      setSearchLocationCenter(center);
    },
    [],
  );

  const setCurrentMapBounds = useCallback((bounds: MapBoundsCoords | null) => {
    setCurrentMapBoundsState(bounds);
  }, []);

  const setActivePanBounds = useCallback((bounds: MapBoundsCoords | null) => {
    setActivePanBoundsState(bounds);
  }, []);

  // Compute whether there's a location conflict
  // (map panned away from search location center)
  const locationConflict = useMemo(() => {
    // No conflict if no search location or no current bounds
    if (!searchLocationCenter || !currentMapBounds) return false;
    // No conflict if user hasn't manually moved the map
    if (!hasUserMoved) return false;
    // Conflict if search center is outside current map viewport
    return !isPointInBounds(searchLocationCenter, currentMapBounds);
  }, [searchLocationCenter, currentMapBounds, hasUserMoved]);

  // --- Area count: fetch listing count for current map bounds when banner is showing ---

  const [areaCount, setAreaCount] = useState<number | null>(null);
  const [isAreaCountLoading, setIsAreaCountLoading] = useState(false);
  const areaCountAbortRef = useRef<AbortController | null>(null);
  const areaCountDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const areaCountCacheRef = useRef<Map<string, { count: number | null; expiresAt: number }>>(new Map());

  // Area count is enabled only when banner would show (toggle OFF + bounds dirty)
  const areaCountEnabled = hasUserMoved && boundsDirty && !searchAsMove;

  useEffect(() => {
    // Cleanup debounce/abort
    if (areaCountDebounceRef.current) {
      clearTimeout(areaCountDebounceRef.current);
      areaCountDebounceRef.current = null;
    }

    if (!areaCountEnabled || !currentMapBounds) {
      // Abort in-flight, reset state
      if (areaCountAbortRef.current) {
        areaCountAbortRef.current.abort();
        areaCountAbortRef.current = null;
      }
      setAreaCount(null);
      setIsAreaCountLoading(false);
      return;
    }

    // Build cache key from current map bounds + URL filter params
    const boundsKey = `${currentMapBounds.minLat},${currentMapBounds.maxLat},${currentMapBounds.minLng},${currentMapBounds.maxLng}`;
    // Canonical filter key (shared parser output) avoids stale cache hits from non-filter URL noise.
    const filterKey = buildCanonicalFilterParamsFromSearchParams(searchParams).toString();
    const cacheKey = `${boundsKey}|${filterKey}`;

    // Check cache
    const cached = areaCountCacheRef.current.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      // P2-FIX (#71): Abort any in-flight request when we have a cache hit
      if (areaCountAbortRef.current) {
        areaCountAbortRef.current.abort();
        areaCountAbortRef.current = null;
      }
      setAreaCount(cached.count);
      setIsAreaCountLoading(false);
      return;
    }

    areaCountDebounceRef.current = setTimeout(() => {
      // P1-4 FIX: Abort previous request and clear reference
      if (areaCountAbortRef.current) {
        areaCountAbortRef.current.abort();
        areaCountAbortRef.current = null;
      }
      const controller = new AbortController();
      areaCountAbortRef.current = controller;

      // P1-4 FIX: Set loading AFTER abort is complete to prevent state flicker
      setIsAreaCountLoading(true);

      // Build URL from current URL params, overriding bounds with map bounds
      const params = new URLSearchParams(searchParams.toString());
      params.set("minLat", String(currentMapBounds.minLat));
      params.set("maxLat", String(currentMapBounds.maxLat));
      params.set("minLng", String(currentMapBounds.minLng));
      params.set("maxLng", String(currentMapBounds.maxLng));
      // Remove pagination params
      params.delete("page");
      params.delete("cursor");

      rateLimitedFetch(`/api/search-count?${params.toString()}`, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then((res) => {
          if (!res.ok) throw new Error(`${res.status}`);
          return res.json();
        })
        .then((data) => {
          // P2-FIX (#67): Guard against state update after unmount
          if (!controller.signal.aborted && isMountedRef.current) {
            const count = (data.count as number | null);
            setAreaCount(count);
            setIsAreaCountLoading(false);
            areaCountCacheRef.current.set(cacheKey, {
              count,
              expiresAt: Date.now() + AREA_COUNT_CACHE_TTL_MS,
            });
          }
        })
        .catch((err) => {
          // P0 FIX: Clear loading state on AbortError to prevent stuck loading indicator
          if (err instanceof Error && err.name === "AbortError") {
            if (isMountedRef.current) setIsAreaCountLoading(false);
            return;
          }
          if (err instanceof RateLimitError) {
            if (!controller.signal.aborted && isMountedRef.current) setIsAreaCountLoading(false);
            return;
          }
          if (!controller.signal.aborted && isMountedRef.current) {
            setIsAreaCountLoading(false);
          }
        });
    }, AREA_COUNT_DEBOUNCE_MS);

    return () => {
      if (areaCountDebounceRef.current) {
        clearTimeout(areaCountDebounceRef.current);
        areaCountDebounceRef.current = null;
      }
      if (areaCountAbortRef.current) {
        areaCountAbortRef.current.abort();
        areaCountAbortRef.current = null;
      }
      // P1 FIX: Reset loading state on cleanup to prevent orphaned loading indicator
      setIsAreaCountLoading(false);
    };
  }, [areaCountEnabled, currentMapBounds, searchParams]);

  // P2-FIX (#67): Cleanup on unmount to prevent state updates
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Memoize STATE value separately - changes when any state changes
  // Consumers using useMapBoundsState() will re-render only on state changes
  const stateValue = useMemo<MapBoundsStateValue>(
    () => ({
      hasUserMoved,
      boundsDirty,
      searchAsMove,
      isProgrammaticMove,
      searchLocationName,
      searchLocationCenter,
      locationConflict,
      areaCount,
      isAreaCountLoading,
      activePanBounds: activePanBoundsState,
    }),
    [
      hasUserMoved,
      boundsDirty,
      searchAsMove,
      isProgrammaticMove,
      searchLocationName,
      searchLocationCenter,
      locationConflict,
      areaCount,
      isAreaCountLoading,
      activePanBoundsState,
    ]
  );

  // Memoize ACTIONS value separately - these are stable callbacks
  // Consumers using useMapBoundsActions() will almost never re-render
  const actionsValue = useMemo<MapBoundsActionsValue>(
    () => ({
      searchCurrentArea,
      resetToUrlBounds,
      setHasUserMoved,
      setBoundsDirty,
      setSearchAsMove,
      setProgrammaticMove,
      setSearchLocation,
      setCurrentMapBounds,
      setSearchHandler,
      setResetHandler,
      setActivePanBounds,
      isProgrammaticMoveRef,
    }),
    [
      searchCurrentArea,
      resetToUrlBounds,
      setHasUserMoved,
      setBoundsDirty,
      setSearchAsMove,
      setProgrammaticMove,
      setSearchLocation,
      setCurrentMapBounds,
      setSearchHandler,
      setResetHandler,
      setActivePanBounds,
      isProgrammaticMoveRef,
    ]
  );

  // Combined context value for backward compatibility with useMapBounds()
  const contextValue = useMemo<MapBoundsContextValue>(
    () => ({
      ...stateValue,
      ...actionsValue,
    }),
    [stateValue, actionsValue]
  );

  return (
    <MapBoundsContext.Provider value={contextValue}>
      <MapBoundsStateContext.Provider value={stateValue}>
        <MapBoundsActionsContext.Provider value={actionsValue}>
          {children}
        </MapBoundsActionsContext.Provider>
      </MapBoundsStateContext.Provider>
    </MapBoundsContext.Provider>
  );
}

export function useMapBounds() {
  const context = useContext(MapBoundsContext);
  // Return module-level constant to avoid creating new objects per call
  return context ?? SSR_FALLBACK;
}

/**
 * Hook for checking if banner should be shown
 * Used by both Map (overlay) and SearchLayoutView (inline)
 */
export function useMapMovedBanner() {
  const {
    hasUserMoved,
    boundsDirty,
    searchAsMove,
    locationConflict,
    searchLocationName,
    searchCurrentArea,
    resetToUrlBounds,
    areaCount,
    isAreaCountLoading,
  } = useMapBounds();

  // Show "results not updated" banner when bounds differ but location is still visible
  const showBanner = hasUserMoved && boundsDirty && !searchAsMove;

  // Show "location conflict" banner when map no longer contains search location
  // This takes priority over the regular bounds dirty banner
  const showLocationConflict = locationConflict && !searchAsMove;

  return {
    showBanner: showBanner && !showLocationConflict,
    showLocationConflict,
    locationName: searchLocationName,
    onSearch: searchCurrentArea,
    onReset: resetToUrlBounds,
    areaCount,
    isAreaCountLoading,
  };
}

// ============================================================================
// SELECTOR HOOKS - Use these for fine-grained subscriptions to minimize re-renders
// ============================================================================

/**
 * Selector hook for state values only.
 * Use when you need to read state but don't need to dispatch actions.
 * Re-renders when any state value changes.
 */
export function useMapBoundsState(): MapBoundsStateValue {
  const context = useContext(MapBoundsStateContext);
  return context ?? SSR_STATE_FALLBACK;
}

/**
 * Selector hook for action callbacks only.
 * Use when you only need to dispatch actions (setters, handlers).
 * These are stable callbacks - components using this hook will almost never re-render.
 */
export function useMapBoundsActions(): MapBoundsActionsValue {
  const context = useContext(MapBoundsActionsContext);
  return context ?? SSR_ACTIONS_FALLBACK;
}

/**
 * Selector hook for area count only.
 * Use when you only need the listing count for the current map area.
 */
export function useAreaCount(): { areaCount: number | null; isAreaCountLoading: boolean } {
  const { areaCount, isAreaCountLoading } = useMapBoundsState();
  return useMemo(
    () => ({ areaCount, isAreaCountLoading }),
    [areaCount, isAreaCountLoading]
  );
}

/**
 * Selector hook for searchAsMove toggle state and setter.
 * Use for the "Search as I move" toggle component.
 */
export function useSearchAsMove(): { searchAsMove: boolean; setSearchAsMove: (value: boolean) => void } {
  const { searchAsMove } = useMapBoundsState();
  const { setSearchAsMove } = useMapBoundsActions();
  return useMemo(
    () => ({ searchAsMove, setSearchAsMove }),
    [searchAsMove, setSearchAsMove]
  );
}

/**
 * Selector hook for bounds dirty state.
 * Use when you only need to know if map bounds differ from URL bounds.
 */
export function useBoundsDirty(): { boundsDirty: boolean; setBoundsDirty: (value: boolean) => void } {
  const { boundsDirty } = useMapBoundsState();
  const { setBoundsDirty } = useMapBoundsActions();
  return useMemo(
    () => ({ boundsDirty, setBoundsDirty }),
    [boundsDirty, setBoundsDirty]
  );
}

/**
 * Selector hook for programmatic move flag.
 * Use when coordinating map animations to prevent false "user moved" detection.
 */
export function useProgrammaticMove(): {
  isProgrammaticMove: boolean;
  setProgrammaticMove: (value: boolean) => void;
  isProgrammaticMoveRef: React.RefObject<boolean>;
} {
  const { isProgrammaticMove } = useMapBoundsState();
  const { setProgrammaticMove, isProgrammaticMoveRef } = useMapBoundsActions();
  return useMemo(
    () => ({ isProgrammaticMove, setProgrammaticMove, isProgrammaticMoveRef }),
    [isProgrammaticMove, setProgrammaticMove, isProgrammaticMoveRef]
  );
}

/**
 * Selector hook for search location info.
 * Use when displaying or checking the original search location.
 */
export function useSearchLocation(): {
  searchLocationName: string | null;
  searchLocationCenter: PointCoords | null;
  setSearchLocation: (name: string | null, center: PointCoords | null) => void;
} {
  const { searchLocationName, searchLocationCenter } = useMapBoundsState();
  const { setSearchLocation } = useMapBoundsActions();
  return useMemo(
    () => ({ searchLocationName, searchLocationCenter, setSearchLocation }),
    [searchLocationName, searchLocationCenter, setSearchLocation]
  );
}

/**
 * Selector hook for active pan bounds.
 * Use for proactive fetching during dragging.
 */
export function useActivePanBounds(): {
  activePanBounds: MapBoundsCoords | null;
  setActivePanBounds: (bounds: MapBoundsCoords | null) => void;
} {
  const { activePanBounds } = useMapBoundsState();
  const { setActivePanBounds } = useMapBoundsActions();
  return useMemo(
    () => ({ activePanBounds, setActivePanBounds }),
    [activePanBounds, setActivePanBounds]
  );
}
