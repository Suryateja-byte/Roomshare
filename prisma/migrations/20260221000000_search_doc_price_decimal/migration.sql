-- ============================================================
-- SearchDoc Price Column: DOUBLE PRECISION -> DECIMAL(10,2)
--
-- The Listing.price was migrated to DECIMAL(10,2) in 20260216000000_float_to_decimal
-- but the denormalized listing_search_docs.price was missed and still uses
-- DOUBLE PRECISION, causing floating-point precision artifacts (e.g. 1199.9900000000002).
--
-- Rollback: ALTER TABLE "listing_search_docs" ALTER COLUMN "price" TYPE DOUBLE PRECISION;
-- Data-safety: Non-destructive type change. ROUND ensures no precision artifacts.
--   No locking risk — listing_search_docs is a denormalized read table that can tolerate
--   brief locks. For very large datasets, run during low traffic.
-- ============================================================

ALTER TABLE "listing_search_docs"
  ALTER COLUMN "price" TYPE DECIMAL(10,2) USING ROUND("price"::numeric, 2);
