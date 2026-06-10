"use client";

import { Loader2, Send } from "lucide-react";
import { useEffect, useRef } from "react";
import type { FormEvent, KeyboardEvent, RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MESSAGE_MAX_LENGTH } from "@/lib/messaging/message-contract";
import { cn } from "@/lib/utils";

export interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  maxLength?: number;
  disabled?: boolean;
  submitDisabled?: boolean;
  isSending?: boolean;
  placeholder?: string;
  submitLabel?: string;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  inputTestId?: string;
  submitTestId?: string;
  counterTestId?: string;
  className?: string;
}

export function MessageComposer({
  value,
  onChange,
  onSubmit,
  maxLength = MESSAGE_MAX_LENGTH,
  disabled = false,
  submitDisabled: submitDisabledProp = false,
  isSending = false,
  placeholder = "Type a message...",
  submitLabel = "Send message",
  inputRef,
  inputTestId = "message-composer-input",
  submitTestId = "message-composer-submit",
  counterTestId = "message-composer-counter",
  className,
}: MessageComposerProps) {
  const trimmedLength = value.trim().length;
  const remaining = maxLength - value.length;
  const isOverLimit = remaining < 0;
  const submitDisabled =
    disabled ||
    isSending ||
    submitDisabledProp ||
    trimmedLength === 0 ||
    isOverLimit;

  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const setTextareaRef = (node: HTMLTextAreaElement | null) => {
    innerRef.current = node;
    if (inputRef) {
      inputRef.current = node;
    }
  };

  // Autogrow: track content height, capped by the max-h-36 class.
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    if (el.scrollHeight > 0) {
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);

  const submitIfAllowed = () => {
    if (!submitDisabled) {
      onSubmit();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitIfAllowed();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    // Plain Enter never inserts a newline — it sends (or no-ops mid-send).
    event.preventDefault();
    submitIfAllowed();
  };

  return (
    <form
      data-testid="message-composer"
      className={cn("space-y-2", className)}
      onSubmit={handleSubmit}
    >
      <div className="flex items-end gap-3">
        <Textarea
          ref={setTextareaRef}
          data-testid={inputTestId}
          aria-label="Message"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          rows={1}
          className="max-h-36 min-h-[44px] flex-1 resize-none rounded-2xl bg-surface-container-high px-4 py-3"
        />
        <Button
          type="submit"
          size="icon"
          disabled={submitDisabled}
          aria-label={submitLabel}
          data-testid={submitTestId}
          className="shrink-0 bg-on-surface text-white hover:bg-on-surface"
        >
          {isSending ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-5 w-5" aria-hidden="true" />
          )}
        </Button>
      </div>
      <div
        aria-live="polite"
        data-testid={counterTestId}
        className={cn(
          "text-right text-xs text-on-surface-variant",
          isOverLimit && "font-medium text-red-600"
        )}
      >
        {value.length}/{maxLength}
      </div>
    </form>
  );
}
