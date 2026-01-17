-- ============================================================
-- FTS EXPLAIN Verification Script
-- Purpose: Verify GIN index is used for full-text search queries
--
-- Run: psql $DATABASE_URL -f scripts/verify/fts-explain.sql
-- Expected: "Bitmap Index Scan on search_doc_tsv_gin_idx"
-- NOT Expected: "Seq Scan on listing_search_docs"
--
-- IMPORTANT: Run on LOCAL DEV DB with seeded data only.
-- Never run on production databases.
--
-- Note: These use EXPLAIN without ANALYZE for safety (no execution).
-- Add ANALYZE only on local dev if you need actual timing data.
-- ============================================================

-- Basic FTS query plan (safe: does not execute)
EXPLAIN (BUFFERS, FORMAT TEXT)
SELECT id, title
FROM listing_search_docs
WHERE search_tsv @@ plainto_tsquery('english', 'downtown apartment')
ORDER BY recommended_score DESC
LIMIT 20;

-- FTS with ts_rank_cd ranking
EXPLAIN (BUFFERS, FORMAT TEXT)
SELECT id, title,
       ts_rank_cd(search_tsv, plainto_tsquery('english', 'downtown apartment')) AS rank
FROM listing_search_docs
WHERE search_tsv @@ plainto_tsquery('english', 'downtown apartment')
ORDER BY recommended_score DESC,
         ts_rank_cd(search_tsv, plainto_tsquery('english', 'downtown apartment')) DESC,
         listing_created_at DESC,
         id ASC
LIMIT 20;

-- Verify index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'listing_search_docs'
  AND indexname = 'search_doc_tsv_gin_idx';

-- Verify trigger exists and is column-specific
SELECT pg_get_triggerdef(oid) AS trigger_definition
FROM pg_trigger
WHERE tgrelid = 'listing_search_docs'::regclass
  AND tgname = 'search_doc_tsv_trigger';
