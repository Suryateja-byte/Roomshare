'use client';

import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterPill } from './FilterPill';
import { CategoryTabs } from './CategoryTabs';
import { getLanguageName } from '@/lib/languages';

interface ActiveFilter {
  type: string;
  value: string;
  label: string;
}

interface FilterBarProps {
  // Filter values
  roomType: string;
  leaseDuration: string;
  moveInDate: string;
  amenities: string[];
  houseRules: string[];
  languages: string[];
  genderPreference: string;
  householdGender: string;

  // Handlers - all logic remains in parent
  onRoomTypeChange: (value: string) => void;
  onRemoveFilter: (type: string, value?: string) => void;
  onOpenFilters: () => void;
  onClearAll: () => void;

  // State
  activeFilterCount: number;
  showFiltersOpen: boolean;
}

// Map enum values to display labels
const GENDER_PREFERENCE_LABELS: Record<string, string> = {
  'MALE_ONLY': 'Male Only',
  'FEMALE_ONLY': 'Female Only',
  'NO_PREFERENCE': 'Any Gender',
};

const HOUSEHOLD_GENDER_LABELS: Record<string, string> = {
  'ALL_MALE': 'All Male',
  'ALL_FEMALE': 'All Female',
  'MIXED': 'Mixed',
};

/**
 * FilterBar - Horizontal filter bar with category tabs and active filter pills
 *
 * Presentational component - all filter state and logic remains in SearchForm.
 * This component only renders UI and calls handlers via props.
 */
export function FilterBar({
  roomType,
  leaseDuration,
  moveInDate,
  amenities,
  houseRules,
  languages,
  genderPreference,
  householdGender,
  onRoomTypeChange,
  onRemoveFilter,
  onOpenFilters,
  onClearAll,
  activeFilterCount,
  showFiltersOpen,
}: FilterBarProps) {
  // Build list of active filters for pills
  const activeFilters: ActiveFilter[] = [];

  if (leaseDuration && leaseDuration !== 'any') {
    activeFilters.push({ type: 'leaseDuration', value: leaseDuration, label: leaseDuration });
  }

  if (moveInDate) {
    const date = new Date(moveInDate);
    const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    activeFilters.push({ type: 'moveInDate', value: moveInDate, label: `Move-in: ${formattedDate}` });
  }

  amenities.forEach(amenity => {
    activeFilters.push({ type: 'amenity', value: amenity, label: amenity });
  });

  houseRules.forEach(rule => {
    activeFilters.push({ type: 'houseRule', value: rule, label: rule });
  });

  languages.forEach(lang => {
    activeFilters.push({ type: 'language', value: lang, label: getLanguageName(lang) });
  });

  if (genderPreference && genderPreference !== 'any') {
    activeFilters.push({
      type: 'genderPreference',
      value: genderPreference,
      label: GENDER_PREFERENCE_LABELS[genderPreference] || genderPreference,
    });
  }

  if (householdGender && householdGender !== 'any') {
    activeFilters.push({
      type: 'householdGender',
      value: householdGender,
      label: HOUSEHOLD_GENDER_LABELS[householdGender] || householdGender,
    });
  }

  const hasActiveFilters = activeFilters.length > 0;

  return (
    <div className="w-full border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3">
          {/* Category Quick Tabs */}
          <CategoryTabs
            selectedRoomType={roomType}
            onRoomTypeChange={onRoomTypeChange}
          />

          {/* Divider */}
          <div className="h-8 w-px bg-zinc-200 dark:bg-zinc-700 hidden sm:block" />

          {/* Active Filter Pills - Horizontal scroll on mobile */}
          {hasActiveFilters && (
            <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-2 pb-1">
                {activeFilters.map((filter, idx) => (
                  <FilterPill
                    key={`${filter.type}-${filter.value}-${idx}`}
                    label={filter.label}
                    onRemove={() => onRemoveFilter(filter.type, filter.value)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Spacer when no active filters */}
          {!hasActiveFilters && <div className="flex-1" />}

          {/* More Filters Button */}
          <Button
            type="button"
            variant="outline"
            onClick={onOpenFilters}
            className={`
              flex items-center gap-2 rounded-full h-9 px-4 text-sm font-medium
              transition-all duration-200 flex-shrink-0
              ${showFiltersOpen
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-900 dark:border-white'
                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }
            `}
            aria-expanded={showFiltersOpen}
            aria-controls="search-filters"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">More Filters</span>
            {activeFilterCount > 0 && (
              <span className={`
                inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold rounded-full
                ${showFiltersOpen
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white'
                  : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                }
              `}>
                {activeFilterCount}
              </span>
            )}
          </Button>

          {/* Clear All */}
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              onClick={onClearAll}
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white flex-shrink-0"
              data-testid="filter-bar-clear-all"
            >
              Clear all
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default FilterBar;
