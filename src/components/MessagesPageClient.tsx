'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Send, ArrowLeft, MoreVertical, Paperclip, AlertCircle, Ban, ShieldOff, WifiOff, CheckCheck, Loader2, MessageSquare, Trash2, ArrowDown } from 'lucide-react';
import CharacterCounter from '@/components/CharacterCounter';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { toast } from 'sonner';
import { getMessages, sendMessage, pollMessages, setTypingStatus, markAllMessagesAsRead, deleteConversation } from '@/app/actions/chat';
import { blockUser, unblockUser } from '@/app/actions/block';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import UserAvatar from '@/components/UserAvatar';
import { useBlockStatus } from '@/hooks/useBlockStatus';
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

const MESSAGE_MAX_LENGTH = 1000;

interface TypingUser {
    id: string;
    name: string | null;
}

interface Participant {
    id: string;
    name: string | null;
    image: string | null;
}

interface Message {
    id: string;
    content: string;
    senderId: string;
    createdAt: Date;
    read?: boolean;
    status?: 'sending' | 'sent' | 'failed';
    sender?: {
        id: string;
        name: string | null;
        image: string | null;
    };
}

interface Conversation {
    id: string;
    updatedAt: Date;
    participants: Participant[];
    messages: Message[];
    listing: {
        title: string;
    };
    unreadCount?: number;
}

interface MessagesPageClientProps {
    currentUserId: string;
    initialConversations: any[]; // Using any[] temporarily to match Prisma return type structure easily, or define strict type
}

export default function MessagesPageClient({ currentUserId, initialConversations }: MessagesPageClientProps) {
    const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [msgs, setMsgs] = useState<Message[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [showBlockDialog, setShowBlockDialog] = useState(false);
    const [isBlocking, setIsBlocking] = useState(false);
    const [isUnblocking, setIsUnblocking] = useState(false);
    const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const router = useRouter();
    const { isOffline } = useNetworkStatus();
    const [showDeleteConversationDialog, setShowDeleteConversationDialog] = useState(false);
    const [isDeletingConversation, setIsDeletingConversation] = useState(false);
    const [showScrollToBottom, setShowScrollToBottom] = useState(false);
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    // Calculate total unread count
    const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

    // Handle marking all messages as read
    const handleMarkAllAsRead = async () => {
        if (isMarkingAllRead || totalUnread === 0) return;

        setIsMarkingAllRead(true);
        try {
            const result = await markAllMessagesAsRead();
            if (result.error) {
                toast.error(result.error);
            } else {
                toast.success(`Marked ${result.count} messages as read`);
                // Update local state to reflect changes
                setConversations(prev => prev.map(c => ({ ...c, unreadCount: 0 })));
                router.refresh();
            }
        } catch (error) {
            toast.error('Failed to mark messages as read');
        } finally {
            setIsMarkingAllRead(false);
        }
    };

    // Get the other participant for the active conversation
    const activeConversation = conversations.find(c => c.id === activeId);
    const otherParticipant = activeConversation?.participants.find(p => p.id !== currentUserId);

    // Block status tracking for the active conversation
    const { blockStatus, isBlocked, refetch: refetchBlockStatus } = useBlockStatus(
        otherParticipant?.id,
        currentUserId
    );


    // Handle blocking a user
    const handleBlock = async () => {
        if (!otherParticipant?.id) return;
        setIsBlocking(true);
        try {
            const result = await blockUser(otherParticipant.id);
            if (result.error) {
                toast.error(result.error);
            } else {
                toast.success(`${otherParticipant.name || 'User'} has been blocked`);
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
        if (!otherParticipant?.id) return;
        setIsUnblocking(true);
        try {
            const result = await unblockUser(otherParticipant.id);
            if (result.error) {
                toast.error(result.error);
            } else {
                toast.success(`${otherParticipant.name || 'User'} has been unblocked`);
                refetchBlockStatus();
            }
        } catch (error) {
            toast.error('Failed to unblock user');
        } finally {
            setIsUnblocking(false);
        }
    };

    // Handle deleting a conversation
    const handleDeleteConversation = async () => {
        if (!activeId) return;
        setIsDeletingConversation(true);
        try {
            const result = await deleteConversation(activeId);
            if (result.error) {
                toast.error(result.error);
            } else {
                toast.success('Conversation deleted');
                setConversations(prev => prev.filter(c => c.id !== activeId));
                setActiveId(null);
                setMsgs([]);
                router.refresh();
            }
        } catch (error) {
            toast.error('Failed to delete conversation');
        } finally {
            setIsDeletingConversation(false);
            setShowDeleteConversationDialog(false);
        }
    };

    // Set active conversation if there are conversations
    useEffect(() => {
        if (initialConversations.length > 0 && !activeId) {
            setActiveId(initialConversations[0].id);
        }
    }, [initialConversations]);

    // Fetch messages when activeId changes
    useEffect(() => {
        async function fetchMessages() {
            if (!activeId) return;
            setLoadingMessages(true);
            try {
                const result = await getMessages(activeId);

                // Handle session expiry
                if (!Array.isArray(result) && result.code === 'SESSION_EXPIRED') {
                    router.push(`/login?callbackUrl=/messages`);
                    return;
                }

                // Extract messages array from result
                const messages = Array.isArray(result) ? result : (result.messages || []);
                setMsgs(messages);

                // Notify navbar to refresh unread count
                window.dispatchEvent(new Event('messagesRead'));
            } catch (error) {
                console.error('Failed to fetch messages:', error);
            } finally {
                setLoadingMessages(false);
            }
        }
        fetchMessages();
    }, [activeId]);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [msgs]);

    // Polling for new messages and typing status
    useEffect(() => {
        if (!activeId) return;

        const pollInterval = setInterval(async () => {
            try {
                const lastMessageId = msgs.length > 0 ? msgs[msgs.length - 1].id : undefined;
                // Only poll if we're not dealing with optimistic messages
                if (lastMessageId?.startsWith('opt-')) return;

                const result = await pollMessages(activeId, lastMessageId);

                // Update typing users
                setTypingUsers(result.typingUsers);

                // Add new messages if any
                if (result.hasNewMessages && result.messages.length > 0) {
                    setMsgs(prev => {
                        // Filter out any messages we already have
                        const existingIds = new Set(prev.map(m => m.id));
                        const newMessages = result.messages.filter((m: Message) => !existingIds.has(m.id));
                        return [...prev, ...newMessages];
                    });

                    // Notify navbar to refresh unread count
                    window.dispatchEvent(new Event('messagesRead'));
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 3000); // Poll every 3 seconds

        return () => clearInterval(pollInterval);
    }, [activeId, msgs]);

    // Handle typing status
    const handleInputChange = useCallback((value: string) => {
        setInput(value);

        if (!activeId) return;

        // Clear existing timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        // Set typing status to true
        if (!isTyping && value.length > 0) {
            setIsTyping(true);
            setTypingStatus(activeId, true);
        }

        // Set timeout to clear typing status after 2 seconds of no typing
        typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
            if (activeId) {
                setTypingStatus(activeId, false);
            }
        }, 2000);
    }, [activeId, isTyping]);

    // Clear typing status when conversation changes or component unmounts
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            if (activeId && isTyping) {
                setTypingStatus(activeId, false);
            }
        };
    }, [activeId, isTyping]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !activeId) return;

        // Block if offline
        if (isOffline) {
            toast.error('You are offline', {
                description: 'Please check your internet connection to send messages.'
            });
            return;
        }

        const content = input.trim();

        // Length validation
        if (content.length > MESSAGE_MAX_LENGTH) {
            toast.error('Message too long', {
                description: `Maximum ${MESSAGE_MAX_LENGTH} characters allowed.`
            });
            return;
        }
        setInput('');

        // Clear typing status when sending
        setIsTyping(false);
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }
        setTypingStatus(activeId, false);

        // Optimistic update
        const optimisticId = 'opt-' + Date.now();
        const optimisticMessage: Message = {
            id: optimisticId,
            content,
            senderId: currentUserId,
            createdAt: new Date(),
            status: 'sending',
        };
        setMsgs(prev => [...prev, optimisticMessage]);

        const result = await sendMessage(activeId, content);

        // Check for error response
        if ('error' in result) {
            // Handle session expiry
            if (result.code === 'SESSION_EXPIRED') {
                sessionStorage.setItem(`chat_draft_${activeId}`, content);
                router.push(`/login?callbackUrl=/messages`);
                return;
            }

            // Mark message as failed for other errors
            setMsgs(prev => prev.map(m =>
                m.id === optimisticId
                    ? { ...m, status: 'failed' }
                    : m
            ));
            toast.error('Failed to send message. Tap to retry.');
            return;
        }

        // Success - replace optimistic message with sent message
        const sentMessage = result;
        setMsgs(prev => prev.map(m => m.id === optimisticId ? { ...sentMessage, sender: undefined, status: 'sent' as const } : m));

        // Update conversation list to show latest message
        setConversations(prev => prev.map(c => {
            if (c.id === activeId) {
                return {
                    ...c,
                    updatedAt: new Date(),
                    messages: [sentMessage as Message] // Update preview
                };
            }
            return c;
        }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    };

    const handleRetry = async (failedMessageId: string, content: string) => {
        if (!activeId) return;

        // Remove failed message
        setMsgs(prev => prev.filter(m => m.id !== failedMessageId));

        // Create new optimistic message and retry
        const newOptimisticId = 'opt-' + Date.now();
        const optimisticMessage: Message = {
            id: newOptimisticId,
            content,
            senderId: currentUserId,
            createdAt: new Date(),
            status: 'sending',
        };
        setMsgs(prev => [...prev, optimisticMessage]);

        const result = await sendMessage(activeId, content);

        // Check for error response
        if ('error' in result) {
            // Handle session expiry
            if (result.code === 'SESSION_EXPIRED') {
                sessionStorage.setItem(`chat_draft_${activeId}`, content);
                router.push(`/login?callbackUrl=/messages`);
                return;
            }

            // Mark message as failed for other errors
            setMsgs(prev => prev.map(m =>
                m.id === newOptimisticId
                    ? { ...m, status: 'failed' }
                    : m
            ));
            toast.error('Failed to send message. Tap to retry.');
            return;
        }

        // Success - replace optimistic message with sent message
        const sentMessage = result;
        setMsgs(prev => prev.map(m =>
            m.id === newOptimisticId
                ? { ...sentMessage, sender: undefined, status: 'sent' as const }
                : m
        ));

        // Update conversation list
        setConversations(prev => prev.map(c => {
            if (c.id === activeId) {
                return {
                    ...c,
                    updatedAt: new Date(),
                    messages: [sentMessage as Message]
                };
            }
            return c;
        }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    };

    // Filter conversations based on search query
    const filteredConversations = conversations.filter(c => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        const other = c.participants.find(p => p.id !== currentUserId);
        const lastMsg = c.messages[0];

        return (
            other?.name?.toLowerCase().includes(query) ||
            c.listing.title.toLowerCase().includes(query) ||
            lastMsg?.content.toLowerCase().includes(query)
        );
    });

    return (
        <div className="fixed inset-0 z-40 bg-white dark:bg-zinc-950 flex overflow-hidden font-sans selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-black pt-[80px]">
            {/* Sidebar */}
            <div className={`w-full md:w-[400px] flex flex-col border-r border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 ${activeId ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-6 border-b border-zinc-50 dark:border-zinc-800">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Messages</h1>
                            {totalUnread > 0 && (
                                <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-semibold rounded-full">
                                    {totalUnread > 99 ? '99+' : totalUnread}
                                </span>
                            )}
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-full" aria-label="More options">
                                    <MoreVertical className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    onClick={handleMarkAllAsRead}
                                    disabled={totalUnread === 0 || isMarkingAllRead}
                                    className="cursor-pointer"
                                >
                                    {isMarkingAllRead ? (
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                                    ) : (
                                        <CheckCheck className="w-4 h-4 mr-2" aria-hidden="true" />
                                    )}
                                    Mark all as read
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search conversations..."
                            className="w-full bg-zinc-50 dark:bg-zinc-900 h-10 pl-10 rounded-xl text-sm text-zinc-900 dark:text-white placeholder:text-zinc-600 dark:placeholder:text-zinc-300 outline-none focus:bg-zinc-100 dark:focus:bg-zinc-800 transition-colors"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {filteredConversations.map(c => {
                        const other = c.participants.find(p => p.id !== currentUserId);
                        const lastMsg = c.messages[0];
                        const hasUnread = (c.unreadCount || 0) > 0;
                        return (
                            <div key={c.id} onClick={() => setActiveId(c.id)} className={`px-6 py-4 flex gap-4 cursor-pointer transition-colors border-l-4 ${activeId === c.id ? 'bg-zinc-50 dark:bg-zinc-900 border-zinc-900 dark:border-white' : 'bg-white dark:bg-zinc-950 border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-900'}`}>
                                <div className="relative">
                                    <UserAvatar image={other?.image} name={other?.name} size="lg" />
                                    {hasUnread && (
                                        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-sm">
                                            {c.unreadCount! > 99 ? '99+' : c.unreadCount}
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <h3 className={`font-semibold text-sm truncate ${hasUnread ? 'text-zinc-900 dark:text-white' : activeId === c.id ? 'text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-300'}`}>{other?.name || 'Unknown User'}</h3>
                                        <span className={`text-2xs ${hasUnread ? 'text-red-500 font-semibold' : 'text-zinc-400 dark:text-zinc-500'}`}>
                                            {lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </span>
                                    </div>
                                    <p className={`text-sm truncate ${hasUnread ? 'text-zinc-900 dark:text-white font-medium' : 'text-zinc-500 dark:text-zinc-400'}`}>
                                        {lastMsg ? (lastMsg.senderId === currentUserId ? `You: ${lastMsg.content}` : lastMsg.content) : 'No messages yet'}
                                    </p>
                                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{c.listing.title}</p>
                                </div>
                            </div>
                        );
                    })}
                    {filteredConversations.length === 0 && (
                        <div className="p-8 text-center">
                            {searchQuery.trim() ? (
                                <p className="text-zinc-500 dark:text-zinc-400">No conversations match your search</p>
                            ) : (
                                <div className="space-y-4">
                                    <div className="w-16 h-16 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                                        <MessageSquare className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-zinc-900 dark:text-white mb-1">No conversations yet</h3>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                                            Start chatting by contacting a listing host
                                        </p>
                                    </div>
                                    <Link
                                        href="/search"
                                        className="inline-flex items-center justify-center px-6 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full font-medium text-sm hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                                    >
                                        Browse Listings
                                    </Link>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className={`flex-1 flex flex-col bg-white dark:bg-zinc-950 ${!activeId ? 'hidden md:flex' : 'flex'}`}>
                {activeId && activeConversation ? (
                    <>
                        {/* Header */}
                        <header className="h-[72px] px-6 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setActiveId(null)} className="md:hidden p-2 -ml-2 text-zinc-500 dark:text-zinc-400"><ArrowLeft className="w-5 h-5" /></button>
                                <div className={`flex items-center gap-3 ${isBlocked ? 'opacity-50 grayscale' : ''}`}>
                                    <UserAvatar image={otherParticipant?.image} name={otherParticipant?.name} size="sm" />
                                    <div>
                                        <span className={`font-bold block ${isBlocked ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-900 dark:text-white'}`}>
                                            {otherParticipant?.name || 'Unknown User'}
                                        </span>
                                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                            {isBlocked
                                                ? (blockStatus === 'blocker' ? 'Blocked' : 'You are blocked')
                                                : activeConversation.listing.title
                                            }
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Block/Unblock Menu */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors" aria-label="More options">
                                        <MoreVertical className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
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
                                    <DropdownMenuItem
                                        onClick={() => setShowDeleteConversationDialog(true)}
                                        className="text-red-600 dark:text-red-400"
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete Conversation
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </header>

                        {/* Block Confirmation Dialog */}
                        <AlertDialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Block {otherParticipant?.name}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        You won't be able to message each other. They won't be notified that you blocked them.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel disabled={isBlocking}>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleBlock}
                                        disabled={isBlocking}
                                        aria-busy={isBlocking}
                                        className="bg-red-600 hover:bg-red-700 text-white"
                                    >
                                        {isBlocking ? 'Blocking...' : 'Block'}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>

                        {/* Delete Conversation Confirmation Dialog */}
                        <AlertDialog open={showDeleteConversationDialog} onOpenChange={setShowDeleteConversationDialog}>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will remove this conversation from your view. The other participant may still see it.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel disabled={isDeletingConversation}>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleDeleteConversation}
                                        disabled={isDeletingConversation}
                                        aria-busy={isDeletingConversation}
                                        className="bg-red-600 hover:bg-red-700 text-white"
                                    >
                                        {isDeletingConversation ? 'Deleting...' : 'Delete'}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>

                        {/* Messages */}
                        <div
                            ref={messagesContainerRef}
                            className="flex-1 overflow-y-auto p-6 space-y-4 relative"
                            onScroll={(e) => {
                                const target = e.target as HTMLDivElement;
                                const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
                                setShowScrollToBottom(!isNearBottom && target.scrollHeight > target.clientHeight);
                            }}
                        >
                            {loadingMessages ? (
                                <div className="flex justify-center p-4" role="status" aria-label="Loading messages"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-900 dark:border-white" aria-hidden="true"></div></div>
                            ) : (
                                msgs.map(m => (
                                    <div key={m.id} className={`flex ${m.senderId === currentUserId ? 'justify-end' : 'justify-start'}`}>
                                        <div
                                            onClick={m.status === 'failed' ? () => handleRetry(m.id, m.content) : undefined}
                                            className={`
                                                max-w-[70%] px-5 py-2.5 text-sm leading-relaxed shadow-sm
                                                ${m.senderId === currentUserId
                                                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl rounded-tr-sm'
                                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-2xl rounded-tl-sm'}
                                                ${m.status === 'sending' ? 'opacity-70' : ''}
                                                ${m.status === 'failed'
                                                    ? '!bg-red-100 dark:!bg-red-900/30 !text-red-900 dark:!text-red-100 border-2 border-red-500 cursor-pointer hover:border-red-600'
                                                    : ''}
                                            `}
                                        >
                                            {m.content}
                                            {m.status === 'failed' && (
                                                <div className="flex items-center gap-1 mt-2 text-red-600 dark:text-red-400 text-xs">
                                                    <AlertCircle className="w-3 h-3" />
                                                    <span>Failed to send. Tap to retry</span>
                                                </div>
                                            )}
                                            {/* Read receipt indicator for sent messages */}
                                            {m.senderId === currentUserId && m.status !== 'failed' && m.status !== 'sending' && (
                                                <div className={`flex items-center justify-end gap-1 mt-1 text-2xs ${m.read ? 'text-blue-400' : 'text-white/50 dark:text-zinc-600'}`}>
                                                    <CheckCheck className="w-3 h-3" />
                                                    <span>{m.read ? 'Read' : 'Delivered'}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}

                            {/* Typing Indicator */}
                            {typingUsers.length > 0 && (
                                <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                                    <div className="flex gap-1">
                                        <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                    <span>
                                        {typingUsers.map(u => u.name || 'Someone').join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                                    </span>
                                </div>
                            )}

                            <div ref={messagesEndRef} />

                            {/* Scroll to Latest Button */}
                            {showScrollToBottom && (
                                <button
                                    onClick={() => {
                                        messagesContainerRef.current?.scrollTo({
                                            top: messagesContainerRef.current.scrollHeight,
                                            behavior: 'smooth'
                                        });
                                        setShowScrollToBottom(false);
                                    }}
                                    className="fixed bottom-28 right-8 z-10 flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full shadow-lg hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
                                    aria-label="Scroll to latest messages"
                                >
                                    <ArrowDown className="w-4 h-4" />
                                    <span className="text-sm font-medium">New messages</span>
                                </button>
                            )}
                        </div>

                        {/* Input or Blocked Banner */}
                        {isBlocked ? (
                            <BlockedConversationBanner
                                blockStatus={blockStatus}
                                otherUserName={otherParticipant?.name || undefined}
                                onUnblock={blockStatus === 'blocker' ? handleUnblock : undefined}
                                isUnblocking={isUnblocking}
                            />
                        ) : (
                            <div className="p-4 md:p-6 space-y-2">
                                {/* Offline Banner */}
                                {isOffline && (
                                    <div className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                                        <WifiOff className="w-4 h-4" />
                                        <span>You&apos;re offline. Messages will be sent when you reconnect.</span>
                                    </div>
                                )}
                                <form onSubmit={handleSend} className="flex items-end gap-2 bg-zinc-50 dark:bg-zinc-900 p-2 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 focus-within:bg-white dark:focus-within:bg-zinc-800 focus-within:shadow-lg transition-all">
                                    <button
                                        type="button"
                                        onClick={() => toast.info('Attachments coming soon!', { description: 'File sharing feature is currently in development.' })}
                                        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
                                        aria-label="Attachments coming soon"
                                    >
                                        <Paperclip className="w-5 h-5" />
                                    </button>
                                    <input
                                        value={input}
                                        onChange={e => handleInputChange(e.target.value)}
                                        placeholder={isOffline ? "You're offline..." : "Type a message..."}
                                        maxLength={MESSAGE_MAX_LENGTH}
                                        className="flex-1 bg-transparent border-none outline-none py-3 px-2 text-zinc-900 dark:text-white placeholder:text-zinc-600 dark:placeholder:text-zinc-300"
                                    />
                                    <button type="submit" disabled={!input.trim() || isOffline} className="min-w-[44px] min-h-[44px] bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full flex items-center justify-center hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-60 transition-all" aria-label="Send message"><Send className="w-4 h-4 ml-0.5" /></button>
                                </form>
                                {/* Character counter - show when user is typing */}
                                {input.length > 0 && (
                                    <CharacterCounter current={input.length} max={MESSAGE_MAX_LENGTH} />
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-zinc-400 dark:text-zinc-500">Select a conversation</div>
                )}
            </div>
        </div>
    );
}
