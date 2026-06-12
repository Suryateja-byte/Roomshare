"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import FilterModal from "@/components/search/FilterModal";
import {
  SUPPORTED_LANGUAGES,
  getLanguageName,
  type LanguageCode,
} from "@/lib/languages";
import { VALID_AMENITIES, VALID_HOUSE_RULES } from "@/lib/search-params";
import { clearAllFilters } from "@/components/filters/filter-chip-utils";
import { useSearchTransitionSafe } from "@/contexts/SearchTransitionContext";
import { useMobileSearch } from "@/contexts/MobileSearchContext";
import { useDebouncedFilterCount } from "@/hooks/useDebouncedFilterCount";
import { useFacets } from "@/hooks/useFacets";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import {
  buildSearchFilterPatchFromPending,
  sanitizePendingFilters,
  useBatchedFilters,
  type BatchedFilterValues,
} from "@/hooks/useBatchedFilters";
import { pendingToFilterParams } from "@/lib/pending-to-filter-params";
import {
  generateFilterSuggestions,
  type FilterSuggestion,
} from "@/lib/near-matches";
import type { RecentSearchFilters } from "@/hooks/useRecentSearches";
import {
  getValidatedSearchDateRange,
  validateMoveInDate,
} from "@/lib/search/search-dates";
import { SearchBar } from "./SearchBar";
import { useSearchBarState } from "./useSearchBarState";
import { useSearchSubmit } from "./useSearchSubmit";

const AMENITY_OPTIONS = VALID_AMENITIES;
const HOUSE_RULE_OPTIONS = VALID_HOUSE_RULES;

const LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGES) as LanguageCode[];

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
  date: ["moveInDate", "endDate"],
  roomType: ["roomType"],
  amenities: ["amenities"],
  leaseDuration: ["leaseDuration"],
};

/**
 * Home hero search: the shared SearchBar pill plus the home-only filter
 * staging machinery (useBatchedFilters pending state, FilterModal, facets,
 * debounced counts, near-match suggestions). The bar itself is byte-identical
 * to the search-page header bar.
 */
export default function HomeSearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const transitionContext = useSearchTransitionSafe();
  const { registerOpenFilters } = useMobileSearch();

  const [showFilters, setShowFilters] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  const [hasMounted, setHasMounted] = useState(false);

  // Reset language search text when the filter drawer closes — catches ALL
  // close paths (onClose, onApply, Escape, future ones).
  useEffect(() => {
    if (!showFilters) {
      setLanguageSearch("");
    }
  }, [showFilters]);

  const filteredLanguages = useMemo(() => {
    if (!languageSearch.trim()) return LANGUAGE_CODES;
    const search = languageSearch.toLowerCase();
    return LANGUAGE_CODES.filter(
      (code) =>
        getLanguageName(code).toLowerCase().includes(search) ||
        code.toLowerCase().includes(search)
    );
  }, [languageSearch]);

  const {
    pending,
    isDirty: filtersDirty,
    setPending,
    commit: commitFilters,
    committed,
  } = useBatchedFilters({ isDrawerOpen: showFilters });
  const {
    minPrice,
    maxPrice,
    moveInDate,
    endDate,
    leaseDuration,
    roomType,
    amenities,
    houseRules,
    languages,
    genderPreference,
    householdGender,
    minSlots,
  } = pending;

  const state = useSearchBarState({
    externalBudget: {
      minPrice,
      maxPrice,
      onMinPriceChange: (value) => setPending({ minPrice: value }),
      onMaxPriceChange: (value) => setPending({ maxPrice: value }),
    },
  });

  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const buildFilterPatch = useCallback(
    () =>
      buildSearchFilterPatchFromPending(
        sanitizePendingFilters(pendingRef.current)
      ),
    []
  );

  const buildRecentFilters = useCallback(():
    | Partial<RecentSearchFilters>
    | undefined => {
    const sanitizedPending = sanitizePendingFilters(pendingRef.current);
    const activeFilters: Partial<RecentSearchFilters> = {};
    if (sanitizedPending.minPrice)
      activeFilters.minPrice = sanitizedPending.minPrice;
    if (sanitizedPending.maxPrice)
      activeFilters.maxPrice = sanitizedPending.maxPrice;
    if (sanitizedPending.roomType)
      activeFilters.roomType = sanitizedPending.roomType;
    if (sanitizedPending.leaseDuration)
      activeFilters.leaseDuration = sanitizedPending.leaseDuration;
    if (sanitizedPending.amenities.length > 0)
      activeFilters.amenities = sanitizedPending.amenities;
    if (sanitizedPending.houseRules.length > 0)
      activeFilters.houseRules = sanitizedPending.houseRules;
    return Object.keys(activeFilters).length > 0 ? activeFilters : undefined;
  }, []);

  const { handleSubmit, isSearching, isResolvingTypedLocation } =
    useSearchSubmit({
      state,
      enableNlParsing: true,
      debounceMs: 300,
      buildFilterPatch,
      buildRecentFilters,
      onSubmitStart: () => setShowFilters(false),
    });

  // Mount-time validation of URL dates and one-time cleanup of stale values.
  // Run-once by design: re-running on searchParams changes would fight the
  // URL sync effect in useBatchedFilters.
  useEffect(() => {
    setHasMounted(true);
    const rawMoveInDate =
      searchParams.get("moveInDate") ?? searchParams.get("startDate");
    const rawEndDate = searchParams.get("endDate");
    const validatedRange = getValidatedSearchDateRange(
      rawMoveInDate,
      rawEndDate
    );
    if (
      validatedRange.moveInDate !== moveInDate ||
      validatedRange.endDate !== endDate
    ) {
      setPending(validatedRange);
    }

    // Strip invalid dates and canonicalize startDate -> moveInDate in the URL
    // so the sync effect in useBatchedFilters doesn't re-override the cleanup.
    if (
      rawMoveInDate !== validatedRange.moveInDate ||
      (rawEndDate ?? "") !== validatedRange.endDate ||
      searchParams.has("startDate")
    ) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("startDate");
      if (validatedRange.moveInDate) {
        params.set("moveInDate", validatedRange.moveInDate);
      } else {
        params.delete("moveInDate");
      }
      if (validatedRange.endDate) {
        params.set("endDate", validatedRange.endDate);
      } else {
        params.delete("endDate");
      }
      const qs = params.toString();
      router.replace(`${window.location.pathname}${qs ? `?${qs}` : ""}`, {
        scroll: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register mobile "open filters" callback for the collapsed search bar.
  useEffect(() => {
    return registerOpenFilters(() => setShowFilters(true));
  }, [registerOpenFilters]);

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

  // Clear all filters but preserve location, bounds, and sort.
  const handleClearAllFilters = useCallback(() => {
    startTransition(() => {
      state.setWhat("");
      setPending({
        minPrice: "",
        maxPrice: "",
        moveInDate: "",
        endDate: "",
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
    const preserved = clearAllFilters(
      new URLSearchParams(searchParams.toString())
    );
    // CFM-604: canonical-on-write guarantee — clearAllFilters() serializes canonically.
    const searchUrl = `/search${preserved ? `?${preserved}` : ""}`;
    if (transitionContext) {
      transitionContext.navigateWithTransition(searchUrl, {
        reason: "filter",
      });
    } else {
      router.push(searchUrl);
    }
  }, [transitionContext, router, setPending, searchParams, state]);

  // Count active filters for badge — COMMITTED (URL) state, not pending,
  // so the badge updates instantly when chips are removed.
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

  // moveInDate count only after mount — the Date() comparison inside
  // validateMoveInDate differs server/client (hydration-mismatch guard).
  const moveInDateCount = hasMounted
    ? validateMoveInDate(committed.moveInDate)
      ? 1
      : 0
    : 0;
  const activeFilterCount = baseFilterCount + moveInDateCount;

  const hasActiveFilters = Boolean(
    state.location ||
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

  const { facets } = useFacets({
    pending,
    isDrawerOpen: showFilters,
  });

  const priceAbsoluteMin = facets?.priceRanges?.min ?? 0;
  const priceAbsoluteMax = facets?.priceRanges?.max ?? 10000;
  const numericMinPrice = minPrice ? parseFloat(minPrice) : undefined;
  const numericMaxPrice = maxPrice ? parseFloat(maxPrice) : undefined;

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

  // Snapshot pending when count drops to 0 — prevents stale suggestions
  // during rapid filter changes.
  const pendingAtZeroRef = useRef(pending);
  useEffect(() => {
    if (count === 0 && !isCountLoading) {
      pendingAtZeroRef.current = pending;
    }
  }, [count, isCountLoading, pending]);

  const drawerSuggestions = useMemo(() => {
    if (count !== 0 || isCountLoading) return [];
    const fp = pendingToFilterParams(pendingAtZeroRef.current);
    return generateFilterSuggestions(fp, count).slice(0, 2);
  }, [count, isCountLoading]);

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

  useKeyboardShortcuts([
    {
      key: "Escape",
      action: () => setShowFilters(false),
      disabled: !showFilters,
      description: "Close filter drawer",
    },
  ]);

  // 'en-CA' locale returns YYYY-MM-DD in local timezone, safe across DST.
  const minMoveInDate = new Date().toLocaleDateString("en-CA");
  const minEndDate = moveInDate || minMoveInDate;

  const filtersButton = (
    <button
      type="button"
      data-hydrated={hasMounted || undefined}
      onClick={() => setShowFilters(true)}
      aria-label={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ""}`}
      aria-expanded={showFilters}
      aria-controls={showFilters ? "search-filters" : undefined}
      className={cn(
        "relative flex h-12 shrink-0 items-center gap-2 rounded-full px-4 text-xs font-bold uppercase tracking-wider transition-all duration-300",
        "md:h-[52px] md:px-5",
        activeFilterCount > 0
          ? "bg-primary/10 text-primary"
          : "text-on-surface-variant hover:bg-surface-canvas hover:text-on-surface md:hover:bg-on-surface/[0.04]"
      )}
    >
      <SlidersHorizontal className="h-3.5 w-3.5" />
      <span>Filters</span>
      {activeFilterCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-on-primary shadow-ambient-sm">
          {activeFilterCount}
        </span>
      )}
    </button>
  );

  return (
    <div className="relative mx-auto w-full max-w-[400px] md:max-w-[1120px]">
      <SearchBar
        state={state}
        onSubmit={handleSubmit}
        isSearching={isSearching}
        submitDisabled={isResolvingTypedLocation}
        trailingSlot={filtersButton}
      />

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
        endDate={endDate}
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
        onMoveInDateChange={(v: string) => {
          const normalizedMoveInDate = validateMoveInDate(v);
          setPending((prev) => ({
            moveInDate: normalizedMoveInDate,
            endDate:
              prev.endDate &&
              normalizedMoveInDate &&
              prev.endDate > normalizedMoveInDate
                ? prev.endDate
                : "",
          }));
        }}
        onEndDateChange={(v: string) => setPending({ endDate: v })}
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
        minEndDate={minEndDate}
        amenityOptions={AMENITY_OPTIONS}
        houseRuleOptions={HOUSE_RULE_OPTIONS}
        minPrice={numericMinPrice}
        maxPrice={numericMaxPrice}
        priceAbsoluteMin={priceAbsoluteMin}
        priceAbsoluteMax={priceAbsoluteMax}
        priceHistogram={facets?.priceHistogram?.buckets}
        onPriceChange={handlePriceChange}
        facetCounts={
          facets
            ? {
                amenities: facets.amenities,
                houseRules: facets.houseRules,
                roomTypes: facets.roomTypes,
              }
            : undefined
        }
        formattedCount={formattedCount}
        isCountLoading={isCountLoading}
        boundsRequired={boundsRequired}
        count={count}
        drawerSuggestions={drawerSuggestions}
        onRemoveFilterSuggestion={handleRemoveFilterSuggestion}
      />
    </div>
  );
}
