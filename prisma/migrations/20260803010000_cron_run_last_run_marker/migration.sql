-- =============================================================================
-- Persisted last-run marker for daily cron lanes (review P1-6)
--
-- SCHEMA DIFF:
--   CREATE TABLE cron_runs (task TEXT PRIMARY KEY, last_run_at TIMESTAMPTZ(3) NOT NULL)
--
-- PURPOSE:
--   /api/cron/daily-maintenance gated all nine daily tasks on a 3-minute UTC
--   wall-clock window (09:02-09:04) while vercel.json schedules it at "2 9 * * *".
--   Vercel's Hobby plan explicitly "may invoke these cron jobs at any point within
--   the specified hour", so the window was hit roughly 3 minutes in 60 and the route
--   still returned success: true — search-alerts, outbox-retention and all five
--   cleanup tasks were silently skipped on most days, with no catch-up.
--
--   This table replaces the wall-clock gate with "has this lane run in the last N
--   hours", claimed atomically:
--
--     INSERT INTO cron_runs (task, last_run_at) VALUES ($1, $2 /* now */)
--     ON CONFLICT (task) DO UPDATE SET last_run_at = $3 /* now */
--     WHERE cron_runs.last_run_at < $4 /* now - 20h */
--
--   A single statement, so it is race-safe against overlapping invocations; the
--   affected-row count is the lease. That satisfies both halves of Vercel's own
--   guidance for cron ("resilient to both missed runs and duplicate runs"): a
--   missed day is picked up by the next invocation, and a duplicate delivery
--   claims nothing.
--
--   `now` is bound by the caller rather than taken from the database clock, so
--   the gate is deterministic under fake timers in tests. Atomicity is
--   unaffected: the comparison still happens inside the statement, against the
--   committed row.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS "cron_runs";
--   Fully reversible. The route falls back to skipping daily work, which is the
--   pre-existing behaviour; no other table references this one.
--
-- DATA SAFETY:
--   New empty table. No backfill, no locks on existing tables, no downtime risk.
--   The first invocation after deploy finds no row, inserts one, and runs the
--   daily lane immediately. No foreign keys, so ordering against other migrations
--   does not matter. Plain in-transaction DDL (no CONCURRENTLY) keeps this file
--   executable inside the PGlite fixtures, matching
--   20260803000000_contact_consumption_idempotency_scope.
-- =============================================================================

-- TIMESTAMPTZ rather than the schema-default TIMESTAMP(3): the marker is an
-- absolute instant compared against a JS-computed threshold in raw SQL, so it
-- must not be reinterpreted in the session time zone. Matches the Phase 01
-- infra tables (20260501000000), which are also TIMESTAMPTZ.
CREATE TABLE IF NOT EXISTS "cron_runs" (
    "task" TEXT NOT NULL,
    "last_run_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cron_runs_pkey" PRIMARY KEY ("task")
);
