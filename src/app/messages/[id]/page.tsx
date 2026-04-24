import type { Metadata } from "next";
import { auth } from "@/auth";
import ChatWindow from "./ChatWindow";
import { prisma } from "@/lib/prisma";
import { listConversationMessages } from "@/lib/messages";
import { features } from "@/lib/env";
import {
  ACTIVE_REPORT_STATUSES,
  canLeavePrivateFeedback as canLeavePrivateFeedbackForViewer,
} from "@/lib/reports/private-feedback";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Conversation | RoomShare",
  description: "Chat with your roommate or host on RoomShare.",
  robots: { index: false, follow: false },
};

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;

  // Fetch conversation and messages in parallel — messages only needs `id`, not conversation result
  const [conversation, messages] = await Promise.all([
    prisma.conversation.findUnique({
      where: { id },
      include: {
        listing: {
          select: {
            id: true,
            ownerId: true,
            title: true,
          },
        },
        participants: {
          select: { id: true, name: true, image: true },
        },
        deletions: { where: { userId }, select: { id: true } },
      },
    }),
    listConversationMessages(id),
  ]);

  if (
    !conversation ||
    conversation.deletedAt ||
    conversation.deletions.length > 0 ||
    !conversation.participants.some((p) => p.id === userId)
  ) {
    // Handle unauthorized or not found
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">
          Conversation not found or access denied.
        </p>
      </div>
    );
  }

  const otherParticipant = conversation.participants.find(
    (p) => p.id !== userId
  );
  const currentParticipant = conversation.participants.find(
    (p) => p.id === userId
  );
  let canLeavePrivateFeedback = false;

  if (
    features.privateFeedback &&
    conversation.listing.ownerId !== userId &&
    session.user.emailVerified
  ) {
    const [existingPrivateFeedback, reporterHasMessaged] = await Promise.all([
      prisma.report.findFirst({
        where: {
          listingId: conversation.listing.id,
          reporterId: userId,
          kind: "PRIVATE_FEEDBACK",
          status: { in: [...ACTIVE_REPORT_STATUSES] },
        },
        select: { id: true },
      }),
      prisma.message.findFirst({
        where: {
          conversationId: conversation.id,
          senderId: session.user.id,
        },
        select: { id: true },
      }),
    ]);

    canLeavePrivateFeedback = canLeavePrivateFeedbackForViewer({
      isLoggedIn: true,
      isOwner: false,
      isEmailVerified: true,
      hasPriorConversation: Boolean(reporterHasMessaged),
      hasAcceptedBooking: false,
      hasExistingPrivateFeedback: !!existingPrivateFeedback,
    });
  }

  return (
    <ChatWindow
      canLeavePrivateFeedback={canLeavePrivateFeedback}
      initialMessages={messages}
      conversationId={id}
      currentUserId={userId}
      currentUserName={currentParticipant?.name || session.user.name || "User"}
      listingId={conversation.listing.id}
      listingOwnerId={conversation.listing.ownerId}
      listingTitle={conversation.listing.title}
      otherUserId={otherParticipant?.id || ""}
      otherUserName={otherParticipant?.name || "User"}
      otherUserImage={otherParticipant?.image}
    />
  );
}
