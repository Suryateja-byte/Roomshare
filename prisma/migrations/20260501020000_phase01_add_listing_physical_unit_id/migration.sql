-- Phase 01: reserve Listing.physical_unit_id for Phase 02 backfills
--
-- Rollback:
--   ALTER TABLE "Listing" DROP COLUMN IF EXISTS "physical_unit_id";
--
-- Data safety:
-- - Additive nullable column.
-- - No index, FK, or backfill in Phase 01.

ALTER TABLE "Listing"
  ADD COLUMN "physical_unit_id" TEXT NULL;
