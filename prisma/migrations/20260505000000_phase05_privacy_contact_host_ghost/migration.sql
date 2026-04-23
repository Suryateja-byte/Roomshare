-- Phase 05: privacy/contact-host/phone-reveal audit support.
--
-- Expand-only migration. The new tables are independent of Phase 06 credit issuance.
--
-- Rollback:
--   DROP TABLE IF EXISTS "phone_reveal_audits";
--   DROP TABLE IF EXISTS "host_contact_channels";
--   DROP TABLE IF EXISTS "contact_attempts";

CREATE TABLE IF NOT EXISTS "contact_attempts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "listing_id" TEXT NOT NULL,
  "unit_id" TEXT NULL,
  "unit_identity_epoch_observed" INTEGER NULL,
  "unit_identity_epoch_resolved" INTEGER NULL,
  "contact_kind" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "client_idempotency_key" TEXT NULL,
  "conversation_id" TEXT NULL,
  "reason_code" TEXT NULL,
  "metadata" JSONB NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "contact_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "contact_attempts_user_idempotency_kind_idx"
  ON "contact_attempts" ("user_id", "client_idempotency_key", "contact_kind");

CREATE INDEX IF NOT EXISTS "contact_attempts_listing_created_at_idx"
  ON "contact_attempts" ("listing_id", "created_at");

CREATE INDEX IF NOT EXISTS "contact_attempts_user_kind_created_at_idx"
  ON "contact_attempts" ("user_id", "contact_kind", "created_at");

CREATE TABLE IF NOT EXISTS "host_contact_channels" (
  "id" TEXT NOT NULL,
  "host_user_id" TEXT NOT NULL,
  "phone_e164_ciphertext" TEXT NULL,
  "phone_e164_last4" VARCHAR(4) NULL,
  "phone_reveal_enabled" BOOLEAN NOT NULL DEFAULT false,
  "verified_at" TIMESTAMP(3) NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "host_contact_channels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "host_contact_channels_host_user_id_key"
  ON "host_contact_channels" ("host_user_id");

CREATE INDEX IF NOT EXISTS "host_contact_channels_reveal_enabled_idx"
  ON "host_contact_channels" ("phone_reveal_enabled", "verified_at");

CREATE TABLE IF NOT EXISTS "phone_reveal_audits" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "listing_id" TEXT NOT NULL,
  "unit_id" TEXT NULL,
  "unit_identity_epoch" INTEGER NULL,
  "host_user_id" TEXT NULL,
  "outcome" TEXT NOT NULL,
  "reason_code" TEXT NULL,
  "client_idempotency_key" TEXT NULL,
  "metadata" JSONB NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "phone_reveal_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "phone_reveal_audits_user_listing_idempotency_idx"
  ON "phone_reveal_audits" ("user_id", "listing_id", "client_idempotency_key");

CREATE INDEX IF NOT EXISTS "phone_reveal_audits_listing_created_at_idx"
  ON "phone_reveal_audits" ("listing_id", "created_at");

CREATE INDEX IF NOT EXISTS "phone_reveal_audits_user_created_at_idx"
  ON "phone_reveal_audits" ("user_id", "created_at");
