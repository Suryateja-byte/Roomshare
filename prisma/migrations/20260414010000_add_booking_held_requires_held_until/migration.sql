-- Enforce the HELD booking invariant at the database layer.
--
-- Rollback:
--   ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "booking_held_requires_held_until";
--
-- Data safety:
-- - Uses NOT VALID so PostgreSQL does not scan the whole Booking table on add.
-- - The constraint still applies to all new writes immediately.
-- - Existing violations, if any, must be repaired before validation.
--
-- Rollout:
-- 1. Deploy this migration first.
-- 2. Run the audit/repair steps in manual_audit_and_repair.sql.
-- 3. After the audit returns zero bad rows, run the deferred validation SQL as a
--    separate migration/release step.

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_held_requires_held_until"
  CHECK (
    status <> 'HELD'::"BookingStatus"
    OR "heldUntil" IS NOT NULL
  ) NOT VALID;
