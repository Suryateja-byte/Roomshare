import SearchLayoutView from "@/components/SearchLayoutView";
import SearchHeaderWrapper from "@/components/SearchHeaderWrapper";
import { MapBoundsProvider } from "@/contexts/MapBoundsContext";
import { SearchTransitionProvider } from "@/contexts/SearchTransitionContext";
import { FilterStateProvider } from "@/contexts/FilterStateContext";
import { ListingFocusProvider } from "@/contexts/ListingFocusContext";
import { SearchV2DataProvider } from "@/contexts/SearchV2DataContext";
import { MobileSearchProvider } from "@/contexts/MobileSearchContext";

/**
 * Search Layout - Persistent Map Architecture
 *
 * This layout keeps the map mounted across all /search navigations.
 * When URL params change (via router.replace), the map stays mounted
 * while only the page segment (results) re-renders.
 *
 * Key benefit: Prevents Mapbox re-initialization on every pan/zoom,
 * saving significant costs (Mapbox bills per map load, not per tile).
 *
 * Cost optimization (Phase 1):
 * - Map initialization is deferred until user opts in
 * - Mobile defaults to list-only view (no map init)
 * - Desktop has "Hide map" toggle to avoid map billing
 * - See SearchLayoutView for toggle logic
 *
 * Architecture:
 * - Layout (persistent): Contains header
 * - SearchLayoutView: Handles map toggle and rendering
 * - Page (can suspend): Contains the results list only
 * - loading.tsx: Shows skeleton for results only
 */

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SearchTransitionProvider>
      <FilterStateProvider>
        <MobileSearchProvider>
          <div className="h-screen-safe flex flex-col bg-white dark:bg-zinc-950 overflow-hidden">
            {/* Search Header - Persistent across navigations, fixed position */}
            <header className="fixed top-0 left-0 right-0 w-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-100 dark:border-zinc-800 z-50">
              <SearchHeaderWrapper />
            </header>

            {/* Main content with top padding to account for fixed header */}
            <div className="flex-1 flex flex-col pt-[72px] sm:pt-[88px] overflow-hidden">
              {/* Split view: List (from page) + Map (managed by SearchLayoutView) */}
              <MapBoundsProvider>
                <ListingFocusProvider>
                  <SearchV2DataProvider>
                    <SearchLayoutView>{children}</SearchLayoutView>
                  </SearchV2DataProvider>
                </ListingFocusProvider>
              </MapBoundsProvider>
            </div>
          </div>
        </MobileSearchProvider>
      </FilterStateProvider>
    </SearchTransitionProvider>
  );
}
