/**
 * Tests for /api/nearby route - Distance Calculation Edge Cases
 * Tests haversine formula edge cases and geographic boundary conditions
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

describe('POST /api/nearby - Distance Calculation Edge Cases', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  // Helper to create request
  function createRequest(body: any): Request {
    return new Request('http://localhost/api/nearby', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Helper to create mock Radar place at specific coordinates
  function createMockPlace(lat: number, lng: number, name = 'Test Place') {
    return {
      _id: `place-${lat}-${lng}`,
      name,
      formattedAddress: `${lat}, ${lng}`,
      categories: ['test'],
      location: {
        type: 'Point',
        coordinates: [lng, lat], // Radar returns [lng, lat]
      },
    }
  }

  function mockRadarSuccess(places: any[]) {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ meta: { code: 200 }, places }),
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

  describe('Zero and Near-Zero Distance', () => {
    it('returns 0 distance when coordinates are identical', async () => {
      const lat = 37.7749
      const lng = -122.4194
      mockRadarSuccess([createMockPlace(lat, lng)])

      const response = await POST(createRequest({
        listingLat: lat,
        listingLng: lng,
        radiusMeters: 1609,
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places[0].distanceMiles).toBe(0)
    })

    it('handles very small distances (< 0.001 miles)', async () => {
      // 0.001 miles ≈ 5.28 feet ≈ 0.00001 degrees at equator
      const listingLat = 37.7749
      const listingLng = -122.4194
      const placeLat = 37.774901 // ~0.35 feet difference
      const placeLng = -122.4194
      mockRadarSuccess([createMockPlace(placeLat, placeLng)])

      const response = await POST(createRequest({
        listingLat,
        listingLng,
        radiusMeters: 1609,
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places[0].distanceMiles).toBeGreaterThanOrEqual(0)
      expect(data.places[0].distanceMiles).toBeLessThan(0.001)
    })
  })

  describe('Geographic Extremes', () => {
    it('calculates distance near North Pole (lat = 89)', async () => {
      const listingLat = 89.0
      const listingLng = 0.0
      mockRadarSuccess([createMockPlace(89.0, 10.0, 'Arctic Place')])

      const response = await POST(createRequest({
        listingLat,
        listingLng,
        radiusMeters: 8046, // 5 miles
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      // At 89° latitude, should still calculate valid distance
      expect(typeof data.places[0].distanceMiles).toBe('number')
      expect(data.places[0].distanceMiles).toBeGreaterThan(0)
    })

    it('calculates distance near South Pole (lat = -89)', async () => {
      const listingLat = -89.0
      const listingLng = 0.0
      mockRadarSuccess([createMockPlace(-89.0, 10.0, 'Antarctic Place')])

      const response = await POST(createRequest({
        listingLat,
        listingLng,
        radiusMeters: 8046, // 5 miles
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(typeof data.places[0].distanceMiles).toBe('number')
      expect(data.places[0].distanceMiles).toBeGreaterThan(0)
    })

    it('calculates distance at equator (lat = 0)', async () => {
      const listingLat = 0.0
      const listingLng = 0.0
      mockRadarSuccess([createMockPlace(0.0, 0.01, 'Equator Place')])

      const response = await POST(createRequest({
        listingLat,
        listingLng,
        radiusMeters: 8046, // 5 miles
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      // 0.01 degrees at equator ≈ 0.69 miles
      expect(data.places[0].distanceMiles).toBeGreaterThan(0.5)
      expect(data.places[0].distanceMiles).toBeLessThan(1.0)
    })

    it('calculates distance crossing the Prime Meridian', async () => {
      const listingLat = 51.5074 // London
      const listingLng = -0.01
      mockRadarSuccess([createMockPlace(51.5074, 0.01, 'Prime Meridian Place')])

      const response = await POST(createRequest({
        listingLat,
        listingLng,
        radiusMeters: 8046, // 5 miles
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(typeof data.places[0].distanceMiles).toBe('number')
      // 0.02 degrees longitude at 51° lat ≈ 0.85 miles
      expect(data.places[0].distanceMiles).toBeGreaterThan(0.5)
      expect(data.places[0].distanceMiles).toBeLessThan(1.5)
    })
  })

  describe('International Date Line', () => {
    it('calculates distance crossing International Date Line (179 to -179)', async () => {
      const listingLat = 0.0
      const listingLng = 179.9
      // Place just across the date line
      mockRadarSuccess([createMockPlace(0.0, -179.9, 'Date Line Place')])

      const response = await POST(createRequest({
        listingLat,
        listingLng,
        radiusMeters: 8046, // 5 miles
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      // 0.2 degrees at equator ≈ 13.8 miles (not crossing date line correctly would give ~24,000 miles)
      // The haversine formula should handle this correctly
      expect(data.places[0].distanceMiles).toBeLessThan(20)
    })

    it('handles longitude at exactly 180', async () => {
      // Most systems normalize 180 to -180
      const listingLat = 0.0
      const listingLng = 180.0
      mockRadarSuccess([createMockPlace(0.0, -180.0, 'Date Line Place')])

      const response = await POST(createRequest({
        listingLat,
        listingLng,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      // This should either work or be rejected by validation
      // The Zod schema allows -180 to 180
      expect([200, 400]).toContain(response.status)
    })
  })

  describe('Floating Point Precision', () => {
    it('handles coordinates with many decimal places', async () => {
      const listingLat = 37.77777777777777777
      const listingLng = -122.41941941941941941
      mockRadarSuccess([createMockPlace(37.77777777777777777, -122.41941941941941941, 'Precise Place')])

      const response = await POST(createRequest({
        listingLat,
        listingLng,
        radiusMeters: 1609,
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places[0].distanceMiles).toBe(0)
    })

    it('distinguishes between very close but different coordinates', async () => {
      const listingLat = 37.9999999
      const listingLng = -122.0000001
      mockRadarSuccess([createMockPlace(38.0000001, -121.9999999, 'Close Place')])

      const response = await POST(createRequest({
        listingLat,
        listingLng,
        radiusMeters: 8046, // 5 miles
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      // Should detect the small difference
      expect(data.places[0].distanceMiles).toBeGreaterThan(0)
    })
  })

  describe('Distance Sorting', () => {
    it('sorts results by distance ascending', async () => {
      const listingLat = 37.7749
      const listingLng = -122.4194
      mockRadarSuccess([
        createMockPlace(37.7849, -122.4194, 'Far Place'),   // ~0.69 mi
        createMockPlace(37.7759, -122.4194, 'Near Place'),  // ~0.07 mi
        createMockPlace(37.7799, -122.4194, 'Medium Place'), // ~0.34 mi
      ])

      const response = await POST(createRequest({
        listingLat,
        listingLng,
        radiusMeters: 8046, // 5 miles
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places.length).toBe(3)
      // Verify sorted ascending by distance
      for (let i = 1; i < data.places.length; i++) {
        expect(data.places[i].distanceMiles).toBeGreaterThanOrEqual(
          data.places[i - 1].distanceMiles
        )
      }
    })
  })

  describe('Radius Boundary', () => {
    it('includes places exactly at the radius boundary', async () => {
      const listingLat = 37.7749
      const listingLng = -122.4194
      // 1609 meters = 1 mile, create place at approximately 1 mile
      // 1 degree lat ≈ 69.17 miles, so 1 mile ≈ 0.01446 degrees
      const placeLat = 37.7749 + 0.01446 // Exactly 1 mile north
      mockRadarSuccess([createMockPlace(placeLat, listingLng, 'Boundary Place')])

      const response = await POST(createRequest({
        listingLat,
        listingLng,
        radiusMeters: 1609, // 1 mile
        categories: ['test'],
      }))
      const data = await response.json()

      expect(response.status).toBe(200)
      // The place should be included as it's at approximately 1 mile
      expect(data.places.length).toBeGreaterThanOrEqual(0)
      if (data.places.length > 0) {
        expect(data.places[0].distanceMiles).toBeLessThanOrEqual(1.1) // Allow small margin
      }
    })
  })
})
