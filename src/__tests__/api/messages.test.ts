/**
 * Tests for messages API route
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    conversationDeletion: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  },
}))

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: any, init?: { status?: number }) => {
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: new Map(),
      }
    },
  },
}))

// P1-4: Mock rate limiting to return null (allow request)
jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}))

import { GET, POST } from '@/app/api/messages/route'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

describe('Messages API', () => {
  const mockSession = {
    user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
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

  describe('GET', () => {
    it('returns 401 when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const request = new Request('http://localhost/api/messages')
      const response = await GET(request)

      expect(response.status).toBe(401)
    })

    it('returns messages for specific conversation', async () => {
      const mockConversation = {
        id: 'conv-123',
        participants: [{ id: 'user-123' }, { id: 'user-456' }],
        deletions: [],
      }
      const mockMessages = [
        { id: 'msg-1', content: 'Hello', sender: { id: 'user-123', name: 'User', image: null } },
        { id: 'msg-2', content: 'Hi', sender: { id: 'user-456', name: 'Other', image: null } },
      ]
      ;(prisma.conversation.findFirst as jest.Mock).mockResolvedValue(mockConversation)
      ;(prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages)
      ;(prisma.message.count as jest.Mock).mockResolvedValue(2)

      const request = new Request('http://localhost/api/messages?conversationId=conv-123')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.messages).toEqual(mockMessages)
    })

    it('returns 403 when user is not participant', async () => {
      ;(prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conv-123',
        participants: [{ id: 'other-1' }, { id: 'other-2' }],
        deletions: [],
      })

      const request = new Request('http://localhost/api/messages?conversationId=conv-123')
      const response = await GET(request)

      expect(response.status).toBe(403)
    })

    it('returns all conversations when no conversationId', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          participants: [
            { id: 'user-123', name: 'User', image: null },
            { id: 'other-1', name: 'Other 1', image: null },
          ],
          messages: [{ content: 'Last message', createdAt: new Date() }],
          listing: { title: 'Listing 1' },
        },
      ]
      ;(prisma.conversation.findMany as jest.Mock).mockResolvedValue(mockConversations)
      ;(prisma.conversation.count as jest.Mock).mockResolvedValue(1)

      const request = new Request('http://localhost/api/messages')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.conversations[0].id).toBe('conv-1')
    })

    it('handles database errors', async () => {
      ;(prisma.conversation.findMany as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const request = new Request('http://localhost/api/messages')
      const response = await GET(request)

      expect(response.status).toBe(500)
    })
  })

  describe('POST', () => {
    it('returns 401 when not authenticated', async () => {
      ;(auth as jest.Mock).mockResolvedValue(null)

      const request = new Request('http://localhost/api/messages', {
        method: 'POST',
        body: JSON.stringify({ conversationId: 'conv-123', content: 'Hello' }),
      })
      const response = await POST(request)

      expect(response.status).toBe(401)
    })

    it('returns 400 when missing fields', async () => {
      const request = new Request('http://localhost/api/messages', {
        method: 'POST',
        body: JSON.stringify({ conversationId: 'conv-123' }),
      })
      const response = await POST(request)

      expect(response.status).toBe(400)
    })

    it('returns 403 when user is not participant', async () => {
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: 'conv-123',
        participants: [{ id: 'other-1' }, { id: 'other-2' }],
      })

      const request = new Request('http://localhost/api/messages', {
        method: 'POST',
        body: JSON.stringify({ conversationId: 'conv-123', content: 'Hello' }),
      })
      const response = await POST(request)

      expect(response.status).toBe(403)
    })

    it('creates message successfully', async () => {
      const mockConversation = {
        id: 'conv-123',
        participants: [{ id: 'user-123' }, { id: 'user-456' }],
      }
      const mockMessage = {
        id: 'msg-new',
        content: 'Hello',
        senderId: 'user-123',
        sender: { id: 'user-123', name: 'User', image: null },
      }
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue(mockConversation)
      ;(prisma.message.create as jest.Mock).mockResolvedValue(mockMessage)
      ;(prisma.conversation.update as jest.Mock).mockResolvedValue({})

      const request = new Request('http://localhost/api/messages', {
        method: 'POST',
        body: JSON.stringify({ conversationId: 'conv-123', content: 'Hello' }),
      })
      const response = await POST(request)

      expect(response.status).toBe(201)
      expect(prisma.message.create).toHaveBeenCalled()
      expect(prisma.conversation.update).toHaveBeenCalled()
    })

    it('handles database errors', async () => {
      ;(prisma.conversation.findUnique as jest.Mock).mockRejectedValue(new Error('DB Error'))

      const request = new Request('http://localhost/api/messages', {
        method: 'POST',
        body: JSON.stringify({ conversationId: 'conv-123', content: 'Hello' }),
      })
      const response = await POST(request)

      expect(response.status).toBe(500)
    })
  })
})
