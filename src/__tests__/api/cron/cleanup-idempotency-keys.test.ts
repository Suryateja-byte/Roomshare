/**
 * Tests for GET /api/cron/cleanup-idempotency-keys route
 */

jest.mock("next/server", () => ({
  NextRequest: class MockNextRequest extends Request {
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

jest.mock("@/lib/prisma", () => ({
  prisma: {
    idempotencyKey: { deleteMany: jest.fn() },
  },
}));

jest.mock("@/lib/cron-auth", () => ({
  validateCronAuth: jest.fn(),
}));

jest.mock("@/lib/retry", () => ({
  withRetry: jest.fn(),
}));

jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
  sanitizeErrorMessage: jest.fn((e: unknown) => String(e)),
}));

import { GET } from "@/app/api/cron/cleanup-idempotency-keys/route";
import { prisma } from "@/lib/prisma";
import { validateCronAuth } from "@/lib/cron-auth";
import { withRetry } from "@/lib/retry";
import * as Sentry from "@sentry/nextjs";
import { NextRequest } from "next/server";

function createRequest(): NextRequest {
  return new NextRequest("http://localhost/api/cron/cleanup-idempotency-keys", {
    headers: { authorization: "Bearer mock-cron-secret" },
  });
}

describe("GET /api/cron/cleanup-idempotency-keys", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: auth passes (null means no error response)
    (validateCronAuth as jest.Mock).mockReturnValue(null);
    // Default: withRetry calls the function and returns DB result
    (withRetry as jest.Mock).mockImplementation((fn: () => unknown) => fn());
    (prisma.idempotencyKey.deleteMany as jest.Mock).mockResolvedValue({
      count: 10,
    });
  });

  it("returns auth error response when cron auth fails", async () => {
    const authErrorResponse = {
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
      headers: new Map(),
    };
    (validateCronAuth as jest.Mock).mockReturnValue(authErrorResponse);

    const response = await GET(createRequest());

    expect(response).toBe(authErrorResponse);
    expect(prisma.idempotencyKey.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes expired keys and returns count", async () => {
    (prisma.idempotencyKey.deleteMany as jest.Mock).mockResolvedValue({
      count: 42,
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.deleted).toBe(42);
    expect(data.success).toBe(true);
  });

  it("returns success response with a timestamp", async () => {
    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.timestamp).toBeDefined();
    expect(() => new Date(data.timestamp)).not.toThrow();
  });

  it("returns 500 on database error", async () => {
    (withRetry as jest.Mock).mockRejectedValue(new Error("DB connection lost"));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Cleanup failed");
  });

  it("captures exception to Sentry on failure", async () => {
    const dbError = new Error("DB connection lost");
    (withRetry as jest.Mock).mockRejectedValue(dbError);

    await GET(createRequest());

    expect(Sentry.captureException).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({ tags: { cron: "cleanup-idempotency-keys" } })
    );
  });

  it("uses withRetry wrapper for the DB delete operation", async () => {
    await GET(createRequest());

    expect(withRetry).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ context: "cleanup-idempotency-keys" })
    );
  });
});
