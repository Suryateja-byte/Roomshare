"use client";

/**
 * LowResultsGuidance - Guidance panel for low search results
 *
 * Displays when search returns fewer than 5 results.
 * Shows filter suggestions and an "Include near matches" toggle.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Lightbulb, Sparkles, ChevronRight } from "lucide-react";
import type { FilterParams } from "@/lib/search-params";
import {
  LOW_RESULTS_THRESHOLD,
  generateFilterSuggestions,
  type FilterSuggestion,
} from "@/lib/near-matches";

interface LowResultsGuidanceProps {
  /** Current result count */
  resultCount: number;
  /** Current filter parameters */
  filterParams: FilterParams;
  /** Whether near matches are currently enabled */
  nearMatchesEnabled: boolean;
  /** Optional: Count of near-match results available */
  nearMatchCount?: number;
}

export function LowResultsGuidance({
  resultCount,
  filterParams,
  nearMatchesEnabled,
  nearMatchCount,
}: LowResultsGuidanceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Handle toggle near matches - must be defined before early returns (Rules of Hooks)
  const handleToggleNearMatches = useCallback(() => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("nearMatches", "1");
      // Reset to page 1 when enabling near matches
      params.delete("page");
      router.push(`/search?${params.toString()}`, { scroll: false });
    });
  }, [router, searchParams]);

  // Handle suggestion click - remove the filter
  const handleSuggestionClick = useCallback(
    (suggestion: FilterSuggestion) => {
      startTransition(() => {
        const params = new URLSearchParams(searchParams.toString());

        switch (suggestion.type) {
          case "price":
            params.delete("minPrice");
            params.delete("maxPrice");
            break;
          case "date":
            params.delete("moveInDate");
            break;
          case "roomType":
            params.delete("roomType");
            break;
          case "amenities":
            params.delete("amenities");
            break;
          case "leaseDuration":
            params.delete("leaseDuration");
            break;
        }

        // Reset to page 1 when changing filters
        params.delete("page");
        router.push(`/search?${params.toString()}`, { scroll: false });
      });
    },
    [router, searchParams],
  );

  // Don't show if we have enough results or no results at all
  if (resultCount >= LOW_RESULTS_THRESHOLD || resultCount === 0) {
    return null;
  }

  // Don't show if near matches are already enabled
  if (nearMatchesEnabled) {
    return null;
  }

  const suggestions = generateFilterSuggestions(filterParams, resultCount);

  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 rounded-full bg-amber-100 p-2 dark:bg-amber-900/50">
          <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Only {resultCount} {resultCount === 1 ? "listing" : "listings"}{" "}
            found
          </h3>

          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            Try adjusting your filters to see more options:
          </p>

          {/* Filter suggestions */}
          {suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.type}
                  onClick={() => handleSuggestionClick(suggestion)}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-amber-800/50"
                >
                  {suggestion.label}
                  <ChevronRight className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}

          {/* Near matches toggle */}
          <div className="mt-4 border-t border-amber-200 pt-4 dark:border-amber-800">
            <Button
              onClick={handleToggleNearMatches}
              disabled={isPending}
              variant="outline"
              size="sm"
              className="group border-amber-400 bg-white text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-600 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-amber-800/50"
            >
              <Sparkles className="mr-2 h-4 w-4 text-amber-500 group-hover:text-amber-600" />
              Include near matches
              {nearMatchCount !== undefined && nearMatchCount > 0 && (
                <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-800 dark:text-amber-200">
                  +{nearMatchCount}
                </span>
              )}
            </Button>
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              See listings that almost match your filters (slightly outside
              price or date range)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
