/**
 * Tests for GET /api/cron/search-alerts route
 *
 * Tests cron secret authentication, defense-in-depth secret validation,
 * alert processing delegation, and error handling.
 */

jest.mock("@/lib/search-alerts", () => ({
  processSearchAlerts: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: jest.fn(),
    $transaction: jest.fn((fn: (tx: any) => Promise<any>) =>
      fn({
        $queryRaw: (jest.fn() as jest.Mock).mockResolvedValue([
          { locked: true },
        ]),
      })
    ),
  },
}));

jest.mock("@/lib/retry", () => ({
  withRetry: jest.fn((fn: () => unknown) => fn()),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn((e: unknown) =>
    e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error"
  ),
}));

jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

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

import { GET } from "@/app/api/cron/search-alerts/route";
import { processSearchAlerts } from "@/lib/search-alerts";
import { prisma } from "@/lib/prisma";
import * as Sentry from "@sentry/nextjs";
import { NextRequest } from "next/server";

describe("GET /api/cron/search-alerts", () => {
  const VALID_CRON_SECRET =
    "a-very-long-and-secure-cron-secret-that-is-at-least-32-characters";
  const originalEnv = process.env;

  // Helper to configure $transaction mock with a specific lock result
  function mockTransaction(locked: boolean) {
    (prisma.$transaction as jest.Mock).mockImplementation(
      (fn: (tx: any) => Promise<any>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ locked }]),
        };
        return fn(tx);
      }
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: VALID_CRON_SECRET };
    // Default: advisory lock acquired successfully
    mockTransaction(true);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createRequest(authHeader?: string): NextRequest {
    const headers: Record<string, string> = {};
    if (authHeader) {
      headers["authorization"] = authHeader;
    }
    return new NextRequest("http://localhost:3000/api/cron/search-alerts", {
      method: "GET",
      headers,
    });
  }

  describe("authentication", () => {
    it("returns 401 when authorization header is missing", async () => {
      const response = await GET(createRequest());

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 401 when authorization header has wrong secret", async () => {
      const response = await GET(createRequest("Bearer wrong-secret"));

      expect(response.status).toBe(401);
    });
  });

  describe("defense in depth - secret validation", () => {
    it("returns 500 when CRON_SECRET is not configured", async () => {
      delete process.env.CRON_SECRET;

      const response = await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`));

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Server configuration error");
    });

    it("returns 500 when CRON_SECRET is too short (< 32 chars)", async () => {
      process.env.CRON_SECRET = "short";

      const response = await GET(createRequest("Bearer short"));

      expect(response.status).toBe(500);
    });

    it("returns 500 when CRON_SECRET contains placeholder value", async () => {
      process.env.CRON_SECRET = "change-in-production-aaaa-bbbb-cccc-dddd-eeee";

      const response = await GET(
        createRequest("Bearer change-in-production-aaaa-bbbb-cccc-dddd-eeee")
      );

      expect(response.status).toBe(500);
    });
  });

  describe("successful alert processing", () => {
    it("processes alerts and returns result with duration", async () => {
      (processSearchAlerts as jest.Mock).mockResolvedValue({
        processed: 5,
        alertsSent: 3,
        errors: 0,
        details: ["Found 5 saved searches to process"],
      });

      const response = await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.processed).toBe(5);
      expect(data.alertsSent).toBe(3);
      expect(data.errors).toBe(0);
      expect(data.duration).toBeDefined();
    });

    it("handles no alerts to process", async () => {
      (processSearchAlerts as jest.Mock).mockResolvedValue({
        processed: 0,
        alertsSent: 0,
        errors: 0,
        details: ["Found 0 saved searches to process"],
      });

      const response = await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.processed).toBe(0);
      expect(data.alertsSent).toBe(0);
    });

    it("calls processSearchAlerts function", async () => {
      (processSearchAlerts as jest.Mock).mockResolvedValue({
        processed: 0,
        alertsSent: 0,
        errors: 0,
        details: [],
      });

      await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`));

      expect(processSearchAlerts).toHaveBeenCalledTimes(1);
    });

    it("returns partial success when some alerts have errors", async () => {
      (processSearchAlerts as jest.Mock).mockResolvedValue({
        processed: 10,
        alertsSent: 7,
        errors: 3,
        details: ["Processed with some errors"],
      });

      const response = await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.errors).toBe(3);
    });
  });

  describe("error handling", () => {
    it("returns 500 when processSearchAlerts throws", async () => {
      (processSearchAlerts as jest.Mock).mockRejectedValue(
        new Error("Database connection failed")
      );

      const response = await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`));

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe("Search alerts processing failed");
    });

    it("reports errors to Sentry", async () => {
      const processError = new Error("Unexpected failure");
      (processSearchAlerts as jest.Mock).mockRejectedValue(processError);

      await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`));

      expect(Sentry.captureException).toHaveBeenCalledWith(processError, {
        tags: { cron: "search-alerts" },
      });
    });

    it("handles non-Error thrown values", async () => {
      (processSearchAlerts as jest.Mock).mockRejectedValue("string error");

      const response = await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`));

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Search alerts processing failed");
    });
  });

  describe("advisory lock", () => {
    it("acquires transaction-level advisory lock before processing", async () => {
      let capturedTx: any;
      (prisma.$transaction as jest.Mock).mockImplementation(
        (fn: (tx: any) => Promise<any>) => {
          capturedTx = {
            $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
          };
          return fn(capturedTx);
        }
      );
      (processSearchAlerts as jest.Mock).mockResolvedValue({
        processed: 0,
        alertsSent: 0,
        errors: 0,
        details: [],
      });

      await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`));

      // Lock acquired via tx.$queryRaw inside $transaction
      const calls = capturedTx.$queryRaw.mock.calls;
      expect(calls.length).toBe(1);
      const lockCallStrings = calls[0][0].join("");
      expect(lockCallStrings).toContain("pg_try_advisory_xact_lock");
    });

    it("skips processing when lock is held by another instance", async () => {
      mockTransaction(false);

      const response = await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.skipped).toBe(true);
      expect(data.reason).toBe("lock_held");
      expect(processSearchAlerts).not.toHaveBeenCalled();
    });

    it("uses xact lock that auto-releases on transaction end (no manual unlock)", async () => {
      let capturedTx: any;
      (prisma.$transaction as jest.Mock).mockImplementation(
        (fn: (tx: any) => Promise<any>) => {
          capturedTx = {
            $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
          };
          return fn(capturedTx);
        }
      );
      (processSearchAlerts as jest.Mock).mockResolvedValue({
        processed: 1,
        alertsSent: 1,
        errors: 0,
        details: [],
      });

      await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`));

      // Only ONE tx.$queryRaw call (lock acquisition), no unlock call
      const calls = capturedTx.$queryRaw.mock.calls;
      expect(calls.length).toBe(1);
      const callStr = calls[0][0].join("");
      expect(callStr).not.toContain("pg_advisory_unlock");
    });

    it("auto-releases lock on error (transaction rollback)", async () => {
      (prisma.$transaction as jest.Mock).mockRejectedValue(
        new Error("Processing failed")
      );

      const response = await GET(createRequest(`Bearer ${VALID_CRON_SECRET}`));

      // Error is caught and returns 500 — lock auto-released by rollback
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });
});
