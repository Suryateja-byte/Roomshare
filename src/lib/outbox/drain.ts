/**
 * Outbox drain worker.
 *
 * Claims pending outbox events with FOR UPDATE SKIP LOCKED and processes them
 * through the HANDLERS routing table. Returns a DrainResult for the caller
 * (cron route or test) to inspect.
 *
 * Per-tick semantics:
 *   - Claim up to maxBatch rows in a single claim tx, then process outside it.
 *   - Route by event.kind through HANDLERS.
 *   - On completed: UPDATE status='COMPLETED'.
 *   - On stale_skipped: UPDATE status='COMPLETED'; increment staleSkipped metric.
 *   - On transient_error + attempts < MAX_ATTEMPTS: reschedule with backoff.
 *   - On transient_error + attempts >= MAX_ATTEMPTS: routeToDlq.
 *   - On fatal_error: routeToDlq immediately.
 *   - Time-box: if elapsedMs >= maxTickMs, break early and return.
 */

import { prisma } from "@/lib/prisma";
import { withActor } from "@/lib/db/with-actor";
import type { OutboxKind } from "@/lib/outbox/append";
import { HANDLERS, type OutboxRow } from "@/lib/outbox/handlers";
import { routeToDlq } from "@/lib/outbox/dlq";
import {
  recordStaleEventSkip,
  recordDlqRouting,
  recordBacklogDepth,
} from "@/lib/metrics/projection-lag";
import { MAX_ATTEMPTS } from "@/lib/projections/alert-thresholds";

export interface DrainOptions {
  /** Max rows to claim per tick (default: 50) */
  maxBatch?: number;
  /** Max wall-clock ms per tick before breaking early (default: 9000) */
  maxTickMs?: number;
  /** Only claim rows with priority <= this value (default: 100 = all) */
  priorityMax?: number;
  /** Clock override for testing */
  now?: () => Date;
}

export interface DrainResult {
  processed: number;
  completed: number;
  dlq: number;
  staleSkipped: number;
  retryScheduled: number;
  remainingByPriority: Record<number, number>;
  elapsedMs: number;
}

/**
 * Compute retry backoff.
 * 2^attempt * 30s, capped at 1 hour, +/- 20% jitter.
 */
function retryDelayMs(attemptCount: number): number {
  const baseMs = 30_000;
  const maxMs = 60 * 60 * 1000;
  const exponential = Math.min(baseMs * Math.pow(2, attemptCount), maxMs);
  const jitter = exponential * 0.2 * (Math.random() * 2 - 1);
  return Math.max(1000, Math.round(exponential + jitter));
}

/**
 * Drain up to maxBatch pending outbox events in a single tick.
 *
 * Safe to call from multiple contexts (cron route, tests); the FOR UPDATE SKIP
 * LOCKED claim ensures only one worker processes each row at a time.
 */
export async function drainOutboxOnce(opts: DrainOptions = {}): Promise<DrainResult> {
  const {
    maxBatch = 50,
    maxTickMs = 9000,
    priorityMax = 100,
    now = () => new Date(),
  } = opts;

  const tickStart = Date.now();
  let processed = 0;
  let completed = 0;
  let dlq = 0;
  let staleSkipped = 0;
  let retryScheduled = 0;

  // ── Step 1: Claim batch in a single transaction ──────────────────────────
  const claimedRows = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<OutboxRow[]>`
      SELECT
        id, aggregate_type AS "aggregateType", aggregate_id AS "aggregateId",
        kind, payload, source_version AS "sourceVersion",
        unit_identity_epoch AS "unitIdentityEpoch", priority,
        attempt_count AS "attemptCount", created_at AS "createdAt"
      FROM outbox_events
      WHERE status = 'PENDING'
        AND priority <= ${priorityMax}
        AND next_attempt_at <= ${now()}
      ORDER BY priority ASC, next_attempt_at ASC
      LIMIT ${maxBatch}
      FOR UPDATE SKIP LOCKED
    `;

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);

    await tx.$executeRaw`
      UPDATE outbox_events
      SET status        = 'IN_FLIGHT',
          attempt_count = attempt_count + 1,
          updated_at    = NOW()
      WHERE id = ANY(${ids}::TEXT[])
    `;

    return rows;
  });

  // ── Step 2: Process each claimed row outside the claim tx ─────────────────
  for (const event of claimedRows) {
    if (Date.now() - tickStart >= maxTickMs) break;

    processed += 1;

    const handler = HANDLERS[event.kind as OutboxKind];
    if (!handler) {
      // Unknown kind — DLQ immediately
      await prisma.$transaction(async (tx) => {
        await routeToDlq(tx, event.id, "UNKNOWN_KIND", `Unknown kind: ${event.kind}`);
      });
      recordDlqRouting(event.kind, "UNKNOWN_KIND");
      dlq += 1;
      continue;
    }

    let result;
    try {
      result = await withActor(
        { role: "system", id: null },
        (tx) => handler(tx, event),
        { client: prisma }
      );
    } catch (err) {
      result = {
        outcome: "transient_error" as const,
        retryAfterMs: retryDelayMs(event.attemptCount),
        lastError: err instanceof Error ? err.message : String(err),
      };
    }

    // ── Step 3: Record outcome ───────────────────────────────────────────────
    switch (result.outcome) {
      case "completed": {
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: "COMPLETED" },
        });
        completed += 1;
        break;
      }
      case "stale_skipped": {
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: "COMPLETED" },
        });
        recordStaleEventSkip(event.kind);
        staleSkipped += 1;
        break;
      }
      case "transient_error": {
        const nextAttempt = new Date(Date.now() + result.retryAfterMs);
        if (event.attemptCount >= MAX_ATTEMPTS) {
          await prisma.$transaction(async (tx) => {
            await routeToDlq(tx, event.id, "MAX_ATTEMPTS_EXHAUSTED", result.lastError);
          });
          recordDlqRouting(event.kind, "MAX_ATTEMPTS_EXHAUSTED");
          dlq += 1;
        } else {
          await prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: "PENDING",
              nextAttemptAt: nextAttempt,
              lastError: result.lastError,
            },
          });
          retryScheduled += 1;
        }
        break;
      }
      case "fatal_error": {
        await prisma.$transaction(async (tx) => {
          await routeToDlq(tx, event.id, result.dlqReason, result.lastError);
        });
        recordDlqRouting(event.kind, result.dlqReason);
        dlq += 1;
        break;
      }
    }
  }

  // ── Step 4: Count remaining backlog per priority lane ─────────────────────
  const backlogRows = await prisma.$queryRaw<{ priority: number; depth: bigint }[]>`
    SELECT priority, COUNT(*) AS depth
    FROM outbox_events
    WHERE status = 'PENDING'
      AND next_attempt_at <= ${now()}
    GROUP BY priority
    ORDER BY priority ASC
  `;

  const remainingByPriority: Record<number, number> = {};
  for (const row of backlogRows) {
    const p = Number(row.priority);
    const d = Number(row.depth);
    remainingByPriority[p] = d;
    recordBacklogDepth(p, d);
  }

  return {
    processed,
    completed,
    dlq,
    staleSkipped,
    retryScheduled,
    remainingByPriority,
    elapsedMs: Date.now() - tickStart,
  };
}
