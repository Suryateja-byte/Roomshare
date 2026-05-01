-- =============================================================================
-- Migration: GA embedding model/status lookup index
-- PURPOSE:
--   Support embedding-version and status filters used before semantic ranking.
--
-- ROLLBACK:
--   DROP INDEX CONCURRENTLY IF EXISTS idx_search_docs_embedding_model_status;
-- DATA-SAFETY:
--   Additive index only. CONCURRENTLY avoids blocking writes on live tables.
-- =============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_docs_embedding_model_status
  ON listing_search_docs (embedding_model, embedding_status)
  WHERE embedding IS NOT NULL;
