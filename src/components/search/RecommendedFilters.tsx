"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useTransition, useMemo } from "react";
import { Sparkles } from "lucide-react";
import { useSearchTransitionSafe } from "@/contexts/SearchTransitionContext";

/**
 * Filter suggestions with their corresponding URL param mappings.
 * Ordered by general popularity / usefulness.
 */
const SUGGESTIONS = [
  { label: "Parking", param: "amenities", value: "Parking" },
  { label: "Washer", param: "amenities", value: "Washer" },
  { label: "Month-to-month", param: "leaseDuration", value: "Month-to-month" },
  { label: "Couples OK", param: "houseRules", value: "Couples allowed" },
] as const;

const MAX_PILLS = 5;

function parseArrayParam(searchParams: URLSearchParams, key: string): string[] {
  return searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * RecommendedFilters — Shows contextual filter suggestion pills
 * above the search results. Only displays filters not yet applied.
 */
export function RecommendedFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const transitionContext = useSearchTransitionSafe();

  const available = useMemo(() => {
    return SUGGESTIONS.filter((s) => {
      // For array params, check if value is already in comma-separated list
      if (s.param === "amenities" || s.param === "houseRules") {
        const selected = parseArrayParam(searchParams, s.param);
        return !selected.includes(s.value);
      }
      // For scalar single-select params (leaseDuration),
      // hide if any value is already set for that param
      const current = searchParams.get(s.param) ?? "";
      return !current;
    }).slice(0, MAX_PILLS);
  }, [searchParams]);

  if (available.length === 0) return null;

  const handleClick = (suggestion: (typeof SUGGESTIONS)[number]) => {
    const params = new URLSearchParams(searchParams.toString());

    if (suggestion.param === "amenities" || suggestion.param === "houseRules") {
      const selected = parseArrayParam(params, suggestion.param);
      if (!selected.includes(suggestion.value)) {
        selected.push(suggestion.value);
      }
      params.delete(suggestion.param);
      if (selected.length > 0) {
        params.set(suggestion.param, selected.join(","));
      }
    } else {
      params.set(suggestion.param, suggestion.value);
    }

    // Reset pagination
    params.delete("cursor");
    params.delete("page");
    params.delete("cursorStack");
    params.delete("pageNumber");

    const url = `${pathname}${params.size ? `?${params.toString()}` : ""}`;
    if (transitionContext) {
      transitionContext.navigateWithTransition(url);
    } else {
      startTransition(() => {
        router.push(url);
      });
    }
  };

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar py-1.5 px-4 sm:px-5">
      <Sparkles
        className="w-3 h-3 text-primary/80 flex-shrink-0"
        aria-hidden="true"
      />
      <span className="text-xs font-semibold uppercase tracking-wider text-primary/80 flex-shrink-0 mr-0.5">
        Try
      </span>
      {available.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={() => handleClick(s)}
          disabled={isPending}
          className="flex-shrink-0 px-3 py-1 text-xs font-medium rounded-full border border-dashed border-primary/25 text-primary/80 hover:border-solid hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

export default RecommendedFilters;
