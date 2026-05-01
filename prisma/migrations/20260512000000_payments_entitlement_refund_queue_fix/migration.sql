-- Payments and entitlements hardening fix.
--
-- Schema diff:
-- - entitlement_state is keyed by (user_id, contact_kind) instead of user_id.
-- - refund_queue_items gains retry/processing bookkeeping for automated refunds.
--
-- Rollback:
--   DELETE FROM "entitlement_state" WHERE "contact_kind" <> 'MESSAGE_START';
--   ALTER TABLE "entitlement_state" DROP CONSTRAINT IF EXISTS "entitlement_state_pkey";
--   ALTER TABLE "entitlement_state" ADD CONSTRAINT "entitlement_state_pkey" PRIMARY KEY ("user_id");
--   ALTER TABLE "entitlement_state" DROP COLUMN IF EXISTS "contact_kind";
--   DROP INDEX IF EXISTS "refund_queue_items_status_next_attempt_idx";
--   ALTER TABLE "refund_queue_items"
--     DROP COLUMN IF EXISTS "attempt_count",
--     DROP COLUMN IF EXISTS "next_attempt_at",
--     DROP COLUMN IF EXISTS "last_error",
--     DROP COLUMN IF EXISTS "processed_at";

ALTER TABLE "entitlement_state"
  ADD COLUMN IF NOT EXISTS "contact_kind" "ContactKind" NOT NULL DEFAULT 'MESSAGE_START';

ALTER TABLE "entitlement_state"
  DROP CONSTRAINT IF EXISTS "entitlement_state_pkey";

ALTER TABLE "entitlement_state"
  ADD CONSTRAINT "entitlement_state_pkey" PRIMARY KEY ("user_id", "contact_kind");

ALTER TABLE "refund_queue_items"
  ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "last_error" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "processed_at" TIMESTAMP(3) NULL;

CREATE INDEX IF NOT EXISTS "refund_queue_items_status_next_attempt_idx"
  ON "refund_queue_items" ("status", "next_attempt_at", "created_at");
