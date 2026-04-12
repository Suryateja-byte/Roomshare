"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchTransitionSafe } from "@/contexts/SearchTransitionContext";
import { useSearchParams } from "next/navigation";

interface SearchResultsLoadingWrapperProps {
  children: React.ReactNode;
}

/**
 * SearchResultsLoadingWrapper - Accessibility and focus coordination for
 * search transitions. Visual loading treatment lives in SearchResultsClient.
 */
export function SearchResultsLoadingWrapper({
  children,
}: SearchResultsLoadingWrapperProps) {
  const transitionContext = useSearchTransitionSafe();
  const isPending = transitionContext?.isPending ?? false;

  // Focus #search-results-heading when FILTER params change (skip initial mount & bounds-only changes)
  const searchParams = useSearchParams();
  const filterParamsKey = useMemo(() => {
    const filterOnly = new URLSearchParams(searchParams.toString());
    // Strip geographic/viewport params — focus should not move on map pan
    for (const k of [
      "minLat",
      "maxLat",
      "minLng",
      "maxLng",
      "lat",
      "lng",
      "zoom",
    ]) {
      filterOnly.delete(k);
    }
    filterOnly.sort();
    return filterOnly.toString();
  }, [searchParams]);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    document.getElementById("search-results-heading")?.focus();
  }, [filterParamsKey]);

  // Announce result count to screen readers when transition completes
  const prevPendingRef = useRef(false);
  const [srAnnouncement, setSrAnnouncement] = useState("");

  useEffect(() => {
    if (prevPendingRef.current && !isPending) {
      const heading = document.getElementById("search-results-heading");
      if (heading?.textContent) {
        setSrAnnouncement(heading.textContent);
      }
    }
    prevPendingRef.current = isPending;
  }, [isPending]);

  return (
    <div aria-busy={isPending} data-testid="search-results-pending-region">
      {/* Explicit SR announcement for result count changes */}
      <span className="sr-only" aria-live="polite" role="status">
        {srAnnouncement}
      </span>
      <div data-testid="search-results-content">{children}</div>
    </div>
  );
}
