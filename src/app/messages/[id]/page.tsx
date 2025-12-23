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

    // Fetch conversation to verify access and get other participant info
    const conversation = await prisma.conversation.findUnique({
        where: { id },
        include: {
            participants: {
                select: { id: true, name: true, image: true }
            }
        }
    });

    const userId = session.user.id;

    if (!conversation || !conversation.participants.some(p => p.id === userId)) {
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
