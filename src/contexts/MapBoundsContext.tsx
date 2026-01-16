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
} from "react";

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

interface MapBoundsContextValue extends MapBoundsState {
  /** Update hasUserMoved (called by Map) */
  setHasUserMoved: (value: boolean) => void;
  /** Update boundsDirty (called by Map) */
  setBoundsDirty: (value: boolean) => void;
  /** Update searchAsMove (called by Map) */
  setSearchAsMove: (value: boolean) => void;
  /** Update search location info (called when URL changes) */
  setSearchLocation: (name: string | null, center: PointCoords | null) => void;
  /** Update current map bounds (called by Map on moveend) */
  setCurrentMapBounds: (bounds: MapBoundsCoords | null) => void;
  /** Register search handler (called by Map) */
  setSearchHandler: (handler: () => void) => void;
  /** Register reset handler (called by Map) */
  setResetHandler: (handler: () => void) => void;
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
  const [hasUserMoved, setHasUserMoved] = useState(false);
  const [boundsDirty, setBoundsDirty] = useState(false);
  const [searchAsMove, setSearchAsMove] = useState(false);
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

  // Memoize context value to prevent unnecessary re-renders
  // Without this, every state change creates a new object reference,
  // causing all consumers to re-render even if their specific values haven't changed
  const contextValue = useMemo(
    () => ({
      hasUserMoved,
      boundsDirty,
      searchAsMove,
      searchLocationName,
      searchLocationCenter,
      locationConflict,
      searchCurrentArea,
      resetToUrlBounds,
      setHasUserMoved,
      setBoundsDirty,
      setSearchAsMove,
      setSearchLocation,
      setCurrentMapBounds,
      setSearchHandler,
      setResetHandler,
    }),
    [
      hasUserMoved,
      boundsDirty,
      searchAsMove,
      searchLocationName,
      searchLocationCenter,
      locationConflict,
      searchCurrentArea,
      resetToUrlBounds,
      setSearchLocation,
      setCurrentMapBounds,
      // Note: setters from useState are stable, setSearchHandler/setResetHandler
      // have empty deps, so they don't need to be in the dependency array
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
      searchLocationName: null,
      searchLocationCenter: null,
      locationConflict: false,
      searchCurrentArea: () => {},
      resetToUrlBounds: () => {},
      setHasUserMoved: () => {},
      setBoundsDirty: () => {},
      setSearchAsMove: () => {},
      setSearchLocation: () => {},
      setCurrentMapBounds: () => {},
      setSearchHandler: () => {},
      setResetHandler: () => {},
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
  };
}
