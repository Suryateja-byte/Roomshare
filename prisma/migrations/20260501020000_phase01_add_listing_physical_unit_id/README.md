# phase01_add_listing_physical_unit_id

## Summary

Adds the nullable `Listing.physical_unit_id` placeholder column required for later
canonical backfills. Phase 01 does not add an index, foreign key, or any reader.

## Rollback

- `ALTER TABLE "Listing" DROP COLUMN "physical_unit_id";`

This is fully reversible because the new column is empty on creation.

## Data-safety

- The migration is additive only.
- No existing listing row is rewritten.
- No backfill or read-path change ships in this phase.

## Lock footprint

- `ALTER TABLE ... ADD COLUMN` takes a brief `AccessExclusiveLock` on `Listing`.
- The column is nullable with no default, so no table rewrite is required.
