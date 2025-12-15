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

jest.mock('@/app/actions/notifications', () => ({
  createNotification: jest.fn(),
}))

jest.mock('@/lib/email', () => ({
  sendNotificationEmailWithPreference: jest.fn(),
}))

import { POST, GET } from '@/app/api/reviews/route'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { createNotification } from '@/app/actions/notifications'
import { sendNotificationEmailWithPreference } from '@/lib/email'

describe('/api/reviews', () => {
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
        expect(data.error).toBe('Missing rating or comment')
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
        expect(data.error).toBe('Must specify listingId or targetUserId')
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

        expect(response.status).toBe(200)
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

        expect(response.status).toBe(200)
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

      it('sends notification to listing owner', async () => {
        await POST(createRequest({
          listingId: 'listing-123',
          rating: 5,
          comment: 'Great!',
        }))

        expect(createNotification).toHaveBeenCalledWith({
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

        expect(createNotification).not.toHaveBeenCalled()
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
      expect(data).toEqual(mockReviews)
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
