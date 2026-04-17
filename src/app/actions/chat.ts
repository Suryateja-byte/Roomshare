"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkSuspension, checkEmailVerified } from "./suspension";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { z } from "zod";
import { createInternalNotification } from "@/lib/notifications";
import { sendNotificationEmailWithPreference } from "@/lib/email";
import { headers } from "next/headers";
import {
  checkRateLimit,
  getClientIPFromHeaders,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import {
  getAccessibleConversation,
  listConversationMessages,
  markConversationMessagesAsReadForUser,
  userCanAccessConversation,
} from "@/lib/messages";
import {
  hashIdForLog,
  recordConversationStartPath,
  type ConversationStartPath,
} from "@/lib/messaging/cfm-messaging-telemetry";

const sendMessageSchema = z.object({
  conversationId: z.string().trim().min(1).max(100),
  content: z.string().trim().min(1).max(2000),
});

export async function startConversation(listingId: string) {
  const session = await auth();
  if (!session?.user?.id)
    return { error: "Unauthorized", code: "SESSION_EXPIRED" };

  try {
    // Rate limiting
    const headersList = await headers();
    const ip = getClientIPFromHeaders(headersList);
    const rl = await checkRateLimit(
      `${ip}:${session.user.id}`,
      "startConversation",
      RATE_LIMITS.chatStartConversation
    );
    if (!rl.success) return { error: "Too many attempts. Please wait." };

    const suspension = await checkSuspension();
    if (suspension.suspended) {
      return { error: suspension.error || "Account suspended" };
    }

    const emailCheck = await checkEmailVerified();
    if (!emailCheck.verified) {
      return {
        error:
          emailCheck.error ||
          "Please verify your email to start a conversation",
      };
    }

    const userId = session.user.id;

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { ownerId: true },
    });

    if (!listing) return { error: "Listing not found" };
    if (listing.ownerId === userId)
      return { error: "Cannot chat with yourself" };

    // Check if either user has blocked the other
    const { checkBlockBeforeAction } = await import("./block");
    const blockCheck = await checkBlockBeforeAction(listing.ownerId);
    if (!blockCheck.allowed) {
      return { error: blockCheck.message };
    }

    const isSerializationFailure = (error: unknown): boolean => {
      if (!error || typeof error !== "object") return false;
      const err = error as { code?: string; message?: string };
      return (
        err.code === "P2034" ||
        err.code === "P40001" ||
        err.message?.includes("40001") === true
      );
    };

    // P0-1 FIX: Wrap findFirst+create in SERIALIZABLE transaction with advisory lock
    // to prevent duplicate conversations from concurrent requests (TOCTOU race).
    // One retry is enough: the winner commits, the retry acquires the same lock
    // and finds the conversation created by the winning transaction.
    let result:
      | { conversationId: string; path: ConversationStartPath }
      | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        result = await prisma.$transaction(
          async (tx) => {
            // Advisory lock keyed on listingId + sorted participant pair.
            // Same pair always acquires the same lock, serializing concurrent calls.
            const sortedIds = [userId, listing.ownerId].sort().join(":");
            const lockKey = `conv:${listingId}:${sortedIds}`;
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

            // Check existing conversation (exclude admin-deleted, include per-user deleted for resurrection)
            const existing = await tx.conversation.findFirst({
              where: {
                listingId,
                deletedAt: null,
                AND: [
                  { participants: { some: { id: userId } } },
                  { participants: { some: { id: listing.ownerId } } },
                ],
              },
            });

            if (existing) {
              // Resurrect: clear per-user deletion record if it exists.
              // `count` distinguishes the "existing" vs "resurrected" path
              // for the cfm.messaging.conv.start_path telemetry.
              const { count: clearedDeletions } =
                await tx.conversationDeletion.deleteMany({
                  where: { conversationId: existing.id, userId },
                });
              return {
                conversationId: existing.id,
                path: (clearedDeletions > 0
                  ? "resurrected"
                  : "existing") as ConversationStartPath,
              };
            }

            const conversation = await tx.conversation.create({
              data: {
                listingId,
                participants: {
                  connect: [{ id: userId }, { id: listing.ownerId }],
                },
              },
            });

            return {
              conversationId: conversation.id,
              path: "created" as ConversationStartPath,
            };
          },
          { isolationLevel: "Serializable" }
        );
        break;
      } catch (error) {
        if (attempt === 1 && isSerializationFailure(error)) {
          logger.sync.debug("startConversation serialization conflict, retrying", {
            action: "startConversation",
            listingIdHash: hashIdForLog(listingId),
            userIdHash: hashIdForLog(userId),
          });
          continue;
        }
        throw error;
      }
    }

    if (result) {
      // CFM-003: structured log + metric so the messaging precondition
      // DoD (docs/migration/cfm-messaging-precondition.md) is observable
      // in production. No raw PII — ids are HMAC-hashed.
      logger.sync.info("startConversation:resolved", {
        path: result.path,
        listingIdHash: hashIdForLog(listingId),
        userIdHash: hashIdForLog(userId),
      });
      recordConversationStartPath({
        path: result.path,
        listingId,
        userId,
      });
      return { conversationId: result.conversationId };
    }

    return { error: "Failed to start conversation" };
  } catch (error: unknown) {
    logger.sync.error("Failed to start conversation", {
      action: "startConversation",
      errorType:
        error instanceof Error ? error.constructor.name : "UnknownError",
    });
    return { error: "Failed to start conversation" };
  }
}

export async function sendMessage(conversationId: string, content: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", code: "SESSION_EXPIRED" };
  }

  try {
    // Rate limiting
    const headersList = await headers();
    const ip = getClientIPFromHeaders(headersList);
    const rl = await checkRateLimit(
      `${ip}:${session.user.id}`,
      "sendMessage",
      RATE_LIMITS.chatSendMessage
    );
    if (!rl.success) return { error: "Too many messages. Please wait." };

    const suspension = await checkSuspension();
    if (suspension.suspended) {
      return { error: suspension.error || "Account suspended" };
    }

    const parsed = sendMessageSchema.safeParse({ conversationId, content });
    if (!parsed.success) {
      return { error: "Invalid message payload" };
    }
    const { conversationId: safeConversationId, content: safeContent } =
      parsed.data;

    // Check if email is verified (soft enforcement - only block unverified users)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerified: true },
    });

    if (!user?.emailVerified) {
      return { error: "Please verify your email to send messages" };
    }

    // Get conversation with participants for notification
    const conversation = await prisma.conversation.findUnique({
      where: { id: safeConversationId },
      include: {
        participants: {
          select: { id: true, name: true },
        },
      },
    });

    if (!conversation || conversation.deletedAt) {
      return { error: "Conversation not found" };
    }

    // P1-17 FIX: Verify user is a participant in the conversation (IDOR protection)
    const isParticipant = conversation.participants.some(
      (p) => p.id === session.user.id
    );
    if (!isParticipant) {
      return { error: "Unauthorized" };
    }

    // Check for blocks between participants
    const { checkBlockBeforeAction } = await import("./block");
    const otherParticipant = conversation.participants.find(
      (p) => p.id !== session.user.id
    );
    if (otherParticipant) {
      const blockCheck = await checkBlockBeforeAction(otherParticipant.id);
      if (!blockCheck.allowed) {
        return { error: blockCheck.message };
      }
    }

    // Wrap dependent writes in a transaction to prevent partial failures
    const message = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          content: safeContent,
          conversationId: safeConversationId,
          senderId: session.user.id,
        },
      });
      await Promise.all([
        tx.conversation.update({
          where: { id: safeConversationId },
          data: { updatedAt: new Date() },
        }),
        // New message resurrects conversation for everyone
        tx.conversationDeletion.deleteMany({
          where: { conversationId: safeConversationId },
        }),
      ]);
      return msg;
    });

    // Use session.user.name (already available) instead of an extra DB query
    const senderName = session.user.name || "Someone";

    // Send notifications to other participants in parallel
    const otherParticipants = conversation.participants.filter(
      (p) => p.id !== session.user.id
    );

    // Fetch emails separately — keep PII out of the hot-path participant select
    const otherParticipantIds = otherParticipants.map((p) => p.id);
    const participantEmails = await prisma.user.findMany({
      where: { id: { in: otherParticipantIds } },
      select: { id: true, email: true },
    });
    const emailMap = new Map(participantEmails.map((p) => [p.id, p.email]));

    await Promise.all(
      otherParticipants.map(async (participant) => {
        // Create in-app notification
        await createInternalNotification({
          userId: participant.id,
          type: "NEW_MESSAGE",
          title: "New Message",
          message: `${senderName}: ${safeContent.substring(0, 50)}${safeContent.length > 50 ? "..." : ""}`,
          link: `/messages/${safeConversationId}`,
        });

        // Send email (respecting user preferences)
        const email = emailMap.get(participant.id);
        if (email) {
          await sendNotificationEmailWithPreference(
            "newMessage",
            participant.id,
            email,
            {
              recipientName: participant.name || "User",
              senderName,
              conversationId: safeConversationId,
            }
          );
        }
      })
    );

    return message;
  } catch (error: unknown) {
    logger.sync.error("Failed to send message", {
      action: "sendMessage",
      errorType:
        error instanceof Error ? error.constructor.name : "UnknownError",
    });
    return { error: "Failed to send message" };
  }
}

export async function getConversations() {
  const session = await auth();
  if (!session?.user?.id) return [];

  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: { id: session.user.id },
        },
        deletedAt: null, // Exclude admin-deleted conversations
        deletions: { none: { userId: session.user.id } }, // Exclude per-user deleted
      },
      include: {
        participants: {
          select: { id: true, name: true, image: true },
        },
        messages: {
          where: { deletedAt: null }, // Exclude soft-deleted messages
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        listing: {
          select: { title: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // P2-07 FIX: Get unread counts in single query using groupBy (2 queries instead of N+1)
    const conversationIds = conversations.map((c) => c.id);
    const unreadCounts =
      conversationIds.length > 0
        ? await prisma.message.groupBy({
            by: ["conversationId"],
            where: {
              conversationId: { in: conversationIds },
              senderId: { not: session.user.id },
              read: false,
              deletedAt: null,
            },
            _count: true,
          })
        : [];

    // Create lookup map for O(1) access
    const unreadMap = new Map(
      unreadCounts.map((c) => [c.conversationId, c._count])
    );

    // Map conversations with unread counts
    const conversationsWithUnread = conversations.map((conv) => ({
      ...conv,
      unreadCount: unreadMap.get(conv.id) || 0,
    }));

    return conversationsWithUnread;
  } catch (error: unknown) {
    logger.sync.error("Failed to get conversations", {
      action: "getConversations",
      errorType:
        error instanceof Error ? error.constructor.name : "UnknownError",
    });
    return [];
  }
}

export async function getMessages(conversationId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", code: "SESSION_EXPIRED", messages: [] };
  }

  try {
    const userId = session.user.id;

    // Verify participant and check both admin-delete and per-user delete
    const conversation = await getAccessibleConversation(
      conversationId,
      userId
    );

    if (!userCanAccessConversation(conversation, userId)) {
      return { error: "Unauthorized", messages: [] };
    }

    return await listConversationMessages(conversationId);
  } catch (error: unknown) {
    logger.sync.error("Failed to get messages", {
      action: "getMessages",
      errorType:
        error instanceof Error ? error.constructor.name : "UnknownError",
    });
    return { error: "Failed to load messages", messages: [] };
  }
}

export async function getUnreadMessageCount() {
  const session = await auth();
  if (!session?.user?.id) return 0;

  try {
    const unreadCount = await prisma.message.count({
      where: {
        conversation: {
          participants: {
            some: { id: session.user.id },
          },
          deletedAt: null, // Exclude admin-deleted conversations
          deletions: { none: { userId: session.user.id } }, // Exclude per-user deleted
        },
        senderId: { not: session.user.id },
        read: false,
        deletedAt: null, // Exclude soft-deleted messages
      },
    });

    return unreadCount;
  } catch (error: unknown) {
    logger.sync.error("Failed to get unread message count", {
      action: "getUnreadMessageCount",
      errorType:
        error instanceof Error ? error.constructor.name : "UnknownError",
    });
    return 0;
  }
}

/**
 * Mark all unread messages across all conversations as read
 */
export async function markAllMessagesAsRead() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", code: "SESSION_EXPIRED" };
  }

  try {
    // Get all conversations the user is part of (excluding deleted)
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: { id: session.user.id },
        },
        deletedAt: null, // Exclude admin-deleted
        deletions: { none: { userId: session.user.id } }, // Exclude per-user deleted
      },
      select: { id: true },
    });

    const conversationIds = conversations.map((c) => c.id);

    // Mark all unread messages in these conversations as read
    const result = await prisma.message.updateMany({
      where: {
        conversationId: { in: conversationIds },
        senderId: { not: session.user.id },
        read: false,
        deletedAt: null,
      },
      data: { read: true },
    });

    await logger.debug("All messages marked as read", {
      action: "markAllMessagesAsRead",
      markedCount: result.count,
    });

    return { success: true, count: result.count };
  } catch (error: unknown) {
    logger.sync.error("Failed to mark all messages as read", {
      action: "markAllMessagesAsRead",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to mark all messages as read" };
  }
}

/**
 * Soft delete a message - only the sender can delete their own messages
 */
export async function deleteMessage(
  messageId: string
): Promise<{ success: boolean; error?: string; code?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized", code: "SESSION_EXPIRED" };
  }

  try {
    // Verify the user is the sender of the message
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, deletedAt: true },
    });

    if (!message) {
      return { success: false, error: "Message not found" };
    }

    if (message.deletedAt) {
      return { success: false, error: "Message already deleted" };
    }

    if (message.senderId !== session.user.id) {
      return { success: false, error: "You can only delete your own messages" };
    }

    // Soft delete the message
    await prisma.message.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        deletedBy: session.user.id,
      },
    });

    return { success: true };
  } catch (error: unknown) {
    logger.sync.error("Failed to delete message", {
      action: "deleteMessage",
      error: sanitizeErrorMessage(error),
    });
    return { success: false, error: "Failed to delete message" };
  }
}

/**
 * Per-user soft delete a conversation - hides from this user's view only.
 * Other participants can still see it. Sending a new message resurrects it.
 */
export async function deleteConversation(
  conversationId: string
): Promise<{ success: boolean; error?: string; code?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized", code: "SESSION_EXPIRED" };
  }

  try {
    // Verify user is a participant
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { select: { id: true } },
      },
    });

    if (!conversation) {
      return { success: false, error: "Conversation not found" };
    }

    if (conversation.deletedAt) {
      return { success: false, error: "Conversation not found" };
    }

    const isParticipant = conversation.participants.some(
      (p) => p.id === session.user.id
    );
    if (!isParticipant) {
      return { success: false, error: "You are not part of this conversation" };
    }

    // Per-user soft delete: upsert deletion record for THIS user only
    await prisma.conversationDeletion.upsert({
      where: {
        conversationId_userId: {
          conversationId,
          userId: session.user.id,
        },
      },
      update: {
        deletedAt: new Date(),
      },
      create: {
        conversationId,
        userId: session.user.id,
      },
    });

    return { success: true };
  } catch (error: unknown) {
    logger.sync.error("Failed to delete conversation", {
      action: "deleteConversation",
      error: sanitizeErrorMessage(error),
    });
    return { success: false, error: "Failed to delete conversation" };
  }
}

/**
 * Set typing status for a user in a conversation
 */
export async function setTypingStatus(
  conversationId: string,
  isTyping: boolean
) {
  const session = await auth();
  if (!session?.user?.id)
    return { error: "Unauthorized", code: "SESSION_EXPIRED" };

  try {
    // Verify user is a participant in a non-deleted conversation (admin + per-user)
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { select: { id: true } },
        deletions: { where: { userId: session.user.id }, select: { id: true } },
      },
    });
    if (
      !conversation ||
      conversation.deletedAt ||
      conversation.deletions.length > 0 ||
      !conversation.participants.some((p) => p.id === session.user.id)
    ) {
      return { error: "Unauthorized" };
    }

    await prisma.typingStatus.upsert({
      where: {
        userId_conversationId: {
          userId: session.user.id,
          conversationId,
        },
      },
      update: {
        isTyping,
        updatedAt: new Date(),
      },
      create: {
        userId: session.user.id,
        conversationId,
        isTyping,
      },
    });

    return { success: true };
  } catch (error: unknown) {
    logger.sync.error("Failed to set typing status", {
      action: "setTypingStatus",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to set typing status" };
  }
}

/**
 * Get typing status for other users in a conversation
 */
export async function getTypingStatus(conversationId: string) {
  const session = await auth();
  if (!session?.user?.id) return { typingUsers: [] };

  try {
    // Verify user is a participant in a non-deleted conversation (admin + per-user)
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { select: { id: true } },
        deletions: { where: { userId: session.user.id }, select: { id: true } },
      },
    });
    if (
      !conversation ||
      conversation.deletedAt ||
      conversation.deletions.length > 0 ||
      !conversation.participants.some((p) => p.id === session.user.id)
    ) {
      return { typingUsers: [] };
    }

    // Get typing statuses from other users, updated within last 5 seconds
    const fiveSecondsAgo = new Date(Date.now() - 5000);

    const typingStatuses = await prisma.typingStatus.findMany({
      where: {
        conversationId,
        userId: { not: session.user.id },
        isTyping: true,
        updatedAt: { gte: fiveSecondsAgo },
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    return {
      typingUsers: typingStatuses.map((ts) => ({
        id: ts.user.id,
        name: ts.user.name,
      })),
    };
  } catch (error: unknown) {
    logger.sync.error("Failed to get typing status", {
      action: "getTypingStatus",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { typingUsers: [] };
  }
}

/**
 * Get messages and typing status together for efficient polling
 */
export async function pollMessages(
  conversationId: string,
  lastMessageId?: string
) {
  const session = await auth();
  if (!session?.user?.id)
    return { messages: [], typingUsers: [], hasNewMessages: false };

  try {
    // Verify user is a participant in a non-deleted conversation (admin + per-user)
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { select: { id: true } },
        deletions: { where: { userId: session.user.id }, select: { id: true } },
      },
    });
    if (
      !conversation ||
      conversation.deletedAt ||
      conversation.deletions.length > 0 ||
      !conversation.participants.some((p) => p.id === session.user.id)
    ) {
      return { messages: [], typingUsers: [], hasNewMessages: false };
    }

    // Inline typing status query — avoids redundant membership re-verification in getTypingStatus
    const fiveSecondsAgo = new Date(Date.now() - 5000);
    const typingStatuses = await prisma.typingStatus.findMany({
      where: {
        conversationId,
        userId: { not: session.user.id },
        isTyping: true,
        updatedAt: { gte: fiveSecondsAgo },
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });
    const typingUsers = typingStatuses.map((ts) => ({
      id: ts.user.id,
      name: ts.user.name,
    }));

    const messages = await listConversationMessages(conversationId, {
      afterMessageId: lastMessageId,
    });

    // BIZ-08: Do NOT mark messages as read during background polling.
    // Marking as read is handled by getMessages (initial load) or
    // markConversationMessagesAsRead (explicit user action).

    return {
      messages,
      typingUsers,
      hasNewMessages: messages.length > 0,
    };
  } catch (error: unknown) {
    logger.sync.error("Failed to poll messages", {
      action: "pollMessages",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { messages: [], typingUsers: [], hasNewMessages: false };
  }
}

/**
 * BIZ-08: Explicitly mark messages in a conversation as read.
 * Called when the user actively views the conversation, NOT during background polling.
 */
export async function markConversationMessagesAsRead(conversationId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", code: "SESSION_EXPIRED" };
  }

  try {
    const userId = session.user.id;

    // Verify user is a participant in a non-deleted conversation
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { select: { id: true } },
        deletions: { where: { userId }, select: { id: true } },
      },
    });

    if (
      !conversation ||
      conversation.deletedAt ||
      conversation.deletions.length > 0 ||
      !conversation.participants.some((p) => p.id === userId)
    ) {
      return { error: "Unauthorized" };
    }

    const result = await markConversationMessagesAsReadForUser(
      conversationId,
      userId
    );

    return { success: true, count: result.count };
  } catch (error: unknown) {
    logger.sync.error("Failed to mark conversation messages as read", {
      action: "markConversationMessagesAsRead",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to mark messages as read" };
  }
}
