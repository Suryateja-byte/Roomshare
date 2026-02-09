-- ============================================================
-- SearchDoc Gender Columns: Add gender_preference + household_gender
-- Purpose: Support gender-based filtering in facets API
--
-- ROLLBACK:
--   ALTER TABLE "listing_search_docs" DROP COLUMN IF EXISTS "gender_preference";
--   ALTER TABLE "listing_search_docs" DROP COLUMN IF EXISTS "household_gender";
--   (Reversible - no data loss, nullable columns)
--
-- DATA-SAFETY:
-- - Additive only: adds nullable columns to existing table
-- - No locks on read path
-- - No backfill required (nullable columns default to NULL)
-- ============================================================

ALTER TABLE "listing_search_docs"
  ADD COLUMN IF NOT EXISTS "gender_preference" TEXT,
  ADD COLUMN IF NOT EXISTS "household_gender" TEXT;
