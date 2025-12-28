/**
 * Tests for /api/nearby route - Response Consistency
 * Tests that both Autocomplete and Places Search paths return consistent response structures
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

describe('POST /api/nearby - Response Consistency', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  const baseRequest = {
    listingLat: 37.7749,
    listingLng: -122.4194,
    radiusMeters: 1609,
  }

  function createRequest(body: any): Request {
    return new Request('http://localhost/api/nearby', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    process.env.RADAR_SECRET_KEY = 'test-radar-key'
  })

  afterEach(() => {
    delete process.env.RADAR_SECRET_KEY
  })

  describe('Autocomplete Response Structure', () => {
    it('returns consistent structure for autocomplete with results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          addresses: [
            {
              latitude: 37.7749,
              longitude: -122.4194,
              formattedAddress: '123 Test St, San Francisco, CA',
              placeLabel: 'Test Place',
              layer: 'place',
            },
          ],
        }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        query: 'Test Place', // Text search triggers autocomplete
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      // Verify response structure
      expect(data).toHaveProperty('places')
      expect(data).toHaveProperty('meta')
      expect(data.meta).toHaveProperty('cached')
      expect(data.meta).toHaveProperty('count')
      expect(Array.isArray(data.places)).toBe(true)
      expect(typeof data.meta.cached).toBe('boolean')
      expect(typeof data.meta.count).toBe('number')
    })

    it('returns consistent structure for autocomplete with empty results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          addresses: [],
        }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        query: 'NonexistentPlace12345',
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('places')
      expect(data).toHaveProperty('meta')
      expect(data.places).toEqual([])
      expect(data.meta.count).toBe(0)
      expect(data.meta.cached).toBe(false)
    })
  })

  describe('Places Search Response Structure', () => {
    it('returns consistent structure for category search with results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: 'place-123',
              name: 'Test Restaurant',
              formattedAddress: '123 Main St',
              categories: ['food-beverage'],
              location: {
                type: 'Point',
                coordinates: [-122.4194, 37.7749],
              },
            },
          ],
        }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['food-beverage'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('places')
      expect(data).toHaveProperty('meta')
      expect(data.meta).toHaveProperty('cached')
      expect(data.meta).toHaveProperty('count')
      expect(Array.isArray(data.places)).toBe(true)
    })

    it('returns consistent structure for category search with empty results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [],
        }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['food-beverage'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places).toEqual([])
      expect(data.meta.count).toBe(0)
      expect(data.meta.cached).toBe(false)
    })
  })

  describe('Place Object Structure Consistency', () => {
    it('autocomplete places have all required fields', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          addresses: [
            {
              latitude: 37.7749,
              longitude: -122.4194,
              formattedAddress: '123 Test St',
              placeLabel: 'Test Place',
              layer: 'place',
            },
          ],
        }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        query: 'Test',
      }))
      const data = await response.json()

      const place = data.places[0]
      expect(place).toHaveProperty('id')
      expect(place).toHaveProperty('name')
      expect(place).toHaveProperty('address')
      expect(place).toHaveProperty('category')
      expect(place).toHaveProperty('location')
      expect(place.location).toHaveProperty('lat')
      expect(place.location).toHaveProperty('lng')
      expect(place).toHaveProperty('distanceMiles')
    })

    it('category search places have all required fields', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: 'place-123',
              name: 'Test Restaurant',
              formattedAddress: '123 Main St',
              categories: ['food-beverage'],
              location: {
                type: 'Point',
                coordinates: [-122.4194, 37.7749],
              },
            },
          ],
        }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['food-beverage'],
      }))
      const data = await response.json()

      const place = data.places[0]
      expect(place).toHaveProperty('id')
      expect(place).toHaveProperty('name')
      expect(place).toHaveProperty('address')
      expect(place).toHaveProperty('category')
      expect(place).toHaveProperty('location')
      expect(place.location).toHaveProperty('lat')
      expect(place.location).toHaveProperty('lng')
      expect(place).toHaveProperty('distanceMiles')
    })
  })

  describe('Error Response Structure', () => {
    it('401 error has consistent structure', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toHaveProperty('error')
      expect(typeof data.error).toBe('string')
    })

    it('400 error has consistent structure with details', async () => {
      const response = await POST(createRequest({
        listingLat: 'invalid',
        listingLng: -122.4194,
        radiusMeters: 1609,
      }))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error')
      expect(data).toHaveProperty('details')
    })

    it('Radar API error has consistent structure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(429)
      expect(data).toHaveProperty('error')
    })
  })

  describe('Headers Consistency', () => {
    it('success response has cache control headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ meta: { code: 200 }, places: [] }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['test'],
      }))

      expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate')
      expect(response.headers.get('Pragma')).toBe('no-cache')
    })

    it('autocomplete response has same cache headers as category search', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ meta: { code: 200 }, addresses: [] }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        query: 'Test',
      }))

      expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate')
      expect(response.headers.get('Pragma')).toBe('no-cache')
    })
  })

  describe('Meta Object Consistency', () => {
    it('meta.cached is always false per compliance', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ meta: { code: 200 }, places: [] }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['test'],
      }))
      const data = await response.json()

      expect(data.meta.cached).toBe(false)
    })

    it('meta.count matches places array length', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: '1',
              name: 'Place 1',
              formattedAddress: 'Address 1',
              categories: ['test'],
              location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            },
            {
              _id: '2',
              name: 'Place 2',
              formattedAddress: 'Address 2',
              categories: ['test'],
              location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
            },
          ],
        }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['test'],
      }))
      const data = await response.json()

      expect(data.meta.count).toBe(data.places.length)
    })
  })
})
