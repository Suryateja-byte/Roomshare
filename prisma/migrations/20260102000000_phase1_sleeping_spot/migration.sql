-- ============================================================
-- Phase 1: Additive Schema Migration
-- Goal: Add SleepingSpot, SpotWaitlist, Booking v2 columns
--
-- P0 Correctness Guarantees:
-- 1. CHECK constraints for status-shape invariants
-- 2. ON DELETE RESTRICT for booking FKs (prevents CHECK violations)
-- 3. Partial unique indexes as backstop against double-occupy
-- 4. Temporal constraints (expiry > start times)
-- ============================================================

-- ============================================================
-- STEP 1: Create enums
-- ============================================================
CREATE TYPE "SpotStatus" AS ENUM ('AVAILABLE', 'HELD', 'UNDER_OFFER', 'FILLED', 'MAINTENANCE');
CREATE TYPE "BookingStatusV2" AS ENUM ('PENDING', 'HOLD_OFFERED', 'UNDER_OFFER', 'FILLED_PENDING_MOVE_IN', 'MOVE_IN_CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "WaitlistStatus" AS ENUM ('QUEUED', 'NOTIFIED', 'EXPIRED', 'REMOVED', 'CONVERTED');

-- ============================================================
-- STEP 2: Create SleepingSpot table with CHECK constraints
-- ============================================================
CREATE TABLE "SleepingSpot" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "spotNumber" INTEGER NOT NULL,
  "status" "SpotStatus" NOT NULL DEFAULT 'AVAILABLE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "heldByBookingId" TEXT,
  "heldAt" TIMESTAMPTZ,
  "holdExpiresAt" TIMESTAMPTZ,
  "offerExpiresAt" TIMESTAMPTZ,
  "filledByBookingId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "SleepingSpot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "spot_number_positive" CHECK ("spotNumber" > 0),
  CONSTRAINT "spot_version_positive" CHECK ("version" > 0),

  -- Shape constraints: impossible states rejected at DB level
  CONSTRAINT "spot_available_shape" CHECK (
    status != 'AVAILABLE' OR (
      "heldByBookingId" IS NULL AND "heldAt" IS NULL AND "holdExpiresAt" IS NULL
      AND "offerExpiresAt" IS NULL AND "filledByBookingId" IS NULL
    )
  ),
  CONSTRAINT "spot_held_shape" CHECK (
    status != 'HELD' OR (
      "heldByBookingId" IS NOT NULL AND "heldAt" IS NOT NULL
      AND "holdExpiresAt" IS NOT NULL AND "holdExpiresAt" > "heldAt"
      AND "offerExpiresAt" IS NULL AND "filledByBookingId" IS NULL
    )
  ),
  CONSTRAINT "spot_under_offer_shape" CHECK (
    status != 'UNDER_OFFER' OR (
      "heldByBookingId" IS NOT NULL AND "heldAt" IS NOT NULL
      AND "offerExpiresAt" IS NOT NULL AND "offerExpiresAt" > "heldAt"
      AND "holdExpiresAt" IS NULL AND "filledByBookingId" IS NULL
    )
  ),
  CONSTRAINT "spot_filled_shape" CHECK (
    status != 'FILLED' OR (
      "filledByBookingId" IS NOT NULL
      AND "heldByBookingId" IS NULL AND "heldAt" IS NULL
      AND "holdExpiresAt" IS NULL AND "offerExpiresAt" IS NULL
    )
  ),
  CONSTRAINT "spot_maintenance_shape" CHECK (
    status != 'MAINTENANCE' OR (
      "heldByBookingId" IS NULL AND "heldAt" IS NULL
      AND "holdExpiresAt" IS NULL AND "offerExpiresAt" IS NULL
      AND "filledByBookingId" IS NULL
    )
  )
);

-- ============================================================
-- STEP 3: Create SpotWaitlist table with CHECK constraints
-- ============================================================
CREATE TABLE "SpotWaitlist" (
  "id" TEXT NOT NULL,
  "spotId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "bookingId" TEXT,
  "status" "WaitlistStatus" NOT NULL DEFAULT 'QUEUED',
  "position" INTEGER NOT NULL,
  "notifiedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "SpotWaitlist_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "waitlist_position_positive" CHECK ("position" > 0),

  -- Shape constraints for waitlist states
  CONSTRAINT "waitlist_queued_shape" CHECK (
    status != 'QUEUED' OR ("notifiedAt" IS NULL AND "expiresAt" IS NULL AND "bookingId" IS NULL)
  ),
  CONSTRAINT "waitlist_notified_shape" CHECK (
    status != 'NOTIFIED' OR ("notifiedAt" IS NOT NULL AND "expiresAt" IS NOT NULL AND "expiresAt" > "notifiedAt")
  ),
  CONSTRAINT "waitlist_converted_shape" CHECK (
    status != 'CONVERTED' OR ("bookingId" IS NOT NULL)
  )
);

-- ============================================================
-- STEP 4: Add Booking v2 columns
-- ============================================================
ALTER TABLE "Booking" ADD COLUMN "spotId" TEXT;
ALTER TABLE "Booking" ADD COLUMN "statusV2" "BookingStatusV2";
ALTER TABLE "Booking" ADD COLUMN "holdOfferedAt" TIMESTAMPTZ;
ALTER TABLE "Booking" ADD COLUMN "holdExpiresAt" TIMESTAMPTZ;
ALTER TABLE "Booking" ADD COLUMN "offerAcceptedAt" TIMESTAMPTZ;
ALTER TABLE "Booking" ADD COLUMN "offerExpiresAt" TIMESTAMPTZ;
ALTER TABLE "Booking" ADD COLUMN "moveInConfirmedAt" TIMESTAMPTZ;
ALTER TABLE "Booking" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- ============================================================
-- STEP 5: Add Booking v2 shape CHECK constraints
-- ============================================================
ALTER TABLE "Booking" ADD CONSTRAINT "booking_version_positive" CHECK ("version" > 0);

ALTER TABLE "Booking" ADD CONSTRAINT "booking_hold_offered_shape" CHECK (
  "statusV2" != 'HOLD_OFFERED' OR (
    "spotId" IS NOT NULL AND "holdOfferedAt" IS NOT NULL
    AND "holdExpiresAt" IS NOT NULL AND "holdExpiresAt" > "holdOfferedAt"
  )
);

ALTER TABLE "Booking" ADD CONSTRAINT "booking_under_offer_shape" CHECK (
  "statusV2" != 'UNDER_OFFER' OR (
    "spotId" IS NOT NULL AND "offerAcceptedAt" IS NOT NULL
    AND "offerExpiresAt" IS NOT NULL AND "offerExpiresAt" > "offerAcceptedAt"
  )
);

ALTER TABLE "Booking" ADD CONSTRAINT "booking_move_in_confirmed_shape" CHECK (
  "statusV2" != 'MOVE_IN_CONFIRMED' OR (
    "spotId" IS NOT NULL AND "moveInConfirmedAt" IS NOT NULL
  )
);

-- ============================================================
-- STEP 6: Add foreign keys (RESTRICT, not SET NULL)
-- CRITICAL: RESTRICT prevents CHECK constraint violations when
-- bookings are deleted while spots still reference them
-- ============================================================
ALTER TABLE "SleepingSpot" ADD CONSTRAINT "SleepingSpot_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SleepingSpot" ADD CONSTRAINT "SleepingSpot_heldByBookingId_fkey"
  FOREIGN KEY ("heldByBookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SleepingSpot" ADD CONSTRAINT "SleepingSpot_filledByBookingId_fkey"
  FOREIGN KEY ("filledByBookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SpotWaitlist" ADD CONSTRAINT "SpotWaitlist_spotId_fkey"
  FOREIGN KEY ("spotId") REFERENCES "SleepingSpot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpotWaitlist" ADD CONSTRAINT "SpotWaitlist_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpotWaitlist" ADD CONSTRAINT "SpotWaitlist_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_spotId_fkey"
  FOREIGN KEY ("spotId") REFERENCES "SleepingSpot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- STEP 7: Add unique constraints
-- ============================================================
CREATE UNIQUE INDEX "SleepingSpot_listingId_spotNumber_key" ON "SleepingSpot"("listingId", "spotNumber");
CREATE UNIQUE INDEX "SpotWaitlist_spotId_userId_key" ON "SpotWaitlist"("spotId", "userId");
CREATE UNIQUE INDEX "SpotWaitlist_spotId_position_key" ON "SpotWaitlist"("spotId", "position");

-- ============================================================
-- STEP 8: Performance indexes
-- ============================================================
-- Available spots lookup (listing page)
CREATE INDEX "SleepingSpot_available_by_listing_idx"
  ON "SleepingSpot"("listingId", "spotNumber") WHERE status = 'AVAILABLE';

-- General status lookup
CREATE INDEX "SleepingSpot_listingId_status_idx" ON "SleepingSpot"("listingId", "status");

-- Cron expiry scans
CREATE INDEX "SleepingSpot_hold_expiry_idx"
  ON "SleepingSpot"("holdExpiresAt") WHERE status = 'HELD';
CREATE INDEX "SleepingSpot_offer_expiry_idx"
  ON "SleepingSpot"("offerExpiresAt") WHERE status = 'UNDER_OFFER';

-- Waitlist queries
CREATE INDEX "SpotWaitlist_by_spot_idx" ON "SpotWaitlist"("spotId", "status", "position");

-- Booking v2 queries
CREATE INDEX "Booking_v2_by_spot_idx" ON "Booking"("spotId");
CREATE INDEX "Booking_v2_active_status_idx" ON "Booking"("statusV2")
  WHERE "statusV2" IN ('HOLD_OFFERED', 'UNDER_OFFER');

-- ============================================================
-- STEP 9: Backstop partial unique indexes
-- These are the LAST LINE OF DEFENSE against double-occupy bugs
-- ============================================================
-- Prevent one booking from holding multiple spots
CREATE UNIQUE INDEX "SleepingSpot_active_hold_per_booking_uniq"
  ON "SleepingSpot"("heldByBookingId") WHERE status IN ('HELD', 'UNDER_OFFER');

-- One active v2 booking per tenant per listing (prevents spam/multi-holds)
CREATE UNIQUE INDEX "Booking_one_active_v2_per_tenant_listing_uniq"
  ON "Booking"("tenantId", "listingId")
  WHERE "statusV2" IN ('HOLD_OFFERED', 'UNDER_OFFER', 'FILLED_PENDING_MOVE_IN', 'MOVE_IN_CONFIRMED');
