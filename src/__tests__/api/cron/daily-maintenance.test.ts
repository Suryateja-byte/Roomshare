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
  },
}));

jest.mock("@/lib/retry", () => ({
  withRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
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
    (prisma.rateLimitEntry.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.idempotencyKey.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
    (prisma.typingStatus.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
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
});
