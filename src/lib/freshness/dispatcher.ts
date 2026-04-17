import "server-only";

import { features } from "@/lib/env";
import {
  FRESHNESS_NOTIFICATION_SENT_METRIC,
  FRESHNESS_CRON_EMITTED_METRIC,
  recordFreshnessCronRun,
  type FreshnessCronErrorStage,
  type FreshnessNotificationKind,
} from "@/lib/freshness/freshness-cron-telemetry";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { hashIdForLog } from "@/lib/messaging/cfm-messaging-telemetry";
import { createInternalNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  AUTO_PAUSE_THRESHOLD_DAYS,
  buildFreshnessReadModel,
  REMINDER_THRESHOLD_DAYS,
  STALE_THRESHOLD_DAYS,
  type FreshnessBucket,
} from "@/lib/search/public-availability";
import {
  sendNotificationEmail,
  sendNotificationEmailWithPreference,
} from "@/lib/email";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
export const FRESHNESS_BATCH_SIZE = 500;
export const FRESHNESS_TIME_BUDGET_MS = 50_000;

type QueryCandidate = {
  id: string;
  lastConfirmedAt: Date;
  kind: FreshnessNotificationKind;
};

type FreshnessListingSnapshot = {
  id: string;
  title: string;
  version: number;
  availabilitySource: "LEGACY_BOOKING" | "HOST_MANAGED";
  status: "ACTIVE" | "PAUSED" | "RENTED";
  statusReason: string | null;
  needsMigrationReview: boolean;
  lastConfirmedAt: Date | null;
  freshnessReminderSentAt: Date | null;
  freshnessWarningSentAt: Date | null;
  owner: {
    id: string;
    email: string | null;
    name: string | null;
    isSuspended: boolean;
  };
};

export type FreshnessDispatchSkipReason =
  | "not_due"
  | "already_sent"
  | "not_host_managed"
  | "not_active"
  | "needs_migration_review"
  | "unconfirmed"
  | "auto_pause"
  | "suspended";

export type FreshnessDispatchDecision =
  | {
      action: "emit";
      kind: FreshnessNotificationKind;
      freshnessBucket: "REMINDER" | "STALE";
    }
  | {
      action: "skip";
      reason: FreshnessDispatchSkipReason;
      freshnessBucket: FreshnessBucket;
    };

type RunCounters = {
  eligible: Record<FreshnessNotificationKind, number>;
  emitted: Record<FreshnessNotificationKind, number>;
  errors: Record<
    FreshnessNotificationKind,
    Record<FreshnessCronErrorStage, number>
  >;
  skippedPreference: Record<FreshnessNotificationKind, number>;
  skippedAlreadySent: number;
  skippedNotDue: number;
  skippedAutoPause: number;
  skippedSuspended: number;
  skippedStaleRow: number;
  skippedUnconfirmed: number;
};

type EmailDispatchResult = {
  success: boolean;
  skipped?: boolean;
  error?: string;
};

export interface FreshnessDispatcherSummary {
  success: boolean;
  skipped: boolean;
  reason?: "feature_disabled";
  selected: number;
  processed: number;
  eligible: Record<FreshnessNotificationKind, number>;
  emitted: Record<FreshnessNotificationKind, number>;
  errors: Record<
    FreshnessNotificationKind,
    Record<FreshnessCronErrorStage, number>
  >;
  skippedPreference: Record<FreshnessNotificationKind, number>;
  skippedAlreadySent: number;
  skippedNotDue: number;
  skippedAutoPause: number;
  skippedSuspended: number;
  skippedStaleRow: number;
  skippedUnconfirmed: number;
  budgetExhausted: boolean;
  durationMs: number;
  timestamp: string;
}

const listingSelection = {
  id: true,
  title: true,
  version: true,
  availabilitySource: true,
  status: true,
  statusReason: true,
  needsMigrationReview: true,
  lastConfirmedAt: true,
  freshnessReminderSentAt: true,
  freshnessWarningSentAt: true,
  owner: {
    select: {
      id: true,
      email: true,
      name: true,
      isSuspended: true,
    },
  },
} as const;

function createKindCounters(): Record<FreshnessNotificationKind, number> {
  return {
    reminder: 0,
    warning: 0,
  };
}

function createErrorCounters(): Record<
  FreshnessNotificationKind,
  Record<FreshnessCronErrorStage, number>
> {
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

function createRunCounters(): RunCounters {
  return {
    eligible: createKindCounters(),
    emitted: createKindCounters(),
    errors: createErrorCounters(),
    skippedPreference: createKindCounters(),
    skippedAlreadySent: 0,
    skippedNotDue: 0,
    skippedAutoPause: 0,
    skippedSuspended: 0,
    skippedStaleRow: 0,
    skippedUnconfirmed: 0,
  };
}

function subtractDays(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_IN_MS);
}

function compareCandidates(left: QueryCandidate, right: QueryCandidate): number {
  const timeDiff = left.lastConfirmedAt.getTime() - right.lastConfirmedAt.getTime();
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return left.id.localeCompare(right.id);
}

function buildListingLogMeta(
  listing: Pick<
    FreshnessListingSnapshot,
    "id" | "availabilitySource" | "status" | "statusReason"
  >,
  kind: FreshnessNotificationKind
): Record<string, unknown> {
  return {
    event: "cfm.cron.freshness_reminder",
    kind,
    listingIdHash: hashIdForLog(listing.id),
    availabilitySource: listing.availabilitySource,
    listingStatus: listing.status,
    statusReason: listing.statusReason,
  };
}

function isCircuitOpenEmailError(error: string | undefined): boolean {
  return (
    typeof error === "string" &&
    /circuit breaker open|temporarily unavailable/i.test(error)
  );
}

function buildNotificationContent(
  listing: FreshnessListingSnapshot,
  kind: FreshnessNotificationKind
): {
  type: "LISTING_FRESHNESS_REMINDER" | "LISTING_STALE_WARNING";
  title: string;
  message: string;
  link: string;
} {
  const link = `/listings/${encodeURIComponent(listing.id)}`;

  if (kind === "reminder") {
    return {
      type: "LISTING_FRESHNESS_REMINDER",
      title: "Confirm your listing is still available",
      message: `Please confirm "${listing.title}" is still available.`,
      link,
    };
  }

  return {
    type: "LISTING_STALE_WARNING",
    title: "Your listing needs a freshness check",
    message: `"${listing.title}" is hidden from search until you confirm availability.`,
    link,
  };
}

function getHostName(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "there";
}

async function dispatchFreshnessEmail(
  listing: FreshnessListingSnapshot,
  kind: FreshnessNotificationKind
): Promise<EmailDispatchResult> {
  const emailData = {
    hostName: getHostName(listing.owner.name),
    listingTitle: listing.title,
    listingId: listing.id,
  };

  if (kind === "reminder") {
    if (!listing.owner.email) {
      return { success: true, skipped: true };
    }

    return sendNotificationEmailWithPreference(
      "listingFreshnessReminder",
      listing.owner.id,
      listing.owner.email,
      emailData
    );
  }

  if (!listing.owner.email) {
    return { success: true, skipped: true };
  }

  return sendNotificationEmail(
    "listingStaleWarning",
    listing.owner.email,
    emailData
  );
}

async function fetchDueCandidates(now: Date): Promise<QueryCandidate[]> {
  const reminderAtOrBefore = subtractDays(now, REMINDER_THRESHOLD_DAYS);
  const warningAtOrBefore = subtractDays(now, STALE_THRESHOLD_DAYS);
  const autoPauseAtOrBefore = subtractDays(now, AUTO_PAUSE_THRESHOLD_DAYS);

  const [warningRows, reminderRows] = await Promise.all([
    prisma.listing.findMany({
      where: {
        availabilitySource: "HOST_MANAGED",
        status: "ACTIVE",
        needsMigrationReview: false,
        lastConfirmedAt: {
          lte: warningAtOrBefore,
          gt: autoPauseAtOrBefore,
        },
        freshnessWarningSentAt: null,
      },
      select: {
        id: true,
        lastConfirmedAt: true,
      },
      orderBy: [{ lastConfirmedAt: "asc" }, { id: "asc" }],
      take: FRESHNESS_BATCH_SIZE,
    }),
    prisma.listing.findMany({
      where: {
        availabilitySource: "HOST_MANAGED",
        status: "ACTIVE",
        needsMigrationReview: false,
        lastConfirmedAt: {
          lte: reminderAtOrBefore,
          gt: warningAtOrBefore,
        },
        freshnessReminderSentAt: null,
      },
      select: {
        id: true,
        lastConfirmedAt: true,
      },
      orderBy: [{ lastConfirmedAt: "asc" }, { id: "asc" }],
      take: FRESHNESS_BATCH_SIZE,
    }),
  ]);

  return [
    ...warningRows.map((listing) => ({
      id: listing.id,
      lastConfirmedAt: listing.lastConfirmedAt!,
      kind: "warning" as const,
    })),
    ...reminderRows.map((listing) => ({
      id: listing.id,
      lastConfirmedAt: listing.lastConfirmedAt!,
      kind: "reminder" as const,
    })),
  ]
    .sort(compareCandidates)
    .slice(0, FRESHNESS_BATCH_SIZE);
}

async function fetchLatestListings(
  listingIds: string[]
): Promise<Map<string, FreshnessListingSnapshot>> {
  if (listingIds.length === 0) {
    return new Map();
  }

  const listings = await prisma.listing.findMany({
    where: {
      id: {
        in: listingIds,
      },
    },
    select: listingSelection,
  });

  return new Map(
    listings.map((listing) => [listing.id, listing as FreshnessListingSnapshot])
  );
}

async function markFreshnessNotificationSent(
  listing: FreshnessListingSnapshot,
  kind: FreshnessNotificationKind,
  sentAt: Date
): Promise<number> {
  if (kind === "reminder") {
    const result = await prisma.listing.updateMany({
      where: {
        id: listing.id,
        version: listing.version,
        freshnessReminderSentAt: null,
      },
      data: {
        freshnessReminderSentAt: sentAt,
        updatedAt: sentAt,
      },
    });

    return result.count;
  }

  const result = await prisma.listing.updateMany({
    where: {
      id: listing.id,
      version: listing.version,
      freshnessWarningSentAt: null,
    },
    data: {
      freshnessWarningSentAt: sentAt,
      updatedAt: sentAt,
    },
  });

  return result.count;
}

export function classifyFreshnessDispatch(
  listing: {
    availabilitySource: "LEGACY_BOOKING" | "HOST_MANAGED" | null | undefined;
    status: string | null | undefined;
    statusReason: string | null | undefined;
    needsMigrationReview?: boolean | null | undefined;
    lastConfirmedAt: Date | string | null | undefined;
    freshnessReminderSentAt?: Date | null | undefined;
    freshnessWarningSentAt?: Date | null | undefined;
    ownerIsSuspended?: boolean | null | undefined;
  },
  now: Date = new Date()
): FreshnessDispatchDecision {
  if (listing.availabilitySource !== "HOST_MANAGED") {
    return {
      action: "skip",
      reason: "not_host_managed",
      freshnessBucket: "NOT_APPLICABLE",
    };
  }

  if (listing.status !== "ACTIVE") {
    return {
      action: "skip",
      reason: "not_active",
      freshnessBucket: buildFreshnessReadModel(listing, { now }).freshnessBucket,
    };
  }

  if (listing.needsMigrationReview) {
    return {
      action: "skip",
      reason: "needs_migration_review",
      freshnessBucket: buildFreshnessReadModel(listing, { now }).freshnessBucket,
    };
  }

  if (listing.ownerIsSuspended) {
    return {
      action: "skip",
      reason: "suspended",
      freshnessBucket: buildFreshnessReadModel(listing, { now }).freshnessBucket,
    };
  }

  const freshness = buildFreshnessReadModel(listing, { now });

  if (freshness.freshnessBucket === "UNCONFIRMED") {
    return {
      action: "skip",
      reason: "unconfirmed",
      freshnessBucket: freshness.freshnessBucket,
    };
  }

  if (freshness.freshnessBucket === "AUTO_PAUSE_DUE") {
    return {
      action: "skip",
      reason: "auto_pause",
      freshnessBucket: freshness.freshnessBucket,
    };
  }

  if (freshness.freshnessBucket === "REMINDER") {
    if (listing.freshnessReminderSentAt) {
      return {
        action: "skip",
        reason: "already_sent",
        freshnessBucket: freshness.freshnessBucket,
      };
    }

    return {
      action: "emit",
      kind: "reminder",
      freshnessBucket: freshness.freshnessBucket,
    };
  }

  if (freshness.freshnessBucket === "STALE") {
    if (listing.freshnessWarningSentAt) {
      return {
        action: "skip",
        reason: "already_sent",
        freshnessBucket: freshness.freshnessBucket,
      };
    }

    return {
      action: "emit",
      kind: "warning",
      freshnessBucket: freshness.freshnessBucket,
    };
  }

  return {
    action: "skip",
    reason: "not_due",
    freshnessBucket: freshness.freshnessBucket,
  };
}

export function shouldEmitReminder(
  listing: Parameters<typeof classifyFreshnessDispatch>[0],
  now: Date = new Date()
): boolean {
  const decision = classifyFreshnessDispatch(listing, now);
  return decision.action === "emit" && decision.kind === "reminder";
}

export function shouldEmitStaleWarning(
  listing: Parameters<typeof classifyFreshnessDispatch>[0],
  now: Date = new Date()
): boolean {
  const decision = classifyFreshnessDispatch(listing, now);
  return decision.action === "emit" && decision.kind === "warning";
}

export async function runFreshnessDispatcher(
  now: Date = new Date()
): Promise<FreshnessDispatcherSummary> {
  const startTime = Date.now();
  const counters = createRunCounters();

  if (!features.freshnessNotifications) {
    return {
      success: true,
      skipped: true,
      reason: "feature_disabled",
      selected: 0,
      processed: 0,
      eligible: counters.eligible,
      emitted: counters.emitted,
      errors: counters.errors,
      skippedPreference: counters.skippedPreference,
      skippedAlreadySent: 0,
      skippedNotDue: 0,
      skippedAutoPause: 0,
      skippedSuspended: 0,
      skippedStaleRow: 0,
      skippedUnconfirmed: 0,
      budgetExhausted: false,
      durationMs: Date.now() - startTime,
      timestamp: now.toISOString(),
    };
  }

  const candidates = await fetchDueCandidates(now);
  for (const candidate of candidates) {
    counters.eligible[candidate.kind] += 1;
  }

  const latestListings = await fetchLatestListings(candidates.map((row) => row.id));
  let processed = 0;
  let budgetExhausted = false;

  for (const candidate of candidates) {
    if (Date.now() - startTime >= FRESHNESS_TIME_BUDGET_MS) {
      budgetExhausted = true;
      break;
    }

    const listing = latestListings.get(candidate.id);
    if (!listing) {
      counters.skippedStaleRow += 1;
      continue;
    }

    processed += 1;
    const decision = classifyFreshnessDispatch(
      {
        ...listing,
        ownerIsSuspended: listing.owner.isSuspended,
      },
      now
    );

    if (decision.action === "skip") {
      switch (decision.reason) {
        case "already_sent":
          counters.skippedAlreadySent += 1;
          break;
        case "not_due":
          counters.skippedNotDue += 1;
          break;
        case "auto_pause":
          counters.skippedAutoPause += 1;
          break;
        case "suspended":
          counters.skippedSuspended += 1;
          break;
        case "unconfirmed":
          counters.skippedUnconfirmed += 1;
          break;
        default:
          break;
      }
      continue;
    }

    const kind = decision.kind;
    const logMeta = buildListingLogMeta(listing, kind);
    const notification = buildNotificationContent(listing, kind);

    const notificationResult = await createInternalNotification({
      userId: listing.owner.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      link: notification.link,
    });

    if ("error" in notificationResult) {
      counters.errors[kind].notification += 1;
      logger.sync.error("[freshness-reminders] Notification failed", {
        ...logMeta,
        error: notificationResult.error,
      });
      continue;
    }

    const emailResult = await dispatchFreshnessEmail(listing, kind);

    if (!emailResult.success) {
      counters.errors[kind].email += 1;
      logger.sync.error("[freshness-reminders] Email failed", {
        ...logMeta,
        error: emailResult.error,
      });

      if (isCircuitOpenEmailError(emailResult.error)) {
        break;
      }

      continue;
    }

    if (kind === "reminder" && listing.owner.email && emailResult.skipped) {
      counters.skippedPreference.reminder += 1;
    }

    try {
      const updated = await markFreshnessNotificationSent(listing, kind, new Date());
      if (updated === 0) {
        counters.skippedStaleRow += 1;
        logger.sync.warn("[freshness-reminders] Token flip skipped", logMeta);
        continue;
      }
    } catch (error) {
      counters.errors[kind].db += 1;
      logger.sync.error("[freshness-reminders] Token flip failed", {
        ...logMeta,
        error: sanitizeErrorMessage(error),
      });
      continue;
    }

    counters.emitted[kind] += 1;
    logger.sync.info("[freshness-reminders] Notification emitted", {
      ...logMeta,
      canonicalMetric: FRESHNESS_NOTIFICATION_SENT_METRIC,
      operationalMetric: FRESHNESS_CRON_EMITTED_METRIC,
      emailSkipped: emailResult.skipped === true,
    });
  }

  recordFreshnessCronRun({
    eligibleCounts: counters.eligible,
    emittedCounts: counters.emitted,
    errorCounts: counters.errors,
    skippedPreferenceCounts: counters.skippedPreference,
    skippedAutoPauseCount: counters.skippedAutoPause,
    skippedUnconfirmedCount: counters.skippedUnconfirmed,
    skippedStaleRowCount: counters.skippedStaleRow,
    skippedSuspendedCount: counters.skippedSuspended,
    budgetExhausted,
  });

  return {
    success:
      counters.errors.reminder.notification +
        counters.errors.reminder.email +
        counters.errors.reminder.db +
        counters.errors.warning.notification +
        counters.errors.warning.email +
        counters.errors.warning.db ===
      0,
    skipped: false,
    selected: candidates.length,
    processed,
    eligible: counters.eligible,
    emitted: counters.emitted,
    errors: counters.errors,
    skippedPreference: counters.skippedPreference,
    skippedAlreadySent: counters.skippedAlreadySent,
    skippedNotDue: counters.skippedNotDue,
    skippedAutoPause: counters.skippedAutoPause,
    skippedSuspended: counters.skippedSuspended,
    skippedStaleRow: counters.skippedStaleRow,
    skippedUnconfirmed: counters.skippedUnconfirmed,
    budgetExhausted,
    durationMs: Date.now() - startTime,
    timestamp: now.toISOString(),
  };
}
