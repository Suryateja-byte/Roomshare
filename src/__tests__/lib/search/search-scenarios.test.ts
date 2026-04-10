import { normalizeSearchQuery } from "@/lib/search/search-query";
import {
  buildScenarioLoadMoreResult,
  buildScenarioSearchListState,
  buildScenarioSearchMapState,
  resolveSearchScenario,
  SEARCH_SCENARIO_HEADER,
} from "@/lib/search/testing/search-scenarios";

describe("search-scenarios", () => {
  const previousEnv = process.env.ENABLE_SEARCH_TEST_SCENARIOS;

  beforeEach(() => {
    process.env.ENABLE_SEARCH_TEST_SCENARIOS = "true";
  });

  afterAll(() => {
    process.env.ENABLE_SEARCH_TEST_SCENARIOS = previousEnv;
  });

  it("ignores invalid or missing scenario headers", () => {
    expect(resolveSearchScenario({ headerValue: null })).toBeNull();
    expect(
      resolveSearchScenario({ headerValue: "not-a-real-scenario" })
    ).toBeNull();
    expect(
      resolveSearchScenario({ headerValue: SEARCH_SCENARIO_HEADER })
    ).toBeNull();
  });

  it("disables the seam when ENABLE_SEARCH_TEST_SCENARIOS is off", () => {
    process.env.ENABLE_SEARCH_TEST_SCENARIOS = "false";

    expect(
      resolveSearchScenario({ headerValue: "default-results" })
    ).toBeNull();
  });

  it("keeps queryHash stable across list, map, and load-more for the same query", async () => {
    const query = normalizeSearchQuery(
      new URLSearchParams(
        "where=Austin&lat=30.2672&lng=-97.7431&minPrice=900&maxPrice=1500"
      )
    );

    const listState = await buildScenarioSearchListState("default-results", {
      query,
    });
    const mapState = await buildScenarioSearchMapState("default-results", {
      query,
    });
    const loadMoreResult = await buildScenarioLoadMoreResult(
      "default-results",
      {
        query,
        cursor: listState.kind === "ok" ? listState.data.nextCursor : null,
      }
    );

    expect(listState.meta.queryHash).toBeTruthy();
    expect(mapState.meta.queryHash).toBe(listState.meta.queryHash);
    expect(loadMoreResult.meta.queryHash).toBe(listState.meta.queryHash);
  });

  it("returns degraded list state for v2 fallback scenario", async () => {
    const query = normalizeSearchQuery(
      new URLSearchParams("where=Austin&lat=30.2672&lng=-97.7431")
    );

    const state = await buildScenarioSearchListState(
      "v2-fails-v1-succeeds",
      {
        query,
      }
    );

    expect(state.kind).toBe("degraded");
    expect(state.meta.backendSource).toBe("v1-fallback");
    if (state.kind === "degraded") {
      expect(state.data.items.length).toBeGreaterThan(0);
    }
  });

  it("returns rate-limited map and load-more states when requested", async () => {
    const query = normalizeSearchQuery(
      new URLSearchParams("where=Austin&lat=30.2672&lng=-97.7431")
    );

    const mapState = await buildScenarioSearchMapState("rate-limited", {
      query,
    });
    const loadMore = await buildScenarioLoadMoreResult("rate-limited", {
      query,
      cursor: "scenario-page-2",
    });

    expect(mapState.kind).toBe("rate-limited");
    expect(loadMore.rateLimited).toBe(true);
    expect(loadMore.meta.backendSource).toBe("v2");
  });
});
