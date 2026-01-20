/**
 * Near-matches filter expansion logic.
 *
 * When search results are low (<5), this module provides logic to expand
 * filters slightly to find "near match" listings that almost meet criteria.
 *
 * Expansion strategy prioritizes:
 * 1. Price: +10% maxPrice, -10% minPrice
 * 2. Move-in date: ±7 days
 *
 * Only ONE dimension is expanded at a time to keep results relevant.
 */

import type { FilterParams } from "./search-params";

/** Threshold below which we offer near-match expansion */
export const LOW_RESULTS_THRESHOLD = 5;

/** Rules for expanding filters */
export const NEAR_MATCH_RULES = {
  price: {
    /** Percentage to expand price range by */
    expandPercent: 10,
  },
  date: {
    /** Days to expand move-in date by (±) */
    expandDays: 7,
  },
} as const;

/**
 * Result of expanding filters for near matches.
 */
export interface NearMatchExpansion {
  /** The expanded filter params */
  expanded: FilterParams;
  /** Which dimension was expanded */
  expandedDimension: "price" | "date" | null;
  /** Human-readable description of the expansion */
  expansionDescription: string | null;
}

/**
 * Expand filters to find near-match listings.
 *
 * Priority:
 * 1. If price filters are set, expand price range by ±10%
 * 2. If move-in date is set, expand date range by ±7 days
 *
 * Only expands ONE dimension to keep results relevant.
 *
 * @param params - Original filter parameters
 * @returns Expanded filter params with metadata about what was expanded
 */
export function expandFiltersForNearMatches(
  params: FilterParams,
): NearMatchExpansion {
  // Check if price filters can be expanded
  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    const { expandPercent } = NEAR_MATCH_RULES.price;
    const multiplier = expandPercent / 100;

    const expanded: FilterParams = { ...params };

    // Expand minPrice down by percentage
    if (params.minPrice !== undefined && params.minPrice > 0) {
      expanded.minPrice = Math.floor(params.minPrice * (1 - multiplier));
    }

    // Expand maxPrice up by percentage
    if (params.maxPrice !== undefined) {
      expanded.maxPrice = Math.ceil(params.maxPrice * (1 + multiplier));
    }

    const parts: string[] = [];
    if (
      params.minPrice !== undefined &&
      expanded.minPrice !== params.minPrice
    ) {
      parts.push(`min $${expanded.minPrice}`);
    }
    if (
      params.maxPrice !== undefined &&
      expanded.maxPrice !== params.maxPrice
    ) {
      parts.push(`max $${expanded.maxPrice}`);
    }

    return {
      expanded,
      expandedDimension: "price",
      expansionDescription:
        parts.length > 0 ? `Price range expanded to ${parts.join(", ")}` : null,
    };
  }

  // Check if move-in date can be expanded
  if (params.moveInDate) {
    const { expandDays } = NEAR_MATCH_RULES.date;
    const originalDate = new Date(params.moveInDate);

    // Expand by moving the date back by expandDays
    // (allows listings available slightly later than requested)
    const expandedDate = new Date(originalDate);
    expandedDate.setDate(expandedDate.getDate() - expandDays);

    // Don't expand to dates in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (expandedDate < today) {
      expandedDate.setTime(today.getTime());
    }

    const expandedDateStr = expandedDate.toISOString().split("T")[0];

    // Only expand if the new date is different
    if (expandedDateStr !== params.moveInDate) {
      const expanded: FilterParams = {
        ...params,
        moveInDate: expandedDateStr,
      };

      return {
        expanded,
        expandedDimension: "date",
        expansionDescription: `Move-in date expanded to ${formatDate(expandedDateStr)}`,
      };
    }
  }

  // No expansion possible
  return {
    expanded: params,
    expandedDimension: null,
    expansionDescription: null,
  };
}

/**
 * Check if a listing is a "near match" (matched expanded but not original filters).
 *
 * This is used to tag listings that came from the expanded query but wouldn't
 * have matched the original strict filters.
 *
 * @param listing - The listing to check
 * @param originalParams - Original filter parameters
 * @param expandedDimension - Which dimension was expanded
 * @returns true if the listing is a near match (not an exact match)
 */
export function isNearMatch(
  listing: { price: number; available_from?: string | null },
  originalParams: FilterParams,
  expandedDimension: "price" | "date" | null,
): boolean {
  if (expandedDimension === null) {
    return false;
  }

  if (expandedDimension === "price") {
    // Check if listing price is outside original range
    if (
      originalParams.minPrice !== undefined &&
      listing.price < originalParams.minPrice
    ) {
      return true;
    }
    if (
      originalParams.maxPrice !== undefined &&
      listing.price > originalParams.maxPrice
    ) {
      return true;
    }
    return false;
  }

  if (expandedDimension === "date") {
    // Check if listing available_from is after original move-in date
    if (
      originalParams.moveInDate &&
      listing.available_from &&
      listing.available_from > originalParams.moveInDate
    ) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Generate filter suggestions for low results.
 *
 * Returns ranked suggestions for which filters to relax.
 *
 * @param params - Current filter parameters
 * @param resultCount - Number of results with current filters
 * @returns Array of suggestions with priority order
 */
export interface FilterSuggestion {
  /** Type of filter to adjust */
  type: "price" | "date" | "roomType" | "amenities" | "leaseDuration";
  /** Human-readable suggestion */
  label: string;
  /** Priority (lower = higher priority) */
  priority: number;
}

export function generateFilterSuggestions(
  params: FilterParams,
  _resultCount: number,
): FilterSuggestion[] {
  const suggestions: FilterSuggestion[] = [];

  // Price is highest priority - often the most restrictive filter
  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    if (params.minPrice !== undefined && params.maxPrice !== undefined) {
      suggestions.push({
        type: "price",
        label: `Expand price range ($${params.minPrice} - $${params.maxPrice})`,
        priority: 1,
      });
    } else if (params.maxPrice !== undefined) {
      suggestions.push({
        type: "price",
        label: `Increase max price ($${params.maxPrice})`,
        priority: 1,
      });
    } else if (params.minPrice !== undefined) {
      suggestions.push({
        type: "price",
        label: `Lower min price ($${params.minPrice})`,
        priority: 1,
      });
    }
  }

  // Move-in date is second priority
  if (params.moveInDate) {
    suggestions.push({
      type: "date",
      label: `Flexible on move-in date (${formatDate(params.moveInDate)})`,
      priority: 2,
    });
  }

  // Room type is third
  if (params.roomType) {
    suggestions.push({
      type: "roomType",
      label: `Any room type (currently: ${params.roomType})`,
      priority: 3,
    });
  }

  // Amenities can be restrictive
  if (params.amenities && params.amenities.length > 0) {
    const amenityCount = params.amenities.length;
    suggestions.push({
      type: "amenities",
      label: `Fewer amenities (${amenityCount} selected)`,
      priority: 4,
    });
  }

  // Lease duration
  if (params.leaseDuration) {
    suggestions.push({
      type: "leaseDuration",
      label: `Any lease duration (currently: ${params.leaseDuration})`,
      priority: 5,
    });
  }

  // Sort by priority and return top 4
  return suggestions.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

/**
 * Format a date string for display.
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}
