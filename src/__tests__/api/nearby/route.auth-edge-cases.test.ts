/**
 * Guest Access Edge Cases Tests
 *
 * Tests that nearby search remains available even when auth state is absent
 * or unstable because the web listing experience now allows guest access.
 *
 * @see Plan Category B - Auth/Session Edge Cases (10 tests)
 */

// Mock NextResponse before importing the route
const mockJsonFn = jest.fn();
jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
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

// Mock auth to verify the route no longer depends on it
jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

// Mock rate limiting
jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

// Mock fetch for Radar API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { POST } from "@/app/api/nearby/route";
import { auth } from "@/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { mockRadarPlace } from "@/__tests__/utils/mocks/radar-api.mock";

describe("POST /api/nearby - Guest Access Edge Cases", () => {
  const validRequestBody = {
    listingLat: 37.7749,
    listingLng: -122.4194,
    categories: ["food-grocery"],
    radiusMeters: 1609,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RADAR_SECRET_KEY = "test-secret-key";
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ meta: { code: 200 }, places: [mockRadarPlace] }),
    });
  });

  afterEach(() => {
    delete process.env.RADAR_SECRET_KEY;
  });

  const createRequest = (body: unknown): Request => {
    return {
      json: async () => body,
      url: "http://localhost:3000/api/nearby",
      headers: new Headers(),
    } as unknown as Request;
  };

  describe("B1: Missing Session State", () => {
    it("allows nearby search when session is null", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const response = await POST(createRequest(validRequestBody));

      expect(response.status).toBe(200);
      expect(auth).not.toHaveBeenCalled();
    });
  });

  describe("B2: Malformed Session Shapes", () => {
    it("allows nearby search when session user is undefined", async () => {
      (auth as jest.Mock).mockResolvedValue({ expires: "2025-01-01" });

      const response = await POST(createRequest(validRequestBody));

      expect(response.status).toBe(200);
      expect(auth).not.toHaveBeenCalled();
    });

    it("allows nearby search when session user id is missing", async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { name: "Test User", email: "test@example.com" },
      });

      const response = await POST(createRequest(validRequestBody));

      expect(response.status).toBe(200);
      expect(auth).not.toHaveBeenCalled();
    });
  });

  describe("B3: Repeated Guest Requests", () => {
    it("stays stable across repeated nearby requests without auth context", async () => {
      for (let i = 0; i < 10; i++) {
        const response = await POST(createRequest(validRequestBody));
        expect(response.status).toBe(200);
      }

      expect(auth).not.toHaveBeenCalled();
    });
  });

  describe("B4: Rate Limiting Still Applies", () => {
    it("handles a rate limiting response for guest traffic", async () => {
      (withRateLimit as jest.Mock).mockResolvedValueOnce({
        status: 403,
        json: async () => ({ error: "Forbidden" }),
      });

      const response = await POST(createRequest(validRequestBody));

      expect(response.status).toBe(403);
    });
  });

  describe("B5: Auth System Independence", () => {
    it("ignores auth system failures because guest access is allowed", async () => {
      (auth as jest.Mock).mockRejectedValue(
        new Error("Auth system unavailable")
      );

      const response = await POST(createRequest(validRequestBody));

      expect(response.status).toBe(200);
      expect(auth).not.toHaveBeenCalled();
    });
  });
});
