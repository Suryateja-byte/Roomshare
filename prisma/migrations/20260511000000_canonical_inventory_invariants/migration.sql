-- Canonical inventory invariant hardening.
--
-- Rollback:
--   ALTER TABLE "listing_inventories" DROP CONSTRAINT IF EXISTS "listing_inventories_price_positive_chk";
--   ALTER TABLE "listing_inventories" DROP CONSTRAINT IF EXISTS "listing_inventories_capacity_guests_positive_chk";
--   ALTER TABLE "listing_inventories" DROP CONSTRAINT IF EXISTS "listing_inventories_total_beds_positive_chk";
--   ALTER TABLE "listing_inventories" DROP CONSTRAINT IF EXISTS "listing_inventories_open_beds_nonnegative_chk";
--   ALTER TABLE "listing_inventories" DROP CONSTRAINT IF EXISTS "listing_inventories_open_beds_lte_total_beds_chk";
--   ALTER TABLE "listing_inventories" DROP CONSTRAINT IF EXISTS "listing_inventories_available_until_order_chk";
--   ALTER TABLE "listing_inventories" DROP CONSTRAINT IF EXISTS "listing_inventories_epoch_versions_positive_chk";
--   ALTER TABLE "physical_units" DROP CONSTRAINT IF EXISTS "physical_units_epoch_versions_positive_chk";
--   ALTER TABLE "host_unit_claims" DROP CONSTRAINT IF EXISTS "host_unit_claims_epoch_versions_positive_chk";
--   ALTER TABLE "identity_mutations" DROP CONSTRAINT IF EXISTS "identity_mutations_resulting_epoch_positive_chk";
--   ALTER TABLE "outbox_events" DROP CONSTRAINT IF EXISTS "outbox_events_epoch_versions_positive_chk";
--   ALTER TABLE "cache_invalidations" DROP CONSTRAINT IF EXISTS "cache_invalidations_epochs_positive_chk";
--   ALTER TABLE "inventory_search_projection" DROP CONSTRAINT IF EXISTS "inventory_search_projection_epoch_versions_positive_chk";
--   ALTER TABLE "unit_public_projection" DROP CONSTRAINT IF EXISTS "unit_public_projection_epoch_versions_positive_chk";
--
-- NOT VALID constraints avoid scanning legacy rows during deploy while still
-- enforcing the invariant for every new or updated row.

ALTER TABLE "listing_inventories"
  ADD CONSTRAINT "listing_inventories_price_positive_chk"
  CHECK (price > 0) NOT VALID;

ALTER TABLE "listing_inventories"
  ADD CONSTRAINT "listing_inventories_capacity_guests_positive_chk"
  CHECK (capacity_guests IS NULL OR capacity_guests > 0) NOT VALID;

ALTER TABLE "listing_inventories"
  ADD CONSTRAINT "listing_inventories_total_beds_positive_chk"
  CHECK (total_beds IS NULL OR total_beds > 0) NOT VALID;

ALTER TABLE "listing_inventories"
  ADD CONSTRAINT "listing_inventories_open_beds_nonnegative_chk"
  CHECK (open_beds IS NULL OR open_beds >= 0) NOT VALID;

ALTER TABLE "listing_inventories"
  ADD CONSTRAINT "listing_inventories_open_beds_lte_total_beds_chk"
  CHECK (open_beds IS NULL OR total_beds IS NULL OR open_beds <= total_beds) NOT VALID;

ALTER TABLE "listing_inventories"
  ADD CONSTRAINT "listing_inventories_available_until_order_chk"
  CHECK (available_until IS NULL OR available_until >= available_from) NOT VALID;

ALTER TABLE "listing_inventories"
  ADD CONSTRAINT "listing_inventories_epoch_versions_positive_chk"
  CHECK (
    unit_identity_epoch_written_at > 0
    AND source_version > 0
    AND row_version > 0
  ) NOT VALID;

ALTER TABLE "physical_units"
  ADD CONSTRAINT "physical_units_epoch_versions_positive_chk"
  CHECK (
    unit_identity_epoch > 0
    AND source_version > 0
    AND row_version > 0
  ) NOT VALID;

ALTER TABLE "host_unit_claims"
  ADD CONSTRAINT "host_unit_claims_epoch_versions_positive_chk"
  CHECK (
    unit_identity_epoch_written_at > 0
    AND source_version > 0
    AND row_version > 0
  ) NOT VALID;

ALTER TABLE "identity_mutations"
  ADD CONSTRAINT "identity_mutations_resulting_epoch_positive_chk"
  CHECK (resulting_epoch > 0) NOT VALID;

ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_epoch_versions_positive_chk"
  CHECK (
    source_version > 0
    AND unit_identity_epoch > 0
  ) NOT VALID;

ALTER TABLE "cache_invalidations"
  ADD CONSTRAINT "cache_invalidations_epochs_positive_chk"
  CHECK (
    projection_epoch > 0
    AND unit_identity_epoch > 0
  ) NOT VALID;

ALTER TABLE "inventory_search_projection"
  ADD CONSTRAINT "inventory_search_projection_epoch_versions_positive_chk"
  CHECK (
    unit_identity_epoch_written_at > 0
    AND source_version > 0
    AND projection_epoch > 0
  ) NOT VALID;

ALTER TABLE "unit_public_projection"
  ADD CONSTRAINT "unit_public_projection_epoch_versions_positive_chk"
  CHECK (
    unit_identity_epoch > 0
    AND source_version > 0
    AND projection_epoch > 0
  ) NOT VALID;
