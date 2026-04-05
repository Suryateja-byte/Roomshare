"use client";

import { Loader2, MapPin, X } from "lucide-react";
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";

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
  isLoading: boolean
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
      <AnimatePresence>
        <m.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[50] flex items-center gap-2 bg-on-surface/90 backdrop-blur-md rounded-full shadow-lg px-2 py-1.5 border border-white/10">
            <button
              onClick={onSearch}
              disabled={isSearchLoading}
              className="text-sm font-medium text-white hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed h-11 px-4 inline-flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 transition-colors"
            >
              {isSearchLoading && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              )}
              {label}
            </button>
            <div className="w-[1px] h-6 bg-white/20" />
            <button
              onClick={onReset}
              aria-label="Reset map view"
              className="p-1 w-11 h-11 inline-flex items-center justify-center text-on-surface-variant hover:text-white rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </m.div>
      </AnimatePresence>
    );
  }

  // List variant
  return (
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-800">
            <MapPin className="lucide-map-pin h-4 w-4" />
            <span className="text-sm">Map moved — results not updated</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onSearch}
              disabled={isSearchLoading}
              className="text-sm font-medium text-amber-700 hover:text-amber-800 disabled:opacity-50 disabled:cursor-not-allowed h-11 px-2 inline-flex items-center gap-1.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            >
              {isSearchLoading && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              )}
              {label}
            </button>
            <button
              onClick={onReset}
              aria-label="Reset map view"
              className="p-1 w-11 h-11 inline-flex items-center justify-center text-amber-500 hover:text-amber-700 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </m.div>
    </AnimatePresence>
  );
}
