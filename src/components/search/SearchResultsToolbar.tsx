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

const toolbarButtonClassName = `inline-flex h-11 min-h-[44px] items-center justify-center gap-2 rounded-[1.25rem] border px-5 text-sm font-semibold transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${QUICK_FILTER_INACTIVE_CLASSNAME}`;

export default function SearchResultsToolbar({
  currentSort,
  hasResults,
}: SearchResultsToolbarProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  const { shouldShowMap, toggleMap, canShowMap } = useSearchMapUI();
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
            <SaveSearchButton className="inline-flex h-11 min-h-[44px] items-center gap-2 rounded-[1.25rem] border border-outline-variant/20 bg-surface-container-lowest/72 px-5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-lowest" />
          </div>
        </>
      ) : null}

      {isHydrated && canShowMap ? (
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
              "border-outline-variant/20 bg-surface-container-lowest text-on-surface"
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
