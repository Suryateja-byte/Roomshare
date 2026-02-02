'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Map, MapPinOff } from 'lucide-react';
import MobileBottomSheet from './search/MobileBottomSheet';
import FloatingMapButton from './search/FloatingMapButton';
import { useListingFocus } from '@/contexts/ListingFocusContext';

interface SearchViewToggleProps {
  children: React.ReactNode;
  mapComponent: React.ReactNode;
  /** Whether the map should be visible */
  shouldShowMap: boolean;
  /** Toggle map visibility callback */
  onToggle: () => void;
  /** Whether the preference is still loading (hydrating from localStorage) */
  isLoading: boolean;
  /** Result count text for mobile bottom sheet header */
  resultHeaderText?: string;
}

/**
 * Hook to detect desktop viewport (md breakpoint = 768px).
 * Returns undefined during SSR/hydration to avoid mismatch,
 * then resolves to true/false on the client.
 */
function useIsDesktop(): boolean | undefined {
  const [isDesktop, setIsDesktop] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}

export default function SearchViewToggle({
  children,
  mapComponent,
  shouldShowMap,
  onToggle,
  isLoading,
  resultHeaderText,
}: SearchViewToggleProps) {
  const mobileListRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const [mobileSnap, setMobileSnap] = useState(1); // 0=collapsed, 1=half, 2=expanded
  const { activeId } = useListingFocus();

  // When a map pin is tapped (activeId changes) on mobile, snap sheet to half
  useEffect(() => {
    if (activeId && isDesktop === false) {
      setMobileSnap(1);
    }
  }, [activeId, isDesktop]);

  const handleFloatingToggle = useCallback(() => {
    // If sheet is showing list (half or expanded), collapse to show map
    // If collapsed, expand to half to show list
    setMobileSnap((prev) => (prev > 0 ? 0 : 1));
  }, []);

  // Prevent dual Mapbox mount: render map in exactly one container.
  // During SSR (isDesktop === undefined), default to desktop container
  // since `hidden md:flex` handles CSS visibility correctly.
  const renderMapInMobile = isDesktop === false;
  const renderMapInDesktop = isDesktop !== false && shouldShowMap;

  return (
    <>
      {/* Mobile: Map always visible with bottom sheet overlay */}
      <div className="md:hidden flex-1 flex flex-col overflow-hidden relative">
        {/* Map fills the background */}
        {renderMapInMobile && (
          <div className="absolute inset-0">
            {mapComponent}
          </div>
        )}

        {/* Bottom sheet with list results */}
        <MobileBottomSheet
          headerText={resultHeaderText}
          snapIndex={mobileSnap}
          onSnapChange={setMobileSnap}
        >
          <div
            ref={mobileListRef}
            data-testid="mobile-search-results-container"
          >
            {children}
          </div>
        </MobileBottomSheet>

        {/* Floating toggle pill */}
        <FloatingMapButton
          isListMode={mobileSnap > 0}
          onToggle={handleFloatingToggle}
        />
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

        {/* Right Panel: Map View (45%) */}
        {renderMapInDesktop && (
          <div className="w-[45%] h-full relative border-l border-zinc-200 dark:border-zinc-800">
            {/* Desktop Hide Map Button */}
            <button
              onClick={onToggle}
              disabled={isLoading}
              className="absolute top-4 right-4 z-20 h-11 inline-flex items-center gap-1.5 px-3 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg shadow-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-sm font-medium transition-colors disabled:opacity-60"
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
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full shadow-xl shadow-zinc-900/30 dark:shadow-black/20 hover:bg-zinc-800 dark:hover:bg-zinc-100 active:scale-[0.98] transition-all duration-200 disabled:opacity-60"
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
