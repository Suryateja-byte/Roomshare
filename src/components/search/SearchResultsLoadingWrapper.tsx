"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
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
 * stable while the next payload loads. Only the results body is dimmed and made
 * temporarily non-interactive.
 *
 * UX considerations:
 * - Keeps current results visible (no jarring content flash)
 * - Uses a compact status pill instead of painting a second card grid
 * - Restricts aria-busy to the results body region
 * - Smooth transitions for professional feel
 */
export function SearchResultsLoadingWrapper({
  children,
}: SearchResultsLoadingWrapperProps) {
  const transitionContext = useSearchTransitionSafe();
  const isPending = transitionContext?.isPending ?? false;
  const isSlowTransition = transitionContext?.isSlowTransition ?? false;
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
        <>
          <div
            className="pointer-events-none absolute inset-0 z-10 bg-surface-canvas/58 backdrop-blur-[1px] transition-opacity duration-200"
            data-testid="search-results-pending-overlay"
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              data-testid="search-results-pending-status"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-outline-variant/20 bg-surface-container-lowest/95 px-4 py-2 text-sm font-medium text-on-surface shadow-ambient backdrop-blur-md"
            >
              <Loader2
                className="h-4 w-4 animate-spin text-on-surface-variant"
                aria-hidden="true"
              />
              <span>{pendingLabel}</span>
            </div>
          </div>
        </>
      )}

      <div
        data-testid="search-results-content"
        className={cn(isPending && "pointer-events-none select-none")}
      >
        {children}
      </div>
    </div>
  );
}
