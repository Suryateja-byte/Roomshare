import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

export const SEARCH_RESULTS_CACHE_TAG = "search-results";
export const SEARCH_MAP_CACHE_TAG = "search-map";
export const SEARCH_COUNT_CACHE_TAG = "search-count";
export const SEARCH_FACETS_CACHE_TAG = "search-facets";

const SEARCH_CACHE_TAGS = [
  SEARCH_RESULTS_CACHE_TAG,
  SEARCH_MAP_CACHE_TAG,
  SEARCH_COUNT_CACHE_TAG,
  SEARCH_FACETS_CACHE_TAG,
] as const;

/**
 * Invalidate search-facing caches after any capacity-affecting mutation.
 *
 * We revalidate the /search route itself for SSR freshness and also clear the
 * function-level SearchDoc caches used by list/map/count/facet surfaces.
 */
export function invalidateSearchCaches(): void {
  revalidatePath("/search", "page");

  const safeRevalidateTag = revalidateTag as unknown as
    | ((tag: string, profile?: "max") => void)
    | undefined;

  for (const tag of SEARCH_CACHE_TAGS) {
    safeRevalidateTag?.(tag, "max");
  }
}
