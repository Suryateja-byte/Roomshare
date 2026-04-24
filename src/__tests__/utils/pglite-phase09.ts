import fs from "fs";
import path from "path";

import {
  createPGlitePhase08Fixture,
  type Phase08Fixture,
} from "@/__tests__/utils/pglite-phase08";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../prisma/migrations");

const PHASE09_MIGRATION = path.join(
  MIGRATIONS_DIR,
  "20260509000000_phase09_cutover_retire_booking",
  "migration.sql"
);

const LEGACY_BOOKING_FIXTURE_SQL = `
DO $$ BEGIN
  CREATE TYPE "BookingStatus" AS ENUM (
    'PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'HELD', 'EXPIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ListingAvailabilitySource" AS ENUM (
    'LEGACY_BOOKING', 'HOST_MANAGED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Listing"
  ADD COLUMN IF NOT EXISTS "availabilitySource" "ListingAvailabilitySource" NOT NULL DEFAULT 'LEGACY_BOOKING',
  ADD COLUMN IF NOT EXISTS "needsMigrationReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "booking_mode" TEXT NOT NULL DEFAULT 'SHARED',
  ADD COLUMN IF NOT EXISTS "hold_ttl_minutes" INTEGER NOT NULL DEFAULT 15;

CREATE TABLE IF NOT EXISTS "Booking" (
  "id" TEXT PRIMARY KEY,
  "listingId" TEXT NOT NULL REFERENCES "Listing"("id") ON DELETE RESTRICT,
  "tenantId" TEXT NULL REFERENCES "User"("id") ON DELETE SET NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
  "totalPrice" NUMERIC(10, 2) NOT NULL,
  "rejectionReason" TEXT NULL,
  "slotsRequested" INTEGER NOT NULL DEFAULT 1,
  "version" INTEGER NOT NULL DEFAULT 1,
  "heldUntil" TIMESTAMP(3) NULL,
  "heldAt" TIMESTAMP(3) NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "BookingAuditLog" (
  "id" TEXT PRIMARY KEY,
  "bookingId" TEXT NULL REFERENCES "Booking"("id") ON DELETE SET NULL,
  "action" TEXT NOT NULL,
  "previousStatus" TEXT NULL,
  "newStatus" TEXT NOT NULL,
  "actorId" TEXT NULL REFERENCES "User"("id") ON DELETE SET NULL,
  "actorType" TEXT NOT NULL DEFAULT 'USER',
  "details" JSONB NULL,
  "ipAddress" TEXT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS listing_day_inventory (
  listing_id TEXT NOT NULL REFERENCES "Listing"("id") ON DELETE CASCADE,
  day DATE NOT NULL,
  total_slots INTEGER NOT NULL,
  held_slots INTEGER NOT NULL DEFAULT 0,
  accepted_slots INTEGER NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (listing_id, day)
);

CREATE INDEX IF NOT EXISTS "Booking_listingId_status_idx"
  ON "Booking" ("listingId", "status");
CREATE INDEX IF NOT EXISTS "Booking_status_heldUntil_idx"
  ON "Booking" ("status", "heldUntil");
CREATE INDEX IF NOT EXISTS "BookingAuditLog_bookingId_createdAt_idx"
  ON "BookingAuditLog" ("bookingId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_listing_day_inventory_listing_updated
  ON listing_day_inventory (listing_id, updated_at DESC);
`;

export interface Phase09Fixture extends Phase08Fixture {}

export async function createPGlitePhase09Fixture(): Promise<Phase09Fixture> {
  const base = await createPGlitePhase08Fixture();
  const pgExec = (
    base.pg as unknown as { exec: (sql: string) => Promise<void> }
  ).exec.bind(base.pg);

  await pgExec(LEGACY_BOOKING_FIXTURE_SQL);
  await pgExec(fs.readFileSync(PHASE09_MIGRATION, "utf8"));

  return base;
}
