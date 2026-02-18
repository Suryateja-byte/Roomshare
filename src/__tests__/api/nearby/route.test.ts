/**
 * Tests for /api/nearby route
 * TDD: These tests are written before implementation
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

// Mock timeout-wrapper module
jest.mock('@/lib/timeout-wrapper', () => {
  const actual = jest.requireActual('@/lib/timeout-wrapper')
  return {
    ...actual,
    fetchWithTimeout: jest.fn((url, options) => global.fetch(url, options)),
  }
})

// Mock circuit-breaker module
const mockCircuitExecute = jest.fn((fn: () => Promise<unknown>) => fn())
jest.mock('@/lib/circuit-breaker', () => {
  const actual = jest.requireActual('@/lib/circuit-breaker')
  return {
    ...actual,
    circuitBreakers: {
      ...actual.circuitBreakers,
      radar: {
        execute: (fn: () => Promise<unknown>) => mockCircuitExecute(fn),
        getState: jest.fn(() => 'CLOSED'),
        reset: jest.fn(),
      },
    },
  }
})

import { POST } from '@/app/api/nearby/route'
import { auth } from '@/auth'
import { withRateLimit } from '@/lib/with-rate-limit'
import { TimeoutError, fetchWithTimeout } from '@/lib/timeout-wrapper'
import { CircuitOpenError } from '@/lib/circuit-breaker'

describe('POST /api/nearby', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  const validRequestBody = {
    listingLat: 37.7749,
    listingLng: -122.4194,
    categories: ['indian-restaurant'],
    radiusMeters: 1609,
  }

  const mockRadarResponse = {
    meta: { code: 200 },
    places: [
      {
        _id: 'place-1',
        name: 'Indian Restaurant',
        location: {
          type: 'Point',
          coordinates: [-122.4180, 37.7760], // [lng, lat]
        },
        categories: ['indian-restaurant'],
        formattedAddress: '123 Main St, San Francisco, CA',
      },
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Ensure rate limiter allows requests by default
    ;(withRateLimit as jest.Mock).mockResolvedValue(null)
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockRadarResponse,
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

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const response = await POST(createRequest(validRequestBody))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 401 when user id is missing', async () => {
      ;(auth as jest.Mock).mockResolvedValue({ user: { name: 'Test' } })

      const response = await POST(createRequest(validRequestBody))

      expect(response.status).toBe(401)
    })
  })

  describe('rate limiting', () => {
    it('applies rate limiting', async () => {
      await POST(createRequest(validRequestBody))

      expect(withRateLimit).toHaveBeenCalledWith(
        expect.any(Object),
        { type: 'nearbySearch' }
      )
    })

    it('returns rate limit response when limit exceeded', async () => {
      const rateLimitResponse = {
        status: 429,
        json: async () => ({ error: 'Too many requests' }),
      }
      ;(withRateLimit as jest.Mock).mockResolvedValue(rateLimitResponse)

      const response = await POST(createRequest(validRequestBody))

      expect(response.status).toBe(429)
    })
  })

  describe('validation', () => {
    it('returns 400 when listingLat is missing', async () => {
      const response = await POST(createRequest({
        listingLng: -122.4194,
        radiusMeters: 1609,
      }))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })

    it('returns 400 when listingLng is missing', async () => {
      const response = await POST(createRequest({
        listingLat: 37.7749,
        radiusMeters: 1609,
      }))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })

    it('returns 400 when lat is out of range', async () => {
      const response = await POST(createRequest({
        listingLat: 91, // Invalid: > 90
        listingLng: -122.4194,
        radiusMeters: 1609,
      }))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })

    it('returns 400 when lng is out of range', async () => {
      const response = await POST(createRequest({
        listingLat: 37.7749,
        listingLng: 181, // Invalid: > 180
        radiusMeters: 1609,
      }))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })

    it('returns 400 when query is too long', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        query: 'a'.repeat(101), // > 100 chars
      }))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })

    it('returns 400 when radiusMeters is invalid', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        radiusMeters: 999, // Not 1609, 3218, or 8046
      }))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })

    it('accepts valid radius 1609 (1mi)', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        radiusMeters: 1609,
      }))

      expect(response.status).toBe(200)
    })

    it('accepts valid radius 3218 (2mi)', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        radiusMeters: 3218,
      }))

      expect(response.status).toBe(200)
    })

    it('accepts valid radius 8046 (5mi)', async () => {
      const response = await POST(createRequest({
        ...validRequestBody,
        radiusMeters: 8046,
      }))

      expect(response.status).toBe(200)
    })
  })

  describe('Radar API call', () => {
    it('calls Radar API with correct parameters', async () => {
      await POST(createRequest(validRequestBody))

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.radar.io/v1/search/places'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'test-secret-key',
          }),
        })
      )

      // Verify URL contains correct query params (may be URL-encoded)
      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toMatch(/near=37\.7749(,|%2C)-122\.4194/)
      expect(calledUrl).toContain('radius=1609')
      expect(calledUrl).toContain('categories=indian-restaurant')
    })

    it('includes query parameter when provided', async () => {
      await POST(createRequest({
        ...validRequestBody,
        query: 'indian',
      }))

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('query=indian')
    })

    it('returns 500 when Radar API fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal error' }),
        text: async () => 'Internal error',
      })

      const response = await POST(createRequest(validRequestBody))
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to fetch nearby places')
    })

    it('returns 503 when RADAR_SECRET_KEY is not configured', async () => {
      delete process.env.RADAR_SECRET_KEY

      const response = await POST(createRequest(validRequestBody))
      const data = await response.json()

      expect(response.status).toBe(503)
      expect(data.error).toBe('Nearby search is not configured')
    })
  })

  describe('response normalization', () => {
    it('returns normalized places with distance', async () => {
      const response = await POST(createRequest(validRequestBody))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places).toHaveLength(1)
      expect(data.places[0]).toEqual({
        id: 'place-1',
        name: 'Indian Restaurant',
        address: '123 Main St, San Francisco, CA',
        category: 'indian-restaurant',
        chain: undefined,
        location: {
          lat: 37.7760,
          lng: -122.4180,
        },
        distanceMiles: expect.any(Number),
      })
    })

    it('calculates distance correctly', async () => {
      const response = await POST(createRequest(validRequestBody))
      const data = await response.json()

      // Distance from (37.7749, -122.4194) to (37.7760, -122.4180)
      // Should be approximately 0.08 miles
      expect(data.places[0].distanceMiles).toBeGreaterThan(0)
      expect(data.places[0].distanceMiles).toBeLessThan(0.2)
    })

    it('includes meta with cached: false', async () => {
      const response = await POST(createRequest(validRequestBody))
      const data = await response.json()

      expect(data.meta).toEqual({
        cached: false,
        count: 1,
      })
    })

    it('handles empty results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ meta: { code: 200 }, places: [] }),
      })

      const response = await POST(createRequest(validRequestBody))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.places).toEqual([])
      expect(data.meta.count).toBe(0)
    })

    it('includes chain info when available', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          meta: { code: 200 },
          places: [{
            _id: 'place-2',
            name: 'Starbucks',
            location: { type: 'Point', coordinates: [-122.4180, 37.7760] },
            categories: ['coffee-shop'],
            chain: { name: 'Starbucks', slug: 'starbucks' },
            formattedAddress: '456 Oak St',
          }],
        }),
      })

      const response = await POST(createRequest(validRequestBody))
      const data = await response.json()

      expect(data.places[0].chain).toBe('Starbucks')
    })
  })

  describe('error handling', () => {
    it('returns 500 on unexpected error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const response = await POST(createRequest(validRequestBody))
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Internal server error')
    })

    it('logs error on failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      mockFetch.mockRejectedValue(new Error('Test Error'))

      await POST(createRequest(validRequestBody))

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('P1-09/P1-10: timeout and circuit breaker protection', () => {
    beforeEach(() => {
      // Reset the circuit breaker mock to default behavior
      mockCircuitExecute.mockImplementation((fn: () => Promise<unknown>) => fn())
    })

    it('returns 504 when Radar API times out', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      // Mock circuit breaker to throw TimeoutError
      mockCircuitExecute.mockRejectedValue(
        new TimeoutError('Radar Autocomplete API', 5000)
      )

      const response = await POST(createRequest(validRequestBody))
      const data = await response.json()

      expect(response.status).toBe(504)
      expect(data.error).toBe('Nearby search timed out')
      expect(data.details).toContain('too long')
      expect(consoleSpy).toHaveBeenCalled()
      const timeoutLog = consoleSpy.mock.calls[0].map(String).join(' ')
      expect(timeoutLog).toContain('timeout')

      consoleSpy.mockRestore()
    })

    it('returns 503 when circuit breaker is open', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      // Mock circuit breaker to throw CircuitOpenError
      mockCircuitExecute.mockRejectedValue(
        new CircuitOpenError('radar')
      )

      const response = await POST(createRequest(validRequestBody))
      const data = await response.json()

      expect(response.status).toBe(503)
      expect(data.error).toBe('Nearby search temporarily unavailable')
      expect(data.details).toContain('recovering')
      expect(consoleSpy).toHaveBeenCalled()
      const circuitBreakerLog = consoleSpy.mock.calls[0].map(String).join(' ')
      expect(circuitBreakerLog).toContain('circuit breaker')

      consoleSpy.mockRestore()
    })

    it('uses circuit breaker for Radar API calls', async () => {
      await POST(createRequest(validRequestBody))

      // Verify circuit breaker was called
      expect(mockCircuitExecute).toHaveBeenCalled()
    })

    it('uses fetchWithTimeout for Radar API calls', async () => {
      await POST(createRequest(validRequestBody))

      // Verify fetchWithTimeout was called
      expect(fetchWithTimeout).toHaveBeenCalled()
    })
  })
})
