-- Phase 01: canonical identity foundation tables
--
-- Rollback:
--   DROP TABLE IF EXISTS "audit_events" CASCADE;
--   DROP TABLE IF EXISTS "cache_invalidations" CASCADE;
--   DROP TABLE IF EXISTS "outbox_events" CASCADE;
--   DROP TABLE IF EXISTS "identity_mutations" CASCADE;
--   DROP TABLE IF EXISTS "listing_inventories" CASCADE;
--   DROP TABLE IF EXISTS "host_unit_claims" CASCADE;
--   DROP TABLE IF EXISTS "physical_units" CASCADE;
--
-- Data safety:
-- - All tables are additive and created empty.
-- - No existing read-path table is rewritten.
-- - No backfill runs in this migration.

CREATE TABLE "physical_units" (
  id TEXT PRIMARY KEY,
  unit_identity_epoch INTEGER NOT NULL DEFAULT 1,
  canonical_address_hash TEXT NOT NULL,
  canonical_unit TEXT NOT NULL DEFAULT '_none_',
  canonicalizer_version TEXT NOT NULL,
  privacy_version INTEGER NOT NULL DEFAULT 1,
  geocode_status TEXT NOT NULL DEFAULT 'PENDING',
  lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE',
  publish_status TEXT NOT NULL DEFAULT 'DRAFT',
  supersedes_unit_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  superseded_by_unit_id TEXT NULL,
  source_version BIGINT NOT NULL DEFAULT 1,
  row_version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "physical_units_canonical_unique_idx"
  ON "physical_units" (canonical_address_hash, canonical_unit);

CREATE INDEX "physical_units_lifecycle_status_idx"
  ON "physical_units" (lifecycle_status);

CREATE INDEX "physical_units_publish_status_idx"
  ON "physical_units" (publish_status);

CREATE TABLE "host_unit_claims" (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES "physical_units"(id) ON DELETE CASCADE,
  host_user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  claim_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  unit_identity_epoch_written_at INTEGER NOT NULL,
  source_version BIGINT NOT NULL DEFAULT 1,
  row_version BIGINT NOT NULL DEFAULT 1,
  lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE',
  publish_status TEXT NOT NULL DEFAULT 'DRAFT',
  privacy_version INTEGER NOT NULL DEFAULT 1,
  canonical_address_hash TEXT NOT NULL,
  canonicalizer_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "host_unit_claims_unit_id_host_user_id_key"
    UNIQUE (unit_id, host_user_id)
);

CREATE TABLE "listing_inventories" (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES "physical_units"(id) ON DELETE CASCADE,
  unit_identity_epoch_written_at INTEGER NOT NULL,
  inventory_key TEXT NOT NULL,
  room_category TEXT NOT NULL CHECK (room_category IN ('ENTIRE_PLACE', 'PRIVATE_ROOM', 'SHARED_ROOM')),
  space_label TEXT NULL,
  capacity_guests INTEGER NULL,
  total_beds INTEGER NULL,
  open_beds INTEGER NULL,
  available_from DATE NOT NULL,
  available_until DATE NULL,
  availability_range TSTZRANGE NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  lease_min_months INTEGER NULL,
  lease_max_months INTEGER NULL,
  lease_negotiable BOOLEAN NOT NULL DEFAULT FALSE,
  gender_preference TEXT NULL,
  household_gender TEXT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE',
  publish_status TEXT NOT NULL DEFAULT 'DRAFT',
  source_version BIGINT NOT NULL DEFAULT 1,
  row_version BIGINT NOT NULL DEFAULT 1,
  last_published_version BIGINT NULL,
  last_embedded_version TEXT NULL,
  canonicalizer_version TEXT NOT NULL,
  canonical_address_hash TEXT NOT NULL,
  privacy_version INTEGER NOT NULL DEFAULT 1,
  supersedes_unit_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  superseded_by_unit_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "listing_inventories_unit_id_inventory_key_key"
    UNIQUE (unit_id, inventory_key)
);

ALTER TABLE "listing_inventories"
  ADD CONSTRAINT "inventory_category_entire_place_shape"
  CHECK (
    room_category <> 'ENTIRE_PLACE'
    OR (
      capacity_guests IS NOT NULL
      AND available_from IS NOT NULL
      AND availability_range IS NOT NULL
      AND price IS NOT NULL
      AND total_beds IS NULL
      AND open_beds IS NULL
      AND gender_preference IS NULL
      AND household_gender IS NULL
    )
  ) NOT VALID;

ALTER TABLE "listing_inventories"
  VALIDATE CONSTRAINT "inventory_category_entire_place_shape";

ALTER TABLE "listing_inventories"
  ADD CONSTRAINT "inventory_category_private_room_shape"
  CHECK (
    room_category <> 'PRIVATE_ROOM'
    OR (
      capacity_guests IS NOT NULL
      AND available_from IS NOT NULL
      AND availability_range IS NOT NULL
      AND price IS NOT NULL
      AND total_beds IS NULL
      AND open_beds IS NULL
    )
  ) NOT VALID;

ALTER TABLE "listing_inventories"
  VALIDATE CONSTRAINT "inventory_category_private_room_shape";

ALTER TABLE "listing_inventories"
  ADD CONSTRAINT "inventory_category_shared_room_shape"
  CHECK (
    room_category <> 'SHARED_ROOM'
    OR (
      total_beds IS NOT NULL
      AND open_beds IS NOT NULL
      AND open_beds <= total_beds
      AND available_from IS NOT NULL
      AND availability_range IS NOT NULL
      AND price IS NOT NULL
      AND capacity_guests IS NULL
    )
  ) NOT VALID;

ALTER TABLE "listing_inventories"
  VALIDATE CONSTRAINT "inventory_category_shared_room_shape";

CREATE TABLE "identity_mutations" (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('MERGE', 'SPLIT', 'CANONICALIZER_UPGRADE', 'MANUAL_MODERATION')),
  from_unit_ids TEXT[] NOT NULL,
  to_unit_ids TEXT[] NOT NULL,
  reason_code TEXT NOT NULL,
  operator_id TEXT NULL REFERENCES "User"(id) ON DELETE SET NULL,
  resulting_epoch INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "outbox_events" (
  id TEXT PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  source_version BIGINT NOT NULL,
  unit_identity_epoch INTEGER NOT NULL,
  priority SMALLINT NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT NULL,
  dlq_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "outbox_events_pending_idx"
  ON "outbox_events" (status, priority, next_attempt_at)
  WHERE status IN ('PENDING', 'IN_FLIGHT');

CREATE INDEX "outbox_events_aggregate_idx"
  ON "outbox_events" (aggregate_type, aggregate_id, source_version);

CREATE INDEX "outbox_events_dlq_idx"
  ON "outbox_events" (status, created_at)
  WHERE status = 'DLQ';

CREATE TABLE "cache_invalidations" (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL,
  projection_epoch BIGINT NOT NULL,
  unit_identity_epoch INTEGER NOT NULL,
  reason TEXT NOT NULL,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ NULL,
  consumed_by TEXT NULL
);

CREATE INDEX "cache_invalidations_pending_idx"
  ON "cache_invalidations" (consumed_at)
  WHERE consumed_at IS NULL;

CREATE INDEX "cache_invalidations_unit_enqueued_idx"
  ON "cache_invalidations" (unit_id, enqueued_at DESC);

CREATE TABLE "audit_events" (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  actor_id TEXT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id TEXT NULL,
  unit_identity_epoch INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "audit_events_aggregate_idx"
  ON "audit_events" (aggregate_type, aggregate_id, created_at DESC);

CREATE INDEX "audit_events_kind_idx"
  ON "audit_events" (kind, created_at DESC);

CREATE INDEX "audit_events_actor_idx"
  ON "audit_events" (actor_id, created_at DESC);
