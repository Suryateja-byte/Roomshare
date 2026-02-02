'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { startConversation } from '@/app/actions/chat';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function ContactHostButton({ listingId }: { listingId: string }) {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleContact = async () => {
        setIsLoading(true);
        try {
            const result = await startConversation(listingId);

            if (result.error) {
                if (result.error === 'Unauthorized') {
                    router.push('/login');
                } else {
                    toast.error(result.error);
                }
                return;
            }

            if (result.conversationId) {
                router.push(`/messages/${result.conversationId}`);
            }
        } catch (error: any) {
            console.error('Failed to start conversation:', error);
            toast.error('Failed to start conversation');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button
            onClick={handleContact}
            disabled={isLoading}
            size="lg"
            className="w-full"
        >
            {isLoading ? 'Starting Chat...' : 'Contact Host'}
        </Button>
    );
}
