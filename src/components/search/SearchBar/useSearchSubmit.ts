"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { safeMark } from "@/lib/perf";
import { useSearchTransitionSafe } from "@/contexts/SearchTransitionContext";
import {
  parseNaturalLanguageQuery,
  nlQueryToSearchParams,
} from "@/lib/search/natural-language-parser";
import { buildSearchIntentParams } from "@/lib/search/search-intent";
import {
  applySearchQueryChange,
  buildCanonicalSearchUrl,
  normalizeSearchQuery,
  serializeSearchQuery,
  type NormalizedSearchQuery,
} from "@/lib/search/search-query";
import { resolveTypedSearchLocation } from "@/lib/search/typed-location-resolver";
import { dispatchMapFlyTo } from "@/lib/search/map-fly-to";
import { normalizePriceRange } from "@/lib/search/price-input";
import type { RecentSearchFilters } from "@/hooks/useRecentSearches";
import type { SearchBarState } from "./useSearchBarState";

export interface UseSearchSubmitOptions {
  state: SearchBarState;
  /**
   * Home overlays its full pending-filter patch; header/overlay default to a
   * price-only patch read live from the budget input refs (the live read is
   * what avoids the flushSync-on-blur focus-steal hazard).
   */
  buildFilterPatch?: () => Partial<NormalizedSearchQuery>;
  /** Override the filters recorded with a recent search (home: pending state). */
  buildRecentFilters?: () => Partial<RecentSearchFilters> | undefined;
  /** Home only: parse "quiet room under $1500" style queries into filters. */
  enableNlParsing?: boolean;
  /** Home passes 300 (existing debounce contract); others navigate immediately. */
  debounceMs?: number;
  /** Runs as soon as a navigation is committed to (home closes its drawer). */
  onSubmitStart?: () => void;
  /** Runs right before navigation (header collapses editor; overlay closes). */
  onBeforeNavigate?: () => void;
}

export interface UseSearchSubmitReturn {
  handleSubmit: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  isSearching: boolean;
  isResolvingTypedLocation: boolean;
}

export function useSearchSubmit({
  state,
  buildFilterPatch,
  buildRecentFilters,
  enableNlParsing = false,
  debounceMs = 0,
  onSubmitStart,
  onBeforeNavigate,
}: UseSearchSubmitOptions): UseSearchSubmitReturn {
  const router = useRouter();
  const transitionContext = useSearchTransitionSafe();

  const [isSearching, setIsSearching] = useState(false);
  const [isResolvingTypedLocation, setIsResolvingTypedLocation] =
    useState(false);
  // Ref mirrors for stable callback identity (reading state in the callback
  // would force it into the deps and churn the form's onSubmit identity).
  const isSearchingRef = useRef(false);
  const isResolvingRef = useRef(false);
  const lastSearchRef = useRef<string>("");
  const navigationVersionRef = useRef(0);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetSearchingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    isSearchingRef.current = isSearching;
  }, [isSearching]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (resetSearchingTimeoutRef.current) {
        clearTimeout(resetSearchingTimeoutRef.current);
      }
    };
  }, []);

  const navigate = useCallback(
    (url: string) => {
      if (transitionContext) {
        transitionContext.navigateWithTransition(url, {
          reason: "search-submit",
        });
      } else {
        router.push(url);
      }
    },
    [router, transitionContext]
  );

  const stateRef = useRef(state);
  stateRef.current = state;
  const optionsRef = useRef({
    buildFilterPatch,
    buildRecentFilters,
    onSubmitStart,
    onBeforeNavigate,
  });
  optionsRef.current = {
    buildFilterPatch,
    buildRecentFilters,
    onSubmitStart,
    onBeforeNavigate,
  };

  const runSubmit = useCallback(async () => {
    const s = stateRef.current;
    const opts = optionsRef.current;
    // Consume the selection-time fly-to marker up front so an early return
    // can't leak it into an unrelated later submit.
    const flyToAlreadyDispatched = s.skipNextSubmitFlyToRef.current;
    s.skipNextSubmitFlyToRef.current = false;

    const trimmedLocation = s.location.trim();
    const trimmedWhat = s.what.trim();

    // Natural-language branch: structured filters typed into the location box
    // ("quiet room under $1500") parse into filter params and navigate directly.
    if (enableNlParsing && trimmedLocation && !s.selectedLocation) {
      const nlParsed = parseNaturalLanguageQuery(trimmedLocation);
      if (nlParsed) {
        const currentQuery = normalizeSearchQuery(
          new URLSearchParams(s.searchParamsString)
        );
        const current = serializeSearchQuery(
          applySearchQueryChange(
            currentQuery,
            "filter",
            opts.buildFilterPatch ? opts.buildFilterPatch() : {}
          )
        );
        const nlParams = nlQueryToSearchParams(nlParsed);

        // Overlay NLP-extracted params onto current state (NLP wins on conflict)
        for (const [key, value] of nlParams.entries()) {
          if (key === "amenities" || key === "houseRules") {
            const existing = current.get(key);
            if (existing) {
              const merged = new Set([
                ...existing.split(","),
                ...value.split(","),
              ]);
              current.set(key, [...merged].join(","));
            } else {
              current.set(key, value);
            }
          } else {
            current.set(key, value);
          }
        }

        current.delete("page");
        current.delete("cursor");
        current.delete("cursorStack");
        current.delete("pageNumber");

        setIsSearching(true);
        opts.onSubmitStart?.();
        // CFM-604: canonical-on-write guarantee — must go through buildCanonicalSearchUrl.
        const searchUrl = buildCanonicalSearchUrl(
          normalizeSearchQuery(current)
        );
        opts.onBeforeNavigate?.();
        navigate(searchUrl);
        // Reset isSearching like the main commit() path does. Today the home
        // tree unmounts on navigate (NL parsing is home-only), but don't leave
        // the orb stuck if the route ever stays mounted across the transition.
        if (resetSearchingTimeoutRef.current) {
          clearTimeout(resetSearchingTimeoutRef.current);
        }
        resetSearchingTimeoutRef.current = setTimeout(
          () => setIsSearching(false),
          500
        );
        return;
      }
    }

    // Typed-but-not-selected location: resolve it instead of refusing (the
    // forgiving header behavior, unified everywhere). Bare submits with a
    // short/no location skip this and fall through to bounds preservation.
    let nextLocationLabel = trimmedLocation;
    let nextSelectedLocation = s.selectedLocation;
    let resolvedThisSubmit = false;

    if (trimmedLocation.length > 2 && !nextSelectedLocation) {
      if (isResolvingRef.current) return;
      isResolvingRef.current = true;
      setIsResolvingTypedLocation(true);
      try {
        const resolvedLocation = await resolveTypedSearchLocation(
          trimmedLocation
        );
        if (!resolvedLocation) {
          toast.error("Select a location from the dropdown suggestions.");
          s.locationInputRef.current?.focus();
          return;
        }
        nextLocationLabel = resolvedLocation.label;
        nextSelectedLocation = resolvedLocation.selection;
        resolvedThisSubmit = true;
        s.isUserTypingLocationRef.current = false;
        s.setLocation(resolvedLocation.label);
        s.setSelectedLocation(resolvedLocation.selection);
      } finally {
        isResolvingRef.current = false;
        setIsResolvingTypedLocation(false);
      }
    }

    const currentQuery = normalizeSearchQuery(
      new URLSearchParams(s.searchParamsString)
    );
    const intentQuery = normalizeSearchQuery(
      buildSearchIntentParams(new URLSearchParams(s.searchParamsString), {
        location: nextLocationLabel,
        vibe: trimmedWhat,
        selectedLocation: nextSelectedLocation,
      })
    );
    // Empty-everything submit keeps the current map bounds instead of
    // resetting the search area (prevents surprise jumps; safer for the DB).
    if (
      !nextSelectedLocation &&
      nextLocationLabel.length === 0 &&
      trimmedWhat.length === 0
    ) {
      intentQuery.bounds = currentQuery.bounds;
    }

    const patch = opts.buildFilterPatch
      ? opts.buildFilterPatch()
      : (() => {
          const liveMin =
            s.minPriceInputRef.current?.value ?? s.minPrice;
          const liveMax =
            s.maxPriceInputRef.current?.value ?? s.maxPrice;
          const { minPrice, maxPrice } = normalizePriceRange(liveMin, liveMax);
          return {
            minPrice: minPrice ?? undefined,
            maxPrice: maxPrice ?? undefined,
          };
        })();

    // CFM-604: canonical-on-write guarantee — must go through buildCanonicalSearchUrl.
    const searchUrl = buildCanonicalSearchUrl(
      applySearchQueryChange(intentQuery, "filter", patch)
    );

    // Prevent duplicate searches (same URL within the debounce window).
    // Checked BEFORE cancelling any pending debounced navigation — clearing
    // first and then returning here would swallow the in-flight search
    // entirely and leave isSearching stuck (latent SearchForm bug).
    if (searchUrl === lastSearchRef.current && isSearchingRef.current) {
      return;
    }

    // Invalidate any in-flight debounced navigation for a DIFFERENT search.
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    navigationVersionRef.current++;

    safeMark("search-submit");
    setIsSearching(true);
    lastSearchRef.current = searchUrl;

    if (nextLocationLabel) {
      const recentFilters = opts.buildRecentFilters
        ? opts.buildRecentFilters()
        : defaultRecentFilters(patch, currentQuery);
      s.saveRecentSearch(
        nextLocationLabel,
        nextSelectedLocation || undefined,
        recentFilters && Object.keys(recentFilters).length > 0
          ? recentFilters
          : undefined
      );
    }

    // Fly the persistent map. Selection-time dispatch already covered the
    // auto-submit path; resolution and re-submit paths dispatch here.
    if (nextSelectedLocation && (resolvedThisSubmit || !flyToAlreadyDispatched)) {
      dispatchMapFlyTo({
        lat: nextSelectedLocation.lat,
        lng: nextSelectedLocation.lng,
        bbox: nextSelectedLocation.bounds,
        zoom: 13,
      });
    }

    opts.onSubmitStart?.();

    const capturedVersion = navigationVersionRef.current;
    const commit = () => {
      // A newer search supersedes this navigation.
      if (navigationVersionRef.current !== capturedVersion) return;
      optionsRef.current.onBeforeNavigate?.();
      navigate(searchUrl);
      if (resetSearchingTimeoutRef.current) {
        clearTimeout(resetSearchingTimeoutRef.current);
      }
      resetSearchingTimeoutRef.current = setTimeout(
        () => setIsSearching(false),
        500
      );
    };

    if (debounceMs > 0) {
      searchTimeoutRef.current = setTimeout(commit, debounceMs);
    } else {
      commit();
    }
  }, [debounceMs, enableNlParsing, navigate]);

  const handleSubmit = useCallback(
    (event: React.SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      void runSubmit();
    },
    [runSubmit]
  );

  return { handleSubmit, isSearching, isResolvingTypedLocation };
}

/**
 * Recents are recorded on every surface; when the caller doesn't supply
 * pending-filter state (header/overlay), reconstruct the display filters from
 * the submit patch plus the committed URL state.
 */
function defaultRecentFilters(
  patch: Partial<NormalizedSearchQuery>,
  currentQuery: NormalizedSearchQuery
): Partial<RecentSearchFilters> | undefined {
  const filters: Partial<RecentSearchFilters> = {};
  const minPrice = patch.minPrice ?? currentQuery.minPrice;
  const maxPrice = patch.maxPrice ?? currentQuery.maxPrice;
  if (minPrice !== undefined) filters.minPrice = String(minPrice);
  if (maxPrice !== undefined) filters.maxPrice = String(maxPrice);
  if (currentQuery.roomType) filters.roomType = currentQuery.roomType;
  if (currentQuery.leaseDuration) {
    filters.leaseDuration = currentQuery.leaseDuration;
  }
  if (currentQuery.amenities && currentQuery.amenities.length > 0) {
    filters.amenities = currentQuery.amenities;
  }
  if (currentQuery.houseRules && currentQuery.houseRules.length > 0) {
    filters.houseRules = currentQuery.houseRules;
  }
  return Object.keys(filters).length > 0 ? filters : undefined;
}
