/**
 * Tests for audit logging
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}))

import { logAdminAction, getAuditLogs, getTargetAuditHistory, getAdminActionHistory } from '@/lib/audit'
import { prisma } from '@/lib/prisma'

describe('Audit Logging', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('logAdminAction', () => {
    it('logs admin action successfully', async () => {
      ;(prisma.auditLog.create as jest.Mock).mockResolvedValue({})

      await logAdminAction({
        adminId: 'admin-123',
        action: 'USER_SUSPENDED',
        targetType: 'User',
        targetId: 'user-456',
        details: { reason: 'Violation' },
        ipAddress: '192.168.1.1',
      })

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          adminId: 'admin-123',
          action: 'USER_SUSPENDED',
          targetType: 'User',
          targetId: 'user-456',
          details: { reason: 'Violation' },
          ipAddress: '192.168.1.1',
        },
      })
    })

    it('handles missing optional fields', async () => {
      ;(prisma.auditLog.create as jest.Mock).mockResolvedValue({})

      await logAdminAction({
        adminId: 'admin-123',
        action: 'LISTING_DELETED',
        targetType: 'Listing',
        targetId: 'listing-789',
      })

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          adminId: 'admin-123',
          action: 'LISTING_DELETED',
          targetType: 'Listing',
          targetId: 'listing-789',
          details: {},
          ipAddress: undefined,
        },
      })
    })

    it('does not throw on database error (silent fail)', async () => {
      ;(prisma.auditLog.create as jest.Mock).mockRejectedValue(new Error('DB Error'))

      await expect(
        logAdminAction({
          adminId: 'admin-123',
          action: 'USER_DELETED',
          targetType: 'User',
          targetId: 'user-456',
        })
      ).resolves.toBeUndefined()
    })

    it('logs USER_SUSPENDED action type', async () => {
      ;(prisma.auditLog.create as jest.Mock).mockResolvedValue({})

      await logAdminAction({
        adminId: 'admin-123',
        action: 'USER_SUSPENDED',
        targetType: 'User',
        targetId: 'target-123',
      })

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'USER_SUSPENDED' }),
        })
      )
    })

    it('logs LISTING_DELETED action type', async () => {
      ;(prisma.auditLog.create as jest.Mock).mockResolvedValue({})

      await logAdminAction({
        adminId: 'admin-123',
        action: 'LISTING_DELETED',
        targetType: 'Listing',
        targetId: 'listing-123',
      })

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'LISTING_DELETED' }),
        })
      )
    })

    it('logs VERIFICATION_APPROVED action type', async () => {
      ;(prisma.auditLog.create as jest.Mock).mockResolvedValue({})

      await logAdminAction({
        adminId: 'admin-123',
        action: 'VERIFICATION_APPROVED',
        targetType: 'VerificationRequest',
        targetId: 'verification-123',
      })

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'VERIFICATION_APPROVED' }),
        })
      )
    })
  })

  describe('getAuditLogs', () => {
    const mockLogs = [
      {
        id: 'log-1',
        adminId: 'admin-123',
        action: 'USER_SUSPENDED',
        targetType: 'User',
        targetId: 'user-456',
        createdAt: new Date(),
        admin: { id: 'admin-123', name: 'Admin', email: 'admin@test.com', image: null },
      },
    ]

    it('returns paginated audit logs', async () => {
      ;(prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockLogs)
      ;(prisma.auditLog.count as jest.Mock).mockResolvedValue(100)

      const result = await getAuditLogs({ page: 2, limit: 10 })

      expect(result).toEqual({
        logs: mockLogs,
        pagination: {
          page: 2,
          limit: 10,
          total: 100,
          totalPages: 10,
        },
      })
    })

    it('uses default pagination values', async () => {
      ;(prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockLogs)
      ;(prisma.auditLog.count as jest.Mock).mockResolvedValue(50)

      const result = await getAuditLogs()

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 50,
        })
      )
      expect(result.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 50,
        totalPages: 1,
      })
    })

    it('filters by adminId', async () => {
      ;(prisma.auditLog.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.auditLog.count as jest.Mock).mockResolvedValue(0)

      await getAuditLogs({ adminId: 'admin-123' })

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ adminId: 'admin-123' }),
        })
      )
    })

    it('filters by action type', async () => {
      ;(prisma.auditLog.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.auditLog.count as jest.Mock).mockResolvedValue(0)

      await getAuditLogs({ action: 'USER_SUSPENDED' })

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: 'USER_SUSPENDED' }),
        })
      )
    })

    it('filters by target type and id', async () => {
      ;(prisma.auditLog.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.auditLog.count as jest.Mock).mockResolvedValue(0)

      await getAuditLogs({ targetType: 'User', targetId: 'user-456' })

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ targetType: 'User', targetId: 'user-456' }),
        })
      )
    })

    it('filters by date range', async () => {
      ;(prisma.auditLog.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.auditLog.count as jest.Mock).mockResolvedValue(0)

      const startDate = new Date('2025-01-01')
      const endDate = new Date('2025-01-31')

      await getAuditLogs({ startDate, endDate })

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: startDate, lte: endDate },
          }),
        })
      )
    })

    it('includes admin details in response', async () => {
      ;(prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockLogs)
      ;(prisma.auditLog.count as jest.Mock).mockResolvedValue(1)

      await getAuditLogs()

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            admin: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        })
      )
    })

    it('orders by createdAt descending', async () => {
      ;(prisma.auditLog.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.auditLog.count as jest.Mock).mockResolvedValue(0)

      await getAuditLogs()

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      )
    })
  })

  describe('getTargetAuditHistory', () => {
    it('returns audit history for a specific target', async () => {
      const mockHistory = [
        { id: 'log-1', action: 'USER_SUSPENDED', admin: { id: 'admin-1', name: 'Admin', email: 'admin@test.com' } },
      ]
      ;(prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockHistory)

      const result = await getTargetAuditHistory('User', 'user-123')

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { targetType: 'User', targetId: 'user-123' },
        include: {
          admin: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
      expect(result).toEqual(mockHistory)
    })

    it('returns empty array when no history exists', async () => {
      ;(prisma.auditLog.findMany as jest.Mock).mockResolvedValue([])

      const result = await getTargetAuditHistory('Listing', 'listing-999')

      expect(result).toEqual([])
    })
  })

  describe('getAdminActionHistory', () => {
    it('returns recent actions by admin', async () => {
      const mockActions = [
        { id: 'log-1', action: 'USER_SUSPENDED' },
        { id: 'log-2', action: 'LISTING_DELETED' },
      ]
      ;(prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockActions)

      const result = await getAdminActionHistory('admin-123')

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { adminId: 'admin-123' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
      expect(result).toEqual(mockActions)
    })

    it('respects custom limit parameter', async () => {
      ;(prisma.auditLog.findMany as jest.Mock).mockResolvedValue([])

      await getAdminActionHistory('admin-123', 50)

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      )
    })
  })
})
