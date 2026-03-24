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

/** Count param values, splitting CSV entries (e.g. "Wifi,AC" → 2). */
function countParamValues(searchParams: URLSearchParams, key: string): number {
  return searchParams
    .getAll(key)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean).length;
}

export default function CollapsedMobileSearch({
  onExpand,
  onOpenFilters,
}: CollapsedMobileSearchProps) {
  const searchParams = useSearchParams();

  // Get current search state from URL
  const hasSemanticQuery = searchParams.has("what");
  const location = hasSemanticQuery ? "" : searchParams.get("q") || "";
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
    // Count amenities (CSV-aware: useBatchedFilters serializes as "Wifi,AC")
    count += countParamValues(searchParams, "amenities");
    // Count house rules
    count += countParamValues(searchParams, "houseRules");
    // Count languages
    count += countParamValues(searchParams, "languages");
    // Count minSlots filter
    const minSlots = searchParams.get("minSlots");
    if (minSlots && parseInt(minSlots) >= 2) count++;
    // Count nearMatches filter
    if (
      searchParams.get("nearMatches") === "1" ||
      searchParams.get("nearMatches") === "true"
    )
      count++;
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
        className="flex-1 flex items-center gap-3 h-12 px-4 bg-surface-container-lowest rounded-full shadow-sm border border-outline-variant/20 hover:shadow-md transition-shadow"
        aria-label="Expand search"
      >
        <Search className="w-5 h-5 text-on-surface-variant flex-shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <div
            className={`text-sm font-medium truncate ${
              location
                ? "text-on-surface"
                : "text-on-surface-variant"
            }`}
          >
            {displayText}
          </div>
          {priceDisplay && (
            <div className="text-xs text-on-surface-variant truncate">
              {priceDisplay}
            </div>
          )}
        </div>
      </button>

      {/* Filters button - direct access */}
      {onOpenFilters && (
        <button
          onClick={onOpenFilters}
          className="relative flex items-center justify-center w-12 h-12 bg-surface-container-lowest rounded-full shadow-sm border border-outline-variant/20 hover:shadow-md transition-shadow"
          aria-label={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ""}`}
          data-testid="mobile-filter-button"
        >
          <SlidersHorizontal className="w-5 h-5 text-on-surface-variant" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-on-surface text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
