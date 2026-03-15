-- =============================================================================
-- Migration: HNSW index for semantic search (non-transactional)
-- PURPOSE: CREATE INDEX CONCURRENTLY cannot run inside a transaction.
--   Prisma migrations run in transactions by default, so this must be separate.
-- ROLLBACK: DROP INDEX CONCURRENTLY IF EXISTS idx_search_docs_embedding_hnsw;
-- DATA-SAFETY: CONCURRENTLY does not block reads or writes.
--   At <10K rows, build time is seconds.
-- =============================================================================

-- NOTE: This migration uses CREATE INDEX CONCURRENTLY which cannot run
-- inside a transaction. Prisma's migrate deploy may fail on this file.
-- If so, apply manually: psql -d roomshare -f this_file.sql
-- Then mark as applied: npx prisma migrate resolve --applied 20260314000001_add_embedding_hnsw_index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_docs_embedding_hnsw
  ON listing_search_docs
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
