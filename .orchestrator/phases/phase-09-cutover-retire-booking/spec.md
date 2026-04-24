# Phase 09: Cutover + Retire Booking

## Goal And Success Criteria

Retire the booking-era runtime and schema, make contact-first projection reads
the default outside production, and prove that the app no longer depends on
booking or hold state for public discovery, listing management, contact,
paywall, restoration, or saved-alert flows.

Phase 09 is approved when booking tables/enums/actions/routes/crons/UI are gone,
legacy bookmarks redirect to contact-first surfaces, non-production defaults use
the Phase 01-08 systems unless explicitly disabled, and focused/regression
checks pass with no active code references to booking-era models.

## Ordered Slices

1. Schema and artifacts: create this spec, add a destructive migration, update
   Prisma schema, add Phase 09 PGlite fixture/schema tests, and record rollback
   notes.
2. Runtime retirement: remove booking/hold actions, API routes, crons,
   state-machine/util modules, booking UI, booking nav links, and booking-only
   notifications/templates.
3. Contact-first guards and defaults: replace booking-backed review/delete/update
   gates, make Phase 01-08 flags default on outside production, preserve
   kill-switch degraded modes, and keep projection reads as the default search
   path in dev/staging.
4. Seed and smoke coverage: rewrite E2E seed around physical units,
   inventories, projections, entitlements, contact attempts, alerts, and cache
   invalidations; add static no-booking regression tests and redirect tests.
5. Closeout: run targeted and regression checks, write generator/review
   artifacts, add `APPROVED`, and advance state to Phase 10 pending after
   Critic approval.

## Target Subsystems

- `prisma/schema.prisma`, destructive migration SQL, and PGlite fixtures.
- Booking-era routes/actions/crons/components/libs/tests.
- Listing delete/update, review, viewer-state, notification/email, and nav
  surfaces that still reference bookings.
- Feature flag defaults, projection search defaults, E2E seed data, and Phase 09
  closeout artifacts.

## Invariants And Constraints

- Destructive data loss is accepted only because the repo-local plan states
  pre-launch dummy data; production retention/backup drills remain Phase 10.
- No runtime path may import or call `prisma.booking`, `BookingAuditLog`,
  `ListingDayInventory`, `booking-state-machine`, booking actions, or legacy
  hold crons after this phase.
- Public reviews remain blocked without a confirmed-stay system; contact-only
  users may use private feedback through the existing conversation gate.
- Explicit environment values override Phase 09 defaults; production defaults
  remain off until Phase 10.
- Kill switches remain available for degraded-safe operation.

## Acceptance Criteria

- The Phase 09 migration drops `Booking`, `BookingAuditLog`,
  `listing_day_inventory`, booking enums, and booking/hold-only listing columns
  with a migration comment noting pre-launch dummy data acceptance.
- `/bookings` redirects to `/messages`; `/admin/bookings` and
  `/admin/bookings/[id]` redirect to `/admin`; no redirect reads Booking data.
- Booking APIs, booking actions, booking crons, booking state-machine/util
  modules, booking UI, and booking-specific test suites are removed or replaced.
- Listing delete/update and viewer-state/review paths compile without booking
  reads and preserve contact-first safety behavior.
- Non-production defaults enable Phase 01-08 systems unless explicitly set to
  `false`; production remains explicit/off-by-default.
- `scripts/seed-e2e.js` creates a representative contact-first fixture without
  Booking/hold data.
- Static regression tests prove active code has no booking-era imports or Prisma
  booking calls.

## Validation Commands

- Phase 09 targeted Jest set.
- Phase 08 public-cache focused set.
- Phase 07 saved-search/alerts focused set.
- Phase 06 payments/contact focused set.
- Phase 04 search focused set.
- Phase 02 projection/outbox focused set.
- `pnpm exec prisma validate`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm run seed:e2e`
- Targeted Playwright contact-first smoke when practical; record any unrelated
  failures with evidence.

## Rollback Notes

Operational rollback is degraded-safe mode only: keep production Phase 01-08
defaults off until Phase 10, and use existing kill switches for list-only,
semantic-disabled, publication-disabled, payment-disabled, alert-disabled,
phone-reveal-disabled, and cache-fanout-paused behavior.

Schema rollback would require restoring the dropped booking-era tables/enums and
columns from backups or migration history. That is acceptable for this phase
because the repo-local source of truth classifies the data as pre-launch dummy
data.
