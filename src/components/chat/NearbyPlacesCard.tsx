'use client';

/// <reference path="../../types/google-places-ui-kit.d.ts" />

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { loadPlacesUiKit } from '@/lib/googleMapsUiKitLoader';

/**
 * NearbyPlacesCard - Renders Google Places UI Kit components.
 *
 * COMPLIANCE NOTES:
 * - Places are rendered ONLY by UI Kit components (gmp-place-search)
 * - Do NOT extract place data and render in custom UI
 * - Do NOT remove/alter/obscure Google attributions
 * - Do NOT store place names/addresses/ratings
 * - Do NOT extract coordinates from place.location (ToS violation)
 */

export interface NearbyPlacesCardProps {
  /** Listing latitude */
  latitude: number;
  /** Listing longitude */
  longitude: number;
  /** Original user query text */
  queryText: string;
  /** Normalized intent from detectNearbyIntent */
  normalizedIntent: {
    mode: 'type' | 'text';
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
}

const INITIAL_RADIUS = 1600; // 1.6km
const EXPANDED_RADIUS = 5000; // 5km
const MAX_RESULTS = 5;
// B6 FIX: Timeout for Places API search
const SEARCH_TIMEOUT_MS = 15000; // 15 seconds

export function NearbyPlacesCard({
  latitude,
  longitude,
  queryText,
  normalizedIntent,
  onSearchComplete,
  onSearchSuccess,
  isVisible = true,
  canSearch = true,  // C2 FIX: Default to true for backwards compatibility
  remainingSearches,
  multiBrandDetected = false,  // P2-C3 FIX: Multi-brand warning
}: NearbyPlacesCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLElement | null>(null);
  // B6 FIX: Timeout ref for Places API search
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // C2 FIX: If rate limited (canSearch explicitly false), show rate limit error immediately
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'no-results' | 'rate-limited'>(
    canSearch === false ? 'rate-limited' : 'loading'
  );
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [currentRadius, setCurrentRadius] = useState(INITIAL_RADIUS);
  const [hasExpandedOnce, setHasExpandedOnce] = useState(false);

  // Load Places UI Kit on mount
  // P0-B27 FIX: Check canSearch BEFORE initializing - don't bypass rate limit
  useEffect(() => {
    // P0-B27 FIX: If rate limited, don't even try to load Places API
    // This sync is needed because canSearch prop can change after initial render
    if (!canSearch) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('rate-limited');
      return;
    }

    if (!isVisible) return;

    let isMounted = true;

    async function initializePlaces() {
      try {
        setStatus('loading');
        setErrorMessage('');

        await loadPlacesUiKit();

        if (!isMounted) return;

        // Small delay to ensure DOM is ready
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (!isMounted) return;

        setStatus('ready');
      } catch (error) {
        if (!isMounted) return;

        console.error('[NearbyPlacesCard] Failed to load Places UI Kit:', error);
        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to load Places UI Kit'
        );
        setStatus('error');
      }
    }

    initializePlaces();

    return () => {
      isMounted = false;
    };
  }, [isVisible, canSearch]);

  // Handle search results - NO coordinate extraction
  const handleSearchLoad = useCallback(
    (event: Event) => {
      // B6 FIX: Clear timeout when search completes
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }

      const searchElement = event.target as HTMLElement & {
        places?: Array<{ id?: string }>;  // ONLY id, nothing else
      };

      const results = searchElement?.places || [];
      const resultCount = results.length;

      // NO coordinate extraction - just count results

      // If no results and haven't expanded yet, try with larger radius
      if (resultCount === 0 && !hasExpandedOnce && currentRadius < EXPANDED_RADIUS) {
        setHasExpandedOnce(true);
        setCurrentRadius(EXPANDED_RADIUS);
        return;
      }

      if (resultCount === 0) {
        setStatus('no-results');
      } else {
        // P1-03 FIX: Only call onSearchSuccess when we have results
        onSearchSuccess?.();
      }

      onSearchComplete?.(resultCount);
    },
    [hasExpandedOnce, currentRadius, onSearchComplete, onSearchSuccess]
  );

  // Create and configure Places UI Kit elements IMPERATIVELY
  // This ensures locationRestriction is set BEFORE element is added to DOM
  // B2 FIX: Changed from useLayoutEffect to useEffect with proper cleanup
  useEffect(() => {
    if (status !== 'ready' || !searchContainerRef.current) return;

    const container = searchContainerRef.current;

    // Clear previous elements
    container.innerHTML = '';
    searchRef.current = null;

    // Create elements imperatively
    const searchEl = document.createElement('gmp-place-search') as HTMLElement & {
      selectable?: boolean;
    };
    searchEl.setAttribute('selectable', '');

    const center = { lat: latitude, lng: longitude };

    if (normalizedIntent.mode === 'type' && normalizedIntent.includedTypes) {
      // Type-based Nearby Search
      const requestEl = document.createElement('gmp-place-nearby-search-request') as HTMLElement & {
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
      const requestEl = document.createElement('gmp-place-text-search-request') as HTMLElement & {
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
    const contentEl = document.createElement('gmp-place-all-content');
    searchEl.appendChild(contentEl);

    // Add event listener BEFORE adding to DOM
    searchEl.addEventListener('gmp-load', handleSearchLoad);

    // Store ref
    searchRef.current = searchEl;

    // NOW add to DOM (after all properties are set)
    container.appendChild(searchEl);

    // B6 FIX: Set timeout for Places API search
    // P1-05 FIX: Improved timeout error message with more context
    searchTimeoutRef.current = setTimeout(() => {
      console.error('[NearbyPlacesCard] Places API search timed out after', SEARCH_TIMEOUT_MS, 'ms');
      const timeoutSec = Math.round(SEARCH_TIMEOUT_MS / 1000);
      setErrorMessage(
        `Search for "${queryText}" timed out after ${timeoutSec}s. This may be due to a slow connection. Please try again.`
      );
      setStatus('error');
    }, SEARCH_TIMEOUT_MS);

    // B2 FIX: Proper cleanup - remove listener, clear container, null ref
    // B6 FIX: Also clear timeout
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      searchEl.removeEventListener('gmp-load', handleSearchLoad);
      // Clear container to prevent DOM leaks
      if (container) {
        container.innerHTML = '';
      }
      searchRef.current = null;
    };
  }, [status, latitude, longitude, currentRadius, normalizedIntent, queryText, handleSearchLoad]);

  // Retry search
  const handleRetry = useCallback(() => {
    setStatus('loading');
    setErrorMessage('');
    setCurrentRadius(INITIAL_RADIUS);
    setHasExpandedOnce(false);

    // Re-trigger load
    loadPlacesUiKit()
      .then(() => setStatus('ready'))
      .catch((error: Error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load');
        setStatus('error');
      });
  }, []);

  // Render loading state
  // C13 FIX: Enhanced skeleton UI during Google Maps script load
  if (status === 'loading') {
    return (
      <div className="bg-white dark:bg-zinc-800 rounded-[24px] shadow-lg shadow-zinc-200/50 dark:shadow-zinc-900/50 border border-zinc-100 dark:border-zinc-700 overflow-hidden">
        {/* Header skeleton */}
        <div className="px-5 py-4 border-b border-zinc-50 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-700 animate-pulse" />
            <div className="flex-1">
              <div className="h-4 w-32 bg-zinc-100 dark:bg-zinc-700 rounded animate-pulse" />
            </div>
          </div>
        </div>
        {/* Content skeleton - mimics place list items */}
        <div className="p-4 bg-zinc-50/50 dark:bg-zinc-800/50 space-y-3">
          {/* Place item skeletons */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3 p-2">
              {/* Place icon placeholder */}
              <div className="w-10 h-10 rounded-lg bg-zinc-200 dark:bg-zinc-700 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                {/* Place name */}
                <div className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
                {/* Place details */}
                <div className="h-3 w-1/2 bg-zinc-100 dark:bg-zinc-700/50 rounded animate-pulse" />
              </div>
            </div>
          ))}
          {/* Loading indicator */}
          <div className="flex items-center justify-center gap-2 pt-2">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Searching nearby...</span>
          </div>
        </div>
      </div>
    );
  }

  // Render error state
  if (status === 'error') {
    return (
      <div className="bg-white dark:bg-zinc-800 rounded-[24px] p-5 shadow-lg shadow-zinc-200/50 dark:shadow-zinc-900/50 border border-red-100 dark:border-red-900/50">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              Unable to search places
            </p>
            <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-1">
              {errorMessage || 'An unexpected error occurred'}
            </p>
            <button
              onClick={handleRetry}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
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
  if (status === 'rate-limited') {
    return (
      <div className="bg-white dark:bg-zinc-800 rounded-[24px] p-5 shadow-lg shadow-zinc-200/50 dark:shadow-zinc-900/50 border border-amber-100 dark:border-amber-900/50">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              Search limit reached
            </p>
            <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-1">
              You&apos;ve used all {remainingSearches === 0 ? 'your' : ''} nearby searches for this listing.
              Try asking the AI about the neighborhood instead!
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render no results state
  // C8 FIX: Show actual search radius and indicate if search was expanded
  if (status === 'no-results') {
    const radiusKm = (currentRadius / 1000).toFixed(1);
    const wasExpanded = hasExpandedOnce || currentRadius > INITIAL_RADIUS;

    return (
      <div className="bg-white dark:bg-zinc-800 rounded-[24px] p-5 shadow-lg shadow-zinc-200/50 dark:shadow-zinc-900/50 border border-zinc-100 dark:border-zinc-700">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              No places found nearby
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              We couldn&apos;t find any &quot;{queryText}&quot; within {radiusKm}km of this listing
              {wasExpanded && ' (we expanded the search area)'}. Try a different search term.
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
      className="bg-white dark:bg-zinc-800 rounded-[24px] shadow-lg shadow-zinc-200/50 dark:shadow-zinc-900/50 border border-zinc-100 dark:border-zinc-700 overflow-hidden"
      // P3-B21 FIX: Accessibility - describe card purpose
      role="region"
      aria-label={`Nearby places search results for ${queryText}`}
    >
      {/* Header - P2-01 FIX: Show query context for clarity */}
      {/* P3-B21 FIX: Added aria-label for header */}
      <header className="px-5 py-4 border-b border-zinc-50 dark:border-zinc-700" aria-label="Search results header">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0"
            aria-hidden="true"
          >
            <MapPin className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 tracking-tight truncate">
              {/* P2-01 FIX: Show what was searched for */}
              {normalizedIntent.includedTypes && normalizedIntent.includedTypes.length > 1
                ? `Nearby ${normalizedIntent.includedTypes.map(t => t.replace(/_/g, ' ')).join(', ')}`
                : `Nearby "${queryText}"`}
            </span>
            {currentRadius > INITIAL_RADIUS && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 tracking-wide">
                Expanded search radius ({(currentRadius / 1000).toFixed(1)}km)
              </span>
            )}
          </div>
        </div>
        {/* P2-C3 FIX: Multi-brand warning */}
        {multiBrandDetected && (
          <div className="mt-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-lg">
            <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">
              <strong>Note:</strong> Results may not include all brands mentioned. Try searching for each brand separately for best results.
            </p>
          </div>
        )}
      </header>

      {/* Body: Places UI Kit Content */}
      <div className="p-3 sm:p-4 bg-zinc-50/50 dark:bg-zinc-800/50">
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
