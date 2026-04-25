-- Phase 07: Saved searches + alert delivery revalidation.
--
-- Expand-only migration. Existing SavedSearch rows and legacy alert fields
-- remain valid and continue to support rollback.
--
-- Rollback, after setting KILL_SWITCH_DISABLE_ALERTS=true:
--   DROP TABLE IF EXISTS "alert_deliveries";
--   DROP TABLE IF EXISTS "alert_subscriptions";
--   DROP INDEX IF EXISTS "SavedSearch_search_spec_hash_idx";
--   DROP INDEX IF EXISTS "SavedSearch_active_userId_idx";
--   ALTER TABLE "SavedSearch"
--     DROP COLUMN IF EXISTS "search_spec_json",
--     DROP COLUMN IF EXISTS "search_spec_hash",
--     DROP COLUMN IF EXISTS "embedding_version_at_save",
--     DROP COLUMN IF EXISTS "ranker_profile_version_at_save",
--     DROP COLUMN IF EXISTS "unit_identity_epoch_floor",
--     DROP COLUMN IF EXISTS "active";

ALTER TABLE "SavedSearch"
  ADD COLUMN IF NOT EXISTS "search_spec_json" JSONB NULL,
  ADD COLUMN IF NOT EXISTS "search_spec_hash" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "embedding_version_at_save" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "ranker_profile_version_at_save" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "unit_identity_epoch_floor" INTEGER NULL,
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "SavedSearch_active_userId_idx"
  ON "SavedSearch" ("active", "userId");

CREATE INDEX IF NOT EXISTS "SavedSearch_search_spec_hash_idx"
  ON "SavedSearch" ("search_spec_hash");

CREATE TABLE IF NOT EXISTS "alert_subscriptions" (
  "id" TEXT NOT NULL,
  "saved_search_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'EMAIL',
  "frequency" "AlertFrequency" NOT NULL DEFAULT 'DAILY',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "last_delivered_at" TIMESTAMP(3) NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "alert_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "alert_subscriptions_saved_search_id_fkey"
    FOREIGN KEY ("saved_search_id") REFERENCES "SavedSearch"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "alert_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "alert_subscriptions_channel_check"
    CHECK ("channel" IN ('EMAIL'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "alert_subscriptions_saved_search_channel_key"
  ON "alert_subscriptions" ("saved_search_id", "channel");

CREATE INDEX IF NOT EXISTS "alert_subscriptions_active_channel_frequency_last_idx"
  ON "alert_subscriptions" ("active", "channel", "frequency", "last_delivered_at");

CREATE INDEX IF NOT EXISTS "alert_subscriptions_user_active_idx"
  ON "alert_subscriptions" ("user_id", "active");

CREATE TABLE IF NOT EXISTS "alert_deliveries" (
  "id" TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "saved_search_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'EMAIL',
  "delivery_kind" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "drop_reason" TEXT NULL,
  "idempotency_key" TEXT NOT NULL,
  "target_listing_id" TEXT NULL,
  "target_unit_id" TEXT NULL,
  "target_inventory_id" TEXT NULL,
  "target_unit_identity_epoch" INTEGER NULL,
  "query_hash" TEXT NULL,
  "embedding_version" TEXT NULL,
  "ranker_profile_version" TEXT NULL,
  "projection_epoch" BIGINT NULL,
  "new_listings_count" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "scheduled_for" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
  "claimed_at" TIMESTAMP(3) NULL,
  "delivered_at" TIMESTAMP(3) NULL,
  "dropped_at" TIMESTAMP(3) NULL,
  "last_error" TEXT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "alert_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "alert_deliveries_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "alert_subscriptions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "alert_deliveries_saved_search_id_fkey"
    FOREIGN KEY ("saved_search_id") REFERENCES "SavedSearch"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "alert_deliveries_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "alert_deliveries_channel_check"
    CHECK ("channel" IN ('EMAIL')),
  CONSTRAINT "alert_deliveries_delivery_kind_check"
    CHECK ("delivery_kind" IN ('INSTANT', 'SCHEDULED')),
  CONSTRAINT "alert_deliveries_status_check"
    CHECK ("status" IN ('PENDING', 'IN_FLIGHT', 'DELIVERED', 'DROPPED', 'FAILED')),
  CONSTRAINT "alert_deliveries_drop_reason_check"
    CHECK (
      "drop_reason" IS NULL OR "drop_reason" IN (
        'ALERTS_DISABLED',
        'EMAIL_FAILED',
        'EXPIRED',
        'PAYWALL_LOCKED',
        'PREFERENCE_DISABLED',
        'STALE_EPOCH',
        'SUBSCRIPTION_INACTIVE',
        'TARGET_MISSING',
        'TARGET_NOT_PUBLIC'
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "alert_deliveries_idempotency_key_key"
  ON "alert_deliveries" ("idempotency_key");

CREATE INDEX IF NOT EXISTS "alert_deliveries_status_scheduled_idx"
  ON "alert_deliveries" ("status", "scheduled_for");

CREATE INDEX IF NOT EXISTS "alert_deliveries_subscription_status_scheduled_idx"
  ON "alert_deliveries" ("subscription_id", "status", "scheduled_for");

CREATE INDEX IF NOT EXISTS "alert_deliveries_saved_search_created_idx"
  ON "alert_deliveries" ("saved_search_id", "created_at");

CREATE INDEX IF NOT EXISTS "alert_deliveries_target_status_idx"
  ON "alert_deliveries" ("target_unit_id", "target_inventory_id", "status");

CREATE INDEX IF NOT EXISTS "alert_deliveries_user_status_idx"
  ON "alert_deliveries" ("user_id", "status");
