/**
 * P1-3 regression tests for GET /api/search/listings
 *
 * A SearchV2Result carrying a structured signal (admissionError / snapshotExpired)
 * has response:null and no error. The circuit-breaker wrapper must surface those
 * to their dedicated handlers (400 admission_rejected / 409 snapshot_expired)
 * instead of throwing them into the generic V1 fallback. Genuine failures (thrown
 * errors) must still fall back to V1.
 */

// --- Mocks (must come before imports) ---

jest.mock("next/server", () => ({
  NextRequest: class {},
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const headersMap = new Map<string, string>();
      if (init?.headers) {
        Object.entries(init.headers).forEach(([k, v]) => headersMap.set(k, v));
      }
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

jest.mock("@/lib/env", () => ({
  __esModule: true,
  features: {
    clientSideSearch: true,
    searchV2: true,
  },
}));

jest.mock("@/lib/search-params", () => ({
  buildRawParamsFromSearchParams: jest.fn().mockReturnValue({}),
  parseSearchParams: jest.fn().mockReturnValue({
    requestedPage: 1,
    filterParams: {},
  }),
}));

jest.mock("@/lib/with-rate-limit-redis", () => ({
  withRateLimitRedis: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/timeout-wrapper", () => ({
  withTimeout: jest.fn((promise: Promise<unknown>) => promise),
  DEFAULT_TIMEOUTS: { DATABASE: 10000 },
}));

jest.mock("@/lib/request-context", () => ({
  createContextFromHeaders: jest
    .fn()
    .mockReturnValue({ requestId: "test-req-id" }),
  runWithRequestContext: jest.fn((_ctx: unknown, fn: () => unknown) => fn()),
  getRequestId: jest.fn().mockReturnValue("test-req-id"),
}));

jest.mock("@/lib/search/search-v2-service", () => ({
  executeSearchV2: jest.fn(),
}));

jest.mock("@/lib/data", () => ({
  getListingsPaginated: jest.fn(),
}));

// Circuit breaker runs the wrapper callback inline so the route's own
// admission/snapshot-vs-throw logic is exercised.
jest.mock("@/lib/circuit-breaker", () => ({
  circuitBreakers: {
    searchV2: {
      execute: jest.fn((fn: () => unknown) => fn()),
    },
  },
  isCircuitOpenError: jest.fn().mockReturnValue(false),
}));

jest.mock("@/lib/constants", () => ({
  DEFAULT_PAGE_SIZE: 24,
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  },
  sanitizeErrorMessage: jest.fn().mockReturnValue("sanitized"),
}));

jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

jest.mock("@/lib/search-rate-limit-identifier", () => ({
  getSearchRateLimitIdentifier: jest.fn().mockResolvedValue("127.0.0.1"),
}));

jest.mock("@/lib/search/search-response", () => ({
  createSearchResponseMeta: jest.fn((_q: unknown, backendSource: string) => ({
    queryHash: "test-hash",
    backendSource,
    responseVersion: "3",
  })),
  getSearchQueryHash: jest.fn().mockReturnValue("test-hash"),
  SEARCH_RESPONSE_VERSION: "3",
}));

jest.mock("@/lib/search/search-query", () => ({
  normalizeSearchQuery: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/search/testing/search-scenarios", () => ({
  resolveSearchScenario: jest.fn().mockReturnValue(null),
  buildScenarioSearchListState: jest.fn(),
  SEARCH_SCENARIO_HEADER: "x-search-scenario",
}));

jest.mock("@/lib/search/search-telemetry", () => ({
  recordSearchRequestLatency: jest.fn(),
  recordSearchV2Fallback: jest.fn(),
  recordSearchZeroResults: jest.fn(),
}));

jest.mock("@/lib/public-cache/headers", () => ({
  buildPublicCacheHeadersForListings: jest.fn().mockReturnValue({}),
}));

jest.mock("@/lib/search/public-listing-payload", () => ({
  toPublicSearchListings: jest.fn((items: unknown) => items),
}));

// --- Imports (after mocks) ---

import { GET } from "@/app/api/search/listings/route";
import { executeSearchV2 } from "@/lib/search/search-v2-service";
import { getListingsPaginated } from "@/lib/data";
import { recordSearchV2Fallback } from "@/lib/search/search-telemetry";

// --- Helpers ---

function createGetRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/search/listings");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const req = new Request(url.toString(), { method: "GET" });
  (req as any).nextUrl = url;
  return req as any;
}

describe("GET /api/search/listings — P1-3 structured signals vs V1 fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getListingsPaginated as jest.Mock).mockResolvedValue({
      items: [{ id: "listing-1" }],
      total: 1,
    });
  });

  it("returns 400 admission_rejected and does NOT fall back to V1 on an admission error", async () => {
    (executeSearchV2 as jest.Mock).mockResolvedValue({
      response: null,
      paginatedResult: null,
      admissionError: {
        code: "requested_occupants_too_high",
        message: "Too many occupants requested",
        status: 400,
      },
    });

    const res = await GET(createGetRequest());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("admission_rejected");
    expect(body.admissionError).toEqual(
      expect.objectContaining({
        code: "requested_occupants_too_high",
        status: 400,
      })
    );
    // V1 fallback must NOT run — the dedicated handler owns this response.
    expect(getListingsPaginated).not.toHaveBeenCalled();
    expect(recordSearchV2Fallback).not.toHaveBeenCalled();
  });

  it("returns 409 snapshot_expired and does NOT fall back to V1 on an expired snapshot", async () => {
    (executeSearchV2 as jest.Mock).mockResolvedValue({
      response: null,
      paginatedResult: null,
      snapshotExpired: {
        queryHash: "test-hash",
        reason: "search_contract_changed",
      },
    });

    const res = await GET(createGetRequest());

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("snapshot_expired");
    expect(body.snapshotExpired).toEqual(
      expect.objectContaining({ reason: "search_contract_changed" })
    );
    expect(getListingsPaginated).not.toHaveBeenCalled();
    expect(recordSearchV2Fallback).not.toHaveBeenCalled();
  });

  it("falls back to V1 when the V2 search genuinely throws", async () => {
    (executeSearchV2 as jest.Mock).mockRejectedValue(
      new Error("boom: connection lost")
    );

    const res = await GET(createGetRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe("degraded");
    expect(body.source).toBe("v1-fallback");
    // Genuine failures still reach V1.
    expect(getListingsPaginated).toHaveBeenCalledTimes(1);
    expect(recordSearchV2Fallback).toHaveBeenCalledTimes(1);
  });
});
