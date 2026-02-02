'use client';

import { useState, useEffect } from 'react';
import UserAvatar from '@/components/UserAvatar';

interface Conversation {
    id: string;
    user: {
        id: string;
        name: string | null;
        image: string | null;
    };
    lastMessage: {
        content: string;
        createdAt: string;
    };
}

export default function MessageList({ onSelectConversation, selectedConversationId }: { onSelectConversation: (conversationId: string) => void, selectedConversationId: string | null }) {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/messages')
            .then(res => res.json())
            .then(data => {
                setConversations(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    if (loading) return <div className="p-4">Loading conversations...</div>;

    if (conversations.length === 0) {
        return <div className="p-4 text-muted-foreground">No messages yet.</div>;
    }

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            {conversations.map((conv) => (
                <button
                    type="button"
                    key={conv.id}
                    onClick={() => onSelectConversation(conv.id)}
                    className={`p-4 border-b text-left cursor-pointer hover:bg-muted/50 transition-colors ${selectedConversationId === conv.id ? 'bg-muted' : ''}`}
                >
                    <div className="flex items-center gap-3">
                        <UserAvatar image={conv.user.image} name={conv.user.name} size="md" />
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline">
                                <h3 className="font-semibold truncate">{conv.user.name || 'Unknown User'}</h3>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(conv.lastMessage.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground truncate">{conv.lastMessage.content}</p>
                        </div>
                    </div>
                </button>
            ))}
        </div>
    );
}
