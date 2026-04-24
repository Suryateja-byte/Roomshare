-- Phase 08: Client cache coherence fanout state and Web Push subscription storage.
--
-- Expand-only migration. Existing cache_invalidations rows remain valid through
-- defaults and can still be consumed by the Phase 02 outbox worker.
--
-- Rollback, after setting FEATURE_PUBLIC_CACHE_COHERENCE=false:
--   DROP TABLE IF EXISTS "public_cache_push_subscriptions";
--   DROP INDEX IF EXISTS "cache_invalidations_fanout_status_next_idx";
--   DROP INDEX IF EXISTS "cache_invalidations_fanout_attempt_idx";
--   ALTER TABLE "cache_invalidations"
--     DROP COLUMN IF EXISTS "fanout_status",
--     DROP COLUMN IF EXISTS "fanout_attempt_count",
--     DROP COLUMN IF EXISTS "fanout_next_attempt_at",
--     DROP COLUMN IF EXISTS "fanout_last_attempt_at",
--     DROP COLUMN IF EXISTS "fanout_completed_at",
--     DROP COLUMN IF EXISTS "fanout_last_error";

ALTER TABLE "cache_invalidations"
  ADD COLUMN IF NOT EXISTS "fanout_status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "fanout_attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "fanout_next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "fanout_last_attempt_at" TIMESTAMP(3) NULL,
  ADD COLUMN IF NOT EXISTS "fanout_completed_at" TIMESTAMP(3) NULL,
  ADD COLUMN IF NOT EXISTS "fanout_last_error" TEXT NULL;

ALTER TABLE "cache_invalidations"
  ADD CONSTRAINT "cache_invalidations_fanout_status_chk"
  CHECK ("fanout_status" IN ('PENDING', 'DELIVERED', 'FAILED', 'SKIPPED'))
  NOT VALID;

ALTER TABLE "cache_invalidations"
  VALIDATE CONSTRAINT "cache_invalidations_fanout_status_chk";

CREATE INDEX IF NOT EXISTS "cache_invalidations_fanout_status_next_idx"
  ON "cache_invalidations" ("fanout_status", "fanout_next_attempt_at", "enqueued_at");

CREATE INDEX IF NOT EXISTS "cache_invalidations_fanout_attempt_idx"
  ON "cache_invalidations" ("fanout_attempt_count", "fanout_next_attempt_at");

CREATE TABLE IF NOT EXISTS "public_cache_push_subscriptions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NULL,
  "endpoint_hash" TEXT NOT NULL,
  "subscription_ciphertext" TEXT NOT NULL,
  "subscription_ciphertext_version" TEXT NOT NULL DEFAULT 'v1',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "disabled_reason" TEXT NULL,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_delivered_at" TIMESTAMP(3) NULL,
  "last_failed_at" TIMESTAMP(3) NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "public_cache_push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "public_cache_push_subscriptions_endpoint_hash_key"
  ON "public_cache_push_subscriptions" ("endpoint_hash");

CREATE INDEX IF NOT EXISTS "public_cache_push_subscriptions_active_seen_idx"
  ON "public_cache_push_subscriptions" ("active", "last_seen_at");

CREATE INDEX IF NOT EXISTS "public_cache_push_subscriptions_user_active_idx"
  ON "public_cache_push_subscriptions" ("user_id", "active");
