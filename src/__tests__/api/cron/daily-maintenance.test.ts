jest.mock("@/lib/cron-auth", () => ({
  validateCronAuth: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  features: {
    freshnessNotifications: true,
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error ?? "Unknown error")
  ),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    rateLimitEntry: { deleteMany: jest.fn() },
    idempotencyKey: { deleteMany: jest.fn() },
    typingStatus: { deleteMany: jest.fn() },
    querySnapshot: { deleteMany: jest.fn() },
  },
}));

jest.mock("@/lib/retry", () => ({
  withRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

jest.mock("@/lib/outbox/retention", () => ({
  cleanupTerminalOutboxEventsOnce: jest.fn(),
  compactSupersededOutboxEventsOnce: jest.fn(),
  cleanupConsumedCacheInvalidationsOnce: jest.fn(),
}));

jest.mock("@/lib/listings/seed-freshness", () => ({
  refreshSeedListingFreshness: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(async () => new Headers({ host: "localhost:3000" })),
}));

jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest extends Request {
    declare headers: Headers;
  },
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}));

import { GET } from "@/app/api/cron/daily-maintenance/route";
import { validateCronAuth } from "@/lib/cron-auth";
import { features } from "@/lib/env";
import { refreshSeedListingFreshness } from "@/lib/listings/seed-freshness";
import {
  cleanupConsumedCacheInvalidationsOnce,
  cleanupTerminalOutboxEventsOnce,
  compactSupersededOutboxEventsOnce,
} from "@/lib/outbox/retention";
import { prisma } from "@/lib/prisma";

const fetchMock = jest.fn();

function createRequest(): Request {
  return new Request("http://localhost/api/cron/daily-maintenance", {
    headers: {
      authorization: "Bearer cron-secret-32-characters-long!!",
    },
  });
}

describe("GET /api/cron/daily-maintenance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    global.fetch = fetchMock as unknown as typeof fetch;
    (validateCronAuth as jest.Mock).mockReturnValue(null);
    Object.defineProperty(features, "freshnessNotifications", {
      value: true,
      writable: true,
    });
    Object.defineProperty(features, "seedFreshnessRefresh", {
      value: false,
      writable: true,
      configurable: true,
    });
    (prisma.rateLimitEntry.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.idempotencyKey.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
    (prisma.typingStatus.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });
    (prisma.querySnapshot.deleteMany as jest.Mock).mockResolvedValue({ count: 4 });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    (cleanupTerminalOutboxEventsOnce as jest.Mock).mockResolvedValue({
      deletedCompleted: 1,
      deletedDlq: 0,
      batches: 1,
      truncated: false,
      elapsedMs: 5,
    });
    (compactSupersededOutboxEventsOnce as jest.Mock).mockResolvedValue({
      deletedSuperseded: 2,
      byKind: { INVENTORY_UPSERTED: 2 },
      batches: 1,
      truncated: false,
      elapsedMs: 5,
    });
    (cleanupConsumedCacheInvalidationsOnce as jest.Mock).mockResolvedValue({
      deleted: 1,
      batches: 1,
      truncated: false,
      elapsedMs: 5,
    });
    process.env.CRON_SECRET = "cron-secret-32-characters-long!!";
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("delegates freshness reminders inside the 09:02-09:04 UTC daily window when enabled", async () => {
    jest.setSystemTime(new Date("2026-04-17T09:03:00.000Z"));

    const response = await GET(createRequest() as any);
    const payload = await response.json();
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));

    expect(response.status).toBe(200);
    expect(calledUrls).toContain(
      "http://localhost:3000/api/cron/freshness-reminders"
    );
    expect(calledUrls).toContain(
      "http://localhost:3000/api/cron/payments-refund-queue"
    );
    expect(payload.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task: "freshness-reminders",
          success: true,
        }),
      ])
    );
  });

  it("re-stamps seed listing freshness inside the daily window when enabled", async () => {
    jest.setSystemTime(new Date("2026-04-17T09:03:00.000Z"));
    Object.defineProperty(features, "seedFreshnessRefresh", {
      value: true,
      writable: true,
      configurable: true,
    });
    (refreshSeedListingFreshness as jest.Mock).mockResolvedValue({
      refreshed: 15,
    });

    const response = await GET(createRequest() as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(refreshSeedListingFreshness).toHaveBeenCalledTimes(1);
    expect(payload.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task: "refresh-seed-listing-freshness",
          success: true,
          detail: { refreshed: 15 },
        }),
      ])
    );
  });

  it("marks the seed-freshness task skipped when the flag is off (default)", async () => {
    jest.setSystemTime(new Date("2026-04-17T09:03:00.000Z"));

    const response = await GET(createRequest() as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(refreshSeedListingFreshness).not.toHaveBeenCalled();
    expect(payload.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task: "refresh-seed-listing-freshness",
          skipped: true,
          detail: { skipped: true, reason: "feature_disabled" },
        }),
      ])
    );
  });

  it("marks the seed-freshness task skipped outside the daily window", async () => {
    jest.setSystemTime(new Date("2026-04-17T15:00:00.000Z"));
    Object.defineProperty(features, "seedFreshnessRefresh", {
      value: true,
      writable: true,
      configurable: true,
    });

    const response = await GET(createRequest() as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(refreshSeedListingFreshness).not.toHaveBeenCalled();
    expect(payload.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task: "refresh-seed-listing-freshness",
          skipped: true,
          detail: { skipped: true, reason: "outside_daily_window" },
        }),
      ])
    );
  });

  it("marks freshness reminders skipped when the feature flag is off", async () => {
    jest.setSystemTime(new Date("2026-04-17T09:03:00.000Z"));
    Object.defineProperty(features, "freshnessNotifications", {
      value: false,
      writable: true,
    });

    const response = await GET(createRequest() as any);
    const payload = await response.json();
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));

    expect(response.status).toBe(200);
    expect(calledUrls).not.toContain(
      "http://localhost:3000/api/cron/freshness-reminders"
    );
    expect(payload.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task: "freshness-reminders",
          skipped: true,
          detail: {
            skipped: true,
            reason: "feature_disabled",
          },
        }),
      ])
    );
  });

  it("runs outbox retention inside the daily window even when the drain is phase02-disabled (H2)", async () => {
    jest.setSystemTime(new Date("2026-04-17T09:03:00.000Z"));

    const response = await GET(createRequest() as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    // The drain is gated off (features.phase02ProjectionWrites is undefined
    // in the env mock), but retention must run regardless — that's the point.
    expect(payload.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task: "outbox-drain",
          skipped: true,
          detail: { skipped: true, reason: "phase02_disabled" },
        }),
        expect.objectContaining({
          task: "outbox-retention",
          success: true,
        }),
      ])
    );
    expect(cleanupTerminalOutboxEventsOnce).toHaveBeenCalledTimes(1);
    expect(compactSupersededOutboxEventsOnce).toHaveBeenCalledTimes(1);
    expect(cleanupConsumedCacheInvalidationsOnce).toHaveBeenCalledTimes(1);
  });

  it("reaps expired query snapshots inside the daily window (P2-19)", async () => {
    jest.setSystemTime(new Date("2026-04-17T09:03:00.000Z"));
    (prisma.querySnapshot.deleteMany as jest.Mock).mockResolvedValue({
      count: 7,
    });

    const response = await GET(createRequest() as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.querySnapshot.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
    expect(payload.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task: "cleanup-query-snapshots",
          success: true,
          detail: { deleted: 7 },
        }),
      ])
    );
  });

  it("skips the query-snapshot reaper outside the daily window", async () => {
    jest.setSystemTime(new Date("2026-04-17T15:00:00.000Z"));

    const response = await GET(createRequest() as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.querySnapshot.deleteMany).not.toHaveBeenCalled();
    expect(payload.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task: "cleanup-query-snapshots",
          skipped: true,
          detail: { skipped: true, reason: "outside_daily_window" },
        }),
      ])
    );
  });

  it("marks outbox retention skipped outside the daily window", async () => {
    jest.setSystemTime(new Date("2026-04-17T15:00:00.000Z"));

    const response = await GET(createRequest() as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task: "outbox-retention",
          skipped: true,
          detail: { skipped: true, reason: "outside_daily_window" },
        }),
      ])
    );
    expect(cleanupTerminalOutboxEventsOnce).not.toHaveBeenCalled();
    expect(compactSupersededOutboxEventsOnce).not.toHaveBeenCalled();
    expect(cleanupConsumedCacheInvalidationsOnce).not.toHaveBeenCalled();
  });
});
