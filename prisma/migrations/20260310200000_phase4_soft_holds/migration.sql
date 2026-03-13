-- Phase 4a: Soft Holds — Add HELD/EXPIRED enum values + heldUntil column
-- PostgreSQL requires new enum values to be committed BEFORE they can be
-- referenced in indexes or triggers, so this migration only adds the enum
-- values and the nullable column. The next migration creates indexes/triggers.
-- Rollback (column):  ALTER TABLE "Booking" DROP COLUMN IF EXISTS "heldUntil"; (reversible)
-- Rollback (enum):    IRREVERSIBLE — ALTER TYPE ADD VALUE cannot be undone in PostgreSQL
-- Data safety: Non-destructive. Column is nullable. No table lock on PG 11+.

-- 2a. Extend BookingStatus enum (irreversible)
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'HELD';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- 2b. Add heldUntil column (nullable — only set for HELD bookings)
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "heldUntil" TIMESTAMP(3);

-- 2c. Add heldAt column (nullable — only set for HELD bookings)
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "heldAt" TIMESTAMP(3);
