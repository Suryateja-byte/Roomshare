import { getMessages } from '@/app/actions/chat';
import { auth } from '@/auth';
import ChatWindow from './ChatWindow';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await auth();

    if (!session?.user?.id) {
        redirect('/api/auth/signin');
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

    if (!conversation || !conversation.participants.some(p => p.id === session.user.id)) {
        // Handle unauthorized or not found
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">Conversation not found or access denied.</p>
            </div>
        );
    }

    const otherParticipant = conversation.participants.find(p => p.id !== session.user.id);
    const currentParticipant = conversation.participants.find(p => p.id === session.user.id);
    const messages = await getMessages(id);

    return (
        <ChatWindow
            initialMessages={messages}
            conversationId={id}
            currentUserId={session.user.id}
            currentUserName={currentParticipant?.name || session.user.name || 'User'}
            otherUserName={otherParticipant?.name || 'User'}
            otherUserImage={otherParticipant?.image}
        />
    );
}
