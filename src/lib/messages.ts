import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const conversationMessageInclude = {
  sender: {
    select: {
      id: true,
      name: true,
      image: true,
    },
  },
} satisfies Prisma.MessageInclude;

export type ConversationMessage = Prisma.MessageGetPayload<{
  include: typeof conversationMessageInclude;
}>;

export interface AccessibleConversation {
  id: string;
  deletedAt: Date | null;
  participants: Array<{ id: string }>;
  deletions: Array<{ id: string }>;
}

export async function getAccessibleConversation(
  conversationId: string,
  userId: string
): Promise<AccessibleConversation | null> {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: { select: { id: true } },
      deletions: { where: { userId }, select: { id: true } },
    },
  });
}

export function userCanAccessConversation(
  conversation: AccessibleConversation | null,
  userId: string
): conversation is AccessibleConversation {
  return Boolean(
    conversation &&
    !conversation.deletedAt &&
    conversation.deletions.length === 0 &&
    conversation.participants.some((participant) => participant.id === userId)
  );
}

export async function listConversationMessages(
  conversationId: string,
  options?: { afterMessageId?: string }
): Promise<ConversationMessage[]> {
  const afterMessageId = options?.afterMessageId?.trim();
  let where: Prisma.MessageWhereInput = {
    conversationId,
    deletedAt: null,
  };

  if (afterMessageId) {
    const cursorMessage = await prisma.message.findUnique({
      where: { id: afterMessageId },
      select: { id: true, conversationId: true, createdAt: true },
    });

    if (!cursorMessage || cursorMessage.conversationId !== conversationId) {
      return [];
    }

    where = {
      conversationId,
      deletedAt: null,
      OR: [
        { createdAt: { gt: cursorMessage.createdAt } },
        {
          createdAt: cursorMessage.createdAt,
          id: { gt: cursorMessage.id },
        },
      ],
    };
  }

  return prisma.message.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: conversationMessageInclude,
  });
}

export async function markConversationMessagesAsReadForUser(
  conversationId: string,
  userId: string
) {
  return prisma.message.updateMany({
    where: {
      conversationId,
      senderId: { not: userId },
      read: false,
    },
    data: { read: true },
  });
}
