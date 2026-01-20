-- Keyset pagination index for recommended sort (most common)
-- Enables stable cursor-based pagination that prevents result drift
-- when inventory changes while users scroll through results.
--
-- Covers ORDER BY: recommended_score DESC, listing_created_at DESC, id ASC
--
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS search_doc_keyset_recommended;
-- Data-safety: Non-blocking index creation, no locks on existing rows.

CREATE INDEX CONCURRENTLY IF NOT EXISTS search_doc_keyset_recommended
  ON listing_search_docs (recommended_score DESC, listing_created_at DESC, id);
