/**
 * Tests for messages pagination (P1-03)
 *
 * Verifies that:
 * 1. Default returns 20 messages with cursor
 * 2. Custom limit (max 100) respected
 * 3. Conversation list paginated
 * 4. Invalid cursor returns 400
 * 5. Max message length (2000 chars) enforced
 */

// Mock Prisma before imports
jest.mock('@/lib/prisma', () => {
  const mockPrisma: Record<string, any> = {
    message: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    conversation: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    conversationDeletion: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(),
  };
  mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
  return { prisma: mockPrisma };
});

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/app/actions/suspension', () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
  checkEmailVerified: jest.fn().mockResolvedValue({ verified: true }),
}));

jest.mock('@/app/actions/block', () => ({
  checkBlockBeforeAction: jest.fn().mockResolvedValue({ allowed: true }),
}));

// Mock next/server to avoid NextRequest issues in Jest
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: new Map(Object.entries(init?.headers || {})),
      };
    },
  },
}));

// Mock rate limiting to allow all requests
jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

import { GET, POST } from '@/app/api/messages/route';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// Helper to create mock request using native Request
function createMockRequest(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Request {
  return new Request(url, init);
}

// Generate mock messages for pagination testing
function generateMockMessages(count: number, startIndex = 0): Array<{
  id: string;
  senderId: string;
  conversationId: string;
  content: string;
  read: boolean;
  createdAt: Date;
  sender: { id: string; name: string; image: string | null };
}> {
  return Array.from({ length: count }, (_, i) => ({
    id: `message-${startIndex + i}`,
    senderId: `sender-${startIndex + i}`,
    conversationId: 'conversation-abc',
    content: `Message content ${startIndex + i}`,
    read: false,
    createdAt: new Date(Date.now() - (startIndex + i) * 1000 * 60),
    sender: { id: `sender-${startIndex + i}`, name: `Sender ${startIndex + i}`, image: null },
  }));
}

// Generate mock conversations for pagination testing
function generateMockConversations(count: number, startIndex = 0): Array<{
  id: string;
  listingId: string;
  createdAt: Date;
  updatedAt: Date;
  listing: { id: string; title: string; images: string[] };
  participants: Array<{ id: string; name: string; image: string | null }>;
  messages: Array<{ id: string; content: string; createdAt: Date; senderId: string }>;
}> {
  return Array.from({ length: count }, (_, i) => ({
    id: `conversation-${startIndex + i}`,
    listingId: `listing-${startIndex + i}`,
    createdAt: new Date(Date.now() - (startIndex + i) * 1000 * 60 * 60),
    updatedAt: new Date(Date.now() - (startIndex + i) * 1000 * 60),
    listing: { id: `listing-${startIndex + i}`, title: `Listing ${startIndex + i}`, images: [] },
    participants: [
      { id: 'user-123', name: 'Current User', image: null },
      { id: `other-user-${startIndex + i}`, name: `Other User ${startIndex + i}`, image: null },
    ],
    messages: [
      {
        id: `last-message-${startIndex + i}`,
        content: `Last message ${startIndex + i}`,
        createdAt: new Date(Date.now() - (startIndex + i) * 1000 * 60),
        senderId: `other-user-${startIndex + i}`,
      },
    ],
  }));
}

describe('Messages Pagination (P1-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore default $transaction behavior after clearAllMocks wipes it
    (prisma.$transaction as jest.Mock).mockImplementation((fn: any) => fn(prisma));
    // Default: authenticated user
    (auth as jest.Mock).mockResolvedValue({
      user: { id: 'user-123', email: 'test@example.com' },
    });
    // Rate limiting is mocked at module level via jest.mock('@/lib/with-rate-limit')
  });

  describe('GET /api/messages - Messages Pagination', () => {
    it('returns default 20 messages when no limit specified', async () => {
      const mockMessages = generateMockMessages(25);
      (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages.slice(0, 21)); // +1 for hasMore check
      (prisma.message.count as jest.Mock).mockResolvedValue(25);
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conversation-abc',
        participants: [{ id: 'user-123' }],
        deletions: [],
      });

      const request = createMockRequest('http://localhost:3000/api/messages?conversationId=conversation-abc');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.messages).toHaveLength(20);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.hasMore).toBe(true);
      expect(data.pagination.nextCursor).toBeDefined();
    });

    it('respects custom limit parameter up to max 100', async () => {
      const mockMessages = generateMockMessages(50);
      (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages.slice(0, 51));
      (prisma.message.count as jest.Mock).mockResolvedValue(50);
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conversation-abc',
        participants: [{ id: 'user-123' }],
        deletions: [],
      });

      const request = createMockRequest('http://localhost:3000/api/messages?conversationId=conversation-abc&limit=50');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.messages).toHaveLength(50);
    });

    it('caps limit at 100 even if higher value requested', async () => {
      const mockMessages = generateMockMessages(150);
      (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages.slice(0, 101));
      (prisma.message.count as jest.Mock).mockResolvedValue(150);
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conversation-abc',
        participants: [{ id: 'user-123' }],
        deletions: [],
      });

      const request = createMockRequest('http://localhost:3000/api/messages?conversationId=conversation-abc&limit=200');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should cap at 100
      expect(data.messages.length).toBeLessThanOrEqual(100);
      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 101, // 100 + 1 for hasMore check
        })
      );
    });

    it('returns cursor for next page when more results exist', async () => {
      const mockMessages = generateMockMessages(25);
      (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages.slice(0, 21));
      (prisma.message.count as jest.Mock).mockResolvedValue(25);
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conversation-abc',
        participants: [{ id: 'user-123' }],
        deletions: [],
      });

      const request = createMockRequest('http://localhost:3000/api/messages?conversationId=conversation-abc&limit=20');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination.hasMore).toBe(true);
      expect(data.pagination.nextCursor).toBe('message-19'); // Last item's ID
    });

    it('returns no cursor when no more results', async () => {
      const mockMessages = generateMockMessages(10);
      (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages);
      (prisma.message.count as jest.Mock).mockResolvedValue(10);
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conversation-abc',
        participants: [{ id: 'user-123' }],
        deletions: [],
      });

      const request = createMockRequest('http://localhost:3000/api/messages?conversationId=conversation-abc&limit=20');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination.hasMore).toBe(false);
      expect(data.pagination.nextCursor).toBeNull();
    });

    it('uses cursor to fetch next page', async () => {
      const mockMessages = generateMockMessages(10, 20); // Messages 20-29
      (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages);
      (prisma.message.count as jest.Mock).mockResolvedValue(30);
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conversation-abc',
        participants: [{ id: 'user-123' }],
        deletions: [],
      });

      const request = createMockRequest('http://localhost:3000/api/messages?conversationId=conversation-abc&cursor=message-19');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.messages).toBeDefined();
      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'message-19' },
          skip: 1, // Skip the cursor item
        })
      );
    });

    it('returns 400 for invalid cursor format', async () => {
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conversation-abc',
        participants: [{ id: 'user-123' }],
        deletions: [],
      });

      const request = createMockRequest('http://localhost:3000/api/messages?conversationId=conversation-abc&cursor=invalid<script>');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid cursor');
    });

    it('returns 400 for negative limit', async () => {
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conversation-abc',
        participants: [{ id: 'user-123' }],
        deletions: [],
      });

      const request = createMockRequest('http://localhost:3000/api/messages?conversationId=conversation-abc&limit=-5');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('limit');
    });

    it('returns 400 for non-numeric limit', async () => {
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conversation-abc',
        participants: [{ id: 'user-123' }],
        deletions: [],
      });

      const request = createMockRequest('http://localhost:3000/api/messages?conversationId=conversation-abc&limit=abc');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('limit');
    });

    it('includes total count in pagination metadata', async () => {
      const mockMessages = generateMockMessages(5);
      (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages);
      (prisma.message.count as jest.Mock).mockResolvedValue(5);
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'conversation-abc',
        participants: [{ id: 'user-123' }],
        deletions: [],
      });

      const request = createMockRequest('http://localhost:3000/api/messages?conversationId=conversation-abc');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination.total).toBe(5);
    });
  });

  describe('GET /api/messages - Conversations Pagination', () => {
    it('returns default 20 conversations when no limit specified', async () => {
      const mockConversations = generateMockConversations(25);
      (prisma.conversation.count as jest.Mock).mockResolvedValue(25);
      (prisma.conversation.findMany as jest.Mock).mockResolvedValue(mockConversations.slice(0, 21));

      const request = createMockRequest('http://localhost:3000/api/messages');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.conversations).toHaveLength(20);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.hasMore).toBe(true);
    });

    it('respects custom limit for conversations', async () => {
      const mockConversations = generateMockConversations(15);
      (prisma.conversation.count as jest.Mock).mockResolvedValue(15);
      (prisma.conversation.findMany as jest.Mock).mockResolvedValue(mockConversations.slice(0, 11));

      const request = createMockRequest('http://localhost:3000/api/messages?limit=10');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.conversations).toHaveLength(10);
    });

    it('returns cursor for next page of conversations', async () => {
      const mockConversations = generateMockConversations(25);
      (prisma.conversation.count as jest.Mock).mockResolvedValue(25);
      (prisma.conversation.findMany as jest.Mock).mockResolvedValue(mockConversations.slice(0, 21));

      const request = createMockRequest('http://localhost:3000/api/messages?limit=20');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination.hasMore).toBe(true);
      expect(data.pagination.nextCursor).toBe('conversation-19');
    });

    it('uses cursor to fetch next page of conversations', async () => {
      const mockConversations = generateMockConversations(10, 20);
      (prisma.conversation.count as jest.Mock).mockResolvedValue(30);
      (prisma.conversation.findMany as jest.Mock).mockResolvedValue(mockConversations);

      const request = createMockRequest('http://localhost:3000/api/messages?cursor=conversation-19');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.conversations).toBeDefined();
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'conversation-19' },
          skip: 1,
        })
      );
    });
  });

  describe('POST /api/messages - Max Length Validation', () => {
    beforeEach(() => {
      // POST route uses findUnique (not findFirst)
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: 'conversation-abc',
        participants: [{ id: 'user-123' }, { id: 'other-user' }],
      });
    });

    it('accepts message within 2000 character limit', async () => {
      const validContent = 'A'.repeat(2000);
      (prisma.message.create as jest.Mock).mockResolvedValue({
        id: 'message-new',
        senderId: 'user-123',
        conversationId: 'conversation-abc',
        content: validContent,
        read: false,
        createdAt: new Date(),
      });

      const request = createMockRequest('http://localhost:3000/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'conversation-abc',
          content: validContent,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
    });

    it('rejects message exceeding 2000 character limit', async () => {
      const tooLongContent = 'A'.repeat(2001);

      const request = createMockRequest('http://localhost:3000/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'conversation-abc',
          content: tooLongContent,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('2000');
    });

    it('rejects empty message', async () => {
      const request = createMockRequest('http://localhost:3000/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'conversation-abc',
          content: '',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    });

    it('rejects whitespace-only message', async () => {
      const request = createMockRequest('http://localhost:3000/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'conversation-abc',
          content: '   \n\t   ',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    });
  });
});
