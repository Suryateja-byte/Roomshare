/**
 * Tests for /api/nearby route - Radar API Contract Tests
 * Tests handling of various Radar API response shapes and edge cases
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

describe('POST /api/nearby - Radar API Contract Tests', () => {
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

  describe('Missing Fields in Places Search Response', () => {
    it('handles response with missing places array gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ meta: { code: 200 } }), // No places array
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places).toEqual([])
      expect(data.meta.count).toBe(0)
    })

    it('handles place with missing _id field', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              // No _id
              name: 'Test Place',
              formattedAddress: '123 Test St',
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

      expect(response.status).toBe(200)
      expect(data.places[0].id).toBeDefined()
      // Should use fallback ID
      expect(data.places[0].id).toContain('place-')
    })

    it('handles place with missing name field', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: 'place-123',
              // No name
              formattedAddress: '123 Test St',
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

      expect(response.status).toBe(200)
      expect(data.places[0].name).toBe('Unknown Place')
    })

    it('handles place with missing formattedAddress', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: 'place-123',
              name: 'Test Place',
              // No formattedAddress
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

      expect(response.status).toBe(200)
      expect(data.places[0].address).toBe('')
    })

    it('handles place with missing categories', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: 'place-123',
              name: 'Test Place',
              formattedAddress: '123 Test St',
              // No categories
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

      expect(response.status).toBe(200)
      expect(data.places[0].category).toBe('unknown')
    })

    it('handles place with missing location object', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: 'place-123',
              name: 'Test Place',
              formattedAddress: '123 Test St',
              categories: ['test'],
              // No location
            },
          ],
        }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      // Place with missing location should be filtered out
      expect(data.places).toEqual([])
    })

    it('handles place with empty coordinates array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: 'place-123',
              name: 'Test Place',
              formattedAddress: '123 Test St',
              categories: ['test'],
              location: { type: 'Point', coordinates: [] },
            },
          ],
        }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      // Place with empty coordinates should be filtered out
      expect(data.places).toEqual([])
    })
  })

  describe('Missing Fields in Autocomplete Response', () => {
    it('handles response with missing addresses array gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ meta: { code: 200 } }), // No addresses array
      })

      const response = await POST(createRequest({
        ...baseRequest,
        query: 'Test',
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places).toEqual([])
      expect(data.meta.count).toBe(0)
    })

    it('handles address with missing latitude', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          addresses: [
            {
              // No latitude
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

      expect(response.status).toBe(200)
      // Address with missing latitude should be filtered out
      expect(data.places).toEqual([])
    })

    it('handles address with missing longitude', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          addresses: [
            {
              latitude: 37.7749,
              // No longitude
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

      expect(response.status).toBe(200)
      expect(data.places).toEqual([])
    })

    it('handles address without layer=place (should be filtered)', async () => {
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
              layer: 'address', // Not 'place'
            },
          ],
        }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        query: 'Test',
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places).toEqual([])
    })
  })

  describe('Extra Unknown Fields', () => {
    it('ignores extra unknown fields in places', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200, unknownMeta: 'ignored' },
          places: [
            {
              _id: 'place-123',
              name: 'Test Place',
              formattedAddress: '123 Test St',
              categories: ['test'],
              location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
              unknownField: 'should be ignored',
              anotherUnknown: { nested: 'value' },
            },
          ],
          unknownTopLevel: 'ignored',
        }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places.length).toBe(1)
      // Extra fields should not appear in output
      expect(data.places[0].unknownField).toBeUndefined()
    })
  })

  describe('Null Values in Response', () => {
    it('handles null in places array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            null,
            {
              _id: 'place-123',
              name: 'Valid Place',
              formattedAddress: '123 Test St',
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

      expect(response.status).toBe(200)
      // Null entry should be filtered out
      expect(data.places.length).toBe(1)
      expect(data.places[0].name).toBe('Valid Place')
    })

    it('handles null name in place', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: 'place-123',
              name: null,
              formattedAddress: '123 Test St',
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

      expect(response.status).toBe(200)
      expect(data.places[0].name).toBe('Unknown Place')
    })
  })

  describe('Chain Information', () => {
    it('includes chain name when present', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: 'place-123',
              name: 'Starbucks',
              formattedAddress: '123 Test St',
              categories: ['coffee-shop'],
              location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
              chain: { name: 'Starbucks', slug: 'starbucks' },
            },
          ],
        }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places[0].chain).toBe('Starbucks')
    })

    it('omits chain field when not present', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: 'place-123',
              name: 'Local Coffee Shop',
              formattedAddress: '123 Test St',
              categories: ['coffee-shop'],
              location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
              // No chain
            },
          ],
        }),
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places[0].chain).toBeUndefined()
    })
  })

  describe('Error Responses from Radar', () => {
    it('handles 401 Unauthorized from Radar', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => '{"meta":{"code":401,"message":"Unauthorized"}}',
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('authentication')
    })

    it('handles 429 Rate Limit from Radar', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => '{"meta":{"code":429,"message":"Rate limit exceeded"}}',
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(429)
      expect(data.error).toContain('rate limit')
    })

    it('handles 500 Internal Server Error from Radar', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => '{"meta":{"code":500,"message":"Internal Server Error"}}',
      })

      const response = await POST(createRequest({
        ...baseRequest,
        categories: ['test'],
      }))

      expect(response.status).toBe(500)
    })
  })
})
