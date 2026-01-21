'use client';

import { Map, List, MapPinOff } from 'lucide-react';

interface SearchViewToggleProps {
  children: React.ReactNode;
  mapComponent: React.ReactNode;
  /** Whether the map should be visible */
  shouldShowMap: boolean;
  /** Toggle map visibility callback */
  onToggle: () => void;
  /** Whether the preference is still loading (hydrating from localStorage) */
  isLoading: boolean;
}

export default function SearchViewToggle({
  children,
  mapComponent,
  shouldShowMap,
  onToggle,
  isLoading,
}: SearchViewToggleProps) {
  return (
    <>
      {/* Mobile View Toggle Button - Fixed at bottom with pill design */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <button
          onClick={onToggle}
          disabled={isLoading}
          className="flex items-center gap-2.5 px-5 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full shadow-xl shadow-zinc-900/30 dark:shadow-black/20 hover:bg-zinc-800 dark:hover:bg-zinc-100 active:scale-[0.98] transition-all duration-200 touch-target backdrop-blur-sm disabled:opacity-50"
          aria-label={shouldShowMap ? 'Show list view' : 'Show map view'}
        >
          {shouldShowMap ? (
            <>
              <List className="w-5 h-5" />
              <span className="text-sm font-semibold tracking-tight">List</span>
            </>
          ) : (
            <>
              <Map className="w-5 h-5" />
              <span className="text-sm font-semibold tracking-tight">Map</span>
            </>
          )}
        </button>
      </div>

      {/* Mobile Views */}
      <div className="md:hidden flex-1 flex overflow-hidden">
        {/* List View */}
        <div
          data-testid="mobile-search-results-container"
          className={`w-full h-full overflow-y-auto scrollbar-hide ${shouldShowMap ? 'hidden' : 'block'}`}
        >
          {children}
        </div>

        {/* Map View - Only visible when shouldShowMap is true */}
        <div className={`w-full h-full ${shouldShowMap ? 'block' : 'hidden'}`}>
          {mapComponent}
        </div>
      </div>

      {/* Desktop Split View */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Left Panel: List View - Adjusts width based on map visibility */}
        <div
          data-testid="search-results-container"
          className={`h-full overflow-y-auto scrollbar-hide transition-all duration-300 ${
            shouldShowMap ? 'w-[55%]' : 'w-full'
          }`}
        >
          {children}
        </div>

        {/* Right Panel: Map View (45%) - Only visible when shouldShowMap is true */}
        {shouldShowMap && (
          <div className="w-[45%] h-full relative border-l border-zinc-200 dark:border-zinc-800">
            {/* Desktop Hide Map Button - positioned inside map panel */}
            <button
              onClick={onToggle}
              disabled={isLoading}
              className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg shadow-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-sm font-medium transition-colors disabled:opacity-50"
              aria-label="Hide map"
            >
              <MapPinOff className="w-4 h-4" />
              <span>Hide map</span>
            </button>
            {mapComponent}
          </div>
        )}

        {/* Desktop Show Map Button - Only visible when map is hidden */}
        {!shouldShowMap && (
          <button
            onClick={onToggle}
            disabled={isLoading}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full shadow-xl shadow-zinc-900/30 dark:shadow-black/20 hover:bg-zinc-800 dark:hover:bg-zinc-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
            aria-label="Show map"
          >
            <Map className="w-4 h-4" />
            <span className="text-sm font-semibold">Show map</span>
          </button>
        )}
      </div>
    </>
  );
}
