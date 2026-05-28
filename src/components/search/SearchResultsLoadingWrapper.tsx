"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchTransitionSafe } from "@/contexts/SearchTransitionContext";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface SearchResultsLoadingWrapperProps {
  children: React.ReactNode;
}

/**
 * SearchResultsLoadingWrapper - Shows a non-jarring pending state during
 * filter, sort, and bounds transitions.
 *
 * The current results remain mounted so the list height and scroll position stay
 * stable while the next payload loads. Visual loading chrome is intentionally
 * quiet: screen readers still get a status update, but the UI does not blur or
 * cover stale results with a centered pill.
 *
 * UX considerations:
 * - Keeps current results visible (no jarring content flash)
 * - Avoids transition pills and list blur while preserving aria-busy
 * - Restricts aria-busy to the results body region
 */
export function SearchResultsLoadingWrapper({
  children,
}: SearchResultsLoadingWrapperProps) {
  const transitionContext = useSearchTransitionSafe();
  const isPending = transitionContext?.isPending ?? false;
  const pendingReason = transitionContext?.pendingReason ?? null;
  const isSlowTransition = transitionContext?.isSlowTransition ?? false;
  const isMapPanPending = isPending && pendingReason === "map-pan";
  const shouldBlockStaleInteractions = isPending && !isMapPanPending;
  const pendingLabel = isSlowTransition
    ? "Still loading..."
    : "Updating results...";

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
    <div
      className="relative"
      aria-busy={isPending}
      data-testid="search-results-pending-region"
    >
      {/* Explicit SR announcement for result count changes */}
      <span className="sr-only" aria-live="polite" role="status">
        {srAnnouncement}
      </span>

      {isPending && (
        <span
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="search-results-pending-status"
        >
          {pendingLabel}
        </span>
      )}

      <div
        data-testid="search-results-content"
        className={cn(
          shouldBlockStaleInteractions && "pointer-events-none select-none"
        )}
      >
        {children}
      </div>
    </div>
  );
}
