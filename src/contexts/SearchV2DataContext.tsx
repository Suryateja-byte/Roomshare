"use client";

/**
 * SearchV2DataContext - V2 map data sharing between search page siblings
 *
 * SELECTOR PATTERN USAGE:
 * This context implements fine-grained selector hooks to minimize re-renders.
 * Instead of using the full `useSearchV2Data()` hook, prefer these selectors:
 *
 * - `useV2MapData()` - Only re-renders when v2MapData changes
 * - `useV2MapDataSetter()` - Returns stable setter, rarely re-renders
 * - `useIsV2Enabled()` - Only re-renders when isV2Enabled changes
 * - `useDataVersion()` - Only re-renders when dataVersion changes
 *
 * Example:
 * ```tsx
 * // BAD: Re-renders on ANY context change
 * const { v2MapData } = useSearchV2Data();
 *
 * // GOOD: Only re-renders when v2MapData changes
 * const v2MapData = useV2MapData();
 * ```
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { buildCanonicalFilterParamsFromSearchParams } from "@/lib/search-params";
import type {
  SearchV2GeoJSON,
  SearchV2Pin,
  SearchV2Mode,
} from "@/lib/search/types";

function getFilterRelevantParams(sp: URLSearchParams): string {
  return buildCanonicalFilterParamsFromSearchParams(sp).toString();
}

const BOUNDS_KEYS = ["minLat", "maxLat", "minLng", "maxLng"] as const;

function getBoundsParams(sp: URLSearchParams): string {
  return BOUNDS_KEYS.map((k) => sp.get(k) ?? "").join(",");
}

/**
 * V2 map data passed from page.tsx to PersistentMapWrapper via context.
 * This enables sibling component data sharing without prop drilling.
 */
export interface V2MapData {
  /** GeoJSON FeatureCollection for Mapbox clustering (always present) */
  geojson: SearchV2GeoJSON;
  /** Tiered pins for sparse results (<50 listings) */
  pins?: SearchV2Pin[];
  /** Mode determines rendering strategy: 'geojson' for clustering, 'pins' for individual markers */
  mode: SearchV2Mode;
}

interface SearchV2DataContextValue {
  /** V2 map data from unified search response, null when using v1 path */
  v2MapData: V2MapData | null;
  /** Set v2 map data with version check to prevent stale data from out-of-order responses */
  setV2MapData: (data: V2MapData | null, version?: number) => void;
  /** Whether v2 mode is enabled (for race condition guard in PersistentMapWrapper) */
  isV2Enabled: boolean;
  /** Set v2 enabled state */
  setIsV2Enabled: (enabled: boolean) => void;
  /** Current data version - use this when calling setV2MapData to guard against stale data */
  dataVersion: number;
}

const SearchV2DataContext = createContext<SearchV2DataContextValue>({
  v2MapData: null,
  setV2MapData: () => {},
  isV2Enabled: false,
  setIsV2Enabled: () => {},
  dataVersion: 0,
});

/**
 * Provider for SearchV2Data context.
 * Wraps SearchLayoutView in layout.tsx to enable data sharing between
 * page.tsx (list) and PersistentMapWrapper (map) siblings.
 */
export function SearchV2DataProvider({ children }: { children: ReactNode }) {
  const [v2MapData, setV2MapDataInternal] = useState<V2MapData | null>(null);
  const [isV2Enabled, setIsV2Enabled] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const searchParams = useSearchParams();
  const prevFilterParamsRef = useRef<string | null>(null);
  const prevBoundsRef = useRef<string | null>(null);
  const dataVersionRef = useRef(0);

  // P1-FIX (#129): Combined effect to clear stale v2MapData when filter OR bounds change.
  // Previously two separate effects could double-increment version if both changed in same render.
  useEffect(() => {
    const currentParams = getFilterRelevantParams(searchParams);
    const currentBounds = getBoundsParams(searchParams);

    const filterChanged =
      prevFilterParamsRef.current !== null &&
      prevFilterParamsRef.current !== currentParams;
    const boundsChanged =
      prevBoundsRef.current !== null &&
      prevBoundsRef.current !== currentBounds;

    // Only increment version once, even if both filter AND bounds changed
    if (filterChanged || boundsChanged) {
      setV2MapDataInternal(null);
      const newVersion = dataVersionRef.current + 1;
      dataVersionRef.current = newVersion;
      setDataVersion(newVersion);
    }

    prevFilterParamsRef.current = currentParams;
    prevBoundsRef.current = currentBounds;
  }, [searchParams]);

  // P1-FIX (#118): Wrap setV2MapData in useCallback to prevent breaking consumer dependency arrays.
  // Versioned setter that rejects stale data from out-of-order responses.
  const setV2MapData = useCallback((data: V2MapData | null, version?: number) => {
    // If version provided, only accept if it matches current version
    // This prevents stale data from completing requests overwriting fresh data
    if (version !== undefined && version !== dataVersionRef.current) {
      return; // Reject stale data
    }
    setV2MapDataInternal(data);
  }, []);

  // P1-FIX (#113): Memoize context value to prevent cascade re-renders of all consumers
  // when provider re-renders but none of the actual values changed.
  const contextValue = useMemo<SearchV2DataContextValue>(
    () => ({
      v2MapData,
      setV2MapData,
      isV2Enabled,
      setIsV2Enabled,
      dataVersion,
    }),
    [v2MapData, setV2MapData, isV2Enabled, setIsV2Enabled, dataVersion]
  );

  return (
    <SearchV2DataContext.Provider value={contextValue}>
      {children}
    </SearchV2DataContext.Provider>
  );
}

/**
 * Hook to access full SearchV2Data context.
 * PREFER using selector hooks below for better performance.
 *
 * Used by:
 * - V2MapDataSetter: to inject map data from page.tsx
 * - PersistentMapWrapper: to read map data and skip v1 fetch
 */
export function useSearchV2Data() {
  return useContext(SearchV2DataContext);
}

// ============================================================================
// SELECTOR HOOKS - Use these for fine-grained subscriptions to minimize re-renders
// ============================================================================

/**
 * Selector hook for v2MapData only.
 * Components using this will NOT re-render when isV2Enabled or dataVersion changes.
 */
export function useV2MapData(): V2MapData | null {
  const { v2MapData } = useContext(SearchV2DataContext);
  return v2MapData;
}

/**
 * Selector hook for v2MapData setter.
 * Returns a stable callback that rarely causes re-renders.
 * Use with dataVersion when setting data to prevent stale data overwrites.
 */
export function useV2MapDataSetter(): {
  setV2MapData: (data: V2MapData | null, version?: number) => void;
  dataVersion: number;
} {
  const { setV2MapData, dataVersion } = useContext(SearchV2DataContext);
  return useMemo(
    () => ({ setV2MapData, dataVersion }),
    [setV2MapData, dataVersion]
  );
}

/**
 * Selector hook for isV2Enabled state and setter.
 * Components using this will NOT re-render when v2MapData changes.
 */
export function useIsV2Enabled(): {
  isV2Enabled: boolean;
  setIsV2Enabled: (enabled: boolean) => void;
} {
  const { isV2Enabled, setIsV2Enabled } = useContext(SearchV2DataContext);
  return useMemo(
    () => ({ isV2Enabled, setIsV2Enabled }),
    [isV2Enabled, setIsV2Enabled]
  );
}

/**
 * Selector hook for dataVersion only.
 * Useful for components that need to track version changes without caring about data.
 */
export function useDataVersion(): number {
  const { dataVersion } = useContext(SearchV2DataContext);
  return dataVersion;
}
