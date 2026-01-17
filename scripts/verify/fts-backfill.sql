-- ============================================================
-- FTS Backfill Verification Script
-- Purpose: Verify search_tsv column is populated for all rows
--
-- Run: psql $DATABASE_URL -f scripts/verify/fts-backfill.sql
-- Expected: null_count = 0 (all rows have search_tsv populated)
-- ============================================================

-- Summary statistics
SELECT
  COUNT(*) FILTER (WHERE search_tsv IS NULL) AS null_count,
  COUNT(*) AS total_rows,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE search_tsv IS NOT NULL) / NULLIF(COUNT(*), 0),
    2
  ) AS pct_populated
FROM listing_search_docs;

-- Sample rows with NULL search_tsv (should be empty after migration)
SELECT id, title, city, state
FROM listing_search_docs
WHERE search_tsv IS NULL
LIMIT 5;

-- Verify trigger is working by checking recently updated rows
SELECT id, title, doc_updated_at, search_tsv IS NOT NULL AS has_tsv
FROM listing_search_docs
ORDER BY doc_updated_at DESC
LIMIT 5;
