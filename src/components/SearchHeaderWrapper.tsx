"use client";

/**
 * SearchHeaderWrapper - Manages collapsible header on mobile
 *
 * On mobile:
 * - Shows full SearchForm when at top or manually expanded
 * - Shows collapsed bar when scrolled down
 * - Collapsed bar shows location summary and filter access
 *
 * On desktop:
 * - Always shows full SearchForm
 */

import { Suspense } from "react";
import { useScrollHeader } from "@/hooks/useScrollHeader";
import { useMobileSearch } from "@/contexts/MobileSearchContext";
import CollapsedMobileSearch from "@/components/CollapsedMobileSearch";
import SearchForm from "@/components/SearchForm";

export default function SearchHeaderWrapper() {
  const { isCollapsed } = useScrollHeader({ threshold: 80 });
  const { isExpanded, expand, openFilters } = useMobileSearch();

  // Show collapsed bar on mobile when scrolled and not manually expanded
  const showCollapsed = isCollapsed && !isExpanded;

  return (
    <>
      {/* Full search form - hidden on mobile when collapsed */}
      <div
        className={`transition-all duration-300 ease-out ${
          showCollapsed ? "md:block hidden" : "block"
        }`}
      >
        <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
          <Suspense
            fallback={
              <div className="h-14 sm:h-16 w-full bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded-full" />
            }
          >
            <SearchForm />
          </Suspense>
        </div>
      </div>

      {/* Collapsed search bar - visible on mobile only when collapsed */}
      <div
        className={`transition-all duration-300 ease-out ${
          showCollapsed ? "md:hidden block py-2" : "hidden"
        }`}
      >
        <CollapsedMobileSearch onExpand={expand} onOpenFilters={openFilters} />
      </div>
    </>
  );
}
