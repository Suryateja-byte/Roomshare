"use client";

import { ReactNode } from "react";
import SearchViewToggle from "./SearchViewToggle";
import PersistentMapWrapper from "./PersistentMapWrapper";
import ListScrollBridge from "./listings/ListScrollBridge";
import { useMapPreference } from "@/hooks/useMapPreference";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useMapMovedBanner } from "@/contexts/MapBoundsContext";
import { MapMovedBanner } from "./map/MapMovedBanner";
import { SearchMapUIProvider } from "@/contexts/SearchMapUIContext";

interface SearchLayoutViewProps {
  children: ReactNode;
}

/**
 * SearchLayoutView - Manages the split view layout for search
 *
 * Handles:
 * - List/Map split view rendering via SearchViewToggle
 * - Persistent map that stays mounted across navigations
 * - Mobile vs desktop layout differences
 * - User preference for map visibility (persisted in localStorage)
 *
 * CRITICAL: This component lives in the layout, so:
 * - PersistentMapWrapper stays mounted across /search navigations
 * - Prevents Mapbox re-initialization (saves billing)
 * - Map reads listings from SearchV2DataContext (set by page)
 *
 * Cost optimization:
 * - Desktop users can hide the map (saves Mapbox billing per init)
 * - Mobile users see list-only by default (tap to show map)
 * - Preferences persist via localStorage
 */
export default function SearchLayoutView({ children }: SearchLayoutViewProps) {
  const {
    shouldShowMap,
    shouldRenderMap,
    toggleMap,
    isLoading,
  } = useMapPreference();

  useKeyboardShortcuts([
    {
      key: "m",
      preventInInput: true,
      action: toggleMap,
      description: "Toggle map/list view",
    },
  ]);

  // Banner state for "search this area" / "reset" when user pans with search-as-move OFF
  const { showBanner, showLocationConflict, onSearch, onReset, areaCount, isAreaCountLoading } = useMapMovedBanner();

  // On mobile with bottom sheet, map stays visible — just trigger the search
  const handleSearch = () => {
    onSearch();
  };

  return (
    <SearchMapUIProvider showMap={toggleMap} shouldShowMap={shouldShowMap}>
      {/* Bridge: Scrolls listing card into view when map marker is clicked */}
      <ListScrollBridge />

      <SearchViewToggle
        mapComponent={<PersistentMapWrapper shouldRenderMap={shouldRenderMap} />}
        shouldShowMap={shouldShowMap}
        onToggle={toggleMap}
        isLoading={isLoading}
      >
        {/* List variant banner - shows above results when map is hidden or on mobile */}
        {(showBanner || showLocationConflict) && (
          <MapMovedBanner
            variant="list"
            onSearch={handleSearch}
            onReset={onReset}
            areaCount={areaCount}
            isAreaCountLoading={isAreaCountLoading}
          />
        )}
        {children}
      </SearchViewToggle>
    </SearchMapUIProvider>
  );
}
