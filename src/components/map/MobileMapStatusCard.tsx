"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearAllFilters,
  urlToFilterChips,
} from "@/components/filters/filter-chip-utils";
import {
  applySearchQueryChange,
  buildCanonicalSearchUrl,
  normalizeSearchQuery,
} from "@/lib/search/search-query";
import {
  getPriceParam,
  buildRawParamsFromSearchParams,
  parseSearchParams,
} from "@/lib/search-params";
import {
  generateFilterSuggestions,
  type FilterSuggestion,
} from "@/lib/near-matches";
import { SEARCH_MOBILE_STATUS_CARD_OFFSET } from "@/lib/mobile-layout";

const MAX_VISIBLE_CHIPS = 3;
const MAX_SUGGESTIONS = 2;

const SUGGESTION_TYPE_TO_PARAMS: Record<FilterSuggestion["type"], string[]> = {
  price: ["minPrice", "maxPrice", "minBudget", "maxBudget"],
  date: ["moveInDate"],
  roomType: ["roomType"],
  amenities: ["amenities"],
  leaseDuration: ["leaseDuration"],
};

export type MobileMapStatus = "confirmed-empty";

interface MobileMapStatusCardProps {
  status: MobileMapStatus;
  searchParams: URLSearchParams;
  onZoomOut: () => void;
}

export function MobileMapStatusCard({
  status,
  searchParams,
  onZoomOut,
}: MobileMapStatusCardProps) {
  const router = useRouter();
  const chips = useMemo(() => urlToFilterChips(searchParams), [searchParams]);
  const filtersActive = chips.length > 0;
  const visibleChips = chips.slice(0, MAX_VISIBLE_CHIPS);
  const overflowCount = chips.length - MAX_VISIBLE_CHIPS;

  const hasPriceOrDateFilter = useMemo(() => {
    const hasPrice =
      getPriceParam(searchParams, "min") !== undefined ||
      getPriceParam(searchParams, "max") !== undefined;
    const hasDate = Boolean(searchParams.get("moveInDate"));
    return hasPrice || hasDate;
  }, [searchParams]);

  const nearMatchesAlreadyOn = searchParams.get("nearMatches") === "1";
  const showNearMatches = hasPriceOrDateFilter && !nearMatchesAlreadyOn;

  const suggestions = useMemo(() => {
    if (!filtersActive) return [];
    const raw = buildRawParamsFromSearchParams(searchParams);
    const { filterParams } = parseSearchParams(raw);
    return generateFilterSuggestions(filterParams, 0).slice(0, MAX_SUGGESTIONS);
  }, [filtersActive, searchParams]);

  const handleClearFilters = () => {
    const cleared = clearAllFilters(searchParams);
    router.push(`/search${cleared ? `?${cleared}` : ""}`);
  };

  const handleNearMatches = () => {
    const currentQuery = normalizeSearchQuery(searchParams);
    router.push(
      buildCanonicalSearchUrl(
        applySearchQueryChange(currentQuery, "filter", {
          nearMatches: true,
        })
      )
    );
  };

  const handleRemoveSuggestion = (suggestion: FilterSuggestion) => {
    const currentQuery = normalizeSearchQuery(searchParams);
    const keysToRemove = new Set(SUGGESTION_TYPE_TO_PARAMS[suggestion.type]);
    router.push(
      buildCanonicalSearchUrl(
        applySearchQueryChange(currentQuery, "filter", {
          minPrice: keysToRemove.has("minPrice") ? undefined : currentQuery.minPrice,
          maxPrice: keysToRemove.has("maxPrice") ? undefined : currentQuery.maxPrice,
          moveInDate: keysToRemove.has("moveInDate")
            ? undefined
            : currentQuery.moveInDate,
          roomType: keysToRemove.has("roomType")
            ? undefined
            : currentQuery.roomType,
          leaseDuration: keysToRemove.has("leaseDuration")
            ? undefined
            : currentQuery.leaseDuration,
          amenities: keysToRemove.has("amenities")
            ? undefined
            : currentQuery.amenities,
        })
      )
    );
  };

  return (
    <div
      data-testid="mobile-map-status-card"
      data-status={status}
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute inset-x-4 z-[52]"
      style={{ bottom: SEARCH_MOBILE_STATUS_CARD_OFFSET }}
    >
      <div className="pointer-events-auto mx-auto w-full max-w-[22rem] overflow-hidden rounded-[1.75rem] border border-outline-variant/20 bg-surface-container-lowest/95 shadow-[0_18px_45px_-20px_rgba(0,0,0,0.35)] backdrop-blur-md">
        <div className="p-4">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface">
              <MapPin className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-on-surface">
                No places in this area
              </p>
              <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                Try zooming out or adjusting your filters.
              </p>
            </div>
          </div>

          {filtersActive && (
            <div
              className="mb-3 flex flex-wrap gap-1.5"
              data-testid="mobile-map-status-filter-chips"
            >
              {visibleChips.map((chip) => (
                <span
                  key={chip.id}
                  className="inline-flex items-center rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface-variant"
                >
                  {chip.label}
                </span>
              ))}
              {overflowCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface-variant">
                  +{overflowCount} more
                </span>
              )}
            </div>
          )}

          {suggestions.length > 0 && (
            <div
              className="mb-3 flex flex-wrap gap-1.5"
              data-testid="mobile-map-status-filter-suggestions"
            >
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.type}-${index}`}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-primary/20 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  onClick={() => handleRemoveSuggestion(suggestion)}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                  {suggestion.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={onZoomOut}
              className="h-10 min-w-[9rem] flex-1 rounded-full"
            >
              Zoom out
            </Button>
            {filtersActive && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleClearFilters}
                className="h-10 flex-1 rounded-full"
              >
                Clear filters
              </Button>
            )}
            {showNearMatches && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleNearMatches}
                className="h-10 min-w-full rounded-full"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Include near matches
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
