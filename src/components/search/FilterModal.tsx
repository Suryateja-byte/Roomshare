'use client';

import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FocusTrap } from '@/components/ui/FocusTrap';
import { DatePicker } from '@/components/ui/date-picker';
import { getLanguageName } from '@/lib/languages';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PriceRangeFilter } from '@/components/search/PriceRangeFilter';
import type { PriceHistogramBucket } from '@/app/api/search/facets/route';

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: () => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
  activeFilterCount: number;

  // Filter values
  moveInDate: string;
  leaseDuration: string;
  roomType: string;
  amenities: string[];
  houseRules: string[];
  languages: string[];
  genderPreference: string;
  householdGender: string;

  // Handlers
  onMoveInDateChange: (value: string) => void;
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
  leaseDuration,
  roomType,
  amenities,
  houseRules,
  languages,
  genderPreference,
  householdGender,
  onMoveInDateChange,
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
}: FilterModalProps) {
  useBodyScrollLock(isOpen);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-modal overflow-hidden"
      aria-labelledby="filter-drawer-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
        aria-label="Close filters"
      />

      {/* Drawer Panel */}
      <FocusTrap active={isOpen}>
        <div
          id="search-filters"
          className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-zinc-900 shadow-2xl transform transition-transform duration-300 ease-out animate-in slide-in-from-right overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <h2 id="filter-drawer-title" className="text-lg font-semibold text-zinc-900 dark:text-white">
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center min-w-[24px] h-6 px-2 text-sm font-semibold rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900">
                  {activeFilterCount}
                </span>
              )}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-full w-9 h-9 p-0 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Close filters"
            >
              <X className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
            </Button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
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
              <label htmlFor="filter-move-in" className="text-sm font-semibold text-zinc-900 dark:text-white">
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

            {/* Lease Duration */}
            <div className="space-y-2">
              <label htmlFor="filter-lease" className="text-sm font-semibold text-zinc-900 dark:text-white">
                Lease Duration
              </label>
              <Select value={leaseDuration} onValueChange={onLeaseDurationChange}>
                <SelectTrigger id="filter-lease">
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
              <label htmlFor="filter-room-type" className="text-sm font-semibold text-zinc-900 dark:text-white">
                Room Type
              </label>
              <Select value={roomType} onValueChange={onRoomTypeChange}>
                <SelectTrigger id="filter-room-type">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {(['Private Room', 'Shared Room', 'Entire Place'] as const).map(type => {
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
                          <span className="ml-1 text-xs text-zinc-400 dark:text-zinc-500">({count})</span>
                        )}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Amenities */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-zinc-900 dark:text-white">Amenities</legend>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Select amenities">
                {amenityOptions.map(amenity => {
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
                        isActive ? 'scale-[1.02]' : 'hover:scale-[1.02]'
                      } ${isZero && !isActive ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {amenity}
                      {count !== undefined && !isActive && (
                        <span className="ml-1 text-xs text-zinc-400 dark:text-zinc-500">({count})</span>
                      )}
                      {isActive && (
                        <X className="w-3.5 h-3.5 ml-1.5" />
                      )}
                    </Button>
                  );
                })}
              </div>
            </fieldset>

            {/* House Rules */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-zinc-900 dark:text-white">House Rules</legend>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Select house rules">
                {houseRuleOptions.map(rule => {
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
                        isActive ? 'scale-[1.02]' : 'hover:scale-[1.02]'
                      } ${isZero && !isActive ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {rule}
                      {count !== undefined && !isActive && (
                        <span className="ml-1 text-xs text-zinc-400 dark:text-zinc-500">({count})</span>
                      )}
                      {isActive && (
                        <X className="w-3.5 h-3.5 ml-1.5" />
                      )}
                    </Button>
                  );
                })}
              </div>
            </fieldset>

            {/* Languages */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-zinc-900 dark:text-white">Can Communicate In</legend>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 -mt-1">
                Show listings where household speaks any of these
              </p>

              {/* Selected languages */}
              {languages.length > 0 && (
                <div
                  className="flex flex-wrap gap-2 pb-2 border-b border-zinc-200 dark:border-zinc-700"
                  role="group"
                  aria-label="Selected languages"
                >
                  {languages.map(code => (
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
                  .filter(code => !languages.includes(code))
                  .map(code => (
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
                {filteredLanguages.filter(code => !languages.includes(code)).length === 0 && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {languageSearch ? 'No languages found' : 'All languages selected'}
                  </p>
                )}
              </div>
            </fieldset>

            {/* Gender Preference */}
            <div className="space-y-2">
              <label htmlFor="filter-gender-pref" className="text-sm font-semibold text-zinc-900 dark:text-white">
                Gender Preference
              </label>
              <Select value={genderPreference} onValueChange={onGenderPreferenceChange}>
                <SelectTrigger id="filter-gender-pref">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="MALE_ONLY">Male Identifying Only</SelectItem>
                  <SelectItem value="FEMALE_ONLY">Female Identifying Only</SelectItem>
                  <SelectItem value="NO_PREFERENCE">Any Gender / All Welcome</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Household Gender */}
            <div className="space-y-2">
              <label htmlFor="filter-household-gender" className="text-sm font-semibold text-zinc-900 dark:text-white">
                Household Gender
              </label>
              <Select value={householdGender} onValueChange={onHouseholdGenderChange}>
                <SelectTrigger id="filter-household-gender">
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
          <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center gap-3">
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
              className="flex-1 rounded-xl h-12 bg-zinc-900 text-white hover:bg-zinc-800 shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
              data-testid="filter-modal-apply"
            >
              {isCountLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {formattedCount || 'listings'}
                </span>
              ) : (
                formattedCount || 'Show Results'
              )}
            </Button>
          </div>
        </div>
      </FocusTrap>
    </div>,
    document.body
  );
}

export default FilterModal;
