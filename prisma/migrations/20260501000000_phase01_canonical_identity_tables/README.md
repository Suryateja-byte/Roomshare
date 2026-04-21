# phase01_canonical_identity_tables

## Summary

Creates the Phase 01 canonical write-side tables:

- `physical_units`
- `host_unit_claims`
- `listing_inventories`
- `identity_mutations`
- `outbox_events`
- `cache_invalidations`
- `audit_events`

This is an additive, write-only schema expansion. No public read path is rewired.

## Rollback

Rollback is fully reversible while the tables are still Phase-01 empty:

1. `DROP TABLE "audit_events" CASCADE;`
2. `DROP TABLE "cache_invalidations" CASCADE;`
3. `DROP TABLE "outbox_events" CASCADE;`
4. `DROP TABLE "identity_mutations" CASCADE;`
5. `DROP TABLE "listing_inventories" CASCADE;`
6. `DROP TABLE "host_unit_claims" CASCADE;`
7. `DROP TABLE "physical_units" CASCADE;`

The repo uses manual rollback SQL comments, not `down.sql`.

## Data-safety

- Every table is created empty.
- No backfill runs in this phase.
- Existing `Listing`, `Location`, `Booking`, and `ListingDayInventory` rows are untouched.
- The canonical unique index is additive.

## Lock footprint

- `CREATE TABLE` and `ALTER TABLE ... ADD CONSTRAINT` take `AccessExclusiveLock` on the new Phase 01 tables only.
- No lock is taken on existing hot-path tables in this migration.
