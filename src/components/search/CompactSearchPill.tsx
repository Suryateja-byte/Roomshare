'use client';

import { Search, SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

interface CompactSearchPillProps {
  onExpand: () => void;
  onOpenFilters?: () => void;
}

/**
 * CompactSearchPill — Desktop-only shrunk search bar shown when scrolled.
 * Displays a summary of current search state; click expands back to full form.
 */
export function CompactSearchPill({ onExpand, onOpenFilters }: CompactSearchPillProps) {
  const searchParams = useSearchParams();

  const location = searchParams.get('q') || '';
  const minPrice = searchParams.get('minPrice');
  const maxPrice = searchParams.get('maxPrice');
  const roomType = searchParams.get('roomType');
  const leaseDuration = searchParams.get('leaseDuration');

  const segments = useMemo(() => {
    const parts: string[] = [];
    parts.push(location || 'Anywhere');
    if (minPrice && maxPrice) {
      parts.push(`$${minPrice}–$${maxPrice}`);
    } else if (minPrice) {
      parts.push(`$${minPrice}+`);
    } else if (maxPrice) {
      parts.push(`Up to $${maxPrice}`);
    }
    if (roomType && roomType !== 'any') parts.push(roomType);
    if (leaseDuration && leaseDuration !== 'any') parts.push(leaseDuration);
    return parts;
  }, [location, minPrice, maxPrice, roomType, leaseDuration]);

  // Count active filters
  const filterCount = useMemo(() => {
    let count = 0;
    const keys = ['moveInDate', 'leaseDuration', 'roomType', 'genderPreference', 'householdGender'];
    for (const key of keys) {
      const val = searchParams.get(key);
      if (val && val !== 'any') count++;
    }
    count += searchParams.getAll('amenities').filter(Boolean).length;
    count += searchParams.getAll('houseRules').filter(Boolean).length;
    if (minPrice) count++;
    if (maxPrice) count++;
    return count;
  }, [searchParams, minPrice, maxPrice]);

  return (
    <div className="hidden md:flex items-center gap-2 w-full max-w-2xl mx-auto">
      <button
        onClick={onExpand}
        className="flex-1 flex items-center gap-3 h-12 px-5 bg-white dark:bg-zinc-900 rounded-full shadow-sm border border-zinc-200 dark:border-zinc-700 hover:shadow-md transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 dark:focus-visible:ring-zinc-400/40 focus-visible:ring-offset-2"
        aria-label="Expand search form"
      >
        <Search className="w-4 h-4 text-zinc-500 flex-shrink-0" />
        <div className="flex items-center gap-2 min-w-0 text-sm">
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && (
                <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 flex-shrink-0" />
              )}
              <span
                className={`truncate ${
                  i === 0
                    ? 'font-medium text-zinc-900 dark:text-white'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {seg}
              </span>
            </span>
          ))}
        </div>
      </button>

      {onOpenFilters && (
        <button
          onClick={onOpenFilters}
          className="relative flex items-center justify-center w-12 h-12 bg-white dark:bg-zinc-900 rounded-full shadow-sm border border-zinc-200 dark:border-zinc-700 hover:shadow-md transition-shadow flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 dark:focus-visible:ring-zinc-400/40 focus-visible:ring-offset-2"
          aria-label={`Filters${filterCount > 0 ? ` (${filterCount} active)` : ''}`}
        >
          <SlidersHorizontal className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
          {filterCount > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-indigo-500 text-white">
              {filterCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

export default CompactSearchPill;
