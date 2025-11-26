'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, Send, ArrowLeft, MoreVertical, Paperclip } from 'lucide-react';
import { getMessages, sendMessage } from '@/app/actions/chat';
import { useRouter } from 'next/navigation';
import UserAvatar from '@/components/UserAvatar';

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
}

interface MessagesPageClientProps {
    currentUserId: string;
    initialConversations: any[]; // Using any[] temporarily to match Prisma return type structure easily, or define strict type
}

export default function MessagesPageClient({ currentUserId, initialConversations }: MessagesPageClientProps) {
    const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [msgs, setMsgs] = useState<Message[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

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
                const messages = await getMessages(activeId);
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

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !activeId) return;

        const content = input.trim();
        setInput('');

        // Optimistic update
        const optimisticId = 'opt-' + Date.now();
        const optimisticMessage: Message = {
            id: optimisticId,
            content,
            senderId: currentUserId,
            createdAt: new Date(),
        };
        setMsgs(prev => [...prev, optimisticMessage]);

        try {
            const sentMessage = await sendMessage(activeId, content);
            // Replace optimistic message
            setMsgs(prev => prev.map(m => m.id === optimisticId ? { ...sentMessage, sender: undefined } : m));

            // Update conversation list to show latest message
            setConversations(prev => prev.map(c => {
                if (c.id === activeId) {
                    return {
                        ...c,
                        updatedAt: new Date(),
                        messages: [sentMessage] // Update preview
                    };
                }
                return c;
            }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));

        } catch (error) {
            console.error('Failed to send message:', error);
            setMsgs(prev => prev.filter(m => m.id !== optimisticId));
        }
    };

    const activeConversation = conversations.find(c => c.id === activeId);
    const otherParticipant = activeConversation?.participants.find(p => p.id !== currentUserId);

    return (
        <div className="fixed inset-0 z-40 bg-white flex overflow-hidden font-sans selection:bg-zinc-900 selection:text-white pt-[80px]">
            {/* Sidebar */}
            <div className={`w-full md:w-[400px] flex flex-col border-r border-zinc-100 bg-white ${activeId ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-6 border-b border-zinc-50">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
                        <button className="p-2 hover:bg-zinc-50 rounded-full"><MoreVertical className="w-5 h-5 text-zinc-400" /></button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input placeholder="Search" className="w-full bg-zinc-50 h-10 pl-10 rounded-xl text-sm outline-none focus:bg-zinc-100 transition-colors" />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {conversations.map(c => {
                        const other = c.participants.find(p => p.id !== currentUserId);
                        const lastMsg = c.messages[0];
                        return (
                            <div key={c.id} onClick={() => setActiveId(c.id)} className={`px-6 py-4 flex gap-4 cursor-pointer transition-colors border-l-4 ${activeId === c.id ? 'bg-zinc-50 border-zinc-900' : 'bg-white border-transparent hover:bg-zinc-50'}`}>
                                <UserAvatar image={other?.image} name={other?.name} size="lg" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <h3 className={`font-semibold text-sm truncate ${activeId === c.id ? 'text-zinc-900' : 'text-zinc-700'}`}>{other?.name || 'Unknown User'}</h3>
                                        <span className="text-[10px] text-zinc-400">
                                            {lastMsg ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                        </span>
                                    </div>
                                    <p className="text-sm truncate text-zinc-500">
                                        {lastMsg ? (lastMsg.senderId === currentUserId ? `You: ${lastMsg.content}` : lastMsg.content) : 'No messages yet'}
                                    </p>
                                    <p className="text-xs text-zinc-400 mt-1">{c.listing.title}</p>
                                </div>
                            </div>
                        );
                    })}
                    {conversations.length === 0 && (
                        <div className="p-6 text-center text-zinc-500">No conversations yet</div>
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className={`flex-1 flex flex-col bg-white ${!activeId ? 'hidden md:flex' : 'flex'}`}>
                {activeId && activeConversation ? (
                    <>
                        {/* Header */}
                        <header className="h-[72px] px-6 flex items-center justify-between border-b border-zinc-100">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setActiveId(null)} className="md:hidden p-2 -ml-2 text-zinc-500"><ArrowLeft className="w-5 h-5" /></button>
                                <div className="flex items-center gap-3">
                                    <UserAvatar image={otherParticipant?.image} name={otherParticipant?.name} size="sm" />
                                    <div>
                                        <span className="font-bold text-zinc-900 block">{otherParticipant?.name || 'Unknown User'}</span>
                                        <span className="text-xs text-zinc-500">{activeConversation.listing.title}</span>
                                    </div>
                                </div>
                            </div>
                        </header>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {loadingMessages ? (
                                <div className="flex justify-center p-4"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-900"></div></div>
                            ) : (
                                msgs.map(m => (
                                    <div key={m.id} className={`flex ${m.senderId === currentUserId ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[70%] px-5 py-2.5 text-[15px] leading-relaxed shadow-sm ${m.senderId === currentUserId ? 'bg-zinc-900 text-white rounded-2xl rounded-tr-sm' : 'bg-zinc-100 text-zinc-900 rounded-2xl rounded-tl-sm'}`}>
                                            {m.content}
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="p-4 md:p-6">
                            <form onSubmit={handleSend} className="flex items-end gap-2 bg-zinc-50 p-2 rounded-[2rem] border border-zinc-100 focus-within:bg-white focus-within:shadow-lg transition-all">
                                <button type="button" className="p-2 text-zinc-400 hover:text-zinc-600"><Paperclip className="w-5 h-5" /></button>
                                <input value={input} onChange={e => setInput(e.target.value)} placeholder="Type a message..." className="flex-1 bg-transparent border-none outline-none py-3 px-2 text-zinc-900 placeholder:text-zinc-400" />
                                <button type="submit" disabled={!input.trim()} className="w-10 h-10 bg-zinc-900 text-white rounded-full flex items-center justify-center hover:bg-zinc-800 disabled:opacity-50 transition-all"><Send className="w-4 h-4 ml-0.5" /></button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-zinc-400">Select a conversation</div>
                )}
            </div>
        </div>
    );
}
