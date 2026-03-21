-- CreateIndex (non-blocking)
-- Supports cron sweep-expired-holds: WHERE status='HELD' AND heldUntil <= NOW() ORDER BY heldUntil ASC
-- Rollback: DROP INDEX CONCURRENTLY "Booking_status_heldUntil_idx";
-- Data-safety: CREATE INDEX CONCURRENTLY does not lock writes; safe for production.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Booking_status_heldUntil_idx" ON "Booking" ("status", "heldUntil");
