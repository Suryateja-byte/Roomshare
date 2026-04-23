import { logger } from "@/lib/logger";
import { hashIdForLog } from "@/lib/messaging/cfm-messaging-telemetry";

export type OutboundContentFlagKind = "phone" | "email";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_PATTERN =
  /(?:\+?\d[\s().-]*)?(?:\d[\s().-]*){9,}\d/;

export function scanOutboundMessageContent(
  content: string
): OutboundContentFlagKind[] {
  const flags = new Set<OutboundContentFlagKind>();

  if (EMAIL_PATTERN.test(content)) {
    flags.add("email");
  }

  if (PHONE_PATTERN.test(content)) {
    flags.add("phone");
  }

  return Array.from(flags).sort();
}

export function recordOutboundContentSoftFlag(input: {
  conversationId: string;
  userId: string;
  flagKinds: OutboundContentFlagKind[];
}) {
  if (input.flagKinds.length === 0) {
    return;
  }

  logger.sync.warn("cfm.messaging.outbound_content_soft_flag", {
    conversationIdHash: hashIdForLog(input.conversationId),
    userIdHash: hashIdForLog(input.userId),
    flagKinds: input.flagKinds,
    action: "sendMessage",
  });
}
