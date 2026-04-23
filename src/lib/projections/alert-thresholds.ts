/**
 * Alert threshold constants for the Phase 02 outbox pipeline.
 *
 * No pager is wired in Phase 02. These constants are consumed by
 * src/lib/metrics/projection-lag.ts to annotate log entries so operators
 * know when a value exceeds the SLO boundary. Pager wiring is Phase 10.
 *
 * SLO source: master-plan §18.1
 */

/** p99 projection lag must be below this value (seconds). §18.1 */
export const PROJECTION_LAG_P99_SECONDS = 60;

/** Time from TOMBSTONE event creation to inventory row deleted (seconds). §18.1 */
export const TOMBSTONE_HIDE_SLA_SECONDS = 60;

/** Oldest unprocessed cache invalidation before alerting (seconds). §18.1 */
export const CACHE_INVALIDATE_BACKLOG_SLA_SECONDS = 120;

/** DLQ depth that should trigger manual investigation. */
export const DLQ_ALERT_DEPTH = 10;

/** Consecutive transient failures before escalating to DLQ. Matches geocode MAX_ATTEMPTS. */
export const MAX_ATTEMPTS = 8;
