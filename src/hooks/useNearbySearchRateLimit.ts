'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Session-based rate limiting for nearby place searches.
 *
 * Limits:
 * - Max 3 searches per listing per session
 * - 10-second debounce between searches
 * - Radius expansion counts as 1 search (handled in NearbyPlacesCard)
 *
 * Uses sessionStorage to persist counts during the browser session.
 */

const MAX_SEARCHES_PER_LISTING = 3;
const DEBOUNCE_MS = 10000; // 10 seconds
const SESSION_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes - reset counter after this period of inactivity

interface RateLimitState {
  searchCount: number;
  lastSearchTime: number;
}

interface UseNearbySearchRateLimitReturn {
  /** Whether a search can be performed */
  canSearch: boolean;
  /** Number of searches remaining for this listing */
  remainingSearches: number;
  /** Whether currently in debounce period */
  isDebounceBusy: boolean;
  /** P1-04 FIX: Milliseconds remaining in debounce period (for countdown display) */
  debounceRemainingMs: number;
  /** P1-03 FIX: Start debounce timer only (call when search initiated) */
  startDebounce: () => void;
  /** Increment the search count (call after successful search) */
  incrementCount: () => void;
  /** Reset the rate limit for this listing */
  reset: () => void;
}

/**
 * Get the storage key for a listing.
 */
function getStorageKey(listingId: string): string {
  return `nearby-search-limit-${listingId}`;
}

/**
 * Read rate limit state from sessionStorage.
 * Automatically resets stale data (older than SESSION_EXPIRY_MS).
 */
function readState(listingId: string): RateLimitState {
  const freshState = { searchCount: 0, lastSearchTime: 0 };

  if (typeof window === 'undefined') {
    return freshState;
  }

  try {
    const stored = sessionStorage.getItem(getStorageKey(listingId));
    if (stored) {
      const parsed = JSON.parse(stored);
      const searchCount = typeof parsed.searchCount === 'number' ? parsed.searchCount : 0;
      const lastSearchTime = typeof parsed.lastSearchTime === 'number' ? parsed.lastSearchTime : 0;

      // Check if the stored data is stale (older than SESSION_EXPIRY_MS)
      // If so, reset the counter to allow fresh searches
      const now = Date.now();
      if (lastSearchTime > 0 && (now - lastSearchTime) > SESSION_EXPIRY_MS) {
        // Data is stale - clear storage and return fresh state
        sessionStorage.removeItem(getStorageKey(listingId));
        return freshState;
      }

      return { searchCount, lastSearchTime };
    }
  } catch {
    // Ignore parse errors
  }

  return freshState;
}

/**
 * Write rate limit state to sessionStorage.
 */
function writeState(listingId: string, state: RateLimitState): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.setItem(getStorageKey(listingId), JSON.stringify(state));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

/**
 * Hook for managing nearby search rate limits.
 *
 * @param listingId - The ID of the current listing
 * @returns Rate limit controls and state
 *
 * @example
 * ```tsx
 * const { canSearch, remainingSearches, isDebounceBusy, incrementCount } =
 *   useNearbySearchRateLimit(listingId);
 *
 * if (!canSearch) {
 *   return <RateLimitMessage remaining={remainingSearches} />;
 * }
 *
 * if (isDebounceBusy) {
 *   return <DebouncingMessage />;
 * }
 *
 * // Perform search...
 * incrementCount();
 * ```
 */
export function useNearbySearchRateLimit(
  listingId: string
): UseNearbySearchRateLimitReturn {
  // Initialize state from sessionStorage
  const [state, setState] = useState<RateLimitState>(() => readState(listingId));

  // Track debounce status
  const [isDebounceBusy, setIsDebounceBusy] = useState(false);
  // P1-04 FIX: Track milliseconds remaining in debounce for countdown display
  const [debounceRemainingMs, setDebounceRemainingMs] = useState(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // P1-04 FIX: Ref for countdown interval
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // P1-04 FIX: Ref to track debounce end time for accurate countdown
  const debounceEndTimeRef = useRef<number>(0);

  // Sync state from sessionStorage when listingId changes
  useEffect(() => {
    const newState = readState(listingId);
    setState(newState);

    // Check if we're currently in debounce period
    const now = Date.now();
    const timeSinceLastSearch = now - newState.lastSearchTime;
    if (timeSinceLastSearch < DEBOUNCE_MS && newState.lastSearchTime > 0) {
      setIsDebounceBusy(true);

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set timer to clear debounce
      const remainingDebounce = DEBOUNCE_MS - timeSinceLastSearch;

      // P1-04 FIX: Start countdown for remaining debounce time
      const endTime = now + remainingDebounce;
      debounceEndTimeRef.current = endTime;
      setDebounceRemainingMs(remainingDebounce);

      // P1-04 FIX: Start countdown interval
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      countdownIntervalRef.current = setInterval(() => {
        const remaining = Math.max(0, debounceEndTimeRef.current - Date.now());
        setDebounceRemainingMs(remaining);
        if (remaining <= 0 && countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      }, 100);

      debounceTimerRef.current = setTimeout(() => {
        setIsDebounceBusy(false);
        setDebounceRemainingMs(0);
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      }, remainingDebounce);
    } else {
      setIsDebounceBusy(false);
      setDebounceRemainingMs(0);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      // P1-04 FIX: Clean up countdown interval
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [listingId]);

  // Calculate derived values
  const remainingSearches = Math.max(0, MAX_SEARCHES_PER_LISTING - state.searchCount);
  const canSearch = remainingSearches > 0 && !isDebounceBusy;

  // P1-04 FIX: Helper to start countdown interval
  const startCountdown = useCallback((endTime: number) => {
    // Clear any existing interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    // Set initial remaining time
    const initialRemaining = Math.max(0, endTime - Date.now());
    setDebounceRemainingMs(initialRemaining);

    // Start interval to update countdown every 100ms
    countdownIntervalRef.current = setInterval(() => {
      const remaining = Math.max(0, endTime - Date.now());
      setDebounceRemainingMs(remaining);

      // Clear interval when done
      if (remaining <= 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      }
    }, 100);
  }, []);

  // P1-04 FIX: Helper to stop countdown
  const stopCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setDebounceRemainingMs(0);
  }, []);

  // P1-03 FIX: Separate debounce from count increment
  // Start debounce timer only (call when search is initiated)
  const startDebounce = useCallback(() => {
    setIsDebounceBusy(true);

    // P1-04 FIX: Track end time and start countdown
    const endTime = Date.now() + DEBOUNCE_MS;
    debounceEndTimeRef.current = endTime;
    startCountdown(endTime);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setIsDebounceBusy(false);
      stopCountdown();
    }, DEBOUNCE_MS);
  }, [startCountdown, stopCountdown]);

  // Increment search count only (call after successful search)
  // B18 FIX: Use functional update to avoid stale closure issues with rapid increments
  const incrementCount = useCallback(() => {
    const now = Date.now();

    setState((prev) => {
      const newState: RateLimitState = {
        searchCount: prev.searchCount + 1,
        lastSearchTime: now,
      };
      // Write to storage inside functional update to ensure consistency
      writeState(listingId, newState);
      return newState;
    });
    // P1-03 FIX: Debounce is now handled by startDebounce(), not here
  }, [listingId]); // B18 FIX: Removed state.searchCount from deps - using functional update

  // Reset rate limit for this listing
  const reset = useCallback(() => {
    const newState: RateLimitState = {
      searchCount: 0,
      lastSearchTime: 0,
    };

    setState(newState);
    writeState(listingId, newState);
    setIsDebounceBusy(false);
    // P1-04 FIX: Reset countdown state
    setDebounceRemainingMs(0);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // P1-04 FIX: Stop countdown interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, [listingId]);

  return {
    canSearch,
    remainingSearches,
    isDebounceBusy,
    // P1-04 FIX: Expose countdown value for UI display
    debounceRemainingMs,
    startDebounce,
    incrementCount,
    reset,
  };
}

/**
 * Constants exported for testing and display purposes.
 */
export const RATE_LIMIT_CONFIG = {
  maxSearchesPerListing: MAX_SEARCHES_PER_LISTING,
  debounceMs: DEBOUNCE_MS,
  sessionExpiryMs: SESSION_EXPIRY_MS,
} as const;
