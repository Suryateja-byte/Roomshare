import { createSearchDocListCacheKey } from "@/lib/search/search-doc-queries";

describe("search cache key flag isolation", () => {
  const originalEnv = process.env.FEATURE_SEARCH_LISTING_DEDUP;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.FEATURE_SEARCH_LISTING_DEDUP;
      return;
    }

    process.env.FEATURE_SEARCH_LISTING_DEDUP = originalEnv;
  });

  it("isolates cache keys when search dedup is toggled", () => {
    const params = {
      query: "mission district",
      limit: 12,
      page: 1,
      sort: "recommended" as const,
    };

    process.env.FEATURE_SEARCH_LISTING_DEDUP = "false";
    const dedupOffKey = createSearchDocListCacheKey(params);

    process.env.FEATURE_SEARCH_LISTING_DEDUP = "true";
    const dedupOnKey = createSearchDocListCacheKey(params);

    expect(dedupOffKey).not.toEqual(dedupOnKey);
    expect(dedupOffKey).toContain('"dedup":"off"');
    expect(dedupOnKey).toContain('"dedup":"v1"');
  });
});
