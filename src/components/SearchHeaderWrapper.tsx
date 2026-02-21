"use client";

/**
 * SearchHeaderWrapper - Manages collapsible header on mobile and desktop
 *
 * On mobile:
 * - Shows full SearchForm when at top or manually expanded
 * - Shows collapsed bar when scrolled down
 * - Collapsed bar shows location summary and filter access
 *
 * On desktop:
 * - Shows full SearchForm when at top or manually expanded
 * - Shows compact search pill when scrolled down
 */

import { Suspense, lazy, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useScrollHeader } from "@/hooks/useScrollHeader";
import {
  useKeyboardShortcuts,
  formatShortcut,
} from "@/hooks/useKeyboardShortcuts";
import { useMobileSearch } from "@/contexts/MobileSearchContext";
import CollapsedMobileSearch from "@/components/CollapsedMobileSearch";
import { CompactSearchPill } from "@/components/search/CompactSearchPill";

// LCP optimization: Lazy-load SearchForm to defer its ~875-line bundle + heavy dependencies
// This allows listing images (the LCP elements) to render before SearchForm JavaScript loads
const SearchForm = lazy(() => import("@/components/SearchForm"));

export default function SearchHeaderWrapper() {
  const { isCollapsed } = useScrollHeader({ threshold: 80 });
  const { isExpanded, expand, openFilters } = useMobileSearch();

  useKeyboardShortcuts([
    {
      key: "k",
      meta: true,
      action: () => document.getElementById("search-location")?.focus(),
      description: "Focus search input",
    },
  ]);

  // Show collapsed bar when scrolled and not manually expanded
  const showCollapsed = isCollapsed && !isExpanded;

  const handleExpandDesktop = useCallback(() => {
    // Scroll to top to reveal the full form
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <>
      {/* Full search form - hidden when collapsed */}
      <div
        className={`transition-all duration-300 ease-out ${
          showCollapsed ? "hidden" : "block"
        }`}
      >
        <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            {/* Back to Home Button */}
            <Link
              href="/"
              className="flex items-center gap-2 px-3 py-2 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors group flex-shrink-0"
              aria-label="Back to home"
            >
              <ArrowLeft className="w-4 h-4 text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />
              <div className="w-6 h-6 bg-zinc-900 dark:bg-zinc-100 rounded-md flex items-center justify-center text-white dark:text-zinc-900 font-bold text-sm">
                R
              </div>
              <span className="hidden sm:inline text-sm font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
                Home
              </span>
            </Link>

            {/* Search Form */}
            <div className="flex-1 min-w-0 relative">
              <Suspense
                fallback={
                  /*
                   * CLS fix: Fallback dimensions must match actual SearchForm height
                   * Mobile: p-1.5 (12px) + button h-11 (44px) = 56px ≈ h-14
                   * Desktop: md:p-2 (16px) + button sm:h-12 (48px) = 64px ≈ sm:h-16
                   * Use rounded-xl to match actual form, not rounded-full
                   */
                  <div className="h-14 sm:h-16 w-full bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded-xl border border-zinc-200/80 dark:border-zinc-700/80" />
                }
              >
                <SearchForm />
              </Suspense>

              {/* Keyboard shortcut hint — desktop only */}
              <kbd
                className="hidden md:inline-flex absolute right-3 top-1/2 -translate-y-1/2 items-center px-1.5 py-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded pointer-events-none"
                aria-hidden="true"
              >
                {formatShortcut({ key: "k", meta: true })}
              </kbd>
            </div>
          </div>
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

      {/* Compact search pill - visible on desktop only when collapsed */}
      <div
        className={`transition-all duration-300 ease-out ${
          showCollapsed ? "hidden md:block py-2 px-6" : "hidden"
        }`}
      >
        <CompactSearchPill
          onExpand={handleExpandDesktop}
          onOpenFilters={openFilters}
        />
      </div>
    </>
  );
}
