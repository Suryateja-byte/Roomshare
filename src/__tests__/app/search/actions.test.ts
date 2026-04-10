/**
 * Tests for fetchMoreListings server action timeout protection.
 * Verifies that executeSearchV2 is wrapped with withTimeout and
 * that a timeout gracefully falls back to V1 (empty result).
 */

// Mock next/headers before imports
jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue(new Headers()),
}));

// Mock rate limiting — always allow
jest.mock("@/lib/with-rate-limit", () => ({
  checkServerComponentRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));

// Mock env — enable V2
jest.mock("@/lib/env", () => ({
  features: { searchV2: true },
}));

// Mock search-params helpers
jest.mock("@/lib/search-params", () => ({
  parseSearchParams: jest.fn((raw: { q?: string }) => ({
    q: raw.q,
    locationLabel: undefined,
    what: undefined,
    requestedPage: 1,
    sortOption: "recommended",
    boundsRequired: false,
    browseMode: false,
    filterParams: {
      query: raw.q,
      vibeQuery: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      amenities: undefined,
      moveInDate: undefined,
      leaseDuration: undefined,
      houseRules: undefined,
      languages: undefined,
      roomType: undefined,
      genderPreference: undefined,
      householdGender: undefined,
      bookingMode: undefined,
      minAvailableSlots: undefined,
      nearMatches: undefined,
      bounds: undefined,
      sort: "recommended",
    },
  })),
  buildRawParamsFromSearchParams: jest.fn().mockReturnValue({ q: "test" }),
}));

// Mock V2 search service
const mockExecuteSearchV2 = jest.fn();
jest.mock("@/lib/search/search-v2-service", () => ({
  executeSearchV2: (...args: unknown[]) => mockExecuteSearchV2(...args),
}));

// Mock V1 fallback (not used when V2 is enabled, but required for import)
jest.mock("@/lib/data", () => ({
  getListingsPaginated: jest.fn(),
}));

// Mock timeout-wrapper — pass through by default, controllable per test
const mockWithTimeout = jest.fn();
jest.mock("@/lib/timeout-wrapper", () => {
  const actual = jest.requireActual("@/lib/timeout-wrapper");
  return {
    ...actual,
    withTimeout: (...args: unknown[]) => mockWithTimeout(...args),
  };
});

import { fetchMoreListings } from "@/app/search/actions";
import { TimeoutError, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";

describe("fetchMoreListings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: withTimeout passes through the promise
    mockWithTimeout.mockImplementation((promise: Promise<unknown>) => promise);
  });

  it("wraps executeSearchV2 with withTimeout using DATABASE timeout", async () => {
    const v2Data = {
      response: { list: { nextCursor: "cursor-2" } },
      paginatedResult: {
        items: [{ id: "1" }],
        nextCursor: "cursor-2",
        hasNextPage: true,
      },
    };
    mockExecuteSearchV2.mockResolvedValue(v2Data);

    const result = await fetchMoreListings("cursor-1", { q: "test" });

    // withTimeout was called with the promise, DATABASE timeout, and label
    expect(mockWithTimeout).toHaveBeenCalledTimes(1);
    expect(mockWithTimeout).toHaveBeenCalledWith(
      expect.any(Promise),
      DEFAULT_TIMEOUTS.DATABASE,
      "fetchMoreListings-executeSearchV2"
    );

    // Result passes through from V2
    expect(result).toEqual(
      expect.objectContaining({
        items: [{ id: "1" }],
        nextCursor: "cursor-2",
        hasNextPage: true,
      })
    );
    expect(result.meta).toBeTruthy();
  });

  it("falls back gracefully when V2 times out", async () => {
    // withTimeout rejects with TimeoutError
    mockWithTimeout.mockRejectedValue(
      new TimeoutError(
        "fetchMoreListings-executeSearchV2",
        DEFAULT_TIMEOUTS.DATABASE
      )
    );

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const result = await fetchMoreListings("cursor-1", { q: "test" });

    // Falls back to V1 empty result with degraded signal (cursor pagination not supported in V1)
    expect(result).toEqual(
      expect.objectContaining({
        items: [],
        nextCursor: null,
        hasNextPage: false,
        degraded: true,
      })
    );
    expect(result.meta).toBeTruthy();

    // Warning was logged for V2 failure (via logger.sync.warn: "[timestamp] [WARN]", message, metadata)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[WARN]"),
      expect.stringContaining("[fetchMoreListings] V2 failed"),
      expect.objectContaining({ error: expect.stringContaining("timed out") })
    );

    warnSpy.mockRestore();
  });

  it("returns V2 result when it succeeds within timeout", async () => {
    const v2Data = {
      response: { list: { nextCursor: "next" } },
      paginatedResult: {
        items: [{ id: "a" }, { id: "b" }],
        nextCursor: "next",
        hasNextPage: true,
      },
    };
    mockExecuteSearchV2.mockResolvedValue(v2Data);

    const result = await fetchMoreListings("c1", { q: "sf" });

    expect(result).toEqual(
      expect.objectContaining({
        items: [{ id: "a" }, { id: "b" }],
        nextCursor: "next",
        hasNextPage: true,
      })
    );
    expect(result.meta).toBeTruthy();
  });
});
