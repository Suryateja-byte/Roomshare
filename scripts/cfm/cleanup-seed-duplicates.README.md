# cleanup-seed-duplicates — runbook

Script: `scripts/cfm/cleanup-seed-duplicates.ts`

Purges dev/seed listing duplicates created by AI or test runs. **Never**
deletes by address alone — the plan explicitly forbids that because
multi-unit legitimate hosts share normalized addresses with themselves.

## Signature

A row is a deletion candidate iff it shares ALL of the following with
at least one other row, AND the candidate is NOT the oldest member of
its group:

- `ownerId`
- `normalizeListingTitle(title)` (NFKC + lowercase + punctuation
  collapse, identical to `src/lib/search/normalize-listing-title.ts`)
- `moveInDate`
- `price` (exact, rounded to cents internally)
- `availableSlots` and `totalSlots`
- `normalizeAddress({address, city, state, zip})` (identical to
  `src/lib/search/normalize-address.ts`)
- `createdAt` within the configurable window of the oldest group
  member (default: 60 seconds — keeps CFM-legitimate re-postings
  distinct if they happened hours apart)

Only rows whose Listing.status is `ACTIVE` or `PAUSED` are considered.
Rows with ANY matching `Booking` row are refused — the script aborts
with exit code 2 before any DELETE.

## Scope

At least one of `--title-prefix` or `--owner-ids` MUST be provided.
This enforces the "never address-only" rule from FINAL-PLAN §6.3.

## Usage

Dry-run by default. Required to inspect before applying.

```
# Dry-run: scan + report without mutating anything
pnpm exec ts-node scripts/cfm/cleanup-seed-duplicates.ts \
  --title-prefix 'Private Room · San Francisco'

# Same with owner scope
pnpm exec ts-node scripts/cfm/cleanup-seed-duplicates.ts \
  --owner-ids 'seed-user-1,seed-user-2'

# Apply after reviewing the dry-run output + sample rows
pnpm exec ts-node scripts/cfm/cleanup-seed-duplicates.ts \
  --title-prefix 'Private Room · San Francisco' \
  --apply

# Tighter createdAt coalescing window (default 60s)
pnpm exec ts-node scripts/cfm/cleanup-seed-duplicates.ts \
  --title-prefix 'Test Listing' \
  --created-at-window-seconds 30

# Skip oversized groups as a safety valve
pnpm exec ts-node scripts/cfm/cleanup-seed-duplicates.ts \
  --owner-ids 'seed-user-1' \
  --max-group-size 20
```

## Coordinator checklist (pre-APPLY)

```
[ ] Snapshot: pg_dump to ops vault with timestamp
[ ] scripts/cfm/cleanup-seed-duplicates.ts --dry-run --title-prefix '...' > dryrun.txt
[ ] Spot-check 20 random sample rows in dryrun.txt (ids + ownerIds + moveInDate)
[ ] Verify no oversized groups flagged (or raise --max-group-size intentionally)
[ ] Verify ZERO Booking rows reference candidate listings
      SELECT COUNT(*) FROM "Booking" WHERE "listingId" IN (<dry-run ids>)
[ ] PR sign-off posted
[ ] --apply
[ ] Post-delete: search_docs cleanup runs on next cron
       OR DELETE FROM listing_search_docs WHERE id = ANY(<deleted ids>)
[ ] Monitor dashboards 30 min
```

## Rollback

Row-level undo is **impossible** due to `onDelete: Cascade` fanout on
`SavedListing`, `Review`, `RecentlyViewed`, `Location`, `Conversation`,
`Report`, `ListingDayInventory` (`prisma/schema.prisma`). The only
rollback path is full snapshot restore. Take the snapshot FIRST.

## Safety invariants

- Never address-only scope (would nuke legitimate multi-unit hosts).
- Never cross `ownerId` (bug: would delete other hosts' listings).
- Abort if any candidate has a Booking row (`onDelete: Restrict` on
  Booking.listingId would fail the delete anyway; we check explicitly
  for a friendlier error).
- Oldest row per group is retained; later rows are deleted.
- Dry-run is the default behavior; `--apply` is required to mutate.
