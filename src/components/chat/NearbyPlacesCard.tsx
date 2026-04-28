"use client";

/// <reference path="../../types/google-places-ui-kit.d.ts" />

import React, { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { loadPlacesUiKit } from "@/lib/googleMapsUiKitLoader";
import { estimateWalkMins, haversineMiles } from "@/lib/geo/distance";
import type { NeighborhoodSearchResult } from "@/lib/places/types";
import type { POI } from "@/lib/places/types";

/**
 * NearbyPlacesCard - Renders Google Places UI Kit components.
 *
 * COMPLIANCE NOTES:
 * - Free users see Google's UI Kit rendering with attribution.
 * - Pro neighborhood intelligence uses transient in-memory POI data only.
 * - Do NOT remove/alter/obscure Google attributions.
 * - Do NOT persist Google place names/addresses/ratings/coordinates.
 */

export interface NearbyPlacesCardProps {
  /** Listing latitude */
  latitude: number;
  /** Listing longitude */
  longitude: number;
  /** Original user query text (optional for NeighborhoodModule usage) */
  queryText?: string;
  /** Normalized intent from detectNearbyIntent */
  normalizedIntent: {
    mode: "type" | "text";
    includedTypes?: string[];
    textQuery?: string;
  };
  /** Callback when search completes */
  onSearchComplete?: (resultCount: number) => void;
  /** P1-03 FIX: Callback when search succeeds (resultCount > 0) - for rate limit */
  onSearchSuccess?: () => void;
  /** Optional: whether the card is currently visible (for lazy loading) */
  isVisible?: boolean;
  /** C2 FIX: Whether search can be performed (rate limit check) */
  canSearch?: boolean;
  /** C2 FIX: Number of remaining searches for this listing */
  remainingSearches?: number;
  /** P2-C3 FIX: Whether multiple brands were detected in query */
  multiBrandDetected?: boolean;
  /** Optional: Search radius in meters (used by NeighborhoodModule) */
  radiusMeters?: number;
  /** Optional: Callback when search results are ready (used by NeighborhoodModule) */
  onSearchResultsReady?: (result: NeighborhoodSearchResult) => void;
  /** Optional: Callback when an error occurs (used by NeighborhoodModule) */
  onError?: (error: string) => void;
  /** Optional: Callback when loading state changes (used by NeighborhoodModule) */
  onLoadingChange?: (loading: boolean) => void;
}

const INITIAL_RADIUS = 1600; // 1.6km
const EXPANDED_RADIUS = 5000; // 5km
const MAX_RESULTS = 5;
// B6 FIX: Timeout for Places API search
const SEARCH_TIMEOUT_MS = 15000; // 15 seconds

type GooglePlaceCandidate = {
  id?: string;
  displayName?: string | { text?: string };
  formattedAddress?: string;
  location?: {
    lat?: number | (() => number);
    lng?: number | (() => number);
  };
  rating?: number;
  userRatingCount?: number;
  userRatingsTotal?: number;
  primaryType?: string;
  regularOpeningHours?: { isOpen?: () => boolean };
  googleMapsURI?: string;
  googleMapsUri?: string;
};

function resolveInitialRadius(radiusMeters: number | undefined): number {
  return typeof radiusMeters === "number" &&
    Number.isFinite(radiusMeters) &&
    radiusMeters > 0
    ? radiusMeters
    : INITIAL_RADIUS;
}

function readCoordinate(value: number | (() => number) | undefined): number | null {
  const resolved = typeof value === "function" ? value() : value;
  return typeof resolved === "number" && Number.isFinite(resolved)
    ? resolved
    : null;
}

function readPlaceLocation(
  location: GooglePlaceCandidate["location"]
): { lat: number; lng: number } | null {
  if (!location) return null;

  const lat = readCoordinate(location.lat);
  const lng = readCoordinate(location.lng);

  if (lat == null || lng == null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function readDisplayName(
  displayName: GooglePlaceCandidate["displayName"]
): string | undefined {
  if (typeof displayName === "string") {
    return displayName.trim() || undefined;
  }
  if (displayName?.text) {
    return displayName.text.trim() || undefined;
  }
  return undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOpenNow(
  regularOpeningHours: GooglePlaceCandidate["regularOpeningHours"]
): boolean | undefined {
  try {
    const isOpen = regularOpeningHours?.isOpen?.();
    return typeof isOpen === "boolean" ? isOpen : undefined;
  } catch {
    return undefined;
  }
}

function normalizePlacesForNeighborhoodResult(
  places: GooglePlaceCandidate[],
  listingLatLng: { lat: number; lng: number }
): POI[] {
  return places
    .map((place, index): POI | null => {
      const placeId = place.id?.trim();
      const location = readPlaceLocation(place.location);

      if (!placeId || !location) {
        return null;
      }

      const distanceMiles = haversineMiles(
        listingLatLng.lat,
        listingLatLng.lng,
        location.lat,
        location.lng
      );

      return {
        placeId,
        name: readDisplayName(place.displayName) ?? `Place ${index + 1}`,
        lat: location.lat,
        lng: location.lng,
        distanceMiles,
        walkMins: estimateWalkMins(distanceMiles),
        rating: readOptionalNumber(place.rating),
        userRatingsTotal:
          readOptionalNumber(place.userRatingCount) ??
          readOptionalNumber(place.userRatingsTotal),
        openNow: readOpenNow(place.regularOpeningHours),
        address: place.formattedAddress?.trim() || undefined,
        primaryType: place.primaryType?.trim() || undefined,
        googleMapsURI:
          place.googleMapsURI?.trim() || place.googleMapsUri?.trim() || undefined,
      };
    })
    .filter((poi): poi is POI => poi !== null)
    .sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0))
    .slice(0, MAX_RESULTS);
}

function buildNeighborhoodSearchResult(options: {
  pois: POI[];
  initialRadius: number;
  radiusUsed: number;
  searchMode: "type" | "text";
  queryText?: string;
}): NeighborhoodSearchResult {
  const distances = options.pois
    .map((poi) => poi.distanceMiles)
    .filter((distance): distance is number => typeof distance === "number");

  return {
    pois: options.pois,
    meta: {
      radiusMeters: options.initialRadius,
      radiusUsed: options.radiusUsed,
      resultCount: options.pois.length,
      closestMiles: distances.length > 0 ? Math.min(...distances) : 0,
      farthestMiles: distances.length > 0 ? Math.max(...distances) : 0,
      searchMode: options.searchMode,
      queryText: options.queryText,
      timestamp: Date.now(),
    },
  };
}

export function NearbyPlacesCard({
  latitude,
  longitude,
  queryText,
  normalizedIntent,
  onSearchComplete,
  onSearchSuccess,
  isVisible = true,
  canSearch = true, // C2 FIX: Default to true for backwards compatibility
  remainingSearches,
  multiBrandDetected = false, // P2-C3 FIX: Multi-brand warning
  radiusMeters, // Used by NeighborhoodModule
  onSearchResultsReady, // Used by NeighborhoodModule
  onError, // Used by NeighborhoodModule
  onLoadingChange, // Used by NeighborhoodModule
}: NearbyPlacesCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLElement | null>(null);
  // B6 FIX: Timeout ref for Places API search
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // C2 FIX: If rate limited (canSearch explicitly false), show rate limit error immediately
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "no-results" | "rate-limited"
  >(canSearch === false ? "rate-limited" : "loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const initialRadius = resolveInitialRadius(radiusMeters);
  const expandedRadius = Math.max(EXPANDED_RADIUS, initialRadius);
  const includedTypesKey = normalizedIntent.includedTypes?.join("|") ?? "";
  const [currentRadius, setCurrentRadius] = useState(initialRadius);
  const [hasExpandedOnce, setHasExpandedOnce] = useState(false);

  useEffect(() => {
    setCurrentRadius(initialRadius);
    setHasExpandedOnce(false);
  }, [
    initialRadius,
    latitude,
    longitude,
    normalizedIntent.mode,
    normalizedIntent.textQuery,
    includedTypesKey,
  ]);

  // Load Places UI Kit on mount
  // P0-B27 FIX: Check canSearch BEFORE initializing - don't bypass rate limit
  useEffect(() => {
    // P0-B27 FIX: If rate limited, don't even try to load Places API
    // This sync is needed because canSearch prop can change after initial render
    if (!canSearch) {
      setStatus("rate-limited");
      onLoadingChange?.(false);
      return;
    }

    if (!isVisible) return;

    let isMounted = true;

    async function initializePlaces() {
      try {
        setStatus("loading");
        onLoadingChange?.(true);
        setErrorMessage("");

        await loadPlacesUiKit();

        if (!isMounted) return;

        // Small delay to ensure DOM is ready
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (!isMounted) return;

        setStatus("ready");
      } catch (error) {
        if (!isMounted) return;

        console.error(
          "[NearbyPlacesCard] Failed to load Places UI Kit:",
          error
        );
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load Places UI Kit";
        setErrorMessage(message);
        setStatus("error");
        onError?.(message);
        onLoadingChange?.(false);
      }
    }

    initializePlaces();

    return () => {
      isMounted = false;
    };
  }, [isVisible, canSearch, onError, onLoadingChange]);

  // Handle search results
  const handleSearchLoad = useCallback(
    (event: Event) => {
      // B6 FIX: Clear timeout when search completes
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }

      const searchElement = event.target as HTMLElement & {
        places?: GooglePlaceCandidate[];
      };

      const results = searchElement?.places || [];
      const resultCount = results.length;

      // If no results and haven't expanded yet, try with larger radius
      if (
        resultCount === 0 &&
        !hasExpandedOnce &&
        currentRadius < expandedRadius
      ) {
        setHasExpandedOnce(true);
        setCurrentRadius(expandedRadius);
        return;
      }

      const pois = normalizePlacesForNeighborhoodResult(results, {
        lat: latitude,
        lng: longitude,
      });
      const result = buildNeighborhoodSearchResult({
        pois,
        initialRadius,
        radiusUsed: currentRadius,
        searchMode: normalizedIntent.mode,
        queryText: queryText || normalizedIntent.textQuery,
      });

      if (resultCount === 0) {
        setStatus("no-results");
      } else {
        // P1-03 FIX: Only call onSearchSuccess when we have results
        onSearchSuccess?.();
      }

      onSearchResultsReady?.(result);
      onSearchComplete?.(resultCount);
      onLoadingChange?.(false);
    },
    [
      currentRadius,
      expandedRadius,
      hasExpandedOnce,
      initialRadius,
      latitude,
      longitude,
      normalizedIntent.mode,
      normalizedIntent.textQuery,
      onLoadingChange,
      onSearchComplete,
      onSearchResultsReady,
      onSearchSuccess,
      queryText,
    ]
  );

  // Create and configure Places UI Kit elements IMPERATIVELY
  // This ensures locationRestriction is set BEFORE element is added to DOM
  // B2 FIX: Changed from useLayoutEffect to useEffect with proper cleanup
  useEffect(() => {
    if (status !== "ready" || !searchContainerRef.current) return;

    const container = searchContainerRef.current;

    // Clear previous elements
    container.innerHTML = "";
    searchRef.current = null;

    // Create elements imperatively
    const searchEl = document.createElement(
      "gmp-place-search"
    ) as HTMLElement & {
      selectable?: boolean;
    };
    searchEl.setAttribute("selectable", "");

    const center = { lat: latitude, lng: longitude };

    if (normalizedIntent.mode === "type" && normalizedIntent.includedTypes) {
      // Type-based Nearby Search
      const requestEl = document.createElement(
        "gmp-place-nearby-search-request"
      ) as HTMLElement & {
        includedTypes?: string[];
        locationRestriction?: unknown;
        maxResultCount?: number;
      };

      // Set properties BEFORE adding to DOM
      requestEl.includedTypes = normalizedIntent.includedTypes;
      requestEl.maxResultCount = MAX_RESULTS;

      // Use google.maps.Circle for locationRestriction
      if (window.google?.maps?.Circle) {
        requestEl.locationRestriction = new window.google.maps.Circle({
          center,
          radius: currentRadius,
        });
      } else {
        requestEl.locationRestriction = { center, radius: currentRadius };
      }

      searchEl.appendChild(requestEl);
    } else {
      // Text-based Search
      const requestEl = document.createElement(
        "gmp-place-text-search-request"
      ) as HTMLElement & {
        textQuery?: string;
        locationBias?: unknown;
        maxResultCount?: number;
      };

      // Set properties BEFORE adding to DOM
      requestEl.textQuery = normalizedIntent.textQuery || queryText;
      requestEl.maxResultCount = MAX_RESULTS;

      // Use google.maps.Circle for locationBias
      if (window.google?.maps?.Circle) {
        requestEl.locationBias = new window.google.maps.Circle({
          center,
          radius: currentRadius,
        });
      } else {
        requestEl.locationBias = { center, radius: currentRadius };
      }

      searchEl.appendChild(requestEl);
    }

    // Add content element
    const contentEl = document.createElement("gmp-place-all-content");
    searchEl.appendChild(contentEl);

    // Add event listener BEFORE adding to DOM
    searchEl.addEventListener("gmp-load", handleSearchLoad);
    const handleSearchError = () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      const message = `Search for "${
        queryText || normalizedIntent.textQuery || "nearby places"
      }" failed. Please try again.`;
      setErrorMessage(message);
      setStatus("error");
      onError?.(message);
      onLoadingChange?.(false);
      onSearchComplete?.(0);
    };
    searchEl.addEventListener("gmp-error", handleSearchError);

    // Store ref
    searchRef.current = searchEl;

    // NOW add to DOM (after all properties are set)
    container.appendChild(searchEl);

    // B6 FIX: Set timeout for Places API search
    // P1-05 FIX: Improved timeout error message with more context
    searchTimeoutRef.current = setTimeout(() => {
      console.error(
        "[NearbyPlacesCard] Places API search timed out after",
        SEARCH_TIMEOUT_MS,
        "ms"
      );
      const timeoutSec = Math.round(SEARCH_TIMEOUT_MS / 1000);
      const searchLabel =
        queryText || normalizedIntent.textQuery || "nearby places";
      const message =
        `Search for "${searchLabel}" timed out after ${timeoutSec}s. This may be due to a slow connection. Please try again.`;
      setErrorMessage(message);
      setStatus("error");
      onError?.(message);
      onLoadingChange?.(false);
      onSearchComplete?.(0);
    }, SEARCH_TIMEOUT_MS);

    // B2 FIX: Proper cleanup - remove listener, clear container, null ref
    // B6 FIX: Also clear timeout
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      searchEl.removeEventListener("gmp-load", handleSearchLoad);
      searchEl.removeEventListener("gmp-error", handleSearchError);
      // Clear container to prevent DOM leaks
      if (container) {
        container.innerHTML = "";
      }
      searchRef.current = null;
    };
  }, [
    status,
    latitude,
    longitude,
    currentRadius,
    normalizedIntent,
    queryText,
    handleSearchLoad,
    onError,
    onLoadingChange,
    onSearchComplete,
  ]);

  // Retry search
  const handleRetry = useCallback(() => {
    setStatus("loading");
    onLoadingChange?.(true);
    setErrorMessage("");
    setCurrentRadius(initialRadius);
    setHasExpandedOnce(false);

    // Re-trigger load
    loadPlacesUiKit()
      .then(() => setStatus("ready"))
      .catch((error: Error) => {
        const message = error instanceof Error ? error.message : "Failed to load";
        setErrorMessage(message);
        setStatus("error");
        onError?.(message);
        onLoadingChange?.(false);
      });
  }, [initialRadius, onError, onLoadingChange]);

  // Render loading state
  // C13 FIX: Enhanced skeleton UI during Google Maps script load
  if (status === "loading") {
    return (
      <div className="bg-surface-container-lowest rounded-xl shadow-ambient-lg border border-outline-variant/20 overflow-hidden">
        {/* Header skeleton */}
        <div className="px-5 py-4 border-b border-outline-variant/20">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-surface-container-high animate-pulse" />
            <div className="flex-1">
              <div className="h-4 w-32 bg-surface-container-high rounded animate-pulse" />
            </div>
          </div>
        </div>
        {/* Content skeleton - mimics place list items */}
        <div className="p-4 bg-surface-canvas/50 space-y-3">
          {/* Place item skeletons */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3 p-2">
              {/* Place icon placeholder */}
              <div className="w-10 h-10 rounded-lg bg-surface-container-high animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                {/* Place name */}
                <div className="h-4 w-3/4 bg-surface-container-high rounded animate-pulse" />
                {/* Place details */}
                <div className="h-3 w-1/2 bg-surface-container-high rounded animate-pulse" />
              </div>
            </div>
          ))}
          {/* Loading indicator */}
          <div
            className="flex items-center justify-center gap-2 pt-2"
            role="status"
            aria-label="Searching nearby places"
          >
            <Loader2
              className="w-4 h-4 animate-spin text-on-surface-variant"
              aria-hidden="true"
            />
            <span className="text-xs text-on-surface-variant">
              Searching nearby...
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Render error state
  if (status === "error") {
    return (
      <div className="bg-surface-container-lowest rounded-xl p-5 shadow-ambient-lg border border-red-100">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">
              Unable to search places
            </p>
            <p className="text-xs text-red-600/80 mt-1">
              {errorMessage || "An unexpected error occurred"}
            </p>
            <button
              onClick={handleRetry}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // C2 FIX: Render rate limited state (when LLM tool invoked but rate limit exceeded)
  if (status === "rate-limited") {
    return (
      <div className="bg-surface-container-lowest rounded-xl p-5 shadow-ambient-lg border border-amber-100">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-700">
              Search limit reached
            </p>
            <p className="text-xs text-amber-600/80 mt-1">
              You&apos;ve used all {remainingSearches === 0 ? "your" : ""}{" "}
              nearby searches for this listing. Try asking the AI about the
              neighborhood instead!
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render no results state
  // C8 FIX: Show actual search radius and indicate if search was expanded
  if (status === "no-results") {
    const radiusKm = (currentRadius / 1000).toFixed(1);
    const wasExpanded = hasExpandedOnce || currentRadius > initialRadius;

    return (
      <div className="bg-surface-container-lowest rounded-xl p-5 shadow-ambient-lg border border-outline-variant/20">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-surface-container-high flex items-center justify-center flex-shrink-0">
            <MapPin className="w-3.5 h-3.5 text-on-surface-variant" />
          </div>
          <div>
            <p className="text-sm font-semibold text-on-surface-variant">
              No places found nearby
            </p>
            <p className="text-xs text-on-surface-variant mt-1">
              We couldn&apos;t find any &quot;{queryText}&quot; within{" "}
              {radiusKm}km of this listing
              {wasExpanded && " (we expanded the search area)"}. Try a different
              search term.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render Places UI Kit - simplified layout without distance rail
  return (
    <div
      ref={containerRef}
      className="bg-surface-container-lowest rounded-xl shadow-ambient-lg border border-outline-variant/20 overflow-hidden"
      // P3-B21 FIX: Accessibility - describe card purpose
      role="region"
      aria-label={`Nearby places search results for ${queryText}`}
    >
      {/* Header - P2-01 FIX: Show query context for clarity */}
      {/* P3-B21 FIX: Added aria-label for header */}
      <header
        className="px-5 py-4 border-b border-outline-variant/20"
        aria-label="Search results header"
      >
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0"
            aria-hidden="true"
          >
            <MapPin className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-on-surface tracking-tight truncate">
              {/* P2-01 FIX: Show what was searched for */}
              {normalizedIntent.includedTypes &&
              normalizedIntent.includedTypes.length > 1
                ? `Nearby ${normalizedIntent.includedTypes.map((t) => t.replace(/_/g, " ")).join(", ")}`
                : `Nearby "${queryText}"`}
            </span>
            {currentRadius > initialRadius && (
              <span className="text-xs text-on-surface-variant tracking-wide">
                Expanded search radius ({(currentRadius / 1000).toFixed(1)}km)
              </span>
            )}
          </div>
        </div>
        {/* P2-C3 FIX: Multi-brand warning */}
        {multiBrandDetected && (
          <div className="mt-2 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-lg">
            <p className="text-xs text-amber-700 leading-snug">
              <strong>Note:</strong> Results may not include all brands
              mentioned. Try searching for each brand separately for best
              results.
            </p>
          </div>
        )}
      </header>

      {/* Body: Places UI Kit Content */}
      <div className="p-3 sm:p-4 bg-surface-canvas/50">
        {/* Google UI */}
        <div ref={searchContainerRef} />

        {/* Google Attribution - auto-detects theme, NO hardcoded color-scheme */}
        <div className="pt-3">
          <gmp-place-attribution />
        </div>
      </div>
    </div>
  );
}

export default NearbyPlacesCard;
