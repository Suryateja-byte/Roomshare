-- Convert price from DOUBLE PRECISION to DECIMAL(10,2) for exact monetary arithmetic
-- Aligns listing_search_docs.price with Listing.price (converted in 20260216000000_float_to_decimal)
--
-- Rollback: ALTER TABLE "listing_search_docs" ALTER COLUMN "price" TYPE DOUBLE PRECISION;
-- Data safety: USING clause ensures safe cast of existing data; no data loss expected
-- Risk: Low — non-destructive type narrowing on denormalized read model
ALTER TABLE "listing_search_docs" ALTER COLUMN "price" TYPE DECIMAL(10,2) USING price::DECIMAL(10,2);
