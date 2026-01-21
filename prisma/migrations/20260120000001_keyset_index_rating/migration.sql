-- Keyset pagination index for rating sort
-- Enables stable cursor-based pagination for rating-sorted queries.
--
-- Covers ORDER BY: avg_rating DESC, review_count DESC, listing_created_at DESC, id
--
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS search_doc_keyset_rating;
-- Data-safety: Non-blocking index creation, no locks on existing rows.

CREATE INDEX CONCURRENTLY IF NOT EXISTS search_doc_keyset_rating
  ON listing_search_docs (avg_rating DESC NULLS LAST, review_count DESC, listing_created_at DESC, id);
