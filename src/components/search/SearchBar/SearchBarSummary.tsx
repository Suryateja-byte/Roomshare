"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { readSearchIntentState } from "@/lib/search/search-intent";
import { getPriceParam } from "@/lib/search-params";
import type { SearchBarFieldId } from "./types";

export interface SearchBarSummaryProps {
  /** Deep-link: expand the editor and focus the clicked segment's field. */
  onSegmentClick: (field: SearchBarFieldId) => void;
  semanticSearchEnabled: boolean;
  testId?: string;
}

function formatBudgetSummary(
  minPrice: number | undefined,
  maxPrice: number | undefined
): string {
  if (minPrice !== undefined && maxPrice !== undefined) {
    return `$${minPrice}–$${maxPrice}`;
  }
  if (minPrice !== undefined) return `$${minPrice}+`;
  if (maxPrice !== undefined) return `Up to $${maxPrice}`;
  return "Any budget";
}

function SummarySegment({
  label,
  value,
  onClick,
  className,
}: {
  label: string;
  value: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={false}
      aria-label={`Edit ${label.toLowerCase()}`}
      className={cn(
        "group/segment min-w-0 flex-1 rounded-full px-5 py-1.5 text-left transition-colors duration-200",
        "hover:bg-on-surface/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        className
      )}
    >
      <p className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.15em] leading-none text-on-surface-variant">
        {label}
      </p>
      <p className="truncate text-[15px] font-semibold text-on-surface">
        {value}
      </p>
    </button>
  );
}

/**
 * Collapsed header pill — exactly the same 68px geometry as the expanded bar
 * so toggling never changes the header height (which would ripple into a map
 * resize → moveEnd → URL churn). Each segment deep-links into its field.
 */
export function SearchBarSummary({
  onSegmentClick,
  semanticSearchEnabled,
  testId,
}: SearchBarSummaryProps) {
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  const intentState = useMemo(
    () => readSearchIntentState(new URLSearchParams(searchParamsString)),
    [searchParamsString]
  );

  const budgetSummary = useMemo(() => {
    const params = new URLSearchParams(searchParamsString);
    return formatBudgetSummary(
      getPriceParam(params, "min"),
      getPriceParam(params, "max")
    );
  }, [searchParamsString]);

  return (
    <div
      data-testid={testId}
      onClick={(event) => {
        // Dead space between segments still expands the editor.
        if ((event.target as HTMLElement).closest("button")) return;
        onSegmentClick("where");
      }}
      className={cn(
        "mx-auto flex h-[68px] w-full max-w-[760px] cursor-pointer items-center rounded-full border border-outline-variant/20 bg-surface-container-lowest/92 p-2 shadow-ghost backdrop-blur-[20px]",
        "transition-all duration-300 ease-[var(--ease-editorial)] hover:bg-surface-container-lowest hover:shadow-ambient motion-reduce:transition-none"
      )}
    >
      <div className="flex h-full min-w-0 flex-1 items-center">
        <SummarySegment
          label="Where"
          value={intentState.locationSummary}
          onClick={() => onSegmentClick("where")}
        />
        {semanticSearchEnabled && (
          <>
            <div
              aria-hidden="true"
              className="h-7 w-px shrink-0 bg-outline-variant/40"
            />
            <SummarySegment
              label="What"
              value={intentState.vibeSummary}
              onClick={() => onSegmentClick("what")}
            />
          </>
        )}
        <div
          aria-hidden="true"
          className="h-7 w-px shrink-0 bg-outline-variant/40"
        />
        <SummarySegment
          label="Budget"
          value={budgetSummary}
          onClick={() => onSegmentClick("budget")}
        />
      </div>

      <button
        type="button"
        onClick={() => onSegmentClick("where")}
        aria-label="Expand search form"
        aria-expanded={false}
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-primary),var(--color-primary-container))] text-on-primary shadow-[0_14px_34px_-16px_rgba(154,64,39,0.7)] transition-transform hover:brightness-105 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
      >
        <Search className="h-4 w-4" />
      </button>
    </div>
  );
}
