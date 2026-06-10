"use client";

import { AlertCircle, Check, CheckCheck, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { FailedMessageActions } from "./FailedMessageActions";
import type {
  MessageDeliveryState,
  MessageDirection,
  MessageTimestamp,
} from "./types";

export interface MessageBubbleProps {
  id?: string;
  content: string;
  createdAt: MessageTimestamp;
  direction: MessageDirection;
  status?: MessageDeliveryState;
  senderName?: string | null;
  showSenderName?: boolean;
  showAvatarSlot?: boolean;
  avatar?: ReactNode;
  onRetry?: () => void;
  onDelete?: () => void;
  retryDisabled?: boolean;
  deleteDisabled?: boolean;
  retryTestId?: string;
  deleteTestId?: string;
  actions?: ReactNode;
  className?: string;
}

function formatMessageTime(createdAt: MessageTimestamp): string {
  return new Date(createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: MessageDeliveryState): string {
  switch (status) {
    case "sending":
      return "Sending";
    case "sent":
      return "Sent";
    case "delivered":
      return "Delivered";
    case "read":
      return "Read";
    case "failed":
      return "Failed to send";
  }
}

function MessageStatusIcon({ status }: { status: MessageDeliveryState }) {
  if (status === "failed") {
    return <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  }

  if (status === "sending") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;
  }

  if (status === "read") {
    return <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />;
  }

  return <Check className="h-3.5 w-3.5" aria-hidden="true" />;
}

export function MessageBubble({
  id,
  content,
  createdAt,
  direction,
  status = direction === "sent" ? "sent" : "delivered",
  senderName,
  showSenderName = false,
  showAvatarSlot = false,
  avatar,
  onRetry,
  onDelete,
  retryDisabled,
  deleteDisabled,
  retryTestId,
  deleteTestId,
  actions,
  className,
}: MessageBubbleProps) {
  const isSent = direction === "sent";
  const isFailed = status === "failed";
  const isSending = status === "sending";
  const dateValue = new Date(createdAt);
  const displayStatus = statusLabel(status);

  return (
    <div
      data-testid="message-row"
      className={cn(
        "flex items-end gap-2",
        isSent ? "justify-end" : "justify-start",
        className
      )}
    >
      {!isSent && showAvatarSlot ? (
        <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center">
          {avatar}
        </div>
      ) : !isSent ? (
        <div className="h-8 w-8 shrink-0" aria-hidden="true" />
      ) : null}

      <article
        id={id}
        data-testid={isFailed ? "failed-message" : "message-bubble"}
        aria-label={`${isSent ? "Sent" : "Received"} message, ${displayStatus.toLowerCase()}`}
        className={cn(
          "max-w-[min(36rem,78%)] rounded-2xl px-4 py-2.5 shadow-ambient-sm",
          isSent &&
            "rounded-br-md bg-on-surface text-white shadow-on-surface/10",
          !isSent &&
            "rounded-bl-md bg-surface-container-high text-on-surface shadow-transparent",
          isFailed &&
            "border border-red-500/50 bg-red-900 text-white shadow-red-950/10",
          isSending && "opacity-75"
        )}
      >
        {showSenderName && senderName && (
          <p className="mb-1 text-xs font-medium text-on-surface-variant">
            {senderName}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {content}
        </p>
        <div
          className={cn(
            "mt-1 flex items-center gap-1 text-xs",
            isSent ? "justify-end text-white/65" : "text-on-surface-variant/70",
            isFailed && "text-red-100/80",
            status === "read" && "text-sky-300"
          )}
        >
          <time dateTime={dateValue.toISOString()}>
            {formatMessageTime(dateValue)}
          </time>
          {isSent && (
            <span
              data-testid="message-status"
              className="inline-flex items-center gap-1"
            >
              <MessageStatusIcon status={status} />
              <span>{displayStatus}</span>
            </span>
          )}
        </div>
        {isFailed && (
          <div className="mt-2 border-t border-red-200/25 pt-2">
            {actions ?? (
              <FailedMessageActions
                onRetry={onRetry}
                onDelete={onDelete}
                retryDisabled={retryDisabled}
                deleteDisabled={deleteDisabled}
                retryTestId={retryTestId}
                deleteTestId={deleteTestId}
              />
            )}
          </div>
        )}
      </article>
    </div>
  );
}
