/**
 * Tests for /api/favorites route
 */

// Mock NextResponse before importing the route
const mockJsonFn = jest.fn()
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, init?: { status?: number }) => {
      mockJsonFn(data, init)
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: new Map(),
      }
    },
  },
}))

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    savedListing: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

// P2-4: Mock rate limiting to return null (allow request)
jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}))

// Mock logger and captureApiError
jest.mock('@/lib/logger', () => ({
  logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
}))

jest.mock('@/lib/api-error-handler', () => ({
  captureApiError: jest.fn((_error: unknown, _context: { route: string; method: string }) => {
    return {
      status: 500,
      json: async () => ({ error: 'Internal server error' }),
      headers: new Map(),
    }
  }),
}))

import { POST } from '@/app/api/favorites/route'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

describe('POST /api/favorites', () => {
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
  })

  const createRequest = (body: any): Request => {
    return {
      json: async () => body,
    } as unknown as Request
  }

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const response = await POST(createRequest({ listingId: 'listing-123' }))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 401 when user id is missing', async () => {
      ;(auth as jest.Mock).mockResolvedValue({ user: { name: 'Test' } })

      const response = await POST(createRequest({ listingId: 'listing-123' }))

      expect(response.status).toBe(401)
    })
  })

  describe('validation', () => {
    it('returns 400 when listingId is missing', async () => {
      const response = await POST(createRequest({}))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
      expect(data.details).toBeDefined()
    })

    it('returns 400 when listingId is empty', async () => {
      const response = await POST(createRequest({ listingId: '' }))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request')
    })
  })

  describe('toggle save', () => {
    it('saves listing when not already saved', async () => {
      ;(prisma.savedListing.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.savedListing.create as jest.Mock).mockResolvedValue({
        id: 'saved-123',
        userId: 'user-123',
        listingId: 'listing-123',
      })

      const response = await POST(createRequest({ listingId: 'listing-123' }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.saved).toBe(true)
      expect(prisma.savedListing.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          listingId: 'listing-123',
        },
      })
    })

    it('unsaves listing when already saved', async () => {
      const existingSave = {
        id: 'saved-123',
        userId: 'user-123',
        listingId: 'listing-123',
      }
      ;(prisma.savedListing.findUnique as jest.Mock).mockResolvedValue(existingSave)
      ;(prisma.savedListing.delete as jest.Mock).mockResolvedValue(existingSave)

      const response = await POST(createRequest({ listingId: 'listing-123' }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.saved).toBe(false)
      expect(prisma.savedListing.delete).toHaveBeenCalledWith({
        where: { id: 'saved-123' },
      })
    })

    it('checks for existing save with correct compound key', async () => {
      ;(prisma.savedListing.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.savedListing.create as jest.Mock).mockResolvedValue({})

      await POST(createRequest({ listingId: 'listing-123' }))

      expect(prisma.savedListing.findUnique).toHaveBeenCalledWith({
        where: {
          userId_listingId: {
            userId: 'user-123',
            listingId: 'listing-123',
          },
        },
      })
    })
  })

  describe('error handling', () => {
    it('returns 500 on database error', async () => {
      ;(prisma.savedListing.findUnique as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const response = await POST(createRequest({ listingId: 'listing-123' }))
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Internal server error')
    })

    it('calls captureApiError on failure', async () => {
      const { captureApiError } = require('@/lib/api-error-handler')
      ;(prisma.savedListing.findUnique as jest.Mock).mockRejectedValue(new Error('Test Error'))

      await POST(createRequest({ listingId: 'listing-123' }))

      expect(captureApiError).toHaveBeenCalled()
    })
  })
})
