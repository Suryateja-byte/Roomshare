-- Composite partial index for the base filter every search query uses.
-- Covers: status = 'ACTIVE' AND available_slots > 0, with price for range filters and sorting.
-- This replaces sequential scans on the individual status + available_slots indexes.
--
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS search_doc_active_available_price_idx;
-- Data safety: CREATE INDEX CONCURRENTLY is non-blocking; no table locks, no downtime.

CREATE INDEX CONCURRENTLY IF NOT EXISTS search_doc_active_available_price_idx
  ON "listing_search_docs" ("price", "listing_created_at" DESC)
  WHERE "status" = 'ACTIVE' AND "available_slots" > 0;
