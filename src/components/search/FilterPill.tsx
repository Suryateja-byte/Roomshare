'use client';

import { X } from 'lucide-react';

interface FilterPillProps {
  label: string;
  value?: string;
  onRemove: () => void;
  variant?: 'default' | 'active';
}

/**
 * FilterPill - Presentational component for displaying an active filter
 *
 * Pure component that receives props - no internal state management.
 * All filter logic remains in SearchForm.
 */
export function FilterPill({ label, value, onRemove, variant = 'active' }: FilterPillProps) {
  const displayText = value ? `${label}: ${value}` : label;

  return (
    <button
      type="button"
      onClick={onRemove}
      className={`
        group flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
        transition-all duration-200 whitespace-nowrap
        ${variant === 'active'
          ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200'
          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
        }
      `}
      aria-label={`Remove ${displayText} filter`}
    >
      <span className="truncate max-w-[150px]">{displayText}</span>
      <X className="w-3.5 h-3.5 flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

export default FilterPill;
