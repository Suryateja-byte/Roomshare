-- Phase 04: Projection-backed search snapshots and grouped public render payloads.
-- Data-safety: expand-only migration; existing rows remain valid via nullable columns/defaults.
-- Rollback:
--   DROP INDEX IF EXISTS "query_snapshots_snapshot_version_query_hash_created_at_idx";
--   DROP INDEX IF EXISTS "query_snapshots_projection_epoch_idx";
--   ALTER TABLE "query_snapshots"
--     DROP COLUMN IF EXISTS "ordered_unit_keys",
--     DROP COLUMN IF EXISTS "projection_epoch",
--     DROP COLUMN IF EXISTS "unit_identity_epoch_floor",
--     DROP COLUMN IF EXISTS "snapshot_version";
--   ALTER TABLE "unit_public_projection"
--     DROP COLUMN IF EXISTS "representative_inventory_id",
--     DROP COLUMN IF EXISTS "public_point",
--     DROP COLUMN IF EXISTS "public_cell_id",
--     DROP COLUMN IF EXISTS "public_area_name",
--     DROP COLUMN IF EXISTS "display_title",
--     DROP COLUMN IF EXISTS "display_subtitle",
--     DROP COLUMN IF EXISTS "hero_image_url",
--     DROP COLUMN IF EXISTS "payload_version";

ALTER TABLE "unit_public_projection"
  ADD COLUMN IF NOT EXISTS "representative_inventory_id" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "public_point" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "public_cell_id" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "public_area_name" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "display_title" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "display_subtitle" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "hero_image_url" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "payload_version" TEXT NOT NULL DEFAULT 'phase04.v1';

ALTER TABLE "query_snapshots"
  ADD COLUMN IF NOT EXISTS "ordered_unit_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "projection_epoch" BIGINT NULL,
  ADD COLUMN IF NOT EXISTS "unit_identity_epoch_floor" INTEGER NULL,
  ADD COLUMN IF NOT EXISTS "snapshot_version" TEXT NOT NULL DEFAULT 'legacy-listing-v1';

CREATE INDEX IF NOT EXISTS "query_snapshots_projection_epoch_idx"
  ON "query_snapshots" ("projection_epoch");

CREATE INDEX IF NOT EXISTS "query_snapshots_snapshot_version_query_hash_created_at_idx"
  ON "query_snapshots" ("snapshot_version", "query_hash", "created_at");
