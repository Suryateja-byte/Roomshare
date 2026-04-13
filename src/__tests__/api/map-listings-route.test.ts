/**
 * Stability contract C2.2 tests for GET /api/map-listings
 *
 * C2.2 STABLE WHEN: /api/map-listings responds in <1s with max 200-400 listings,
 * NOT returning full image arrays (only first image needed for pins)
 *
 * Tests: bounds validation, withTimeout enforcement, CDN cache headers,
 * rate limiting pass-through, and minimal-field response shape.
 */

// --- Mocks (must come before imports) ---

jest.mock("next/server", () => ({
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

jest.mock("@/lib/data", () => ({
  getMapListings: jest.fn(),
}));

jest.mock("@/lib/search/search-doc-queries", () => ({
  isSearchDocEnabled: jest.fn().mockReturnValue(false),
  getSearchDocMapListings: jest.fn(),
}));

// Mock @/lib/env to control features.semanticSearch
jest.mock("@/lib/env", () => ({
  __esModule: true,
  features: {
    semanticSearch: false,
  },
}));

jest.mock("@/lib/with-rate-limit-redis", () => ({
  withRateLimitRedis: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/timeout-wrapper", () => ({
  withTimeout: jest.fn((promise: Promise<unknown>) => promise),
  DEFAULT_TIMEOUTS: {
    LLM_STREAM: 30000,
    REDIS: 1000,
    EXTERNAL_API: 5000,
    DATABASE: 10000,
    EMAIL: 15000,
  },
}));

jest.mock("@/lib/validation", () => ({
  validateAndParseBounds: jest.fn(),
}));

jest.mock("@/lib/request-context", () => ({
  createContextFromHeaders: jest
    .fn()
    .mockReturnValue({ requestId: "test-req-id" }),
  runWithRequestContext: jest.fn((_ctx: unknown, fn: () => unknown) => fn()),
  getRequestId: jest.fn().mockReturnValue("test-req-id"),
}));

jest.mock("@/lib/search-params", () => ({
  buildRawParamsFromSearchParams: jest.fn().mockReturnValue({}),
  parseSearchParams: jest.fn().mockReturnValue({
    q: undefined,
    requestedPage: 1,
    sortOption: "newest",
    boundsRequired: false,
    browseMode: false,
    filterParams: {
      query: undefined,
      sort: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      amenities: undefined,
      languages: undefined,
      houseRules: undefined,
      moveInDate: undefined,
      leaseDuration: undefined,
      roomType: undefined,
      genderPreference: undefined,
      householdGender: undefined,
    },
  }),
}));

jest.mock("@/lib/constants", () => ({
  LAT_OFFSET_DEGREES: 0.27,
  MAP_FETCH_MAX_LAT_SPAN: 60,
  MAP_FETCH_MAX_LNG_SPAN: 130,
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
  sanitizeErrorMessage: jest.fn().mockReturnValue("sanitized"),
}));

jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

jest.mock("@/lib/search-rate-limit-identifier", () => ({
  getSearchRateLimitIdentifier: jest.fn().mockResolvedValue("127.0.0.1"),
}));

// --- Imports (after mocks) ---

import { GET } from "@/app/api/map-listings/route";
import { getMapListings } from "@/lib/data";
import {
  isSearchDocEnabled,
  getSearchDocMapListings,
} from "@/lib/search/search-doc-queries";
import { features } from "@/lib/env";
import { withRateLimitRedis } from "@/lib/with-rate-limit-redis";
import { withTimeout, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";
import { validateAndParseBounds } from "@/lib/validation";
import { parseSearchParams } from "@/lib/search-params";

const mockFeatures = features as { semanticSearch: boolean };

// --- Helpers ---

const VALID_BOUNDS = {
  minLat: 37.5,
  maxLat: 38.0,
  minLng: -122.5,
  maxLng: -122.0,
};

const SAMPLE_MAP_LISTINGS = [
  {
    id: "listing-1",
    title: "Cozy Studio near Downtown",
    price: 1200,
    availableSlots: 2,
    images: ["https://cdn.example.com/img1.jpg"],
    location: { lat: 37.78, lng: -122.42 },
  },
  {
    id: "listing-2",
    title: "Sunny Room with Bay View",
    price: 1500,
    availableSlots: 1,
    images: ["https://cdn.example.com/img2.jpg"],
    location: { lat: 37.76, lng: -122.39 },
  },
];

function createGetRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/map-listings");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const req = new Request(url.toString(), { method: "GET" });
  // Add nextUrl for Next.js compatibility (NextRequest shape)
  (req as any).nextUrl = url;
  return req as any;
}

// --- Tests ---

describe("GET /api/map-listings (C2.2)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: SearchDoc disabled so existing tests hit V1 (getMapListings) path
    (isSearchDocEnabled as jest.Mock).mockReturnValue(false);
    // Default: bounds validation passes
    (validateAndParseBounds as jest.Mock).mockReturnValue({
      valid: true,
      bounds: VALID_BOUNDS,
    });
    // Default: getMapListings returns sample data (V1 path)
    (getMapListings as jest.Mock).mockResolvedValue(SAMPLE_MAP_LISTINGS);
    // Default: getSearchDocMapListings returns sample data (V2 path)
    (getSearchDocMapListings as jest.Mock).mockResolvedValue({
      listings: SAMPLE_MAP_LISTINGS,
      truncated: false,
    });
    // Default: rate limiter passes
    (withRateLimitRedis as jest.Mock).mockResolvedValue(null);
    // Default: withTimeout passes through promise
    (withTimeout as jest.Mock).mockImplementation(
      (promise: Promise<unknown>) => promise
    );
    // Default: semantic search off
    mockFeatures.semanticSearch = false;
  });

  it("returns 400 when no bounds are provided", async () => {
    (validateAndParseBounds as jest.Mock).mockReturnValue({
      valid: false,
      error: "All bounds parameters required (minLng, maxLng, minLat, maxLat)",
    });

    const req = createGetRequest({});
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.kind).toBe("location-required");
    expect(body.meta).toEqual(
      expect.objectContaining({
        backendSource: "map-api",
        responseVersion: expect.any(String),
        queryHash: expect.any(String),
      })
    );
  });

  it("returns listings with cache headers when bounds are valid", async () => {
    const req = createGetRequest({
      minLng: "-122.5",
      maxLng: "-122.0",
      minLat: "37.5",
      maxLat: "38.0",
    });

    const res = await GET(req);

    expect(res.status).toBe(200);

    // Verify response body
    const body = await res.json();
    expect(body.kind).toBe("ok");
    expect(body.data.listings).toEqual(SAMPLE_MAP_LISTINGS);
    expect(body.meta).toEqual(
      expect.objectContaining({
        backendSource: "map-api",
        responseVersion: expect.any(String),
        queryHash: expect.any(String),
      })
    );

    // C2.2: CDN cache headers present (s-maxage for edge caching)
    const cacheControl = res.headers.get("Cache-Control");
    expect(cacheControl).toContain("s-maxage");
    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("stale-while-revalidate");
  });

  it("uses withTimeout for database timeout enforcement", async () => {
    const req = createGetRequest({
      minLng: "-122.5",
      maxLng: "-122.0",
      minLat: "37.5",
      maxLat: "38.0",
    });

    await GET(req);

    // withTimeout must be called with the getMapListings promise and DATABASE timeout
    expect(withTimeout).toHaveBeenCalledTimes(1);
    expect(withTimeout).toHaveBeenCalledWith(
      expect.anything(), // the promise from getMapListings
      DEFAULT_TIMEOUTS.DATABASE, // 10000ms
      "getMapListings"
    );
  });

  it("applies rate limiting via withRateLimitRedis", async () => {
    const req = createGetRequest({
      minLng: "-122.5",
      maxLng: "-122.0",
      minLat: "37.5",
      maxLat: "38.0",
    });

    await GET(req);

    expect(withRateLimitRedis).toHaveBeenCalledTimes(1);
    expect(withRateLimitRedis).toHaveBeenCalledWith(
      req,
      expect.objectContaining({ type: "map" })
    );
  });

  it("returns 429 when rate limited", async () => {
    const rateLimitRes = {
      status: 429,
      json: async () => ({ error: "Too many requests" }),
      headers: { get: () => null, entries: () => new Map().entries() },
    };
    (withRateLimitRedis as jest.Mock).mockResolvedValueOnce(rateLimitRes);

    const req = createGetRequest({
      minLng: "-122.5",
      maxLng: "-122.0",
      minLat: "37.5",
      maxLat: "38.0",
    });

    const res = await GET(req);

    expect(res.status).toBe(429);
    // getMapListings should NOT be called when rate limited
    expect(getMapListings).not.toHaveBeenCalled();
  });

  describe("SearchDoc path (V2)", () => {
    beforeEach(() => {
      (isSearchDocEnabled as jest.Mock).mockReturnValue(true);
    });

    it("calls getSearchDocMapListings when SearchDoc is enabled", async () => {
      const req = createGetRequest({
        minLng: "-122.5",
        maxLng: "-122.0",
        minLat: "37.5",
        maxLat: "38.0",
      });

      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.kind).toBe("ok");
      expect(body.data.listings).toEqual(SAMPLE_MAP_LISTINGS);

      // SearchDoc path should be called, not legacy path
      expect(getSearchDocMapListings).toHaveBeenCalledTimes(1);
      expect(getMapListings).not.toHaveBeenCalled();
    });

    it("passes filter params including bounds to getSearchDocMapListings", async () => {
      (parseSearchParams as jest.Mock).mockReturnValue({
        q: undefined,
        requestedPage: 1,
        sortOption: "recommended",
        boundsRequired: false,
        browseMode: false,
        filterParams: {
          query: undefined,
          sort: undefined,
          bookingMode: "INSTANT",
          minAvailableSlots: 2,
          minPrice: 500,
          maxPrice: 2000,
        },
      });

      const req = createGetRequest({
        minLng: "-122.5",
        maxLng: "-122.0",
        minLat: "37.5",
        maxLat: "38.0",
        bookingMode: "INSTANT",
        minSlots: "2",
      });

      await GET(req);

      expect(getSearchDocMapListings).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingMode: "INSTANT",
          minAvailableSlots: 2,
          minPrice: 500,
          maxPrice: 2000,
          bounds: VALID_BOUNDS,
        })
      );
    });

    it("wraps getSearchDocMapListings with withTimeout", async () => {
      const req = createGetRequest({
        minLng: "-122.5",
        maxLng: "-122.0",
        minLat: "37.5",
        maxLat: "38.0",
      });

      await GET(req);

      expect(withTimeout).toHaveBeenCalledTimes(1);
      expect(withTimeout).toHaveBeenCalledWith(
        expect.anything(),
        DEFAULT_TIMEOUTS.DATABASE,
        "getSearchDocMapListings"
      );
    });
  });

  describe("Semantic query stripping", () => {
    it("strips query from map params when semantic search is active and sort is recommended", async () => {
      mockFeatures.semanticSearch = true;

      (parseSearchParams as jest.Mock).mockReturnValue({
        q: "San Francisco",
        what: "bright sunny studio",
        requestedPage: 1,
        sortOption: "recommended",
        boundsRequired: false,
        browseMode: false,
        filterParams: {
          query: "San Francisco",
          vibeQuery: "bright sunny studio",
          sort: undefined, // undefined sort defaults to "recommended"
          minPrice: undefined,
          maxPrice: undefined,
        },
      });

      const req = createGetRequest({
        minLng: "-122.5",
        maxLng: "-122.0",
        minLat: "37.5",
        maxLat: "38.0",
        q: "San Francisco",
        what: "bright sunny studio",
      });

      await GET(req);

      // With V1 path (default): getMapListings should be called with query stripped
      expect(getMapListings).toHaveBeenCalledWith(
        expect.objectContaining({
          query: undefined,
          bounds: VALID_BOUNDS,
        })
      );
    });

    it("preserves query in map params when sort is not recommended", async () => {
      mockFeatures.semanticSearch = true;

      (parseSearchParams as jest.Mock).mockReturnValue({
        q: "San Francisco",
        what: "bright sunny studio",
        requestedPage: 1,
        sortOption: "newest",
        boundsRequired: false,
        browseMode: false,
        filterParams: {
          query: "San Francisco",
          vibeQuery: "bright sunny studio",
          sort: "newest",
          minPrice: undefined,
          maxPrice: undefined,
        },
      });

      const req = createGetRequest({
        minLng: "-122.5",
        maxLng: "-122.0",
        minLat: "37.5",
        maxLat: "38.0",
        q: "San Francisco",
        what: "bright sunny studio",
        sort: "newest",
      });

      await GET(req);

      // When sort is not "recommended", query should be preserved
      expect(getMapListings).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "San Francisco",
          bounds: VALID_BOUNDS,
        })
      );
    });

    it("does not strip query when semantic search feature flag is off", async () => {
      mockFeatures.semanticSearch = false;

      (parseSearchParams as jest.Mock).mockReturnValue({
        q: "San Francisco",
        what: "bright sunny studio",
        requestedPage: 1,
        sortOption: "recommended",
        boundsRequired: false,
        browseMode: false,
        filterParams: {
          query: "San Francisco",
          vibeQuery: "bright sunny studio",
          sort: undefined,
          minPrice: undefined,
          maxPrice: undefined,
        },
      });

      const req = createGetRequest({
        minLng: "-122.5",
        maxLng: "-122.0",
        minLat: "37.5",
        maxLat: "38.0",
        q: "San Francisco",
        what: "bright sunny studio",
      });

      await GET(req);

      // Semantic search off: query should be preserved
      expect(getMapListings).toHaveBeenCalledWith(
        expect.objectContaining({
          query: "San Francisco",
          bounds: VALID_BOUNDS,
        })
      );
    });
  });
});
