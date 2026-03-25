-- H-2: Preserve BookingAuditLog on user/booking deletion
-- Changes BookingAuditLog.bookingId FK from CASCADE to SET NULL.
-- Audit trail survives user deletion (User -> Booking cascade -> BookingAuditLog.bookingId set to NULL).
-- Data safety: No data loss. No table rewrite. Zero downtime.
-- Rollback: ALTER TABLE "BookingAuditLog" ALTER COLUMN "bookingId" SET NOT NULL;
--           ALTER TABLE "BookingAuditLog" DROP CONSTRAINT "BookingAuditLog_bookingId_fkey";
--           ALTER TABLE "BookingAuditLog" ADD CONSTRAINT "BookingAuditLog_bookingId_fkey"
--             FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingAuditLog" ALTER COLUMN "bookingId" DROP NOT NULL;

ALTER TABLE "BookingAuditLog" DROP CONSTRAINT "BookingAuditLog_bookingId_fkey";
ALTER TABLE "BookingAuditLog" ADD CONSTRAINT "BookingAuditLog_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
