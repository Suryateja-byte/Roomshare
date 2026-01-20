-- ============================================================
-- Phase 0: Foundation Migration
-- Goal: Fix idempotency race condition, add version infrastructure
--
-- P0 Correctness Fixes Applied:
-- 1. Existing rows get status='completed' (not 'processing')
-- 2. requestHash uses placeholder for existing rows
-- 3. Key uniqueness scoped to (userId, endpoint, key)
-- ============================================================

-- ============================================================
-- STEP 1: Add status column (nullable first, then backfill)
-- ============================================================
ALTER TABLE "IdempotencyKey" ADD COLUMN "status" TEXT;

-- Existing rows were successful completed operations
UPDATE "IdempotencyKey" SET status = 'completed' WHERE status IS NULL;

-- Now add NOT NULL constraint and CHECK
ALTER TABLE "IdempotencyKey" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "IdempotencyKey" ALTER COLUMN "status" SET DEFAULT 'processing';
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "idempotency_status_check"
  CHECK (status IN ('processing', 'completed'));

-- ============================================================
-- STEP 2: Add requestHash column (with migration placeholder)
-- ============================================================
-- First, clean up expired entries (they shouldn't exist anyway)
DELETE FROM "IdempotencyKey" WHERE "expiresAt" < NOW();

-- Add column with temporary default for any remaining rows
ALTER TABLE "IdempotencyKey" ADD COLUMN "requestHash" TEXT
  NOT NULL DEFAULT 'legacy-migration-placeholder';

-- Remove default so new inserts require explicit hash
ALTER TABLE "IdempotencyKey" ALTER COLUMN "requestHash" DROP DEFAULT;

-- ============================================================
-- STEP 3: Change key uniqueness from global to scoped
-- ============================================================
-- Drop the auto-generated Prisma unique index on just 'key'
DROP INDEX IF EXISTS "IdempotencyKey_key_key";

-- Create new scoped unique index
CREATE UNIQUE INDEX "IdempotencyKey_user_endpoint_key_idx"
  ON "IdempotencyKey"("userId", endpoint, key);

-- ============================================================
-- STEP 4: Add version column to Listing (for stale-tab protection)
-- ============================================================
ALTER TABLE "Listing" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- ============================================================
-- STEP 5: Add index for cleanup cron efficiency
-- ============================================================
-- The existing index on expiresAt is sufficient for cleanup queries
-- Verify it exists, create if not
CREATE INDEX IF NOT EXISTS "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");
