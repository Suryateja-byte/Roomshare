/**
 * Tests for useFilterImpactCount hook
 *
 * Verifies lazy-loaded filter removal impact counting:
 * - Null delta until hover
 * - Fetch triggered only on hover with debounce
 * - Formatted delta string (+N) when removal increases count
 * - Cache prevents repeat fetches for same key
 * - Chip ID change resets state
 * - Offline / abort / error handling
 *
 * Cache isolation strategy: each test uses a unique chip.id so that
 * removeFilterFromUrl returns a unique query string, producing a unique
 * cache key (impact:<unique-query>). This prevents inter-test cache hits
 * without needing to export a cache-clear function from the module.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useFilterImpactCount } from "@/hooks/useFilterImpactCount";
import type { FilterChipData } from "@/components/filters/filter-chip-utils";

// Mock the rate-limit-client module so we control fetch directly
jest.mock("@/lib/rate-limit-client", () => ({
  rateLimitedFetch: jest.fn(),
  RateLimitError: class RateLimitError extends Error {
    retryAfterMs: number;
    constructor(retryAfterMs: number) {
      super(`Rate limited`);
      this.name = "RateLimitError";
      this.retryAfterMs = retryAfterMs;
    }
  },
}));

// Mock filter-chip-utils to control removeFilterFromUrl.
// Returns a unique query string per chip.id to isolate cache keys across tests.
jest.mock("@/components/filters/filter-chip-utils", () => ({
  removeFilterFromUrl: jest.fn(
    (_params: URLSearchParams, chip: { id: string }) => `filter=${chip.id}`
  ),
}));

import { rateLimitedFetch } from "@/lib/rate-limit-client";
const mockRateLimitedFetch = rateLimitedFetch as jest.MockedFunction<
  typeof rateLimitedFetch
>;

// Debounce delay matches source constant
const DEBOUNCE_MS = 200;

// Monotonically increasing counter for unique chip IDs
let chipCounter = 0;

/**
 * Build a FilterChipData with a globally unique id.
 * The suffix ensures a unique cache key (impact:filter=<id>) per test.
 */
function makeChip(label: string): FilterChipData {
  const id = `${label}-${++chipCounter}`;
  return { id, label, paramKey: label };
}

// Helper to build a mock Response
function mockResponse(data: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => data,
  } as Response;
}

describe("useFilterImpactCount", () => {
  let searchParams: URLSearchParams;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    searchParams = new URLSearchParams("amenities=wifi");
    // Default: online
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Test 1: Returns null delta initially (no hover) ───────────────────────

  it("returns null impactDelta and formattedDelta before any hover", () => {
    const chip = makeChip("wifi");

    const { result } = renderHook(() =>
      useFilterImpactCount({
        searchParams,
        chip,
        isHovering: false,
        currentCount: 45,
      })
    );

    expect(result.current.impactDelta).toBeNull();
    expect(result.current.formattedDelta).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // ── Test 2: Fetches on hover (isHovering=true) ────────────────────────────

  it("triggers fetch after debounce when isHovering becomes true", async () => {
    const chip = makeChip("wifi");
    mockRateLimitedFetch.mockResolvedValueOnce(mockResponse({ count: 67 }));

    const { result } = renderHook(() =>
      useFilterImpactCount({
        searchParams,
        chip,
        isHovering: true,
        currentCount: 45,
      })
    );

    // Before debounce fires — no fetch yet
    expect(mockRateLimitedFetch).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockRateLimitedFetch).toHaveBeenCalledTimes(1);
  });

  // ── Test 3: Returns formatted delta "+22" when removal increases count ────

  it('returns formatted delta "+22" when removing filter increases count', async () => {
    const chip = makeChip("wifi");
    // Without the filter there are 67 results; current is 45 → delta = +22
    mockRateLimitedFetch.mockResolvedValueOnce(mockResponse({ count: 67 }));

    const { result } = renderHook(() =>
      useFilterImpactCount({
        searchParams,
        chip,
        isHovering: true,
        currentCount: 45,
      })
    );

    act(() => {
      jest.advanceTimersByTime(DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(result.current.formattedDelta).toBe("+22");
    });

    expect(result.current.impactDelta).toBe(22);
  });

  // ── Test 4: Delta = 0 → returns null formattedDelta ───────────────────────

  it("returns null formattedDelta when delta is zero (no change)", async () => {
    const chip = makeChip("wifi");
    // Count without filter equals current count → delta = 0
    mockRateLimitedFetch.mockResolvedValueOnce(mockResponse({ count: 45 }));

    const { result } = renderHook(() =>
      useFilterImpactCount({
        searchParams,
        chip,
        isHovering: true,
        currentCount: 45,
      })
    );

    act(() => {
      jest.advanceTimersByTime(DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.impactDelta).toBe(0);
    expect(result.current.formattedDelta).toBeNull();
  });

  // ── Test 5: Cache hit on second hover prevents re-fetch ───────────────────

  it("uses cache on second hover instead of re-fetching", async () => {
    const chip = makeChip("wifi");
    // Count = 70, current = 45 → delta = +25
    mockRateLimitedFetch.mockResolvedValueOnce(mockResponse({ count: 70 }));

    const { result, rerender } = renderHook(
      (props) => useFilterImpactCount(props),
      {
        initialProps: {
          searchParams,
          chip,
          isHovering: true,
          currentCount: 45,
        },
      }
    );

    // First hover — fetch fires
    act(() => {
      jest.advanceTimersByTime(DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(result.current.formattedDelta).toBe("+25");
    });

    expect(mockRateLimitedFetch).toHaveBeenCalledTimes(1);

    // Simulate mouse-out then re-hover on the same chip.
    // The hook guards with hasFetched, so no second fetch should occur.
    rerender({ searchParams, chip, isHovering: false, currentCount: 45 });
    rerender({ searchParams, chip, isHovering: true, currentCount: 45 });

    act(() => {
      jest.advanceTimersByTime(DEBOUNCE_MS);
    });

    // No additional fetch — hasFetched prevents re-fetch within same hook instance
    expect(mockRateLimitedFetch).toHaveBeenCalledTimes(1);
    expect(result.current.formattedDelta).toBe("+25");
  });

  // ── Test 6: No fetch when isHovering=false ────────────────────────────────

  it("never fetches when isHovering stays false", () => {
    const chip = makeChip("wifi");

    renderHook(() =>
      useFilterImpactCount({
        searchParams,
        chip,
        isHovering: false,
        currentCount: 45,
      })
    );

    act(() => {
      jest.advanceTimersByTime(DEBOUNCE_MS * 10);
    });

    expect(mockRateLimitedFetch).not.toHaveBeenCalled();
  });

  // ── Test 7: Chip ID change resets state ───────────────────────────────────

  it("resets impactDelta and formattedDelta when chip.id changes", async () => {
    const chip1 = makeChip("wifi");
    const chip2 = makeChip("parking");

    // chip1: count=80, current=45 → delta=+35
    mockRateLimitedFetch.mockResolvedValueOnce(mockResponse({ count: 80 }));

    const { result, rerender } = renderHook(
      (props) => useFilterImpactCount(props),
      {
        initialProps: {
          searchParams,
          chip: chip1,
          isHovering: true,
          currentCount: 45,
        },
      }
    );

    act(() => {
      jest.advanceTimersByTime(DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(result.current.impactDelta).toBe(35);
    });

    // Switch to a different chip — should reset state immediately
    rerender({
      searchParams,
      chip: chip2,
      isHovering: false,
      currentCount: 45,
    });

    expect(result.current.impactDelta).toBeNull();
    expect(result.current.formattedDelta).toBeNull();
  });

  // ── Test 8: Both counts null → delta null ─────────────────────────────────

  it("returns null impactDelta when API count is null and currentCount is null (100+ cap)", async () => {
    const chip = makeChip("wifi");
    // API returns null meaning 100+; currentCount also null → no meaningful delta
    mockRateLimitedFetch.mockResolvedValueOnce(mockResponse({ count: null }));

    const { result } = renderHook(() =>
      useFilterImpactCount({
        searchParams,
        chip,
        isHovering: true,
        currentCount: null,
      })
    );

    act(() => {
      jest.advanceTimersByTime(DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.impactDelta).toBeNull();
    expect(result.current.formattedDelta).toBeNull();
  });

  // ── Test 9: Debounce — rapid hover changes collapse to a single fetch ─────

  it("debounces hover — rapid isHovering resets within window yield one fetch", async () => {
    const chip = makeChip("wifi");
    mockRateLimitedFetch.mockResolvedValueOnce(mockResponse({ count: 60 }));

    // Start with isHovering=true; the debounce window starts immediately
    const { result, rerender } = renderHook(
      (props) => useFilterImpactCount(props),
      {
        initialProps: {
          searchParams,
          chip,
          isHovering: true,
          currentCount: 45,
        },
      }
    );

    // Advance 50 ms — within the debounce window, no fetch yet
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(mockRateLimitedFetch).not.toHaveBeenCalled();

    // Toggle off then back on — debounce resets
    rerender({ searchParams, chip, isHovering: false, currentCount: 45 });
    rerender({ searchParams, chip, isHovering: true, currentCount: 45 });

    // Another 50 ms — still within new debounce window
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(mockRateLimitedFetch).not.toHaveBeenCalled();

    // Advance past full debounce window — exactly one fetch should fire
    act(() => {
      jest.advanceTimersByTime(DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockRateLimitedFetch).toHaveBeenCalledTimes(1);
  });

  // ── Test 10: Abort — in-flight request state ignored when chip changes ────

  it("ignores in-flight fetch result when chip ID changes mid-request", async () => {
    const chip1 = makeChip("wifi");
    const chip2 = makeChip("gym");

    // First fetch never settles synchronously — we control resolution
    let resolveFirst!: (value: Response) => void;
    const slowFetch = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    mockRateLimitedFetch.mockReturnValueOnce(slowFetch);

    const { result, rerender } = renderHook(
      (props) => useFilterImpactCount(props),
      {
        initialProps: {
          searchParams,
          chip: chip1,
          isHovering: true,
          currentCount: 45,
        },
      }
    );

    // Trigger the debounce — fetch starts for chip1
    act(() => {
      jest.advanceTimersByTime(DEBOUNCE_MS);
    });

    // Change chip before first fetch resolves — state resets
    rerender({
      searchParams,
      chip: chip2,
      isHovering: false,
      currentCount: 45,
    });

    // Resolve the first fetch for chip1 — should be ignored (aborted)
    act(() => {
      resolveFirst(mockResponse({ count: 99 }));
    });

    // Delta remains null because chip1's result is discarded
    expect(result.current.impactDelta).toBeNull();
  });

  // ── Test 11: Offline — no fetch when navigator.onLine=false ───────────────

  it("skips fetch when navigator is offline", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    });

    const chip = makeChip("wifi");

    renderHook(() =>
      useFilterImpactCount({
        searchParams,
        chip,
        isHovering: true,
        currentCount: 45,
      })
    );

    act(() => {
      jest.advanceTimersByTime(DEBOUNCE_MS);
    });

    // No fetch should have been made while offline
    expect(mockRateLimitedFetch).not.toHaveBeenCalled();
  });

  // ── Test 12: Error handling — sets error state on non-ok response ─────────

  it("sets error state when API returns non-ok response", async () => {
    const chip = makeChip("wifi");
    mockRateLimitedFetch.mockResolvedValueOnce(mockResponse(null, false));

    const { result } = renderHook(() =>
      useFilterImpactCount({
        searchParams,
        chip,
        isHovering: true,
        currentCount: 45,
      })
    );

    act(() => {
      jest.advanceTimersByTime(DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error?.message).toMatch(/Count request failed/);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.impactDelta).toBeNull();
  });

  // ── Test 13: RateLimitError — silently finishes (no error state) ──────────

  it("handles RateLimitError silently — no error state set", async () => {
    const chip = makeChip("wifi");

    const { RateLimitError } = jest.requireMock("@/lib/rate-limit-client");
    mockRateLimitedFetch.mockRejectedValueOnce(new RateLimitError(60_000));

    const { result } = renderHook(() =>
      useFilterImpactCount({
        searchParams,
        chip,
        isHovering: true,
        currentCount: 45,
      })
    );

    act(() => {
      jest.advanceTimersByTime(DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // RateLimitError should not populate the error state
    expect(result.current.error).toBeNull();
    expect(result.current.impactDelta).toBeNull();
  });

  // ── Test 14: Negative delta — formattedDelta remains null ─────────────────

  it("returns null formattedDelta when removing filter decreases count (negative delta)", async () => {
    const chip = makeChip("wifi");
    // Removing the filter shows 30 but current is 45 → delta = -15
    mockRateLimitedFetch.mockResolvedValueOnce(mockResponse({ count: 30 }));

    const { result } = renderHook(() =>
      useFilterImpactCount({
        searchParams,
        chip,
        isHovering: true,
        currentCount: 45,
      })
    );

    act(() => {
      jest.advanceTimersByTime(DEBOUNCE_MS);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Delta is -15, which is not > 0, so formattedDelta should be null
    expect(result.current.impactDelta).toBe(-15);
    expect(result.current.formattedDelta).toBeNull();
  });
});
