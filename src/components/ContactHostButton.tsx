'use client';

import { useState } from 'react';
import { startConversation } from '@/app/actions/chat';
import { useRouter } from 'next/navigation';

export default function ContactHostButton({ listingId }: { listingId: string }) {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleContact = async () => {
        setIsLoading(true);
        try {
            const result = await startConversation(listingId);

            if (result.error) {
                if (result.error === 'Unauthorized') {
                    router.push('/api/auth/signin');
                } else {
                    alert(result.error);
                }
                return;
            }

            if (result.conversationId) {
                router.push(`/messages/${result.conversationId}`);
            }
        } catch (error: any) {
            console.error('Failed to start conversation:', error);
            alert('Failed to start conversation');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            onClick={handleContact}
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
            {isLoading ? 'Starting Chat...' : 'Contact Host'}
        </button>
    );
}
