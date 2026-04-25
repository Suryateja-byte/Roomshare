-- Multi-slot stabilization: add day-level inventory projection.
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_check_whole_unit_overlap ON "Booking";
--   DROP FUNCTION IF EXISTS check_whole_unit_overlap();
--   DROP TABLE IF EXISTS listing_day_inventory;
--
-- Safety:
-- - Adds a new projection table; no destructive data migration.
-- - Backfills future ACCEPTED and active HELD bookings into the projection.
-- - Replaces the whole-unit overlap trigger to ignore expired HELD rows and
--   to use half-open range semantics.

CREATE TABLE IF NOT EXISTS listing_day_inventory (
  listing_id text NOT NULL REFERENCES "Listing"(id) ON DELETE CASCADE,
  day date NOT NULL,
  total_slots integer NOT NULL,
  held_slots integer NOT NULL DEFAULT 0,
  accepted_slots integer NOT NULL DEFAULT 0,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, day),
  CHECK (total_slots > 0),
  CHECK (held_slots >= 0),
  CHECK (accepted_slots >= 0),
  CHECK (held_slots + accepted_slots <= total_slots)
);

CREATE INDEX IF NOT EXISTS idx_listing_day_inventory_day
  ON listing_day_inventory (day);

CREATE INDEX IF NOT EXISTS idx_listing_day_inventory_listing_updated
  ON listing_day_inventory (listing_id, updated_at DESC);

WITH future_booking_days AS (
  SELECT
    b."listingId" AS listing_id,
    requested_day.day::date AS day,
    MAX(l."totalSlots")::int AS total_slots,
    COALESCE(
      SUM(
        CASE
          WHEN b.status = 'HELD' AND b."heldUntil" > NOW()
            THEN b."slotsRequested"
          ELSE 0
        END
      ),
      0
    )::int AS held_slots,
    COALESCE(
      SUM(
        CASE
          WHEN b.status = 'ACCEPTED'
            THEN b."slotsRequested"
          ELSE 0
        END
      ),
      0
    )::int AS accepted_slots
  FROM "Booking" b
  JOIN "Listing" l
    ON l.id = b."listingId"
  JOIN LATERAL generate_series(
    b."startDate"::date,
    (b."endDate"::date - INTERVAL '1 day')::date,
    INTERVAL '1 day'
  ) AS requested_day(day)
    ON b."endDate"::date > b."startDate"::date
  WHERE b."endDate"::date > CURRENT_DATE
    AND (
      b.status = 'ACCEPTED'
      OR (b.status = 'HELD' AND b."heldUntil" > NOW())
    )
  GROUP BY b."listingId", requested_day.day::date
)
INSERT INTO listing_day_inventory (
  listing_id,
  day,
  total_slots,
  held_slots,
  accepted_slots,
  version,
  updated_at
)
SELECT
  listing_id,
  day,
  total_slots,
  held_slots,
  accepted_slots,
  1,
  NOW()
FROM future_booking_days
ON CONFLICT (listing_id, day) DO UPDATE SET
  total_slots = EXCLUDED.total_slots,
  held_slots = EXCLUDED.held_slots,
  accepted_slots = EXCLUDED.accepted_slots,
  version = listing_day_inventory.version + 1,
  updated_at = NOW();

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

  SELECT COUNT(*) INTO v_overlap_count
  FROM "Booking"
  WHERE "listingId" = NEW."listingId"
    AND id <> NEW.id
    AND (
      status = 'ACCEPTED'
      OR (status = 'HELD' AND "heldUntil" > NOW())
    )
    AND "startDate" < NEW."endDate"
    AND "endDate" > NEW."startDate";

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION 'WHOLE_UNIT_OVERLAP: overlapping booking exists for whole-unit listing';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_whole_unit_overlap ON "Booking";

CREATE TRIGGER trg_check_whole_unit_overlap
  BEFORE INSERT OR UPDATE ON "Booking"
  FOR EACH ROW
  WHEN (NEW.status IN ('ACCEPTED', 'HELD'))
  EXECUTE FUNCTION check_whole_unit_overlap();
