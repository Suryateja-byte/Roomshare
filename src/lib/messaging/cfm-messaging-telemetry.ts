import crypto from "crypto";
import { logger } from "@/lib/logger";

export type ConversationStartPath = "created" | "resurrected" | "existing";

const LOG_HMAC_SECRET = process.env.LOG_HMAC_SECRET || "";

/**
 * HMAC-hash an identifier for log/metric labels so we satisfy the
 * "no raw PII in logs" non-negotiable (CLAUDE.md) while still
 * preserving the ability to group log lines by conversation pair.
 * Falls back to a truncated sha256 when LOG_HMAC_SECRET is unset so
 * tests still observe a stable 16-hex token.
 */
export function hashIdForLog(id: string): string {
  if (LOG_HMAC_SECRET.length > 0) {
    return crypto
      .createHmac("sha256", LOG_HMAC_SECRET)
      .update(id)
      .digest("hex")
      .slice(0, 16);
  }
  return crypto.createHash("sha256").update(id).digest("hex").slice(0, 16);
}

interface CfmMessagingTelemetryStore {
  startPathCounts: Record<ConversationStartPath, number>;
  duplicatePairTotal: number;
}

const telemetryStore: CfmMessagingTelemetryStore = {
  startPathCounts: {
    created: 0,
    resurrected: 0,
    existing: 0,
  },
  duplicatePairTotal: 0,
};

/**
 * Record which resolution path `startConversation` took. Emits the
 * `cfm.messaging.conv.start_path` counter from the CFM-004
 * observability spec (docs/migration/cfm-observability.md §3
 * P0 messaging row).
 */
export function recordConversationStartPath({
  path,
  listingId,
  userId,
}: {
  path: ConversationStartPath;
  listingId: string;
  userId: string;
}): void {
  telemetryStore.startPathCounts[path] += 1;
  logger.sync.info("cfm.messaging.conv.start_path", {
    path,
    listingIdHash: hashIdForLog(listingId),
    userIdHash: hashIdForLog(userId),
    total: telemetryStore.startPathCounts[path],
  });
}

/**
 * Record a detected duplicate conversation pair. Emits the
 * `cfm.messaging.conv.duplicate_pair_count` counter — any increment is
 * a paging-grade incident (see CFM-004 observability spec §3).
 */
export function recordDuplicateConversationPair({
  listingId,
}: {
  listingId: string;
}): void {
  telemetryStore.duplicatePairTotal += 1;
  logger.sync.error("cfm.messaging.conv.duplicate_pair_count", {
    listingIdHash: hashIdForLog(listingId),
    total: telemetryStore.duplicatePairTotal,
  });
}

export function getCfmMessagingTelemetrySnapshot() {
  return {
    startPathCounts: { ...telemetryStore.startPathCounts },
    duplicatePairTotal: telemetryStore.duplicatePairTotal,
  };
}

/**
 * Test-only reset. NEVER call from production code paths.
 */
export function _resetCfmMessagingTelemetryForTests(): void {
  telemetryStore.startPathCounts.created = 0;
  telemetryStore.startPathCounts.resurrected = 0;
  telemetryStore.startPathCounts.existing = 0;
  telemetryStore.duplicatePairTotal = 0;
}
