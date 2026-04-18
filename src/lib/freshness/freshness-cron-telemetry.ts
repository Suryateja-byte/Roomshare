export const FRESHNESS_NOTIFICATION_KINDS = [
  "reminder",
  "warning",
] as const;
export const FRESHNESS_CRON_ERROR_STAGES = [
  "notification",
  "email",
  "db",
] as const;
export const AUTO_PAUSE_CRON_ERROR_STAGES = [
  "notification",
  "email",
  "db",
] as const;
export const AUTO_PAUSE_CRON_SKIP_REASONS = [
  "already_paused",
  "version_conflict",
  "stale_row",
  "suspended",
  "no_warning",
  "not_host_managed",
  "migration_review",
  "feature_disabled",
] as const;

export type FreshnessNotificationKind =
  (typeof FRESHNESS_NOTIFICATION_KINDS)[number];
export type FreshnessCronErrorStage =
  (typeof FRESHNESS_CRON_ERROR_STAGES)[number];
export type AutoPauseCronErrorStage =
  (typeof AUTO_PAUSE_CRON_ERROR_STAGES)[number];
export type AutoPauseCronSkipReason =
  (typeof AUTO_PAUSE_CRON_SKIP_REASONS)[number];

export const FRESHNESS_NOTIFICATION_SENT_METRIC =
  "cfm.listing.freshness_notification_sent_count";
export const FRESHNESS_CRON_ELIGIBLE_METRIC =
  "cfm.cron.freshness_reminder.eligible_count";
export const FRESHNESS_CRON_EMITTED_METRIC =
  "cfm.cron.freshness_reminder.emitted_count";
export const AUTO_PAUSE_COUNT_METRIC = "cfm.listing.auto_paused_count";
export const AUTO_PAUSE_CRON_ELIGIBLE_METRIC =
  "cfm.cron.stale_auto_pause.eligible_count";
export const AUTO_PAUSE_CRON_EMITTED_METRIC =
  "cfm.cron.stale_auto_pause.emitted_count";

type KindCounterMap = Record<FreshnessNotificationKind, number>;
type FreshnessErrorCounterMap = Record<
  FreshnessNotificationKind,
  Record<FreshnessCronErrorStage, number>
>;
type AutoPauseErrorCounterMap = Record<AutoPauseCronErrorStage, number>;
type AutoPauseSkipCounterMap = Record<AutoPauseCronSkipReason, number>;

interface FreshnessCronTelemetryStore {
  eligibleCounts: KindCounterMap;
  emittedCounts: KindCounterMap;
  errorCounts: FreshnessErrorCounterMap;
  skippedPreferenceCounts: KindCounterMap;
  skippedAutoPauseCount: number;
  skippedUnconfirmedCount: number;
  skippedStaleRowCount: number;
  skippedSuspendedCount: number;
  budgetExhaustedCount: number;
  lockHeldCount: number;
}

interface AutoPauseCronTelemetryStore {
  eligibleCount: number;
  autoPausedCount: number;
  emittedCount: number;
  errorCounts: AutoPauseErrorCounterMap;
  skippedCounts: AutoPauseSkipCounterMap;
  budgetExhaustedCount: number;
  lockHeldCount: number;
}

function createKindCounterMap(): KindCounterMap {
  return {
    reminder: 0,
    warning: 0,
  };
}

function createFreshnessErrorCounterMap(): FreshnessErrorCounterMap {
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

function createAutoPauseErrorCounterMap(): AutoPauseErrorCounterMap {
  return {
    notification: 0,
    email: 0,
    db: 0,
  };
}

function createAutoPauseSkipCounterMap(): AutoPauseSkipCounterMap {
  return {
    already_paused: 0,
    version_conflict: 0,
    stale_row: 0,
    suspended: 0,
    no_warning: 0,
    not_host_managed: 0,
    migration_review: 0,
    feature_disabled: 0,
  };
}

const freshnessTelemetryStore: FreshnessCronTelemetryStore = {
  eligibleCounts: createKindCounterMap(),
  emittedCounts: createKindCounterMap(),
  errorCounts: createFreshnessErrorCounterMap(),
  skippedPreferenceCounts: createKindCounterMap(),
  skippedAutoPauseCount: 0,
  skippedUnconfirmedCount: 0,
  skippedStaleRowCount: 0,
  skippedSuspendedCount: 0,
  budgetExhaustedCount: 0,
  lockHeldCount: 0,
};

const autoPauseTelemetryStore: AutoPauseCronTelemetryStore = {
  eligibleCount: 0,
  autoPausedCount: 0,
  emittedCount: 0,
  errorCounts: createAutoPauseErrorCounterMap(),
  skippedCounts: createAutoPauseSkipCounterMap(),
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
    freshnessTelemetryStore.eligibleCounts[kind] = sanitizeCount(
      eligibleCounts?.[kind]
    );
    freshnessTelemetryStore.emittedCounts[kind] += sanitizeCount(
      emittedCounts?.[kind]
    );
    freshnessTelemetryStore.skippedPreferenceCounts[kind] += sanitizeCount(
      skippedPreferenceCounts?.[kind]
    );

    for (const stage of FRESHNESS_CRON_ERROR_STAGES) {
      freshnessTelemetryStore.errorCounts[kind][stage] += sanitizeCount(
        errorCounts?.[kind]?.[stage]
      );
    }
  }

  freshnessTelemetryStore.skippedAutoPauseCount += sanitizeCount(
    skippedAutoPauseCount
  );
  freshnessTelemetryStore.skippedUnconfirmedCount += sanitizeCount(
    skippedUnconfirmedCount
  );
  freshnessTelemetryStore.skippedStaleRowCount += sanitizeCount(
    skippedStaleRowCount
  );
  freshnessTelemetryStore.skippedSuspendedCount += sanitizeCount(
    skippedSuspendedCount
  );

  if (budgetExhausted) {
    freshnessTelemetryStore.budgetExhaustedCount += 1;
  }
}

export function recordFreshnessCronLockHeld(): void {
  freshnessTelemetryStore.lockHeldCount += 1;
}

export function getFreshnessCronTelemetrySnapshot() {
  return {
    eligibleCounts: { ...freshnessTelemetryStore.eligibleCounts },
    emittedCounts: { ...freshnessTelemetryStore.emittedCounts },
    notificationSentCounts: { ...freshnessTelemetryStore.emittedCounts },
    errorCounts: {
      reminder: { ...freshnessTelemetryStore.errorCounts.reminder },
      warning: { ...freshnessTelemetryStore.errorCounts.warning },
    },
    skippedPreferenceCounts: {
      ...freshnessTelemetryStore.skippedPreferenceCounts,
    },
    skippedAutoPauseCount: freshnessTelemetryStore.skippedAutoPauseCount,
    skippedUnconfirmedCount: freshnessTelemetryStore.skippedUnconfirmedCount,
    skippedStaleRowCount: freshnessTelemetryStore.skippedStaleRowCount,
    skippedSuspendedCount: freshnessTelemetryStore.skippedSuspendedCount,
    budgetExhaustedCount: freshnessTelemetryStore.budgetExhaustedCount,
    lockHeldCount: freshnessTelemetryStore.lockHeldCount,
  };
}

export function resetFreshnessCronTelemetryForTests(): void {
  freshnessTelemetryStore.eligibleCounts = createKindCounterMap();
  freshnessTelemetryStore.emittedCounts = createKindCounterMap();
  freshnessTelemetryStore.errorCounts = createFreshnessErrorCounterMap();
  freshnessTelemetryStore.skippedPreferenceCounts = createKindCounterMap();
  freshnessTelemetryStore.skippedAutoPauseCount = 0;
  freshnessTelemetryStore.skippedUnconfirmedCount = 0;
  freshnessTelemetryStore.skippedStaleRowCount = 0;
  freshnessTelemetryStore.skippedSuspendedCount = 0;
  freshnessTelemetryStore.budgetExhaustedCount = 0;
  freshnessTelemetryStore.lockHeldCount = 0;
}

export function recordAutoPauseCronRun({
  eligibleCount = 0,
  autoPausedCount = 0,
  emittedCount = 0,
  errorCounts,
  skippedCounts,
  budgetExhausted = false,
}: {
  eligibleCount?: number;
  autoPausedCount?: number;
  emittedCount?: number;
  errorCounts?: Partial<Record<AutoPauseCronErrorStage, number>>;
  skippedCounts?: Partial<Record<AutoPauseCronSkipReason, number>>;
  budgetExhausted?: boolean;
}): void {
  autoPauseTelemetryStore.eligibleCount = sanitizeCount(eligibleCount);
  autoPauseTelemetryStore.autoPausedCount += sanitizeCount(autoPausedCount);
  autoPauseTelemetryStore.emittedCount += sanitizeCount(emittedCount);

  for (const stage of AUTO_PAUSE_CRON_ERROR_STAGES) {
    autoPauseTelemetryStore.errorCounts[stage] += sanitizeCount(
      errorCounts?.[stage]
    );
  }

  for (const reason of AUTO_PAUSE_CRON_SKIP_REASONS) {
    autoPauseTelemetryStore.skippedCounts[reason] += sanitizeCount(
      skippedCounts?.[reason]
    );
  }

  if (budgetExhausted) {
    autoPauseTelemetryStore.budgetExhaustedCount += 1;
  }
}

export function recordAutoPauseCronLockHeld(): void {
  autoPauseTelemetryStore.lockHeldCount += 1;
}

export function getAutoPauseCronTelemetrySnapshot() {
  return {
    eligibleCount: autoPauseTelemetryStore.eligibleCount,
    autoPausedCount: autoPauseTelemetryStore.autoPausedCount,
    emittedCount: autoPauseTelemetryStore.emittedCount,
    errorCounts: { ...autoPauseTelemetryStore.errorCounts },
    skippedCounts: { ...autoPauseTelemetryStore.skippedCounts },
    budgetExhaustedCount: autoPauseTelemetryStore.budgetExhaustedCount,
    lockHeldCount: autoPauseTelemetryStore.lockHeldCount,
  };
}

export function resetAutoPauseCronTelemetryForTests(): void {
  autoPauseTelemetryStore.eligibleCount = 0;
  autoPauseTelemetryStore.autoPausedCount = 0;
  autoPauseTelemetryStore.emittedCount = 0;
  autoPauseTelemetryStore.errorCounts = createAutoPauseErrorCounterMap();
  autoPauseTelemetryStore.skippedCounts = createAutoPauseSkipCounterMap();
  autoPauseTelemetryStore.budgetExhaustedCount = 0;
  autoPauseTelemetryStore.lockHeldCount = 0;
}
