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
import { useMemo, type RefObject } from "react";
import { urlToFilterChips } from "@/components/filters/filter-chip-utils";
import { readSearchIntentState } from "@/lib/search/search-intent";

interface CollapsedMobileSearchProps {
  /** Callback when tapped to expand */
  onExpand: () => void;
  /** Optional: open filter drawer directly */
  onOpenFilters?: () => void;
  /** Ref used to restore focus when the mobile overlay closes */
  expandButtonRef?: RefObject<HTMLButtonElement | null>;
}

function formatMoveInSummary(moveInDate: string | null): string | null {
  if (!moveInDate) return null;

  const parsed = new Date(`${moveInDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function formatRoomTypeSummary(roomType: string | null): string | null {
  if (!roomType) return null;
  if (roomType === "Entire Place") return "Entire place";
  return roomType;
}

export default function CollapsedMobileSearch({
  onExpand,
  onOpenFilters,
  expandButtonRef,
}: CollapsedMobileSearchProps) {
  const searchParams = useSearchParams();

  // Get current search state from URL
  const intentState = useMemo(
    () => readSearchIntentState(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );
  const location = intentState.locationSummary;
  const minPrice = searchParams.get("minPrice");
  const maxPrice = searchParams.get("maxPrice");
  const moveInSummary = useMemo(
    () => formatMoveInSummary(searchParams.get("moveInDate")),
    [searchParams]
  );
  const roomTypeSummary = useMemo(
    () => formatRoomTypeSummary(searchParams.get("roomType")),
    [searchParams]
  );

  // Count active filters using shared chip logic with allowlist validation.
  // Price chips are excluded because price is shown separately in the display text below.
  // STABILIZATION FIX: Replaces ad-hoc counting that skipped allowlist validation and
  // could inflate badge counts for garbage URL values (e.g. invalid amenity names).
  const activeFilterCount = useMemo(() => {
    const chips = urlToFilterChips(searchParams);
    return chips.filter(
      (c) =>
        c.paramKey !== "price-range" &&
        c.paramKey !== "minPrice" &&
        c.paramKey !== "maxPrice"
    ).length;
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
  const displayText =
    location && location !== "Anywhere" ? location : "Where to?";
  const secondaryText = useMemo(() => {
    const summary: string[] = [];

    if (moveInSummary) summary.push(moveInSummary);
    if (priceDisplay) summary.push(priceDisplay);
    if (!moveInSummary && roomTypeSummary) summary.push(roomTypeSummary);

    if (summary.length < 2 && activeFilterCount > 0) {
      summary.push(
        `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"}`
      );
    }

    if (
      summary.length < 2 &&
      roomTypeSummary &&
      !summary.includes(roomTypeSummary)
    ) {
      summary.push(roomTypeSummary);
    }

    return summary.slice(0, 2).join(" · ") || "Any budget · Flexible move-in";
  }, [activeFilterCount, moveInSummary, priceDisplay, roomTypeSummary]);

  return (
    <div className="md:hidden flex items-center gap-2 w-full max-w-md mx-auto px-3">
      {/* Main search area - tap to expand */}
      <button
        ref={expandButtonRef}
        onClick={onExpand}
        className="flex-1 flex items-center gap-3 min-h-[52px] px-4 py-2 bg-surface-container-lowest rounded-full shadow-ambient-sm border border-outline-variant/20 hover:shadow-ambient transition-shadow"
        aria-label="Expand search"
      >
        <Search className="w-5 h-5 text-on-surface-variant flex-shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <div
            className={`text-sm font-medium truncate ${
              location ? "text-on-surface" : "text-on-surface-variant"
            }`}
          >
            {displayText}
          </div>
          <div className="text-xs text-on-surface-variant truncate">
            {secondaryText}
          </div>
        </div>
      </button>

      {/* Filters button - direct access */}
      {onOpenFilters && (
        <button
          onClick={onOpenFilters}
          className="relative flex items-center justify-center size-[52px] bg-surface-container-lowest rounded-full shadow-ambient-sm border border-outline-variant/20 hover:shadow-ambient transition-shadow"
          aria-label={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ""}`}
          data-testid="mobile-filter-button"
        >
          <SlidersHorizontal className="w-5 h-5 text-on-surface-variant" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-on-surface text-surface-container-lowest">
              {activeFilterCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
