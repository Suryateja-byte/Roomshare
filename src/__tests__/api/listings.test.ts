/**
 * Tests for listings API route
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    listing: {
      create: jest.fn(),
    },
    location: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/lib/geocoding', () => ({
  geocodeAddress: jest.fn(),
}))

jest.mock('@/lib/data', () => ({
  getListings: jest.fn(),
}))

// P2-3: Mock rate limiting to return null (allow request)
jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn().mockResolvedValue(undefined),
    sync: {
      error: jest.fn(),
    },
  },
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, init?: { status?: number }) => {
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: new Map(),
      }
    },
  },
}))

import { GET, POST } from '@/app/api/listings/route'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { geocodeAddress } from '@/lib/geocoding'
import { getListings } from '@/lib/data'

describe('Listings API', () => {
  const mockSession = {
    user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
  })

  describe('GET', () => {
    it('returns listings successfully', async () => {
      const mockListings = [
        { id: 'listing-1', title: 'Cozy Room' },
        { id: 'listing-2', title: 'Sunny Apartment' },
      ]
      ;(getListings as jest.Mock).mockResolvedValue(mockListings)

      const request = new Request('http://localhost/api/listings')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual(mockListings)
    })

    it('passes query parameter to getListings', async () => {
      ;(getListings as jest.Mock).mockResolvedValue([])

      const request = new Request('http://localhost/api/listings?q=apartment')
      await GET(request)

      expect(getListings).toHaveBeenCalledWith({ query: 'apartment' })
    })

    it('handles errors', async () => {
      ;(getListings as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const request = new Request('http://localhost/api/listings')
      const response = await GET(request)

      expect(response.status).toBe(500)
    })
  })

  describe('POST', () => {
    const validBody = {
      title: 'Cozy Room',
      description: 'A nice place to stay',
      price: '800',
      address: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      zip: '94102',
      roomType: 'PRIVATE',
      totalSlots: '1',
    }

    it('returns 400 for missing required fields', async () => {
      const request = new Request('http://localhost/api/listings', {
        method: 'POST',
        body: JSON.stringify({ title: 'Test' }),
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
    })

    it('returns 400 for invalid price', async () => {
      const request = new Request('http://localhost/api/listings', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, price: '-100' }),
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
    })

    it('returns 400 for invalid total slots', async () => {
      const request = new Request('http://localhost/api/listings', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, totalSlots: '0' }),
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
    })

    it('returns 400 when geocoding fails', async () => {
      ;(geocodeAddress as jest.Mock).mockResolvedValue(null)

      const request = new Request('http://localhost/api/listings', {
        method: 'POST',
        body: JSON.stringify(validBody),
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
    })

    it('returns 401 when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)
      ;(geocodeAddress as jest.Mock).mockResolvedValue({ lat: 37.7749, lng: -122.4194 })

      const request = new Request('http://localhost/api/listings', {
        method: 'POST',
        body: JSON.stringify(validBody),
      })
      const response = await POST(request)

      expect(response.status).toBe(401)
    })

    it('creates listing successfully', async () => {
      ;(geocodeAddress as jest.Mock).mockResolvedValue({ lat: 37.7749, lng: -122.4194 })
      const mockListing = { id: 'listing-new', title: 'Cozy Room' }
      ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          listing: { create: jest.fn().mockResolvedValue(mockListing) },
          location: { create: jest.fn().mockResolvedValue({ id: 'loc-123' }) },
          $executeRaw: jest.fn().mockResolvedValue(1),
        }
        return callback(tx)
      })

      const request = new Request('http://localhost/api/listings', {
        method: 'POST',
        body: JSON.stringify(validBody),
      })
      const response = await POST(request)

      expect(response.status).toBe(201)
    })

    it('handles database errors', async () => {
      ;(geocodeAddress as jest.Mock).mockResolvedValue({ lat: 37.7749, lng: -122.4194 })
      ;(prisma.$transaction as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const request = new Request('http://localhost/api/listings', {
        method: 'POST',
        body: JSON.stringify(validBody),
      })
      const response = await POST(request)

      expect(response.status).toBe(500)
    })
  })
})
