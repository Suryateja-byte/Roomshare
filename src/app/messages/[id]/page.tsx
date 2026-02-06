import { getMessages } from '@/app/actions/chat';
import { auth } from '@/auth';
import ChatWindow from './ChatWindow';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await auth();

    if (!session?.user?.id) {
        redirect('/login');
    }

    const userId = session.user.id;

    // Fetch conversation to verify access and get other participant info (check admin + per-user delete)
    const conversation = await prisma.conversation.findUnique({
        where: { id },
        include: {
            participants: {
                select: { id: true, name: true, image: true }
            },
            deletions: { where: { userId }, select: { id: true } },
        }
    });

    if (!conversation || conversation.deletedAt || conversation.deletions.length > 0 || !conversation.participants.some(p => p.id === userId)) {
        // Handle unauthorized or not found
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">Conversation not found or access denied.</p>
            </div>
        );
    }

    const otherParticipant = conversation.participants.find(p => p.id !== userId);
    const currentParticipant = conversation.participants.find(p => p.id === userId);
    const result = await getMessages(id);

    // Handle potential error response (extract messages array)
    const messages = Array.isArray(result) ? result : (result.messages || []);

    return (
        <ChatWindow
            initialMessages={messages}
            conversationId={id}
            currentUserId={userId}
            currentUserName={currentParticipant?.name || session.user.name || 'User'}
            otherUserId={otherParticipant?.id || ''}
            otherUserName={otherParticipant?.name || 'User'}
            otherUserImage={otherParticipant?.image}
        />
    );
}
