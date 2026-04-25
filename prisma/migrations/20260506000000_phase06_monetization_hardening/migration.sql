-- Phase 06: Monetization, Stripe, entitlement hardening.
--
-- Expand-only migration. Existing payment foundation rows remain valid.
--
-- Rollback:
--   DROP TABLE IF EXISTS "fraud_audit_jobs";
--   DROP TABLE IF EXISTS "refund_queue_items";
--   DROP TABLE IF EXISTS "payment_abuse_signals";
--   DROP INDEX IF EXISTS "contact_consumption_inventory_kind_idx";
--   DROP INDEX IF EXISTS "entitlement_grants_user_idempotency_idx";
--   DROP INDEX IF EXISTS "entitlement_grants_source_refund_idx";
--   DROP INDEX IF EXISTS "entitlement_grants_user_kind_window_idx";
--   DROP INDEX IF EXISTS "payments_livemode_status_idx";
--   DROP INDEX IF EXISTS "stripe_events_processing_idx";
--   DROP INDEX IF EXISTS "stripe_events_livemode_type_idx";
--   ALTER TABLE "contact_consumption"
--     DROP COLUMN IF EXISTS "inventory_id",
--     DROP COLUMN IF EXISTS "consumed_credit_from";
--   ALTER TABLE "payment_disputes" DROP COLUMN IF EXISTS "origin_stripe_event_id";
--   ALTER TABLE "entitlement_grants"
--     DROP COLUMN IF EXISTS "original_credit_count",
--     DROP COLUMN IF EXISTS "window_start_delta",
--     DROP COLUMN IF EXISTS "window_end_delta",
--     DROP COLUMN IF EXISTS "source_refund_id",
--     DROP COLUMN IF EXISTS "idempotency_key";
--   ALTER TABLE "refunds"
--     DROP COLUMN IF EXISTS "origin_stripe_event_id",
--     DROP COLUMN IF EXISTS "source",
--     DROP COLUMN IF EXISTS "manual_review_required";
--   ALTER TABLE "payments"
--     DROP COLUMN IF EXISTS "stripe_customer_id",
--     DROP COLUMN IF EXISTS "livemode",
--     DROP COLUMN IF EXISTS "fraud_flag",
--     DROP COLUMN IF EXISTS "auto_refund_status",
--     DROP COLUMN IF EXISTS "origin_stripe_event_id";
--   ALTER TABLE "stripe_events"
--     DROP COLUMN IF EXISTS "livemode",
--     DROP COLUMN IF EXISTS "signature_verified",
--     DROP COLUMN IF EXISTS "processing_status",
--     DROP COLUMN IF EXISTS "attempt_count",
--     DROP COLUMN IF EXISTS "next_attempt_at",
--     DROP COLUMN IF EXISTS "last_error",
--     DROP COLUMN IF EXISTS "processed_by";
-- Enum value removal is intentionally not included in rollback; rebuild enums
-- from backup in a maintenance window if required.

ALTER TYPE "ContactKind" ADD VALUE 'REVEAL_PHONE';
ALTER TYPE "ContactRestorationState" ADD VALUE 'RESTORED_HOST_BOUNCE';
ALTER TYPE "ContactRestorationReason" ADD VALUE 'HOST_BOUNCE';

ALTER TABLE "stripe_events"
  ADD COLUMN IF NOT EXISTS "livemode" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "signature_verified" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "processing_status" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "last_error" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "processed_by" TEXT NULL;

CREATE INDEX IF NOT EXISTS "stripe_events_processing_idx"
  ON "stripe_events" ("processing_status", "next_attempt_at", "received_at");

CREATE INDEX IF NOT EXISTS "stripe_events_livemode_type_idx"
  ON "stripe_events" ("livemode", "event_type", "received_at");

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "stripe_customer_id" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "livemode" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fraud_flag" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "auto_refund_status" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "origin_stripe_event_id" TEXT NULL;

CREATE INDEX IF NOT EXISTS "payments_livemode_status_idx"
  ON "payments" ("livemode", "status", "created_at");

ALTER TABLE "refunds"
  ADD COLUMN IF NOT EXISTS "origin_stripe_event_id" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "source" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "manual_review_required" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "entitlement_grants"
  ADD COLUMN IF NOT EXISTS "original_credit_count" INTEGER NULL,
  ADD COLUMN IF NOT EXISTS "window_start_delta" TIMESTAMP(3) NULL,
  ADD COLUMN IF NOT EXISTS "window_end_delta" TIMESTAMP(3) NULL,
  ADD COLUMN IF NOT EXISTS "source_refund_id" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT NULL;

CREATE INDEX IF NOT EXISTS "entitlement_grants_user_kind_window_idx"
  ON "entitlement_grants" ("user_id", "contact_kind", "status", "active_until");

CREATE INDEX IF NOT EXISTS "entitlement_grants_source_refund_idx"
  ON "entitlement_grants" ("source_refund_id");

CREATE UNIQUE INDEX IF NOT EXISTS "entitlement_grants_user_idempotency_idx"
  ON "entitlement_grants" ("user_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

ALTER TABLE "payment_disputes"
  ADD COLUMN IF NOT EXISTS "origin_stripe_event_id" TEXT NULL;

ALTER TABLE "contact_consumption"
  ADD COLUMN IF NOT EXISTS "inventory_id" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "consumed_credit_from" TEXT NULL;

CREATE INDEX IF NOT EXISTS "contact_consumption_inventory_kind_idx"
  ON "contact_consumption" ("inventory_id", "contact_kind");

CREATE TABLE IF NOT EXISTS "payment_abuse_signals" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NULL,
  "signal_kind" TEXT NOT NULL,
  "signal_hash" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "metadata" JSONB NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_abuse_signals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payment_abuse_signals_hash_kind_idx"
  ON "payment_abuse_signals" ("signal_hash", "signal_kind", "created_at");

CREATE INDEX IF NOT EXISTS "payment_abuse_signals_user_created_at_idx"
  ON "payment_abuse_signals" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "refund_queue_items" (
  "id" TEXT NOT NULL,
  "payment_id" TEXT NULL,
  "user_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "stripe_refund_id" TEXT NULL,
  "metadata" JSONB NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "refund_queue_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "refund_queue_items_status_created_at_idx"
  ON "refund_queue_items" ("status", "created_at");

CREATE INDEX IF NOT EXISTS "refund_queue_items_payment_id_idx"
  ON "refund_queue_items" ("payment_id");

CREATE TABLE IF NOT EXISTS "fraud_audit_jobs" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "reason" TEXT NOT NULL,
  "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3) NULL,
  "metadata" JSONB NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fraud_audit_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "fraud_audit_jobs_status_scheduled_idx"
  ON "fraud_audit_jobs" ("status", "scheduled_at");
