"use client";

import { useEffect } from "react";
import { useSearchV2Data } from "@/contexts/SearchV2DataContext";

/**
 * V1PathResetSetter - Resets V2 context state when V1 fallback path runs.
 *
 * This component is the mirror of V2MapDataSetter. While V2MapDataSetter
 * signals "v2 mode active" when v2 search succeeds, this component signals
 * "v1 mode active" when v2 fails and v1 fallback runs.
 *
 * Problem it solves:
 * - SearchV2DataContext state persists at layout level (across page navigations)
 * - When v2 fails, V2MapDataSetter doesn't render (no v2 data)
 * - But isV2Enabled stays true from previous successful v2 search
 * - PersistentMapWrapper's race guard loops forever waiting for v2 data
 *
 * Solution:
 * - When v1 path runs, this component explicitly resets:
 *   - isV2Enabled = false (stops race guard from waiting)
 *   - v2MapData = null (clears stale data)
 *
 * @see V2MapDataSetter for the v2 success path equivalent
 * @see PersistentMapWrapper for the race guard that depends on this state
 */
export function V1PathResetSetter() {
  const { setV2MapData, setIsV2Enabled } = useSearchV2Data();

  useEffect(() => {
    // Reset v2 state to signal "v1 mode active"
    // This breaks the race guard loop in PersistentMapWrapper
    setIsV2Enabled(false);
    setV2MapData(null);

    // NOTE: No cleanup function needed here.
    // Same reasoning as V2MapDataSetter:
    // - During "search as I move", URL params change frequently
    // - Cleanup would race with the next page's setter
    // - New page's setter will overwrite this state anyway
    // - Layout unmount handles full cleanup when leaving /search
  }, [setV2MapData, setIsV2Enabled]);

  // Render nothing - this is a side-effect-only component
  return null;
}
