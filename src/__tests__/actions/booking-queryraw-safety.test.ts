/**
 * Tests for booking action $queryRaw result safety.
 *
 * Verifies that the booking action handles non-array $queryRaw results
 * without throwing TypeError on array destructuring.
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    listing: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    booking: { create: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
    idempotencyKey: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
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

jest.mock('@/lib/notifications', () => ({
  createInternalNotification: jest.fn(),
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

describe('createBooking - $queryRaw result safety', () => {
  const mockSession = {
    user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
  }

  const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const futureEnd = new Date(Date.now() + 210 * 24 * 60 * 60 * 1000)

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-123',
      isSuspended: false,
      emailVerified: new Date(),
    })
  })

  it('returns "Listing not found" when $queryRaw returns empty array', async () => {
    ;(prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        booking: { findFirst: jest.fn().mockResolvedValue(null) },
      }
      return cb(tx)
    })

    const result = await createBooking('nonexistent', futureStart, futureEnd, 800)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('does not crash when $queryRaw returns null', async () => {
    ;(prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue(null),
        booking: { findFirst: jest.fn().mockResolvedValue(null) },
      }
      return cb(tx)
    })

    const result = await createBooking('listing-123', futureStart, futureEnd, 800)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('does not crash when $queryRaw returns undefined', async () => {
    ;(prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue(undefined),
        booking: { findFirst: jest.fn().mockResolvedValue(null) },
      }
      return cb(tx)
    })

    const result = await createBooking('listing-123', futureStart, futureEnd, 800)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('works correctly when $queryRaw returns valid array', async () => {
    const mockListing = {
      id: 'listing-123',
      title: 'Cozy Room',
      ownerId: 'owner-123',
      totalSlots: 2,
      availableSlots: 2,
      status: 'ACTIVE',
      price: 800,
    }

    ;(prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([mockListing]),
        booking: {
          findFirst: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue({
            id: 'booking-1',
            listingId: 'listing-123',
            tenantId: 'user-123',
            status: 'PENDING',
          }),
        },
        user: {
          findUnique: jest.fn().mockImplementation(({ where }: any) => {
            if (where.id === 'owner-123') return Promise.resolve({ id: 'owner-123', name: 'Host', email: 'host@example.com' })
            if (where.id === 'user-123') return Promise.resolve({ id: 'user-123', name: 'Test User' })
            return Promise.resolve(null)
          }),
        },
      }
      return cb(tx)
    })

    const result = await createBooking('listing-123', futureStart, futureEnd, 800)

    expect(result.success).toBe(true)
  })
})
