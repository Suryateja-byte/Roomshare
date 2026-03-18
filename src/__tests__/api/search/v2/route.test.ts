/**
 * Integration tests for Search API v2 route
 *
 * Tests feature flag gating, response format, mode determination,
 * error handling, and unbounded search blocking.
 *
 * The route delegates to executeSearchV2 from search-v2-service.
 * These tests mock the service layer and verify the route's behavior.
 */

// --- Mocks (must come before imports) ---

// Mock the v2 service — this is what the route calls
jest.mock("@/lib/search/search-v2-service", () => ({
  executeSearchV2: jest.fn(),
}));

// Mock timeout wrapper (route wraps executeSearchV2 with withTimeout)
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

// Mock search-params — route calls buildRawParamsFromSearchParams
jest.mock("@/lib/search-params", () => ({
  buildRawParamsFromSearchParams: jest.fn().mockReturnValue({}),
}));

// Mock rate limiting to return null (allow request)
jest.mock("@/lib/with-rate-limit-redis", () => ({
  withRateLimitRedis: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/search-rate-limit-identifier", () => ({
  getSearchRateLimitIdentifier: jest.fn().mockResolvedValue("127.0.0.1"),
}));

// Mock request context
jest.mock("@/lib/request-context", () => ({
  createContextFromHeaders: jest.fn().mockReturnValue({}),
  runWithRequestContext: jest.fn((_, fn) => fn()),
  getRequestId: jest.fn().mockReturnValue("test-request-id"),
}));

// Mock next/server NextResponse
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
          get: (key: string) => headersMap.get(key) || null,
          entries: () => headersMap.entries(),
        },
      };
    },
  },
}));

// Mock env with feature flag - using a mutable object that can be modified in tests
jest.mock("@/lib/env", () => {
  const mockFeatures = {
    searchV2: false, // Default to disabled
  };
  return {
    __esModule: true,
    features: mockFeatures,
    serverEnv: {},
    clientEnv: {},
    getCursorSecret: jest.fn().mockReturnValue(""),
    getOptionalCursorSecret: jest.fn().mockReturnValue(""),
  };
});

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

// --- Imports (after mocks) ---

import { features } from "@/lib/env";
const mockFeatures = features as { searchV2: boolean };

import { GET } from "@/app/api/search/v2/route";
import { executeSearchV2 } from "@/lib/search/search-v2-service";
import { withTimeout, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";
import { buildRawParamsFromSearchParams } from "@/lib/search-params";
import { NextRequest } from "next/server";
import type { SearchV2Response } from "@/lib/search/types";
import type { SearchV2Result } from "@/lib/search/search-v2-service";

// --- Helpers ---

function createRequest(params: Record<string, string> = {}): NextRequest {
  const searchParams = new URLSearchParams(params);
  const request = {
    nextUrl: {
      searchParams,
    },
    headers: new Headers(),
  } as unknown as NextRequest;
  return request;
}

/** Build a successful SearchV2Result for mocking executeSearchV2 */
function createMockSearchResult(
  overrides: Partial<SearchV2Response> = {}
): SearchV2Result {
  const response: SearchV2Response = {
    meta: {
      queryHash: "abcdef1234567890",
      generatedAt: new Date().toISOString(),
      mode: "pins",
      ...overrides.meta,
    },
    list: {
      items: [],
      nextCursor: null,
      total: 0,
      ...overrides.list,
    },
    map: {
      geojson: {
        type: "FeatureCollection",
        features: [],
        ...overrides.map?.geojson,
      },
      ...overrides.map,
    },
  };
  return {
    response,
    paginatedResult: {
      items: [],
      hasNextPage: false,
      hasPrevPage: false,
      total: 0,
      totalPages: 0,
      page: 1,
      limit: 20,
    },
  };
}

/** Build a mock list item in v2 format */
function createMockListItem(
  id: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id,
    title: `Listing ${id}`,
    price: 1500,
    image: "img.jpg",
    lat: 37.7749,
    lng: -122.4194,
    ...overrides,
  };
}

/** Build a GeoJSON feature for map data */
function createMockGeoFeature(
  id: string,
  lat: number = 37.7749,
  lng: number = -122.4194
) {
  return {
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [lng, lat],
    },
    properties: {
      id,
      title: `Listing ${id}`,
      price: 1500,
      image: "img.jpg",
      availableSlots: 1,
    },
  };
}

// --- Tests ---

describe("Search API v2 route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFeatures.searchV2 = false; // Reset to disabled
    // Default: executeSearchV2 returns empty success result
    (executeSearchV2 as jest.Mock).mockResolvedValue(createMockSearchResult());
    // Default: withTimeout passes through promise
    (withTimeout as jest.Mock).mockImplementation(
      (promise: Promise<unknown>) => promise
    );
  });

  describe("Feature flag gating", () => {
    it("should return 404 when feature flag is disabled and no URL param", async () => {
      mockFeatures.searchV2 = false;
      const request = createRequest();

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Search v2 endpoint not enabled");
    });

    it("should return 200 when feature flag is enabled", async () => {
      mockFeatures.searchV2 = true;

      const request = createRequest();
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it("should return 200 when ?v2=1 param is set", async () => {
      mockFeatures.searchV2 = false;

      const request = createRequest({ v2: "1" });
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it("should return 200 when ?v2=true param is set", async () => {
      mockFeatures.searchV2 = false;

      const request = createRequest({ v2: "true" });
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe("Service delegation", () => {
    beforeEach(() => {
      mockFeatures.searchV2 = true;
    });

    it("should call executeSearchV2 with rawParams from URL", async () => {
      const mockRawParams = { q: "studio", minPrice: "500" };
      (buildRawParamsFromSearchParams as jest.Mock).mockReturnValue(
        mockRawParams
      );

      const request = createRequest({ q: "studio", minPrice: "500" });
      await GET(request);

      expect(executeSearchV2).toHaveBeenCalledTimes(1);
      expect(executeSearchV2).toHaveBeenCalledWith({
        rawParams: mockRawParams,
      });
    });

    it("should wrap executeSearchV2 with withTimeout", async () => {
      const request = createRequest();
      await GET(request);

      expect(withTimeout).toHaveBeenCalledTimes(1);
      expect(withTimeout).toHaveBeenCalledWith(
        expect.anything(),
        DEFAULT_TIMEOUTS.DATABASE,
        "executeSearchV2"
      );
    });
  });

  describe("Response format", () => {
    beforeEach(() => {
      mockFeatures.searchV2 = true;
    });

    it("should return correct response structure", async () => {
      const listItems = [createMockListItem("1")];
      const geoFeatures = [createMockGeoFeature("1")];

      (executeSearchV2 as jest.Mock).mockResolvedValue(
        createMockSearchResult({
          meta: {
            queryHash: "abcdef1234567890",
            generatedAt: new Date().toISOString(),
            mode: "pins",
          },
          list: {
            items: listItems,
            nextCursor: null,
            total: 1,
          },
          map: {
            geojson: {
              type: "FeatureCollection",
              features: geoFeatures,
            },
            pins: [{ id: "1", lat: 37.7749, lng: -122.4194, price: 1500 }],
          },
        })
      );

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      // Check meta
      expect(data.meta).toBeDefined();
      expect(data.meta.queryHash).toBeDefined();
      expect(data.meta.queryHash).toHaveLength(16);
      expect(data.meta.generatedAt).toBeDefined();
      expect(data.meta.mode).toMatch(/^(geojson|pins)$/);

      // Check list
      expect(data.list).toBeDefined();
      expect(Array.isArray(data.list.items)).toBe(true);
      expect(data.list.nextCursor).toBeDefined();
      expect(data.list.total).toBeDefined();

      // Check map
      expect(data.map).toBeDefined();
      expect(data.map.geojson).toBeDefined();
      expect(data.map.geojson.type).toBe("FeatureCollection");
    });

    it("should include request-id header", async () => {
      const request = createRequest();
      const response = await GET(request);

      expect(response.headers.get("x-request-id")).toBe("test-request-id");
    });

    it("should include Cache-Control header", async () => {
      const request = createRequest();
      const response = await GET(request);

      expect(response.headers.get("Cache-Control")).toContain("s-maxage=60");
    });
  });

  describe("Mode determination", () => {
    beforeEach(() => {
      mockFeatures.searchV2 = true;
    });

    it("should return mode='pins' when service returns pins mode", async () => {
      (executeSearchV2 as jest.Mock).mockResolvedValue(
        createMockSearchResult({
          meta: {
            queryHash: "abcdef1234567890",
            generatedAt: new Date().toISOString(),
            mode: "pins",
          },
          map: {
            geojson: { type: "FeatureCollection", features: [] },
            pins: [{ id: "1", lat: 37.7749, lng: -122.4194 }],
          },
        })
      );

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.meta.mode).toBe("pins");
      expect(data.map.pins).toBeDefined();
      expect(Array.isArray(data.map.pins)).toBe(true);
    });

    it("should return mode='geojson' when service returns geojson mode", async () => {
      (executeSearchV2 as jest.Mock).mockResolvedValue(
        createMockSearchResult({
          meta: {
            queryHash: "abcdef1234567890",
            generatedAt: new Date().toISOString(),
            mode: "geojson",
          },
          map: {
            geojson: { type: "FeatureCollection", features: [] },
          },
        })
      );

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.meta.mode).toBe("geojson");
      expect(data.map.pins).toBeUndefined();
    });

    it("should always include geojson regardless of mode", async () => {
      // Test with pins mode
      (executeSearchV2 as jest.Mock).mockResolvedValue(
        createMockSearchResult({
          meta: {
            queryHash: "abcdef1234567890",
            generatedAt: new Date().toISOString(),
            mode: "pins",
          },
          map: {
            geojson: { type: "FeatureCollection", features: [] },
            pins: [],
          },
        })
      );

      const sparseRequest = createRequest();
      const sparseResponse = await GET(sparseRequest);
      const sparseData = await sparseResponse.json();

      expect(sparseData.map.geojson).toBeDefined();
      expect(sparseData.map.geojson.type).toBe("FeatureCollection");

      // Test with geojson mode
      (executeSearchV2 as jest.Mock).mockResolvedValue(
        createMockSearchResult({
          meta: {
            queryHash: "abcdef1234567890",
            generatedAt: new Date().toISOString(),
            mode: "geojson",
          },
          map: {
            geojson: { type: "FeatureCollection", features: [] },
          },
        })
      );

      const denseRequest = createRequest();
      const denseResponse = await GET(denseRequest);
      const denseData = await denseResponse.json();

      expect(denseData.map.geojson).toBeDefined();
      expect(denseData.map.geojson.type).toBe("FeatureCollection");
    });
  });

  describe("Pagination", () => {
    beforeEach(() => {
      mockFeatures.searchV2 = true;
    });

    it("should return nextCursor when service provides one", async () => {
      (executeSearchV2 as jest.Mock).mockResolvedValue(
        createMockSearchResult({
          list: {
            items: [createMockListItem("1")],
            nextCursor: "eyJwIjoyfQ", // encoded cursor
            total: 100,
          },
        })
      );

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.list.nextCursor).not.toBeNull();
      expect(typeof data.list.nextCursor).toBe("string");
    });

    it("should return null nextCursor when service indicates no more pages", async () => {
      (executeSearchV2 as jest.Mock).mockResolvedValue(
        createMockSearchResult({
          list: {
            items: [createMockListItem("1")],
            nextCursor: null,
            total: 1,
          },
        })
      );

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.list.nextCursor).toBeNull();
    });
  });

  describe("List items transformation", () => {
    beforeEach(() => {
      mockFeatures.searchV2 = true;
    });

    it("should pass through list items from service response", async () => {
      (executeSearchV2 as jest.Mock).mockResolvedValue(
        createMockSearchResult({
          list: {
            items: [
              createMockListItem("test-id", {
                title: "Cozy Room",
                price: 1200,
                image: "first.jpg",
                lat: 37.7749,
                lng: -122.4194,
              }),
            ],
            nextCursor: null,
            total: 1,
          },
        })
      );

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      const item = data.list.items[0];
      expect(item.id).toBe("test-id");
      expect(item.title).toBe("Cozy Room");
      expect(item.price).toBe(1200);
      expect(item.image).toBe("first.jpg");
      expect(item.lat).toBe(37.7749);
      expect(item.lng).toBe(-122.4194);
    });

    it("should pass through badges from service response", async () => {
      (executeSearchV2 as jest.Mock).mockResolvedValue(
        createMockSearchResult({
          list: {
            items: [createMockListItem("1", { badges: ["near-match"] })],
            nextCursor: null,
            total: 1,
          },
        })
      );

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.list.items[0].badges).toContain("near-match");
    });

    it("should pass through multi-room badge from service response", async () => {
      (executeSearchV2 as jest.Mock).mockResolvedValue(
        createMockSearchResult({
          list: {
            items: [createMockListItem("1", { badges: ["multi-room"] })],
            nextCursor: null,
            total: 1,
          },
        })
      );

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.list.items[0].badges).toContain("multi-room");
    });
  });

  describe("Error handling", () => {
    beforeEach(() => {
      mockFeatures.searchV2 = true;
    });

    it("should return 503 when service returns an error", async () => {
      (executeSearchV2 as jest.Mock).mockResolvedValue({
        response: null,
        paginatedResult: null,
        error: "Search temporarily unavailable",
      });

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("Search temporarily unavailable");
    });

    it("should return 503 when service returns null response", async () => {
      (executeSearchV2 as jest.Mock).mockResolvedValue({
        response: null,
        paginatedResult: null,
      });

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("Search temporarily unavailable");
    });

    it("should return 500 when executeSearchV2 throws", async () => {
      (executeSearchV2 as jest.Mock).mockRejectedValue(
        new Error("Database connection lost")
      );

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to fetch search results");
    });

    it("should return 400 for validation errors", async () => {
      (executeSearchV2 as jest.Mock).mockRejectedValue(
        new Error("Bounds cannot exceed maximum span")
      );

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid search parameters");
    });
  });

  describe("Unbounded search blocking", () => {
    beforeEach(() => {
      mockFeatures.searchV2 = true;
      jest.clearAllMocks();
      // Default: withTimeout passes through
      (withTimeout as jest.Mock).mockImplementation(
        (promise: Promise<unknown>) => promise
      );
    });

    it("should return unboundedSearch response when service signals it", async () => {
      (executeSearchV2 as jest.Mock).mockResolvedValue({
        response: null,
        paginatedResult: null,
        unboundedSearch: true,
      });

      const request = createRequest({ q: "Boston" });

      const response = await GET(request);
      const data = await response.json();

      // Should return 200 with empty results and unboundedSearch indicator
      expect(response.status).toBe(200);
      expect(data.unboundedSearch).toBe(true);
      expect(data.list).toBeNull();
      expect(data.map).toBeNull();
    });

    it("should return no-cache headers for unbounded search", async () => {
      (executeSearchV2 as jest.Mock).mockResolvedValue({
        response: null,
        paginatedResult: null,
        unboundedSearch: true,
      });

      const request = createRequest({ q: "Boston" });
      const response = await GET(request);

      expect(response.headers.get("Cache-Control")).toContain("no-cache");
    });

    it("should return normal results when query has bounds", async () => {
      const result = createMockSearchResult({
        list: {
          items: [],
          nextCursor: null,
          total: 0,
        },
      });
      (executeSearchV2 as jest.Mock).mockResolvedValue(result);

      const request = createRequest({
        q: "Boston",
        lat: "42.36",
        lng: "-71.06",
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.unboundedSearch).toBeUndefined();
      expect(data.list).toBeDefined();
      expect(data.map).toBeDefined();
      expect(executeSearchV2).toHaveBeenCalled();
    });

    it("should return normal results when no query (browse mode)", async () => {
      const result = createMockSearchResult({
        list: {
          items: [],
          nextCursor: null,
          total: 0,
        },
      });
      (executeSearchV2 as jest.Mock).mockResolvedValue(result);

      const request = createRequest({});

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.unboundedSearch).toBeUndefined();
      expect(data.list).toBeDefined();
      expect(executeSearchV2).toHaveBeenCalled();
    });
  });

  describe("Stability contract: response shape guarantees", () => {
    beforeEach(() => {
      mockFeatures.searchV2 = true;
      jest.clearAllMocks();
      (withTimeout as jest.Mock).mockImplementation(
        (promise: Promise<unknown>) => promise
      );
    });

    it("passes through service list items faithfully (F2.3)", async () => {
      const listItems = [
        createMockListItem("active-1", { title: "Active Listing" }),
        createMockListItem("active-2", { title: "Another Active" }),
      ];

      (executeSearchV2 as jest.Mock).mockResolvedValue(
        createMockSearchResult({
          list: {
            items: listItems,
            nextCursor: null,
            total: 2,
          },
        })
      );

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Route passes through the service response directly
      expect(data.list.items).toHaveLength(2);
      expect(data.list.items.map((item: { id: string }) => item.id)).toEqual([
        "active-1",
        "active-2",
      ]);
      expect(data.list.total).toBe(2);
    });

    it("passes through GeoJSON features with valid coordinates (F1.1)", async () => {
      const geoFeatures = [
        createMockGeoFeature("valid-1", 37.7749, -122.4194),
        createMockGeoFeature("valid-2", 34.0522, -118.2437),
      ];

      (executeSearchV2 as jest.Mock).mockResolvedValue(
        createMockSearchResult({
          map: {
            geojson: {
              type: "FeatureCollection",
              features: geoFeatures,
            },
          },
        })
      );

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Verify GeoJSON features have valid coordinates
      const mapFeatures = data.map.geojson.features;
      expect(mapFeatures).toHaveLength(2);
      mapFeatures.forEach(
        (feature: {
          geometry: { coordinates: [number, number] };
          properties: { id: string };
        }) => {
          const [lng, lat] = feature.geometry.coordinates;
          expect(lng).not.toBeNull();
          expect(lat).not.toBeNull();
          expect(typeof lng).toBe("number");
          expect(typeof lat).toBe("number");
          expect(Number.isFinite(lng)).toBe(true);
          expect(Number.isFinite(lat)).toBe(true);
        }
      );

      // Verify feature IDs match
      const featureIds = mapFeatures.map(
        (f: { properties: { id: string } }) => f.properties.id
      );
      expect(featureIds).toContain("valid-1");
      expect(featureIds).toContain("valid-2");
    });
  });
});
