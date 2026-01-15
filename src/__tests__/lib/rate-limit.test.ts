/**
 * Tests for rate-limit utility functions
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    rateLimitEntry: {
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

import {
  checkRateLimit,
  RATE_LIMITS,
  getClientIP,
  _clearDegradedModeCache,
} from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

describe("rate-limit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _clearDegradedModeCache();
  });

  describe("checkRateLimit", () => {
    const identifier = "127.0.0.1";
    const endpoint = "/api/register";
    const config = { limit: 5, windowMs: 60000 };

    describe("successful requests", () => {
      it("allows first request and creates new entry", async () => {
        (prisma.rateLimitEntry.deleteMany as jest.Mock).mockResolvedValue({
          count: 0,
        });
        (prisma.rateLimitEntry.findUnique as jest.Mock).mockResolvedValue(null);
        (prisma.rateLimitEntry.upsert as jest.Mock).mockResolvedValue({});

        const result = await checkRateLimit(identifier, endpoint, config);

        expect(result.success).toBe(true);
        expect(result.remaining).toBe(4); // limit - 1
        expect(result.resetAt).toBeInstanceOf(Date);
      });

      it("allows requests within limit", async () => {
        const now = new Date();
        const existingEntry = {
          id: "entry-123",
          count: 2,
          windowStart: now,
        };

        (prisma.rateLimitEntry.deleteMany as jest.Mock).mockResolvedValue({
          count: 0,
        });
        (prisma.rateLimitEntry.findUnique as jest.Mock).mockResolvedValue(
          existingEntry,
        );
        (prisma.rateLimitEntry.update as jest.Mock).mockResolvedValue({
          ...existingEntry,
          count: 3,
        });

        const result = await checkRateLimit(identifier, endpoint, config);

        expect(result.success).toBe(true);
        expect(result.remaining).toBe(2); // 5 - 3
      });

      it("increments count for existing entry", async () => {
        const now = new Date();
        const existingEntry = {
          id: "entry-123",
          count: 1,
          windowStart: now,
        };

        (prisma.rateLimitEntry.deleteMany as jest.Mock).mockResolvedValue({
          count: 0,
        });
        (prisma.rateLimitEntry.findUnique as jest.Mock).mockResolvedValue(
          existingEntry,
        );
        (prisma.rateLimitEntry.update as jest.Mock).mockResolvedValue({
          ...existingEntry,
          count: 2,
        });

        await checkRateLimit(identifier, endpoint, config);

        expect(prisma.rateLimitEntry.update).toHaveBeenCalledWith({
          where: { id: "entry-123" },
          data: { count: 2 },
        });
      });

      it("returns correct remaining count", async () => {
        const now = new Date();
        const existingEntry = {
          id: "entry-123",
          count: 3,
          windowStart: now,
        };

        (prisma.rateLimitEntry.deleteMany as jest.Mock).mockResolvedValue({
          count: 0,
        });
        (prisma.rateLimitEntry.findUnique as jest.Mock).mockResolvedValue(
          existingEntry,
        );
        (prisma.rateLimitEntry.update as jest.Mock).mockResolvedValue({
          ...existingEntry,
          count: 4,
        });

        const result = await checkRateLimit(identifier, endpoint, config);

        expect(result.remaining).toBe(1); // 5 - 4
      });

      it("resets window for expired entry", async () => {
        const oldWindowStart = new Date(Date.now() - 120000); // 2 minutes ago
        const existingEntry = {
          id: "entry-123",
          count: 5,
          windowStart: oldWindowStart,
        };

        (prisma.rateLimitEntry.deleteMany as jest.Mock).mockResolvedValue({
          count: 0,
        });
        (prisma.rateLimitEntry.findUnique as jest.Mock).mockResolvedValue(
          existingEntry,
        );
        (prisma.rateLimitEntry.upsert as jest.Mock).mockResolvedValue({});

        const result = await checkRateLimit(identifier, endpoint, config);

        expect(result.success).toBe(true);
        expect(result.remaining).toBe(4); // New window starts
        expect(prisma.rateLimitEntry.upsert).toHaveBeenCalled();
      });
    });

    describe("blocked requests", () => {
      it("blocks when limit exceeded", async () => {
        const now = new Date();
        const existingEntry = {
          id: "entry-123",
          count: 5,
          windowStart: now,
        };

        (prisma.rateLimitEntry.deleteMany as jest.Mock).mockResolvedValue({
          count: 0,
        });
        (prisma.rateLimitEntry.findUnique as jest.Mock).mockResolvedValue(
          existingEntry,
        );

        const result = await checkRateLimit(identifier, endpoint, config);

        expect(result.success).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.retryAfter).toBeGreaterThan(0);
      });

      it("returns retryAfter in seconds", async () => {
        const now = new Date();
        const existingEntry = {
          id: "entry-123",
          count: 5,
          windowStart: now,
        };

        (prisma.rateLimitEntry.deleteMany as jest.Mock).mockResolvedValue({
          count: 0,
        });
        (prisma.rateLimitEntry.findUnique as jest.Mock).mockResolvedValue(
          existingEntry,
        );

        const result = await checkRateLimit(identifier, endpoint, config);

        expect(result.retryAfter).toBeDefined();
        expect(result.retryAfter).toBeGreaterThanOrEqual(1);
        expect(result.retryAfter).toBeLessThanOrEqual(60); // windowMs / 1000
      });

      it("provides resetAt timestamp when blocked", async () => {
        const now = new Date();
        const existingEntry = {
          id: "entry-123",
          count: 5,
          windowStart: now,
        };

        (prisma.rateLimitEntry.deleteMany as jest.Mock).mockResolvedValue({
          count: 0,
        });
        (prisma.rateLimitEntry.findUnique as jest.Mock).mockResolvedValue(
          existingEntry,
        );

        const result = await checkRateLimit(identifier, endpoint, config);

        expect(result.resetAt).toBeInstanceOf(Date);
        expect(result.resetAt.getTime()).toBeGreaterThan(now.getTime());
      });
    });

    describe("cleanup", () => {
      it("cleans up expired entries", async () => {
        (prisma.rateLimitEntry.deleteMany as jest.Mock).mockResolvedValue({
          count: 2,
        });
        (prisma.rateLimitEntry.findUnique as jest.Mock).mockResolvedValue(null);
        (prisma.rateLimitEntry.upsert as jest.Mock).mockResolvedValue({});

        await checkRateLimit(identifier, endpoint, config);

        expect(prisma.rateLimitEntry.deleteMany).toHaveBeenCalledWith({
          where: {
            identifier,
            endpoint,
            expiresAt: { lt: expect.any(Date) },
          },
        });
      });
    });

    describe("error handling", () => {
      it("allows first request in degraded mode on database error", async () => {
        (prisma.rateLimitEntry.deleteMany as jest.Mock).mockRejectedValue(
          new Error("DB Error"),
        );

        const result = await checkRateLimit(identifier, endpoint, config);

        // First call in degraded mode should still allow (best-effort fallback)
        expect(result.success).toBe(true);
        expect(result.remaining).toBe(1); // Degraded mode indicator
      });

      it("denies after degraded mode limit exceeded", async () => {
        (prisma.rateLimitEntry.deleteMany as jest.Mock).mockRejectedValue(
          new Error("DB Error"),
        );

        // Exhaust degraded mode limit (10 calls)
        for (let i = 0; i < 10; i++) {
          await checkRateLimit(identifier, endpoint, config);
        }

        // 11th call should be denied
        const result = await checkRateLimit(identifier, endpoint, config);

        expect(result.success).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.retryAfter).toBe(60);
      });

      it("does not log PII on database error", async () => {
        const consoleSpy = jest.spyOn(console, "error").mockImplementation();
        (prisma.rateLimitEntry.deleteMany as jest.Mock).mockRejectedValue(
          new Error("DB Error"),
        );

        await checkRateLimit("192.168.1.100", endpoint, config);

        // Verify no IP address in logs
        expect(consoleSpy).toHaveBeenCalled();
        const logMessage = consoleSpy.mock.calls[0][0];
        expect(logMessage).not.toContain("192.168.1.100");
        expect(logMessage).toContain("RL_DB_ERR");

        consoleSpy.mockRestore();
      });
    });
  });

  describe("RATE_LIMITS", () => {
    it("has register limit of 5 per hour", () => {
      expect(RATE_LIMITS.register.limit).toBe(5);
      expect(RATE_LIMITS.register.windowMs).toBe(60 * 60 * 1000);
    });

    it("has forgotPassword limit of 3 per hour", () => {
      expect(RATE_LIMITS.forgotPassword.limit).toBe(3);
      expect(RATE_LIMITS.forgotPassword.windowMs).toBe(60 * 60 * 1000);
    });

    it("has resendVerification limit of 3 per hour", () => {
      expect(RATE_LIMITS.resendVerification.limit).toBe(3);
      expect(RATE_LIMITS.resendVerification.windowMs).toBe(60 * 60 * 1000);
    });

    it("has upload limit of 20 per hour", () => {
      expect(RATE_LIMITS.upload.limit).toBe(20);
      expect(RATE_LIMITS.upload.windowMs).toBe(60 * 60 * 1000);
    });

    it("has messages limit of 60 per hour", () => {
      expect(RATE_LIMITS.messages.limit).toBe(60);
      expect(RATE_LIMITS.messages.windowMs).toBe(60 * 60 * 1000);
    });

    it("has listings limit of 10 per day", () => {
      expect(RATE_LIMITS.listings.limit).toBe(10);
      expect(RATE_LIMITS.listings.windowMs).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe("getClientIP", () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      // Restore original NODE_ENV using delete + assign pattern
      delete (process.env as { NODE_ENV?: string }).NODE_ENV;
      (process.env as { NODE_ENV?: string }).NODE_ENV = originalNodeEnv;
    });

    it("extracts IP from x-forwarded-for header in development mode", () => {
      delete (process.env as { NODE_ENV?: string }).NODE_ENV;
      (process.env as { NODE_ENV?: string }).NODE_ENV = "development";
      const request = new Request("http://localhost", {
        headers: { "x-forwarded-for": "192.168.1.1, 10.0.0.1" },
      });

      const ip = getClientIP(request);

      expect(ip).toBe("192.168.1.1");
    });

    it("extracts first IP from comma-separated list in development mode", () => {
      delete (process.env as { NODE_ENV?: string }).NODE_ENV;
      (process.env as { NODE_ENV?: string }).NODE_ENV = "development";
      const request = new Request("http://localhost", {
        headers: { "x-forwarded-for": "8.8.8.8, 192.168.1.1, 10.0.0.1" },
      });

      const ip = getClientIP(request);

      expect(ip).toBe("8.8.8.8");
    });

    it("uses x-real-ip (Vercel edge header) as primary source", () => {
      const request = new Request("http://localhost", {
        headers: { "x-real-ip": "203.0.113.1" },
      });

      const ip = getClientIP(request);

      expect(ip).toBe("203.0.113.1");
    });

    it("returns unknown when no headers present", () => {
      const request = new Request("http://localhost");

      const ip = getClientIP(request);

      expect(ip).toBe("unknown");
    });

    it("trims whitespace from IP in development mode", () => {
      delete (process.env as { NODE_ENV?: string }).NODE_ENV;
      (process.env as { NODE_ENV?: string }).NODE_ENV = "development";
      const request = new Request("http://localhost", {
        headers: { "x-forwarded-for": "  192.168.1.1  , 10.0.0.1" },
      });

      const ip = getClientIP(request);

      expect(ip).toBe("192.168.1.1");
    });
  });
});
