"use client";

import { MapPin, X } from "lucide-react";

export interface MapMovedBannerProps {
  variant: "map" | "list";
  onSearch: () => void;
  onReset: () => void;
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
}: MapMovedBannerProps) {
  if (variant === "map") {
    return (
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white dark:bg-zinc-800 rounded-full shadow-lg px-4 py-2">
        <button
          onClick={onSearch}
          className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
        >
          Search this area
        </button>
        <button
          onClick={onReset}
          aria-label="Reset map view"
          className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
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
          className="text-sm font-medium text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200"
        >
          Search this area
        </button>
        <button
          onClick={onReset}
          aria-label="Reset map view"
          className="p-1 text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
