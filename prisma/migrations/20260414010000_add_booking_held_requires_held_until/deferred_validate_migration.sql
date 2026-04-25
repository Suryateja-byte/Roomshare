-- Deferred follow-up for booking_held_requires_held_until.
--
-- Convert this into its own Prisma migration directory after the
-- manual_audit_and_repair.sql audit returns zero bad rows in the target
-- environment.
--
-- This is intentionally checked in as a sidecar SQL file instead of a live
-- Prisma migration directory because deploy workflows run `prisma migrate
-- deploy`, which would otherwise auto-apply validation immediately after the
-- NOT VALID add migration.

ALTER TABLE "Booking"
  VALIDATE CONSTRAINT "booking_held_requires_held_until";
