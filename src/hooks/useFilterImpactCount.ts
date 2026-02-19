"use client";

/**
 * useFilterImpactCount - Lazy-loaded filter removal impact counter
 *
 * Calculates how removing a filter would change result count.
 * Only fetches on hover to minimize API costs, with aggressive caching.
 *
 * Example: If current search shows 45 results and removing "WiFi" filter
 * would show 67 results, displays "+22" badge on the WiFi chip.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { FilterChipData } from "@/components/filters/filter-chip-utils";
import { removeFilterFromUrl } from "@/components/filters/filter-chip-utils";
import { rateLimitedFetch, RateLimitError } from "@/lib/rate-limit-client";
import { createTTLCache } from "./createTTLCache";

const impactCache = createTTLCache<number | null>(100);
const CACHE_TTL_MS = 60_000; // 60 seconds (longer than filter count cache)

// Debounce delay for hover
const DEBOUNCE_MS = 200;

export interface UseFilterImpactCountOptions {
  /** Current URL search params */
  searchParams: URLSearchParams;
  /** The chip we're calculating impact for */
  chip: FilterChipData;
  /** Whether the chip is currently being hovered */
  isHovering: boolean;
  /** Current result count (for calculating delta) */
  currentCount: number | null;
}

export interface UseFilterImpactCountReturn {
  /** The delta in results when filter is removed (e.g., +22) */
  impactDelta: number | null;
  /** Whether impact count is loading */
  isLoading: boolean;
  /** Formatted string (e.g., "+22" or "+100") */
  formattedDelta: string | null;
  /** Last fetch error, or null */
  error: Error | null;
}

/**
 * Generate cache key for filter removal impact
 */
function generateCacheKey(
  searchParams: URLSearchParams,
  chip: FilterChipData,
): string {
  // The cache key is the URL query string WITHOUT the filter being removed
  const queryWithoutFilter = removeFilterFromUrl(searchParams, chip);
  return `impact:${queryWithoutFilter}`;
}

function getCachedCount(cacheKey: string): number | null | undefined {
  return impactCache.get(cacheKey);
}

function setCachedCount(cacheKey: string, count: number | null): void {
  impactCache.set(cacheKey, count, CACHE_TTL_MS);
}

export function useFilterImpactCount({
  searchParams,
  chip,
  isHovering,
  currentCount,
}: UseFilterImpactCountOptions): UseFilterImpactCountReturn {
  const [countWithoutFilter, setCountWithoutFilter] = useState<number | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  // Refs for cleanup
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Generate cache key
  const cacheKey = generateCacheKey(searchParams, chip);

  // Fetch count function
  const fetchCount = useCallback(async () => {
    // Skip fetch when offline to avoid wasted requests
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    // Check cache first
    const cached = getCachedCount(cacheKey);
    if (cached !== undefined) {
      setCountWithoutFilter(cached);
      setIsLoading(false);
      setHasFetched(true);
      return;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      // Build URL with filter removed
      const queryWithoutFilter = removeFilterFromUrl(searchParams, chip);
      const url = `/api/search-count?${queryWithoutFilter}`;

      const response = await rateLimitedFetch(url, {
        signal: abortController.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Count request failed: ${response.status}`);
      }

      const data = await response.json();
      // Runtime validation: ensure response has expected shape
      if (typeof data !== "object" || data === null) {
        throw new Error("Invalid count response: expected object");
      }
      const newCount =
        typeof data.count === "number" ? data.count : null;

      // Cache the result
      setCachedCount(cacheKey, newCount);

      // Only update state if not aborted
      if (!abortController.signal.aborted) {
        setCountWithoutFilter(newCount);
        setIsLoading(false);
        setHasFetched(true);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      if (err instanceof RateLimitError) {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
          setHasFetched(true);
        }
        return;
      }

      console.error("[useFilterImpactCount] Error fetching count:", err);

      if (!abortController.signal.aborted) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
        setIsLoading(false);
        setHasFetched(true);
      }
    }
  }, [cacheKey, searchParams, chip]);

  // Effect to trigger debounced fetch on hover
  useEffect(() => {
    // Clear any pending timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }

    // Only fetch when hovering and haven't fetched yet for this chip
    if (!isHovering || hasFetched) {
      return;
    }

    // Check cache immediately
    const cached = getCachedCount(cacheKey);
    if (cached !== undefined) {
      setCountWithoutFilter(cached);
      setHasFetched(true);
      return;
    }

    // Debounce the fetch
    debounceTimeoutRef.current = setTimeout(() => {
      fetchCount();
    }, DEBOUNCE_MS);

    // Cleanup on unmount or dependency change
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isHovering, hasFetched, cacheKey, fetchCount]);

  // Reset hasFetched when chip changes
  useEffect(() => {
    setHasFetched(false);
    setCountWithoutFilter(null);
  }, [chip.id]);

  // Calculate delta
  let impactDelta: number | null = null;
  if (countWithoutFilter !== null && currentCount !== null) {
    impactDelta = countWithoutFilter - currentCount;
  } else if (countWithoutFilter !== null && currentCount === null) {
    // Current is 100+, so we can't calculate exact delta
    // If the count without filter is also null (100+), no meaningful delta
    impactDelta = null;
  }

  // Format delta for display
  let formattedDelta: string | null = null;
  if (impactDelta !== null && impactDelta > 0) {
    formattedDelta = `+${impactDelta}`;
  } else if (countWithoutFilter === null && currentCount !== null) {
    // Removing the filter would result in 100+ results
    formattedDelta = "+100";
  }

  return {
    impactDelta,
    isLoading,
    formattedDelta,
    error,
  };
}
