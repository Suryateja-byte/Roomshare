"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";
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
  const locationInputRef = useRef<HTMLInputElement>(null);
  const { recentSearches, removeRecentSearch, formatSearch } =
    useRecentSearches();

  // Form state — initialized from current URL params
  const [location, setLocation] = useState("");
  const [locationCoords, setLocationCoords] = useState<{
    lat: number;
    lng: number;
    bounds?: [number, number, number, number];
  } | null>(null);
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
      setLocation(searchParams.get("q") || "");
      setMinPrice(searchParams.get("minPrice") || "");
      setMaxPrice(searchParams.get("maxPrice") || "");
      setLocationCoords(null);

      // Auto-focus location input after animation
      const timer = setTimeout(() => locationInputRef.current?.focus(), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, searchParams]);

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
    (loc: { name: string; lat: number; lng: number; bounds?: [number, number, number, number] }) => {
      setLocation(loc.name);
      setLocationCoords({ lat: loc.lat, lng: loc.lng, bounds: loc.bounds });
    },
    []
  );

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());

    // Update location
    if (location) {
      params.set("q", location);
    } else {
      params.delete("q");
    }

    // Update coordinates from location selection
    if (locationCoords) {
      params.set("lat", String(locationCoords.lat));
      params.set("lng", String(locationCoords.lng));
      if (locationCoords.bounds) {
        params.set("minLng", String(locationCoords.bounds[0]));
        params.set("minLat", String(locationCoords.bounds[1]));
        params.set("maxLng", String(locationCoords.bounds[2]));
        params.set("maxLat", String(locationCoords.bounds[3]));
      }
    }

    // Update price
    if (minPrice) {
      params.set("minPrice", minPrice);
    } else {
      params.delete("minPrice");
    }
    if (maxPrice) {
      params.set("maxPrice", maxPrice);
    } else {
      params.delete("maxPrice");
    }

    // Reset pagination
    params.delete("cursor");
    params.delete("page");

    router.push(`/search?${params.toString()}`);
    onClose();
  }, [searchParams, location, locationCoords, minPrice, maxPrice, router, onClose]);

  const handleRecentClick = useCallback(
    (recentLocation: string) => {
      // Navigate directly with the recent search location
      const params = new URLSearchParams();
      params.set("q", recentLocation);
      router.push(`/search?${params.toString()}`);
      onClose();
    },
    [router, onClose]
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
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              className="fixed inset-0 z-[1200] bg-surface-container-lowest flex flex-col md:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Search"
            >
              <FocusTrap active={isOpen}>
                {/* Header — back arrow + title */}
                <div className="flex items-center gap-3 px-4 pt-3 pb-3 border-b border-outline-variant/20">
                  <button
                    onClick={onClose}
                    className="flex-shrink-0 p-2 -ml-2 rounded-full hover:bg-surface-container-high transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="Back to results"
                  >
                    <ArrowLeft className="w-5 h-5 text-on-surface" />
                  </button>
                  <span className="text-base font-semibold text-on-surface">
                    Search
                  </span>
                </div>

                {/* Form fields */}
                <div className="flex-1 overflow-y-auto">
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
                          onChange={setLocation}
                          onLocationSelect={handleLocationSelect}
                          placeholder="Enter city or area"
                          className="w-full h-12 px-4 pr-10 bg-surface-container-lowest border border-outline-variant/30 rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30"
                        />
                        <LocateFixed className="absolute right-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-on-surface-variant pointer-events-none" />
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
                          className="flex-1 h-full bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                          className="flex-1 h-full bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </div>

                    {/* Filters button */}
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
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
                      className="flex items-center justify-center gap-2.5 w-full h-13 py-3.5 bg-primary hover:bg-primary/90 text-on-primary rounded-full text-base font-semibold shadow-lg shadow-primary/20 transition-colors active:scale-[0.98]"
                    >
                      <Search className="w-5 h-5" />
                      <span className="uppercase tracking-wider text-sm">Search</span>
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
                                  onClick={() =>
                                    handleRecentClick(search.location)
                                  }
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
                </div>
              </FocusTrap>
            </m.div>
          )}
        </AnimatePresence>
      </LazyMotion>,
    document.body
  );
}
