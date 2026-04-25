import { logger } from "@/lib/logger";
import { hashIdForLog } from "@/lib/messaging/cfm-messaging-telemetry";

interface CfmOpsTelemetryStore {
  unauthorizedCreateCount: number;
  contactOnlyAttemptCount: number;
  freshnessRecoveredCount: number;
}

const telemetryStore: CfmOpsTelemetryStore = {
  unauthorizedCreateCount: 0,
  contactOnlyAttemptCount: 0,
  freshnessRecoveredCount: 0,
};

export function recordUnauthorizedReviewCreate(params: {
  listingId?: string;
  targetUserId?: string;
  reviewerId?: string;
  scope: "listing" | "user";
}): void {
  telemetryStore.unauthorizedCreateCount += 1;
  logger.sync.info("cfm.review.unauthorized_create_count", {
    scope: params.scope,
    total: telemetryStore.unauthorizedCreateCount,
    ...(params.listingId ? { listingIdHash: hashIdForLog(params.listingId) } : {}),
    ...(params.targetUserId
      ? { targetUserIdHash: hashIdForLog(params.targetUserId) }
      : {}),
    ...(params.reviewerId ? { reviewerIdHash: hashIdForLog(params.reviewerId) } : {}),
  });
}

export function recordContactOnlyReviewAttempt(params: {
  listingId: string;
  reviewerId: string;
  targetUserId: string;
}): void {
  telemetryStore.contactOnlyAttemptCount += 1;
  logger.sync.info("cfm.review.contact_only_attempt_count", {
    total: telemetryStore.contactOnlyAttemptCount,
    listingIdHash: hashIdForLog(params.listingId),
    reviewerIdHash: hashIdForLog(params.reviewerId),
    targetUserIdHash: hashIdForLog(params.targetUserId),
  });
}

export function recordFreshnessRecovered(params: {
  listingId: string;
  ownerId: string;
  mode: "RECONFIRM" | "REOPEN";
}): void {
  telemetryStore.freshnessRecoveredCount += 1;
  logger.sync.info("cfm.listing.freshness_recovered_count", {
    mode: params.mode,
    total: telemetryStore.freshnessRecoveredCount,
    listingIdHash: hashIdForLog(params.listingId),
    ownerIdHash: hashIdForLog(params.ownerId),
  });
}

export function getCfmOpsTelemetrySnapshot() {
  return {
    unauthorizedCreateCount: telemetryStore.unauthorizedCreateCount,
    contactOnlyAttemptCount: telemetryStore.contactOnlyAttemptCount,
    freshnessRecoveredCount: telemetryStore.freshnessRecoveredCount,
  };
}

export function resetCfmOpsTelemetryForTests(): void {
  telemetryStore.unauthorizedCreateCount = 0;
  telemetryStore.contactOnlyAttemptCount = 0;
  telemetryStore.freshnessRecoveredCount = 0;
}
