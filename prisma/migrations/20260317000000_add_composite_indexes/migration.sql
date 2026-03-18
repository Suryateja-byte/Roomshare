-- Rollback: DROP INDEX IF EXISTS "Listing_status_createdAt_idx";
-- Rollback: DROP INDEX IF EXISTS "Listing_status_price_idx";
-- Rollback: DROP INDEX IF EXISTS "SavedListing_listingId_idx";
-- Data safety: Non-destructive (CREATE INDEX only). SHARE lock during creation — milliseconds for small tables.
-- For large tables (>100K rows): replace with CREATE INDEX CONCURRENTLY in raw SQL.

-- CreateIndex
CREATE INDEX "Listing_status_createdAt_idx" ON "Listing"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_status_price_idx" ON "Listing"("status", "price");

-- CreateIndex
CREATE INDEX "SavedListing_listingId_idx" ON "SavedListing"("listingId");
