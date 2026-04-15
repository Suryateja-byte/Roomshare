# Current Multislot Booking Implementation Report

Updated for the codebase state on 2026-04-14.

This report replaces the earlier pre-stabilization assessment. It describes the implementation that now exists in the repository after the multi-slot stabilization work landed. Every substantive claim below is grounded in the current code, and this report explicitly separates what is already true in production code from what remains transitional.

## Executive Summary

- User-visible slot availability is no longer supposed to come directly from raw `Listing.availableSlots` for date-scoped flows. The canonical date-range calculation now lives in `src/lib/availability.ts` and is used by booking checks, hold checks, accept checks, the listing availability API, listing detail, booking form slot limits, and the stabilized search/list/map/facet paths.
- The canonical capacity predicate is now: `ACCEPTED` always reserves capacity, and `HELD` reserves capacity only while `heldUntil > now`. Expired holds are actively expired before capacity checks in the critical booking and acceptance flows, and expired `HELD` rows no longer intentionally block capacity-sensitive paths.
- Capacity checks for multi-slot requests now use range-aware free-slot calculation across the requested interval instead of summing all overlapping bookings as the primary user-facing availability rule. The key outcome is that visible availability and booking validation now derive from the same range-aware logic.
- A new `listing_day_inventory` table exists, is backfilled, is dual-written by booking/hold/status transitions, and is rebuilt by reconciliation. That projection is real and materially integrated, but it is not yet the sole read path for user-visible availability. The live availability service remains the authoritative read path during the cutover.
- `Listing.availableSlots` still exists and is still written in several mutation paths as a transitional cache and compatibility field. The code no longer treats it as the source of truth for future date-scoped availability, but it has not been fully retired.
- Search parity is materially improved. Legacy SQL, SearchDoc non-semantic, SearchDoc semantic, list, map, and facet flows now share the same range-aware availability filtering rule instead of each path independently trusting different interpretations of `availableSlots`.
- `PENDING` remains a non-reserving workflow state. Capacity is revalidated when a host accepts a `PENDING` booking, and the UI now explicitly states that a request does not reserve inventory until acceptance.

## Verification Scope

I verified the current implementation by inspecting the capacity service, booking and hold actions, booking-status transitions, listing update rules, search paths, SearchDoc sync, listing detail loading, booking UI, cron jobs, schema/migration changes, test helpers, and the new Playwright contract suite. The key evidence lives in:

- `src/lib/availability.ts`
- `src/app/actions/booking.ts`
- `src/app/actions/manage-booking.ts`
- `src/app/api/listings/[id]/availability/route.ts`
- `src/app/api/listings/[id]/route.ts`
- `src/app/listings/[id]/page.tsx`
- `src/components/BookingForm.tsx`
- `src/hooks/useAvailability.ts`
- `src/lib/search/search-doc-queries.ts`
- `src/lib/data.ts`
- `src/lib/search/search-v2-service.ts`
- `src/lib/search/search-doc-sync.ts`
- `src/app/api/cron/sweep-expired-holds/route.ts`
- `src/app/api/cron/reconcile-slots/route.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260414000000_add_listing_day_inventory/migration.sql`
- `src/app/api/test/[...slug]/route.ts`
- `tests/e2e/multislot/multi-slot-booking.contract.spec.ts`
- `playwright.multislot.config.ts`

I also verified the targeted automated checks that were run during this implementation cycle:

- `pnpm test --runInBand src/__tests__/lib/search/search-doc-queries.test.ts src/__tests__/booking/multi-slot-concurrency.test.ts src/__tests__/actions/manage-booking-hold.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec playwright test -c playwright.multislot.config.ts --list`

I did not verify a full live browser run against a healthy local stack in this session because the local runtime environment remained unhealthy: `/api/health/ready` returned `503` and Prisma could not connect to Postgres on `localhost:5433`. That environment problem blocks end-to-end runtime proof, but it does not change the implementation facts described below.

## Feature Flags And Gating

The implementation still relies on the same high-level feature gates:

- multi-slot booking requests greater than one slot remain gated by the multislot feature flag
- hold creation remains gated by the soft-holds feature flag
- whole-unit listing configuration remains gated by the whole-unit feature flag
- environment validation still enforces the dependency that whole-unit mode and active soft holds require multislot booking support

This report does not assume which of those flags are enabled in any deployed environment. It only describes the code paths that now exist when those features are active.

## Current Capacity Model

### Canonical reserving rule

The shared reserving predicate now lives in `src/lib/availability.ts`:

- `ACCEPTED` always reserves capacity.
- `HELD` reserves capacity only when `heldUntil > now`.
- `PENDING`, `REJECTED`, `CANCELLED`, and `EXPIRED` do not reserve capacity.

That rule is now the foundation for range-aware availability reads and for the booking flows that were stabilized in this work.

### Date semantics

The implementation now consistently treats booking occupancy as half-open: `[startDate, endDate)`.

- A day is occupied when it is on or after `startDate` and before `endDate`.
- Whole-unit overlap protection in the latest migration also uses half-open range logic.
- The day-level inventory backfill and rebuild logic use generated day ranges aligned with that same interpretation.

### Range-aware availability

The shared availability service in `src/lib/availability.ts` computes date-scoped availability by finding the minimum free capacity across all days in the requested interval. In effect:

- free slots per day = `totalSlots - held_slots - accepted_slots` in the projected model, or its equivalent when read live from bookings
- effective available slots for a requested stay = `MIN(free slots across requested days)`

This is a meaningful change from the earlier design that often used `SUM(slotsRequested)` across all overlapping bookings. The new read path is range-aware instead of “sum all intersections”.

## Data Model And Projection State

### Existing core tables

The system still uses:

- `Listing` for listing configuration, including `totalSlots`, `availableSlots`, `bookingMode`, and hold TTL settings.
- `Booking` for workflow and reservation state, including `slotsRequested`, `status`, `heldUntil`, and versioning.

### New projection table

The codebase now includes `ListingDayInventory`, backed by `listing_day_inventory`, with:

- `listing_id`
- `day`
- `total_slots`
- `held_slots`
- `accepted_slots`
- `version`
- `updated_at`

The migration `20260414000000_add_listing_day_inventory` creates the table, indexes it, backfills future accepted and active-held occupancy, and updates the whole-unit overlap trigger to ignore expired holds and use half-open overlap logic.

### What the projection currently does

The projection is not a placeholder. It is actively used for:

- dual-writes during hold creation
- dual-writes during acceptance/cancellation/rejection/expiry transitions
- future `totalSlots` synchronization when hosts edit listing capacity
- full rebuild during reconcile
- deterministic test assertions through the new test API surface

### What is still transitional

Despite the projection landing, the system is still in cutover mode:

- `Listing.availableSlots` is still written in several mutation paths.
- user-visible date-scoped availability still reads from the shared live availability service rather than exclusively from `listing_day_inventory`
- reconcile still refreshes the scalar cache after rebuilding projection state

That means the projection is real and exercised, but the repo has not yet fully retired scalar writes or switched all reads to projection rows.

## Booking Creation And Hold Creation

### `createBooking`

`src/app/actions/booking.ts` now uses the shared range-aware availability flow for booking creation.

Current behavior:

- Auth, verification, rate-limit, and validation checks still run before transaction entry.
- Whole-unit listings still coerce `slotsRequested` to `listing.totalSlots`.
- The transaction expires overlapping stale holds before it evaluates capacity.
- Duplicate exact-date checks and overlapping-booking checks no longer intentionally treat expired `HELD` rows as active blockers.
- Capacity is checked with `getAvailability(...)` instead of relying on raw `Listing.availableSlots` or a summed-overlap approximation.
- Successful booking creation still creates a `PENDING` booking and does not reserve inventory at creation time.

This means the workflow decision remains the same, but the capacity math underneath it is materially different and now aligns with the same service used elsewhere.

### `createHold`

`createHold` in the same file now also uses the shared availability service.

Current behavior:

- Holds remain feature-gated behind soft holds and multi-slot flags as before.
- Whole-unit hold requests are coerced to `listing.totalSlots`.
- The transaction inline-expires stale overlapping holds before capacity is checked.
- Duplicate checks block active `HELD`, `ACCEPTED`, and `PENDING` conflicts, but expired `HELD` rows are no longer meant to block.
- Capacity is validated with `getAvailability(...)`.
- The legacy scalar `Listing.availableSlots` is still decremented as a compatibility write.
- The new projection is also updated with `heldDelta`.

This is a dual-write transitional model: live correctness comes from the range-aware service, while scalar and projection state are both updated to keep the rest of the system coherent during rollout.

## Booking Status Transitions

`src/app/actions/manage-booking.ts` now applies the same capacity model during state changes.

### Inline expiry

When a held booking is encountered after expiry:

- the code now expires overlapping stale holds through the shared helper under listing lock
- the user-facing result for a stale hold is `"This hold has expired."`

This avoids the earlier class of ghost unavailability where stale holds could linger as blockers until a later sweeper pass.

### `HELD -> ACCEPTED`

Current behavior:

- The hold already reserved capacity at hold creation.
- Acceptance moves reservation state from held to accepted.
- Projection rows are updated with `heldDelta: -slots` and `acceptedDelta: +slots`.
- Scalar slots are not decremented a second time.

### `PENDING -> ACCEPTED`

Current behavior:

- Capacity is revalidated at accept time using the shared availability service.
- Stale overlapping holds are expired before the recheck.
- The scalar `availableSlots` cache is still decremented as a transitional write.
- Projection rows are updated with accepted capacity deltas.

This preserves the intended workflow rule: `PENDING` does not reserve, and acceptance is where capacity is truly consumed.

### `HELD -> REJECTED/CANCELLED/EXPIRED` and `ACCEPTED -> CANCELLED`

Current behavior:

- Capacity is restored in the projection.
- Scalar `availableSlots` is also restored as a compatibility write where applicable.
- Listing dirtiness is marked so downstream search sync can refresh.

## Whole-Unit Behavior

Whole-unit handling is still based on coercing effective requested capacity to `listing.totalSlots`, but the edge handling is stronger now than in the older implementation report.

Current behavior:

- booking creation coerces whole-unit requests to `totalSlots`
- hold creation coerces whole-unit requests to `totalSlots`
- pending acceptance recomputes whole-unit demand from the locked listing state
- the latest DB trigger ignores expired `HELD` rows instead of treating every historical held row as an active overlap blocker
- overlap semantics are half-open rather than closed-range

That means whole-unit protection still exists at both application and DB layers, but the DB guard is now less likely to create ghost conflicts from expired holds.

## Search, Listing Detail, Map, And Facet Parity

One of the main instability problems in the earlier system was that different search paths interpreted availability differently. That is no longer the intended design.

### Shared search availability rule

The repo now centralizes slot-sensitive filtering through shared availability SQL fragments in `src/lib/availability.ts`, which are consumed by:

- `src/lib/search/search-doc-queries.ts`
- `src/lib/data.ts`
- `src/app/api/search/facets/route.ts`

As a result:

- non-semantic SearchDoc queries no longer expose raw stored `available_slots` as if it were canonical date-scoped truth
- legacy SQL list/map queries no longer rely only on scalar `l."availableSlots" >= ...`
- facet filtering uses the same date-aware held/accepted logic

### Semantic search

The semantic search path in `src/lib/search/search-v2-service.ts` still uses SearchDoc for candidate generation and ranking, but availability truth is reapplied through the shared live availability layer before final slot-sensitive inclusion/exclusion.

That is the important current-state distinction: semantic search may still rank candidates, but it is no longer supposed to own availability truth.

### SearchDoc synchronization

SearchDoc sync also changed. `src/lib/search/search-doc-sync.ts` and the refresh cron now derive stored `available_slots` from live availability instead of blindly trusting the scalar cache.

This reduces stored-search drift, even though the stored field is still not treated as the sole source of truth for date-scoped queries.

## Listing Detail API And Booking UI

### Listing availability endpoint

The repo now exposes `GET /api/listings/:id/availability` in `src/app/api/listings/[id]/availability/route.ts`.

It validates:

- both `startDate` and `endDate` must be provided together
- `endDate` must be after `startDate`

It returns the shared availability result, including:

- `listingId`
- `totalSlots`
- `effectiveAvailableSlots`
- `heldSlots`
- `acceptedSlots`
- `rangeVersion`
- `asOf`

### Listing detail loading

The listing page loader in `src/app/listings/[id]/page.tsx` now:

- includes `HELD` bookings in booked-date calculations only when the hold is still active
- prefers the range-aware availability result for visible slot availability

### Client availability refresh

`src/hooks/useAvailability.ts` adds a dedicated client hook that:

- fetches the availability endpoint for the selected date range
- refreshes on mount
- refreshes on focus and visibility changes
- polls while the page remains visible

### Booking form behavior

`src/components/BookingForm.tsx` now:

- uses live `effectiveAvailableSlots` for slot selection limits
- auto-clamps the current slot selection if availability falls
- surfaces a user-facing adjustment message when clamping occurs
- hides the slot selector for whole-unit listings
- exposes stable test ids for availability badge, slot selector, buttons, and success/error states
- explicitly tells the user that a request does not reserve inventory until the host accepts
- supports URL-prefilled `startDate` and `endDate`

This is a meaningful UX correction. The form no longer relies on a stale scalar max as the primary slot limit for date-scoped booking.

## Host Listing Capacity Edits

The listing update route in `src/app/api/listings/[id]/route.ts` now validates `totalSlots` reductions against future peak reserved load rather than summing all future overlaps into one bucket.

Current behavior:

- host edits still update `Listing.totalSlots`
- future materialized inventory rows are synchronized
- slot reductions are rejected if future reserved demand would exceed the new capacity

This is closer to the correct rule for shared inventory than the older sum-of-overlaps approach.

## Cron Jobs And Repair Paths

### Expired hold sweeper

`src/app/api/cron/sweep-expired-holds/route.ts` now:

- expires stale held bookings
- restores scalar capacity as before
- updates projection capacity via `applyInventoryDeltas(...)`
- marks listings dirty for downstream refresh

### Reconcile

`src/app/api/cron/reconcile-slots/route.ts` now:

- rebuilds `listing_day_inventory` from authoritative bookings
- refreshes scalar `Listing.availableSlots` from live availability after reconciliation
- marks listings dirty
- logs drift repair

This is a stronger repair model than the older scalar-only reconcile job because it now repairs projection state as well.

## Test Harness And Release Gate

### Targeted Jest coverage

The implementation work updated and passed targeted tests around:

- search availability SQL parity
- multi-slot concurrency
- held booking management and transition behavior

### New test-only APIs

`src/app/api/test/[...slug]/route.ts` adds a dedicated non-production test harness for contract and race testing. It now supports:

- environment reset
- user setup
- listing setup
- booking setup
- direct availability reads
- booking counts
- force-expire hold
- sweep-expired-holds trigger
- reconcile trigger
- barrier creation and release for deterministic race coordination

### Race barriers

`src/lib/test-barriers.ts` adds explicit test barriers around critical capacity checks. The booking and acceptance flows use those barriers so Playwright can coordinate deterministic races instead of relying purely on timing luck.

### Playwright contract suite

The repo now contains `tests/e2e/multislot/multi-slot-booking.contract.spec.ts` and `playwright.multislot.config.ts`.

The release-gate matrix includes:

- `multislot-desktop-legacy`
- `multislot-desktop-searchdoc`
- `multislot-desktop-semantic`
- `multislot-mobile-smoke`
- `multislot-race`

The race project is configured for deterministic correctness checking rather than flake-masking retries.

## What Is Still Not Finished

The current implementation is materially stronger than the older report described, but it is important not to overstate the rollout state.

The following are still true today:

- `Listing.availableSlots` still exists and is still updated in mutation flows as a transitional cache.
- The new projection exists and is dual-written, but the canonical user-visible read path still comes from the shared live availability service rather than exclusively from projection rows.
- Full end-to-end runtime proof of the new Playwright suite is still blocked in this local environment by an unhealthy database-backed dev stack.
- The code now emits stronger consistency behavior around drift and capacity, but not every aspirational observability item from the original plan is present as a first-class metric/event implementation yet.

So the current implementation should be described as:

- P0 stabilization largely implemented
- P1 projection landed and integrated in dual-write/reconcile form
- final retirement of scalar slot truth still pending

## Bottom Line

The current codebase is no longer in the earlier state where raw `availableSlots`, search-path-specific math, and stale holds were all competing truths.

The system now has:

- one shared range-aware availability service for user-visible slot truth
- explicit active-hold semantics
- inline expiry before critical capacity decisions
- search/list/map/facet parity based on the same availability rule
- a real day-level inventory projection with migration, backfill, dual-write, and reconcile support
- a new contract/race Playwright harness for release gating

The main transitional caveat is that the scalar `Listing.availableSlots` field still exists as a compatibility cache and the projection is not yet the exclusive read path. The current implementation is therefore substantially more stable than the earlier report described, but it is still in an intentional cutover phase rather than a fully finished post-migration steady state.
