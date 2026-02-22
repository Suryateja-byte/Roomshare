/**
 * Tests for booking utility functions
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    booking: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}))

import {
  getActiveBookingsForListing,
  hasActiveAcceptedBookings,
  getActiveAcceptedBookingsCount,
} from '@/lib/booking-utils'
import { prisma } from '@/lib/prisma'

describe('booking-utils', () => {
  const mockTenant = {
    id: 'tenant-123',
    email: 'tenant@example.com',
    name: 'Tenant User',
  }

  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const mockBookings = [
    {
      id: 'booking-1',
      listingId: 'listing-123',
      status: 'ACCEPTED',
      endDate: futureDate,
      tenant: mockTenant,
    },
    {
      id: 'booking-2',
      listingId: 'listing-123',
      status: 'PENDING',
      endDate: futureDate,
      tenant: mockTenant,
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getActiveBookingsForListing', () => {
    it('returns PENDING and ACCEPTED bookings', async () => {
      ;(prisma.booking.findMany as jest.Mock).mockResolvedValue(mockBookings)

      const result = await getActiveBookingsForListing('listing-123')

      expect(result).toEqual(mockBookings)
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            listingId: 'listing-123',
            status: { in: ['PENDING', 'ACCEPTED'] },
          }),
        })
      )
    })

    it('filters bookings with future end dates', async () => {
      ;(prisma.booking.findMany as jest.Mock).mockResolvedValue(mockBookings)

      await getActiveBookingsForListing('listing-123')

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            endDate: { gte: expect.any(Date) },
          }),
        })
      )
    })

    it('includes tenant data', async () => {
      ;(prisma.booking.findMany as jest.Mock).mockResolvedValue(mockBookings)

      await getActiveBookingsForListing('listing-123')

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            tenant: { select: { id: true, name: true } },
          },
        })
      )
    })

    it('returns empty array when no active bookings', async () => {
      ;(prisma.booking.findMany as jest.Mock).mockResolvedValue([])

      const result = await getActiveBookingsForListing('listing-123')

      expect(result).toEqual([])
    })
  })

  describe('hasActiveAcceptedBookings', () => {
    it('returns true when accepted booking exists', async () => {
      ;(prisma.booking.count as jest.Mock).mockResolvedValue(1)

      const result = await hasActiveAcceptedBookings('listing-123')

      expect(result).toBe(true)
    })

    it('returns false when no accepted bookings', async () => {
      ;(prisma.booking.count as jest.Mock).mockResolvedValue(0)

      const result = await hasActiveAcceptedBookings('listing-123')

      expect(result).toBe(false)
    })

    it('only counts bookings with future end dates', async () => {
      ;(prisma.booking.count as jest.Mock).mockResolvedValue(0)

      await hasActiveAcceptedBookings('listing-123')

      expect(prisma.booking.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            endDate: { gte: expect.any(Date) },
          }),
        })
      )
    })

    it('only counts ACCEPTED status bookings', async () => {
      ;(prisma.booking.count as jest.Mock).mockResolvedValue(0)

      await hasActiveAcceptedBookings('listing-123')

      expect(prisma.booking.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACCEPTED',
          }),
        })
      )
    })

    it('filters by listing ID', async () => {
      ;(prisma.booking.count as jest.Mock).mockResolvedValue(0)

      await hasActiveAcceptedBookings('listing-456')

      expect(prisma.booking.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            listingId: 'listing-456',
          }),
        })
      )
    })
  })

  describe('getActiveAcceptedBookingsCount', () => {
    it('returns correct count', async () => {
      ;(prisma.booking.count as jest.Mock).mockResolvedValue(3)

      const result = await getActiveAcceptedBookingsCount('listing-123')

      expect(result).toBe(3)
    })

    it('returns 0 when no accepted bookings', async () => {
      ;(prisma.booking.count as jest.Mock).mockResolvedValue(0)

      const result = await getActiveAcceptedBookingsCount('listing-123')

      expect(result).toBe(0)
    })

    it('filters by listing ID', async () => {
      ;(prisma.booking.count as jest.Mock).mockResolvedValue(0)

      await getActiveAcceptedBookingsCount('listing-789')

      expect(prisma.booking.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            listingId: 'listing-789',
          }),
        })
      )
    })

    it('only counts ACCEPTED status', async () => {
      ;(prisma.booking.count as jest.Mock).mockResolvedValue(0)

      await getActiveAcceptedBookingsCount('listing-123')

      expect(prisma.booking.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACCEPTED',
          }),
        })
      )
    })

    it('only counts future end dates', async () => {
      ;(prisma.booking.count as jest.Mock).mockResolvedValue(0)

      await getActiveAcceptedBookingsCount('listing-123')

      expect(prisma.booking.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            endDate: { gte: expect.any(Date) },
          }),
        })
      )
    })
  })
})
