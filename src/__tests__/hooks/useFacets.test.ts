/**
 * Tests for useFacets hook
 *
 * Coverage:
 * 1.  Returns null facets initially (before any fetch)
 * 2.  Fetches facets when drawer opens (isDrawerOpen=true)
 * 3.  Returns fetched data after successful response
 * 4.  Cache hit on same filters — no refetch
 * 5.  Price change does NOT cause refetch (price excluded from cache key)
 * 6.  Non-price filter change triggers refetch
 * 7.  400 + boundsRequired → returns EMPTY_FACETS gracefully
 * 8.  500 error → returns EMPTY_FACETS (no throw)
 * 9.  Aborts previous request when a new fetch is triggered
 * 10. Drawer closed → does not fetch
 * 11. Debounce: fetch fires after 300 ms, not before
 * 12. Cleanup aborts in-flight request on unmount
 * 13. isLoading set to true while debounce is pending
 * 14. isLoading cleared to false after successful fetch
 * 15. Non-200 (e.g. 403) → returns EMPTY_FACETS gracefully
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useSearchParams } from "next/navigation";

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(),
}));

// Mock rate-limit-client so we control fetch at that layer.
// rateLimitedFetch is the wrapper the hook uses; we forward calls to global.fetch.
jest.mock("@/lib/rate-limit-client", () => ({
  rateLimitedFetch: jest.fn(
    (url: string, init?: RequestInit): Promise<Response> =>
      global.fetch(url, init)
  ),
  RateLimitError: class RateLimitError extends Error {
    retryAfterMs: number;
    constructor(ms: number) {
      super(`Rate limited`);
      this.name = "RateLimitError";
      this.retryAfterMs = ms;
    }
  },
}));

// Save and restore global.fetch
const originalFetch = global.fetch;
const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch;
});
afterAll(() => {
  global.fetch = originalFetch;
});

// ── Helpers ────────────────────────────────────────────────────────────────

const EMPTY_FACETS = {
  amenities: {},
  houseRules: {},
  roomTypes: {},
  priceRanges: { min: null, max: null, median: null },
  priceHistogram: null,
};

const SAMPLE_FACETS = {
  amenities: { Wifi: 10, Parking: 5 },
  houseRules: { "Pets allowed": 3 },
  roomTypes: { "Private Room": 20 },
  priceRanges: { min: 500, max: 2000, median: 1200 },
  priceHistogram: null,
};

/** Default pending filter state (all empty). */
const defaultPending = {
  minPrice: "",
  maxPrice: "",
  roomType: "",
  leaseDuration: "",
  moveInDate: "",
  endDate: "",
  amenities: [] as string[],
  houseRules: [] as string[],
  languages: [] as string[],
  genderPreference: "",
  householdGender: "",
  minSlots: "",
};

function makeSearchParams(
  overrides: Record<string, string> = {}
): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(overrides)) {
    p.set(k, v);
  }
  return p;
}

function mockOkResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(data),
  } as unknown as Response;
}

function mockErrorResponse(status: number, body?: unknown) {
  return {
    ok: false,
    status,
    json: jest.fn().mockResolvedValue(body ?? {}),
  } as unknown as Response;
}

// ── Test suite ─────────────────────────────────────────────────────────────

// Import inside describe so mocks are set up first.
// We use a dynamic import-style workaround: import after jest.mock declarations.
import { useFacets } from "@/hooks/useFacets";
// NOTE: The module-level facetsCache is shared across all tests.
// We reset it by clearing after each test via the cache's own clear() — but
// useFacets doesn't export the cache. Instead we isolate via unique cache keys
// (by varying searchParams or pending per test).

describe("useFacets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSearchParams as jest.Mock).mockReturnValue(makeSearchParams());
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // ── 1. Initial state ────────────────────────────────────────────────────

  it("1. returns null facets initially when drawer is closed", () => {
    const { result } = renderHook(() =>
      useFacets({ pending: defaultPending, isDrawerOpen: false })
    );

    expect(result.current.facets).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── 2. Drawer closed → no fetch ─────────────────────────────────────────

  it("2. does not fetch when drawer is closed, even after debounce elapses", () => {
    renderHook(() =>
      useFacets({ pending: defaultPending, isDrawerOpen: false })
    );

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── 3. Successful fetch returns data ────────────────────────────────────

  it("3. returns fetched facets after successful response when drawer opens", async () => {
    // Use unique searchParams so this test gets its own cache key
    (useSearchParams as jest.Mock).mockReturnValue(
      makeSearchParams({ lat: "37.1", lng: "-122.1" })
    );
    mockFetch.mockResolvedValueOnce(mockOkResponse(SAMPLE_FACETS));

    const { result } = renderHook(() =>
      useFacets({ pending: defaultPending, isDrawerOpen: true })
    );

    // After rendering, isLoading should be true while the debounce is running
    expect(result.current.isLoading).toBe(true);

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.facets).toEqual(SAMPLE_FACETS);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("3b. includes moveInDate and endDate in the facets request when a valid range is selected", async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      makeSearchParams({ lat: "37.15", lng: "-122.15" })
    );
    mockFetch.mockResolvedValueOnce(mockOkResponse(SAMPLE_FACETS));

    renderHook(() =>
      useFacets({
        pending: {
          ...defaultPending,
          moveInDate: "2026-05-01",
          endDate: "2026-06-01",
        },
        isDrawerOpen: true,
      })
    );

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    expect(mockFetch.mock.calls[0]?.[0]).toContain("moveInDate=2026-05-01");
    expect(mockFetch.mock.calls[0]?.[0]).toContain("endDate=2026-06-01");
  });

  // ── 4. Cache hit — no refetch ───────────────────────────────────────────

  it("4. does not refetch on re-render when cache key is unchanged", async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      makeSearchParams({ lat: "37.2", lng: "-122.2" })
    );
    mockFetch.mockResolvedValueOnce(mockOkResponse(SAMPLE_FACETS));

    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useFacets({ pending: defaultPending, isDrawerOpen: open }),
      { initialProps: { open: true } }
    );

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.facets).toEqual(SAMPLE_FACETS);
    });

    // Simulate close + reopen (same filters → cache hit)
    rerender({ open: false });
    rerender({ open: true });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    // Still only one fetch — cache was hit on the second open
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.facets).toEqual(SAMPLE_FACETS);
  });

  // ── 5. Price change does NOT refetch ────────────────────────────────────

  it("5. price change triggers refetch to update non-price facet counts (#19)", async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      makeSearchParams({ lat: "37.3", lng: "-122.3" })
    );
    const updatedFacets = {
      ...SAMPLE_FACETS,
      roomTypes: { "Private Room": 5 },
    };
    mockFetch
      .mockResolvedValueOnce(mockOkResponse(SAMPLE_FACETS))
      .mockResolvedValueOnce(mockOkResponse(updatedFacets));

    const { result, rerender } = renderHook(
      ({ pending }: { pending: typeof defaultPending }) =>
        useFacets({ pending, isDrawerOpen: true }),
      { initialProps: { pending: { ...defaultPending } } }
    );

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.facets).toEqual(SAMPLE_FACETS);
    });

    // Change price — cache key now includes price, so refetch triggers
    rerender({
      pending: { ...defaultPending, minPrice: "500", maxPrice: "1500" },
    });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    // Second fetch with updated price range
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ── 6. Non-price filter change triggers refetch ─────────────────────────

  it("6. non-price filter change (roomType) invalidates cache and triggers refetch", async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      makeSearchParams({ lat: "37.4", lng: "-122.4" })
    );
    const updatedFacets = {
      ...SAMPLE_FACETS,
      roomTypes: { "Entire place": 8 },
    };
    mockFetch
      .mockResolvedValueOnce(mockOkResponse(SAMPLE_FACETS))
      .mockResolvedValueOnce(mockOkResponse(updatedFacets));

    const { result, rerender } = renderHook(
      ({ pending }: { pending: typeof defaultPending }) =>
        useFacets({ pending, isDrawerOpen: true }),
      { initialProps: { pending: defaultPending } }
    );

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.facets).toEqual(SAMPLE_FACETS);
    });

    // Change a non-price filter
    rerender({ pending: { ...defaultPending, roomType: "Private Room" } });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.facets).toEqual(updatedFacets);
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // ── 7. 200 + boundsRequired → EMPTY_FACETS + boundsRequired flag ────────

  it("7. 200 + boundsRequired:true returns empty facets and sets boundsRequired flag (P1-5)", async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      makeSearchParams({ lat: "37.5", lng: "-122.5" })
    );
    mockFetch.mockResolvedValueOnce(
      mockOkResponse({ ...EMPTY_FACETS, boundsRequired: true })
    );

    const { result } = renderHook(() =>
      useFacets({ pending: defaultPending, isDrawerOpen: true })
    );

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.facets).toEqual(
        expect.objectContaining(EMPTY_FACETS)
      );
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.boundsRequired).toBe(true);
  });

  // ── 8. 500 error → EMPTY_FACETS, no throw ──────────────────────────────

  it("8. 500 server error returns EMPTY_FACETS and does not set error state", async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      makeSearchParams({ lat: "37.6", lng: "-122.6" })
    );
    mockFetch.mockResolvedValueOnce(mockErrorResponse(500));

    const { result } = renderHook(() =>
      useFacets({ pending: defaultPending, isDrawerOpen: true })
    );

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.facets).toEqual(EMPTY_FACETS);
    expect(result.current.error).toBeNull();
  });

  // ── 9. Aborts previous request on new fetch ─────────────────────────────

  it("9. aborts the in-flight request when filters change before debounce fires", async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      makeSearchParams({ lat: "37.7", lng: "-122.7" })
    );

    // Track abort signals
    const abortedSignals: boolean[] = [];
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((resolve) => {
        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            abortedSignals.push(true);
          });
        }
        // This promise intentionally never resolves on its own (simulating a slow fetch)
        // The abort listener above records that it was aborted
      });
    });

    // Also prepare a normal response for the second fetch
    const secondFetch = mockOkResponse(SAMPLE_FACETS);
    mockFetch
      .mockImplementationOnce((_url: string, init?: RequestInit) => {
        return new Promise((resolve) => {
          if (init?.signal) {
            init.signal.addEventListener("abort", () => {
              abortedSignals.push(true);
              resolve(new Response(null, { status: 499 })); // signal already aborted
            });
          }
        });
      })
      .mockResolvedValueOnce(secondFetch);

    const { rerender } = renderHook(
      ({ pending }: { pending: typeof defaultPending }) =>
        useFacets({ pending, isDrawerOpen: true }),
      { initialProps: { pending: defaultPending } }
    );

    // First debounce fires and starts a fetch
    act(() => {
      jest.advanceTimersByTime(350);
    });

    // Before it resolves, change a filter (triggers new debounce + abort of first)
    rerender({ pending: { ...defaultPending, roomType: "Private Room" } });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(abortedSignals.length).toBeGreaterThan(0);
    });
  });

  // ── 10. Debounce: no fetch before 300ms ─────────────────────────────────

  it("10. does not fetch before the 300ms debounce window elapses", () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      makeSearchParams({ lat: "37.8", lng: "-122.8" })
    );
    mockFetch.mockResolvedValueOnce(mockOkResponse(SAMPLE_FACETS));

    renderHook(() =>
      useFacets({ pending: defaultPending, isDrawerOpen: true })
    );

    // Advance only 200ms — well before the 300ms debounce
    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── 11. Debounce fires at 300ms+ ─────────────────────────────────────────

  it("11. fetch fires after 300ms debounce elapses", async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      makeSearchParams({ lat: "37.9", lng: "-122.9" })
    );
    mockFetch.mockResolvedValueOnce(mockOkResponse(SAMPLE_FACETS));

    const { result } = renderHook(() =>
      useFacets({ pending: defaultPending, isDrawerOpen: true })
    );

    // Fire the debounce timer
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.facets).toEqual(SAMPLE_FACETS);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // ── 12. Cleanup aborts on unmount ────────────────────────────────────────

  it("12. unmounting during a pending fetch aborts the in-flight request", async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      makeSearchParams({ lat: "38.0", lng: "-123.0" })
    );

    let capturedSignal: AbortSignal | undefined;
    mockFetch.mockImplementationOnce((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      // Never resolves — simulates a slow request
      return new Promise(() => {});
    });

    const { unmount } = renderHook(() =>
      useFacets({ pending: defaultPending, isDrawerOpen: true })
    );

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    expect(capturedSignal?.aborted).toBe(false);

    // Unmount — cleanup effect should abort
    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  // ── 13. isLoading true while debounce pending ────────────────────────────

  it("13. sets isLoading to true immediately when drawer opens (before debounce fires)", () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      makeSearchParams({ lat: "38.1", lng: "-123.1" })
    );
    mockFetch.mockResolvedValueOnce(mockOkResponse(SAMPLE_FACETS));

    const { result } = renderHook(() =>
      useFacets({ pending: defaultPending, isDrawerOpen: true })
    );

    // Debounce has not fired yet — but hook sets isLoading optimistically
    expect(result.current.isLoading).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── 14. isLoading false after successful fetch ───────────────────────────

  it("14. clears isLoading after successful fetch completes", async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      makeSearchParams({ lat: "38.2", lng: "-123.2" })
    );
    mockFetch.mockResolvedValueOnce(mockOkResponse(SAMPLE_FACETS));

    const { result } = renderHook(() =>
      useFacets({ pending: defaultPending, isDrawerOpen: true })
    );

    expect(result.current.isLoading).toBe(true);

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.facets).toEqual(SAMPLE_FACETS);
  });

  // ── 15. Unexpected non-200 (403) → EMPTY_FACETS ─────────────────────────

  it("15. unexpected 403 response returns EMPTY_FACETS gracefully", async () => {
    (useSearchParams as jest.Mock).mockReturnValue(
      makeSearchParams({ lat: "38.3", lng: "-123.3" })
    );
    mockFetch.mockResolvedValueOnce(mockErrorResponse(403));

    const { result } = renderHook(() =>
      useFacets({ pending: defaultPending, isDrawerOpen: true })
    );

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.facets).toEqual(EMPTY_FACETS);
    expect(result.current.error).toBeNull();
  });
});
