"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { SearchBarContext, type SearchBarContextValue } from "./context";
import type { SearchBarFieldId, SearchBarLayout } from "./types";
import { SearchBarField } from "./SearchBarField";
import { WhereField } from "./WhereField";
import { WhatField } from "./WhatField";
import { BudgetField } from "./BudgetField";
import { SearchBarSubmit } from "./SearchBarSubmit";
import type { SearchBarState } from "./useSearchBarState";

export interface SearchBarProps {
  state: SearchBarState;
  onSubmit: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  isSearching: boolean;
  /** Extra disable condition for the submit button (e.g. resolving a typed location). */
  submitDisabled?: boolean;
  layout?: SearchBarLayout;
  /** Prefix for input/warning element ids so co-mounted bars never collide. */
  idPrefix?: string;
  formTestId?: string;
  /** Home's Filters button; renders between the last cell and the submit orb. */
  trailingSlot?: ReactNode;
  /** Notifies the surface container when any field gains/loses focus. */
  onEngagedChange?: (engaged: boolean) => void;
}

function Divider({
  hidden,
  className,
}: {
  hidden: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "mx-4 h-px self-stretch bg-on-surface/10 md:mx-0 md:my-auto md:h-8 md:w-px md:self-center md:bg-outline-variant/60",
        "transition-opacity duration-200",
        hidden ? "md:opacity-0" : "md:opacity-100",
        className
      )}
    />
  );
}

/**
 * The one search pill. Identical on the home hero and the search-page header
 * by construction; the mobile overlay reuses the same field cells stacked.
 */
export function SearchBar({
  state,
  onSubmit,
  isSearching,
  submitDisabled = false,
  layout = "row",
  idPrefix = "",
  formTestId,
  trailingSlot,
  onEngagedChange,
}: SearchBarProps) {
  const [focusedField, setFocusedField] = useState<SearchBarFieldId | null>(
    null
  );
  const [hoveredField, setHoveredField] = useState<SearchBarFieldId | null>(
    null
  );
  const focusBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // Debounced blur prevents the engaged state flickering off while focus
  // moves between cells inside the bar.
  const onFieldFocus = useCallback((field: SearchBarFieldId) => {
    if (focusBlurTimeoutRef.current) clearTimeout(focusBlurTimeoutRef.current);
    setFocusedField(field);
  }, []);

  const onFieldBlur = useCallback(() => {
    focusBlurTimeoutRef.current = setTimeout(() => setFocusedField(null), 150);
  }, []);

  useEffect(() => {
    return () => {
      if (focusBlurTimeoutRef.current) {
        clearTimeout(focusBlurTimeoutRef.current);
      }
    };
  }, []);

  const engaged = focusedField !== null;

  useEffect(() => {
    onEngagedChange?.(engaged);
  }, [engaged, onEngagedChange]);

  const isRow = layout === "row";
  const { semanticSearchEnabled } = state;

  const contextValue = useMemo<SearchBarContextValue>(
    () => ({
      layout,
      idPrefix,
      focusedField,
      hoveredField,
      engaged,
      setHoveredField,
      onFieldFocus,
      onFieldBlur,
    }),
    [
      layout,
      idPrefix,
      focusedField,
      hoveredField,
      engaged,
      onFieldFocus,
      onFieldBlur,
    ]
  );

  const isFieldHot = (field: SearchBarFieldId) =>
    focusedField === field || hoveredField === field;

  const showWarning =
    state.showLocationWarning && !state.locationInputFocused;

  return (
    <SearchBarContext.Provider value={contextValue}>
      <div className="relative w-full">
        <form
          ref={state.formRef}
          onSubmit={onSubmit}
          role="search"
          aria-label="Search listings"
          data-testid={formTestId}
          data-engaged={engaged || undefined}
          className={cn(
            "group relative flex w-full",
            isRow
              ? cn(
                  "flex-col rounded-[1.75rem] border p-2 md:flex-row md:items-center md:rounded-full",
                  "transition-[background-color,box-shadow,border-color] duration-300 ease-[var(--ease-editorial)] motion-reduce:transition-none",
                  engaged
                    ? "border-outline-variant/30 bg-surface-container-high shadow-ambient"
                    : "border-outline-variant/20 bg-surface-container-lowest shadow-ambient-sm hover:shadow-ambient"
                )
              : "flex-col gap-4"
          )}
        >
          <WhereField state={state} />
          {semanticSearchEnabled && (
            <>
              {isRow && (
                <Divider hidden={isFieldHot("where") || isFieldHot("what")} />
              )}
              <WhatField state={state} />
            </>
          )}
          {isRow && (
            <Divider
              hidden={
                (semanticSearchEnabled
                  ? isFieldHot("what")
                  : isFieldHot("where")) || isFieldHot("budget")
              }
            />
          )}
          <BudgetField state={state} />

          {isRow ? (
            <div className="mt-3 flex items-center gap-3 md:mt-0 md:contents">
              {trailingSlot && (
                <>
                  <Divider
                    hidden={isFieldHot("budget")}
                    className="hidden md:block"
                  />
                  {trailingSlot}
                </>
              )}
              <div className="flex flex-1 items-center justify-center md:flex-none md:pl-2">
                <SearchBarSubmit
                  isSearching={isSearching}
                  disabled={submitDisabled}
                />
              </div>
            </div>
          ) : (
            <>
              {trailingSlot}
              <SearchBarSubmit
                isSearching={isSearching}
                disabled={submitDisabled}
              />
            </>
          )}
        </form>

        {/* Passive hint when typed text has no dropdown selection. Absolutely
            positioned so it never changes the bar's height — a height change
            triggers ResizeObserver → map moveEnd → URL update → clears input. */}
        {showWarning && (
          <div
            id={`${idPrefix}location-warning`}
            role="alert"
            className={cn(
              "flex gap-2 border border-outline-variant/20 bg-amber-50 text-sm text-amber-800",
              isRow
                ? "absolute left-1/2 top-full z-50 mt-2 w-max max-w-[min(36rem,90vw)] -translate-x-1/2 items-center rounded-full px-5 py-2 shadow-ambient"
                : "mt-2 items-start rounded-2xl px-4 py-3 shadow-ambient-sm"
            )}
          >
            <svg
              className="h-4 w-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>
              Select a location from the dropdown for more accurate results
            </span>
          </div>
        )}
      </div>
    </SearchBarContext.Provider>
  );
}

export { SearchBarField };
