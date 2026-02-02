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

interface CacheEntry {
  data: FacetsResponse;
  expiresAt: number;
}

const facetsCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;
const DEBOUNCE_MS = 300;

export interface UseFacetsOptions {
  pending: BatchedFilterValues;
  isDrawerOpen: boolean;
}

export interface UseFacetsReturn {
  facets: FacetsResponse | null;
  isLoading: boolean;
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

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cache key excludes price so price changes don't invalidate
  const cacheKey = useMemo(
    () => generateFacetsCacheKey(pending, searchParams),
    [pending, searchParams],
  );

  const fetchFacets = useCallback(async () => {
    // Check cache
    const cached = facetsCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      setFacets(cached.data);
      setIsLoading(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);

    try {
      const url = buildFacetsUrl(pending, searchParams);
      const response = await rateLimitedFetch(url, {
        signal: abortController.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Facets request failed: ${response.status}`);
      }

      const data: FacetsResponse = await response.json();

      facetsCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      if (!abortController.signal.aborted) {
        setFacets(data);
        setIsLoading(false);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof RateLimitError) {
        if (!abortController.signal.aborted) setIsLoading(false);
        return;
      }
      console.error("[useFacets] Error:", error);
      if (!abortController.signal.aborted) {
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
    if (cached && Date.now() < cached.expiresAt) {
      setFacets(cached.data);
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
  }, [cacheKey, isDrawerOpen, fetchFacets]);

  return { facets, isLoading };
}
