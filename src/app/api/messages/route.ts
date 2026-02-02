import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { checkSuspension } from '@/app/actions/suspension';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/with-rate-limit';
import {
    parsePaginationParams,
    buildPaginationResponse,
    buildPrismaQueryOptions,
} from '@/lib/pagination-schema';

export async function GET(request: Request) {
    // P2-06 FIX: Add rate limiting to prevent abuse/scraping
    const rateLimitResponse = await withRateLimit(request, { type: 'messages' });
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const session = await auth();
        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;
        const { searchParams } = new URL(request.url);
        const conversationId = searchParams.get('conversationId');

        // P1-03: Parse and validate pagination parameters
        const paginationResult = parsePaginationParams(searchParams);
        if (!paginationResult.success) {
            return NextResponse.json({ error: paginationResult.error }, { status: 400 });
        }
        const { cursor, limit } = paginationResult.data;

        if (conversationId) {
            // Fetch messages for a specific conversation
            const conversation = await prisma.conversation.findFirst({
                where: { id: conversationId, deletedAt: null },
                include: { participants: { select: { id: true } } },
            });

            // Verify user is a participant
            if (!conversation || !conversation.participants.some(p => p.id === userId)) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
            }

            // P1-03: Get total count and paginated messages in parallel
            const [total, messages] = await Promise.all([
                prisma.message.count({ where: { conversationId, deletedAt: null } }),
                prisma.message.findMany({
                    where: { conversationId, deletedAt: null },
                    orderBy: { createdAt: 'desc' },
                    include: {
                        sender: { select: { id: true, name: true, image: true } },
                    },
                    ...buildPrismaQueryOptions({ cursor, limit }),
                }),
            ]);

            // P1-03: Build paginated response
            const paginatedResponse = buildPaginationResponse(messages, limit, total);

            // P2-1: User-specific data must not be cached by CDN/browser
            const response = NextResponse.json({
                messages: paginatedResponse.items,
                pagination: paginatedResponse.pagination,
            });
            response.headers.set('Cache-Control', 'private, no-store');
            return response;
        } else {
            // P1-03: Fetch all conversations for the user with pagination
            const conversationWhere = {
                deletedAt: null,
                participants: {
                    some: { id: userId },
                },
            };

            const [total, conversations] = await Promise.all([
                prisma.conversation.count({ where: conversationWhere }),
                prisma.conversation.findMany({
                    where: conversationWhere,
                    include: {
                        participants: {
                            select: { id: true, name: true, image: true },
                        },
                        messages: {
                            where: { deletedAt: null },
                            orderBy: { createdAt: 'desc' },
                            take: 1,
                        },
                        listing: {
                            select: { id: true, title: true, images: true },
                        },
                    },
                    orderBy: { updatedAt: 'desc' },
                    ...buildPrismaQueryOptions({ cursor, limit }),
                }),
            ]);

            // P1-03: Build paginated response for conversations
            const paginatedResponse = buildPaginationResponse(conversations, limit, total);

            // P2-1: User-specific data must not be cached by CDN/browser
            const response = NextResponse.json({
                conversations: paginatedResponse.items,
                pagination: paginatedResponse.pagination,
            });
            response.headers.set('Cache-Control', 'private, no-store');
            return response;
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
    // P1-4 FIX: Add rate limiting to prevent message spam
    const rateLimitResponse = await withRateLimit(request, { type: 'sendMessage' });
    if (rateLimitResponse) return rateLimitResponse;

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

        // P1-04: Max message length validation (2000 chars)
        const trimmedContent = typeof content === 'string' ? content.trim() : '';
        if (trimmedContent.length === 0) {
            return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
        }
        if (trimmedContent.length > 2000) {
            return NextResponse.json(
                { error: 'Message must not exceed 2000 characters' },
                { status: 400 }
            );
        }

        // Verify user is a participant in this conversation
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { participants: { select: { id: true } } },
        });

        if (!conversation || !conversation.participants.some(p => p.id === userId)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // P1-21 FIX: Parallelize independent database operations
        const [message] = await Promise.all([
            prisma.message.create({
                data: {
                    senderId: userId,
                    conversationId,
                    content,
                },
                include: {
                    sender: { select: { id: true, name: true, image: true } },
                }
            }),
            // Update conversation timestamp in parallel
            prisma.conversation.update({
                where: { id: conversationId },
                data: { updatedAt: new Date() },
            })
        ]);

        // P2-1: Mutation responses must not be cached
        const response = NextResponse.json(message, { status: 201 });
        response.headers.set('Cache-Control', 'no-store');
        return response;

    } catch (error: unknown) {
        logger.sync.error('Failed to send message', {
            action: 'sendMessage',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

