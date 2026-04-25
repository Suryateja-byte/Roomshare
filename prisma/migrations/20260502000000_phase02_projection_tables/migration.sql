-- Phase 02: Projection tables for inventory search and unit public data
-- Data-safety: empty tables (pre-launch), no backfill needed
-- Rollback: DROP TABLE unit_public_projection CASCADE; DROP TABLE inventory_search_projection CASCADE;

-- ───────────────────────────────────────────────────────────────────────────────
-- 1. inventory_search_projection
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE "inventory_search_projection" (
  "id"                              TEXT          NOT NULL,
  "inventory_id"                    TEXT          NOT NULL,
  "unit_id"                         TEXT          NOT NULL,
  "unit_identity_epoch_written_at"  INTEGER       NOT NULL,
  "room_category"                   TEXT          NOT NULL,
  "capacity_guests"                 INTEGER       NULL,
  "total_beds"                      INTEGER       NULL,
  "open_beds"                       INTEGER       NULL,
  "price"                           NUMERIC(10,2) NOT NULL,
  "available_from"                  DATE          NOT NULL,
  "available_until"                 DATE          NULL,
  "availability_range"              TSTZRANGE     NOT NULL,
  "lease_min_months"                INTEGER       NULL,
  "lease_max_months"                INTEGER       NULL,
  "lease_negotiable"                BOOLEAN       NOT NULL DEFAULT FALSE,
  "gender_preference"               TEXT          NULL,
  "household_gender"                TEXT          NULL,
  "public_point"                    TEXT          NULL,
  "public_cell_id"                  TEXT          NULL,
  "public_area_name"                TEXT          NULL,
  "publish_status"                  TEXT          NOT NULL DEFAULT 'PENDING_PROJECTION',
  "source_version"                  BIGINT        NOT NULL,
  "projection_epoch"                BIGINT        NOT NULL,
  "created_at"                      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"                      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "inventory_search_projection_pkey" PRIMARY KEY ("id")
);

-- Unique: one projection row per inventory
CREATE UNIQUE INDEX "inventory_search_projection_inventory_unique_idx"
  ON "inventory_search_projection" ("inventory_id");

-- Composite index for unit-scoped queries
CREATE INDEX "inventory_search_projection_unit_epoch_status_idx"
  ON "inventory_search_projection" ("unit_id", "unit_identity_epoch_written_at", "publish_status");

-- Index supporting source_version-ordered idempotent rebuild WHERE clause
CREATE INDEX "inventory_search_projection_publish_status_source_version_idx"
  ON "inventory_search_projection" ("publish_status", "source_version");

-- publish_status CHECK constraint (NOT VALID → then validate so existing rows aren't blocked)
ALTER TABLE "inventory_search_projection"
  ADD CONSTRAINT "inventory_search_projection_publish_status_chk"
  CHECK ("publish_status" IN (
    'DRAFT', 'PENDING_GEOCODE', 'PENDING_PROJECTION', 'PENDING_EMBEDDING',
    'PUBLISHED', 'STALE_PUBLISHED', 'PAUSED', 'SUPPRESSED', 'ARCHIVED'
  ))
  NOT VALID;

ALTER TABLE "inventory_search_projection"
  VALIDATE CONSTRAINT "inventory_search_projection_publish_status_chk";

-- ───────────────────────────────────────────────────────────────────────────────
-- 2. unit_public_projection
-- ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE "unit_public_projection" (
  "unit_id"                   TEXT          NOT NULL,
  "unit_identity_epoch"       INTEGER       NOT NULL,
  "from_price"                NUMERIC(10,2) NULL,
  "room_categories"           TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
  "earliest_available_from"   DATE          NULL,
  "matching_inventory_count"  INTEGER       NOT NULL DEFAULT 0,
  "coarse_availability_badges" TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "source_version"            BIGINT        NOT NULL,
  "projection_epoch"          BIGINT        NOT NULL,
  "created_at"                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Primary lookup key: (unit_id, unit_identity_epoch)
CREATE UNIQUE INDEX "unit_public_projection_unit_epoch_idx"
  ON "unit_public_projection" ("unit_id", "unit_identity_epoch");
