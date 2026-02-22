/**
 * Tests for /api/nearby route - Malformed Radar Place Coordinates
 *
 * Verifies that places with insufficient or non-finite coordinates
 * are filtered out instead of crashing the endpoint.
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

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { POST } from '@/app/api/nearby/route';
import { auth } from '@/auth';

describe('POST /api/nearby - Malformed Radar Place Coordinates', () => {
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

  const mockRadarResponse = (places: unknown[]) => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ meta: { code: 200 }, places }),
    });
  };

  it('filters out places with only 1 coordinate element (no crash)', async () => {
    mockRadarResponse([
      {
        _id: 'place-single-coord',
        name: 'Bad Place',
        formattedAddress: '123 Main St',
        categories: ['food-grocery'],
        location: { coordinates: [-122.4194] }, // Only lng, no lat
      },
      {
        _id: 'place-valid',
        name: 'Good Grocery',
        formattedAddress: '456 Oak St',
        categories: ['food-grocery'],
        location: { coordinates: [-122.4194, 37.7749] },
      },
    ]);

    const response = await POST(createRequest(validRequestBody));
    const data = mockJsonFn.mock.calls[0]?.[0];

    // Should not crash and should return only the valid place
    expect(response.status).toBe(200);
    expect(data.places).toHaveLength(1);
    expect(data.places[0].id).toBe('place-valid');
  });

  it('filters out places with empty coordinates array', async () => {
    mockRadarResponse([
      {
        _id: 'place-empty-coords',
        name: 'Empty Coords',
        formattedAddress: '789 Elm St',
        categories: ['food-grocery'],
        location: { coordinates: [] },
      },
    ]);

    const response = await POST(createRequest(validRequestBody));
    const data = mockJsonFn.mock.calls[0]?.[0];

    expect(response.status).toBe(200);
    expect(data.places).toHaveLength(0);
  });

  it('filters out places with non-finite coordinates', async () => {
    mockRadarResponse([
      {
        _id: 'place-nan',
        name: 'NaN Place',
        formattedAddress: '111 NaN Ave',
        categories: ['food-grocery'],
        location: { coordinates: [NaN, 37.7749] },
      },
      {
        _id: 'place-inf',
        name: 'Infinity Place',
        formattedAddress: '222 Inf Blvd',
        categories: ['food-grocery'],
        location: { coordinates: [-122.4, Infinity] },
      },
    ]);

    const response = await POST(createRequest(validRequestBody));
    const data = mockJsonFn.mock.calls[0]?.[0];

    expect(response.status).toBe(200);
    expect(data.places).toHaveLength(0);
  });

  it('correctly processes valid [lng, lat] coordinates', async () => {
    mockRadarResponse([
      {
        _id: 'place-valid',
        name: 'Valid Market',
        formattedAddress: '100 Good St',
        categories: ['food-grocery'],
        location: { coordinates: [-122.4194, 37.7749] },
      },
    ]);

    const response = await POST(createRequest(validRequestBody));
    const data = mockJsonFn.mock.calls[0]?.[0];

    expect(response.status).toBe(200);
    expect(data.places).toHaveLength(1);
    expect(data.places[0].location.lat).toBeCloseTo(37.7749);
    expect(data.places[0].location.lng).toBeCloseTo(-122.4194);
  });
});
