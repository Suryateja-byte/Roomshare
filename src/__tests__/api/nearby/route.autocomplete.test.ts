/**
 * Tests for /api/nearby route - Autocomplete Mode
 * Tests text-based search using Radar Autocomplete API
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
import { withRateLimit } from '@/lib/with-rate-limit'

describe('POST /api/nearby - Autocomplete Mode (Text Search)', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  // Text search request (query without categories)
  const textSearchRequest = {
    listingLat: 37.7749,
    listingLng: -122.4194,
    query: 'Chipotle',
    radiusMeters: 1609,
  }

  // Mock Radar Autocomplete response
  const mockAutocompleteResponse = {
    meta: { code: 200 },
    addresses: [
      {
        latitude: 37.7760,
        longitude: -122.4180,
        formattedAddress: '123 Main St, San Francisco, CA 94102',
        placeLabel: 'Chipotle Mexican Grill',
        addressLabel: '123 Main St',
        layer: 'place',
        distance: 150,
      },
      {
        latitude: 37.7780,
        longitude: -122.4100,
        formattedAddress: '456 Market St, San Francisco, CA 94102',
        placeLabel: 'Chipotle Mexican Grill',
        addressLabel: '456 Market St',
        layer: 'place',
        distance: 500,
      },
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(withRateLimit as jest.Mock).mockResolvedValue(null)
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockAutocompleteResponse,
    })
    process.env.RADAR_SECRET_KEY = 'test-secret-key'
  })

  afterEach(() => {
    delete process.env.RADAR_SECRET_KEY
  })

  const createRequest = (body: any): Request => {
    return {
      json: async () => body,
      url: 'http://localhost:3000/api/nearby',
      headers: new Headers(),
    } as unknown as Request
  }

  describe('Mode Detection', () => {
    it('uses Autocomplete API when query is provided without categories', async () => {
      await POST(createRequest(textSearchRequest))

      // Verify fetch was called with autocomplete URL
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const fetchUrl = mockFetch.mock.calls[0][0]
      expect(fetchUrl).toContain('https://api.radar.io/v1/search/autocomplete')
      expect(fetchUrl).toContain('query=Chipotle')
      expect(fetchUrl).toContain('layers=place')
    })

    it('uses Places Search API when categories are provided', async () => {
      const categorySearchRequest = {
        listingLat: 37.7749,
        listingLng: -122.4194,
        categories: ['grocery'],
        radiusMeters: 1609,
      }

      // Mock Places Search response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: 'place-1',
              name: 'Whole Foods',
              location: { type: 'Point', coordinates: [-122.4180, 37.7760] },
              categories: ['grocery'],
              formattedAddress: '123 Main St',
            },
          ],
        }),
      })

      await POST(createRequest(categorySearchRequest))

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const fetchUrl = mockFetch.mock.calls[0][0]
      expect(fetchUrl).toContain('https://api.radar.io/v1/search/places')
      expect(fetchUrl).toContain('categories=grocery')
    })

    it('uses Places Search API when both query and categories are provided', async () => {
      const mixedRequest = {
        listingLat: 37.7749,
        listingLng: -122.4194,
        query: 'organic',
        categories: ['grocery'],
        radiusMeters: 1609,
      }

      // Mock Places Search response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { code: 200 },
          places: [
            {
              _id: 'place-1',
              name: 'Organic Grocery',
              location: { type: 'Point', coordinates: [-122.4180, 37.7760] },
              categories: ['grocery'],
              formattedAddress: '123 Main St',
            },
          ],
        }),
      })

      await POST(createRequest(mixedRequest))

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const fetchUrl = mockFetch.mock.calls[0][0]
      expect(fetchUrl).toContain('https://api.radar.io/v1/search/places')
      expect(fetchUrl).toContain('query=organic')
    })

    it('requires minimum 2 characters for text search', async () => {
      const shortQueryRequest = {
        listingLat: 37.7749,
        listingLng: -122.4194,
        query: 'C', // Only 1 character
        radiusMeters: 1609,
      }

      // Mock Places Search response (fallback when query too short)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { code: 200 },
          places: [],
        }),
      })

      await POST(createRequest(shortQueryRequest))

      // Should fall back to Places Search with default categories
      const fetchUrl = mockFetch.mock.calls[0][0]
      expect(fetchUrl).toContain('https://api.radar.io/v1/search/places')
    })
  })

  describe('Autocomplete Response Normalization', () => {
    it('normalizes autocomplete results to NearbyPlace format', async () => {
      const response = await POST(createRequest(textSearchRequest))
      const data = await response.json()

      expect(data.places).toHaveLength(2)
      expect(data.places[0]).toMatchObject({
        id: expect.stringMatching(/^ac-/), // ID starts with 'ac-' prefix
        name: 'Chipotle Mexican Grill',
        address: '123 Main St, San Francisco, CA 94102',
        category: 'place',
        location: {
          lat: 37.7760,
          lng: -122.4180,
        },
        distanceMiles: expect.any(Number),
      })
    })

    it('calculates accurate distances using Haversine formula', async () => {
      const response = await POST(createRequest(textSearchRequest))
      const data = await response.json()

      // Distance should be calculated, not 0
      expect(data.places[0].distanceMiles).toBeGreaterThan(0)
      expect(data.places[0].distanceMiles).toBeLessThan(1) // Within 1 mile

      // Second place should be farther
      expect(data.places[1].distanceMiles).toBeGreaterThan(data.places[0].distanceMiles)
    })

    it('sorts results by distance (nearest first)', async () => {
      const response = await POST(createRequest(textSearchRequest))
      const data = await response.json()

      for (let i = 1; i < data.places.length; i++) {
        expect(data.places[i].distanceMiles).toBeGreaterThanOrEqual(
          data.places[i - 1].distanceMiles
        )
      }
    })

    it('filters out non-place layers (addresses, postalCodes)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { code: 200 },
          addresses: [
            {
              latitude: 37.7760,
              longitude: -122.4180,
              formattedAddress: '123 Main St',
              placeLabel: 'Chipotle',
              layer: 'place', // Include
            },
            {
              latitude: 37.7770,
              longitude: -122.4170,
              formattedAddress: '456 Main St',
              layer: 'address', // Exclude
            },
            {
              latitude: 37.7780,
              longitude: -122.4160,
              formattedAddress: '94102',
              layer: 'postalCode', // Exclude
            },
          ],
        }),
      })

      const response = await POST(createRequest(textSearchRequest))
      const data = await response.json()

      expect(data.places).toHaveLength(1)
      expect(data.places[0].name).toBe('Chipotle')
    })

    it('uses fallback name when placeLabel is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { code: 200 },
          addresses: [
            {
              latitude: 37.7760,
              longitude: -122.4180,
              formattedAddress: '123 Main St, SF',
              addressLabel: '123 Main St',
              layer: 'place',
              // No placeLabel
            },
          ],
        }),
      })

      const response = await POST(createRequest(textSearchRequest))
      const data = await response.json()

      expect(data.places[0].name).toBe('123 Main St')
    })
  })

  describe('Autocomplete URL Parameters', () => {
    it('includes near parameter with listing coordinates', async () => {
      await POST(createRequest(textSearchRequest))

      const fetchUrl = mockFetch.mock.calls[0][0]
      expect(fetchUrl).toContain('near=37.7749%2C-122.4194')
    })

    it('includes limit parameter (multiplied by 3 for local filtering)', async () => {
      const requestWithLimit = {
        ...textSearchRequest,
        limit: 10,
      }

      await POST(createRequest(requestWithLimit))

      const fetchUrl = mockFetch.mock.calls[0][0]
      // Autocomplete requests 3x the limit for local distance filtering
      expect(fetchUrl).toContain('limit=30')
    })

    it('includes countryCode=US parameter to restrict results', async () => {
      await POST(createRequest(textSearchRequest))

      const fetchUrl = mockFetch.mock.calls[0][0]
      expect(fetchUrl).toContain('countryCode=US')
    })

    it('trims whitespace from query', async () => {
      const requestWithWhitespace = {
        ...textSearchRequest,
        query: '  Chipotle  ',
      }

      await POST(createRequest(requestWithWhitespace))

      const fetchUrl = mockFetch.mock.calls[0][0]
      expect(fetchUrl).toContain('query=Chipotle')
      expect(fetchUrl).not.toContain('query=%20')
    })
  })

  describe('Autocomplete Error Handling', () => {
    it('returns error for Radar 401 authentication failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: 'Invalid API key' }),
      })

      const response = await POST(createRequest(textSearchRequest))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Radar API authentication failed')
    })

    it('returns error for Radar 403 permission denied', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ error: 'Permission denied' }),
      })

      const response = await POST(createRequest(textSearchRequest))
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Radar API access denied')
      expect(data.details).toContain('Autocomplete')
    })

    it('returns error for Radar 429 rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: 'Rate limited' }),
      })

      const response = await POST(createRequest(textSearchRequest))
      const data = await response.json()

      expect(response.status).toBe(429)
      expect(data.error).toBe('Radar API rate limit exceeded')
    })

    it('handles empty results gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { code: 200 },
          addresses: [],
        }),
      })

      const response = await POST(createRequest(textSearchRequest))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places).toEqual([])
      expect(data.meta.count).toBe(0)
    })

    it('filters out results with missing coordinates', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { code: 200 },
          addresses: [
            {
              latitude: 37.7760,
              longitude: -122.4180,
              placeLabel: 'Valid Place',
              layer: 'place',
            },
            {
              latitude: null, // Missing
              longitude: -122.4170,
              placeLabel: 'Invalid Place 1',
              layer: 'place',
            },
            {
              latitude: 37.7780,
              longitude: undefined, // Missing
              placeLabel: 'Invalid Place 2',
              layer: 'place',
            },
          ],
        }),
      })

      const response = await POST(createRequest(textSearchRequest))
      const data = await response.json()

      expect(data.places).toHaveLength(1)
      expect(data.places[0].name).toBe('Valid Place')
    })
  })

  describe('Real-world Search Scenarios', () => {
    it('handles "Chipotle" search returning actual Chipotle locations', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { code: 200 },
          addresses: [
            {
              latitude: 37.7760,
              longitude: -122.4180,
              formattedAddress: '123 Main St, San Francisco, CA',
              placeLabel: 'Chipotle Mexican Grill',
              layer: 'place',
            },
            {
              latitude: 37.7800,
              longitude: -122.4100,
              formattedAddress: '789 Market St, San Francisco, CA',
              placeLabel: 'Chipotle Mexican Grill',
              layer: 'place',
            },
          ],
        }),
      })

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          query: 'Chipotle',
          radiusMeters: 3218, // 2 miles
        })
      )
      const data = await response.json()

      expect(data.places).toHaveLength(2)
      expect(data.places.every((p: any) => p.name.includes('Chipotle'))).toBe(true)
      expect(data.places[0].distanceMiles).toBeGreaterThan(0)
    })

    it('handles "Starbucks" search with multiple results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { code: 200 },
          addresses: [
            {
              latitude: 37.7755,
              longitude: -122.4190,
              placeLabel: 'Starbucks',
              formattedAddress: '100 Main St',
              layer: 'place',
            },
            {
              latitude: 37.7780,
              longitude: -122.4150,
              placeLabel: 'Starbucks Reserve',
              formattedAddress: '200 Market St',
              layer: 'place',
            },
          ],
        }),
      })

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          query: 'Starbucks',
          radiusMeters: 1609,
        })
      )
      const data = await response.json()

      expect(data.places).toHaveLength(2)
      expect(data.places[0].name).toContain('Starbucks')
    })

    it('handles international place names', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { code: 200 },
          addresses: [
            {
              latitude: 37.7760,
              longitude: -122.4180,
              placeLabel: '日本料理店',
              formattedAddress: '123 Japan Town, SF',
              layer: 'place',
            },
          ],
        }),
      })

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          query: 'Japanese',
          radiusMeters: 1609,
        })
      )
      const data = await response.json()

      expect(data.places[0].name).toBe('日本料理店')
    })
  })

  describe('Geographic Radius Filtering', () => {
    it('filters out results beyond selected radius (1 mile)', async () => {
      // Mock response with places at various distances from listing
      // Listing is at 37.7749, -122.4194
      // Note: Uses specific place name "Planet Fitness" (not keyword "gym")
      // because keyword searches now route to Places Search API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { code: 200 },
          addresses: [
            {
              latitude: 37.7755, // ~0.04 miles away
              longitude: -122.4190,
              placeLabel: 'Planet Fitness Nearby',
              formattedAddress: '100 Main St',
              layer: 'place',
            },
            {
              latitude: 37.79, // ~1.7 miles away
              longitude: -122.42,
              placeLabel: 'Planet Fitness Far',
              formattedAddress: '200 Far St',
              layer: 'place',
            },
            {
              latitude: 38.0, // ~25 miles away
              longitude: -122.0,
              placeLabel: 'Planet Fitness Very Far',
              formattedAddress: '300 Very Far St',
              layer: 'place',
            },
          ],
        }),
      })

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          query: 'Planet Fitness', // Specific place name, not keyword
          radiusMeters: 1609, // 1 mile
        })
      )
      const data = await response.json()

      // Should only include places within 1 mile
      expect(data.places).toHaveLength(1)
      expect(data.places[0].name).toBe('Planet Fitness Nearby')
      expect(data.places[0].distanceMiles).toBeLessThan(1)
    })

    it('includes more results with larger radius (5 miles)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { code: 200 },
          addresses: [
            {
              latitude: 37.7755,
              longitude: -122.4190,
              placeLabel: 'Close Place',
              layer: 'place',
            },
            {
              latitude: 37.79, // ~1.7 miles
              longitude: -122.42,
              placeLabel: 'Medium Distance Place',
              layer: 'place',
            },
            {
              latitude: 37.82, // ~5 miles
              longitude: -122.45,
              placeLabel: 'Edge of Radius Place',
              layer: 'place',
            },
          ],
        }),
      })

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          query: 'place',
          radiusMeters: 8046, // 5 miles
        })
      )
      const data = await response.json()

      // Should include places within 5 miles
      expect(data.places.length).toBeGreaterThanOrEqual(2)
      data.places.forEach((place: any) => {
        expect(place.distanceMiles).toBeLessThanOrEqual(5)
      })
    })

    it('returns empty array when all results are beyond radius', async () => {
      // Mock response with only far-away places (simulating global results from autocomplete)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { code: 200 },
          addresses: [
            {
              latitude: 35.6762, // Tokyo - thousands of miles away
              longitude: 139.6503,
              placeLabel: 'Tokyo Gym',
              layer: 'place',
            },
            {
              latitude: 51.5074, // London - thousands of miles away
              longitude: -0.1278,
              placeLabel: 'London Gym',
              layer: 'place',
            },
          ],
        }),
      })

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          query: 'gym',
          radiusMeters: 1609, // 1 mile
        })
      )
      const data = await response.json()

      // All results should be filtered out
      expect(data.places).toHaveLength(0)
      expect(data.meta.count).toBe(0)
    })

    it('limits final results to requested limit after filtering', async () => {
      // Mock many results, all within radius
      const manyPlaces = Array.from({ length: 50 }, (_, i) => ({
        latitude: 37.7749 + i * 0.0001,
        longitude: -122.4194 + i * 0.0001,
        placeLabel: `Place ${i}`,
        layer: 'place',
      }))

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          meta: { code: 200 },
          addresses: manyPlaces,
        }),
      })

      const response = await POST(
        createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          query: 'place',
          radiusMeters: 8046,
          limit: 10, // Request only 10
        })
      )
      const data = await response.json()

      // Should be limited to requested count
      expect(data.places.length).toBeLessThanOrEqual(10)
    })
  })

  describe('Cache Control', () => {
    it('sets no-cache headers for autocomplete responses', async () => {
      await POST(createRequest(textSearchRequest))

      expect(mockJsonFn).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            Pragma: 'no-cache',
          }),
        })
      )
    })

    it('sets cached: false in response meta', async () => {
      const response = await POST(createRequest(textSearchRequest))
      const data = await response.json()

      expect(data.meta.cached).toBe(false)
    })
  })
})
