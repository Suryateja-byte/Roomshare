-- Phase 09: Cutover + Retire Booking
--
-- Data-safety note: pre-launch, dummy data only; destructive drop accepted.
-- This migration retires booking-era storage after the contact-first model and
-- projection read path have become canonical for development and staging.

DROP TABLE IF EXISTS "BookingAuditLog" CASCADE;
DROP TABLE IF EXISTS "Booking" CASCADE;
DROP TABLE IF EXISTS listing_day_inventory CASCADE;

ALTER TABLE "Listing"
  DROP COLUMN IF EXISTS "availabilitySource",
  DROP COLUMN IF EXISTS "needsMigrationReview",
  DROP COLUMN IF EXISTS "booking_mode",
  DROP COLUMN IF EXISTS "hold_ttl_minutes";

DROP TYPE IF EXISTS "BookingStatus" CASCADE;
DROP TYPE IF EXISTS "ListingAvailabilitySource" CASCADE;
