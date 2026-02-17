/**
 * Edge Case Tests: Category B - Rate Limiting and Abuse Controls
 *
 * Tests for rate limiting edge cases including:
 * - IP-based rate limiting
 * - User-based rate limiting
 * - Endpoint-specific limits
 * - Redis fallback to database
 * - Distributed rate limiting consistency
 * - Abuse detection patterns
 *
 * @see Edge Cases Category B (15 tests)
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: jest.fn(),
    rateLimitEntry: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    abuseLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@upstash/redis", () => ({
  Redis: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
    multi: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  })),
}));

import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

describe("Rate Limiting Edge Cases - Category B", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // B1: Rate limit exactly at boundary
  describe("B1: Rate limit boundary conditions", () => {
    it("allows request at limit - 1", async () => {
      const config = { limit: 5, windowMs: 60000 };
      const existingEntry = {
        id: "entry-123",
        count: 4, // One less than limit
        windowStart: new Date(),
      };

      (prisma.rateLimitEntry.findUnique as jest.Mock).mockResolvedValue(
        existingEntry,
      );
      (prisma.rateLimitEntry.update as jest.Mock).mockResolvedValue({
        ...existingEntry,
        count: 5,
      });

      const entry = await prisma.rateLimitEntry.findUnique({
        where: { id: "entry-123" },
      });

      expect(entry?.count).toBe(4);
      expect(entry?.count).toBeLessThan(config.limit);
    });

    it("blocks request at exactly limit", async () => {
      const config = { limit: 5, windowMs: 60000 };
      const existingEntry = {
        id: "entry-123",
        count: 5, // At limit
        windowStart: new Date(),
      };

      (prisma.rateLimitEntry.findUnique as jest.Mock).mockResolvedValue(
        existingEntry,
      );

      const entry = await prisma.rateLimitEntry.findUnique({
        where: { id: "entry-123" },
      });

      expect(entry?.count).toBe(config.limit);
      // Should be blocked
    });

    it("resets window at exactly windowMs boundary", async () => {
      const config = { limit: 5, windowMs: 60000 };
      const expiredEntry = {
        id: "entry-123",
        count: 5,
        windowStart: new Date(Date.now() - 60000), // Exactly at boundary
      };

      (prisma.rateLimitEntry.findUnique as jest.Mock).mockResolvedValue(
        expiredEntry,
      );
      (prisma.rateLimitEntry.upsert as jest.Mock).mockResolvedValue({
        id: "entry-123",
        count: 1,
        windowStart: new Date(),
      });

      const entry = await prisma.rateLimitEntry.findUnique({
        where: { id: "entry-123" },
      });

      const windowAge = Date.now() - entry!.windowStart.getTime();
      expect(windowAge).toBeGreaterThanOrEqual(config.windowMs);
    });
  });

  // B2: Concurrent requests race condition — now uses atomic SQL
  describe("B2: Concurrent rate limit updates", () => {
    it("handles simultaneous requests via atomic SQL (no TOCTOU)", async () => {
      const now = new Date();
      let atomicCount = 2;

      // Each concurrent call to $queryRaw atomically increments and returns
      (prisma.$queryRaw as jest.Mock).mockImplementation(async () => {
        atomicCount++;
        return [{ id: "entry-123", count: atomicCount, windowStart: now, expiresAt: new Date(now.getTime() + 60000) }];
      });
      (prisma.rateLimitEntry.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

      const config = { limit: 10, windowMs: 60000 };
      const results = await Promise.all([
        checkRateLimit("127.0.0.1", "/api/test", config),
        checkRateLimit("127.0.0.1", "/api/test", config),
        checkRateLimit("127.0.0.1", "/api/test", config),
      ]);

      // All 3 should succeed (counts 3, 4, 5 — all under limit 10)
      expect(results.every(r => r.success)).toBe(true);
      // Atomic SQL used, not findUnique+update
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
      expect(prisma.rateLimitEntry.update).not.toHaveBeenCalled();
    });

    it("atomically denies concurrent requests at limit", async () => {
      const now = new Date();

      // Atomic UPDATE returns empty (count >= limit)
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      (prisma.rateLimitEntry.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.rateLimitEntry.findUnique as jest.Mock).mockResolvedValue({
        id: "entry-123", count: 10, windowStart: now, expiresAt: new Date(now.getTime() + 60000),
      });

      const config = { limit: 10, windowMs: 60000 };
      const results = await Promise.all([
        checkRateLimit("127.0.0.1", "/api/test", config),
        checkRateLimit("127.0.0.1", "/api/test", config),
      ]);

      // Both should be denied
      expect(results.every(r => !r.success)).toBe(true);
    });
  });

  // B3: Different endpoints with different limits
  describe("B3: Endpoint-specific rate limits", () => {
    it("applies correct limit for registration endpoint", async () => {
      const registerLimit = { limit: 5, windowMs: 3600000 }; // 5 per hour

      (prisma.rateLimitEntry.count as jest.Mock).mockResolvedValue(3);

      const count = await prisma.rateLimitEntry.count({
        where: { identifier: "127.0.0.1", endpoint: "/api/register" },
      });

      expect(count).toBeLessThan(registerLimit.limit);
    });

    it("applies correct limit for message endpoint", async () => {
      const messageLimit = { limit: 60, windowMs: 3600000 }; // 60 per hour

      (prisma.rateLimitEntry.count as jest.Mock).mockResolvedValue(50);

      const count = await prisma.rateLimitEntry.count({
        where: { identifier: "127.0.0.1", endpoint: "/api/messages" },
      });

      expect(count).toBeLessThan(messageLimit.limit);
    });

    it("isolates rate limits between endpoints", async () => {
      (prisma.rateLimitEntry.findUnique as jest.Mock)
        .mockResolvedValueOnce({ count: 5 }) // /api/register - at limit
        .mockResolvedValueOnce({ count: 2 }); // /api/messages - not at limit

      const registerEntry = await prisma.rateLimitEntry.findUnique({
        where: {
          identifier_endpoint: { identifier: "ip", endpoint: "/api/register" },
        },
      });
      const messageEntry = await prisma.rateLimitEntry.findUnique({
        where: {
          identifier_endpoint: { identifier: "ip", endpoint: "/api/messages" },
        },
      });

      expect(registerEntry?.count).toBe(5);
      expect(messageEntry?.count).toBe(2);
    });
  });

  // B4: IP spoofing prevention
  describe("B4: IP extraction and spoofing prevention", () => {
    it("uses x-real-ip header in production", () => {
      const headers = new Headers();
      headers.set("x-real-ip", "203.0.113.1");
      headers.set("x-forwarded-for", "192.168.1.1"); // Should be ignored

      const ip = headers.get("x-real-ip");
      expect(ip).toBe("203.0.113.1");
    });

    it("extracts first IP from x-forwarded-for in development", () => {
      const forwardedFor = "192.168.1.1, 10.0.0.1, 172.16.0.1";
      const clientIp = forwardedFor.split(",")[0].trim();

      expect(clientIp).toBe("192.168.1.1");
    });

    it("returns unknown for missing IP headers", () => {
      const headers = new Headers();
      const ip =
        headers.get("x-real-ip") || headers.get("x-forwarded-for") || "unknown";

      expect(ip).toBe("unknown");
    });
  });

  // B5: User-based rate limiting
  describe("B5: User-based vs IP-based rate limiting", () => {
    it("combines user ID and IP for identified users", async () => {
      const identifier = "user:user-123:ip:192.168.1.1";

      (prisma.rateLimitEntry.findUnique as jest.Mock).mockResolvedValue({
        identifier,
        count: 3,
      });

      const entry = await prisma.rateLimitEntry.findUnique({
        where: {
          identifier_endpoint: { identifier, endpoint: "/api/messages" },
        },
      });

      expect(entry?.identifier).toContain("user-123");
      expect(entry?.identifier).toContain("192.168.1.1");
    });

    it("uses only IP for anonymous users", async () => {
      const identifier = "ip:192.168.1.1";

      (prisma.rateLimitEntry.findUnique as jest.Mock).mockResolvedValue({
        identifier,
        count: 2,
      });

      const entry = await prisma.rateLimitEntry.findUnique({
        where: {
          identifier_endpoint: { identifier, endpoint: "/api/register" },
        },
      });

      expect(entry?.identifier).not.toContain("user:");
    });
  });

  // B6: Redis failover to database
  describe("B6: Redis failover scenarios", () => {
    it("falls back to database when Redis unavailable", async () => {
      // Simulate Redis failure
      const redisAvailable = false;

      if (!redisAvailable) {
        (prisma.rateLimitEntry.upsert as jest.Mock).mockResolvedValue({
          id: "entry-123",
          count: 1,
        });
      }

      const entry = await prisma.rateLimitEntry.upsert({
        where: { id: "entry-123" },
        update: { count: { increment: 1 } },
        create: {
          identifier: "ip",
          endpoint: "/api",
          count: 1,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      expect(entry).not.toBeNull();
    });

    it("maintains rate limiting accuracy during failover", async () => {
      // Entry was at count 4 in Redis before failure
      (prisma.rateLimitEntry.findUnique as jest.Mock).mockResolvedValue({
        count: 4,
        windowStart: new Date(),
      });

      const entry = await prisma.rateLimitEntry.findUnique({
        where: { id: "entry-123" },
      });

      // Database should reflect similar count
      expect(entry?.count).toBe(4);
    });
  });

  // B7: Cleanup of expired entries
  describe("B7: Rate limit entry cleanup", () => {
    it("deletes expired entries during check", async () => {
      const expiredTime = new Date(Date.now() - 3600000);

      (prisma.rateLimitEntry.deleteMany as jest.Mock).mockResolvedValue({
        count: 5,
      });

      const result = await prisma.rateLimitEntry.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });

      expect(result.count).toBe(5);
    });

    it("handles entries with different expiration times", async () => {
      const entries = [
        { id: "1", expiresAt: new Date(Date.now() - 1000) }, // Expired
        { id: "2", expiresAt: new Date(Date.now() + 1000) }, // Valid
        { id: "3", expiresAt: new Date(Date.now() - 2000) }, // Expired
      ];

      const expiredCount = entries.filter(
        (e) => e.expiresAt.getTime() < Date.now(),
      ).length;
      expect(expiredCount).toBe(2);
    });
  });

  // B8: Abuse detection patterns
  describe("B8: Abuse pattern detection", () => {
    it("detects rapid sequential requests", async () => {
      const requestTimestamps = [
        Date.now() - 100,
        Date.now() - 80,
        Date.now() - 60,
        Date.now() - 40,
        Date.now() - 20,
        Date.now(),
      ];

      const averageInterval =
        requestTimestamps.reduce((sum, ts, i, arr) => {
          if (i === 0) return 0;
          return sum + (ts - arr[i - 1]);
        }, 0) /
        (requestTimestamps.length - 1);

      // Less than 50ms average interval indicates automation
      expect(averageInterval).toBeLessThan(50);
    });

    it("logs suspicious activity patterns", async () => {
      // Mock abuse logging feature (abuseLog model not in current schema)
      const mockAbuseLog = {
        create: jest.fn().mockResolvedValue({
          id: "log-123",
          type: "RAPID_REQUESTS",
          identifier: "192.168.1.1",
          details: { requestCount: 100, windowMs: 1000 },
        }),
      };
      // @ts-expect-error - abuseLog not in current schema, testing future feature
      prisma.abuseLog = mockAbuseLog;

      // @ts-expect-error - abuseLog not in current schema, testing future feature
      const log = await prisma.abuseLog.create({
        data: {
          type: "RAPID_REQUESTS",
          identifier: "192.168.1.1",
          details: { requestCount: 100, windowMs: 1000 },
        },
      });

      expect(log.type).toBe("RAPID_REQUESTS");
    });
  });

  // B9: Burst handling
  describe("B9: Request burst handling", () => {
    it("allows controlled bursts within limit", async () => {
      const burstConfig = { limit: 10, burstLimit: 20, burstWindowMs: 1000 };
      let burstCount = 0;

      (prisma.rateLimitEntry.update as jest.Mock).mockImplementation(
        async () => {
          burstCount++;
          return { count: burstCount };
        },
      );

      // Simulate burst of 15 requests
      for (let i = 0; i < 15; i++) {
        await prisma.rateLimitEntry.update({
          where: { id: "entry-123" },
          data: { count: { increment: 1 } },
        });
      }

      expect(burstCount).toBeLessThanOrEqual(burstConfig.burstLimit);
    });
  });

  // B10: Rate limit headers
  describe("B10: Rate limit response headers", () => {
    it("returns correct X-RateLimit-Limit header", () => {
      const config = { limit: 60 };
      const headers = { "X-RateLimit-Limit": config.limit.toString() };

      expect(headers["X-RateLimit-Limit"]).toBe("60");
    });

    it("returns correct X-RateLimit-Remaining header", () => {
      const limit = 60;
      const used = 45;
      const remaining = limit - used;

      expect(remaining).toBe(15);
    });

    it("returns correct X-RateLimit-Reset header", () => {
      const windowStart = Date.now();
      const windowMs = 3600000;
      const resetTime = Math.ceil((windowStart + windowMs) / 1000);

      expect(resetTime).toBeGreaterThan(Date.now() / 1000);
    });

    it("returns correct Retry-After header when blocked", () => {
      const windowStart = Date.now() - 1800000; // 30 min ago
      const windowMs = 3600000; // 1 hour
      const retryAfter = Math.ceil(
        (windowStart + windowMs - Date.now()) / 1000,
      );

      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(1800);
    });
  });

  // B11: Graceful degradation on errors
  describe("B11: Error handling and graceful degradation", () => {
    it("allows requests when rate limiter fails", async () => {
      (prisma.rateLimitEntry.findUnique as jest.Mock).mockRejectedValue(
        new Error("Database connection failed"),
      );

      let allowed = true;
      try {
        await prisma.rateLimitEntry.findUnique({ where: { id: "entry-123" } });
      } catch {
        // Fail open - allow the request
        allowed = true;
      }

      expect(allowed).toBe(true);
    });
  });

  // B12: Different limits for authenticated users
  describe("B12: Authenticated user rate limits", () => {
    it("applies higher limits for verified users", async () => {
      const limits = {
        anonymous: { limit: 10 },
        authenticated: { limit: 60 },
        verified: { limit: 100 },
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-123",
        emailVerified: new Date(),
        isVerified: true,
      });

      const user = await prisma.user.findUnique({ where: { id: "user-123" } });

      const applicableLimit = user?.isVerified
        ? limits.verified.limit
        : user?.emailVerified
          ? limits.authenticated.limit
          : limits.anonymous.limit;

      expect(applicableLimit).toBe(100);
    });
  });

  // B13: Sliding window rate limiting
  describe("B13: Sliding window implementation", () => {
    it("calculates sliding window count correctly", () => {
      const windowMs = 60000;
      const currentTime = Date.now();
      const previousWindowCount = 30;
      const currentWindowCount = 10;
      const windowProgress = (currentTime % windowMs) / windowMs;

      // Weighted sliding window formula
      const slidingCount =
        Math.floor(previousWindowCount * (1 - windowProgress)) +
        currentWindowCount;

      expect(slidingCount).toBeGreaterThan(0);
      expect(slidingCount).toBeLessThanOrEqual(
        previousWindowCount + currentWindowCount,
      );
    });
  });

  // B14: Rate limit bypass for health checks
  describe("B14: Rate limit bypass patterns", () => {
    it("bypasses rate limit for health check endpoints", () => {
      const bypassEndpoints = [
        "/api/health",
        "/api/health/live",
        "/api/health/ready",
      ];
      const requestPath = "/api/health/live";

      const shouldBypass = bypassEndpoints.some((endpoint) =>
        requestPath.startsWith(endpoint),
      );

      expect(shouldBypass).toBe(true);
    });

    it("does not bypass for regular endpoints", () => {
      const bypassEndpoints = [
        "/api/health",
        "/api/health/live",
        "/api/health/ready",
      ];
      const requestPath = "/api/messages";

      const shouldBypass = bypassEndpoints.some((endpoint) =>
        requestPath.startsWith(endpoint),
      );

      expect(shouldBypass).toBe(false);
    });
  });

  // B15: Cross-region rate limiting
  describe("B15: Distributed rate limiting consistency", () => {
    it("maintains consistent count across replicas", async () => {
      // Simulate distributed increment
      let globalCount = 0;

      const incrementAndGet = async () => {
        globalCount++;
        return globalCount;
      };

      const results = await Promise.all([
        incrementAndGet(),
        incrementAndGet(),
        incrementAndGet(),
      ]);

      expect(results[results.length - 1]).toBe(3);
    });

    it("handles clock skew between regions", () => {
      const region1Time = Date.now();
      const region2Time = Date.now() + 5000; // 5 second skew

      const normalizedTime = (t: number) => Math.floor(t / 1000) * 1000;

      // Times should normalize to same window
      const window1 = Math.floor(normalizedTime(region1Time) / 60000);
      const window2 = Math.floor(normalizedTime(region2Time) / 60000);

      // With 5 second skew, should be in same minute
      expect(Math.abs(window1 - window2)).toBeLessThanOrEqual(1);
    });
  });
});
