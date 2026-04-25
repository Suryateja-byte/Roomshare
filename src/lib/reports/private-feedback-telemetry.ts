import { logger } from "@/lib/logger";
import { hashIdForLog } from "@/lib/messaging/cfm-messaging-telemetry";
import {
  PRIVATE_FEEDBACK_CATEGORIES,
  PRIVATE_FEEDBACK_DENIAL_REASONS,
  type PrivateFeedbackCategory,
  type PrivateFeedbackDeniedReason,
} from "./private-feedback";

interface PrivateFeedbackTelemetryStore {
  submissionCounts: Record<PrivateFeedbackCategory, number>;
  deniedCounts: Record<PrivateFeedbackDeniedReason, number>;
}

const telemetryStore: PrivateFeedbackTelemetryStore = {
  submissionCounts: Object.fromEntries(
    PRIVATE_FEEDBACK_CATEGORIES.map((category) => [category, 0])
  ) as Record<PrivateFeedbackCategory, number>,
  deniedCounts: Object.fromEntries(
    PRIVATE_FEEDBACK_DENIAL_REASONS.map((reason) => [reason, 0])
  ) as Record<PrivateFeedbackDeniedReason, number>,
};

export function recordPrivateFeedbackSubmission({
  category,
  listingId,
  reporterId,
  targetUserId,
}: {
  category: PrivateFeedbackCategory;
  listingId: string;
  reporterId: string;
  targetUserId?: string;
}): void {
  telemetryStore.submissionCounts[category] += 1;
  logger.sync.info("cfm.feedback.submission_count", {
    category,
    total: telemetryStore.submissionCounts[category],
    listingIdHash: hashIdForLog(listingId),
    reporterIdHash: hashIdForLog(reporterId),
    ...(targetUserId ? { targetUserIdHash: hashIdForLog(targetUserId) } : {}),
  });
}

export function recordPrivateFeedbackDenied({
  reason,
  listingId,
  reporterId,
  targetUserId,
}: {
  reason: PrivateFeedbackDeniedReason;
  listingId?: string;
  reporterId?: string;
  targetUserId?: string;
}): void {
  telemetryStore.deniedCounts[reason] += 1;
  logger.sync.info("cfm.feedback.denied_count", {
    reason,
    total: telemetryStore.deniedCounts[reason],
    ...(listingId ? { listingIdHash: hashIdForLog(listingId) } : {}),
    ...(reporterId ? { reporterIdHash: hashIdForLog(reporterId) } : {}),
    ...(targetUserId ? { targetUserIdHash: hashIdForLog(targetUserId) } : {}),
  });
}

export function getPrivateFeedbackTelemetrySnapshot() {
  return {
    submissionCounts: { ...telemetryStore.submissionCounts },
    deniedCounts: { ...telemetryStore.deniedCounts },
  };
}

export function _resetPrivateFeedbackTelemetryForTests(): void {
  for (const category of PRIVATE_FEEDBACK_CATEGORIES) {
    telemetryStore.submissionCounts[category] = 0;
  }
  for (const reason of PRIVATE_FEEDBACK_DENIAL_REASONS) {
    telemetryStore.deniedCounts[reason] = 0;
  }
}
