jest.mock("@/lib/cron-auth", () => ({
  validateCronAuth: jest.fn(),
}));

jest.mock("@/lib/freshness/dispatcher", () => ({
  runFreshnessDispatcher: jest.fn(),
}));

jest.mock("@/lib/freshness/freshness-cron-telemetry", () => ({
  recordFreshnessCronLockHeld: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
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

import { GET } from "@/app/api/cron/freshness-reminders/route";
import { validateCronAuth } from "@/lib/cron-auth";
import { runFreshnessDispatcher } from "@/lib/freshness/dispatcher";
import { recordFreshnessCronLockHeld } from "@/lib/freshness/freshness-cron-telemetry";
import { prisma } from "@/lib/prisma";

const mockTransaction = prisma.$transaction as jest.Mock;

function createRequest(): Request {
  return new Request("http://localhost/api/cron/freshness-reminders", {
    headers: {
      authorization: "Bearer test-cron-secret",
    },
  });
}

describe("GET /api/cron/freshness-reminders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateCronAuth as jest.Mock).mockReturnValue(null);
  });

  it("returns auth errors from validateCronAuth", async () => {
    (validateCronAuth as jest.Mock).mockReturnValue(
      new Response("Unauthorized", { status: 401 })
    );

    const response = await GET(createRequest() as any);

    expect(response.status).toBe(401);
  });

  it("returns lock_held when another freshness run already owns the advisory lock", async () => {
    mockTransaction.mockImplementation(async (callback: Function) =>
      callback({
        $queryRaw: jest.fn().mockResolvedValue([{ locked: false }]),
      })
    );

    const response = await GET(createRequest() as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      skipped: true,
      reason: "lock_held",
    });
    expect(recordFreshnessCronLockHeld).toHaveBeenCalledTimes(1);
    expect(runFreshnessDispatcher).not.toHaveBeenCalled();
  });

  it("runs the dispatcher inside the lock path and returns its summary", async () => {
    mockTransaction.mockImplementation(async (callback: Function) =>
      callback({
        $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
      })
    );
    (runFreshnessDispatcher as jest.Mock).mockResolvedValue({
      success: true,
      skipped: false,
      selected: 2,
      processed: 2,
      eligible: { reminder: 1, warning: 1 },
      emitted: { reminder: 1, warning: 1 },
      errors: {
        reminder: { notification: 0, email: 0, db: 0 },
        warning: { notification: 0, email: 0, db: 0 },
      },
      skippedPreference: { reminder: 1, warning: 0 },
      skippedAlreadySent: 0,
      skippedNotDue: 0,
      skippedAutoPause: 0,
      skippedSuspended: 0,
      skippedStaleRow: 0,
      skippedUnconfirmed: 0,
      budgetExhausted: false,
      durationMs: 123,
      timestamp: "2026-04-17T12:00:00.000Z",
    });

    const response = await GET(createRequest() as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      skipped: false,
      emitted: { reminder: 1, warning: 1 },
    });
    expect(runFreshnessDispatcher).toHaveBeenCalledTimes(1);
  });
});
