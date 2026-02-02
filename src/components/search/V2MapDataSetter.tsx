"use client";

import { useEffect } from "react";
import { useSearchV2Data, V2MapData } from "@/contexts/SearchV2DataContext";

interface V2MapDataSetterProps {
  /** V2 map data to inject into context */
  data: V2MapData;
}

/**
 * Client component that injects v2 map data into SearchV2DataContext.
 *
 * Rendered by page.tsx when v2 mode is enabled. Runs on mount to set
 * context data before PersistentMapWrapper reads it.
 *
 * This enables sibling component data sharing:
 * page.tsx → V2MapDataSetter → context → PersistentMapWrapper
 */
export function V2MapDataSetter({ data }: V2MapDataSetterProps) {
  const { setV2MapData, setIsV2Enabled, dataVersion } = useSearchV2Data();

  useEffect(() => {
    // Mark v2 as enabled so PersistentMapWrapper knows to wait/skip fetch
    setIsV2Enabled(true);
    // Set the map data for PersistentMapWrapper to consume
    setV2MapData(data, dataVersion);

    // NOTE: Cleanup intentionally removed to prevent race condition.
    // When URL changes (e.g., "search as I move"), React's effect cleanup
    // would set v2MapData to null BEFORE new data arrives, causing markers
    // to briefly disappear. Let new data overwrite old data instead.
    // Cleanup for leaving /search entirely is handled by layout unmount.
  }, [data, dataVersion, setV2MapData, setIsV2Enabled]);

  // Renders nothing - just sets context
  return null;
}
