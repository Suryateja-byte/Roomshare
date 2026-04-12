"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import FilterModal from "@/components/search/FilterModal";
import type { SortOption } from "@/lib/data";
import {
  QUICK_FILTER_ACTIVE_BADGE_CLASSNAME,
  QUICK_FILTER_ACTIVE_CLASSNAME,
  QUICK_FILTER_INACTIVE_CLASSNAME,
} from "@/components/search/quickFilterStyles";
import {
  clearAllFilters,
  countActiveFilters,
  removeFilterFromUrl,
  urlToFilterChips,
} from "@/components/filters/filter-chip-utils";
import { useSearchTransitionSafe } from "@/contexts/SearchTransitionContext";
import { useMobileSearch } from "@/contexts/MobileSearchContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  emptyFilterValues,
  useBatchedFilters,
} from "@/hooks/useBatchedFilters";
import { useDebouncedFilterCount } from "@/hooks/useDebouncedFilterCount";
import { useFacets } from "@/hooks/useFacets";
import { VALID_AMENITIES, VALID_HOUSE_RULES } from "@/lib/search-params";
import {
  SUPPORTED_LANGUAGES,
  getLanguageName,
  type LanguageCode,
} from "@/lib/languages";
import { formatPriceCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

const LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGES) as LanguageCode[];

function formatPriceQuickLabel(minPrice?: number, maxPrice?: number) {
  if (minPrice !== undefined && maxPrice !== undefined) {
    if (minPrice === maxPrice) return formatPriceCompact(minPrice);
    return `${formatPriceCompact(minPrice)}-${formatPriceCompact(maxPrice)}`;
  }
  if (minPrice !== undefined) return `${formatPriceCompact(minPrice)}+`;
  if (maxPrice !== undefined) return `Up to ${formatPriceCompact(maxPrice)}`;
  return "Price";
}

function formatMoveInQuickLabel(moveInDate: string) {
  if (!moveInDate) return "Move-in";

  const date = new Date(`${moveInDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Move-in";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatRoomTypeQuickLabel(roomType: string) {
  if (!roomType) return "Room Type";
  if (roomType === "Entire Place") return "Entire place";
  return roomType;
}

function countPendingActiveFilters(values: typeof emptyFilterValues): number {
  let count = 0;

  if (values.minPrice || values.maxPrice) count += 1;
  if (values.moveInDate) count += 1;
  if (values.roomType) count += 1;
  if (values.leaseDuration) count += 1;
  if (values.genderPreference) count += 1;
  if (values.householdGender) count += 1;
  if (values.minSlots) count += 1;

  count += values.amenities.length;
  count += values.houseRules.length;
  count += values.languages.length;

  return count;
}

function PrimaryFilterButton({
  label,
  active,
  onClick,
  disabled,
  testId,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        "flex items-center gap-1 px-4 py-2.5 min-h-[44px] rounded-full text-sm whitespace-nowrap transition-colors shrink-0 border",
        active
          ? cn(QUICK_FILTER_ACTIVE_CLASSNAME, "font-medium")
          : QUICK_FILTER_INACTIVE_CLASSNAME
      )}
    >
      {label}
      <span className="text-[0.65rem] opacity-50">&#9660;</span>
    </button>
  );
}

/**
 * Desktop heading + mobile full-drawer launchers for the search results page.
 */
interface InlineFilterStripProps {
  desktopSummary?: {
    total: number | null;
    visibleCount: number;
    locationLabel?: string;
    browseMode?: boolean;
  };
  currentSort?: SortOption;
  hasResults?: boolean;
}

export function InlineFilterStrip({ desktopSummary }: InlineFilterStripProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const transitionCtx = useSearchTransitionSafe();
  const { mobileResultsView, registerOpenFilters } = useMobileSearch();
  const isPending = transitionCtx?.isPending ?? false;
  const isDesktopQuickFilters = useMediaQuery("(min-width: 768px)") === true;

  const [hasMounted, setHasMounted] = useState(false);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");

  const { pending, committed, isDirty, setPending, reset, commit } =
    useBatchedFilters({
      isDrawerOpen: showFilterDrawer,
    });

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

  const { facets } = useFacets({
    pending,
    isDrawerOpen: showFilterDrawer,
  });

  const {
    formattedCount,
    isLoading: isCountLoading,
    boundsRequired,
    count,
  } = useDebouncedFilterCount({
    pending,
    isDirty,
    isDrawerOpen: showFilterDrawer,
  });

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    // Results-page drawer should win over the header form while it is mounted.
    return registerOpenFilters(() => setShowFilterDrawer(true), 10);
  }, [registerOpenFilters]);

  useEffect(() => {
    if (!showFilterDrawer) {
      setLanguageSearch("");
    }
  }, [showFilterDrawer]);

  const activeCount = useMemo(
    () => countActiveFilters(searchParams),
    [searchParams]
  );
  // Use the media query result directly. SSR hydration mismatch is handled
  // by SearchViewToggle rendering children in both containers with inert on
  // the inactive one — no need to force desktop layout pre-mount here.
  const showDesktopQuickFilters = isDesktopQuickFilters;
  const showMobileInlineFilters =
    !showDesktopQuickFilters && mobileResultsView === "list";
  const chips = useMemo(() => urlToFilterChips(searchParams), [searchParams]);
  const hasActiveFilters = activeCount > 0;
  const showAppliedChips = chips.length > 0 && showMobileInlineFilters;
  const showInlineFilterStrip =
    showDesktopQuickFilters || showMobileInlineFilters || showAppliedChips;
  const pendingActiveCount = useMemo(
    () => countPendingActiveFilters(pending),
    [pending]
  );
  const drawerHasActiveFilters = pendingActiveCount > 0;

  const filteredLanguages = useMemo(() => {
    const search = languageSearch.toLowerCase().trim();
    if (!search) return LANGUAGE_CODES.map(String);

    return LANGUAGE_CODES.filter((code) => {
      const name = getLanguageName(code);
      return (
        name.toLowerCase().includes(search) ||
        code.toLowerCase().includes(search)
      );
    }).map(String);
  }, [languageSearch]);

  const priceAbsoluteMin = facets?.priceRanges?.min ?? 0;
  const priceAbsoluteMax = facets?.priceRanges?.max ?? 10000;
  const numericMinPrice = minPrice ? parseFloat(minPrice) : undefined;
  const numericMaxPrice = maxPrice ? parseFloat(maxPrice) : undefined;
  const committedMinPrice = committed.minPrice
    ? parseFloat(committed.minPrice)
    : undefined;
  const committedMaxPrice = committed.maxPrice
    ? parseFloat(committed.maxPrice)
    : undefined;
  const minMoveInDate = new Date().toLocaleDateString("en-CA");
  const visibleAppliedChips = showMobileInlineFilters
    ? chips.slice(0, 2)
    : chips;
  const hiddenAppliedChipCount = showMobileInlineFilters
    ? Math.max(chips.length - visibleAppliedChips.length, 0)
    : 0;

  const navigateToSearch = useCallback(
    (queryString: string) => {
      const url = `/search?${queryString}`;
      if (transitionCtx) {
        transitionCtx.navigateWithTransition(url, { reason: "filter" });
      } else {
        router.push(url);
      }
    },
    [router, transitionCtx]
  );

  const closeAdvancedDrawer = useCallback(() => {
    setShowFilterDrawer(false);
    reset();
    setLanguageSearch("");
  }, [reset]);

  const handleOpenFilters = useCallback(() => {
    setShowFilterDrawer(true);
  }, []);

  const handleRemoveChip = useCallback(
    (chip: (typeof chips)[0]) => {
      const newQuery = removeFilterFromUrl(searchParams, chip);
      navigateToSearch(newQuery);
    },
    [navigateToSearch, searchParams]
  );

  const handleClearAll = useCallback(() => {
    const newQuery = clearAllFilters(searchParams);
    setPending({ ...emptyFilterValues });
    setLanguageSearch("");

    if (!showFilterDrawer) {
      setShowFilterDrawer(false);
      reset();
    }

    navigateToSearch(newQuery);
  }, [navigateToSearch, reset, searchParams, setPending, showFilterDrawer]);

  const toggleAmenity = useCallback(
    (amenity: string) => {
      setPending((prev) => {
        const current = prev.amenities || [];
        const updated = current.includes(amenity)
          ? current.filter((item) => item !== amenity)
          : [...current, amenity];
        return { amenities: updated };
      });
    },
    [setPending]
  );

  const toggleHouseRule = useCallback(
    (rule: string) => {
      setPending((prev) => {
        const current = prev.houseRules || [];
        const updated = current.includes(rule)
          ? current.filter((item) => item !== rule)
          : [...current, rule];
        return { houseRules: updated };
      });
    },
    [setPending]
  );

  const toggleLanguage = useCallback(
    (language: string) => {
      setPending((prev) => {
        const current = prev.languages || [];
        const updated = current.includes(language)
          ? current.filter((item) => item !== language)
          : [...current, language];
        return { languages: updated };
      });
    },
    [setPending]
  );

  const handlePriceDraftChange = useCallback(
    (nextMin: number, nextMax: number) => {
      setPending({
        minPrice: nextMin <= priceAbsoluteMin ? "" : String(nextMin),
        maxPrice: nextMax >= priceAbsoluteMax ? "" : String(nextMax),
      });
    },
    [priceAbsoluteMax, priceAbsoluteMin, setPending]
  );

  const renderDesktopHeading = () => {
    const total = desktopSummary?.total ?? null;
    const resolvedTotal = total === null ? "100+" : total;
    const noun = total === 1 ? "place" : "places";

    return (
      <section
        data-testid="desktop-results-heading-section"
        aria-label="Search results heading"
        className="border-b border-outline-variant/12 pb-4 pt-2 md:pb-5"
      >
        <h1
          id="search-results-heading"
          tabIndex={-1}
          className="font-display text-[clamp(1.9rem,1.55rem+0.95vw,2.5rem)] leading-none tracking-[-0.045em] text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-canvas"
        >
          {resolvedTotal} {noun}
        </h1>
      </section>
    );
  };

  const renderAppliedFilters = () => (
    <div
      data-testid="inline-applied-filters-row"
      role="region"
      aria-label="Applied filters"
      className="flex items-center gap-2 overflow-x-auto hide-scrollbar"
    >
      <div className="h-6 w-px shrink-0 bg-outline-variant/40" />
      {visibleAppliedChips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => handleRemoveChip(chip)}
          disabled={isPending}
          aria-label={`Remove filter: ${chip.label}`}
          className="flex min-h-[36px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-on-surface transition-colors hover:bg-primary/15"
        >
          <span className="max-w-[150px] truncate">{chip.label}</span>
          <X className="h-3 w-3 shrink-0 text-on-surface-variant" />
        </button>
      ))}
      {hiddenAppliedChipCount > 0 ? (
        <span className="flex min-h-[36px] shrink-0 items-center whitespace-nowrap rounded-full border border-outline-variant/20 bg-surface-container-high px-3 py-2 text-sm text-on-surface-variant">
          +{hiddenAppliedChipCount} more
        </span>
      ) : null}
      {chips.length > 1 ? (
        <button
          type="button"
          onClick={handleClearAll}
          disabled={isPending}
          aria-label="Clear all filters"
          className="flex min-h-[44px] shrink-0 items-center whitespace-nowrap px-3 py-1.5 text-xs text-on-surface-variant transition-colors hover:text-on-surface"
        >
          Clear all
        </button>
      ) : null}
    </div>
  );

  return (
    <>
      {showInlineFilterStrip ? (
        showDesktopQuickFilters ? (
          renderDesktopHeading()
        ) : (
          <div className="hide-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-2">
            {showMobileInlineFilters ? (
              <>
                <PrimaryFilterButton
                  label={formatPriceQuickLabel(
                    committedMinPrice,
                    committedMaxPrice
                  )}
                  active={
                    searchParams.has("minPrice") || searchParams.has("maxPrice")
                  }
                  onClick={handleOpenFilters}
                  disabled={isPending}
                  testId="mobile-filter-price"
                />
                <PrimaryFilterButton
                  label={formatMoveInQuickLabel(committed.moveInDate)}
                  active={searchParams.has("moveInDate")}
                  onClick={handleOpenFilters}
                  disabled={isPending}
                  testId="mobile-filter-move-in"
                />
                <PrimaryFilterButton
                  label={formatRoomTypeQuickLabel(committed.roomType)}
                  active={searchParams.has("roomType")}
                  onClick={handleOpenFilters}
                  disabled={isPending}
                  testId="mobile-filter-room-type"
                />

                <div className="h-6 w-px shrink-0 bg-outline-variant/40" />

                <button
                  type="button"
                  onClick={handleOpenFilters}
                  disabled={isPending}
                  data-hydrated={hasMounted || undefined}
                  aria-label={`Filters${activeCount > 0 ? `, ${activeCount} active` : ""}`}
                  aria-expanded={showFilterDrawer ? "true" : "false"}
                  aria-controls="search-filters"
                  aria-haspopup="dialog"
                  data-testid="mobile-filter-button"
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0 border",
                    activeCount > 0
                      ? QUICK_FILTER_ACTIVE_CLASSNAME
                      : "bg-surface-container-lowest text-on-surface border-outline-variant hover:border-on-surface-variant"
                  )}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                  Filters
                  {activeCount > 0 ? (
                    <span
                      className={cn(
                        "ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
                        QUICK_FILTER_ACTIVE_BADGE_CLASSNAME
                      )}
                    >
                      {activeCount}
                    </span>
                  ) : null}
                </button>
              </>
            ) : null}

            {showAppliedChips ? renderAppliedFilters() : null}
          </div>
        )
      ) : null}

      <FilterModal
        isOpen={showFilterDrawer}
        onClose={closeAdvancedDrawer}
        onApply={() => {
          commit();
          setShowFilterDrawer(false);
        }}
        onClearAll={handleClearAll}
        hasActiveFilters={
          showFilterDrawer ? drawerHasActiveFilters : hasActiveFilters
        }
        activeFilterCount={showFilterDrawer ? pendingActiveCount : activeCount}
        moveInDate={moveInDate}
        leaseDuration={leaseDuration}
        roomType={roomType}
        amenities={amenities}
        houseRules={houseRules}
        languages={languages}
        genderPreference={genderPreference}
        householdGender={householdGender}
        minSlots={minSlots ? parseInt(minSlots, 10) || undefined : undefined}
        onMinSlotsChange={(value) =>
          setPending({ minSlots: value !== undefined ? String(value) : "" })
        }
        onMoveInDateChange={(value: string) =>
          setPending({ moveInDate: value })
        }
        onLeaseDurationChange={(value: string) =>
          setPending({ leaseDuration: value === "any" ? "" : value })
        }
        onRoomTypeChange={(value: string) =>
          setPending({ roomType: value === "any" ? "" : value })
        }
        onToggleAmenity={toggleAmenity}
        onToggleHouseRule={toggleHouseRule}
        onToggleLanguage={toggleLanguage}
        onGenderPreferenceChange={(value: string) =>
          setPending({ genderPreference: value === "any" ? "" : value })
        }
        onHouseholdGenderChange={(value: string) =>
          setPending({ householdGender: value === "any" ? "" : value })
        }
        languageSearch={languageSearch}
        onLanguageSearchChange={setLanguageSearch}
        filteredLanguages={filteredLanguages}
        minMoveInDate={minMoveInDate}
        amenityOptions={VALID_AMENITIES}
        houseRuleOptions={VALID_HOUSE_RULES}
        minPrice={numericMinPrice}
        maxPrice={numericMaxPrice}
        priceAbsoluteMin={priceAbsoluteMin}
        priceAbsoluteMax={priceAbsoluteMax}
        priceHistogram={facets?.priceHistogram?.buckets ?? null}
        onPriceChange={handlePriceDraftChange}
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
      />
    </>
  );
}
