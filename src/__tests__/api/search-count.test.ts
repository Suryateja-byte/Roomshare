/**
 * Tests for GET /api/search-count route
 *
 * Covers: happy path counts, >100 count (null), boundsRequired,
 * browseMode, filters-only, bounds-only, rate limiting, error handling,
 * and Cache-Control headers.
 */

// --- Mocks (must come before imports) ---

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const headersMap = new Map(Object.entries(init?.headers || {}));
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: {
          get: (key: string) => headersMap.get(key) ?? null,
          entries: () => headersMap.entries(),
        },
      };
    },
  },
}));

jest.mock("@/lib/with-rate-limit-redis", () => ({
  withRateLimitRedis: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/request-context", () => ({
  createContextFromHeaders: jest.fn().mockReturnValue({ requestId: "test-id" }),
  runWithRequestContext: jest.fn((_ctx: unknown, fn: () => unknown) => fn()),
  getRequestId: jest.fn().mockReturnValue("test-req-id"),
}));

jest.mock("@/lib/search-params", () => ({
  buildRawParamsFromSearchParams: jest.fn().mockReturnValue({}),
  parseSearchParams: jest.fn().mockReturnValue({
    filterParams: {},
  }),
  hasActiveFilters: jest.fn().mockReturnValue(false),
}));

jest.mock("@/lib/data", () => ({
  getLimitedCount: jest.fn(),
}));

jest.mock("@/lib/flags/phase04", () => ({
  isPhase04ProjectionReadsEnabled: jest.fn().mockReturnValue(false),
}));

jest.mock("@/lib/search/projection-search", () => ({
  getProjectionSearchCount: jest.fn(),
}));

jest.mock("@/lib/public-cache/headers", () => ({
  buildPublicCacheHeaders: jest.fn().mockReturnValue({}),
}));

jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
  },
  sanitizeErrorMessage: jest.fn((err: unknown) =>
    err instanceof Error ? err.message : String(err)
  ),
}));

// --- Imports (after mocks) ---

import { GET } from "@/app/api/search-count/route";
import { withRateLimitRedis } from "@/lib/with-rate-limit-redis";
import { parseSearchParams, hasActiveFilters } from "@/lib/search-params";
import { getLimitedCount } from "@/lib/data";
import { isPhase04ProjectionReadsEnabled } from "@/lib/flags/phase04";
import { getProjectionSearchCount } from "@/lib/search/projection-search";
import * as Sentry from "@sentry/nextjs";
import { NextRequest } from "next/server";

// --- Helpers ---

function createRequest(params: Record<string, string> = {}): NextRequest {
  const searchParams = new URLSearchParams(params);
  return {
    nextUrl: { searchParams },
    headers: new Headers(),
  } as unknown as NextRequest;
}

const mockParseSearchParams = parseSearchParams as jest.Mock;
const mockHasActiveFilters = hasActiveFilters as jest.Mock;
const mockGetLimitedCount = getLimitedCount as jest.Mock;
const mockWithRateLimitRedis = withRateLimitRedis as jest.Mock;
const mockIsPhase04ProjectionReadsEnabled =
  isPhase04ProjectionReadsEnabled as jest.Mock;
const mockGetProjectionSearchCount = getProjectionSearchCount as jest.Mock;

// --- Test suite ---

describe("GET /api/search-count", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: rate limit passes
    mockWithRateLimitRedis.mockResolvedValue(null);
    mockIsPhase04ProjectionReadsEnabled.mockReturnValue(false);
    mockGetProjectionSearchCount.mockResolvedValue({ ok: true, count: 0 });
    // Default: no active filters, no query, no bounds
    mockParseSearchParams.mockReturnValue({ filterParams: {} });
    mockHasActiveFilters.mockReturnValue(false);
  });

  // 1. Happy path: bounds + query → returns exact count ≤100
  it("returns count when bounds and query are both present", async () => {
    mockParseSearchParams.mockReturnValue({
      filterParams: {
        query: "downtown",
        bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.4 },
      },
    });
    mockGetLimitedCount.mockResolvedValue(42);

    const request = createRequest({
      q: "downtown",
      minLat: "37.7",
      maxLat: "37.8",
      minLng: "-122.5",
      maxLng: "-122.4",
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ count: 42 });
  });

  // 2. Count > 100 → getLimitedCount returns null (indicates "100+")
  it("returns count: null when getLimitedCount returns null (>100 results)", async () => {
    mockParseSearchParams.mockReturnValue({
      filterParams: {
        bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.4 },
      },
    });
    mockGetLimitedCount.mockResolvedValue(null);

    const request = createRequest({
      minLat: "37.7",
      maxLat: "37.8",
      minLng: "-122.5",
      maxLng: "-122.4",
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ count: null });
  });

  // 3. Query without bounds → { count: null, boundsRequired: true }
  it("returns boundsRequired: true when query is present but bounds are absent", async () => {
    mockParseSearchParams.mockReturnValue({
      filterParams: { query: "beachside" },
      boundsRequired: true,
    });

    const request = createRequest({ q: "beachside" });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ count: null, boundsRequired: true });
    // getLimitedCount must NOT be called for unbounded text searches
    expect(mockGetLimitedCount).not.toHaveBeenCalled();
  });

  // 4. No query, no bounds, no filters → { count: null, browseMode: true }
  it("returns browseMode: true when there are no query, bounds, or active filters", async () => {
    mockParseSearchParams.mockReturnValue({ filterParams: {} });
    mockHasActiveFilters.mockReturnValue(false);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ count: null, browseMode: true });
    expect(mockGetLimitedCount).not.toHaveBeenCalled();
  });

  // 5. Bounds only (no query, no extra filters) → returns count
  it("returns count when only bounds are present", async () => {
    mockParseSearchParams.mockReturnValue({
      filterParams: {
        bounds: { minLat: 40.0, maxLat: 40.1, minLng: -74.1, maxLng: -74.0 },
      },
    });
    mockHasActiveFilters.mockReturnValue(false);
    mockGetLimitedCount.mockResolvedValue(7);

    const request = createRequest({
      minLat: "40.0",
      maxLat: "40.1",
      minLng: "-74.1",
      maxLng: "-74.0",
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ count: 7 });
  });

  // 6. Filters only (no query, no bounds) → returns count (not browseMode)
  it("returns count when active filters are present with no query or bounds", async () => {
    mockParseSearchParams.mockReturnValue({
      filterParams: { minPrice: 500, maxPrice: 1500 },
    });
    mockHasActiveFilters.mockReturnValue(true);
    mockGetLimitedCount.mockResolvedValue(18);

    const request = createRequest({ minPrice: "500", maxPrice: "1500" });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ count: 18 });
  });

  it("uses projection count for supported Phase04 count specs", async () => {
    mockIsPhase04ProjectionReadsEnabled.mockReturnValue(true);
    mockParseSearchParams.mockReturnValue({
      filterParams: {
        bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.4 },
        minPrice: 500,
      },
    });
    mockGetProjectionSearchCount.mockResolvedValueOnce({ ok: true, count: 9 });

    const request = createRequest({
      minLat: "37.7",
      maxLat: "37.8",
      minLng: "-122.5",
      maxLng: "-122.4",
      minPrice: "500",
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ count: 9 });
    expect(mockGetProjectionSearchCount).toHaveBeenCalled();
    expect(mockGetLimitedCount).not.toHaveBeenCalled();
  });

  it("falls back to limited counts for unsupported Phase04 count specs", async () => {
    mockIsPhase04ProjectionReadsEnabled.mockReturnValue(true);
    mockParseSearchParams.mockReturnValue({
      filterParams: {
        query: "sunny room",
        bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.4 },
      },
    });
    mockGetLimitedCount.mockResolvedValue(11);

    const request = createRequest({
      q: "sunny room",
      minLat: "37.7",
      maxLat: "37.8",
      minLng: "-122.5",
      maxLng: "-122.4",
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ count: 11 });
    expect(mockGetProjectionSearchCount).not.toHaveBeenCalled();
    expect(mockGetLimitedCount).toHaveBeenCalledWith(
      expect.objectContaining({ query: "sunny room" })
    );
  });

  // 7. Rate limit exceeded → 429
  it("returns 429 when rate limit is exceeded", async () => {
    const rateLimitResponse = {
      status: 429,
      json: async () => ({ error: "Too many requests" }),
      headers: { get: () => null },
    };
    mockWithRateLimitRedis.mockResolvedValue(rateLimitResponse);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(429);
    expect(mockGetLimitedCount).not.toHaveBeenCalled();
  });

  // 8. getLimitedCount throws → 500 with { error: "Failed to get count" }
  it("returns 500 with error message when getLimitedCount throws", async () => {
    mockParseSearchParams.mockReturnValue({
      filterParams: {
        bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.4 },
      },
    });
    mockGetLimitedCount.mockRejectedValue(new Error("DB connection failure"));

    const request = createRequest({
      minLat: "37.7",
      maxLat: "37.8",
      minLng: "-122.5",
      maxLng: "-122.4",
    });
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Failed to get count" });
  });

  // 9. Success response has public Cache-Control with s-maxage=15
  it("sets public Cache-Control header on success", async () => {
    mockParseSearchParams.mockReturnValue({
      filterParams: {
        bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.4 },
      },
    });
    mockGetLimitedCount.mockResolvedValue(5);

    const request = createRequest({
      minLat: "37.7",
      maxLat: "37.8",
      minLng: "-122.5",
      maxLng: "-122.4",
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=15, stale-while-revalidate=30"
    );
  });

  // 10. Error response has private, no-store Cache-Control
  it("sets private no-store Cache-Control header on 500 error", async () => {
    mockParseSearchParams.mockReturnValue({
      filterParams: {
        bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.4 },
      },
    });
    mockGetLimitedCount.mockRejectedValue(new Error("Unexpected failure"));

    const request = createRequest({
      minLat: "37.7",
      maxLat: "37.8",
      minLng: "-122.5",
      maxLng: "-122.4",
    });
    const response = await GET(request);

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  // 11. boundsRequired response uses private, no-store Cache-Control
  it("sets private no-store Cache-Control on boundsRequired response", async () => {
    mockParseSearchParams.mockReturnValue({
      filterParams: { query: "studio apartment" },
      boundsRequired: true,
    });

    const request = createRequest({ q: "studio apartment" });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  // 12. browseMode response uses private, no-store Cache-Control
  it("sets private no-store Cache-Control on browseMode response", async () => {
    mockParseSearchParams.mockReturnValue({ filterParams: {} });
    mockHasActiveFilters.mockReturnValue(false);

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  // 13. getLimitedCount throws → Sentry.captureException is called
  it("reports exception to Sentry when getLimitedCount throws", async () => {
    const dbError = new Error("Timeout connecting to DB");
    mockParseSearchParams.mockReturnValue({
      filterParams: {
        bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.4 },
      },
    });
    mockGetLimitedCount.mockRejectedValue(dbError);

    const request = createRequest({
      minLat: "37.7",
      maxLat: "37.8",
      minLng: "-122.5",
      maxLng: "-122.4",
    });
    await GET(request);

    expect(Sentry.captureException).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({
        tags: { route: "/api/search-count", method: "GET" },
      })
    );
  });

  // 14. Zero count (exact match) is returned as a valid number (not null)
  it("returns count: 0 when getLimitedCount returns 0", async () => {
    mockParseSearchParams.mockReturnValue({
      filterParams: {
        query: "penthouse",
        bounds: { minLat: 37.7, maxLat: 37.8, minLng: -122.5, maxLng: -122.4 },
      },
    });
    mockGetLimitedCount.mockResolvedValue(0);

    const request = createRequest({
      q: "penthouse",
      minLat: "37.7",
      maxLat: "37.8",
      minLng: "-122.5",
      maxLng: "-122.4",
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ count: 0 });
    // 0 is a valid exact count, not "100+" — must not be confused with null
    expect(data.count).not.toBeNull();
  });
});
