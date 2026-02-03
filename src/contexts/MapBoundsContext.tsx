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
  /** Ref for synchronous programmatic move check (used in Mapbox event handlers) */
  isProgrammaticMoveRef: React.RefObject<boolean>;
}

const MapBoundsContext = createContext<MapBoundsContextValue | null>(null);

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
  const [searchHandler, setSearchHandlerState] = useState<(() => void) | null>(
    null,
  );
  const [resetHandler, setResetHandlerState] = useState<(() => void) | null>(
    null,
  );

  // Ref to track programmatic move state for the safe setter callback
  const isProgrammaticMoveRef = useRef(false);
  // Ref to track timeout for cleanup
  const programmaticMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to track previous search params for route change detection
  const prevSearchParamsRef = useRef<string | null>(null);

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
        setSearchHandlerState(null);
        setResetHandlerState(null);
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

  const setSearchHandler = useCallback((handler: () => void) => {
    setSearchHandlerState(() => handler);
  }, []);

  const setResetHandler = useCallback((handler: () => void) => {
    setResetHandlerState(() => handler);
  }, []);

  const searchCurrentArea = useCallback(() => {
    searchHandler?.();
  }, [searchHandler]);

  const resetToUrlBounds = useCallback(() => {
    resetHandler?.();
  }, [resetHandler]);

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
    // Filter cache key to only include map-relevant params (exclude sort/page/cursor)
    const filteredParams = new URLSearchParams(searchParams.toString());
    filteredParams.delete('sort');
    filteredParams.delete('page');
    filteredParams.delete('cursor');
    filteredParams.delete('cursorStack');
    filteredParams.delete('pageNumber');
    const filterKey = filteredParams.toString();
    const cacheKey = `${boundsKey}|${filterKey}`;

    // Check cache
    const cached = areaCountCacheRef.current.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
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
          if (!controller.signal.aborted) {
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
          if (err instanceof Error && err.name === "AbortError") return;
          if (err instanceof RateLimitError) {
            if (!controller.signal.aborted) setIsAreaCountLoading(false);
            return;
          }
          if (!controller.signal.aborted) {
            setIsAreaCountLoading(false);
          }
        });
    }, AREA_COUNT_DEBOUNCE_MS);

    return () => {
      if (areaCountDebounceRef.current) {
        clearTimeout(areaCountDebounceRef.current);
      }
      if (areaCountAbortRef.current) {
        areaCountAbortRef.current.abort();
      }
    };
  }, [areaCountEnabled, currentMapBounds, searchParams]);

  // Memoize context value to prevent unnecessary re-renders
  // Without this, every state change creates a new object reference,
  // causing all consumers to re-render even if their specific values haven't changed
  const contextValue = useMemo(
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
      isProgrammaticMoveRef,
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
      searchCurrentArea,
      resetToUrlBounds,
      setHasUserMoved,
      setProgrammaticMove,
      setSearchLocation,
      setCurrentMapBounds,
      setSearchAsMove,
      setSearchHandler,
      setResetHandler,
      isProgrammaticMoveRef,
    ],
  );

  return (
    <MapBoundsContext.Provider value={contextValue}>
      {children}
    </MapBoundsContext.Provider>
  );
}

export function useMapBounds() {
  const context = useContext(MapBoundsContext);
  if (!context) {
    // Return safe defaults when used outside provider (e.g., during SSR)
    return {
      hasUserMoved: false,
      boundsDirty: false,
      searchAsMove: false,
      isProgrammaticMove: false,
      searchLocationName: null,
      searchLocationCenter: null,
      locationConflict: false,
      areaCount: null,
      isAreaCountLoading: false,
      searchCurrentArea: () => {},
      resetToUrlBounds: () => {},
      setHasUserMoved: () => {},
      setBoundsDirty: () => {},
      setSearchAsMove: () => {},
      setProgrammaticMove: () => {},
      setSearchLocation: () => {},
      setCurrentMapBounds: () => {},
      setSearchHandler: () => {},
      setResetHandler: () => {},
      isProgrammaticMoveRef: { current: false },
    };
  }
  return context;
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
