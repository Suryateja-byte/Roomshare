export const FRESHNESS_NOTIFICATION_KINDS = [
  "reminder",
  "warning",
] as const;
export const FRESHNESS_CRON_ERROR_STAGES = [
  "notification",
  "email",
  "db",
] as const;

export type FreshnessNotificationKind =
  (typeof FRESHNESS_NOTIFICATION_KINDS)[number];
export type FreshnessCronErrorStage =
  (typeof FRESHNESS_CRON_ERROR_STAGES)[number];

export const FRESHNESS_NOTIFICATION_SENT_METRIC =
  "cfm.listing.freshness_notification_sent_count";
export const FRESHNESS_CRON_ELIGIBLE_METRIC =
  "cfm.cron.freshness_reminder.eligible_count";
export const FRESHNESS_CRON_EMITTED_METRIC =
  "cfm.cron.freshness_reminder.emitted_count";

type KindCounterMap = Record<FreshnessNotificationKind, number>;
type ErrorCounterMap = Record<
  FreshnessNotificationKind,
  Record<FreshnessCronErrorStage, number>
>;

interface FreshnessCronTelemetryStore {
  eligibleCounts: KindCounterMap;
  emittedCounts: KindCounterMap;
  errorCounts: ErrorCounterMap;
  skippedPreferenceCounts: KindCounterMap;
  skippedAutoPauseCount: number;
  skippedUnconfirmedCount: number;
  skippedStaleRowCount: number;
  skippedSuspendedCount: number;
  budgetExhaustedCount: number;
  lockHeldCount: number;
}

function createKindCounterMap(): KindCounterMap {
  return {
    reminder: 0,
    warning: 0,
  };
}

function createErrorCounterMap(): ErrorCounterMap {
  return {
    reminder: {
      notification: 0,
      email: 0,
      db: 0,
    },
    warning: {
      notification: 0,
      email: 0,
      db: 0,
    },
  };
}

const telemetryStore: FreshnessCronTelemetryStore = {
  eligibleCounts: createKindCounterMap(),
  emittedCounts: createKindCounterMap(),
  errorCounts: createErrorCounterMap(),
  skippedPreferenceCounts: createKindCounterMap(),
  skippedAutoPauseCount: 0,
  skippedUnconfirmedCount: 0,
  skippedStaleRowCount: 0,
  skippedSuspendedCount: 0,
  budgetExhaustedCount: 0,
  lockHeldCount: 0,
};

function sanitizeCount(value: number | undefined): number {
  if (!Number.isFinite(value) || value == null || value < 0) {
    return 0;
  }

  return Math.trunc(value);
}

export function recordFreshnessCronRun({
  eligibleCounts,
  emittedCounts,
  errorCounts,
  skippedPreferenceCounts,
  skippedAutoPauseCount = 0,
  skippedUnconfirmedCount = 0,
  skippedStaleRowCount = 0,
  skippedSuspendedCount = 0,
  budgetExhausted = false,
}: {
  eligibleCounts?: Partial<Record<FreshnessNotificationKind, number>>;
  emittedCounts?: Partial<Record<FreshnessNotificationKind, number>>;
  errorCounts?: Partial<
    Record<
      FreshnessNotificationKind,
      Partial<Record<FreshnessCronErrorStage, number>>
    >
  >;
  skippedPreferenceCounts?: Partial<Record<FreshnessNotificationKind, number>>;
  skippedAutoPauseCount?: number;
  skippedUnconfirmedCount?: number;
  skippedStaleRowCount?: number;
  skippedSuspendedCount?: number;
  budgetExhausted?: boolean;
}): void {
  for (const kind of FRESHNESS_NOTIFICATION_KINDS) {
    telemetryStore.eligibleCounts[kind] = sanitizeCount(eligibleCounts?.[kind]);
    telemetryStore.emittedCounts[kind] += sanitizeCount(emittedCounts?.[kind]);
    telemetryStore.skippedPreferenceCounts[kind] += sanitizeCount(
      skippedPreferenceCounts?.[kind]
    );

    for (const stage of FRESHNESS_CRON_ERROR_STAGES) {
      telemetryStore.errorCounts[kind][stage] += sanitizeCount(
        errorCounts?.[kind]?.[stage]
      );
    }
  }

  telemetryStore.skippedAutoPauseCount += sanitizeCount(skippedAutoPauseCount);
  telemetryStore.skippedUnconfirmedCount += sanitizeCount(
    skippedUnconfirmedCount
  );
  telemetryStore.skippedStaleRowCount += sanitizeCount(skippedStaleRowCount);
  telemetryStore.skippedSuspendedCount += sanitizeCount(skippedSuspendedCount);

  if (budgetExhausted) {
    telemetryStore.budgetExhaustedCount += 1;
  }
}

export function recordFreshnessCronLockHeld(): void {
  telemetryStore.lockHeldCount += 1;
}

export function getFreshnessCronTelemetrySnapshot() {
  return {
    eligibleCounts: { ...telemetryStore.eligibleCounts },
    emittedCounts: { ...telemetryStore.emittedCounts },
    notificationSentCounts: { ...telemetryStore.emittedCounts },
    errorCounts: {
      reminder: { ...telemetryStore.errorCounts.reminder },
      warning: { ...telemetryStore.errorCounts.warning },
    },
    skippedPreferenceCounts: { ...telemetryStore.skippedPreferenceCounts },
    skippedAutoPauseCount: telemetryStore.skippedAutoPauseCount,
    skippedUnconfirmedCount: telemetryStore.skippedUnconfirmedCount,
    skippedStaleRowCount: telemetryStore.skippedStaleRowCount,
    skippedSuspendedCount: telemetryStore.skippedSuspendedCount,
    budgetExhaustedCount: telemetryStore.budgetExhaustedCount,
    lockHeldCount: telemetryStore.lockHeldCount,
  };
}

export function resetFreshnessCronTelemetryForTests(): void {
  telemetryStore.eligibleCounts = createKindCounterMap();
  telemetryStore.emittedCounts = createKindCounterMap();
  telemetryStore.errorCounts = createErrorCounterMap();
  telemetryStore.skippedPreferenceCounts = createKindCounterMap();
  telemetryStore.skippedAutoPauseCount = 0;
  telemetryStore.skippedUnconfirmedCount = 0;
  telemetryStore.skippedStaleRowCount = 0;
  telemetryStore.skippedSuspendedCount = 0;
  telemetryStore.budgetExhaustedCount = 0;
  telemetryStore.lockHeldCount = 0;
}
