-- =============================================================================
-- Migration: outbox terminal-row cleanup index (H2 retention)
-- PURPOSE:
--   Support time-cutoff deletion of terminal outbox rows (COMPLETED > 7d,
--   DLQ > 30d) run by src/lib/outbox/retention.ts via the daily-maintenance
--   cron. COMPLETED rows currently have no index path for an updated_at scan;
--   the existing outbox_events_dlq_idx covers (status, created_at) only.
-- ROLLBACK:
--   DROP INDEX IF EXISTS "outbox_events_terminal_cleanup_idx";
-- DATA-SAFETY:
--   Additive partial index only; no data changes. Table is small pre-launch,
--   so a plain in-transaction CREATE INDEX is acceptable (no CONCURRENTLY,
--   which also keeps the file executable inside the PGlite test fixtures).
-- =============================================================================

CREATE INDEX IF NOT EXISTS "outbox_events_terminal_cleanup_idx"
  ON "outbox_events" (status, updated_at)
  WHERE status IN ('COMPLETED', 'DLQ');
