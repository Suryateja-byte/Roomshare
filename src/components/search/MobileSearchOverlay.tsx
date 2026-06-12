"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LazyMotion,
  domAnimation,
  m,
  AnimatePresence,
  useReducedMotion,
} from "framer-motion";
import { ArrowLeft, Clock, X, SlidersHorizontal } from "lucide-react";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { FocusTrap } from "@/components/ui/FocusTrap";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { urlToFilterChips } from "@/components/filters/filter-chip-utils";
import {
  buildSearchIntentParams,
  readSearchIntentState,
} from "@/lib/search/search-intent";
import {
  buildCanonicalSearchUrl,
  normalizeSearchQuery,
} from "@/lib/search/search-query";
import {
  SearchBar,
  useSearchBarState,
  useSearchSubmit,
} from "@/components/search/SearchBar";

interface MobileSearchOverlayProps {
  /** Whether the overlay is open */
  isOpen: boolean;
  /** Close the overlay */
  onClose: () => void;
  /** Open the filter modal (handled by parent) */
  onOpenFilters?: () => void;
}

/**
 * Full-screen search overlay for mobile (Airbnb pattern).
 *
 * Slides up from bottom when the collapsed search pill is tapped. The form is
 * the shared SearchBar in stacked layout (same field components as the home
 * hero and desktop header — ids prefixed because the hidden desktop header
 * form stays mounted in the DOM on mobile), followed by recent searches.
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
  const { recentSearches, removeRecentSearch, formatSearch } =
    useRecentSearches();

  const state = useSearchBarState();
  const { handleSubmit, isSearching, isResolvingTypedLocation } =
    useSearchSubmit({
      state,
      onBeforeNavigate: onClose,
    });

  // Count active filters for badge
  const activeFilterCount = urlToFilterChips(searchParams).filter(
    (c) =>
      c.paramKey !== "price-range" &&
      c.paramKey !== "minPrice" &&
      c.paramKey !== "maxPrice" &&
      c.paramKey !== "q"
  ).length;

  // Discard stale edits each time the overlay opens.
  const wasOpenRef = useRef(false);
  const resetFromUrlRef = useRef(state.resetFromUrl);
  resetFromUrlRef.current = state.resetFromUrl;
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      resetFromUrlRef.current();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const focusLocationInput = () => {
      if (
        state.locationInputRef.current &&
        document.activeElement !== state.locationInputRef.current
      ) {
        state.locationInputRef.current.focus();
      }
    };

    const rafId = window.requestAnimationFrame(focusLocationInput);
    const timer = window.setTimeout(focusLocationInput, 250);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref identity is stable
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
      router.push(buildCanonicalSearchUrl(normalizeSearchQuery(params)));
      onClose();
    },
    [onClose, recentSearches, router, searchParams, searchParamsString]
  );

  const filtersButton = (
    <button
      type="button"
      onClick={() => {
        onOpenFilters?.();
      }}
      className="relative flex h-12 w-full items-center gap-2.5 rounded-xl border border-outline-variant/30 px-4 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high"
    >
      <SlidersHorizontal className="h-4.5 w-4.5" />
      <span>Filters</span>
      {activeFilterCount > 0 && (
        <span className="ml-auto flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-on-surface px-1.5 text-[11px] font-bold text-surface-container-lowest">
          {activeFilterCount}
        </span>
      )}
    </button>
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
            transition={
              reducedMotion
                ? { duration: 0 }
                : { type: "spring", damping: 25, stiffness: 300, mass: 0.8 }
            }
            className="fixed inset-0 z-[1200] bg-surface-container-lowest flex flex-col"
            data-testid="mobile-search-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
          >
            <FocusTrap active={isOpen} initialFocusRef={state.locationInputRef}>
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
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { delay: 0.1, duration: 0.3 }
                  }
                  className="text-base font-semibold text-on-surface"
                >
                  Search
                </m.span>
              </div>

              {/* Form fields — the shared SearchBar, stacked */}
              <m.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { delay: 0.15, duration: 0.4, ease: "easeOut" }
                }
                className="flex-1 overflow-y-auto hide-scrollbar-mobile"
              >
                <div className="px-5 pt-6 pb-4">
                  <SearchBar
                    state={state}
                    onSubmit={handleSubmit}
                    isSearching={isSearching}
                    submitDisabled={isResolvingTypedLocation}
                    layout="stacked"
                    idPrefix="mobile-"
                    trailingSlot={filtersButton}
                  />
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
