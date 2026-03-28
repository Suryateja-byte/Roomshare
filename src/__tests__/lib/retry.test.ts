/**
 * Tests for withRetry utility
 * Validates transient-error detection, backoff timing, and retry limits.
 */

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    },
  },
}));

import { withRetry } from "@/lib/retry";

describe("withRetry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns the result when the function succeeds on the first try", async () => {
    const fn = jest.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a transient error and succeeds on the second attempt", async () => {
    const transientError = Object.assign(new Error("connection reset"), {
      code: "ECONNRESET",
    });
    const fn = jest
      .fn()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce("recovered");

    const resultPromise = withRetry(fn, { baseDelayMs: 100 });
    // Drain the first backoff delay (100ms * 2^0 = 100ms)
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient error and throws immediately", async () => {
    const nonTransient = new Error("validation failed");
    const fn = jest.fn().mockRejectedValue(nonTransient);

    await expect(withRetry(fn)).rejects.toThrow("validation failed");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting all retries on a persistent transient error", async () => {
    const transientError = Object.assign(new Error("connection timed out"), {
      code: "ETIMEDOUT",
    });
    const fn = jest.fn().mockRejectedValue(transientError);

    // Use real timers so the async await-based retry loop runs to completion
    jest.useRealTimers();
    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })
    ).rejects.toThrow("connection timed out");
    expect(fn).toHaveBeenCalledTimes(3);
    jest.useFakeTimers();
  });

  it("uses exponential backoff between retries", async () => {
    const transientError = Object.assign(new Error("reset"), {
      code: "ECONNRESET",
    });
    const fn = jest
      .fn()
      .mockRejectedValueOnce(transientError)
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce("done");

    const setTimeoutSpy = jest.spyOn(global, "setTimeout");

    const resultPromise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 500 });
    await jest.runAllTimersAsync();
    await resultPromise;

    // Attempt 1 fails → delay = 500 * 2^0 + jitter(0..500) = 500..1000ms
    // Attempt 2 fails → delay = 500 * 2^1 + jitter(0..500) = 1000..1500ms
    // INFRA-016: jitter makes delays non-deterministic, so check ranges
    const delays = setTimeoutSpy.mock.calls
      .filter(
        (call) =>
          typeof call[1] === "number" && call[1] >= 500 && call[1] <= 1500
      )
      .map((call) => call[1] as number);

    expect(delays.length).toBe(2);
    expect(delays[0]).toBeGreaterThanOrEqual(500);
    expect(delays[0]).toBeLessThan(1000);
    expect(delays[1]).toBeGreaterThanOrEqual(1000);
    expect(delays[1]).toBeLessThan(1500);

    setTimeoutSpy.mockRestore();
  });

  it("classifies P2024 (Prisma connection timeout) as a transient error", async () => {
    const p2024 = Object.assign(new Error("Timed out fetching connection"), {
      code: "P2024",
    });
    const fn = jest
      .fn()
      .mockRejectedValueOnce(p2024)
      .mockResolvedValueOnce("success");

    const resultPromise = withRetry(fn, { baseDelayMs: 100 });
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("classifies ECONNRESET as a transient error", async () => {
    const err = Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" });
    const fn = jest
      .fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce("recovered");

    const resultPromise = withRetry(fn, { baseDelayMs: 100 });
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("respects a custom maxAttempts option", async () => {
    const transientError = Object.assign(new Error("pipe broken"), {
      code: "EPIPE",
    });
    const fn = jest.fn().mockRejectedValue(transientError);

    jest.useRealTimers();
    await expect(
      withRetry(fn, { maxAttempts: 5, baseDelayMs: 1 })
    ).rejects.toThrow("pipe broken");
    expect(fn).toHaveBeenCalledTimes(5);
    jest.useFakeTimers();
  });
});
