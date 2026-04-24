# Phase 09 Implementation

## Summary

Implemented Phase 09 as a destructive pre-launch cutover that retires active
booking-era runtime code and schema, makes contact-first/projection-read
behavior the non-production default, and refits focused tests around
publish-search-contact-paywall-alert flows.

## Files Changed

- `.orchestrator/phases/phase-09-cutover-retire-booking/*`
- `.orchestrator/state.json`
- `prisma/schema.prisma`
- `prisma/migrations/20260509000000_phase09_cutover_retire_booking/*`
- `package.json`
- `scripts/seed-e2e.js`
- `scripts/seed-listings.js`
- Booking actions, booking API routes, booking crons, booking libraries,
  booking components, booking E2E/load tests, and booking-specific Jest tests
  were removed.
- Legacy `/bookings`, `/admin/bookings`, and `/admin/bookings/[id]` routes now
  redirect to contact-first/admin surfaces without Booking model reads.
- Listing update/delete, review, viewer-state, messages, availability,
  notifications, email, freshness, search, projection, payments, and saved-alert
  paths were adjusted to avoid Booking/hold runtime dependencies.
- Phase 09 schema, route, cutover-default, static-retirement, and focused
  regression tests were added or updated.

## Implementation Notes

- The destructive migration drops `Booking`, `BookingAuditLog`,
  `listing_day_inventory`, the `BookingStatus` and `ListingAvailabilitySource`
  enum types, and booking/hold-only columns from `Listing`.
- Public `/bookings` bookmarks redirect to `/messages`; admin booking bookmarks
  redirect to `/admin`.
- Listing delete/update no longer blocks on booking counts or booking state.
- Public review creation remains blocked without a confirmed-stay system;
  private feedback remains conversation/contact-gated.
- Phase 01-08 feature defaults now return `true` outside production unless an
  explicit env value is `false`; production defaults remain conservative.
- Booking/hold feature flags, legacy cron flags, and booking notification flags
  default to disabled.
- Phase 02-only projection tests explicitly disable Phase 03 semantic writes
  when asserting Phase 02 publish-state behavior.
- Semantic tombstone fan-out now preflights the semantic table before deleting,
  so Phase 02-only fixtures and rollback-style checks do not abort transactions.
- `scripts/seed-e2e.js` was rewritten away from bookings and toward contact-first
  fixtures, including projections, semantic rows, entitlements, contact attempts,
  saved searches, alert deliveries, and cache invalidations.

## State Machine Result

| Surface | Phase 09 State |
|---|---|
| Booking lifecycle | Retired; no runtime transitions remain. |
| Hold lifecycle | Retired; hold crons and utilities removed. |
| Public discovery | Projection reads default on outside production. |
| Contact actions | Contact host, phone reveal, private feedback, saved alerts, and paywall flows remain canonical. |
| Legacy bookmarks | Redirect only; no Booking model reads. |

## Validation

- Phase 09 targeted Jest: 4 suites, 15 tests passed.
- Phase 08 public-cache focused set: 10 suites, 28 tests passed.
- Phase 07 saved-search/alerts focused set: 7 suites, 95 tests passed.
- Phase 06 payments focused set: 10 suites, 60 tests passed.
- Phase 04 search focused set: 7 suites, 76 tests passed.
- Phase 02 outbox/projection focused set: 14 suites, 99 tests passed.
- Search/freshness compatibility set: 3 suites, 52 tests passed.
- `pnpm exec prisma validate` passed.
- `pnpm typecheck` passed.
- `pnpm lint` passed with 0 errors and existing warnings.
- `node --check scripts/seed-e2e.js` passed.
- Static retirement scan over `src`, `scripts`, `tests`, `package.json`, and
  `vercel.json` found no active `prisma.booking`, `BookingAuditLog`,
  `ListingDayInventory`, `listing_day_inventory`, `booking-state-machine`,
  booking action import, retired booking cron, or retired load-test script
  references.

## Blocked / Deferred

- `pnpm run seed:e2e` was attempted and reached Prisma, but could not connect to
  `localhost:5433`. Docker is not installed in this WSL distro, so the local
  Postgres service could not be started from this environment. The seed script
  syntax check passed.
- Broad Jest and broad Playwright were not run; the requested focused regression
  sets above were run.
- Older docs, historic migration files, and planning reports still mention
  booking-era concepts as history. Active runtime, tests, package scripts, and
  Vercel cron config were the retirement target for this phase.
