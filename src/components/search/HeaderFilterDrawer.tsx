"use client";

import { useCallback, useMemo, useState } from "react";
import FilterModal from "@/components/search/FilterModal";
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

const LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGES) as LanguageCode[];

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

interface HeaderFilterDrawerProps {
  isOpen: boolean;
  activeFilterCount: number;
  onClose: () => void;
}

export function HeaderFilterDrawer({
  isOpen,
  activeFilterCount,
  onClose,
}: HeaderFilterDrawerProps) {
  const [languageSearch, setLanguageSearch] = useState("");
  const { pending, isDirty, setPending, commit } = useBatchedFilters({
    isDrawerOpen: isOpen,
  });
  const { facets } = useFacets({
    pending,
    isDrawerOpen: isOpen,
  });
  const {
    formattedCount,
    isLoading: isCountLoading,
    boundsRequired,
    count,
  } = useDebouncedFilterCount({
    pending,
    isDirty,
    isDrawerOpen: isOpen,
  });

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
  const minMoveInDate = new Date().toLocaleDateString("en-CA");
  const minEndDate = moveInDate || minMoveInDate;
  const pendingActiveCount = useMemo(
    () => countPendingActiveFilters(pending),
    [pending]
  );

  const closeDrawer = useCallback(() => {
    setLanguageSearch("");
    onClose();
  }, [onClose]);

  const handleApply = useCallback(() => {
    commit();
    closeDrawer();
  }, [closeDrawer, commit]);

  const handleClearAll = useCallback(() => {
    setPending({ ...emptyFilterValues });
    commit({ ...emptyFilterValues });
    closeDrawer();
  }, [closeDrawer, commit, setPending]);

  const handlePriceChange = useCallback(
    (nextMin: number, nextMax: number) => {
      setPending({
        minPrice: nextMin <= priceAbsoluteMin ? "" : String(nextMin),
        maxPrice: nextMax >= priceAbsoluteMax ? "" : String(nextMax),
      });
    },
    [priceAbsoluteMax, priceAbsoluteMin, setPending]
  );

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

  return (
    <FilterModal
      isOpen={isOpen}
      onClose={closeDrawer}
      onApply={handleApply}
      onClearAll={handleClearAll}
      hasActiveFilters={isOpen ? pendingActiveCount > 0 : activeFilterCount > 0}
      activeFilterCount={isOpen ? pendingActiveCount : activeFilterCount}
      moveInDate={moveInDate}
      endDate={endDate}
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
      onMoveInDateChange={(value) =>
        setPending((prev) => ({
          moveInDate: value,
          endDate:
            prev.endDate && value && prev.endDate > value ? prev.endDate : "",
        }))
      }
      onEndDateChange={(value) => setPending({ endDate: value })}
      onLeaseDurationChange={(value) =>
        setPending({ leaseDuration: value === "any" ? "" : value })
      }
      onRoomTypeChange={(value) =>
        setPending({ roomType: value === "any" ? "" : value })
      }
      onToggleAmenity={toggleAmenity}
      onToggleHouseRule={toggleHouseRule}
      onToggleLanguage={toggleLanguage}
      onGenderPreferenceChange={(value) =>
        setPending({ genderPreference: value === "any" ? "" : value })
      }
      onHouseholdGenderChange={(value) =>
        setPending({ householdGender: value === "any" ? "" : value })
      }
      languageSearch={languageSearch}
      onLanguageSearchChange={setLanguageSearch}
      filteredLanguages={filteredLanguages}
      minMoveInDate={minMoveInDate}
      minEndDate={minEndDate}
      amenityOptions={VALID_AMENITIES}
      houseRuleOptions={VALID_HOUSE_RULES}
      minPrice={numericMinPrice}
      maxPrice={numericMaxPrice}
      priceAbsoluteMin={priceAbsoluteMin}
      priceAbsoluteMax={priceAbsoluteMax}
      priceHistogram={facets?.priceHistogram?.buckets ?? null}
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
    />
  );
}
