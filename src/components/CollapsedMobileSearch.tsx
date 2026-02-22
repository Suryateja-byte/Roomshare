"use client";

/**
 * CollapsedMobileSearch - Compact search bar shown when scrolled on mobile
 *
 * Shows a minimal summary of current search state:
 * - Location name (or "Where to?")
 * - Active filter count badge
 *
 * Tapping expands to show the full search form.
 *
 * Design inspired by Airbnb's collapsing mobile search bar.
 */

import { Search, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

interface CollapsedMobileSearchProps {
  /** Callback when tapped to expand */
  onExpand: () => void;
  /** Optional: open filter drawer directly */
  onOpenFilters?: () => void;
}

export default function CollapsedMobileSearch({
  onExpand,
  onOpenFilters,
}: CollapsedMobileSearchProps) {
  const searchParams = useSearchParams();

  // Get current search state from URL
  const location = searchParams.get("q") || "";
  const minPrice = searchParams.get("minPrice");
  const maxPrice = searchParams.get("maxPrice");

  // Count active filters (excluding location and price which are shown separately)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchParams.get("moveInDate")) count++;
    if (
      searchParams.get("leaseDuration") &&
      searchParams.get("leaseDuration") !== "any"
    )
      count++;
    if (searchParams.get("roomType") && searchParams.get("roomType") !== "any")
      count++;
    // Count gender preferences
    if (
      searchParams.get("genderPreference") &&
      searchParams.get("genderPreference") !== "any"
    )
      count++;
    if (
      searchParams.get("householdGender") &&
      searchParams.get("householdGender") !== "any"
    )
      count++;
    // Count amenities
    searchParams.getAll("amenities").forEach(() => count++);
    // Count house rules
    searchParams.getAll("houseRules").forEach(() => count++);
    // Count languages
    searchParams.getAll("languages").forEach(() => count++);
    return count;
  }, [searchParams]);

  // Format price range display
  const priceDisplay = useMemo(() => {
    if (minPrice && maxPrice) {
      return `$${minPrice}-$${maxPrice}`;
    }
    if (minPrice) {
      return `$${minPrice}+`;
    }
    if (maxPrice) {
      return `Up to $${maxPrice}`;
    }
    return null;
  }, [minPrice, maxPrice]);

  // Build display text
  const displayText = location || "Where to?";

  return (
    <div className="md:hidden flex items-center gap-2 w-full max-w-md mx-auto px-3">
      {/* Main search area - tap to expand */}
      <button
        onClick={onExpand}
        className="flex-1 flex items-center gap-3 h-12 px-4 bg-white dark:bg-zinc-900 rounded-full shadow-sm border border-zinc-200 dark:border-zinc-700 hover:shadow-md transition-shadow"
        aria-label="Expand search"
      >
        <Search className="w-5 h-5 text-zinc-500 flex-shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <div
            className={`text-sm font-medium truncate ${
              location
                ? "text-zinc-900 dark:text-white"
                : "text-zinc-500 dark:text-zinc-500"
            }`}
          >
            {displayText}
          </div>
          {priceDisplay && (
            <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {priceDisplay}
            </div>
          )}
        </div>
      </button>

      {/* Filters button - direct access */}
      {onOpenFilters && (
        <button
          onClick={onOpenFilters}
          className="relative flex items-center justify-center w-12 h-12 bg-white dark:bg-zinc-900 rounded-full shadow-sm border border-zinc-200 dark:border-zinc-700 hover:shadow-md transition-shadow"
          aria-label={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ""}`}
          data-testid="mobile-filter-button"
        >
          <SlidersHorizontal className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900">
              {activeFilterCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
