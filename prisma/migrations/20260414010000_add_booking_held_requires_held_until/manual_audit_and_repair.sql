-- Operator playbook for booking_held_requires_held_until audit and repair.
--
-- Run this AFTER deploying migration.sql from the same directory and BEFORE
-- validating the constraint in a later release.
--
-- Why this is manual:
-- - CI and deploy workflows run `pnpm exec prisma migrate deploy`, which applies
--   every pending Prisma migration in order.
-- - Keeping audit/repair/validation here preserves the intended staged rollout
--   instead of auto-validating immediately after adding the NOT VALID constraint.

-- 1. Audit the scope of the problem.
SELECT COUNT(*) AS bad_rows
FROM "Booking"
WHERE status = 'HELD'::"BookingStatus"
  AND "heldUntil" IS NULL;

-- 2. Export the offending rows for operator traceability before repair.
SELECT
  b.id,
  b."listingId",
  b."tenantId",
  b."startDate",
  b."endDate",
  b."slotsRequested",
  b.version,
  b."heldAt",
  b."createdAt",
  b."updatedAt"
FROM "Booking" b
WHERE b.status = 'HELD'::"BookingStatus"
  AND b."heldUntil" IS NULL
ORDER BY b."listingId", b."createdAt", b.id;

-- 3. Repair any violating rows by expiring them, restoring listing capacity,
--    and rebuilding future day-inventory rows for the affected listings.
BEGIN;

CREATE TEMP TABLE bad_holds ON COMMIT DROP AS
SELECT
  b.id,
  b."listingId",
  b."slotsRequested",
  b."startDate",
  b."endDate"
FROM "Booking" b
WHERE b.status = 'HELD'::"BookingStatus"
  AND b."heldUntil" IS NULL;

CREATE TEMP TABLE affected_listings ON COMMIT DROP AS
SELECT DISTINCT "listingId"
FROM bad_holds;

-- Lock bookings first, then listings, to keep the repair deterministic.
SELECT 1
FROM "Booking" b
JOIN bad_holds h ON h.id = b.id
ORDER BY b."listingId", b.id
FOR UPDATE OF b;

SELECT 1
FROM "Listing" l
JOIN affected_listings a ON a."listingId" = l.id
ORDER BY l.id
FOR UPDATE OF l;

UPDATE "Booking" b
SET status = 'EXPIRED'::"BookingStatus",
    "heldUntil" = NULL,
    version = b.version + 1,
    "updatedAt" = NOW()
FROM bad_holds h
WHERE b.id = h.id;

INSERT INTO "BookingAuditLog" (
  "id",
  "bookingId",
  "action",
  "previousStatus",
  "newStatus",
  "actorId",
  "actorType",
  "details",
  "createdAt"
)
SELECT
  md5(h.id || clock_timestamp()::text || random()::text),
  h.id,
  'EXPIRED',
  'HELD',
  'EXPIRED',
  NULL,
  'SYSTEM',
  jsonb_build_object(
    'mechanism', 'manual_backfill',
    'reason', 'HELD booking missing heldUntil',
    'heldUntil', NULL,
    'slotsRequested', h."slotsRequested"
  ),
  NOW()
FROM bad_holds h;

UPDATE "Listing" l
SET "availableSlots" = LEAST(
      l."availableSlots" + restored."slotsToRestore",
      l."totalSlots"
    )
FROM (
  SELECT
    "listingId",
    SUM("slotsRequested")::int AS "slotsToRestore"
  FROM bad_holds
  GROUP BY "listingId"
) restored
WHERE l.id = restored."listingId";

DELETE FROM listing_day_inventory ldi
USING affected_listings a
WHERE ldi.listing_id = a."listingId"
  AND ldi.day >= CURRENT_DATE;

WITH future_booking_days AS (
  SELECT
    b."listingId" AS listing_id,
    requested_day.day::date AS day,
    MAX(l."totalSlots")::int AS total_slots,
    COALESCE(
      SUM(
        CASE
          WHEN b.status = 'HELD'::"BookingStatus" AND b."heldUntil" > NOW()
            THEN b."slotsRequested"
          ELSE 0
        END
      ),
      0
    )::int AS held_slots,
    COALESCE(
      SUM(
        CASE
          WHEN b.status = 'ACCEPTED'::"BookingStatus"
            THEN b."slotsRequested"
          ELSE 0
        END
      ),
      0
    )::int AS accepted_slots
  FROM "Booking" b
  JOIN affected_listings a
    ON a."listingId" = b."listingId"
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
      b.status = 'ACCEPTED'::"BookingStatus"
      OR (b.status = 'HELD'::"BookingStatus" AND b."heldUntil" > NOW())
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

COMMIT;

-- 4. Re-run the audit. This must return zero rows before validation.
SELECT COUNT(*) AS bad_rows_after_repair
FROM "Booking"
WHERE status = 'HELD'::"BookingStatus"
  AND "heldUntil" IS NULL;

-- 5. After this returns zero, run deferred_validate_migration.sql in a later
--    release window or promote it into its own Prisma migration.
