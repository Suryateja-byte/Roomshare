# Migration: Phase 02 — listing_inventories publish_status CHECK constraint

## Purpose

Adds a database-enforced CHECK constraint on `listing_inventories.publish_status` to match
the §9.4 publish state machine. This prevents out-of-band code from inserting invalid status
values that the projection worker wouldn't understand.

## Constraint Added

`listing_inventories_publish_status_chk`:
Allowed values: `DRAFT`, `PENDING_GEOCODE`, `PENDING_PROJECTION`, `PENDING_EMBEDDING`,
`PUBLISHED`, `STALE_PUBLISHED`, `PAUSED`, `SUPPRESSED`, `ARCHIVED`.

## Pattern: NOT VALID + VALIDATE

1. `ADD CONSTRAINT ... NOT VALID` — adds the constraint but does NOT scan existing rows.
   Takes a brief metadata lock, no row-scan. New rows are immediately constrained.
2. `VALIDATE CONSTRAINT` — scans existing rows to confirm they all pass. Runs concurrently
   without blocking writes in Postgres 14+.

In our pre-launch setup this is effectively instant (dummy data only).

## Rollback

```sql
ALTER TABLE "listing_inventories"
  DROP CONSTRAINT IF EXISTS "listing_inventories_publish_status_chk";
```

## Note

`physical_units.publish_status` and `host_unit_claims.publish_status` are NOT constrained in
this phase — Phase 02 only transitions `listing_inventories.publish_status`. Those tables will
be constrained in Phase 03+ when their state machines are wired.
