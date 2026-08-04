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
    // Backs claimDailyLane's atomic INSERT ... ON CONFLICT lease.
    $executeRaw: jest.fn(),
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
    // Default: the daily lane is successfully claimed (one row affected).
    (prisma.$executeRaw as unknown as jest.Mock).mockResolvedValue(1);
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

  /**
   * P1-6 regression. The daily lane used to be gated on a 3-minute UTC window
   * (09:02-09:04) while vercel.json schedules "2 9 * * *". Vercel Hobby "may
   * invoke these cron jobs at any point within the specified hour", so the
   * window was hit ~3 minutes in 60, the miss was never made up, and the route
   * still returned success: true.
   */
  describe("daily lane gating (P1-6)", () => {
    it("runs the daily lane when Vercel dispatches mid-hour, not at 09:02", async () => {
      // Squarely outside the old window — this is the ordinary case on Hobby.
      jest.setSystemTime(new Date("2026-04-17T09:31:00.000Z"));

      const response = await GET(createRequest() as any);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.summary.dailyLane).toEqual({
        ran: true,
        reason: "claimed",
        lastRunAt: "2026-04-17T09:31:00.000Z",
      });
      expect(prisma.rateLimitEntry.deleteMany).toHaveBeenCalled();
      expect(prisma.querySnapshot.deleteMany).toHaveBeenCalled();
      expect(cleanupTerminalOutboxEventsOnce).toHaveBeenCalled();
      const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(calledUrls).toContain(
        "http://localhost:3000/api/cron/search-alerts"
      );
    });

    it("claims the lease with a threshold 20h behind the current time", async () => {
      jest.setSystemTime(new Date("2026-04-17T09:31:00.000Z"));

      await GET(createRequest() as any);

      // Tagged-template call: (strings, ...values) = [task, now, now, threshold].
      const call = (prisma.$executeRaw as unknown as jest.Mock).mock.calls[0];
      const [, task, now, alsoNow, threshold] = call;
      expect(task).toBe("daily-maintenance");
      expect((now as Date).toISOString()).toBe("2026-04-17T09:31:00.000Z");
      expect((alsoNow as Date).toISOString()).toBe("2026-04-17T09:31:00.000Z");
      expect((threshold as Date).toISOString()).toBe(
        "2026-04-16T13:31:00.000Z"
      );
      expect(String(call[0].join("?"))).toContain("ON CONFLICT");
    });

    it("skips the daily lane on a duplicate delivery minutes later", async () => {
      jest.setSystemTime(new Date("2026-04-17T09:33:00.000Z"));
      // The conditional UPDATE matched no row: another invocation already ran.
      (prisma.$executeRaw as unknown as jest.Mock).mockResolvedValue(0);

      const response = await GET(createRequest() as any);
      const payload = await response.json();

      expect(payload.summary.dailyLane).toEqual({
        ran: false,
        reason: "already_ran_recently",
        lastRunAt: null,
      });
      expect(prisma.rateLimitEntry.deleteMany).not.toHaveBeenCalled();
      expect(cleanupTerminalOutboxEventsOnce).not.toHaveBeenCalled();
      const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(calledUrls).not.toContain(
        "http://localhost:3000/api/cron/search-alerts"
      );
    });

    it("still runs the per-tick lane when the daily lane is skipped", async () => {
      jest.setSystemTime(new Date("2026-04-17T09:33:00.000Z"));
      (prisma.$executeRaw as unknown as jest.Mock).mockResolvedValue(0);

      await GET(createRequest() as any);

      const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(calledUrls).toContain(
        "http://localhost:3000/api/cron/refresh-search-docs"
      );
      expect(calledUrls).toContain(
        "http://localhost:3000/api/cron/payments-refund-queue"
      );
    });

    it("surfaces a failed claim distinctly instead of reporting a clean skip", async () => {
      jest.setSystemTime(new Date("2026-04-17T09:31:00.000Z"));
      (prisma.$executeRaw as unknown as jest.Mock).mockRejectedValue(
        new Error("connection reset")
      );

      const response = await GET(createRequest() as any);
      const payload = await response.json();

      // A dispatcher that can never claim its lease must not look identical to
      // one that legitimately skipped.
      expect(response.status).toBe(200);
      expect(payload.summary.dailyLane.ran).toBe(false);
      expect(payload.summary.dailyLane.reason).toBe("claim_failed");
      expect(prisma.rateLimitEntry.deleteMany).not.toHaveBeenCalled();
    });
  });

  it("delegates freshness reminders when the daily lane is claimed and the flag is on", async () => {
    jest.setSystemTime(new Date("2026-04-17T09:37:00.000Z"));

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

  it("marks freshness reminders skipped when the feature flag is off", async () => {
    jest.setSystemTime(new Date("2026-04-17T09:37:00.000Z"));
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

  it("runs outbox retention when the daily lane is claimed, even when the drain is phase02-disabled (H2)", async () => {
    jest.setSystemTime(new Date("2026-04-17T09:37:00.000Z"));

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

  it("reaps expired query snapshots when the daily lane is claimed (P2-19)", async () => {
    jest.setSystemTime(new Date("2026-04-17T09:37:00.000Z"));
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

  it("skips the query-snapshot reaper when the daily lane was already claimed recently", async () => {
    jest.setSystemTime(new Date("2026-04-17T15:00:00.000Z"));
    (prisma.$executeRaw as unknown as jest.Mock).mockResolvedValue(0);

    const response = await GET(createRequest() as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.querySnapshot.deleteMany).not.toHaveBeenCalled();
    expect(payload.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task: "cleanup-query-snapshots",
          skipped: true,
          detail: { skipped: true, reason: "already_ran_recently" },
        }),
      ])
    );
  });

  it("marks outbox retention skipped when the daily lane was already claimed recently", async () => {
    jest.setSystemTime(new Date("2026-04-17T15:00:00.000Z"));
    (prisma.$executeRaw as unknown as jest.Mock).mockResolvedValue(0);

    const response = await GET(createRequest() as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          task: "outbox-retention",
          skipped: true,
          detail: { skipped: true, reason: "already_ran_recently" },
        }),
      ])
    );
    expect(cleanupTerminalOutboxEventsOnce).not.toHaveBeenCalled();
    expect(compactSupersededOutboxEventsOnce).not.toHaveBeenCalled();
    expect(cleanupConsumedCacheInvalidationsOnce).not.toHaveBeenCalled();
  });
});
