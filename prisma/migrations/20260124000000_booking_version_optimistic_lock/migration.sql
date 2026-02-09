-- P0-04 FIX: Add version column for optimistic locking
-- This enables race-safe booking status updates by detecting concurrent modifications

-- Add version column with default value of 1 for existing rows
-- Safe: Non-locking ALTER, backward compatible (new column with default)
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- Rollback: ALTER TABLE "Booking" DROP COLUMN "version";
-- Data Safety: Non-destructive, adds column with sensible default
