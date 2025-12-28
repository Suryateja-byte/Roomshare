/**
 * Tests for /api/nearby route - Coordinates Boundary Edge Cases
 * Tests latitude/longitude boundary conditions and special values
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

describe('POST /api/nearby - Coordinates Boundary Edge Cases', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  function createRequest(body: any): Request {
    return new Request('http://localhost/api/nearby', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  function mockRadarSuccess() {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ meta: { code: 200 }, places: [] }),
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

  describe('Latitude Boundaries', () => {
    it('accepts latitude at exactly 90 (North Pole)', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        listingLat: 90,
        listingLng: 0,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(200)
    })

    it('accepts latitude at exactly -90 (South Pole)', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        listingLat: -90,
        listingLng: 0,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(200)
    })

    it('accepts latitude at exactly 0 (Equator)', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        listingLat: 0,
        listingLng: 0,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(200)
    })

    it('rejects latitude above 90', async () => {
      const response = await POST(createRequest({
        listingLat: 90.0001,
        listingLng: 0,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(400)
    })

    it('rejects latitude below -90', async () => {
      const response = await POST(createRequest({
        listingLat: -90.0001,
        listingLng: 0,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(400)
    })

    it('rejects latitude of 91', async () => {
      const response = await POST(createRequest({
        listingLat: 91,
        listingLng: 0,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(400)
    })
  })

  describe('Longitude Boundaries', () => {
    it('accepts longitude at exactly 180', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        listingLat: 0,
        listingLng: 180,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(200)
    })

    it('accepts longitude at exactly -180', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        listingLat: 0,
        listingLng: -180,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(200)
    })

    it('accepts longitude at exactly 0 (Prime Meridian)', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        listingLat: 0,
        listingLng: 0,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(200)
    })

    it('rejects longitude above 180', async () => {
      const response = await POST(createRequest({
        listingLat: 0,
        listingLng: 180.0001,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(400)
    })

    it('rejects longitude below -180', async () => {
      const response = await POST(createRequest({
        listingLat: 0,
        listingLng: -180.0001,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(400)
    })

    it('rejects longitude of 181', async () => {
      const response = await POST(createRequest({
        listingLat: 0,
        listingLng: 181,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(400)
    })
  })

  describe('Special Numeric Values', () => {
    it('handles negative zero (-0) coordinates', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        listingLat: -0,
        listingLng: -0,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      // -0 should be treated as 0
      expect(response.status).toBe(200)
    })

    it('rejects NaN latitude', async () => {
      const response = await POST(createRequest({
        listingLat: NaN,
        listingLng: 0,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(400)
    })

    it('rejects Infinity latitude', async () => {
      const response = await POST(createRequest({
        listingLat: Infinity,
        listingLng: 0,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(400)
    })

    it('rejects -Infinity longitude', async () => {
      const response = await POST(createRequest({
        listingLat: 0,
        listingLng: -Infinity,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(400)
    })
  })

  describe('Decimal Precision', () => {
    it('handles coordinates with many decimal places', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        listingLat: 37.77777777777777777777,
        listingLng: -122.41941941941941941,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(200)
    })

    it('handles coordinates in scientific notation', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        listingLat: 3.7e1, // 37
        listingLng: -1.22e2, // -122
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(200)
    })

    it('handles very small coordinate differences', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        listingLat: 37.7749000000001,
        listingLng: -122.4194000000001,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(200)
    })
  })

  describe('Geographic Corner Cases', () => {
    it('accepts coordinates at all four corners of valid range', async () => {
      mockRadarSuccess()

      // Northwest corner: 90, -180
      const nw = await POST(createRequest({
        listingLat: 90,
        listingLng: -180,
        radiusMeters: 1609,
        categories: ['test'],
      }))
      expect(nw.status).toBe(200)

      // Northeast corner: 90, 180
      const ne = await POST(createRequest({
        listingLat: 90,
        listingLng: 180,
        radiusMeters: 1609,
        categories: ['test'],
      }))
      expect(ne.status).toBe(200)

      // Southwest corner: -90, -180
      const sw = await POST(createRequest({
        listingLat: -90,
        listingLng: -180,
        radiusMeters: 1609,
        categories: ['test'],
      }))
      expect(sw.status).toBe(200)

      // Southeast corner: -90, 180
      const se = await POST(createRequest({
        listingLat: -90,
        listingLng: 180,
        radiusMeters: 1609,
        categories: ['test'],
      }))
      expect(se.status).toBe(200)
    })

    it('accepts coordinates at null island (0, 0)', async () => {
      mockRadarSuccess()

      const response = await POST(createRequest({
        listingLat: 0,
        listingLng: 0,
        radiusMeters: 1609,
        categories: ['test'],
      }))

      expect(response.status).toBe(200)
    })
  })

  describe('Radius Boundaries', () => {
    it('accepts all valid radius values', async () => {
      mockRadarSuccess()

      const validRadii = [1609, 3218, 8046]
      for (const radius of validRadii) {
        const response = await POST(createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          radiusMeters: radius,
          categories: ['test'],
        }))
        expect(response.status).toBe(200)
      }
    })

    it('rejects invalid radius values', async () => {
      const invalidRadii = [0, 1000, 1608, 1610, 5000, 10000, -1609]
      for (const radius of invalidRadii) {
        const response = await POST(createRequest({
          listingLat: 37.7749,
          listingLng: -122.4194,
          radiusMeters: radius,
          categories: ['test'],
        }))
        expect(response.status).toBe(400)
      }
    })
  })
})
