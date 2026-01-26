-- Functional indexes for case-insensitive room_type and lease_duration filters
-- These allow the existing LOWER() queries to use index scans instead of sequential scans
--
-- Note: Using regular CREATE INDEX (not CONCURRENTLY) because Prisma migrations
-- run in transactions. For large production tables, consider running with
-- CONCURRENTLY outside of the migration transaction.

-- Functional index for case-insensitive room_type filter
CREATE INDEX "search_doc_room_type_lower_idx"
  ON "listing_search_docs" (LOWER("room_type"))
  WHERE "room_type" IS NOT NULL;

-- Functional index for case-insensitive lease_duration filter
CREATE INDEX "search_doc_lease_duration_lower_idx"
  ON "listing_search_docs" (LOWER("lease_duration"))
  WHERE "lease_duration" IS NOT NULL;
