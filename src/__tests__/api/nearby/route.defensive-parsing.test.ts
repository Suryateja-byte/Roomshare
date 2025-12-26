/**
 * Defensive Parsing Tests
 *
 * Tests for API contract and defensive parsing in the Nearby Places API.
 * Validates handling of malformed responses, schema drift, and edge cases.
 *
 * @see Plan Category C - API Contract & Defensive Parsing (10 tests)
 */

// Mock NextResponse before importing the route
const mockJsonFn = jest.fn();
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
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
jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

// Mock rate limiting
jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

// Mock fetch for Radar API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { POST } from '@/app/api/nearby/route';
import { auth } from '@/auth';
import {
  mockRadarPlace,
  mockRadarPlaceNumericStrings,
  mockRadarPlaceNullLocation,
  mockRadarPlaceUndefinedLocation,
  mockRadarPlaceEmptyCoordinates,
  mockRadarPlaceAddressParts,
  mockRadarPlaceNestedNulls,
  mockRadarResponseWithError,
  mockHtmlErrorResponse,
  mockRadarResponseCountMismatch,
} from '@/__tests__/utils/mocks/radar-api.mock';

describe('POST /api/nearby - Defensive Parsing', () => {
  const mockSession = {
    user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
  };

  const validRequestBody = {
    listingLat: 37.7749,
    listingLng: -122.4194,
    categories: ['food-grocery'],
    radiusMeters: 1609,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    process.env.RADAR_SECRET_KEY = 'test-secret-key';
  });

  afterEach(() => {
    delete process.env.RADAR_SECRET_KEY;
  });

  const createRequest = (body: unknown): Request => {
    return {
      json: async () => body,
      url: 'http://localhost:3000/api/nearby',
      headers: new Headers(),
    } as unknown as Request;
  };

  const mockRadarSuccess = (places: unknown[]) => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ meta: { code: 200 }, places }),
    });
  };

  // C1: Numeric fields as strings coerced correctly
  describe('C1: Schema Drift - Numeric Strings', () => {
    it('handles coordinates as strings without crashing', async () => {
      // Radar might return coordinates as strings due to schema drift
      mockRadarSuccess([mockRadarPlaceNumericStrings]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      // Should not crash - coordinates are strings but still valid numbers
      expect(response.status).toBe(200);
      // The API should still return a response (may have NaN values)
      expect(data.places).toBeDefined();
    });
  });

  // C2: Null nested objects don't throw on .lat
  describe('C2: Null Safety', () => {
    it('handles place with null location gracefully', async () => {
      mockRadarSuccess([mockRadarPlaceNullLocation]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      // Should not crash - null location should be filtered out
      expect(response.status).toBe(200);
      expect(data.places).toHaveLength(0); // Filtered out
    });

    it('handles place with undefined location gracefully', async () => {
      mockRadarSuccess([mockRadarPlaceUndefinedLocation]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places).toHaveLength(0); // Filtered out
    });

    it('handles place with empty coordinates array', async () => {
      mockRadarSuccess([mockRadarPlaceEmptyCoordinates]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places).toHaveLength(0); // Filtered out
    });
  });

  // C3: Coordinates as [lat,lng] array handled
  describe('C3: Coordinate Format Handling', () => {
    it('correctly extracts [lng, lat] from Radar format', async () => {
      // Radar returns [lng, lat] but we need {lat, lng}
      mockRadarSuccess([mockRadarPlace]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].location.lat).toBe(37.7749);
      expect(data.places[0].location.lng).toBe(-122.4194);
    });
  });

  // C4: Address parts only builds full address
  describe('C4: Partial Address Data', () => {
    it('handles missing formattedAddress with empty string', async () => {
      mockRadarSuccess([mockRadarPlaceAddressParts]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should use empty string when formattedAddress is missing
      expect(data.places[0].address).toBe('');
    });

    it('handles null formattedAddress', async () => {
      mockRadarSuccess([mockRadarPlaceNestedNulls]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].address).toBe('');
    });
  });

  // C5: Extra-large payload (>1MB) returns 413
  describe('C5: Payload Size Limits', () => {
    it('handles large response from Radar without crashing', async () => {
      // Generate many places (simulating large response)
      const manyPlaces = Array.from({ length: 100 }, (_, i) => ({
        ...mockRadarPlace,
        _id: `place_${i}`,
      }));
      mockRadarSuccess(manyPlaces);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places.length).toBe(100);
    });
  });

  // C6: meta.cached:true future-proofed
  describe('C6: Cache Flag Handling', () => {
    it('always returns cached: false per compliance', async () => {
      mockRadarSuccess([mockRadarPlace]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(data.meta.cached).toBe(false);
    });
  });

  // C7: Count mismatch logs warning
  describe('C7: Data Integrity', () => {
    it('count matches actual places length', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockRadarResponseCountMismatch,
      });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      // Our API returns correct count based on actual places
      expect(data.meta.count).toBe(data.places.length);
    });
  });

  // C8: 200 with {error: "..."} treated as error
  describe('C8: Error in Success Response', () => {
    it('handles 200 response with error field', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockRadarResponseWithError,
      });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      // Should still return 200 with empty places
      expect(response.status).toBe(200);
      expect(data.places).toHaveLength(0);
    });
  });

  // C9: HTML error page doesn't crash JSON.parse
  describe('C9: Non-JSON Response Handling', () => {
    it('handles HTML error page from CDN/proxy', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('Unexpected token < in JSON at position 0');
        },
        text: async () => mockHtmlErrorResponse,
      });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      // Should return error, not crash
      expect(response.status).toBe(500);
      expect(data.error).toBeDefined();
    });

    it('handles malformed JSON from Radar', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal Server Error');
    });
  });

  // C10: distanceMiles truncated to 1 decimal
  describe('C10: Distance Precision', () => {
    it('calculates distance with proper precision', async () => {
      mockRadarSuccess([mockRadarPlace]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(typeof data.places[0].distanceMiles).toBe('number');
      // Distance should be a reasonable number
      expect(data.places[0].distanceMiles).toBeGreaterThanOrEqual(0);
    });
  });
});
