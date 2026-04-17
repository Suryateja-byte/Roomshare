# Contact-First Multi-Slot Migration Plan

Status: Draft planning baseline  
Updated: 2026-04-15  
Scope: Planning only. No code changes are part of this document.

## Purpose

This document turns the current contact-first migration direction into a repo-specific execution plan for the existing RoomShare codebase.

It is intended to be the engineering planning baseline for replacing public booking/hold flows with a contact-first model while preserving:

- historical booking and audit data
- admin/support visibility
- legacy review eligibility
- search/list/map/detail consistency
- mixed-state rollout safety

This is a migration plan for an existing multi-slot booking system. It is not a clean-slate redesign.

## Decision Summary

### End-state direction

- Public listing flows become contact-first.
- Messaging becomes the primary CTA.
- New public booking and hold creation stops.
- Multi-slot remains, but as host-managed availability rather than booking-reserved capacity for public flows.
- Historical bookings, booking audit data, and `/bookings` history remain available.
- Public reviews remain tied to historical accepted bookings only.

### Core design choices

- Add `openSlots`; do not repurpose `availableSlots` in place.
- Keep `moveInDate` as the canonical available-from field in the database.
- Add `availableUntil`.
- Add `minStayMonths`.
- Keep `Listing.status = ACTIVE | PAUSED | RENTED`.
- Add `statusReason` instead of expanding the main status enum with `FULL/CLOSED/STALE/ARCHIVED`.
- Add `availabilitySource` to distinguish `LEGACY_BOOKING` from `HOST_MANAGED`.
- Keep `/bookings` during legacy drain, then make it read-only.
- Keep booking tables, audit logs, enum values, integrity protections, and historical rows.
- Defer phone reveal to a later project.

## Current Repo Surfaces In Scope

### Booking and availability core

- `src/app/actions/booking.ts`
- `src/app/actions/manage-booking.ts`
- `src/lib/availability.ts`
- `src/lib/booking-state-machine.ts`
- `prisma/schema.prisma`
- `prisma/migrations/*`

### Listing detail and CTA surfaces

- `src/app/listings/[id]/page.tsx`
- `src/app/listings/[id]/ListingPageClient.tsx`
- `src/components/BookingForm.tsx`
- `src/components/SlotSelector.tsx`
- `src/components/listings/SlotBadge.tsx`
- `src/components/ContactHostButton.tsx`
- `src/hooks/useAvailability.ts`
- `src/app/api/listings/[id]/viewer-state/route.ts`
- `src/components/ReviewForm.tsx`
- `src/components/DeleteListingButton.tsx`
- `src/components/ListingFreshnessCheck.tsx`
- `src/app/api/listings/[id]/status/route.ts`

### Search, map, facets, and response shaping

- `src/lib/data.ts`
- `src/lib/search/search-doc-queries.ts`
- `src/lib/search/search-v2-service.ts`
- `src/lib/search/search-doc-sync.ts`
- `src/app/api/search/facets/route.ts`
- `src/lib/search-params.ts`
- `src/lib/search/search-query.ts`
- `src/lib/search/query-hash.ts`
- `src/lib/search/search-response.ts`
- `src/lib/search/transform.ts`
- `src/lib/search/natural-language-parser.ts`
- `src/components/SearchForm.tsx`
- `src/components/search/FilterModal.tsx`
- `src/components/listings/ListingCard.tsx`
- `src/components/Map.tsx`

### Messaging and contact

- `src/components/ContactHostButton.tsx`
- `src/app/actions/chat.ts`

### Bookings history and legacy lifecycle

- `src/app/bookings/page.tsx`
- `src/app/bookings/BookingsClient.tsx`
- `src/components/BookingCalendar.tsx`
- `src/components/bookings/HoldCountdown.tsx`
- booking audit APIs/routes

### Notifications, emails, and cron

- `src/lib/notifications.ts`
- `src/lib/email.ts`
- `src/lib/email-templates.ts`
- `src/app/notifications/NotificationsClient.tsx`
- `src/app/api/cron/sweep-expired-holds/route.ts`
- `src/app/api/cron/reconcile-slots/route.ts`
- `src/app/api/cron/refresh-search-docs/route.ts`

### Listing management and admin

- `src/app/api/listings/[id]/route.ts`
- `src/app/api/listings/[id]/can-delete/route.ts`
- `src/app/actions/listing-status.ts`
- `src/app/actions/admin.ts`

### Review and trust policy

- `src/app/api/reviews/route.ts`
- `src/app/api/listings/[id]/viewer-state/route.ts`
- `src/components/ReviewForm.tsx`

### Tests

- `src/__tests__/booking/*`
- `src/__tests__/actions/*`
- `src/__tests__/components/*`
- `src/__tests__/lib/*`
- `tests/e2e/booking/*`
- `tests/e2e/multislot/*`
- `tests/e2e/concurrent/*`
- `tests/e2e/journeys/*`
- `tests/e2e/mobile/*`

## Non-Negotiable Invariants

1. A listing has exactly one authoritative public availability model at a time.
2. `HOST_MANAGED` listings never derive public availability from bookings or `ListingDayInventory`.
3. No new public booking or hold rows are created after freeze.
4. Historical accepted booking evidence remains valid for public review eligibility.
5. Search, map, facets, listing cards, listing detail, and saved-search flows must use the same normalized public availability contract.
6. `openSlots` must satisfy `0 <= openSlots <= totalSlots`.
7. `availableUntil` must be null or greater than or equal to `moveInDate`.
8. `ACTIVE` host-managed listings must be marketable and search-eligible.
9. Dirty-doc repair logic must never overwrite host-managed availability from legacy booking-derived state.
10. Rollback is reader/UI/operational only after host-managed listings go live; it is not a full semantic rollback to booking-derived truth.

## Target Data Model

### New additive fields

Add to `Listing`:

- `openSlots INT NULL`
- `availableUntil DATE NULL`
- `minStayMonths INT NOT NULL DEFAULT 1`
- `lastConfirmedAt TIMESTAMPTZ NULL`
- `availabilitySource ENUM('LEGACY_BOOKING','HOST_MANAGED') NOT NULL DEFAULT 'LEGACY_BOOKING'`
- `needsMigrationReview BOOLEAN NOT NULL DEFAULT false`
- `statusReason VARCHAR(...) NULL` or a small additive enum
- optional freshness timestamps:
  - `freshnessReminderSentAt`
  - `freshnessWarningSentAt`
  - `autoPausedAt`

### Existing fields retained

- `totalSlots`
- `availableSlots` as temporary compatibility shadow
- `moveInDate`
- `status`
- `version`
- `bookingMode` retained initially for compatibility and structural translation only

### Booking data retained

- `Booking`
- `BookingAuditLog`
- legacy status enum values including `HELD` and `EXPIRED`
- integrity constraints and historical relations

## Status Model

### Internal meaning

- `ACTIVE`: public and currently marketable
- `PAUSED`: temporarily hidden, blocked, stale-paused, or under migration/admin control
- `RENTED`: not currently marketable because the availability cohort is closed

### `statusReason`

Initial reasons:

- `NO_OPEN_SLOTS`
- `AVAILABLE_UNTIL_PASSED`
- `HOST_PAUSED`
- `ADMIN_PAUSED`
- `MIGRATION_REVIEW`
- `LEGACY_DRAIN`
- `STALE_AUTO_PAUSE`
- `MANUAL_CLOSED`
- `MODERATION_LOCK`
- `LEGACY_UNKNOWN`

### User-facing labels

- `ACTIVE` => Available
- `RENTED + NO_OPEN_SLOTS` => Full
- `RENTED + AVAILABLE_UNTIL_PASSED` => Closed
- `PAUSED + STALE_AUTO_PAUSE` => Needs reconfirmation (host/admin-facing)

## Freshness Rules

- Day 0-13 after `lastConfirmedAt`: normal
- Day 14: reminder only
- Day 21: stale warning
  - remove from search, map, facets, and alerts
  - direct listing detail may still render with warning
- Day 30: auto-pause
  - set `status = PAUSED`
  - set `statusReason = STALE_AUTO_PAUSE`

Only explicit reconfirmation or availability-affecting edits should reset `lastConfirmedAt`.

## Execution Plan

## Phase 0 - Planning Baseline and Preconditions

### Goal

Prepare the system for migration without changing user behavior.

### Deliverables

- canonical migration plan
- search contract inventory
- mixed-state invariants
- observability requirements
- messaging race-condition prerequisite plan

### Tickets

#### CFM-001 - Create migration inventory and owner map

- Goal: enumerate all repo surfaces participating in booking, availability, search, reviews, messaging, admin, cron, and tests
- Primary files:
  - all files listed in "Current Repo Surfaces In Scope"
  - authoritative output: [`docs/migration/cfm-inventory.md`](../migration/cfm-inventory.md)
- Output:
  - dependency matrix (see §4 of `cfm-inventory.md`)
  - owners/reviewers list (single owner convention declared in the doc header)
  - migration sequence map (see §4.2 of `cfm-inventory.md`)
- Acceptance:
  - each affected route, action, job, and UI surface has a migration owner
  - each surface is classified as reader, writer, repair loop, or history-only

#### CFM-002 - Define canonical normalized search contract

- Goal: define the single internal search filter object and response snapshot to be used after cutover
- Primary files:
  - `src/lib/search-params.ts`
  - `src/lib/search/search-query.ts`
  - `src/lib/search/query-hash.ts`
  - `src/lib/search/search-response.ts`
  - `src/lib/search/transform.ts`
  - `src/lib/search/natural-language-parser.ts`
- Output:
  - normalized input contract
  - normalized response contract
  - deprecation map for legacy params
  - **Docs: [`docs/search-contract.md`](../search-contract.md)** (CFM-002, committed)
- Acceptance:
  - contract covers `minSlots`, `moveInDate`, current stay-length inputs, and `bookingMode`
  - query-hash versioning strategy documented
  - backward-compat rules documented

#### CFM-003 - Treat messaging dedup/race fix as rollout precondition

- Goal: make sure contact-first does not shift traffic onto a known-racy contact path
- Primary files:
  - `src/app/actions/chat.ts`
  - `src/components/ContactHostButton.tsx`
- Output:
  - precondition ticket
  - definition of done for conversation dedup and multi-click safety
- Acceptance:
  - public CTA cutover cannot start until this precondition is complete

#### CFM-004 - Add migration observability plan

- Goal: define the metrics, alerts, dashboards, and log dimensions required before rollout
- Primary files:
  - docs only in this phase — authoritative spec: [`docs/migration/cfm-observability.md`](../migration/cfm-observability.md)
- Output:
  - migration dashboard spec
  - dirty-doc divergence checks
  - stale listing monitoring
  - legacy write leakage monitoring
- Acceptance:
  - every P0/P1 migration failure mode has an observable signal (see §3 and §8 of `cfm-observability.md`)

### Exit Criteria

- Search contract is defined.
- Messaging precondition is formalized.
- Rollout observability requirements are written down.

## Phase 1 - Freeze Public Booking Creation and Ship Compatibility Responses

### Goal

Stop growth of the booking system while preserving legacy drain and keeping old clients stable.

### Tickets

#### CFM-101 - Freeze `createBooking` and `createHold`

- Goal: hard-stop new public booking and hold creation
- Primary files:
  - `src/app/actions/booking.ts`
- Changes:
  - return stable domain errors for booking-disabled and hold-disabled
  - do not return 500s for deprecated flows
- Acceptance:
  - zero successful new booking/hold writes after freeze
  - direct action/API hits receive deterministic disable responses

#### CFM-102 - Switch listing page primary CTA to contact-first

- Goal: remove booking as the primary user action without breaking the page
- Primary files:
  - `src/app/listings/[id]/page.tsx`
  - `src/app/listings/[id]/ListingPageClient.tsx`
  - `src/components/ContactHostButton.tsx`
  - `src/components/BookingForm.tsx`
  - `src/components/SlotSelector.tsx`
- Acceptance:
  - listing detail shows contact-first CTA
  - booking/hold CTA is hidden or rendered inactive in all active public bundles

#### CFM-103 - Make `viewer-state` a dual-shape compatibility contract

- Goal: preserve older clients while exposing contact-first semantics
- Primary files:
  - `src/app/api/listings/[id]/viewer-state/route.ts`
- New fields:
  - `primaryCta`
  - `canContact`
  - `availabilitySource`
  - `publicAvailability`
  - `reviewEligibility`
- Compatibility fields:
  - `canBook = false`
  - `canHold = false`
  - booking-related fields null or deprecated safely
- Acceptance:
  - old bundles do not crash
  - new bundles can rely on contact-first fields

#### CFM-104 - Keep `/bookings` interactive only for legacy rows

- Goal: preserve lifecycle handling for old rows while blocking all new creation
- Primary files:
  - `src/app/bookings/page.tsx`
  - `src/app/bookings/BookingsClient.tsx`
  - `src/app/actions/manage-booking.ts`
- Acceptance:
  - existing permitted transitions still work
  - no new booking lifecycle begins from public listing surfaces

### Exit Criteria

- Booking/hold creation is frozen.
- Listing detail presents contact-first CTA.
- `viewer-state` remains backward-compatible.

## Phase 2 - Additive Schema and Compatibility Layer

### Goal

Introduce new host-managed fields without changing authoritative public search behavior yet.

### Tickets

#### CFM-201 - Add new listing fields and constraints

- Goal: create the additive schema for host-managed availability
- Primary files:
  - `prisma/schema.prisma`
  - `prisma/migrations/*`
- Fields:
  - `openSlots`
  - `availableUntil`
  - `minStayMonths`
  - `lastConfirmedAt`
  - `availabilitySource`
  - `needsMigrationReview`
  - `statusReason`
  - optional freshness timestamps
- Acceptance:
  - migration is additive
  - safe rollback notes exist
  - no destructive rewrite of legacy enums/tables

#### CFM-202 - Introduce compatibility serializers and DTO shape

- Goal: support old and new readers together
- Primary files:
  - listing serializers/DTO helpers
  - `src/lib/search/search-response.ts`
  - `src/lib/search/transform.ts`
- Rules:
  - support new `publicAvailability` block
  - dual-populate compatibility aliases where needed
- Acceptance:
  - readers can consume old or new shapes without ambiguity

#### CFM-203 - Define authoritative source rules by availability model

- Goal: prevent legacy repair logic from clobbering host-managed state
- Primary files:
  - `src/lib/availability.ts`
  - `src/app/api/cron/reconcile-slots/route.ts`
  - `src/lib/search/search-doc-sync.ts`
- Acceptance:
  - authoritative source rules are explicit
  - legacy repair paths skip host-managed availability computation

### Exit Criteria

- Schema is ready.
- New fields exist.
- Compatibility shapes are documented.

## Phase 3 - Shared Write Validation and Freshness Controls

### Goal

Create one safe write path for host-managed availability before real listings migrate.

### Tickets

#### CFM-301 - Build shared host-managed validation/transition helper

- Goal: unify write rules across PATCH, status actions, and admin override paths
- Primary files:
  - `src/app/api/listings/[id]/route.ts`
  - `src/app/actions/listing-status.ts`
  - `src/app/actions/admin.ts`
- Rules enforced:
  - merged-next-state validation
  - `version` compare-and-swap
  - mixed-state protection
  - `openSlots`, dates, `status`, `minStayMonths`, and `availabilitySource` invariants
- Acceptance:
  - all listing write entrypoints use the same validation path
  - stale clients are rejected safely when payload semantics are mixed

#### CFM-302 - Add host-managed edit contract

- Goal: define the authoritative PATCH contract for host-managed listing edits
- Primary files:
  - `src/app/api/listings/[id]/route.ts`
  - host listing edit form components
- Acceptance:
  - required fields and machine error codes are documented
  - invalid combinations are rejected deterministically
- Docs: [`docs/host-managed-patch-contract.md`](../host-managed-patch-contract.md) (CFM-302, committed)

#### CFM-303 - Implement freshness read model

- Goal: add additive freshness metadata and public status snapshot semantics
- Primary files:
  - `src/app/api/listings/[id]/status/route.ts`
  - `src/components/ListingFreshnessCheck.tsx`
- Output:
  - `publicStatus`
  - `statusReason`
  - `searchEligible`
  - `freshnessBucket`
  - `staleAt`
  - `autoPauseAt`
- Acceptance:
  - owner and admin can see freshness state clearly
  - public readers can consume additive fields without enum churn

#### CFM-304 - Build stale recovery UX and mutation flow

- Goal: let hosts recover listings after stale warning or auto-pause
- Primary files:
  - `src/components/ListingFreshnessCheck.tsx`
  - `src/app/actions/listing-status.ts`
  - host listing settings/edit UI
- Acceptance:
  - reconfirmation resets `lastConfirmedAt`
  - stale recovery does not bypass slot/date invariants

### Exit Criteria

- Shared write path exists conceptually and in backlog.
- Freshness model is defined before migration.

## Phase 4 - Search Contract Normalization and Dirty-Doc Hardening

### Goal

Normalize search end-to-end before any public host-managed search cutover.

### Tickets

#### CFM-401 - Normalize search input parsing

- Goal: translate current URL/search inputs into a single canonical filter object
- Primary files:
  - `src/lib/search-params.ts`
  - `src/lib/search/natural-language-parser.ts`
- Rules:
  - keep current public params accepted
  - translate or ignore deprecated booking-only params
  - preserve old saved URLs
- Acceptance:
  - old URLs parse cleanly
  - canonical object is used downstream

#### CFM-402 - Move query building to canonical normalized filters

- Goal: stop raw param handling deeper in the stack
- Primary files:
  - `src/lib/search/search-query.ts`
  - `src/lib/data.ts`
  - `src/lib/search/search-v2-service.ts`
  - `src/app/api/search/facets/route.ts`
- Acceptance:
  - search, list, map, and facets consume the same normalized filter contract

#### CFM-403 - Version query hashing and cache semantics

- Goal: prevent cache bleed across mixed rollout shapes
- Primary files:
  - `src/lib/search/query-hash.ts`
- Acceptance:
  - normalized-equivalent queries hash identically
  - contract version and response shape version are salted explicitly

#### CFM-404 - Add normalized public availability response block

- Goal: shape a single availability snapshot for cards, results, and details
- Primary files:
  - `src/lib/search/search-response.ts`
  - `src/lib/search/transform.ts`
- Acceptance:
  - `publicAvailability` exists
  - compatibility aliases remain until all readers migrate

#### CFM-405 - Harden dirty-doc pipeline

- Goal: make search projection durable and version-aware
- Primary files:
  - `src/lib/search/search-doc-sync.ts`
  - `src/app/api/cron/refresh-search-docs/route.ts`
- Rules:
  - dirty mark in same transaction as source write
  - best-effort immediate single-doc refresh
  - cron repair loop remains authoritative backstop
  - add doc/listing version divergence detection
- Acceptance:
  - refresh can tolerate failures without losing eventual consistency
  - divergence can be monitored and repaired

#### CFM-406 - Treat map as separate rollout surface

- Goal: eliminate list/map drift during cutover
- Primary files:
  - `src/components/Map.tsx`
  - map data endpoints or fetch paths
- Acceptance:
  - map consumes the same normalized filters and response contract as list search

### Exit Criteria

- Normalized search contract is implemented conceptually and decomposed into work.
- Dirty-doc and map behavior are part of the same rollout, not later cleanup.

## Phase 5 - Host Migration and Cohort Backfill

### Goal

Switch eligible listings from legacy booking availability to host-managed availability safely.

### Tickets

#### CFM-501 - Build migration cohort classifier

- Goal: classify listings into clean, blocked, or manual-review cohorts
- Primary files:
  - migration scripts or admin reporting queries
  - `src/app/actions/admin.ts`
- Cohorts:
  - clean auto-convert
  - blocked by legacy bookings/holds or complex inventory
  - anomalous/manual review
- Acceptance:
  - classification rules are explicit and reproducible

#### CFM-502 - Backfill host-managed fields conservatively

- Goal: populate host-managed fields for convertible listings only
- Primary files:
  - migration scripts
  - admin tooling
- Rules:
  - set `availabilitySource = HOST_MANAGED` only for safe listings
  - set `openSlots` conservatively
  - set `needsMigrationReview` when required
  - dual-write `availableSlots = openSlots`
- Acceptance:
  - no ambiguous listing becomes host-managed automatically

#### CFM-503 - Add migration review workflow for blocked listings

- Goal: let host/admin safely review and convert listings that cannot be auto-converted
- Primary files:
  - host settings/edit surfaces
  - admin migration tooling
- Acceptance:
  - blocked listings are paused or held from public search until reviewed

#### CFM-504 - Enforce mixed-state edit restrictions

- Goal: prevent wrong edits during migration
- Primary files:
  - `src/app/api/listings/[id]/route.ts`
  - host edit surfaces
- Acceptance:
  - legacy listings reject host-managed inventory writes
  - host-managed listings reject legacy semantics

### Exit Criteria

- Cohorting rules exist.
- Safe backfill path exists.
- Mixed-state edit protection exists.

## Phase 6 - Public Search, Map, Facets, Card, and Detail Cutover

### Goal

Switch public discovery and listing detail to one host-managed availability model.

### Tickets

#### CFM-601 - Cut search result eligibility to normalized host-managed predicate

- Goal: stop public discovery from using booking-derived availability
- Primary files:
  - `src/lib/search/search-v2-service.ts`
  - `src/lib/search/search-query.ts`
  - `src/lib/search/search-doc-queries.ts`
  - `src/lib/data.ts`
- Acceptance:
  - host-managed active listings use normalized predicate everywhere
  - legacy-drain listings are paused or excluded from public search

#### CFM-602 - Cut map to same predicate and response shape

- Goal: prevent list/map mismatch
- Primary files:
  - `src/components/Map.tsx`
  - map fetch paths
- Acceptance:
  - same canonical query and availability snapshot as list results

#### CFM-603 - Migrate cards, detail, and status readers

- Goal: make public UI consistent across result card, popup, and detail page
- Primary files:
  - `src/components/listings/ListingCard.tsx`
  - `src/components/listings/SlotBadge.tsx`
  - `src/app/listings/[id]/ListingPageClient.tsx`
  - `src/app/api/listings/[id]/status/route.ts`
- Acceptance:
  - slot count, label, freshness, and availability dates match across surfaces

#### CFM-604 - Preserve old saved URLs and canonicalize on write

- Goal: prevent breaking old links while moving to normalized semantics
- Primary files:
  - saved search and URL builder helpers
  - `src/components/SearchForm.tsx`
  - `src/components/search/FilterModal.tsx`
- Acceptance:
  - old search links work
  - newly edited or saved URLs are canonicalized

### Exit Criteria

- List, map, facets, card, and detail all use one public availability contract.

## Phase 7 - Public UI Cleanup and Review/Feedback Policy Alignment

### Goal

Finish the public contact-first experience and align review behavior with the real trust model.

### Tickets

#### CFM-701 - Remove remaining public booking semantics from listing detail

- Goal: eliminate leftover booking/hold UI and copy
- Primary files:
  - `src/components/BookingForm.tsx`
  - `src/components/SlotSelector.tsx`
  - `src/hooks/useAvailability.ts`
  - `src/app/listings/[id]/ListingPageClient.tsx`
- Acceptance:
  - no public page implies hold or reservation semantics
  - no public listing page relies on transactional live availability polling

#### CFM-702 - Align review copy and viewer-state eligibility

- Goal: stop teaching a removed flow while preserving legacy review rights
- Primary files:
  - `src/components/ReviewForm.tsx`
  - `src/app/api/reviews/route.ts`
  - `src/app/api/listings/[id]/viewer-state/route.ts`
- Acceptance:
  - review copy references historical booked stays, not booking requests
  - legacy accepted-booking reviews still work

#### CFM-703 - Add private feedback path for contact-only interactions

- Goal: provide a non-public feedback route without weakening trust rules
- Primary files:
  - new or adjacent moderation/support feedback surface
  - `viewer-state` consumers
- Acceptance:
  - contact-only interactions do not unlock public reviews
  - support can receive private feedback where appropriate

### Exit Criteria

- Public UI is fully contact-first.
- Review policy matches backend eligibility.

## Phase 8 - Freshness Jobs and Operations Cutover

### Goal

Make freshness and search projection operations authoritative for host-managed listings.

### Tickets

#### CFM-801 - Build freshness reminder and stale-warning jobs

- Goal: automate the freshness lifecycle
- Primary files:
  - cron/job surfaces
  - `src/app/actions/listing-status.ts`
  - notification/email layers
- Acceptance:
  - reminders and warnings are emitted at defined thresholds
  - warnings affect search eligibility consistently

#### CFM-802 - Build stale auto-pause flow

- Goal: auto-pause stale listings defensively
- Primary files:
  - cron/jobs
  - status mutation path
- Acceptance:
  - day-30 stale listings transition to `PAUSED + STALE_AUTO_PAUSE`
  - host/admin recovery path exists before job goes live

#### CFM-803 - Finalize dirty-doc monitoring and repair loops

- Goal: operationalize DB-vs-index consistency
- Primary files:
  - `src/app/api/cron/refresh-search-docs/route.ts`
  - search doc sync code
- Acceptance:
  - divergence alerts exist
  - dirty queue age and refresh lag are monitored

### Exit Criteria

- Freshness jobs are safe to run in production.
- Recovery and monitoring exist.

## Phase 9 - Legacy Booking Drain and Read-Only History

### Goal

Drain remaining legacy workflows and preserve history.

### Tickets

#### CFM-901 - Convert `/bookings` to history-first surface

- Goal: keep access to history while removing active product role
- Primary files:
  - `src/app/bookings/page.tsx`
  - `src/app/bookings/BookingsClient.tsx`
  - `src/components/BookingCalendar.tsx`
  - `src/components/bookings/HoldCountdown.tsx`
- Acceptance:
  - normal users no longer manage new booking lifecycle
  - history remains available to participants

#### CFM-902 - Disable legacy lifecycle mutations after drain

- Goal: stop interactive booking state mutation once old rows are terminal
- Primary files:
  - `src/app/actions/manage-booking.ts`
  - booking lifecycle routes/actions
- Acceptance:
  - non-admin transitions are disabled only after drain completion criteria are met

#### CFM-903 - Turn off booking-only notifications and emails

- Goal: retire old active-flow comms without losing history
- Primary files:
  - `src/lib/notifications.ts`
  - `src/lib/email.ts`
  - `src/lib/email-templates.ts`
  - `src/app/notifications/NotificationsClient.tsx`
- Acceptance:
  - booking-create/hold flow notifications stop
  - historical and admin visibility remain

#### CFM-904 - Retire sweeper and slot reconciliation only when safe

- Goal: stop booking-only operational jobs after they are truly unused
- Primary files:
  - `src/app/api/cron/sweep-expired-holds/route.ts`
  - `src/app/api/cron/reconcile-slots/route.ts`
- Acceptance:
  - no `HELD` rows remain for cooling window before sweeper shutdown
  - no public path depends on legacy slot repair before reconcile shutdown

### Exit Criteria

- Legacy booking lifecycle is drained.
- `/bookings` is history-first.

## Phase 10 - Final Cleanup

### Goal

Remove dead active-product code while keeping historical data structures.

### Tickets

#### CFM-1001 - Remove dead public booking UI and create paths

- Goal: delete dead code from active product paths
- Primary files:
  - `src/components/BookingForm.tsx`
  - `src/components/SlotSelector.tsx`
  - related public create paths
- Acceptance:
  - no public codepath references booking creation

#### CFM-1002 - Remove booking-only search filters and compatibility aliases when safe

- Goal: clean up translation layers after old clients and URLs have aged out
- Primary files:
  - search params/query/response/transform files
- Acceptance:
  - deprecation telemetry is low enough
  - no supported client depends on compatibility aliases

#### CFM-1003 - Keep historical tables and audit structures intact

- Goal: explicitly separate cleanup from destructive data removal
- Primary files:
  - docs and retention policies
- Acceptance:
  - no early plan exists to drop booking tables, enums, or audit logs

### Exit Criteria

- Active product code is clean.
- Historical data remains queryable.

## Cross-Cutting Acceptance Gates

## Search and UI Consistency Gate

- Search, map, facets, listing cards, listing detail, and saved-search reopen all use the same normalized public availability snapshot.
- Normalized-equivalent queries hash identically.
- Old saved URLs still resolve.

## Booking Freeze Gate

- Zero successful `createBooking` writes after freeze timestamp.
- Zero successful `createHold` writes after freeze timestamp.
- `viewer-state` never exposes `canBook=true` or `canHold=true` for public flows after freeze.

## Host-Managed Invariant Gate

- No `HOST_MANAGED` listing has non-terminal legacy bookings that can still mutate public availability.
- No `HOST_MANAGED` listing violates slot or date invariants.
- No legacy repair job recomputes host-managed availability from bookings.

## Review and Trust Gate

- Public reviews remain tied to accepted-booking history only.
- Contact-only interactions do not unlock public reviews.
- Historical accepted-booking users can still review after migration.

## Freshness Gate

- Reminder, warning, and auto-pause thresholds behave as designed.
- Stale listings are removed from search before auto-pause.
- Auto-paused listings can be recovered through host/admin flows.

## Operational Safety Gate

- Dirty-doc queue age is monitored.
- DB-vs-index divergence is monitored.
- Messaging dedup and contact CTA safety are verified before public CTA cutover.

## Test Plan Breakdown

### Unit

- normalized search-param parsing
- query-hash versioning
- host-managed validation helper
- `statusReason` mapping
- freshness threshold computation
- review eligibility rules

### Integration

- `viewer-state` dual-shape compatibility
- listing PATCH optimistic locking and machine error codes
- dirty-doc mark + immediate refresh + cron fallback
- search response compatibility aliases
- mixed-state edit rejection

### E2E

- listing detail shows contact-first CTA
- contact flow opens or resumes conversation
- host edits update slot counts and status consistently
- zero-slot handling transitions correctly
- stale listing hides and auto-pauses correctly
- old search URLs continue to work
- list and map stay aligned
- legacy accepted-booking user can still review
- contact-only user cannot public-review

### Operational / Release Verification

- zero post-freeze create writes
- dirty-doc backlog within threshold
- stale-client compatibility smoke tests
- migration cohort spot checks

## Rollback Model

### Safe rollback before host-managed go-live

- revert UI readers and action gating by feature flag if required
- keep additive schema in place
- keep booking lifecycle intact

### Safe rollback after host-managed go-live

- pause affected listings
- revert readers if necessary
- do not restore booking-derived availability as authoritative for already migrated listings
- keep search repair and admin recovery available

## Open Questions Requiring Product or Engineering Sign-Off

1. What exact current search param represents stay length in the live product, if any?
2. What is the final acceptable shape for `statusReason`: string column or enum?
3. Is `bookingMode` still needed as a structural listing attribute after migration, or only as a deprecated translation layer?
4. What is the final owner-facing UX for reopening a `RENTED` listing?
5. Should contact-only private feedback exist at launch or later?
6. What exact admin workflows need read-only booking history vs mutation capability during drain?
7. How long should compatibility aliases remain supported after public cutover?

## Recommended Implementation Order

1. Finish planning, observability, and messaging precondition work.
2. Freeze new booking/hold creation and ship `viewer-state` compatibility.
3. Add schema and compatibility serializers.
4. Build shared host-managed write validation and freshness controls.
5. Normalize search contracts and harden dirty-doc pipeline.
6. Cohort and migrate safe listings.
7. Cut search, map, facets, card, and detail together.
8. Clean up public UI and align review/feedback behavior.
9. Turn on freshness jobs and operational repair loops for host-managed listings.
10. Drain legacy booking flows and move `/bookings` to history-first.
11. Remove dead active-product booking code after the system is stable.

## Document Usage

This file should be used as the source planning document for:

- engineering breakdown into tickets
- migration design review
- schema/migration review
- search cutover review
- QA test matrix generation
- rollout and rollback runbook preparation

It should be updated if the team changes:

- the meaning of `RENTED`
- the shape of `statusReason`
- the final search contract
- the messaging/contact trust model
- legacy drain criteria
