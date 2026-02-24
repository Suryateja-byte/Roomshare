import { AlertCircle, X } from "lucide-react";
import type { FilterSuggestion } from "@/lib/near-matches";

const MAX_PILLS = 2;

interface DrawerZeroStateProps {
  suggestions: FilterSuggestion[];
  onRemoveSuggestion: (suggestion: FilterSuggestion) => void;
}

export function DrawerZeroState({
  suggestions,
  onRemoveSuggestion,
}: DrawerZeroStateProps) {
  if (suggestions.length === 0) return null;

  const visible = suggestions.slice(0, MAX_PILLS);

  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          No exact matches for these filters
        </p>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {visible.map((s, i) => (
          <button
            key={`${s.type}-${i}`}
            type="button"
            onClick={() => onRemoveSuggestion(s)}
            className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-amber-800/50"
          >
            {s.label}
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
