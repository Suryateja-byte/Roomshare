# Migration: Phase 02 — physical_units Geocode Columns

## Purpose

Adds four nullable output columns to `physical_units` that the geocode worker (Phase 02)
populates after a successful geocode call.

## Columns Added

| Column | Type (production) | Type (PGlite) | Purpose |
|---|---|---|---|
| `exact_point` | `GEOGRAPHY(Point,4326)` | `TEXT NULL` | Exact lat/lng from geocoder (private) |
| `public_point` | `GEOGRAPHY(Point,4326)` | `TEXT NULL` | Coarsened lat/lng (public-safe, Phase 05 hardens) |
| `public_cell_id` | `TEXT NULL` | `TEXT NULL` | H3 cell ID for spatial bucketing |
| `public_area_name` | `TEXT NULL` | `TEXT NULL` | Human-readable area name (suburb, city) |

## PostGIS Guard

The migration uses a `DO $$ BEGIN ... EXCEPTION ... END; $$` guard so it runs safely in
environments without PostGIS (PGlite test harness). In those environments the geography columns
fall back to `TEXT NULL`. This is consistent with the Phase 01 philosophy of test-DB safety.

## Data Safety

- **Pre-launch** — `physical_units` has only test/dummy rows. All four columns start as `NULL`.
- **Nullable** — Adding nullable columns to a table with no NOT NULL default is instant in
  Postgres (no table rewrite).
- **Lock footprint** — `ALTER TABLE ADD COLUMN NULL` takes a brief `ACCESS EXCLUSIVE` lock on
  the table, releases immediately. Zero row-scan. Safe in production with monitoring.

## Rollback

```sql
ALTER TABLE "physical_units"
  DROP COLUMN IF EXISTS "exact_point",
  DROP COLUMN IF EXISTS "public_point",
  DROP COLUMN IF EXISTS "public_cell_id",
  DROP COLUMN IF EXISTS "public_area_name";
```

Reversible: no foreign keys on these columns, no dependent objects.
