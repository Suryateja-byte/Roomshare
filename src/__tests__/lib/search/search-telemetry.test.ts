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
  getOwnerHashPrefix8,
  getSearchTelemetrySnapshot,
  recordListingCreateCollisionActionSelected,
  recordListingCreateCollisionDetected,
  recordListingCreateCollisionModerationGated,
  recordListingCreateCollisionResolved,
  recordLegacyUrlUsage,
  recordSearchClientAbort,
  recordSearchDedupMemberClick,
  recordSearchDedupOpenPanelClick,
  recordSearchLoadMoreError,
  recordSearchMapListMismatch,
  recordSearchRequestLatency,
  recordSearchV2Fallback,
  recordSearchZeroResults,
  resetSearchTelemetryForTests,
} from "@/lib/search/search-telemetry";
import {
  emitSearchDedupMemberClick,
  emitSearchDedupOpenPanelClick,
} from "@/lib/search/search-telemetry-client";

describe("search telemetry", () => {
  const originalOwnerHashSalt = process.env.OWNER_HASH_SALT;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSendBeacon = navigator.sendBeacon;
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetSearchTelemetryForTests();
    jest.clearAllMocks();
    delete process.env.OWNER_HASH_SALT;
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: originalNodeEnv,
    });
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: originalSendBeacon,
    });
    global.fetch = originalFetch;
  });

  afterEach(() => {
    if (originalOwnerHashSalt === undefined) {
      delete process.env.OWNER_HASH_SALT;
    } else {
      process.env.OWNER_HASH_SALT = originalOwnerHashSalt;
    }
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: originalNodeEnv,
    });
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: originalSendBeacon,
    });
    global.fetch = originalFetch;
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
    recordLegacyUrlUsage({
      alias: "startDate",
      surface: "ssr",
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
    expect(snapshot.legacyUrlCounts.ssr.startDate).toBe(1);

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
    expect(logger.sync.info).toHaveBeenCalledWith(
      "cfm.search.legacy_url_count",
      expect.objectContaining({
        alias: "startDate",
        surface: "ssr",
      })
    );
  });

  it("records listing collision telemetry with hashed owner prefixes", () => {
    process.env.OWNER_HASH_SALT = "test-owner-hash-salt-32-characters!!";
    const ownerHashPrefix8 = getOwnerHashPrefix8("owner-123");

    expect(ownerHashPrefix8).toHaveLength(8);

    recordListingCreateCollisionDetected({
      ownerHashPrefix8,
      siblingCount: 2,
    });
    recordListingCreateCollisionResolved({
      ownerHashPrefix8,
      action: "proceed",
    });
    recordListingCreateCollisionModerationGated({
      ownerHashPrefix8,
      windowCount24h: 3,
    });

    expect(logger.sync.info).toHaveBeenCalledWith(
      "listing_create_collision_detected_total",
      expect.objectContaining({
        ownerHashPrefix8,
        siblingCount: 2,
      })
    );
    expect(logger.sync.info).toHaveBeenCalledWith(
      "listing_create_collision_resolved_total",
      expect.objectContaining({
        ownerHashPrefix8,
        action: "proceed",
      })
    );
    expect(logger.sync.warn).toHaveBeenCalledWith(
      "listing_create_collision_moderation_gated_total",
      expect.objectContaining({
        ownerHashPrefix8,
        windowCount24h: 3,
      })
    );
  });

  it("records grouped-listing client telemetry events", () => {
    recordSearchDedupOpenPanelClick({
      groupSize: 4,
      queryHashPrefix8: "deadbeef",
    });
    recordSearchDedupMemberClick({
      groupSize: 4,
      memberIndex: 2,
    });
    recordListingCreateCollisionActionSelected({
      action: "create_separate",
    });

    expect(logger.sync.info).toHaveBeenCalledWith(
      "search_dedup_open_panel_click",
      expect.objectContaining({
        groupSize: 4,
        queryHashPrefix8: "deadbeef",
      })
    );
    expect(logger.sync.info).toHaveBeenCalledWith(
      "search_dedup_member_click",
      expect.objectContaining({
        groupSize: 4,
        memberIndex: 2,
      })
    );
    expect(logger.sync.info).toHaveBeenCalledWith(
      "listing_create_collision_action_selected",
      expect.objectContaining({
        action: "create_separate",
      })
    );
  });

  it("emits dedupe panel-open client metrics via sendBeacon", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: "development",
    });
    const sendBeacon = jest.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });

    emitSearchDedupOpenPanelClick({
      groupSize: 4,
      queryHashPrefix8: "deadbeef",
    });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, payload] = sendBeacon.mock.calls[0] as unknown as [
      string,
      BodyInit,
    ];
    expect(url).toBe("/api/metrics/search");
    await expect(new Response(payload).text()).resolves.toBe(
      JSON.stringify({
        metric: "search_dedup_open_panel_click",
        groupSize: 4,
        queryHashPrefix8: "deadbeef",
      })
    );
  });

  it("emits dedupe member-click client metrics via fetch when sendBeacon is unavailable", () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: "development",
    });
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: undefined,
    });
    const fetchMock = jest.fn().mockResolvedValue(new Response(null));
    global.fetch = fetchMock as typeof fetch;

    emitSearchDedupMemberClick({
      groupSize: 4,
      memberIndex: 2,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/metrics/search",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metric: "search_dedup_member_click",
          groupSize: 4,
          memberIndex: 2,
        }),
      })
    );
  });
});
