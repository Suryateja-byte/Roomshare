-- Migration: add_contact_first_listing_fields
--
-- Adds the additive Listing fields needed for the contact-first / host-managed
-- availability model. This is an expand-only migration:
-- - no legacy booking columns are renamed or removed
-- - Listing.status remains ACTIVE | PAUSED | RENTED
-- - availableSlots remains intact as the legacy/shadow compatibility field
--
-- Rollback:
--   1. Drop forward-looking indexes
--   2. Drop additive CHECK constraints
--   3. Drop the new Listing columns
--   4. Drop enum type "ListingAvailabilitySource" if no longer referenced
--
-- Safety:
-- - All new columns are additive.
-- - Required columns use constant defaults, which are metadata-only on modern PostgreSQL.
-- - CHECK constraints are added NOT VALID + VALIDATE to minimize write blocking.
-- - No legacy data is rewritten or backfilled in this phase.

DO $$
BEGIN
  CREATE TYPE "ListingAvailabilitySource" AS ENUM ('LEGACY_BOOKING', 'HOST_MANAGED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Listing"
  ADD COLUMN "openSlots" INTEGER,
  ADD COLUMN "availableUntil" DATE,
  ADD COLUMN "minStayMonths" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "lastConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "availabilitySource" "ListingAvailabilitySource" NOT NULL DEFAULT 'LEGACY_BOOKING',
  ADD COLUMN "needsMigrationReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "statusReason" VARCHAR(64),
  ADD COLUMN "freshnessReminderSentAt" TIMESTAMP(3),
  ADD COLUMN "freshnessWarningSentAt" TIMESTAMP(3),
  ADD COLUMN "autoPausedAt" TIMESTAMP(3);

ALTER TABLE "Listing"
  ADD CONSTRAINT "listing_min_stay_months_positive"
  CHECK ("minStayMonths" >= 1) NOT VALID;
ALTER TABLE "Listing"
  VALIDATE CONSTRAINT "listing_min_stay_months_positive";

ALTER TABLE "Listing"
  ADD CONSTRAINT "listing_open_slots_non_negative"
  CHECK ("openSlots" IS NULL OR "openSlots" >= 0) NOT VALID;
ALTER TABLE "Listing"
  VALIDATE CONSTRAINT "listing_open_slots_non_negative";

ALTER TABLE "Listing"
  ADD CONSTRAINT "listing_open_slots_upper_bound"
  CHECK ("openSlots" IS NULL OR "openSlots" <= "totalSlots") NOT VALID;
ALTER TABLE "Listing"
  VALIDATE CONSTRAINT "listing_open_slots_upper_bound";

ALTER TABLE "Listing"
  ADD CONSTRAINT "listing_available_until_after_move_in"
  CHECK (
    "availableUntil" IS NULL
    OR "moveInDate" IS NULL
    OR "availableUntil" >= "moveInDate"::date
  ) NOT VALID;
ALTER TABLE "Listing"
  VALIDATE CONSTRAINT "listing_available_until_after_move_in";

CREATE INDEX IF NOT EXISTS "Listing_availabilitySource_status_idx"
  ON "Listing" ("availabilitySource", "status");

CREATE INDEX IF NOT EXISTS "Listing_lastConfirmedAt_idx"
  ON "Listing" ("lastConfirmedAt");

-- Manual rollback SQL:
-- DROP INDEX IF EXISTS "Listing_lastConfirmedAt_idx";
-- DROP INDEX IF EXISTS "Listing_availabilitySource_status_idx";
-- ALTER TABLE "Listing" DROP CONSTRAINT IF EXISTS "listing_available_until_after_move_in";
-- ALTER TABLE "Listing" DROP CONSTRAINT IF EXISTS "listing_open_slots_upper_bound";
-- ALTER TABLE "Listing" DROP CONSTRAINT IF EXISTS "listing_open_slots_non_negative";
-- ALTER TABLE "Listing" DROP CONSTRAINT IF EXISTS "listing_min_stay_months_positive";
-- ALTER TABLE "Listing"
--   DROP COLUMN IF EXISTS "autoPausedAt",
--   DROP COLUMN IF EXISTS "freshnessWarningSentAt",
--   DROP COLUMN IF EXISTS "freshnessReminderSentAt",
--   DROP COLUMN IF EXISTS "statusReason",
--   DROP COLUMN IF EXISTS "needsMigrationReview",
--   DROP COLUMN IF EXISTS "availabilitySource",
--   DROP COLUMN IF EXISTS "lastConfirmedAt",
--   DROP COLUMN IF EXISTS "minStayMonths",
--   DROP COLUMN IF EXISTS "availableUntil",
--   DROP COLUMN IF EXISTS "openSlots";
-- DROP TYPE IF EXISTS "ListingAvailabilitySource";
