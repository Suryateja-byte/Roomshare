-- Phase 1: Schema Evolution — heldAt, holdTtlMinutes, BookingAuditLog
--
-- Rollback notes:
--   - Columns: ALTER TABLE "Booking" DROP COLUMN IF EXISTS "heldAt";
--              ALTER TABLE "Listing" DROP COLUMN IF EXISTS "hold_ttl_minutes";
--   - Table:   DROP TABLE IF EXISTS "BookingAuditLog" CASCADE;
--   - Constraints: ALTER TABLE "BookingAuditLog" DROP CONSTRAINT IF EXISTS "booking_audit_action_check";
--   All changes are REVERSIBLE (no enum additions in this migration).
--
-- Data safety:
--   - heldAt: nullable column, no table rewrite on PG 11+
--   - hold_ttl_minutes: NOT NULL with DEFAULT 15, no table rewrite on PG 11+
--   - BookingAuditLog: new table, no impact on existing tables
--   - CHECK constraint uses NOT VALID + VALIDATE (minimal locking)
--   - No backfill needed (heldAt is null for existing bookings)

-- Step 1: Add heldAt to Booking (nullable, no default needed)
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "heldAt" TIMESTAMP(3);

-- Step 2: Add hold_ttl_minutes to Listing (non-null with safe default)
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "hold_ttl_minutes" INTEGER NOT NULL DEFAULT 15;

-- Step 3: Create BookingAuditLog table (immutable append-only)
CREATE TABLE "BookingAuditLog" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "ipAddress" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingAuditLog_pkey" PRIMARY KEY ("id")
);

-- Step 4: CHECK constraint on action (NOT VALID first, then validate)
ALTER TABLE "BookingAuditLog" ADD CONSTRAINT "booking_audit_action_check"
    CHECK ("action" IN (
        'CREATED', 'HELD', 'ACCEPTED', 'REJECTED',
        'CANCELLED', 'EXPIRED', 'STATUS_CHANGED'
    )) NOT VALID;
ALTER TABLE "BookingAuditLog" VALIDATE CONSTRAINT "booking_audit_action_check";

-- Step 5: CHECK constraint on actorType
ALTER TABLE "BookingAuditLog" ADD CONSTRAINT "booking_audit_actor_type_check"
    CHECK ("actorType" IN ('USER', 'HOST', 'SYSTEM', 'ADMIN')) NOT VALID;
ALTER TABLE "BookingAuditLog" VALIDATE CONSTRAINT "booking_audit_actor_type_check";

-- Step 6: Foreign keys
ALTER TABLE "BookingAuditLog" ADD CONSTRAINT "BookingAuditLog_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingAuditLog" ADD CONSTRAINT "BookingAuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 7: Indexes for common query patterns
CREATE INDEX "BookingAuditLog_bookingId_idx" ON "BookingAuditLog"("bookingId");
CREATE INDEX "BookingAuditLog_bookingId_createdAt_idx" ON "BookingAuditLog"("bookingId", "createdAt");
CREATE INDEX "BookingAuditLog_actorId_idx" ON "BookingAuditLog"("actorId");
CREATE INDEX "BookingAuditLog_action_idx" ON "BookingAuditLog"("action");
CREATE INDEX "BookingAuditLog_createdAt_idx" ON "BookingAuditLog"("createdAt");

-- Step 8: CHECK on holdTtlMinutes (reasonable bounds: 5-60 minutes)
ALTER TABLE "Listing" ADD CONSTRAINT "listing_hold_ttl_minutes_check"
    CHECK ("hold_ttl_minutes" >= 5 AND "hold_ttl_minutes" <= 60) NOT VALID;
ALTER TABLE "Listing" VALIDATE CONSTRAINT "listing_hold_ttl_minutes_check";
