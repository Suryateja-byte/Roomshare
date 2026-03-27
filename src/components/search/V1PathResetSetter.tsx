"use client";

import { useEffect } from "react";
import {
  useV2MapDataSetter,
  useSearchV2Setters,
} from "@/contexts/SearchV2DataContext";

/**
 * V1PathResetSetter - Resets V2 context state when V1 fallback path runs.
 *
 * This component signals "v1 mode active" by resetting V2 context state.
 * It renders on EVERY page load (both V1 and V2 paths) at page.tsx:433.
 *
 * NOTE: V2MapDataSetter (the v2 success path counterpart) exists but is
 * NOT currently rendered anywhere in production code. The V2 map data path
 * is dead code — V2 search LIST data works via executeSearchV2, but V2 MAP
 * data (GeoJSON/pins) is never injected into context. When V2 map feature
 * ships, V2MapDataSetter should be wired into page.tsx.
 *
 * What this component does:
 * - Sets isV2Enabled = false (tells PersistentMapWrapper to use V1 fetch)
 * - Sets v2MapData = null with version guard (prevents race with V2MapDataSetter if wired)
 *
 * @see V2MapDataSetter for the v2 success path (currently unrendered)
 * @see PersistentMapWrapper for the race guard that depends on this state
 */
export function V1PathResetSetter() {
  const { setV2MapData, dataVersion } = useV2MapDataSetter();
  const { setIsV2Enabled } = useSearchV2Setters();

  useEffect(() => {
    // Reset v2 state to signal "v1 mode active"
    // This breaks the race guard loop in PersistentMapWrapper
    setIsV2Enabled(false);
    // P1-FIX (#156): Pass current dataVersion to prevent race with V2MapDataSetter.
    // If V2 search completes while V1 fallback is running, version mismatch
    // prevents this from accidentally clearing valid V2 data.
    setV2MapData(null, dataVersion);

    // NOTE: No cleanup function needed here.
    // Same reasoning as V2MapDataSetter:
    // - During "search as I move", URL params change frequently
    // - Cleanup would race with the next page's setter
    // - New page's setter will overwrite this state anyway
    // - Layout unmount handles full cleanup when leaving /search
  }, [setV2MapData, setIsV2Enabled, dataVersion]);

  // Render nothing - this is a side-effect-only component
  return null;
}
