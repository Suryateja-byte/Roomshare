/**
 * Tests for manage-booking server actions
 */

// Mock dependencies before imports
jest.mock('@/lib/prisma', () => ({
  prisma: {
    booking: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    listing: {
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
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

import { updateBookingStatus, getMyBookings } from '@/app/actions/manage-booking'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import { createNotification } from '@/app/actions/notifications'
import { sendNotificationEmailWithPreference } from '@/lib/email'

describe('manage-booking actions', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  const mockOwnerSession = {
    user: {
      id: 'owner-123',
      name: 'Owner User',
      email: 'owner@example.com',
    },
  }

  const mockTenantSession = {
    user: {
      id: 'tenant-123',
      name: 'Tenant User',
      email: 'tenant@example.com',
    },
  }

  const mockListing = {
    id: 'listing-123',
    title: 'Cozy Room',
    ownerId: 'owner-123',
    availableSlots: 2,
    totalSlots: 3,
    owner: {
      name: 'Owner User',
    },
  }

  const mockTenant = {
    id: 'tenant-123',
    name: 'Tenant User',
    email: 'tenant@example.com',
  }

  const mockBooking = {
    id: 'booking-123',
    listingId: 'listing-123',
    tenantId: 'tenant-123',
    startDate: new Date('2025-02-01'),
    endDate: new Date('2025-05-01'),
    totalPrice: 2400,
    status: 'PENDING',
    listing: mockListing,
    tenant: mockTenant,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    ;(createNotification as jest.Mock).mockResolvedValue({ success: true })
    ;(sendNotificationEmailWithPreference as jest.Mock).mockResolvedValue({ success: true })
    // Mock user.findUnique for suspension check
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-123',
      isSuspended: false,
    })
  })

  describe('updateBookingStatus', () => {
    describe('authentication', () => {
      it('returns error when not authenticated', async () => {
        ;(auth as jest.Mock).mockResolvedValue(null)

        const result = await updateBookingStatus('booking-123', 'ACCEPTED')

        expect(result.error).toBe('Unauthorized')
        expect(result.code).toBe('SESSION_EXPIRED')
      })

      it('returns error when session user id is missing', async () => {
        ;(auth as jest.Mock).mockResolvedValue({ user: {} })

        const result = await updateBookingStatus('booking-123', 'ACCEPTED')

        expect(result.error).toBe('Unauthorized')
        expect(result.code).toBe('SESSION_EXPIRED')
      })

      it('returns error when session has no user', async () => {
        ;(auth as jest.Mock).mockResolvedValue({})

        const result = await updateBookingStatus('booking-123', 'ACCEPTED')

        expect(result.error).toBe('Unauthorized')
      })
    })

    describe('booking not found', () => {
      it('returns error when booking does not exist', async () => {
        ;(auth as jest.Mock).mockResolvedValue(mockOwnerSession)
        ;(prisma.booking.findUnique as jest.Mock).mockResolvedValue(null)

        const result = await updateBookingStatus('invalid-booking', 'ACCEPTED')

        expect(result.error).toBe('Booking not found')
      })
    })

    describe('authorization', () => {
      beforeEach(() => {
        ;(prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking)
      })

      it('only owner can ACCEPT bookings', async () => {
        ;(auth as jest.Mock).mockResolvedValue(mockTenantSession)

        const result = await updateBookingStatus('booking-123', 'ACCEPTED')

        expect(result.error).toBe('Only the listing owner can accept or reject bookings')
      })

      it('only owner can REJECT bookings', async () => {
        ;(auth as jest.Mock).mockResolvedValue(mockTenantSession)

        const result = await updateBookingStatus('booking-123', 'REJECTED')

        expect(result.error).toBe('Only the listing owner can accept or reject bookings')
      })

      it('only tenant can CANCEL bookings', async () => {
        ;(auth as jest.Mock).mockResolvedValue(mockOwnerSession)

        const result = await updateBookingStatus('booking-123', 'CANCELLED')

        expect(result.error).toBe('Only the tenant can cancel a booking')
      })

      it('allows owner to accept booking', async () => {
        ;(auth as jest.Mock).mockResolvedValue(mockOwnerSession)
        ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([{ availableSlots: 2, totalSlots: 3, id: 'listing-123' }]),
            booking: {
              count: jest.fn().mockResolvedValue(0),
              update: jest.fn().mockResolvedValue({ ...mockBooking, status: 'ACCEPTED' }),
            },
            listing: {
              update: jest.fn().mockResolvedValue(mockListing),
            },
          }
          return callback(tx)
        })

        const result = await updateBookingStatus('booking-123', 'ACCEPTED')

        expect(result.success).toBe(true)
      })

      it('allows tenant to cancel booking', async () => {
        ;(auth as jest.Mock).mockResolvedValue(mockTenantSession)
        ;(prisma.booking.update as jest.Mock).mockResolvedValue({ ...mockBooking, status: 'CANCELLED' })

        const result = await updateBookingStatus('booking-123', 'CANCELLED')

        expect(result.success).toBe(true)
      })
    })

    describe('ACCEPT flow', () => {
      beforeEach(() => {
        ;(auth as jest.Mock).mockResolvedValue(mockOwnerSession)
        ;(prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking)
      })

      it('decrements availableSlots when accepting', async () => {
        const mockTx = {
          $queryRaw: jest.fn().mockResolvedValue([{ availableSlots: 2, totalSlots: 3, id: 'listing-123' }]),
          booking: {
            count: jest.fn().mockResolvedValue(0),
            update: jest.fn().mockResolvedValue({ ...mockBooking, status: 'ACCEPTED' }),
          },
          listing: {
            update: jest.fn().mockResolvedValue(mockListing),
          },
        }
        ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback) => callback(mockTx))

        await updateBookingStatus('booking-123', 'ACCEPTED')

        expect(mockTx.listing.update).toHaveBeenCalledWith({
          where: { id: 'listing-123' },
          data: { availableSlots: { decrement: 1 } },
        })
      })

      it('returns error when no slots available', async () => {
        ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([{ availableSlots: 0, totalSlots: 2, id: 'listing-123' }]),
            booking: { count: jest.fn(), update: jest.fn() },
            listing: { update: jest.fn() },
          }
          return callback(tx)
        })

        const result = await updateBookingStatus('booking-123', 'ACCEPTED')

        expect(result.error).toBe('No available slots for this listing')
      })

      it('returns error when capacity exceeded', async () => {
        ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([{ availableSlots: 1, totalSlots: 2, id: 'listing-123' }]),
            booking: {
              count: jest.fn().mockResolvedValue(2), // 2 overlapping accepted bookings = capacity exceeded
              update: jest.fn(),
            },
            listing: { update: jest.fn() },
          }
          return callback(tx)
        })

        const result = await updateBookingStatus('booking-123', 'ACCEPTED')

        expect(result.error).toBe('Cannot accept: all slots for these dates are already booked')
      })

      it('creates notification for tenant on acceptance', async () => {
        ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([{ availableSlots: 2, totalSlots: 3, id: 'listing-123' }]),
            booking: {
              count: jest.fn().mockResolvedValue(0),
              update: jest.fn().mockResolvedValue({ ...mockBooking, status: 'ACCEPTED' }),
            },
            listing: { update: jest.fn() },
          }
          return callback(tx)
        })

        await updateBookingStatus('booking-123', 'ACCEPTED')

        expect(createNotification).toHaveBeenCalledWith({
          userId: 'tenant-123',
          type: 'BOOKING_ACCEPTED',
          title: 'Booking Accepted!',
          message: expect.stringContaining('Cozy Room'),
          link: '/bookings',
        })
      })

      it('sends email to tenant on acceptance', async () => {
        ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([{ availableSlots: 2, totalSlots: 3, id: 'listing-123' }]),
            booking: {
              count: jest.fn().mockResolvedValue(0),
              update: jest.fn().mockResolvedValue({ ...mockBooking, status: 'ACCEPTED' }),
            },
            listing: { update: jest.fn() },
          }
          return callback(tx)
        })

        await updateBookingStatus('booking-123', 'ACCEPTED')

        expect(sendNotificationEmailWithPreference).toHaveBeenCalledWith(
          'bookingAccepted',
          'tenant-123',
          'tenant@example.com',
          expect.objectContaining({
            tenantName: 'Tenant User',
            listingTitle: 'Cozy Room',
          })
        )
      })

      it('uses transaction for atomic slot management', async () => {
        ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([{ availableSlots: 2, totalSlots: 3, id: 'listing-123' }]),
            booking: {
              count: jest.fn().mockResolvedValue(0),
              update: jest.fn().mockResolvedValue({ ...mockBooking, status: 'ACCEPTED' }),
            },
            listing: { update: jest.fn() },
          }
          return callback(tx)
        })

        await updateBookingStatus('booking-123', 'ACCEPTED')

        expect(prisma.$transaction).toHaveBeenCalled()
      })
    })

    describe('REJECT flow', () => {
      beforeEach(() => {
        ;(auth as jest.Mock).mockResolvedValue(mockOwnerSession)
        ;(prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking)
        ;(prisma.booking.update as jest.Mock).mockResolvedValue({ ...mockBooking, status: 'REJECTED' })
      })

      it('updates booking status to REJECTED', async () => {
        await updateBookingStatus('booking-123', 'REJECTED')

        expect(prisma.booking.update).toHaveBeenCalledWith({
          where: { id: 'booking-123' },
          data: { status: 'REJECTED' },
        })
      })

      it('creates notification for tenant on rejection', async () => {
        await updateBookingStatus('booking-123', 'REJECTED')

        expect(createNotification).toHaveBeenCalledWith({
          userId: 'tenant-123',
          type: 'BOOKING_REJECTED',
          title: 'Booking Not Accepted',
          message: expect.stringContaining('Cozy Room'),
          link: '/bookings',
        })
      })

      it('sends email to tenant on rejection', async () => {
        await updateBookingStatus('booking-123', 'REJECTED')

        expect(sendNotificationEmailWithPreference).toHaveBeenCalledWith(
          'bookingRejected',
          'tenant-123',
          'tenant@example.com',
          expect.objectContaining({
            tenantName: 'Tenant User',
            listingTitle: 'Cozy Room',
          })
        )
      })
    })

    describe('CANCEL flow', () => {
      beforeEach(() => {
        ;(auth as jest.Mock).mockResolvedValue(mockTenantSession)
      })

      it('increments slots when cancelling accepted booking', async () => {
        const acceptedBooking = { ...mockBooking, status: 'ACCEPTED' }
        ;(prisma.booking.findUnique as jest.Mock).mockResolvedValue(acceptedBooking)

        const mockTx = {
          booking: { update: jest.fn().mockResolvedValue({ ...acceptedBooking, status: 'CANCELLED' }) },
          listing: { update: jest.fn() },
        }
        ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback) => callback(mockTx))

        await updateBookingStatus('booking-123', 'CANCELLED')

        expect(mockTx.listing.update).toHaveBeenCalledWith({
          where: { id: 'listing-123' },
          data: { availableSlots: { increment: 1 } },
        })
      })

      it('does not increment slots when cancelling pending booking', async () => {
        ;(prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking) // status: PENDING
        ;(prisma.booking.update as jest.Mock).mockResolvedValue({ ...mockBooking, status: 'CANCELLED' })

        await updateBookingStatus('booking-123', 'CANCELLED')

        expect(prisma.booking.update).toHaveBeenCalledWith({
          where: { id: 'booking-123' },
          data: { status: 'CANCELLED' },
        })
        // Transaction not used for non-accepted bookings
      })

      it('creates notification for host on cancellation', async () => {
        ;(prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking)
        ;(prisma.booking.update as jest.Mock).mockResolvedValue({ ...mockBooking, status: 'CANCELLED' })

        await updateBookingStatus('booking-123', 'CANCELLED')

        expect(createNotification).toHaveBeenCalledWith({
          userId: 'owner-123',
          type: 'BOOKING_CANCELLED',
          title: 'Booking Cancelled',
          message: expect.stringContaining('Tenant User'),
          link: '/bookings',
        })
      })

      it('uses transaction for atomic slot increment on accepted booking', async () => {
        const acceptedBooking = { ...mockBooking, status: 'ACCEPTED' }
        ;(prisma.booking.findUnique as jest.Mock).mockResolvedValue(acceptedBooking)
        ;(prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
          const tx = {
            booking: { update: jest.fn().mockResolvedValue({ ...acceptedBooking, status: 'CANCELLED' }) },
            listing: { update: jest.fn() },
          }
          return callback(tx)
        })

        await updateBookingStatus('booking-123', 'CANCELLED')

        expect(prisma.$transaction).toHaveBeenCalled()
      })
    })

    describe('path revalidation', () => {
      beforeEach(() => {
        ;(auth as jest.Mock).mockResolvedValue(mockOwnerSession)
        ;(prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking)
        ;(prisma.booking.update as jest.Mock).mockResolvedValue({ ...mockBooking, status: 'REJECTED' })
      })

      it('revalidates /bookings path', async () => {
        await updateBookingStatus('booking-123', 'REJECTED')

        expect(revalidatePath).toHaveBeenCalledWith('/bookings')
      })

      it('revalidates listing path', async () => {
        await updateBookingStatus('booking-123', 'REJECTED')

        expect(revalidatePath).toHaveBeenCalledWith('/listings/listing-123')
      })
    })

    describe('error handling', () => {
      it('returns error on database failure', async () => {
        ;(auth as jest.Mock).mockResolvedValue(mockOwnerSession)
        ;(prisma.booking.findUnique as jest.Mock).mockRejectedValue(new Error('DB Error'))

        const result = await updateBookingStatus('booking-123', 'ACCEPTED')

        expect(result.error).toBe('Failed to update booking status')
      })

      it('returns error when transaction fails', async () => {
        ;(auth as jest.Mock).mockResolvedValue(mockOwnerSession)
        ;(prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking)
        ;(prisma.$transaction as jest.Mock).mockRejectedValue(new Error('Transaction failed'))

        const result = await updateBookingStatus('booking-123', 'ACCEPTED')

        expect(result.error).toBe('Failed to update booking status')
      })
    })
  })

  describe('getMyBookings', () => {
    describe('authentication', () => {
      it('returns error when not authenticated', async () => {
        ;(auth as jest.Mock).mockResolvedValue(null)

        const result = await getMyBookings()

        expect(result.error).toBe('Unauthorized')
        expect(result.code).toBe('SESSION_EXPIRED')
        expect(result.bookings).toEqual([])
      })

      it('returns error when user id is missing', async () => {
        ;(auth as jest.Mock).mockResolvedValue({ user: {} })

        const result = await getMyBookings()

        expect(result.error).toBe('Unauthorized')
      })
    })

    describe('successful retrieval', () => {
      const mockSentBookings = [
        {
          id: 'booking-1',
          tenantId: 'user-123',
          listingId: 'listing-1',
          status: 'PENDING',
          listing: {
            id: 'listing-1',
            title: 'Room 1',
            location: { city: 'NYC' },
            owner: { id: 'owner-1', name: 'Owner 1', image: null },
          },
        },
      ]

      const mockReceivedBookings = [
        {
          id: 'booking-2',
          tenantId: 'other-user',
          listingId: 'listing-2',
          status: 'ACCEPTED',
          listing: {
            id: 'listing-2',
            title: 'Room 2',
            ownerId: 'user-123',
            location: { city: 'LA' },
          },
          tenant: { id: 'other-user', name: 'Other User', image: null, email: 'other@example.com' },
        },
      ]

      beforeEach(() => {
        ;(prisma.booking.findMany as jest.Mock)
          .mockResolvedValueOnce(mockSentBookings)
          .mockResolvedValueOnce(mockReceivedBookings)
      })

      it('returns sent bookings for tenant', async () => {
        const result = await getMyBookings()

        expect(result.sentBookings).toEqual(mockSentBookings)
      })

      it('returns received bookings for owner', async () => {
        const result = await getMyBookings()

        expect(result.receivedBookings).toEqual(mockReceivedBookings)
      })

      it('includes listing and location data', async () => {
        const result = await getMyBookings()

        expect(result.sentBookings?.[0]?.listing?.location).toBeDefined()
        expect(result.receivedBookings?.[0]?.listing?.location).toBeDefined()
      })

      it('orders bookings by createdAt descending', async () => {
        await getMyBookings()

        expect(prisma.booking.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: { createdAt: 'desc' },
          })
        )
      })
    })

    describe('error handling', () => {
      it('returns error on database failure', async () => {
        ;(prisma.booking.findMany as jest.Mock).mockRejectedValue(new Error('DB Error'))

        const result = await getMyBookings()

        expect(result.error).toBe('Failed to fetch bookings')
        expect(result.sentBookings).toEqual([])
        expect(result.receivedBookings).toEqual([])
      })
    })
  })
})
