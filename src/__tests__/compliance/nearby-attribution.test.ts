/**
 * Compliance, Attribution, Legal Tests
 *
 * Tests for legal compliance, attribution requirements, and privacy.
 * Validates Radar/Stadia branding, no-cache compliance, and error sanitization.
 *
 * @see Plan Category J - Compliance/Attribution/Legal (10 tests)
 * Note: 4 tests are E2E (J1-J3, J9-J10), 6 tests are Jest (J4-J8 + extras)
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

// Mock console.warn and console.error for log verification
const originalWarn = console.warn;
const originalError = console.error;
const mockWarn = jest.fn();
const mockError = jest.fn();

import { POST } from '@/app/api/nearby/route';
import { auth } from '@/auth';
import { mockRadarPlace } from '@/__tests__/utils/mocks/radar-api.mock';

describe('Nearby Places API - Compliance & Legal', () => {
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
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ meta: { code: 200 }, places: [mockRadarPlace] }),
    });
    console.warn = mockWarn;
    console.error = mockError;
  });

  afterEach(() => {
    delete process.env.RADAR_SECRET_KEY;
    console.warn = originalWarn;
    console.error = originalError;
  });

  const createRequest = (body: unknown): Request => {
    return {
      json: async () => body,
      url: 'http://localhost:3000/api/nearby',
      headers: new Headers(),
    } as unknown as Request;
  };

  // J4: No Google Maps branding misuse
  describe('J4: Branding Compliance', () => {
    it('does not use Google Maps API or branding', async () => {
      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(200);

      // Verify no Google-specific data in response
      const responseStr = JSON.stringify(data);
      expect(responseStr).not.toContain('google');
      expect(responseStr).not.toContain('Google');
      expect(responseStr).not.toContain('googleapis');
    });

    it('uses Radar API endpoint, not Google', async () => {
      // Make a request first to trigger fetch
      await POST(createRequest(validRequestBody));

      // Verify the fetch call uses Radar
      expect(mockFetch).toHaveBeenCalled();
      const fetchUrl = mockFetch.mock.calls[0]?.[0];
      if (fetchUrl) {
        expect(fetchUrl).toContain('radar.io');
        expect(fetchUrl).not.toContain('google');
      }
    });
  });

  // J5: POI data not stored in logs
  describe('J5: No-Cache Compliance', () => {
    it('includes Cache-Control no-cache headers', async () => {
      const response = await POST(createRequest(validRequestBody));

      expect(response.status).toBe(200);

      // Verify Cache-Control header is set
      expect(mockJsonFn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Cache-Control': expect.stringContaining('no-store'),
          }),
        })
      );
    });

    it('does not log POI data in production-like calls', async () => {
      await POST(createRequest(validRequestBody));

      // Console logs should not contain POI data
      const allLogs = [...mockWarn.mock.calls, ...mockError.mock.calls];
      allLogs.forEach((logArgs) => {
        const logStr = JSON.stringify(logArgs);
        // Should not log full place data
        expect(logStr).not.toContain('"places":[{');
        // Should not log user coordinates with full precision in PII context
        // (Logging coordinates for debugging is okay, but not in PII-sensitive logs)
      });
    });
  });

  // J6: User queries not in analytics
  describe('J6: Privacy Protection', () => {
    it('does not expose user search queries in response metadata', async () => {
      const sensitiveRequest = {
        ...validRequestBody,
        // Simulating a request that might have user-specific data
      };

      const response = await POST(createRequest(sensitiveRequest));
      const data = await response.json();

      // Response should not echo back the full request
      expect(data).not.toHaveProperty('query');
      expect(data).not.toHaveProperty('request');
      expect(data).not.toHaveProperty('userLocation');

      // Meta should only contain safe aggregated info
      expect(data.meta).toEqual(
        expect.objectContaining({
          count: expect.any(Number),
          cached: expect.any(Boolean),
        })
      );
    });

    it('does not include user ID in response', async () => {
      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      const responseStr = JSON.stringify(data);
      expect(responseStr).not.toContain('user-123');
      expect(responseStr).not.toContain(mockSession.user.email);
    });
  });

  // J7: Rate-limit error sanitized
  describe('J7: Error Sanitization', () => {
    it('sanitizes rate limit error to hide internal details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          error: 'Rate limit exceeded',
          meta: { code: 429, internalDetails: 'Quota: 1000/day' },
        }),
      });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      // Error should be generic, not expose internal quota info
      expect(data.error).toBeDefined();
      expect(JSON.stringify(data)).not.toContain('internalDetails');
      expect(JSON.stringify(data)).not.toContain('Quota');
    });
  });

  // J8: Error responses hide coordinates
  describe('J8: Coordinate Privacy', () => {
    it('error responses do not expose listing coordinates', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      // Error response should not contain the user's coordinates
      const responseStr = JSON.stringify(data);
      expect(responseStr).not.toContain('37.7749');
      expect(responseStr).not.toContain('-122.4194');
    });

    it('error messages do not include API keys', async () => {
      mockFetch.mockRejectedValueOnce(
        new Error('Invalid API key: prj_test_xxx...')
      );

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      // Error should be generic
      const responseStr = JSON.stringify(data);
      expect(responseStr).not.toContain('prj_');
      expect(responseStr).not.toContain('API key');
      expect(data.error).toBe('Internal Server Error');
    });
  });

  // Additional compliance tests
  describe('Response Structure Compliance', () => {
    it('includes required meta fields per API contract', async () => {
      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(data).toHaveProperty('places');
      expect(data).toHaveProperty('meta');
      expect(data.meta).toHaveProperty('count');
      expect(data.meta).toHaveProperty('cached');
      expect(typeof data.meta.count).toBe('number');
      expect(typeof data.meta.cached).toBe('boolean');
    });

    it('places array contains required fields', async () => {
      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      if (data.places.length > 0) {
        const place = data.places[0];
        expect(place).toHaveProperty('id');
        expect(place).toHaveProperty('name');
        expect(place).toHaveProperty('address');
        expect(place).toHaveProperty('location');
        expect(place).toHaveProperty('distanceMiles');
        expect(place.location).toHaveProperty('lat');
        expect(place.location).toHaveProperty('lng');
      }
    });
  });

  describe('Security Headers', () => {
    it('does not expose internal error stack traces', async () => {
      mockFetch.mockImplementationOnce(() => {
        throw new Error('Detailed internal error with stack trace');
      });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      const responseStr = JSON.stringify(data);
      expect(responseStr).not.toContain('stack');
      expect(responseStr).not.toContain('at ');
      expect(responseStr).not.toContain('node_modules');
    });
  });

  describe('Input Sanitization', () => {
    it('rejects invalid coordinate values', async () => {
      const invalidRequest = {
        listingLat: 'not-a-number',
        listingLng: -122.4194,
        categories: ['food-grocery'],
        radiusMeters: 1609,
      };

      const response = await POST(createRequest(invalidRequest));

      // Should reject with 400 for invalid input
      expect(response.status).toBe(400);
    });

    it('rejects out-of-range coordinates', async () => {
      const invalidRequest = {
        listingLat: 200, // Invalid latitude
        listingLng: -122.4194,
        categories: ['food-grocery'],
        radiusMeters: 1609,
      };

      const response = await POST(createRequest(invalidRequest));

      // Should reject with 400 for invalid coordinates
      expect(response.status).toBe(400);
    });

    it('sanitizes category input', async () => {
      const maliciousRequest = {
        listingLat: 37.7749,
        listingLng: -122.4194,
        categories: ['<script>alert(1)</script>'],
        radiusMeters: 1609,
      };

      // Should not crash and should return appropriate error
      const response = await POST(createRequest(maliciousRequest));

      // Either 400 (invalid category) or 200 with no results is acceptable
      expect([200, 400]).toContain(response.status);
    });
  });
});
