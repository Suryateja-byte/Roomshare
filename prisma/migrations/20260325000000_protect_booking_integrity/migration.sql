-- Migration: protect_booking_integrity
--
-- Prevents listing/user deletion from destroying booking records.
-- Adds CHECK constraints for data integrity.
--
-- Rollback: See rollback SQL at end of file.
-- Data safety: No data modification. FK changes are metadata-only.
--              ALTER COLUMN DROP NOT NULL does not rewrite table on PostgreSQL.
--              CHECK constraints use NOT VALID + VALIDATE (minimal locking).

-- Step 1: Listing FK — CASCADE -> RESTRICT
-- Prevents hosts from deleting listings that have active bookings.
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_listingId_fkey";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 2: Tenant FK — CASCADE -> SET NULL (requires nullable tenantId)
-- Allows tenants to delete their accounts (GDPR) while preserving
-- booking records for the host. Matches BookingAuditLog pattern.
ALTER TABLE "Booking" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_tenantId_fkey";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 3: CHECK constraint on slotsRequested (defense-in-depth)
ALTER TABLE "Booking" ADD CONSTRAINT "booking_slots_requested_positive"
  CHECK ("slotsRequested" >= 1) NOT VALID;
ALTER TABLE "Booking" VALIDATE CONSTRAINT "booking_slots_requested_positive";

ALTER TABLE "Booking" ADD CONSTRAINT "booking_slots_requested_upper_bound"
  CHECK ("slotsRequested" <= 20) NOT VALID;
ALTER TABLE "Booking" VALIDATE CONSTRAINT "booking_slots_requested_upper_bound";

-- Step 4: CHECK constraint on date ordering
ALTER TABLE "Booking" ADD CONSTRAINT "booking_dates_valid"
  CHECK ("startDate" < "endDate") NOT VALID;
ALTER TABLE "Booking" VALIDATE CONSTRAINT "booking_dates_valid";

-- Rollback SQL (run manually if migration needs to be reverted):
-- ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "booking_dates_valid";
-- ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "booking_slots_requested_upper_bound";
-- ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "booking_slots_requested_positive";
-- ALTER TABLE "Booking" DROP CONSTRAINT "Booking_tenantId_fkey";
-- ALTER TABLE "Booking" ADD CONSTRAINT "Booking_tenantId_fkey"
--   FOREIGN KEY ("tenantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- ALTER TABLE "Booking" ALTER COLUMN "tenantId" SET NOT NULL;
-- ALTER TABLE "Booking" DROP CONSTRAINT "Booking_listingId_fkey";
-- ALTER TABLE "Booking" ADD CONSTRAINT "Booking_listingId_fkey"
--   FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
