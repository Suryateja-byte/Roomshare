"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import type {
  SearchV2GeoJSON,
  SearchV2Pin,
  SearchV2Mode,
} from "@/lib/search/types";

const FILTER_RELEVANT_KEYS = [
  "q",
  "minPrice",
  "maxPrice",
  "amenities",
  "moveInDate",
  "leaseDuration",
  "houseRules",
  "languages",
  "roomType",
  "genderPreference",
  "householdGender",
  "nearMatches",
] as const;

function getFilterRelevantParams(sp: URLSearchParams): string {
  const filtered = new URLSearchParams();
  for (const key of FILTER_RELEVANT_KEYS) {
    sp.getAll(key).forEach((v) => filtered.append(key, v));
  }
  filtered.sort();
  return filtered.toString();
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

  // Clear stale v2MapData when filter params change to prevent showing wrong markers
  useEffect(() => {
    const currentParams = getFilterRelevantParams(searchParams);
    if (
      prevFilterParamsRef.current !== null &&
      prevFilterParamsRef.current !== currentParams
    ) {
      // Filters changed - clear stale data and increment version
      setV2MapDataInternal(null);
      const newVersion = dataVersionRef.current + 1;
      dataVersionRef.current = newVersion;
      setDataVersion(newVersion);
    }
    prevFilterParamsRef.current = currentParams;
  }, [searchParams]);

  // Clear stale v2MapData when bounds change (map pan/zoom)
  // Bounds are not in FILTER_RELEVANT_KEYS because they change frequently,
  // but we still need to invalidate stale v2 data when the viewport moves.
  useEffect(() => {
    const currentBounds = getBoundsParams(searchParams);
    if (
      prevBoundsRef.current !== null &&
      prevBoundsRef.current !== currentBounds
    ) {
      setV2MapDataInternal(null);
      const newVersion = dataVersionRef.current + 1;
      dataVersionRef.current = newVersion;
      setDataVersion(newVersion);
    }
    prevBoundsRef.current = currentBounds;
  }, [searchParams]);

  // Versioned setter that rejects stale data from out-of-order responses
  const setV2MapData = (data: V2MapData | null, version?: number) => {
    // If version provided, only accept if it matches current version
    // This prevents stale data from completing requests overwriting fresh data
    if (version !== undefined && version !== dataVersionRef.current) {
      return; // Reject stale data
    }
    setV2MapDataInternal(data);
  };

  return (
    <SearchV2DataContext.Provider
      value={{
        v2MapData,
        setV2MapData,
        isV2Enabled,
        setIsV2Enabled,
        dataVersion,
      }}
    >
      {children}
    </SearchV2DataContext.Provider>
  );
}

/**
 * Hook to access SearchV2Data context.
 * Used by:
 * - V2MapDataSetter: to inject map data from page.tsx
 * - PersistentMapWrapper: to read map data and skip v1 fetch
 */
export function useSearchV2Data() {
  return useContext(SearchV2DataContext);
}
