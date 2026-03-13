-- ============================================================
-- Cleanup: Remove Phase 1 SleepingSpot drift
--
-- Context: Phase 1 migration (20260102000000) added tables,
-- enums, columns, and constraints that were never wired into
-- application code or the Prisma schema. This migration removes
-- all Phase 1 artifacts to establish a clean baseline for the
-- v2.1 multi-slot booking implementation.
--
-- What is KEPT:
--   - Booking.version column (used by optimistic locking, in schema)
--   - booking_version_positive CHECK (version > 0)
--
-- Rollback: NOT safely reversible (tables/data are dropped).
--   To roll back, re-run the Phase 1 migration SQL manually.
--   No production data exists in these tables (confirmed via audit).
--
-- Data Safety: SAFE — no application code ever wrote to these
--   tables/columns. Confirmed by grep: only src/scripts/ files
--   (backfill/validation) reference them, all marked @ts-nocheck.
-- ============================================================

-- ============================================================
-- STEP 1: Drop foreign keys referencing SleepingSpot/SpotWaitlist
-- (Must drop FKs before dropping tables to avoid dependency errors)
-- ============================================================
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "Booking_spotId_fkey";

-- ============================================================
-- STEP 2: Drop indexes on Booking that reference Phase 1 columns
-- ============================================================
DROP INDEX IF EXISTS "Booking_v2_by_spot_idx";
DROP INDEX IF EXISTS "Booking_v2_active_status_idx";
DROP INDEX IF EXISTS "Booking_one_active_v2_per_tenant_listing_uniq";

-- ============================================================
-- STEP 3: Drop Phase 1 CHECK constraints on Booking
-- (Keep booking_version_positive — version > 0 is still valid)
-- ============================================================
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "booking_hold_offered_shape";
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "booking_under_offer_shape";
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "booking_move_in_confirmed_shape";

-- ============================================================
-- STEP 4: Drop Phase 1 columns from Booking
-- (version column is KEPT — it's in schema.prisma and used)
-- ============================================================
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "spotId";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "statusV2";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "holdOfferedAt";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "holdExpiresAt";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "offerAcceptedAt";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "offerExpiresAt";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "moveInConfirmedAt";

-- ============================================================
-- STEP 5: Drop Phase 1 tables (CASCADE drops their FKs/indexes)
-- ============================================================
DROP TABLE IF EXISTS "SpotWaitlist" CASCADE;
DROP TABLE IF EXISTS "SleepingSpot" CASCADE;

-- ============================================================
-- STEP 6: Drop Phase 1 enums
-- ============================================================
DROP TYPE IF EXISTS "SpotStatus";
DROP TYPE IF EXISTS "BookingStatusV2";
DROP TYPE IF EXISTS "WaitlistStatus";
