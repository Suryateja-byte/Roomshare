"use client";

/**
 * useDebouncedFilterCount - Debounced listing count fetcher
 *
 * Fetches listing counts from the /api/search-count endpoint
 * with debouncing, caching, and abort handling for the
 * filter drawer "Show X listings" button.
 *
 * Key behaviors:
 * - Only fetches when drawer is open AND filters are dirty
 * - Debounces requests by 300ms to avoid excessive API calls
 * - Cancels in-flight requests when filters change
 * - Caches results with 30s TTL to avoid redundant fetches
 * - Uses current URL bounds (committed), not pending map bounds
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { BatchedFilterValues } from "./useBatchedFilters";
import { rateLimitedFetch, RateLimitError } from "@/lib/rate-limit-client";
import { createTTLCache } from "./createTTLCache";

interface CachedCount {
  count: number | null;
  boundsRequired: boolean;
}

const countCache = createTTLCache<CachedCount>(100);
const CACHE_TTL_MS = 30_000; // 30 seconds

// Debounce delay
const DEBOUNCE_MS = 300;

/**
 * Clear the count cache (exported for testing only)
 */
export function clearCountCache(): void {
  countCache.clear();
}

// Re-export TTLCache type so tests can verify size if needed
export type { TTLCache } from "./createTTLCache";

export interface UseDebouncedFilterCountOptions {
  /** Pending filter values (not yet applied) */
  pending: BatchedFilterValues;
  /** Whether filters have changed from URL */
  isDirty: boolean;
  /** Whether the filter drawer is open */
  isDrawerOpen: boolean;
}

export interface UseDebouncedFilterCountReturn {
  /** The count of matching listings (null = 100+) */
  count: number | null;
  /** Previous count before current loading (for optimistic UI) */
  previousCount: number | null;
  /** Baseline count from committed filters (for delta calculation) */
  baselineCount: number | null;
  /** Whether a count request is in progress */
  isLoading: boolean;
  /** Human-readable count string for button */
  formattedCount: string;
  /** P3b: Whether bounds selection is required before showing count */
  boundsRequired: boolean;
  /** Last fetch error, or null */
  error: Error | null;
}

/**
 * Generate cache key from filter params and URL bounds
 */
function generateCacheKey(
  pending: BatchedFilterValues,
  searchParams: URLSearchParams,
): string {
  // Build key from pending filters
  const filterParts = [
    `minPrice=${pending.minPrice}`,
    `maxPrice=${pending.maxPrice}`,
    `roomType=${pending.roomType}`,
    `leaseDuration=${pending.leaseDuration}`,
    `moveInDate=${pending.moveInDate}`,
    `amenities=${[...pending.amenities].sort().join(",")}`,
    `houseRules=${[...pending.houseRules].sort().join(",")}`,
    `languages=${[...pending.languages].sort().join(",")}`,
    `genderPreference=${pending.genderPreference}`,
    `householdGender=${pending.householdGender}`,
  ];

  // Add committed bounds from URL (these don't change with pending filters)
  const boundsParts = [
    `minLat=${searchParams.get("minLat") || ""}`,
    `maxLat=${searchParams.get("maxLat") || ""}`,
    `minLng=${searchParams.get("minLng") || ""}`,
    `maxLng=${searchParams.get("maxLng") || ""}`,
    `lat=${searchParams.get("lat") || ""}`,
    `lng=${searchParams.get("lng") || ""}`,
    `q=${searchParams.get("q") || ""}`,
  ];

  return [...filterParts, ...boundsParts].join("&");
}

/**
 * Build URL search params for count request
 */
function buildCountUrl(
  pending: BatchedFilterValues,
  searchParams: URLSearchParams,
): string {
  const params = new URLSearchParams();

  // Add pending filter values
  if (pending.minPrice) params.set("minPrice", pending.minPrice);
  if (pending.maxPrice) params.set("maxPrice", pending.maxPrice);
  if (pending.roomType) params.set("roomType", pending.roomType);
  if (pending.leaseDuration) params.set("leaseDuration", pending.leaseDuration);
  if (pending.moveInDate) params.set("moveInDate", pending.moveInDate);
  if (pending.amenities.length > 0) {
    params.set("amenities", pending.amenities.join(","));
  }
  if (pending.houseRules.length > 0) {
    params.set("houseRules", pending.houseRules.join(","));
  }
  if (pending.languages.length > 0) {
    params.set("languages", pending.languages.join(","));
  }
  if (pending.genderPreference) {
    params.set("genderPreference", pending.genderPreference);
  }
  if (pending.householdGender) {
    params.set("householdGender", pending.householdGender);
  }

  // Add committed location/bounds from URL
  const locationParams = [
    "q",
    "lat",
    "lng",
    "minLat",
    "maxLat",
    "minLng",
    "maxLng",
  ];
  for (const key of locationParams) {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  }

  return `/api/search-count?${params.toString()}`;
}

function getCachedEntry(cacheKey: string): CachedCount | undefined {
  return countCache.get(cacheKey);
}

function setCachedEntry(
  cacheKey: string,
  count: number | null,
  boundsRequired: boolean,
): void {
  countCache.set(cacheKey, { count, boundsRequired }, CACHE_TTL_MS);
}

export function useDebouncedFilterCount({
  pending,
  isDirty,
  isDrawerOpen,
}: UseDebouncedFilterCountOptions): UseDebouncedFilterCountReturn {
  const searchParams = useSearchParams();
  const [count, setCount] = useState<number | null>(null);
  const [previousCount, setPreviousCount] = useState<number | null>(null);
  const [baselineCount, setBaselineCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // P3b: Track when API indicates bounds selection is required
  const [boundsRequired, setBoundsRequired] = useState(false);

  // Track if we've captured the baseline for this drawer session
  const baselineCapturedRef = useRef(false);

  // Refs for cleanup
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Generate cache key for current state
  const cacheKey = useMemo(
    () => generateCacheKey(pending, searchParams),
    [pending, searchParams],
  );

  // Fetch count function
  const fetchCount = useCallback(async () => {
    // Skip fetch when offline to avoid wasted requests
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    // Check cache first (restores both count and boundsRequired)
    const cached = getCachedEntry(cacheKey);
    if (cached !== undefined) {
      setCount(cached.count);
      setBoundsRequired(cached.boundsRequired);
      setIsLoading(false);
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
      const url = buildCountUrl(pending, searchParams);
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
      // P3b: Parse boundsRequired from API response
      const newBoundsRequired = data.boundsRequired === true;

      // Cache the result (stores both count and boundsRequired)
      setCachedEntry(cacheKey, newCount, newBoundsRequired);

      // Only update state if not aborted
      if (!abortController.signal.aborted) {
        setCount(newCount);
        setBoundsRequired(newBoundsRequired);
        setIsLoading(false);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      // Silently back off on rate limit — shared state prevents further fetches
      if (err instanceof RateLimitError) {
        if (!abortController.signal.aborted) setIsLoading(false);
        return;
      }

      console.error("[useDebouncedFilterCount] Error fetching count:", err);

      if (!abortController.signal.aborted) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
        setIsLoading(false);
      }
    }
  }, [cacheKey, pending, searchParams]);

  // Reset baseline and boundsRequired when drawer closes
  useEffect(() => {
    if (!isDrawerOpen) {
      baselineCapturedRef.current = false;
      setBaselineCount(null);
      // P3-NEW-a: Reset boundsRequired when drawer closes
      setBoundsRequired(false);
    }
  }, [isDrawerOpen]);

  // Effect to trigger debounced fetch
  useEffect(() => {
    // Clear any pending timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }

    // Only fetch if drawer is open AND filters are dirty
    if (!isDrawerOpen || !isDirty) {
      // Reset count when drawer closes or filters become clean
      setCount(null);
      setIsLoading(false);
      // P3-NEW-a: Reset boundsRequired when filters are not dirty
      setBoundsRequired(false);
      return;
    }

    // Capture baseline on first dirty state after drawer opens
    if (!baselineCapturedRef.current && count !== null) {
      setBaselineCount(count);
      baselineCapturedRef.current = true;
    }

    // Check cache immediately (restores both count and boundsRequired)
    const cached = getCachedEntry(cacheKey);
    if (cached !== undefined) {
      setCount(cached.count);
      setBoundsRequired(cached.boundsRequired);
      setIsLoading(false);
      // Capture baseline from cache if we haven't yet
      if (!baselineCapturedRef.current) {
        setBaselineCount(cached.count);
        baselineCapturedRef.current = true;
      }
      return;
    }

    // Save current count as previous for optimistic UI
    setPreviousCount(count);

    // Show loading state immediately
    setIsLoading(true);

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
    // Note: `count` is intentionally excluded from deps — it's a result of fetching,
    // not a trigger. Including it would cause re-fetch cycles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, isDirty, isDrawerOpen, fetchCount]);

  // Format count for display
  const formattedCount = useMemo(() => {
    // P3b: Prioritize boundsRequired over count display
    if (boundsRequired) {
      return "Select a location";
    }
    if (isLoading) {
      return "listings";
    }
    if (count === null) {
      return "100+ listings";
    }
    if (count === 1) {
      return "1 listing";
    }
    return `${count} listings`;
  }, [boundsRequired, count, isLoading]);

  return {
    count,
    previousCount,
    baselineCount,
    isLoading,
    formattedCount,
    boundsRequired,
    error,
  };
}
