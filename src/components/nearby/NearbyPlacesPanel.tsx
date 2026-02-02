'use client';

/**
 * NearbyPlacesPanel Component
 *
 * Search interface for nearby places with category chips, search input, and results list.
 *
 * Design: Premium minimalist with elegant micro-interactions and perfect theme consistency.
 * Features: Horizontal scrollable categories, category-colored icons, mobile toggle.
 *
 * COMPLIANCE CRITICAL:
 * - NO API call on mount (only on explicit user interaction)
 * - Requires authentication to search
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  MapPin,
  Search,
  AlertCircle,
  ArrowRight,
  ShoppingCart,
  Utensils,
  ShoppingBag,
  Fuel,
  Dumbbell,
  Pill,
  Footprints,
  Car,
  Map as MapIcon,
  List as ListIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CATEGORY_CHIPS,
  RADIUS_OPTIONS,
  getCategoryColors,
  type NearbyPlace,
  type CategoryChip,
} from '@/types/nearby';

// Icon mapping for category chips
const ICON_MAP = {
  ShoppingCart,
  Utensils,
  ShoppingBag,
  Fuel,
  Dumbbell,
  Pill,
} as const;

interface NearbyPlacesPanelProps {
  listingLat: number;
  listingLng: number;
  onPlacesChange?: (places: NearbyPlace[]) => void;
  onPlaceHover?: (placeId: string | null) => void;
  viewMode?: 'list' | 'map';
  onViewModeChange?: (mode: 'list' | 'map') => void;
}

export default function NearbyPlacesPanel({
  listingLat,
  listingLng,
  onPlacesChange,
  onPlaceHover,
  viewMode = 'list',
  onViewModeChange,
}: NearbyPlacesPanelProps) {
  const { data: session, status } = useSession();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChip, setSelectedChip] = useState<CategoryChip | null>(null);
  const [selectedRadius, setSelectedRadius] = useState<number>(RADIUS_OPTIONS[0].meters);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // Fetch places from API with "latest request wins" pattern
  const fetchPlaces = useCallback(async (
    categories?: string[],
    query?: string,
    radius?: number
  ) => {
    // Cancel any in-flight request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);
    setErrorDetails(null);

    try {
      const response = await fetch('/api/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingLat,
          listingLng,
          categories,
          query,
          radiusMeters: radius || selectedRadius,
        }),
        signal: abortControllerRef.current.signal,
      });

      const data = await response.json();

      // Check if still mounted before updating state
      if (!isMountedRef.current) return;

      if (!response.ok) {
        setError(data.error || 'Failed to fetch nearby places');
        setErrorDetails(data.details || null);
        setPlaces([]);
        return;
      }

      setPlaces(data.places);
      setHasSearched(true);
      onPlacesChange?.(data.places);
    } catch (err) {
      // Ignore abort errors - this is expected when cancelling in-flight requests
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      // Check if still mounted before updating state
      if (!isMountedRef.current) return;
      console.error('Nearby search error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setErrorDetails(null);
      setPlaces([]);
    } finally {
      // Check if still mounted before updating state
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [listingLat, listingLng, selectedRadius, onPlacesChange]);

  // Handle chip click
  const handleChipClick = useCallback((chip: CategoryChip) => {
    setSelectedChip(chip);
    setSearchQuery('');
    fetchPlaces(chip.categories, chip.query);
  }, [fetchPlaces]);

  // Handle search input change - no auto-search, wait for explicit action
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setSelectedChip(null);
  }, []);

  // Handle explicit search (Enter key or button click)
  const handleSearch = useCallback(() => {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length >= 2) {
      fetchPlaces(undefined, trimmedQuery);
    }
  }, [searchQuery, fetchPlaces]);

  // Handle radius change
  const handleRadiusChange = useCallback((newRadius: number) => {
    setSelectedRadius(newRadius);
    // Only refetch if we have an active search
    const trimmedQuery = searchQuery.trim();
    if (selectedChip) {
      fetchPlaces(selectedChip.categories, selectedChip.query, newRadius);
    } else if (trimmedQuery.length >= 2) {
      fetchPlaces(undefined, trimmedQuery, newRadius);
    }
  }, [selectedChip, searchQuery, fetchPlaces]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Cancel any in-flight request on unmount
      abortControllerRef.current?.abort();
    };
  }, []);

  // Reset state when listing coordinates change (new listing context)
  useEffect(() => {
    setSearchQuery('');
    setSelectedChip(null);
    setPlaces([]);
    setHasSearched(false);
    setError(null);
    setErrorDetails(null);
    // Cancel any in-flight request
    abortControllerRef.current?.abort();
  }, [listingLat, listingLng]);

  // Auth gate - show loading skeleton
  if (status === 'loading') {
    return (
      <div className="p-4 sm:p-6 animate-pulse space-y-4">
        <div className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-2xl" />
        <div className="flex gap-2 overflow-x-auto hide-scrollbar">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 w-28 flex-shrink-0 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  // Auth gate - show login prompt
  if (status === 'unauthenticated' || !session) {
    return (
      <div
        className="
          flex flex-col items-center justify-center
          h-full py-16 px-6 text-center
          bg-gradient-to-br from-zinc-50 to-zinc-100
          dark:from-zinc-800/50 dark:to-zinc-900/50
        "
      >
        <div
          className="
            w-14 h-14 mb-4
            flex items-center justify-center
            bg-gradient-to-br from-blue-500 to-indigo-600
            rounded-2xl shadow-lg shadow-blue-500/30 dark:shadow-blue-500/20
          "
        >
          <MapPin className="w-6 h-6 text-white" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
          Explore nearby places
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 mb-4 max-w-xs">
          Sign in to discover restaurants, stores, and services near this listing
        </p>
        <Button variant="primary" size="sm" asChild>
          <a href="/login" className="gap-2">
            <span>Sign in to explore</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search & Filters (Sticky Header) */}
      <div className="p-4 sm:p-6 space-y-4 shadow-sm z-20 bg-white dark:bg-zinc-900 relative flex-shrink-0">
        {/* Search Input */}
        <div className="relative group">
          <div className="relative">
            <Search
              className="
                absolute left-4 top-1/2 -translate-y-1/2
                w-4 h-4 text-zinc-400
                transition-colors duration-200
                group-focus-within:text-zinc-900 dark:group-focus-within:text-white
              "
            />
            <input
              type="text"
              placeholder="Search e.g. 'Coffee', 'Gym'"
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              disabled={isLoading}
              maxLength={100}
              aria-label="Search nearby places"
              className="
                w-full pl-11 pr-10 py-2.5
                bg-zinc-50 dark:bg-zinc-800
                border border-transparent
                focus:bg-white dark:focus:bg-zinc-800
                focus:border-zinc-300 dark:focus:border-zinc-700
                rounded-xl
                text-zinc-900 dark:text-white text-sm
                placeholder:text-zinc-600 dark:placeholder:text-zinc-300
                focus:outline-none
                transition-all duration-200
                disabled:opacity-60 disabled:cursor-not-allowed
              "
            />
            {/* Search icon button - appears when 2+ chars typed */}
            {searchQuery.trim().length >= 2 && (
              <button
                onClick={handleSearch}
                disabled={isLoading}
                aria-label="Search"
                className="
                  absolute right-2 top-1/2 -translate-y-1/2
                  w-7 h-7
                  flex items-center justify-center
                  bg-zinc-900 dark:bg-white
                  text-white dark:text-zinc-900
                  rounded-lg
                  hover:bg-zinc-800 dark:hover:bg-zinc-100
                  disabled:opacity-60
                  transition-colors
                "
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Category Chips - Horizontal Scroll with fade masks */}
        <div className="relative -mx-4 sm:-mx-6">
          {/* Left fade mask */}
          <div className="absolute left-0 top-0 bottom-1 w-4 sm:w-6 bg-gradient-to-r from-white dark:from-zinc-900 to-transparent z-10 pointer-events-none" />

          {/* Scrollable chips container */}
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 px-4 sm:px-6 scroll-smooth">
            {CATEGORY_CHIPS.map((chip) => {
              const isSelected = selectedChip?.label === chip.label;
              const Icon = ICON_MAP[chip.icon];
              return (
                <button
                  key={chip.label}
                  onClick={() => handleChipClick(chip)}
                  disabled={isLoading}
                  aria-pressed={isSelected}
                  className={`
                    group relative inline-flex items-center gap-2
                    px-3 py-1.5 rounded-lg flex-shrink-0
                    text-xs font-medium whitespace-nowrap
                    border
                    transition-all duration-200 ease-out
                    ${isSelected
                      ? 'bg-zinc-900 dark:bg-white border-zinc-900 dark:border-white text-white dark:text-zinc-900'
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }
                    disabled:opacity-60 disabled:cursor-not-allowed
                  `}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right fade mask */}
          <div className="absolute right-0 top-0 bottom-1 w-4 sm:w-6 bg-gradient-to-l from-white dark:from-zinc-900 to-transparent z-10 pointer-events-none" />
        </div>

        {/* Results Header & Radius Selector */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Results ({places.length})
          </span>
          <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
            {RADIUS_OPTIONS.map((option) => (
              <button
                key={option.label}
                onClick={() => handleRadiusChange(option.meters)}
                disabled={isLoading}
                aria-pressed={selectedRadius === option.meters}
                className={`
                  px-2 py-0.5 rounded-md
                  text-xs font-medium
                  transition-all duration-200
                  ${selectedRadius === option.meters
                    ? 'bg-white dark:bg-zinc-600 shadow-sm text-zinc-900 dark:text-white'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }
                  disabled:opacity-60 disabled:cursor-not-allowed
                `}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results Area - Scrollable */}
      <div
        className="flex-1 overflow-y-auto hide-scrollbar p-4 sm:px-6 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/50 pb-24 lg:pb-4"
        aria-busy={isLoading}
        aria-label="Nearby places results"
        data-testid="results-area"
      >
        {/* Loading State */}
        {isLoading && (
          <div className="space-y-3" data-testid="loading-skeleton">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-start gap-4 p-4 rounded-2xl bg-white dark:bg-zinc-800/40"
              >
                <div className="w-12 h-12 rounded-xl bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded-lg bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
                  <div className="h-3 w-1/2 rounded-lg bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
                  <div className="h-3 w-1/4 rounded-lg bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {error && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">{error}</p>
              {errorDetails && (
                <p className="text-xs text-red-500 dark:text-red-400/80 mt-1">{errorDetails}</p>
              )}
            </div>
          </div>
        )}

        {/* Results List - Clean Minimal List */}
        {!isLoading && !error && hasSearched && (
          <>
            {places.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 mb-3 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-zinc-400" />
                </div>
                <p className="text-zinc-900 dark:text-zinc-100 font-medium text-sm">
                  No places found
                  {searchQuery.trim() && (
                    <span className="font-normal"> for &ldquo;{searchQuery.trim()}&rdquo;</span>
                  )}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Try a different search or category
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {places.map((place) => {
                  const Icon = getIconForCategory(place.category);
                  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.location.lat},${place.location.lng}`;

                  return (
                    <a
                      key={place.id}
                      href={directionsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Get directions to ${place.name}`}
                      onMouseEnter={() => onPlaceHover?.(place.id)}
                      onMouseLeave={() => onPlaceHover?.(null)}
                      className="
                        group relative
                        flex items-center gap-3
                        p-3 rounded-xl
                        bg-transparent
                        hover:bg-zinc-100 dark:hover:bg-zinc-800
                        transition-all duration-200
                        cursor-pointer
                        border border-transparent
                        no-underline
                      "
                    >
                      {/* Minimal Icon */}
                      <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 flex items-center justify-center flex-shrink-0 text-zinc-500 dark:text-zinc-400 group-hover:bg-white dark:group-hover:bg-zinc-700 transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-0.5">
                          <h4 className="font-semibold text-zinc-900 dark:text-white text-sm truncate pr-2">
                            {place.name}
                          </h4>
                          <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 whitespace-nowrap bg-zinc-50 dark:bg-zinc-800/50 px-1.5 py-0.5 rounded-md group-hover:bg-white dark:group-hover:bg-zinc-700 transition-colors">
                            {place.distanceMiles.toFixed(1)} mi
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                          {place.address} {place.chain && `• ${place.chain}`}
                        </p>
                      </div>

                      {/* Arrow */}
                      <ArrowRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                    </a>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Initial state - prompt to search */}
        {!isLoading && !error && !hasSearched && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="relative w-16 h-16 mb-4 flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800 rounded-2xl" />
              <div className="absolute inset-1 bg-white dark:bg-zinc-900 rounded-xl" />
              <Search className="relative w-6 h-6 text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 font-medium">
              Discover what&apos;s nearby
            </p>
            <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
              Select a category or search to explore
            </p>
          </div>
        )}
      </div>

      {/* Mobile Floating Toggle Button */}
      {
        onViewModeChange && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 lg:hidden">
            <button
              onClick={() => onViewModeChange(viewMode === 'list' ? 'map' : 'list')}
              className="
              flex items-center gap-2
              px-5 py-2.5
              bg-zinc-900 dark:bg-white
              text-white dark:text-zinc-900
              rounded-full
              shadow-xl shadow-zinc-900/20
              font-semibold text-sm
              transform transition-transform
              active:scale-95 hover:scale-105
            "
            >
              <span>{viewMode === 'list' ? 'Map' : 'List'}</span>
              {viewMode === 'list' ? (
                <MapIcon className="w-4 h-4" />
              ) : (
                <ListIcon className="w-4 h-4" />
              )}
            </button>
          </div>
        )
      }
    </div >
  );
}

/**
 * Get appropriate icon for a category
 * Handles valid Radar API category names
 */
function getIconForCategory(category: string) {
  // Grocery - Radar API uses 'grocery'
  if (category.includes('grocery')) return ShoppingCart;
  // Restaurants - Radar API uses 'restaurant' and 'food-beverage'
  if (category.includes('restaurant') || category.includes('food-beverage')) return Utensils;
  // Shopping - Radar API uses 'shopping'
  if (category.includes('shopping')) return ShoppingBag;
  // Gas stations - Radar API uses 'gas-station'
  if (category.includes('gas') || category.includes('fuel')) return Fuel;
  // Fitness - Radar API uses 'gym' and 'fitness-recreation'
  if (category.includes('gym') || category.includes('fitness')) return Dumbbell;
  // Pharmacy - Radar API uses 'health-medicine' and 'drugstore'
  if (category.includes('pharmacy') || category.includes('drugstore') || category.includes('health-medicine')) return Pill;
  return MapPin;
}
