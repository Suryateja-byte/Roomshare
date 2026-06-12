"use client";

import { Loader2, LocateFixed } from "lucide-react";
import { cn } from "@/lib/utils";
import LocationSearchInput from "@/components/LocationSearchInput";
import { useSearchBarContext } from "./context";
import {
  SearchBarField,
  SEARCH_BAR_INPUT_CLASSES,
} from "./SearchBarField";
import type { SearchBarState } from "./useSearchBarState";

export function WhereField({ state }: { state: SearchBarState }) {
  const { idPrefix, onFieldFocus, onFieldBlur } = useSearchBarContext();
  const inputId = `${idPrefix}search-location`;

  return (
    <SearchBarField
      fieldId="where"
      inputId={inputId}
      label="Where"
      labelFor={inputId}
      allowOverflow
    >
      <div className="flex items-center justify-between gap-2">
        <LocationSearchInput
          id={inputId}
          value={state.location}
          onChange={state.onLocationChange}
          onLocationSelect={state.handleLocationSelect}
          fallbackItems={state.recentFallbackItems}
          showFallbackOnEmptyFocus
          fallbackTitle="Recent searches"
          onClearFallback={state.clearRecentSearches}
          inputRef={state.locationInputRef}
          onFocus={() => {
            state.setLocationInputFocused(true);
            onFieldFocus("where");
          }}
          onBlur={() => {
            state.setLocationInputFocused(false);
            onFieldBlur();
          }}
          placeholder={
            state.selectedLocation && state.location.length === 0
              ? "Selected area"
              : "Search city or area"
          }
          className="min-w-0 flex-1"
          inputClassName={cn(SEARCH_BAR_INPUT_CLASSES, "pr-8")}
        />
        <button
          type="button"
          onClick={state.handleUseMyLocation}
          disabled={state.geoLoading}
          className="-mr-2 flex min-h-[40px] min-w-[40px] flex-shrink-0 items-center justify-center rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-canvas hover:text-on-surface active:bg-surface-container-high disabled:opacity-50 md:mr-0 md:min-h-0 md:min-w-0 md:p-1.5 md:hover:bg-transparent"
          aria-label="Use my current location"
          title="Use my current location"
        >
          {state.geoLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LocateFixed className="h-4 w-4" />
          )}
        </button>
      </div>
    </SearchBarField>
  );
}
