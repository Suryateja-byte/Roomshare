/**
 * Tests for /api/reviews route
 */

// Mock NextResponse before importing the route
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

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    review: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    listing: {
      findUnique: jest.fn(),
    },
    booking: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/lib/notifications', () => ({
  createInternalNotification: jest.fn(),
}))

jest.mock('@/lib/email', () => ({
  sendNotificationEmailWithPreference: jest.fn(),
}))

// P1-5: Mock rate limiting to return null (allow request)
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

// Mock search-doc-dirty (fire-and-forget)
jest.mock('@/lib/search/search-doc-dirty', () => ({
  markListingDirty: jest.fn().mockResolvedValue(undefined),
}))

// Mock pagination-schema
jest.mock('@/lib/pagination-schema', () => ({
  parsePaginationParams: jest.fn().mockReturnValue({ success: true, data: { cursor: undefined, limit: 20 } }),
  buildPaginationResponse: jest.fn((items: any[], _limit: number, total: number) => ({
    items,
    pagination: { total, hasMore: false, nextCursor: null },
  })),
  buildPrismaQueryOptions: jest.fn().mockReturnValue({}),
}))

import { POST, GET } from '@/app/api/reviews/route'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { createInternalNotification } from '@/lib/notifications'
import { sendNotificationEmailWithPreference } from '@/lib/email'

describe('/api/reviews', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      emailVerified: new Date(),
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    // Mock user.findUnique for suspension check
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-123',
      isSuspended: false,
    })
  })

  describe('POST', () => {
    const createRequest = (body: any): Request => {
      return {
        json: async () => body,
      } as unknown as Request
    }

    const mockReview = {
      id: 'review-123',
      authorId: 'user-123',
      listingId: 'listing-123',
      rating: 5,
      comment: 'Great place!',
      author: {
        name: 'Test User',
        image: '/avatar.jpg',
      },
    }

    beforeEach(() => {
      ;(prisma.review.findFirst as jest.Mock).mockResolvedValue(null)
      ;(prisma.booking.findFirst as jest.Mock).mockResolvedValue({ id: 'booking-123' })
      ;(prisma.review.create as jest.Mock).mockResolvedValue(mockReview)
    })

    describe('authentication', () => {
      it('returns 401 when not authenticated', async () => {
        ;(auth as jest.Mock).mockResolvedValue(null)

        const response = await POST(createRequest({
          listingId: 'listing-123',
          rating: 5,
          comment: 'Great!',
        }))

        expect(response.status).toBe(401)
      })
    })

    describe('validation', () => {
      it('returns 400 when rating is missing', async () => {
        const response = await POST(createRequest({
          listingId: 'listing-123',
          comment: 'Great!',
        }))
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toBe('Invalid request')
      })

      it('returns 400 when comment is missing', async () => {
        const response = await POST(createRequest({
          listingId: 'listing-123',
          rating: 5,
        }))

        expect(response.status).toBe(400)
      })

      it('returns 400 when neither listingId nor targetUserId provided', async () => {
        const response = await POST(createRequest({
          rating: 5,
          comment: 'Great!',
        }))
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toBe('Invalid request')
      })
    })

    describe('creating review', () => {
      it('creates review for listing', async () => {
        ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue({
          id: 'listing-123',
          title: 'Test Listing',
          ownerId: 'owner-123',
          owner: {
            id: 'owner-123',
            name: 'Owner',
            email: 'owner@example.com',
          },
        })

        const response = await POST(createRequest({
          listingId: 'listing-123',
          rating: 5,
          comment: 'Great place!',
        }))
        const data = await response.json()

        expect(response.status).toBe(201)
        expect(data.id).toBe('review-123')
        expect(prisma.review.create).toHaveBeenCalledWith({
          data: {
            authorId: 'user-123',
            listingId: 'listing-123',
            targetUserId: undefined,
            rating: 5,
            comment: 'Great place!',
          },
          include: {
            author: {
              select: { name: true, image: true },
            },
          },
        })
      })

      it('creates review for user', async () => {
        const response = await POST(createRequest({
          targetUserId: 'target-123',
          rating: 4,
          comment: 'Nice person!',
        }))

        expect(response.status).toBe(201)
        expect(prisma.review.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            targetUserId: 'target-123',
          }),
          include: expect.any(Object),
        })
      })
    })

    describe('notifications', () => {
      beforeEach(() => {
        ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue({
          id: 'listing-123',
          title: 'Test Listing',
          ownerId: 'owner-456', // Different from session user
          owner: {
            id: 'owner-456',
            name: 'Owner',
            email: 'owner@example.com',
          },
        })
      })

      // P1-22: Notifications are now fire-and-forget (non-blocking)
      // Need to flush the microtask queue to allow async IIFE to execute
      const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0))

      it('sends notification to listing owner', async () => {
        await POST(createRequest({
          listingId: 'listing-123',
          rating: 5,
          comment: 'Great!',
        }))

        // Wait for fire-and-forget notification to execute
        await flushPromises()

        expect(createInternalNotification).toHaveBeenCalledWith({
          userId: 'owner-456',
          type: 'NEW_REVIEW',
          title: 'New Review',
          message: expect.stringContaining('5-star'),
          link: '/listings/listing-123',
        })
      })

      it('sends email to listing owner', async () => {
        await POST(createRequest({
          listingId: 'listing-123',
          rating: 5,
          comment: 'Great!',
        }))

        // Wait for fire-and-forget notification to execute
        await flushPromises()

        expect(sendNotificationEmailWithPreference).toHaveBeenCalledWith(
          'newReview',
          'owner-456',
          'owner@example.com',
          expect.objectContaining({
            rating: 5,
            listingId: 'listing-123',
          })
        )
      })

      it('does not notify if user is owner', async () => {
        ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue({
          id: 'listing-123',
          title: 'My Listing',
          ownerId: 'user-123', // Same as session user
          owner: { id: 'user-123', name: 'Test', email: 'test@example.com' },
        })

        await POST(createRequest({
          listingId: 'listing-123',
          rating: 5,
          comment: 'Great!',
        }))

        // Wait for fire-and-forget notification to complete
        await flushPromises()

        expect(createInternalNotification).not.toHaveBeenCalled()
        expect(sendNotificationEmailWithPreference).not.toHaveBeenCalled()
      })
    })

    describe('error handling', () => {
      it('returns 500 on database error', async () => {
        ;(prisma.review.create as jest.Mock).mockRejectedValue(new Error('DB Error'))

        const response = await POST(createRequest({
          listingId: 'listing-123',
          rating: 5,
          comment: 'Great!',
        }))

        expect(response.status).toBe(500)
      })
    })
  })

  describe('GET', () => {
    const createGetRequest = (params: Record<string, string>): Request => {
      const url = new URL('http://localhost/api/reviews')
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })
      return { url: url.toString() } as unknown as Request
    }

    const mockReviews = [
      {
        id: 'review-1',
        rating: 5,
        comment: 'Great!',
        author: { name: 'User 1', image: null },
      },
      {
        id: 'review-2',
        rating: 4,
        comment: 'Nice',
        author: { name: 'User 2', image: null },
      },
    ]

    beforeEach(() => {
      ;(prisma.review.findMany as jest.Mock).mockResolvedValue(mockReviews)
      ;(prisma.review.count as jest.Mock).mockResolvedValue(2)
    })

    it('returns 400 when no listingId or userId provided', async () => {
      const response = await GET(createGetRequest({}))
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Must specify listingId or userId')
    })

    it('returns reviews for listing', async () => {
      const response = await GET(createGetRequest({ listingId: 'listing-123' }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.reviews).toEqual(mockReviews)
      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { listingId: 'listing-123' },
        })
      )
    })

    it('returns reviews for user', async () => {
      const response = await GET(createGetRequest({ userId: 'user-123' }))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { targetUserId: 'user-123' },
        })
      )
    })

    it('orders reviews by createdAt desc', async () => {
      await GET(createGetRequest({ listingId: 'listing-123' }))

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      )
    })

    it('returns 500 on database error', async () => {
      ;(prisma.review.findMany as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const response = await GET(createGetRequest({ listingId: 'listing-123' }))

      expect(response.status).toBe(500)
    })
  })
})
