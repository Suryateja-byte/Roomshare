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
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    idempotencyKey: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
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
  sendNotificationEmailWithPreference: jest.fn(),
}))

jest.mock('@/app/actions/block', () => ({
  checkBlockBeforeAction: jest.fn().mockResolvedValue({ allowed: true }),
}))

import { createBooking } from '@/app/actions/booking'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import { createNotification } from '@/app/actions/notifications'
import { sendNotificationEmailWithPreference } from '@/lib/email'

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
    totalSlots: 2,
    availableSlots: 2,
    status: 'ACTIVE',
  }

  const mockOwner = {
    id: 'owner-123',
    name: 'Host User',
    email: 'host@example.com',
  }

  const mockTenant = {
    id: 'user-123',
    name: 'Test User',
  }

  // Use future dates to pass validation
  const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
  const futureEnd = new Date(Date.now() + 210 * 24 * 60 * 60 * 1000) // ~7 months from now

  const mockBooking = {
    id: 'booking-123',
    listingId: 'listing-123',
    tenantId: 'user-123',
    startDate: futureStart,
    endDate: futureEnd,
    totalPrice: 4800,
    status: 'PENDING',
  }

  beforeEach(() => {
    jest.clearAllMocks()
      ; (auth as jest.Mock).mockResolvedValue(mockSession)
      ; (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue(null)
      // Mock user.findUnique for suspension and email verification checks
      ; (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        isSuspended: false,
        emailVerified: new Date(),
      })

      // Mock transaction to execute the callback
      ; (prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        // Create a mock transaction context
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([mockListing]),
          user: {
            findUnique: jest.fn().mockImplementation(({ where }) => {
              if (where.id === 'owner-123') return Promise.resolve(mockOwner)
              if (where.id === 'user-123') return Promise.resolve(mockTenant)
              return Promise.resolve(null)
            }),
          },
          booking: {
            findFirst: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockResolvedValue(mockBooking),
          },
        }
        return callback(tx)
      })
      ; (createNotification as jest.Mock).mockResolvedValue({ success: true })
      ; (sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({ success: true })
  })

  describe('authentication', () => {
    it('returns error when not authenticated', async () => {
      ; (auth as jest.Mock).mockResolvedValue(null)

      const result = await createBooking('listing-123', futureStart, futureEnd, 800)

      expect(result.success).toBe(false)
      expect(result.error).toBe('You must be logged in to book')
      expect(result.code).toBe('SESSION_EXPIRED')
    })

    it('returns error when user id is missing', async () => {
      ; (auth as jest.Mock).mockResolvedValue({ user: {} })

      const result = await createBooking('listing-123', futureStart, futureEnd, 800)

      expect(result.success).toBe(false)
      expect(result.error).toBe('You must be logged in to book')
    })
  })

  describe('successful booking', () => {
    it('creates booking with correct data', async () => {
      const result = await createBooking('listing-123', futureStart, futureEnd, 800)

      expect(result.success).toBe(true)
      expect(result.bookingId).toBe('booking-123')
    })

    it('returns success with booking id', async () => {
      const result = await createBooking('listing-123', futureStart, futureEnd, 800)

      expect(result).toEqual({
        success: true,
        bookingId: 'booking-123',
      })
    })

    it('revalidates listing path', async () => {
      await createBooking('listing-123', futureStart, futureEnd, 800)

      expect(revalidatePath).toHaveBeenCalledWith('/listings/listing-123')
    })

    it('revalidates bookings path', async () => {
      await createBooking('listing-123', futureStart, futureEnd, 800)

      expect(revalidatePath).toHaveBeenCalledWith('/bookings')
    })
  })

  describe('notifications', () => {
    it('creates in-app notification for host', async () => {
      await createBooking('listing-123', futureStart, futureEnd, 800)

      expect(createNotification).toHaveBeenCalledWith({
        userId: 'owner-123',
        type: 'BOOKING_REQUEST',
        title: 'New Booking Request',
        message: expect.stringContaining('Test User'),
        link: '/bookings',
      })
    })
  })

  describe('error handling', () => {
    it('returns error when listing not found', async () => {
      ; (prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([]), // Empty array = no listing
          user: { findUnique: jest.fn() },
          booking: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
        }
        return callback(tx)
      })

      const result = await createBooking('invalid-listing', futureStart, futureEnd, 800)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Listing not found')
    })

    it('returns error on database failure', async () => {
      ; (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await createBooking('listing-123', futureStart, futureEnd, 800)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to create booking')
    })
  })
})
