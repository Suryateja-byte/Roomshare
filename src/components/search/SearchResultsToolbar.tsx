"use client";

import { useEffect, useState } from "react";
import { Map } from "lucide-react";
import type { SortOption } from "@/lib/data";
import SaveSearchButton from "@/components/SaveSearchButton";
import SortSelect from "@/components/SortSelect";
import { useSearchMapUI } from "@/contexts/SearchMapUIContext";
import { cn } from "@/lib/utils";
import { QUICK_FILTER_INACTIVE_CLASSNAME } from "./quickFilterStyles";

interface SearchResultsToolbarProps {
  currentSort: SortOption;
  hasResults: boolean;
}

const toolbarButtonClassName = `inline-flex h-11 min-h-[44px] items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${QUICK_FILTER_INACTIVE_CLASSNAME}`;

export default function SearchResultsToolbar({
  currentSort,
  hasResults,
}: SearchResultsToolbarProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  const { shouldShowMap, toggleMap } = useSearchMapUI();
  const mapAriaLabel = shouldShowMap ? "Hide results map" : "Show results map";
  const mapLabel = shouldShowMap ? "Hide map" : "Show map";

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return (
    <div
      data-testid="desktop-search-toolbar"
      className="flex items-center gap-2.5 shrink-0"
    >
      {hasResults ? (
        <>
          <div data-testid="desktop-toolbar-sort" className="shrink-0">
            <SortSelect currentSort={currentSort} />
          </div>
          <div data-testid="desktop-toolbar-save-search" className="shrink-0">
            <SaveSearchButton className="inline-flex h-11 min-h-[44px] items-center gap-2 rounded-full border border-outline-variant/20 bg-transparent px-4 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" />
          </div>
        </>
      ) : null}

      {isHydrated ? (
        <button
          type="button"
          onClick={toggleMap}
          data-testid="desktop-toolbar-map-toggle"
          aria-label={mapAriaLabel}
          aria-pressed={shouldShowMap}
          className={cn(
            toolbarButtonClassName,
            "min-w-[124px]",
            shouldShowMap &&
              "border-outline-variant/50 bg-surface-container text-on-surface hover:border-on-surface-variant"
          )}
        >
          <Map
            className={cn(
              "h-4 w-4",
              shouldShowMap ? "text-on-surface/80" : "text-on-surface-variant"
            )}
            aria-hidden="true"
          />
          <span>{mapLabel}</span>
        </button>
      ) : null}
    </div>
  );
}
