"use client";

import { useMemo } from "react";

import type { MessageTimestamp } from "./types";

export type ThreadMessage = {
  id: string;
  content: string;
  senderId: string;
  createdAt: MessageTimestamp;
  read?: boolean;
  failed?: boolean;
  sender?: {
    id?: string;
    name: string | null;
    image: string | null;
  } | null;
};

export type MessageThreadGroup<TMessage extends ThreadMessage> = {
  key: string;
  label: string;
  date: Date;
  messages: TMessage[];
};

function getDayKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function getThreadDayLabel(
  date: MessageTimestamp,
  now: Date = new Date()
): string {
  const dateValue = new Date(date);
  const key = getDayKey(dateValue);
  if (key === getDayKey(now)) {
    return "Today";
  }
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1
  );
  if (key === getDayKey(yesterday)) {
    return "Yesterday";
  }
  return dateValue.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getThreadDay(
  date: MessageTimestamp,
  now: Date
): {
  key: string;
  label: string;
  date: Date;
} {
  const dateValue = new Date(date);
  return {
    key: getDayKey(dateValue),
    label: getThreadDayLabel(dateValue, now),
    date: dateValue,
  };
}

export function useMessageThread<TMessage extends ThreadMessage>(
  messages: TMessage[]
): MessageThreadGroup<TMessage>[] {
  return useMemo(() => {
    const groups = new Map<string, MessageThreadGroup<TMessage>>();
    const now = new Date();

    messages.forEach((message) => {
      const day = getThreadDay(message.createdAt, now);
      const group = groups.get(day.key);

      if (group) {
        group.messages.push(message);
        return;
      }

      groups.set(day.key, {
        ...day,
        messages: [message],
      });
    });

    return Array.from(groups.values());
  }, [messages]);
}
