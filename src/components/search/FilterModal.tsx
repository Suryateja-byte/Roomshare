"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { X, Minus, Plus } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FocusTrap } from "@/components/ui/FocusTrap";
import { DatePicker } from "@/components/ui/date-picker";
import { getLanguageName } from "@/lib/languages";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PriceRangeFilter } from "@/components/search/PriceRangeFilter";
import { DrawerZeroState } from "@/components/search/DrawerZeroState";
import type { PriceHistogramBucket } from "@/app/api/search/facets/route";
import type { FilterSuggestion } from "@/lib/near-matches";

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: () => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
  activeFilterCount: number;

  // Filter values
  moveInDate: string;
  endDate?: string;
  leaseDuration: string;
  roomType: string;
  amenities: string[];
  houseRules: string[];
  languages: string[];
  genderPreference: string;
  householdGender: string;

  // Minimum open spots
  minSlots?: number;
  onMinSlotsChange: (value: number | undefined) => void;

  // Handlers
  onMoveInDateChange: (value: string) => void;
  onEndDateChange?: (value: string) => void;
  onLeaseDurationChange: (value: string) => void;
  onRoomTypeChange: (value: string) => void;
  onToggleAmenity: (amenity: string) => void;
  onToggleHouseRule: (rule: string) => void;
  onToggleLanguage: (lang: string) => void;
  onGenderPreferenceChange: (value: string) => void;
  onHouseholdGenderChange: (value: string) => void;

  // Language search
  languageSearch: string;
  onLanguageSearchChange: (value: string) => void;
  filteredLanguages: string[];

  // Config
  minMoveInDate: string;
  minEndDate?: string;
  amenityOptions: readonly string[];
  houseRuleOptions: readonly string[];

  // Price range filter
  minPrice?: number;
  maxPrice?: number;
  priceAbsoluteMin?: number;
  priceAbsoluteMax?: number;
  priceHistogram?: PriceHistogramBucket[] | null;
  onPriceChange?: (min: number, max: number) => void;

  // Facet counts for filter options
  facetCounts?: {
    amenities: Record<string, number>;
    houseRules: Record<string, number>;
    roomTypes: Record<string, number>;
  };

  // P3-NEW-b: Dynamic count display from useDebouncedFilterCount
  formattedCount?: string;
  isCountLoading?: boolean;
  boundsRequired?: boolean;

  // P4: Zero-count warning
  count?: number | null;
  drawerSuggestions?: FilterSuggestion[];
  onRemoveFilterSuggestion?: (suggestion: FilterSuggestion) => void;
}

/**
 * FilterModal - Presentational slide-out drawer for detailed filters
 *
 * Pure presentational component - all state and logic remains in SearchForm.
 * This extracts the filter drawer UI into a reusable component.
 */
export function FilterModal({
  isOpen,
  onClose,
  onApply,
  onClearAll,
  hasActiveFilters,
  activeFilterCount,
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
  onMinSlotsChange,
  onMoveInDateChange,
  onEndDateChange,
  onLeaseDurationChange,
  onRoomTypeChange,
  onToggleAmenity,
  onToggleHouseRule,
  onToggleLanguage,
  onGenderPreferenceChange,
  onHouseholdGenderChange,
  languageSearch,
  onLanguageSearchChange,
  filteredLanguages,
  minMoveInDate,
  minEndDate,
  amenityOptions,
  houseRuleOptions,
  // Price range
  minPrice: minPriceProp,
  maxPrice: maxPriceProp,
  priceAbsoluteMin = 0,
  priceAbsoluteMax = 10000,
  priceHistogram,
  onPriceChange,
  // Facet counts
  facetCounts,
  // P3-NEW-b: Dynamic count props
  formattedCount,
  isCountLoading,
  boundsRequired,
  // P4: Zero-count warning
  count,
  drawerSuggestions,
  onRemoveFilterSuggestion,
}: FilterModalProps) {
  useBodyScrollLock(isOpen);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isMobile = isDesktop === false;
  const showEndDateField = Boolean(onEndDateChange);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // FE-004 FIX: Respect defaultPrevented so child components (Radix Select
      // dropdowns) can handle Escape without the modal also closing.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {isOpen && (
          <div
            className="fixed inset-0 z-modal overflow-hidden"
            aria-labelledby="filter-drawer-title"
            role="dialog"
            aria-modal="true"
          >
            {/* Backdrop */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 z-0 bg-on-surface/40 backdrop-blur-sm"
              onClick={onClose}
              aria-hidden="true"
            />

            {/* Drawer Panel */}
            <FocusTrap active={isOpen}>
              <m.div
                id="search-filters"
                initial={isMobile ? { y: "100%" } : { x: "100%" }}
                animate={isMobile ? { y: 0 } : { x: 0 }}
                exit={isMobile ? { y: "100%" } : { x: "100%" }}
                transition={
                  isMobile
                    ? { type: "spring", damping: 25, stiffness: 300, mass: 0.8 }
                    : { type: "tween", duration: 0.3, ease: "easeOut" }
                }
                className={
                  isMobile
                    ? "fixed inset-0 z-[1200] bg-surface-container-lowest flex flex-col md:hidden pt-[env(safe-area-inset-top,0px)]"
                    : "absolute right-0 top-0 z-10 h-full w-full max-w-md bg-surface-container-lowest shadow-ghost overflow-hidden flex flex-col pt-[env(safe-area-inset-top,0px)]"
                }
              >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-outline-variant/20 bg-surface-container-lowest">
            <h2
              id="filter-drawer-title"
              className="text-lg font-semibold text-on-surface"
            >
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center min-w-[24px] h-6 px-2 text-sm font-semibold rounded-full bg-primary text-white">
                  {activeFilterCount}
                </span>
              )}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-full w-9 h-9 p-0 hover:bg-surface-container-high transition-colors"
              aria-label="Close filters"
            >
              <X className="w-5 h-5 text-on-surface-variant" />
            </Button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 hide-scrollbar-mobile">
            {/* Price Range */}
            {onPriceChange && (
              <PriceRangeFilter
                minPrice={minPriceProp ?? priceAbsoluteMin}
                maxPrice={maxPriceProp ?? priceAbsoluteMax}
                absoluteMin={priceAbsoluteMin}
                absoluteMax={priceAbsoluteMax}
                histogram={priceHistogram ?? null}
                onChange={onPriceChange}
              />
            )}

            {/* Move-in Date */}
            <div className="space-y-2">
              <label
                htmlFor="filter-move-in"
                className="text-sm font-semibold text-on-surface"
              >
                Move-in Date
              </label>
              <DatePicker
                id="filter-move-in"
                value={moveInDate}
                onChange={onMoveInDateChange}
                placeholder="Select move-in date"
                minDate={minMoveInDate}
              />
            </div>

            {showEndDateField && (
              <div className="space-y-2">
                <label
                  htmlFor="filter-end-date"
                  className="text-sm font-semibold text-on-surface"
                >
                  End Date
                </label>
                <DatePicker
                  id="filter-end-date"
                  value={endDate}
                  onChange={onEndDateChange!}
                  placeholder="Select end date"
                  minDate={minEndDate ?? minMoveInDate}
                />
              </div>
            )}

            {/* Lease Duration */}
            <div className="space-y-2">
              <label
                htmlFor="filter-lease"
                className="text-sm font-semibold text-on-surface"
              >
                Lease Duration
              </label>
              <Select
                value={leaseDuration}
                onValueChange={onLeaseDurationChange}
              >
                <SelectTrigger id="filter-lease" aria-label="Lease Duration">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="Month-to-month">Month-to-month</SelectItem>
                  <SelectItem value="3 months">3 months</SelectItem>
                  <SelectItem value="6 months">6 months</SelectItem>
                  <SelectItem value="12 months">12 months</SelectItem>
                  <SelectItem value="Flexible">Flexible</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Room Type */}
            <div className="space-y-2">
              <label
                htmlFor="filter-room-type"
                className="text-sm font-semibold text-on-surface"
              >
                Room Type
              </label>
              <Select value={roomType} onValueChange={onRoomTypeChange}>
                <SelectTrigger id="filter-room-type" aria-label="Room Type">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {(
                    ["Private Room", "Shared Room", "Entire Place"] as const
                  ).map((type) => {
                    const count = facetCounts?.roomTypes?.[type];
                    const isZero = count === 0;
                    return (
                      <SelectItem
                        key={type}
                        value={type}
                        disabled={isZero && roomType !== type}
                      >
                        {type}
                        {count !== undefined && (
                          <span className="ml-1 text-xs text-on-surface-variant">
                            ({count})
                          </span>
                        )}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Minimum Open Spots */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-on-surface">
                Minimum Open Spots
              </label>
              <p className="text-xs text-on-surface-variant -mt-1">
                Show listings with at least this many available spots
              </p>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (minSlots === undefined || minSlots <= 2) {
                      onMinSlotsChange(undefined);
                    } else {
                      onMinSlotsChange(minSlots - 1);
                    }
                  }}
                  disabled={minSlots === undefined}
                  aria-label="Decrease minimum spots"
                  className="h-9 w-9 rounded-full"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="min-w-[3rem] text-center text-sm font-medium text-on-surface">
                  {minSlots === undefined ? "Any" : minSlots}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (minSlots === undefined) {
                      onMinSlotsChange(2);
                    } else if (minSlots < 10) {
                      onMinSlotsChange(minSlots + 1);
                    }
                  }}
                  disabled={minSlots !== undefined && minSlots >= 10}
                  aria-label="Increase minimum spots"
                  className="h-9 w-9 rounded-full"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Amenities */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-on-surface">
                Amenities
              </legend>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Select amenities"
              >
                {amenityOptions.map((amenity) => {
                  const count = facetCounts?.amenities?.[amenity];
                  const isZero = count === 0;
                  const isActive = amenities.includes(amenity);
                  return (
                    <Button
                      key={amenity}
                      type="button"
                      variant="filter"
                      onClick={() => !isZero && onToggleAmenity(amenity)}
                      data-active={isActive}
                      aria-pressed={isActive}
                      aria-disabled={isZero}
                      disabled={isZero && !isActive}
                      className={`rounded-full h-auto py-2 px-3 text-sm font-medium transition-all duration-200 ${
                        isActive ? "scale-[1.02]" : "hover:scale-[1.02]"
                      } ${isZero && !isActive ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      {amenity}
                      {count !== undefined && !isActive && (
                        <span className="ml-1 text-xs text-on-surface-variant">
                          ({count})
                        </span>
                      )}
                      {isActive && <X className="w-3.5 h-3.5 ml-1.5" />}
                    </Button>
                  );
                })}
              </div>
            </fieldset>

            {/* House Rules */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-on-surface">
                House Rules
              </legend>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Select house rules"
              >
                {houseRuleOptions.map((rule) => {
                  const count = facetCounts?.houseRules?.[rule];
                  const isZero = count === 0;
                  const isActive = houseRules.includes(rule);
                  return (
                    <Button
                      key={rule}
                      type="button"
                      variant="filter"
                      onClick={() => !isZero && onToggleHouseRule(rule)}
                      data-active={isActive}
                      aria-pressed={isActive}
                      aria-disabled={isZero}
                      disabled={isZero && !isActive}
                      className={`rounded-full h-auto py-2 px-3 text-sm font-medium transition-all duration-200 ${
                        isActive ? "scale-[1.02]" : "hover:scale-[1.02]"
                      } ${isZero && !isActive ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      {rule}
                      {count !== undefined && !isActive && (
                        <span className="ml-1 text-xs text-on-surface-variant">
                          ({count})
                        </span>
                      )}
                      {isActive && <X className="w-3.5 h-3.5 ml-1.5" />}
                    </Button>
                  );
                })}
              </div>
            </fieldset>

            {/* Languages */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-on-surface">
                Can Communicate In
              </legend>
              <p className="text-xs text-on-surface-variant -mt-1">
                Show listings where household speaks any of these
              </p>

              {/* Selected languages */}
              {languages.length > 0 && (
                <div
                  className="flex flex-wrap gap-2 pb-2 border-outline-variant/20"
                  role="group"
                  aria-label="Selected languages"
                >
                  {languages.map((code) => (
                    <Button
                      key={code}
                      type="button"
                      variant="filter"
                      onClick={() => onToggleLanguage(code)}
                      data-active={true}
                      aria-pressed={true}
                      className="rounded-full h-auto py-2 px-3 text-sm font-medium"
                    >
                      {getLanguageName(code)}
                      <X className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  ))}
                </div>
              )}

              {/* Search input */}
              <Input
                type="text"
                placeholder="Search languages..."
                value={languageSearch}
                onChange={(e) => onLanguageSearchChange(e.target.value)}
                className="h-9"
              />

              {/* Language chips */}
              <div
                className="flex flex-wrap gap-2 max-h-36 overflow-y-auto"
                role="group"
                aria-label="Available languages"
              >
                {filteredLanguages
                  .filter((code) => !languages.includes(code))
                  .map((code) => (
                    <Button
                      key={code}
                      type="button"
                      variant="filter"
                      onClick={() => onToggleLanguage(code)}
                      data-active={false}
                      aria-pressed={false}
                      className="rounded-full h-auto py-2 px-3 text-sm font-medium transition-all duration-200 hover:scale-[1.02]"
                    >
                      {getLanguageName(code)}
                    </Button>
                  ))}
                {filteredLanguages.filter((code) => !languages.includes(code))
                  .length === 0 && (
                  <p className="text-sm text-on-surface-variant">
                    {languageSearch
                      ? "No languages found"
                      : "All languages selected"}
                  </p>
                )}
              </div>
            </fieldset>

            {/* Gender Preference */}
            <div className="space-y-2">
              <label
                htmlFor="filter-gender-pref"
                className="text-sm font-semibold text-on-surface"
              >
                Gender Preference
              </label>
              <Select
                value={genderPreference}
                onValueChange={onGenderPreferenceChange}
              >
                <SelectTrigger
                  id="filter-gender-pref"
                  aria-label="Gender Preference"
                >
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="MALE_ONLY">
                    Male Identifying Only
                  </SelectItem>
                  <SelectItem value="FEMALE_ONLY">
                    Female Identifying Only
                  </SelectItem>
                  <SelectItem value="NO_PREFERENCE">
                    Any Gender / All Welcome
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Household Gender */}
            <div className="space-y-2">
              <label
                htmlFor="filter-household-gender"
                className="text-sm font-semibold text-on-surface"
              >
                Household Gender
              </label>
              <Select
                value={householdGender}
                onValueChange={onHouseholdGenderChange}
              >
                <SelectTrigger
                  id="filter-household-gender"
                  aria-label="Household Gender"
                >
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="ALL_MALE">All Male</SelectItem>
                  <SelectItem value="ALL_FEMALE">All Female</SelectItem>
                  <SelectItem value="MIXED">Mixed (Co-ed)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] border-outline-variant/20 bg-surface-container-lowest space-y-3">
            {count === 0 &&
              !isCountLoading &&
              drawerSuggestions &&
              drawerSuggestions.length > 0 &&
              onRemoveFilterSuggestion && (
                <DrawerZeroState
                  suggestions={drawerSuggestions}
                  onRemoveSuggestion={onRemoveFilterSuggestion}
                />
              )}
            <div className="flex items-center gap-3">
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClearAll}
                  className="flex-1 rounded-xl h-12"
                  data-testid="filter-modal-clear-all"
                >
                  Clear all
                </Button>
              )}
              <Button
                type="button"
                onClick={onApply}
                disabled={boundsRequired}
                className={`flex-1 rounded-xl h-12 text-white shadow-ambient disabled:opacity-60 disabled:cursor-not-allowed ${
                  count === 0 && !isCountLoading
                    ? "bg-amber-500 hover:bg-amber-600"
                    : "bg-primary hover:bg-primary"
                }`}
                data-testid="filter-modal-apply"
              >
                {isCountLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {formattedCount || "listings"}
                  </span>
                ) : (
                  formattedCount || "Show Results"
                )}
              </Button>
            </div>
          </div>
        </m.div>
      </FocusTrap>
          </div>
        )}
      </AnimatePresence>
    </LazyMotion>,
    document.body
  );
}

export default FilterModal;
