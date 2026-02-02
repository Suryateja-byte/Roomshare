"use client";

import { useEffect, useRef, useState } from "react";
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

  // Focus #search-results-heading when search params change (skip initial mount)
  const searchParams = useSearchParams();
  const paramsKey = searchParams.toString();
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    document.getElementById("search-results-heading")?.focus();
  }, [paramsKey]);

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
    >
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
          <div className="flex items-center gap-2 px-4 py-2 bg-white/90 dark:bg-zinc-900/90 rounded-full shadow-lg border border-zinc-200/50 dark:border-zinc-700/50 backdrop-blur-sm animate-in fade-in duration-200">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-600 dark:text-zinc-400" />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {isSlowTransition ? "Still loading..." : "Updating results..."}
            </span>
          </div>
        </div>
      )}

      {/* Content - always fully visible for accessibility/automation */}
      <div>
        {children}
      </div>

      {/* Translucent overlay dims content during loading without hiding children */}
      {isPending && (
        <div
          className="absolute inset-0 bg-white/40 dark:bg-zinc-950/40 z-[5] pointer-events-none transition-opacity duration-200"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
