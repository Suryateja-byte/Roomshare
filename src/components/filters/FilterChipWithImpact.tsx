"use client";

/**
 * FilterChipWithImpact - Filter chip with auto-loaded impact count
 *
 * Wraps FilterChip and fetches impact count automatically after a short
 * delay (staggered to avoid flooding). Shows "+N" badge indicating how
 * many more results would appear if this filter were removed.
 */

import { useState, useEffect } from "react";
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
  /** Stagger index for auto-fetch delay (prevents request flooding) */
  index?: number;
}

export function FilterChipWithImpact({
  chip,
  onRemove,
  isRemoving = false,
  currentCount = null,
  index = 0,
}: FilterChipWithImpactProps) {
  const searchParams = useSearchParams();
  const [isHovering, setIsHovering] = useState(false);
  const [autoFetch, setAutoFetch] = useState(false);

  // Auto-fetch impact count after a staggered delay
  useEffect(() => {
    const timer = setTimeout(() => setAutoFetch(true), 500 + index * 200);
    return () => clearTimeout(timer);
  }, [index]);

  const { formattedDelta, isLoading } = useFilterImpactCount({
    searchParams,
    chip,
    isHovering: isHovering || autoFetch,
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
