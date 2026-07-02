/**
 * @jest-environment node
 *
 * Monthly provider caps must be enforced across serverless instances, so the
 * counters live in Redis (INCRBY + EXPIRE). The in-memory Map is only a
 * per-instance fallback when Redis is not configured or errors.
 */

const mockIncrby = jest.fn();
const mockExpire = jest.fn();
const mockGet = jest.fn();
const mockRedisConstructor = jest.fn();

jest.mock("@upstash/redis", () => ({
  Redis: class {
    incrby = mockIncrby;
    expire = mockExpire;
    get = mockGet;
    constructor(config: unknown) {
      mockRedisConstructor(config);
    }
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
}));

import {
  clearGeocodingProviderUsageForTests,
  getMonthlyProviderUsage,
  isProviderMonthlyCapReached,
  recordGeocodingProviderUsage,
} from "@/lib/geocoding/provider-cost-controls";

const PROVIDER_INPUT = {
  provider: "google",
  surface: "public_autocomplete",
} as const;

describe("provider-cost-controls", () => {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  beforeEach(() => {
    jest.clearAllMocks();
    clearGeocodingProviderUsageForTests();
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
  });

  afterAll(() => {
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) {
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    } else {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    }
  });

  describe("with Redis configured", () => {
    it("records usage via INCRBY under a month-scoped key", async () => {
      mockIncrby.mockResolvedValueOnce(1);
      mockExpire.mockResolvedValueOnce(1);

      await recordGeocodingProviderUsage({
        ...PROVIDER_INPUT,
        operation: "places_autocomplete",
      });

      expect(mockIncrby).toHaveBeenCalledTimes(1);
      const [key, units] = mockIncrby.mock.calls[0];
      expect(key).toMatch(
        /^geo-usage:\d{4}-\d{2}:public_autocomplete:google$/
      );
      expect(units).toBe(1);
    });

    it("sets an expiry only on the first increment of a month key", async () => {
      mockIncrby.mockResolvedValueOnce(1);
      mockExpire.mockResolvedValueOnce(1);
      await recordGeocodingProviderUsage({
        ...PROVIDER_INPUT,
        operation: "op",
      });
      expect(mockExpire).toHaveBeenCalledTimes(1);

      mockIncrby.mockResolvedValueOnce(2);
      await recordGeocodingProviderUsage({
        ...PROVIDER_INPUT,
        operation: "op",
      });
      expect(mockExpire).toHaveBeenCalledTimes(1);
    });

    it("reads month-to-date usage from Redis, so caps hold across instances", async () => {
      mockGet.mockResolvedValueOnce(120);
      await expect(
        isProviderMonthlyCapReached({ ...PROVIDER_INPUT, monthlyCap: 100 })
      ).resolves.toBe(true);

      mockGet.mockResolvedValueOnce(99);
      await expect(
        isProviderMonthlyCapReached({ ...PROVIDER_INPUT, monthlyCap: 100 })
      ).resolves.toBe(false);
    });

    it("tolerates string counter values from the REST client", async () => {
      mockGet.mockResolvedValueOnce("42");
      await expect(getMonthlyProviderUsage(PROVIDER_INPUT)).resolves.toBe(42);
    });

    it("never reports the cap reached when no cap is configured", async () => {
      await expect(
        isProviderMonthlyCapReached({ ...PROVIDER_INPUT, monthlyCap: undefined })
      ).resolves.toBe(false);
      await expect(
        isProviderMonthlyCapReached({ ...PROVIDER_INPUT, monthlyCap: 0 })
      ).resolves.toBe(false);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it("falls back to the per-instance counter when Redis errors", async () => {
      mockIncrby.mockRejectedValue(new Error("redis down"));
      mockGet.mockRejectedValue(new Error("redis down"));

      await recordGeocodingProviderUsage({
        ...PROVIDER_INPUT,
        operation: "op",
      });
      await recordGeocodingProviderUsage({
        ...PROVIDER_INPUT,
        operation: "op",
      });

      await expect(getMonthlyProviderUsage(PROVIDER_INPUT)).resolves.toBe(2);
      await expect(
        isProviderMonthlyCapReached({ ...PROVIDER_INPUT, monthlyCap: 2 })
      ).resolves.toBe(true);
    });
  });

  describe("without Redis configured", () => {
    beforeEach(() => {
      clearGeocodingProviderUsageForTests();
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    });

    it("enforces caps with the per-instance counter", async () => {
      await recordGeocodingProviderUsage({
        ...PROVIDER_INPUT,
        operation: "op",
        units: 3,
      });

      expect(mockIncrby).not.toHaveBeenCalled();
      await expect(getMonthlyProviderUsage(PROVIDER_INPUT)).resolves.toBe(3);
      await expect(
        isProviderMonthlyCapReached({ ...PROVIDER_INPUT, monthlyCap: 3 })
      ).resolves.toBe(true);
      await expect(
        isProviderMonthlyCapReached({ ...PROVIDER_INPUT, monthlyCap: 4 })
      ).resolves.toBe(false);
    });
  });
});
