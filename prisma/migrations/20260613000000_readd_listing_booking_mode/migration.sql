-- Re-introduce canonical booking_mode on Listing.
--
-- Phase-09 (20260509000000_phase09_cutover_retire_booking) dropped Listing.booking_mode
-- as part of retiring the legacy Booking model, but nothing replaced it as the durable
-- source of truth. The listing-create API still accepts `bookingMode`, so a host's
-- WHOLE_UNIT/SHARED choice was silently lost and every read path re-derived it from
-- roomType (or hardcoded 'SHARED'). This restores a first-class, durable column so the
-- choice persists and may legitimately diverge from roomType.
--
-- Rollback (reversible):
--   ALTER TABLE "Listing" DROP CONSTRAINT "Listing_bookingMode_check";
--   ALTER TABLE "Listing" DROP COLUMN "booking_mode";
--
-- Data-safety:
--   * ADD COLUMN with a constant DEFAULT is metadata-only on PG 11+ (no table rewrite/long lock).
--   * Backfill first preserves existing canonical inventory rows that already represent
--     whole-unit listings, including divergent rows where roomType is not 'Entire Place'.
--   * Legacy roomType fallback only fills rows without a stronger inventory signal.
--   * CHECK added NOT VALID then VALIDATE to avoid a blocking scan on large tables.

ALTER TABLE "Listing"
  ADD COLUMN IF NOT EXISTS "booking_mode" TEXT NOT NULL DEFAULT 'SHARED';

-- Backfill from existing canonical inventory first; this preserves divergent rows
-- created while bookingMode was accepted but not stored on Listing.
UPDATE "Listing" AS listing
SET "booking_mode" = 'WHOLE_UNIT'
FROM "listing_inventories" AS inventory
WHERE inventory.listing_id = listing.id
  AND inventory.room_category = 'ENTIRE_PLACE'
  AND listing."booking_mode" <> 'WHOLE_UNIT';

-- Fall back to legacy derive-from-roomType behavior for rows without an inventory signal.
UPDATE "Listing"
SET "booking_mode" = 'WHOLE_UNIT'
WHERE "roomType" = 'Entire Place'
  AND "booking_mode" <> 'WHOLE_UNIT';

ALTER TABLE "Listing"
  ADD CONSTRAINT "Listing_bookingMode_check"
  CHECK ("booking_mode" IN ('SHARED', 'WHOLE_UNIT')) NOT VALID;

ALTER TABLE "Listing" VALIDATE CONSTRAINT "Listing_bookingMode_check";
