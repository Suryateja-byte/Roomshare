/**
 * Projection-lag metrics emitters (Phase 02).
 *
 * No new metrics library — reuses the existing logger.sync + Sentry surface
 * documented in src/app/api/cron/daily-maintenance/route.ts:32-34.
 *
 * Threshold constants are read from alert-thresholds.ts. No pager is wired
 * in Phase 02; that is a Phase 10 deliverable.
 */

import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import {
  PROJECTION_LAG_P99_SECONDS,
  TOMBSTONE_HIDE_SLA_SECONDS,
  CACHE_INVALIDATE_BACKLOG_SLA_SECONDS,
} from "@/lib/projections/alert-thresholds";

/**
 * Emits a projection_lag metric for a successfully processed outbox event.
 *
 * @param kind      OutboxKind value (e.g. 'INVENTORY_UPSERTED')
 * @param lagMs     Elapsed ms from outbox event creation to drain completion
 */
export function recordProjectionLag(kind: string, lagMs: number): void {
  const lagSeconds = lagMs / 1000;
  const exceedsThreshold = lagSeconds > PROJECTION_LAG_P99_SECONDS;

  logger.sync.info("projection_lag", {
    metric: "projection_lag_seconds",
    kind,
    value: lagSeconds,
    exceedsThreshold,
    thresholdSeconds: PROJECTION_LAG_P99_SECONDS,
  });

  if (exceedsThreshold) {
    Sentry.addBreadcrumb({
      category: "projection.lag",
      message: `projection_lag_seconds exceeded threshold for kind=${kind}`,
      level: "warning",
      data: { kind, lagSeconds, thresholdSeconds: PROJECTION_LAG_P99_SECONDS },
    });
  }
}

/**
 * Emits a tombstone hide-latency metric.
 * SLO: from TOMBSTONE outbox event created_at to both projection rows deleted.
 *
 * @param unitId    Physical unit ID
 * @param lagMs     Elapsed ms from tombstone event creation to hide completion
 */
export function recordTombstoneHideLatency(unitId: string, lagMs: number): void {
  const lagSeconds = lagMs / 1000;
  const exceedsThreshold = lagSeconds > TOMBSTONE_HIDE_SLA_SECONDS;

  logger.sync.info("tombstone_hide_latency", {
    metric: "tombstone_hide_latency_seconds",
    unitId,
    value: lagSeconds,
    exceedsThreshold,
    thresholdSeconds: TOMBSTONE_HIDE_SLA_SECONDS,
  });

  if (exceedsThreshold) {
    Sentry.addBreadcrumb({
      category: "projection.tombstone",
      message: `tombstone_hide SLA exceeded for unit=${unitId}`,
      level: "warning",
      data: { unitId, lagSeconds, thresholdSeconds: TOMBSTONE_HIDE_SLA_SECONDS },
    });
  }
}

/**
 * Emits a DLQ-routing metric for a failed outbox event.
 *
 * @param kind    OutboxKind value
 * @param reason  DLQ reason string (e.g. 'GEOCODE_EXHAUSTED')
 */
export function recordDlqRouting(kind: string, reason: string): void {
  logger.sync.warn("outbox_dlq_routing", {
    metric: "outbox_dlq_total",
    kind,
    reason,
    value: 1,
  });

  Sentry.addBreadcrumb({
    category: "projection.dlq",
    message: `Outbox event routed to DLQ: kind=${kind} reason=${reason}`,
    level: "error",
    data: { kind, reason },
  });
}

/**
 * Emits a stale-event-skip metric (event's source_version behind current projection row).
 *
 * @param kind  OutboxKind value
 */
export function recordStaleEventSkip(kind: string): void {
  logger.sync.info("projection_stale_event_skip", {
    metric: "projection_stale_event_total",
    kind,
    value: 1,
  });
}

/**
 * Emits a backlog-depth metric for a given priority lane.
 *
 * @param priority  Priority value (0 = publish_high, 10 = cache_invalidate, 100 = publish_normal)
 * @param depth     Number of PENDING rows at this priority level
 */
export function recordBacklogDepth(priority: number, depth: number): void {
  const exceedsThreshold =
    priority === 10 &&
    depth > 0 &&
    CACHE_INVALIDATE_BACKLOG_SLA_SECONDS > 0; // annotate for alerting

  logger.sync.info("projection_backlog_depth", {
    metric: "projection_backlog_depth",
    priority,
    value: depth,
    exceedsThreshold,
  });
}
