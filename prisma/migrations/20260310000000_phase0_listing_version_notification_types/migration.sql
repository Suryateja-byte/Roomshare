-- Phase 0: Listing.version for optimistic locking + NotificationType enum extension
-- Rollback (version): ALTER TABLE "Listing" DROP COLUMN "version"; (reversible)
-- Rollback (enum): IRREVERSIBLE — ALTER TYPE ADD VALUE cannot be undone in PostgreSQL
-- Data safety: Non-destructive. Column has DEFAULT 1. No table lock on PG 11+.

ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_HOLD_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_HOLD_EXPIRED';
