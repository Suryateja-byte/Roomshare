/**
 * Outbox retention + compaction (H2 fix: bound outbox_events growth).
 *
 * Three once-per-invocation jobs, run from the daily-maintenance cron:
 *   - cleanupTerminalOutboxEventsOnce: delete terminal rows past their TTL
 *     (COMPLETED > 7d, DLQ > 30d). Never touches PENDING/IN_FLIGHT.
 *   - compactSupersededOutboxEventsOnce: for allowlisted state-rebuild kinds,
 *     delete superseded PENDING rows, keeping only the newest per
 *     (aggregate_type, aggregate_id, kind). This is what bounds growth in
 *     production, where the drain is phase02-gated off while producers run.
 *   - cleanupConsumedCacheInvalidationsOnce: delete cache_invalidations rows
 *     that are consumed AND fanout-terminal past their TTL.
 *
 * All jobs are batched and time-boxed so a large backlog cannot blow the
 * cron's function budget; `truncated: true` signals candidates remain.
 */

import { prisma } from "@/lib/prisma";

/**
 * Minimal raw-SQL surface — satisfied by PrismaClient, TransactionClient,
 * and the PGlite test fixture client (injectable for integration tests).
 */
type RawSqlClient = {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
};

export const COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const DLQ_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const CACHE_INVALIDATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Kinds safe to compact: pure state-rebuild triggers whose handlers re-read
 * current DB state and stale-skip on source_version, so dropping a superseded
 * trigger is equivalent to the drain's `stale_skipped` outcome.
 *
 * NEVER add: PAYMENT_WEBHOOK / ALERT_MATCH / ALERT_DELIVER (one event = one
 * unit of work), IDENTITY_MUTATION (each mutation is distinct),
 * CACHE_INVALIDATE (payload carries a unique cacheInvalidationId — dropping
 * an event would strand its cache_invalidations row unconsumed),
 * GEOCODE_NEEDED / EMBED_NEEDED (already dedupe at append time).
 */
export const COMPACTABLE_OUTBOX_KINDS = [
  "INVENTORY_UPSERTED",
  "UNIT_UPSERTED",
] as const;

const DEFAULT_RETENTION_BATCH_SIZE = 500;
const DEFAULT_COMPACTION_BATCH_SIZE = 5000;
const DEFAULT_MAX_RUN_MS = 3000;

export interface OutboxRetentionOptions {
  client?: RawSqlClient;
  now?: () => Date;
  batchSize?: number;
  maxRunMs?: number;
  completedRetentionMs?: number;
  dlqRetentionMs?: number;
}

export interface OutboxRetentionResult {
  deletedCompleted: number;
  deletedDlq: number;
  batches: number;
  truncated: boolean;
  elapsedMs: number;
}

export async function cleanupTerminalOutboxEventsOnce(
  opts: OutboxRetentionOptions = {}
): Promise<OutboxRetentionResult> {
  const {
    client = prisma,
    now = () => new Date(),
    batchSize = DEFAULT_RETENTION_BATCH_SIZE,
    maxRunMs = DEFAULT_MAX_RUN_MS,
    completedRetentionMs = COMPLETED_RETENTION_MS,
    dlqRetentionMs = DLQ_RETENTION_MS,
  } = opts;

  const startedAt = Date.now();
  const completedCutoff = new Date(now().getTime() - completedRetentionMs);
  const dlqCutoff = new Date(now().getTime() - dlqRetentionMs);

  let deletedCompleted = 0;
  let deletedDlq = 0;
  let batches = 0;
  let truncated = false;

  for (;;) {
    if (Date.now() - startedAt >= maxRunMs) {
      truncated = true;
      break;
    }

    // Single-statement select+delete: the status re-guard in the DELETE
    // spares rows a human re-queued (DLQ -> PENDING) between CTE evaluation
    // and delete under concurrent access.
    const deletedRows = await client.$queryRaw<{ status: string }[]>`
      WITH candidates AS (
        SELECT id
        FROM outbox_events
        WHERE (status = 'COMPLETED' AND updated_at < ${completedCutoff})
           OR (status = 'DLQ' AND updated_at < ${dlqCutoff})
        ORDER BY updated_at ASC
        LIMIT ${batchSize}
      )
      DELETE FROM outbox_events oe
      USING candidates c
      WHERE oe.id = c.id
        AND oe.status IN ('COMPLETED', 'DLQ')
      RETURNING oe.status
    `;

    if (deletedRows.length === 0) {
      break;
    }

    batches += 1;
    for (const row of deletedRows) {
      if (row.status === "DLQ") {
        deletedDlq += 1;
      } else {
        deletedCompleted += 1;
      }
    }

    if (deletedRows.length < batchSize) {
      break;
    }
  }

  return {
    deletedCompleted,
    deletedDlq,
    batches,
    truncated,
    elapsedMs: Date.now() - startedAt,
  };
}

export interface OutboxCompactionOptions {
  client?: RawSqlClient;
  batchSize?: number;
  maxRunMs?: number;
  kinds?: readonly string[];
}

export interface OutboxCompactionResult {
  deletedSuperseded: number;
  byKind: Record<string, number>;
  batches: number;
  truncated: boolean;
  elapsedMs: number;
}

export async function compactSupersededOutboxEventsOnce(
  opts: OutboxCompactionOptions = {}
): Promise<OutboxCompactionResult> {
  const {
    client = prisma,
    batchSize = DEFAULT_COMPACTION_BATCH_SIZE,
    maxRunMs = DEFAULT_MAX_RUN_MS,
    kinds = COMPACTABLE_OUTBOX_KINDS,
  } = opts;

  const startedAt = Date.now();
  const kindList = Array.from(kinds);

  let deletedSuperseded = 0;
  const byKind: Record<string, number> = {};
  let batches = 0;
  let truncated = false;

  if (kindList.length === 0) {
    return { deletedSuperseded, byKind, batches, truncated, elapsedMs: 0 };
  }

  for (;;) {
    if (Date.now() - startedAt >= maxRunMs) {
      truncated = true;
      break;
    }

    // Keep only the newest PENDING row per (aggregate_type, aggregate_id,
    // kind). Handlers re-read current state and stale-skip, so superseded
    // triggers are safe to drop. The `oe.status = 'PENDING'` re-check (under
    // EvalPlanQual after any lock wait) skips rows the drain just claimed.
    const deletedRows = await client.$queryRaw<{ kind: string }[]>`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY aggregate_type, aggregate_id, kind
                 ORDER BY source_version DESC, created_at DESC, id DESC
               ) AS rn
        FROM outbox_events
        WHERE status = 'PENDING'
          AND kind = ANY(${kindList}::TEXT[])
      ),
      victims AS (
        SELECT id FROM ranked WHERE rn > 1 LIMIT ${batchSize}
      )
      DELETE FROM outbox_events oe
      USING victims v
      WHERE oe.id = v.id
        AND oe.status = 'PENDING'
      RETURNING oe.kind
    `;

    if (deletedRows.length === 0) {
      break;
    }

    batches += 1;
    deletedSuperseded += deletedRows.length;
    for (const row of deletedRows) {
      byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;
    }

    if (deletedRows.length < batchSize) {
      break;
    }
  }

  return {
    deletedSuperseded,
    byKind,
    batches,
    truncated,
    elapsedMs: Date.now() - startedAt,
  };
}

export interface CacheInvalidationRetentionOptions {
  client?: RawSqlClient;
  now?: () => Date;
  batchSize?: number;
  maxRunMs?: number;
  retentionMs?: number;
}

export interface CacheInvalidationRetentionResult {
  deleted: number;
  batches: number;
  truncated: boolean;
  elapsedMs: number;
}

export async function cleanupConsumedCacheInvalidationsOnce(
  opts: CacheInvalidationRetentionOptions = {}
): Promise<CacheInvalidationRetentionResult> {
  const {
    client = prisma,
    now = () => new Date(),
    batchSize = DEFAULT_RETENTION_BATCH_SIZE,
    maxRunMs = DEFAULT_MAX_RUN_MS,
    retentionMs = CACHE_INVALIDATION_RETENTION_MS,
  } = opts;

  const startedAt = Date.now();
  const cutoff = new Date(now().getTime() - retentionMs);

  let deleted = 0;
  let batches = 0;
  let truncated = false;

  for (;;) {
    if (Date.now() - startedAt >= maxRunMs) {
      truncated = true;
      break;
    }

    // Only consumed AND fanout-terminal rows are deletable; unconsumed rows
    // and fanout_status='PENDING' rows are still awaiting work.
    const deletedRows = await client.$queryRaw<{ id: string }[]>`
      WITH candidates AS (
        SELECT id
        FROM cache_invalidations
        WHERE consumed_at IS NOT NULL
          AND fanout_status IN ('DELIVERED', 'SKIPPED', 'FAILED')
          AND enqueued_at < ${cutoff}
        ORDER BY enqueued_at ASC
        LIMIT ${batchSize}
      )
      DELETE FROM cache_invalidations ci
      USING candidates c
      WHERE ci.id = c.id
        AND ci.consumed_at IS NOT NULL
        AND ci.fanout_status IN ('DELIVERED', 'SKIPPED', 'FAILED')
      RETURNING ci.id
    `;

    if (deletedRows.length === 0) {
      break;
    }

    batches += 1;
    deleted += deletedRows.length;

    if (deletedRows.length < batchSize) {
      break;
    }
  }

  return { deleted, batches, truncated, elapsedMs: Date.now() - startedAt };
}
