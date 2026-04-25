-- Phase 02: Add publish_status CHECK constraint to listing_inventories
-- Uses NOT VALID + VALIDATE pattern: existing rows are not scanned during ADD CONSTRAINT,
-- then VALIDATE scans existing rows (all dummy/test data, so instant).
-- Rollback: ALTER TABLE listing_inventories DROP CONSTRAINT listing_inventories_publish_status_chk;

ALTER TABLE "listing_inventories"
  ADD CONSTRAINT "listing_inventories_publish_status_chk"
  CHECK ("publish_status" IN (
    'DRAFT',
    'PENDING_GEOCODE',
    'PENDING_PROJECTION',
    'PENDING_EMBEDDING',
    'PUBLISHED',
    'STALE_PUBLISHED',
    'PAUSED',
    'SUPPRESSED',
    'ARCHIVED'
  ))
  NOT VALID;

ALTER TABLE "listing_inventories"
  VALIDATE CONSTRAINT "listing_inventories_publish_status_chk";
