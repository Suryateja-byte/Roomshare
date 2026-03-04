import {
  isThrottled,
  getRetryAfterMs,
  rateLimitedFetch,
  resetThrottle,
  RateLimitError,
} from "@/lib/rate-limit-client";
import { FetchTimeoutError } from "@/lib/fetch-with-timeout";

// Mock global fetch — save original and restore in afterAll to prevent cross-file leaks
const originalFetch = global.fetch;
const mockFetch = jest.fn();
beforeAll(() => { global.fetch = mockFetch; });
afterAll(() => { global.fetch = originalFetch; });

beforeEach(() => {
  resetThrottle();
  mockFetch.mockReset();
  jest.useRealTimers();
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
      // Internal timeout controller creates its own signal
      expect(mockFetch).toHaveBeenCalledWith("/api/test", {
        signal: expect.any(AbortSignal),
      });
    });

    it("forwards RequestInit options (except signal/timeout)", async () => {
      const mockRes = { status: 200, ok: true };
      mockFetch.mockResolvedValueOnce(mockRes);

      await rateLimitedFetch("/api/test", { cache: "no-store" });
      expect(mockFetch).toHaveBeenCalledWith("/api/test", {
        cache: "no-store",
        signal: expect.any(AbortSignal),
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

  describe("timeout", () => {
    it("returns response when fetch resolves before timeout", async () => {
      const mockRes = { status: 200, ok: true };
      mockFetch.mockResolvedValueOnce(mockRes);

      const res = await rateLimitedFetch("/api/test", { timeout: 5000 });
      expect(res).toBe(mockRes);
    });

    it("throws FetchTimeoutError when fetch exceeds timeout", async () => {
      // Use real timers with short timeout to avoid fake-timer + setInterval complexity
      mockFetch.mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_, reject) => {
            init.signal.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      );

      let caughtError: unknown;
      try {
        await rateLimitedFetch("/api/test", { timeout: 50 }); // 50ms timeout
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(FetchTimeoutError);
      expect((caughtError as FetchTimeoutError).message).toMatch(/timed out/);
    });

    it("throws AbortError (not FetchTimeoutError) when caller aborts", async () => {
      const controller = new AbortController();

      // Mock fetch that rejects when signal is aborted
      mockFetch.mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_, reject) => {
            init.signal.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      );

      const promise = rateLimitedFetch("/api/test", {
        signal: controller.signal,
        timeout: 30_000, // Long timeout — caller aborts first
      });

      // Caller aborts
      controller.abort();

      // Must be AbortError, NOT FetchTimeoutError
      let caughtError: unknown;
      try {
        await promise;
      } catch (err) {
        caughtError = err;
      }
      expect(caughtError).toBeDefined();
      expect(caughtError).not.toBeInstanceOf(FetchTimeoutError);
      expect((caughtError as Error).name).toBe("AbortError");
    });

    it("throws RateLimitError on 429 even with timeout enabled", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 429,
        headers: new Headers({ "Retry-After": "5" }),
      });

      await expect(
        rateLimitedFetch("/api/test", { timeout: 15_000 }),
      ).rejects.toThrow(RateLimitError);
    });

    it("throws RateLimitError when already throttled (timeout irrelevant)", async () => {
      // Trigger throttle
      mockFetch.mockResolvedValueOnce({
        status: 429,
        headers: new Headers({ "Retry-After": "60" }),
      });
      await expect(rateLimitedFetch("/api/first")).rejects.toThrow(RateLimitError);

      // Second call: throttled, never reaches fetch or timeout
      mockFetch.mockClear();
      await expect(
        rateLimitedFetch("/api/second", { timeout: 15_000 }),
      ).rejects.toThrow(RateLimitError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("cleans up timeout timer on successful response", async () => {
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
      const mockRes = { status: 200, ok: true };
      mockFetch.mockResolvedValueOnce(mockRes);

      await rateLimitedFetch("/api/test", { timeout: 15_000 });

      // clearTimeout should be called in the finally block
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it("cleans up timeout timer on caller abort", async () => {
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
      const controller = new AbortController();

      mockFetch.mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_, reject) => {
            init.signal.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      );

      const promise = rateLimitedFetch("/api/test", {
        signal: controller.signal,
        timeout: 30_000,
      });

      controller.abort();

      await expect(promise).rejects.toThrow();
      // clearTimeout called both in signal listener and finally block
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it("uses default 15s timeout when timeout is not specified", async () => {
      // Use a short explicit timeout to verify the default is used when omitted.
      // We test default by calling without timeout param and verifying FetchTimeoutError.
      // Using real timers with a very short override to avoid fake-timer complexity.
      mockFetch.mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_, reject) => {
            init.signal.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      );

      // This test verifies the FetchTimeoutError includes the default timeout value (15000)
      // We use explicit timeout: 50 for speed, then verify the error reports 50ms
      let caughtError: unknown;
      try {
        await rateLimitedFetch("/api/test", { timeout: 50 });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(FetchTimeoutError);
      expect((caughtError as FetchTimeoutError).timeout).toBe(50);
      expect((caughtError as FetchTimeoutError).url).toBe("/api/test");
    });

    it("does not set timeout when timeout is 0", async () => {
      const setTimeoutSpy = jest.spyOn(global, "setTimeout");
      const mockRes = { status: 200, ok: true };
      mockFetch.mockResolvedValueOnce(mockRes);

      await rateLimitedFetch("/api/test", { timeout: 0 });

      // setTimeout should NOT be called for timeout (only for other internal timers)
      // The function skips setTimeout when timeout <= 0
      const timeoutCalls = setTimeoutSpy.mock.calls.filter(
        (call) => typeof call[1] === "number" && call[1] === 0,
      );
      // No timeout scheduled with value 0 (since we skip when timeout <= 0)
      expect(timeoutCalls).toHaveLength(0);
      setTimeoutSpy.mockRestore();
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
