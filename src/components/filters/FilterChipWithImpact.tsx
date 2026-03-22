"use client";

/**
 * FilterChipWithImpact - Filter chip with hover-triggered impact count
 *
 * Wraps FilterChip and fetches impact count on hover. Shows "+N" badge
 * indicating how many more results would appear if this filter were removed.
 *
 * UX-14 FIX: Removed auto-fetch on page load (was 5-10 sequential API calls).
 * Impact counts now load on hover only (~200ms latency, single API call).
 * TODO: Consider a batch endpoint (POST /api/search/filter-impacts) that
 * accepts all active chips and returns counts in a single request.
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { FilterChip } from "./FilterChip";
import { useFilterImpactCount } from "@/hooks/useFilterImpactCount";
import type { FilterChipData } from "./filter-chip-utils";

export interface FilterChipWithImpactProps {
  /** The filter chip data */
  chip: FilterChipData;
  /** Called when the chip is removed */
  onRemove: () => void;
  /** Whether removal is in progress */
  isRemoving?: boolean;
  /** Current result count (for calculating delta) */
  currentCount?: number | null;
}

export function FilterChipWithImpact({
  chip,
  onRemove,
  isRemoving = false,
  currentCount = null,
}: FilterChipWithImpactProps) {
  const searchParams = useSearchParams();
  const [isHovering, setIsHovering] = useState(false);

  const { formattedDelta, isLoading } = useFilterImpactCount({
    searchParams,
    chip,
    isHovering,
    currentCount,
  });

  return (
    <FilterChip
      label={chip.label}
      onRemove={onRemove}
      isRemoving={isRemoving}
      impactDelta={formattedDelta}
      isImpactLoading={isLoading}
      onHoverStart={() => setIsHovering(true)}
      onHoverEnd={() => setIsHovering(false)}
    />
  );
}
