-- =============================================================================
-- Migration: GA embedding HNSW index
-- PURPOSE:
--   Keep ANN search scoped to the GA embedding profile so preview and GA
--   vectors are never compared by the index.
--
-- ROLLBACK:
--   DROP INDEX CONCURRENTLY IF EXISTS idx_search_docs_embedding_ga_hnsw;
-- DATA-SAFETY:
--   Additive index only. CONCURRENTLY avoids blocking writes on live tables.
-- =============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_docs_embedding_ga_hnsw
  ON listing_search_docs
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL
    AND embedding_model = 'gemini-embedding-2.search-result.nosensitive-v1.d768'
    AND embedding_status IN ('COMPLETED', 'PARTIAL');
