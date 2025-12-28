/**
 * Tests for /api/nearby route - Request Body Edge Cases
 * Tests malformed requests, invalid JSON, and edge cases in request parsing
 */

// Mock NextResponse before importing the route
const mockJsonFn = jest.fn()
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, init?: { status?: number; headers?: Record<string, string> }) => {
      mockJsonFn(data, init)
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: new Map(Object.entries(init?.headers || {})),
      }
    },
  },
}))

// Mock auth
jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

// Mock rate limiting to return null (allow request)
jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}))

// Mock fetch for Radar API calls
const mockFetch = jest.fn()
global.fetch = mockFetch

import { POST } from '@/app/api/nearby/route'
import { auth } from '@/auth'

describe('POST /api/nearby - Request Body Edge Cases', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    process.env.RADAR_SECRET_KEY = 'test-radar-key'
  })

  afterEach(() => {
    delete process.env.RADAR_SECRET_KEY
  })

  describe('Invalid JSON', () => {
    it('returns 400 with helpful message for completely invalid JSON', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: '{invalid json here',
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request body')
      expect(data.details).toBe('Request body must be valid JSON')
    })

    it('returns 400 for JSON with trailing comma', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: '{"listingLat": 37.7749,}',
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request body')
    })

    it('returns 400 for JSON with single quotes', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: "{'listingLat': 37.7749}",
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request body')
    })

    it('returns 400 for truncated JSON', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: '{"listingLat": 37.7749, "listingLng": -122.4194, "radius',
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request body')
    })
  })

  describe('Wrong Types', () => {
    it('returns 400 when body is an array', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify([37.7749, -122.4194]),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })

    it('returns 400 when body is a string', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify('just a string'),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })

    it('returns 400 when body is a number', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify(12345),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })

    it('returns 400 when body is null', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify(null),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })

    it('returns 400 when body is boolean', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify(true),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })
  })

  describe('Field Type Validation', () => {
    it('returns 400 when listingLat is a string', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify({
          listingLat: '37.7749',
          listingLng: -122.4194,
          radiusMeters: 1609,
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
      expect(data.details).toBeDefined()
    })

    it('returns 400 when radiusMeters is invalid value', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify({
          listingLat: 37.7749,
          listingLng: -122.4194,
          radiusMeters: 5000, // Not 1609, 3218, or 8046
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })

    it('returns 400 when categories is not an array', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify({
          listingLat: 37.7749,
          listingLng: -122.4194,
          radiusMeters: 1609,
          categories: 'food-beverage', // Should be array
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })

    it('returns 400 when limit is a string', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify({
          listingLat: 37.7749,
          listingLng: -122.4194,
          radiusMeters: 1609,
          limit: '20',
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
    })
  })

  describe('Deeply Nested Objects', () => {
    it('handles deeply nested extra fields gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ meta: { code: 200 }, places: [] }),
      })

      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify({
          listingLat: 37.7749,
          listingLng: -122.4194,
          radiusMeters: 1609,
          extra: {
            nested: {
              deeply: {
                nested: {
                  value: 'ignored',
                },
              },
            },
          },
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      // Extra fields should be ignored, request should succeed
      expect(response.status).toBe(200)
    })
  })

  describe('Empty and Missing Fields', () => {
    it('returns 400 when required fields are missing', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify({
          listingLat: 37.7749,
          // Missing listingLng and radiusMeters
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })

    it('returns 400 when body is empty object', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })

    it('accepts empty optional fields', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ meta: { code: 200 }, places: [] }),
      })

      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify({
          listingLat: 37.7749,
          listingLng: -122.4194,
          radiusMeters: 1609,
          query: '', // Empty optional field
          categories: [], // Empty array
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
    })
  })

  describe('Boundary Values', () => {
    it('accepts valid minimum limit', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ meta: { code: 200 }, places: [] }),
      })

      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify({
          listingLat: 37.7749,
          listingLng: -122.4194,
          radiusMeters: 1609,
          limit: 1, // Minimum
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
    })

    it('accepts valid maximum limit', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ meta: { code: 200 }, places: [] }),
      })

      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify({
          listingLat: 37.7749,
          listingLng: -122.4194,
          radiusMeters: 1609,
          limit: 50, // Maximum
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
    })

    it('rejects limit below minimum', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify({
          listingLat: 37.7749,
          listingLng: -122.4194,
          radiusMeters: 1609,
          limit: 0,
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })

    it('rejects limit above maximum', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify({
          listingLat: 37.7749,
          listingLng: -122.4194,
          radiusMeters: 1609,
          limit: 51,
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })
  })

  describe('Query Length Validation', () => {
    it('accepts query at maximum length (100 chars)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ meta: { code: 200 }, addresses: [] }),
      })

      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify({
          listingLat: 37.7749,
          listingLng: -122.4194,
          radiusMeters: 1609,
          query: 'a'.repeat(100),
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
    })

    it('rejects query above maximum length', async () => {
      const request = new Request('http://localhost/api/nearby', {
        method: 'POST',
        body: JSON.stringify({
          listingLat: 37.7749,
          listingLng: -122.4194,
          radiusMeters: 1609,
          query: 'a'.repeat(101),
        }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })
  })
})
