/**
 * Tests for /api/nearby route - Keyword Search Feature
 * Tests that common category keywords like "gym", "coffee", "restaurant"
 * are routed to Places Search API with appropriate categories
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

describe('POST /api/nearby - Keyword Search Feature', () => {
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

  function mockPlacesSearchSuccess(places: any[] = []) {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        meta: { code: 200 },
        places,
      }),
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

  describe('Fitness Keywords', () => {
    it('routes "gym" keyword to Places Search with correct categories', async () => {
      mockPlacesSearchSuccess([
        {
          _id: 'place-1',
          name: 'Planet Fitness',
          formattedAddress: '123 Main St',
          categories: ['gym'],
          location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        },
      ])

      const response = await POST(
        createRequest({
          ...baseRequest,
          query: 'gym',
        })
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places).toHaveLength(1)
      expect(data.places[0].name).toBe('Planet Fitness')

      // Verify Places Search API was called (not Autocomplete)
      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('api.radar.io/v1/search/places')
      expect(url).toContain('categories=gym%2Cfitness-recreation')
    })

    it('routes "fitness" keyword to Places Search', async () => {
      mockPlacesSearchSuccess([])

      await POST(
        createRequest({
          ...baseRequest,
          query: 'fitness',
        })
      )

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('api.radar.io/v1/search/places')
      expect(url).toContain('categories=gym%2Cfitness-recreation')
    })

    it('routes "workout" keyword to Places Search', async () => {
      mockPlacesSearchSuccess([])

      await POST(
        createRequest({
          ...baseRequest,
          query: 'workout',
        })
      )

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('api.radar.io/v1/search/places')
      expect(url).toContain('categories=gym%2Cfitness-recreation')
    })
  })

  describe('Food Keywords', () => {
    it('routes "restaurant" keyword to Places Search', async () => {
      mockPlacesSearchSuccess([
        {
          _id: 'place-1',
          name: 'The Local Bistro',
          formattedAddress: '456 Oak Ave',
          categories: ['restaurant'],
          location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        },
      ])

      const response = await POST(
        createRequest({
          ...baseRequest,
          query: 'restaurant',
        })
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places).toHaveLength(1)

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('api.radar.io/v1/search/places')
      expect(url).toContain('categories=restaurant%2Cfood-beverage')
    })

    it('routes "pizza" keyword to Places Search', async () => {
      mockPlacesSearchSuccess([])

      await POST(
        createRequest({
          ...baseRequest,
          query: 'pizza',
        })
      )

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('categories=pizza%2Crestaurant')
    })

    it('routes "sushi" keyword to Places Search', async () => {
      mockPlacesSearchSuccess([])

      await POST(
        createRequest({
          ...baseRequest,
          query: 'sushi',
        })
      )

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('categories=sushi-restaurant%2Crestaurant')
    })
  })

  describe('Coffee Keywords', () => {
    it('routes "coffee" keyword to Places Search', async () => {
      mockPlacesSearchSuccess([
        {
          _id: 'place-1',
          name: 'Starbucks',
          formattedAddress: '789 Coffee Lane',
          categories: ['coffee-shop'],
          location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
          chain: { name: 'Starbucks' },
        },
      ])

      const response = await POST(
        createRequest({
          ...baseRequest,
          query: 'coffee',
        })
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places).toHaveLength(1)
      expect(data.places[0].name).toBe('Starbucks')

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('categories=coffee-shop%2Ccafe')
    })

    it('routes "cafe" keyword to Places Search', async () => {
      mockPlacesSearchSuccess([])

      await POST(
        createRequest({
          ...baseRequest,
          query: 'cafe',
        })
      )

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('categories=cafe%2Ccoffee-shop')
    })
  })

  describe('Health Keywords', () => {
    it('routes "pharmacy" keyword to Places Search', async () => {
      mockPlacesSearchSuccess([])

      await POST(
        createRequest({
          ...baseRequest,
          query: 'pharmacy',
        })
      )

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('categories=pharmacy')
    })

    it('routes "hospital" keyword to Places Search', async () => {
      mockPlacesSearchSuccess([])

      await POST(
        createRequest({
          ...baseRequest,
          query: 'hospital',
        })
      )

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('categories=hospital%2Chealth-medicine')
    })
  })

  describe('Shopping Keywords', () => {
    it('routes "grocery" keyword to Places Search', async () => {
      mockPlacesSearchSuccess([])

      await POST(
        createRequest({
          ...baseRequest,
          query: 'grocery',
        })
      )

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('categories=food-grocery%2Csupermarket')
    })
  })

  describe('Service Keywords', () => {
    it('routes "bank" keyword to Places Search', async () => {
      mockPlacesSearchSuccess([])

      await POST(
        createRequest({
          ...baseRequest,
          query: 'bank',
        })
      )

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('categories=bank%2Cfinancial-service')
    })

    it('routes "gas" keyword to Places Search', async () => {
      mockPlacesSearchSuccess([])

      await POST(
        createRequest({
          ...baseRequest,
          query: 'gas',
        })
      )

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('categories=gas-station')
    })

    it('routes "gas station" keyword to Places Search', async () => {
      mockPlacesSearchSuccess([])

      await POST(
        createRequest({
          ...baseRequest,
          query: 'gas station',
        })
      )

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('categories=gas-station')
    })
  })

  describe('Case Insensitivity', () => {
    it('handles uppercase keyword "GYM"', async () => {
      mockPlacesSearchSuccess([])

      await POST(
        createRequest({
          ...baseRequest,
          query: 'GYM',
        })
      )

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('api.radar.io/v1/search/places')
      expect(url).toContain('categories=gym%2Cfitness-recreation')
    })

    it('handles mixed case keyword "Coffee"', async () => {
      mockPlacesSearchSuccess([])

      await POST(
        createRequest({
          ...baseRequest,
          query: 'Coffee',
        })
      )

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('categories=coffee-shop%2Ccafe')
    })
  })

  describe('Non-Keyword Queries (Autocomplete Path)', () => {
    it('routes specific place name to Autocomplete', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          addresses: [
            {
              latitude: 37.7749,
              longitude: -122.4194,
              placeLabel: 'Chipotle Mexican Grill',
              formattedAddress: '123 Main St',
              layer: 'place',
            },
          ],
        }),
      })

      const response = await POST(
        createRequest({
          ...baseRequest,
          query: 'Chipotle',
        })
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places).toHaveLength(1)
      expect(data.places[0].name).toBe('Chipotle Mexican Grill')

      // Verify Autocomplete API was called (not Places Search)
      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('api.radar.io/v1/search/autocomplete')
    })

    it('routes unknown terms to Autocomplete', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          meta: { code: 200 },
          addresses: [],
        }),
      })

      await POST(
        createRequest({
          ...baseRequest,
          query: 'xyznonexistent',
        })
      )

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('api.radar.io/v1/search/autocomplete')
    })
  })

  describe('Category Chips Still Work', () => {
    it('uses provided categories over keyword detection', async () => {
      mockPlacesSearchSuccess([])

      // Even if query contains a keyword, explicit categories should be used
      await POST(
        createRequest({
          ...baseRequest,
          categories: ['food-beverage'], // Explicit category chip
        })
      )

      const fetchCall = mockFetch.mock.calls[0]
      const url = fetchCall[0]
      expect(url).toContain('api.radar.io/v1/search/places')
      expect(url).toContain('categories=food-beverage')
    })
  })
})
