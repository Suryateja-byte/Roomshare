"use client";

import SortSelect from "@/components/SortSelect";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { SortOption } from "@/lib/data";

interface SearchResultsMobileSortProps {
  currentSort: SortOption;
}

export default function SearchResultsMobileSort({
  currentSort,
}: SearchResultsMobileSortProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop !== false) {
    return null;
  }

  return (
    <div className="flex justify-end py-2">
      <SortSelect currentSort={currentSort} />
    </div>
  );
}
