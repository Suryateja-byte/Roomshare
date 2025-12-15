/**
 * Tests for saved-listings server actions
 */

// Mock dependencies before imports
jest.mock('@/lib/prisma', () => ({
  prisma: {
    savedListing: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
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

import {
  toggleSaveListing,
  isListingSaved,
  getSavedListings,
  removeSavedListing,
} from '@/app/actions/saved-listings'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'

describe('saved-listings actions', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  const mockSavedListing = {
    id: 'saved-123',
    userId: 'user-123',
    listingId: 'listing-456',
    createdAt: new Date('2025-01-01'),
  }

  const mockListing = {
    id: 'listing-456',
    title: 'Cozy Room',
    price: 800,
    location: { city: 'NYC', state: 'NY' },
    owner: { id: 'owner-123', name: 'Owner', image: null },
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

  describe('toggleSaveListing', () => {
    describe('authentication', () => {
      it('returns error when not logged in', async () => {
        ;(auth as jest.Mock).mockResolvedValue(null)

        const result = await toggleSaveListing('listing-456')

        expect(result.error).toBe('You must be logged in to save listings')
        expect(result.saved).toBe(false)
      })
    })

    describe('toggle behavior', () => {
      it('unsaves listing when already saved', async () => {
        ;(prisma.savedListing.findUnique as jest.Mock).mockResolvedValue(mockSavedListing)
        ;(prisma.savedListing.delete as jest.Mock).mockResolvedValue(mockSavedListing)

        const result = await toggleSaveListing('listing-456')

        expect(result.saved).toBe(false)
        expect(prisma.savedListing.delete).toHaveBeenCalled()
      })

      it('saves listing when not saved', async () => {
        ;(prisma.savedListing.findUnique as jest.Mock).mockResolvedValue(null)
        ;(prisma.savedListing.create as jest.Mock).mockResolvedValue(mockSavedListing)

        const result = await toggleSaveListing('listing-456')

        expect(result.saved).toBe(true)
        expect(prisma.savedListing.create).toHaveBeenCalledWith({
          data: {
            userId: 'user-123',
            listingId: 'listing-456',
          },
        })
      })

      it('revalidates listing path when saving', async () => {
        ;(prisma.savedListing.findUnique as jest.Mock).mockResolvedValue(null)
        ;(prisma.savedListing.create as jest.Mock).mockResolvedValue(mockSavedListing)

        await toggleSaveListing('listing-456')

        expect(revalidatePath).toHaveBeenCalledWith('/listings/listing-456')
        expect(revalidatePath).toHaveBeenCalledWith('/saved')
      })

      it('revalidates paths when unsaving', async () => {
        ;(prisma.savedListing.findUnique as jest.Mock).mockResolvedValue(mockSavedListing)
        ;(prisma.savedListing.delete as jest.Mock).mockResolvedValue(mockSavedListing)

        await toggleSaveListing('listing-456')

        expect(revalidatePath).toHaveBeenCalledWith('/listings/listing-456')
        expect(revalidatePath).toHaveBeenCalledWith('/saved')
      })
    })

    describe('error handling', () => {
      it('returns error on database failure', async () => {
        ;(prisma.savedListing.findUnique as jest.Mock).mockRejectedValue(new Error('DB Error'))

        const result = await toggleSaveListing('listing-456')

        expect(result.error).toBe('Failed to save listing')
        expect(result.saved).toBe(false)
      })
    })
  })

  describe('isListingSaved', () => {
    it('returns saved: false when not logged in', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await isListingSaved('listing-456')

      expect(result.saved).toBe(false)
    })

    it('returns saved: true when listing is saved', async () => {
      ;(prisma.savedListing.findUnique as jest.Mock).mockResolvedValue(mockSavedListing)

      const result = await isListingSaved('listing-456')

      expect(result.saved).toBe(true)
    })

    it('returns saved: false when listing is not saved', async () => {
      ;(prisma.savedListing.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await isListingSaved('listing-456')

      expect(result.saved).toBe(false)
    })

    it('returns saved: false on error', async () => {
      ;(prisma.savedListing.findUnique as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await isListingSaved('listing-456')

      expect(result.saved).toBe(false)
    })
  })

  describe('getSavedListings', () => {
    it('returns empty array when not logged in', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await getSavedListings()

      expect(result).toEqual([])
    })

    it('returns saved listings with data', async () => {
      const mockSavedWithListing = {
        ...mockSavedListing,
        listing: mockListing,
      }
      ;(prisma.savedListing.findMany as jest.Mock).mockResolvedValue([mockSavedWithListing])

      const result = await getSavedListings()

      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Cozy Room')
      expect(result[0].savedAt).toEqual(mockSavedListing.createdAt)
    })

    it('includes location and owner data', async () => {
      const mockSavedWithListing = {
        ...mockSavedListing,
        listing: mockListing,
      }
      ;(prisma.savedListing.findMany as jest.Mock).mockResolvedValue([mockSavedWithListing])

      await getSavedListings()

      expect(prisma.savedListing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            listing: {
              include: {
                location: true,
                owner: { select: { id: true, name: true, image: true } },
              },
            },
          },
        })
      )
    })

    it('orders by createdAt descending', async () => {
      ;(prisma.savedListing.findMany as jest.Mock).mockResolvedValue([])

      await getSavedListings()

      expect(prisma.savedListing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      )
    })

    it('returns empty array on error', async () => {
      ;(prisma.savedListing.findMany as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await getSavedListings()

      expect(result).toEqual([])
    })
  })

  describe('removeSavedListing', () => {
    it('returns error when not logged in', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await removeSavedListing('listing-456')

      expect(result.error).toBe('Unauthorized')
    })

    it('deletes saved listing', async () => {
      ;(prisma.savedListing.delete as jest.Mock).mockResolvedValue(mockSavedListing)

      await removeSavedListing('listing-456')

      expect(prisma.savedListing.delete).toHaveBeenCalledWith({
        where: {
          userId_listingId: {
            userId: 'user-123',
            listingId: 'listing-456',
          },
        },
      })
    })

    it('revalidates /saved path', async () => {
      ;(prisma.savedListing.delete as jest.Mock).mockResolvedValue(mockSavedListing)

      await removeSavedListing('listing-456')

      expect(revalidatePath).toHaveBeenCalledWith('/saved')
    })

    it('returns success: true on successful removal', async () => {
      ;(prisma.savedListing.delete as jest.Mock).mockResolvedValue(mockSavedListing)

      const result = await removeSavedListing('listing-456')

      expect(result.success).toBe(true)
    })

    it('returns error on database failure', async () => {
      ;(prisma.savedListing.delete as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await removeSavedListing('listing-456')

      expect(result.error).toBe('Failed to remove listing')
    })
  })
})
