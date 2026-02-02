import {
  isThrottled,
  getRetryAfterMs,
  rateLimitedFetch,
  resetThrottle,
  RateLimitError,
} from "@/lib/rate-limit-client";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  resetThrottle();
  mockFetch.mockReset();
});

describe("rate-limit-client", () => {
  describe("isThrottled / getRetryAfterMs", () => {
    it("returns false initially", () => {
      expect(isThrottled()).toBe(false);
      expect(getRetryAfterMs()).toBe(0);
    });

    it("returns true after a 429 response with Retry-After seconds", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 429,
        headers: new Headers({ "Retry-After": "5" }),
      });

      await expect(rateLimitedFetch("/api/test")).rejects.toThrow(
        RateLimitError,
      );
      expect(isThrottled()).toBe(true);
      expect(getRetryAfterMs()).toBeGreaterThan(0);
      expect(getRetryAfterMs()).toBeLessThanOrEqual(5000);
    });

    it("returns false after backoff expires", async () => {
      // Manually set a short backoff by triggering a 429
      mockFetch.mockResolvedValueOnce({
        status: 429,
        headers: new Headers({ "Retry-After": "0.01" }), // 10ms
      });

      await expect(rateLimitedFetch("/api/test")).rejects.toThrow(
        RateLimitError,
      );

      // Wait for backoff to expire
      await new Promise((r) => setTimeout(r, 20));
      expect(isThrottled()).toBe(false);
    });
  });

  describe("rateLimitedFetch", () => {
    it("passes through successful responses", async () => {
      const mockRes = { status: 200, ok: true };
      mockFetch.mockResolvedValueOnce(mockRes);

      const res = await rateLimitedFetch("/api/test");
      expect(res).toBe(mockRes);
      expect(mockFetch).toHaveBeenCalledWith("/api/test", undefined);
    });

    it("forwards RequestInit options", async () => {
      const mockRes = { status: 200, ok: true };
      mockFetch.mockResolvedValueOnce(mockRes);
      const signal = new AbortController().signal;

      await rateLimitedFetch("/api/test", { signal, cache: "no-store" });
      expect(mockFetch).toHaveBeenCalledWith("/api/test", {
        signal,
        cache: "no-store",
      });
    });

    it("throws RateLimitError on 429 with numeric Retry-After", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 429,
        headers: new Headers({ "Retry-After": "30" }),
      });

      try {
        await rateLimitedFetch("/api/test");
        fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError);
        expect((err as RateLimitError).retryAfterMs).toBe(30_000);
      }
    });

    it("throws RateLimitError on 429 with HTTP-date Retry-After", async () => {
      const futureDate = new Date(Date.now() + 10_000).toUTCString();
      mockFetch.mockResolvedValueOnce({
        status: 429,
        headers: new Headers({ "Retry-After": futureDate }),
      });

      try {
        await rateLimitedFetch("/api/test");
        fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError);
        // Should be roughly 10s
        expect((err as RateLimitError).retryAfterMs).toBeGreaterThan(5000);
        expect((err as RateLimitError).retryAfterMs).toBeLessThanOrEqual(
          11_000,
        );
      }
    });

    it("defaults to 60s when Retry-After header is missing", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 429,
        headers: new Headers(),
      });

      try {
        await rateLimitedFetch("/api/test");
        fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError);
        expect((err as RateLimitError).retryAfterMs).toBe(60_000);
      }
    });

    it("rejects immediately when already throttled (no fetch call)", async () => {
      // First: trigger throttle
      mockFetch.mockResolvedValueOnce({
        status: 429,
        headers: new Headers({ "Retry-After": "60" }),
      });
      await expect(rateLimitedFetch("/api/first")).rejects.toThrow(
        RateLimitError,
      );

      // Second: should not call fetch at all
      mockFetch.mockClear();
      await expect(rateLimitedFetch("/api/second")).rejects.toThrow(
        RateLimitError,
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("resetThrottle", () => {
    it("clears throttle state", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 429,
        headers: new Headers({ "Retry-After": "60" }),
      });
      await expect(rateLimitedFetch("/api/test")).rejects.toThrow();

      expect(isThrottled()).toBe(true);
      resetThrottle();
      expect(isThrottled()).toBe(false);
    });
  });
});
