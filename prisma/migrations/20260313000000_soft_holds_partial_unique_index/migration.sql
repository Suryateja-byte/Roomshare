-- Phase 4: Replace full unique constraint with partial unique index
-- Allows re-application after EXPIRED/REJECTED/CANCELLED (only blocks when PENDING/HELD/ACCEPTED)
--
-- Rollback: Reversible — DROP INDEX + re-add full constraint:
--   DROP INDEX IF EXISTS idx_booking_active_unique;
--   DROP INDEX IF EXISTS idx_booking_held_by_listing;
--   DROP INDEX IF EXISTS idx_booking_held_expiry;
--   ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tenantId_listingId_startDate_endDate_key"
--     UNIQUE ("tenantId", "listingId", "startDate", "endDate");
--
-- Data safety: No data modification. CREATE INDEX CONCURRENTLY not used (inside migration tx).
-- Index creation on small tables is fast; no table lock concern at current scale.
--
-- NOTE: After removing @@unique from schema.prisma, `prisma db push` may attempt to recreate
-- the full constraint. Always use `prisma migrate deploy` in production.

-- Drop the full unique constraint
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "Booking_tenantId_listingId_startDate_endDate_key";

-- Partial unique index: only enforces uniqueness for active bookings
CREATE UNIQUE INDEX idx_booking_active_unique
  ON "Booking" ("tenantId", "listingId", "startDate", "endDate")
  WHERE status IN ('PENDING', 'HELD', 'ACCEPTED');

-- Ghost-hold query index: per-listing lookup for unexpired HELD bookings
CREATE INDEX IF NOT EXISTS idx_booking_held_by_listing
  ON "Booking" ("listingId", "heldUntil")
  WHERE status = 'HELD';

-- Sweeper index: find all expired HELD bookings efficiently
CREATE INDEX IF NOT EXISTS idx_booking_held_expiry
  ON "Booking" ("heldUntil")
  WHERE status = 'HELD';
