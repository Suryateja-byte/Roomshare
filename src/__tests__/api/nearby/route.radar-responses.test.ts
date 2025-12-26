/**
 * Radar API Response Handling Tests
 *
 * Tests for handling various Radar API response scenarios including:
 * - Missing/partial fields
 * - Unicode/international content
 * - Error responses
 * - Edge cases
 *
 * @see Plan Category B - Radar API Responses (21 tests)
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
  mockRadarPlaceMissingAddress,
  mockRadarPlaceEmptyName,
  mockRadarPlaceWhitespaceName,
  mockRadarPlaceLongName,
  mockRadarPlaceTelugu,
  mockRadarPlaceHindi,
  mockRadarPlaceArabic,
  mockRadarPlaceEmoji,
  mockRadarPlaceEmptyCategories,
  mockRadarPlaceNoChain,
  mockRadarPlace,
} from '@/__tests__/utils/mocks/radar-api.mock';

describe('POST /api/nearby - Radar Response Handling', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
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

  const mockRadarError = (status: number, body: unknown) => {
    mockFetch.mockResolvedValue({
      ok: false,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
  };

  describe('Missing/Partial Fields', () => {
    it('handles POI with missing address - shows empty string', async () => {
      mockRadarSuccess([mockRadarPlaceMissingAddress]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].address).toBe('');
    });

    it('handles POI with empty name - passes through', async () => {
      mockRadarSuccess([mockRadarPlaceEmptyName]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe('');
    });

    it('handles POI with whitespace-only name', async () => {
      mockRadarSuccess([mockRadarPlaceWhitespaceName]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe('   ');
    });

    it('handles POI with empty categories array - returns "unknown"', async () => {
      mockRadarSuccess([mockRadarPlaceEmptyCategories]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].category).toBe('unknown');
    });

    it('handles POI with chain field present', async () => {
      mockRadarSuccess([mockRadarPlace]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].chain).toBe('Patel Brothers');
    });

    it('handles POI with chain field missing - returns undefined', async () => {
      mockRadarSuccess([mockRadarPlaceNoChain]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].chain).toBeUndefined();
    });
  });

  describe('Long Content', () => {
    it('handles POI with 500-char name', async () => {
      mockRadarSuccess([mockRadarPlaceLongName]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name.length).toBe(500);
    });
  });

  describe('Unicode/International Content', () => {
    it('handles non-ASCII names - Telugu', async () => {
      mockRadarSuccess([mockRadarPlaceTelugu]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe('తెలుగు స్టోర్');
    });

    it('handles non-ASCII names - Hindi', async () => {
      mockRadarSuccess([mockRadarPlaceHindi]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe('हिंदी दुकान');
    });

    it('handles non-ASCII names - Arabic', async () => {
      mockRadarSuccess([mockRadarPlaceArabic]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe('متجر عربي');
    });

    it('handles emoji in POI name', async () => {
      mockRadarSuccess([mockRadarPlaceEmoji]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places[0].name).toBe('Coffee Shop ☕🍕🎉');
    });
  });

  describe('Duplicates', () => {
    it('does not dedupe duplicate POIs across categories', async () => {
      // Same place appears twice (Radar might return this)
      mockRadarSuccess([mockRadarPlace, mockRadarPlace]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places).toHaveLength(2);
      expect(data.meta.count).toBe(2);
    });
  });

  describe('HTTP Error Responses', () => {
    it('returns 500 when Radar returns HTTP 500', async () => {
      mockRadarError(500, { meta: { code: 500, message: 'Internal Server Error' } });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch nearby places');
    });

    it('returns 429 when Radar returns rate limit', async () => {
      mockRadarError(429, { meta: { code: 429, message: 'Rate limit exceeded' } });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toBe('Radar API rate limit exceeded');
    });

    it('returns error message for HTTP 401 auth failure', async () => {
      mockRadarError(401, { meta: { code: 401, message: 'Unauthorized' } });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Radar API authentication failed');
      expect(data.details).toBe('Invalid or expired API key');
    });

    it('returns error message for HTTP 403 permission denied', async () => {
      mockRadarError(403, { meta: { code: 403, message: 'Forbidden' } });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Radar API access denied');
      expect(data.details).toBe('API key lacks permission for Places Search');
    });

    it('returns error message for HTTP 400 invalid params', async () => {
      mockRadarError(400, { meta: { code: 400, message: 'Invalid categories parameter' } });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid search parameters');
    });
  });

  describe('Network Errors', () => {
    it('returns 500 on network timeout/error', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal Server Error');
    });

    it('handles fetch rejection gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal Server Error');
    });
  });

  describe('Empty Results', () => {
    it('returns empty places array with count=0 on 200 with empty array', async () => {
      mockRadarSuccess([]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.places).toEqual([]);
      expect(data.meta.count).toBe(0);
      expect(data.meta.cached).toBe(false);
    });
  });

  describe('Distance Calculation', () => {
    it('calculates distance for POIs', async () => {
      // Use a place with different coordinates than the listing (validRequestBody: 37.7749, -122.4194)
      // mockRadarPlaceTelugu is at [-122.49, 37.85] which is about 6 miles away
      mockRadarSuccess([mockRadarPlaceTelugu]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(typeof data.places[0].distanceMiles).toBe('number');
      expect(data.places[0].distanceMiles).toBeGreaterThan(0);
    });

    it('handles POIs far outside requested radius - distance calc still works', async () => {
      // Place that's 100+ miles away
      const farAwayPlace = {
        _id: 'far_away',
        name: 'Far Store',
        location: {
          type: 'Point',
          coordinates: [-121.0, 36.0], // Much further south
        },
        categories: ['food-grocery'],
        formattedAddress: 'Far Away, CA',
      };
      mockRadarSuccess([farAwayPlace]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      // Distance should be calculated even if outside radius
      expect(data.places[0].distanceMiles).toBeGreaterThan(100);
    });
  });

  describe('Coordinate Extraction', () => {
    it('correctly extracts lat/lng from Radar coordinates [lng, lat]', async () => {
      mockRadarSuccess([mockRadarPlace]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);
      // Radar returns [lng, lat] but we should store as { lat, lng }
      expect(data.places[0].location.lat).toBe(37.7749);
      expect(data.places[0].location.lng).toBe(-122.4194);
    });
  });

  describe('Malformed Responses', () => {
    it('handles malformed JSON response from Radar', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token');
        },
        text: async () => 'Not JSON',
      });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal Server Error');
    });

    it('handles response with missing places array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ meta: { code: 200 } }), // No places array
      });

      const response = await POST(createRequest(validRequestBody));

      // Should either handle gracefully or return error
      // Based on implementation, this will throw when trying to map over undefined
      expect(response.status).toBe(500);
    });
  });

  describe('Response Meta', () => {
    it('always sets cached: false per compliance requirement', async () => {
      mockRadarSuccess([mockRadarPlace]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(data.meta.cached).toBe(false);
    });

    it('count matches actual places length', async () => {
      mockRadarSuccess([mockRadarPlace, mockRadarPlaceTelugu, mockRadarPlaceHindi]);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(data.meta.count).toBe(3);
      expect(data.places).toHaveLength(3);
    });
  });
});
