'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, createChatChannel, broadcastTyping } from '@/lib/supabase';
import { sendMessage, getMessages } from '@/app/actions/chat';
import { useRouter } from 'next/navigation';
import { Send, Loader2, Check, CheckCheck } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import { useDebouncedCallback } from 'use-debounce';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Message = {
    id: string;
    content: string;
    senderId: string;
    createdAt: Date;
    read?: boolean;
    sender?: {
        name: string | null;
        image: string | null;
    };
};

interface ChatWindowProps {
    initialMessages: Message[];
    conversationId: string;
    currentUserId: string;
    currentUserName?: string;
    otherUserName?: string;
    otherUserImage?: string | null;
}

export default function ChatWindow({
    initialMessages,
    conversationId,
    currentUserId,
    currentUserName,
    otherUserName,
    otherUserImage
}: ChatWindowProps) {
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isPolling, setIsPolling] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [otherUserTyping, setOtherUserTyping] = useState(false);
    const [isOnline, setIsOnline] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const channelRef = useRef<RealtimeChannel | null>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const router = useRouter();
    const lastMessageIdRef = useRef<string | null>(
        initialMessages.length > 0 ? initialMessages[initialMessages.length - 1].id : null
    );

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Dispatch event when messages are read
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('messagesRead'));
    }, []);

    // Debounced function to broadcast typing stopped
    const stopTypingBroadcast = useDebouncedCallback(() => {
        if (channelRef.current) {
            broadcastTyping(channelRef.current, currentUserId, currentUserName || '', false);
        }
        setIsTyping(false);
    }, 2000);

    // Handle input change with typing indicator
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);

        if (e.target.value && !isTyping) {
            setIsTyping(true);
            if (channelRef.current) {
                broadcastTyping(channelRef.current, currentUserId, currentUserName || '', true);
            }
        }

        // Reset the stop typing timer
        stopTypingBroadcast();
    };

    // Poll for new messages as fallback (or primary if Supabase not configured)
    const pollForMessages = useCallback(async () => {
        if (isPolling) return;
        setIsPolling(true);

        try {
            const result = await getMessages(conversationId);
            if (result && Array.isArray(result)) {
                // Check if there are new messages
                const newMessages = result.filter(
                    (msg: Message) => !messages.some(m => m.id === msg.id)
                );

                if (newMessages.length > 0) {
                    setMessages(prev => {
                        const combined = [...prev, ...newMessages];
                        // Sort by createdAt and remove duplicates
                        const unique = combined.reduce((acc: Message[], curr) => {
                            if (!acc.some(m => m.id === curr.id)) {
                                acc.push(curr);
                            }
                            return acc;
                        }, []);
                        return unique.sort((a, b) =>
                            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                        );
                    });
                    lastMessageIdRef.current = result[result.length - 1]?.id || null;
                }
            }
        } catch (error) {
            console.error('Polling error:', error);
        } finally {
            setIsPolling(false);
        }
    }, [conversationId, messages, isPolling]);

    // Set up real-time subscription with presence and typing
    useEffect(() => {
        let pollInterval: NodeJS.Timeout | null = null;

        if (supabase) {
            // Create channel with broadcast and presence
            const channel = createChatChannel(conversationId);

            if (channel) {
                channelRef.current = channel;

                channel
                    // Listen for new messages via postgres changes
                    .on('postgres_changes', {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'Message',
                        filter: `conversationId=eq.${conversationId}`
                    }, (payload) => {
                        const newMessage = payload.new as any;
                        newMessage.createdAt = new Date(newMessage.createdAt);

                        setMessages((prev) => {
                            if (prev.some(m => m.id === newMessage.id)) return prev;
                            return [...prev, newMessage];
                        });

                        // Clear typing indicator when message received
                        if (newMessage.senderId !== currentUserId) {
                            setOtherUserTyping(false);
                        }

                        router.refresh();
                    })
                    // Listen for typing broadcasts
                    .on('broadcast', { event: 'typing' }, (payload) => {
                        const { userId, isTyping: typing } = payload.payload;
                        if (userId !== currentUserId) {
                            setOtherUserTyping(typing);

                            // Auto-clear typing indicator after 3 seconds
                            if (typing) {
                                if (typingTimeoutRef.current) {
                                    clearTimeout(typingTimeoutRef.current);
                                }
                                typingTimeoutRef.current = setTimeout(() => {
                                    setOtherUserTyping(false);
                                }, 3000);
                            }
                        }
                    })
                    // Track presence
                    .on('presence', { event: 'sync' }, () => {
                        const state = channel.presenceState();
                        const otherUsers = Object.values(state)
                            .flat()
                            .filter((p: any) => p.user_id !== currentUserId);
                        setIsOnline(otherUsers.length > 0);
                    })
                    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                        const otherJoined = newPresences.some((p: any) => p.user_id !== currentUserId);
                        if (otherJoined) setIsOnline(true);
                    })
                    .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                        const otherLeft = leftPresences.some((p: any) => p.user_id !== currentUserId);
                        if (otherLeft) {
                            const state = channel.presenceState();
                            const otherUsers = Object.values(state)
                                .flat()
                                .filter((p: any) => p.user_id !== currentUserId);
                            setIsOnline(otherUsers.length > 0);
                        }
                    })
                    .subscribe(async (status) => {
                        if (status === 'SUBSCRIBED') {
                            setConnectionStatus('connected');
                            // Track our presence
                            await channel.track({
                                online_at: new Date().toISOString(),
                                user_id: currentUserId,
                                user_name: currentUserName || 'User'
                            });
                        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                            setConnectionStatus('disconnected');
                        }
                    });
            }
        }

        // Always set up polling as fallback (every 5 seconds)
        pollInterval = setInterval(pollForMessages, 5000);

        return () => {
            if (channelRef.current && supabase) {
                supabase.removeChannel(channelRef.current);
            }
            if (pollInterval) {
                clearInterval(pollInterval);
            }
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
        };
    }, [conversationId, router, pollForMessages, currentUserId, currentUserName]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isSending) return;

        const content = input.trim();
        setInput('');
        setIsSending(true);
        setIsTyping(false);

        // Broadcast that we stopped typing
        if (channelRef.current) {
            broadcastTyping(channelRef.current, currentUserId, currentUserName || '', false);
        }

        // Optimistic update
        const optimisticId = 'opt-' + Date.now();
        const optimisticMessage: Message = {
            id: optimisticId,
            content,
            senderId: currentUserId,
            createdAt: new Date(),
        };
        setMessages(prev => [...prev, optimisticMessage]);

        try {
            const sentMessage = await sendMessage(conversationId, content);
            // Replace optimistic message with real one
            setMessages(prev => prev.map(m =>
                m.id === optimisticId ? { ...sentMessage, sender: m.sender } : m
            ));
            lastMessageIdRef.current = sentMessage.id;
        } catch (error) {
            console.error('Failed to send message:', error);
            // Remove optimistic message on error
            setMessages(prev => prev.filter(m => m.id !== optimisticId));
            alert('Failed to send message. Please try again.');
        } finally {
            setIsSending(false);
            inputRef.current?.focus();
        }
    };

    // Group messages by date
    const groupedMessages = messages.reduce((groups: { [key: string]: Message[] }, msg) => {
        const date = new Date(msg.createdAt).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        if (!groups[date]) {
            groups[date] = [];
        }
        groups[date].push(msg);
        return groups;
    }, {});

    // Get status text
    const getStatusText = () => {
        if (otherUserTyping) {
            return 'typing...';
        }
        if (connectionStatus === 'connected' && isOnline) {
            return 'Online';
        }
        if (connectionStatus === 'connected') {
            return 'Offline';
        }
        if (connectionStatus === 'connecting') {
            return 'Connecting...';
        }
        return 'Offline';
    };

    return (
        <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950">
            {/* Header */}
            <div className="px-6 py-4 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
                <div className="relative">
                    <UserAvatar
                        image={otherUserImage}
                        name={otherUserName}
                        className="w-10 h-10"
                    />
                    {connectionStatus === 'connected' && isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-zinc-900" />
                    )}
                </div>
                <div>
                    <h3 className="font-semibold text-zinc-900 dark:text-white">{otherUserName || 'Chat'}</h3>
                    <p className={`text-xs ${otherUserTyping ? 'text-green-600 dark:text-green-400 font-medium' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        {getStatusText()}
                    </p>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
                {Object.entries(groupedMessages).map(([date, msgs]) => (
                    <div key={date}>
                        {/* Date separator */}
                        <div className="flex items-center justify-center my-4">
                            <div className="px-3 py-1 bg-zinc-200 dark:bg-zinc-700 rounded-full text-xs text-zinc-600 dark:text-zinc-300">
                                {date}
                            </div>
                        </div>

                        {/* Messages for this date */}
                        <div className="space-y-3">
                            {msgs.map((msg, index) => {
                                const isMe = msg.senderId === currentUserId;
                                const showAvatar = !isMe && (
                                    index === 0 ||
                                    msgs[index - 1]?.senderId !== msg.senderId
                                );
                                const isOptimistic = msg.id.startsWith('opt-');

                                return (
                                    <div
                                        key={msg.id}
                                        className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}
                                    >
                                        {!isMe && showAvatar ? (
                                            <UserAvatar
                                                image={msg.sender?.image || otherUserImage}
                                                name={msg.sender?.name || otherUserName}
                                                className="w-8 h-8"
                                            />
                                        ) : !isMe ? (
                                            <div className="w-8" />
                                        ) : null}

                                        <div
                                            className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${isMe
                                                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-br-md'
                                                : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 rounded-bl-md'
                                                } ${isOptimistic ? 'opacity-70' : ''}`}
                                        >
                                            <p className="text-sm leading-relaxed">{msg.content}</p>
                                            <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : ''}`}>
                                                <span className={`text-[10px] ${isMe ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-400 dark:text-zinc-500'}`}>
                                                    {new Date(msg.createdAt).toLocaleTimeString([], {
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </span>
                                                {isMe && (
                                                    <span className="text-zinc-400 dark:text-zinc-500">
                                                        {isOptimistic ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : msg.read ? (
                                                            <CheckCheck className="w-3 h-3 text-blue-400" />
                                                        ) : (
                                                            <Check className="w-3 h-3" />
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {/* Typing indicator */}
                {otherUserTyping && (
                    <div className="flex items-center gap-2 mt-3">
                        <UserAvatar
                            image={otherUserImage}
                            name={otherUserName}
                            className="w-8 h-8"
                        />
                        <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl rounded-bl-md px-4 py-3">
                            <div className="flex gap-1">
                                <span className="w-2 h-2 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-2 h-2 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-2 h-2 bg-zinc-400 dark:bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-6 py-4 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
                <form onSubmit={handleSend} className="flex items-center gap-3">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={handleInputChange}
                        placeholder="Type a message..."
                        className="flex-1 bg-zinc-100 dark:bg-zinc-800 border-0 rounded-full px-5 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 transition-all"
                        disabled={isSending}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isSending}
                        className="w-11 h-11 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full flex items-center justify-center hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                    >
                        {isSending ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Send className="w-5 h-5" />
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
