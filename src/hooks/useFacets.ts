"use client";

/**
 * useFacets - Fetches facet counts and price histogram from /api/search/facets
 *
 * Key behaviors:
 * - Cache key EXCLUDES price params so price slider changes don't refetch
 * - 300ms debounce with AbortController
 * - 30s client-side cache
 * - Only fetches when drawer is open
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { BatchedFilterValues } from "./useBatchedFilters";
import type { FacetsResponse } from "@/app/api/search/facets/route";
import { rateLimitedFetch, RateLimitError } from "@/lib/rate-limit-client";
import { createTTLCache } from "./createTTLCache";

const facetsCache = createTTLCache<FacetsResponse>(100);
const CACHE_TTL_MS = 30_000;
const DEBOUNCE_MS = 300;
const ERROR_FALLBACK_TTL_MS = 5_000;

const EMPTY_FACETS: FacetsResponse = {
  amenities: {},
  houseRules: {},
  roomTypes: {},
  priceRanges: { min: null, max: null, median: null },
  priceHistogram: null,
};

export interface UseFacetsOptions {
  pending: BatchedFilterValues;
  isDrawerOpen: boolean;
}

export interface UseFacetsReturn {
  facets: FacetsResponse | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Generate cache key excluding price params.
 * This ensures price slider changes don't trigger a refetch.
 */
function generateFacetsCacheKey(
  pending: BatchedFilterValues,
  searchParams: URLSearchParams,
): string {
  const parts = [
    // Exclude minPrice/maxPrice intentionally
    `roomType=${pending.roomType}`,
    `leaseDuration=${pending.leaseDuration}`,
    `moveInDate=${pending.moveInDate}`,
    `amenities=${[...pending.amenities].sort().join(",")}`,
    `houseRules=${[...pending.houseRules].sort().join(",")}`,
    `languages=${[...pending.languages].sort().join(",")}`,
    `genderPreference=${pending.genderPreference}`,
    `householdGender=${pending.householdGender}`,
    // Committed location/bounds from URL
    `q=${searchParams.get("q") || ""}`,
    `lat=${searchParams.get("lat") || ""}`,
    `lng=${searchParams.get("lng") || ""}`,
    `minLat=${searchParams.get("minLat") || ""}`,
    `maxLat=${searchParams.get("maxLat") || ""}`,
    `minLng=${searchParams.get("minLng") || ""}`,
    `maxLng=${searchParams.get("maxLng") || ""}`,
  ];
  return parts.join("&");
}

function buildFacetsUrl(
  pending: BatchedFilterValues,
  searchParams: URLSearchParams,
): string {
  const params = new URLSearchParams();

  // Include ALL filters (including price) in the API request
  // so non-price facet counts reflect price selection
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

  const locationParams = ["q", "lat", "lng", "minLat", "maxLat", "minLng", "maxLng"];
  for (const key of locationParams) {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  }

  return `/api/search/facets?${params.toString()}`;
}

export function useFacets({
  pending,
  isDrawerOpen,
}: UseFacetsOptions): UseFacetsReturn {
  const searchParams = useSearchParams();
  const [facets, setFacets] = useState<FacetsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cache key excludes price so price changes don't invalidate
  const cacheKey = useMemo(
    () => generateFacetsCacheKey(pending, searchParams),
    [pending, searchParams],
  );

  const fetchFacets = useCallback(async () => {
    // Skip fetch when offline to avoid wasted requests
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    // Check cache
    const cached = facetsCache.get(cacheKey);
    if (cached !== undefined) {
      setFacets(cached);
      setIsLoading(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      const url = buildFacetsUrl(pending, searchParams);
      const response = await rateLimitedFetch(url, {
        signal: abortController.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        // Known/expected case: backend asks for location bounds with text query.
        // Keep UI functional by returning empty facets instead of surfacing an error.
        if (response.status === 400) {
          try {
            const errorBody = await response.json();
            if (errorBody?.boundsRequired === true) {
              facetsCache.set(cacheKey, EMPTY_FACETS, ERROR_FALLBACK_TTL_MS);
              if (!abortController.signal.aborted) {
                setFacets(EMPTY_FACETS);
                setIsLoading(false);
              }
              return;
            }
          } catch {
            // Ignore body parse errors and continue with generic handling below.
          }
        }

        // Graceful degradation for transient backend failures (500/timeout/etc).
        // Facets should not block core search/filter UI interactions.
        if (response.status >= 500) {
          facetsCache.set(cacheKey, EMPTY_FACETS, ERROR_FALLBACK_TTL_MS);
          if (!abortController.signal.aborted) {
            setFacets((prev) => prev ?? EMPTY_FACETS);
            setIsLoading(false);
          }
          return;
        }

        throw new Error(`Facets request failed: ${response.status}`);
      }

      const data = await response.json();
      // Runtime validation: ensure response is an object with expected facet fields
      if (typeof data !== "object" || data === null) {
        throw new Error("Invalid facets response: expected object");
      }
      const validData = data as FacetsResponse;

      facetsCache.set(cacheKey, validData, CACHE_TTL_MS);

      if (!abortController.signal.aborted) {
        setFacets(validData);
        setIsLoading(false);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (err instanceof RateLimitError) {
        if (!abortController.signal.aborted) setIsLoading(false);
        return;
      }
      console.error("[useFacets] Error:", err);
      if (!abortController.signal.aborted) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
        setIsLoading(false);
      }
    }
  }, [cacheKey, pending, searchParams]);

  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }

    if (!isDrawerOpen) {
      return;
    }

    // Check cache immediately
    const cached = facetsCache.get(cacheKey);
    if (cached !== undefined) {
      setFacets(cached);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    debounceTimeoutRef.current = setTimeout(() => {
      fetchFacets();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // fetchFacets is stabilized via useCallback with [cacheKey, pending, searchParams] deps.
    // cacheKey already captures filter+location state, so fetchFacets changes are covered.
  }, [cacheKey, isDrawerOpen, fetchFacets]);

  return { facets, isLoading, error };
}
