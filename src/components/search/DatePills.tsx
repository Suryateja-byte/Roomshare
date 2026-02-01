'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export interface DateSuggestion {
  /** Display label, e.g. "Feb 15 – Mar 15" */
  label: string;
  /** Average price for this date range */
  avgPrice: number;
  /** Search params to apply when selected */
  params: string;
}

interface DatePillsProps {
  suggestions: DateSuggestion[];
}

/**
 * DatePills — Horizontal scrollable row of alternative date suggestions.
 * Shows cheaper date ranges above search results to encourage flexibility.
 */
export function DatePills({ suggestions }: DatePillsProps) {
  const router = useRouter();
  const currentParams = useSearchParams();

  const handleSelect = useCallback(
    (params: string) => {
      const sp = new URLSearchParams(currentParams.toString());
      const newParams = new URLSearchParams(params);
      for (const [key, value] of newParams.entries()) {
        sp.set(key, value);
      }
      router.push(`/search?${sp.toString()}`);
    },
    [router, currentParams],
  );

  if (suggestions.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
        Flexible dates? Try these for lower prices:
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.params}
            type="button"
            onClick={() => handleSelect(suggestion.params)}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm transition-colors"
          >
            <span className="text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
              {suggestion.label}
            </span>
            <span className="text-xs text-green-600 dark:text-green-400 font-medium whitespace-nowrap">
              ~${suggestion.avgPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default DatePills;
