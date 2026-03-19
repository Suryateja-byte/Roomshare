import { auth } from "@/auth";
import ChatWindow from "./ChatWindow";
import { prisma } from "@/lib/prisma";
import { listConversationMessages } from "@/lib/messages";
import { redirect } from "next/navigation";

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

  return (
    <ChatWindow
      initialMessages={messages}
      conversationId={id}
      currentUserId={userId}
      currentUserName={currentParticipant?.name || session.user.name || "User"}
      otherUserId={otherParticipant?.id || ""}
      otherUserName={otherParticipant?.name || "User"}
      otherUserImage={otherParticipant?.image}
    />
  );
}
