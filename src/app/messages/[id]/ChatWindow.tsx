"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  supabase,
  authenticateRealtimeForConversation,
  createChatChannel,
  broadcastTyping,
  trackPresence,
  safeRemoveChannel,
} from "@/lib/supabase";
import { sendMessage } from "@/app/actions/chat";
import { blockUser, unblockUser } from "@/app/actions/block";
import PrivateFeedbackDialog from "@/components/PrivateFeedbackDialog";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  MessageSquare,
  MoreVertical,
  Ban,
  ShieldOff,
  WifiOff,
} from "lucide-react";
import UserAvatar from "@/components/UserAvatar";
import { useDebouncedCallback } from "use-debounce";
import { useBlockStatus } from "@/hooks/useBlockStatus";
import { useRateLimitHandler } from "@/hooks/useRateLimitHandler";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import RateLimitCountdown from "@/components/RateLimitCountdown";
import BlockedConversationBanner from "@/components/chat/BlockedConversationBanner";
import { MessageThread } from "@/components/messages";
import { mergeIncomingMessage } from "@/lib/message-merge";
import { MESSAGE_MAX_LENGTH } from "@/lib/messaging/message-contract";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Message = {
  id: string;
  content: string;
  senderId: string;
  createdAt: Date;
  read?: boolean;
  failed?: boolean;
  sender?: {
    id?: string;
    name: string | null;
    image: string | null;
  } | null;
};

interface ChatWindowProps {
  canLeavePrivateFeedback: boolean;
  initialMessages: Message[];
  conversationId: string;
  currentUserId: string;
  currentUserName?: string;
  listingId: string;
  listingOwnerId: string;
  listingTitle?: string;
  otherUserId: string;
  otherUserName?: string;
  otherUserImage?: string | null;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export default function ChatWindow({
  canLeavePrivateFeedback,
  initialMessages,
  conversationId,
  currentUserId,
  currentUserName,
  listingId,
  listingOwnerId,
  listingTitle,
  otherUserId,
  otherUserName,
  otherUserImage,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const isPollingRef = useRef(false);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [transportMode, setTransportMode] = useState<"realtime" | "polling">(
    "polling"
  );
  const transportModeRef = useRef<"realtime" | "polling">("polling");
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showPrivateFeedbackDialog, setShowPrivateFeedbackDialog] =
    useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [isUnblocking, setIsUnblocking] = useState(false);
  const messagesRef = useRef<Message[]>(initialMessages);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputValueRef = useRef("");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionExpiryRedirectRef = useRef(false);
  const router = useRouter();
  const lastMessageIdRef = useRef<string | null>(
    initialMessages.length > 0
      ? initialMessages[initialMessages.length - 1].id
      : null
  );
  const lastReadMessageIdRef = useRef<string | null>(null);

  // Block status tracking
  const {
    blockStatus,
    isBlocked,
    refetch: refetchBlockStatus,
  } = useBlockStatus(otherUserId, currentUserId);

  // Rate limit handling
  const {
    isRateLimited,
    retryAfter,
    handleError: handleRateLimitError,
    reset: resetRateLimit,
  } = useRateLimitHandler();

  // Network status tracking
  const { isOffline } = useNetworkStatus();

  const handleSessionExpired = useCallback(
    (draft: string, messageIdToRemove?: string) => {
      if (messageIdToRemove) {
        setMessages((prev) =>
          prev.filter((message) => message.id !== messageIdToRemove)
        );
      }

      const trimmedDraft = draft.trim();
      if (trimmedDraft) {
        sessionStorage.setItem(`chat_draft_${conversationId}`, trimmedDraft);
      }

      if (sessionExpiryRedirectRef.current) return;
      sessionExpiryRedirectRef.current = true;
      toast.error("Your session has expired. Redirecting to login...");
      router.push(`/login?callbackUrl=/messages/${conversationId}`);
    },
    [conversationId, router]
  );

  // Handle blocking a user
  const handleBlock = async () => {
    setIsBlocking(true);
    try {
      const result = await blockUser(otherUserId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${otherUserName || "User"} has been blocked`);
        refetchBlockStatus();
      }
    } catch (_error) {
      toast.error("Failed to block user");
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
        toast.success(`${otherUserName || "User"} has been unblocked`);
        refetchBlockStatus();
      }
    } catch (_error) {
      toast.error("Failed to unblock user");
    } finally {
      setIsUnblocking(false);
    }
  };

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    inputValueRef.current = input;
  }, [input]);

  useEffect(() => {
    transportModeRef.current = transportMode;
  }, [transportMode]);

  // Warn user when navigating away during message send or with unsaved input
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Warn if sending a message
      if (isSending) {
        e.preventDefault();
        e.returnValue =
          "Your message is still being sent. Are you sure you want to leave?";
        return e.returnValue;
      }

      // Warn if there's unsent text in the input
      if (input.trim().length > 0) {
        e.preventDefault();
        e.returnValue =
          "You have an unsent message. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isSending, input]);

  // Restore draft and focus input on mount
  useEffect(() => {
    // Check for saved draft from session expiry
    const draftKey = `chat_draft_${conversationId}`;
    const savedDraft = sessionStorage.getItem(draftKey);
    if (savedDraft) {
      setInput(savedDraft);
      sessionStorage.removeItem(draftKey);
      toast.info("Your message draft was restored");
    }
    inputRef.current?.focus();
  }, [conversationId]);

  const markConversationRead = useCallback(
    async (latestIncomingMessageId?: string | null) => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }

      const targetMessageId =
        latestIncomingMessageId ??
        [...messagesRef.current]
          .reverse()
          .find((message) => message.senderId !== currentUserId)?.id ??
        null;

      if (
        !targetMessageId ||
        lastReadMessageIdRef.current === targetMessageId
      ) {
        return;
      }

      try {
        const response = await fetch("/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "markRead",
            conversationId,
          }),
        });

        if (response.ok) {
          lastReadMessageIdRef.current = targetMessageId;
          window.dispatchEvent(new CustomEvent("messagesRead"));
        }
      } catch (_error) {
        console.error("Failed to mark messages as read:", _error);
      }
    },
    [conversationId, currentUserId]
  );

  // Debounced function to broadcast typing stopped
  const stopTypingBroadcast = useDebouncedCallback(() => {
    if (channelRef.current && transportMode === "realtime") {
      broadcastTyping(
        channelRef.current,
        currentUserId,
        currentUserName || "",
        false
      );
    }
    setIsTyping(false);
  }, 2000);

  // Handle input change with typing indicator
  const handleInputChange = (value: string) => {
    setInput(value);

    if (value && !isTyping) {
      setIsTyping(true);
      if (channelRef.current && transportMode === "realtime") {
        broadcastTyping(
          channelRef.current,
          currentUserId,
          currentUserName || "",
          true
        );
      }
    }

    // Reset the stop typing timer
    stopTypingBroadcast();
  };

  // Poll for new messages as fallback (or primary if Supabase not configured)
  const pollForMessages = useCallback(async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;
    const abortController = new AbortController();
    pollAbortRef.current = abortController;

    try {
      const params = new URLSearchParams({
        conversationId,
        poll: "1",
      });
      if (lastMessageIdRef.current) {
        params.set("lastMessageId", lastMessageIdRef.current);
      }

      const response = await fetch(`/api/messages?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        signal: abortController.signal,
      });

      if (response.status === 401) {
        handleSessionExpired(inputRef.current?.value ?? inputValueRef.current);
        return;
      }

      if (!response.ok) {
        throw new Error(`Polling failed with status ${response.status}`);
      }

      const payload = await response.json();
      const result = Array.isArray(payload?.messages)
        ? (payload.messages as Message[])
        : [];
      if (result.length > 0) {
        setMessages((prev) => {
          const merged = result.reduce(
            (acc, message) =>
              mergeIncomingMessage(acc, message, currentUserId),
            prev
          );
          if (merged === prev) return prev;
          lastMessageIdRef.current = result[result.length - 1]?.id || null;
          return [...merged].sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        });
        lastMessageIdRef.current =
          result[result.length - 1]?.id || lastMessageIdRef.current;

        if (result.some((message) => message.senderId !== currentUserId)) {
          void markConversationRead(result[result.length - 1]?.id ?? null);
        }
      }
    } catch (_error) {
      if (!isAbortError(_error)) {
        console.error("Polling error:", _error);
      }
    } finally {
      if (pollAbortRef.current === abortController) {
        pollAbortRef.current = null;
      }
      isPollingRef.current = false;
    }
  }, [
    conversationId,
    currentUserId,
    handleSessionExpired,
    markConversationRead,
  ]);

  // Set up real-time subscription with presence and typing
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    let authRefreshInterval: NodeJS.Timeout | null = null;
    let isActive = true;

    const setupRealtime = async () => {
      if (!supabase) {
        setTransportMode("polling");
        return;
      }

      setTransportMode("polling");
      const authResult =
        await authenticateRealtimeForConversation(conversationId);
      if (!isActive) return;

      if (!authResult.ok) {
        if (authResult.status === 401) {
          handleSessionExpired(inputRef.current?.value ?? inputValueRef.current);
        }
        return;
      }

      // The realtime JWT is short-lived; renew it before expiry or RLS will
      // silently stop delivering rows while the channel still looks healthy.
      // If renewal fails, drop to polling so delivery keeps working.
      const expiresInSeconds = authResult.expiresIn ?? 300;
      const refreshAfterMs = Math.max(expiresInSeconds - 60, 30) * 1000;
      authRefreshInterval = setInterval(() => {
        void (async () => {
          const refresh =
            await authenticateRealtimeForConversation(conversationId);
          if (!isActive) return;
          if (!refresh.ok) {
            setTransportMode("polling");
          }
        })();
      }, refreshAfterMs);

      // Create channel with broadcast and presence
      const channel = createChatChannel(conversationId);

      if (channel) {
        channelRef.current = channel;

        channel
          // Listen for new messages via postgres changes
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "Message",
              filter: `conversationId=eq.${conversationId}`,
            },
            (payload) => {
              const newMessage = payload.new as Partial<Message> & {
                conversationId?: string;
                createdAt: string | Date;
              };
              // Defense in depth: RLS scopes realtime rows, this guard drops malformed or stale payloads.
              if (
                !newMessage.conversationId ||
                newMessage.conversationId !== conversationId
              )
                return;
              const incomingMessage = {
                ...newMessage,
                createdAt: new Date(newMessage.createdAt),
              } as Message;
              lastMessageIdRef.current = incomingMessage.id;

              setMessages((prev) => {
                return mergeIncomingMessage(
                  prev,
                  incomingMessage,
                  currentUserId
                );
              });

              // Clear typing indicator when message received
              if (incomingMessage.senderId !== currentUserId) {
                setOtherUserTyping(false);
                void markConversationRead(incomingMessage.id);
              }
            }
          )
          // Listen for typing broadcasts
          .on("broadcast", { event: "typing" }, (payload) => {
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
          .on("presence", { event: "sync" }, () => {
            if (!channel || typeof channel.presenceState !== "function") return;
            const state = channel.presenceState();
            const otherUsers = Object.values(state)
              .flat()
              .filter(
                (p: Record<string, unknown>) => p.user_id !== currentUserId
              );
            setIsOnline(otherUsers.length > 0);
          })
          .on("presence", { event: "join" }, ({ newPresences }) => {
            const otherJoined = newPresences.some(
              (p: Record<string, unknown>) => p.user_id !== currentUserId
            );
            if (otherJoined) setIsOnline(true);
          })
          .on("presence", { event: "leave" }, ({ leftPresences }) => {
            const otherLeft = leftPresences.some(
              (p: Record<string, unknown>) => p.user_id !== currentUserId
            );
            if (otherLeft) {
              if (!channel || typeof channel.presenceState !== "function")
                return;
              const state = channel.presenceState();
              const otherUsers = Object.values(state)
                .flat()
                .filter(
                  (p: Record<string, unknown>) => p.user_id !== currentUserId
                );
              setIsOnline(otherUsers.length > 0);
            }
          })
          .subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              setTransportMode("realtime");
              // Track our presence using the wrapper with defensive checks
              await trackPresence(
                channel,
                currentUserId,
                currentUserName || "User"
              );
            } else if (
              status === "CLOSED" ||
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT"
            ) {
              setTransportMode("polling");
            }
          });
      }
    };

    void setupRealtime();

    if (!isOffline) {
      void pollForMessages();
      pollInterval = setInterval(() => {
        if (transportModeRef.current !== "realtime") {
          void pollForMessages();
        }
      }, 5000);
    }

    return () => {
      isActive = false;
      safeRemoveChannel(channelRef.current);
      channelRef.current = null;
      pollAbortRef.current?.abort();
      pollAbortRef.current = null;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      if (authRefreshInterval) {
        clearInterval(authRefreshInterval);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [
    conversationId,
    currentUserId,
    currentUserName,
    handleSessionExpired,
    isOffline,
    markConversationRead,
    pollForMessages,
  ]);

  useEffect(() => {
    void markConversationRead();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void markConversationRead();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [markConversationRead]);

  const handleSend = async () => {
    // Block sending when offline
    if (isOffline) {
      toast.error("You are offline. Please check your connection.");
      return;
    }

    if (!input.trim() || isSending || isRateLimited) return;

    const content = input.trim();
    setInput("");
    setIsSending(true);
    setIsTyping(false);

    // Broadcast that we stopped typing
    if (channelRef.current && transportMode === "realtime") {
      broadcastTyping(
        channelRef.current,
        currentUserId,
        currentUserName || "",
        false
      );
    }

    // Optimistic update
    const optimisticId = "opt-" + Date.now();
    const optimisticMessage: Message = {
      id: optimisticId,
      content,
      senderId: currentUserId,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const result = await sendMessage(conversationId, content);

      // Check for session expiry or other errors
      if (result && "error" in result) {
        if (result.code === "SESSION_EXPIRED") {
          handleSessionExpired(content, optimisticId);
          return;
        }

        // Check for rate limit error
        if (handleRateLimitError(result)) {
          // Remove optimistic message and restore the message to input
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
          setInput(content);
          return;
        }

        // Mark message as failed instead of removing it
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? { ...m, failed: true } : m))
        );
        toast.error(result.error || "Failed to send message. Tap to retry.");
        return;
      }

      setMessages((prev) =>
        mergeIncomingMessage(prev, result as Message, currentUserId, {
          optimisticMessageId: optimisticId,
        })
      );
      lastMessageIdRef.current = result.id;
    } catch (_error) {
      console.error("Failed to send message:", _error);
      // Mark message as failed instead of removing it
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...m, failed: true } : m))
      );
      toast.error("Failed to send message. Tap to retry.");
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
    setMessages((prev) =>
      prev.map((m) => (m.id === failedId ? { ...m, failed: false } : m))
    );
    setIsSending(true);

    try {
      const result = await sendMessage(conversationId, content);

      if (result && "error" in result) {
        if (result.code === "SESSION_EXPIRED") {
          handleSessionExpired(content, failedId);
          return;
        }

        if (handleRateLimitError(result)) {
          setMessages((prev) => prev.filter((m) => m.id !== failedId));
          setInput(content);
          return;
        }

        // Still failed - mark as failed again
        setMessages((prev) =>
          prev.map((m) => (m.id === failedId ? { ...m, failed: true } : m))
        );
        toast.error(result.error || "Failed to send message. Tap to retry.");
        return;
      }

      setMessages((prev) =>
        mergeIncomingMessage(prev, result as Message, currentUserId, {
          optimisticMessageId: failedId,
        })
      );
      lastMessageIdRef.current = result.id;
      toast.success("Message sent");
    } catch (_error) {
      console.error("Failed to retry message:", _error);
      setMessages((prev) =>
        prev.map((m) => (m.id === failedId ? { ...m, failed: true } : m))
      );
      toast.error("Failed to send message. Tap to retry.");
    } finally {
      setIsSending(false);
    }
  };

  // Delete a failed message
  const handleDeleteFailed = (messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  // Peer-status line under the name; empty string renders nothing.
  const getStatusText = () => {
    if (otherUserTyping) {
      return "typing...";
    }
    if (isOffline) {
      return "You're offline";
    }
    if (transportMode === "realtime" && isOnline) {
      return "Online";
    }
    return "";
  };

  const statusText = isBlocked
    ? blockStatus === "blocker"
      ? "Blocked"
      : "You are blocked"
    : getStatusText();

  return (
    <div
      data-testid="chat-window"
      className="flex flex-col h-full bg-surface-canvas"
    >
      {/* Header */}
      <div
        data-testid="chat-header"
        className="px-6 py-4 bg-surface-container-lowest flex items-center gap-3"
      >
        <button
          type="button"
          data-testid="back-button"
          aria-label="Back to messages"
          onClick={() => router.push("/messages")}
          className="p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className={`relative ${isBlocked ? "opacity-50 grayscale" : ""}`}>
          <UserAvatar
            image={otherUserImage}
            name={otherUserName}
            className="w-10 h-10"
          />
          {transportMode === "realtime" && isOnline && !isBlocked && (
            <span
              data-testid="online-status"
              className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"
            />
          )}
        </div>
        <div className="flex-1">
          <h3
            className={`font-semibold ${isBlocked ? "text-on-surface-variant" : "text-on-surface"}`}
          >
            {otherUserName || "Chat"}
          </h3>
          {statusText ? (
            <p
              data-testid="connection-status"
              className={`text-xs ${
                !isBlocked && otherUserTyping
                  ? "text-green-600 font-medium"
                  : "text-on-surface-variant"
              }`}
            >
              {statusText}
            </p>
          ) : null}
        </div>

        {/* Block/Unblock Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-surface-container-high rounded-full transition-colors"
              aria-label="More options"
            >
              <MoreVertical className="w-5 h-5 text-on-surface-variant" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canLeavePrivateFeedback && listingId && listingOwnerId && (
              <DropdownMenuItem
                onClick={() => setShowPrivateFeedbackDialog(true)}
                className="text-on-surface"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Share private feedback about this listing
              </DropdownMenuItem>
            )}
            {blockStatus === "blocker" ? (
              <DropdownMenuItem
                onClick={handleUnblock}
                disabled={isUnblocking}
                className="text-on-surface-variant"
              >
                <ShieldOff className="w-4 h-4 mr-2" />
                {isUnblocking ? "Unblocking..." : "Unblock User"}
              </DropdownMenuItem>
            ) : (
              blockStatus !== "blocked" && (
                <DropdownMenuItem
                  onClick={() => setShowBlockDialog(true)}
                  className="text-red-600"
                >
                  <Ban className="w-4 h-4 mr-2" />
                  Block User
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {listingId && listingOwnerId && (
        <PrivateFeedbackDialog
          listingId={listingId}
          listingTitle={listingTitle}
          open={showPrivateFeedbackDialog}
          onOpenChange={setShowPrivateFeedbackDialog}
          targetUserId={listingOwnerId}
        />
      )}

      {/* Block Confirmation Dialog */}
      <AlertDialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block {otherUserName}?</AlertDialogTitle>
            <AlertDialogDescription>
              You won&apos;t be able to message each other. They won&apos;t be
              notified that you blocked them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBlocking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBlock}
              disabled={isBlocking}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isBlocking ? "Blocking..." : "Block"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MessageThread
        messages={messages}
        currentUserId={currentUserId}
        otherUserName={otherUserName}
        otherUserImage={otherUserImage}
        otherUserTyping={otherUserTyping}
        autoAnchor
        onRetryMessage={handleRetry}
        onDeleteFailedMessage={handleDeleteFailed}
        retryFailedDisabled={isSending || isOffline}
        retryTestId="retry-button"
        footer={
          isBlocked ? (
            <BlockedConversationBanner
              blockStatus={blockStatus}
              otherUserName={otherUserName}
              onUnblock={blockStatus === "blocker" ? handleUnblock : undefined}
              isUnblocking={isUnblocking}
            />
          ) : undefined
        }
        composer={
          isBlocked
            ? undefined
            : {
                value: input,
                onChange: handleInputChange,
                onSubmit: handleSend,
                inputRef,
                submitDisabled: isRateLimited || isOffline,
                isSending,
                isOffline,
                maxLength: MESSAGE_MAX_LENGTH,
                inputTestId: "message-input",
                submitTestId: "send-button",
                counterTestId: "char-counter",
                before: (
                  <>
                    {isOffline && (
                      <div className="flex items-center gap-2 rounded-lg bg-surface-container-high p-2 text-sm text-on-surface-variant">
                        <WifiOff className="h-4 w-4 flex-shrink-0" />
                        <span>
                          You&apos;re offline. Reconnect to send messages.
                        </span>
                      </div>
                    )}
                    {isRateLimited && (
                      <RateLimitCountdown
                        retryAfterSeconds={retryAfter}
                        onRetryReady={resetRateLimit}
                      />
                    )}
                  </>
                ),
              }
        }
      />
    </div>
  );
}
