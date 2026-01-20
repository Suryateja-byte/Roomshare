"use client";

/**
 * AppliedFilterChips - Container for displaying applied filter chips
 *
 * Reads committed filter state from the URL and displays each filter
 * as a removable chip. Includes horizontal scrolling on mobile with
 * fade edges and a "Clear All" button when multiple filters are active.
 */

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { X } from "lucide-react";
import { FilterChipWithImpact } from "./FilterChipWithImpact";
import {
  urlToFilterChips,
  removeFilterFromUrl,
  clearAllFilters,
  type FilterChipData,
} from "./filter-chip-utils";

export interface AppliedFilterChipsProps {
  /** Current result count (for calculating impact delta on hover) */
  currentCount?: number | null;
}

export function AppliedFilterChips({
  currentCount = null,
}: AppliedFilterChipsProps = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const chips = urlToFilterChips(searchParams);

  // Don't render if no chips
  if (chips.length === 0) {
    return null;
  }

  const handleRemove = (chip: FilterChipData) => {
    const newQuery = removeFilterFromUrl(searchParams, chip);
    startTransition(() => {
      router.push(`${pathname}${newQuery ? `?${newQuery}` : ""}`);
    });
  };

  const handleClearAll = () => {
    const newQuery = clearAllFilters(searchParams);
    startTransition(() => {
      router.push(`${pathname}${newQuery ? `?${newQuery}` : ""}`);
    });
  };

  return (
    <div
      className="relative px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950"
      role="region"
      aria-label="Applied filters"
    >
      {/* Horizontal scrolling container */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {/* Filter chips */}
        <div className="flex items-center gap-2 flex-nowrap">
          {chips.map((chip) => (
            <FilterChipWithImpact
              key={chip.id}
              chip={chip}
              onRemove={() => handleRemove(chip)}
              isRemoving={isPending}
              currentCount={currentCount}
            />
          ))}
        </div>

        {/* Clear All button - only show when multiple filters */}
        {chips.length > 1 && (
          <button
            type="button"
            onClick={handleClearAll}
            disabled={isPending}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Clear all filters"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Clear all</span>
          </button>
        )}
      </div>

      {/* Left fade edge (visible when scrolled) */}
      <div
        className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-white dark:from-zinc-950 to-transparent pointer-events-none opacity-0 md:hidden"
        aria-hidden="true"
      />

      {/* Right fade edge (visible when content overflows) */}
      <div
        className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-zinc-950 to-transparent pointer-events-none md:hidden"
        aria-hidden="true"
      />
    </div>
  );
}
