"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  Search,
  Clock,
  X,
  SlidersHorizontal,
  LocateFixed,
} from "lucide-react";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { FocusTrap } from "@/components/ui/FocusTrap";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import LocationSearchInput from "@/components/LocationSearchInput";
import { urlToFilterChips } from "@/components/filters/filter-chip-utils";
import {
  MAP_FLY_TO_EVENT,
  type MapFlyToEventDetail,
} from "@/components/SearchForm";
import {
  buildSearchIntentParams,
  readSearchIntentState,
  type SearchLocationSelection,
} from "@/lib/search/search-intent";
import {
  applySearchQueryChange,
  buildCanonicalSearchUrl,
  normalizeSearchQuery,
} from "@/lib/search/search-query";

interface MobileSearchOverlayProps {
  /** Whether the overlay is open */
  isOpen: boolean;
  /** Close the overlay */
  onClose: () => void;
  /** Open the filter modal (handled by parent) */
  onOpenFilters?: () => void;
}

/**
 * Full-screen search overlay for mobile (Option A — Airbnb pattern).
 *
 * Slides up from bottom when collapsed search pill is tapped.
 * Contains:
 * - ← back arrow to dismiss
 * - WHERE field with location autocomplete
 * - BUDGET min/max fields
 * - Filters button (opens FilterModal)
 * - SEARCH button
 * - Recent searches list
 *
 * Replaces the cramped in-header expansion with a spacious full-viewport form.
 */
export default function MobileSearchOverlay({
  isOpen,
  onClose,
  onOpenFilters,
}: MobileSearchOverlayProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const reducedMotion = useReducedMotion();
  const locationInputRef = useRef<HTMLInputElement>(null);
  const { recentSearches, removeRecentSearch, formatSearch } =
    useRecentSearches();

  // Form state — initialized from current URL params
  const [location, setLocation] = useState("");
  const [locationCoords, setLocationCoords] =
    useState<SearchLocationSelection | null>(null);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  // FilterModal is handled by the parent via onOpenFilters callback

  // Count active filters for badge
  const activeFilterCount = urlToFilterChips(searchParams).filter(
    (c) =>
      c.paramKey !== "price-range" &&
      c.paramKey !== "minPrice" &&
      c.paramKey !== "maxPrice" &&
      c.paramKey !== "q"
  ).length;

  // Sync form state from URL when overlay opens
  useEffect(() => {
    if (isOpen) {
      const intentState = readSearchIntentState(
        new URLSearchParams(searchParamsString)
      );
      setLocation(intentState.locationInput);
      setLocationCoords(intentState.selectedLocation);
      setMinPrice(searchParams.get("minPrice") || "");
      setMaxPrice(searchParams.get("maxPrice") || "");
    }
  }, [isOpen, searchParams, searchParamsString]);

  useEffect(() => {
    if (!isOpen) return;

    const focusLocationInput = () => {
      if (
        locationInputRef.current &&
        document.activeElement !== locationInputRef.current
      ) {
        locationInputRef.current.focus();
      }
    };

    const rafId = window.requestAnimationFrame(focusLocationInput);
    const timer = window.setTimeout(focusLocationInput, 250);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timer);
    };
  }, [isOpen]);

  // Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useBodyScrollLock(isOpen);

  const handleLocationSelect = useCallback(
    (loc: {
      name: string;
      lat: number;
      lng: number;
      bounds?: [number, number, number, number];
    }) => {
      // Build search URL directly with fresh callback data to avoid stale closure.
      const selectedLocation: SearchLocationSelection = {
        lat: loc.lat,
        lng: loc.lng,
        bounds: loc.bounds,
      };
      const currentIntent = readSearchIntentState(
        new URLSearchParams(searchParamsString)
      );
      const params = buildSearchIntentParams(searchParams, {
        location: loc.name,
        vibe: currentIntent.vibeInput,
        selectedLocation,
      });
      // CFM-604: canonical-on-write guarantee — must go through buildCanonicalSearchUrl.
      const nextUrl = buildCanonicalSearchUrl(
        applySearchQueryChange(normalizeSearchQuery(params), "filter", {
          minPrice: minPrice ? Number.parseFloat(minPrice) : undefined,
          maxPrice: maxPrice ? Number.parseFloat(maxPrice) : undefined,
        })
      );

      window.dispatchEvent(
        new CustomEvent<MapFlyToEventDetail>(MAP_FLY_TO_EVENT, {
          detail: { lat: loc.lat, lng: loc.lng, bbox: loc.bounds, zoom: 13 },
        })
      );

      router.push(nextUrl);
      onClose();
    },
    [searchParams, searchParamsString, minPrice, maxPrice, router, onClose]
  );

  const locationFallbackItems = useMemo(
    () =>
      recentSearches
        .filter((search) => search.coords)
        .map((search) => ({
          id: search.id,
          primaryText: search.location,
          secondaryText: "Recent search",
          onSelect: () => {
            setLocation(search.location);
            setLocationCoords({
              lat: search.coords!.lat,
              lng: search.coords!.lng,
              bounds: search.coords!.bounds,
            });
          },
        })),
    [recentSearches]
  );

  const handleSearch = useCallback(() => {
    if (location.trim().length > 2 && !locationCoords) {
      toast.error("Select a location from the dropdown suggestions.");
      locationInputRef.current?.focus();
      return;
    }

    const currentIntent = readSearchIntentState(
      new URLSearchParams(searchParamsString)
    );
    const params = buildSearchIntentParams(searchParams, {
      location,
      vibe: currentIntent.vibeInput,
      selectedLocation: locationCoords,
    });
    // CFM-604: canonical-on-write guarantee — must go through buildCanonicalSearchUrl.
    const nextUrl = buildCanonicalSearchUrl(
      applySearchQueryChange(normalizeSearchQuery(params), "filter", {
        minPrice: minPrice ? Number.parseFloat(minPrice) : undefined,
        maxPrice: maxPrice ? Number.parseFloat(maxPrice) : undefined,
      })
    );

    // Dispatch fly-to event so the persistent map flies to the new location.
    // On mobile the map never remounts (it lives in layout), so without this
    // event the map stays at its old position after a location search.
    if (locationCoords) {
      const event = new CustomEvent<MapFlyToEventDetail>(MAP_FLY_TO_EVENT, {
        detail: {
          lat: locationCoords.lat,
          lng: locationCoords.lng,
          bbox: locationCoords.bounds,
          zoom: 13,
        },
      });
      window.dispatchEvent(event);
    }

    router.push(nextUrl);
    onClose();
  }, [
    searchParams,
    searchParamsString,
    location,
    locationCoords,
    minPrice,
    maxPrice,
    router,
    onClose,
  ]);

  const handleRecentClick = useCallback(
    (search: (typeof recentSearches)[number]) => {
      const params = buildSearchIntentParams(searchParams, {
        location: search.location,
        vibe: readSearchIntentState(new URLSearchParams(searchParamsString))
          .vibeInput,
        selectedLocation: search.coords
          ? {
              lat: search.coords.lat,
              lng: search.coords.lng,
              bounds: search.coords.bounds,
            }
          : null,
      });
      // CFM-604: canonical-on-write guarantee — must go through buildCanonicalSearchUrl.
      router.push(
        buildCanonicalSearchUrl(normalizeSearchQuery(params))
      );
      onClose();
    },
    [onClose, recentSearches, router, searchParams, searchParamsString]
  );

  // Portal to document.body to escape the <header>'s stacking context (z-[1100]).
  // Without this, the overlay's z-[1200] is relative to the header context,
  // not the document root — map and bottom sheet bleed through.
  if (typeof document === "undefined") return null;

  return createPortal(
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {isOpen && (
          <m.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={reducedMotion ? { duration: 0 } : { type: "spring", damping: 25, stiffness: 300, mass: 0.8 }}
            className="fixed inset-0 z-[1200] bg-surface-container-lowest flex flex-col"
            data-testid="mobile-search-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
          >
            <FocusTrap active={isOpen} initialFocusRef={locationInputRef}>
              {/* Header — back arrow + title */}
              <div className="flex items-center gap-3 px-4 pt-3 pb-3 border-b border-outline-variant/20">
                <button
                  onClick={onClose}
                  className="flex-shrink-0 p-2 -ml-2 rounded-full hover:bg-surface-container-high transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Back to results"
                >
                  <ArrowLeft className="w-5 h-5 text-on-surface" />
                </button>
                <m.span 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={reducedMotion ? { duration: 0 } : { delay: 0.1, duration: 0.3 }}
                  className="text-base font-semibold text-on-surface"
                >
                  Search
                </m.span>
              </div>

              {/* Form fields */}
              <m.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reducedMotion ? { duration: 0 } : { delay: 0.15, duration: 0.4, ease: "easeOut" }}
                className="flex-1 overflow-y-auto hide-scrollbar-mobile"
              >
                <div className="px-5 pt-6 pb-4 space-y-5">
                  {/* WHERE */}
                  <div>
                    <label
                      htmlFor="mobile-search-where"
                      className="block text-xs font-bold uppercase tracking-[0.15em] text-on-surface-variant mb-2"
                    >
                      Where
                    </label>
                    <div className="relative">
                      <LocationSearchInput
                        id="mobile-search-where"
                        value={location}
                        inputRef={locationInputRef}
                        autoFocus={isOpen}
                        onChange={(nextLocation) => {
                          setLocation(nextLocation);
                          setLocationCoords(null);
                        }}
                        onLocationSelect={handleLocationSelect}
                        fallbackItems={locationFallbackItems}
                        placeholder="Enter city or area"
                        className="w-full h-12 rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 pr-11 focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/30"
                        inputClassName="text-base text-on-surface placeholder:text-on-surface-variant"
                      />
                      <LocateFixed className="absolute right-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                    </div>
                  </div>

                  {/* BUDGET */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-[0.15em] text-on-surface-variant mb-2">
                      Budget
                    </label>
                    <div className="flex items-center gap-2 border border-outline-variant/30 rounded-xl px-4 h-12">
                      <span className="text-on-surface-variant text-sm">$</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value)}
                        placeholder="Min"
                        aria-label="Minimum budget"
                        className="flex-1 h-full bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-on-surface-variant text-xs">—</span>
                      <span className="text-on-surface-variant text-sm">$</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(e.target.value)}
                        placeholder="Max"
                        aria-label="Maximum budget"
                        className="flex-1 h-full bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>

                  {/* Filters button */}
                  <button
                    type="button"
                    onClick={() => {
                      onOpenFilters?.();
                    }}
                    className="relative flex items-center gap-2.5 w-full h-12 px-4 border border-outline-variant/30 rounded-xl text-sm font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors"
                  >
                    <SlidersHorizontal className="w-4.5 h-4.5" />
                    <span>Filters</span>
                    {activeFilterCount > 0 && (
                      <span className="ml-auto flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-[11px] font-bold rounded-full bg-on-surface text-surface-container-lowest">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>

                  {/* SEARCH button */}
                  <button
                    type="button"
                    onClick={handleSearch}
                    className="flex items-center justify-center gap-2.5 w-full h-13 py-3.5 bg-primary hover:bg-primary/90 text-on-primary rounded-full text-base font-semibold shadow-ambient shadow-primary/20 transition-colors active:scale-[0.98]"
                  >
                    <Search className="w-5 h-5" />
                    <span className="uppercase tracking-wider text-sm">
                      Search
                    </span>
                  </button>
                </div>

                {/* Divider */}
                <div className="h-px bg-outline-variant/20 mx-5" />

                {/* Recent searches */}
                <div className="px-5 pt-5 pb-8">
                  {recentSearches.length > 0 ? (
                    <>
                      <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-[0.15em] mb-3">
                        Recent searches
                      </h3>
                      <ul className="space-y-0.5">
                        {recentSearches.map((search) => {
                          const displayText = formatSearch(search);
                          return (
                            <li key={search.id} className="flex items-center">
                              <button
                                onClick={() => handleRecentClick(search)}
                                className="flex-1 flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-surface-canvas transition-colors text-left"
                              >
                                <Clock className="w-4 h-4 text-on-surface-variant flex-shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-on-surface truncate">
                                    {search.location}
                                  </div>
                                  {displayText !== search.location && (
                                    <div className="text-xs text-on-surface-variant truncate">
                                      {displayText}
                                    </div>
                                  )}
                                </div>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeRecentSearch(search.id);
                                }}
                                className="p-2 rounded-full hover:bg-surface-container-high transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                                aria-label={`Remove ${search.location}`}
                              >
                                <X className="w-3.5 h-3.5 text-on-surface-variant" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : (
                    <p className="text-center text-sm text-on-surface-variant mt-4">
                      Your recent searches will appear here
                    </p>
                  )}
                </div>
              </m.div>
            </FocusTrap>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>,
    document.body
  );
}
