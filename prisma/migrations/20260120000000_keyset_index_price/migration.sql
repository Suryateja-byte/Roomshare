-- Keyset pagination indexes for price sort (ascending and descending)
-- Enables stable cursor-based pagination for price-sorted queries.
--
-- Covers ORDER BY: price ASC/DESC, listing_created_at DESC, id
--
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS search_doc_keyset_price_asc;
--           DROP INDEX CONCURRENTLY IF EXISTS search_doc_keyset_price_desc;
-- Data-safety: Non-blocking index creation, no locks on existing rows.

-- Price ascending (cheapest first)
CREATE INDEX CONCURRENTLY IF NOT EXISTS search_doc_keyset_price_asc
  ON listing_search_docs (price ASC NULLS LAST, listing_created_at DESC, id);

-- Price descending (most expensive first)
CREATE INDEX CONCURRENTLY IF NOT EXISTS search_doc_keyset_price_desc
  ON listing_search_docs (price DESC NULLS LAST, listing_created_at DESC, id);
