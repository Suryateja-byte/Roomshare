import {
  getSearchDocCronTelemetrySnapshot,
  recordSearchDocCronRun,
  resetSearchDocCronTelemetryForTests,
} from "@/lib/search/search-doc-cron-telemetry";

describe("search-doc cron telemetry", () => {
  beforeEach(() => {
    resetSearchDocCronTelemetryForTests();
  });

  it("computes p50/p95 dirty-queue ages and ignores non-allowlisted labels", () => {
    recordSearchDocCronRun({
      divergenceCounts: {
        missing: 1,
        stale: 2,
        version_skew: 1,
        unexpected: 99,
      },
      repairedCounts: {
        stale: 1,
        unexpected: 42,
      },
      processedCount: 4,
      errorCounts: {
        projection_error: 2,
        unknown: 9,
      },
      dirtyQueueAgeSeconds: [90, 10, 50, Number.NaN, -5],
    });

    expect(getSearchDocCronTelemetrySnapshot()).toEqual({
      divergenceCounts: {
        missing: 1,
        stale: 2,
        version_skew: 1,
      },
      repairedCounts: {
        missing: 0,
        stale: 1,
        version_skew: 0,
      },
      processedCount: 4,
      errorCounts: {
        projection_error: 2,
      },
      dirtyQueueAgeSeconds: {
        p50: 50,
        p95: 90,
        count: 3,
        sum: 150,
      },
    });
  });

  it("resets gauges and queue-age summary on each run while keeping counters cumulative", () => {
    recordSearchDocCronRun({
      divergenceCounts: {
        missing: 1,
      },
      repairedCounts: {
        missing: 1,
      },
      processedCount: 2,
      errorCounts: {
        projection_error: 1,
      },
      dirtyQueueAgeSeconds: [30, 60],
    });

    recordSearchDocCronRun({
      divergenceCounts: {
        version_skew: 2,
      },
      repairedCounts: {
        version_skew: 1,
      },
      processedCount: 3,
      dirtyQueueAgeSeconds: [5],
    });

    expect(getSearchDocCronTelemetrySnapshot()).toEqual({
      divergenceCounts: {
        missing: 0,
        stale: 0,
        version_skew: 2,
      },
      repairedCounts: {
        missing: 1,
        stale: 0,
        version_skew: 1,
      },
      processedCount: 5,
      errorCounts: {
        projection_error: 1,
      },
      dirtyQueueAgeSeconds: {
        p50: 5,
        p95: 5,
        count: 1,
        sum: 5,
      },
    });
  });

  it("resets all state for cold-start style test setup", () => {
    recordSearchDocCronRun({
      divergenceCounts: {
        missing: 2,
      },
      repairedCounts: {
        missing: 1,
      },
      processedCount: 7,
      errorCounts: {
        projection_error: 3,
      },
      dirtyQueueAgeSeconds: [12],
    });

    resetSearchDocCronTelemetryForTests();

    expect(getSearchDocCronTelemetrySnapshot()).toEqual({
      divergenceCounts: {
        missing: 0,
        stale: 0,
        version_skew: 0,
      },
      repairedCounts: {
        missing: 0,
        stale: 0,
        version_skew: 0,
      },
      processedCount: 0,
      errorCounts: {
        projection_error: 0,
      },
      dirtyQueueAgeSeconds: {
        p50: 0,
        p95: 0,
        count: 0,
        sum: 0,
      },
    });
  });
});
