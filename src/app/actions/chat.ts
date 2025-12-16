'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { checkSuspension, checkEmailVerified } from './suspension';
import { logger } from '@/lib/logger';

export async function startConversation(listingId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized', code: 'SESSION_EXPIRED' };

    const suspension = await checkSuspension();
    if (suspension.suspended) {
        return { error: suspension.error || 'Account suspended' };
    }

    const emailCheck = await checkEmailVerified();
    if (!emailCheck.verified) {
        return { error: emailCheck.error || 'Please verify your email to start a conversation' };
    }

    const userId = session.user.id;

    const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        select: { ownerId: true },
    });

    if (!listing) return { error: 'Listing not found' };
    if (listing.ownerId === userId) return { error: 'Cannot chat with yourself' };

    // Check if either user has blocked the other
    const { checkBlockBeforeAction } = await import('./block');
    const blockCheck = await checkBlockBeforeAction(listing.ownerId);
    if (!blockCheck.allowed) {
        return { error: blockCheck.message };
    }

    // Check existing conversation
    const existing = await prisma.conversation.findFirst({
        where: {
            listingId,
            AND: [
                { participants: { some: { id: userId } } },
                { participants: { some: { id: listing.ownerId } } },
            ],
        },
    });

    if (existing) return { conversationId: existing.id };

    const conversation = await prisma.conversation.create({
        data: {
            listingId,
            participants: {
                connect: [{ id: userId }, { id: listing.ownerId }],
            },
        },
    });

    return { conversationId: conversation.id };
}

export async function sendMessage(conversationId: string, content: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized', code: 'SESSION_EXPIRED' };
    }

    const suspension = await checkSuspension();
    if (suspension.suspended) {
        return { error: suspension.error || 'Account suspended' };
    }

    // Check if email is verified (soft enforcement - only block unverified users)
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { emailVerified: true }
    });

    if (!user?.emailVerified) {
        return { error: 'Please verify your email to send messages' };
    }

    // Get conversation with participants for notification
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
            participants: {
                select: { id: true, name: true, email: true }
            }
        }
    });

    if (!conversation) {
        return { error: 'Conversation not found' };
    }

    // Check for blocks between participants
    const { checkBlockBeforeAction } = await import('./block');
    const otherParticipant = conversation.participants.find(p => p.id !== session.user.id);
    if (otherParticipant) {
        const blockCheck = await checkBlockBeforeAction(otherParticipant.id);
        if (!blockCheck.allowed) {
            return { error: blockCheck.message };
        }
    }

    const message = await prisma.message.create({
        data: {
            content,
            conversationId,
            senderId: session.user.id,
        },
    });

    await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
    });

    // Get sender info
    const sender = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true }
    });

    // Create notification for recipient(s) and send email
    const { createNotification } = await import('./notifications');
    const { sendNotificationEmailWithPreference } = await import('@/lib/email');

    for (const participant of conversation.participants) {
        if (participant.id !== session.user.id) {
            // Create in-app notification
            await createNotification({
                userId: participant.id,
                type: 'NEW_MESSAGE',
                title: 'New Message',
                message: `${sender?.name || 'Someone'}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
                link: `/messages/${conversationId}`
            });

            // Send email (respecting user preferences)
            if (participant.email) {
                await sendNotificationEmailWithPreference('newMessage', participant.id, participant.email, {
                    recipientName: participant.name || 'User',
                    senderName: sender?.name || 'Someone',
                    messagePreview: content,
                    conversationId
                });
            }
        }
    }

    return message;
}

export async function getConversations() {
    const session = await auth();
    if (!session?.user?.id) return [];

    const conversations = await prisma.conversation.findMany({
        where: {
            participants: {
                some: { id: session.user.id },
            },
            deletedAt: null, // Exclude soft-deleted conversations
        },
        include: {
            participants: {
                select: { id: true, name: true, image: true },
            },
            messages: {
                where: { deletedAt: null }, // Exclude soft-deleted messages
                orderBy: { createdAt: 'desc' },
                take: 1,
            },
            listing: {
                select: { title: true },
            },
        },
        orderBy: { updatedAt: 'desc' },
    });

    // Get unread counts for each conversation
    const conversationsWithUnread = await Promise.all(
        conversations.map(async (conv) => {
            const unreadCount = await prisma.message.count({
                where: {
                    conversationId: conv.id,
                    senderId: { not: session.user.id },
                    read: false,
                    deletedAt: null,
                },
            });
            return {
                ...conv,
                unreadCount,
            };
        })
    );

    return conversationsWithUnread;
}

export async function getMessages(conversationId: string) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized', code: 'SESSION_EXPIRED', messages: [] };
    }

    const userId = session.user.id;

    // Verify participant
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { participants: { select: { id: true } } },
    });

    if (!conversation || !conversation.participants.some(p => p.id === userId)) {
        return { error: 'Unauthorized', messages: [] };
    }

    // Mark unread messages as read
    const updateResult = await prisma.message.updateMany({
        where: {
            conversationId,
            senderId: { not: userId },
            read: false,
        },
        data: { read: true },
    });

    await logger.debug('Messages marked as read', {
        action: 'getMessages',
        conversationId: conversationId.slice(0, 8) + '...',
        markedCount: updateResult.count,
    });

    return await prisma.message.findMany({
        where: {
            conversationId,
            deletedAt: null // Exclude soft-deleted messages
        },
        orderBy: { createdAt: 'asc' },
        include: {
            sender: {
                select: { id: true, name: true, image: true },
            },
        },
    });
}

export async function getUnreadMessageCount() {
    const session = await auth();
    if (!session?.user?.id) return 0;

    // Get detailed info for debugging
    const unreadMessages = await prisma.message.findMany({
        where: {
            conversation: {
                participants: {
                    some: { id: session.user.id },
                },
                deletedAt: null, // Exclude soft-deleted conversations
            },
            senderId: { not: session.user.id },
            read: false,
            deletedAt: null, // Exclude soft-deleted messages
        },
        include: {
            conversation: {
                select: {
                    id: true,
                },
            },
            sender: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });

    return unreadMessages.length;
}

/**
 * Mark all unread messages across all conversations as read
 */
export async function markAllMessagesAsRead() {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized', code: 'SESSION_EXPIRED' };
    }

    try {
        // Get all conversations the user is part of
        const conversations = await prisma.conversation.findMany({
            where: {
                participants: {
                    some: { id: session.user.id }
                },
                deletedAt: null
            },
            select: { id: true }
        });

        const conversationIds = conversations.map(c => c.id);

        // Mark all unread messages in these conversations as read
        const result = await prisma.message.updateMany({
            where: {
                conversationId: { in: conversationIds },
                senderId: { not: session.user.id },
                read: false,
                deletedAt: null
            },
            data: { read: true }
        });

        await logger.debug('All messages marked as read', {
            action: 'markAllMessagesAsRead',
            markedCount: result.count,
        });

        return { success: true, count: result.count };
    } catch (error: unknown) {
        logger.sync.error('Failed to mark all messages as read', {
            action: 'markAllMessagesAsRead',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to mark all messages as read' };
    }
}

/**
 * Soft delete a message - only the sender can delete their own messages
 */
export async function deleteMessage(messageId: string): Promise<{ success: boolean; error?: string; code?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Unauthorized', code: 'SESSION_EXPIRED' };
    }

    try {
        // Verify the user is the sender of the message
        const message = await prisma.message.findUnique({
            where: { id: messageId },
            select: { senderId: true, deletedAt: true }
        });

        if (!message) {
            return { success: false, error: 'Message not found' };
        }

        if (message.deletedAt) {
            return { success: false, error: 'Message already deleted' };
        }

        if (message.senderId !== session.user.id) {
            return { success: false, error: 'You can only delete your own messages' };
        }

        // Soft delete the message
        await prisma.message.update({
            where: { id: messageId },
            data: {
                deletedAt: new Date(),
                deletedBy: session.user.id
            }
        });

        return { success: true };
    } catch (error: unknown) {
        logger.sync.error('Failed to delete message', {
            action: 'deleteMessage',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { success: false, error: 'Failed to delete message' };
    }
}

/**
 * Soft delete a conversation - only participants can delete
 * This hides the conversation from the user's view but preserves data
 */
export async function deleteConversation(conversationId: string): Promise<{ success: boolean; error?: string; code?: string }> {
    const session = await auth();
    if (!session?.user?.id) {
        return { success: false, error: 'Unauthorized', code: 'SESSION_EXPIRED' };
    }

    try {
        // Verify user is a participant
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                participants: { select: { id: true } }
            }
        });

        if (!conversation) {
            return { success: false, error: 'Conversation not found' };
        }

        if (conversation.deletedAt) {
            return { success: false, error: 'Conversation already deleted' };
        }

        const isParticipant = conversation.participants.some(p => p.id === session.user.id);
        if (!isParticipant) {
            return { success: false, error: 'You are not part of this conversation' };
        }

        // Soft delete the conversation
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { deletedAt: new Date() }
        });

        return { success: true };
    } catch (error: unknown) {
        logger.sync.error('Failed to delete conversation', {
            action: 'deleteConversation',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { success: false, error: 'Failed to delete conversation' };
    }
}

/**
 * Set typing status for a user in a conversation
 */
export async function setTypingStatus(conversationId: string, isTyping: boolean) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized', code: 'SESSION_EXPIRED' };

    try {
        await prisma.typingStatus.upsert({
            where: {
                userId_conversationId: {
                    userId: session.user.id,
                    conversationId
                }
            },
            update: {
                isTyping,
                updatedAt: new Date()
            },
            create: {
                userId: session.user.id,
                conversationId,
                isTyping
            }
        });

        return { success: true };
    } catch (error: unknown) {
        logger.sync.error('Failed to set typing status', {
            action: 'setTypingStatus',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { error: 'Failed to set typing status' };
    }
}

/**
 * Get typing status for other users in a conversation
 */
export async function getTypingStatus(conversationId: string) {
    const session = await auth();
    if (!session?.user?.id) return { typingUsers: [] };

    try {
        // Get typing statuses from other users, updated within last 5 seconds
        const fiveSecondsAgo = new Date(Date.now() - 5000);

        const typingStatuses = await prisma.typingStatus.findMany({
            where: {
                conversationId,
                userId: { not: session.user.id },
                isTyping: true,
                updatedAt: { gte: fiveSecondsAgo }
            },
            include: {
                user: {
                    select: { id: true, name: true }
                }
            }
        });

        return {
            typingUsers: typingStatuses.map(ts => ({
                id: ts.user.id,
                name: ts.user.name
            }))
        };
    } catch (error: unknown) {
        logger.sync.error('Failed to get typing status', {
            action: 'getTypingStatus',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { typingUsers: [] };
    }
}

/**
 * Get messages and typing status together for efficient polling
 */
export async function pollMessages(conversationId: string, lastMessageId?: string) {
    const session = await auth();
    if (!session?.user?.id) return { messages: [], typingUsers: [], hasNewMessages: false };

    try {
        // Get typing status
        const { typingUsers } = await getTypingStatus(conversationId);

        // Get new messages since last check
        const messages = await prisma.message.findMany({
            where: {
                conversationId,
                deletedAt: null,
                ...(lastMessageId ? {
                    createdAt: {
                        gt: (await prisma.message.findUnique({
                            where: { id: lastMessageId },
                            select: { createdAt: true }
                        }))?.createdAt || new Date(0)
                    }
                } : {})
            },
            orderBy: { createdAt: 'asc' },
            include: {
                sender: {
                    select: { id: true, name: true, image: true }
                }
            }
        });

        // Mark messages from others as read
        if (messages.length > 0) {
            await prisma.message.updateMany({
                where: {
                    conversationId,
                    senderId: { not: session.user.id },
                    read: false
                },
                data: { read: true }
            });
        }

        return {
            messages,
            typingUsers,
            hasNewMessages: messages.length > 0
        };
    } catch (error: unknown) {
        logger.sync.error('Failed to poll messages', {
            action: 'pollMessages',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return { messages: [], typingUsers: [], hasNewMessages: false };
    }
}
