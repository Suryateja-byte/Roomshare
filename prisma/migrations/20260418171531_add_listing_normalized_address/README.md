# add_listing_normalized_address

## Summary

Adds the nullable `Listing.normalizedAddress` column and a partial owner/address
lookup index for ACTIVE and PAUSED listings. The migration is DDL-only.

## Reversibility

Rollback steps:

- `DROP INDEX "Listing_owner_normalized_address_idx";`
- `ALTER TABLE "Listing" DROP COLUMN "normalizedAddress";`

This is reversible with zero data loss because `normalizedAddress` is derived
from `Location`.

## Data-safety

- `normalizedAddress` is nullable and defaults to `NULL`.
- Existing rows are not rewritten by this migration.
- Index creation is non-concurrent because Prisma wraps migrations in a
  transaction by default.
- On tables above roughly 1M rows, the index build may briefly block
  ACTIVE/PAUSED writes. Split the rollout if that lock window is too large.

## Backfill

Run `pnpm exec ts-node scripts/cfm/backfill-normalized-address.ts --apply`
after this migration.

Until the backfill completes, collision detection will see `NULL` for
pre-existing rows. That failure mode is false-negative only.

## Rollout

1. Deploy this migration to staging first.
2. Run `pnpm exec ts-node scripts/cfm/backfill-normalized-address.ts --apply`.
3. Verify `SELECT COUNT(*) FROM "Listing" WHERE "normalizedAddress" IS NULL;`
   returns `0`.
4. Enable `listingCreateCollisionWarn` only after the staging backfill is
   complete.

## Staging run notes

If the table is large enough that the transactional index build is unsafe for
the environment, split the rollout into:

1. A Prisma migration that adds only the nullable column.
2. A manual `CREATE INDEX CONCURRENTLY` step outside Prisma migration
   execution.
