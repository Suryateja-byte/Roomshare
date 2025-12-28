/**
 * Server Edge Cases Tests
 *
 * Tests for server-side edge cases in the /api/nearby route including:
 * - Authentication scenarios
 * - Rate limiting
 * - Environment configuration
 * - Request parsing
 * - Error handling
 * - Concurrent requests
 *
 * @see Plan Category C - Server Edge Cases (22 tests)
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
const mockAuth = jest.fn();
jest.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

// Mock rate limiting
const mockWithRateLimit = jest.fn();
jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mockWithRateLimit(...args),
}));

// Mock fetch for Radar API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock console.error to track error logging
const originalConsoleError = console.error;

import { POST } from '@/app/api/nearby/route';

describe('POST /api/nearby - Server Edge Cases', () => {
  const validRequestBody = {
    listingLat: 37.7749,
    listingLng: -122.4194,
    categories: ['food-grocery'],
    radiusMeters: 1609,
  };

  const mockRadarResponse = {
    meta: { code: 200 },
    places: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockWithRateLimit.mockResolvedValue(null); // Allow by default
    mockAuth.mockResolvedValue({
      user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockRadarResponse,
    });
    process.env.RADAR_SECRET_KEY = 'test-secret-key';
    console.error = jest.fn();
  });

  afterEach(() => {
    delete process.env.RADAR_SECRET_KEY;
    console.error = originalConsoleError;
  });

  const createRequest = (body: unknown): Request => {
    return {
      json: async () => body,
      url: 'http://localhost:3000/api/nearby',
      headers: new Headers(),
    } as unknown as Request;
  };

  const createMalformedRequest = (): Request => {
    return {
      json: async () => {
        throw new Error('Invalid JSON');
      },
      url: 'http://localhost:3000/api/nearby',
      headers: new Headers(),
    } as unknown as Request;
  };

  describe('Authentication Edge Cases', () => {
    it('returns 401 when session is null', async () => {
      mockAuth.mockResolvedValue(null);

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 401 when session user is undefined', async () => {
      mockAuth.mockResolvedValue({ user: undefined });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 401 when user id is missing', async () => {
      mockAuth.mockResolvedValue({ user: { name: 'Test', email: 'test@test.com' } });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 401 when user id is empty string', async () => {
      mockAuth.mockResolvedValue({ user: { id: '', name: 'Test' } });

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Rate Limiting', () => {
    it('applies rate limiting to each request', async () => {
      await POST(createRequest(validRequestBody));

      expect(mockWithRateLimit).toHaveBeenCalledWith(
        expect.any(Object),
        { type: 'nearbySearch' }
      );
    });

    it('returns 429 when rate limit exceeded', async () => {
      const rateLimitResponse = {
        status: 429,
        json: async () => ({ error: 'Too many requests' }),
      };
      mockWithRateLimit.mockResolvedValue(rateLimitResponse);

      const response = await POST(createRequest(validRequestBody));

      expect(response.status).toBe(429);
    });

    it('handles rapid burst requests - rate limit called for each', async () => {
      // Simulate 5 rapid requests
      const requests = Array(5).fill(null).map(() =>
        POST(createRequest(validRequestBody))
      );

      await Promise.all(requests);

      expect(mockWithRateLimit).toHaveBeenCalledTimes(5);
    });
  });

  describe('Environment Configuration', () => {
    it('returns 503 when RADAR_SECRET_KEY is missing', async () => {
      delete process.env.RADAR_SECRET_KEY;

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('Nearby search is not configured');
    });

    it('returns 503 when RADAR_SECRET_KEY is empty string', async () => {
      process.env.RADAR_SECRET_KEY = '';

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe('Nearby search is not configured');
    });
  });

  describe('Request Parsing', () => {
    it('returns 400 on malformed JSON body', async () => {
      const response = await POST(createMalformedRequest());
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request body');
      expect(data.details).toBe('Request body must be valid JSON');
    });

    it('returns 400 on empty request body', async () => {
      const response = await POST(createRequest({}));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('returns 400 on null request body', async () => {
      const response = await POST(createRequest(null));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });
  });

  describe('Query Edge Cases', () => {
    it('accepts empty string query', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        query: '',
      }));

      expect(response.status).toBe(200);
    });

    it('accepts query with only spaces', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        query: '   ',
      }));

      expect(response.status).toBe(200);
    });

    it('accepts query with special characters', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        query: 'ATM? & Bank < > "quotes"',
      }));

      expect(response.status).toBe(200);
    });

    it('returns 400 for query over 100 chars', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        query: 'a'.repeat(101),
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('accepts query at exactly 100 chars boundary', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        query: 'a'.repeat(100),
      }));

      expect(response.status).toBe(200);
    });
  });

  describe('Limit Edge Cases', () => {
    it('accepts limit at boundary (50)', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        limit: 50,
      }));

      expect(response.status).toBe(200);
    });

    it('returns 400 for limit > 50', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        limit: 51,
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('applies default limit (20) when limit is missing', async () => {
      await POST(createRequest(validRequestBody));

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('limit=20');
    });

    it('accepts limit at lower boundary (1)', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        limit: 1,
      }));

      expect(response.status).toBe(200);
    });
  });

  describe('Categories Edge Cases', () => {
    it('accepts invalid category values - still processes', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        categories: ['invalid-category-xyz'],
      }));

      // Should process and pass to Radar - Radar will handle validation
      expect(response.status).toBe(200);
    });

    it('accepts mixed valid/invalid category values', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        categories: ['food-grocery', 'invalid-xyz', 'pharmacy'],
      }));

      expect(response.status).toBe(200);
    });

    it('uses default categories when empty array provided', async () => {
      await POST(createRequest({
        listingLat: 37.7749,
        listingLng: -122.4194,
        categories: [],
        radiusMeters: 1609,
      }));

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      // Should contain default categories
      expect(calledUrl).toContain('categories=');
    });

    it('uses default categories when categories field is omitted', async () => {
      await POST(createRequest({
        listingLat: 37.7749,
        listingLng: -122.4194,
        radiusMeters: 1609,
      }));

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('categories=');
    });
  });

  describe('Error Handling', () => {
    it('logs error on unexpected failure', async () => {
      mockFetch.mockRejectedValue(new Error('Unexpected error'));

      await POST(createRequest(validRequestBody));

      expect(console.error).toHaveBeenCalled();
    });

    it('does not expose internal error details to client', async () => {
      mockFetch.mockRejectedValue(new Error('Database connection string: secret123'));

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal Server Error');
      // Should not contain internal details
      expect(JSON.stringify(data)).not.toContain('secret123');
      expect(JSON.stringify(data)).not.toContain('Database');
    });

    it('handles non-Error exception gracefully', async () => {
      mockFetch.mockRejectedValue('String error');

      const response = await POST(createRequest(validRequestBody));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal Server Error');
    });
  });

  describe('Concurrent Requests', () => {
    it('handles concurrent requests correctly', async () => {
      // Create different request bodies
      const requests = [
        { ...validRequestBody, radiusMeters: 1609 },
        { ...validRequestBody, radiusMeters: 3218 },
        { ...validRequestBody, radiusMeters: 8046 },
      ];

      const responses = await Promise.all(
        requests.map(body => POST(createRequest(body)))
      );

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // All should have made Radar API calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('isolates errors between concurrent requests', async () => {
      // First call fails, others succeed
      mockFetch
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValue({
          ok: true,
          json: async () => mockRadarResponse,
        });

      const responses = await Promise.all([
        POST(createRequest(validRequestBody)),
        POST(createRequest(validRequestBody)),
        POST(createRequest(validRequestBody)),
      ]);

      // First should fail, others should succeed
      expect(responses[0].status).toBe(500);
      expect(responses[1].status).toBe(200);
      expect(responses[2].status).toBe(200);
    });
  });

  describe('Radar API Request Formation', () => {
    it('includes Authorization header with secret key', async () => {
      await POST(createRequest(validRequestBody));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'test-secret-key',
          }),
        })
      );
    });

    it('uses GET method for Radar API call', async () => {
      await POST(createRequest(validRequestBody));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('includes Content-Type header', async () => {
      await POST(createRequest(validRequestBody));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('encodes coordinates in URL correctly', async () => {
      await POST(createRequest(validRequestBody));

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      // Should contain coordinates (may be URL encoded)
      expect(calledUrl).toMatch(/near=37\.7749(,|%2C)-122\.4194/);
    });
  });
});
