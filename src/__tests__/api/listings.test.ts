/**
 * Tests for listings API route
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    listing: {
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    location: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
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
  getListingsPaginated: jest.fn(),
}))

jest.mock('@/lib/search-params', () => ({
  buildRawParamsFromSearchParams: jest.fn().mockReturnValue({}),
  parseSearchParams: jest.fn().mockReturnValue({
    filterParams: {},
    requestedPage: 1,
    sortOption: 'recommended',
    boundsRequired: false,
    browseMode: true,
  }),
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
      warn: jest.fn(),
    },
  },
}))

jest.mock('@/app/actions/suspension', () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
  checkEmailVerified: jest.fn().mockResolvedValue({ verified: true }),
}))

jest.mock('@/lib/listing-language-guard', () => ({
  checkListingLanguageCompliance: jest.fn().mockReturnValue({ allowed: true }),
}))

jest.mock('@/lib/languages', () => ({
  isValidLanguageCode: jest.fn().mockReturnValue(true),
}))

jest.mock('@/lib/idempotency', () => ({
  withIdempotency: jest.fn(),
}))

jest.mock('@/lib/search/search-doc-sync', () => ({
  upsertSearchDocSync: jest.fn().mockResolvedValue(true),
}))

jest.mock('@/lib/search-alerts', () => ({
  triggerInstantAlerts: jest.fn().mockResolvedValue({ sent: 0, errors: 0 }),
}))

jest.mock('@/lib/search/search-doc-dirty', () => ({
  markListingDirty: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/schemas', () => {
  const actual = jest.requireActual('@/lib/schemas')
  return actual
})

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
      const headersMap = new Map<string, string>()
      if (init?.headers) {
        Object.entries(init.headers).forEach(([k, v]) => headersMap.set(k, v))
      }
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: headersMap,
      }
    },
  },
}))

import { GET, POST } from '@/app/api/listings/route'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { geocodeAddress } from '@/lib/geocoding'
import { getListingsPaginated } from '@/lib/data'
import { parseSearchParams } from '@/lib/search-params'
import { checkSuspension, checkEmailVerified } from '@/app/actions/suspension'
import { upsertSearchDocSync } from '@/lib/search/search-doc-sync'
import { triggerInstantAlerts } from '@/lib/search-alerts'

describe('Listings API', () => {
  const mockSession = {
    user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    ;(checkSuspension as jest.Mock).mockResolvedValue({ suspended: false })
    ;(checkEmailVerified as jest.Mock).mockResolvedValue({ verified: true })
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-123' })
    ;(prisma.listing.count as jest.Mock).mockResolvedValue(0)
  })

  describe('GET', () => {
    it('returns paginated listings successfully', async () => {
      const mockResult = {
        items: [
          { id: 'listing-1', title: 'Cozy Room' },
          { id: 'listing-2', title: 'Sunny Apartment' },
        ],
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      }
      ;(getListingsPaginated as jest.Mock).mockResolvedValue(mockResult)

      const request = new Request('http://localhost/api/listings')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.items).toEqual(mockResult.items)
      expect(data.total).toBe(2)
      expect(data.page).toBe(1)
      // Security: prevent CDN caching of user-generated listing data
      expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    })

    it('does not leak address or zip in listing location', async () => {
      const mockResult = {
        items: [
          {
            id: 'listing-1',
            title: 'Cozy Room',
            location: { city: 'Portland', state: 'OR', lat: 45.5, lng: -122.6 },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }
      ;(getListingsPaginated as jest.Mock).mockResolvedValue(mockResult)

      const request = new Request('http://localhost/api/listings')
      const response = await GET(request)
      const data = await response.json()

      for (const listing of data.items) {
        if (listing.location) {
          expect(listing.location).not.toHaveProperty('address')
          expect(listing.location).not.toHaveProperty('zip')
        }
      }
    })

    it('passes parsed filter params to getListingsPaginated', async () => {
      const mockFilterParams = { query: 'apartment' }
      ;(parseSearchParams as jest.Mock).mockReturnValue({
        filterParams: mockFilterParams,
        requestedPage: 1,
        sortOption: 'recommended',
        boundsRequired: false,
        browseMode: true,
      })
      ;(getListingsPaginated as jest.Mock).mockResolvedValue({
        items: [], total: 0, page: 1, limit: 20, totalPages: 0,
      })

      const request = new Request('http://localhost/api/listings?q=apartment')
      await GET(request)

      expect(getListingsPaginated).toHaveBeenCalledWith({
        ...mockFilterParams,
        page: 1,
        limit: 20,
      })
    })

    it('returns 400 for validation errors', async () => {
      ;(getListingsPaginated as jest.Mock).mockRejectedValue(
        new Error('minPrice cannot exceed maxPrice')
      )

      const request = new Request('http://localhost/api/listings?minPrice=500&maxPrice=100')
      const response = await GET(request)

      expect(response.status).toBe(400)
    })

    it('handles internal errors', async () => {
      ;(getListingsPaginated as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const request = new Request('http://localhost/api/listings')
      const response = await GET(request)

      expect(response.status).toBe(500)
    })
  })

  describe('POST', () => {
    const validBody = {
      title: 'Cozy Room in Downtown',
      description: 'A nice place to stay with great amenities and city views',
      price: '800',
      amenities: 'Wifi,AC',
      houseRules: '',
      address: '123 Main St',
      city: 'San Francisco',
      state: 'CA',
      zip: '94102',
      roomType: 'Private Room',
      totalSlots: '1',
      images: [
        'https://abc123.supabase.co/storage/v1/object/public/images/listings/user-123/test.jpg',
      ],
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

      const request = new Request('http://localhost/api/listings', {
        method: 'POST',
        body: JSON.stringify(validBody),
      })
      const response = await POST(request)

      expect(response.status).toBe(401)
    })

    it('creates listing successfully', async () => {
      ;(geocodeAddress as jest.Mock).mockResolvedValue({ lat: 37.7749, lng: -122.4194 })
      const mockListing = {
        id: 'listing-new',
        title: 'Cozy Room in Downtown',
        description: 'A nice place to stay with great amenities and city views',
        price: 800,
        roomType: 'Private Room',
        leaseDuration: null,
        amenities: ['Wifi', 'AC'],
        houseRules: [],
      }
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
      expect(upsertSearchDocSync).toHaveBeenCalledWith('listing-new')
      expect(triggerInstantAlerts).toHaveBeenCalled()
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

    it('returns 403 when user is suspended', async () => {
      ;(checkSuspension as jest.Mock).mockResolvedValue({
        suspended: true,
        error: 'Account suspended',
      })

      const request = new Request('http://localhost/api/listings', {
        method: 'POST',
        body: JSON.stringify(validBody),
      })
      const response = await POST(request)

      expect(response.status).toBe(403)
    })

    it('returns 403 when email not verified', async () => {
      ;(checkEmailVerified as jest.Mock).mockResolvedValue({
        verified: false,
        error: 'Please verify your email',
      })

      const request = new Request('http://localhost/api/listings', {
        method: 'POST',
        body: JSON.stringify(validBody),
      })
      const response = await POST(request)

      expect(response.status).toBe(403)
    })

    it('returns 401 when user not found in database', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

      const request = new Request('http://localhost/api/listings', {
        method: 'POST',
        body: JSON.stringify(validBody),
      })
      const response = await POST(request)

      expect(response.status).toBe(401)
    })

    it('returns 400 when max listings exceeded', async () => {
      ;(prisma.listing.count as jest.Mock).mockResolvedValue(10)

      const request = new Request('http://localhost/api/listings', {
        method: 'POST',
        body: JSON.stringify(validBody),
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Maximum 10')
    })

    it('returns 400 for invalid JSON body', async () => {
      const request = new Request('http://localhost/api/listings', {
        method: 'POST',
        body: 'not json{{{',
        headers: { 'Content-Type': 'application/json' },
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid JSON body')
    })
  })
})
