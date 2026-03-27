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
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-600" />
        <p className="text-sm font-medium text-amber-800">
          No exact matches for these filters
        </p>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {visible.map((s, i) => (
          <button
            key={`${s.type}-${i}`}
            type="button"
            onClick={() => onRemoveSuggestion(s)}
            className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-surface-container-lowest px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
          >
            {s.label}
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
