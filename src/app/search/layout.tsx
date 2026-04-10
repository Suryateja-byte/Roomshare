import SearchLayoutView from "@/components/SearchLayoutView";
import SearchHeaderWrapper from "@/components/SearchHeaderWrapper";
import AccountNoticeHost from "@/components/AccountNoticeHost";
import SearchUrlCanonicalizer from "@/components/search/SearchUrlCanonicalizer";
import { SkipLink } from "@/components/ui/SkipLink";
import { MapBoundsProvider } from "@/contexts/MapBoundsContext";
import { ActivePanBoundsProvider } from "@/contexts/ActivePanBoundsContext";
import { SearchTransitionProvider } from "@/contexts/SearchTransitionContext";
import { FilterStateProvider } from "@/contexts/FilterStateContext";
import { ListingFocusProvider } from "@/contexts/ListingFocusContext";
import { SearchV2DataProvider } from "@/contexts/SearchV2DataContext";
import { MobileSearchProvider } from "@/contexts/MobileSearchContext";
import { SearchTestScenarioProvider } from "@/contexts/SearchTestScenarioContext";
import { headers } from "next/headers";
import {
  resolveSearchScenario,
  SEARCH_SCENARIO_HEADER,
} from "@/lib/search/testing/search-scenarios";

export const runtime = "nodejs";

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

export default async function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const testScenario = resolveSearchScenario({
    headerValue: headersList.get(SEARCH_SCENARIO_HEADER),
  });

  return (
    <SearchTestScenarioProvider scenario={testScenario}>
      <SearchTransitionProvider>
        <FilterStateProvider>
          <MobileSearchProvider>
            <div className="h-screen-safe flex flex-col bg-surface-canvas overflow-hidden">
              <SearchUrlCanonicalizer />
              <SkipLink href="#search-results">Skip to search results</SkipLink>
              {/* Search Header - Persistent across navigations, fixed position */}
              <header className="fixed top-0 left-0 right-0 w-full bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_1px_8px_rgb(27_28_25/0.04)] z-[1100] pointer-events-auto">
                <nav
                  aria-label="Search navigation"
                >
                  <SearchHeaderWrapper />
                </nav>
                <AccountNoticeHost placement="search" />
              </header>

              {/* Main content with top padding to account for fixed header.
                  Uses --header-height CSS variable updated dynamically by SearchHeaderWrapper to
                  perfectly flush clear the search bar regardless of responsive wrapping. */}
              <div
                className="flex-1 flex flex-col pt-[var(--header-height)] overflow-hidden"
                style={{ transition: "padding-top 0.3s ease-out" }}
              >
                {/* Split view: List (from page) + Map (managed by SearchLayoutView) */}
                <MapBoundsProvider>
                  <ActivePanBoundsProvider>
                    <ListingFocusProvider>
                      <SearchV2DataProvider>
                        <SearchLayoutView>{children}</SearchLayoutView>
                      </SearchV2DataProvider>
                    </ListingFocusProvider>
                  </ActivePanBoundsProvider>
                </MapBoundsProvider>
              </div>
            </div>
          </MobileSearchProvider>
        </FilterStateProvider>
      </SearchTransitionProvider>
    </SearchTestScenarioProvider>
  );
}
