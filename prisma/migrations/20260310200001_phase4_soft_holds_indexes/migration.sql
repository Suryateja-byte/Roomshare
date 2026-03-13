-- Phase 4b: Soft Holds — Indexes and trigger referencing HELD enum value
-- Must run AFTER 20260310200000_phase4_soft_holds so the HELD/EXPIRED enum
-- values have been committed and can be referenced.
-- Rollback (indexes): DROP INDEX IF EXISTS "idx_booking_active_holds";
--                     DROP INDEX IF EXISTS "Booking_status_heldUntil_idx"; (reversible)
-- Rollback (trigger): Re-run Phase 3 trigger without 'HELD' in status list (reversible)
-- Data safety: Non-destructive. Index creation is CONCURRENTLY-safe on PG 11+.

-- 2c. Composite index for sweeper: finds expired HELD bookings efficiently
CREATE INDEX IF NOT EXISTS "Booking_status_heldUntil_idx"
  ON "Booking" ("status", "heldUntil");

-- 2d. Partial index for ghost-hold subquery in search (S7)
CREATE INDEX IF NOT EXISTS "idx_booking_active_holds"
  ON "Booking" ("listingId", "heldUntil")
  WHERE status = 'HELD';

-- 2e. Update Phase 3 WHOLE_UNIT trigger to include HELD in overlap check
CREATE OR REPLACE FUNCTION check_whole_unit_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_booking_mode TEXT;
  v_overlap_count INTEGER;
BEGIN
  SELECT "booking_mode" INTO v_booking_mode
  FROM "Listing"
  WHERE id = NEW."listingId"
  FOR UPDATE;

  IF v_booking_mode <> 'WHOLE_UNIT' THEN
    RETURN NEW;
  END IF;

  -- Phase 4: Check for overlapping ACCEPTED or active HELD bookings
  SELECT COUNT(*) INTO v_overlap_count
  FROM "Booking"
  WHERE "listingId" = NEW."listingId"
    AND id <> NEW.id
    AND (
      status = 'ACCEPTED'
      OR (status = 'HELD' AND "heldUntil" > NOW())
    )
    AND "startDate" <= NEW."endDate"
    AND "endDate" >= NEW."startDate";

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION 'WHOLE_UNIT_OVERLAP: overlapping accepted/held booking exists for whole-unit listing';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger to fire for both ACCEPTED and HELD status
DROP TRIGGER IF EXISTS trg_check_whole_unit_overlap ON "Booking";
CREATE TRIGGER trg_check_whole_unit_overlap
  BEFORE INSERT OR UPDATE ON "Booking"
  FOR EACH ROW
  WHEN (NEW.status IN ('ACCEPTED', 'HELD'))
  EXECUTE FUNCTION check_whole_unit_overlap();
