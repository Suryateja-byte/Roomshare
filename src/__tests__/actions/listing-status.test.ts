/**
 * Tests for listing-status server actions
 */

// Mock dependencies before imports
jest.mock('@/lib/prisma', () => ({
  prisma: {
    listing: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    recentlyViewed: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

import {
  updateListingStatus,
  incrementViewCount,
  trackListingView,
  trackRecentlyViewed,
  getRecentlyViewed,
} from '@/app/actions/listing-status'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'

describe('listing-status actions', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  const mockListing = {
    id: 'listing-123',
    ownerId: 'user-123',
    title: 'Cozy Room',
    status: 'ACTIVE',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
  })

  describe('updateListingStatus', () => {
    describe('authentication', () => {
      it('returns error when not authenticated', async () => {
        ;(auth as jest.Mock).mockResolvedValue(null)

        const result = await updateListingStatus('listing-123', 'PAUSED')

        expect(result.error).toBe('Unauthorized')
      })

      it('returns error when user id is missing', async () => {
        ;(auth as jest.Mock).mockResolvedValue({ user: {} })

        const result = await updateListingStatus('listing-123', 'PAUSED')

        expect(result.error).toBe('Unauthorized')
      })
    })

    describe('listing validation', () => {
      it('returns error when listing not found', async () => {
        ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(null)

        const result = await updateListingStatus('invalid-listing', 'PAUSED')

        expect(result.error).toBe('Listing not found')
      })

      it('returns error when not owner', async () => {
        ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue({
          ...mockListing,
          ownerId: 'other-user',
        })

        const result = await updateListingStatus('listing-123', 'PAUSED')

        expect(result.error).toBe('You can only update your own listings')
      })
    })

    describe('successful update', () => {
      beforeEach(() => {
        ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing)
        ;(prisma.listing.update as jest.Mock).mockResolvedValue({ ...mockListing, status: 'PAUSED' })
      })

      it('updates status to PAUSED', async () => {
        const result = await updateListingStatus('listing-123', 'PAUSED')

        expect(result.success).toBe(true)
        expect(prisma.listing.update).toHaveBeenCalledWith({
          where: { id: 'listing-123' },
          data: { status: 'PAUSED' },
        })
      })

      it('updates status to RENTED', async () => {
        await updateListingStatus('listing-123', 'RENTED')

        expect(prisma.listing.update).toHaveBeenCalledWith({
          where: { id: 'listing-123' },
          data: { status: 'RENTED' },
        })
      })

      it('updates status to ACTIVE', async () => {
        await updateListingStatus('listing-123', 'ACTIVE')

        expect(prisma.listing.update).toHaveBeenCalledWith({
          where: { id: 'listing-123' },
          data: { status: 'ACTIVE' },
        })
      })

      it('revalidates listing path', async () => {
        await updateListingStatus('listing-123', 'PAUSED')

        expect(revalidatePath).toHaveBeenCalledWith('/listings/listing-123')
      })

      it('revalidates profile path', async () => {
        await updateListingStatus('listing-123', 'PAUSED')

        expect(revalidatePath).toHaveBeenCalledWith('/profile')
      })

      it('revalidates search path', async () => {
        await updateListingStatus('listing-123', 'PAUSED')

        expect(revalidatePath).toHaveBeenCalledWith('/search')
      })
    })

    describe('error handling', () => {
      it('returns error on database failure', async () => {
        ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing)
        ;(prisma.listing.update as jest.Mock).mockRejectedValue(new Error('DB Error'))

        const result = await updateListingStatus('listing-123', 'PAUSED')

        expect(result.error).toBe('Failed to update listing status')
      })
    })
  })

  describe('incrementViewCount', () => {
    it('increments view count', async () => {
      ;(prisma.listing.update as jest.Mock).mockResolvedValue(mockListing)

      await incrementViewCount('listing-123')

      expect(prisma.listing.update).toHaveBeenCalledWith({
        where: { id: 'listing-123' },
        data: { viewCount: { increment: 1 } },
      })
    })

    it('returns success: true', async () => {
      ;(prisma.listing.update as jest.Mock).mockResolvedValue(mockListing)

      const result = await incrementViewCount('listing-123')

      expect(result.success).toBe(true)
    })

    it('returns error on failure', async () => {
      ;(prisma.listing.update as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await incrementViewCount('listing-123')

      expect(result.error).toBe('Failed to increment view count')
    })
  })

  describe('trackListingView', () => {
    beforeEach(() => {
      ;(prisma.listing.update as jest.Mock).mockResolvedValue(mockListing)
      ;(prisma.recentlyViewed.upsert as jest.Mock).mockResolvedValue({})
      ;(prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([])
    })

    it('always increments view count', async () => {
      await trackListingView('listing-123')

      expect(prisma.listing.update).toHaveBeenCalledWith({
        where: { id: 'listing-123' },
        data: { viewCount: { increment: 1 } },
      })
    })

    it('tracks recently viewed for authenticated users', async () => {
      await trackListingView('listing-123')

      expect(prisma.recentlyViewed.upsert).toHaveBeenCalled()
    })

    it('does not track recently viewed for unauthenticated users', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      await trackListingView('listing-123')

      expect(prisma.recentlyViewed.upsert).not.toHaveBeenCalled()
    })

    it('returns success', async () => {
      const result = await trackListingView('listing-123')

      expect(result.success).toBe(true)
    })
  })

  describe('trackRecentlyViewed', () => {
    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await trackRecentlyViewed('listing-123')

      expect(result.error).toBe('Not authenticated')
    })

    it('upserts recently viewed record', async () => {
      ;(prisma.recentlyViewed.upsert as jest.Mock).mockResolvedValue({})
      ;(prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([])

      await trackRecentlyViewed('listing-123')

      expect(prisma.recentlyViewed.upsert).toHaveBeenCalledWith({
        where: {
          userId_listingId: {
            userId: 'user-123',
            listingId: 'listing-123',
          },
        },
        update: { viewedAt: expect.any(Date) },
        create: {
          userId: 'user-123',
          listingId: 'listing-123',
          viewedAt: expect.any(Date),
        },
      })
    })

    it('keeps only last 20 viewed listings', async () => {
      const oldViews = [{ id: 'old-1' }, { id: 'old-2' }]
      ;(prisma.recentlyViewed.upsert as jest.Mock).mockResolvedValue({})
      ;(prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue(oldViews)
      ;(prisma.recentlyViewed.deleteMany as jest.Mock).mockResolvedValue({ count: 2 })

      await trackRecentlyViewed('listing-123')

      expect(prisma.recentlyViewed.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { viewedAt: 'desc' },
        skip: 20,
      })
      expect(prisma.recentlyViewed.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-1', 'old-2'] } },
      })
    })

    it('returns success: true', async () => {
      ;(prisma.recentlyViewed.upsert as jest.Mock).mockResolvedValue({})
      ;(prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([])

      const result = await trackRecentlyViewed('listing-123')

      expect(result.success).toBe(true)
    })

    it('returns error on failure', async () => {
      ;(prisma.recentlyViewed.upsert as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await trackRecentlyViewed('listing-123')

      expect(result.error).toBe('Failed to track recently viewed')
    })
  })

  describe('getRecentlyViewed', () => {
    it('returns empty array when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await getRecentlyViewed()

      expect(result).toEqual([])
    })

    it('returns recently viewed listings', async () => {
      const mockViewed = [
        {
          viewedAt: new Date(),
          listing: {
            id: 'listing-1',
            title: 'Room 1',
            status: 'ACTIVE',
            location: { city: 'NYC' },
            owner: { id: 'owner-1', name: 'Owner', image: null, isVerified: true },
          },
        },
      ]
      ;(prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue(mockViewed)

      const result = await getRecentlyViewed()

      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Room 1')
      expect(result[0].viewedAt).toBeDefined()
    })

    it('filters out non-ACTIVE listings', async () => {
      const mockViewed = [
        {
          viewedAt: new Date(),
          listing: { id: 'listing-1', status: 'ACTIVE', location: {}, owner: {} },
        },
        {
          viewedAt: new Date(),
          listing: { id: 'listing-2', status: 'PAUSED', location: {}, owner: {} },
        },
        {
          viewedAt: new Date(),
          listing: { id: 'listing-3', status: 'RENTED', location: {}, owner: {} },
        },
      ]
      ;(prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue(mockViewed)

      const result = await getRecentlyViewed()

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('listing-1')
    })

    it('respects limit parameter', async () => {
      ;(prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([])

      await getRecentlyViewed(5)

      expect(prisma.recentlyViewed.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        })
      )
    })

    it('uses default limit of 10', async () => {
      ;(prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([])

      await getRecentlyViewed()

      expect(prisma.recentlyViewed.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        })
      )
    })

    it('orders by viewedAt descending', async () => {
      ;(prisma.recentlyViewed.findMany as jest.Mock).mockResolvedValue([])

      await getRecentlyViewed()

      expect(prisma.recentlyViewed.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { viewedAt: 'desc' },
        })
      )
    })

    it('returns empty array on error', async () => {
      ;(prisma.recentlyViewed.findMany as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await getRecentlyViewed()

      expect(result).toEqual([])
    })
  })
})
