import { Suspense } from 'react';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import MessagesPageClient from '@/components/MessagesPageClient';
import { getConversations } from '@/app/actions/chat';

export default async function MessagesPage() {
    const session = await auth();

    if (!session || !session.user || !session.user.id) {
        redirect('/login');
    }

    const conversations = await getConversations();

    return (
        <Suspense fallback={<div className="h-[calc(100vh-64px)] flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div>}>
            <MessagesPageClient
                currentUserId={session.user.id}
                initialConversations={conversations}
            />
        </Suspense>
    );
}
