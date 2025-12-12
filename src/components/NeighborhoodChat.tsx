'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, X, Bot, ChevronDown, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';

// Import intent detection and policy modules
import { detectNearbyIntent, type NearbyIntentResult } from '@/lib/nearby-intent';
import { checkFairHousingPolicy, POLICY_REFUSAL_MESSAGE } from '@/lib/fair-housing-policy';
import { useNearbySearchRateLimit, RATE_LIMIT_CONFIG } from '@/hooks/useNearbySearchRateLimit';
import { logSearchTrigger, logBlockedSearch } from '@/lib/logNearbySearch';
import NearbyPlacesCard from '@/components/chat/NearbyPlacesCard';

interface NeighborhoodChatProps {
  latitude: number;
  longitude: number;
  listingId?: string;
}

/**
 * Custom message type to support both text and nearby places cards.
 */
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  type: 'text' | 'nearby-places' | 'policy-refusal' | 'rate-limit';
  content?: string;
  nearbyPlacesData?: {
    queryText: string;
    normalizedIntent: NearbyIntentResult;
  };
}

const SUGGESTED_QUESTIONS = [
  { emoji: '🛒', text: 'Indian grocery nearby?' },
  { emoji: '🚇', text: 'Public transit?' },
  { emoji: '🌳', text: 'Parks nearby?' },
  { emoji: '🏥', text: 'Hospitals?' },
];

const MAX_INPUT_LENGTH = 500;

// Helper to extract text content from a UIMessage
function getMessageContent(msg: UIMessage): string {
  if (!msg.parts) return '';
  return msg.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

// Generate unique message ID
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export default function NeighborhoodChat({ latitude, longitude, listingId }: NeighborhoodChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [customMessages, setCustomMessages] = useState<ChatMessage[]>([]);
  const [isProcessingLocally, setIsProcessingLocally] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Use coordinates as listing identifier for rate limiting if listingId not provided
  const rateLimitKey = listingId || `${latitude.toFixed(4)}_${longitude.toFixed(4)}`;
  const { canSearch, remainingSearches, isDebounceBusy, incrementCount } =
    useNearbySearchRateLimit(rateLimitKey);

  // Create transport with memoization
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: { latitude, longitude },
      }),
    [latitude, longitude]
  );

  const {
    messages: aiMessages,
    sendMessage,
    status,
    error,
  } = useChat({
    transport,
    messages: [
      {
        id: '1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'Hello! I can answer questions about this property, the neighborhood, or the host. What would you like to know?',
          },
        ],
      },
    ],
    onError: (err) => {
      console.error('Chat error:', err);
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted' || isProcessingLocally;

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [aiMessages, customMessages, isOpen, scrollToBottom]);

  // Handle message submission with intent routing
  const handleMessage = useCallback(
    async (messageText: string) => {
      const trimmedMessage = messageText.trim();
      if (!trimmedMessage || isLoading) return;

      // Add user message to custom messages
      const userMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'user',
        type: 'text',
        content: trimmedMessage,
      };
      setCustomMessages((prev) => [...prev, userMessage]);

      // Step 1: Check Fair Housing policy gate
      const policyCheck = checkFairHousingPolicy(trimmedMessage);
      if (!policyCheck.allowed) {
        // Log blocked search
        await logBlockedSearch(
          rateLimitKey,
          trimmedMessage,
          policyCheck.blockedReason || 'unknown'
        );

        // Add policy refusal message
        const refusalMessage: ChatMessage = {
          id: generateMessageId(),
          role: 'assistant',
          type: 'policy-refusal',
          content: POLICY_REFUSAL_MESSAGE,
        };
        setCustomMessages((prev) => [...prev, refusalMessage]);
        return;
      }

      // Step 2: Detect nearby intent
      const intent = detectNearbyIntent(trimmedMessage);

      if (intent.isNearbyQuery) {
        // Step 3a: Check rate limit for nearby queries
        if (!canSearch) {
          const rateLimitMessage: ChatMessage = {
            id: generateMessageId(),
            role: 'assistant',
            type: 'rate-limit',
            content: `You've reached the search limit for this listing. Please explore other features or contact the host for more information.`,
          };
          setCustomMessages((prev) => [...prev, rateLimitMessage]);
          return;
        }

        if (isDebounceBusy) {
          const debounceMessage: ChatMessage = {
            id: generateMessageId(),
            role: 'assistant',
            type: 'text',
            content: 'Please wait a moment before searching again.',
          };
          setCustomMessages((prev) => [...prev, debounceMessage]);
          return;
        }

        // Increment rate limit and log
        incrementCount();
        await logSearchTrigger(
          rateLimitKey,
          intent.normalizedQuery || trimmedMessage,
          intent.searchType
        );

        // Add NearbyPlacesCard as assistant response
        const nearbyMessage: ChatMessage = {
          id: generateMessageId(),
          role: 'assistant',
          type: 'nearby-places',
          nearbyPlacesData: {
            queryText: trimmedMessage,
            normalizedIntent: intent,
          },
        };
        setCustomMessages((prev) => [...prev, nearbyMessage]);
      } else {
        // Step 3b: Not a nearby query - send to LLM
        setIsProcessingLocally(false);
        await sendMessage({ text: trimmedMessage });
      }
    },
    [
      isLoading,
      canSearch,
      isDebounceBusy,
      incrementCount,
      rateLimitKey,
      sendMessage,
    ]
  );

  const handleChipClick = async (question: string) => {
    setInput('');
    await handleMessage(question);
  };

  const retryLastMessage = async () => {
    const allMessages = aiMessages as UIMessage[];
    const lastUserMessage = [...allMessages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
      const content = getMessageContent(lastUserMessage);
      if (content) {
        await sendMessage({ text: content });
      }
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const message = input.trim();
    setInput('');
    await handleMessage(message);
  };

  // Combine AI messages and custom messages for rendering
  const allMessages = useMemo(() => {
    // Convert AI messages to ChatMessage format
    const convertedAiMessages: ChatMessage[] = (aiMessages as UIMessage[]).map((msg) => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      type: 'text' as const,
      content: getMessageContent(msg),
    }));

    // Merge and sort by ID (timestamp-based)
    const combined = [...convertedAiMessages, ...customMessages];
    return combined.sort((a, b) => {
      // Initial greeting always first
      if (a.id === '1') return -1;
      if (b.id === '1') return 1;
      return a.id.localeCompare(b.id);
    });
  }, [aiMessages, customMessages]);

  const showSuggestions = allMessages.length <= 1 && !isLoading;

  // Render a single message
  const renderMessage = (msg: ChatMessage) => {
    if (!msg.content && msg.type === 'text') return null;

    return (
      <motion.div
        key={msg.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={cn(
          'flex gap-3',
          msg.role === 'user' ? 'justify-end' : 'justify-start'
        )}
      >
        {msg.role === 'assistant' && (
          <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 mt-1 border border-zinc-100 dark:border-zinc-700">
            {msg.type === 'nearby-places' ? (
              <MapPin className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
            ) : (
              <Bot className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
            )}
          </div>
        )}

        <div className="max-w-[85%]">
          {msg.type === 'nearby-places' && msg.nearbyPlacesData ? (
            <NearbyPlacesCard
              latitude={latitude}
              longitude={longitude}
              queryText={msg.nearbyPlacesData.queryText}
              normalizedIntent={{
                mode: msg.nearbyPlacesData.normalizedIntent.searchType,
                includedTypes: msg.nearbyPlacesData.normalizedIntent.includedTypes,
                textQuery: msg.nearbyPlacesData.normalizedIntent.textQuery,
              }}
            />
          ) : (
            <div
              className={cn(
                'px-5 py-3 text-sm leading-relaxed shadow-sm relative',
                msg.role === 'user'
                  ? 'bg-zinc-900 dark:bg-zinc-700 text-white rounded-[1.25rem] rounded-tr-sm'
                  : msg.type === 'policy-refusal'
                  ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-[1.25rem] rounded-tl-sm'
                  : msg.type === 'rate-limit'
                  ? 'bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 rounded-[1.25rem] rounded-tl-sm'
                  : 'bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-[1.25rem] rounded-tl-sm'
              )}
            >
              {msg.content}
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <>
      {/* Toggle Button (Floating Action Button) */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'fixed bottom-6 right-6 z-[9999] h-14 w-14 rounded-full',
          'shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.2)]',
          'transition-all duration-500 hover:scale-105',
          'flex items-center justify-center',
          'border border-white/20 backdrop-blur-sm',
          isOpen
            ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rotate-90'
            : 'bg-zinc-900 dark:bg-zinc-800 text-white hover:bg-black dark:hover:bg-zinc-700'
        )}
        aria-label={isOpen ? 'Close chat' : 'Open AI Assistant'}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
      </motion.button>

      {/* Chat Window Container */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 32 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 32 }}
            transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
            className={cn(
              'fixed bottom-24 right-6 z-[9999]',
              'w-[380px] max-w-[calc(100vw-32px)]',
              'h-auto max-h-[min(600px,calc(100vh-120px))]',
              'bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl',
              'rounded-[2rem] shadow-[0_20px_60px_-12px_rgba(0,0,0,0.12)]',
              'border border-zinc-100 dark:border-zinc-800',
              'overflow-hidden origin-bottom-right',
              'flex flex-col'
            )}
          >
            {/* Header */}
            <div className="px-6 py-4 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md border-b border-zinc-50 dark:border-zinc-800 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-zinc-900 dark:bg-zinc-700 rounded-full flex items-center justify-center shadow-sm">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 leading-tight">Concierge AI</h3>
                  <p className="text-2xs text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                    </span>
                    Always available
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Rate limit indicator */}
                {remainingSearches < RATE_LIMIT_CONFIG.maxSearchesPerListing && (
                  <span className="text-2xs text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                    {remainingSearches} searches left
                  </span>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-transparent scrollbar-thin scrollbar-thumb-zinc-200 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent">
              <div className="space-y-6">
                <div className="flex justify-center">
                  <span className="text-2xs font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800 px-3 py-1 rounded-full border border-zinc-100 dark:border-zinc-700">Today</span>
                </div>

                {allMessages.map((msg) => renderMessage(msg))}

                {/* Loading indicator (typing) */}
                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-3 justify-start"
                  >
                    <div className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 mt-1 border border-zinc-100 dark:border-zinc-700">
                      <Bot className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                    </div>
                    <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 rounded-[1.25rem] rounded-tl-sm px-4 py-3 flex gap-1 items-center shadow-sm h-[42px]">
                      <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-1 h-1 bg-zinc-400 rounded-full animate-bounce"></span>
                    </div>
                  </motion.div>
                )}

                {/* Error message with retry */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center"
                  >
                    <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                      <span>Connection failed. Please try again.</span>
                      <button
                        onClick={retryLastMessage}
                        className="underline hover:no-underline font-medium"
                      >
                        Retry
                      </button>
                    </div>
                  </motion.div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Suggested Questions */}
            <AnimatePresence>
              {showSuggestions && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-6 pb-4"
                >
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_QUESTIONS.map((q, i) => (
                      <motion.button
                        key={i}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => handleChipClick(q.text)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs font-medium',
                          'bg-zinc-100 dark:bg-zinc-800',
                          'hover:bg-zinc-200 dark:hover:bg-zinc-700',
                          'text-zinc-700 dark:text-zinc-300',
                          'transition-colors duration-150',
                          'border border-transparent hover:border-zinc-300 dark:hover:border-zinc-600'
                        )}
                      >
                        {q.emoji} {q.text}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Area */}
            <div className="p-5 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-t border-zinc-50 dark:border-zinc-800">
              <form
                onSubmit={onSubmit}
                className="flex items-center gap-2 bg-zinc-100/50 dark:bg-zinc-800/50 p-1.5 pr-2 rounded-full border border-zinc-200 dark:border-zinc-700 focus-within:border-zinc-300 dark:focus-within:border-zinc-600 focus-within:bg-white dark:focus-within:bg-zinc-800 focus-within:ring-4 focus-within:ring-zinc-100 dark:focus-within:ring-zinc-800 transition-all duration-300 mb-1"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_LENGTH))}
                  placeholder="Ask about this place..."
                  disabled={isLoading}
                  className="flex-1 bg-transparent border-none outline-none text-sm px-4 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 font-medium"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="w-9 h-9 rounded-full bg-zinc-900 dark:bg-zinc-700 text-white flex items-center justify-center disabled:opacity-50 disabled:bg-zinc-200 dark:disabled:bg-zinc-600 disabled:cursor-not-allowed hover:bg-black dark:hover:bg-zinc-600 transition-all shadow-sm active:scale-95"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              </form>
              <div className="text-center mt-3 flex items-center justify-center gap-1.5 opacity-60">
                <Sparkles className="w-3 h-3 text-zinc-400" />
                <p className="text-2xs text-zinc-400 dark:text-zinc-500 font-medium tracking-wide uppercase">Powered by RoomShare AI</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
