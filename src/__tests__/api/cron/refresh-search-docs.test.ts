jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

jest.mock("@/lib/cron-auth", () => ({
  validateCronAuth: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  getServerEnv: () => process.env,
  features: {
    get searchDocRescan() {
      if (process.env.ENABLE_SEARCH_DOC_RESCAN) {
        return process.env.ENABLE_SEARCH_DOC_RESCAN === "true";
      }
      if (process.env.SEARCH_DOC_RESCAN_ENABLED) {
        return process.env.SEARCH_DOC_RESCAN_ENABLED === "true";
      }
      return true;
    },
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : "Unknown error"
  ),
}));

jest.mock("@/lib/search/search-doc-sync", () => ({
  projectSearchDocument: jest.fn(),
}));

jest.mock("@/lib/search/search-doc-cron-telemetry", () => {
  const actual = jest.requireActual("@/lib/search/search-doc-cron-telemetry");
  return {
    ...actual,
    recordSearchDocCronRun: jest.fn((args: unknown) =>
      actual.recordSearchDocCronRun(args)
    ),
  };
});

jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest extends Request {
    declare headers: Headers;
    constructor(url: string, init?: RequestInit) {
      super(url, init);
    }
  },
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}));

import { GET as getRefreshSearchDocs } from "@/app/api/cron/refresh-search-docs/route";
import { GET as getMetricsOps } from "@/app/api/metrics/ops/route";
import { validateCronAuth } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import * as searchDocCronTelemetry from "@/lib/search/search-doc-cron-telemetry";
import {
  getSearchDocCronTelemetrySnapshot,
  resetSearchDocCronTelemetryForTests,
} from "@/lib/search/search-doc-cron-telemetry";
import { projectSearchDocument } from "@/lib/search/search-doc-sync";
import { NextRequest } from "next/server";

function createRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers.authorization = authHeader;
  }

  return new NextRequest(
    "http://localhost:3000/api/cron/refresh-search-docs",
    {
      method: "GET",
      headers,
    }
  );
}

function createMetricsRequest(): Request {
  return new Request("http://localhost:3000/api/metrics/ops", {
    headers: {
      authorization: "Bearer test-metrics-secret-32-chars-min!!",
    },
  });
}

function buildDirtyEntry(listingId: string, markedAt: Date) {
  return {
    listing_id: listingId,
    marked_at: markedAt,
  };
}

function getQueryText(mock: jest.Mock, callIndex: number): string {
  const firstArg = mock.mock.calls[callIndex]?.[0];
  if (Array.isArray(firstArg)) {
    return Array.from(firstArg as unknown as TemplateStringsArray).join(" ");
  }
  if (
    typeof firstArg === "object" &&
    firstArg !== null &&
    "strings" in firstArg &&
    Array.isArray((firstArg as { strings: string[] }).strings)
  ) {
    return (firstArg as { strings: string[] }).strings.join(" ");
  }
  if (
    typeof firstArg === "object" &&
    firstArg !== null &&
    "sql" in firstArg &&
    typeof (firstArg as { sql: string }).sql === "string"
  ) {
    return (firstArg as { sql: string }).sql;
  }
  return String(firstArg ?? "");
}

const mockQueryRaw = prisma.$queryRaw as jest.Mock;
const mockExecuteRaw = prisma.$executeRaw as jest.Mock;
const mockValidateCronAuth = validateCronAuth as jest.Mock;
const mockProjectSearchDocument = projectSearchDocument as jest.Mock;
const mockInfo = logger.sync.info as jest.Mock;
const mockWarn = logger.sync.warn as jest.Mock;

describe("GET /api/cron/refresh-search-docs", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    resetSearchDocCronTelemetryForTests();
    mockInfo.mockImplementation(() => undefined);
    mockWarn.mockImplementation(() => undefined);
    process.env = {
      ...originalEnv,
      METRICS_SECRET: "test-metrics-secret-32-chars-min!!",
      ENABLE_SEARCH_DOC_RESCAN: "true",
    } as NodeJS.ProcessEnv;
    delete process.env.SEARCH_DOC_CRON_TIME_BUDGET_MS;
    delete process.env.SEARCH_DOC_RESCAN_SAMPLE_SIZE;
    delete process.env.SEARCH_DOC_RESCAN_ENABLED;
    mockValidateCronAuth.mockReturnValue(null);
    mockExecuteRaw.mockResolvedValue(1);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("returns 401 when cron auth fails", async () => {
    const authResponse = {
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    };
    mockValidateCronAuth.mockReturnValue(authResponse);

    const response = await getRefreshSearchDocs(createRequest());

    expect(response.status).toBe(401);
  });

  it("returns zero counters when there is no dirty or rescan work", async () => {
    mockQueryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const response = await getRefreshSearchDocs(createRequest("Bearer valid"));
    const data = await response.json();

    expect(data).toMatchObject({
      success: true,
      processed: 0,
      repaired: 0,
      orphans: 0,
      suppressed: 0,
      deferred: 0,
      divergentMissingDoc: 0,
      divergentStaleDoc: 0,
      divergentVersionSkew: 0,
      dirtyQueueAgeP50Sec: 0,
      dirtyQueueAgeP95Sec: 0,
      errors: 0,
    });
    expect(mockProjectSearchDocument).not.toHaveBeenCalled();
    expect(getSearchDocCronTelemetrySnapshot().divergenceCounts).toEqual({
      missing: 0,
      stale: 0,
      version_skew: 0,
    });
  });

  it("counts version_skew divergences independently of stale_doc and missing_doc", async () => {
    const now = Date.parse("2026-04-17T18:00:00.000Z");
    jest.spyOn(Date, "now").mockReturnValue(now);
    mockQueryRaw
      .mockResolvedValueOnce([
        buildDirtyEntry("listing-a", new Date(now - 10_000)),
        buildDirtyEntry("listing-b", new Date(now - 20_000)),
        buildDirtyEntry("listing-c", new Date(now - 30_000)),
      ])
      .mockResolvedValueOnce([]);
    mockProjectSearchDocument
      .mockResolvedValueOnce({
        listingId: "listing-a",
        outcome: "upsert",
        divergenceReason: "version_skew",
        casSuppressionReason: null,
        hadExistingDoc: true,
        listingVersion: 5,
        docSourceVersion: 3,
        docProjectionVersion: 1,
        writeApplied: true,
      })
      .mockResolvedValueOnce({
        listingId: "listing-b",
        outcome: "upsert",
        divergenceReason: "version_skew",
        casSuppressionReason: null,
        hadExistingDoc: true,
        listingVersion: 6,
        docSourceVersion: 4,
        docProjectionVersion: 1,
        writeApplied: true,
      })
      .mockResolvedValueOnce({
        listingId: "listing-c",
        outcome: "upsert",
        divergenceReason: "stale_doc",
        casSuppressionReason: null,
        hadExistingDoc: true,
        listingVersion: 3,
        docSourceVersion: 3,
        docProjectionVersion: 1,
        writeApplied: true,
      });

    const response = await getRefreshSearchDocs(createRequest("Bearer valid"));
    const data = await response.json();

    expect(data).toMatchObject({
      success: true,
      processed: 3,
      repaired: 3,
      orphans: 0,
      suppressed: 0,
      deferred: 0,
      divergentMissingDoc: 0,
      divergentStaleDoc: 1,
      divergentVersionSkew: 2,
      dirtyQueueAgeP50Sec: 20,
      dirtyQueueAgeP95Sec: 30,
    });
  });

  it("clears dirty flags for handled suppressions and true orphans", async () => {
    const now = Date.parse("2026-04-17T18:00:00.000Z");
    jest.spyOn(Date, "now").mockReturnValue(now);
    mockQueryRaw
      .mockResolvedValueOnce([
        buildDirtyEntry("host-1", new Date(now - 10_000)),
        buildDirtyEntry("gone-1", new Date(now - 20_000)),
      ])
      .mockResolvedValueOnce([]);
    mockProjectSearchDocument
      .mockResolvedValueOnce({
        listingId: "host-1",
        outcome: "suppress_delete",
        divergenceReason: "stale_doc",
        casSuppressionReason: null,
        hadExistingDoc: true,
        listingVersion: 2,
        docSourceVersion: 2,
        docProjectionVersion: 1,
        writeApplied: false,
      })
      .mockResolvedValueOnce({
        listingId: "gone-1",
        outcome: "confirmed_orphan",
        divergenceReason: null,
        casSuppressionReason: null,
        hadExistingDoc: false,
        listingVersion: null,
        docSourceVersion: null,
        docProjectionVersion: null,
        writeApplied: false,
      });

    const response = await getRefreshSearchDocs(createRequest("Bearer valid"));
    const data = await response.json();

    expect(data).toMatchObject({
      success: true,
      processed: 0,
      repaired: 0,
      orphans: 1,
      suppressed: 1,
      deferred: 0,
      divergentMissingDoc: 0,
      divergentStaleDoc: 1,
    });
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it("keeps dirty flags when projection must defer for retry", async () => {
    const now = Date.parse("2026-04-17T18:00:00.000Z");
    jest.spyOn(Date, "now").mockReturnValue(now);
    mockQueryRaw
      .mockResolvedValueOnce([
        buildDirtyEntry("listing-1", new Date(now - 10_000)),
      ])
      .mockResolvedValueOnce([]);
    mockProjectSearchDocument.mockResolvedValue({
      listingId: "listing-1",
      outcome: "defer_retry",
      divergenceReason: "missing_doc",
      casSuppressionReason: null,
      hadExistingDoc: false,
      listingVersion: 2,
      docSourceVersion: null,
      docProjectionVersion: null,
      writeApplied: false,
    });

    const response = await getRefreshSearchDocs(createRequest("Bearer valid"));
    const data = await response.json();

    expect(data).toMatchObject({
      success: true,
      processed: 0,
      repaired: 0,
      orphans: 0,
      suppressed: 0,
      deferred: 1,
      divergentMissingDoc: 1,
      divergentStaleDoc: 0,
    });
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it("tracks projection failures via telemetry without losing eventual consistency", async () => {
    const now = Date.parse("2026-04-17T18:00:00.000Z");
    jest.spyOn(Date, "now").mockReturnValue(now);
    mockQueryRaw
      .mockResolvedValueOnce([
        buildDirtyEntry("upsert-1", new Date(now - 10_000)),
        buildDirtyEntry("defer-1", new Date(now - 20_000)),
        buildDirtyEntry("suppress-1", new Date(now - 30_000)),
        buildDirtyEntry("error-1", new Date(now - 40_000)),
      ])
      .mockResolvedValueOnce([]);
    mockProjectSearchDocument
      .mockResolvedValueOnce({
        listingId: "upsert-1",
        outcome: "upsert",
        divergenceReason: "missing_doc",
        casSuppressionReason: null,
        hadExistingDoc: false,
        listingVersion: 3,
        docSourceVersion: null,
        docProjectionVersion: null,
        writeApplied: true,
      })
      .mockResolvedValueOnce({
        listingId: "defer-1",
        outcome: "defer_retry",
        divergenceReason: "stale_doc",
        casSuppressionReason: null,
        hadExistingDoc: true,
        listingVersion: 4,
        docSourceVersion: 4,
        docProjectionVersion: 1,
        writeApplied: false,
      })
      .mockResolvedValueOnce({
        listingId: "suppress-1",
        outcome: "suppress_delete",
        divergenceReason: null,
        casSuppressionReason: null,
        hadExistingDoc: false,
        listingVersion: 5,
        docSourceVersion: null,
        docProjectionVersion: null,
        writeApplied: false,
      })
      .mockRejectedValueOnce(new Error("projection failed"));

    const response = await getRefreshSearchDocs(createRequest("Bearer valid"));
    const data = await response.json();

    expect(data).toMatchObject({
      success: false,
      processed: 1,
      repaired: 1,
      orphans: 0,
      suppressed: 1,
      deferred: 1,
      divergentMissingDoc: 1,
      divergentStaleDoc: 1,
      errors: 1,
    });
    expect(getSearchDocCronTelemetrySnapshot().errorCounts).toEqual({
      projection_error: 1,
    });
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it("repairs dirty and rescan drift, exposes matching ops metrics, and never logs raw listing ids", async () => {
    const now = Date.parse("2026-04-17T18:00:00.000Z");
    jest.spyOn(Date, "now").mockReturnValue(now);
    mockQueryRaw
      .mockResolvedValueOnce([
        buildDirtyEntry("missing-1", new Date(now - 10_000)),
        buildDirtyEntry("stale-1", new Date(now - 20_000)),
        buildDirtyEntry("skew-1", new Date(now - 100_000)),
      ])
      .mockResolvedValueOnce([{ id: "rescan-1" }]);
    mockProjectSearchDocument
      .mockResolvedValueOnce({
        listingId: "missing-1",
        outcome: "upsert",
        divergenceReason: "missing_doc",
        casSuppressionReason: null,
        hadExistingDoc: false,
        listingVersion: 3,
        docSourceVersion: null,
        docProjectionVersion: null,
        writeApplied: true,
      })
      .mockResolvedValueOnce({
        listingId: "stale-1",
        outcome: "upsert",
        divergenceReason: "stale_doc",
        casSuppressionReason: null,
        hadExistingDoc: true,
        listingVersion: 4,
        docSourceVersion: 4,
        docProjectionVersion: 1,
        writeApplied: true,
      })
      .mockResolvedValueOnce({
        listingId: "skew-1",
        outcome: "upsert",
        divergenceReason: "version_skew",
        casSuppressionReason: null,
        hadExistingDoc: true,
        listingVersion: 5,
        docSourceVersion: 4,
        docProjectionVersion: 1,
        writeApplied: true,
      })
      .mockResolvedValueOnce({
        listingId: "rescan-1",
        outcome: "upsert",
        divergenceReason: "stale_doc",
        casSuppressionReason: null,
        hadExistingDoc: true,
        listingVersion: 6,
        docSourceVersion: 6,
        docProjectionVersion: 1,
        writeApplied: true,
      });

    const response = await getRefreshSearchDocs(createRequest("Bearer valid"));
    const data = await response.json();

    expect(data).toMatchObject({
      success: true,
      processed: 4,
      repaired: 4,
      divergentMissingDoc: 1,
      divergentStaleDoc: 2,
      divergentVersionSkew: 1,
      dirtyQueueAgeP50Sec: 20,
      dirtyQueueAgeP95Sec: 100,
      errors: 0,
    });

    const snapshot = getSearchDocCronTelemetrySnapshot();
    expect(snapshot).toEqual({
      divergenceCounts: {
        missing: 1,
        stale: 2,
        version_skew: 1,
      },
      repairedCounts: {
        missing: 1,
        stale: 2,
        version_skew: 1,
      },
      casSuppressedCounts: {
        older_source_version: 0,
        older_projection_version: 0,
      },
      processedCount: 4,
      errorCounts: {
        projection_error: 0,
      },
      dirtyQueueAgeSeconds: {
        p50: 20,
        p95: 100,
        count: 3,
        sum: 130,
      },
      lastRunPartial: false,
    });

    const metricsResponse = await getMetricsOps(createMetricsRequest());
    const metricsText = await metricsResponse.text();
    expect(metricsText).toContain(
      'cfm_search_doc_divergence_count{reason="missing"} 1'
    );
    expect(metricsText).toContain(
      'cfm_search_doc_divergence_count{reason="stale"} 2'
    );
    expect(metricsText).toContain(
      'cfm_search_doc_divergence_count{reason="version_skew"} 1'
    );
    expect(metricsText).toContain(
      'cfm_search_doc_repaired_count{reason="stale"} 2'
    );
    expect(metricsText).toContain(
      'cfm_search_dirty_queue_age_seconds{quantile="0.5"} 20'
    );
    expect(metricsText).toContain(
      'cfm_search_dirty_queue_age_seconds{quantile="0.95"} 100'
    );
    expect(metricsText).toContain("cfm_search_dirty_queue_age_seconds_count 3");
    expect(metricsText).toContain("cfm_search_dirty_queue_age_seconds_sum 130");
    expect(metricsText).toContain(
      'cfm_search_doc_cas_suppressed_count{reason="older_source_version"} 0'
    );
    expect(metricsText).toContain("cfm_search_doc_cron_last_run_partial 0");
    expect(metricsText).toContain("cfm_search_refresh_processed_count 4");
    expect(metricsText).toContain(
      'cfm_search_refresh_error_count{reason="projection_error"} 0'
    );

    expect(mockProjectSearchDocument.mock.calls.map(([listingId]) => listingId)).toEqual([
      "missing-1",
      "stale-1",
      "skew-1",
      "rescan-1",
    ]);

    const rescanQuery = getQueryText(mockQueryRaw, 1);
    expect(rescanQuery).toContain("TABLESAMPLE");
    expect(rescanQuery).toContain("SYSTEM_ROWS");
    expect(rescanQuery).toContain("listing_search_doc_dirty");

    const divergenceLogs = mockInfo.mock.calls.filter(
      ([message]) => message === "cfm.search.doc.divergence_detected"
    );
    expect(divergenceLogs).toHaveLength(4);
    for (const [, payload] of divergenceLogs) {
      expect(payload).toEqual(
        expect.objectContaining({
          listingIdHash: expect.stringMatching(/^[0-9a-f]{16}$/),
          reason: expect.stringMatching(/^(missing|stale|version_skew)$/),
        })
      );
      expect(payload).not.toHaveProperty("listingId");
    }
  });

  it("skips the rescan phase when the kill switch is disabled", async () => {
    process.env.ENABLE_SEARCH_DOC_RESCAN = "false";
    const now = Date.parse("2026-04-17T18:00:00.000Z");
    jest.spyOn(Date, "now").mockReturnValue(now);
    mockQueryRaw.mockResolvedValueOnce([
      buildDirtyEntry("listing-1", new Date(now - 10_000)),
    ]);
    mockProjectSearchDocument.mockResolvedValueOnce({
      listingId: "listing-1",
      outcome: "upsert",
      divergenceReason: "missing_doc",
      casSuppressionReason: null,
      hadExistingDoc: false,
      listingVersion: 3,
      docSourceVersion: null,
      docProjectionVersion: null,
      writeApplied: true,
    });

    const response = await getRefreshSearchDocs(createRequest("Bearer valid"));
    const data = await response.json();

    expect(data).toMatchObject({
      success: true,
      processed: 1,
      repaired: 1,
    });
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(mockProjectSearchDocument).toHaveBeenCalledTimes(1);
  });

  it("tracks CAS-suppressed writes by reason and exposes the counter series", async () => {
    const now = Date.parse("2026-04-17T18:00:00.000Z");
    jest.spyOn(Date, "now").mockReturnValue(now);
    mockQueryRaw.mockResolvedValueOnce([
      buildDirtyEntry("projection-1", new Date(now - 10_000)),
      buildDirtyEntry("source-1", new Date(now - 20_000)),
    ]);
    mockProjectSearchDocument
      .mockResolvedValueOnce({
        listingId: "projection-1",
        outcome: "upsert",
        divergenceReason: null,
        casSuppressionReason: "older_projection_version",
        hadExistingDoc: true,
        listingVersion: 5,
        docSourceVersion: 5,
        docProjectionVersion: 2,
        writeApplied: false,
      })
      .mockResolvedValueOnce({
        listingId: "source-1",
        outcome: "upsert",
        divergenceReason: null,
        casSuppressionReason: "older_source_version",
        hadExistingDoc: true,
        listingVersion: 4,
        docSourceVersion: 5,
        docProjectionVersion: 1,
        writeApplied: false,
      });

    const response = await getRefreshSearchDocs(createRequest("Bearer valid"));
    const data = await response.json();

    expect(data).toMatchObject({
      success: true,
      processed: 2,
      repaired: 0,
      casSuppressedOlderSourceVersion: 1,
      casSuppressedOlderProjectionVersion: 1,
      partial: false,
    });

    const snapshot = getSearchDocCronTelemetrySnapshot();
    expect(snapshot.casSuppressedCounts).toEqual({
      older_source_version: 1,
      older_projection_version: 1,
    });
    expect(snapshot.lastRunPartial).toBe(false);

    const metricsResponse = await getMetricsOps(createMetricsRequest());
    const metricsText = await metricsResponse.text();
    expect(metricsText).toContain(
      'cfm_search_doc_cas_suppressed_count{reason="older_source_version"} 1'
    );
    expect(metricsText).toContain(
      'cfm_search_doc_cas_suppressed_count{reason="older_projection_version"} 1'
    );
  });

  it("skips the rescan phase when the cron time budget is exhausted", async () => {
    process.env.SEARCH_DOC_CRON_TIME_BUDGET_MS = "10";
    const nowSpy = jest.spyOn(Date, "now");
    const now = Date.parse("2026-04-17T18:00:00.000Z");
    nowSpy
      .mockReturnValueOnce(now)
      .mockReturnValueOnce(now)
      .mockReturnValueOnce(now + 50)
      .mockReturnValueOnce(now + 60);
    mockQueryRaw.mockResolvedValueOnce([
      buildDirtyEntry("listing-1", new Date(now - 10_000)),
    ]);
    mockProjectSearchDocument.mockResolvedValueOnce({
      listingId: "listing-1",
      outcome: "upsert",
      divergenceReason: "missing_doc",
      casSuppressionReason: null,
      hadExistingDoc: false,
      listingVersion: 3,
      docSourceVersion: null,
      docProjectionVersion: null,
      writeApplied: true,
    });

    const response = await getRefreshSearchDocs(createRequest("Bearer valid"));
    const data = await response.json();

    expect(data).toMatchObject({
      success: true,
      processed: 1,
      repaired: 1,
    });
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(mockProjectSearchDocument).toHaveBeenCalledTimes(1);
  });

  it("records a partial run from finally when the cron body throws", async () => {
    const recordRunSpy = searchDocCronTelemetry
      .recordSearchDocCronRun as jest.Mock;
    const now = Date.parse("2026-04-17T18:00:00.000Z");
    jest.spyOn(Date, "now").mockReturnValue(now);
    mockQueryRaw.mockResolvedValueOnce([
      buildDirtyEntry("listing-1", new Date(now - 10_000)),
    ]);
    mockProjectSearchDocument.mockResolvedValueOnce({
      listingId: "listing-1",
      outcome: "upsert",
      divergenceReason: "missing_doc",
      casSuppressionReason: null,
      hadExistingDoc: false,
      listingVersion: 3,
      docSourceVersion: null,
      docProjectionVersion: null,
      writeApplied: true,
    });
    mockInfo.mockImplementation((message: string) => {
      if (message === "[SearchDoc Cron] Complete") {
        throw new Error("log failed");
      }
    });

    const response = await getRefreshSearchDocs(createRequest("Bearer valid"));
    const snapshot = getSearchDocCronTelemetrySnapshot();

    expect(response.status).toBe(500);
    expect(recordRunSpy).toHaveBeenCalledTimes(1);
    expect(recordRunSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        processedCount: 1,
        partial: true,
      })
    );
    expect(snapshot.lastRunPartial).toBe(true);
  });

  it("truncates the phase-2 rescan when the max-duration safety margin is exhausted", async () => {
    const base = Date.parse("2026-04-17T18:00:00.000Z");
    const nowSpy = jest.spyOn(Date, "now");
    const nowValues = [
      base,
      base,
      base,
      base + 25_000,
      base + 28_500,
      base + 28_500,
      base + 28_500,
    ];
    nowSpy.mockImplementation(() => nowValues.shift() ?? base + 28_500);
    mockQueryRaw
      .mockResolvedValueOnce([buildDirtyEntry("dirty-1", new Date(base - 10_000))])
      .mockResolvedValueOnce([
        { id: "rescan-1" },
        { id: "rescan-2" },
        { id: "rescan-3" },
        { id: "rescan-4" },
        { id: "rescan-5" },
        { id: "rescan-6" },
        { id: "rescan-7" },
        { id: "rescan-8" },
        { id: "rescan-9" },
        { id: "rescan-10" },
      ]);
    mockProjectSearchDocument
      .mockResolvedValueOnce({
        listingId: "dirty-1",
        outcome: "upsert",
        divergenceReason: "missing_doc",
        casSuppressionReason: null,
        hadExistingDoc: false,
        listingVersion: 1,
        docSourceVersion: null,
        docProjectionVersion: null,
        writeApplied: true,
      })
      .mockResolvedValue({
        listingId: "rescan-1",
        outcome: "upsert",
        divergenceReason: "stale_doc",
        casSuppressionReason: null,
        hadExistingDoc: true,
        listingVersion: 2,
        docSourceVersion: 2,
        docProjectionVersion: 1,
        writeApplied: true,
      });

    const response = await getRefreshSearchDocs(createRequest("Bearer valid"));
    const data = await response.json();

    expect(data).toMatchObject({
      success: true,
      processed: 6,
      repaired: 6,
      partial: true,
    });
    expect(mockProjectSearchDocument.mock.calls.map(([listingId]) => listingId)).toEqual([
      "dirty-1",
      "rescan-1",
      "rescan-2",
      "rescan-3",
      "rescan-4",
      "rescan-5",
    ]);
    expect(mockWarn).toHaveBeenCalledWith(
      "[SearchDoc Cron] Rescan truncated by time budget",
      expect.objectContaining({
        event: "search_doc_cron_rescan_truncated",
        dropped: 5,
      })
    );
    expect(getSearchDocCronTelemetrySnapshot().lastRunPartial).toBe(true);
  });
});
