'use client';

/// <reference path="../../types/google-places-ui-kit.d.ts" />

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadPlacesUiKit } from '@/lib/googleMapsUiKitLoader';
import { useDistanceOverlay } from '@/hooks/useDistanceOverlay';

/**
 * NearbyPlacesCard - Renders Google Places UI Kit components.
 *
 * COMPLIANCE NOTES:
 * - Places are rendered ONLY by UI Kit components (gmp-place-search)
 * - Do NOT extract place data and render in custom UI
 * - Do NOT remove/alter/obscure Google attributions
 * - Do NOT store place names/addresses/ratings
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
  /** Optional: whether the card is currently visible (for lazy loading) */
  isVisible?: boolean;
}

const INITIAL_RADIUS = 1600; // 1.6km
const EXPANDED_RADIUS = 5000; // 5km
const MAX_RESULTS = 5;

// --- Distance utilities ---

/** Normalize LatLng - handles both getter functions and plain objects */
function normalizeLatLng(loc: unknown): { lat: number; lng: number } | null {
  if (!loc || typeof loc !== 'object') return null;
  const locObj = loc as Record<string, unknown>;
  const lat = typeof locObj.lat === 'function' ? (locObj.lat as () => number)() : locObj.lat;
  const lng = typeof locObj.lng === 'function' ? (locObj.lng as () => number)() : locObj.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { lat, lng };
}

/** Haversine formula for straight-line distance in meters */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Format meters to human-readable distance */
function formatDistance(meters: number): string {
  const miles = meters / 1609.344;
  if (miles < 0.1) {
    const feet = meters * 3.28084;
    return `${Math.round(feet)} ft`;
  }
  return `${miles.toFixed(1)} mi`;
}

export function NearbyPlacesCard({
  latitude,
  longitude,
  queryText,
  normalizedIntent,
  onSearchComplete,
  isVisible = true,
}: NearbyPlacesCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLElement | null>(null);
  const requestRef = useRef<HTMLElement | null>(null);
  const placesContainerRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'no-results'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [currentRadius, setCurrentRadius] = useState(INITIAL_RADIUS);
  const [hasExpandedOnce, setHasExpandedOnce] = useState(false);
  const [distances, setDistances] = useState<string[]>([]);
  const [selectedPlaceDistance, setSelectedPlaceDistance] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Use distance overlay hook for aligned positioning
  const { positions, isAligned } = useDistanceOverlay({
    searchRef,
    containerRef: placesContainerRef,
    distances,
    isReady: status === 'ready',
  });

  // Load Places UI Kit on mount
  useEffect(() => {
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
  }, [isVisible]);

  // Configure the search request after UI Kit is ready
  useEffect(() => {
    if (status !== 'ready' || !requestRef.current) return;

    const request = requestRef.current as HTMLElement & {
      includedTypes?: string[];
      textQuery?: string;
      locationRestriction?: {
        center: { lat: number; lng: number };
        radius: number;
      };
      locationBias?: {
        center: { lat: number; lng: number };
        radius: number;
      };
      maxResultCount?: number;
    };

    try {
      if (normalizedIntent.mode === 'type' && normalizedIntent.includedTypes) {
        // Type-based Nearby Search
        request.includedTypes = normalizedIntent.includedTypes;
        request.locationRestriction = {
          center: { lat: latitude, lng: longitude },
          radius: currentRadius,
        };
      } else {
        // Text-based Search
        request.textQuery = normalizedIntent.textQuery || queryText;
        request.locationBias = {
          center: { lat: latitude, lng: longitude },
          radius: currentRadius,
        };
      }

      request.maxResultCount = MAX_RESULTS;
    } catch (error) {
      console.error('[NearbyPlacesCard] Failed to configure search request:', error);
    }
  }, [status, normalizedIntent, latitude, longitude, queryText, currentRadius]);

  // Handle search results
  const handleSearchLoad = useCallback(
    (event: Event) => {
      const searchElement = event.target as HTMLElement & {
        places?: Array<{ location?: unknown }>;
      };

      const places = searchElement?.places || [];
      const resultCount = places.length;

      // If no results and haven't expanded yet, try with larger radius
      if (resultCount === 0 && !hasExpandedOnce && currentRadius < EXPANDED_RADIUS) {
        // Clear distances before radius expansion
        setDistances([]);
        setSelectedPlaceDistance(null);
        setSelectedIndex(null);
        setHasExpandedOnce(true);
        setCurrentRadius(EXPANDED_RADIUS);
        return;
      }

      // Compute distances for all results
      const computedDistances = places.map((place) => {
        const loc = normalizeLatLng(place.location);
        if (!loc) return '';
        const meters = haversineMeters(latitude, longitude, loc.lat, loc.lng);
        return formatDistance(meters);
      });
      setDistances(computedDistances);
      setSelectedPlaceDistance(null);
      setSelectedIndex(null);

      if (resultCount === 0) {
        setStatus('no-results');
      }

      onSearchComplete?.(resultCount);
    },
    [latitude, longitude, hasExpandedOnce, currentRadius, onSearchComplete]
  );

  // Handle place selection
  const handlePlaceSelect = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (event: any) => {
      // Tolerant access - UI Kit event structure varies
      const place = event?.place || event?.detail?.place || event?.detail;
      const loc = normalizeLatLng(place?.location);

      if (!loc) {
        setSelectedPlaceDistance(null);
        setSelectedIndex(null);
        return;
      }

      // Find index by matching coordinates
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const searchElement = searchRef.current as any;
      const places = searchElement?.places || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const idx = places.findIndex((p: any) => {
        const pLoc = normalizeLatLng(p.location);
        return pLoc && Math.abs(pLoc.lat - loc.lat) < 0.0001 && Math.abs(pLoc.lng - loc.lng) < 0.0001;
      });
      setSelectedIndex(idx >= 0 ? idx : null);

      const meters = haversineMeters(latitude, longitude, loc.lat, loc.lng);
      setSelectedPlaceDistance(formatDistance(meters));
    },
    [latitude, longitude]
  );

  // Attach event listeners to search element
  useEffect(() => {
    const searchElement = searchRef.current;
    if (!searchElement || status !== 'ready') return;

    searchElement.addEventListener('gmp-load', handleSearchLoad);
    searchElement.addEventListener('gmp-select', handlePlaceSelect);

    return () => {
      searchElement.removeEventListener('gmp-load', handleSearchLoad);
      searchElement.removeEventListener('gmp-select', handlePlaceSelect);
    };
  }, [status, handleSearchLoad, handlePlaceSelect]);

  // Retry search
  const handleRetry = useCallback(() => {
    setStatus('loading');
    setErrorMessage('');
    setCurrentRadius(INITIAL_RADIUS);
    setHasExpandedOnce(false);

    // Re-trigger load
    loadPlacesUiKit()
      .then(() => setStatus('ready'))
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load');
        setStatus('error');
      });
  }, []);

  // Render loading state
  if (status === 'loading') {
    return (
      <div className="bg-white dark:bg-zinc-800 rounded-[24px] p-6 shadow-lg shadow-zinc-200/50 dark:shadow-zinc-900/50 border border-zinc-100 dark:border-zinc-700">
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
          <span className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Searching nearby...</span>
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

  // Render no results state
  if (status === 'no-results') {
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
              We couldn&apos;t find any &quot;{queryText}&quot; within {EXPANDED_RADIUS / 1000}km of
              this listing.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render Places UI Kit
  return (
    <div
      ref={containerRef}
      className="bg-white dark:bg-zinc-800 rounded-[24px] shadow-lg shadow-zinc-200/50 dark:shadow-zinc-900/50 border border-zinc-100 dark:border-zinc-700 overflow-hidden"
    >
      {/* Header with selected distance pill */}
      <div className="px-5 py-4 border-b border-zinc-50 dark:border-zinc-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
            <MapPin className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
          </div>
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 tracking-tight">
            Nearby Results
          </span>
          {currentRadius > INITIAL_RADIUS && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">(expanded)</span>
          )}
        </div>

        {/* Selected distance pill */}
        {selectedPlaceDistance && (
          <span className="text-xs font-bold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2.5 py-1 rounded-full animate-in fade-in slide-in-from-right-2">
            {selectedPlaceDistance}
          </span>
        )}
      </div>

      {/* Body: Places UI Kit with aligned distance overlay */}
      <div className="relative p-3 bg-zinc-50/50 dark:bg-zinc-800/50">
        {/* Places UI Kit Content */}
        <div ref={placesContainerRef} className="min-w-0 pr-16">
          {normalizedIntent.mode === 'type' && normalizedIntent.includedTypes ? (
            <gmp-place-search
              ref={(el: HTMLElement | null) => {
                searchRef.current = el;
              }}
              selectable
            >
              <gmp-place-nearby-search-request
                ref={(el: HTMLElement | null) => {
                  requestRef.current = el;
                }}
                max-result-count={MAX_RESULTS}
              />
              <gmp-place-all-content />
            </gmp-place-search>
          ) : (
            <gmp-place-search
              ref={(el: HTMLElement | null) => {
                searchRef.current = el;
              }}
              selectable
            >
              <gmp-place-text-search-request
                ref={(el: HTMLElement | null) => {
                  requestRef.current = el;
                }}
                text-query={normalizedIntent.textQuery || queryText}
                max-result-count={MAX_RESULTS}
              />
              <gmp-place-all-content />
            </gmp-place-search>
          )}
        </div>

        {/* Distance badges - absolutely positioned to align with place items */}
        {distances.length > 0 && (
          <div className="absolute right-2 top-0 bottom-0 w-16 pointer-events-none flex flex-col">
            {isAligned && positions.length > 0 ? (
              // Aligned positioning using detected/estimated place item positions
              positions.map((pos) => (
                <span
                  key={pos.index}
                  className={cn(
                    'absolute right-0',
                    'inline-flex items-center justify-center',
                    'min-w-[56px] px-2 py-1.5 rounded-full text-[11px] font-semibold',
                    'bg-zinc-800/90 dark:bg-zinc-200/95 backdrop-blur-sm',
                    'text-white dark:text-zinc-900',
                    'transition-all duration-200 ease-out',
                    'shadow-lg',
                    selectedIndex === pos.index && 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-600 dark:bg-blue-400 scale-105'
                  )}
                  style={{
                    top: `${pos.top + (pos.height / 2)}px`,
                    transform: 'translateY(-50%)'
                  }}
                  title={`Result #${pos.index + 1}: ${pos.distance}`}
                >
                  {pos.distance || '—'}
                </span>
              ))
            ) : (
              // Loading/fallback: simple evenly spaced layout
              distances.map((d, i) => (
                <span
                  key={i}
                  className={cn(
                    'absolute right-0',
                    'inline-flex items-center justify-center',
                    'min-w-[56px] px-2 py-1.5 rounded-full text-[11px] font-semibold',
                    'bg-zinc-800/80 dark:bg-zinc-200/80 backdrop-blur-sm',
                    'text-white dark:text-zinc-900',
                    'transition-all duration-200 ease-out',
                    'shadow-lg opacity-70',
                    selectedIndex === i && 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-600 dark:bg-blue-400 opacity-100 scale-105'
                  )}
                  style={{
                    top: `${80 + (i * 200)}px`,
                    transform: 'translateY(-50%)'
                  }}
                  title={`Result #${i + 1}: ${d}`}
                >
                  {d || '—'}
                </span>
              ))
            )}
          </div>
        )}
      </div>

      {/* Google Attribution - DO NOT REMOVE/ALTER/OBSCURE */}
      <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <gmp-place-attribution color-scheme="light" />
      </div>
    </div>
  );
}

export default NearbyPlacesCard;
