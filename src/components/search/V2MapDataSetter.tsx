"use client";

import { useEffect } from "react";
import { useSearchV2Setters, V2MapData } from "@/contexts/SearchV2DataContext";

interface V2MapDataSetterProps {
  /** V2 map data to inject into context */
  data: V2MapData;
}

/**
 * INACTIVE: Not currently rendered in any production code path.
 * V2 search LIST data works via executeSearchV2, but V2 MAP data
 * (GeoJSON/pins via this component) is not yet wired into page.tsx.
 * See TODO in page.tsx:436-438 for wiring instructions.
 *
 * When activated, this component injects v2 map data into SearchV2DataContext.
 * It would be rendered by page.tsx when v2 mode is enabled, setting
 * context data before PersistentMapWrapper reads it.
 *
 * Data flow: page.tsx → V2MapDataSetter → context → PersistentMapWrapper
 */
export function V2MapDataSetter({ data }: V2MapDataSetterProps) {
  const { setV2MapData, setIsV2Enabled } = useSearchV2Setters();

  useEffect(() => {
    // Mark v2 as enabled so PersistentMapWrapper knows to wait/skip fetch
    setIsV2Enabled(true);
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
  }, [data, setV2MapData, setIsV2Enabled]);

  // Renders nothing - just sets context
  return null;
}
