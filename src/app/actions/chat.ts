'use server';

import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function startConversation(listingId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };
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
    if (!session?.user?.id) throw new Error('Unauthorized');

    // Check if email is verified (soft enforcement - only block unverified users)
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { emailVerified: true }
    });

    if (!user?.emailVerified) {
        throw new Error('Please verify your email to send messages');
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

    if (!conversation) throw new Error('Conversation not found');

    // Check for blocks between participants
    const { checkBlockBeforeAction } = await import('./block');
    const otherParticipant = conversation.participants.find(p => p.id !== session.user.id);
    if (otherParticipant) {
        const blockCheck = await checkBlockBeforeAction(otherParticipant.id);
        if (!blockCheck.allowed) {
            throw new Error(blockCheck.message);
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
    const { sendNotificationEmail } = await import('@/lib/email');

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

            // Send email (with slight delay to batch)
            if (participant.email) {
                await sendNotificationEmail('newMessage', participant.email, {
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

    return await prisma.conversation.findMany({
        where: {
            participants: {
                some: { id: session.user.id },
            },
        },
        include: {
            participants: {
                select: { id: true, name: true, image: true },
            },
            messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
            },
            listing: {
                select: { title: true },
            },
        },
        orderBy: { updatedAt: 'desc' },
    });
}

export async function getMessages(conversationId: string) {
    const session = await auth();
    if (!session?.user?.id) return [];

    const userId = session.user.id;

    // Verify participant
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { participants: { select: { id: true } } },
    });

    if (!conversation || !conversation.participants.some(p => p.id === userId)) {
        throw new Error('Unauthorized');
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

    console.log(`[Mark as Read] User ${userId} in conversation ${conversationId.substring(0, 8)}... - Marked ${updateResult.count} messages as read`);

    return await prisma.message.findMany({
        where: { conversationId },
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
            },
            senderId: { not: session.user.id },
            read: false,
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

    console.log(`[Unread Count] User: ${session.user.id}`);
    console.log(`[Unread Count] Found ${unreadMessages.length} unread messages:`);
    unreadMessages.forEach((msg, idx) => {
        console.log(`  ${idx + 1}. Message ${msg.id.substring(0, 8)}... from ${msg.sender.name} (${msg.sender.id.substring(0, 8)}...) - Conv: ${msg.conversation.id.substring(0, 8)}... - Read: ${msg.read}`);
    });

    return unreadMessages.length;
}
