"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  startTransition,
} from "react";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Clock,
  Loader2,
  SlidersHorizontal,
  LocateFixed,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import LocationSearchInput from "@/components/LocationSearchInput";
import {
  SUPPORTED_LANGUAGES,
  getLanguageName,
  type LanguageCode,
} from "@/lib/languages";
import FilterModal from "@/components/search/FilterModal";
import {
  parseNaturalLanguageQuery,
  nlQueryToSearchParams,
} from "@/lib/search/natural-language-parser";
import { safeMark } from "@/lib/perf";
// Import canonical allowlists from shared parsing module
import { VALID_AMENITIES, VALID_HOUSE_RULES } from "@/lib/search-params";
import { clearAllFilters } from "@/components/filters/filter-chip-utils";
import { useSearchTransitionSafe } from "@/contexts/SearchTransitionContext";
import { useMobileSearch } from "@/contexts/MobileSearchContext";
import { cn } from "@/lib/utils";
import {
  useRecentSearches,
  type RecentSearch,
  type RecentSearchFilters,
} from "@/hooks/useRecentSearches";
import { useDebouncedFilterCount } from "@/hooks/useDebouncedFilterCount";
import { useFacets } from "@/hooks/useFacets";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import {
  useBatchedFilters,
  type BatchedFilterValues,
} from "@/hooks/useBatchedFilters";
import { pendingToFilterParams } from "@/lib/pending-to-filter-params";
import {
  generateFilterSuggestions,
  type FilterSuggestion,
} from "@/lib/near-matches";

// Debounce delay in milliseconds
const SEARCH_DEBOUNCE_MS = 300;

// Alias for FilterModal props
const AMENITY_OPTIONS = VALID_AMENITIES;
const HOUSE_RULE_OPTIONS = VALID_HOUSE_RULES;

const ARRAY_PENDING_KEYS = new Set<keyof BatchedFilterValues>([
  "amenities",
  "houseRules",
  "languages",
]);

const SUGGESTION_TYPE_TO_PENDING_KEYS: Record<
  FilterSuggestion["type"],
  Array<keyof BatchedFilterValues>
> = {
  price: ["minPrice", "maxPrice"],
  date: ["moveInDate"],
  roomType: ["roomType"],
  amenities: ["amenities"],
  leaseDuration: ["leaseDuration"],
};

/**
 * Validate a move-in date string. Returns the date if valid (today or future, within 2 years),
 * otherwise returns empty string. This matches the server-side safeParseDate logic.
 */
const validateMoveInDate = (value: string | null): string => {
  if (!value) return "";
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "";

  const [yearStr, monthStr, dayStr] = trimmed.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) return "";
  if (day < 1 || day > 31) return "";

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "";
  }

  // Reject past dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) return "";

  // Reject dates more than 2 years in the future
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 2);
  if (date > maxDate) return "";

  return trimmed;
};

// Custom event for map fly-to
export const MAP_FLY_TO_EVENT = "mapFlyToLocation";

export interface MapFlyToEventDetail {
  lat: number;
  lng: number;
  bbox?: [number, number, number, number];
  zoom?: number;
}

export default function SearchForm({
  variant = "default",
}: {
  variant?: "default" | "compact" | "home";
}) {
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement | null>(null);
  const parseCoords = () => {
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    if (!lat || !lng) return null;
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      return null;
    }
    return { lat: parsedLat, lng: parsedLng };
  };
  const [location, setLocation] = useState(
    searchParams.get("what") ? "" : searchParams.get("q") || ""
  );
  // Show "What" field when semantic search env var is set.
  // Uses NEXT_PUBLIC_ prefix so it's available in client components.
  // Falls back to checking if the "what" param exists in URL (field was previously shown).
  const semanticSearchEnabled =
    process.env.NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH === "true" ||
    !!searchParams.get("what");
  const [whatQuery, setWhatQuery] = useState(searchParams.get("what") || "");
  // Focus-triggered flex expansion: tracks which field is focused to animate flex ratios.
  // Focused field expands (flex-[3.5]) while others shrink (flex-[0.5-0.8]).
  const [focusedField, setFocusedField] = useState<
    "what" | "where" | "budget" | null
  >(null);
  const focusBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  // Debounced blur to prevent flicker when focus moves between fields
  const handleFieldFocus = useCallback((field: "what" | "where" | "budget") => {
    if (focusBlurTimeoutRef.current) clearTimeout(focusBlurTimeoutRef.current);
    setFocusedField(field);
  }, []);
  const handleFieldBlur = useCallback(() => {
    focusBlurTimeoutRef.current = setTimeout(() => setFocusedField(null), 150);
  }, []);
  // Track when user is actively typing in location input to prevent URL sync from clearing their text.
  // The chain: typing 3 chars → warning banner renders → header resize → map moveEnd → URL change → sync effect clears input.
  const isUserTypingLocationRef = useRef(false);
  // Batched filter state — single hook manages pending vs committed
  const [showFilters, setShowFilters] = useState(false);

  const {
    pending,
    isDirty: filtersDirty,
    setPending,
    commit: commitFilters,
    committed,
  } = useBatchedFilters({ isDrawerOpen: showFilters });
  // Destructure for convenient access (read-only aliases)
  const {
    minPrice,
    maxPrice,
    moveInDate,
    leaseDuration,
    roomType,
    amenities,
    houseRules,
    languages,
    genderPreference,
    householdGender,
    minSlots,
  } = pending;

  const [selectedCoords, setSelectedCoords] = useState<{
    lat: number;
    lng: number;
    bbox?: [number, number, number, number];
  } | null>(parseCoords);
  const [geoLoading, setGeoLoading] = useState(false);

  const [hasMounted, setHasMounted] = useState(false);

  // Language search filter state
  const [languageSearch, setLanguageSearch] = useState("");

  // P2-9 FIX: Reset language search text when filter drawer closes.
  // Without this, typing "Spa" in language search, closing the drawer,
  // then reopening would show "Spa" still filtering the language list.
  // Uses useEffect instead of adding resets to each close handler
  // to catch ALL close paths (onClose, onApply, Escape key, future paths).
  useEffect(() => {
    if (!showFilters) {
      setLanguageSearch("");
    }
  }, [showFilters]);

  // Get all language codes from canonical list
  const LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGES) as LanguageCode[];

  // Filter languages based on search
  const filteredLanguages = useMemo(() => {
    if (!languageSearch.trim()) return LANGUAGE_CODES;
    const search = languageSearch.toLowerCase();
    return LANGUAGE_CODES.filter(
      (code) =>
        getLanguageName(code).toLowerCase().includes(search) ||
        code.toLowerCase().includes(search)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional dependency omission to prevent infinite loops
  }, [languageSearch]);

  // Debounce and submission state to prevent race conditions
  const [isSearching, setIsSearching] = useState(false);
  // H4 FIX: Ref mirror of isSearching for stable handleSearch callback identity.
  // Reading from ref inside the callback avoids isSearching in useCallback deps.
  const isSearchingRef = useRef(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSearchRef = useRef<string>(""); // Track last search to prevent duplicates
  // Navigation version counter - ensures only the latest search executes navigation
  // Incremented on each new search to invalidate stale timeout callbacks
  const navigationVersionRef = useRef(0);
  // Track the isSearching reset timeout so it can be cleaned up on unmount
  const resetSearchingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // H4 FIX: Sync ref with state so handleSearch reads current value without dep
  useEffect(() => {
    isSearchingRef.current = isSearching;
  }, [isSearching]);

  // Recent searches from canonical hook (handles localStorage, migration, enhanced format)
  const { recentSearches, saveRecentSearch, clearRecentSearches } =
    useRecentSearches();
  const [showRecentSearches, setShowRecentSearches] = useState(false);

  // Select a recent search
  const selectRecentSearch = useCallback((search: RecentSearch) => {
    setLocation(search.location);
    if (search.coords) {
      setSelectedCoords(search.coords);
    }
    setShowRecentSearches(false);
  }, []);

  // Set hasMounted after initial render and validate moveInDate
  // Intentionally run-once ([] deps): mount-time validation of URL params and
  // one-time cleanup of stale moveInDate. Re-running on searchParams/moveInDate
  // changes would fight the URL sync effect in useBatchedFilters.
  useEffect(() => {
    setHasMounted(true);
    // Validate moveInDate on mount to clear invalid past dates
    const rawMoveInDate = searchParams.get("moveInDate");
    const validated = validateMoveInDate(rawMoveInDate);
    if (validated !== moveInDate) {
      setPending({ moveInDate: validated });
    }
    // Strip invalid moveInDate from URL so the sync effect in
    // useBatchedFilters doesn't re-override the cleanup from committed state
    if (rawMoveInDate && !validated) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("moveInDate");
      const qs = params.toString();
      router.replace(`${window.location.pathname}${qs ? `?${qs}` : ""}`, {
        scroll: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync non-filter state (location, coords) with URL when it changes
  // Filter state sync is handled by useBatchedFilters internally
  useEffect(() => {
    const coords = parseCoords();
    if (coords) {
      setSelectedCoords(coords);
    }
    // Don't overwrite user's in-progress typing with URL state.
    // Resize-triggered map moveEnd can delete `q` from URL while user is still typing.
    if (!isUserTypingLocationRef.current) {
      // When `what` param is present, `q` contains semantic text — don't copy it into location
      if (!searchParams.get("what")) {
        setLocation(searchParams.get("q") || "");
      }
    }
    // Keep whatQuery in sync with URL
    setWhatQuery(searchParams.get("what") || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parseCoords is stable; including it would cause infinite re-renders
  }, [searchParams]);

  const router = useRouter();
  const transitionContext = useSearchTransitionSafe();
  const { registerOpenFilters } = useMobileSearch();

  // Register mobile "open filters" callback for the collapsed search bar.
  useEffect(() => {
    registerOpenFilters(() => setShowFilters(true));
  }, [registerOpenFilters]);

  const handleLocationSelect = (locationData: {
    name: string;
    lat: number;
    lng: number;
    bbox?: [number, number, number, number];
  }) => {
    // flushSync ensures selectedCoords is committed before requestSubmit reads it
    flushSync(() => {
      setSelectedCoords({
        lat: locationData.lat,
        lng: locationData.lng,
        bbox: locationData.bbox,
      });
    });

    // Dispatch custom event for map to fly to location
    const event = new CustomEvent<MapFlyToEventDetail>(MAP_FLY_TO_EVENT, {
      detail: {
        lat: locationData.lat,
        lng: locationData.lng,
        bbox: locationData.bbox,
        zoom: 13,
      },
    });
    window.dispatchEvent(event);

    // Submit the form to trigger search with new coords
    formRef.current?.requestSubmit();
  };

  // Stale closure note: geoLoading is captured at callback creation time, but
  // the `disabled={geoLoading}` prop on the button prevents re-entry while
  // a geolocation request is in flight, so stale geoLoading is safe here.
  const handleUseMyLocation = useCallback(() => {
    if (geoLoading) return;
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        flushSync(() => {
          setLocation("");
          setSelectedCoords({ lat, lng });
        });
        window.dispatchEvent(
          new CustomEvent<MapFlyToEventDetail>(MAP_FLY_TO_EVENT, {
            detail: { lat, lng, zoom: 13 },
          })
        );
        setGeoLoading(false);
        // Submit the form to trigger search with new coords
        formRef.current?.requestSubmit();
      },
      (error) => {
        setGeoLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            toast.error(
              "Location permission denied. Enable it in browser settings."
            );
            break;
          case error.POSITION_UNAVAILABLE:
            toast.error("Unable to determine your location.");
            break;
          case error.TIMEOUT:
            toast.error("Location request timed out. Try again.");
            break;
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geoLoading is read-only within callback; including it would cause re-creation on every state change
  }, []);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      // Try natural language parsing: if the input contains structured filters
      // (price, room type, amenities, etc.), parse and redirect with those params
      const trimmedLocation = location.trim();
      const nlParsed = trimmedLocation
        ? parseNaturalLanguageQuery(trimmedLocation)
        : null;
      if (nlParsed && !selectedCoords) {
        // NL query detected — merge parsed filters with existing URL state.
        // Start from current params (preserves filter modal state), then overlay NLP extractions.
        const current = new URLSearchParams(searchParams.toString());
        const nlParams = nlQueryToSearchParams(nlParsed);

        // Overlay NLP-extracted params onto current state (NLP wins on conflict)
        for (const [key, value] of nlParams.entries()) {
          if (key === "amenities" || key === "houseRules") {
            // Array params: merge instead of replace
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
            // Scalar params: NLP extraction overwrites
            current.set(key, value);
          }
        }

        // Reset pagination since filters changed
        current.delete("page");
        current.delete("cursor");
        current.delete("cursorStack");
        current.delete("pageNumber");

        setIsSearching(true);
        setShowFilters(false);
        const searchUrl = `/search?${current.toString()}`;
        // STABILIZATION FIX: Use transitionContext for consistency with the normal
        // search path (lines 634-638). Previously used raw startTransition which
        // bypassed SearchTransitionContext, so the loading overlay never appeared
        // during NLP-triggered navigations on the Search Page.
        if (transitionContext) {
          transitionContext.navigateWithTransition(searchUrl);
        } else {
          router.push(searchUrl);
        }
        return;
      }

      // Prevent unbounded searches: if user typed location but didn't select from dropdown,
      // don't submit (this prevents full-table scans on the server)
      if (trimmedLocation.length > 2 && !selectedCoords) {
        // User needs to select a location from dropdown
        // Scroll the warning into view and briefly shake it for emphasis
        const warningEl = document.getElementById("location-warning");
        if (warningEl) {
          warningEl.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
          warningEl.classList.remove("animate-shake");
          // Force reflow to restart animation
          void warningEl.offsetWidth;
          warningEl.classList.add("animate-shake");
        }
        return;
      }

      // Clear any pending search timeout and invalidate any in-flight navigation
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      // Increment navigation version to invalidate any stale timeout callbacks
      // This prevents race conditions when filters change rapidly
      navigationVersionRef.current++;

      // Clone existing URL params to preserve bounds, nearMatches, and sort
      // These are set by the map and should persist across filter changes
      const params = new URLSearchParams(searchParams.toString());

      // Clear pagination params (filters changing = back to page 1)
      params.delete("page");
      params.delete("cursor");
      params.delete("cursorStack");
      params.delete("pageNumber");

      // Clear ALL filter params BEFORE setting new values
      // This prevents stale values from persisting when filters are cleared
      const filterParamsToDelete = [
        "q",
        "what",
        "minPrice",
        "maxPrice",
        "lat",
        "lng",
        "moveInDate",
        "leaseDuration",
        "roomType",
        "amenities",
        "houseRules",
        "languages",
        "genderPreference",
        "householdGender",
      ];
      filterParamsToDelete.forEach((param) => params.delete(param));

      // Clear bounds when a new location was selected from autocomplete
      // This allows the map to fly to and set bounds for the new location
      // (bounds are preserved for filter-only changes to maintain current map view)
      if (selectedCoords) {
        params.delete("minLat");
        params.delete("maxLat");
        params.delete("minLng");
        params.delete("maxLng");
      }

      // Semantic "What" query — when filled, use it as `q` for semantic search
      // and set `what` signal so URL sync knows `q` is semantic, not location.
      // When empty, remove `what` and use location as `q` (existing behavior).
      const trimmedWhat = whatQuery.trim();
      if (trimmedWhat && trimmedWhat.length >= 2) {
        params.set("q", trimmedWhat);
        params.set("what", trimmedWhat);
      } else {
        params.delete("what");
        if (trimmedLocation && trimmedLocation.length >= 2) {
          params.set("q", trimmedLocation);
        }
      }

      // Price validation with auto-swap if inverted
      // IMPORTANT: Use pending.minPrice/maxPrice (primitives) not the full pending object.
      // Inline price inputs write to pending only — modal filters use committed via commitFilters().
      // Using full pending would recreate this callback on every keystroke in any filter input.
      let finalMinPrice = pending.minPrice
        ? parseFloat(pending.minPrice)
        : null;
      let finalMaxPrice = pending.maxPrice
        ? parseFloat(pending.maxPrice)
        : null;

      // EU-D: Guard against NaN from invalid input (e.g., "abc" → NaN)
      if (finalMinPrice !== null && !Number.isFinite(finalMinPrice))
        finalMinPrice = null;
      if (finalMaxPrice !== null && !Number.isFinite(finalMaxPrice))
        finalMaxPrice = null;

      // Enforce non-negative values
      if (finalMinPrice !== null && finalMinPrice < 0) finalMinPrice = 0;
      if (finalMaxPrice !== null && finalMaxPrice < 0) finalMaxPrice = 0;

      // Auto-swap if min > max
      if (
        finalMinPrice !== null &&
        finalMaxPrice !== null &&
        finalMinPrice > finalMaxPrice
      ) {
        [finalMinPrice, finalMaxPrice] = [finalMaxPrice, finalMinPrice];
      }

      if (finalMinPrice !== null)
        params.set("minPrice", finalMinPrice.toString());
      if (finalMaxPrice !== null)
        params.set("maxPrice", finalMaxPrice.toString());

      // Include coordinates if a location was selected from suggestions
      // Only include if location text is not empty (prevents stale coords)
      if (selectedCoords) {
        params.set("lat", selectedCoords.lat.toString());
        params.set("lng", selectedCoords.lng.toString());
      }

      const validatedMoveInDate = validateMoveInDate(committed.moveInDate);
      if (validatedMoveInDate) params.set("moveInDate", validatedMoveInDate);
      if (committed.leaseDuration)
        params.set("leaseDuration", committed.leaseDuration);
      if (committed.roomType) params.set("roomType", committed.roomType);
      if (committed.amenities.length > 0)
        params.set("amenities", committed.amenities.join(","));
      if (committed.houseRules.length > 0)
        params.set("houseRules", committed.houseRules.join(","));
      if (committed.languages.length > 0)
        params.set("languages", committed.languages.join(","));
      if (committed.genderPreference)
        params.set("genderPreference", committed.genderPreference);
      if (committed.householdGender)
        params.set("householdGender", committed.householdGender);

      const searchUrl = `/search?${params.toString()}`;

      // Prevent duplicate searches (same URL within debounce window)
      // H4 FIX: Read from ref instead of closure to avoid isSearching in deps
      if (searchUrl === lastSearchRef.current && isSearchingRef.current) {
        return;
      }

      // Debounce the navigation to prevent race conditions
      safeMark("search-submit");
      setIsSearching(true);
      lastSearchRef.current = searchUrl;

      // Save to recent searches when navigating (with filters for enhanced format)
      if (trimmedLocation) {
        const activeFilters: Partial<RecentSearchFilters> = {};
        if (pending.minPrice) activeFilters.minPrice = pending.minPrice;
        if (pending.maxPrice) activeFilters.maxPrice = pending.maxPrice;
        if (committed.roomType) activeFilters.roomType = committed.roomType;
        if (committed.leaseDuration)
          activeFilters.leaseDuration = committed.leaseDuration;
        if (committed.amenities.length > 0)
          activeFilters.amenities = committed.amenities;
        if (committed.houseRules.length > 0)
          activeFilters.houseRules = committed.houseRules;

        saveRecentSearch(
          trimmedLocation,
          selectedCoords || undefined,
          Object.keys(activeFilters).length > 0 ? activeFilters : undefined
        );
      }

      // Close filter drawer on search
      setShowFilters(false);

      // Capture current navigation version to check in timeout callback
      const capturedVersion = navigationVersionRef.current;

      searchTimeoutRef.current = setTimeout(() => {
        // Check if this navigation is still valid (not superseded by a newer search)
        // This prevents race conditions when filters change rapidly
        if (navigationVersionRef.current !== capturedVersion) {
          return;
        }

        if (transitionContext) {
          transitionContext.navigateWithTransition(searchUrl);
        } else {
          router.push(searchUrl);
        }
        // Reset searching state after navigation starts (tracked for cleanup)
        if (resetSearchingTimeoutRef.current)
          clearTimeout(resetSearchingTimeoutRef.current);
        resetSearchingTimeoutRef.current = setTimeout(
          () => setIsSearching(false),
          500
        );
      }, SEARCH_DEBOUNCE_MS);
    },
    [
      location,
      whatQuery,
      pending.minPrice,
      pending.maxPrice,
      committed,
      selectedCoords,
      router,
      // H4 FIX: isSearching removed — read from isSearchingRef.current instead
      saveRecentSearch,
      searchParams,
      transitionContext,
    ]
  );

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      if (resetSearchingTimeoutRef.current) {
        clearTimeout(resetSearchingTimeoutRef.current);
      }
    };
  }, []);

  // Toggle functions use direct state updates for immediate aria-pressed feedback.
  // These are simple array toggles — no INP benefit from startTransition deferral.
  const toggleAmenity = useCallback(
    (amenity: string) => {
      setPending((prev) => ({
        amenities: prev.amenities.includes(amenity)
          ? prev.amenities.filter((a) => a !== amenity)
          : [...prev.amenities, amenity],
      }));
    },
    [setPending]
  );

  const toggleHouseRule = useCallback(
    (rule: string) => {
      setPending((prev) => ({
        houseRules: prev.houseRules.includes(rule)
          ? prev.houseRules.filter((r) => r !== rule)
          : [...prev.houseRules, rule],
      }));
    },
    [setPending]
  );

  const toggleLanguage = useCallback(
    (lang: string) => {
      setPending((prev) => ({
        languages: prev.languages.includes(lang)
          ? prev.languages.filter((l) => l !== lang)
          : [...prev.languages, lang],
      }));
    },
    [setPending]
  );

  // Clear all filters but preserve location, bounds, and sort (#15)
  // Matches AppliedFilterChips "Clear all" behavior via shared clearAllFilters()
  const handleClearAllFilters = useCallback(() => {
    startTransition(() => {
      setWhatQuery("");
      setPending({
        minPrice: "",
        maxPrice: "",
        moveInDate: "",
        leaseDuration: "",
        roomType: "",
        amenities: [],
        houseRules: [],
        languages: [],
        genderPreference: "",
        householdGender: "",
        minSlots: "",
      });
    });
    // Navigate preserving location, bounds, and sort — only clear filter params
    const preserved = clearAllFilters(
      new URLSearchParams(searchParams.toString())
    );
    const searchUrl = `/search${preserved ? `?${preserved}` : ""}`;
    if (transitionContext) {
      transitionContext.navigateWithTransition(searchUrl);
    } else {
      router.push(searchUrl);
    }
  }, [transitionContext, router, setPending, searchParams]);

  // Count active filters for badge - use COMMITTED (URL) state, not pending
  // This ensures the badge updates instantly when chips are removed
  // Base count excludes moveInDate (no Date() calls, safe for SSR)
  const baseFilterCount = [
    committed.leaseDuration && committed.leaseDuration !== "any",
    committed.roomType && committed.roomType !== "any",
    ...committed.amenities,
    ...committed.houseRules,
    ...committed.languages,
    committed.genderPreference && committed.genderPreference !== "any",
    committed.householdGender && committed.householdGender !== "any",
    committed.minSlots && parseInt(committed.minSlots) >= 2,
  ].filter(Boolean).length;

  // moveInDate count only calculated after mount (uses Date() which differs server/client)
  // IMPORTANT: Only call validateMoveInDate when hasMounted is true to avoid hydration mismatch
  // The Date() comparison inside validateMoveInDate can produce different results on server vs client
  const moveInDateCount = hasMounted
    ? validateMoveInDate(committed.moveInDate)
      ? 1
      : 0
    : 0;
  const activeFilterCount = baseFilterCount + moveInDateCount;

  // Check if any filters are active (for "Clear all" button visibility)
  // Cast to boolean to satisfy TypeScript (|| chain returns first truthy value)
  const hasActiveFilters = Boolean(
    location ||
    committed.minPrice ||
    committed.maxPrice ||
    (committed.leaseDuration && committed.leaseDuration !== "any") ||
    (committed.roomType && committed.roomType !== "any") ||
    committed.amenities.length > 0 ||
    committed.houseRules.length > 0 ||
    committed.languages.length > 0 ||
    (committed.genderPreference && committed.genderPreference !== "any") ||
    (committed.householdGender && committed.householdGender !== "any") ||
    (committed.minSlots && parseInt(committed.minSlots) >= 2) ||
    moveInDateCount > 0
  );

  // P3-NEW-b: Get dynamic count for FilterModal button
  // filtersDirty is now computed by useBatchedFilters
  const {
    count,
    formattedCount,
    isLoading: isCountLoading,
    boundsRequired,
  } = useDebouncedFilterCount({
    pending,
    isDirty: filtersDirty,
    isDrawerOpen: showFilters,
  });

  // Facets data (histogram + facet counts) for FilterModal
  const { facets } = useFacets({
    pending,
    isDrawerOpen: showFilters,
  });

  // Derive price slider bounds from facets with fallback
  const priceAbsoluteMin = facets?.priceRanges?.min ?? 0;
  const priceAbsoluteMax = facets?.priceRanges?.max ?? 10000;

  // Convert string price state to numbers for slider
  const numericMinPrice = minPrice ? parseFloat(minPrice) : undefined;
  const numericMaxPrice = maxPrice ? parseFloat(maxPrice) : undefined;

  // Handle price slider changes
  const handlePriceChange = useCallback(
    (min: number, max: number) => {
      startTransition(() => {
        setPending({
          minPrice: min <= priceAbsoluteMin ? "" : String(min),
          maxPrice: max >= priceAbsoluteMax ? "" : String(max),
        });
      });
    },
    [priceAbsoluteMin, priceAbsoluteMax, setPending]
  );

  // Snapshot pending when count drops to 0 — prevents stale suggestions during rapid filter changes
  const pendingAtZeroRef = useRef(pending);
  useEffect(() => {
    if (count === 0 && !isCountLoading) {
      pendingAtZeroRef.current = pending;
    }
  }, [count, isCountLoading, pending]);

  // P4: Compute drawer suggestions when count drops to 0
  const drawerSuggestions = useMemo(() => {
    if (count !== 0 || isCountLoading) return [];
    const fp = pendingToFilterParams(pendingAtZeroRef.current);
    return generateFilterSuggestions(fp, count).slice(0, 2);
  }, [count, isCountLoading]);

  // P4: Handle removing a filter suggestion from the drawer
  const handleRemoveFilterSuggestion = useCallback(
    (suggestion: FilterSuggestion) => {
      const keys = SUGGESTION_TYPE_TO_PENDING_KEYS[suggestion.type];
      const updates: Partial<BatchedFilterValues> = {};
      for (const key of keys) {
        (updates as Record<string, string | string[]>)[key] =
          ARRAY_PENDING_KEYS.has(key) ? [] : "";
      }
      setPending(updates);
    },
    [setPending]
  );

  // Show warning when user has typed location but not selected from dropdown
  const showLocationWarning = location.trim().length > 2 && !selectedCoords;
  const [locationInputFocused, setLocationInputFocused] = useState(false);

  // Handle Escape key to close filter drawer (via shared hook for consistency)
  useKeyboardShortcuts([
    {
      key: "Escape",
      action: () => setShowFilters(false),
      disabled: !showFilters,
      description: "Close filter drawer",
    },
  ]);

  // Body scroll lock for filter drawer is handled by FilterModal's useBodyScrollLock(isOpen).
  // No duplicate lock needed here.

  const isCompact = variant === "compact";
  const isHome = variant === "home";
  // 'en-CA' locale returns YYYY-MM-DD format in local timezone, safe across DST transitions
  const minMoveInDate = new Date().toLocaleDateString("en-CA");

  // Compute inline flex styles for focus-triggered expansion.
  // Uses inline styles instead of Tailwind classes because Tailwind v4
  // may not generate arbitrary flex values reliably with dynamic class names.
  const getFieldFlex = (
    field: "what" | "where" | "budget"
  ): React.CSSProperties => {
    const defaults = {
      what: "1.3 1 0%",
      where: "1.5 1 0%",
      budget: "1.2 1 0%",
    };
    const transition = "flex 0.4s cubic-bezier(0.16, 1, 0.3, 1)";
    if (!focusedField) return { flex: defaults[field], transition };
    if (focusedField === field)
      return { flex: field === "budget" ? "5 1 0%" : "6 1 0%", transition };
    return { flex: "0.3 1 0%", transition };
  };

  const fieldPaddingClasses = isCompact
    ? "px-4 py-2"
    : isHome
      ? "px-0 py-0 md:px-6 md:py-2.5"
      : "px-4 py-2 md:px-6 md:py-2.5";

  const getFieldStateClasses = (field: "what" | "where" | "budget") => {
    if (isHome) {
      return cn(
        focusedField === field &&
          "md:bg-surface-container-lowest/[0.03] md:rounded-2xl",
        focusedField !== null && focusedField !== field && "md:opacity-50"
      );
    }

    return focusedField === field
      ? "md:bg-surface-container-lowest/[0.03] md:rounded-2xl opacity-100"
      : focusedField !== null
        ? "opacity-50"
        : "opacity-100";
  };

  // CLS fix: min-h matches Suspense fallback in SearchHeaderWrapper.tsx
  return (
    <div
      className={cn(
        "relative w-full mx-auto",
        isCompact
          ? "min-h-[56px] sm:min-h-[64px] max-w-2xl"
          : isHome
            ? "max-w-[360px] md:max-w-5xl"
            : "min-h-[56px] sm:min-h-[64px] max-w-5xl"
      )}
    >
      <form
        ref={formRef}
        onSubmit={handleSearch}
        className={cn(
          "group relative flex w-full flex-col",
          isHome
            ? "rounded-[2rem] bg-white p-7 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.07)] md:flex-row md:items-center md:rounded-full md:bg-surface-container-lowest md:p-2 md:shadow-xl md:backdrop-blur-2xl md:transition-all md:duration-300 md:hover:shadow-2xl md:focus-within:shadow-2xl"
            : "bg-surface-container-lowest backdrop-blur-2xl rounded-3xl md:rounded-full shadow-xl hover:shadow-2xl focus-within:shadow-2xl transition-all duration-300 md:flex-row md:items-center",
          isCompact && "p-1",
          !isCompact && !isHome && "p-2"
        )}
        role="search"
        aria-label="Search listings"
      >
        {/* Semantic "What" Input — AI-powered natural language search */}
        {/* Hidden at md (tablet) to prevent truncation — shown at lg+ */}
        {semanticSearchEnabled && !isCompact && (
          <>
            <div
              style={getFieldFlex("what")}
              className={cn(
                "w-full flex-col relative overflow-hidden whitespace-nowrap transition-opacity duration-300",
                isHome ? "flex md:hidden lg:flex" : "hidden lg:flex",
                fieldPaddingClasses,
                getFieldStateClasses("what")
              )}
            >
              <label
                htmlFor="search-what"
                className={cn(
                  "transition-opacity duration-200",
                  isHome
                    ? "mb-2.5 flex items-center text-[11px] font-bold uppercase tracking-[0.2em] leading-none text-[#A85338] md:mb-1 md:gap-1.5 md:text-xs md:tracking-[0.15em] md:text-primary"
                    : "mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.15em] text-primary",
                  focusedField !== null &&
                    focusedField !== "what" &&
                    "md:opacity-0"
                )}
              >
                <Sparkles
                  className={cn(
                    isHome
                      ? "mr-1.5 h-[14px] w-[14px] shrink-0 text-[#A85338] md:mr-0 md:h-3 md:w-3 md:text-primary"
                      : "h-3 w-3"
                  )}
                  strokeWidth={isHome ? 2.5 : 2}
                />
                What
                <span
                  className={cn(
                    isHome
                      ? "ml-2 rounded-[4px] bg-[#A85338] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white md:ml-0 md:rounded md:bg-primary md:text-[10px] md:tracking-wider md:text-on-primary"
                      : "rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-on-primary"
                  )}
                >
                  AI
                </span>
              </label>
              <div
                className={cn("flex items-center", isHome ? "gap-0" : "gap-1")}
              >
                <input
                  id="search-what"
                  type="text"
                  value={whatQuery}
                  onChange={(e) => setWhatQuery(e.target.value)}
                  onFocus={() => handleFieldFocus("what")}
                  onBlur={handleFieldBlur}
                  placeholder="Describe your ideal room"
                  className={cn(
                    "w-full bg-transparent border-none focus:ring-0 focus:outline-none",
                    isHome
                      ? "rounded-md px-1 py-1 -ml-1 text-[16px] text-[#2F2F2B] placeholder:text-[#7A7A7A] transition-colors focus:bg-[#F8F7F3] md:-ml-0 md:rounded-none md:px-0 md:py-0 md:text-base md:font-medium md:text-on-surface md:placeholder:text-on-surface-variant md:focus:bg-transparent"
                      : "p-0 text-[16px] md:text-sm font-medium text-on-surface placeholder:text-on-surface-variant"
                  )}
                  autoComplete="off"
                />
                {whatQuery && (
                  <button
                    type="button"
                    onClick={() => setWhatQuery("")}
                    className={cn(
                      "flex-shrink-0 rounded-full transition-colors",
                      isHome
                        ? "p-1.5 text-[#7A7A7A] hover:bg-[#F8F7F3] hover:text-[#2F2F2B] md:p-1 md:text-on-surface-variant md:hover:bg-transparent md:hover:text-on-surface-variant"
                        : "p-3 text-on-surface-variant hover:text-on-surface-variant"
                    )}
                    aria-label="Clear search description"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {/* Divider between What and Where — hidden at md with WHAT field */}
            <div
              className={cn(
                isHome
                  ? "my-5 block h-px w-full bg-[#EFEEE9] md:hidden lg:my-0 lg:block lg:h-8 lg:w-px lg:bg-outline-variant/20"
                  : "w-full h-px lg:w-px lg:h-8 bg-outline-variant/20 mx-0 lg:mx-1 my-1 lg:my-0 hidden lg:block"
              )}
              aria-hidden="true"
            ></div>
          </>
        )}

        {/* Location Input with Autocomplete - Airbnb-style stacked layout */}
        <div
          style={getFieldFlex("where")}
          className={cn(
            "w-full flex flex-col relative group/input overflow-hidden whitespace-nowrap transition-opacity duration-300",
            isHome && "overflow-visible md:overflow-hidden",
            fieldPaddingClasses,
            getFieldStateClasses("where")
          )}
        >
          {!isCompact && (
            <label
              htmlFor="search-location"
              className={cn(
                "transition-opacity duration-200",
                isHome
                  ? "mb-2.5 ml-1 text-[11px] font-bold uppercase tracking-[0.2em] leading-none text-[#6B6B6B] md:mb-1 md:ml-0 md:text-xs md:tracking-[0.15em] md:text-on-surface-variant"
                  : "mb-1 text-xs font-bold uppercase tracking-[0.15em] text-on-surface-variant",
                focusedField !== null &&
                  focusedField !== "where" &&
                  "md:opacity-0"
              )}
            >
              Where
            </label>
          )}
          <div
            className={cn(
              "flex items-center",
              isHome ? "justify-between gap-2" : "gap-1"
            )}
          >
            <LocationSearchInput
              id="search-location"
              value={location}
              onChange={(value) => {
                isUserTypingLocationRef.current = true;
                setLocation(value);
                if (selectedCoords) setSelectedCoords(null);
                setShowRecentSearches(false);
              }}
              onLocationSelect={(data) => {
                isUserTypingLocationRef.current = false;
                handleLocationSelect(data);
                setShowRecentSearches(false);
              }}
              onFocus={() => {
                setLocationInputFocused(true);
                handleFieldFocus("where");
                if (recentSearches.length > 0 && !location) {
                  setShowRecentSearches(true);
                }
              }}
              onBlur={() => {
                setLocationInputFocused(false);
                handleFieldBlur();
                // Delay hiding to allow click on recent search
                setTimeout(() => setShowRecentSearches(false), 200);
                // Allow pending URL syncs to settle before re-enabling location sync
                setTimeout(() => {
                  isUserTypingLocationRef.current = false;
                }, 500);
              }}
              placeholder={
                focusedField && focusedField !== "where"
                  ? "City or area"
                  : "Search destinations"
              }
              className="flex-1"
              inputClassName={
                isHome
                  ? "rounded-md px-1 py-1 -ml-1 text-[16px] text-[#2F2F2B] placeholder:text-[#7A7A7A] transition-colors focus:bg-[#F8F7F3] md:-ml-0 md:rounded-none md:px-0 md:py-0 md:text-base md:font-medium md:text-on-surface md:placeholder:text-on-surface-variant md:focus:bg-transparent"
                  : "text-[16px] md:text-sm"
              }
            />
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={geoLoading}
              className={cn(
                "flex-shrink-0 rounded-full transition-colors disabled:opacity-50",
                isHome
                  ? "p-2 -mr-2 text-[#9CA3AF] hover:bg-[#F8F7F3] hover:text-[#1F2937] active:bg-[#EFEBE5] md:mr-0 md:p-1.5 md:text-on-surface-variant md:hover:bg-transparent md:hover:text-on-surface"
                  : "p-3 text-on-surface-variant hover:text-on-surface"
              )}
              aria-label="Use my current location"
              title="Use my current location"
            >
              {geoLoading ? (
                <Loader2
                  className={cn(
                    isHome
                      ? "h-[18px] w-[18px] animate-spin md:h-3.5 md:w-3.5"
                      : "w-3.5 h-3.5 animate-spin"
                  )}
                />
              ) : (
                <LocateFixed
                  className={cn(
                    isHome
                      ? "h-[18px] w-[18px] md:h-3.5 md:w-3.5"
                      : "w-3.5 h-3.5"
                  )}
                />
              )}
            </button>
          </div>

          {/* Recent Searches Dropdown */}
          {showRecentSearches && recentSearches.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-3 bg-surface-container-lowest/95 backdrop-blur-[20px] rounded-lg shadow-ambient z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between px-5 py-3 bg-surface-container-high/30">
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                  Recent Searches
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    clearRecentSearches();
                  }}
                  className="h-auto py-1 px-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:text-red-500"
                >
                  Clear
                </Button>
              </div>
              <ul className="py-2">
                {recentSearches.map((search, idx) => (
                  <li key={`${search.location}-${idx}`}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        selectRecentSearch(search);
                      }}
                      className="w-full flex items-center gap-4 px-5 py-3 hover:bg-surface-canvas[0.02] text-left transition-colors"
                    >
                      <Clock className="w-4 h-4 text-on-surface-variant flex-shrink-0" />
                      <span className="text-sm font-medium text-on-surface-variant truncate">
                        {search.location}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Divider */}
        <div
          className={cn(
            isHome
              ? "my-5 h-px w-full bg-[#EFEEE9] md:mx-1 md:my-0 md:h-8 md:w-px md:bg-outline-variant/20"
              : "w-full h-px md:w-px md:h-8 bg-outline-variant/20 mx-0 md:mx-1 my-1 md:my-0"
          )}
          aria-hidden="true"
        ></div>

        {/* Price Range Input - Airbnb-style stacked layout */}
        <div
          style={getFieldFlex("budget")}
          className={cn(
            "w-full flex flex-col overflow-hidden whitespace-nowrap transition-opacity duration-300",
            fieldPaddingClasses,
            getFieldStateClasses("budget")
          )}
        >
          {!isCompact && (
            <label
              className={cn(
                "transition-opacity duration-200",
                isHome
                  ? "mb-2.5 ml-1 text-[11px] font-bold uppercase tracking-[0.2em] leading-none text-[#6B6B6B] md:mb-1 md:ml-0 md:text-xs md:tracking-[0.15em] md:text-on-surface-variant"
                  : "mb-1 text-xs font-bold uppercase tracking-[0.15em] text-on-surface-variant",
                focusedField !== null &&
                  focusedField !== "budget" &&
                  "md:opacity-0"
              )}
            >
              Budget
            </label>
          )}
          <div className={cn("flex items-center", isHome ? "gap-3" : "gap-2")}>
            <div className="flex items-center gap-1 flex-1">
              <span
                className={cn(
                  "text-on-surface-variant text-xs",
                  isHome &&
                    "text-base font-normal text-[#7A7A7A] md:text-xs md:text-on-surface-variant"
                )}
              >
                $
              </span>
              <input
                id="search-budget-min"
                aria-label="Minimum budget"
                type="number"
                inputMode="numeric"
                value={minPrice}
                onChange={(e) => setPending({ minPrice: e.target.value })}
                onFocus={() => handleFieldFocus("budget")}
                onBlur={handleFieldBlur}
                placeholder="Min"
                className={cn(
                  "w-full bg-transparent border-none appearance-none focus:ring-0 focus:outline-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                  isHome
                    ? "rounded-md px-1 py-1 -ml-1 text-[16px] text-[#2F2F2B] placeholder:text-[#7A7A7A] transition-colors focus:bg-[#F8F7F3] md:-ml-0 md:rounded-none md:px-0 md:py-0 md:text-base md:font-medium md:text-on-surface md:placeholder:text-on-surface-variant md:focus:bg-transparent"
                    : "p-0 text-[16px] md:text-sm font-medium text-on-surface placeholder:text-on-surface-variant"
                )}
                min="0"
                step="50"
              />
            </div>
            <span
              className={cn(
                isHome
                  ? "text-lg font-light text-[#C0C0C0] md:text-xs md:font-normal md:text-on-surface-variant"
                  : "text-on-surface-variant text-xs"
              )}
            >
              —
            </span>
            <div className="flex items-center gap-1 flex-1">
              <span
                className={cn(
                  "text-on-surface-variant text-xs",
                  isHome &&
                    "text-base font-normal text-[#7A7A7A] md:text-xs md:text-on-surface-variant"
                )}
              >
                $
              </span>
              <input
                id="search-budget-max"
                aria-label="Maximum budget"
                type="number"
                inputMode="numeric"
                value={maxPrice}
                onChange={(e) => setPending({ maxPrice: e.target.value })}
                onFocus={() => handleFieldFocus("budget")}
                onBlur={handleFieldBlur}
                placeholder="Max"
                className={cn(
                  "w-full bg-transparent border-none appearance-none focus:ring-0 focus:outline-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                  isHome
                    ? "rounded-md px-1 py-1 -ml-1 text-[16px] text-[#2F2F2B] placeholder:text-[#7A7A7A] transition-colors focus:bg-[#F8F7F3] md:-ml-0 md:rounded-none md:px-0 md:py-0 md:text-base md:font-medium md:text-on-surface md:placeholder:text-on-surface-variant md:focus:bg-transparent"
                    : "p-0 text-[16px] md:text-sm font-medium text-on-surface placeholder:text-on-surface-variant"
                )}
                min="0"
                step="50"
              />
            </div>
          </div>
        </div>

        <div
          className={cn(
            isHome
              ? "mt-6 flex items-center justify-between pt-1 md:mt-0 md:pt-0 md:contents"
              : "contents"
          )}
        >
          {/* Filters Button */}
          {!isCompact && (
            <>
              <div
                className="hidden md:block w-px h-8 bg-outline-variant/20 mx-1"
                aria-hidden="true"
              ></div>
              <div
                className={cn("flex items-center", isHome ? "px-0" : "px-3")}
              >
                <button
                  type="button"
                  data-hydrated={hasMounted || undefined}
                  onClick={() => setShowFilters(true)}
                  aria-label={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ""}`}
                  aria-expanded={showFilters}
                  aria-controls={showFilters ? "search-filters" : undefined}
                  className={cn(
                    "relative flex items-center gap-2 transition-all duration-300",
                    isHome
                      ? activeFilterCount > 0
                        ? "-ml-3 rounded-xl bg-[#F4E7E0] px-3 py-2 text-[12px] font-bold uppercase tracking-[0.1em] text-[#A85338] md:ml-0 md:h-10 md:rounded-full md:bg-primary/10 md:px-4 md:text-xs md:tracking-wider md:text-primary"
                        : "-ml-3 rounded-xl px-3 py-2 text-[12px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B] hover:bg-[#F8F7F3] hover:text-[#1F2937] active:bg-[#EFEBE5] md:ml-0 md:h-10 md:rounded-full md:px-4 md:text-xs md:tracking-wider md:text-on-surface-variant md:hover:bg-surface-container-high md:hover:text-on-surface"
                      : activeFilterCount > 0
                        ? "h-10 rounded-full bg-primary/10 px-4 text-xs font-bold uppercase tracking-wider text-primary"
                        : "h-10 rounded-full px-4 text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                  )}
                >
                  <SlidersHorizontal
                    className={cn(
                      isHome
                        ? "h-[18px] w-[18px] md:h-3.5 md:w-3.5"
                        : "w-3.5 h-3.5"
                    )}
                  />
                  <span className={cn(!isHome && "hidden sm:inline")}>
                    Filters
                  </span>
                  {activeFilterCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-on-primary shadow-ambient-sm">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Search Button */}
          <div
            className={cn(
              "flex items-center justify-center",
              isHome ? "p-0 md:p-1" : isCompact ? "p-0.5" : "p-1"
            )}
          >
            <Button
              type="submit"
              size={isHome ? "icon" : undefined}
              disabled={isSearching}
              aria-label={isSearching ? "Searching" : "Search"}
              aria-busy={isSearching}
              className={cn(
                "rounded-full transition-all duration-500 hover:scale-105 active:scale-95",
                isHome
                  ? "h-[54px] w-[54px] min-h-[54px] min-w-[54px] bg-[#A85338] text-white shadow-[0_8px_20px_-6px_rgba(168,83,56,0.5)] hover:bg-[#944830] md:h-12 md:w-12 md:min-h-[44px] md:min-w-[44px] md:bg-gradient-to-br md:from-primary md:to-primary-container md:hover:from-primary md:hover:to-primary md:shadow-ambient-lg md:shadow-primary/20"
                  : isCompact
                    ? "h-10 w-10 p-0 shadow-ambient-lg shadow-primary/20"
                    : "h-12 w-full md:w-12 bg-gradient-to-br from-primary to-primary-container hover:from-primary hover:to-primary shadow-ambient-lg shadow-primary/20"
              )}
            >
              {isSearching ? (
                <Loader2
                  className={cn(
                    "animate-spin",
                    isHome ? "h-[22px] w-[22px] md:h-5 md:w-5" : "w-5 h-5"
                  )}
                />
              ) : (
                <Search
                  className={cn(
                    isHome ? "h-[22px] w-[22px] md:h-5 md:w-5" : "w-5 h-5"
                  )}
                  strokeWidth={2.5}
                />
              )}
              {!isCompact && !isHome && (
                <span className="md:hidden ml-2 font-bold text-sm uppercase tracking-widest">
                  Search
                </span>
              )}
            </Button>
          </div>
        </div>
      </form>

      {/* Location warning when user hasn't selected from dropdown.
                Uses absolute positioning so it doesn't change the header height —
                a height change triggers ResizeObserver → map moveEnd → search-as-move → URL update → clears input. */}
      {showLocationWarning && !isCompact && !locationInputFocused && (
        <div
          id="location-warning"
          className={cn(
            "border border-amber-200 bg-amber-50 text-sm text-amber-800 flex gap-2",
            isHome
              ? "mt-3 items-start rounded-2xl px-4 py-3 shadow-sm md:pointer-events-none md:absolute md:left-0 md:right-0 md:top-full md:mx-auto md:mt-2 md:max-w-5xl md:items-center md:rounded-xl md:px-4 md:py-2 md:z-40 md:shadow-lg"
              : "absolute left-0 right-0 top-full mt-2 mx-auto max-w-5xl items-center rounded-xl px-4 py-2 pointer-events-none z-40 shadow-lg"
          )}
        >
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span>
            Select a location from the dropdown for more accurate results
          </span>
        </div>
      )}

      {/* Filter Modal - Presentational component */}
      <FilterModal
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        onApply={() => {
          setShowFilters(false);
          commitFilters();
        }}
        onClearAll={handleClearAllFilters}
        hasActiveFilters={hasActiveFilters}
        activeFilterCount={activeFilterCount}
        moveInDate={moveInDate}
        leaseDuration={leaseDuration}
        roomType={roomType}
        amenities={amenities}
        houseRules={houseRules}
        languages={languages}
        genderPreference={genderPreference}
        householdGender={householdGender}
        minSlots={minSlots ? parseInt(minSlots) || undefined : undefined}
        onMinSlotsChange={(v) =>
          setPending({ minSlots: v !== undefined ? String(v) : "" })
        }
        onMoveInDateChange={(v: string) => setPending({ moveInDate: v })}
        onLeaseDurationChange={(v: string) =>
          setPending({ leaseDuration: v === "any" ? "" : v })
        }
        onRoomTypeChange={(v: string) =>
          setPending({ roomType: v === "any" ? "" : v })
        }
        onToggleAmenity={toggleAmenity}
        onToggleHouseRule={toggleHouseRule}
        onToggleLanguage={toggleLanguage}
        onGenderPreferenceChange={(v: string) =>
          setPending({ genderPreference: v === "any" ? "" : v })
        }
        onHouseholdGenderChange={(v: string) =>
          setPending({ householdGender: v === "any" ? "" : v })
        }
        languageSearch={languageSearch}
        onLanguageSearchChange={setLanguageSearch}
        filteredLanguages={filteredLanguages}
        minMoveInDate={minMoveInDate}
        amenityOptions={AMENITY_OPTIONS}
        houseRuleOptions={HOUSE_RULE_OPTIONS}
        // Price range filter
        minPrice={numericMinPrice}
        maxPrice={numericMaxPrice}
        priceAbsoluteMin={priceAbsoluteMin}
        priceAbsoluteMax={priceAbsoluteMax}
        priceHistogram={facets?.priceHistogram?.buckets}
        onPriceChange={handlePriceChange}
        // Facet counts
        facetCounts={
          facets
            ? {
                amenities: facets.amenities,
                houseRules: facets.houseRules,
                roomTypes: facets.roomTypes,
              }
            : undefined
        }
        // P3-NEW-b: Dynamic count props from useDebouncedFilterCount
        formattedCount={formattedCount}
        isCountLoading={isCountLoading}
        boundsRequired={boundsRequired}
        // P4: Zero-count warning
        count={count}
        drawerSuggestions={drawerSuggestions}
        onRemoveFilterSuggestion={handleRemoveFilterSuggestion}
      />
    </div>
  );
}
