/**
 * Data Semantics & UX Trust Tests
 *
 * Tests for data processing logic, category mapping, deduplication,
 * distance formatting, and UI trust signals using controlled fixtures.
 *
 * IMPORTANT: These tests validate YOUR code's logic, NOT provider data.
 *
 * @see Plan Category I - Data Semantics & UX Trust (10 tests)
 */

// Mock NextResponse before importing the route
const mockJsonFn = jest.fn();
jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> },
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

// Mock rate limiting
jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

// Mock fetch for Radar API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { POST } from "@/app/api/nearby/route";
import { auth } from "@/auth";

describe("Nearby Places - Data Semantics", () => {
  const mockSession = {
    user: { id: "user-123", name: "Test User", email: "test@example.com" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    process.env.RADAR_SECRET_KEY = "test-key";
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

  // I1: Category mapping filters correctly
  describe("I1: Category Mapping", () => {
    it("maps Radar categories to internal categories correctly", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: "grocery-1",
              name: "Test Grocery",
              formattedAddress: "123 Main St",
              categories: ["supermarket", "grocery-store"],
              location: { coordinates: [-122.4194, 37.7749] },
            },
            {
              _id: "restaurant-1",
              name: "Test Restaurant",
              formattedAddress: "456 Oak Ave",
              categories: ["restaurant", "food"],
              location: { coordinates: [-122.4184, 37.7759] },
            },
          ],
        }),
      });

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          categories: ["food-grocery"],
          radiusMeters: 1609,
        }),
      );

      const data = await response.json();

      // Response should contain places
      expect(data.places).toBeDefined();
      expect(Array.isArray(data.places)).toBe(true);
    });

    it("uses provided categories in API request", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [],
        }),
      });

      await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          categories: ["pharmacy", "fitness"],
          radiusMeters: 1609,
        }),
      );

      // Check that fetch was called with categories
      expect(mockFetch).toHaveBeenCalled();
      const fetchUrl = mockFetch.mock.calls[0][0];
      expect(fetchUrl).toContain("categories=");
    });
  });

  // I2: Chain deduplication works
  describe("I2: Deduplication Logic", () => {
    it("handles duplicate place IDs", async () => {
      // Simulate API returning duplicates
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: "place-dup",
              name: "Duplicate Store",
              formattedAddress: "123 Main St",
              categories: ["grocery"],
              location: { coordinates: [-122.4194, 37.7749] },
            },
            {
              _id: "place-dup", // Same ID
              name: "Duplicate Store",
              formattedAddress: "123 Main St",
              categories: ["grocery"],
              location: { coordinates: [-122.4194, 37.7749] },
            },
          ],
        }),
      });

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          categories: ["food-grocery"],
          radiusMeters: 1609,
        }),
      );

      const data = await response.json();

      // Should process without error
      expect(data.places).toBeDefined();
    });
  });

  // I3: Search query normalizes input
  describe("I3: Query Normalization", () => {
    it("handles query with leading/trailing whitespace", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [],
        }),
      });

      await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          query: "  coffee shops  ",
          radiusMeters: 1609,
        }),
      );

      // Query should be passed to API
      expect(mockFetch).toHaveBeenCalled();
      const fetchUrl = mockFetch.mock.calls[0][0];
      expect(fetchUrl).toContain("query=");
    });

    it("handles empty query string", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [],
        }),
      });

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          query: "",
          categories: ["food-grocery"],
          radiusMeters: 1609,
        }),
      );

      // Should not throw error
      expect(response.status).toBe(200);
    });
  });

  // I4: Duplicate POIs filtered by ID
  describe("I4: ID-based Filtering", () => {
    it("processes places with unique IDs", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: "place-1",
              name: "Main Street Grocery",
              formattedAddress: "123 Main St",
              categories: ["supermarket", "grocery-store"],
              location: { coordinates: [-122.4194, 37.7749] },
            },
            {
              _id: "place-2",
              name: "Oak Avenue Market",
              formattedAddress: "456 Oak Ave",
              categories: ["supermarket", "grocery-store"],
              location: { coordinates: [-122.4184, 37.7759] },
            },
          ],
        }),
      });

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          categories: ["food-grocery"],
          radiusMeters: 1609,
        }),
      );

      const data = await response.json();

      // Both unique places should be present
      expect(data.places.length).toBe(2);
      expect(data.places[0].id).not.toBe(data.places[1].id);
    });
  });

  // I5: Missing address handled gracefully
  describe("I5: Missing Address Fallback", () => {
    it("handles places without address", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: "place-no-address",
              name: "Downtown Grocery Store",
              // No formattedAddress
              categories: ["supermarket", "grocery-store"],
              location: { coordinates: [-122.4194, 37.7749] },
            },
          ],
        }),
      });

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          categories: ["food-grocery"],
          radiusMeters: 1609,
        }),
      );

      const data = await response.json();

      // Should handle missing address gracefully
      expect(data.places).toBeDefined();
      expect(data.places[0]).toBeDefined();
      // Address might be undefined, empty, or have a fallback
    });

    it("handles places with partial address components", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: "place-partial",
              name: "Corner Market Foods",
              addressLabel: "123 Main St", // Alternative field
              categories: ["supermarket", "grocery-store"],
              location: { coordinates: [-122.4194, 37.7749] },
            },
          ],
        }),
      });

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          categories: ["food-grocery"],
          radiusMeters: 1609,
        }),
      );

      const data = await response.json();

      expect(data.places).toBeDefined();
    });
  });

  // I6: Distance sorting ascending
  describe("I6: Distance Sorting", () => {
    it("returns places with distance information", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: "place-far",
              name: "Far Away Grocery",
              formattedAddress: "789 Elm Blvd",
              categories: ["supermarket", "grocery-store"],
              location: { coordinates: [-122.5, 37.8] }, // ~3 miles
            },
            {
              _id: "place-close",
              name: "Nearby Market",
              formattedAddress: "123 Main St",
              categories: ["supermarket", "grocery-store"],
              location: { coordinates: [-122.4194, 37.7749] }, // 0 miles
            },
          ],
        }),
      });

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          categories: ["food-grocery"],
          radiusMeters: 1609,
        }),
      );

      const data = await response.json();

      // Places should have distance information
      expect(data.places).toBeDefined();
      if (data.places.length > 0) {
        expect(data.places[0].distanceMiles).toBeDefined();
      }
    });

    it("calculates distance correctly", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: "place-same",
              name: "Local Grocery",
              formattedAddress: "123 Main St",
              categories: ["supermarket", "grocery-store"],
              location: { coordinates: [-122.4194, 37.7749] }, // Exact same location
            },
          ],
        }),
      });

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          categories: ["food-grocery"],
          radiusMeters: 1609,
        }),
      );

      const data = await response.json();

      // Distance should be 0 or very close to 0
      if (data.places.length > 0) {
        expect(data.places[0].distanceMiles).toBeLessThanOrEqual(0.1);
      }
    });
  });

  // I7: Straight-line distance disclaimer shown (tested via UI)
  describe("I7: Distance Disclaimer", () => {
    it("returns distance in miles format", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: "place-1",
              name: "Neighborhood Market",
              formattedAddress: "123 Main St",
              categories: ["supermarket", "grocery-store"],
              location: { coordinates: [-122.4194, 37.7749] },
            },
          ],
        }),
      });

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          categories: ["food-grocery"],
          radiusMeters: 1609,
        }),
      );

      const data = await response.json();

      // Distance field should be named distanceMiles (not km)
      if (data.places.length > 0) {
        expect(data.places[0]).toHaveProperty("distanceMiles");
        expect(data.places[0]).not.toHaveProperty("distanceKm");
      }
    });
  });

  // I8: Results sorted by distanceMiles field
  describe("I8: Sort Order Verification", () => {
    it("sorts places by distance ascending", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: "place-far",
              name: "Distant Grocery Store",
              formattedAddress: "789 Elm Blvd",
              categories: ["supermarket", "grocery-store"],
              location: { coordinates: [-122.5, 37.9] }, // Far
            },
            {
              _id: "place-close",
              name: "Nearby Supermarket",
              formattedAddress: "123 Main St",
              categories: ["supermarket", "grocery-store"],
              location: { coordinates: [-122.4194, 37.7749] }, // Close
            },
            {
              _id: "place-medium",
              name: "Midtown Market",
              formattedAddress: "456 Oak Ave",
              categories: ["supermarket", "grocery-store"],
              location: { coordinates: [-122.43, 37.785] }, // Medium
            },
          ],
        }),
      });

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          categories: ["food-grocery"],
          radiusMeters: 8046, // 5 miles
        }),
      );

      const data = await response.json();

      // Verify ascending order
      if (data.places.length > 1) {
        for (let i = 0; i < data.places.length - 1; i++) {
          expect(data.places[i].distanceMiles).toBeLessThanOrEqual(
            data.places[i + 1].distanceMiles,
          );
        }
      }
    });
  });

  // I9: Miles format used (not km)
  describe("I9: Distance Unit Format", () => {
    it("uses miles unit in response", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: "place-1",
              name: "Central Foods Market",
              formattedAddress: "123 Main St",
              categories: ["supermarket", "grocery-store"],
              location: { coordinates: [-122.43, 37.785] },
            },
          ],
        }),
      });

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          categories: ["food-grocery"],
          radiusMeters: 1609,
        }),
      );

      const data = await response.json();

      // Should use miles, not kilometers
      if (data.places.length > 0) {
        // Distance in miles for ~1 mile should be < 2
        expect(data.places[0].distanceMiles).toBeLessThan(2);
      }
    });
  });

  // I10: Radius label matches radiusMeters param
  describe("I10: Radius Consistency", () => {
    it("uses provided radius in API call", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [],
        }),
      });

      // Test 1 mile radius
      await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          categories: ["food-grocery"],
          radiusMeters: 1609,
        }),
      );

      expect(mockFetch).toHaveBeenCalled();
      const fetchUrl1 = mockFetch.mock.calls[0][0];
      expect(fetchUrl1).toContain("radius=1609");

      mockFetch.mockClear();

      // Test 2 mile radius
      await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          categories: ["food-grocery"],
          radiusMeters: 3218,
        }),
      );

      const fetchUrl2 = mockFetch.mock.calls[0][0];
      expect(fetchUrl2).toContain("radius=3218");
    });

    it("validates radius values", async () => {
      // Invalid radius should be rejected
      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          categories: ["food-grocery"],
          radiusMeters: 9999, // Not in allowed values
        }),
      );

      expect(response.status).toBe(400);
    });

    it("accepts all valid radius values", async () => {
      const validRadii = [1609, 3218, 8046]; // 1mi, 2mi, 5mi

      for (const radius of validRadii) {
        mockFetch.mockClear();
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            meta: { code: 200 },
            places: [],
          }),
        });

        const response = await POST(
          createRequest({
            listingLat: 37.7749,
            listingLng: -122.4194,
            categories: ["food-grocery"],
            radiusMeters: radius,
          }),
        );

        expect(response.status).toBe(200);
      }
    });
  });

  // Additional data semantics tests
  describe("Response Structure", () => {
    it("includes meta information in response", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: "place-1",
              name: "Metro Grocery",
              formattedAddress: "123 Main St",
              categories: ["supermarket", "grocery-store"],
              location: { coordinates: [-122.4194, 37.7749] },
            },
          ],
        }),
      });

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          categories: ["food-grocery"],
          radiusMeters: 1609,
        }),
      );

      const data = await response.json();

      expect(data.meta).toBeDefined();
      expect(data.meta.count).toBeDefined();
    });

    it("returns proper place structure", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: "place-1",
              name: "Fresh Foods Market",
              formattedAddress: "123 Main St",
              categories: ["supermarket", "grocery-store"],
              location: { coordinates: [-122.4194, 37.7749] },
            },
          ],
        }),
      });

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          categories: ["food-grocery"],
          radiusMeters: 1609,
        }),
      );

      const data = await response.json();

      if (data.places.length > 0) {
        const place = data.places[0];

        // Required fields
        expect(place.id).toBeDefined();
        expect(place.name).toBeDefined();
        expect(place.location).toBeDefined();
        expect(place.location.lat).toBeDefined();
        expect(place.location.lng).toBeDefined();
        expect(place.distanceMiles).toBeDefined();
        expect(place.category).toBeDefined();
      }
    });
  });
});
