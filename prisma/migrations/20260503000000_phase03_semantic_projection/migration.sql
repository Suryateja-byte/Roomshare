-- Phase 03: Semantic projection table for dark, versioned embedding builds
-- Data-safety: additive only. Phase 03 does not cut live reads to this table.
-- Rollback: DROP TABLE semantic_inventory_projection CASCADE;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "semantic_inventory_projection" (
  "id"                     TEXT          NOT NULL,
  "inventory_id"           TEXT          NOT NULL,
  "unit_id"                TEXT          NOT NULL,
  "unit_identity_epoch"    INTEGER       NOT NULL,
  "embedding_version"      TEXT          NOT NULL,
  "sanitized_content_hash" TEXT          NOT NULL,
  "embedding"              vector(768)   NOT NULL,
  "coarse_filter_attrs"    JSONB         NOT NULL DEFAULT '{}'::JSONB,
  "publish_status"         TEXT          NOT NULL DEFAULT 'SHADOW',
  "source_version"         BIGINT        NOT NULL,
  "projection_epoch"       BIGINT        NOT NULL,
  "last_built_at"          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "published_at"           TIMESTAMPTZ   NULL,
  "tombstoned_at"          TIMESTAMPTZ   NULL,
  "created_at"             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "semantic_inventory_projection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "semantic_inventory_projection_inventory_version_idx"
  ON "semantic_inventory_projection" ("inventory_id", "embedding_version");

CREATE INDEX "semantic_inventory_projection_version_status_idx"
  ON "semantic_inventory_projection" ("embedding_version", "publish_status");

CREATE INDEX "semantic_inventory_projection_unit_version_status_idx"
  ON "semantic_inventory_projection" ("unit_id", "embedding_version", "publish_status");

CREATE INDEX "semantic_inventory_projection_source_version_idx"
  ON "semantic_inventory_projection" ("source_version");

ALTER TABLE "semantic_inventory_projection"
  ADD CONSTRAINT "semantic_inventory_projection_publish_status_chk"
  CHECK ("publish_status" IN (
    'BUILDING', 'SHADOW', 'PUBLISHED', 'STALE_PUBLISHED', 'TOMBSTONED', 'FAILED'
  ))
  NOT VALID;

ALTER TABLE "semantic_inventory_projection"
  VALIDATE CONSTRAINT "semantic_inventory_projection_publish_status_chk";
