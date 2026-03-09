import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { checkSuspension, checkEmailVerified } from '@/app/actions/suspension';
import { checkBlockBeforeAction } from '@/app/actions/block';
import { withRateLimit } from '@/lib/with-rate-limit';
import { captureApiError } from '@/lib/api-error-handler';
import {
  getAccessibleConversation,
  listConversationMessages,
  markConversationMessagesAsReadForUser,
  userCanAccessConversation,
} from '@/lib/messages';
import { getClientIP } from '@/lib/rate-limit';
import {
  parsePaginationParams,
  buildPaginationResponse,
  buildPrismaQueryOptions,
} from '@/lib/pagination-schema';

function getMessageRateLimitIdentifier(request: Request, userId: string): string {
  return `${getClientIP(request)}:${userId}`;
}

async function applyMessageRateLimit(
  request: Request,
  userId: string,
  type: 'messages' | 'messagesPoll' | 'messageRead' | 'sendMessage' | 'unreadCount',
  endpoint: string,
) {
  return withRateLimit(request, {
    type,
    endpoint,
    getIdentifier: () => getMessageRateLimitIdentifier(request, userId),
  });
}

async function getUnreadMessageCountForUser(userId: string): Promise<number> {
  return prisma.message.count({
    where: {
      conversation: {
        participants: {
          some: { id: userId },
        },
        deletedAt: null,
        deletions: { none: { userId } },
      },
      senderId: { not: userId },
      read: false,
      deletedAt: null,
    },
  });
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const lastMessageId = searchParams.get('lastMessageId');
    const isPollingRequest = searchParams.get('poll') === '1' || !!lastMessageId;
    const view = searchParams.get('view');

    if (view === 'unreadCount') {
      const rateLimitResponse = await applyMessageRateLimit(
        request,
        userId,
        'unreadCount',
        '/api/messages:unread-count',
      );
      if (rateLimitResponse) return rateLimitResponse;

      const count = await getUnreadMessageCountForUser(userId);
      const response = NextResponse.json({ count });
      response.headers.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=20');
      return response;
    }

    if (conversationId) {
      const conversation = await getAccessibleConversation(conversationId, userId);

      if (!userCanAccessConversation(conversation, userId)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      if (isPollingRequest) {
        const rateLimitResponse = await applyMessageRateLimit(
          request,
          userId,
          'messagesPoll',
          '/api/messages:poll',
        );
        if (rateLimitResponse) return rateLimitResponse;

        const [messages, typingStatuses] = await Promise.all([
          listConversationMessages(conversationId, {
            afterMessageId: lastMessageId ?? undefined,
          }),
          prisma.typingStatus.findMany({
            where: {
              conversationId,
              userId: { not: userId },
              isTyping: true,
              updatedAt: { gte: new Date(Date.now() - 5000) },
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          }),
        ]);

        const response = NextResponse.json({
          messages,
          typingUsers: typingStatuses.map((typingStatus) => ({
            id: typingStatus.user.id,
            name: typingStatus.user.name,
          })),
          hasNewMessages: messages.length > 0,
        });
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      }

      const rateLimitResponse = await applyMessageRateLimit(
        request,
        userId,
        'messages',
        '/api/messages:conversation',
      );
      if (rateLimitResponse) return rateLimitResponse;

      const paginationResult = parsePaginationParams(searchParams);
      if (!paginationResult.success) {
        return NextResponse.json({ error: paginationResult.error }, { status: 400 });
      }
      const { cursor, limit } = paginationResult.data;

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

      const paginatedResponse = buildPaginationResponse(messages, limit, total);
      const response = NextResponse.json({
        messages: paginatedResponse.items,
        pagination: paginatedResponse.pagination,
      });
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }

    const rateLimitResponse = await applyMessageRateLimit(
      request,
      userId,
      'messages',
      '/api/messages:conversations',
    );
    if (rateLimitResponse) return rateLimitResponse;

    const paginationResult = parsePaginationParams(searchParams);
    if (!paginationResult.success) {
      return NextResponse.json({ error: paginationResult.error }, { status: 400 });
    }
    const { cursor, limit } = paginationResult.data;

    const conversationWhere = {
      deletedAt: null,
      deletions: { none: { userId } },
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

    const paginatedResponse = buildPaginationResponse(conversations, limit, total);
    const response = NextResponse.json({
      conversations: paginatedResponse.items,
      pagination: paginatedResponse.pagination,
    });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error: unknown) {
    return captureApiError(error, { route: '/api/messages', method: 'GET' });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const action = typeof body.action === 'string' ? body.action : undefined;

    if (action === 'markRead') {
      const rateLimitResponse = await applyMessageRateLimit(
        request,
        userId,
        'messageRead',
        '/api/messages:mark-read',
      );
      if (rateLimitResponse) return rateLimitResponse;

      const conversationId =
        typeof body.conversationId === 'string' ? body.conversationId.trim() : '';

      if (!conversationId) {
        return NextResponse.json(
          { error: 'conversationId is required' },
          { status: 400 },
        );
      }

      const conversation = await getAccessibleConversation(conversationId, userId);
      if (!userCanAccessConversation(conversation, userId)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      const result = await markConversationMessagesAsReadForUser(
        conversationId,
        userId,
      );

      const response = NextResponse.json({ success: true, count: result.count });
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }

    const rateLimitResponse = await applyMessageRateLimit(
      request,
      userId,
      'sendMessage',
      '/api/messages:send',
    );
    if (rateLimitResponse) return rateLimitResponse;

    const suspension = await checkSuspension();
    if (suspension.suspended) {
      return NextResponse.json({ error: suspension.error || 'Account suspended' }, { status: 403 });
    }

    const emailCheck = await checkEmailVerified();
    if (!emailCheck.verified) {
      return NextResponse.json(
        { error: emailCheck.error || 'Please verify your email to send messages' },
        { status: 403 },
      );
    }

    const conversationId =
      typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
    const content = typeof body.content === 'string' ? body.content : '';

    if (!conversationId || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length === 0) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    }
    if (trimmedContent.length > 2000) {
      return NextResponse.json(
        { error: 'Message must not exceed 2000 characters' },
        { status: 400 },
      );
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: { select: { id: true } } },
    });

    if (
      !conversation ||
      conversation.deletedAt ||
      !conversation.participants.some((participant) => participant.id === userId)
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const otherParticipant = conversation.participants.find(
      (participant) => participant.id !== userId,
    );
    if (otherParticipant) {
      const blockCheck = await checkBlockBeforeAction(otherParticipant.id);
      if (!blockCheck.allowed) {
        return NextResponse.json({ error: blockCheck.message }, { status: 403 });
      }
    }

    const message = await prisma.$transaction(async (tx) => {
      const [createdMessage] = await Promise.all([
        tx.message.create({
          data: {
            senderId: userId,
            conversationId,
            content: trimmedContent,
          },
          include: {
            sender: { select: { id: true, name: true, image: true } },
          },
        }),
        tx.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        }),
        tx.conversationDeletion.deleteMany({
          where: { conversationId },
        }),
      ]);
      return createdMessage;
    });

    const response = NextResponse.json(message, { status: 201 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error: unknown) {
    return captureApiError(error, { route: '/api/messages', method: 'POST' });
  }
}
