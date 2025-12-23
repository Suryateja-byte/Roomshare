/**
 * Tests for chat server actions
 */

// Mock next/cache to prevent TextEncoder errors
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
  unstable_cache: jest.fn((fn) => fn),
}))

// Mock dependencies before imports
jest.mock('@/lib/prisma', () => ({
  prisma: {
    listing: {
      findUnique: jest.fn(),
    },
    conversation: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/app/actions/block', () => ({
  checkBlockBeforeAction: jest.fn().mockResolvedValue({ allowed: true }),
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/app/actions/notifications', () => ({
  createNotification: jest.fn().mockResolvedValue({ success: true }),
}))

jest.mock('@/lib/email', () => ({
  sendNotificationEmail: jest.fn().mockResolvedValue({ success: true }),
  sendNotificationEmailWithPreference: jest.fn().mockResolvedValue({ success: true }),
}))

import {
  startConversation,
  sendMessage,
  getConversations,
  getMessages,
  getUnreadMessageCount,
} from '@/app/actions/chat'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

describe('Chat Actions', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
  })

  describe('startConversation', () => {
    const mockListing = {
      id: 'listing-123',
      ownerId: 'owner-456',
    }

    beforeEach(() => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing)
      // Mock user.findUnique for email verification check
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        emailVerified: new Date(),
        isSuspended: false,
      })
    })

    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await startConversation('listing-123')

      expect(result).toEqual({ error: 'Unauthorized', code: 'SESSION_EXPIRED' })
    })

    it('returns error when listing not found', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await startConversation('invalid-listing')

      expect(result).toEqual({ error: 'Listing not found' })
    })

    it('returns error when trying to chat with self', async () => {
      ;(prisma.listing.findUnique as jest.Mock).mockResolvedValue({
        ...mockListing,
        ownerId: 'user-123', // Same as session user
      })

      const result = await startConversation('listing-123')

      expect(result).toEqual({ error: 'Cannot chat with yourself' })
    })

    it('returns existing conversation if one exists', async () => {
      ;(prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'existing-conv-123',
      })

      const result = await startConversation('listing-123')

      expect(result).toEqual({ conversationId: 'existing-conv-123' })
      expect(prisma.conversation.create).not.toHaveBeenCalled()
    })

    it('creates new conversation if none exists', async () => {
      ;(prisma.conversation.findFirst as jest.Mock).mockResolvedValue(null)
      ;(prisma.conversation.create as jest.Mock).mockResolvedValue({
        id: 'new-conv-123',
      })

      const result = await startConversation('listing-123')

      expect(result).toEqual({ conversationId: 'new-conv-123' })
      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          listingId: 'listing-123',
          participants: {
            connect: [{ id: 'user-123' }, { id: 'owner-456' }],
          },
        },
      })
    })
  })

  describe('sendMessage', () => {
    const mockConversation = {
      id: 'conv-123',
      participants: [
        { id: 'user-123', name: 'Test User', email: 'test@example.com' },
        { id: 'other-456', name: 'Other User', email: 'other@example.com' },
      ],
    }

    const mockMessage = {
      id: 'message-123',
      content: 'Hello!',
      conversationId: 'conv-123',
      senderId: 'user-123',
    }

    beforeEach(() => {
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue(mockConversation)
      ;(prisma.message.create as jest.Mock).mockResolvedValue(mockMessage)
      ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ name: 'Test User', emailVerified: new Date() })
    })

    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await sendMessage('conv-123', 'Hello!')

      expect(result).toEqual({ error: 'Unauthorized', code: 'SESSION_EXPIRED' })
    })

    it('returns error when conversation not found', async () => {
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await sendMessage('invalid-conv', 'Hello!')

      expect(result).toEqual({ error: 'Conversation not found' })
    })

    it('creates message successfully', async () => {
      const result = await sendMessage('conv-123', 'Hello!')

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          content: 'Hello!',
          conversationId: 'conv-123',
          senderId: 'user-123',
        },
      })
      expect(result).toEqual(mockMessage)
    })

    it('updates conversation updatedAt', async () => {
      await sendMessage('conv-123', 'Hello!')

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-123' },
        data: { updatedAt: expect.any(Date) },
      })
    })
  })

  describe('getConversations', () => {
    it('returns empty array when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await getConversations()

      expect(result).toEqual([])
    })

    it('returns user conversations with unread count', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          participants: [{ id: 'user-123' }, { id: 'other-1' }],
          messages: [{ content: 'Hello' }],
          listing: { title: 'Listing 1' },
        },
        {
          id: 'conv-2',
          participants: [{ id: 'user-123' }, { id: 'other-2' }],
          messages: [{ content: 'Hi' }],
          listing: { title: 'Listing 2' },
        },
      ]
      ;(prisma.conversation.findMany as jest.Mock).mockResolvedValue(mockConversations)
      // P2-07: Now using groupBy instead of count for N+1 fix
      ;(prisma.message.groupBy as jest.Mock).mockResolvedValue([
        { conversationId: 'conv-1', _count: 2 },
        { conversationId: 'conv-2', _count: 0 },
      ])

      const result = await getConversations()

      expect(result).toEqual([
        { ...mockConversations[0], unreadCount: 2 },
        { ...mockConversations[1], unreadCount: 0 },
      ])
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            participants: {
              some: { id: 'user-123' },
            },
            deletedAt: null,
          },
          orderBy: { updatedAt: 'desc' },
        })
      )
    })
  })

  describe('getMessages', () => {
    const mockConversation = {
      id: 'conv-123',
      participants: [{ id: 'user-123' }, { id: 'other-456' }],
    }

    const mockMessages = [
      { id: 'msg-1', content: 'Hello', sender: { id: 'user-123', name: 'Test' } },
      { id: 'msg-2', content: 'Hi there', sender: { id: 'other-456', name: 'Other' } },
    ]

    beforeEach(() => {
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue(mockConversation)
      ;(prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages)
      ;(prisma.message.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    })

    it('returns error when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await getMessages('conv-123')

      expect(result).toEqual({ error: 'Unauthorized', code: 'SESSION_EXPIRED', messages: [] })
    })

    it('returns error when user is not participant', async () => {
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: 'conv-123',
        participants: [{ id: 'other-1' }, { id: 'other-2' }], // user-123 not included
      })

      const result = await getMessages('conv-123')

      expect(result).toEqual({ error: 'Unauthorized', messages: [] })
    })

    it('returns messages for valid participant', async () => {
      const result = await getMessages('conv-123')

      expect(result).toEqual(mockMessages)
    })

    it('marks unread messages as read', async () => {
      await getMessages('conv-123')

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          conversationId: 'conv-123',
          senderId: { not: 'user-123' },
          read: false,
        },
        data: { read: true },
      })
    })
  })

  describe('getUnreadMessageCount', () => {
    it('returns 0 when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const result = await getUnreadMessageCount()

      expect(result).toBe(0)
    })

    it('returns count of unread messages', async () => {
      const mockUnread = [
        { id: 'msg-1', sender: { id: 'other-1', name: 'User 1' }, conversation: { id: 'conv-1' } },
        { id: 'msg-2', sender: { id: 'other-2', name: 'User 2' }, conversation: { id: 'conv-2' } },
        { id: 'msg-3', sender: { id: 'other-1', name: 'User 1' }, conversation: { id: 'conv-1' } },
      ]
      ;(prisma.message.findMany as jest.Mock).mockResolvedValue(mockUnread)

      const result = await getUnreadMessageCount()

      expect(result).toBe(3)
    })

    it('queries for correct conditions', async () => {
      ;(prisma.message.findMany as jest.Mock).mockResolvedValue([])

      await getUnreadMessageCount()

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            conversation: {
              participants: {
                some: { id: 'user-123' },
              },
              deletedAt: null,
            },
            senderId: { not: 'user-123' },
            read: false,
            deletedAt: null,
          },
        })
      )
    })
  })
})
