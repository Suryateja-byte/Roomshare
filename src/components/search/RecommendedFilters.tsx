'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useTransition, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { useSearchTransitionSafe } from '@/contexts/SearchTransitionContext';

/**
 * Filter suggestions with their corresponding URL param mappings.
 * Ordered by general popularity / usefulness.
 */
const SUGGESTIONS = [
  { label: 'Furnished', param: 'amenities', value: 'Furnished' },
  { label: 'Pet Friendly', param: 'houseRules', value: 'Pets allowed' },
  { label: 'Wifi', param: 'amenities', value: 'Wifi' },
  { label: 'Parking', param: 'amenities', value: 'Parking' },
  { label: 'Washer', param: 'amenities', value: 'Washer' },
  { label: 'Private Room', param: 'roomType', value: 'Private Room' },
  { label: 'Entire Place', param: 'roomType', value: 'Entire Place' },
  { label: 'Month-to-month', param: 'leaseDuration', value: 'Month-to-month' },
  { label: 'Under $1000', param: 'maxPrice', value: '1000' },
  { label: 'Couples OK', param: 'houseRules', value: 'Couples allowed' },
] as const;

const MAX_PILLS = 5;

function parseArrayParam(searchParams: URLSearchParams, key: string): string[] {
  return searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * RecommendedFilters — Shows contextual filter suggestion pills
 * above the search results. Only displays filters not yet applied.
 */
export function RecommendedFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const transitionContext = useSearchTransitionSafe();

  const available = useMemo(() => {
    return SUGGESTIONS.filter((s) => {
      // For array params, check if value is already in comma-separated list
      if (s.param === 'amenities' || s.param === 'houseRules') {
        const selected = parseArrayParam(searchParams, s.param);
        return !selected.includes(s.value);
      }
      // For scalar params
      if (s.param === 'maxPrice') {
        const existing = searchParams.get('maxPrice');
        return !existing || Number(existing) > Number(s.value);
      }
      // For scalar single-select params (roomType, leaseDuration),
      // hide if any value is already set for that param
      const current = searchParams.get(s.param) ?? '';
      return !current;
    }).slice(0, MAX_PILLS);
  }, [searchParams]);

  if (available.length === 0) return null;

  const handleClick = (suggestion: typeof SUGGESTIONS[number]) => {
    const params = new URLSearchParams(searchParams.toString());

    if (suggestion.param === 'amenities' || suggestion.param === 'houseRules') {
      const selected = parseArrayParam(params, suggestion.param);
      if (!selected.includes(suggestion.value)) {
        selected.push(suggestion.value);
      }
      params.delete(suggestion.param);
      if (selected.length > 0) {
        params.set(suggestion.param, selected.join(','));
      }
    } else {
      params.set(suggestion.param, suggestion.value);
    }

    // Reset pagination
    params.delete('cursor');
    params.delete('page');
    params.delete('cursorStack');
    params.delete('pageNumber');

    const url = `${pathname}${params.size ? `?${params.toString()}` : ''}`;
    if (transitionContext) {
      transitionContext.navigateWithTransition(url);
    } else {
      startTransition(() => {
        router.push(url);
      });
    }
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-2">
      <Sparkles className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" aria-hidden="true" />
      <span className="text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">Try:</span>
      {available.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={() => handleClick(s)}
          disabled={isPending}
          className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

export default RecommendedFilters;
