export type MergeableMessage = {
  id: string;
  content: string;
  senderId: string;
  createdAt: Date | string | number;
  failed?: boolean;
  sender?: unknown;
};

const OPTIMISTIC_ID_PREFIX = "opt-";
const OPTIMISTIC_ECHO_MATCH_WINDOW_MS = 2 * 60 * 1000;

type MergeIncomingMessageOptions = {
  optimisticMessageId?: string;
};

function timestampMs(value: MergeableMessage["createdAt"]): number {
  const time =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
}

function timingDistanceMs(
  optimistic: MergeableMessage,
  incoming: MergeableMessage
): number | null {
  const optimisticTime = timestampMs(optimistic.createdAt);
  const incomingTime = timestampMs(incoming.createdAt);

  if (!Number.isFinite(optimisticTime) || !Number.isFinite(incomingTime)) {
    return null;
  }

  return Math.abs(incomingTime - optimisticTime);
}

function findMatchingOptimisticEchoIndex<T extends MergeableMessage>(
  messages: T[],
  incoming: MergeableMessage,
  currentUserId: string
): number {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  messages.forEach((message, index) => {
    if (
      incoming.senderId !== currentUserId ||
      message.senderId !== currentUserId ||
      !message.id.startsWith(OPTIMISTIC_ID_PREFIX) ||
      message.failed ||
      message.content !== incoming.content
    ) {
      return;
    }

    const distance = timingDistanceMs(message, incoming);
    if (
      distance !== null &&
      distance <= OPTIMISTIC_ECHO_MATCH_WINDOW_MS &&
      distance < bestDistance
    ) {
      bestIndex = index;
      bestDistance = distance;
    }
  });

  return bestIndex;
}

export function mergeIncomingMessage<T extends MergeableMessage>(
  prev: T[],
  incoming: T,
  currentUserId: string,
  options: MergeIncomingMessageOptions = {}
): T[] {
  const duplicateRealIndex = prev.findIndex(
    (message) => message.id === incoming.id
  );
  const explicitOptimisticIndex = options.optimisticMessageId
    ? prev.findIndex((message) => message.id === options.optimisticMessageId)
    : -1;

  if (duplicateRealIndex >= 0) {
    if (
      explicitOptimisticIndex >= 0 &&
      explicitOptimisticIndex !== duplicateRealIndex
    ) {
      return prev.filter((_, index) => index !== explicitOptimisticIndex);
    }

    return prev;
  }

  const optimisticIndex =
    explicitOptimisticIndex >= 0
      ? explicitOptimisticIndex
      : findMatchingOptimisticEchoIndex(prev, incoming, currentUserId);

  if (optimisticIndex >= 0) {
    const next = [...prev];
    next[optimisticIndex] = {
      ...incoming,
      sender: incoming.sender ?? prev[optimisticIndex].sender,
    };
    return next;
  }

  return [...prev, incoming];
}
