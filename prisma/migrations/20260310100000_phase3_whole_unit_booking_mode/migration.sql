-- Phase 3: Add bookingMode to Listing for WHOLE_UNIT vs SHARED mode
-- Rollback: ALTER TABLE "Listing" DROP COLUMN "booking_mode";
--           DROP TRIGGER IF EXISTS trg_check_whole_unit_overlap ON "Booking";
--           DROP FUNCTION IF EXISTS check_whole_unit_overlap();
--           ALTER TABLE "Listing" DROP CONSTRAINT IF EXISTS "Listing_bookingMode_check";
--           ALTER TABLE listing_search_docs DROP COLUMN IF EXISTS booking_mode;
--           DROP INDEX IF EXISTS search_doc_booking_mode_idx;
-- Data safety: Non-destructive. DEFAULT 'SHARED'. No table lock on PG 11+.

-- 2a. Add booking_mode column
ALTER TABLE "Listing" ADD COLUMN "booking_mode" TEXT NOT NULL DEFAULT 'SHARED';

-- 2b. CHECK constraint (non-blocking two-step)
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_bookingMode_check"
  CHECK ("booking_mode" IN ('SHARED', 'WHOLE_UNIT')) NOT VALID;
ALTER TABLE "Listing" VALIDATE CONSTRAINT "Listing_bookingMode_check";

-- 2c. Trigger: prevent overlapping ACCEPTED bookings for WHOLE_UNIT listings
-- Defense-in-depth: fires on both INSERT and UPDATE to guard against any code path
-- that sets status='ACCEPTED' (the normal path is PENDING→ACCEPTED via UPDATE,
-- but INSERT is covered for safety).
CREATE OR REPLACE FUNCTION check_whole_unit_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_booking_mode TEXT;
  v_overlap_count INTEGER;
BEGIN
  -- Lock listing row and fetch booking mode (reentrant with app's FOR UPDATE)
  SELECT "booking_mode" INTO v_booking_mode
  FROM "Listing"
  WHERE id = NEW."listingId"
  FOR UPDATE;

  -- Only enforce for WHOLE_UNIT listings
  IF v_booking_mode <> 'WHOLE_UNIT' THEN
    RETURN NEW;
  END IF;

  -- Check for overlapping ACCEPTED bookings (excluding this booking)
  SELECT COUNT(*) INTO v_overlap_count
  FROM "Booking"
  WHERE "listingId" = NEW."listingId"
    AND id <> NEW.id
    AND status IN ('ACCEPTED')  -- TODO Phase 4: add 'HELD'
    AND "startDate" <= NEW."endDate"
    AND "endDate" >= NEW."startDate";

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION 'WHOLE_UNIT_OVERLAP: overlapping accepted booking exists for whole-unit listing';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fire on INSERT OR UPDATE (not just UPDATE) for defense-in-depth
-- WHEN clause uses NEW.status only (OLD doesn't exist on INSERT)
CREATE TRIGGER trg_check_whole_unit_overlap
  BEFORE INSERT OR UPDATE ON "Booking"
  FOR EACH ROW
  WHEN (NEW.status = 'ACCEPTED')
  EXECUTE FUNCTION check_whole_unit_overlap();

-- 2d. Add booking_mode to listing_search_docs
ALTER TABLE listing_search_docs ADD COLUMN "booking_mode" TEXT NOT NULL DEFAULT 'SHARED';

-- 2e. Index for search filtering (non-partial — covers both values)
CREATE INDEX "search_doc_booking_mode_idx"
  ON listing_search_docs ("booking_mode");
