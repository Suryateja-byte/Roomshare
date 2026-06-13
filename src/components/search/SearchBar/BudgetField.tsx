"use client";

import { cn } from "@/lib/utils";
import { useSearchBarContext } from "./context";
import {
  SearchBarField,
  SEARCH_BAR_INPUT_CLASSES,
} from "./SearchBarField";
import type { SearchBarState } from "./useSearchBarState";

const PRICE_INPUT_CLASSES = cn(
  SEARCH_BAR_INPUT_CLASSES,
  "appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
);

function DollarPrefix({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "text-[16px] font-medium transition-colors duration-200 md:text-[15px]",
        active ? "text-on-surface" : "text-on-surface-variant/50"
      )}
    >
      $
    </span>
  );
}

// NOTE: budget inputs intentionally carry no `name` attribute. They are inert
// when hydrated, but with a hydration failure they would serialize into a
// confusing native-GET querystring (see tasks/lessons.md).
export function BudgetField({ state }: { state: SearchBarState }) {
  const { idPrefix, onFieldFocus, onFieldBlur } = useSearchBarContext();
  const minId = `${idPrefix}search-budget-min`;
  const maxId = `${idPrefix}search-budget-max`;

  return (
    <SearchBarField
      fieldId="budget"
      inputId={minId}
      label="Budget"
      labelFor={minId}
    >
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <DollarPrefix active={Boolean(state.minPrice)} />
          <input
            ref={state.minPriceInputRef}
            id={minId}
            aria-label="Minimum budget"
            type="number"
            inputMode="numeric"
            autoComplete="off"
            min="0"
            step="50"
            value={state.minPrice}
            onChange={(event) => state.onMinPriceChange(event.target.value)}
            onFocus={() => onFieldFocus("budget")}
            onBlur={onFieldBlur}
            placeholder="Min"
            className={PRICE_INPUT_CLASSES}
          />
        </div>
        <span className="text-xs text-on-surface-variant">—</span>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <DollarPrefix active={Boolean(state.maxPrice)} />
          <input
            ref={state.maxPriceInputRef}
            id={maxId}
            aria-label="Maximum budget"
            type="number"
            inputMode="numeric"
            autoComplete="off"
            min="0"
            step="50"
            value={state.maxPrice}
            onChange={(event) => state.onMaxPriceChange(event.target.value)}
            onFocus={() => onFieldFocus("budget")}
            onBlur={onFieldBlur}
            placeholder="Max"
            className={PRICE_INPUT_CLASSES}
          />
        </div>
      </div>
    </SearchBarField>
  );
}
