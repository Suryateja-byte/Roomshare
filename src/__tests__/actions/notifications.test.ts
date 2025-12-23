/**
 * Tests for notifications server action
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  unstable_cache: jest.fn((fn) => fn),
}))

import {
  createNotification,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getUnreadNotificationCount,
} from '@/app/actions/notifications'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

describe('Notifications Actions', () => {
  const mockSession = {
    user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
  }

  const mockNotifications = [
    {
      id: 'notif-1',
      userId: 'user-123',
      type: 'BOOKING_REQUEST',
      title: 'New Booking',
      message: 'You have a new booking request',
      read: false,
      createdAt: new Date(),
    },
    {
      id: 'notif-2',
      userId: 'user-123',
      type: 'MESSAGE',
      title: 'New Message',
      message: 'You have a new message',
      read: true,
      createdAt: new Date(),
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.notification.findMany as jest.Mock).mockResolvedValue(mockNotifications)
    ;(prisma.notification.count as jest.Mock).mockResolvedValue(1)
  })

  describe('createNotification', () => {
    it('creates notification successfully', async () => {
      ;(prisma.notification.create as jest.Mock).mockResolvedValue({
        ...mockNotifications[0],
        id: 'notif-new',
      })

      const result = await createNotification({
        userId: 'user-123',
        type: 'BOOKING_REQUEST',
        title: 'New Booking',
        message: 'You have a new booking request',
      })

      expect(prisma.notification.create).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('handles creation errors', async () => {
      ;(prisma.notification.create as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const result = await createNotification({
        userId: 'user-123',
        type: 'BOOKING_REQUEST',
        title: 'Test',
        message: 'Test message',
      })

      expect(result.error).toBeDefined()
    })
  })

  describe('getNotifications', () => {
    it('returns notifications for authenticated user', async () => {
      const result = await getNotifications()

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123' },
        })
      )
      expect(result.notifications).toEqual(mockNotifications)
      expect(result.unreadCount).toBe(1)
    })

    it('returns empty array when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await getNotifications()

      expect(result.notifications).toEqual([])
      expect(result.unreadCount).toBe(0)
    })
  })

  describe('markNotificationAsRead', () => {
    it('marks notification as read', async () => {
      ;(prisma.notification.update as jest.Mock).mockResolvedValue({
        ...mockNotifications[0],
        read: true,
      })

      await markNotificationAsRead('notif-1')

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: {
          id: 'notif-1',
          userId: 'user-123',
        },
        data: { read: true },
      })
    })
  })

  describe('markAllNotificationsAsRead', () => {
    it('marks all notifications as read', async () => {
      ;(prisma.notification.updateMany as jest.Mock).mockResolvedValue({ count: 5 })

      await markAllNotificationsAsRead()

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-123', read: false },
        data: { read: true },
      })
    })
  })

  describe('deleteNotification', () => {
    it('deletes notification', async () => {
      ;(prisma.notification.delete as jest.Mock).mockResolvedValue(mockNotifications[0])

      await deleteNotification('notif-1')

      expect(prisma.notification.delete).toHaveBeenCalledWith({
        where: {
          id: 'notif-1',
          userId: 'user-123',
        },
      })
    })
  })

  describe('getUnreadNotificationCount', () => {
    it('returns unread count', async () => {
      const result = await getUnreadNotificationCount()

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-123', read: false },
      })
      expect(result).toBe(1)
    })

    it('returns 0 when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await getUnreadNotificationCount()

      expect(result).toBe(0)
    })
  })
})
