/**
 * Daily Maintenance Cron Route
 *
 * Consolidates background maintenance work into a single dispatcher route
 * to stay within the app's Vercel cron-entry budget. Each task runs independently
 * with its own try/catch, so one failure does not block others.
 *
 * Schedule: 2,17,32,47 * * * * (every 15 minutes)
 *
 * Every invocation:
 * 1. Refresh dirty search documents
 *
 * Daily window only (09:02-09:04 UTC):
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
 * The daily-only gate is time-based rather than persisted. That keeps the
 * dispatcher within the cron-entry budget while preserving a once-daily cadence
 * for low-priority maintenance tasks.
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
import { cleanupExpiredVerificationDocumentsOnce } from "@/lib/verification/retention";

interface TaskResult {
  task: string;
  success: boolean;
  skipped?: boolean;
  detail?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

type TaskRunner = () => Promise<Record<string, unknown>>;

function isDailyWindow(nowUtc: Date): boolean {
  return (
    nowUtc.getUTCHours() === 9 &&
    nowUtc.getUTCMinutes() >= 2 &&
    nowUtc.getUTCMinutes() <= 4
  );
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
  const shouldRunDailyTasks = isDailyWindow(nowUtc);
  const startTime = Date.now();
  const results: TaskResult[] = [];

  // --- Fast cadence tasks ---
  await runDelegatedTask(
    results,
    "refresh-search-docs",
    "/api/cron/refresh-search-docs",
    cronSecret
  );

  // Phase 02: outbox drain — all priority lanes every 15 min
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
    markSkippedTask(results, "cleanup-rate-limits", "outside_daily_window");
    markSkippedTask(
      results,
      "cleanup-idempotency-keys",
      "outside_daily_window"
    );
    markSkippedTask(results, "cleanup-typing-status", "outside_daily_window");
    markSkippedTask(
      results,
      "cleanup-verification-documents",
      "outside_daily_window"
    );
    markSkippedTask(results, "search-alerts", "outside_daily_window");
    markSkippedTask(results, "freshness-reminders", "outside_daily_window");
    markSkippedTask(results, "stale-auto-pause", "outside_daily_window");
  }

  // --- Summary ---
  const totalDurationMs = Date.now() - startTime;
  const succeeded = results.filter((r) => r.success && !r.skipped).length;
  const failed = results.filter((r) => !r.success).length;
  const skipped = results.filter((r) => r.skipped).length;

  logger.sync.info(
    `[daily-maintenance] Completed: ${succeeded} ok, ${failed} failed, ${skipped} skipped, ${totalDurationMs}ms`,
    {
      dailyWindow: shouldRunDailyTasks,
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
      dailyWindow: shouldRunDailyTasks,
      timestampUtc: nowUtc.toISOString(),
      totalDurationMs,
    },
  });
}
