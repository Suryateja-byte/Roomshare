/**
 * Tests for review-response server actions
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    review: {
      findUnique: jest.fn(),
    },
    reviewResponse: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('@/lib/email', () => ({
  sendNotificationEmail: jest.fn().mockResolvedValue({ success: true }),
}))

import {
  createReviewResponse,
  updateReviewResponse,
  deleteReviewResponse,
} from '@/app/actions/review-response'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import { sendNotificationEmail } from '@/lib/email'

describe('Review Response Actions', () => {
  const mockSession = {
    user: { id: 'owner-123', name: 'Host User', email: 'host@example.com' },
  }

  const mockReview = {
    id: 'review-123',
    listing: {
      id: 'listing-123',
      title: 'Nice Apartment',
      ownerId: 'owner-123',
    },
    author: {
      id: 'author-456',
      name: 'Reviewer',
      email: 'reviewer@example.com',
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
  })

  describe('createReviewResponse', () => {
    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await createReviewResponse('review-123', 'Thank you!')

      expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('returns error when review not found', async () => {
      ;(prisma.review.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await createReviewResponse('review-123', 'Thank you!')

      expect(result).toEqual({ error: 'Review not found' })
    })

    it('returns error when user is not listing owner', async () => {
      ;(prisma.review.findUnique as jest.Mock).mockResolvedValue({
        ...mockReview,
        listing: { ...mockReview.listing, ownerId: 'different-owner' },
      })

      const result = await createReviewResponse('review-123', 'Thank you!')

      expect(result).toEqual({ error: 'Only the listing owner can respond to reviews' })
    })

    it('returns error when response already exists', async () => {
      ;(prisma.review.findUnique as jest.Mock).mockResolvedValue(mockReview)
      ;(prisma.reviewResponse.findUnique as jest.Mock).mockResolvedValue({
        id: 'response-existing',
      })

      const result = await createReviewResponse('review-123', 'Thank you!')

      expect(result).toEqual({ error: 'A response already exists for this review' })
    })

    it('creates response successfully', async () => {
      ;(prisma.review.findUnique as jest.Mock).mockResolvedValue(mockReview)
      ;(prisma.reviewResponse.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.reviewResponse.create as jest.Mock).mockResolvedValue({
        id: 'response-new',
      })
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ name: 'Host User' })

      const result = await createReviewResponse('review-123', 'Thank you for the feedback!')

      expect(prisma.reviewResponse.create).toHaveBeenCalledWith({
        data: {
          reviewId: 'review-123',
          content: 'Thank you for the feedback!',
        },
      })
      expect(sendNotificationEmail).toHaveBeenCalledWith(
        'reviewResponse',
        'reviewer@example.com',
        expect.objectContaining({
          reviewerName: 'Reviewer',
          hostName: 'Host User',
          listingTitle: 'Nice Apartment',
        })
      )
      expect(revalidatePath).toHaveBeenCalledWith('/listings/listing-123')
      expect(result).toEqual({ success: true, responseId: 'response-new' })
    })

    it('handles database errors', async () => {
      ;(prisma.review.findUnique as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await createReviewResponse('review-123', 'Thank you!')

      expect(result).toEqual({ error: 'Failed to create response' })
    })
  })

  describe('updateReviewResponse', () => {
    const mockResponse = {
      id: 'response-123',
      review: {
        listing: {
          id: 'listing-123',
          ownerId: 'owner-123',
        },
      },
    }

    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await updateReviewResponse('response-123', 'Updated content')

      expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('returns error when response not found', async () => {
      ;(prisma.reviewResponse.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await updateReviewResponse('response-123', 'Updated content')

      expect(result).toEqual({ error: 'Response not found' })
    })

    it('returns error when user is not listing owner', async () => {
      ;(prisma.reviewResponse.findUnique as jest.Mock).mockResolvedValue({
        ...mockResponse,
        review: {
          listing: { id: 'listing-123', ownerId: 'different-owner' },
        },
      })

      const result = await updateReviewResponse('response-123', 'Updated content')

      expect(result).toEqual({ error: 'Only the listing owner can edit this response' })
    })

    it('updates response successfully', async () => {
      ;(prisma.reviewResponse.findUnique as jest.Mock).mockResolvedValue(mockResponse)
      ;(prisma.reviewResponse.update as jest.Mock).mockResolvedValue({})

      const result = await updateReviewResponse('response-123', 'Updated content')

      expect(prisma.reviewResponse.update).toHaveBeenCalledWith({
        where: { id: 'response-123' },
        data: {
          content: 'Updated content',
          updatedAt: expect.any(Date),
        },
      })
      expect(revalidatePath).toHaveBeenCalledWith('/listings/listing-123')
      expect(result).toEqual({ success: true })
    })

    it('handles database errors', async () => {
      ;(prisma.reviewResponse.findUnique as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await updateReviewResponse('response-123', 'Updated content')

      expect(result).toEqual({ error: 'Failed to update response' })
    })
  })

  describe('deleteReviewResponse', () => {
    const mockResponse = {
      id: 'response-123',
      review: {
        listing: {
          id: 'listing-123',
          ownerId: 'owner-123',
        },
      },
    }

    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await deleteReviewResponse('response-123')

      expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('returns error when response not found', async () => {
      ;(prisma.reviewResponse.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await deleteReviewResponse('response-123')

      expect(result).toEqual({ error: 'Response not found' })
    })

    it('returns error when user is not listing owner', async () => {
      ;(prisma.reviewResponse.findUnique as jest.Mock).mockResolvedValue({
        ...mockResponse,
        review: {
          listing: { id: 'listing-123', ownerId: 'different-owner' },
        },
      })

      const result = await deleteReviewResponse('response-123')

      expect(result).toEqual({ error: 'Only the listing owner can delete this response' })
    })

    it('deletes response successfully', async () => {
      ;(prisma.reviewResponse.findUnique as jest.Mock).mockResolvedValue(mockResponse)
      ;(prisma.reviewResponse.delete as jest.Mock).mockResolvedValue({})

      const result = await deleteReviewResponse('response-123')

      expect(prisma.reviewResponse.delete).toHaveBeenCalledWith({
        where: { id: 'response-123' },
      })
      expect(revalidatePath).toHaveBeenCalledWith('/listings/listing-123')
      expect(result).toEqual({ success: true })
    })

    it('handles database errors', async () => {
      ;(prisma.reviewResponse.findUnique as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await deleteReviewResponse('response-123')

      expect(result).toEqual({ error: 'Failed to delete response' })
    })
  })
})
