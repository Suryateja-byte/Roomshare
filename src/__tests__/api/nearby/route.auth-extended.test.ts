/**
 * Tests for /api/nearby route - Extended Guest Access Edge Cases
 * Verifies session-like variations do not block guest nearby search.
 */

// Mock NextResponse before importing the route
const mockJsonFn = jest.fn();
jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: any,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      mockJsonFn(data, init);
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: new Map(Object.entries(init?.headers || {})),
      };
    },
  },
}));

// Mock auth
jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

// Mock rate limiting to return null (allow request)
jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

// Mock fetch for Radar API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { POST } from "@/app/api/nearby/route";
import { auth } from "@/auth";

describe("POST /api/nearby - Extended Guest Access Edge Cases", () => {
  const validRequest = {
    listingLat: 37.7749,
    listingLng: -122.4194,
    radiusMeters: 1609,
    categories: ["food-grocery"],
  };

  function createRequest(body: any): Request {
    return new Request("http://localhost/api/nearby", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  function mockRadarSuccess() {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ meta: { code: 200 }, places: [] }),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RADAR_SECRET_KEY = "test-radar-key";
  });

  afterEach(() => {
    delete process.env.RADAR_SECRET_KEY;
  });

  describe("Malformed Session Shapes", () => {
    it("allows nearby search when auth resolves to an empty string user ID", async () => {
      mockRadarSuccess();
      (auth as jest.Mock).mockResolvedValue({
        user: {
          id: "",
          name: "Test User",
          email: "test@example.com",
        },
      });

      const response = await POST(createRequest(validRequest));

      expect(response.status).toBe(200);
      expect(auth).not.toHaveBeenCalled();
    });

    it("allows nearby search when auth resolves to a whitespace-only user ID", async () => {
      mockRadarSuccess();
      (auth as jest.Mock).mockResolvedValue({
        user: {
          id: "   ",
          name: "Test User",
          email: "test@example.com",
        },
      });

      const response = await POST(createRequest(validRequest));

      expect(response.status).toBe(200);
      expect(auth).not.toHaveBeenCalled();
    });

    it("allows nearby search when auth resolves to null session", async () => {
      mockRadarSuccess();
      (auth as jest.Mock).mockResolvedValue(null);

      const response = await POST(createRequest(validRequest));

      expect(response.status).toBe(200);
      expect(auth).not.toHaveBeenCalled();
    });

    it("allows nearby search when auth resolves to undefined session", async () => {
      mockRadarSuccess();
      (auth as jest.Mock).mockResolvedValue(undefined);

      const response = await POST(createRequest(validRequest));

      expect(response.status).toBe(200);
      expect(auth).not.toHaveBeenCalled();
    });

    it("allows nearby search when auth resolves to a session without a user", async () => {
      mockRadarSuccess();
      (auth as jest.Mock).mockResolvedValue({
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      const response = await POST(createRequest(validRequest));

      expect(response.status).toBe(200);
      expect(auth).not.toHaveBeenCalled();
    });
  });

  describe("Request Success Remains Stable", () => {
    it("still succeeds for a normal request payload", async () => {
      mockRadarSuccess();

      const response = await POST(createRequest(validRequest));

      expect(response.status).toBe(200);
    });
  });
});
