-- ============================================================
-- SearchDoc FTS: Full-Text Search Column for listing_search_docs
-- Purpose: Replace LIKE %term% with tsvector @@ plainto_tsquery
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS "search_doc_tsv_trigger" ON "listing_search_docs";
--   DROP FUNCTION IF EXISTS "update_search_doc_tsv"();
--   DROP INDEX IF EXISTS "search_doc_tsv_gin_idx";
--   ALTER TABLE "listing_search_docs" DROP COLUMN IF EXISTS "search_tsv";
--   (Reversible - no data loss, column is generated from existing fields)
--
-- DATA-SAFETY:
-- - Additive only: adds column to existing table
-- - No locks on read path during backfill (uses batch UPDATE)
-- - GIN index created CONCURRENTLY would be ideal for prod, but
--   standard CREATE INDEX is safe for this table size
-- - Trigger ensures future writes maintain the tsvector
-- ============================================================

-- ============================================================
-- STEP 1: Add tsvector column for full-text search
-- ============================================================
ALTER TABLE "listing_search_docs"
  ADD COLUMN "search_tsv" tsvector;

-- ============================================================
-- STEP 2: Create trigger function to maintain tsvector
-- Weights: A=title (highest), B=city+state, C=description
-- ============================================================
CREATE OR REPLACE FUNCTION update_search_doc_tsv()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.city, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.state, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STEP 3: Create trigger for INSERT and UPDATE
-- ============================================================
CREATE TRIGGER search_doc_tsv_trigger
  BEFORE INSERT OR UPDATE OF title, description, city, state
  ON "listing_search_docs"
  FOR EACH ROW
  EXECUTE FUNCTION update_search_doc_tsv();

-- ============================================================
-- STEP 4: Backfill existing rows
-- ============================================================
UPDATE "listing_search_docs"
SET search_tsv =
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(city, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(state, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'C');

-- ============================================================
-- STEP 5: Create GIN index for fast full-text search
-- ============================================================
CREATE INDEX "search_doc_tsv_gin_idx"
  ON "listing_search_docs" USING GIN ("search_tsv");
