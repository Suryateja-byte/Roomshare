'use client';

/**
 * NearbyPlacesPanel Component
 *
 * Search interface for nearby places with category chips, search input, and results list.
 *
 * Design: Premium minimalist with elegant micro-interactions and perfect theme consistency.
 *
 * COMPLIANCE CRITICAL:
 * - NO API call on mount (only on explicit user interaction)
 * - Requires authentication to search
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  MapPin,
  Navigation,
  Search,
  AlertCircle,
  ArrowRight,
  ShoppingCart,
  Utensils,
  ShoppingBag,
  Fuel,
  Dumbbell,
  Pill,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CATEGORY_CHIPS, RADIUS_OPTIONS, type NearbyPlace, type CategoryChip } from '@/types/nearby';

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
}

export default function NearbyPlacesPanel({
  listingLat,
  listingLng,
  onPlacesChange,
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
      <div className="animate-pulse space-y-4">
        <div className="h-12 bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 w-28 bg-zinc-100 dark:bg-zinc-800 rounded-xl" />
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
          py-16 px-6 text-center
          bg-gradient-to-br from-zinc-50 to-zinc-100
          dark:from-zinc-800/50 dark:to-zinc-900/50
          rounded-xl
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
    <div className="space-y-5">
      {/* Search Input - Refined with Focus Glow */}
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
            placeholder="Search for any place..."
            value={searchQuery}
            onChange={handleSearchChange}
            disabled={isLoading}
            aria-label="Search nearby places"
            className="
              w-full pl-11 pr-4 py-3
              bg-zinc-100/80 dark:bg-zinc-800/80
              border border-transparent
              rounded-xl
              text-zinc-900 dark:text-white
              placeholder:text-zinc-400 dark:placeholder:text-zinc-500
              focus:outline-none focus:bg-white dark:focus:bg-zinc-800
              focus:border-zinc-200 dark:focus:border-zinc-700
              focus:ring-4 focus:ring-blue-500/10 dark:focus:ring-blue-400/10
              transition-all duration-300
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          />
        </div>
      </div>

      {/* Category Chips - Elegant Pills with Icons */}
      <div className="flex flex-wrap gap-2">
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
                px-4 py-2.5 rounded-xl
                text-sm font-medium
                transition-all duration-300 ease-out
                ${isSelected
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-lg shadow-zinc-900/20 dark:shadow-white/20 scale-[1.02]'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:scale-[1.02]'
                }
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
              `}
            >
              <Icon className={`w-4 h-4 transition-transform duration-300 ${isSelected ? '' : 'group-hover:scale-110'}`} />
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>

      {/* Radius Selector - Segmented Control */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
          Distance
        </span>
        <div
          className="
            inline-flex p-1
            bg-zinc-100 dark:bg-zinc-800
            rounded-lg
          "
        >
          {RADIUS_OPTIONS.map((option) => (
            <button
              key={option.label}
              onClick={() => handleRadiusChange(option.meters)}
              disabled={isLoading}
              aria-pressed={selectedRadius === option.meters}
              className={`
                px-3 py-1.5 rounded-md
                text-xs font-medium
                transition-all duration-200
                ${selectedRadius === option.meters
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State - Elegant Skeleton */}
      {isLoading && (
        <div className="space-y-3" data-testid="loading-skeleton">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-start gap-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50"
            >
              <div className="w-11 h-11 rounded-xl bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
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
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl">
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
            <div className="space-y-3 max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700">
              {places.map((place, index) => (
                <div
                  key={place.id}
                  className="
                    group relative
                    flex items-start gap-4 p-4
                    bg-white dark:bg-zinc-800/50
                    border border-zinc-100 dark:border-zinc-700/50
                    rounded-xl
                    hover:border-zinc-200 dark:hover:border-zinc-600
                    hover:shadow-lg hover:shadow-zinc-900/5 dark:hover:shadow-black/20
                    hover:-translate-y-0.5
                    transition-all duration-300 ease-out
                  "
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Category icon with gradient background */}
                  <div
                    className="
                      flex-shrink-0 w-11 h-11
                      flex items-center justify-center
                      bg-gradient-to-br from-zinc-100 to-zinc-200
                      dark:from-zinc-700 dark:to-zinc-800
                      rounded-xl
                      group-hover:from-blue-50 group-hover:to-indigo-100
                      dark:group-hover:from-blue-900/30 dark:group-hover:to-indigo-900/30
                      transition-colors duration-300
                    "
                  >
                    <MapPin className="w-5 h-5 text-zinc-500 dark:text-zinc-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-zinc-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {place.name}
                    </h4>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                      {place.address}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span
                        className="
                          inline-flex items-center gap-1
                          text-xs font-medium text-zinc-500 dark:text-zinc-400
                        "
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        {place.distanceMiles.toFixed(1)} mi
                      </span>
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

                  {/* Directions button */}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${place.location.lat},${place.location.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="
                      flex-shrink-0
                      flex items-center gap-1.5
                      px-3 py-2
                      text-xs font-medium
                      text-blue-600 dark:text-blue-400
                      bg-blue-50 dark:bg-blue-900/20
                      hover:bg-blue-100 dark:hover:bg-blue-900/40
                      rounded-lg
                      transition-colors duration-200
                    "
                    aria-label={`Get directions to ${place.name}`}
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Directions</span>
                  </a>
                </div>
              ))}
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
  );
}
