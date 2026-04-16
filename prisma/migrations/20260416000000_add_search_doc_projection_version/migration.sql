-- Migration: add_search_doc_projection_version
--
-- CFM-405a: Version-aware dirty-doc tracking.
--
-- Adds two integer columns to listing_search_docs that let the cron refresh
-- detect divergence by comparing listing.version to the doc's source_version,
-- and detect projection-shape drift by comparing a dedicated projection_version
-- to a code constant (SEARCH_DOC_PROJECTION_VERSION).
--
-- Rollback (reversible, no data loss):
--   ALTER TABLE listing_search_docs
--     DROP COLUMN IF EXISTS projection_version,
--     DROP COLUMN IF EXISTS source_version;
--
-- Data safety:
-- - Both columns are additive (NOT NULL with constant default 0).
-- - On PostgreSQL 11+, ADD COLUMN ... DEFAULT <constant> is O(1) (catalog-only);
--   no table rewrite, no long exclusive lock on large tables.
-- - No RLS implications (no policies reference these columns).
-- - Existing rows get source_version=0 and projection_version=0, which are
--   sentinel "unknown" values. The cron treats (source_version=0 && listing.version>0)
--   as a divergence and repairs it on the next pass — same as the existing
--   temporal divergence behavior.
-- - No foreign keys added, no constraints beyond NOT NULL.
-- - Index on (projection_version) or (source_version) is deliberately not added;
--   projection-version divergence is a rare, transient signal and existing marked_at
--   ordering on listing_search_doc_dirty is sufficient for cron throughput. Add in a
--   follow-up if monitoring shows need.

ALTER TABLE "listing_search_docs"
  ADD COLUMN "projection_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "source_version" INTEGER NOT NULL DEFAULT 0;
