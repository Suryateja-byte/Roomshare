"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { countActiveFilters } from "@/components/filters/filter-chip-utils";

interface CompactSearchPillProps {
  onExpand: () => void;
  onOpenFilters?: () => void;
}

/**
 * CompactSearchPill — Desktop-only shrunk search bar shown when scrolled.
 * Displays a summary of current search state; click expands back to full form.
 */
export function CompactSearchPill({
  onExpand,
  onOpenFilters,
}: CompactSearchPillProps) {
  const searchParams = useSearchParams();

  const hasSemanticQuery = searchParams.has("what");
  const location = hasSemanticQuery ? "" : searchParams.get("q") || "";
  const minPrice = searchParams.get("minPrice");
  const maxPrice = searchParams.get("maxPrice");
  const roomType = searchParams.get("roomType");
  const leaseDuration = searchParams.get("leaseDuration");

  const segments = useMemo(() => {
    const parts: string[] = [];
    parts.push(location || "Anywhere");
    if (minPrice && maxPrice) {
      parts.push(`$${minPrice}–$${maxPrice}`);
    } else if (minPrice) {
      parts.push(`$${minPrice}+`);
    } else if (maxPrice) {
      parts.push(`Up to $${maxPrice}`);
    }
    if (roomType && roomType !== "any") parts.push(roomType);
    if (leaseDuration && leaseDuration !== "any") parts.push(leaseDuration);
    return parts;
  }, [location, minPrice, maxPrice, roomType, leaseDuration]);

  // P1-3 FIX: Use shared countActiveFilters instead of ad-hoc counting.
  // Validates against allowlists, counts price range as 1 chip, handles nearMatches consistently.
  const filterCount = useMemo(
    () => countActiveFilters(searchParams),
    [searchParams]
  );

  return (
    <div className="hidden md:flex items-center gap-2 w-full max-w-2xl mx-auto">
      <button
        onClick={onExpand}
        className="flex-1 flex items-center gap-3 h-12 px-5 bg-surface-container-lowest rounded-full shadow-sm border border-outline-variant/20 hover:shadow-md transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
        aria-label="Expand search form"
      >
        <Search className="w-4 h-4 text-on-surface-variant flex-shrink-0" />
        <div className="flex items-center gap-2 min-w-0 text-sm">
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && (
                <span className="w-px h-4 bg-surface-container-high flex-shrink-0" />
              )}
              <span
                className={`truncate ${
                  i === 0
                    ? "font-medium text-on-surface"
                    : "text-on-surface-variant"
                }`}
              >
                {seg}
              </span>
            </span>
          ))}
        </div>
      </button>

      {onOpenFilters && (
        <button
          onClick={onOpenFilters}
          className="relative flex items-center justify-center w-12 h-12 bg-surface-container-lowest rounded-full shadow-sm border border-outline-variant/20 hover:shadow-md transition-shadow flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
          aria-label={`Filters${filterCount > 0 ? ` (${filterCount} active)` : ""}`}
        >
          <SlidersHorizontal className="w-4 h-4 text-on-surface-variant" />
          {filterCount > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-primary text-white">
              {filterCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

export default CompactSearchPill;
