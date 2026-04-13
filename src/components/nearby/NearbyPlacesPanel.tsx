"use client";

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
 * - Available to guests and signed-in users
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
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
} from "lucide-react";
import {
  CATEGORY_CHIPS,
  RADIUS_OPTIONS,
  type NearbyPlace,
  type CategoryChip,
} from "@/types/nearby";

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
  isPaneInteractive?: boolean;
}

type FocusRestoreTarget = HTMLButtonElement | HTMLInputElement | null;

function normalizeErrorDetails(details: unknown): string | null {
  if (typeof details === "string") {
    const trimmed = details.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(details)) {
    const messages = details
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);

    return messages.length > 0 ? messages.join(" ") : null;
  }

  if (details && typeof details === "object") {
    const fieldMessages = Object.entries(details as Record<string, unknown>)
      .flatMap(([field, value]) => {
        if (Array.isArray(value)) {
          return value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => `${field}: ${item}`);
        }

        if (typeof value === "string" && value.trim().length > 0) {
          return [`${field}: ${value.trim()}`];
        }

        return [];
      });

    if (fieldMessages.length > 0) {
      return fieldMessages.join(" ");
    }
  }

  return null;
}

function canRestoreFocus(
  element: FocusRestoreTarget,
  isPaneInteractive: boolean
): element is HTMLButtonElement | HTMLInputElement {
  if (!element || !isPaneInteractive || !element.isConnected) {
    return false;
  }

  if (
    element.closest("[inert]") ||
    element.closest('[aria-hidden="true"]') ||
    element.closest("[hidden]")
  ) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  return element.getClientRects().length > 0;
}

export default function NearbyPlacesPanel({
  listingLat,
  listingLng,
  onPlacesChange,
  onPlaceHover,
  isPaneInteractive = true,
}: NearbyPlacesPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChip, setSelectedChip] = useState<CategoryChip | null>(null);
  const [selectedRadius, setSelectedRadius] = useState<number>(
    RADIUS_OPTIONS[0].meters
  );
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const isPaneInteractiveRef = useRef(isPaneInteractive);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const focusRestoreTargetRef = useRef<{
    requestId: number;
    element: FocusRestoreTarget;
  } | null>(null);

  useEffect(() => {
    isPaneInteractiveRef.current = isPaneInteractive;
  }, [isPaneInteractive]);

  const clearSharedResults = useCallback(() => {
    setPlaces([]);
    onPlacesChange?.([]);
    onPlaceHover?.(null);
  }, [onPlaceHover, onPlacesChange]);

  // Fetch places from API with "latest request wins" pattern
  const fetchPlaces = useCallback(
    async ({
      categories,
      query,
      radius,
      initiator,
    }: {
      categories?: string[];
      query?: string;
      radius?: number;
      initiator?: FocusRestoreTarget;
    }) => {
      const requestId = activeRequestIdRef.current + 1;
      activeRequestIdRef.current = requestId;

      // Cancel any in-flight request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      focusRestoreTargetRef.current = {
        requestId,
        element: initiator ?? null,
      };

      setIsLoading(true);
      setError(null);
      setErrorDetails(null);
      clearSharedResults();

      try {
        const response = await fetch("/api/nearby", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingLat,
            listingLng,
            categories,
            query,
            radiusMeters: radius || selectedRadius,
          }),
          signal: controller.signal,
        });

        const data = await response.json();

        // Check if still mounted before updating state
        if (
          !isMountedRef.current ||
          activeRequestIdRef.current !== requestId ||
          abortControllerRef.current !== controller
        ) {
          return;
        }

        if (!response.ok) {
          setError(data.error || "Failed to fetch nearby places");
          setErrorDetails(normalizeErrorDetails(data.details));
          clearSharedResults();
          return;
        }

        const nextPlaces = Array.isArray(data.places) ? data.places : [];
        setPlaces(nextPlaces);
        setHasSearched(true);
        onPlacesChange?.(nextPlaces);
        onPlaceHover?.(null);
      } catch (err) {
        // Ignore abort errors - this is expected when cancelling in-flight requests
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        // Check if still mounted before updating state
        if (
          !isMountedRef.current ||
          activeRequestIdRef.current !== requestId ||
          abortControllerRef.current !== controller
        ) {
          return;
        }
        console.error("Nearby search error:", err);
        setError(err instanceof Error ? err.message : "An error occurred");
        setErrorDetails(null);
        clearSharedResults();
      } finally {
        if (
          isMountedRef.current &&
          activeRequestIdRef.current === requestId &&
          abortControllerRef.current === controller
        ) {
          setIsLoading(false);

          const restoreTarget = focusRestoreTargetRef.current;
          if (restoreTarget?.requestId === requestId) {
            const restoreFocus = () => {
              if (
                focusRestoreTargetRef.current?.requestId !== requestId ||
                activeRequestIdRef.current !== requestId
              ) {
                return;
              }

              if (
                canRestoreFocus(
                  restoreTarget.element,
                  isPaneInteractiveRef.current
                )
              ) {
                restoreTarget.element.focus();
              }

              focusRestoreTargetRef.current = null;
            };

            if (typeof window !== "undefined" && window.requestAnimationFrame) {
              window.requestAnimationFrame(() => {
                restoreFocus();
              });
            } else {
              setTimeout(restoreFocus, 0);
            }
          } else {
            focusRestoreTargetRef.current = null;
          }
        }
      }
    },
    [
      clearSharedResults,
      listingLat,
      listingLng,
      onPlaceHover,
      onPlacesChange,
      selectedRadius,
    ]
  );

  // Handle chip click
  const handleChipClick = useCallback(
    (chip: CategoryChip, trigger: HTMLButtonElement) => {
      setSelectedChip(chip);
      setSearchQuery("");
      void fetchPlaces({
        categories: chip.categories,
        query: chip.query,
        initiator: trigger,
      });
    },
    [fetchPlaces]
  );

  // Handle search input change - no auto-search, wait for explicit action
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
      setSelectedChip(null);
    },
    []
  );

  // Handle explicit search (Enter key or button click)
  const handleSearch = useCallback(() => {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length >= 2) {
      void fetchPlaces({
        query: trimmedQuery,
        initiator: searchInputRef.current,
      });
    }
  }, [searchQuery, fetchPlaces]);

  const handleSearchButtonClick = useCallback(
    (trigger: HTMLButtonElement) => {
      const trimmedQuery = searchQuery.trim();
      if (trimmedQuery.length >= 2) {
        void fetchPlaces({
          query: trimmedQuery,
          initiator: trigger,
        });
      }
    },
    [fetchPlaces, searchQuery]
  );

  // Handle radius change
  const handleRadiusChange = useCallback(
    (newRadius: number, trigger: HTMLButtonElement) => {
      setSelectedRadius(newRadius);
      // Only refetch if we have an active search
      const trimmedQuery = searchQuery.trim();
      if (selectedChip) {
        void fetchPlaces({
          categories: selectedChip.categories,
          query: selectedChip.query,
          radius: newRadius,
          initiator: trigger,
        });
      } else if (trimmedQuery.length >= 2) {
        void fetchPlaces({
          query: trimmedQuery,
          radius: newRadius,
          initiator: trigger,
        });
      }
    },
    [selectedChip, searchQuery, fetchPlaces]
  );

  // Cleanup abort controller on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      activeRequestIdRef.current += 1;
      focusRestoreTargetRef.current = null;
      // Cancel any in-flight request on unmount
      abortControllerRef.current?.abort();
    };
  }, [clearSharedResults]);

  // Reset state when listing coordinates change (new listing context)
  useEffect(() => {
    activeRequestIdRef.current += 1;
    focusRestoreTargetRef.current = null;
    setIsLoading(false);
    setSearchQuery("");
    setSelectedChip(null);
    clearSharedResults();
    setHasSearched(false);
    setError(null);
    setErrorDetails(null);
    // Cancel any in-flight request
    abortControllerRef.current?.abort();
  }, [clearSharedResults, listingLat, listingLng]);

  return (
    <div className="flex flex-col h-full">
      {/* Search & Filters (Sticky Header) */}
      <div className="p-4 sm:p-6 space-y-4 shadow-ambient-sm z-20 bg-surface-container-lowest relative flex-shrink-0">
        {/* Search Input */}
        <div className="relative group">
          <div className="relative">
            <Search
              className="
                absolute left-4 top-1/2 -translate-y-1/2
                w-4 h-4 text-on-surface-variant
                transition-colors duration-200
                group-focus-within:text-on-surface
              "
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search e.g. 'Coffee', 'Gym'"
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              disabled={isLoading}
              maxLength={100}
              aria-label="Search nearby places"
              className="
                w-full pl-11 pr-10 py-2.5
                bg-surface-canvas
                border border-transparent
                focus:bg-surface-container-lowest
                focus:border-outline-variant/30
                rounded-xl
                text-on-surface text-sm
                placeholder:text-on-surface-variant
                focus:outline-none
                transition-all duration-200
                disabled:opacity-60 disabled:cursor-not-allowed
              "
            />
            {/* Search icon button - appears when 2+ chars typed */}
            {searchQuery.trim().length >= 2 && (
              <button
                type="button"
                onClick={(event) => handleSearchButtonClick(event.currentTarget)}
                disabled={isLoading}
                aria-label="Search"
                className="
                  absolute right-2 top-1/2 -translate-y-1/2
                  min-h-[44px] min-w-[44px]
                  flex items-center justify-center
                  bg-on-surface
                  text-white
                  rounded-lg
                  hover:bg-on-surface
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
          <div className="absolute left-0 top-0 bottom-1 w-4 sm:w-6 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />

          {/* Scrollable chips container */}
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 px-4 sm:px-6 scroll-smooth">
            {CATEGORY_CHIPS.map((chip) => {
              const isSelected = selectedChip?.label === chip.label;
              const Icon = ICON_MAP[chip.icon];
              return (
                <button
                  key={chip.label}
                  type="button"
                  onClick={(event) => handleChipClick(chip, event.currentTarget)}
                  disabled={isLoading}
                  aria-pressed={isSelected}
                  className={`
                    group relative inline-flex items-center gap-2
                    min-h-[44px] px-3 py-2 rounded-lg flex-shrink-0
                    text-xs font-medium whitespace-nowrap
                    border
                    transition-all duration-200 ease-out
                    ${
                      isSelected
                        ? "bg-on-surface border-outline-variant/20 text-white"
                        : "bg-surface-container-lowest border-outline-variant/20 text-on-surface-variant hover:border-outline-variant/30"
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
          <div className="absolute right-0 top-0 bottom-1 w-4 sm:w-6 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
        </div>

        {/* Results Header & Radius Selector */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Results ({places.length})
          </span>
          <div className="flex bg-surface-container-high rounded-lg p-0.5">
            {RADIUS_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={(event) =>
                  handleRadiusChange(option.meters, event.currentTarget)
                }
                disabled={isLoading}
                aria-pressed={selectedRadius === option.meters}
                className={`
                  min-h-[44px] px-3 py-2 rounded-md
                  text-xs font-medium
                  transition-all duration-200
                  ${
                    selectedRadius === option.meters
                      ? "bg-surface-container-lowest shadow-ambient-sm text-on-surface"
                      : "text-on-surface-variant hover:text-on-surface"
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
        className="flex-1 overflow-y-auto hide-scrollbar-mobile p-4 sm:px-6 space-y-3 bg-surface-canvas/50 pb-24 lg:pb-4"
        tabIndex={0}
        role="region"
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
                className="flex items-start gap-4 p-4 rounded-2xl bg-surface-container-lowest"
              >
                <div className="w-12 h-12 rounded-xl bg-surface-container-high animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded-lg bg-surface-container-high animate-pulse" />
                  <div className="h-3 w-1/2 rounded-lg bg-surface-container-high animate-pulse" />
                  <div className="h-3 w-1/4 rounded-lg bg-surface-container-high animate-pulse" />
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
            className="flex items-start gap-3 p-4 bg-red-50 text-red-600 rounded-2xl"
          >
            <AlertCircle
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium">{error}</p>
              {errorDetails && (
                <p className="text-xs text-red-500 mt-1">{errorDetails}</p>
              )}
            </div>
          </div>
        )}

        {/* Results List - Clean Minimal List */}
        {!isLoading && !error && hasSearched && (
          <>
            {places.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 mb-3 bg-surface-container-high rounded-full flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-on-surface-variant" />
                </div>
                <p className="text-on-surface font-medium text-sm">
                  No places found
                  {searchQuery.trim() && (
                    <span className="font-normal">
                      {" "}
                      for &ldquo;{searchQuery.trim()}&rdquo;
                    </span>
                  )}
                </p>
                <p className="text-xs text-on-surface-variant mt-1">
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
                      onFocus={() => onPlaceHover?.(place.id)}
                      onBlur={() => onPlaceHover?.(null)}
                      className="
                        group relative
                        flex items-center gap-3
                        p-3 rounded-xl
                        bg-transparent
                        hover:bg-surface-container-high
                        transition-all duration-200
                        cursor-pointer
                        border border-transparent
                        no-underline
                      "
                    >
                      {/* Minimal Icon */}
                      <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center flex-shrink-0 text-on-surface-variant group-hover:bg-surface-container-lowest transition-colors">
                        <Icon className="w-5 h-5" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-0.5">
                          <h4 className="font-semibold text-on-surface text-sm truncate pr-2">
                            {place.name}
                          </h4>
                          <span className="text-xs font-medium text-on-surface-variant whitespace-nowrap bg-surface-canvas px-1.5 py-0.5 rounded-md group-hover:bg-surface-container-lowest transition-colors">
                            {place.distanceMiles.toFixed(1)} mi
                          </span>
                        </div>
                        <p className="text-xs text-on-surface-variant truncate">
                          {place.address} {place.chain && `• ${place.chain}`}
                        </p>
                      </div>

                      {/* Arrow */}
                      <ArrowRight className="w-4 h-4 text-on-surface-variant opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
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
              <div className="absolute inset-0 bg-gradient-to-br from-surface-container-high to-surface-container-high rounded-2xl" />
              <div className="absolute inset-1 bg-surface-container-lowest rounded-xl" />
              <Search className="relative w-6 h-6 text-on-surface-variant" />
            </div>
            <p className="text-on-surface-variant font-medium">
              Discover what&apos;s nearby
            </p>
            <p className="text-sm text-on-surface-variant mt-1">
              Select a category or search to explore
            </p>
          </div>
        )}
      </div>

      {/* Mobile toggle button moved to NearbyPlacesSection for correct z-index stacking */}
    </div>
  );
}

/**
 * Get appropriate icon for a category
 * Handles valid Radar API category names
 */
function getIconForCategory(category: string) {
  // Grocery - Radar API uses 'grocery'
  if (category.includes("grocery")) return ShoppingCart;
  // Restaurants - Radar API uses 'restaurant' and 'food-beverage'
  if (category.includes("restaurant") || category.includes("food-beverage"))
    return Utensils;
  // Shopping - Radar API uses 'shopping'
  if (category.includes("shopping")) return ShoppingBag;
  // Gas stations - Radar API uses 'gas-station'
  if (category.includes("gas") || category.includes("fuel")) return Fuel;
  // Fitness - Radar API uses 'gym' and 'fitness-recreation'
  if (category.includes("gym") || category.includes("fitness")) return Dumbbell;
  // Pharmacy - Radar API uses 'health-medicine' and 'drugstore'
  if (
    category.includes("pharmacy") ||
    category.includes("drugstore") ||
    category.includes("health-medicine")
  )
    return Pill;
  return MapPin;
}
