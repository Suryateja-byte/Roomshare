const mockCheckMetricsRateLimit = jest
  .fn()
  .mockResolvedValue({ success: true });
const mockGetClientIP = jest.fn().mockReturnValue("127.0.0.1");
const mockLoggerSyncError = jest.fn();
const mockCaptureException = jest.fn();

jest.mock("@/lib/rate-limit-redis", () => ({
  checkMetricsRateLimit: (...args: unknown[]) =>
    mockCheckMetricsRateLimit(...args),
}));

jest.mock("@/lib/rate-limit", () => ({
  getClientIP: (...args: unknown[]) => mockGetClientIP(...args),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      error: (...args: unknown[]) => mockLoggerSyncError(...args),
    },
  },
  sanitizeErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

jest.mock(
  "@sentry/nextjs",
  () => ({
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  }),
  { virtual: true }
);

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const status = init?.status ?? 200;
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          "content-type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
    },
  },
}));

import { POST } from "@/app/api/web-vitals/route";

const VALID_PAYLOAD = {
  id: "vital-123",
  name: "LCP",
  value: 1200,
  rating: "good",
  delta: 1200,
  navigationType: "navigate",
  pathname: "/search",
  timestamp: 1780552000000,
};

function makeRequest(origin: string): Request {
  return new Request(`${origin}/api/web-vitals`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify(VALID_PAYLOAD),
  });
}

describe("POST /api/web-vitals", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.ALLOWED_ORIGINS;
    delete process.env.ALLOWED_HOSTS;
    process.env.VERCEL_URL = "roomshare-random.vercel.app";
    (process.env as any).NODE_ENV = "production";
    mockCheckMetricsRateLimit.mockResolvedValue({ success: true });
    mockGetClientIP.mockReturnValue("127.0.0.1");
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("accepts valid same-origin metrics from the exact Vercel deployment URL", async () => {
    const response = await POST(
      makeRequest("https://roomshare-random.vercel.app")
    );

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
    expect(mockCheckMetricsRateLimit).toHaveBeenCalledWith("127.0.0.1");
  });

  it("rejects metrics from unknown Vercel preview origins", async () => {
    const response = await POST(
      makeRequest("https://other-preview.vercel.app")
    );

    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(response.status).toBe(403);
    expect(mockCheckMetricsRateLimit).not.toHaveBeenCalled();
  });
});
