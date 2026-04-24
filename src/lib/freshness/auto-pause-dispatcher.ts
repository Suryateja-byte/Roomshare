import "server-only";

import { features } from "@/lib/env";
import { sendNotificationEmail } from "@/lib/email";
import {
  AUTO_PAUSE_COUNT_METRIC,
  AUTO_PAUSE_CRON_EMITTED_METRIC,
  recordAutoPauseCronRun,
  type AutoPauseCronErrorStage,
  type AutoPauseCronSkipReason,
} from "@/lib/freshness/freshness-cron-telemetry";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { hashIdForLog } from "@/lib/messaging/cfm-messaging-telemetry";
import { createInternalNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { markListingDirtyInTx } from "@/lib/search/search-doc-dirty";
import { AUTO_PAUSE_THRESHOLD_DAYS } from "@/lib/search/public-availability";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
export const AUTO_PAUSE_BATCH_SIZE = 500;
export const AUTO_PAUSE_TIME_BUDGET_MS = 50_000;

type QueryCandidate = {
  id: string;
  lastConfirmedAt: Date;
};

type AutoPauseListingSnapshot = {
  id: string;
  title: string;
  version: number;
  status: "ACTIVE" | "PAUSED" | "RENTED";
  statusReason: string | null;
  lastConfirmedAt: Date | null;
  freshnessWarningSentAt: Date | null;
  autoPausedAt: Date | null;
  owner: {
    id: string;
    email: string | null;
    name: string | null;
    isSuspended: boolean;
  };
};

type LockedListingRow = {
  id: string;
  title: string;
  version: number;
  status: "ACTIVE" | "PAUSED" | "RENTED";
  statusReason: string | null;
  lastConfirmedAt: Date | null;
  freshnessWarningSentAt: Date | null;
  autoPausedAt: Date | null;
  ownerId: string;
  ownerEmail: string | null;
  ownerName: string | null;
  ownerIsSuspended: boolean;
};

type AutoPauseErrorCounters = Record<AutoPauseCronErrorStage, number>;
type AutoPauseSkipCounters = Record<AutoPauseCronSkipReason, number>;

type EmailDispatchResult = {
  success: boolean;
  skipped?: boolean;
  error?: string;
};

type AutoPauseTxResult =
  | {
      outcome: "updated";
      listing: AutoPauseListingSnapshot;
      pausedAt: Date;
    }
  | {
      outcome: "stale_row";
    }
  | {
      outcome: "version_conflict";
    };

export type AutoPauseDispatchSkipReason =
  | AutoPauseCronSkipReason
  | "not_due"
  | "status_reason";

export type AutoPauseDispatchDecision =
  | {
      action: "pause";
    }
  | {
      action: "skip";
      reason: AutoPauseDispatchSkipReason;
    };

export interface AutoPauseDispatcherSummary {
  success: boolean;
  skipped: boolean;
  reason?: "feature_disabled";
  selected: number;
  processed: number;
  eligible: number;
  autoPaused: number;
  emitted: number;
  errors: AutoPauseErrorCounters;
  skippedCounts: AutoPauseSkipCounters;
  budgetExhausted: boolean;
  durationMs: number;
  timestamp: string;
}

type RunCounters = {
  eligible: number;
  autoPaused: number;
  emitted: number;
  errors: AutoPauseErrorCounters;
  skipped: AutoPauseSkipCounters;
};

const listingSelection = {
  id: true,
  title: true,
  version: true,
  status: true,
  statusReason: true,
  lastConfirmedAt: true,
  freshnessWarningSentAt: true,
  autoPausedAt: true,
  owner: {
    select: {
      id: true,
      email: true,
      name: true,
      isSuspended: true,
    },
  },
} as const;

function createErrorCounters(): AutoPauseErrorCounters {
  return {
    notification: 0,
    email: 0,
    db: 0,
  };
}

function createSkipCounters(): AutoPauseSkipCounters {
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

function createRunCounters(): RunCounters {
  return {
    eligible: 0,
    autoPaused: 0,
    emitted: 0,
    errors: createErrorCounters(),
    skipped: createSkipCounters(),
  };
}

function subtractDays(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_IN_MS);
}

export function isAutoPauseDue(
  lastConfirmedAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastConfirmedAt) {
    return false;
  }

  const normalized =
    typeof lastConfirmedAt === "string" ? new Date(lastConfirmedAt) : lastConfirmedAt;
  if (Number.isNaN(normalized.getTime())) {
    return false;
  }

  return normalized.getTime() <= subtractDays(now, AUTO_PAUSE_THRESHOLD_DAYS).getTime();
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
    AutoPauseListingSnapshot,
    "id" | "status" | "statusReason"
  >
): Record<string, unknown> {
  return {
    event: "cfm.cron.stale_auto_pause",
    listingIdHash: hashIdForLog(listing.id),
    listingStatus: listing.status,
    statusReason: listing.statusReason,
  };
}

function getHostName(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "there";
}

function buildNotificationContent(listing: AutoPauseListingSnapshot): {
  type: "LISTING_AUTO_PAUSED";
  title: string;
  message: string;
  link: string;
} {
  const link = `/listings/${encodeURIComponent(listing.id)}`;

  return {
    type: "LISTING_AUTO_PAUSED",
    title: "Your listing has been paused for reconfirmation",
    message: `Reconfirm "${listing.title}" to restore it to search.`,
    link,
  };
}

async function dispatchAutoPauseEmail(
  listing: AutoPauseListingSnapshot
): Promise<EmailDispatchResult> {
  if (!listing.owner.email) {
    return { success: true, skipped: true };
  }

  return sendNotificationEmail("listingAutoPaused", listing.owner.email, {
    hostName: getHostName(listing.owner.name),
    listingTitle: listing.title,
    listingId: listing.id,
  });
}

async function fetchDueCandidates(now: Date): Promise<QueryCandidate[]> {
  const autoPauseAtOrBefore = subtractDays(now, AUTO_PAUSE_THRESHOLD_DAYS);
  const rows = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      statusReason: null,
      lastConfirmedAt: {
        lte: autoPauseAtOrBefore,
      },
      freshnessWarningSentAt: {
        not: null,
      },
      autoPausedAt: null,
      owner: {
        isSuspended: false,
      },
    },
    select: {
      id: true,
      lastConfirmedAt: true,
    },
    orderBy: [{ lastConfirmedAt: "asc" }, { id: "asc" }],
    take: AUTO_PAUSE_BATCH_SIZE,
  });

  return rows
    .map((listing) => ({
      id: listing.id,
      lastConfirmedAt: listing.lastConfirmedAt!,
    }))
    .sort(compareCandidates)
    .slice(0, AUTO_PAUSE_BATCH_SIZE);
}

async function fetchLatestListings(
  listingIds: string[]
): Promise<Map<string, AutoPauseListingSnapshot>> {
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
    listings.map((listing) => [listing.id, listing as AutoPauseListingSnapshot])
  );
}

export function classifyAutoPauseCandidate(
  listing: {
    status: string | null | undefined;
    statusReason: string | null | undefined;
    lastConfirmedAt: Date | string | null | undefined;
    freshnessWarningSentAt?: Date | null | undefined;
    autoPausedAt?: Date | null | undefined;
    ownerIsSuspended?: boolean | null | undefined;
  },
  now: Date = new Date()
): AutoPauseDispatchDecision {
  if (listing.ownerIsSuspended) {
    return { action: "skip", reason: "suspended" };
  }

  if (listing.autoPausedAt || listing.status !== "ACTIVE") {
    return { action: "skip", reason: "already_paused" };
  }

  if (listing.statusReason) {
    return { action: "skip", reason: "status_reason" };
  }

  if (!listing.freshnessWarningSentAt) {
    return { action: "skip", reason: "no_warning" };
  }

  if (!isAutoPauseDue(listing.lastConfirmedAt, now)) {
    return { action: "skip", reason: "not_due" };
  }

  return { action: "pause" };
}

function toLockedSnapshot(row: LockedListingRow): AutoPauseListingSnapshot {
  return {
    id: row.id,
    title: row.title,
    version: row.version,
    status: row.status,
    statusReason: row.statusReason,
    lastConfirmedAt: row.lastConfirmedAt,
    freshnessWarningSentAt: row.freshnessWarningSentAt,
    autoPausedAt: row.autoPausedAt,
    owner: {
      id: row.ownerId,
      email: row.ownerEmail,
      name: row.ownerName,
      isSuspended: row.ownerIsSuspended,
    },
  };
}

async function pauseListingInTransaction(
  listingId: string,
  now: Date
): Promise<AutoPauseTxResult> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<LockedListingRow[]>`
        SELECT
          l.id,
          l.title,
          l.version,
          l.status,
          l."statusReason",
          l."lastConfirmedAt",
          l."freshnessWarningSentAt",
          l."autoPausedAt",
          u.id as "ownerId",
          u.email as "ownerEmail",
          u.name as "ownerName",
          u."isSuspended" as "ownerIsSuspended"
        FROM "Listing" l
        JOIN "User" u
          ON u.id = l."ownerId"
        WHERE l.id = ${listingId}
        FOR UPDATE OF l
      `;

      if (rows.length === 0) {
        return {
          outcome: "stale_row",
        } as const;
      }

      const lockedListing = toLockedSnapshot(rows[0]);
      const decision = classifyAutoPauseCandidate(
        {
          ...lockedListing,
          ownerIsSuspended: lockedListing.owner.isSuspended,
        },
        now
      );

      if (decision.action === "skip") {
        return {
          outcome: "stale_row",
        } as const;
      }

      const pausedAt = new Date();
      const updated = await tx.listing.updateMany({
        where: {
          id: lockedListing.id,
          version: lockedListing.version,
          status: "ACTIVE",
          statusReason: null,
          freshnessWarningSentAt: {
            not: null,
          },
          autoPausedAt: null,
        },
        data: {
          status: "PAUSED",
          statusReason: "STALE_AUTO_PAUSE",
          autoPausedAt: pausedAt,
          version: lockedListing.version + 1,
          updatedAt: pausedAt,
        },
      });

      if (updated.count === 0) {
        return {
          outcome: "version_conflict",
        } as const;
      }

      await markListingDirtyInTx(tx, lockedListing.id, "status_changed");

      return {
        outcome: "updated",
        listing: {
          ...lockedListing,
          version: lockedListing.version + 1,
          status: "PAUSED",
          statusReason: "STALE_AUTO_PAUSE",
          autoPausedAt: pausedAt,
        },
        pausedAt,
      } as const;
    },
    { timeout: 10000 }
  );
}

export async function runAutoPauseDispatcher(
  now: Date = new Date()
): Promise<AutoPauseDispatcherSummary> {
  const startTime = Date.now();
  const counters = createRunCounters();

  if (!features.staleAutoPause) {
    counters.skipped.feature_disabled += 1;
    recordAutoPauseCronRun({
      skippedCounts: counters.skipped,
    });
    return {
      success: true,
      skipped: true,
      reason: "feature_disabled",
      selected: 0,
      processed: 0,
      eligible: 0,
      autoPaused: 0,
      emitted: 0,
      errors: counters.errors,
      skippedCounts: counters.skipped,
      budgetExhausted: false,
      durationMs: Date.now() - startTime,
      timestamp: now.toISOString(),
    };
  }

  const candidates = await fetchDueCandidates(now);
  counters.eligible = candidates.length;

  const latestListings = await fetchLatestListings(candidates.map((row) => row.id));
  let processed = 0;
  let budgetExhausted = false;

  for (const candidate of candidates) {
    if (Date.now() - startTime >= AUTO_PAUSE_TIME_BUDGET_MS) {
      budgetExhausted = true;
      break;
    }

    const listing = latestListings.get(candidate.id);
    if (!listing) {
      counters.skipped.stale_row += 1;
      continue;
    }

    processed += 1;

    const decision = classifyAutoPauseCandidate(
      {
        ...listing,
        ownerIsSuspended: listing.owner.isSuspended,
      },
      now
    );

    if (decision.action === "skip") {
      switch (decision.reason) {
        case "already_paused":
        case "suspended":
        case "no_warning":
        case "not_host_managed":
        case "migration_review":
          counters.skipped[decision.reason] += 1;
          break;
        default:
          counters.skipped.stale_row += 1;
          break;
      }
      continue;
    }

    const logMeta = buildListingLogMeta(listing);

    let txResult: AutoPauseTxResult;
    try {
      txResult = await pauseListingInTransaction(candidate.id, now);
    } catch (error) {
      counters.errors.db += 1;
      logger.sync.error("[stale-auto-pause] Pause transaction failed", {
        ...logMeta,
        error: sanitizeErrorMessage(error),
      });
      continue;
    }

    if (txResult.outcome === "version_conflict") {
      counters.skipped.version_conflict += 1;
      logger.sync.warn("[stale-auto-pause] Version conflict", logMeta);
      continue;
    }

    if (txResult.outcome === "stale_row") {
      counters.skipped.stale_row += 1;
      logger.sync.warn("[stale-auto-pause] Stale row skipped", logMeta);
      continue;
    }

    counters.autoPaused += 1;
    const notification = buildNotificationContent(txResult.listing);
    const notificationResult = await createInternalNotification({
      userId: txResult.listing.owner.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      link: notification.link,
    });

    if ("error" in notificationResult) {
      counters.errors.notification += 1;
      logger.sync.error("[stale-auto-pause] Notification failed", {
        ...buildListingLogMeta(txResult.listing),
        error: notificationResult.error,
      });
      continue;
    }

    const emailResult = await dispatchAutoPauseEmail(txResult.listing);
    if (!emailResult.success) {
      counters.errors.email += 1;
      logger.sync.error("[stale-auto-pause] Email failed", {
        ...buildListingLogMeta(txResult.listing),
        error: emailResult.error,
      });
      continue;
    }

    counters.emitted += 1;
    logger.sync.info("[stale-auto-pause] Listing auto-paused", {
      ...buildListingLogMeta(txResult.listing),
      canonicalMetric: AUTO_PAUSE_COUNT_METRIC,
      operationalMetric: AUTO_PAUSE_CRON_EMITTED_METRIC,
      emailSkipped: emailResult.skipped === true,
    });
  }

  recordAutoPauseCronRun({
    eligibleCount: counters.eligible,
    autoPausedCount: counters.autoPaused,
    emittedCount: counters.emitted,
    errorCounts: counters.errors,
    skippedCounts: counters.skipped,
    budgetExhausted,
  });

  return {
    success:
      counters.errors.notification +
        counters.errors.email +
        counters.errors.db ===
      0,
    skipped: false,
    selected: candidates.length,
    processed,
    eligible: counters.eligible,
    autoPaused: counters.autoPaused,
    emitted: counters.emitted,
    errors: counters.errors,
    skippedCounts: counters.skipped,
    budgetExhausted,
    durationMs: Date.now() - startTime,
    timestamp: now.toISOString(),
  };
}
