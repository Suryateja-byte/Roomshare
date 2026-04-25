-- Add nullable column
ALTER TABLE "Listing" ADD COLUMN "normalizedAddress" TEXT;

-- Partial index: only ACTIVE/PAUSED rows participate in collision detection.
-- CONCURRENTLY cannot run inside a transaction; Prisma wraps migrations
-- in a transaction by default, so we use a non-CONCURRENT index here.
-- For large tables on live prod, coordinator may prefer to split this
-- into (a) empty migration for column + (b) manual CREATE INDEX CONCURRENTLY.
-- See "Staging run notes" in the migration's README.md.
CREATE INDEX "Listing_owner_normalized_address_idx"
  ON "Listing" ("ownerId", "normalizedAddress")
  WHERE status IN ('ACTIVE', 'PAUSED');
