"use client";

import { useEffect } from "react";
import { useSearchV2Setters, V2MapData } from "@/contexts/SearchV2DataContext";

interface V2MapDataSetterProps {
  /** V2 map data to inject into context */
  data: V2MapData;
}

/**
 * Injects unified V2 map data into SearchV2DataContext.
 *
 * Data flow: page.tsx or SearchResultsClient → V2MapDataSetter/context setter
 * → PersistentMapWrapper. The setter only carries the current query contract,
 * so stale map payloads are ignored when URL state changes mid-flight.
 */
export function V2MapDataSetter({ data }: V2MapDataSetterProps) {
  const { setPendingQueryHash, setV2MapData, setIsV2Enabled } =
    useSearchV2Setters();

  useEffect(() => {
    // Mark v2 as enabled so PersistentMapWrapper knows to wait/skip fetch
    setIsV2Enabled(true);
    setPendingQueryHash(null);
    // P2-FIX (#135): Don't pass dataVersion - page.tsx data is always fresh for current URL.
    // Passing dataVersion caused race condition: when URL changes, context's effect increments
    // dataVersionRef immediately but state update is batched. This effect would then pass
    // the OLD version (from state) which gets rejected because ref already has new version.
    // Version checking is only needed for async responses, not synchronous page props.
    setV2MapData(data);

    // NOTE: Cleanup intentionally removed to prevent race condition.
    // When URL changes (e.g., "search as I move"), React's effect cleanup
    // would set v2MapData to null BEFORE new data arrives, causing markers
    // to briefly disappear. Let new data overwrite old data instead.
    // Cleanup for leaving /search entirely is handled by layout unmount.
  }, [data, setPendingQueryHash, setV2MapData, setIsV2Enabled]);

  // Renders nothing - just sets context
  return null;
}
