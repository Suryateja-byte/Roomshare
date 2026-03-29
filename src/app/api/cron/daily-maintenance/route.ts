/**
 * Daily Maintenance Cron Route
 *
 * Consolidates 6 cron tasks into a single route to fit within
 * Vercel Hobby plan's 2-cron limit. Each task runs independently
 * with its own try/catch — one failure does not block others.
 *
 * Schedule: 0 3 * * * (daily at 3:00 AM UTC)
 *
 * Tasks (in order):
 * 1. Cleanup expired rate limit entries
 * 2. Cleanup expired idempotency keys
 * 3. Cleanup stale typing status indicators
 * 4. Reconcile listing slot counts (safety net)
 * 5. Refresh dirty search documents
 * 6. Process search alerts (email notifications)
 *
 * Tasks 4-6 are delegated to their existing route handlers via
 * internal fetch to avoid duplicating complex logic (SQL, geospatial, etc.).
 * Tasks 1-3 are simple DB deletes inlined here for efficiency.
 *
 * Individual routes are preserved for manual/debug invocation.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as Sentry from "@sentry/nextjs";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { withRetry } from "@/lib/retry";
import { validateCronAuth } from "@/lib/cron-auth";
import { headers } from "next/headers";

interface TaskResult {
  task: string;
  success: boolean;
  detail?: Record<string, unknown>;
  error?: string;
  durationMs: number;
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
  const startTime = Date.now();
  const results: TaskResult[] = [];

  // --- Task 1: Cleanup expired rate limit entries ---
  {
    const t = Date.now();
    try {
      const result = await withRetry(
        () =>
          prisma.rateLimitEntry.deleteMany({
            where: { expiresAt: { lt: new Date() } },
          }),
        { context: "cleanup-rate-limits" }
      );
      results.push({
        task: "cleanup-rate-limits",
        success: true,
        detail: { deleted: result.count },
        durationMs: Date.now() - t,
      });
    } catch (error) {
      Sentry.captureException(error, {
        tags: { cron: "daily-maintenance", task: "cleanup-rate-limits" },
      });
      results.push({
        task: "cleanup-rate-limits",
        success: false,
        error: sanitizeErrorMessage(error),
        durationMs: Date.now() - t,
      });
    }
  }

  // --- Task 2: Cleanup expired idempotency keys ---
  {
    const t = Date.now();
    try {
      const result = await withRetry(
        () =>
          prisma.idempotencyKey.deleteMany({
            where: { expiresAt: { lt: new Date() } },
          }),
        { context: "cleanup-idempotency-keys" }
      );
      results.push({
        task: "cleanup-idempotency-keys",
        success: true,
        detail: { deleted: result.count },
        durationMs: Date.now() - t,
      });
    } catch (error) {
      Sentry.captureException(error, {
        tags: { cron: "daily-maintenance", task: "cleanup-idempotency-keys" },
      });
      results.push({
        task: "cleanup-idempotency-keys",
        success: false,
        error: sanitizeErrorMessage(error),
        durationMs: Date.now() - t,
      });
    }
  }

  // --- Task 3: Cleanup stale typing status entries ---
  {
    const t = Date.now();
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = await withRetry(
        () =>
          prisma.typingStatus.deleteMany({
            where: { updatedAt: { lt: fiveMinutesAgo } },
          }),
        { context: "cleanup-typing-status" }
      );
      results.push({
        task: "cleanup-typing-status",
        success: true,
        detail: { deleted: result.count },
        durationMs: Date.now() - t,
      });
    } catch (error) {
      Sentry.captureException(error, {
        tags: { cron: "daily-maintenance", task: "cleanup-typing-status" },
      });
      results.push({
        task: "cleanup-typing-status",
        success: false,
        error: sanitizeErrorMessage(error),
        durationMs: Date.now() - t,
      });
    }
  }

  // --- Task 4: Reconcile listing slot counts (complex — delegate) ---
  {
    const t = Date.now();
    try {
      const { ok, data } = await callInternalCron(
        "/api/cron/reconcile-slots",
        cronSecret
      );
      results.push({
        task: "reconcile-slots",
        success: ok,
        detail: data,
        durationMs: Date.now() - t,
      });
    } catch (error) {
      Sentry.captureException(error, {
        tags: { cron: "daily-maintenance", task: "reconcile-slots" },
      });
      results.push({
        task: "reconcile-slots",
        success: false,
        error: sanitizeErrorMessage(error),
        durationMs: Date.now() - t,
      });
    }
  }

  // --- Task 5: Refresh dirty search documents (complex — delegate) ---
  {
    const t = Date.now();
    try {
      const { ok, data } = await callInternalCron(
        "/api/cron/refresh-search-docs",
        cronSecret
      );
      results.push({
        task: "refresh-search-docs",
        success: ok,
        detail: data,
        durationMs: Date.now() - t,
      });
    } catch (error) {
      Sentry.captureException(error, {
        tags: { cron: "daily-maintenance", task: "refresh-search-docs" },
      });
      results.push({
        task: "refresh-search-docs",
        success: false,
        error: sanitizeErrorMessage(error),
        durationMs: Date.now() - t,
      });
    }
  }

  // --- Task 6: Process search alerts (complex — delegate) ---
  {
    const t = Date.now();
    try {
      const { ok, data } = await callInternalCron(
        "/api/cron/search-alerts",
        cronSecret
      );
      results.push({
        task: "search-alerts",
        success: ok,
        detail: data,
        durationMs: Date.now() - t,
      });
    } catch (error) {
      Sentry.captureException(error, {
        tags: { cron: "daily-maintenance", task: "search-alerts" },
      });
      results.push({
        task: "search-alerts",
        success: false,
        error: sanitizeErrorMessage(error),
        durationMs: Date.now() - t,
      });
    }
  }

  // --- Summary ---
  const totalDurationMs = Date.now() - startTime;
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  logger.sync.info(
    `[daily-maintenance] Completed: ${succeeded} ok, ${failed} failed, ${totalDurationMs}ms`,
    {
      results: results.map(({ task, success, durationMs }) => ({
        task,
        success,
        durationMs,
      })),
    }
  );

  return NextResponse.json({
    success: failed === 0,
    tasks: results,
    summary: { succeeded, failed, totalDurationMs },
  });
}
