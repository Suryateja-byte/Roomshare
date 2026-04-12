"use client";

import { LayoutList, Map as MapIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { SortOption } from "@/lib/data";
import SaveSearchButton from "@/components/SaveSearchButton";
import SortSelect from "@/components/SortSelect";
import { useSearchMapUI } from "@/contexts/SearchMapUIContext";
import { cn } from "@/lib/utils";

interface DesktopResultsDockProps {
  summary: {
    total: number | null;
    visibleCount: number;
    locationLabel?: string;
    browseMode?: boolean;
  };
  currentSort: SortOption;
  hasResults: boolean;
  filters: ReactNode;
  appliedFilters?: ReactNode;
}

function formatResultLabel(total: number | null) {
  const resolvedTotal = total === null ? "100+" : total;
  const noun = total === 1 ? "place" : "places";
  return `${resolvedTotal} ${noun}`;
}

export default function DesktopResultsDock({
  summary,
  currentSort,
  hasResults,
  filters,
  appliedFilters,
}: DesktopResultsDockProps) {
  const { shouldShowMap, toggleMap, hideMap } = useSearchMapUI();

  const summaryMeta = [
    summary.locationLabel,
    summary.visibleCount > 0 ? `1–${summary.visibleCount}` : null,
    summary.browseMode ? "Showing top listings" : null,
  ].filter(Boolean) as string[];

  return (
    <section
      data-testid="desktop-results-dock"
      className="border-b border-outline-variant/20 pb-5 pt-2"
      aria-label="Search results controls"
    >
      <div className="space-y-4">
        <div
          data-testid="desktop-results-summary-row"
          className="grid gap-4 2xl:grid-cols-[minmax(18rem,1fr)_auto] 2xl:items-start"
        >
          <div className="min-w-0 flex-1">
            <h1
              id="search-results-heading"
              tabIndex={-1}
              className="font-display text-[clamp(1.9rem,1.55rem+0.95vw,2.5rem)] leading-none tracking-[-0.045em] text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-canvas focus-visible:rounded-lg"
            >
              {formatResultLabel(summary.total)}
            </h1>
            {summaryMeta.length > 0 ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-on-surface-variant">
                {summaryMeta.map((item, index) => (
                  <span
                    key={`${item}-${index}`}
                    className={cn(
                      "inline-flex items-center",
                      index === 0 && summary.locationLabel
                        ? "font-medium text-on-surface/80"
                        : undefined
                    )}
                  >
                    {index > 0 ? (
                      <span className="mr-2 text-outline-variant">·</span>
                    ) : null}
                    {item}
                  </span>
                ))}
              </p>
            ) : null}
          </div>

          <div
            data-testid="desktop-toolbar-cluster"
            className="flex flex-wrap items-center gap-2.5 2xl:justify-end"
          >
            {hasResults ? (
              <SortSelect currentSort={currentSort} desktopVariant="toolbar" />
            ) : null}
            {hasResults ? (
              <SaveSearchButton
                variant="toolbar"
                className="rounded-full border border-outline-variant/30 bg-transparent px-3.5 hover:border-outline-variant hover:bg-surface-container-high/45"
              />
            ) : null}

            <div
              data-testid="desktop-view-toggle"
              className="relative inline-grid h-11 grid-cols-2 items-center rounded-full border border-outline-variant/30 bg-surface-container-high/55 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
              aria-label="Results view"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-full bg-surface-container-lowest shadow-sm shadow-on-surface/[0.06] transition-transform duration-200 ease-out",
                  shouldShowMap ? "translate-x-full" : "translate-x-0"
                )}
              />
              <button
                type="button"
                data-testid="desktop-view-list"
                aria-pressed={!shouldShowMap}
                onClick={() => {
                  if (shouldShowMap) {
                    hideMap();
                  }
                }}
                className={cn(
                  "relative z-10 inline-flex min-w-[76px] items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                  !shouldShowMap
                    ? "text-on-surface"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <LayoutList className="h-4 w-4" aria-hidden="true" />
                <span>List</span>
              </button>
              <button
                type="button"
                data-testid="desktop-view-map"
                aria-pressed={shouldShowMap}
                onClick={() => {
                  if (!shouldShowMap) {
                    toggleMap();
                  }
                }}
                className={cn(
                  "relative z-10 inline-flex min-w-[76px] items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                  shouldShowMap
                    ? "text-on-surface"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <MapIcon className="h-4 w-4" aria-hidden="true" />
                <span>Map</span>
              </button>
            </div>
          </div>
        </div>

        <div
          data-testid="desktop-primary-filters-row"
          className="flex flex-wrap items-center gap-2.5 border-t border-outline-variant/15 pt-4"
        >
          {filters}
        </div>

        {appliedFilters ? <div className="pt-1">{appliedFilters}</div> : null}
      </div>
    </section>
  );
}
