/**
 * P2-18: the three SearchDoc unstable_cache wrappers must declare `tags`
 * aligned with the tag constants in search-cache.ts, so invalidateSearchCaches'
 * revalidateTag calls actually match a cache entry (instead of being dead code).
 *
 * We mock next/cache's unstable_cache to capture the options object passed by
 * each wrapper, without invoking the wrapped (DB-bound) function.
 */

interface Captured {
  keys: string[];
  options: { revalidate?: number; tags?: string[] } | undefined;
}

jest.mock("next/cache", () => {
  const calls: Captured[] = [];
  return {
    __cacheCalls: calls,
    unstable_cache: (
      _fn: (...args: unknown[]) => unknown,
      keys: string[],
      options: { revalidate?: number; tags?: string[] } | undefined
    ) => {
      calls.push({ keys, options });
      // Return a stub so the wrapper never executes the DB-bound closure.
      return async () => undefined;
    },
    revalidatePath: () => {},
    revalidateTag: () => {},
  };
});

import * as nextCache from "next/cache";
import {
  SEARCH_COUNT_CACHE_TAG,
  SEARCH_MAP_CACHE_TAG,
  SEARCH_RESULTS_CACHE_TAG,
} from "@/lib/search/search-cache";
import {
  getSearchDocLimitedCount,
  getSearchDocMapListings,
  getSearchDocListingsPaginated,
} from "@/lib/search/search-doc-queries";

const cacheCalls = (
  nextCache as unknown as { __cacheCalls: Captured[] }
).__cacheCalls;

function findByKey(prefix: string): Captured | undefined {
  return cacheCalls.find((call) => call.keys[0] === prefix);
}

describe("SearchDoc cache wrappers declare invalidation tags (P2-18)", () => {
  beforeAll(async () => {
    cacheCalls.length = 0;
    await getSearchDocLimitedCount({});
    await getSearchDocMapListings({ bounds: { minLng: -1, minLat: -1, maxLng: 1, maxLat: 1 } });
    await getSearchDocListingsPaginated({});
  });

  it("tags the limited-count wrapper with the count cache tag", () => {
    const call = findByKey("searchdoc-limited-count");
    expect(call).toBeDefined();
    expect(call?.options?.tags).toContain(SEARCH_COUNT_CACHE_TAG);
  });

  it("tags the map-listings wrapper with the map cache tag", () => {
    const call = findByKey("searchdoc-map-listings");
    expect(call).toBeDefined();
    expect(call?.options?.tags).toContain(SEARCH_MAP_CACHE_TAG);
  });

  it("tags the paginated-listings wrapper with the results cache tag", () => {
    const call = findByKey("searchdoc-listings-paginated");
    expect(call).toBeDefined();
    expect(call?.options?.tags).toContain(SEARCH_RESULTS_CACHE_TAG);
  });

  it("keeps the 60s TTL alongside the new tags", () => {
    for (const prefix of [
      "searchdoc-limited-count",
      "searchdoc-map-listings",
      "searchdoc-listings-paginated",
    ]) {
      expect(findByKey(prefix)?.options?.revalidate).toBe(60);
    }
  });
});
