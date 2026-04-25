/**
 * Tests for src/lib/metrics/projection-lag.ts
 */

jest.mock("@sentry/nextjs", () => ({
  addBreadcrumb: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      info: jest.fn(),
      warn: jest.fn(),
    },
  },
}));

import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import {
  recordProjectionLag,
  recordTombstoneHideLatency,
  recordDlqRouting,
  recordStaleEventSkip,
  recordBacklogDepth,
} from "@/lib/metrics/projection-lag";
import {
  PROJECTION_LAG_P99_SECONDS,
  TOMBSTONE_HIDE_SLA_SECONDS,
} from "@/lib/projections/alert-thresholds";

const mockSentry = Sentry as jest.Mocked<typeof Sentry>;
const mockLogger = logger as unknown as { sync: { info: jest.Mock; warn: jest.Mock } };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("recordProjectionLag()", () => {
  it("calls logger.sync.info with projection_lag_seconds metric", () => {
    recordProjectionLag("INVENTORY_UPSERTED", 5000);
    expect(mockLogger.sync.info).toHaveBeenCalledWith(
      "projection_lag",
      expect.objectContaining({
        metric: "projection_lag_seconds",
        kind: "INVENTORY_UPSERTED",
        value: 5,
      })
    );
  });

  it("does not call Sentry.addBreadcrumb when under threshold", () => {
    recordProjectionLag("INVENTORY_UPSERTED", (PROJECTION_LAG_P99_SECONDS - 1) * 1000);
    expect(mockSentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it("calls Sentry.addBreadcrumb when lag exceeds P99 threshold", () => {
    recordProjectionLag("INVENTORY_UPSERTED", (PROJECTION_LAG_P99_SECONDS + 1) * 1000);
    expect(mockSentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "projection.lag",
        level: "warning",
        data: expect.objectContaining({ kind: "INVENTORY_UPSERTED" }),
      })
    );
  });

  it("sets exceedsThreshold correctly", () => {
    // Under threshold
    recordProjectionLag("UNIT_UPSERTED", 100);
    expect(mockLogger.sync.info).toHaveBeenCalledWith(
      "projection_lag",
      expect.objectContaining({ exceedsThreshold: false })
    );

    jest.clearAllMocks();

    // Over threshold
    recordProjectionLag("UNIT_UPSERTED", (PROJECTION_LAG_P99_SECONDS + 5) * 1000);
    expect(mockLogger.sync.info).toHaveBeenCalledWith(
      "projection_lag",
      expect.objectContaining({ exceedsThreshold: true })
    );
  });
});

describe("recordTombstoneHideLatency()", () => {
  it("calls logger.sync.info with tombstone metric", () => {
    recordTombstoneHideLatency("unit-123", 10000);
    expect(mockLogger.sync.info).toHaveBeenCalledWith(
      "tombstone_hide_latency",
      expect.objectContaining({
        metric: "tombstone_hide_latency_seconds",
        unitId: "unit-123",
        value: 10,
      })
    );
  });

  it("calls Sentry.addBreadcrumb when latency exceeds SLA", () => {
    recordTombstoneHideLatency("unit-abc", (TOMBSTONE_HIDE_SLA_SECONDS + 5) * 1000);
    expect(mockSentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "projection.tombstone",
        level: "warning",
        data: expect.objectContaining({ unitId: "unit-abc" }),
      })
    );
  });

  it("does not call Sentry.addBreadcrumb when within SLA", () => {
    recordTombstoneHideLatency("unit-fast", 100);
    expect(mockSentry.addBreadcrumb).not.toHaveBeenCalled();
  });
});

describe("recordDlqRouting()", () => {
  it("calls logger.sync.warn with DLQ metric", () => {
    recordDlqRouting("INVENTORY_UPSERTED", "MAX_ATTEMPTS_EXHAUSTED");
    expect(mockLogger.sync.warn).toHaveBeenCalledWith(
      "outbox_dlq_routing",
      expect.objectContaining({
        metric: "outbox_dlq_total",
        kind: "INVENTORY_UPSERTED",
        reason: "MAX_ATTEMPTS_EXHAUSTED",
        value: 1,
      })
    );
  });

  it("always calls Sentry.addBreadcrumb with error level", () => {
    recordDlqRouting("GEOCODE_NEEDED", "GEOCODE_EXHAUSTED");
    expect(mockSentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "projection.dlq",
        level: "error",
        data: expect.objectContaining({
          kind: "GEOCODE_NEEDED",
          reason: "GEOCODE_EXHAUSTED",
        }),
      })
    );
  });
});

describe("recordStaleEventSkip()", () => {
  it("calls logger.sync.info with stale event metric", () => {
    recordStaleEventSkip("INVENTORY_UPSERTED");
    expect(mockLogger.sync.info).toHaveBeenCalledWith(
      "projection_stale_event_skip",
      expect.objectContaining({
        metric: "projection_stale_event_total",
        kind: "INVENTORY_UPSERTED",
        value: 1,
      })
    );
  });
});

describe("recordBacklogDepth()", () => {
  it("calls logger.sync.info with backlog depth", () => {
    recordBacklogDepth(100, 42);
    expect(mockLogger.sync.info).toHaveBeenCalledWith(
      "projection_backlog_depth",
      expect.objectContaining({
        metric: "projection_backlog_depth",
        priority: 100,
        value: 42,
      })
    );
  });

  it("records depth=0 without error", () => {
    recordBacklogDepth(0, 0);
    expect(mockLogger.sync.info).toHaveBeenCalledWith(
      "projection_backlog_depth",
      expect.objectContaining({ priority: 0, value: 0 })
    );
  });
});
