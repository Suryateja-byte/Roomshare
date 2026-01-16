"use server";

import {
  analyzeFilterImpact,
  type FilterParams,
  type FilterSuggestion,
} from "@/lib/data";

/**
 * Server action to lazily fetch filter suggestions
 * Called on-demand when user clicks "Show suggestions" button
 * Reduces DB load by not auto-computing on every zero-result render
 */
export async function getFilterSuggestions(
  params: FilterParams,
): Promise<FilterSuggestion[]> {
  return analyzeFilterImpact(params);
}
