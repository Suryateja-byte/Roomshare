"use client";

import { Loader2, MapPin, X } from "lucide-react";

export interface MapMovedBannerProps {
  variant: "map" | "list";
  onSearch: () => void;
  onReset: () => void;
  /** Count of listings in current map area (null = 100+, undefined = not yet loaded) */
  areaCount?: number | null;
  /** Whether area count is currently loading */
  isAreaCountLoading?: boolean;
  /** L2-MAP: Whether a search is currently in progress (disables the search button) */
  isSearchLoading?: boolean;
}

/**
 * Format the "Search this area" button label with optional count
 */
function formatSearchLabel(
  areaCount: number | null | undefined,
  isLoading: boolean,
): string {
  if (isLoading || areaCount === undefined) return "Search this area";
  if (areaCount === null) return "Search this area (100+)";
  return `Search this area (${areaCount})`;
}

/**
 * MapMovedBanner - Shows when map has moved but results haven't updated
 *
 * Two variants:
 * - "map": Floating overlay on the map itself
 * - "list": Banner above the results list with warning styling
 */
export function MapMovedBanner({
  variant,
  onSearch,
  onReset,
  areaCount,
  isAreaCountLoading = false,
  isSearchLoading = false,
}: MapMovedBannerProps) {
  const label = formatSearchLabel(areaCount, isAreaCountLoading);

  if (variant === "map") {
    return (
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-white dark:bg-zinc-800 rounded-full shadow-lg px-2 py-1">
        <button
          onClick={onSearch}
          disabled={isSearchLoading}
          className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed h-11 px-3 inline-flex items-center gap-1.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          {isSearchLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
          {label}
        </button>
        <button
          onClick={onReset}
          aria-label="Reset map view"
          className="p-1 w-11 h-11 inline-flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // List variant
  return (
    <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
        <MapPin className="lucide-map-pin h-4 w-4" />
        <span className="text-sm">Map moved — results not updated</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onSearch}
          disabled={isSearchLoading}
          className="text-sm font-medium text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 disabled:opacity-50 disabled:cursor-not-allowed h-11 px-2 inline-flex items-center gap-1.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          {isSearchLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
          {label}
        </button>
        <button
          onClick={onReset}
          aria-label="Reset map view"
          className="p-1 w-11 h-11 inline-flex items-center justify-center text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
