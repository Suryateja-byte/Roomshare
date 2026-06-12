# Multi-Slot Listings Backend — Full Review (2026-06-11)

Five-dimension audit (write paths, read/search paths, canonical inventory pipeline, security/abuse, test coverage). ~40 files read; 458 slot-relevant unit tests executed (all green). Key claims spot-verified by coordinator.

**Verdict:** Core is solid — authz, optimistic locking, DB CHECK constraints, transactional outbox, and rate limiting are all real and correctly implemented. Not perfect: 4 High findings (1 user-visible today, 3 in the canonical pipeline), 8 Mediums, plus dead code and test gaps. Nothing demo-blocking.

---

## High findings

### H1. Facets endpoint filters/eligibility disagree with actual search results — **FIXED 2026-06-11**

> Fixed via shared `buildPublicSearchEligibilityConditions` seam in `search-doc-queries.ts`, consumed by both the list builder and the new `src/lib/search/facet-where.ts`; all 5 facet queries now JOIN "Listing"/"User" with the scoped SQL-literal allowlist. Parity locked by `src/__tests__/lib/search/facet-where.test.ts` + route-level assertions.
> Row-level verified on local dev DB (2026-06-11): with seeded ineligible variants (suspended owner, SUPPRESSED, stale 30d, openSlots<minSlots), `/api/search/facets` == `/api/search-count` == live-SQL ground truth (43/43 and 0/0 at minSlots=3, where old code counted 29). Note: in dev, `search-count` defaults to the phase04 projection path (flag ON in non-prod) which undercounts due to stale dev projections — that's findings H3/H4/M6, not facets; prod has phase04 OFF.
`src/app/api/search/facets/route.ts:160-178` builds its slot condition via legacy `buildAvailabilitySqlFragments` (`src/lib/availability.ts:58-76`), whose `effectiveAvailableSql = totalSlotsRef` — so min-slots filters against `d.total_slots`, never `openSlots`. It also gates only on `d.status='ACTIVE'` (denormalized doc), skipping the live joins the list/map queries apply: `User.isSuspended`, `statusReason NOT IN (...)`, 21-day `lastConfirmedAt` freshness, `openSlots >= minSlots` (`src/lib/search/search-doc-queries.ts:763-854`). Facet counts can overcount vs. the result list (e.g. minSlots=3 counts a 3-total/1-open listing the list excludes; stale/suspended/suppressed listings counted).
**Fix:** reuse the host-managed fragment (or `d.available_slots >= $n` + live joins) so facets share eligibility with the list query. *(Independently found by two reviewers.)*

### H2. Canonical write path is ungated; prod outbox grows unboundedly — **FIXED 2026-06-11**

> Fixed by bounding growth rather than stopping dark writes: (1) `src/lib/outbox/retention.ts` — terminal-row retention (COMPLETED 7d, DLQ 30d), superseded-PENDING compaction (allowlist: INVENTORY_UPSERTED, UNIT_UPSERTED; never payments/alerts/identity/cache-invalidate), consumed cache_invalidations cleanup — wired as the `outbox-retention` daily-maintenance task, deliberately NOT phase02-gated. (2) phase01 flag wired as an emergency stop (default ON everywhere; explicit `false` halts both producer seams) — see `docs/migration/cfm-phase01-emergency-stop.md`. (3) Inline projection rebuild now honors `disable_new_publication`. Migration `20260611000000_outbox_terminal_cleanup_index` adds the partial index (EXPLAIN-verified). Row-level verified on dev DB; first compaction pass cleaned 245 real superseded PENDING rows. Retention policy: `docs/migration/cfm-retention-policy.md` §8.5. NOTE: the outbox is shared infra — payments (PAYMENT_WEBHOOK) and alert delivery process ONLY via this drain; enabling paywalls in prod requires phase02 ON or a dedicated drain cadence (pre-existing coupling, out of H2 scope).
`isPhase01CanonicalWritesEnabled` (`src/lib/flags/phase01.ts:6`) is **never called** (verified). `syncCanonicalAvailability`/lifecycle sync run unconditionally on every listing write (create, both PATCH branches, status actions, admin, settings, auto-pause), appending `outbox_events` and rebuilding projections **inline in the host transaction** (`src/lib/listings/canonical-inventory.ts:456-462`) — bypassing the phase02 gate and `disable_new_publication` kill switch, which only gate the cron drain. With prod-default flags OFF, the drain skips while producers keep writing → `outbox_events` accumulates forever; the only drain is the daily cron anyway.
**Fix:** gate producers on phase01 flag (or delete the dead flag and accept always-on writes deliberately), route the inline rebuild through the kill switch, add outbox retention/cleanup.

### H3. Projection drain can resurrect a paused/suppressed inventory (PAUSED → PUBLISHED)
`src/lib/projections/inventory-projection.ts:157-242`: the drain re-reads the inventory then upserts the projection and runs `UPDATE listing_inventories SET publish_status='PUBLISHED'` with **no guard** on current `publish_status`/`source_version` (same pattern `src/lib/projections/semantic.ts:307-314`). Under READ COMMITTED, an INVENTORY_UPSERTED event racing a host/admin pause (which deletes the projection row via tombstone) can re-INSERT the projection and flip PAUSED→PUBLISHED — undoing a moderation suppression in the public projection until the next event. Exposure today is limited (phase04 reads default-off in prod), **but** `map-listings` snapshot hydration reads projection tables with no phase04 check (`src/lib/search/projection-search.ts` via `map-listings/route.ts:150`).
**Fix:** stale-skip when `event.sourceVersion < inventory.source_version`; condition the status UPDATE on `publish_status IN ('PENDING_PROJECTION','PENDING_EMBEDDING') AND source_version = <read version>`. Also gate snapshot hydration on the read flag.

### H4. `unit_public_projection` version guard is unsound across inventories
`src/lib/projections/unit-projection.ts:76,171-204` stores `MAX(source_version)` across a unit's inventories and guards with `source_version <= EXCLUDED.source_version` — but per-inventory versions come from each listing's own `version` counter (incomparable domains). Tombstoning the highest-version inventory leaves the unit rollup permanently stale (rebuild from a lower-version sibling fails the guard).
**Fix:** the rebuild is recomputed-from-source — drop the cross-inventory guard or key it to a per-unit monotonic counter.

---

## Medium findings

- **M1. `updateListingStatus` allows ACTIVE with 0/NULL openSlots** (`src/app/actions/listing-status.ts:158-181`, verified — only version + freshness-recovery guards). The other two host paths enforce openSlots ≥ 1 (`recoverHostManagedListing` :344-349; PATCH schema `[id]/route.ts:192-199`). Result: an ACTIVE listing every public surface hides, whose canonical row gets publish_status ARCHIVED while status is ACTIVE (`canonical-inventory.ts:131-143`). Fix: same `openSlots >= 1` guard here.
- **M2. Ghost `bookingMode` field flips room category on first edit.** Create accepts client `bookingMode` and derives canonical `room_category` from it (`api/listings/route.ts:282,530-535`; `canonical-inventory.ts:106-115,230-233`), but the column was dropped in migration `20260509000000`; every later sync re-derives from `roomType` only — a WHOLE_UNIT+Private-Room listing silently flips ENTIRE_PLACE→PRIVATE_ROOM on first edit. Fix: drop bookingMode from the create schema or persist it; one source of truth for category.
- **M3. Update-path search-doc staleness up to ~24h.** Create does synchronous `upsertSearchDocSync` (`route.ts:556-569`); all update paths only mark dirty; the only drain is daily-maintenance (`vercel.json` `2 9 * * *`). Doc-backed surfaces (facets, semantic candidates, embeddings) can serve RENTED/0-slot listings up to a day. Live-join surfaces (main list/map/detail) are unaffected. Fix: best-effort sync after update commit, mirroring create.
- **M4. Saved-search alerts ignore `minSlots`.** Persisted (`search-utils.ts:27`, `saved-search-parser.ts:35,106`) but never applied in the scheduled where-clause (`search-alerts.ts:703-792`) or instant `matchesFilters` (:877-988). Users alerting on "3+ spots" get 1-spot emails. Fix: apply `openSlots >= minSlots` in both.
- **M5. Suspended-owner gap in semantic search + alerts.** `resolveEligibleSemanticItems` (`search-v2-service.ts:261-336`) and alert deliverability (`search-alerts.ts:115-144` → `public-contact-contract.ts:120-143`) never check `User.isSuspended`; every other public surface does. Fix: add the check to both.
- **M6. Projection read path reports inventory-row counts as slot counts.** `projection-search.ts:263-307` sets `openSlots = totalSlots = COUNT(DISTINCT inventory_id)` — a 3-open-slot listing shows 1/1. Flag-gated (phase04). Fix: aggregate real slot sums or add slot columns to the projection.
- **M7. PATCH responses return the full Prisma Listing** (no `select`; `[id]/route.ts:739,1069 → :1200`) — leaks internal fields (viewCount, freshness timestamps, normalizedAddress, physicalUnitId) to the owner client. Fix: explicit select.
- **M8. `lastConfirmedAt` refreshed on every availability save; no status-change cooldown** (`[id]/route.ts:750`) — slot/status flapping within the 20/day update limit can game freshness ranking. Fix: refresh only on meaningful transitions, or add per-listing cooldown.

## Low / cleanup

- **L1.** `buildPublicAvailability` clamps the wrong direction: `totalSlots = max(openSlots, totalSlots)` (`public-availability.ts:256-260`), opposite of `availability.ts:46` and presentation; and it makes the downstream `openSlots > totalSlots` invariant check **provably unreachable**. DB CHECK (`openSlots <= totalSlots`, migration 20260415) means no such rows can exist, so impact is theoretical — but fix the clamp direction.
- **L2.** `canReserve` (`availability.ts:132-150`) is dead AND tautological (`cond ? snapshot : snapshot`). Zero callers. Delete it and the other uncalled stubs.
- **L3.** Dead `getSavedListings` (`data.ts:1597-1695`) selects exact address/zip/raw coords with no public-coordinate coarsening and uses availableSlots-only fallback — unused but a ready-to-leak export. Delete.
- **L4.** `buildAvailabilitySqlFragments` name promises "effective available", delivers "total"; two of three callers dead-branch it, facets uses it raw (H1). Fold the host-managed fragment into availability.ts as the single seam.
- **L5.** PII-in-logs (project non-negotiable): full `session.user.id` at `viewer-state/route.ts:248`; full `ownerId` at `[id]/route.ts:466`. Truncate like everywhere else.
- **L6.** RENTED keeps stale `statusReason` via status action but not via PATCH (`listing-status.ts:58-71` vs `[id]/route.ts:727-736`). Align.
- **L7.** No durable audit record (AuditEvent) for slot/status changes — logger-only. Consider in-tx AuditEvent.
- **L8.** `listing_inventories.source_version` upsert unguarded + tombstone bumps it DB-side independently of `Listing.version` (`canonical-inventory.ts:370,400`; `canonical-lifecycle.ts:47`) — downstream `<=` guards can misclassify newer events as stale. Add `WHERE source_version <= EXCLUDED.source_version`.
- **L9.** Projection writes stamp the event's version/epoch, not the re-read row's (`inventory-projection.ts:172,190,214,239`; `handlers.ts:137`) — metadata can regress on equal versions; IDENTITY_MUTATION handler never rebuilds projections/purges old-epoch unit rows (possibly the known Wave 3f/3g remainder).
- **L10.** Handler retry backoff hardcoded 30s (`handlers.ts:152` etc.) — exponential backoff only applies to thrown exceptions.
- **L11.** Test debris: `playwright.multislot.config.ts` points at a deleted spec (all multislot projects match zero tests); `tests/e2e/concurrent/held-slot-restoration.spec.ts` tests retired booking APIs and skips vacuously; `admin-host-race.spec.ts:49` asserts `[200,400,403,409].includes(status)` (near-tautology). Delete/replace.
- **L12.** `openSlots` never backfilled (migration 20260415) — NULL rows invisible to search and un-REOPENable. Benign with reseeded data; backfill `openSlots = availableSlots` to remove the trap.
- **L13.** Dependency audit: 4 moderate + 1 low vulns, all transitive (next/postcss, @google/genai ws+protobufjs, sentry brace-expansion, @ai-sdk/provider-utils). None reachable from this surface.

---

## State transition table (as implemented)

statusReason values written: `HOST_PAUSED`, `STALE_AUTO_PAUSE`, `ADMIN_PAUSED`, `SUPPRESSED`, `null` (`MIGRATION_REVIEW` legacy read-only; `FRESHNESS_WARNING` read but never written — dead).

| From → To | Guard | Enforced at |
|---|---|---|
| any → PAUSED (host) | version + moderation lock; sets HOST_PAUSED | listing-status.ts:62-64,174-181; [id]/route.ts:731-736 |
| PAUSED/RENTED → ACTIVE (host, status action) | version + lock; blocked if STALE_AUTO_PAUSE/FRESHNESS_WARNING; **no slot guard (M1)** | listing-status.ts:158-167 |
| any → ACTIVE (host, availability PATCH) | version + lock + openSlots ≥ 1 + moveInDate; clears host reasons; sets lastConfirmedAt | [id]/route.ts:192-207,727-756 |
| PAUSED(STALE_AUTO_PAUSE) → ACTIVE (REOPEN) | version + lock + openSlots ≥ 1 | listing-status.ts:336-362 |
| any → RENTED (host) | version + lock; no slot coupling (intentional post-CFM) | listing-status.ts; [id]/route.ts:180 |
| ACTIVE → PAUSED(STALE_AUTO_PAUSE) (system) | flag ENABLE_STALE_AUTO_PAUSE (default off) + warning + threshold; version-guarded updateMany | auto-pause-dispatcher.ts:250-282,407-431 |
| any → PAUSED(SUPPRESSED) | admin suppress / owner delete with reports / account delete | admin.ts:684,1022; [id]/route.ts:415-424; settings.ts:412-419 |
| PAUSED(SUPPRESSED/ADMIN_PAUSED) → ACTIVE | **admin only** (host gets 423 LISTING_LOCKED) | admin.ts:546-553; moderation-write-lock.ts:74-80 |

Canonical `publish_status` machine: DRAFT → PENDING_GEOCODE → PENDING_PROJECTION → PENDING_EMBEDDING → PUBLISHED (+ PAUSED/SUPPRESSED/ARCHIVED/STALE_PUBLISHED). Geocode transition is status-guarded; projection/embedding transitions are **unguarded** (H3).

## Invariants (status: enforced / gap)

1. `1 ≤ totalSlots ≤ 20` — zod + DB CHECK (20260216, 20260301/02). ✅
2. `0 ≤ openSlots ≤ totalSlots` (or NULL) — zod superRefine + DB CHECK (20260415). ✅
3. `availableSlots` mirrors `openSlots` on every live write; never independently writable (`.strict()` schemas + 409 HOST_MANAGED_WRITE_PATH_REQUIRED). ✅
4. ACTIVE ⇒ openSlots ≥ 1 — enforced on PATCH + REOPEN, **not** on `updateListingStatus` (M1). ⚠️
5. Every mutation: session + ownership + FOR UPDATE + expectedVersion/version-guard. ✅
6. openSlots == 0 ⇒ RENTED — deliberately NOT an invariant (FULL is a presentation state); ACTIVE+0 hidden by visibility gates. ✅ (by design)
7. Outbox event in same tx as canonical write. ✅
8. Projection writes monotonic in source_version — holds for inventory_search_projection, **broken** for unit rollup (H4) and canonical upsert (L8). ⚠️
9. publish_status transitions guarded — geocode yes, projection/embed **no** (H3). ⚠️
10. No PII in logs — holds except two spots (L5). ⚠️

## Test plan (recommended additions, ranked)

1. **availability.ts unit tests** — `openSlots ?? availableSlots ?? totalSlots` fallback, negative clamp, `min(open,total)` clamp (currently zero direct coverage; importers mock it).
2. **`buildPublicAvailability` clamp direction** — input open=5/total=3 → expect open clamped to 3, not total inflated to 5; assert the validity check is reachable (regression for L1).
3. **`updateListingStatus` ACTIVE+0-openSlots** — expect rejection once M1 is fixed; today this test documents the hole.
4. **Facets vs list parity** (pglite integration) — same filter params; assert facet counts == list result counts for minSlots, suspended owner, stale lastConfirmedAt, SUPPRESSED reason (regression for H1).
5. **PATCH schema rejections on the host-managed path** — openSlots>totalSlots → 400, ACTIVE+0 → 400, bounds >20 (create path covered, PATCH path not).
6. **True concurrency test** (pglite, two parallel transactions) — concurrent availability PATCHes with same expectedVersion: exactly one succeeds, other gets VERSION_CONFLICT (current version tests are mock-only).
7. **openSlots NULL tri-surface test** — NULL row: hidden from search SQL, invalid in public-availability, falls back in snapshot — pin all three behaviors.
8. **Drain vs pause race** (integration) — pause inventory while INVENTORY_UPSERTED event in flight; assert publish_status stays PAUSED and no projection row resurrects (regression for H3).
9. **Unit rollup after tombstone** — two inventories, tombstone the higher-source_version one; assert unit_public_projection reflects the survivor (regression for H4).
10. **bookingMode category stability** — create WHOLE_UNIT + roomType "Private Room"; first PATCH; assert canonical room_category unchanged (regression for M2).
11. **Alerts minSlots** — saved search minSlots=3, 1-open listing → no alert (regression for M4).
12. **canonical-inventory `buildInventoryShape` unit tests** — SHARED_ROOM beds mapping, ENTIRE_PLACE capacityGuests, openSlots=0 fallback (L7-adjacent).

## Verified OK (the solid core)

- AuthZ clean on every mutation: session-derived owner, pre-check + in-tx re-check under FOR UPDATE; no client ownerId trusted anywhere; admin paths gated; 13 cron routes all `validateCronAuth` (timing-safe, 32+ char secret); test-helpers triple-gated (VERCEL_ENV + flag + timing-safe bearer) and 404s when disabled.
- Optimistic locking is real: expectedVersion + FOR UPDATE + increment on every host/admin mutation; version-guarded updateMany in crons; double-submit on PATCH → 409.
- Slot mirrors locked together on all live writes; zod `.strict()` everywhere; DB CHECK constraints back every zod rule.
- Create path: per-user advisory lock closes the 10-listing-cap TOCTOU; opt-in X-Idempotency-Key with replay; collision detector.
- Transactional outbox (same tx), FOR UPDATE SKIP LOCKED claims, stale IN_FLIGHT recovery, DLQ at 8 attempts; unit identity races closed by advisory lock + unique index; no duplicate inventory rows possible.
- Search/read core consistent: list/map/keyset/snapshot-hydration share one eligibility builder with live joins; snapshots version-pinned, 5-min TTL, re-validated on hydration — stale RENTED/0-slot rows cannot resurrect on live-join surfaces.
- Public payloads PII-clean: 2-decimal coords, description blanked, ownerId/address/zip stripped, HMAC group keys; `$queryRawUnsafe` correctly parameterized + sql-safety invariant assertions.
- Presentation layer total-order-safe: NaN/Infinity/negative clamped, no division, status buckets dominate.
- 458 slot-relevant unit tests run: all pass.

## Suggested fix order

1. **Post-demo, first batch (user-visible / data-integrity):** H1 facets parity, M1 ACTIVE-without-slots guard, M2 bookingMode, M4 alerts minSlots, M5 isSuspended in semantic+alerts, L5 log truncation (non-negotiable compliance).
2. **Pipeline correctness (before any phase04 read flag flips on):** H3 guarded publish transitions + gate snapshot hydration, H4 unit rollup guard, L8/L9 version/epoch discipline, H2 producer gating + outbox retention.
3. **Hygiene:** M3 update-path doc sync, M7 PATCH select, M8 lastConfirmedAt cooldown, L1-L4 dead code, L11 test debris, then the test-plan additions.
