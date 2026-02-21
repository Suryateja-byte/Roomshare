'use client';

import { useCallback } from 'react';

interface TotalPriceToggleProps {
  showTotal: boolean;
  onToggle: (showTotal: boolean) => void;
}

/**
 * TotalPriceToggle — Switch between nightly and total price display.
 * Renders as a compact toggle in the search results header.
 */
export function TotalPriceToggle({ showTotal, onToggle }: TotalPriceToggleProps) {
  const handleToggle = useCallback(() => {
    const next = !showTotal;
    onToggle(next);
    try {
      sessionStorage.setItem('showTotalPrice', JSON.stringify(next));
    } catch {
      // sessionStorage unavailable (SSR, private browsing)
    }
  }, [showTotal, onToggle]);

  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">
        Show total price
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={showTotal}
        onClick={handleToggle}
        className={`
          relative inline-flex h-5 w-9 shrink-0 items-center rounded-full
          transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2
          ${showTotal
            ? 'bg-zinc-900 dark:bg-white'
            : 'bg-zinc-300 dark:bg-zinc-600'
          }
        `}
      >
        <span
          className={`
            inline-block h-3.5 w-3.5 rounded-full bg-white dark:bg-zinc-900 shadow-sm
            transition-transform duration-200
            ${showTotal ? 'translate-x-[18px]' : 'translate-x-[3px]'}
          `}
        />
      </button>
    </label>
  );
}

export default TotalPriceToggle;
