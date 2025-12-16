import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { checkSuspension } from '@/app/actions/suspension';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;
        const { searchParams } = new URL(request.url);
        const conversationId = searchParams.get('conversationId');

        if (conversationId) {
            // Fetch messages for a specific conversation
            const conversation = await prisma.conversation.findUnique({
                where: { id: conversationId },
                include: { participants: { select: { id: true } } },
            });

            // Verify user is a participant
            if (!conversation || !conversation.participants.some(p => p.id === userId)) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
            }

            const messages = await prisma.message.findMany({
                where: { conversationId },
                orderBy: { createdAt: 'asc' },
                include: {
                    sender: { select: { id: true, name: true, image: true } },
                }
            });
            return NextResponse.json(messages);
        } else {
            // Fetch all conversations for the user
            const conversations = await prisma.conversation.findMany({
                where: {
                    participants: {
                        some: { id: userId },
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

            // Transform to match the expected format for MessageList component
            const formattedConversations = conversations
                .filter(conv => conv.messages.length > 0) // Only show conversations with messages
                .map(conv => {
                    // Get the other participant (not the current user)
                    const otherUser = conv.participants.find(p => p.id !== userId);
                    return {
                        id: conv.id,
                        user: otherUser || { id: '', name: 'Unknown', image: null },
                        lastMessage: {
                            content: conv.messages[0].content,
                            createdAt: conv.messages[0].createdAt,
                        },
                        listing: conv.listing,
                    };
                });

            return NextResponse.json(formattedConversations);
        }

    } catch (error: unknown) {
        logger.sync.error('Failed to fetch messages', {
            action: 'getMessages',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}


export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const suspension = await checkSuspension();
        if (suspension.suspended) {
            return NextResponse.json({ error: suspension.error || 'Account suspended' }, { status: 403 });
        }

        const userId = session.user.id;

        const body = await request.json();
        const { conversationId, content } = body;

        if (!conversationId || !content) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Verify user is a participant in this conversation
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { participants: { select: { id: true } } },
        });

        if (!conversation || !conversation.participants.some(p => p.id === userId)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const message = await prisma.message.create({
            data: {
                senderId: userId,
                conversationId,
                content,
            },
            include: {
                sender: { select: { id: true, name: true, image: true } },
            }
        });

        // Update conversation timestamp
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        });

        return NextResponse.json(message, { status: 201 });

    } catch (error: unknown) {
        logger.sync.error('Failed to send message', {
            action: 'sendMessage',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

