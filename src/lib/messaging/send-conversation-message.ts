import "server-only";

import { prisma } from "@/lib/prisma";
import { createInternalNotification } from "@/lib/notifications";
import { sendNotificationEmailWithPreference } from "@/lib/email";
import { HOST_NOT_ACCEPTING_CONTACT_MESSAGE } from "@/lib/contact/contact-attempts";
import { evaluateListingContactable } from "@/lib/messaging/listing-contactable";
import {
  recordOutboundContentSoftFlag,
  scanOutboundMessageContent,
} from "@/lib/messaging/outbound-content-guard";

interface SendConversationMessageInput {
  conversationId: string;
  senderId: string;
  senderName?: string | null;
  content: string;
  includeSenderInMessage?: boolean;
  missingConversationError?: string;
  missingConversationStatus?: number;
}

export interface SentConversationMessage {
  id: string;
  content: string;
  senderId: string;
  conversationId: string;
  createdAt: Date;
  read?: boolean;
  sender?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
}

type SendConversationMessageResult =
  | {
      ok: true;
      message: SentConversationMessage;
    }
  | {
      ok: false;
      status: number;
      error: string;
      code?: string;
    };

async function getBlockFailure(senderId: string, recipientId: string) {
  try {
    const block = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: recipientId },
          { blockerId: recipientId, blockedId: senderId },
        ],
      },
      select: { blockerId: true },
    });

    if (!block) {
      return null;
    }

    return block.blockerId === senderId
      ? "You have blocked this user. Unblock them to interact."
      : "This user has blocked you";
  } catch {
    return "Unable to verify block status";
  }
}

export async function sendConversationMessage(
  input: SendConversationMessageInput
): Promise<SendConversationMessageResult> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    include: {
      participants: {
        select: { id: true, name: true, isSuspended: true },
      },
      listing: {
        select: {
          ownerId: true,
          status: true,
          statusReason: true,
          availableSlots: true,
          totalSlots: true,
          openSlots: true,
          moveInDate: true,
          availableUntil: true,
          minStayMonths: true,
          lastConfirmedAt: true,
          owner: {
            select: { isSuspended: true },
          },
        },
      },
    },
  });

  if (!conversation || conversation.deletedAt) {
    return {
      ok: false,
      status: input.missingConversationStatus ?? 404,
      error: input.missingConversationError ?? "Conversation not found",
    };
  }

  const isParticipant = conversation.participants.some(
    (participant) => participant.id === input.senderId
  );
  if (!isParticipant) {
    return { ok: false, status: 403, error: "Unauthorized" };
  }

  const contactable = evaluateListingContactable(conversation.listing);
  if (!contactable.ok) {
    return {
      ok: false,
      status: 403,
      error: contactable.message,
      code: contactable.code,
    };
  }

  const otherParticipants = conversation.participants.filter(
    (participant) => participant.id !== input.senderId
  );

  const recipientSuspended = otherParticipants.some(
    (participant) => participant.isSuspended === true
  );
  const ownerSuspended =
    typeof conversation.listing.ownerId === "string" &&
    conversation.listing.ownerId !== input.senderId &&
    conversation.listing.owner?.isSuspended === true;
  if (recipientSuspended || ownerSuspended) {
    return {
      ok: false,
      status: 403,
      error: HOST_NOT_ACCEPTING_CONTACT_MESSAGE,
      code: "HOST_NOT_ACCEPTING_CONTACT",
    };
  }

  for (const participant of otherParticipants) {
    const blockFailure = await getBlockFailure(input.senderId, participant.id);
    if (blockFailure) {
      return { ok: false, status: 403, error: blockFailure };
    }
  }

  const outboundContentFlags = scanOutboundMessageContent(input.content);
  recordOutboundContentSoftFlag({
    conversationId: input.conversationId,
    userId: input.senderId,
    flagKinds: outboundContentFlags,
  });

  const message = await prisma.$transaction(async (tx) => {
    const createdMessage = input.includeSenderInMessage
      ? await tx.message.create({
          data: {
            senderId: input.senderId,
            conversationId: input.conversationId,
            content: input.content,
          },
          include: {
            sender: { select: { id: true, name: true, image: true } },
          },
        })
      : await tx.message.create({
          data: {
            content: input.content,
            conversationId: input.conversationId,
            senderId: input.senderId,
          },
        });

    await Promise.all([
      tx.conversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: new Date() },
      }),
      tx.conversationDeletion.deleteMany({
        where: { conversationId: input.conversationId },
      }),
    ]);

    return createdMessage;
  });

  const senderName = input.senderName?.trim() || "Someone";
  const participantEmails = await prisma.user.findMany({
    where: { id: { in: otherParticipants.map((participant) => participant.id) } },
    select: { id: true, email: true },
  });
  const emailMap = new Map(participantEmails.map((user) => [user.id, user.email]));

  await Promise.all(
    otherParticipants.map(async (participant) => {
      await createInternalNotification({
        userId: participant.id,
        type: "NEW_MESSAGE",
        title: "New Message",
        message: `${senderName}: ${input.content.substring(0, 50)}${input.content.length > 50 ? "..." : ""}`,
        link: `/messages/${input.conversationId}`,
      });

      const email = emailMap.get(participant.id);
      if (email) {
        await sendNotificationEmailWithPreference(
          "newMessage",
          participant.id,
          email,
          {
            recipientName: participant.name || "User",
            senderName,
            conversationId: input.conversationId,
          }
        );
      }
    })
  );

  return { ok: true, message: message as SentConversationMessage };
}
