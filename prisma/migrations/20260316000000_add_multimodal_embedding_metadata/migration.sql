-- =============================================================================
-- Migration: Add multimodal embedding metadata to listing_search_docs
-- PURPOSE: Track which model generated embeddings and detect image changes
--          for the multimodal image embedding feature.
--
-- ROLLBACK:
--   ALTER TABLE listing_search_docs DROP COLUMN IF EXISTS embedding_model;
--   ALTER TABLE listing_search_docs DROP COLUMN IF EXISTS embedding_image_hash;
--   ALTER TABLE listing_search_docs DROP COLUMN IF EXISTS embedding_image_count;
--
-- DATA-SAFETY: Additive only. ADD COLUMN with defaults is instant on PG 11+
--   (no table rewrite, no lock). No backfill required — new columns default
--   to NULL / 0.
-- =============================================================================

-- Track which model generated the current embedding (for migration auditing)
ALTER TABLE listing_search_docs
  ADD COLUMN IF NOT EXISTS embedding_model TEXT;

-- MD5 hash of sorted image URL list — for change detection without storing full URLs
ALTER TABLE listing_search_docs
  ADD COLUMN IF NOT EXISTS embedding_image_hash TEXT;

-- How many images were embedded (0 = text-only, 1-5 = multimodal)
ALTER TABLE listing_search_docs
  ADD COLUMN IF NOT EXISTS embedding_image_count SMALLINT DEFAULT 0;

-- Update CHECK constraint to include PARTIAL status
-- (graceful degradation: some images failed but text + remaining images succeeded)
ALTER TABLE listing_search_docs
  DROP CONSTRAINT IF EXISTS search_doc_embedding_status_check;

ALTER TABLE listing_search_docs
  ADD CONSTRAINT search_doc_embedding_status_check
  CHECK (embedding_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED'))
  NOT VALID;

ALTER TABLE listing_search_docs
  VALIDATE CONSTRAINT search_doc_embedding_status_check;
