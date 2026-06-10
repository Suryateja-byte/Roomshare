"use client";

import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject, UIEventHandler } from "react";

import UserAvatar from "@/components/UserAvatar";
import { MESSAGE_MAX_LENGTH } from "@/lib/messaging/message-contract";
import { cn } from "@/lib/utils";
import { DaySeparator } from "./DaySeparator";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";
import type { MessageDeliveryState } from "./types";
import { type ThreadMessage, useMessageThread } from "./useMessageThread";

export type MessageThreadComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
  submitDisabled?: boolean;
  isSending?: boolean;
  isOffline?: boolean;
  placeholder?: string;
  maxLength?: number;
  before?: ReactNode;
  inputTestId?: string;
  submitTestId?: string;
  counterTestId?: string;
};

export interface MessageThreadProps<TMessage extends ThreadMessage> {
  messages: TMessage[];
  currentUserId: string;
  otherUserName?: string | null;
  otherUserImage?: string | null;
  otherUserTyping?: boolean;
  messagesEndRef?: RefObject<HTMLDivElement | null>;
  composer?: MessageThreadComposerProps;
  footer?: ReactNode;
  messagesBefore?: ReactNode;
  messagesContainerRef?: RefObject<HTMLDivElement | null>;
  onMessagesScroll?: UIEventHandler<HTMLDivElement>;
  /**
   * Built-in scroll anchoring: auto-scroll on new messages only while the
   * reader is near the bottom (or the newest message is their own); otherwise
   * show a jump-to-latest pill.
   */
  autoAnchor?: boolean;
  jumpToLatestLabel?: string;
  jumpToLatestTestId?: string;
  onRetryMessage?: (message: TMessage) => void;
  onDeleteFailedMessage?: (messageId: string) => void;
  retryFailedDisabled?: boolean;
  retryTestId?: string;
  deleteTestId?: string;
  className?: string;
  messagesClassName?: string;
}

function getDeliveryState(
  message: ThreadMessage,
  isCurrentUserMessage: boolean
): MessageDeliveryState {
  if (!isCurrentUserMessage) {
    return "delivered";
  }

  if (message.failed) {
    return "failed";
  }

  if (message.id.startsWith("opt-")) {
    return "sending";
  }

  return message.read ? "read" : "sent";
}

export function MessageThread<TMessage extends ThreadMessage>({
  messages,
  currentUserId,
  otherUserName,
  otherUserImage,
  otherUserTyping = false,
  messagesEndRef,
  composer,
  footer,
  messagesBefore,
  messagesContainerRef,
  onMessagesScroll,
  autoAnchor = false,
  jumpToLatestLabel = "Scroll to latest messages",
  jumpToLatestTestId = "jump-to-latest",
  onRetryMessage,
  onDeleteFailedMessage,
  retryFailedDisabled = false,
  retryTestId,
  deleteTestId,
  className,
  messagesClassName,
}: MessageThreadProps<TMessage>) {
  const groups = useMessageThread(messages);

  const internalContainerRef = useRef<HTMLDivElement | null>(null);
  const internalEndRef = useRef<HTMLDivElement | null>(null);
  // Tracked from scroll events, not computed in the messages effect —
  // post-append scrollHeight would make the reader look scrolled-up.
  const nearBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const setContainerRef = (node: HTMLDivElement | null) => {
    internalContainerRef.current = node;
    if (messagesContainerRef) {
      messagesContainerRef.current = node;
    }
  };

  const setEndRef = (node: HTMLDivElement | null) => {
    internalEndRef.current = node;
    if (messagesEndRef) {
      messagesEndRef.current = node;
    }
  };

  const handleScroll: UIEventHandler<HTMLDivElement> = (event) => {
    if (autoAnchor) {
      const target = event.currentTarget;
      const nearBottom =
        target.scrollHeight - target.scrollTop - target.clientHeight < 100;
      nearBottomRef.current = nearBottom;
      setShowJump(!nearBottom && target.scrollHeight > target.clientHeight);
    }
    onMessagesScroll?.(event);
  };

  useEffect(() => {
    if (!autoAnchor || messages.length === 0) return;
    const newestIsOwn =
      messages[messages.length - 1]?.senderId === currentUserId;
    if (nearBottomRef.current || newestIsOwn) {
      internalEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setShowJump(false);
    } else {
      setShowJump(true);
    }
  }, [messages, autoAnchor, currentUserId]);

  const handleJumpToLatest = () => {
    const container = internalContainerRef.current;
    container?.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
    nearBottomRef.current = true;
    setShowJump(false);
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={setContainerRef}
        data-testid="messages-container"
        role="log"
        aria-label={
          otherUserName ? `Conversation with ${otherUserName}` : "Conversation"
        }
        className={cn("flex-1 overflow-y-auto px-6 pb-6 pt-4", messagesClassName)}
        onScroll={handleScroll}
      >
        {messagesBefore}

        {groups.map((group) => (
          <div key={group.key}>
            <DaySeparator date={group.date} label={group.label} />
            <div className="space-y-3">
              {group.messages.map((message, index) => {
                const isCurrentUserMessage = message.senderId === currentUserId;
                const previousMessage = group.messages[index - 1];
                const showAvatar =
                  !isCurrentUserMessage &&
                  (!previousMessage ||
                    previousMessage.senderId !== message.senderId);

                return (
                  <MessageBubble
                    key={message.id}
                    id={message.id}
                    content={message.content}
                    createdAt={message.createdAt}
                    direction={isCurrentUserMessage ? "sent" : "received"}
                    status={getDeliveryState(message, isCurrentUserMessage)}
                    senderName={message.sender?.name ?? otherUserName}
                    showAvatarSlot={showAvatar}
                    avatar={
                      showAvatar ? (
                        <UserAvatar
                          image={message.sender?.image ?? otherUserImage}
                          name={message.sender?.name ?? otherUserName}
                          className="h-8 w-8"
                        />
                      ) : undefined
                    }
                    onRetry={
                      message.failed && onRetryMessage
                        ? () => onRetryMessage(message)
                        : undefined
                    }
                    onDelete={
                      message.failed && onDeleteFailedMessage
                        ? () => onDeleteFailedMessage(message.id)
                        : undefined
                    }
                    retryDisabled={retryFailedDisabled}
                    retryTestId={retryTestId}
                    deleteTestId={deleteTestId}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {otherUserTyping && (
          <div
            data-testid="typing-indicator"
            className="mt-3 flex items-center gap-2"
          >
            <UserAvatar
              image={otherUserImage}
              name={otherUserName}
              className="h-8 w-8"
            />
            <div className="rounded-2xl rounded-bl-md bg-surface-container-high px-4 py-3">
              <div className="flex gap-1">
                <span
                  className="h-2 w-2 animate-bounce rounded-full bg-on-surface-variant"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="h-2 w-2 animate-bounce rounded-full bg-on-surface-variant"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="h-2 w-2 animate-bounce rounded-full bg-on-surface-variant"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={setEndRef} />
      </div>

      {autoAnchor && showJump && (
        <button
          type="button"
          onClick={handleJumpToLatest}
          aria-label={jumpToLatestLabel}
          data-testid={jumpToLatestTestId}
          className="absolute bottom-4 right-4 z-10 flex items-center gap-2 rounded-full bg-on-surface px-4 py-2 text-white shadow-ambient transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 hover:bg-on-surface"
        >
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-medium">New messages</span>
        </button>
      )}
      </div>

      {footer ??
        (composer ? (
          <div className="space-y-2 bg-surface-container-lowest px-6 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-4">
            {composer.before}
            <MessageComposer
              value={composer.value}
              onChange={composer.onChange}
              onSubmit={composer.onSubmit}
              inputRef={composer.inputRef}
              disabled={composer.disabled}
              submitDisabled={composer.submitDisabled}
              isSending={composer.isSending}
              placeholder={
                composer.placeholder ??
                (composer.isOffline ? "You're offline..." : "Type a message...")
              }
              maxLength={composer.maxLength ?? MESSAGE_MAX_LENGTH}
              inputTestId={composer.inputTestId}
              submitTestId={composer.submitTestId}
              counterTestId={composer.counterTestId}
            />
          </div>
        ) : null)}
    </div>
  );
}
