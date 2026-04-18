jest.mock("@/lib/cron-auth", () => ({
  validateCronAuth: jest.fn(),
}));

jest.mock("@/lib/freshness/auto-pause-dispatcher", () => ({
  runAutoPauseDispatcher: jest.fn(),
}));

jest.mock("@/lib/freshness/freshness-cron-telemetry", () => ({
  recordAutoPauseCronLockHeld: jest.fn(),
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

import { GET } from "@/app/api/cron/stale-auto-pause/route";
import { validateCronAuth } from "@/lib/cron-auth";
import { runAutoPauseDispatcher } from "@/lib/freshness/auto-pause-dispatcher";
import { recordAutoPauseCronLockHeld } from "@/lib/freshness/freshness-cron-telemetry";
import { prisma } from "@/lib/prisma";

const mockTransaction = prisma.$transaction as jest.Mock;

function createRequest(): Request {
  return new Request("http://localhost/api/cron/stale-auto-pause", {
    headers: {
      authorization: "Bearer test-cron-secret",
    },
  });
}

describe("GET /api/cron/stale-auto-pause", () => {
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

  it("returns lock_held when another stale auto-pause run already owns the advisory lock", async () => {
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
    expect(recordAutoPauseCronLockHeld).toHaveBeenCalledTimes(1);
    expect(runAutoPauseDispatcher).not.toHaveBeenCalled();
  });

  it("runs the dispatcher inside the advisory lock and returns its summary", async () => {
    mockTransaction.mockImplementation(async (callback: Function) =>
      callback({
        $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
      })
    );
    (runAutoPauseDispatcher as jest.Mock).mockResolvedValue({
      success: true,
      skipped: false,
      selected: 1,
      processed: 1,
      eligible: 1,
      autoPaused: 1,
      emitted: 1,
      errors: {
        notification: 0,
        email: 0,
        db: 0,
      },
      skippedCounts: {
        already_paused: 0,
        version_conflict: 0,
        stale_row: 0,
        suspended: 0,
        no_warning: 0,
        not_host_managed: 0,
        migration_review: 0,
        feature_disabled: 0,
      },
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
      autoPaused: 1,
      emitted: 1,
    });
    expect(runAutoPauseDispatcher).toHaveBeenCalledTimes(1);
  });
});
