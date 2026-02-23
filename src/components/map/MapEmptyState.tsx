'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  urlToFilterChips,
  clearAllFilters,
} from '@/components/filters/filter-chip-utils';
import { getPriceParam } from '@/lib/search-params';

const MAX_VISIBLE_CHIPS = 3;

interface MapEmptyStateProps {
  onZoomOut: () => void;
  searchParams: URLSearchParams;
}

export function MapEmptyState({ onZoomOut, searchParams }: MapEmptyStateProps) {
  const router = useRouter();

  const chips = useMemo(() => urlToFilterChips(searchParams), [searchParams]);
  const filtersActive = chips.length > 0;
  const visibleChips = chips.slice(0, MAX_VISIBLE_CHIPS);
  const overflowCount = chips.length - MAX_VISIBLE_CHIPS;

  // Near matches: show toggle when price or date filters are active and nearMatches not already on
  const hasPriceOrDateFilter = useMemo(() => {
    const hasPrice = getPriceParam(searchParams, 'min') !== undefined || getPriceParam(searchParams, 'max') !== undefined;
    const hasDate = !!searchParams.get('moveInDate');
    return hasPrice || hasDate;
  }, [searchParams]);
  const nearMatchesAlreadyOn = searchParams.get('nearMatches') === '1';
  const showNearMatches = hasPriceOrDateFilter && !nearMatchesAlreadyOn;

  const handleClearFilters = () => {
    const cleared = clearAllFilters(searchParams);
    router.push('/search?' + cleared);
  };

  const handleNearMatches = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('nearMatches', '1');
    router.push('/search?' + newParams.toString());
  };

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 px-5 py-4 max-w-[320px] text-center pointer-events-auto">
      <MapPin className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" aria-hidden="true" />
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">No listings in this area</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">Try zooming out or adjusting your filters</p>

      {/* Active filter chips */}
      {filtersActive && (
        <div className="flex flex-wrap gap-1.5 justify-center mb-3" data-testid="filter-chips">
          {visibleChips.map((chip) => (
            <span
              key={chip.id}
              data-testid="filter-chip"
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
            >
              {chip.label}
            </span>
          ))}
          {overflowCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400">
              +{overflowCount} more
            </span>
          )}
        </div>
      )}

      <div className="flex gap-2 justify-center flex-wrap">
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-8"
          onClick={onZoomOut}
        >
          Zoom out
        </Button>
        {filtersActive && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-8"
            onClick={handleClearFilters}
          >
            Clear filters
          </Button>
        )}
        {showNearMatches && (
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-8"
            onClick={handleNearMatches}
          >
            <Sparkles className="w-3 h-3 mr-1" aria-hidden="true" />
            Include near matches
          </Button>
        )}
      </div>
    </div>
  );
}
