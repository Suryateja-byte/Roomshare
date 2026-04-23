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

const mockValidateCronAuth = validateCronAuth as jest.Mock;
const mockIsEnabled = isPhase02ProjectionWritesEnabled as jest.Mock;
const mockIsKillSwitch = isKillSwitchActive as jest.Mock;
const mockDrainOnce = drainOutboxOnce as jest.Mock;

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/cron/outbox-drain");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockValidateCronAuth.mockReturnValue(null); // no auth error
  mockIsEnabled.mockReturnValue(true);
  mockIsKillSwitch.mockReturnValue(false);
  mockDrainOnce.mockResolvedValue({
    processed: 0,
    completed: 0,
    dlq: 0,
    staleSkipped: 0,
    retryScheduled: 0,
    remainingByPriority: {},
    elapsedMs: 5,
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
  });

  it("restricts to priorityMax=0 when kill switch is active", async () => {
    mockIsKillSwitch.mockReturnValue(true);

    await GET(makeRequest());

    expect(mockDrainOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        priorityMax: 0,
      })
    );
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
    mockIsKillSwitch.mockReturnValue(true);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.killSwitchActive).toBe(true);
  });
});
