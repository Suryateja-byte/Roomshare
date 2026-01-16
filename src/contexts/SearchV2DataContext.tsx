"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import type {
  SearchV2GeoJSON,
  SearchV2Pin,
  SearchV2Mode,
} from "@/lib/search/types";

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
  /** Set v2 map data (called by V2MapDataSetter on mount) */
  setV2MapData: (data: V2MapData | null) => void;
  /** Whether v2 mode is enabled (for race condition guard in PersistentMapWrapper) */
  isV2Enabled: boolean;
  /** Set v2 enabled state */
  setIsV2Enabled: (enabled: boolean) => void;
}

const SearchV2DataContext = createContext<SearchV2DataContextValue>({
  v2MapData: null,
  setV2MapData: () => {},
  isV2Enabled: false,
  setIsV2Enabled: () => {},
});

/**
 * Provider for SearchV2Data context.
 * Wraps SearchLayoutView in layout.tsx to enable data sharing between
 * page.tsx (list) and PersistentMapWrapper (map) siblings.
 */
export function SearchV2DataProvider({ children }: { children: ReactNode }) {
  const [v2MapData, setV2MapData] = useState<V2MapData | null>(null);
  const [isV2Enabled, setIsV2Enabled] = useState(false);

  return (
    <SearchV2DataContext.Provider
      value={{ v2MapData, setV2MapData, isV2Enabled, setIsV2Enabled }}
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
