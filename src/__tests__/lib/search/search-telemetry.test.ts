jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
}));

import { logger } from "@/lib/logger";
import {
  getSearchTelemetrySnapshot,
  recordSearchClientAbort,
  recordSearchLoadMoreError,
  recordSearchMapListMismatch,
  recordSearchRequestLatency,
  recordSearchV2Fallback,
  recordSearchZeroResults,
  resetSearchTelemetryForTests,
} from "@/lib/search/search-telemetry";

describe("search telemetry", () => {
  beforeEach(() => {
    resetSearchTelemetryForTests();
    jest.clearAllMocks();
  });

  it("tracks request latency, backend source counts, and counters", () => {
    recordSearchRequestLatency({
      route: "search-page-ssr",
      durationMs: 120.12,
      backendSource: "v2",
      stateKind: "ok",
      queryHash: "hash-1",
      resultCount: 24,
    });
    recordSearchRequestLatency({
      route: "map-listings-api",
      durationMs: 40,
      backendSource: "map-api",
      stateKind: "ok",
      queryHash: "hash-1",
      resultCount: 12,
    });
    recordSearchV2Fallback({
      route: "search-listings-api",
      queryHash: "hash-2",
      reason: "v2_failed_or_unavailable",
    });
    recordSearchZeroResults({
      route: "search-page-ssr",
      queryHash: "hash-3",
      backendSource: "v1-fallback",
    });
    recordSearchLoadMoreError({
      route: "search-load-more",
      queryHash: "hash-4",
      reason: "degraded-fallback",
    });
    recordSearchMapListMismatch({
      route: "search-map-client",
      queryHash: "hash-5",
      responseQueryHash: "hash-old",
      reason: "stale-query-hash",
    });
    recordSearchClientAbort({
      route: "search-client",
      queryHash: "hash-6",
      reason: "superseded",
    });

    const snapshot = getSearchTelemetrySnapshot();

    expect(snapshot.requestLatency.count).toBe(2);
    expect(snapshot.requestLatency.sum).toBeCloseTo(160.12, 2);
    expect(snapshot.backendSourceCounts.v2).toBe(1);
    expect(snapshot.backendSourceCounts["map-api"]).toBe(1);
    expect(snapshot.backendSourceCounts["v1-fallback"]).toBe(0);
    expect(snapshot.v2FallbackTotal).toBe(1);
    expect(snapshot.zeroResultsTotal).toBe(1);
    expect(snapshot.loadMoreErrorTotal).toBe(1);
    expect(snapshot.mapListMismatchTotal).toBe(1);
    expect(snapshot.clientAbortTotal).toBe(1);

    expect(logger.sync.info).toHaveBeenCalledWith(
      "search_request_latency_ms",
      expect.objectContaining({
        route: "search-page-ssr",
        backendSource: "v2",
        queryHash: "hash-1",
      })
    );
    expect(logger.sync.warn).toHaveBeenCalledWith(
      "search_v2_fallback_total",
      expect.objectContaining({
        route: "search-listings-api",
        queryHash: "hash-2",
      })
    );
  });
});
