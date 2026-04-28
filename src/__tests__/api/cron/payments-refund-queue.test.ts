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

jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

jest.mock("@/lib/cron-auth", () => ({
  validateCronAuth: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      info: jest.fn(),
      error: jest.fn(),
    },
  },
  sanitizeErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

const mockProcessRefundQueueOnce = jest.fn();
jest.mock("@/lib/payments/refund-queue", () => ({
  processRefundQueueOnce: (...args: unknown[]) =>
    mockProcessRefundQueueOnce(...args),
}));

import { GET } from "@/app/api/cron/payments-refund-queue/route";
import { validateCronAuth } from "@/lib/cron-auth";

function createRequest() {
  return new Request("http://localhost/api/cron/payments-refund-queue", {
    headers: { authorization: "Bearer cron-secret" },
  });
}

describe("GET /api/cron/payments-refund-queue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateCronAuth as jest.Mock).mockReturnValue(null);
    mockProcessRefundQueueOnce.mockResolvedValue({
      claimed: 1,
      processed: 1,
      refunded: 1,
      retryScheduled: 0,
      manualReview: 0,
      elapsedMs: 12,
    });
  });

  it("requires cron auth", async () => {
    const authResponse = {
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
      headers: new Map(),
    };
    (validateCronAuth as jest.Mock).mockReturnValue(authResponse);

    const response = await GET(createRequest() as any);

    expect(response).toBe(authResponse);
    expect(mockProcessRefundQueueOnce).not.toHaveBeenCalled();
  });

  it("runs one refund queue tick", async () => {
    const response = await GET(createRequest() as any);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      claimed: 1,
      processed: 1,
      refunded: 1,
      retryScheduled: 0,
      manualReview: 0,
      elapsedMs: 12,
    });
  });

  it("returns 500 when processing fails", async () => {
    mockProcessRefundQueueOnce.mockRejectedValue(new Error("db unavailable"));

    const response = await GET(createRequest() as any);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Refund queue processing failed",
    });
  });
});
