/**
 * Tests for map-listings API route
 *
 * Validates bounds parameter handling, rate limiting, and error responses.
 */

// Mock dependencies before imports
jest.mock("@/lib/data", () => ({
  getMapListings: jest.fn(),
}));

jest.mock("@/lib/with-rate-limit-redis", () => ({
  withRateLimitRedis: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/search-rate-limit-identifier", () => ({
  getSearchRateLimitIdentifier: jest.fn().mockResolvedValue("127.0.0.1"),
}));

jest.mock("@/lib/request-context", () => ({
  createContextFromHeaders: jest
    .fn()
    .mockReturnValue({ requestId: "test-123" }),
  runWithRequestContext: jest.fn((ctx, fn) => fn()),
  getRequestId: jest.fn().mockReturnValue("test-request-id"),
}));

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

import { GET } from "@/app/api/map-listings/route";
import { getMapListings } from "@/lib/data";
import { withRateLimitRedis } from "@/lib/with-rate-limit-redis";
import { NextRequest } from "next/server";

/**
 * Helper to create a NextRequest with searchParams
 */
function createRequest(params: Record<string, string> = {}): NextRequest {
  const searchParams = new URLSearchParams(params);
  const url = `http://localhost/api/map-listings?${searchParams.toString()}`;
  const request = {
    nextUrl: {
      searchParams,
    },
    headers: new Headers(),
  } as unknown as NextRequest;
  return request;
}

describe("Map Listings API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/map-listings", () => {
    describe("bounds validation", () => {
      it("returns 400 when bounds are missing", async () => {
        const request = createRequest({});

        const response = await GET(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toContain("bounds");
      });

      it("returns 400 when only partial bounds provided", async () => {
        const request = createRequest({
          minLng: "-122.5",
          maxLng: "-122.0",
          // Missing minLat and maxLat
        });

        const response = await GET(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toContain("bounds");
      });

      it("returns 400 for NaN coordinate values", async () => {
        const request = createRequest({
          minLng: "NaN",
          maxLng: "-122.0",
          minLat: "37.0",
          maxLat: "38.0",
        });

        const response = await GET(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe("Invalid coordinate values");
      });

      it("returns 400 for non-numeric coordinate values", async () => {
        const request = createRequest({
          minLng: "abc",
          maxLng: "-122.0",
          minLat: "37.0",
          maxLat: "38.0",
        });

        const response = await GET(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe("Invalid coordinate values");
      });

      it("clamps oversized viewport bounds instead of rejecting (P1-5)", async () => {
        const mockListings = [{ id: "1", title: "Test Listing" }];
        (getMapListings as jest.Mock).mockResolvedValue(mockListings);

        const request = createRequest({
          minLng: "-135.0",
          maxLng: "-120.0", // 15 degree span > 10 degree limit
          minLat: "28.0",
          maxLat: "43.0", // 15 degree span > 10 degree limit
        });

        const response = await GET(request);

        // P1-5: Should clamp and succeed, not reject
        expect(response.status).toBe(200);

        // Verify bounds were clamped to max span (10 degrees)
        expect(getMapListings).toHaveBeenCalledWith(
          expect.objectContaining({
            bounds: expect.objectContaining({
              // Center preserved, span reduced to 10
              minLng: expect.any(Number),
              maxLng: expect.any(Number),
              minLat: expect.any(Number),
              maxLat: expect.any(Number),
            }),
          }),
        );

        // Verify clamped spans are within limits
        const call = (getMapListings as jest.Mock).mock.calls[0][0];
        const lngSpan = call.bounds.maxLng - call.bounds.minLng;
        const latSpan = call.bounds.maxLat - call.bounds.minLat;
        expect(lngSpan).toBeLessThanOrEqual(10); // MAX_LNG_SPAN
        expect(latSpan).toBeLessThanOrEqual(10); // MAX_LAT_SPAN
      });

      it("returns 400 for latitude out of range", async () => {
        const request = createRequest({
          minLng: "-122.5",
          maxLng: "-122.0",
          minLat: "-90.0", // Below -85 limit
          maxLat: "-88.0",
        });

        const response = await GET(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toContain("Latitude out of range");
      });

      it("returns 400 for invalid latitude range (min >= max)", async () => {
        const request = createRequest({
          minLng: "-122.5",
          maxLng: "-122.0",
          minLat: "38.0",
          maxLat: "37.0", // minLat > maxLat
        });

        const response = await GET(request);

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toContain("Invalid latitude range");
      });
    });

    describe("rate limiting", () => {
      it("returns rate limit response when rate limited", async () => {
        const rateLimitResponse = {
          status: 429,
          json: async () => ({ error: "Too many requests", retryAfter: 60 }),
          headers: {
            get: (key: string) => (key === "Retry-After" ? "60" : null),
          },
        };
        (withRateLimitRedis as jest.Mock).mockResolvedValueOnce(
          rateLimitResponse,
        );

        const request = createRequest({
          minLng: "-122.5",
          maxLng: "-122.0",
          minLat: "37.5",
          maxLat: "38.0",
        });

        const response = await GET(request);

        expect(response.status).toBe(429);
      });
    });

    describe("successful responses", () => {
      it("returns listings for valid bounds", async () => {
        const mockListings = [
          { id: "1", title: "Test Listing 1" },
          { id: "2", title: "Test Listing 2" },
        ];
        (getMapListings as jest.Mock).mockResolvedValue(mockListings);

        const request = createRequest({
          minLng: "-122.5",
          maxLng: "-122.0",
          minLat: "37.5",
          maxLat: "38.0",
        });

        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.listings).toEqual(mockListings);
      });

      it("includes x-request-id header in successful response", async () => {
        (getMapListings as jest.Mock).mockResolvedValue([]);

        const request = createRequest({
          minLng: "-122.5",
          maxLng: "-122.0",
          minLat: "37.5",
          maxLat: "38.0",
        });

        const response = await GET(request);

        expect(response.headers.get("x-request-id")).toBe("test-request-id");
      });

      it("includes x-request-id header in error response", async () => {
        const request = createRequest({
          minLng: "NaN",
          maxLng: "-122.0",
          minLat: "37.0",
          maxLat: "38.0",
        });

        const response = await GET(request);

        expect(response.status).toBe(400);
        expect(response.headers.get("x-request-id")).toBe("test-request-id");
      });

      it("passes filter parameters to getMapListings", async () => {
        (getMapListings as jest.Mock).mockResolvedValue([]);

        const request = createRequest({
          minLng: "-122.5",
          maxLng: "-122.0",
          minLat: "37.5",
          maxLat: "38.0",
          q: "cozy room",
          minPrice: "500",
          maxPrice: "1500",
          amenities: "WiFi,AC",
        });

        await GET(request);

        expect(getMapListings).toHaveBeenCalledWith(
          expect.objectContaining({
            query: "cozy room",
            minPrice: 500,
            maxPrice: 1500,
            // Canonical parser normalizes amenities to allowlist casing: "WiFi" -> "Wifi"
            amenities: ["Wifi", "AC"],
            bounds: {
              minLng: -122.5,
              maxLng: -122.0,
              minLat: 37.5,
              maxLat: 38.0,
            },
          }),
        );
      });
    });

    describe("error handling", () => {
      it("returns 500 for database errors", async () => {
        (getMapListings as jest.Mock).mockRejectedValue(new Error("DB Error"));

        const request = createRequest({
          minLng: "-122.5",
          maxLng: "-122.0",
          minLat: "37.5",
          maxLat: "38.0",
        });

        const response = await GET(request);

        expect(response.status).toBe(500);
        const data = await response.json();
        expect(data.error).toBe("Failed to fetch map listings");
      });

      it("includes x-request-id in 500 error response", async () => {
        (getMapListings as jest.Mock).mockRejectedValue(new Error("DB Error"));

        const request = createRequest({
          minLng: "-122.5",
          maxLng: "-122.0",
          minLat: "37.5",
          maxLat: "38.0",
        });

        const response = await GET(request);

        expect(response.headers.get("x-request-id")).toBe("test-request-id");
      });
    });
  });
});
