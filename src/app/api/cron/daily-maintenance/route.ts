/**
 * Daily Maintenance Cron Route
 *
 * Consolidates background maintenance work into a single dispatcher route
 * to stay within the app's Vercel cron-entry budget and Hobby-plan daily
 * cadence limit. Each task runs independently with its own try/catch, so one
 * failure does not block others.
 *
 * Vercel schedule: 2 9 * * * (daily at 09:02 UTC)
 *
 * Every invocation:
 * 1. Refresh dirty search documents
 *
 * Daily lane (at most once per ~20h, see claimDailyLane):
 * 3. Cleanup expired rate limit entries
 * 4. Cleanup expired idempotency keys
 * 5. Cleanup stale typing status indicators
 * 6. Process search alerts (email notifications)
 * 7. Process listing freshness reminders and stale warnings
 * 8. Auto-pause day-30 stale listings after warnings have been emitted
 * 9. Delete expired private verification documents
 *
 * Delegated tasks are called via internal fetch to avoid duplicating complex
 * logic (SQL, geospatial, etc.). Simple DB cleanup tasks stay inlined here.
 *
 * The daily lane is gated on a PERSISTED last-run marker (cron_runs), not on
 * the wall clock. Vercel Hobby dispatches anywhere inside the scheduled hour,
 * so the previous 09:02-09:04 UTC window was missed on most days and the miss
 * was never made up — while the route still returned success: true.
 *
 * The marker is claimed BEFORE the daily tasks run, which trades "a crashed
 * run loses that day" for "a duplicate delivery cannot double-run". That is
 * the right way round here: Vercel documents duplicate cron delivery, the
 * daily tasks are idempotent cleanups that self-heal on the next day, and
 * search-alerts additionally carries its own enqueueAlertDelivery idempotency
 * key.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as Sentry from "@sentry/nextjs";
import { features } from "@/lib/env";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { withRetry } from "@/lib/retry";
import { validateCronAuth } from "@/lib/cron-auth";
import { headers } from "next/headers";
import { isPhase02ProjectionWritesEnabled } from "@/lib/flags/phase02";
import { drainOutboxOnce } from "@/lib/outbox/drain";
import {
  cleanupConsumedCacheInvalidationsOnce,
  cleanupTerminalOutboxEventsOnce,
  compactSupersededOutboxEventsOnce,
} from "@/lib/outbox/retention";
import { cleanupExpiredVerificationDocumentsOnce } from "@/lib/verification/retention";
import { deleteExpiredQuerySnapshots } from "@/lib/search/query-snapshots";

interface TaskResult {
  task: string;
  success: boolean;
  skipped?: boolean;
  detail?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

type TaskRunner = () => Promise<Record<string, unknown>>;

const DAILY_LANE_TASK = "daily-maintenance";

/**
 * How recently the daily lane must have run for this invocation to skip it.
 *
 * Consecutive real invocations are at least ~23h apart (worst case 09:59 one
 * day to 09:00 the next), so 20h always admits the next day's run while still
 * rejecting a duplicate delivery minutes later.
 */
const DAILY_LANE_MIN_INTERVAL_HOURS = 20;

type DailyLaneClaim = {
  ran: boolean;
  reason: string;
  lastRunAt: string | null;
};

/**
 * Atomically claim the daily lane for this invocation.
 *
 * Replaces the old wall-clock gate (09:02-09:04 UTC). Vercel's Hobby plan "may
 * invoke these cron jobs at any point within the specified hour", so a
 * 3-minute window was missed on most days and the miss was never made up —
 * while the route still reported success. Asking "has this lane run recently"
 * instead is immune to dispatch jitter.
 *
 * One statement, so overlapping invocations serialise on the row: the second
 * one's UPDATE sees the first's committed timestamp and matches no rows. That
 * covers both failure modes Vercel documents for cron delivery — a missed run
 * is picked up by the next invocation, and a duplicate run claims nothing.
 *
 * Timestamps are computed here rather than with the database clock so the gate
 * is deterministic under fake timers in tests; atomicity is unaffected because
 * the comparison still happens inside the statement.
 */
async function claimDailyLane(now: Date): Promise<DailyLaneClaim> {
  const threshold = new Date(
    now.getTime() - DAILY_LANE_MIN_INTERVAL_HOURS * 60 * 60 * 1000
  );

  try {
    const claimed = await prisma.$executeRaw`
      INSERT INTO cron_runs (task, last_run_at)
      VALUES (${DAILY_LANE_TASK}, ${now})
      ON CONFLICT (task) DO UPDATE SET last_run_at = ${now}
      WHERE cron_runs.last_run_at < ${threshold}
    `;

    return claimed === 1
      ? { ran: true, reason: "claimed", lastRunAt: now.toISOString() }
      : { ran: false, reason: "already_ran_recently", lastRunAt: null };
  } catch (error) {
    // A failed claim must not take the per-tick tasks down with it.
    Sentry.captureException(error, {
      tags: { cron: "daily-maintenance", task: "claim-daily-lane" },
    });
    return { ran: false, reason: "claim_failed", lastRunAt: null };
  }
}

async function runTask(
  results: TaskResult[],
  task: string,
  runner: TaskRunner
): Promise<void> {
  const startedAt = Date.now();

  try {
    const detail = await runner();
    results.push({
      task,
      success: true,
      detail,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { cron: "daily-maintenance", task },
    });
    results.push({
      task,
      success: false,
      error: sanitizeErrorMessage(error),
      durationMs: Date.now() - startedAt,
    });
  }
}

async function runDelegatedTask(
  results: TaskResult[],
  task: string,
  path: string,
  cronSecret: string
): Promise<void> {
  const startedAt = Date.now();

  try {
    const { ok, data } = await callInternalCron(path, cronSecret);
    // Promote detail.skipped === true to the top-level `skipped` field so
    // summary counters correctly tag flag-gated early-returns as skipped.
    const skipped = data?.skipped === true;
    results.push({
      task,
      success: ok,
      skipped: skipped || undefined,
      detail: data,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { cron: "daily-maintenance", task },
    });
    results.push({
      task,
      success: false,
      error: sanitizeErrorMessage(error),
      durationMs: Date.now() - startedAt,
    });
  }
}

function markSkippedTask(
  results: TaskResult[],
  task: string,
  reason: string
): void {
  results.push({
    task,
    success: true,
    skipped: true,
    detail: { skipped: true, reason },
    durationMs: 0,
  });
}

/**
 * Call an internal cron route via fetch, forwarding the CRON_SECRET.
 */
async function callInternalCron(
  path: string,
  cronSecret: string
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  // Build the base URL from headers (works on Vercel and local dev)
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const url = `${protocol}://${host}${path}`;

  const res = await fetch(url, {
    headers: { authorization: `Bearer ${cronSecret}` },
    cache: "no-store",
  });

  const data = await res.json();
  return { ok: res.ok, data };
}

export async function GET(request: NextRequest) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  const cronSecret = process.env.CRON_SECRET ?? "";
  const nowUtc = new Date();
  const dailyLane = await claimDailyLane(nowUtc);
  const shouldRunDailyTasks = dailyLane.ran;
  const startTime = Date.now();
  const results: TaskResult[] = [];

  // --- Dispatcher tasks ---
  await runDelegatedTask(
    results,
    "refresh-search-docs",
    "/api/cron/refresh-search-docs",
    cronSecret
  );

  // Phase 02: outbox drain — all priority lanes on each dispatcher tick
  if (isPhase02ProjectionWritesEnabled()) {
    await runTask(results, "outbox-drain", async () => {
      const result = await drainOutboxOnce({
        maxBatch: 50,
        maxTickMs: 9000,
        priorityMax: 100,
      });
      return result as unknown as Record<string, unknown>;
    });
  } else {
    markSkippedTask(results, "outbox-drain", "phase02_disabled");
  }

  await runDelegatedTask(
    results,
    "payments-refund-queue",
    "/api/cron/payments-refund-queue",
    cronSecret
  );

  if (features.contactRestorationAutomation) {
    await runDelegatedTask(
      results,
      "contact-restoration-ghost-sla",
      "/api/cron/contact-restoration/ghost-sla",
      cronSecret
    );
    await runDelegatedTask(
      results,
      "contact-restoration-mass-deactivation",
      "/api/cron/contact-restoration/mass-deactivation",
      cronSecret
    );
  } else {
    markSkippedTask(
      results,
      "contact-restoration-ghost-sla",
      "feature_disabled"
    );
    markSkippedTask(
      results,
      "contact-restoration-mass-deactivation",
      "feature_disabled"
    );
  }

  // --- Daily-only tasks ---
  if (shouldRunDailyTasks) {
    await runTask(results, "cleanup-rate-limits", async () => {
      const result = await withRetry(
        () =>
          prisma.rateLimitEntry.deleteMany({
            where: { expiresAt: { lt: new Date() } },
          }),
        { context: "cleanup-rate-limits" }
      );

      return { deleted: result.count };
    });

    await runTask(results, "cleanup-idempotency-keys", async () => {
      const result = await withRetry(
        () =>
          prisma.idempotencyKey.deleteMany({
            where: { expiresAt: { lt: new Date() } },
          }),
        { context: "cleanup-idempotency-keys" }
      );

      return { deleted: result.count };
    });

    await runTask(results, "cleanup-query-snapshots", async () => {
      const deleted = await withRetry(() => deleteExpiredQuerySnapshots(), {
        context: "cleanup-query-snapshots",
      });

      return { deleted };
    });

    await runTask(results, "cleanup-typing-status", async () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = await withRetry(
        () =>
          prisma.typingStatus.deleteMany({
            where: { updatedAt: { lt: fiveMinutesAgo } },
          }),
        { context: "cleanup-typing-status" }
      );

      return { deleted: result.count };
    });

    await runTask(results, "cleanup-verification-documents", async () => {
      const result = await cleanupExpiredVerificationDocumentsOnce();
      return result;
    });

    // H2: bound outbox growth. Deliberately NOT gated on phase02 — producers
    // append in prod where the drain is skipped, so retention and compaction
    // must run regardless.
    await runTask(results, "outbox-retention", async () => {
      const terminal = await cleanupTerminalOutboxEventsOnce();
      const compaction = await compactSupersededOutboxEventsOnce();
      const cacheInvalidations = await cleanupConsumedCacheInvalidationsOnce();
      return { terminal, compaction, cacheInvalidations } as unknown as Record<
        string,
        unknown
      >;
    });

    await runDelegatedTask(
      results,
      "search-alerts",
      "/api/cron/search-alerts",
      cronSecret
    );

    if (features.freshnessNotifications) {
      await runDelegatedTask(
        results,
        "freshness-reminders",
        "/api/cron/freshness-reminders",
        cronSecret
      );
    } else {
      markSkippedTask(results, "freshness-reminders", "feature_disabled");
    }

    if (features.staleAutoPause) {
      await runDelegatedTask(
        results,
        "stale-auto-pause",
        "/api/cron/stale-auto-pause",
        cronSecret
      );
    } else {
      markSkippedTask(results, "stale-auto-pause", "feature_disabled");
    }
  } else {
    markSkippedTask(results, "cleanup-rate-limits", dailyLane.reason);
    markSkippedTask(
      results,
      "cleanup-idempotency-keys",
      dailyLane.reason
    );
    markSkippedTask(
      results,
      "cleanup-query-snapshots",
      dailyLane.reason
    );
    markSkippedTask(results, "cleanup-typing-status", dailyLane.reason);
    markSkippedTask(
      results,
      "cleanup-verification-documents",
      dailyLane.reason
    );
    markSkippedTask(results, "outbox-retention", dailyLane.reason);
    markSkippedTask(results, "search-alerts", dailyLane.reason);
    markSkippedTask(results, "freshness-reminders", dailyLane.reason);
    markSkippedTask(results, "stale-auto-pause", dailyLane.reason);
  }

  // --- Summary ---
  const totalDurationMs = Date.now() - startTime;
  const succeeded = results.filter((r) => r.success && !r.skipped).length;
  const failed = results.filter((r) => !r.success).length;
  const skipped = results.filter((r) => r.skipped).length;

  logger.sync.info(
    `[daily-maintenance] Completed: ${succeeded} ok, ${failed} failed, ${skipped} skipped, ${totalDurationMs}ms`,
    {
      dailyLaneRan: dailyLane.ran,
      dailyLaneReason: dailyLane.reason,
      timestampUtc: nowUtc.toISOString(),
      results: results.map(({ task, success, skipped, durationMs }) => ({
        task,
        success,
        skipped: skipped ?? false,
        durationMs,
      })),
    }
  );

  return NextResponse.json({
    success: failed === 0,
    tasks: results,
    summary: {
      succeeded,
      failed,
      skipped,
      // Distinguishes "the daily lane ran" from "it was skipped, and why", so a
      // dispatcher that is permanently skipping is visible rather than looking
      // identical to a healthy run. `claim_failed` in particular is a fault.
      dailyLane,
      timestampUtc: nowUtc.toISOString(),
      totalDurationMs,
    },
  });
}
