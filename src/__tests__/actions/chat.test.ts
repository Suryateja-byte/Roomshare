/**
 * Tests for chat server actions
 */

// Mock next/cache to prevent TextEncoder errors
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
  unstable_cache: jest.fn((fn) => fn),
}));

// Mock dependencies before imports
jest.mock("@/lib/prisma", () => {
  const mockPrisma: Record<string, any> = {
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
    conversationDeletion: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    message: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    typingStatus: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    physicalUnit: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
  // $transaction passes mockPrisma as tx so existing assertions still work
  mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
  return { prisma: mockPrisma };
});

jest.mock("@/app/actions/block", () => ({
  checkBlockBeforeAction: jest.fn().mockResolvedValue({ allowed: true }),
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue({
    get: jest.fn(),
  }),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ success: true }),
  getClientIPFromHeaders: jest.fn().mockReturnValue("127.0.0.1"),
  RATE_LIMITS: {
    chatStartConversation: {},
    chatSendMessage: {},
  },
}));

jest.mock("@/lib/notifications", () => ({
  createInternalNotification: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmail: jest.fn().mockResolvedValue({ success: true }),
  sendNotificationEmailWithPreference: jest
    .fn()
    .mockResolvedValue({ success: true }),
}));

const mockConsumeMessageStartEntitlement = jest.fn();
const mockAttachConsumptionToConversation = jest.fn();
jest.mock("@/lib/payments/contact-paywall", () => ({
  consumeMessageStartEntitlement: (...args: unknown[]) =>
    mockConsumeMessageStartEntitlement(...args),
  attachConsumptionToConversation: (...args: unknown[]) =>
    mockAttachConsumptionToConversation(...args),
}));

import {
  startConversation,
  sendMessage,
  getConversations,
  getMessages,
  getUnreadMessageCount,
  pollMessages,
  markConversationMessagesAsRead,
} from "@/app/actions/chat";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkBlockBeforeAction } from "@/app/actions/block";

describe("Chat Actions", () => {
  const mockSession = {
    user: {
      id: "user-123",
      name: "Test User",
      email: "test@example.com",
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
  });

  describe("startConversation", () => {
    const mockListing = {
      id: "listing-123",
      ownerId: "owner-456",
      physicalUnitId: "unit-123",
      status: "ACTIVE" as const,
      statusReason: null,
      needsMigrationReview: false,
      availabilitySource: "LEGACY_BOOKING" as const,
      availableSlots: 1,
      totalSlots: 1,
      openSlots: 1,
      moveInDate: new Date("2026-05-01T00:00:00.000Z"),
      availableUntil: null,
      minStayMonths: 1,
      lastConfirmedAt: null,
    };

    beforeEach(() => {
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);
      // Mock user.findUnique for email verification check
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: "user-123",
        emailVerified: new Date(),
        isSuspended: false,
      });
      mockConsumeMessageStartEntitlement.mockResolvedValue({
        ok: true,
        summary: {
          enabled: false,
          mode: "OPEN",
          freeContactsRemaining: 2,
          packContactsRemaining: 0,
          activePassExpiresAt: null,
          requiresPurchase: false,
          offers: [],
        },
        unitId: "unit-123",
        unitIdentityEpoch: 1,
        source: "ENFORCEMENT_DISABLED",
        consumptionId: null,
      });
      mockAttachConsumptionToConversation.mockResolvedValue(undefined);
      (prisma.conversationDeletion.deleteMany as jest.Mock).mockResolvedValue({
        count: 0,
      });
      (prisma.physicalUnit.findUnique as jest.Mock).mockResolvedValue({
        unitIdentityEpoch: 1,
        supersededByUnitId: null,
      });
    });

    it("returns error when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await startConversation("listing-123");

      expect(result).toEqual({
        error: "Unauthorized",
        code: "SESSION_EXPIRED",
      });
    });

    it("returns error when listing not found", async () => {
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await startConversation("invalid-listing");

      expect(result).toEqual({
        error: "Listing not found",
        code: "LISTING_NOT_FOUND",
      });
    });

    it.each(["PAUSED", "RENTED"] as const)(
      "blocks new conversation when listing is %s with LISTING_UNAVAILABLE",
      async (status) => {
        (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
          ...mockListing,
          status,
        });

        const result = await startConversation("listing-123");

        expect(result).toEqual({
          error: "This listing is not available for new messages right now.",
          code: "LISTING_UNAVAILABLE",
        });
        expect(prisma.conversation.create).not.toHaveBeenCalled();
      },
    );

    it("blocks new conversation with MIGRATION_REVIEW", async () => {
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
        ...mockListing,
        availabilitySource: "HOST_MANAGED",
        openSlots: 1,
        availableUntil: new Date("2026-12-01T00:00:00.000Z"),
        lastConfirmedAt: new Date("2026-04-10T12:00:00.000Z"),
        statusReason: "MIGRATION_REVIEW",
        needsMigrationReview: true,
      });

      const result = await startConversation("listing-123");

      expect(result).toEqual({
        error: "This listing is temporarily unavailable.",
        code: "MIGRATION_REVIEW",
      });
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it("returns error when trying to chat with self", async () => {
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
        ...mockListing,
        ownerId: "user-123", // Same as session user
      });

      const result = await startConversation("listing-123");

      expect(result).toEqual({ error: "Cannot chat with yourself" });
    });

    it("returns existing conversation if one exists", async () => {
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: "existing-conv-123",
      });

      const result = await startConversation("listing-123");

      expect(result).toEqual({ conversationId: "existing-conv-123" });
      expect(prisma.conversationDeletion.deleteMany).toHaveBeenCalledWith({
        where: {
          conversationId: "existing-conv-123",
          userId: "user-123",
        },
      });
      expect(mockConsumeMessageStartEntitlement).not.toHaveBeenCalled();
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it("creates new conversation if none exists", async () => {
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.conversation.create as jest.Mock).mockResolvedValue({
        id: "new-conv-123",
      });

      const result = await startConversation("listing-123");

      expect(result).toEqual({ conversationId: "new-conv-123" });
      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: {
          listingId: "listing-123",
          participants: {
            connect: [{ id: "user-123" }, { id: "owner-456" }],
          },
        },
      });
      expect(mockConsumeMessageStartEntitlement).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          userId: "user-123",
          listingId: "listing-123",
          physicalUnitId: "unit-123",
        })
      );
      expect(
        (prisma.$executeRaw as jest.Mock).mock.calls.some((call) =>
          String(call[0]).includes("contact_attempts")
        )
      ).toBe(true);
    });

    it("returns a neutral contact response when the host has blocked the viewer", async () => {
      (checkBlockBeforeAction as jest.Mock).mockResolvedValueOnce({
        allowed: false,
        message: "This user has blocked you",
      });

      const result = await startConversation("listing-123");

      expect(result).toEqual({
        error: "This host is not accepting contact right now.",
        code: "HOST_NOT_ACCEPTING_CONTACT",
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(
        (prisma.$executeRaw as jest.Mock).mock.calls.some((call) =>
          String(call[0]).includes("contact_attempts")
        )
      ).toBe(false);
    });

    it("rejects a stale observed unit epoch before consuming contact entitlement", async () => {
      (prisma.physicalUnit.findUnique as jest.Mock).mockResolvedValueOnce({
        unitIdentityEpoch: 2,
        supersededByUnitId: null,
      });

      const result = await startConversation({
        listingId: "listing-123",
        clientIdempotencyKey: "idem-stale",
        unitIdentityEpochObserved: 1,
      });

      expect(result).toEqual({
        error: "Please refresh this listing before contacting the host.",
        code: "UNIT_EPOCH_STALE",
      });
      expect(mockConsumeMessageStartEntitlement).not.toHaveBeenCalled();
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it("blocks new conversation when paywall enforcement requires purchase", async () => {
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue(null);
      mockConsumeMessageStartEntitlement.mockResolvedValue({
        ok: false,
        summary: {
          enabled: true,
          mode: "PAYWALL_REQUIRED",
          freeContactsRemaining: 0,
          packContactsRemaining: 0,
          activePassExpiresAt: null,
          requiresPurchase: true,
          offers: [],
        },
        unitId: "unit-123",
        unitIdentityEpoch: 1,
        code: "PAYWALL_REQUIRED",
        message: "Unlock contact to message this host.",
      });

      const result = await startConversation("listing-123");

      expect(result).toEqual({
        error: "Unlock contact to message this host.",
        code: "PAYWALL_REQUIRED",
      });
      expect(prisma.conversation.create).not.toHaveBeenCalled();
      expect(mockAttachConsumptionToConversation).not.toHaveBeenCalled();
    });

    it("returns error when rate limited (A5.1)", async () => {
      (checkRateLimit as jest.Mock).mockResolvedValueOnce({
        success: false,
        remaining: 0,
      });

      const result = await startConversation("listing-123");

      expect(result).toEqual({ error: "Too many attempts. Please wait." });
      expect(prisma.listing.findUnique).not.toHaveBeenCalled();
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it("retries once on serialization failure and preserves serializable isolation", async () => {
      (prisma.$transaction as jest.Mock)
        .mockRejectedValueOnce({ code: "P2034", message: "serialization" })
        .mockImplementationOnce((fn: any) => fn(prisma));
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.conversation.create as jest.Mock).mockResolvedValue({
        id: "new-conv-123",
      });

      const result = await startConversation("listing-123");

      expect(result).toEqual({ conversationId: "new-conv-123" });
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      expect(prisma.$transaction).toHaveBeenNthCalledWith(
        1,
        expect.any(Function),
        { isolationLevel: "Serializable" }
      );
      expect(prisma.$transaction).toHaveBeenNthCalledWith(
        2,
        expect.any(Function),
        { isolationLevel: "Serializable" }
      );
      expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("sendMessage", () => {
    const mockConversation = {
      id: "conv-123",
      participants: [
        { id: "user-123", name: "Test User", email: "test@example.com" },
        { id: "other-456", name: "Other User", email: "other@example.com" },
      ],
      listing: {
        status: "ACTIVE" as const,
        statusReason: null,
        needsMigrationReview: false,
        availabilitySource: "LEGACY_BOOKING" as const,
        availableSlots: 1,
        totalSlots: 1,
        openSlots: 1,
        moveInDate: new Date("2026-05-01T00:00:00.000Z"),
        availableUntil: null,
        minStayMonths: 1,
        lastConfirmedAt: null,
      },
    };

    const mockMessage = {
      id: "message-123",
      content: "Hello!",
      conversationId: "conv-123",
      senderId: "user-123",
    };

    beforeEach(() => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(
        mockConversation
      );
      (prisma.message.create as jest.Mock).mockResolvedValue(mockMessage);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        name: "Test User",
        emailVerified: new Date(),
      });
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: "other-456", email: "other@example.com" },
      ]);
      (prisma.conversationDeletion.deleteMany as jest.Mock).mockResolvedValue({
        count: 0,
      });
    });

    it("returns error when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await sendMessage("conv-123", "Hello!");

      expect(result).toEqual({
        error: "Unauthorized",
        code: "SESSION_EXPIRED",
      });
    });

    it("returns error when conversation not found", async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await sendMessage("invalid-conv", "Hello!");

      expect(result).toEqual({ error: "Conversation not found" });
    });

    it("creates message successfully", async () => {
      const result = await sendMessage("conv-123", "Hello!");

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          content: "Hello!",
          conversationId: "conv-123",
          senderId: "user-123",
        },
      });
      expect(result).toEqual(mockMessage);
    });

    it("updates conversation updatedAt", async () => {
      await sendMessage("conv-123", "Hello!");

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: "conv-123" },
        data: { updatedAt: expect.any(Date) },
      });
    });

    it.each(["PAUSED", "RENTED"] as const)(
      "blocks message-send when listing is %s with LISTING_UNAVAILABLE",
      async (status) => {
        (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
          ...mockConversation,
          listing: { status },
        });

        const result = await sendMessage("conv-123", "Hello!");

        expect(result).toEqual({
          error: "This listing is not available for new messages right now.",
          code: "LISTING_UNAVAILABLE",
        });
        expect(prisma.message.create).not.toHaveBeenCalled();
      },
    );

    it("blocks outbound messages with MODERATION_LOCKED", async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        ...mockConversation,
        listing: {
          ...mockConversation.listing,
          status: "PAUSED",
          availabilitySource: "HOST_MANAGED",
          openSlots: 1,
          availableUntil: new Date("2026-12-01T00:00:00.000Z"),
          lastConfirmedAt: new Date("2026-04-10T12:00:00.000Z"),
          statusReason: "ADMIN_PAUSED",
        },
      });

      const result = await sendMessage("conv-123", "Hello!");

      expect(result).toEqual({
        error:
          "This listing is temporarily unavailable while it is under review.",
        code: "MODERATION_LOCKED",
      });
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe("getConversations", () => {
    it("returns empty array when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await getConversations();

      expect(result).toEqual([]);
    });

    it("getConversations returns all conversations without explicit limit (C1.5)", async () => {
      (prisma.conversation.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.message.groupBy as jest.Mock).mockResolvedValue([]);

      await getConversations();

      // Verify findMany was called without a `take` parameter — no pagination on conversation list
      const findManyArgs = (prisma.conversation.findMany as jest.Mock).mock
        .calls[0][0];
      expect(findManyArgs.take).toBeUndefined();
    });

    it("returns user conversations with unread count", async () => {
      const mockConversations = [
        {
          id: "conv-1",
          participants: [{ id: "user-123" }, { id: "other-1" }],
          messages: [{ content: "Hello" }],
          listing: { title: "Listing 1" },
        },
        {
          id: "conv-2",
          participants: [{ id: "user-123" }, { id: "other-2" }],
          messages: [{ content: "Hi" }],
          listing: { title: "Listing 2" },
        },
      ];
      (prisma.conversation.findMany as jest.Mock).mockResolvedValue(
        mockConversations
      );
      // P2-07: Now using groupBy instead of count for N+1 fix
      (prisma.message.groupBy as jest.Mock).mockResolvedValue([
        { conversationId: "conv-1", _count: 2 },
        { conversationId: "conv-2", _count: 0 },
      ]);

      const result = await getConversations();

      expect(result).toEqual([
        { ...mockConversations[0], unreadCount: 2 },
        { ...mockConversations[1], unreadCount: 0 },
      ]);
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            participants: {
              some: { id: "user-123" },
            },
            deletedAt: null,
            deletions: { none: { userId: "user-123" } },
          },
          orderBy: { updatedAt: "desc" },
        })
      );
    });
  });

  describe("getMessages", () => {
    const mockConversation = {
      id: "conv-123",
      participants: [{ id: "user-123" }, { id: "other-456" }],
      deletions: [],
    };

    const mockMessages = [
      {
        id: "msg-1",
        content: "Hello",
        sender: { id: "user-123", name: "Test" },
      },
      {
        id: "msg-2",
        content: "Hi there",
        sender: { id: "other-456", name: "Other" },
      },
    ];

    beforeEach(() => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(
        mockConversation
      );
      (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages);
      (prisma.message.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    });

    it("returns error when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await getMessages("conv-123");

      expect(result).toEqual({
        error: "Unauthorized",
        code: "SESSION_EXPIRED",
        messages: [],
      });
    });

    it("returns error when user is not participant", async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: "conv-123",
        participants: [{ id: "other-1" }, { id: "other-2" }], // user-123 not included
        deletions: [],
      });

      const result = await getMessages("conv-123");

      expect(result).toEqual({ error: "Unauthorized", messages: [] });
    });

    it("returns messages for valid participant", async () => {
      const result = await getMessages("conv-123");

      expect(result).toEqual(mockMessages);
    });

    it("does not mark unread messages as read during fetch", async () => {
      await getMessages("conv-123");

      expect(prisma.message.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("getUnreadMessageCount", () => {
    it("returns 0 when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await getUnreadMessageCount();

      expect(result).toBe(0);
    });

    it("returns count of unread messages", async () => {
      (prisma.message.count as jest.Mock).mockResolvedValue(3);

      const result = await getUnreadMessageCount();

      expect(result).toBe(3);
    });

    it("queries for correct conditions", async () => {
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      await getUnreadMessageCount();

      expect(prisma.message.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            conversation: {
              participants: {
                some: { id: "user-123" },
              },
              deletedAt: null,
              deletions: { none: { userId: "user-123" } },
            },
            senderId: { not: "user-123" },
            read: false,
            deletedAt: null,
          },
        })
      );
    });
  });

  describe("pollMessages (BIZ-08)", () => {
    const mockConversation = {
      id: "conv-123",
      deletedAt: null,
      participants: [{ id: "user-123" }, { id: "other-456" }],
      deletions: [],
    };

    beforeEach(() => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(
        mockConversation
      );
      (prisma.typingStatus.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
    });

    it("does NOT mark messages as read during polling", async () => {
      const newMessages = [
        {
          id: "msg-new",
          content: "Hello",
          sender: { id: "other-456", name: "Other" },
        },
      ];
      (prisma.message.findMany as jest.Mock).mockResolvedValue(newMessages);

      await pollMessages("conv-123");

      // BIZ-08: pollMessages should NOT call updateMany to mark as read
      expect(prisma.message.updateMany).not.toHaveBeenCalled();
    });

    it("returns new messages without side effects", async () => {
      const newMessages = [
        {
          id: "msg-1",
          content: "Hi",
          sender: { id: "other-456", name: "Other" },
        },
      ];
      (prisma.message.findMany as jest.Mock).mockResolvedValue(newMessages);

      const result = await pollMessages("conv-123");

      expect(result.messages).toEqual(newMessages);
      expect(result.hasNewMessages).toBe(true);
    });
  });

  describe("markConversationMessagesAsRead (BIZ-08)", () => {
    const mockConversation = {
      id: "conv-123",
      deletedAt: null,
      participants: [{ id: "user-123" }, { id: "other-456" }],
      deletions: [],
    };

    beforeEach(() => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(
        mockConversation
      );
      (prisma.message.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
    });

    it("returns error when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const result = await markConversationMessagesAsRead("conv-123");

      expect(result).toEqual({
        error: "Unauthorized",
        code: "SESSION_EXPIRED",
      });
    });

    it("returns error when user is not a participant", async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        ...mockConversation,
        participants: [{ id: "other-1" }, { id: "other-2" }],
      });

      const result = await markConversationMessagesAsRead("conv-123");

      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("marks unread messages as read for participant", async () => {
      const result = await markConversationMessagesAsRead("conv-123");

      expect(result).toEqual({ success: true, count: 2 });
      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          conversationId: "conv-123",
          senderId: { not: "user-123" },
          read: false,
        },
        data: { read: true },
      });
    });

    it("returns error on failure (D3.2)", async () => {
      (prisma.message.updateMany as jest.Mock).mockRejectedValue(
        new Error("DB timeout")
      );

      const result = await markConversationMessagesAsRead("conv-123");

      expect(result).toEqual({ error: "Failed to mark messages as read" });
    });
  });
});
