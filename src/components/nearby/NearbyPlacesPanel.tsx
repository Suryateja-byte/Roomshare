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
  viewMode?: 'list' | 'map';
  onViewModeChange?: (mode: 'list' | 'map') => void;
}

export default function NearbyPlacesPanel({
  listingLat,
  listingLng,
  onPlacesChange,
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

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch places from API
  const fetchPlaces = useCallback(async (
    categories?: string[],
    query?: string,
    radius?: number
  ) => {
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
      });

      const data = await response.json();

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
      console.error('Nearby search error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setErrorDetails(null);
      setPlaces([]);
    } finally {
      setIsLoading(false);
    }
  }, [listingLat, listingLng, selectedRadius, onPlacesChange]);

  // Handle chip click
  const handleChipClick = useCallback((chip: CategoryChip) => {
    setSelectedChip(chip);
    setSearchQuery('');
    fetchPlaces(chip.categories, chip.query);
  }, [fetchPlaces]);

  // Handle search input change with debounce
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setSelectedChip(null);

    // Clear existing debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Only search if query is >= 2 chars
    if (value.length >= 2) {
      debounceRef.current = setTimeout(() => {
        fetchPlaces(undefined, value);
      }, 300);
    }
  }, [fetchPlaces]);

  // Handle radius change
  const handleRadiusChange = useCallback((newRadius: number) => {
    setSelectedRadius(newRadius);
    // Only refetch if we have an active search
    if (selectedChip) {
      fetchPlaces(selectedChip.categories, selectedChip.query, newRadius);
    } else if (searchQuery.length >= 2) {
      fetchPlaces(undefined, searchQuery, newRadius);
    }
  }, [selectedChip, searchQuery, fetchPlaces]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

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
          <div
            className="
              absolute inset-0 -m-1
              bg-gradient-to-r from-blue-500/20 to-indigo-500/20
              rounded-2xl opacity-0 group-focus-within:opacity-100
              blur-xl transition-opacity duration-500
            "
          />
          <div className="relative">
            <Search
              className="
                absolute left-4 top-1/2 -translate-y-1/2
                w-4 h-4 text-zinc-400
                transition-colors duration-200
                group-focus-within:text-blue-500
              "
            />
            <input
              type="text"
              placeholder="Search e.g. 'Coffee', 'Gym'"
              value={searchQuery}
              onChange={handleSearchChange}
              disabled={isLoading}
              aria-label="Search nearby places"
              className="
                w-full pl-11 pr-4 py-3
                bg-zinc-50 dark:bg-zinc-800/50
                border border-zinc-200 dark:border-zinc-700
                rounded-2xl
                text-zinc-900 dark:text-white text-base sm:text-sm
                placeholder:text-zinc-400 dark:placeholder:text-zinc-500
                focus:outline-none focus:bg-white dark:focus:bg-zinc-800
                focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-500
                transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            />
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
                    px-4 py-2 rounded-full flex-shrink-0
                    text-sm font-medium whitespace-nowrap
                    transition-all duration-300 ease-out
                    transform active:scale-95
                    ${isSelected
                      ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-md scale-100'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
                  `}
                >
                  <Icon className={`w-3.5 h-3.5 transition-transform duration-300 ${isSelected ? '' : 'group-hover:scale-110'}`} />
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
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results Area - Scrollable */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-4 sm:px-6 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/50 pb-24 lg:pb-4">
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
          <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">{error}</p>
              {errorDetails && (
                <p className="text-xs text-red-500 dark:text-red-400/80 mt-1">{errorDetails}</p>
              )}
            </div>
          </div>
        )}

        {/* Results List - Premium Cards */}
        {!isLoading && !error && hasSearched && (
          <>
            {places.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="relative w-16 h-16 mb-4 flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800 rounded-2xl" />
                  <div className="absolute inset-1 bg-white dark:bg-zinc-900 rounded-xl" />
                  <MapPin className="relative w-6 h-6 text-zinc-400 dark:text-zinc-500" />
                </div>
                <p className="text-zinc-500 dark:text-zinc-400 font-medium">
                  No places found nearby
                </p>
                <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
                  Try a different category or expand the search radius
                </p>
              </div>
            ) : (
              places.map((place) => {
                const colors = getCategoryColors(place.category);
                const Icon = getIconForCategory(place.category);
                const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.location.lat},${place.location.lng}`;

                return (
                  <div
                    key={place.id}
                    className="
                      group relative overflow-hidden
                      p-4 bg-white dark:bg-zinc-800/40
                      rounded-2xl
                      border border-zinc-200 dark:border-zinc-700/50
                      hover:border-zinc-400 dark:hover:border-zinc-500
                      hover:shadow-md
                      transition-all duration-300
                      cursor-pointer
                      active:scale-[0.99]
                    "
                  >
                    {/* Left accent bar - appears on hover */}
                    <div className={`absolute left-0 top-0 w-1 h-full ${colors.accent} opacity-0 group-hover:opacity-100 transition-opacity`} />

                    <div className="flex gap-4">
                      {/* Category-colored icon */}
                      <div
                        className={`
                          w-12 h-12 rounded-xl flex-shrink-0
                          ${colors.bg} ${colors.bgDark}
                          flex items-center justify-center
                          group-hover:scale-110 transition-transform duration-300
                        `}
                      >
                        <Icon className={`w-6 h-6 ${colors.icon} ${colors.iconDark}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <h4 className="font-semibold text-zinc-900 dark:text-white truncate pr-2">
                            {place.name}
                          </h4>
                        </div>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                          {place.address}
                        </p>

                        {/* Distance & Chain */}
                        <div className="flex items-center gap-3 mt-3">
                          <div className="flex items-center gap-1 text-xs font-medium text-zinc-500">
                            {place.distanceMiles <= 0.5 ? (
                              <Footprints className="w-3 h-3" />
                            ) : (
                              <Car className="w-3 h-3" />
                            )}
                            <span>{place.distanceMiles.toFixed(1)} mi</span>
                          </div>
                          {place.chain && (
                            <span
                              className="
                                px-2 py-0.5
                                text-xs font-medium
                                bg-zinc-100 dark:bg-zinc-700
                                text-zinc-600 dark:text-zinc-300
                                rounded-md
                              "
                            >
                              {place.chain}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Arrow button on hover */}
                      <div className="self-center hidden sm:block opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300">
                        <a
                          href={directionsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="
                            p-2 rounded-full
                            bg-zinc-100 dark:bg-zinc-700
                            hover:bg-zinc-900 hover:text-white
                            dark:hover:bg-white dark:hover:text-zinc-900
                            transition-colors
                          "
                          aria-label={`Get directions to ${place.name}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ArrowRight className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })
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
      {onViewModeChange && (
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
      )}
    </div>
  );
}

/**
 * Get appropriate icon for a category
 */
function getIconForCategory(category: string) {
  if (category.includes('grocery') || category.includes('food-grocery')) return ShoppingCart;
  if (category.includes('restaurant')) return Utensils;
  if (category.includes('shopping') || category.includes('mall')) return ShoppingBag;
  if (category.includes('gas') || category.includes('fuel')) return Fuel;
  if (category.includes('gym') || category.includes('fitness')) return Dumbbell;
  if (category.includes('pharmacy') || category.includes('drug')) return Pill;
  return MapPin;
}
