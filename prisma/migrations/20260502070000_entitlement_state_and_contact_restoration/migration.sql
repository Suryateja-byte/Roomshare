-- Add entitlement_state projection + restoration-aware contact consumption.
-- Rollback:
--   DROP TABLE IF EXISTS "contact_restorations";
--   DROP TABLE IF EXISTS "entitlement_state";
--   DROP INDEX IF EXISTS "contact_consumption_user_idempotency_idx";
--   ALTER TABLE "contact_consumption"
--     DROP COLUMN IF EXISTS "client_idempotency_key",
--     DROP COLUMN IF EXISTS "restoration_state",
--     DROP COLUMN IF EXISTS "restoration_eligible_until";
--   DROP TYPE IF EXISTS "ContactRestorationReason";
--   DROP TYPE IF EXISTS "ContactRestorationState";
--   DROP TYPE IF EXISTS "EntitlementFreezeReason";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'EntitlementFreezeReason'
  ) THEN
    CREATE TYPE "EntitlementFreezeReason" AS ENUM (
      'NONE',
      'CHARGEBACK_PENDING',
      'FRAUD_REVIEW',
      'MANUAL'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ContactRestorationState'
  ) THEN
    CREATE TYPE "ContactRestorationState" AS ENUM (
      'NONE',
      'RESTORED_HOST_BAN',
      'RESTORED_HOST_MASS_DEACTIVATED',
      'RESTORED_HOST_GHOST_SLA',
      'RESTORED_SUPPORT'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ContactRestorationReason'
  ) THEN
    CREATE TYPE "ContactRestorationReason" AS ENUM (
      'HOST_BAN',
      'HOST_MASS_DEACTIVATED',
      'HOST_GHOST_SLA',
      'SUPPORT'
    );
  END IF;
END $$;

ALTER TABLE "contact_consumption"
  ADD COLUMN IF NOT EXISTS "client_idempotency_key" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "restoration_state" "ContactRestorationState" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "restoration_eligible_until" TIMESTAMP(3) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "contact_consumption_user_idempotency_idx"
  ON "contact_consumption" ("user_id", "client_idempotency_key");

CREATE TABLE IF NOT EXISTS "entitlement_state" (
  "user_id" TEXT NOT NULL,
  "credits_free_remaining" INTEGER NOT NULL DEFAULT 0,
  "credits_paid_remaining" INTEGER NOT NULL DEFAULT 0,
  "active_pass_window_start" TIMESTAMP(3) NULL,
  "active_pass_window_end" TIMESTAMP(3) NULL,
  "freeze_reason" "EntitlementFreezeReason" NOT NULL DEFAULT 'NONE',
  "fraud_flag" BOOLEAN NOT NULL DEFAULT false,
  "source_version" BIGINT NOT NULL DEFAULT 1,
  "last_recomputed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "entitlement_state_pkey" PRIMARY KEY ("user_id")
);

CREATE INDEX IF NOT EXISTS "entitlement_state_freeze_recomputed_idx"
  ON "entitlement_state" ("freeze_reason", "last_recomputed_at");

CREATE TABLE IF NOT EXISTS "contact_restorations" (
  "id" TEXT NOT NULL,
  "contact_consumption_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "reason" "ContactRestorationReason" NOT NULL,
  "details" JSONB NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "contact_restorations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contact_restorations_contact_consumption_fkey"
    FOREIGN KEY ("contact_consumption_id")
    REFERENCES "contact_consumption"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "contact_restorations_consumption_reason_idx"
  ON "contact_restorations" ("contact_consumption_id", "reason");

CREATE INDEX IF NOT EXISTS "contact_restorations_user_created_at_idx"
  ON "contact_restorations" ("user_id", "created_at");
