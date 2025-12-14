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
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

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
      debounceTimerRef.current = setTimeout(() => {
        setIsDebounceBusy(false);
      }, remainingDebounce);
    } else {
      setIsDebounceBusy(false);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [listingId]);

  // Calculate derived values
  const remainingSearches = Math.max(0, MAX_SEARCHES_PER_LISTING - state.searchCount);
  const canSearch = remainingSearches > 0 && !isDebounceBusy;

  // Increment search count
  const incrementCount = useCallback(() => {
    const now = Date.now();
    const newState: RateLimitState = {
      searchCount: state.searchCount + 1,
      lastSearchTime: now,
    };

    setState(newState);
    writeState(listingId, newState);

    // Start debounce period
    setIsDebounceBusy(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setIsDebounceBusy(false);
    }, DEBOUNCE_MS);
  }, [listingId, state.searchCount]);

  // Reset rate limit for this listing
  const reset = useCallback(() => {
    const newState: RateLimitState = {
      searchCount: 0,
      lastSearchTime: 0,
    };

    setState(newState);
    writeState(listingId, newState);
    setIsDebounceBusy(false);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, [listingId]);

  return {
    canSearch,
    remainingSearches,
    isDebounceBusy,
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
