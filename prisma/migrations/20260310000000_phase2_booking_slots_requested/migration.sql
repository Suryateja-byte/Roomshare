-- Phase 2: Add slotsRequested to Booking for multi-slot bookings
-- Rollback: ALTER TABLE "Booking" DROP COLUMN "slotsRequested"; (reversible, data-loss on column)
-- Data safety: Non-destructive. Column has DEFAULT 1. No table lock on PG 11+.

ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "slotsRequested" INTEGER NOT NULL DEFAULT 1;
