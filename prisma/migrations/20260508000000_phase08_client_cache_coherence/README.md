# Migration: Phase 08 — Client Cache Coherence

Adds fanout state to `cache_invalidations` and stores encrypted Web Push
subscriptions for public cache bust delivery. The migration is expand-only and
safe to roll back after `FEATURE_PUBLIC_CACHE_COHERENCE=false`.

Rollback:

```sql
DROP TABLE IF EXISTS "public_cache_push_subscriptions";
DROP INDEX IF EXISTS "cache_invalidations_fanout_status_next_idx";
DROP INDEX IF EXISTS "cache_invalidations_fanout_attempt_idx";
ALTER TABLE "cache_invalidations"
  DROP COLUMN IF EXISTS "fanout_status",
  DROP COLUMN IF EXISTS "fanout_attempt_count",
  DROP COLUMN IF EXISTS "fanout_next_attempt_at",
  DROP COLUMN IF EXISTS "fanout_last_attempt_at",
  DROP COLUMN IF EXISTS "fanout_completed_at",
  DROP COLUMN IF EXISTS "fanout_last_error";
```
