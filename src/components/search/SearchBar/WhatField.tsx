"use client";

import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchBarContext } from "./context";
import {
  SearchBarField,
  SEARCH_BAR_INPUT_CLASSES,
} from "./SearchBarField";
import type { SearchBarState } from "./useSearchBarState";

export function WhatField({ state }: { state: SearchBarState }) {
  const { idPrefix, onFieldFocus, onFieldBlur } = useSearchBarContext();
  const inputId = `${idPrefix}search-what`;

  return (
    <SearchBarField
      fieldId="what"
      inputId={inputId}
      labelFor={inputId}
      label={
        <span className="flex items-center gap-1.5 text-primary">
          <Sparkles className="h-3 w-3 shrink-0" strokeWidth={2.5} />
          What
          <span className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-on-primary">
            AI
          </span>
        </span>
      }
    >
      <div className="flex items-center gap-1">
        <input
          id={inputId}
          type="text"
          value={state.what}
          onChange={(event) => state.setWhat(event.target.value)}
          onFocus={() => onFieldFocus("what")}
          onBlur={onFieldBlur}
          placeholder="Try 'quiet, near campus'"
          className={SEARCH_BAR_INPUT_CLASSES}
          autoComplete="off"
        />
        {state.what && (
          <button
            type="button"
            onClick={() => state.setWhat("")}
            className={cn(
              "flex-shrink-0 rounded-full p-1.5 text-on-surface-variant transition-colors",
              "hover:bg-surface-canvas hover:text-on-surface md:p-1 md:hover:bg-transparent"
            )}
            aria-label="Clear search description"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </SearchBarField>
  );
}
