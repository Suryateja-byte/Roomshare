# Migration: Phase 02 — Projection Tables

## Purpose

Creates two read-model projection tables that sit between the durable outbox events (Phase 01)
and the public search read path (Phase 10). These tables are dark until Phase 10.

## Tables Created

- `inventory_search_projection` — one row per `listing_inventories` row, denormalized for
  search queries. Carries all fields needed for filter matching without hitting the source tables.
- `unit_public_projection` — one row per `(unit_id, unit_identity_epoch)` pair, derived by
  grouping published `inventory_search_projection` rows.

## Data Safety

- **Pre-launch** — both tables start empty. No backfill required.
- **No PII at rest** — `public_point`, `public_cell_id`, `public_area_name` carry coarsened
  location data (Phase 05 privacy hardens this further). No raw address stored.
- **Lock footprint** — `CREATE TABLE` takes no row locks on existing tables. The INDEX creates
  are on the new empty table. Zero contention risk.

## Rollback

```sql
DROP TABLE IF EXISTS "unit_public_projection" CASCADE;
DROP TABLE IF EXISTS "inventory_search_projection" CASCADE;
```

Both tables are new and empty. `CASCADE` drops any dependent views (none exist yet).

## Indexes

`inventory_search_projection`:
- `inventory_search_projection_inventory_unique_idx (inventory_id)` — guarantees one projection
  row per inventory; enforces idempotent upsert deduplication.
- `inventory_search_projection_unit_epoch_status_idx (unit_id, unit_identity_epoch_written_at, publish_status)` — unit-scoped filter queries.
- `inventory_search_projection_publish_status_source_version_idx (publish_status, source_version)` — supports source_version-ordered WHERE clause on upsert conflict.

`unit_public_projection`:
- `unit_public_projection_unit_epoch_idx (unit_id, unit_identity_epoch)` — unique; primary lookup key; supports ON CONFLICT target.
