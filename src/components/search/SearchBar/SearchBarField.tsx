"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSearchBarContext } from "./context";
import type { SearchBarFieldId } from "./types";

// Static flex ratios (no focus-expand animation — calm, Airbnb-style cells).
// Inline styles because Tailwind v4 may not generate arbitrary flex values
// reliably with dynamic class names.
const ROW_FIELD_FLEX: Record<SearchBarFieldId, string> = {
  where: "1.38 1 0%",
  what: "1.28 1 0%",
  budget: "1.16 1 0%",
};

export const SEARCH_BAR_INPUT_CLASSES =
  "w-full min-w-0 bg-transparent border-none p-0 text-[16px] md:text-[15px] font-medium text-on-surface caret-primary placeholder-shown:caret-transparent placeholder:text-on-surface-variant/50 transition-colors focus:placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-0";

export const SEARCH_BAR_LABEL_CLASSES =
  "mb-1 block text-[11px] font-bold uppercase tracking-[0.15em] leading-none text-on-surface-variant";

interface SearchBarFieldProps {
  fieldId: SearchBarFieldId;
  /** Input the cell's dead space focuses on click. */
  inputId: string;
  label: ReactNode;
  /** Omit when the label labels via htmlFor on a wrapper (budget uses aria-labels). */
  labelFor?: string;
  /** The where-cell keeps overflow visible below md for its dropdown. */
  allowOverflow?: boolean;
  children: ReactNode;
}

/**
 * One cell of the search pill. Idle cells sit flush on the bar; while the bar
 * is engaged the container turns warm gray and the active cell renders as a
 * raised white card (ring doubles as the e2e-pinned focus indicator on the
 * cell wrapper).
 */
export function SearchBarField({
  fieldId,
  inputId,
  label,
  labelFor,
  allowOverflow = false,
  children,
}: SearchBarFieldProps) {
  const { layout, focusedField, engaged, setHoveredField } =
    useSearchBarContext();
  const isFocused = focusedField === fieldId;
  const isRow = layout === "row";

  const style: CSSProperties | undefined = isRow
    ? {
        flex: ROW_FIELD_FLEX[fieldId],
        transition: "background 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      }
    : undefined;

  return (
    <div
      data-field={fieldId}
      data-active={isFocused || undefined}
      style={style}
      onClick={(event) => {
        // Clicking a cell's dead space focuses its input. Clicks on real
        // controls (inputs, clear/locate buttons, dropdown items) keep their
        // native behavior — without this guard a click on the Max input would
        // bubble up and yank focus back to Min.
        if ((event.target as HTMLElement).closest("input, button, a")) return;
        document.getElementById(inputId)?.focus();
      }}
      onMouseEnter={() => setHoveredField(fieldId)}
      onMouseLeave={() => setHoveredField(null)}
      className={cn(
        "relative flex w-full min-w-0 cursor-text flex-col justify-center whitespace-nowrap",
        "transition-[background-color,box-shadow,opacity] duration-300 ease-[var(--ease-editorial)] motion-reduce:transition-none",
        isRow
          ? cn(
              "rounded-2xl px-4 py-3 md:h-[52px] md:rounded-full md:px-6 md:py-0",
              allowOverflow
                ? "overflow-visible md:overflow-hidden"
                : "overflow-hidden",
              isFocused
                ? "bg-surface-canvas/55 ring-1 ring-inset ring-primary/30 md:bg-surface-container-lowest md:shadow-ambient md:ring-primary/25"
                : engaged
                  ? "md:opacity-80 md:hover:bg-on-surface/[0.04] md:hover:opacity-100"
                  : "md:hover:bg-on-surface/[0.025]"
            )
          : cn(
              "rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3",
              allowOverflow ? "overflow-visible" : "overflow-hidden",
              isFocused && "border-primary/30 ring-2 ring-inset ring-primary/30"
            )
      )}
    >
      <label htmlFor={labelFor} className={SEARCH_BAR_LABEL_CLASSES}>
        {label}
      </label>
      {children}
    </div>
  );
}
