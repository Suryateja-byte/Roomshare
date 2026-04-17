# CFM Migration Inventory & Owner Map

> **Scope**: authoritative catalogue of every repo surface that participates in the contact-first multi-slot (CFM) migration, classified by role, tagged with the CFM phases that touch it, annotated with current migration status, and indexed into a dependency matrix.
>
> **Purpose**: when an executor picks up any CFM ticket they must be able to look at exactly one document and answer: which files move in this phase, what role those files play (reader / writer / repair-loop / history-only / notification), which tickets already landed work there, and what still blocks which.
>
> **Owner convention** (single-dev codebase per `CLAUDE.md`): `Owner = @Suryateja-byte; Reviewer = critic-agent (in-session) / human post-merge`. This convention applies to every row below and is not repeated per-line.
>
> **Last verified**: 2026-04-16 (branch `codex/contact-first-multislot`). Any cross-cutting CFM PR MUST update this date + the affected rows.
>
> **Cross-links**:
> - [`docs/plans/cfm-migration-plan.md`](../plans/cfm-migration-plan.md) — upstream plan (the "Current Repo Surfaces In Scope" section on lines 45–135 is the seed list for this inventory).
> - [`docs/migration/cfm-observability.md`](./cfm-observability.md) — observability coverage for every surface listed here.
> - [`docs/search-contract.md`](../search-contract.md) / [`docs/host-managed-patch-contract.md`](../host-managed-patch-contract.md) — the two contracts the reader/writer surfaces below align to.
> - `.claude/task-tracker.json` — live per-ticket status; the tables below reflect the 2026-04-16 snapshot.

---

## 1. Classification Key

| Role | Meaning |
|---|---|
| **reader** | Reads public availability / listing state. Must use the normalized CFM-002/CFM-404 shape post-cutover. |
| **writer** | Mutates listing, booking, hold, slot, or availability state. Must satisfy CFM-201/CFM-301/CFM-401 contracts post-cutover. |
| **repair-loop** | Cron or background job that reconciles derived state. MUST NOT touch `HOST_MANAGED` availability (Non-negotiable Invariant #9). |
| **history-only** | Serves read-only historical data (accepted bookings, audit logs). Retained for Invariant #4 (review eligibility). |
| **notification** | Email/push/in-app side effect with no state mutation beyond its own delivery metadata. |
| **test** | Jest or Playwright suite gating the migration contract. |
| **contract** | Pure DTO / zod schema / type definition; the shape other code agrees on. |

| Migration status | Meaning |
|---|---|
| **done** | Ticket approved and committed on this branch. Confirmed against `.claude/task-tracker.json` + recent commit log. |
| **in_flight** | Currently being worked (with critic or in revise loop). |
| **partially_done** | Some subset of acceptance criteria landed; audit marked "revise". See tracker. |
| **done_needs_audit** | Code from an earlier session is already present but was never audited against the current plan. |
| **not_started** | No code or doc yet. |
| **deferred** | Explicitly postponed to a later phase or release. |

---

## 2. Surface Inventory

### 2.1 Booking & availability core (phases 1–3, 9)

| Path | Type | Role | Touches | Phase(s) | Status | Notes |
|---|---|---|---|---|---|---|
| `src/app/actions/booking.ts` | server action | writer | booking, hold, inventory | 1, 4, 9 | not_started | Target of CFM-101 freeze. CFM-405c already wired `markListingsDirtyInTx` at commit time. |
| `src/app/actions/manage-booking.ts` | server action | writer | booking, inventory | 1, 9 | not_started | Accept / decline / cancel legacy lifecycle. CFM-902 gates mutation disable. |
| `src/lib/availability.ts` | library | reader (legacy), writer-helper | inventory | 2, 4 | done_needs_audit | Legacy computation; CFM-404 response-block + CFM-601 predicate supersede most reads. |
| `src/lib/booking-state-machine.ts` | library | writer-helper | booking | 1, 9 | done_needs_audit | Legacy lifecycle transitions; history-only by CFM-902. |
| `src/lib/booking-audit.ts` | library | history-only | booking | retained | done_needs_audit | BookingAuditLog writer; Invariant #4 retained. |
| `src/lib/booking-utils.ts` | library | reader/writer-helper | booking | 1, 9 | done_needs_audit | Shared helpers; audit for post-freeze references. |
| `prisma/schema.prisma` | contract (DB) | writer (schema) | listing, booking, search-doc | 2, 10 | done_needs_audit | Additive schema from CFM-201 landed. CFM-1002 retires legacy columns. |
| `prisma/migrations/*` | contract (DB) | writer (schema) | listing, booking | 2, 4, 10 | done_needs_audit | Includes `20260416000000_add_search_doc_projection_version` (CFM-405a) — verified. |

### 2.2 Listing detail & CTA surfaces (phases 1, 3, 6, 7, 10)

| Path | Type | Role | Touches | Phase(s) | Status | Notes |
|---|---|---|---|---|---|---|
| `src/app/listings/[id]/page.tsx` | route (SSR) | reader | listing, messaging | 1, 6, 7 | done_needs_audit | CFM-102 primary CTA switch. |
| `src/app/listings/[id]/ListingPageClient.tsx` | client component | reader | listing, messaging | 1, 6, 7, 10 | done_needs_audit | Hosts ContactHostButton and (legacy) BookingForm. CFM-1001 removes legacy paths. |
| `src/app/listings/[id]/ListingViewTracker.tsx` | client component | reader | analytics | — | done_needs_audit | View telemetry — unaffected. |
| `src/app/listings/[id]/edit/**` | route | writer (host) | listing | 3, 5 | done_needs_audit | Hosts use dedicated host-managed PATCH. CFM-302 contract + CFM-504 mixed-state guard in place. |
| `src/app/listings/[id]/error.tsx` / `not-found.tsx` | route shell | — | — | — | n/a | Unaffected. |
| `src/components/BookingForm.tsx` | client component | writer (legacy) | booking | 1, 10 | not_started | Removed by CFM-101 CTA switch + CFM-1001. |
| `src/components/SlotSelector.tsx` | client component | writer (legacy) | inventory | 1, 10 | not_started | Same as BookingForm. |
| `src/components/listings/SlotBadge.tsx` | client component | reader | listing | 6 | partially_done | CFM-603 APPROVED: freshness-aware labels + `publicAvailability` prop. |
| `src/components/listings/ListingCard.tsx` | client component | reader | listing | 6 | partially_done | CFM-603 APPROVED: prefers `publicAvailability`. |
| `src/components/listings/ListingCardCarousel.tsx` | client component | reader | listing | 6 | done_needs_audit | Wraps ListingCard; passive. |
| `src/components/listings/ImageCarousel.tsx` / `RoomPlaceholder.tsx` / `NearMatchSeparator.tsx` / `ImageUploader.tsx` / `ListScrollBridge.tsx` | client component | reader / writer (images) | listing | — | n/a | Unaffected by CFM semantics. |
| `src/components/ContactHostButton.tsx` | client component | writer (messaging) | messaging | 0, 1, 7 | not_started | Target of CFM-003 dedup precondition. Phase 1 guarantees it is the primary CTA. |
| `src/components/ReviewForm.tsx` | client component | writer (review) | review | 7 | not_started | Gated by CFM-702 eligibility alignment. |
| `src/components/DeleteListingButton.tsx` | client component | writer | listing | — | done_needs_audit | Uses `can-delete` pre-flight. |
| `src/components/ListingFreshnessCheck.tsx` | client component | writer | listing | 3, 8 | done_needs_audit | Host-triggered reconfirm — feeds CFM-303 / CFM-801. |
| `src/hooks/useAvailability.ts` | hook | reader | availability | 1, 4, 6 | done_needs_audit | Replaced by `publicAvailability` reads post-CFM-603. |
| `src/app/api/listings/[id]/viewer-state/route.ts` | API route | reader | listing, availability | 1, 7 | done_needs_audit | CFM-103 dual-shape compatibility. Hard observability gate (Phase 1). |
| `src/app/api/listings/[id]/status/route.ts` | API route | writer | listing | 3, 5 | done_needs_audit | Status transitions; gated by host-managed validation. |
| `src/app/api/listings/[id]/availability/route.ts` | API route | reader | availability | 4, 6 | done_needs_audit | Already exists; audit target for CFM-404/CFM-603. |

### 2.3 Search, map, facets, response shaping (phase 4, 6)

| Path | Type | Role | Touches | Phase(s) | Status | Notes |
|---|---|---|---|---|---|---|
| `src/lib/data.ts` | library | reader | listing, search | 4, 6 | done_needs_audit | CFM-601 cut list query to canonical availability predicate. |
| `src/lib/search-params.ts` | library | contract | search | 4 | done_needs_audit | CFM-401 parse + canonicalize (URL → normalized). |
| `src/lib/search/search-query.ts` | library | contract | search | 4 | done_needs_audit | CFM-401 normalizer. |
| `src/lib/search/query-hash.ts` | library | contract | search | 4 | done_needs_audit | CFM-403 versioned hash + `SEARCH_QUERY_HASH_VERSION`. |
| `src/lib/search/hash.ts` | library | contract | search | 4 | done_needs_audit | 64-bit FNV-1a primitive; golden fixture guards bumps. |
| `src/lib/search/search-response.ts` | library | contract | search | 4 | done_needs_audit | CFM-404 response shape + `SEARCH_RESPONSE_VERSION`. |
| `src/lib/search/transform.ts` | library | contract | search | 4 | done_needs_audit | Row → DTO mapper; audited by CFM-404. |
| `src/lib/search/public-availability.ts` | library | contract | availability | 4, 6 | done_needs_audit | The normalized `PublicAvailability` reader type. |
| `src/lib/search/search-v2-service.ts` | library | reader | search | 4, 6 | done_needs_audit | Core query + cache path. |
| `src/lib/search/search-doc-queries.ts` | library | reader | search, availability | 4, 6 | done_needs_audit | CFM-601 canonical-availability cut landed (commit `2569b768`). |
| `src/lib/search/search-doc-sync.ts` | library | repair-loop (write) | search-doc | 4, 8 | partially_done | CFM-405a added `SEARCH_DOC_PROJECTION_VERSION` and version-skew detection. |
| `src/lib/search/search-doc-dirty.ts` | library | writer (dirty-mark) | search-doc | 4 | partially_done | CFM-405a added `markListingDirtyInTx` / `markListingsDirtyInTx`. |
| `src/lib/search/search-orchestrator.ts` | library | reader | search | 4 | done_needs_audit | SSR orchestration. |
| `src/lib/search/search-intent.ts` | library | reader | search | 4 | done_needs_audit | Classifies user intent (recommended / map / list). |
| `src/lib/search/cursor.ts` | library | contract | search | 4 | done_needs_audit | Cursor pagination. |
| `src/lib/search/listing-detail-link.ts` | library | reader | search | 6 | done_needs_audit | Canonical detail-link builder. |
| `src/lib/search/split-stay.ts` / `recommended-score.ts` / `location-bounds.ts` / `natural-language-parser.ts` | library | contract / reader | search | 4, 6 | done_needs_audit | Scoring + NL parsing helpers. |
| `src/lib/search/types.ts` | library | contract | search | 4 | done_needs_audit | Shared types. |
| `src/lib/search/search-telemetry.ts` / `search-telemetry-client.ts` | library | notification | search | 4, 8 | done_needs_audit | Emits to `/api/metrics/search`; extended by CFM-801/803. |
| `src/app/api/search/v2/route.ts` | API route | reader | search | 4 | done_needs_audit | List API. |
| `src/app/api/search/listings/route.ts` | API route | reader | search | 4 | done_needs_audit | Canonical listings endpoint. |
| `src/app/api/search/facets/route.ts` | API route | reader | search | 4, 6 | done_needs_audit | Facet counts; must share predicate (Invariant #5). |
| `src/app/api/map-listings/route.ts` | API route | reader | search, map | 4, 6 | not_started | CFM-406 separate map rollout + CFM-602 map cutover. |
| `src/app/api/search-count/route.ts` | API route | reader | search | 4 | done_needs_audit | Area-count endpoint; must use canonical predicate. |
| `src/components/SearchForm.tsx` | client component | reader | search | 4 | done_needs_audit | URL emission; pairs with CFM-604 URL canonicalizer. |
| `src/components/search/FilterModal.tsx` | client component | reader | search | 4, 6 | done_needs_audit | Filter chip surface. |
| `src/components/search/SearchUrlCanonicalizer.tsx` | client component | reader | search | 4, 6 | not_started | CFM-604: preserves old saved URLs. |
| `src/components/search/SearchResultsClient.tsx` | client component | reader | search | 4, 6 | done_needs_audit | Load-more + dedup (60-item cap). |
| `src/components/Map.tsx` / `DynamicMap.tsx` / `PersistentMapWrapper.tsx` | client component | reader | map | 4, 6 | not_started | CFM-602 cutover. |

### 2.4 Messaging & contact precondition (phase 0, 1, 7)

| Path | Type | Role | Touches | Phase(s) | Status | Notes |
|---|---|---|---|---|---|---|
| `src/components/ContactHostButton.tsx` | client component | writer (messaging) | messaging | 0, 1, 7 | not_started | CFM-003 dedup guarantee + CFM-702 copy alignment. |
| `src/lib/messages.ts` | library | writer | messaging | 0 | not_started | Core conversation helpers; CFM-003 dedup target. |
| `src/app/api/messages/route.ts` | API route | writer | messaging | 0 | not_started | Create / list messages. |
| `src/app/messages/page.tsx` | route (SSR) | reader | messaging | — | n/a | Inbox view; passive. |
| `src/app/messages/[id]/page.tsx` / `ChatWindow.tsx` | route + client | reader | messaging | — | n/a | Thread view; passive. |
| `src/components/chat/BlockedConversationBanner.tsx` / `NearbyPlacesCard.tsx` | client component | reader | messaging | — | n/a | UX adornments. |
| `src/app/actions/chat.ts` | server action | — | (chatbot) | — | n/a | **Not the conversation-contact surface** — this is the AI chatbot helper. Cleared out of CFM scope during inventory. |

### 2.5 Bookings history & legacy lifecycle (phase 9, 10)

| Path | Type | Role | Touches | Phase(s) | Status | Notes |
|---|---|---|---|---|---|---|
| `src/app/bookings/page.tsx` | route (SSR) | reader | booking | 1, 9 | not_started | CFM-104 keeps interactive only for legacy rows; CFM-901 converts to history-first. |
| `src/app/bookings/BookingsClient.tsx` | client component | reader / writer (legacy) | booking | 1, 9, 10 | not_started | CFM-1001 final UI cleanup. |
| `src/app/bookings/error.tsx` / `loading.tsx` | route shell | — | — | — | n/a | Unaffected. |
| `src/components/BookingCalendar.tsx` | client component | reader | booking | 9, 10 | not_started | History-only view by CFM-902. |
| `src/components/bookings/HoldCountdown.tsx` | client component | reader | hold | 1, 9 | not_started | Only relevant until CFM-101 freeze; becomes non-rendering afterwards. |
| `src/app/api/bookings/[id]/audit/route.ts` | API route | history-only | booking audit | retained | done_needs_audit | BookingAuditLog reader; Invariant #4 retained. |

### 2.6 Notifications, emails & cron (phase 8, 9)

| Path | Type | Role | Touches | Phase(s) | Status | Notes |
|---|---|---|---|---|---|---|
| `src/lib/notifications.ts` | library | notification | notification | 8, 9 | done_needs_audit | CFM-903 turns off booking-only notifications. |
| `src/lib/email.ts` / `email-templates.ts` | library | notification | notification | 8, 9 | done_needs_audit | Templates for freshness (CFM-801) + review (CFM-702). |
| `src/app/notifications/NotificationsClient.tsx` | client component | reader | notification | 9 | done_needs_audit | Inbox. |
| `src/app/api/cron/sweep-expired-holds/route.ts` | cron | repair-loop | hold | 1, 9 | partially_done | CFM-405c: per-hold tx marks listing dirty. Invariant #9: must skip `HOST_MANAGED`. CFM-904 retires when safe. |
| `src/app/api/cron/reconcile-slots/route.ts` | cron | repair-loop | inventory | 4, 9 | partially_done | CFM-405c: marks listings dirty in-tx. Invariant #9: host-managed-skip. CFM-904 retires when safe. |
| `src/app/api/cron/refresh-search-docs/route.ts` | cron | repair-loop | search-doc | 4, 8 | done_needs_audit | CFM-405/CFM-803 backstop refresh. |
| `src/app/api/cron/search-alerts/route.ts` | cron | notification | search | 8 | done_needs_audit | Saved-search notifications. |
| `src/app/api/cron/daily-maintenance/route.ts` | cron | repair-loop | cleanup | — | done_needs_audit | General cleanup; no CFM semantics. |
| `src/app/api/cron/cleanup-rate-limits/route.ts` / `cleanup-typing-status/route.ts` / `cleanup-idempotency-keys/route.ts` / `embeddings-maintenance/route.ts` | cron | repair-loop | infra | — | done_needs_audit | Infra maintenance; no CFM semantics. |

### 2.7 Listing management & admin (phase 3, 5)

| Path | Type | Role | Touches | Phase(s) | Status | Notes |
|---|---|---|---|---|---|---|
| `src/app/api/listings/[id]/route.ts` | API route | writer | listing | 3, 5, 6 | partially_done | CFM-302 contract + CFM-504 mixed-state guard; dedicated host-managed PATCH dispatch. |
| `src/app/api/listings/[id]/can-delete/route.ts` | API route | reader | listing | — | done_needs_audit | Deletion pre-flight. |
| `src/app/api/listings/[id]/view/route.ts` | API route | writer (counter) | analytics | — | done_needs_audit | View-count increment. |
| `src/app/api/listings/route.ts` | API route | reader / writer | listing | 3, 5 | done_needs_audit | Create + list host's own. |
| `src/lib/listings/host-managed-write.ts` | library | writer | listing | 3, 5 | done_needs_audit | CFM-301 helper (`prepareHostManagedListingWrite`, `requiresDedicatedHostManagedWritePath`). |
| `src/app/actions/listing-status.ts` | server action | writer | listing | 3, 5, 8 | done_needs_audit | Host pause/resume + CFM-304 stale recovery. |
| `src/app/actions/admin.ts` | server action | writer | listing, admin | 3, 5 | done_needs_audit | Admin status transitions gated for host-managed. |

### 2.8 Review & trust policy (phase 7)

| Path | Type | Role | Touches | Phase(s) | Status | Notes |
|---|---|---|---|---|---|---|
| `src/app/api/reviews/route.ts` | API route | writer | review | 7 | partially_done | CFM-405c: POST/PATCH/DELETE wrapped in `$transaction` with `markListingDirtyInTx`. Eligibility bound to accepted-booking history. |
| `src/components/ReviewForm.tsx` | client component | writer (UI) | review | 7 | not_started | CFM-702 copy + eligibility alignment. |
| `src/components/ReviewList.tsx` / `ReviewCard.tsx` / `ReviewResponseForm.tsx` | client component | reader | review | 7 | done_needs_audit | Passive presenters + host-response writer. |
| `src/app/actions/review-response.ts` | server action | writer | review | 7 | done_needs_audit | Host responses to reviews. |
| `src/app/api/listings/[id]/viewer-state/route.ts` | API route | reader | review, listing | 1, 7 | done_needs_audit | Review eligibility emitted here too — Invariant #4. |

### 2.9 Supporting actions (not in the plan's explicit list but migration-relevant)

| Path | Type | Role | Touches | Phase(s) | Status | Notes |
|---|---|---|---|---|---|---|
| `src/app/actions/saved-search.ts` | server action | writer | search | 4, 6 | done_needs_audit | Must canonicalize on write (CFM-604) so old URLs keep resolving. |
| `src/app/actions/saved-listings.ts` | server action | writer | listing | — | done_needs_audit | Favorites; unaffected. |
| `src/app/actions/block.ts` | server action | writer | messaging, safety | — | done_needs_audit | Blocked-user list; passive. |
| `src/app/actions/suspension.ts` | server action | writer | admin | — | done_needs_audit | Admin-only. |
| `src/app/actions/create-listing.ts` | server action | writer | listing | 2, 3 | done_needs_audit | Initial create; sets `availabilitySource=LEGACY_BOOKING` on new. |

---

## 3. Test Inventory

Mapping the migration-relevant test surfaces to the invariant they defend and their fate post-cutover.

### 3.1 Unit + integration

| Path | Kind | Primary invariant covered | Phase risk | Fate |
|---|---|---|---|---|
| `src/__tests__/booking/multi-slot-boundaries.test.ts` | unit | `0 <= openSlots <= totalSlots` (Inv #6) | 1, 9 | RETAIN as history-only after CFM-902. |
| `src/__tests__/booking/multi-slot-concurrency.test.ts` | unit | race safety under concurrent booking | 1, 9 | RETAIN (covers legacy drain period). |
| `src/__tests__/booking/multi-slot-feature-flags.test.ts` | unit | feature-flag gating | 1 | REVIEW at CFM-1002 (may retire). |
| `src/__tests__/booking/multi-slot-lifecycle.test.ts` | unit | booking state-machine transitions | 1, 9 | RETAIN through drain. |
| `src/__tests__/booking/race-condition.test.ts` | unit | double-click / idempotency | 1 | RETAIN through drain. |
| `src/__tests__/booking/whole-unit-concurrent.test.ts` | unit | single-slot race | 1 | RETAIN through drain. |
| `src/__tests__/booking/idempotency.test.ts` | unit | idempotency-key reuse | 1 | RETAIN through drain. |
| `src/__tests__/actions/booking*.test.ts` (booking.test, booking-hold.test, booking-rate-limit.test, booking-slots-validation.test, booking-whole-unit.test, booking-contact-first.test) | unit | action contract + freeze semantics | 1, 9 | EXTEND for CFM-101 (contact-first.test is the positive-path post-freeze). |
| `src/__tests__/actions/manage-booking*.test.ts` (manage-booking, manage-booking-hold, manage-booking-whole-unit) | unit | legacy lifecycle transitions | 9 | RETAIN through CFM-902; retire at CFM-1001. |
| `src/__tests__/actions/listing-status.test.ts` | unit | host-managed validation | 3, 5 | RETAIN — extended by CFM-504. |
| `src/__tests__/actions/admin.test.ts` | unit | admin transitions | 3, 5 | RETAIN. |
| `src/__tests__/actions/create-listing.test.ts` | unit | listing creation defaults | 2, 3 | RETAIN. |
| `src/__tests__/actions/saved-search.test.ts` | unit | saved-search canonicalization | 4, 6 | EXTEND by CFM-604. |
| `src/__tests__/actions/notifications.test.ts` | unit | notification gating | 9 | REVIEW at CFM-903. |
| `src/__tests__/api/messages*.test.ts` (messages, messages-read, messages-unread, messages-pagination) | integration | messaging contract | 0, 7 | EXTEND by CFM-003 dedup test. |
| `src/__tests__/lib/search/search-doc-queries.test.ts` | integration | canonical availability predicate (CFM-601) | 4, 6 | RETAIN. |
| `src/__tests__/lib/search/transform.test.ts` | unit | row → DTO (CFM-404) | 4 | RETAIN. |
| `src/__tests__/lib/search/query-hash-semantic-equivalence.test.ts` | unit | hash invariants (CFM-403) | 4 | RETAIN — load-bearing. |
| `src/__tests__/integration/search-doc-dirty-integration.test.ts` | integration | crash-sim in-tx dirty mark (CFM-405b) | 4 | RETAIN — load-bearing. |
| `src/__tests__/edge-cases/messaging-edge-cases.test.ts` | edge-case | messaging dedup near-misses | 0 | EXTEND by CFM-003. |
| `src/__tests__/compliance/sql-safety.test.ts` | security | SQL literal safety | 4, 6 | **BROKEN** — 24 failures pre-exist (tracked as CFM-601-F1). |

### 3.2 End-to-end (Playwright)

| Path | Kind | Primary invariant covered | Phase risk | Fate |
|---|---|---|---|---|
| `tests/e2e/booking/**` | e2e | full booking journey | 1, 9, 10 | RETIRE at CFM-1001. Retain specs as `.legacy.spec.ts` (Invariant #4 read-path still exercised). |
| `tests/e2e/multislot/multi-slot-booking.contract.spec.ts` | e2e contract | multislot create happy path | 1 | RETIRE at CFM-1001. |
| `tests/e2e/concurrent/**` | e2e | concurrent-user race safety | 1 | RETIRE at CFM-1001. |
| `tests/e2e/journeys/**` | e2e | golden user journeys | all | EXTEND — swap booking golden path for contact-first golden path by CFM-102. |
| `tests/e2e/mobile/**` | e2e | mobile flows | 6, 7 | EXTEND for contact-first mobile. |
| `tests/e2e/map-*.spec.ts` (bounds, filters, interactions, markers, pan-zoom, persistence, style, search-results) | e2e | map canonical contract | 4, 6 | RETAIN + EXTEND by CFM-602. |
| `tests/e2e/listing-detail/**` | e2e | listing detail CTA | 1, 6, 7 | EXTEND by CFM-102 and CFM-701. |
| `tests/e2e/listing-edit/**` | e2e | host-managed edit contract | 3, 5 | EXTEND by CFM-302 and CFM-504. |
| `tests/e2e/messaging/**` | e2e | contact-first messaging | 0, 1, 7 | EXTEND by CFM-003 and CFM-702. |
| `tests/e2e/mobile-bottom-sheet.spec.ts` | e2e | mobile sheet snap behavior | 6 | RETAIN. |
| `tests/e2e/create-listing/**` | e2e | host onboarding | 2, 3 | RETAIN. |
| `tests/e2e/admin/**` | e2e | admin transitions | 3, 5 | RETAIN. |
| `tests/e2e/auth/**` / `tests/e2e/homepage/**` / `tests/e2e/a11y/**` / `tests/e2e/api-depth/**` | e2e | orthogonal flows | — | UNAFFECTED. |

---

## 4. Dependency Matrix

Direct `depends_on` edges from `.claude/task-tracker.json` (2026-04-16 snapshot). Rows read as "this ticket blocks on …".

| Ticket | Phase | Blocks on | Status |
|---|---|---|---|
| CFM-001 | 0 | (none) | in_flight (this doc) |
| CFM-002 | 0 | (none) | ✅ done |
| CFM-003 | 0 | (none) | not_started |
| CFM-004 | 0 | (none) | ✅ done |
| CFM-101 | 1 | CFM-001, CFM-002, CFM-003, CFM-004 | not_started — waits on 003, 001 |
| CFM-102 | 1 | (none) | done_needs_audit |
| CFM-103 | 1 | (none) | done_needs_audit |
| CFM-104 | 1 | (none) | not_started |
| CFM-201 | 2 | (none) | done_needs_audit |
| CFM-202 | 2 | CFM-201 | done_needs_audit |
| CFM-203 | 2 | CFM-201 | done_needs_audit |
| CFM-301 | 3 | CFM-201 | done_needs_audit |
| CFM-302 | 3 | CFM-301 | ✅ done |
| CFM-303 | 3 | CFM-201 | partially_done |
| CFM-304 | 3 | CFM-303 | done_needs_audit |
| CFM-401 | 4 | CFM-002 | done_needs_audit |
| CFM-402 | 4 | CFM-401 | done_needs_audit |
| CFM-403 | 4 | CFM-401 | ✅ done |
| CFM-404 | 4 | CFM-202 | done_needs_audit |
| CFM-405 | 4 | CFM-203 | ✅ done (405a/b/c) |
| CFM-406 | 4 | CFM-402, CFM-404 | not_started |
| CFM-501 | 5 | CFM-201 | done_needs_audit |
| CFM-502 | 5 | CFM-501 | not_started |
| CFM-503 | 5 | CFM-501 | done_needs_audit |
| CFM-504 | 5 | CFM-301, CFM-502 | ✅ done |
| CFM-601 | 6 | CFM-402, CFM-502 | ✅ done (commit 2569b768) |
| CFM-602 | 6 | CFM-601, CFM-406 | partially_done |
| CFM-603 | 6 | CFM-404 | ✅ done |
| CFM-604 | 6 | CFM-401 | not_started |
| CFM-701 | 7 | CFM-603 | not_started |
| CFM-702 | 7 | CFM-103 | not_started |
| CFM-703 | 7 | CFM-702 | not_started |
| CFM-801 | 8 | CFM-303, CFM-304 | not_started |
| CFM-802 | 8 | CFM-801 | not_started |
| CFM-803 | 8 | CFM-405 | not_started |
| CFM-901 | 9 | CFM-104 | not_started |
| CFM-902 | 9 | CFM-901 | not_started |
| CFM-903 | 9 | CFM-101 | not_started |
| CFM-904 | 9 | CFM-902 | not_started |
| CFM-1001 | 10 | CFM-701, CFM-902 | not_started |
| CFM-1002 | 10 | CFM-1001 | not_started |
| CFM-1003 | 10 | (none) | not_started |

### 4.1 Critical paths (transitive chains)

- **Freeze → Drain → Cleanup**: CFM-001 / 003 / 004 → CFM-101 → CFM-903 → CFM-1001 → CFM-1002.
- **Schema → Migration → UI cutover**: CFM-201 → CFM-202 → CFM-404 → CFM-603 → CFM-701 → CFM-1001.
- **Search contract**: CFM-002 → CFM-401 → CFM-402 → CFM-601 → CFM-602 (+ CFM-406 as parallel branch).
- **Cohort**: CFM-501 → CFM-502 → CFM-504 / CFM-601.
- **Freshness**: CFM-303 → CFM-304 → CFM-801 → CFM-802.
- **Messaging precondition → review alignment**: CFM-003 → CFM-101 (hard gate) + CFM-702 → CFM-703.
- **History retention**: CFM-1003 is standalone docs-only and can land at any phase.

### 4.2 Phase-by-phase sequencing

```
Phase 0 (docs + precondition):  CFM-001, CFM-002, CFM-003, CFM-004
Phase 1 (freeze):               CFM-101 ⇐ (001,002,003,004)
                                 parallel: CFM-102, CFM-103, CFM-104
Phase 2 (schema):               CFM-201 → CFM-202, CFM-203
Phase 3 (write validation):     CFM-301 → CFM-302, CFM-303 → CFM-304
Phase 4 (search contract):      CFM-401 → CFM-402, CFM-403, CFM-404 → CFM-405, CFM-406
Phase 5 (cohort + mixed-state): CFM-501 → CFM-502 → CFM-503, CFM-504
Phase 6 (public cutover):       CFM-601 → CFM-602, CFM-603, CFM-604
Phase 7 (UI cleanup + review):  CFM-701, CFM-702 → CFM-703
Phase 8 (freshness + repair):   CFM-801 → CFM-802, CFM-803
Phase 9 (legacy drain):         CFM-901 → CFM-902, CFM-903, CFM-904
Phase 10 (cleanup):             CFM-1001 → CFM-1002; CFM-1003 (any time)
```

No phase is orphaned: every phase 1–10 has at least one ticket with an explicit surface in §2.

---

## 5. Open Gaps & Surfaces Not in the Plan Doc

Surfaces discovered during inventory that the plan doc's "Current Repo Surfaces In Scope" list omits. Documented here so no one is surprised mid-migration.

| Surface | Why it matters | Phase | Action |
|---|---|---|---|
| `src/lib/listings/host-managed-write.ts` | CFM-301 helper; canonical write-path predicate. | 3, 5 | Already done_needs_audit. Referenced by CFM-302/CFM-504. |
| `src/lib/search/search-doc-dirty.ts` | CFM-405 in-tx dirty-mark. | 4 | Partially done (CFM-405a). |
| `src/lib/search/search-orchestrator.ts` | SSR orchestration — touches CFM-401/CFM-404. | 4 | done_needs_audit. |
| `src/lib/search/search-intent.ts` | Drives recommended/map/list branching; must stay behind the canonical hash. | 4 | done_needs_audit. |
| `src/lib/search/listing-detail-link.ts` | Detail-link builder; Invariant #5 UI-consistency surface. | 6 | done_needs_audit. |
| `src/components/search/SearchUrlCanonicalizer.tsx` | Canonicalizes saved URLs. | 4, 6 | Target of CFM-604 — gap already tracked. |
| `src/components/PersistentMapWrapper.tsx` + `src/components/DynamicMap.tsx` | Map client surfaces not in the plan list. | 4, 6 | Target of CFM-406 / CFM-602. |
| `src/app/api/search-count/route.ts` | Area-count endpoint. | 4 | Must share the canonical predicate — audit needed. |
| `src/app/api/search/v2/route.ts` | Primary list endpoint, distinct from `/api/search/listings`. | 4 | done_needs_audit. |
| `src/app/api/listings/[id]/availability/route.ts` | Per-listing availability endpoint — reader. | 4, 6 | done_needs_audit; verify it uses CFM-404 shape. |
| `src/app/api/listings/route.ts` (collection) | Host list + create — may need write-path guard. | 3, 5 | done_needs_audit. |
| `src/app/actions/saved-search.ts` | Writer that must canonicalize on write. | 4, 6 | Extended by CFM-604. |
| `src/lib/messages.ts` + `src/app/api/messages/route.ts` + `src/app/messages/**` | Real messaging surfaces. Plan listed only `ContactHostButton.tsx` + `chat.ts` (chatbot — wrong). | 0, 7 | Add to CFM-003 scope. Documented here. |
| `src/__tests__/compliance/sql-safety.test.ts` | 24 failing tests tracked as CFM-601-F1. | 4, 6 | Followup ticket; fix post-Wave-3. |
| Pre-existing `src/__tests__/api/hybrid-count-threshold.test.ts` / `unbounded-browse-protection.test.ts` | CFM-F2 pre-existing failures bisected to `a79fff43`. | 4, 6 | Followup ticket. |

### 5.1 Documented accepted gaps (from CFM-004 observability spec)

- **Invariant #10** (rollback semantics) — no runtime counter. Mitigation: pre-flight test suite under CFM-901.
- **Invariant #4 positive signal** (`cfm.review.legacy_eligible_count`) — pushed to CFM-904.
- **Invariant #8 "marketable" predicate** — formalized in CFM-801.

---

## 6. Invariant → Reader Surface Index

For each non-negotiable invariant, the surfaces that MUST read from the normalized CFM-002/CFM-404 contract. Kept small and load-bearing so the Phase 6 cutover has a definitive picklist.

### Invariant #1 (single authoritative availability model)

Readers: `src/app/api/listings/[id]/viewer-state/route.ts`, `src/app/api/listings/[id]/availability/route.ts`, `src/components/listings/ListingCard.tsx`, `src/components/listings/SlotBadge.tsx`, `src/app/listings/[id]/ListingPageClient.tsx`, `src/lib/search/search-doc-queries.ts`, `src/lib/search/search-v2-service.ts`, `src/app/api/map-listings/route.ts`, `src/app/api/search/facets/route.ts`, `src/app/api/search-count/route.ts`.

### Invariant #5 (search, map, facets, cards, detail, saved-search share one contract)

Surfaces: all of the readers above PLUS `src/app/actions/saved-search.ts`, `src/components/search/SearchUrlCanonicalizer.tsx`, `src/components/SearchForm.tsx`, `src/components/search/FilterModal.tsx`, `src/components/Map.tsx`, `src/lib/search/listing-detail-link.ts`.

These two indexes together are the Phase 6 picklist.

---

## 7. Maintenance Rules

- Any cross-cutting CFM PR MUST update §2 rows it affects, §4 status columns, and the **Last verified** date in the header.
- New repo surfaces (files, routes, components) added during the migration MUST either appear in §2 or be explicitly noted as out-of-scope in §5.
- When a ticket APPROVEs, update its row in §4 to ✅ done and flip the §2 row it owns to `done`.
- When discovering a repo surface that was missed by the plan doc, add it to §5 before referencing it in any ticket.

---

## 8. Changelog

| Date | Change |
|---|---|
| 2026-04-16 | Initial inventory (CFM-001). Reflects tracker snapshot as of branch `codex/contact-first-multislot` and Wave 2 completion. |
