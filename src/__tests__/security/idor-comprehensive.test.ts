/**
 * Comprehensive IDOR (Insecure Direct Object Reference) Protection Tests
 * P1-17: Full IDOR coverage across all protected resources
 *
 * Tests verify that users cannot:
 * - Access other user's bookings
 * - Access other user's messages
 * - Access other user's conversations
 * - Modify other user's resources
 */

jest.mock('@/lib/prisma', () => {
  const mockPrisma: Record<string, any> = {
    booking: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    listing: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    conversationDeletion: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    message: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };
  // Default: $transaction passes mockPrisma as tx (for sendMessage etc.)
  // Tests that need custom tx (bookings) override this per-test
  mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
  return { prisma: mockPrisma };
});

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    debug: jest.fn().mockResolvedValue(undefined),
    info: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn().mockResolvedValue(undefined),
    error: jest.fn().mockResolvedValue(undefined),
    sync: {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    },
  },
}));

jest.mock('@/lib/email', () => ({
  sendNotificationEmailWithPreference: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/notifications', () => ({
  createInternalNotification: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/app/actions/suspension', () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
}));

jest.mock('@/app/actions/block', () => ({
  checkBlockBeforeAction: jest.fn().mockResolvedValue({ allowed: true }),
}));

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { updateBookingStatus, getMyBookings } from '@/app/actions/manage-booking';
import { getMessages, sendMessage, deleteMessage, deleteConversation } from '@/app/actions/chat';

// Type for getMessages error response (function returns union of array | error object)
type GetMessagesErrorResult = { error: string; messages: unknown[]; code?: string };

// Type for sendMessage error response
type SendMessageErrorResult = { error: string; code?: string };

describe('Comprehensive IDOR Protection Tests', () => {
  // Test users
  const userAlice = {
    user: { id: 'alice-123', email: 'alice@example.com', isSuspended: false },
  };

  const userBob = {
    user: { id: 'bob-456', email: 'bob@example.com', isSuspended: false },
  };

  const userAttacker = {
    user: { id: 'attacker-789', email: 'attacker@example.com', isSuspended: false },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Restore default $transaction behavior after clearAllMocks wipes it
    (prisma.$transaction as jest.Mock).mockImplementation((fn: any) => fn(prisma));
  });

  describe('Booking IDOR Protection', () => {
    const mockBookingOwnedByAlice = {
      id: 'booking-abc',
      tenantId: 'alice-123',
      status: 'PENDING',
      version: 1,
      startDate: new Date('2024-03-01'),
      endDate: new Date('2024-03-15'),
      listingId: 'listing-xyz',
      listing: {
        id: 'listing-xyz',
        ownerId: 'bob-456', // Bob owns the listing
        availableSlots: 2,
        totalSlots: 3,
        title: 'Test Listing',
        owner: { name: 'Bob' },
      },
      tenant: { id: 'alice-123', name: 'Alice', email: 'alice@example.com' },
    };

    describe('updateBookingStatus IDOR', () => {
      it('prevents attacker from accepting bookings they do not own (listing)', async () => {
        (auth as jest.Mock).mockResolvedValue(userAttacker);
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBookingOwnedByAlice);

        const result = await updateBookingStatus('booking-abc', 'ACCEPTED');

        expect(result.error).toBe('Only the listing owner can accept or reject bookings');
        expect(prisma.booking.updateMany).not.toHaveBeenCalled();
      });

      it('prevents attacker from rejecting bookings they do not own (listing)', async () => {
        (auth as jest.Mock).mockResolvedValue(userAttacker);
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBookingOwnedByAlice);

        const result = await updateBookingStatus('booking-abc', 'REJECTED');

        expect(result.error).toBe('Only the listing owner can accept or reject bookings');
        expect(prisma.booking.updateMany).not.toHaveBeenCalled();
      });

      it('prevents attacker from cancelling bookings they did not create', async () => {
        (auth as jest.Mock).mockResolvedValue(userAttacker);
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBookingOwnedByAlice);

        const result = await updateBookingStatus('booking-abc', 'CANCELLED');

        expect(result.error).toBe('Only the tenant can cancel a booking');
        expect(prisma.booking.updateMany).not.toHaveBeenCalled();
      });

      it('allows listing owner (Bob) to accept booking', async () => {
        (auth as jest.Mock).mockResolvedValue(userBob);
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBookingOwnedByAlice);
        (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([{ availableSlots: 2, totalSlots: 3, id: 'listing-xyz' }]),
            booking: {
              count: jest.fn().mockResolvedValue(0),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            listing: { update: jest.fn() },
          };
          return callback(tx);
        });

        const result = await updateBookingStatus('booking-abc', 'ACCEPTED');

        expect(result.error).toBeUndefined();
      });

      it('allows tenant (Alice) to cancel their own booking', async () => {
        (auth as jest.Mock).mockResolvedValue(userAlice);
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBookingOwnedByAlice);
        (prisma.booking.update as jest.Mock).mockResolvedValue({
          ...mockBookingOwnedByAlice,
          status: 'CANCELLED',
        });

        const result = await updateBookingStatus('booking-abc', 'CANCELLED');

        // Should proceed without the IDOR error
        expect(result.error).not.toBe('Only the tenant can cancel a booking');
      });

      it('returns 404 for non-existent booking (prevents enumeration)', async () => {
        (auth as jest.Mock).mockResolvedValue(userAttacker);
        (prisma.booking.findUnique as jest.Mock).mockResolvedValue(null);

        const result = await updateBookingStatus('nonexistent-booking', 'ACCEPTED');

        expect(result.error).toBe('Booking not found');
      });
    });

    describe('getMyBookings IDOR', () => {
      it('returns only bookings where user is tenant', async () => {
        (auth as jest.Mock).mockResolvedValue(userAlice);
        (prisma.booking.findMany as jest.Mock).mockResolvedValue([mockBookingOwnedByAlice]);

        await getMyBookings();

        // Verify the query filters by session user
        expect(prisma.booking.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              tenantId: 'alice-123',
            }),
          })
        );
      });
    });

  });

  describe('Message IDOR Protection', () => {
    const mockConversation = {
      id: 'conv-123',
      participants: [
        { id: 'alice-123', name: 'Alice' },
        { id: 'bob-456', name: 'Bob' },
      ],
      deletions: [],
      listing: { id: 'listing-xyz', title: 'Test Listing' },
    };

    const mockMessage = {
      id: 'msg-abc',
      conversationId: 'conv-123',
      senderId: 'alice-123',
      content: 'Hello Bob!',
      createdAt: new Date(),
      sender: { id: 'alice-123', name: 'Alice' },
    };

    describe('getMessages IDOR', () => {
      it('prevents attacker from reading messages in conversations they are not part of', async () => {
        (auth as jest.Mock).mockResolvedValue(userAttacker);
        (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(mockConversation);

        const result = await getMessages('conv-123') as GetMessagesErrorResult;

        expect(result.error).toBe('Unauthorized');
        expect(result.messages).toEqual([]);
        expect(prisma.message.findMany).not.toHaveBeenCalled();
      });

      it('allows participant (Alice) to read messages', async () => {
        (auth as jest.Mock).mockResolvedValue(userAlice);
        (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(mockConversation);
        (prisma.message.findMany as jest.Mock).mockResolvedValue([mockMessage]);
        (prisma.message.count as jest.Mock).mockResolvedValue(1);
        (prisma.message.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

        const result = await getMessages('conv-123');

        // On success, getMessages returns array directly (not wrapped in object)
        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(1);
      });

      it('returns empty for non-existent conversation (prevents enumeration)', async () => {
        (auth as jest.Mock).mockResolvedValue(userAttacker);
        (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(null);

        const result = await getMessages('nonexistent-conv') as GetMessagesErrorResult;

        expect(result.error).toBe('Unauthorized');
        expect(result.messages).toEqual([]);
      });
    });

    describe('sendMessage IDOR', () => {
      it('prevents attacker from sending messages to conversations they are not part of', async () => {
        (auth as jest.Mock).mockResolvedValue(userAttacker);
        (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(mockConversation);
        // Include emailVerified so we reach the participant check
        (prisma.user.findUnique as jest.Mock).mockResolvedValue({ emailVerified: new Date() });

        const result = await sendMessage('conv-123', 'Malicious message') as SendMessageErrorResult;

        expect(result.error).toBe('Unauthorized');
        expect(prisma.message.create).not.toHaveBeenCalled();
      });

      it('allows participant (Bob) to send messages', async () => {
        (auth as jest.Mock).mockResolvedValue(userBob);
        (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(mockConversation);
        // Include emailVerified for successful message sending
        (prisma.user.findUnique as jest.Mock).mockResolvedValue({ emailVerified: new Date() });
        (prisma.message.create as jest.Mock).mockResolvedValue({
          ...mockMessage,
          senderId: 'bob-456',
          content: 'Hi Alice!',
        });
        (prisma.conversation.update as jest.Mock).mockResolvedValue(mockConversation);
        (prisma.notification.create as jest.Mock).mockResolvedValue({});

        const result = await sendMessage('conv-123', 'Hi Alice!');

        // On success, sendMessage returns message object (not error object)
        expect('error' in result).toBe(false);
        expect(prisma.message.create).toHaveBeenCalled();
      });
    });

    describe('deleteMessage IDOR', () => {
      it('prevents attacker from deleting messages they did not send', async () => {
        (auth as jest.Mock).mockResolvedValue(userAttacker);
        (prisma.message.findUnique as jest.Mock).mockResolvedValue(mockMessage);

        const result = await deleteMessage('msg-abc');

        expect(result.error).toBe('You can only delete your own messages');
        expect(prisma.message.update).not.toHaveBeenCalled();
      });

      it('allows sender (Alice) to delete their own message', async () => {
        (auth as jest.Mock).mockResolvedValue(userAlice);
        (prisma.message.findUnique as jest.Mock).mockResolvedValue(mockMessage);
        (prisma.message.update as jest.Mock).mockResolvedValue({
          ...mockMessage,
          isDeleted: true,
          deletedBy: 'alice-123',
        });

        const result = await deleteMessage('msg-abc');

        expect(result.success).toBe(true);
        expect(prisma.message.update).toHaveBeenCalled();
      });

      it('returns error for non-existent message (prevents enumeration)', async () => {
        (auth as jest.Mock).mockResolvedValue(userAttacker);
        (prisma.message.findUnique as jest.Mock).mockResolvedValue(null);

        const result = await deleteMessage('nonexistent-msg');

        expect(result.error).toBe('Message not found');
      });
    });
  });

  describe('Conversation IDOR Protection', () => {
    const mockConversation = {
      id: 'conv-123',
      participants: [
        { id: 'alice-123', name: 'Alice' },
        { id: 'bob-456', name: 'Bob' },
      ],
      messages: [],
      listing: { id: 'listing-xyz', title: 'Test Listing' },
    };

    describe('deleteConversation IDOR', () => {
      it('prevents attacker from deleting conversations they are not part of', async () => {
        (auth as jest.Mock).mockResolvedValue(userAttacker);
        (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(mockConversation);

        const result = await deleteConversation('conv-123');

        expect(result.error).toBe('You are not part of this conversation');
        expect(prisma.conversation.update).not.toHaveBeenCalled();
      });

      it('allows participant (Alice) to delete conversation', async () => {
        (auth as jest.Mock).mockResolvedValue(userAlice);
        (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
          ...mockConversation,
          deletedBy: null,
        });
        (prisma.conversationDeletion.upsert as jest.Mock).mockResolvedValue({
          id: 'deletion-1',
          conversationId: 'conv-123',
          userId: 'alice-123',
        });

        const result = await deleteConversation('conv-123');

        expect(result.success).toBe(true);
        expect(prisma.conversationDeletion.upsert).toHaveBeenCalled();
      });

      it('returns error for non-existent conversation (prevents enumeration)', async () => {
        (auth as jest.Mock).mockResolvedValue(userAttacker);
        (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(null);

        const result = await deleteConversation('nonexistent-conv');

        expect(result.error).toBe('Conversation not found');
      });
    });
  });

  describe('Authentication Edge Cases', () => {
    it('returns unauthorized when session is null', async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const bookingResult = await updateBookingStatus('any-booking', 'ACCEPTED');
      expect(bookingResult.error).toBe('Unauthorized');

      const messageResult: GetMessagesErrorResult = await getMessages('any-conv') as GetMessagesErrorResult;
      expect(messageResult.error).toBe('Unauthorized');
    });

    it('returns unauthorized when session.user is undefined', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: undefined });

      const bookingResult = await updateBookingStatus('any-booking', 'ACCEPTED');
      expect(bookingResult.error).toBe('Unauthorized');
    });

    it('returns unauthorized when session.user.id is undefined', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { email: 'test@example.com' } });

      const bookingResult = await updateBookingStatus('any-booking', 'ACCEPTED');
      expect(bookingResult.error).toBe('Unauthorized');
    });
  });

  describe('Resource ID Manipulation', () => {
    it('handles attempts to use SQL injection in resource IDs', async () => {
      (auth as jest.Mock).mockResolvedValue(userAttacker);
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue(null);

      // Prisma handles this safely, but test the flow
      const result = await updateBookingStatus("'; DROP TABLE bookings; --", 'ACCEPTED');

      expect(result.error).toBe('Booking not found');
      // The malicious ID is passed to Prisma which uses parameterized queries
      expect(prisma.booking.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "'; DROP TABLE bookings; --" },
        })
      );
    });

    it('handles UUID-like IDs that do not exist', async () => {
      (auth as jest.Mock).mockResolvedValue(userAttacker);
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(null);

      const result: GetMessagesErrorResult = await getMessages('00000000-0000-0000-0000-000000000000') as GetMessagesErrorResult;

      expect(result.error).toBe('Unauthorized');
      expect(result.messages).toEqual([]);
    });
  });
});
