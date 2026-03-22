/**
 * useRateLimitStatus - Shared rate limit status tracking
 *
 * P1-6 FIX: Provides visibility into client-side rate limiting.
 * When any hook (useFacets, useDebouncedFilterCount, useFilterImpactCount,
 * or MapBoundsContext area count) encounters a RateLimitError from
 * rateLimitedFetch, it calls setRateLimited(). UI components can read
 * the status via useRateLimitStatus() to show a subtle banner.
 *
 * Uses module-level state with a listener pattern (not React context)
 * to avoid adding another provider to the tree. The state is global
 * per browser tab — appropriate since rateLimitedFetch is also global.
 */

import { useState, useEffect } from "react";

/** Module-level state — shared across all hook instances in the tab */
let globalRateLimited = false;
let clearTimeoutId: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/**
 * Signal that a rate limit was hit. Auto-clears after the retry window.
 * Called by hooks when they catch a RateLimitError.
 */
export function setRateLimited(retryAfterMs: number): void {
  globalRateLimited = true;
  listeners.forEach((l) => l());

  // Clear any existing auto-clear timeout (extend if called again)
  if (clearTimeoutId !== null) {
    clearTimeout(clearTimeoutId);
  }

  // Auto-clear when the rate limit window expires
  clearTimeoutId = setTimeout(() => {
    globalRateLimited = false;
    clearTimeoutId = null;
    listeners.forEach((l) => l());
  }, retryAfterMs);
}

/**
 * Hook to read current rate limit status.
 * Re-renders when status changes (rate limited → cleared).
 */
export function useRateLimitStatus(): { isRateLimited: boolean } {
  const [isRateLimited, setIsRateLimited] = useState(globalRateLimited);

  useEffect(() => {
    const listener = () => setIsRateLimited(globalRateLimited);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { isRateLimited };
}
