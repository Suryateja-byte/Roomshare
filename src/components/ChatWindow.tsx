'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Loader2, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import CharacterCounter from '@/components/CharacterCounter';

const MESSAGE_MAX_LENGTH = 1000;

interface Message {
    id: string;
    content: string;
    senderId: string;
    createdAt: string;
    status?: 'sending' | 'sent' | 'failed';
    sender: {
        name: string | null;
        image: string | null;
    };
}

export default function ChatWindow({ conversationId, currentUserId }: { conversationId: string, currentUserId: string }) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { isOffline } = useNetworkStatus();

    // Debounce protection
    const isSubmittingRef = useRef(false);
    const lastSubmissionRef = useRef<number>(0);
    const DEBOUNCE_MS = 500;

    const fetchMessages = useCallback(async () => {
        try {
            const res = await fetch(`/api/messages?conversationId=${conversationId}`);
            if (!res.ok) throw new Error('Failed to fetch messages');
            const data = await res.json();
            // Only update messages that aren't in "sending" state
            setMessages(prev => {
                const sendingMessages = prev.filter(m => m.status === 'sending' || m.status === 'failed');
                const serverMessageIds = new Set(data.map((m: Message) => m.id));
                // Keep sending/failed messages that aren't yet on server
                const pendingMessages = sendingMessages.filter(m => !serverMessageIds.has(m.id));
                return [...data, ...pendingMessages];
            });
            setLoading(false);
            setLoadError(false);
        } catch (err) {
            console.error('Failed to fetch messages:', err);
            setLoadError(true);
            setLoading(false);
        }
    }, [conversationId]);

    useEffect(() => {
        setMessages([]);
        setLoading(true);
        setLoadError(false);
    }, [conversationId]);

    useEffect(() => {
        fetchMessages();
        if (isOffline) return;
        const interval = setInterval(fetchMessages, 5000); // Poll every 5s
        return () => clearInterval(interval);
    }, [fetchMessages, isOffline]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedMessage = newMessage.trim();
        if (!trimmedMessage) return;

        // Block if offline
        if (isOffline) {
            toast.error('You are offline', {
                description: 'Please check your internet connection to send messages.'
            });
            return;
        }

        // Debounce protection
        const now = Date.now();
        if (isSubmittingRef.current || (now - lastSubmissionRef.current) < DEBOUNCE_MS) {
            return;
        }

        // Length validation
        if (trimmedMessage.length > MESSAGE_MAX_LENGTH) {
            toast.error('Message too long', {
                description: `Maximum ${MESSAGE_MAX_LENGTH} characters allowed.`
            });
            return;
        }

        isSubmittingRef.current = true;
        lastSubmissionRef.current = now;
        setIsSending(true);

        // Optimistic update - add message immediately with "sending" status
        const optimisticId = `temp-${Date.now()}`;
        const optimisticMessage: Message = {
            id: optimisticId,
            content: trimmedMessage,
            senderId: currentUserId,
            createdAt: new Date().toISOString(),
            status: 'sending',
            sender: { name: null, image: null }
        };

        setMessages(prev => [...prev, optimisticMessage]);
        setNewMessage('');

        try {
            const res = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId,
                    content: trimmedMessage
                })
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to send message');
            }

            // Remove optimistic message - fetchMessages will get the real one
            setMessages(prev => prev.filter(m => m.id !== optimisticId));
            fetchMessages();
        } catch (error) {
            console.error('Failed to send message:', error);

            // Mark message as failed
            setMessages(prev => prev.map(m =>
                m.id === optimisticId ? { ...m, status: 'failed' as const } : m
            ));

            toast.error('Message failed to send', {
                description: 'Tap to retry',
                action: {
                    label: 'Retry',
                    onClick: () => handleRetry(optimisticId, trimmedMessage)
                }
            });
        } finally {
            setIsSending(false);
            setTimeout(() => {
                isSubmittingRef.current = false;
            }, 500);
        }
    };

    const handleRetry = async (failedMessageId: string, content: string) => {
        // Update status to sending
        setMessages(prev => prev.map(m =>
            m.id === failedMessageId ? { ...m, status: 'sending' as const } : m
        ));

        try {
            const res = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId,
                    content
                })
            });

            if (!res.ok) {
                throw new Error('Failed to send message');
            }

            // Remove the failed message - fetchMessages will get the real one
            setMessages(prev => prev.filter(m => m.id !== failedMessageId));
            toast.success('Message sent');
            fetchMessages();
        } catch (error) {
            // Mark as failed again
            setMessages(prev => prev.map(m =>
                m.id === failedMessageId ? { ...m, status: 'failed' as const } : m
            ));
            toast.error('Failed to send. Please try again.');
        }
    };

    const handleRemoveFailedMessage = (messageId: string) => {
        setMessages(prev => prev.filter(m => m.id !== messageId));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full p-8" role="status" aria-label="Loading messages">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
                <p className="text-muted-foreground mb-4">Failed to load messages</p>
                <Button onClick={fetchMessages} variant="outline" size="sm">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Try Again
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Offline Banner */}
            {isOffline && (
                <div className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <WifiOff className="w-4 h-4" />
                    <span>You&apos;re offline. Messages will be sent when you reconnect.</span>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        No messages yet. Start the conversation!
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMe = msg.senderId === currentUserId;
                        const isFailed = msg.status === 'failed';
                        const isSendingMsg = msg.status === 'sending';

                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[70%] rounded-2xl px-4 py-2 relative ${isFailed
                                    ? 'bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800'
                                    : isMe
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted'
                                    } ${isSendingMsg ? 'opacity-70' : ''}`}>
                                    <p>{msg.content}</p>
                                    <div className={`text-2xs flex items-center justify-end gap-1 mt-1 ${isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                        {isSendingMsg && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
                                        {isFailed && (
                                            <span className="text-red-500 dark:text-red-400 flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                Failed
                                            </span>
                                        )}
                                        {!isSendingMsg && !isFailed && (
                                            <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        )}
                                    </div>
                                    {isFailed && (
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={() => handleRetry(msg.id, msg.content)}
                                                className="text-xs text-red-600 dark:text-red-400 hover:underline focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 rounded-sm"
                                            >
                                                Retry
                                            </button>
                                            <button
                                                onClick={() => handleRemoveFailedMessage(msg.id)}
                                                className="text-xs text-zinc-500 hover:underline focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 rounded-sm"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSend} className="p-4 border-t bg-background space-y-2">
                <div className="flex gap-2">
                    <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={isOffline ? "You're offline..." : "Type a message..."}
                        className="flex-1"
                        maxLength={MESSAGE_MAX_LENGTH}
                        disabled={isSending}
                    />
                    <Button
                        type="submit"
                        size="icon"
                        disabled={isSending || isOffline || !newMessage.trim()}
                        aria-label={isSending ? 'Sending message' : 'Send message'}
                        aria-busy={isSending}
                    >
                        {isSending ? (
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        ) : (
                            <Send className="w-4 h-4" aria-hidden="true" />
                        )}
                    </Button>
                </div>
                {newMessage.length > MESSAGE_MAX_LENGTH * 0.8 && (
                    <CharacterCounter current={newMessage.length} max={MESSAGE_MAX_LENGTH} />
                )}
            </form>
        </div>
    );
}
