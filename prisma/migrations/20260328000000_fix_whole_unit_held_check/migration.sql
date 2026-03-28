-- Fix DATA-001: WHOLE_UNIT trigger ignores HELD bookings
-- Previously only checked ACCEPTED; two users could simultaneously hold a WHOLE_UNIT listing.
-- Rollback: Re-run the Phase 3 migration's CREATE OR REPLACE FUNCTION + trigger with only 'ACCEPTED'.
-- Data safety: Non-destructive. CREATE OR REPLACE + DROP/CREATE TRIGGER. No table locks.

-- 1. Replace trigger function to also check HELD bookings
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

  -- Check for overlapping ACCEPTED or HELD bookings (excluding this booking)
  SELECT COUNT(*) INTO v_overlap_count
  FROM "Booking"
  WHERE "listingId" = NEW."listingId"
    AND id <> NEW.id
    AND status IN ('ACCEPTED', 'HELD')
    AND "startDate" <= NEW."endDate"
    AND "endDate" >= NEW."startDate";

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION 'WHOLE_UNIT_OVERLAP: overlapping booking exists for whole-unit listing';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Replace trigger to fire on both ACCEPTED and HELD status
DROP TRIGGER IF EXISTS trg_check_whole_unit_overlap ON "Booking";

CREATE TRIGGER trg_check_whole_unit_overlap
  BEFORE INSERT OR UPDATE ON "Booking"
  FOR EACH ROW
  WHEN (NEW.status IN ('ACCEPTED', 'HELD'))
  EXECUTE FUNCTION check_whole_unit_overlap();
