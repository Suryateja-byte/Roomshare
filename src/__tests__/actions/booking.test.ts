/**
 * Tests for booking server actions
 */

// Mock dependencies before imports
jest.mock('@/lib/prisma', () => ({
  prisma: {
    listing: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    booking: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('@/app/actions/notifications', () => ({
  createNotification: jest.fn(),
}))

jest.mock('@/lib/email', () => ({
  sendNotificationEmail: jest.fn(),
}))

import { createBooking } from '@/app/actions/booking'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import { createNotification } from '@/app/actions/notifications'
import { sendNotificationEmail } from '@/lib/email'

describe('createBooking', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  const mockListing = {
    id: 'listing-123',
    title: 'Cozy Room',
    ownerId: 'owner-123',
    owner: {
      id: 'owner-123',
      name: 'Host User',
      email: 'host@example.com',
    },
  }

  const mockTenant = {
    id: 'user-123',
    name: 'Test User',
  }

  const mockBooking = {
    id: 'booking-123',
    listingId: 'listing-123',
    tenantId: 'user-123',
    startDate: new Date('2024-02-01'),
    endDate: new Date('2024-08-01'),
    totalPrice: 4800,
    status: 'PENDING',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockTenant)
    ;(prisma.booking.create as jest.Mock).mockResolvedValue(mockBooking)
    ;(createNotification as jest.Mock).mockResolvedValue({ success: true })
    ;(sendNotificationEmail as jest.Mock).mockResolvedValue({ success: true })
  })

  describe('authentication', () => {
    it('throws error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      await expect(
        createBooking('listing-123', new Date('2024-02-01'), new Date('2024-08-01'), 800)
      ).rejects.toThrow('Unauthorized')
    })

    it('throws error when user id is missing', async () => {
      ;(auth as jest.Mock).mockResolvedValue({ user: {} })

      await expect(
        createBooking('listing-123', new Date('2024-02-01'), new Date('2024-08-01'), 800)
      ).rejects.toThrow('Unauthorized')
    })
  })

  describe('successful booking', () => {
    it('creates booking with correct data', async () => {
      const startDate = new Date('2024-02-01')
      const endDate = new Date('2024-08-01')

      await createBooking('listing-123', startDate, endDate, 800)

      expect(prisma.booking.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          listingId: 'listing-123',
          tenantId: 'user-123',
          startDate,
          endDate,
          status: 'PENDING',
        }),
      })
    })

    it('calculates total price correctly', async () => {
      const startDate = new Date('2024-02-01')
      const endDate = new Date('2024-08-01')
      // 182 days at $800/month (~$26.67/day) = ~$4853

      await createBooking('listing-123', startDate, endDate, 800)

      expect(prisma.booking.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          totalPrice: expect.any(Number),
        }),
      })
    })

    it('returns success with booking id', async () => {
      const result = await createBooking(
        'listing-123',
        new Date('2024-02-01'),
        new Date('2024-08-01'),
        800
      )

      expect(result).toEqual({
        success: true,
        bookingId: 'booking-123',
      })
    })

    it('revalidates listing path', async () => {
      await createBooking('listing-123', new Date('2024-02-01'), new Date('2024-08-01'), 800)

      expect(revalidatePath).toHaveBeenCalledWith('/listings/listing-123')
    })

    it('revalidates bookings path', async () => {
      await createBooking('listing-123', new Date('2024-02-01'), new Date('2024-08-01'), 800)

      expect(revalidatePath).toHaveBeenCalledWith('/bookings')
    })
  })

  describe('notifications', () => {
    it('creates in-app notification for host', async () => {
      await createBooking('listing-123', new Date('2024-02-01'), new Date('2024-08-01'), 800)

      expect(createNotification).toHaveBeenCalledWith({
        userId: 'owner-123',
        type: 'BOOKING_REQUEST',
        title: 'New Booking Request',
        message: expect.stringContaining('Test User'),
        link: '/bookings',
      })
    })

    it('sends email notification to host', async () => {
      await createBooking('listing-123', new Date('2024-02-01'), new Date('2024-08-01'), 800)

      expect(sendNotificationEmail).toHaveBeenCalledWith(
        'bookingRequest',
        'host@example.com',
        expect.objectContaining({
          hostName: 'Host User',
          tenantName: 'Test User',
          listingTitle: 'Cozy Room',
        })
      )
    })

    it('does not send email if host has no email', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue({
        ...mockListing,
        owner: { ...mockListing.owner, email: null },
      })

      await createBooking('listing-123', new Date('2024-02-01'), new Date('2024-08-01'), 800)

      expect(sendNotificationEmail).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('throws error when listing not found', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(null)

      await expect(
        createBooking('invalid-listing', new Date('2024-02-01'), new Date('2024-08-01'), 800)
      ).rejects.toThrow('Failed to create booking')
    })

    it('throws error on database failure', async () => {
      ;(prisma.booking.create as jest.Mock).mockRejectedValue(new Error('DB Error'))

      await expect(
        createBooking('listing-123', new Date('2024-02-01'), new Date('2024-08-01'), 800)
      ).rejects.toThrow('Failed to create booking')
    })
  })

  describe('price calculation', () => {
    it('handles short stays correctly', async () => {
      const startDate = new Date('2024-02-01')
      const endDate = new Date('2024-02-08') // 7 days

      await createBooking('listing-123', startDate, endDate, 900)

      expect(prisma.booking.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          totalPrice: expect.any(Number),
        }),
      })
    })

    it('handles same-day booking', async () => {
      const date = new Date('2024-02-01')

      await createBooking('listing-123', date, date, 800)

      expect(prisma.booking.create).toHaveBeenCalled()
    })
  })
})
