-- Phase 02: Add backlog-age partial index to cache_invalidations
-- Phase 01 has cache_invalidations_pending_idx ON (consumed_at) WHERE consumed_at IS NULL,
-- which supports "any pending?" queries. This index supports "oldest pending?" queries for
-- alerting on backlog age (SLA §18.1).
-- Rollback: DROP INDEX IF EXISTS cache_invalidations_pending_enqueued_idx;

CREATE INDEX "cache_invalidations_pending_enqueued_idx"
  ON "cache_invalidations" ("enqueued_at")
  WHERE "consumed_at" IS NULL;
