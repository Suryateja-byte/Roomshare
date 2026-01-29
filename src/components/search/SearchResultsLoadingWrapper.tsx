"use client";

import { Loader2 } from "lucide-react";
import { useSearchTransitionSafe } from "@/contexts/SearchTransitionContext";

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

  return (
    <div
      className="relative"
      aria-busy={isPending}
      aria-live="polite"
    >
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
