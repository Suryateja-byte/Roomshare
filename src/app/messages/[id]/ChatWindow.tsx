'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase, createChatChannel, broadcastTyping, trackPresence, safeRemoveChannel } from '@/lib/supabase';
import { sendMessage, getMessages } from '@/app/actions/chat';
import { blockUser, unblockUser } from '@/app/actions/block';
import { useRouter } from 'next/navigation';
import { Send, Loader2, Check, CheckCheck, MoreVertical, Ban, ShieldOff, WifiOff, AlertCircle, RotateCw } from 'lucide-react';
import UserAvatar from '@/components/UserAvatar';
import { useDebouncedCallback } from 'use-debounce';
import { useBlockStatus } from '@/hooks/useBlockStatus';
import { useRateLimitHandler } from '@/hooks/useRateLimitHandler';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import RateLimitCountdown from '@/components/RateLimitCountdown';
import CharacterCounter from '@/components/CharacterCounter';
import BlockedConversationBanner from '@/components/chat/BlockedConversationBanner';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Message = {
    id: string;
    content: string;
    senderId: string;
    createdAt: Date;
    read?: boolean;
    failed?: boolean;
    sender?: {
        name: string | null;
        image: string | null;
    };
};

const MESSAGE_MAX_LENGTH = 500;

interface ChatWindowProps {
    initialMessages: Message[];
    conversationId: string;
    currentUserId: string;
    currentUserName?: string;
    otherUserId: string;
    otherUserName?: string;
    otherUserImage?: string | null;
}

export default function ChatWindow({
    initialMessages,
    conversationId,
    currentUserId,
    currentUserName,
    otherUserId,
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
    const [showBlockDialog, setShowBlockDialog] = useState(false);
    const [isBlocking, setIsBlocking] = useState(false);
    const [isUnblocking, setIsUnblocking] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const channelRef = useRef<RealtimeChannel | null>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const router = useRouter();
    const lastMessageIdRef = useRef<string | null>(
        initialMessages.length > 0 ? initialMessages[initialMessages.length - 1].id : null
    );

    // Block status tracking
    const { blockStatus, isBlocked, refetch: refetchBlockStatus } = useBlockStatus(otherUserId, currentUserId);

    // Rate limit handling
    const { isRateLimited, retryAfter, handleError: handleRateLimitError, reset: resetRateLimit } = useRateLimitHandler();

    // Network status tracking
    const { isOffline } = useNetworkStatus();

    // Handle blocking a user
    const handleBlock = async () => {
        setIsBlocking(true);
        try {
            const result = await blockUser(otherUserId);
            if (result.error) {
                toast.error(result.error);
            } else {
                toast.success(`${otherUserName || 'User'} has been blocked`);
                refetchBlockStatus();
            }
        } catch (error) {
            toast.error('Failed to block user');
        } finally {
            setIsBlocking(false);
            setShowBlockDialog(false);
        }
    };

    // Handle unblocking a user
    const handleUnblock = async () => {
        setIsUnblocking(true);
        try {
            const result = await unblockUser(otherUserId);
            if (result.error) {
                toast.error(result.error);
            } else {
                toast.success(`${otherUserName || 'User'} has been unblocked`);
                refetchBlockStatus();
            }
        } catch (error) {
            toast.error('Failed to unblock user');
        } finally {
            setIsUnblocking(false);
        }
    };

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    // Warn user when navigating away during message send or with unsaved input
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            // Warn if sending a message
            if (isSending) {
                e.preventDefault();
                e.returnValue = 'Your message is still being sent. Are you sure you want to leave?';
                return e.returnValue;
            }

            // Warn if there's unsent text in the input
            if (input.trim().length > 0) {
                e.preventDefault();
                e.returnValue = 'You have an unsent message. Are you sure you want to leave?';
                return e.returnValue;
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isSending, input]);

    // Restore draft and focus input on mount
    useEffect(() => {
        // Check for saved draft from session expiry
        const draftKey = `chat_draft_${conversationId}`;
        const savedDraft = sessionStorage.getItem(draftKey);
        if (savedDraft) {
            setInput(savedDraft);
            sessionStorage.removeItem(draftKey);
            toast.info('Your message draft was restored');
        }
        inputRef.current?.focus();
    }, [conversationId]);

    // Dispatch event when messages are read
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('messagesRead'));
    }, []);

    // Debounced function to broadcast typing stopped
    const stopTypingBroadcast = useDebouncedCallback(() => {
        if (channelRef.current && connectionStatus === 'connected') {
            broadcastTyping(channelRef.current, currentUserId, currentUserName || '', false);
        }
        setIsTyping(false);
    }, 2000);

    // Handle input change with typing indicator
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);

        if (e.target.value && !isTyping) {
            setIsTyping(true);
            if (channelRef.current && connectionStatus === 'connected') {
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
                    // Track presence with defensive checks
                    .on('presence', { event: 'sync' }, () => {
                        if (!channel || typeof channel.presenceState !== 'function') return;
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
                            if (!channel || typeof channel.presenceState !== 'function') return;
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
                            // Track our presence using the wrapper with defensive checks
                            await trackPresence(channel, currentUserId, currentUserName || 'User');
                        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                            setConnectionStatus('disconnected');
                        }
                    });
            }
        }

        // Always set up polling as fallback (every 5 seconds)
        pollInterval = setInterval(pollForMessages, 5000);

        return () => {
            safeRemoveChannel(channelRef.current);
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

        // Block sending when offline
        if (isOffline) {
            toast.error('You are offline. Please check your connection.');
            return;
        }

        if (!input.trim() || isSending || isRateLimited) return;

        const content = input.trim();
        setInput('');
        setIsSending(true);
        setIsTyping(false);

        // Broadcast that we stopped typing
        if (channelRef.current && connectionStatus === 'connected') {
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
            const result = await sendMessage(conversationId, content);

            // Check for session expiry or other errors
            if (result && 'error' in result) {
                if (result.code === 'SESSION_EXPIRED') {
                    // Remove optimistic message and save draft before redirect
                    setMessages(prev => prev.filter(m => m.id !== optimisticId));
                    sessionStorage.setItem(`chat_draft_${conversationId}`, content);
                    toast.error('Your session has expired. Redirecting to login...');
                    router.push(`/login?callbackUrl=/messages/${conversationId}`);
                    return;
                }

                // Check for rate limit error
                if (handleRateLimitError(result)) {
                    // Remove optimistic message and restore the message to input
                    setMessages(prev => prev.filter(m => m.id !== optimisticId));
                    setInput(content);
                    return;
                }

                // Mark message as failed instead of removing it
                setMessages(prev => prev.map(m =>
                    m.id === optimisticId ? { ...m, failed: true } : m
                ));
                toast.error(result.error || 'Failed to send message. Tap to retry.');
                return;
            }

            // Replace optimistic message with real one
            setMessages(prev => prev.map(m =>
                m.id === optimisticId ? { ...result, sender: m.sender } : m
            ));
            lastMessageIdRef.current = result.id;
        } catch (error) {
            console.error('Failed to send message:', error);
            // Mark message as failed instead of removing it
            setMessages(prev => prev.map(m =>
                m.id === optimisticId ? { ...m, failed: true } : m
            ));
            toast.error('Failed to send message. Tap to retry.');
        } finally {
            setIsSending(false);
            inputRef.current?.focus();
        }
    };

    // Retry sending a failed message
    const handleRetry = async (failedMessage: Message) => {
        if (isSending || isRateLimited || isOffline) return;

        const content = failedMessage.content;
        const failedId = failedMessage.id;

        // Mark as sending (remove failed status)
        setMessages(prev => prev.map(m =>
            m.id === failedId ? { ...m, failed: false } : m
        ));
        setIsSending(true);

        try {
            const result = await sendMessage(conversationId, content);

            if (result && 'error' in result) {
                if (result.code === 'SESSION_EXPIRED') {
                    setMessages(prev => prev.filter(m => m.id !== failedId));
                    sessionStorage.setItem(`chat_draft_${conversationId}`, content);
                    toast.error('Your session has expired. Redirecting to login...');
                    router.push(`/login?callbackUrl=/messages/${conversationId}`);
                    return;
                }

                if (handleRateLimitError(result)) {
                    setMessages(prev => prev.filter(m => m.id !== failedId));
                    setInput(content);
                    return;
                }

                // Still failed - mark as failed again
                setMessages(prev => prev.map(m =>
                    m.id === failedId ? { ...m, failed: true } : m
                ));
                toast.error(result.error || 'Failed to send message. Tap to retry.');
                return;
            }

            // Success - replace with real message
            setMessages(prev => prev.map(m =>
                m.id === failedId ? { ...result, sender: m.sender } : m
            ));
            lastMessageIdRef.current = result.id;
            toast.success('Message sent');
        } catch (error) {
            console.error('Failed to retry message:', error);
            setMessages(prev => prev.map(m =>
                m.id === failedId ? { ...m, failed: true } : m
            ));
            toast.error('Failed to send message. Tap to retry.');
        } finally {
            setIsSending(false);
        }
    };

    // Delete a failed message
    const handleDeleteFailed = (messageId: string) => {
        setMessages(prev => prev.filter(m => m.id !== messageId));
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
                <div className={`relative ${isBlocked ? 'opacity-50 grayscale' : ''}`}>
                    <UserAvatar
                        image={otherUserImage}
                        name={otherUserName}
                        className="w-10 h-10"
                    />
                    {connectionStatus === 'connected' && isOnline && !isBlocked && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-zinc-900" />
                    )}
                </div>
                <div className="flex-1">
                    <h3 className={`font-semibold ${isBlocked ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-900 dark:text-white'}`}>
                        {otherUserName || 'Chat'}
                    </h3>
                    <p className={`text-xs ${isBlocked
                        ? 'text-zinc-400 dark:text-zinc-500'
                        : otherUserTyping
                            ? 'text-green-600 dark:text-green-400 font-medium'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}>
                        {isBlocked ? (blockStatus === 'blocker' ? 'Blocked' : 'You are blocked') : getStatusText()}
                    </p>
                </div>

                {/* Block/Unblock Menu */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                            <MoreVertical className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {blockStatus === 'blocker' ? (
                            <DropdownMenuItem
                                onClick={handleUnblock}
                                disabled={isUnblocking}
                                className="text-zinc-700 dark:text-zinc-300"
                            >
                                <ShieldOff className="w-4 h-4 mr-2" />
                                {isUnblocking ? 'Unblocking...' : 'Unblock User'}
                            </DropdownMenuItem>
                        ) : blockStatus !== 'blocked' && (
                            <DropdownMenuItem
                                onClick={() => setShowBlockDialog(true)}
                                className="text-red-600 dark:text-red-400"
                            >
                                <Ban className="w-4 h-4 mr-2" />
                                Block User
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Block Confirmation Dialog */}
            <AlertDialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Block {otherUserName}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            You won't be able to message each other. They won't be notified that you blocked them.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isBlocking}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleBlock}
                            disabled={isBlocking}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {isBlocking ? 'Blocking...' : 'Block'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

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
                                                ? msg.failed
                                                    ? 'bg-red-900/80 dark:bg-red-100 text-white dark:text-red-900 rounded-br-md border-2 border-red-500'
                                                    : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-br-md'
                                                : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 rounded-bl-md'
                                                } ${isOptimistic && !msg.failed ? 'opacity-70' : ''}`}
                                        >
                                            <p className="text-sm leading-relaxed">{msg.content}</p>
                                            <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : ''}`}>
                                                <span className={`text-2xs ${isMe ? (msg.failed ? 'text-red-300 dark:text-red-700' : 'text-zinc-400 dark:text-zinc-500') : 'text-zinc-400 dark:text-zinc-500'}`}>
                                                    {new Date(msg.createdAt).toLocaleTimeString([], {
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </span>
                                                {isMe && (
                                                    <span className={msg.failed ? 'text-red-400 dark:text-red-600' : 'text-zinc-400 dark:text-zinc-500'}>
                                                        {msg.failed ? (
                                                            <AlertCircle className="w-3 h-3" />
                                                        ) : isOptimistic ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : msg.read ? (
                                                            <CheckCheck className="w-3 h-3 text-blue-400" />
                                                        ) : (
                                                            <Check className="w-3 h-3" />
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Failed message actions */}
                                            {msg.failed && (
                                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-red-400/30">
                                                    <button
                                                        onClick={() => handleRetry(msg)}
                                                        disabled={isSending || isOffline}
                                                        className="flex items-center gap-1 text-xs text-white dark:text-red-900 hover:text-red-200 dark:hover:text-red-700 disabled:opacity-50 transition-colors"
                                                    >
                                                        <RotateCw className="w-3 h-3" />
                                                        Retry
                                                    </button>
                                                    <span className="text-red-400/50">|</span>
                                                    <button
                                                        onClick={() => handleDeleteFailed(msg.id)}
                                                        className="text-xs text-white dark:text-red-900 hover:text-red-200 dark:hover:text-red-700 transition-colors"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            )}
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

            {/* Input or Blocked Banner */}
            {isBlocked ? (
                <BlockedConversationBanner
                    blockStatus={blockStatus}
                    otherUserName={otherUserName}
                    onUnblock={blockStatus === 'blocker' ? handleUnblock : undefined}
                    isUnblocking={isUnblocking}
                />
            ) : (
                <div className="px-6 py-4 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                    {/* Offline banner */}
                    {isOffline && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-sm text-zinc-600 dark:text-zinc-400">
                            <WifiOff className="w-4 h-4 flex-shrink-0" />
                            <span>You&apos;re offline. Messages will send when reconnected.</span>
                        </div>
                    )}
                    {/* Rate limit countdown */}
                    {isRateLimited && (
                        <RateLimitCountdown
                            retryAfterSeconds={retryAfter}
                            onRetryReady={resetRateLimit}
                        />
                    )}
                    <form onSubmit={handleSend} className="flex items-center gap-3">
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={handleInputChange}
                            placeholder={isOffline ? "You're offline..." : "Type a message..."}
                            maxLength={MESSAGE_MAX_LENGTH}
                            className="flex-1 bg-zinc-100 dark:bg-zinc-800 border-0 rounded-full px-5 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 transition-all"
                            disabled={isSending}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isSending || isRateLimited || isOffline}
                            className="w-11 h-11 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full flex items-center justify-center hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                        >
                            {isSending ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <Send className="w-5 h-5" />
                            )}
                        </button>
                    </form>
                    {input.length > 0 && (
                        <CharacterCounter current={input.length} max={MESSAGE_MAX_LENGTH} />
                    )}
                </div>
            )}
        </div>
    );
}
