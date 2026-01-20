-- Keyset pagination index for newest sort
-- Enables stable cursor-based pagination for listing_created_at DESC queries.
--
-- Covers ORDER BY: listing_created_at DESC, id ASC
--
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS search_doc_keyset_newest;
-- Data-safety: Non-blocking index creation, no locks on existing rows.

CREATE INDEX CONCURRENTLY IF NOT EXISTS search_doc_keyset_newest
  ON listing_search_docs (listing_created_at DESC, id);
