/**
 * @jest-environment node
 */

/**
 * Unit tests for /api/search/facets endpoint
 *
 * Tests facet counts for filter options (amenities, houseRules, roomTypes, priceRanges).
 */

// Mock prisma before importing route
jest.mock("@/lib/prisma", () => ({
  prisma: (() => {
    const queryRawUnsafe = jest.fn();
    const executeRawUnsafe = jest.fn();
    return {
      $queryRawUnsafe: queryRawUnsafe,
      $executeRawUnsafe: executeRawUnsafe,
      $transaction: jest.fn(async (callback: (tx: {
        $executeRawUnsafe: jest.Mock;
        $queryRawUnsafe: jest.Mock;
      }) => Promise<unknown>) => callback({
        $executeRawUnsafe: executeRawUnsafe,
        $queryRawUnsafe: queryRawUnsafe,
      })),
    };
  })(),
}));

// Mock rate limiting to return null (allow request)
jest.mock("@/lib/with-rate-limit-redis", () => ({
  withRateLimitRedis: jest.fn().mockResolvedValue(null),
}));

// Mock request context
jest.mock("@/lib/request-context", () => ({
  createContextFromHeaders: jest.fn().mockReturnValue({}),
  runWithRequestContext: jest.fn((_, fn) => fn()),
  getRequestId: jest.fn().mockReturnValue("test-request-id"),
  getRequestContext: jest.fn().mockReturnValue({ requestId: "test-request-id" }),
}));

// Mock unstable_cache to execute function immediately
jest.mock("next/cache", () => ({
  unstable_cache: jest.fn((fn) => fn),
}));

// Mock next/server NextResponse
jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> },
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

// Freeze listener count BEFORE importing route (Next.js 16 adds unhandledRejection listeners on import)
const preImportListenerCount = process.listeners("unhandledRejection").length;

import { GET } from "@/app/api/search/facets/route";
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

const mockQueryRawUnsafe = prisma.$queryRawUnsafe as jest.Mock;
const mockExecuteRawUnsafe = prisma.$executeRawUnsafe as jest.Mock;

// Clean up Next.js 16 unhandledRejection listeners that cause recursive setImmediate
// stack overflow during Jest teardown (see: next/src/server/node-environment-extensions)
// Use preImport count since Next.js adds listeners during module initialization
afterEach(() => {
  const listeners = process.listeners("unhandledRejection");
  if (listeners.length > preImportListenerCount) {
    listeners.slice(preImportListenerCount).forEach((l) => process.removeListener("unhandledRejection", l));
  }
});
afterAll(() => {
  const listeners = process.listeners("unhandledRejection");
  if (listeners.length > preImportListenerCount) {
    listeners.slice(preImportListenerCount).forEach((l) => process.removeListener("unhandledRejection", l));
  }
});

// Helper to create a mock NextRequest with searchParams
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

describe("/api/search/facets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteRawUnsafe.mockResolvedValue(undefined);
    // Default mock returns for each facet query
    mockQueryRawUnsafe
      // Amenities query
      .mockResolvedValueOnce([
        { amenity: "Wifi", count: BigInt(45) },
        { amenity: "Parking", count: BigInt(23) },
        { amenity: "Air Conditioning", count: BigInt(15) },
      ])
      // House rules query
      .mockResolvedValueOnce([
        { rule: "Pets allowed", count: BigInt(30) },
        { rule: "No smoking", count: BigInt(20) },
      ])
      // Room types query
      .mockResolvedValueOnce([
        { roomType: "Private Room", count: BigInt(50) },
        { roomType: "Shared Room", count: BigInt(20) },
      ])
      // Price ranges query
      .mockResolvedValueOnce([{ min: 500, max: 3000, median: 1200 }])
      // Price histogram query (5th call, triggered when min < max)
      .mockResolvedValueOnce([
        { bucket_min: 500, count: BigInt(10) },
        { bucket_min: 1000, count: BigInt(20) },
        { bucket_min: 1500, count: BigInt(15) },
      ]);
  });

  describe("response structure", () => {
    // All structure tests need bounds to avoid the empty-facets early return
    const boundsParams = {
      minLng: "-97.8",
      maxLng: "-97.6",
      minLat: "30.2",
      maxLat: "30.4",
    };

    it("should set a literal statement timeout before facet queries", async () => {
      const request = createRequest(boundsParams);

      await GET(request);

      expect(mockExecuteRawUnsafe).toHaveBeenCalled();
      const timeoutSql = mockExecuteRawUnsafe.mock.calls[0][0];
      expect(timeoutSql).toBe("SET LOCAL statement_timeout = 5000");
      expect(timeoutSql).not.toContain("$1");
    });

    it("should return facets with correct structure", async () => {
      const request = createRequest(boundsParams);
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty("amenities");
      expect(data).toHaveProperty("houseRules");
      expect(data).toHaveProperty("roomTypes");
      expect(data).toHaveProperty("priceRanges");
    });

    it("should return amenities as Record<string, number>", async () => {
      const request = createRequest(boundsParams);
      const response = await GET(request);
      const data = await response.json();

      expect(data.amenities).toEqual({
        Wifi: 45,
        Parking: 23,
        "Air Conditioning": 15,
      });
    });

    it("should return house rules as Record<string, number>", async () => {
      const request = createRequest(boundsParams);
      const response = await GET(request);
      const data = await response.json();

      expect(data.houseRules).toEqual({
        "Pets allowed": 30,
        "No smoking": 20,
      });
    });

    it("should return room types as Record<string, number>", async () => {
      const request = createRequest(boundsParams);
      const response = await GET(request);
      const data = await response.json();

      expect(data.roomTypes).toEqual({
        "Private Room": 50,
        "Shared Room": 20,
      });
    });

    it("should return price ranges with min, max, median", async () => {
      const request = createRequest(boundsParams);
      const response = await GET(request);
      const data = await response.json();

      expect(data.priceRanges).toEqual({
        min: 500,
        max: 3000,
        median: 1200,
      });
    });
  });

  describe("filter params handling", () => {
    it("should apply bounds filter to queries", async () => {
      const request = createRequest({
        minLng: "-97.8",
        maxLng: "-97.6",
        minLat: "30.2",
        maxLat: "30.4",
      });

      await GET(request);

      // Check that all queries included bounds
      expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(5);
      // First call (amenities) should include bounds params
      const firstCallQuery = mockQueryRawUnsafe.mock.calls[0][0];
      expect(firstCallQuery).toContain("ST_MakeEnvelope");
    });

    it("should apply price filter to non-price facets", async () => {
      const request = createRequest({
        minPrice: "500",
        maxPrice: "2000",
        minLng: "-97.8",
        maxLng: "-97.6",
        minLat: "30.2",
        maxLat: "30.4",
      });

      await GET(request);

      // Amenities query (first call) should include price filter
      const amenitiesQuery = mockQueryRawUnsafe.mock.calls[0][0];
      expect(amenitiesQuery).toContain("d.price >=");
      expect(amenitiesQuery).toContain("d.price <=");

      // Price ranges query (fourth call) should NOT include price filter
      const priceQuery = mockQueryRawUnsafe.mock.calls[3][0];
      expect(priceQuery).not.toContain("d.price >=");
      expect(priceQuery).not.toContain("d.price <=");
    });

    it("should apply roomType filter to non-roomType facets", async () => {
      const request = createRequest({
        roomType: "Private Room",
        minLng: "-97.8",
        maxLng: "-97.6",
        minLat: "30.2",
        maxLat: "30.4",
      });

      await GET(request);

      // Amenities query should include room type filter
      const amenitiesQuery = mockQueryRawUnsafe.mock.calls[0][0];
      expect(amenitiesQuery.toLowerCase()).toContain("room_type");

      // Room types query should NOT include room type filter
      const roomTypesQuery = mockQueryRawUnsafe.mock.calls[2][0];
      // The query groups by room_type but shouldn't filter by it
      expect(roomTypesQuery).toContain("GROUP BY d.room_type");
    });

    it("should apply text search filter", async () => {
      // Note: P1 fix requires bounds when query is present
      const request = createRequest({
        q: "austin",
        minLng: "-97.8",
        maxLng: "-97.6",
        minLat: "30.2",
        maxLat: "30.4",
      });

      await GET(request);

      // All queries should include text search (using FTS after P2a fix)
      const amenitiesQuery = mockQueryRawUnsafe.mock.calls[0][0];
      expect(amenitiesQuery).toContain("plainto_tsquery");
    });
  });

  describe("empty results handling", () => {
    it("should return empty objects when no data", async () => {
      mockQueryRawUnsafe.mockReset();
      mockQueryRawUnsafe
        .mockResolvedValueOnce([]) // Empty amenities
        .mockResolvedValueOnce([]) // Empty house rules
        .mockResolvedValueOnce([]) // Empty room types
        .mockResolvedValueOnce([{ min: null, max: null, median: null }]); // Null price ranges

      const request = createRequest({
        minLng: "-97.8",
        maxLng: "-97.6",
        minLat: "30.2",
        maxLat: "30.4",
      });
      const response = await GET(request);
      const data = await response.json();

      expect(data.amenities).toEqual({});
      expect(data.houseRules).toEqual({});
      expect(data.roomTypes).toEqual({});
      expect(data.priceRanges).toEqual({
        min: null,
        max: null,
        median: null,
      });
    });
  });

  describe("error handling", () => {
    it("should return 500 on database error", async () => {
      mockQueryRawUnsafe.mockReset();
      mockQueryRawUnsafe.mockRejectedValue(new Error("Database error"));

      const request = createRequest({
        minLng: "-97.8",
        maxLng: "-97.6",
        minLat: "30.2",
        maxLat: "30.4",
      });
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toHaveProperty("error");
    });
  });

  describe("headers", () => {
    it("should include cache control headers", async () => {
      const request = createRequest({
        minLng: "-97.8",
        maxLng: "-97.6",
        minLat: "30.2",
        maxLat: "30.4",
      });
      const response = await GET(request);

      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("X-Cache-TTL")).toBe("30");
    });
  });

  describe("rate limiting integration", () => {
    it("should return rate limit response when limited", async () => {
      // Override rate limit mock to return a response
      const mockRateLimitResponse = {
        status: 429,
        json: async () => ({ error: "Too many requests" }),
      };
      jest
        .mocked(
          (await import("@/lib/with-rate-limit-redis")).withRateLimitRedis,
        )
        .mockResolvedValueOnce(mockRateLimitResponse as never);

      const request = createRequest();
      const response = await GET(request);

      expect(response.status).toBe(429);
    });
  });
});

describe("bounds validation (P1 - DoS prevention)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 with boundsRequired when query present without bounds", async () => {
    // No DB calls should happen - validation should reject early
    const request = createRequest({ q: "austin" }); // no bounds
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.boundsRequired).toBe(true);
    expect(data.error).toBeDefined();
  });

  it("allows query with valid bounds (200 status)", async () => {
    // Setup mocks for DB calls
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ amenity: "Wifi", count: BigInt(45) }])
      .mockResolvedValueOnce([{ rule: "No smoking", count: BigInt(20) }])
      .mockResolvedValueOnce([{ roomType: "Private Room", count: BigInt(50) }])
      .mockResolvedValueOnce([{ min: 500, max: 3000, median: 1200 }])
      .mockResolvedValueOnce([{ bucket_min: 500, count: BigInt(10) }]);

    const request = createRequest({
      q: "austin",
      minLng: "-97.8",
      maxLng: "-97.6",
      minLat: "30.2",
      maxLat: "30.4",
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    // Verify DB was actually queried
    expect(mockQueryRawUnsafe).toHaveBeenCalled();
  });

  it("clamps oversized bounds silently and proceeds with 200", async () => {
    // Setup mocks for DB calls - should succeed after clamping
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ amenity: "Wifi", count: BigInt(45) }])
      .mockResolvedValueOnce([{ rule: "No smoking", count: BigInt(20) }])
      .mockResolvedValueOnce([{ roomType: "Private Room", count: BigInt(50) }])
      .mockResolvedValueOnce([{ min: 500, max: 3000, median: 1200 }])
      .mockResolvedValueOnce([{ bucket_min: 500, count: BigInt(10) }]);

    const request = createRequest({
      q: "austin",
      minLng: "-180",
      maxLng: "180", // 360° span - way oversized
      minLat: "-85",
      maxLat: "85", // 170° span - way oversized
    });
    const response = await GET(request);

    // Should clamp silently and proceed, not return 400
    expect(response.status).toBe(200);
    // Verify DB was queried (bounds were clamped, not rejected)
    expect(mockQueryRawUnsafe).toHaveBeenCalled();
  });

  it("returns 400 for invalid coordinate values (NaN)", async () => {
    const request = createRequest({
      q: "austin",
      minLng: "invalid",
      maxLng: "-97.6",
      minLat: "30.2",
      maxLat: "30.4",
    });
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it("returns empty facets for unbounded browse (no query, no bounds) to prevent DoS", async () => {
    // No query param, no bounds — should return empty facets without hitting DB
    const request = createRequest({});
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    // Should return empty facets, not run 5 GROUP BY scans
    expect(data.amenities).toEqual({});
    expect(data.houseRules).toEqual({});
    expect(data.roomTypes).toEqual({});
    expect(data.priceRanges).toEqual({ min: null, max: null, median: null });
    expect(data.priceHistogram).toBeNull();
    // DB should NOT be queried
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
  });
});

describe("FTS text search (P2a - semantic alignment)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default mocks for all facet queries
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ amenity: "Wifi", count: BigInt(45) }])
      .mockResolvedValueOnce([{ rule: "No smoking", count: BigInt(20) }])
      .mockResolvedValueOnce([{ roomType: "Private Room", count: BigInt(50) }])
      .mockResolvedValueOnce([{ min: 500, max: 3000, median: 1200 }])
      .mockResolvedValueOnce([{ bucket_min: 500, count: BigInt(10) }]);
  });

  it("uses plainto_tsquery for text search instead of LIKE", async () => {
    const request = createRequest({
      q: "austin",
      minLng: "-97.8",
      maxLng: "-97.6",
      minLat: "30.2",
      maxLat: "30.4",
    });

    await GET(request);

    // Verify FTS is used (plainto_tsquery) instead of LIKE
    const amenitiesQuery = mockQueryRawUnsafe.mock.calls[0][0];
    expect(amenitiesQuery).toContain("plainto_tsquery");
    expect(amenitiesQuery.toLowerCase()).not.toContain("like");
  });

  it("uses search_tsv column for FTS", async () => {
    const request = createRequest({
      q: "downtown",
      minLng: "-97.8",
      maxLng: "-97.6",
      minLat: "30.2",
      maxLat: "30.4",
    });

    await GET(request);

    const amenitiesQuery = mockQueryRawUnsafe.mock.calls[0][0];
    expect(amenitiesQuery).toContain("search_tsv");
    expect(amenitiesQuery).toContain("@@");
  });

  it("handles multi-word queries with FTS", async () => {
    const request = createRequest({
      q: "downtown austin",
      minLng: "-97.8",
      maxLng: "-97.6",
      minLat: "30.2",
      maxLat: "30.4",
    });

    await GET(request);

    // Multi-word queries should still use FTS
    const amenitiesQuery = mockQueryRawUnsafe.mock.calls[0][0];
    expect(amenitiesQuery).toContain("plainto_tsquery");
  });
});

describe("P2-NEW: lat/lng bounds derivation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default mocks for all facet queries
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ amenity: "Wifi", count: BigInt(45) }])
      .mockResolvedValueOnce([{ rule: "No smoking", count: BigInt(20) }])
      .mockResolvedValueOnce([{ roomType: "Private Room", count: BigInt(50) }])
      .mockResolvedValueOnce([{ min: 500, max: 3000, median: 1200 }])
      .mockResolvedValueOnce([{ bucket_min: 500, count: BigInt(10) }]);
  });

  it("accepts q+lat+lng without explicit bounds (normal SearchForm flow)", async () => {
    const request = createRequest({
      q: "austin",
      lat: "30.2672",
      lng: "-97.7431",
      // No explicit minLat/maxLat/minLng/maxLng - should derive from lat/lng
    });
    const response = await GET(request);

    // Should succeed - parseSearchParams derives bounds from lat/lng
    expect(response.status).toBe(200);
    // Verify DB was queried
    expect(mockQueryRawUnsafe).toHaveBeenCalled();
  });

  it("still returns 400 for q with no location info at all", async () => {
    mockQueryRawUnsafe.mockReset(); // Should not be called

    const request = createRequest({
      q: "austin",
      // No lat/lng, no bounds - should fail
    });
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.boundsRequired).toBe(true);
    // DB should NOT be queried - validation rejects early
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
  });

  it("uses derived bounds (~10km radius) from lat/lng in query", async () => {
    const request = createRequest({
      q: "test",
      lat: "30.0",
      lng: "-97.0",
    });
    await GET(request);

    // Verify query uses derived bounds (ST_MakeEnvelope call)
    expect(mockQueryRawUnsafe).toHaveBeenCalled();
    const amenitiesQuery = mockQueryRawUnsafe.mock.calls[0][0];
    expect(amenitiesQuery).toContain("ST_MakeEnvelope");
  });
});

describe("facet exclusion logic", () => {
  const boundsParams = {
    minLng: "-97.8",
    maxLng: "-97.6",
    minLat: "30.2",
    maxLat: "30.4",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should exclude amenities filter when querying amenities facet", async () => {
    // Setup mocks for this specific test
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ amenity: "Wifi", count: BigInt(100) }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ min: null, max: null, median: null }]);

    const request = createRequest({
      ...boundsParams,
      amenities: "Wifi,Parking",
    });

    await GET(request);

    // Amenities query should NOT filter by amenities
    const amenitiesQuery = mockQueryRawUnsafe.mock.calls[0][0];
    expect(amenitiesQuery).not.toContain("amenities_lower");

    // House rules query SHOULD include amenities filter
    const houseRulesQuery = mockQueryRawUnsafe.mock.calls[1][0];
    expect(houseRulesQuery).toContain("amenities_lower");
  });

  it("should exclude houseRules filter when querying houseRules facet", async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ rule: "Pets allowed", count: BigInt(50) }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ min: null, max: null, median: null }]);

    const request = createRequest({
      ...boundsParams,
      houseRules: "Pets allowed",
    });

    await GET(request);

    // House rules query should NOT filter by house rules
    const houseRulesQuery = mockQueryRawUnsafe.mock.calls[1][0];
    expect(houseRulesQuery).not.toContain("house_rules_lower @>");

    // Amenities query SHOULD include house rules filter
    const amenitiesQuery = mockQueryRawUnsafe.mock.calls[0][0];
    expect(amenitiesQuery).toContain("house_rules_lower @>");
  });
});
