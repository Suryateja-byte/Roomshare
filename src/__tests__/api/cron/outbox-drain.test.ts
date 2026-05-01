/**
 * Tests for src/app/api/cron/outbox-drain/route.ts
 */

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

jest.mock("@/lib/cron-auth", () => ({
  validateCronAuth: jest.fn(),
}));

jest.mock("@/lib/flags/phase02", () => ({
  isPhase02ProjectionWritesEnabled: jest.fn(),
  isKillSwitchActive: jest.fn(),
}));

jest.mock("@/lib/outbox/drain", () => ({
  drainOutboxOnce: jest.fn(),
}));

jest.mock("@/lib/public-cache/push", () => ({
  drainPublicCacheFanoutOnce: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn((e) => String(e)),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/outbox-drain/route";
import { validateCronAuth } from "@/lib/cron-auth";
import {
  isPhase02ProjectionWritesEnabled,
  isKillSwitchActive,
} from "@/lib/flags/phase02";
import { drainOutboxOnce } from "@/lib/outbox/drain";
import { drainPublicCacheFanoutOnce } from "@/lib/public-cache/push";

const mockValidateCronAuth = validateCronAuth as jest.Mock;
const mockIsEnabled = isPhase02ProjectionWritesEnabled as jest.Mock;
const mockIsKillSwitch = isKillSwitchActive as jest.Mock;
const mockDrainOnce = drainOutboxOnce as jest.Mock;
const mockDrainPublicCacheFanoutOnce = drainPublicCacheFanoutOnce as jest.Mock;

const PROJECTION_PUBLICATION_KINDS = [
  "UNIT_UPSERTED",
  "INVENTORY_UPSERTED",
  "GEOCODE_NEEDED",
  "EMBED_NEEDED",
] as const;

const NON_PROJECTION_KINDS = [
  "PAYMENT_WEBHOOK",
  "ALERT_MATCH",
  "ALERT_DELIVER",
] as const;

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/cron/outbox-drain");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockValidateCronAuth.mockReturnValue(null); // no auth error
  mockIsEnabled.mockReturnValue(true);
  mockIsKillSwitch.mockImplementation(() => false);
  mockDrainOnce.mockResolvedValue({
    processed: 0,
    completed: 0,
    dlq: 0,
    staleSkipped: 0,
    retryScheduled: 0,
    remainingByPriority: {},
    elapsedMs: 5,
  });
  mockDrainPublicCacheFanoutOnce.mockResolvedValue({
    attempted: 0,
    delivered: 0,
    stale: 0,
    failed: 0,
  });
});

describe("GET /api/cron/outbox-drain", () => {
  it("returns 401 when cron auth fails", async () => {
    mockValidateCronAuth.mockReturnValue(
      new Response(null, { status: 401 })
    );

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockDrainOnce).not.toHaveBeenCalled();
  });

  it("returns skipped when phase02 is disabled", async () => {
    mockIsEnabled.mockReturnValue(false);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("phase02_disabled");
    expect(mockDrainOnce).not.toHaveBeenCalled();
  });

  it("calls drainOutboxOnce with maxBatch=50 and priorityMax=100 normally", async () => {
    await GET(makeRequest());

    expect(mockDrainOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        maxBatch: 50,
        maxTickMs: 9000,
        priorityMax: 100,
      })
    );
    expect(mockDrainOnce.mock.calls[0][0]).not.toHaveProperty("excludedKinds");
  });

  it("excludes projection publication work without pausing payments when new publication is disabled", async () => {
    mockIsKillSwitch.mockImplementation(
      (name: string) => name === "disable_new_publication"
    );

    await GET(makeRequest());

    expect(mockDrainOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        priorityMax: 100,
        excludedKinds: PROJECTION_PUBLICATION_KINDS,
      })
    );
    const excludedKinds = mockDrainOnce.mock.calls[0][0].excludedKinds;
    for (const kind of NON_PROJECTION_KINDS) {
      expect(excludedKinds).not.toContain(kind);
    }
  });

  it("excludes projection publication work without pausing payments when backfills and repairs are paused", async () => {
    mockIsKillSwitch.mockImplementation(
      (name: string) => name === "pause_backfills_and_repairs"
    );

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(mockDrainOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        priorityMax: 100,
        excludedKinds: PROJECTION_PUBLICATION_KINDS,
      })
    );
    const excludedKinds = mockDrainOnce.mock.calls[0][0].excludedKinds;
    for (const kind of NON_PROJECTION_KINDS) {
      expect(excludedKinds).not.toContain(kind);
    }
    expect(body.killSwitchActive).toBe(false);
    expect(body.killSwitches).toEqual({
      disableNewPublication: false,
      pauseBackfillsAndRepairs: true,
    });
  });

  it("returns drain result in response body", async () => {
    mockDrainOnce.mockResolvedValue({
      processed: 5,
      completed: 4,
      dlq: 1,
      staleSkipped: 0,
      retryScheduled: 0,
      remainingByPriority: { "100": 3 },
      elapsedMs: 500,
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.processed).toBe(5);
    expect(body.completed).toBe(4);
    expect(body.dlq).toBe(1);
    expect(body.timestamp).toBeDefined();
  });

  it("returns 500 when drainOutboxOnce throws", async () => {
    mockDrainOnce.mockRejectedValue(new Error("DB connection failed"));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
  });

  it("includes killSwitchActive in response", async () => {
    mockIsKillSwitch.mockImplementation(
      (name: string) => name === "disable_new_publication"
    );

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.killSwitchActive).toBe(true);
    expect(body.killSwitches).toEqual({
      disableNewPublication: true,
      pauseBackfillsAndRepairs: false,
    });
  });
});
