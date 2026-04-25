# Migration: Phase 02 — cache_invalidations backlog-age index

## Purpose

Adds a partial index on `cache_invalidations (enqueued_at) WHERE consumed_at IS NULL` to
support alerting queries that check "how old is the oldest unprocessed cache invalidation?"

## Why a Second Index?

Phase 01 has `cache_invalidations_pending_idx ON (consumed_at) WHERE consumed_at IS NULL`.
That index efficiently answers "are there any unprocessed rows?" but does not efficiently
sort by `enqueued_at` for backlog-age alerting (it would require a full scan of the partial
index with a sort). The new index pre-sorts by `enqueued_at` within the WHERE condition.

## Lock footprint

`CREATE INDEX` on the (empty pre-launch) table is instant. In production with rows, Postgres
14+ `CREATE INDEX` runs concurrently and does not block reads/writes.

## Rollback

```sql
DROP INDEX IF EXISTS "cache_invalidations_pending_enqueued_idx";
```
