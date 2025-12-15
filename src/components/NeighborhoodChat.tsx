'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';

// Import intent detection and policy modules
import { detectNearbyIntent, type NearbyIntentResult } from '@/lib/nearby-intent';
import { checkFairHousingPolicy, POLICY_REFUSAL_MESSAGE } from '@/lib/fair-housing-policy';
import { useNearbySearchRateLimit, RATE_LIMIT_CONFIG } from '@/hooks/useNearbySearchRateLimit';
import { logAllowedSearch, logBlockedRequest } from '@/lib/logNearbySearch';
import NearbyPlacesCard from '@/components/chat/NearbyPlacesCard';

interface NeighborhoodChatProps {
  latitude: number;
  longitude: number;
  listingId?: string;
}

/**
 * Custom message type for local-only messages (widgets, policy, rate-limit).
 * Text messages from AI are handled by useChat's aiMessages.
 */
interface LocalMessage {
  id: string;
  role: 'user' | 'assistant';
  // P0-02 FIX: Added 'user-echo' type for echoing user messages in nearby path
  type: 'nearby-places' | 'policy-refusal' | 'rate-limit' | 'debounce' | 'user-echo';
  createdAt: number;
  content?: string;
  nearbyPlacesData?: {
    queryText: string;
    normalizedIntent: NearbyIntentResult;
    /** Pre-built object for NearbyPlacesCard - created once, reference preserved */
    stableNormalizedIntent: {
      mode: 'type' | 'text';
      includedTypes?: string[];
      textQuery?: string;
    };
  };
}

/**
 * Unified render item for the message list.
 */
interface RenderItem {
  id: string;
  // P0-02 FIX: Added 'user-echo' kind for nearby path user messages
  kind: 'ai-text' | 'nearby-places' | 'policy-refusal' | 'rate-limit' | 'debounce' | 'user-echo';
  role: 'user' | 'assistant';
  createdAt: number;
  content?: string;
  nearbyPlacesData?: {
    queryText: string;
    normalizedIntent: NearbyIntentResult;
    /** Pre-built object for NearbyPlacesCard to avoid re-renders */
    stableNormalizedIntent: {
      mode: 'type' | 'text';
      includedTypes?: string[];
      textQuery?: string;
    };
  };
}

const SUGGESTED_QUESTIONS = [
  { emoji: '🛒', text: 'Groceries' },
  { emoji: '🚇', text: 'Transit' },
  { emoji: '🌳', text: 'Parks' },
  { emoji: '☕', text: 'Coffee' },
];

const MAX_INPUT_LENGTH = 500;

// B7 FIX: Timeout for LLM streaming responses
const LLM_TIMEOUT_MS = 30000; // 30 seconds

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

// Helper to determine error type from useChat error
function getErrorInfo(error: Error | undefined): {
  isRateLimit: boolean;
  retryAfter?: number;
  message: string;
} {
  if (!error) return { isRateLimit: false, message: '' };

  // AI SDK wraps fetch errors - check for status code patterns
  const errorMsg = error.message?.toLowerCase() || '';

  // Check for 429 status or "too many" in error message
  if (errorMsg.includes('429') || errorMsg.includes('too many')) {
    // Try to extract retry-after from error if available
    const retryMatch = errorMsg.match(/retry.?after[:\s]*(\d+)/i);
    const retryAfter = retryMatch ? parseInt(retryMatch[1], 10) : 60;
    return {
      isRateLimit: true,
      retryAfter,
      message: `You've reached the message limit. Please try again in ${retryAfter} seconds.`,
    };
  }

  return { isRateLimit: false, message: 'Connection failed. Tap to retry.' };
}

export default function NeighborhoodChat({ latitude, longitude, listingId }: NeighborhoodChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  // Local messages: only for widgets (nearby-places) and system messages (policy, rate-limit)
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [isProcessingLocally, setIsProcessingLocally] = useState(false);
  // B7 FIX: LLM streaming timeout state
  const [llmTimedOut, setLlmTimedOut] = useState(false);
  const llmTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Use coordinates as listing identifier for rate limiting if listingId not provided
  const rateLimitKey = listingId || `${latitude.toFixed(4)}_${longitude.toFixed(4)}`;
  // P1-03 FIX: Added startDebounce for spam protection, incrementCount for success tracking
  // P1-04 FIX: Added debounceRemainingMs for countdown display
  const { canSearch, remainingSearches, isDebounceBusy, debounceRemainingMs, startDebounce, incrementCount } =
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
      console.error('Chat error:', err.message, err);
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
  }, [aiMessages, localMessages, isOpen, scrollToBottom]);

  // P2-04 FIX: Close chat on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // B7 FIX: LLM streaming timeout effect
  useEffect(() => {
    // Start timeout when LLM is processing
    if (status === 'streaming' || status === 'submitted') {
      // Clear any existing timeout first
      if (llmTimeoutRef.current) {
        clearTimeout(llmTimeoutRef.current);
      }
      // Reset timeout state when starting new request
      setLlmTimedOut(false);

      llmTimeoutRef.current = setTimeout(() => {
        console.error('[NeighborhoodChat] LLM streaming timed out after', LLM_TIMEOUT_MS, 'ms');
        setLlmTimedOut(true);
      }, LLM_TIMEOUT_MS);
    }

    // Clear timeout when LLM completes or errors
    if (status === 'ready' || status === 'error') {
      if (llmTimeoutRef.current) {
        clearTimeout(llmTimeoutRef.current);
        llmTimeoutRef.current = null;
      }
      // Don't reset llmTimedOut here - let it persist until next request
    }

    // Cleanup on unmount
    return () => {
      if (llmTimeoutRef.current) {
        clearTimeout(llmTimeoutRef.current);
        llmTimeoutRef.current = null;
      }
    };
  }, [status]);

  // Handle message submission with intent routing
  const handleMessage = useCallback(
    async (messageText: string) => {
      const trimmedMessage = messageText.trim();
      if (!trimmedMessage || isLoading) return;

      // Step 1: Check Fair Housing policy gate BEFORE anything else
      const policyCheck = checkFairHousingPolicy(trimmedMessage);
      if (!policyCheck.allowed) {
        // Log blocked request (no user text or category sent)
        await logBlockedRequest(rateLimitKey, 'nearby');

        // Add policy refusal as local message (user message shown via AI SDK would be confusing)
        const refusalMessage: LocalMessage = {
          id: generateMessageId(),
          role: 'assistant',
          type: 'policy-refusal',
          createdAt: Date.now(),
          content: POLICY_REFUSAL_MESSAGE,
        };
        setLocalMessages((prev) => [...prev, refusalMessage]);
        return;
      }

      // Step 2: Detect nearby intent
      const intent = detectNearbyIntent(trimmedMessage);

      if (intent.isNearbyQuery) {
        // B1 FIX: Set processing flag at start of nearby path
        setIsProcessingLocally(true);

        // Step 3a: Check debounce FIRST (before canSearch, since canSearch includes !isDebounceBusy)
        if (isDebounceBusy) {
          const debounceMessage: LocalMessage = {
            id: generateMessageId(),
            role: 'assistant',
            type: 'debounce',
            createdAt: Date.now(),
            content: 'Please wait a moment before searching again.',
          };
          setLocalMessages((prev) => [...prev, debounceMessage]);
          setIsProcessingLocally(false);
          return;
        }

        // Step 3b: Check rate limit (only reached when not debouncing)
        if (!canSearch) {
          const rateLimitMessage: LocalMessage = {
            id: generateMessageId(),
            role: 'assistant',
            type: 'rate-limit',
            createdAt: Date.now(),
            content: `You've reached the search limit for this listing. Please explore other features or contact the host for more information.`,
          };
          setLocalMessages((prev) => [...prev, rateLimitMessage]);
          setIsProcessingLocally(false);
          return;
        }

        // P1-03 FIX: Start debounce immediately (prevents spam), but don't increment count yet
        // Count will be incremented only on successful search via onSearchSuccess callback
        startDebounce();
        await logAllowedSearch(rateLimitKey, intent.searchType, intent.includedTypes);

        // P0-02 FIX: Echo user message first so user sees their query
        const userEchoMessage: LocalMessage = {
          id: generateMessageId(),
          role: 'user',
          type: 'user-echo',
          createdAt: Date.now(),
          content: trimmedMessage,
        };
        setLocalMessages((prev) => [...prev, userEchoMessage]);

        // Add NearbyPlacesCard as local assistant response
        // Create stableNormalizedIntent HERE so object reference is preserved across re-renders
        const nearbyMessage: LocalMessage = {
          id: generateMessageId(),
          role: 'assistant',
          type: 'nearby-places',
          createdAt: Date.now(),
          nearbyPlacesData: {
            queryText: trimmedMessage,
            normalizedIntent: intent,
            stableNormalizedIntent: {
              mode: intent.searchType,
              includedTypes: intent.includedTypes,
              textQuery: intent.textQuery,
            },
          },
        };
        setLocalMessages((prev) => [...prev, nearbyMessage]);
        setIsProcessingLocally(false);
      } else {
        // Step 3b: Not a nearby query - send to LLM (useChat handles user + assistant messages)
        await sendMessage({ text: trimmedMessage });
      }
    },
    [
      isLoading,
      canSearch,
      isDebounceBusy,
      startDebounce,
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

  // B3 FIX: Use fixed base timestamp for consistent ordering
  // AI messages use BASE + index, local messages use Date.now()
  // This ensures proper interleaving when sorted by createdAt
  const AI_MESSAGE_BASE_TIMESTAMP = 1000000000000; // Sep 2001 epoch - always < Date.now()

  // Combine AI messages and local messages for rendering
  const renderItems = useMemo((): RenderItem[] => {
    const aiItems: RenderItem[] = [];

    // Convert AI messages to RenderItem format
    // Use BASE + index to preserve relative order while allowing local messages to interleave
    (aiMessages as UIMessage[]).forEach((msg, index) => {
      const textContent = getMessageContent(msg);
      const timestamp = msg.id === '1' ? 0 : AI_MESSAGE_BASE_TIMESTAMP + index;

      // Add text content as ai-text item
      if (textContent) {
        aiItems.push({
          id: msg.id,
          kind: 'ai-text' as const,
          role: msg.role as 'user' | 'assistant',
          createdAt: timestamp,
          content: textContent,
        });
      }

      // P0-01 FIX: Check for tool-invocation parts with NEARBY_UI_KIT action
      // When LLM calls nearbyPlaceSearch tool, render result as NearbyPlacesCard
      if (msg.parts) {
        for (const part of msg.parts) {
          if (
            part.type === 'tool-invocation' &&
            'toolName' in part &&
            part.toolName === 'nearbyPlaceSearch' &&
            'result' in part &&
            part.result?.action === 'NEARBY_UI_KIT'
          ) {
            const result = part.result as {
              action: string;
              query: string;
              searchType: 'type' | 'text';
              includedTypes?: string[];
              coordinates: { lat: number; lng: number };
            };

            aiItems.push({
              id: `${msg.id}_tool_${'toolCallId' in part ? part.toolCallId : 'unknown'}`,
              kind: 'nearby-places' as const,
              role: 'assistant',
              // Place tool result slightly after the message (timestamp + 0.5)
              createdAt: timestamp + 0.5,
              nearbyPlacesData: {
                queryText: result.query,
                normalizedIntent: {
                  isNearbyQuery: true,
                  searchType: result.searchType,
                  includedTypes: result.includedTypes,
                  normalizedQuery: result.query,
                },
                stableNormalizedIntent: {
                  mode: result.searchType,
                  includedTypes: result.includedTypes,
                  textQuery: result.searchType === 'text' ? result.query : undefined,
                },
              },
            });
          }
        }
      }
    });

    // Convert local messages to RenderItem format
    // Local messages use Date.now() which is always > AI_MESSAGE_BASE_TIMESTAMP
    // This means local messages will appear after all AI messages that existed when they were created
    const localItems: RenderItem[] = localMessages.map((msg) => ({
      id: msg.id,
      kind: msg.type,
      role: msg.role,
      createdAt: msg.createdAt,
      content: msg.content,
      nearbyPlacesData: msg.nearbyPlacesData,
    }));

    // Combine all items
    const result: RenderItem[] = [...aiItems, ...localItems];

    // Sort by createdAt - greeting first, then chronological order
    return result.sort((a, b) => {
      // Initial greeting always first
      if (a.id === '1') return -1;
      if (b.id === '1') return 1;

      return a.createdAt - b.createdAt;
    });
  }, [aiMessages, localMessages]);

  const showSuggestions = renderItems.length <= 1 && !isLoading;

  // Render a single message
  const renderMessage = (item: RenderItem) => {
    if (!item.content && item.kind === 'ai-text') return null;

    const isUser = item.role === 'user';

    return (
      <motion.div
        key={item.id}
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, type: 'spring', bounce: 0.2 }}
        className={cn(
          'flex w-full mb-6',
          isUser ? 'justify-end' : 'justify-start'
        )}
      >
        <div className={cn('max-w-[88%] flex flex-col', isUser ? 'items-end' : 'items-start')}>
          {/* B12 FIX: Use min() to prevent mobile overflow */}
          {item.kind === 'nearby-places' && item.nearbyPlacesData ? (
            <div className="w-full min-w-[min(300px,100%)]">
              <NearbyPlacesCard
                latitude={latitude}
                longitude={longitude}
                queryText={item.nearbyPlacesData.queryText}
                normalizedIntent={item.nearbyPlacesData.stableNormalizedIntent}
                // P1-03 FIX: Only increment rate limit count on successful search
                onSearchSuccess={incrementCount}
              />
            </div>
          ) : (
            <div
              className={cn(
                'px-5 py-3 text-[15px] leading-relaxed relative transition-all duration-200',
                isUser
                  ? 'bg-zinc-900 dark:bg-zinc-700 text-white rounded-[24px] rounded-tr-md shadow-lg shadow-zinc-900/10'
                  : item.kind === 'policy-refusal'
                  ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 text-amber-900 dark:text-amber-200 rounded-[24px] rounded-tl-md'
                  : item.kind === 'rate-limit' || item.kind === 'debounce'
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-[24px] rounded-tl-md'
                  : 'bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-[24px] rounded-tl-md shadow-sm border border-zinc-100 dark:border-zinc-700'
              )}
            >
              {/* P1-04 FIX: Show live countdown for debounce messages */}
              {item.kind === 'debounce' && isDebounceBusy && debounceRemainingMs > 0 ? (
                <span>
                  Please wait {Math.ceil(debounceRemainingMs / 1000)}s before searching again.
                </span>
              ) : (
                item.content
              )}
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
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          'fixed bottom-6 right-6 z-[9999]',
          'h-14 w-14 rounded-full',
          'flex items-center justify-center',
          'shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)]',
          'transition-all duration-300',
          isOpen
            ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white rotate-90'
            : 'bg-zinc-900 dark:bg-zinc-800 text-white hover:bg-black dark:hover:bg-zinc-700'
        )}
        aria-label={isOpen ? 'Close chat' : 'Open AI Assistant'}
      >
        {isOpen ? (
          <X className="w-6 h-6" strokeWidth={1.5} />
        ) : (
          <Sparkles className="w-6 h-6" strokeWidth={1.5} />
        )}
      </motion.button>

      {/* Chat Window Container */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 20, scale: 0.95, filter: 'blur(10px)' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={cn(
              'fixed bottom-24 right-6 z-[9999]',
              'w-[400px] max-w-[calc(100vw-32px)]',
              'h-[600px] max-h-[calc(100vh-120px)]',
              'bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl',
              'supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-zinc-900/60',
              'rounded-[32px]',
              'shadow-[0_40px_80px_-20px_rgba(0,0,0,0.15),0_0_0_1px_rgba(255,255,255,0.4)]',
              'dark:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.1)]',
              'flex flex-col overflow-hidden ring-1 ring-black/5 dark:ring-white/5'
            )}
          >
            {/* Top gradient overlay */}
            <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-white/90 dark:from-zinc-900/90 to-transparent z-20 pointer-events-none" />

            {/* Minimal Header */}
            <div className="px-6 pt-6 pb-2 flex items-center justify-between z-30">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]" />
                <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 tracking-tight">Concierge</span>
              </div>

              {remainingSearches < RATE_LIMIT_CONFIG.maxSearchesPerListing && (
                <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-full tracking-wide uppercase">
                  {remainingSearches} left
                </span>
              )}
            </div>

            {/* Messages Area */}
            {/* B8 FIX: Added role="log" and aria-live for screen reader accessibility */}
            <div
              className="flex-1 min-h-0 overflow-y-auto px-6 py-4 overscroll-contain"
              role="log"
              aria-live="polite"
              aria-label="Chat messages"
            >
              <div className="min-h-full flex flex-col justify-end pt-12 pb-4">
                {/* Date separator */}
                <div className="w-full flex justify-center mb-8">
                  <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 tracking-widest uppercase">Today</span>
                </div>

                {renderItems.map((item) => renderMessage(item))}

                {/* Loading indicator (typing) */}
                {/* B11 FIX: Added role="status" and aria-label for screen reader accessibility */}
                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex justify-start"
                    role="status"
                    aria-label="Loading response"
                  >
                    <div className="bg-white/50 dark:bg-zinc-800/50 border border-zinc-100/50 dark:border-zinc-700/50 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-zinc-300 dark:bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]" aria-hidden="true" />
                      <div className="w-1.5 h-1.5 bg-zinc-300 dark:bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]" aria-hidden="true" />
                      <div className="w-1.5 h-1.5 bg-zinc-300 dark:bg-zinc-500 rounded-full animate-bounce" aria-hidden="true" />
                      <span className="sr-only">Assistant is typing</span>
                    </div>
                  </motion.div>
                )}

                {/* B7 FIX: Timeout error with retry */}
                {llmTimedOut && !error && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-center mb-4"
                  >
                    <button
                      onClick={retryLastMessage}
                      className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-full transition-colors"
                    >
                      Response timed out. Tap to retry.
                    </button>
                  </motion.div>
                )}

                {/* Error message with retry */}
                {error && (() => {
                  const errorInfo = getErrorInfo(error);
                  return (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex justify-center mb-4"
                    >
                      {errorInfo.isRateLimit ? (
                        <div className="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-full">
                          {errorInfo.message}
                        </div>
                      ) : (
                        <button
                          onClick={retryLastMessage}
                          className="text-xs text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 font-medium bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-full transition-colors"
                        >
                          {errorInfo.message}
                        </button>
                      )}
                    </motion.div>
                  );
                })()}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Suggested Questions */}
            <AnimatePresence>
              {showSuggestions && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="px-6 pb-2 flex gap-2 overflow-x-auto"
                >
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleChipClick(q.text)}
                      className={cn(
                        'whitespace-nowrap px-4 py-2 rounded-full text-xs font-medium',
                        'bg-white/50 dark:bg-zinc-800/50 hover:bg-white dark:hover:bg-zinc-700',
                        'text-zinc-600 dark:text-zinc-300',
                        'border border-zinc-100 dark:border-zinc-700 shadow-sm',
                        'transition-all duration-300 hover:shadow-md hover:scale-[1.02]',
                        'flex items-center gap-2',
                        // B10 FIX: Keyboard focus indicators
                        'focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:outline-none'
                      )}
                    >
                      <span>{q.emoji}</span>
                      <span>{q.text}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Area */}
            <div className="p-4 bg-gradient-to-t from-white/90 dark:from-zinc-900/90 via-white/50 dark:via-zinc-900/50 to-transparent">
              <form onSubmit={onSubmit} className="relative group">
                <div className="absolute inset-0 bg-white dark:bg-zinc-800 rounded-[28px] shadow-sm group-focus-within:shadow-md transition-shadow duration-300" />
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_LENGTH))}
                  placeholder="Ask anything..."
                  disabled={isLoading}
                  className="w-full relative bg-transparent border-0 px-6 py-4 text-[15px] placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:ring-0 focus:outline-none text-zinc-900 dark:text-zinc-100 pr-12 rounded-[28px]"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className={cn(
                    'absolute right-2 top-1/2 -translate-y-1/2',
                    'w-10 h-10 rounded-full flex items-center justify-center',
                    'bg-zinc-900 dark:bg-zinc-700 text-white transition-all duration-300',
                    'disabled:opacity-0 disabled:scale-75',
                    'hover:scale-105 active:scale-95 hover:bg-black dark:hover:bg-zinc-600'
                  )}
                >
                  <ArrowUp className="w-5 h-5" strokeWidth={2} />
                </button>
              </form>
              <div className="text-center mt-3">
                <p className="text-[10px] text-zinc-300 dark:text-zinc-600 font-medium tracking-widest uppercase">AI Concierge</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
