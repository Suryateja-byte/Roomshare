/**
 * Tests for admin server actions
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    listing: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    booking: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    report: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    verificationRequest: {
      count: jest.fn(),
    },
    message: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('@/lib/audit', () => ({
  logAdminAction: jest.fn(),
}))

import {
  getUsers,
  toggleUserAdmin,
  suspendUser,
  getListingsForAdmin,
  updateListingStatus,
  deleteListing,
  getReports,
  resolveReport,
  getAdminStats,
} from '@/app/actions/admin'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import { logAdminAction } from '@/lib/audit'

describe('admin actions', () => {
  const mockAdminSession = {
    user: { id: 'admin-123', name: 'Admin User', email: 'admin@example.com' },
  }

  const mockAdminUser = {
    isAdmin: true,
  }

  const mockRegularUser = {
    id: 'user-123',
    name: 'Regular User',
    email: 'user@example.com',
    isAdmin: false,
    isSuspended: false,
    isVerified: true,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockAdminSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockAdminUser)
  })

  describe('requireAdmin helper', () => {
    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await getUsers()

      expect(result.error).toBe('Unauthorized')
    })

    it('returns error when user is not admin', async () => {
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isAdmin: false })

      const result = await getUsers()

      expect(result.error).toBe('Unauthorized')
    })

    it('allows admin users', async () => {
      ;(prisma.user.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.user.count as jest.Mock).mockResolvedValue(0)

      const result = await getUsers()

      expect(result.error).toBeUndefined()
    })
  })

  describe('getUsers', () => {
    it('returns users with pagination', async () => {
      const users = [mockRegularUser]
      ;(prisma.user.findMany as jest.Mock).mockResolvedValue(users)
      ;(prisma.user.count as jest.Mock).mockResolvedValue(1)

      const result = await getUsers({ page: 1, limit: 20 })

      expect(result.users).toEqual(users)
      expect(result.total).toBe(1)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
    })

    it('filters by search term', async () => {
      ;(prisma.user.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.user.count as jest.Mock).mockResolvedValue(0)

      await getUsers({ search: 'test' })

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: 'test', mode: 'insensitive' } },
              { email: { contains: 'test', mode: 'insensitive' } },
            ]),
          }),
        })
      )
    })

    it('filters by verified status', async () => {
      ;(prisma.user.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.user.count as jest.Mock).mockResolvedValue(0)

      await getUsers({ isVerified: true })

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isVerified: true }),
        })
      )
    })

    it('filters by admin status', async () => {
      ;(prisma.user.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.user.count as jest.Mock).mockResolvedValue(0)

      await getUsers({ isAdmin: true })

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isAdmin: true }),
        })
      )
    })

    it('filters by suspended status', async () => {
      ;(prisma.user.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.user.count as jest.Mock).mockResolvedValue(0)

      await getUsers({ isSuspended: true })

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isSuspended: true }),
        })
      )
    })

    it('returns error on database failure', async () => {
      ;(prisma.user.findMany as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await getUsers()

      expect(result.error).toBe('Failed to fetch users')
    })
  })

  describe('toggleUserAdmin', () => {
    it('prevents self-demotion', async () => {
      const result = await toggleUserAdmin('admin-123')

      expect(result.error).toBe('Cannot change your own admin status')
    })

    it('returns error when user not found', async () => {
      ;(prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser) // requireAdmin check
        .mockResolvedValueOnce(null) // user lookup

      const result = await toggleUserAdmin('nonexistent')

      expect(result.error).toBe('User not found')
    })

    it('toggles admin status from false to true', async () => {
      ;(prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser) // requireAdmin check
        .mockResolvedValueOnce({ ...mockRegularUser, isAdmin: false }) // user lookup
      ;(prisma.user.update as jest.Mock).mockResolvedValue({})
      ;(logAdminAction as jest.Mock).mockResolvedValue({})

      const result = await toggleUserAdmin('user-123')

      expect(result.success).toBe(true)
      expect(result.isAdmin).toBe(true)
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { isAdmin: true },
      })
    })

    it('toggles admin status from true to false', async () => {
      ;(prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser) // requireAdmin check
        .mockResolvedValueOnce({ ...mockRegularUser, isAdmin: true }) // user lookup
      ;(prisma.user.update as jest.Mock).mockResolvedValue({})
      ;(logAdminAction as jest.Mock).mockResolvedValue({})

      const result = await toggleUserAdmin('user-123')

      expect(result.success).toBe(true)
      expect(result.isAdmin).toBe(false)
    })

    it('logs admin action', async () => {
      ;(prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser)
        .mockResolvedValueOnce(mockRegularUser)
      ;(prisma.user.update as jest.Mock).mockResolvedValue({})
      ;(logAdminAction as jest.Mock).mockResolvedValue({})

      await toggleUserAdmin('user-123')

      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'admin-123',
          action: 'ADMIN_GRANTED',
          targetType: 'User',
          targetId: 'user-123',
        })
      )
    })

    it('revalidates admin users path', async () => {
      ;(prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser)
        .mockResolvedValueOnce(mockRegularUser)
      ;(prisma.user.update as jest.Mock).mockResolvedValue({})
      ;(logAdminAction as jest.Mock).mockResolvedValue({})

      await toggleUserAdmin('user-123')

      expect(revalidatePath).toHaveBeenCalledWith('/admin/users')
    })
  })

  describe('suspendUser', () => {
    it('prevents self-suspension', async () => {
      const result = await suspendUser('admin-123', true)

      expect(result.error).toBe('Cannot suspend yourself')
    })

    it('returns error when user not found', async () => {
      ;(prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser)
        .mockResolvedValueOnce(null)

      const result = await suspendUser('nonexistent', true)

      expect(result.error).toBe('User not found')
    })

    it('suspends user', async () => {
      ;(prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser)
        .mockResolvedValueOnce(mockRegularUser)
      ;(prisma.user.update as jest.Mock).mockResolvedValue({})
      ;(logAdminAction as jest.Mock).mockResolvedValue({})

      const result = await suspendUser('user-123', true)

      expect(result.success).toBe(true)
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { isSuspended: true },
      })
    })

    it('unsuspends user', async () => {
      ;(prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser)
        .mockResolvedValueOnce({ ...mockRegularUser, isSuspended: true })
      ;(prisma.user.update as jest.Mock).mockResolvedValue({})
      ;(logAdminAction as jest.Mock).mockResolvedValue({})

      const result = await suspendUser('user-123', false)

      expect(result.success).toBe(true)
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { isSuspended: false },
      })
    })

    it('logs suspend action', async () => {
      ;(prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockAdminUser)
        .mockResolvedValueOnce(mockRegularUser)
      ;(prisma.user.update as jest.Mock).mockResolvedValue({})
      ;(logAdminAction as jest.Mock).mockResolvedValue({})

      await suspendUser('user-123', true)

      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_SUSPENDED',
        })
      )
    })
  })

  describe('getListingsForAdmin', () => {
    const mockListing = {
      id: 'listing-123',
      title: 'Test Listing',
      price: 1000,
      status: 'ACTIVE',
    }

    it('returns listings with pagination', async () => {
      ;(prisma.listing.findMany as jest.Mock).mockResolvedValue([mockListing])
      ;(prisma.listing.count as jest.Mock).mockResolvedValue(1)

      const result = await getListingsForAdmin({ page: 1, limit: 20 })

      expect(result.listings).toEqual([mockListing])
      expect(result.total).toBe(1)
    })

    it('filters by search term', async () => {
      ;(prisma.listing.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.listing.count as jest.Mock).mockResolvedValue(0)

      await getListingsForAdmin({ search: 'test' })

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { title: { contains: 'test', mode: 'insensitive' } },
            ]),
          }),
        })
      )
    })

    it('filters by status', async () => {
      ;(prisma.listing.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.listing.count as jest.Mock).mockResolvedValue(0)

      await getListingsForAdmin({ status: 'PAUSED' })

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PAUSED' }),
        })
      )
    })

    it('filters by owner', async () => {
      ;(prisma.listing.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.listing.count as jest.Mock).mockResolvedValue(0)

      await getListingsForAdmin({ ownerId: 'owner-123' })

      expect(prisma.listing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ownerId: 'owner-123' }),
        })
      )
    })
  })

  describe('updateListingStatus', () => {
    const mockListing = {
      status: 'ACTIVE',
      title: 'Test Listing',
      ownerId: 'owner-123',
    }

    it('returns error when listing not found', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await updateListingStatus('nonexistent', 'PAUSED')

      expect(result.error).toBe('Listing not found')
    })

    it('updates listing status', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing)
      ;(prisma.listing.update as jest.Mock).mockResolvedValue({})
      ;(logAdminAction as jest.Mock).mockResolvedValue({})

      const result = await updateListingStatus('listing-123', 'PAUSED')

      expect(result.success).toBe(true)
      expect(prisma.listing.update).toHaveBeenCalledWith({
        where: { id: 'listing-123' },
        data: { status: 'PAUSED' },
      })
    })

    it('logs action with previous status', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing)
      ;(prisma.listing.update as jest.Mock).mockResolvedValue({})
      ;(logAdminAction as jest.Mock).mockResolvedValue({})

      await updateListingStatus('listing-123', 'PAUSED')

      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LISTING_HIDDEN',
          details: expect.objectContaining({
            previousStatus: 'ACTIVE',
            newStatus: 'PAUSED',
          }),
        })
      )
    })

    it('revalidates admin listings path', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing)
      ;(prisma.listing.update as jest.Mock).mockResolvedValue({})
      ;(logAdminAction as jest.Mock).mockResolvedValue({})

      await updateListingStatus('listing-123', 'ACTIVE')

      expect(revalidatePath).toHaveBeenCalledWith('/admin/listings')
    })
  })

  describe('deleteListing', () => {
    const mockListing = {
      title: 'Test Listing',
      ownerId: 'owner-123',
      status: 'ACTIVE',
    }

    // deleteListing uses prisma.$transaction(callback) — the callback receives
    // a tx client that mirrors prisma's API. We create a tx mock and wire
    // $transaction to invoke the callback with it.
    const txMock = {
      booking: { count: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
      notification: { create: jest.fn() },
      listing: { delete: jest.fn() },
    }

    beforeEach(() => {
      ;(prisma.$transaction as jest.Mock).mockImplementation(
        async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)
      )
      jest.clearAllMocks()
      // Re-apply $transaction mock after clearAllMocks
      ;(prisma.$transaction as jest.Mock).mockImplementation(
        async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)
      )
    })

    it('returns error when listing not found', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await deleteListing('nonexistent')

      expect(result.error).toBe('Listing not found')
    })

    it('blocks deletion with active bookings', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing)
      txMock.booking.count.mockResolvedValue(2)

      const result = await deleteListing('listing-123')

      expect(result.error).toBe('Cannot delete listing with active bookings')
    })

    it('deletes listing and notifies pending tenants', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing)
      txMock.booking.count.mockResolvedValue(0)
      txMock.booking.findMany.mockResolvedValue([
        { id: 'booking-1', tenantId: 'tenant-1' },
      ])
      ;(logAdminAction as jest.Mock).mockResolvedValue({})

      const result = await deleteListing('listing-123')

      expect(result.success).toBe(true)
      expect(result.notifiedTenants).toBe(1)
    })

    it('logs deletion action', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing)
      txMock.booking.count.mockResolvedValue(0)
      txMock.booking.findMany.mockResolvedValue([])
      ;(logAdminAction as jest.Mock).mockResolvedValue({})

      await deleteListing('listing-123')

      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LISTING_DELETED',
        })
      )
    })
  })

  describe('getReports', () => {
    const mockReport = {
      id: 'report-123',
      reason: 'INAPPROPRIATE',
      status: 'OPEN',
    }

    it('returns reports with pagination', async () => {
      ;(prisma.report.findMany as jest.Mock).mockResolvedValue([mockReport])
      ;(prisma.report.count as jest.Mock).mockResolvedValue(1)

      const result = await getReports({ page: 1, limit: 20 })

      expect(result.reports).toEqual([mockReport])
      expect(result.total).toBe(1)
    })

    it('filters by status', async () => {
      ;(prisma.report.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.report.count as jest.Mock).mockResolvedValue(0)

      await getReports({ status: 'OPEN' })

      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'OPEN' }),
        })
      )
    })
  })

  describe('resolveReport', () => {
    const mockReport = {
      status: 'OPEN',
      reason: 'INAPPROPRIATE',
      listingId: 'listing-123',
      reporterId: 'reporter-123',
    }

    it('returns error when report not found', async () => {
      ;(prisma.report.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await resolveReport('nonexistent', 'RESOLVED')

      expect(result.error).toBe('Report not found')
    })

    it('resolves report', async () => {
      ;(prisma.report.findUnique as jest.Mock).mockResolvedValue(mockReport)
      ;(prisma.report.update as jest.Mock).mockResolvedValue({})
      ;(logAdminAction as jest.Mock).mockResolvedValue({})

      const result = await resolveReport('report-123', 'RESOLVED', 'Addressed')

      expect(result.success).toBe(true)
      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: 'report-123' },
        data: expect.objectContaining({
          status: 'RESOLVED',
          adminNotes: 'Addressed',
        }),
      })
    })

    it('dismisses report', async () => {
      ;(prisma.report.findUnique as jest.Mock).mockResolvedValue(mockReport)
      ;(prisma.report.update as jest.Mock).mockResolvedValue({})
      ;(logAdminAction as jest.Mock).mockResolvedValue({})

      await resolveReport('report-123', 'DISMISSED')

      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: 'report-123' },
        data: expect.objectContaining({
          status: 'DISMISSED',
        }),
      })
    })

    it('logs appropriate action type', async () => {
      ;(prisma.report.findUnique as jest.Mock).mockResolvedValue(mockReport)
      ;(prisma.report.update as jest.Mock).mockResolvedValue({})
      ;(logAdminAction as jest.Mock).mockResolvedValue({})

      await resolveReport('report-123', 'DISMISSED')

      expect(logAdminAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REPORT_DISMISSED',
        })
      )
    })
  })

  describe('getAdminStats', () => {
    it('returns all stats', async () => {
      ;(prisma.user.count as jest.Mock)
        .mockResolvedValueOnce(100) // totalUsers
        .mockResolvedValueOnce(80) // verifiedUsers
        .mockResolvedValueOnce(5) // suspendedUsers
      ;(prisma.listing.count as jest.Mock)
        .mockResolvedValueOnce(50) // totalListings
        .mockResolvedValueOnce(40) // activeListings
      ;(prisma.verificationRequest.count as jest.Mock).mockResolvedValue(10)
      ;(prisma.report.count as jest.Mock).mockResolvedValue(3)
      ;(prisma.booking.count as jest.Mock).mockResolvedValue(200)
      ;(prisma.message.count as jest.Mock).mockResolvedValue(1000)

      const result = await getAdminStats()

      expect(result.totalUsers).toBe(100)
      expect(result.verifiedUsers).toBe(80)
      expect(result.suspendedUsers).toBe(5)
      expect(result.totalListings).toBe(50)
      expect(result.activeListings).toBe(40)
      expect(result.pendingVerifications).toBe(10)
      expect(result.openReports).toBe(3)
      expect(result.totalBookings).toBe(200)
      expect(result.totalMessages).toBe(1000)
    })

    it('returns error on database failure', async () => {
      ;(prisma.user.count as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await getAdminStats()

      expect(result.error).toBe('Failed to fetch stats')
    })
  })
})
