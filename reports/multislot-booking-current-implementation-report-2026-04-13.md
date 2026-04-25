# Current Multislot Booking Implementation Report

Updated for the repository state on 2026-04-14 after the multi-slot stabilization work and the follow-up search/date parity fixes.

This report replaces the older pre-stabilization assessment. It describes what the code now does, what is already materially improved, and what is still transitional or not fully verified.

## Executive Summary

- The codebase now has a shared, range-aware availability service in `src/lib/availability.ts`. User-visible availability for booking, holds, listing detail, booking form limits, and stabilized search/list/map/facet flows is now meant to come from that service instead of directly from raw `Listing.availableSlots`.
- The canonical capacity rule is now consistent: `ACCEPTED` always reserves capacity, and `HELD` reserves capacity only while `heldUntil > now`. `PENDING` remains non-reserving.
- Capacity checks are now range-aware. The system computes effective availability across the requested interval instead of primarily relying on `SUM(slotsRequested)` across every intersecting booking.
- A real day-level projection table, `listing_day_inventory`, now exists and is integrated. Booking and hold transitions dual-write it, reconcile rebuilds it, and host capacity edits validate against it.
- Search/date propagation is now materially better than before. The search UI carries `moveInDate` and `endDate`, listing-detail links preserve valid date ranges, and filter drawer count/facet requests now include `endDate` when the range is valid.
- Soft-hold cleanup is stronger than before. Expired holds are inline-expired before critical capacity checks, the sweeper now runs frequently, and the sweeper processes each hold in its own transaction so one bad hold does not poison the whole batch.
- The implementation is still in cutover mode. `Listing.availableSlots` still exists as a compatibility cache and is still written in several mutation paths. The system is materially more stable than before, but it has not fully retired scalar slot state.

## Verification Scope

This update was verified against the current code in:

- `src/lib/availability.ts`
- `src/app/actions/booking.ts`
- `src/app/actions/manage-booking.ts`
- `src/app/api/listings/[id]/availability/route.ts`
- `src/app/api/listings/[id]/route.ts`
- `src/app/listings/[id]/page.tsx`
- `src/app/listings/[id]/ListingPageClient.tsx`
- `src/components/BookingForm.tsx`
- `src/components/SearchForm.tsx`
- `src/hooks/useAvailability.ts`
- `src/hooks/useBatchedFilters.ts`
- `src/hooks/useDebouncedFilterCount.ts`
- `src/hooks/useFacets.ts`
- `src/lib/search/listing-detail-link.ts`
- `src/components/search/SearchResultsClient.tsx`
- `src/components/Map.tsx`
- `src/components/map/DesktopListingPreviewCard.tsx`
- `src/components/search/SplitStayCard.tsx`
- `src/lib/search/search-doc-queries.ts`
- `src/lib/search/search-v2-service.ts`
- `src/lib/search/search-doc-sync.ts`
- `src/app/api/cron/sweep-expired-holds/route.ts`
- `src/app/api/cron/daily-maintenance/route.ts`
- `src/app/api/cron/reconcile-slots/route.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260414000000_add_listing_day_inventory/migration.sql`
- `prisma/migrations/20260414010000_add_booking_held_requires_held_until/*`
- `tests/e2e/multislot/multi-slot-booking.contract.spec.ts`
- `playwright.multislot.config.ts`

Targeted verification completed in the current workspace:

- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec jest --runInBand src/__tests__/booking/multi-slot-lifecycle.test.ts`
- `pnpm exec jest --runInBand src/__tests__/hooks/useDebouncedFilterCount.test.ts src/__tests__/hooks/useFacets.test.ts src/__tests__/components/search/SearchResultsClient.test.tsx`
- `pnpm exec jest --runInBand src/__tests__/components/SearchForm.test.tsx src/__tests__/components/search/SearchResultsClient.test.tsx src/__tests__/components/search/SplitStayCard.test.tsx src/__tests__/components/map/DesktopListingPreviewCard.test.tsx src/__tests__/app/listings/page.test.tsx src/__tests__/app/listings/ListingPageClient.test.tsx src/__tests__/components/BookingForm.test.tsx src/__tests__/hooks/useBatchedFilters.test.ts src/__tests__/lib/search-params.test.ts src/__tests__/lib/search/search-query.test.ts src/__tests__/lib/pending-to-filter-params.test.ts src/__tests__/lib/search-utils.test.ts`

Current known test caveat:

- `src/__tests__/components/Map.test.tsx` still has two failing expectations that appear to predate or sit beside this slice of work:
  - popup anchor expectation
  - desktop “Hide map” button expectation

This report therefore describes the implementation as it exists in code and in the targeted passing suites, but it does not claim the entire repository is fully green.

## Current Capacity Model

### Canonical reserving rule

The shared reserving predicate now lives in `src/lib/availability.ts`:

- `ACCEPTED` always reserves capacity
- `HELD` reserves capacity only when `heldUntil > now`
- `PENDING`, `REJECTED`, `CANCELLED`, and `EXPIRED` do not reserve capacity

That rule is now used consistently in the live availability queries, the expired-hold cleanup helpers, and the stabilized slot-sensitive read paths.

### Date semantics

The implementation now consistently treats occupancy as half-open: `[startDate, endDate)`.

- booking overlap checks use half-open semantics
- the day-level inventory projection uses day rows covering `startDate` through `endDate - 1 day`
- the whole-unit overlap trigger was updated to align with that same interpretation

### Range-aware availability

The shared availability service computes date-scoped capacity over a requested interval rather than blindly trusting the scalar listing row.

In practical terms:

- it only subtracts `ACCEPTED` and active `HELD`
- it ignores `PENDING`
- it ignores expired `HELD`
- it returns `effectiveAvailableSlots` as the minimum free capacity across the requested interval

This is the core architectural fix. User-visible slot truth is now derived from the same date-aware logic used by booking and hold validation.

## Projection And Database State

### `listing_day_inventory`

The repository now contains `listing_day_inventory`, represented in Prisma as `ListingDayInventory`.

Current columns:

- `listing_id`
- `day`
- `total_slots`
- `held_slots`
- `accepted_slots`
- `version`
- `updated_at`

The migration in `20260414000000_add_listing_day_inventory`:

- creates the table and indexes
- backfills future accepted and active-held occupancy
- updates whole-unit overlap protection to ignore expired holds and use half-open range logic

### What the projection currently does

The projection is actively used for:

- hold creation
- hold expiry
- held-to-accepted transitions
- pending-to-accepted transitions
- accepted cancellation
- host `totalSlots` edits
- reconcile rebuilds
- test-only invariant checks through the new test API

### What is still transitional

The repo is not yet projection-only:

- `Listing.availableSlots` still exists
- mutation flows still update `Listing.availableSlots` as a compatibility cache
- user-visible date-scoped availability still reads from the shared live availability service rather than exclusively from projection rows

So the projection is real and integrated, but the code is still in a deliberate dual-write / cutover phase.

## Booking And Hold Behavior

### `createBooking`

`src/app/actions/booking.ts` now:

- keeps `PENDING` as a non-reserving state
- expires overlapping stale holds before critical capacity checks
- uses the shared range-aware availability service instead of trusting `Listing.availableSlots`
- ignores expired `HELD` rows in overlap and capacity decisions
- coerces whole-unit requests to `listing.totalSlots`
- preserves idempotency for booking requests

### `createHold`

Hold creation now:

- uses the same range-aware availability service
- inline-expires stale overlapping holds before checking capacity
- coerces whole-unit requests to `listing.totalSlots`
- dual-writes both the scalar compatibility field and `listing_day_inventory`
- supports idempotency on the action side and now has client-side key handling in the booking form that rotates safely across changed failed attempts

### Booking status transitions

`src/app/actions/manage-booking.ts` now:

- uses a stable typed result shape for callers
- maps `INVENTORY_DELTA_CONFLICT` to a user-readable retry message instead of falling back to a generic error
- logs inline-expiry failures at warning level rather than burying them at debug level
- revalidates capacity when accepting a `PENDING` booking
- moves `HELD -> ACCEPTED` by transferring projected capacity from held to accepted instead of double-consuming slots
- restores capacity for `HELD -> REJECTED/CANCELLED/EXPIRED` and `ACCEPTED -> CANCELLED`

This preserves the intended workflow model:

- `PENDING` does not reserve
- `HELD` reserves temporarily
- `ACCEPTED` reserves until the stay ends

## HELD Integrity And Expiry Safety

### Schema-level invariant

The schema work now includes a staged DB constraint for `HELD` bookings:

- `status = 'HELD'` requires `heldUntil IS NOT NULL`

This is implemented in the migration directory:

- `migration.sql` adds the constraint as `NOT VALID`
- `manual_audit_and_repair.sql` provides an operator repair playbook for legacy bad rows
- `deferred_validate_migration.sql` validates the constraint in a later rollout step

Important rollout nuance:

- new writes are protected immediately once the `NOT VALID` migration is applied
- full-table validation is intentionally deferred until operators confirm there are no existing bad rows

### Inline expiry

The shared helper `expireOverlappingExpiredHolds(...)` in `src/lib/availability.ts` is now used before critical booking and accept flows.

This means ghost holds do not need to wait for the sweeper in the common path where a user is actively trying to book or a host is actively trying to accept.

## Cron Jobs And Repair Paths

### Current cron schedule

`vercel.json` now schedules:

- `/api/cron/sweep-expired-holds` every 5 minutes
- `/api/cron/daily-maintenance` at `2,17,32,47 * * * *`

That second route is no longer only “daily” in practice. It is a cadence multiplexer used to stay inside the two-cron limit.

### What `daily-maintenance` now does

Every run of `src/app/api/cron/daily-maintenance/route.ts` delegates:

- `/api/cron/reconcile-slots`
- `/api/cron/refresh-search-docs`

It only runs cleanup-rate-limits, cleanup-idempotency-keys, cleanup-typing-status, and search-alerts inside the daily window.

This means reconcile is no longer “daily only” in effective cadence. It now runs on the fast cadence through delegated maintenance.

### Sweeper behavior

`src/app/api/cron/sweep-expired-holds/route.ts` is materially stronger than in the earlier implementation:

- discovery still uses advisory lock protection and `FOR UPDATE SKIP LOCKED`
- each hold is processed in its own transaction
- one bad hold no longer rolls back the whole batch
- projection deltas are applied during expiry
- scalar `availableSlots` is still restored as a compatibility write
- notification failures are isolated from transactional expiry work
- summaries now explicitly record partial failures

### Reconcile behavior

`src/app/api/cron/reconcile-slots/route.ts` now:

- rebuilds `listing_day_inventory` from authoritative bookings
- refreshes scalar `Listing.availableSlots` after rebuilding
- marks listings dirty for downstream search refresh
- logs drift repair

So reconcile is now projection-aware, not just scalar-aware.

## Search, Listing Detail, And UI Parity

### Listing detail bootstrap

The listing page now:

- accepts `startDate` and `endDate` in `searchParams`
- validates the range
- uses range-aware availability on SSR when a valid range is present
- falls back safely when no valid range exists
- includes active `HELD` bookings, but not expired ones, when building booked-date ranges

`ListingPageClient` now:

- seeds `startDate` and `endDate` from SSR props
- calls `useAvailability(...)` with those dates
- uses live `effectiveAvailableSlots` for both the top-level `SlotBadge` and the embedded `BookingForm`

That closes the earlier drift where the top-of-page badge and the form could disagree on the same listing page.

### Booking form

`src/components/BookingForm.tsx` now:

- uses live `effectiveAvailableSlots`
- auto-clamps selected slots if availability drops
- surfaces a user-facing adjustment message when clamping happens
- hides the slot selector for whole-unit listings
- explicitly tells the user that `PENDING` does not reserve inventory
- carries client-side hold idempotency state safely across retries

### Search form and search state

The search flow is now materially more range-aware than it was earlier:

- `SearchForm` tracks `moveInDate` and `endDate`
- invalid `endDate` values are normalized away
- search URLs are canonicalized so valid ranges are persisted
- `useBatchedFilters` includes `endDate` in pending and committed state
- search-param parsing supports both canonical `startDate` + `endDate` and legacy `moveInDate` + `endDate` during transition

### Listing detail links from search surfaces

`src/lib/search/listing-detail-link.ts` now centralizes listing-detail href construction.

The helper:

- accepts canonical `startDate` + `endDate`
- also accepts legacy `moveInDate` + `endDate`
- only preserves the range when the dates form a valid interval
- falls back to bare `/listings/:id` when there is no valid range

That helper is now used by:

- `SearchResultsClient`
- `Map`
- `DesktopListingPreviewCard`
- `SplitStayCard`

This is a substantial improvement over the earlier state where some entry points hard-coded bare detail URLs and silently dropped the selected dates.

### Count and facet requests

The filter drawer hooks are now range-aware too:

- `useDebouncedFilterCount` includes `endDate` in both cache keys and request params when the range is valid
- `useFacets` does the same

When `endDate` is missing or invalid, both hooks fall back to the older `moveInDate`-only behavior.

That means the live “Show X listings” button and facet suggestions now align with the selected date range instead of only the start date.

### SearchDoc parity

SearchDoc sync and read paths are better aligned than before:

- non-semantic SearchDoc reads now use the shared slot-sensitive availability rule
- semantic search still uses SearchDoc for candidate generation and ranking, but availability truth is re-applied through the shared live logic before final inclusion/exclusion
- SearchDoc writes derive `available_slots` from live availability rather than blindly trusting stale scalar state

## Host Listing Capacity Edits

The listing update route now validates `totalSlots` edits against future peak reserved load, not a simple stale arithmetic adjustment over historical overlap sums.

Current behavior:

- listing `totalSlots` changes update projection rows
- reductions are rejected if future reserved demand would exceed the new capacity
- the scalar compatibility field is still updated, but the logic is anchored to the stronger availability model rather than old stale arithmetic alone

## Testing And Release Gate

### Booking tests

The broader lifecycle suite has been rewritten to match the current architecture instead of the older raw `SUM(...)` query path. It now asserts against the current availability helpers and transition contract.

### Targeted search/listing tests

The current repo now includes focused tests for:

- listing page SSR range bootstrap
- listing detail live availability wiring
- search-form range normalization
- search-result detail links
- split-stay detail links
- desktop map preview detail links
- filter count and facet range propagation

### Playwright contract suite

The contract/race Playwright harness still exists in the repo and remains the intended release gate for multi-slot correctness.

This report does not claim a fresh fully healthy live run in this update. It only notes that the suite and matrix are present and that the repository contains the dedicated non-production test endpoints and race barriers needed for that style of verification.

## Transitional Areas And Known Gaps

The implementation is materially stronger than the older report described, but these caveats still matter:

- `Listing.availableSlots` still exists and is still written as a compatibility cache.
- The projection is integrated, but the canonical user-visible read path still comes from the shared live availability service rather than exclusively from projection rows.
- The `booking_held_requires_held_until` DB constraint is staged. The repo contains the add migration, the manual repair SQL, and the deferred validation SQL, but final full validation still depends on the rollout state of each environment.
- `src/__tests__/components/Map.test.tsx` is still red on two expectations that need separate triage.
- This update did not re-prove the full Playwright release-gate suite against a fully healthy local or deployed runtime.

## Bottom Line

The multislot implementation is no longer in the earlier unstable state where:

- raw `availableSlots`
- path-specific search math
- and stale `HELD` rows

could all disagree at the same time.

The current codebase now has:

- one shared range-aware availability service
- explicit active-hold semantics
- inline expiry before critical capacity checks
- a real day-level inventory projection with dual-write and reconcile support
- a staged DB invariant for `HELD` requiring `heldUntil`
- fast-cadence expiry and reconcile scheduling within the two-cron limit
- search/list/map/facet/date propagation that is materially more consistent than before

The remaining work is mostly about finishing the cutover and closing the last verification gaps, not about inventing the core stabilization architecture from scratch.
