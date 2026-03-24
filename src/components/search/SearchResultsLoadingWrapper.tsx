"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useSearchTransitionSafe } from "@/contexts/SearchTransitionContext";
import { useSearchParams } from "next/navigation";

interface SearchResultsLoadingWrapperProps {
  children: React.ReactNode;
}

/**
 * SearchResultsLoadingWrapper - Shows loading state during filter transitions
 *
 * This component wraps the search results and displays a subtle loading indicator
 * when the user changes filters, sorts, or navigates between pages.
 *
 * UX considerations:
 * - Keeps current results visible (no jarring content flash)
 * - Shows spinner + opacity reduction to indicate loading
 * - Accessible with aria-busy attribute
 * - Smooth transitions for professional feel
 */
export function SearchResultsLoadingWrapper({
  children,
}: SearchResultsLoadingWrapperProps) {
  const transitionContext = useSearchTransitionSafe();
  const isPending = transitionContext?.isPending ?? false;
  const isSlowTransition = transitionContext?.isSlowTransition ?? false;

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
    <div className="relative" aria-busy={isPending}>
      {/* Explicit SR announcement for result count changes */}
      <span className="sr-only" aria-live="polite" role="status">
        {srAnnouncement}
      </span>
      {/* Loading overlay - shows during transitions */}
      {isPending && (
        <div
          className="absolute inset-0 z-10 flex items-start justify-center pt-24 pointer-events-none"
          aria-hidden="true"
        >
          <div className="flex items-center gap-2 px-4 py-2 bg-white/90 rounded-full shadow-lg border border-outline-variant/20/50 backdrop-blur-sm animate-in fade-in duration-200">
            <Loader2 className="w-4 h-4 animate-spin text-on-surface-variant" />
            <span className="text-sm font-medium text-on-surface-variant">
              {isSlowTransition ? "Still loading..." : "Updating results..."}
            </span>
          </div>
        </div>
      )}

      {/* Content - always fully visible for accessibility/automation */}
      <div>{children}</div>

      {/* Translucent overlay dims content during loading without hiding children */}
      {isPending && (
        <div
          className="absolute inset-0 bg-white/40 z-[5] pointer-events-none transition-opacity duration-200"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
