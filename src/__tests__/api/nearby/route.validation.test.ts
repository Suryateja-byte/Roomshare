/**
 * API Route Validation Tests
 *
 * Additional input validation edge cases for /api/nearby route.
 * Complements route.test.ts with more specific validation scenarios.
 *
 * @see Plan Category A - Input Validation (11 tests)
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

// Mock rate limiting to return null (allow request)
jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

// Mock fetch for Radar API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { POST } from '@/app/api/nearby/route';
import { auth } from '@/auth';

describe('POST /api/nearby - Input Validation', () => {
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

  const mockRadarResponse = {
    meta: { code: 200 },
    places: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockRadarResponse,
    });
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

  describe('null and undefined coordinates', () => {
    it('rejects null listingLat with 400', async () => {
      const response = await POST(createRequest({
        listingLat: null,
        listingLng: -122.4194,
        radiusMeters: 1609,
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('rejects undefined listingLng with 400', async () => {
      const response = await POST(createRequest({
        listingLat: 37.7749,
        // listingLng is undefined (missing)
        radiusMeters: 1609,
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('rejects null listingLng with 400', async () => {
      const response = await POST(createRequest({
        listingLat: 37.7749,
        listingLng: null,
        radiusMeters: 1609,
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });
  });

  describe('string coordinates (type coercion)', () => {
    it('rejects string latitude "32.9" with 400', async () => {
      const response = await POST(createRequest({
        listingLat: '32.9',
        listingLng: -122.4194,
        radiusMeters: 1609,
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('rejects string longitude "-122.4" with 400', async () => {
      const response = await POST(createRequest({
        listingLat: 37.7749,
        listingLng: '-122.4',
        radiusMeters: 1609,
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });
  });

  describe('latitude range validation', () => {
    it('rejects latitude > 90 with 400', async () => {
      const response = await POST(createRequest({
        listingLat: 90.1,
        listingLng: -122.4194,
        radiusMeters: 1609,
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('rejects latitude < -90 with 400', async () => {
      const response = await POST(createRequest({
        listingLat: -90.1,
        listingLng: -122.4194,
        radiusMeters: 1609,
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('accepts latitude exactly 90 (North Pole)', async () => {
      const response = await POST(createRequest({
        listingLat: 90,
        listingLng: 0,
        radiusMeters: 1609,
      }));

      expect(response.status).toBe(200);
    });

    it('accepts latitude exactly -90 (South Pole)', async () => {
      const response = await POST(createRequest({
        listingLat: -90,
        listingLng: 0,
        radiusMeters: 1609,
      }));

      expect(response.status).toBe(200);
    });
  });

  describe('longitude range validation', () => {
    it('rejects longitude > 180 with 400', async () => {
      const response = await POST(createRequest({
        listingLat: 37.7749,
        listingLng: 180.1,
        radiusMeters: 1609,
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('rejects longitude < -180 with 400', async () => {
      const response = await POST(createRequest({
        listingLat: 37.7749,
        listingLng: -180.1,
        radiusMeters: 1609,
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('accepts longitude exactly 180', async () => {
      const response = await POST(createRequest({
        listingLat: 0,
        listingLng: 180,
        radiusMeters: 1609,
      }));

      expect(response.status).toBe(200);
    });

    it('accepts longitude exactly -180', async () => {
      const response = await POST(createRequest({
        listingLat: 0,
        listingLng: -180,
        radiusMeters: 1609,
      }));

      expect(response.status).toBe(200);
    });
  });

  describe('radius validation', () => {
    it('rejects negative radius with 400', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        radiusMeters: -1609,
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('rejects unsupported radius 999m with 400', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        radiusMeters: 999,
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('rejects radius 0 with 400', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        radiusMeters: 0,
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('accepts valid radius 1609 (1mi)', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        radiusMeters: 1609,
      }));

      expect(response.status).toBe(200);
    });

    it('accepts valid radius 3218 (2mi)', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        radiusMeters: 3218,
      }));

      expect(response.status).toBe(200);
    });

    it('accepts valid radius 8046 (5mi)', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        radiusMeters: 8046,
      }));

      expect(response.status).toBe(200);
    });
  });

  describe('limit validation', () => {
    it('rejects limit > 50 with 400', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        limit: 51,
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('rejects limit < 1 with 400', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        limit: 0,
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('accepts limit at boundary (50)', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        limit: 50,
      }));

      expect(response.status).toBe(200);
    });

    it('accepts limit at boundary (1)', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        limit: 1,
      }));

      expect(response.status).toBe(200);
    });
  });

  describe('query validation', () => {
    it('rejects query over 100 chars with 400', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        query: 'a'.repeat(101),
      }));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('accepts empty string query', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        query: '',
      }));

      // Empty query is valid but shouldn't be passed to Radar
      expect(response.status).toBe(200);
    });

    it('accepts query with only spaces', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        query: '   ',
      }));

      // Whitespace-only query is valid but may be trimmed
      expect(response.status).toBe(200);
    });

    it('accepts query with special characters', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        query: 'ATM? & Bank',
      }));

      expect(response.status).toBe(200);
    });

    it('accepts query at exactly 100 chars', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        query: 'a'.repeat(100),
      }));

      expect(response.status).toBe(200);
    });
  });

  describe('categories validation', () => {
    it('accepts empty categories array (uses defaults)', async () => {
      const response = await POST(createRequest({
        listingLat: 37.7749,
        listingLng: -122.4194,
        categories: [],
        radiusMeters: 1609,
      }));

      expect(response.status).toBe(200);
    });

    it('accepts single category', async () => {
      const response = await POST(createRequest({
        listingLat: 37.7749,
        listingLng: -122.4194,
        categories: ['food-grocery'],
        radiusMeters: 1609,
      }));

      expect(response.status).toBe(200);
    });

    it('accepts multiple categories', async () => {
      const response = await POST(createRequest({
        listingLat: 37.7749,
        listingLng: -122.4194,
        categories: ['food-grocery', 'indian-restaurant', 'pharmacy'],
        radiusMeters: 1609,
      }));

      expect(response.status).toBe(200);
    });
  });
});
