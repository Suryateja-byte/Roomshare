/**
 * Integration tests for Search API v2 route
 *
 * Tests feature flag gating, response format, and mode determination.
 */

// Mock data module
jest.mock("@/lib/data", () => ({
  getListingsPaginated: jest.fn(),
  getMapListings: jest.fn(),
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
  };
});

// Import the mocked features for modification in tests
import { features } from "@/lib/env";
const mockFeatures = features as { searchV2: boolean };

import { GET } from "@/app/api/search/v2/route";
import { getListingsPaginated, getMapListings } from "@/lib/data";
import { NextRequest } from "next/server";
import type {
  ListingData,
  MapListingData,
  PaginatedResultHybrid,
} from "@/lib/data";

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

// Helper to create a mock NextRequest with multi-value params (for repeated keys like amenities=X&amenities=Y)
function createRequestWithMultiParams(params: [string, string][]): NextRequest {
  const searchParams = new URLSearchParams();
  params.forEach(([key, value]) => searchParams.append(key, value));
  return {
    nextUrl: { searchParams },
    headers: new Headers(),
  } as unknown as NextRequest;
}

// Mock listing data factory
function createMockListingData(
  id: string,
  overrides: Partial<ListingData> = {},
): ListingData {
  return {
    id,
    title: `Listing ${id}`,
    description: "Test listing",
    price: 1500,
    images: ["img.jpg"],
    availableSlots: 1,
    totalSlots: 1,
    amenities: [],
    houseRules: [],
    householdLanguages: [],
    location: {
      address: "123 Test St",
      city: "San Francisco",
      state: "CA",
      zip: "94102",
      lat: 37.7749,
      lng: -122.4194,
    },
    isNearMatch: false,
    ...overrides,
  };
}

// Mock map listing data factory
function createMockMapListingData(
  id: string,
  lat: number = 37.7749,
  lng: number = -122.4194,
): MapListingData {
  return {
    id,
    compactTitle: `Listing ${id}`,
    price: 1500,
    availableSlots: 1,

    thumbnailUrl: "img.jpg",
    location: { lat, lng },
  };
}

describe("Search API v2 route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFeatures.searchV2 = false; // Reset to disabled
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

      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: [],
        hasNextPage: false,
        hasPrevPage: false,
        total: 0,
        totalPages: 0,
        page: 1,
        limit: 20,
      };
      const mockMapListings: MapListingData[] = [];

      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue(mockMapListings);

      const request = createRequest();
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it("should return 200 when ?v2=1 param is set", async () => {
      mockFeatures.searchV2 = false;

      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: [],
        hasNextPage: false,
        hasPrevPage: false,
        total: 0,
        totalPages: 0,
        page: 1,
        limit: 20,
      };
      const mockMapListings: MapListingData[] = [];

      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue(mockMapListings);

      const request = createRequest({ v2: "1" });
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it("should return 200 when ?v2=true param is set", async () => {
      mockFeatures.searchV2 = false;

      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: [],
        hasNextPage: false,
        hasPrevPage: false,
        total: 0,
        totalPages: 0,
        page: 1,
        limit: 20,
      };
      const mockMapListings: MapListingData[] = [];

      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue(mockMapListings);

      const request = createRequest({ v2: "true" });
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe("Response format", () => {
    beforeEach(() => {
      mockFeatures.searchV2 = true;
    });

    it("should return correct response structure", async () => {
      const mockListings = [createMockListingData("1")];
      const mockMapListings = [createMockMapListingData("1")];

      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: mockListings,
        hasNextPage: false,
        hasPrevPage: false,
        total: 1,
        totalPages: 1,
        page: 1,
        limit: 20,
      };

      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue(mockMapListings);

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
      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: [],
        hasNextPage: false,
        hasPrevPage: false,
        total: 0,
        totalPages: 0,
        page: 1,
        limit: 20,
      };
      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue([]);

      const request = createRequest();
      const response = await GET(request);

      expect(response.headers.get("x-request-id")).toBe("test-request-id");
    });

    it("should include Cache-Control header", async () => {
      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: [],
        hasNextPage: false,
        hasPrevPage: false,
        total: 0,
        totalPages: 0,
        page: 1,
        limit: 20,
      };
      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue([]);

      const request = createRequest();
      const response = await GET(request);

      expect(response.headers.get("Cache-Control")).toContain("s-maxage=60");
    });
  });

  describe("Mode determination", () => {
    beforeEach(() => {
      mockFeatures.searchV2 = true;
    });

    it("should return mode='pins' when mapListings < 50", async () => {
      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: [],
        hasNextPage: false,
        hasPrevPage: false,
        total: 0,
        totalPages: 0,
        page: 1,
        limit: 20,
      };
      // 30 map listings (below threshold)
      const mockMapListings = Array.from({ length: 30 }, (_, i) =>
        createMockMapListingData(`${i}`, 37.7749 + i * 0.01, -122.4194),
      );

      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue(mockMapListings);

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.meta.mode).toBe("pins");
      expect(data.map.pins).toBeDefined();
      expect(Array.isArray(data.map.pins)).toBe(true);
    });

    it("should return mode='geojson' when mapListings >= 50", async () => {
      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: [],
        hasNextPage: false,
        hasPrevPage: false,
        total: 0,
        totalPages: 0,
        page: 1,
        limit: 20,
      };
      // 50 map listings (at threshold)
      const mockMapListings = Array.from({ length: 50 }, (_, i) =>
        createMockMapListingData(`${i}`, 37.7749 + i * 0.01, -122.4194),
      );

      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue(mockMapListings);

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.meta.mode).toBe("geojson");
      expect(data.map.pins).toBeUndefined();
    });

    it("should always include geojson regardless of mode", async () => {
      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: [],
        hasNextPage: false,
        hasPrevPage: false,
        total: 0,
        totalPages: 0,
        page: 1,
        limit: 20,
      };

      // Test with sparse results
      const sparseMapListings = [createMockMapListingData("1")];
      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue(sparseMapListings);

      const sparseRequest = createRequest();
      const sparseResponse = await GET(sparseRequest);
      const sparseData = await sparseResponse.json();

      expect(sparseData.map.geojson).toBeDefined();
      expect(sparseData.map.geojson.type).toBe("FeatureCollection");

      // Test with dense results
      const denseMapListings = Array.from({ length: 100 }, (_, i) =>
        createMockMapListingData(`${i}`),
      );
      (getMapListings as jest.Mock).mockResolvedValue(denseMapListings);

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

    it("should return nextCursor when hasNextPage is true", async () => {
      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: [createMockListingData("1")],
        hasNextPage: true,
        hasPrevPage: false,
        total: 100,
        totalPages: 5,
        page: 1,
        limit: 20,
      };

      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue([]);

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.list.nextCursor).not.toBeNull();
      expect(typeof data.list.nextCursor).toBe("string");
    });

    it("should return null nextCursor when hasNextPage is false", async () => {
      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: [createMockListingData("1")],
        hasNextPage: false,
        hasPrevPage: false,
        total: 1,
        totalPages: 1,
        page: 1,
        limit: 20,
      };

      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue([]);

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

    it("should transform listings to correct list item format", async () => {
      const mockListings = [
        createMockListingData("test-id", {
          title: "Cozy Room",
          price: 1200,
          images: ["first.jpg", "second.jpg"],
          location: {
            address: "123 Test St",
            city: "San Francisco",
            state: "CA",
            zip: "94102",
            lat: 37.7749,
            lng: -122.4194,
          },
        }),
      ];

      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: mockListings,
        hasNextPage: false,
        hasPrevPage: false,
        total: 1,
        totalPages: 1,
        page: 1,
        limit: 20,
      };

      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue([]);

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

    it("should add near-match badge when isNearMatch is true", async () => {
      const mockListings = [createMockListingData("1", { isNearMatch: true })];

      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: mockListings,
        hasNextPage: false,
        hasPrevPage: false,
        total: 1,
        totalPages: 1,
        page: 1,
        limit: 20,
      };

      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue([]);

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.list.items[0].badges).toContain("near-match");
    });

    it("should add multi-room badge when totalSlots > 1", async () => {
      const mockListings = [createMockListingData("1", { totalSlots: 3 })];

      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: mockListings,
        hasNextPage: false,
        hasPrevPage: false,
        total: 1,
        totalPages: 1,
        page: 1,
        limit: 20,
      };

      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue([]);

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

    it("should return list results when map query fails", async () => {
      const mockListings = [createMockListingData("1")];
      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: mockListings,
        hasNextPage: false,
        hasPrevPage: false,
        total: 1,
        totalPages: 1,
        page: 1,
        limit: 20,
      };

      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockRejectedValue(
        new Error("Map query timeout"),
      );

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.list.items).toHaveLength(1);
      expect(data.list.items[0].id).toBe("1");
      expect(data.map.geojson.type).toBe("FeatureCollection");
      expect(data.map.geojson.features).toHaveLength(0);
    });

    it("should return empty results when list query fails", async () => {
      const mockMapListings = [createMockMapListingData("1")];

      (getListingsPaginated as jest.Mock).mockRejectedValue(
        new Error("Database error"),
      );
      (getMapListings as jest.Mock).mockResolvedValue(mockMapListings);

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("Search temporarily unavailable");
    });

    it("should return fully empty response when both queries fail", async () => {
      (getListingsPaginated as jest.Mock).mockRejectedValue(
        new Error("Database error"),
      );
      (getMapListings as jest.Mock).mockRejectedValue(
        new Error("Map query timeout"),
      );

      const request = createRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("Search temporarily unavailable");
    });
  });

  describe("Multi-select filter handling", () => {
    const mockListResult: PaginatedResultHybrid<ListingData> = {
      items: [],
      hasNextPage: false,
      hasPrevPage: false,
      total: 0,
      totalPages: 0,
      page: 1,
      limit: 20,
    };

    beforeEach(() => {
      mockFeatures.searchV2 = true;
      jest.clearAllMocks();
      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue([]);
    });

    it("should preserve multiple amenities from repeated URL params", async () => {
      const request = createRequestWithMultiParams([
        ["amenities", "Wifi"],
        ["amenities", "AC"],
        ["amenities", "Parking"],
      ]);

      await GET(request);

      expect(getListingsPaginated).toHaveBeenCalledWith(
        expect.objectContaining({
          amenities: expect.arrayContaining(["Wifi", "AC", "Parking"]),
        }),
      );
    });

    it("should preserve multiple languages from repeated URL params", async () => {
      const request = createRequestWithMultiParams([
        ["languages", "English"],
        ["languages", "Telugu"],
      ]);

      await GET(request);

      expect(getListingsPaginated).toHaveBeenCalledWith(
        expect.objectContaining({
          languages: expect.arrayContaining(["en", "te"]),
        }),
      );
    });

    it("should preserve multiple houseRules from repeated URL params", async () => {
      const request = createRequestWithMultiParams([
        ["houseRules", "Pets allowed"],
        ["houseRules", "Smoking allowed"],
      ]);

      await GET(request);

      expect(getListingsPaginated).toHaveBeenCalledWith(
        expect.objectContaining({
          houseRules: expect.arrayContaining(["Pets allowed", "Smoking allowed"]),
        }),
      );
    });
  });

  describe("Unbounded search blocking", () => {
    beforeEach(() => {
      mockFeatures.searchV2 = true;
      jest.clearAllMocks();
    });

    it("should return empty results with unboundedSearch flag when query without bounds", async () => {
      // This simulates ?q=Boston without lat/lng or bounds
      const request = createRequest({ q: "Boston" });

      const response = await GET(request);
      const data = await response.json();

      // Should return 200 with empty results and unboundedSearch indicator
      expect(response.status).toBe(200);
      expect(data.unboundedSearch).toBe(true);
      expect(data.list).toBeNull();
      expect(data.map).toBeNull();

      // getListingsPaginated should NOT be called for unbounded searches
      expect(getListingsPaginated).not.toHaveBeenCalled();
      expect(getMapListings).not.toHaveBeenCalled();
    });

    it("should proceed normally when query has bounds", async () => {
      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: [],
        hasNextPage: false,
        hasPrevPage: false,
        total: 0,
        totalPages: 0,
        page: 1,
        limit: 20,
      };

      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue([]);

      // This simulates ?q=Boston&lat=42.36&lng=-71.06
      const request = createRequest({
        q: "Boston",
        lat: "42.36",
        lng: "-71.06",
      });

      const response = await GET(request);
      const data = await response.json();

      // Should return 200 with results
      expect(response.status).toBe(200);
      expect(data.unboundedSearch).toBeUndefined();
      expect(data.list).toBeDefined();
      expect(data.map).toBeDefined();

      // getListingsPaginated should be called with bounds
      expect(getListingsPaginated).toHaveBeenCalled();
    });

    it("should proceed normally when no query (browse mode)", async () => {
      const mockListResult: PaginatedResultHybrid<ListingData> = {
        items: [],
        hasNextPage: false,
        hasPrevPage: false,
        total: 0,
        totalPages: 0,
        page: 1,
        limit: 20,
      };

      (getListingsPaginated as jest.Mock).mockResolvedValue(mockListResult);
      (getMapListings as jest.Mock).mockResolvedValue([]);

      // No query, no bounds - browse mode (allowed)
      const request = createRequest({});

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.unboundedSearch).toBeUndefined();
      expect(data.list).toBeDefined();

      // getListingsPaginated should be called
      expect(getListingsPaginated).toHaveBeenCalled();
    });
  });
});
