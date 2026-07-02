# Multislot (CFM) Search & Listings — Deep Review

**Date:** 2026-07-02 · **Method:** 8 parallel review agents (read-path SQL, orchestration/parsing, cache/cursor/ranking, projection write/sync, API routes, listings CRUD, UI, cross-cutting contract/flag/test) + lead adjudication of every high-severity and conflicting claim against the code. Review-only; no code changed.

**Surface covered (~20k lines read in full):** `src/lib/search/*` (40 modules), `src/lib/projections/*`, `src/lib/identity/*`, `src/lib/listings/canonical-inventory.ts`, API routes (`search/v2`, `search/listings`, `search/facets`, `search-count`, `map-listings`, `nearby`, `listings`, `listings/[id]` + subroutes, `cron/refresh-search-docs`), projection Prisma models + raw-SQL migrations/indexes, `SlotBadge`/`ListingCard`/`SearchResultsClient`/`MobileBottomSheet`, and both contract docs.

---

## 1. Architecture snapshot (as verified, not as documented)

Three read engines behind one service (`search-v2-service.ts` fallback ladder):

| Engine | Table | When it serves |
|---|---|---|
| **Phase-04 projection** (`projection-search.ts`) | `inventory_search_projection` / `unit_public_projection` | `phase04ProjectionReads` = ON in dev/preview, **OFF in prod by default**; only for projection-eligible specs (no text query, no amenities, sort not in {recommended, rating, newest}); skipped when freshness holes detected |
| **SearchDoc** (`search-doc-queries.ts`) | `listing_search_docs` (raw-SQL table, GIN/GIST indexed) | **Prod default engine** — `ENABLE_SEARCH_DOC=true` per `docs/DEPLOYMENT.md`; dev fallback for projection-ineligible queries |
| **Legacy** (`data.ts`) | `Listing` + `Location` | Only if `ENABLE_SEARCH_DOC` unset (slow LIKE; not the documented prod config) |

Write path: canonical listing writes mark `listing_search_doc_dirty` **in the same transaction** (verified — every mutating path is covered), the `refresh-search-docs` cron drains marks and re-projects docs, plus a TABLESAMPLE rescan backstop. CFM projections (`InventorySearchProjection`, `UnitPublicProjection`, `SemanticInventoryProjection`) are dark-written via outbox events; `multiSlotBooking`/`wholeUnitMode`/`softHolds`/`bookingAudit`/`bookingRetirementFreeze` are hard-coded `false` and their env schema entries are inert.

**Safety net that changes several severities:** all three read engines JOIN live `Listing` and SQL-exclude `status != 'ACTIVE'`, `statusReason IN (MIGRATION_REVIEW, ADMIN_PAUSED, SUPPRESSED)`, and `lastConfirmedAt` older than 21 days (`projection-search.ts:87,96`, `search-doc-queries.ts:781-782`, `data.ts:180`). Stale search-doc rows therefore cannot resurrect suppressed/paused/stale listings — doc staleness corrupts *content and filter matching*, not moderation enforcement.

## 2. Lead adjudications (where reviewers disagreed or needed verification)

1. **`moderationWriteLocks` prod-OFF is NOT a security hole** (consistency reviewer's claim rejected). `getHostModerationWriteLockResult` (`src/lib/listings/moderation-write-lock.ts:70-90`) computes the ADMIN_PAUSED/SUPPRESSED lock *before* consulting the flag and returns it unconditionally; the flag-gated tail re-checks a predicate that already returned null — **dead code**. Locks are enforced in prod. The inert flag + dead branch is a P3 cleanup.
2. **Prod read engine = SearchDoc**, not `data.ts` (consistency reviewer's flag matrix corrected). `ENABLE_SEARCH_DOC=true` is a documented prod requirement. *Ops follow-up: confirm the var is actually set in Vercel prod env.*
3. **Dirty-mark race verified real** (see P1-1) — `markListingDirtyInTx` re-marks in place (`ON CONFLICT (listing_id) DO UPDATE SET marked_at = NOW()`), `clearDirtyFlags` deletes unconditionally (`cron/refresh-search-docs/route.ts:221-230`). Impact corrected per §1 safety net: staleness, not suppression leaks.
4. **Count-vs-list engine mismatch verified real** (see P1-2) — `search-count/route.ts:102` passes `ignoreSort: true` on the stated theory that counts are sort-independent; the theory misses that skipping the sort gate switches *engines*, and the projection engine counts **units** while SearchDoc counts **listings**.

## 3. Findings

Severity: P1 = user-visible correctness/integrity, act now · P2 = correctness-adjacent, cost, privacy-contract, a11y · P3 = latent/robustness/docs. **Exposure** says where it bites today.

### P1 — fix first

**P1-1 · Lost dirty-mark race freezes live search-doc content — `src/app/api/cron/refresh-search-docs/route.ts:221-230` + `src/lib/search/search-doc-dirty.ts:125-131`.** Cron reads the dirty queue and listing snapshots, then `DELETE FROM listing_search_doc_dirty WHERE listing_id = ANY(...)` unconditionally. A host PATCH committing between the cron's snapshot read and the clear (its `ON CONFLICT ... DO UPDATE SET marked_at = NOW()` lands on the same row) has its mark deleted without its version ever being projected. Filter matching then runs on stale doc values indefinitely (e.g., price 800→1200 edit: listing keeps matching `maxPrice=1000`, card can show stale data) until the TABLESAMPLE rescan happens to resample that doc (unbounded delay). **Exposure: prod, live.** Fix: capture `marked_at` per row at read time and clear conditionally (`DELETE ... WHERE listing_id = ANY(...) AND marked_at <= <observed>`).

**P1-2 · Count and list disagree — different engines, different units of counting.** `search-count/route.ts:102-104` uses projection eligibility with `ignoreSort: true` → `getProjectionSearchCount` counts **units** (GROUP BY `unit_id`); the list under the default `recommended` sort is projection-*ineligible* → SearchDoc counts **listings**. Multi-inventory units make "Show N listings" ≠ rendered list. Compounding: the count route has **no `hasProjectionFreshnessHoles` guard** while the list route falls back on holes (`search-v2-service.ts:672-690`) — divergence even for projection-eligible sorts. With `searchListingDedup` ON there's a third number (P2-6). **Exposure: dev/preview live; prod latent until `phase04ProjectionReads` flips.** Fix: derive the count from the same engine the list will use (apply the sort gate + freshness guard to count).

**P1-3 · `/api/search/listings` swallows structured admission errors — `route.ts:153-155`.** `if (!result.response || result.error) throw` fires before the `admissionError` handler at `:196-211` (a result with `admissionError` has `response: null`), so the handler is **dead code**: occupants>20 / bounds-too-broad / deep-page requests silently fall back to the V1 engine instead of returning 400, diverging from `/api/search/v2` (`:123-138`) and `search-count` (`:108-121`) which return 400 correctly. **Exposure: dev/preview live (admission only exists on the projection path).** Fix: check `result.admissionError` before the throw-and-fallback wrapper.

**P1-4 · Gender/household-gender filters have opposite NULL semantics across engines.** Projection includes unspecified: `(isp.gender_preference IS NULL OR isp.gender_preference = $N)` (`projection-search.ts:471-486`); SearchDoc excludes: `d.gender_preference = $N` (`search-doc-queries.ts:994-1003`). Same query flips membership when only the sort changes (sort=price → projection → NULL rows included; sort=recommended → SearchDoc → they vanish). A filter-fidelity flap, beyond ordering. **Exposure: dev/preview live; prod latent.** Fix: pick one semantic and align both builders (product call: does "female preferred" match "no preference stated"?).

**P1-5 · Query-hash contract divergence makes the client DISCARD fresh results — `search-v2-service.ts:644-665`, `search-spec.ts:182-206`, `search-response.ts:70-90`, `SearchResultsClient.tsx:455-471`.** Three hash producers disagree: the client's `getSearchQueryHash` hashes filters only; the service's `generateQueryHash` adds `embeddingVersion` when semantic is active; the projection path's `getPhase04SearchSpecHash` adds `projectionEpoch + embeddingVersion + rankerProfileVersion + unitIdentityEpochFloor`. `/api/search/v2` returns `meta.queryHash` verbatim, and the client drops any response whose hash doesn't exactly equal its own bare hash (`if (data.meta.queryHash !== requestQueryHash …) return;` — emits `stale-query-hash` and keeps stale data). With the unified V2 client + semantic (or phase-04 reads), **every** fetch mismatches → the UI never updates. `fetchMoreListings` already papers over this for load-more by overriding `meta.queryHash` with the client hash (`actions.ts:230-232`) — proof the seam is real; the v2 route and `PersistentMapWrapper` don't. Also causes SSR↔CSR handoff divergence (consistency reviewer, same root cause). **Exposure: latent — client-side search flag is off today; becomes release-blocking the day the unified V2 client, semantic, or projection reads ship together.** Fix: make one canonical, version-token-free hash the client-facing contract (tokens stay in the dedicated meta/snapshot fields the cursor already carries), or have the client treat `meta.queryHash` as opaque.

### P2 — correctness-adjacent, cost, privacy-contract, a11y

**P2-1 · `viewer-state` leaks availability + existence of hidden/moderated listings to anonymous callers — `src/app/api/listings/[id]/viewer-state/route.ts` (~L78-141).** No visibility gate before returning `publicAvailability` (openSlots, availableFrom, lastConfirmedAt, freshnessBucket…) for SUPPRESSED/ADMIN_PAUSED/HOST_PAUSED/MIGRATION_REVIEW listings — the same listings the detail page `notFound()`s and `/status` redacts. ID enumeration partially defeats suppression. No PII, hence P2. **Exposure: prod, live.** Fix: mirror the detail/status gate (`resolvePublicListingVisibilityState(...).isPubliclyVisible` else `publicAvailability: null`).

**P2-2 · PATCH address-change drops validated coordinates from canonical sync — `src/app/api/listings/[id]/route.ts:1250-1254`.** POST create threads `trustedCoordinates: coords` into `syncCanonicalAvailability` (`route.ts:560-566`); the PATCH profile branch, after writing `Location.coords` from the validated address, calls it **without** `trustedCoordinates` → novel canonical unit created `PENDING_GEOCODE`, listing drops out of projection-backed search until the async geocode worker completes, and pin vs search coordinates can diverge. **Exposure: prod live (write side runs in prod).** Fix: thread the resolved coords on PATCH like POST.

**P2-3 · Admission caps exist only on the dev-default projection path — `search-spec.ts:95-164`.** occupants≤20 / maxGapDays≤180 / bounds-span / deep-page≤20 fire only inside `buildPhase04SearchSpec`. Prod (flag off) runs the SearchDoc path: page clamp is 100 not 20, and the **list** query's bounds span is not clamped (only the map query is, `search-v2-service.ts:906-912`). Requests 400-rejected in dev run expensive scans in prod. **Exposure: prod, live (cost/perf).** Fix: hoist admission validation above the engine branch.

**P2-4 · `?occupants=` / `?guests=` honored only by the projection path.** `buildPhase04SearchSpec` accepts the aliases; `parseSearchParams`/`normalizeSearchFilters` don't know them (only `minAvailableSlots`/`minSlots`), so on the prod path (or the freshness-hole fallback) the capacity filter is **silently dropped**, and the projection spec hash diverges from `generateQueryHash` for the same URL (inconsistent snapshot/cache keys). **Exposure: prod live if any surface emits those params; dev/prod behavior differs regardless.** Fix: teach the parser the aliases or remove them from the spec.

**P2-5 · Facets endpoint is a cost-amplification vector — `src/app/api/search/facets/route.ts:346` + `facet-where.ts`.** One anonymous GET = 5 heavy aggregations (3× unnest+GROUP BY, percentile_cont, histogram) in one tx. Its cache key rounds bounds `toFixed(4)` (~11 m) while the map path quantizes at 0.001 (~100 m) — a ~0.0001° pan per request busts the cache every time; rate limit is IP-only (no `getSearchRateLimitIdentifier`, unlike v2/list/map). Bounded by `statement_timeout=5000` + span clamps, hence P2 not P1. **Exposure: prod, live.** Fix: quantize the facets bounds key with the shared `quantizeBound`; add ip:userId identifier + tighter bucket. (Same-class residue of the #170 gender cache-key bug.)

**P2-6 · With dedup ON, `total`/`totalPages` count raw listings while the page shows deduped canonicals — `search-doc-queries.ts:1605-1609,1686-1699`.** 40 raw → 22 canonicals still reports total=40, totalPages=4 → overstated counts, short/empty trailing pages. **Exposure: dev/preview live (`searchListingDedup` prod-OFF).** Fix: dedup-aware count.

**P2-7 · Move-in matching diverges ~180 days between engines.** Projection: `available_from <= moveIn + gapDays·1day` with gapDays defaulting to 180 (`projection-search.ts:489-498`); SearchDoc requires availability on/before the requested date (`search-doc-queries.ts:738-761`). Same URL, wildly different result sets across engines. **Exposure: dev/preview live; prod latent.** Fix: align the window (or clamp default gap to 0 for parity) and document intended near-match semantics.

**P2-8 · Identity MERGE/SPLIT strands projections at the old epoch — `src/lib/outbox/handlers.ts:298-357` + `identity/mutate-unit.ts:108-165`.** The mutation bumps `physicalUnit.unitIdentityEpoch` but nothing re-points `listing_inventories.unit_identity_epoch_written_at` or re-projects; `rebuildUnitPublicProjection` aggregates strictly at the new epoch (`unit-projection.ts:93`) → merged unit disappears from `unit_public_projection`, old-epoch `inventory_search_projection` rows orphan. **Exposure: latent until `phase04ProjectionReads` (reads) — but writes corrupt dark data today.** Fix: re-point inventories to `resultingEpoch` and enqueue per-inventory rebuilds in the handler.

**P2-9 · Rescan cannot repair a MISSING search doc — `cron/refresh-search-docs/route.ts:189-219`.** `TABLESAMPLE ... FROM listing_search_docs` only re-evaluates docs that exist. If create-time `upsertSearchDocSync` failed AND the dirty mark was later lost (P1-1), the listing is invisible to search **permanently** until manually re-edited. **Exposure: prod, live (low probability, unbounded impact).** Fix: backstop pass over `Listing LEFT JOIN listing_search_docs ... WHERE doc.id IS NULL AND <publishable>`.

**P2-10 · Unsanitized error logging in partial-failure branches — `search-v2-service.ts:965-970, 991-996`.** `Promise.allSettled` rejection handlers log `reason.message` verbatim (Prisma/pg errors can embed query values); the outer catch correctly uses `sanitizeErrorMessage`. Violates the no-raw-PII-in-logs non-negotiable. **Exposure: prod, live.** Fix: sanitize both branches.

**P2-11 · Backend-dependent `publicAvailability` shape → dev/prod freshness-UI divergence.** SearchDoc path threads the **resolved** object (freshnessBucket, publicStatus, searchEligible — `search-doc-queries.ts:1204,1270`); projection path (`projection-search.ts:263-273,347`) and semantic path (`search-doc-queries.ts:2400-2426`) emit the **narrow** 7-field shape. SlotBadge degrades gracefully (fields optional) so nothing crashes, but freshness labels ("Needs reconfirmation") render on prod's engine and not on dev's — QA on dev doesn't see prod's badges and vice versa. Also falsifies contract §2.3's "present in every production payload." **Exposure: display divergence live in dev/preview.** Fix: one availability-resolution helper across all four row-mappers.

**P2-12 · Public payloads over-expose availability lifecycle fields — `public-listing-payload.ts:139/166`, `transform.ts:102-273`.** `listing.publicAvailability ?? …` passes the *resolved* object through, so `staleAt`, `autoPauseAt`, `searchEligible`, `effectiveAvailableSlots`, `isValid` etc. serialize to anonymous clients beyond the declared 7-field `PublicAvailability` contract. Low sensitivity (derivable from public data) but a contract violation that widens silently. **Exposure: prod, live.** Fix: explicitly pick the 7 public fields at the payload boundary.

**P2-13 · Dev/preview QA validates a different system than prod serves.** `phase04ProjectionReads`, `searchListingDedup`, `contactFirstListings`, `contactPaywall*`, `publicAutocompleteContract`, `listingCreateCollisionWarn` etc. all `phaseCutoverDefault` → ON in dev/preview, OFF in prod. Net: different read engine, different result grouping, different card shape (projection path emits empty `amenities`, `city:"Roomshare"` fallback titles), paywall on-vs-off. Any manual/E2E sign-off in dev does not validate prod. **Exposure: process risk, live.** Fix: pin flags per env explicitly; add a prod-flag Playwright config for the critical flows (see Test Gaps #1).

**P2-14 · (Promoted — merged into P1-5 above.)** Cross-surface `meta.queryHash` divergence is the same root cause as P1-5; see there.

**P2-15 · "Show more" terminal transition drops keyboard focus — `SearchResultsClient.tsx:1324-1354`.** When `nextCursor` becomes null (or the 60-cap trips) the focused button unmounts → focus falls to `document.body`, keyboard user restarts from page top (WCAG 2.4.3). **Exposure: prod, live.** Fix: move focus to a `tabIndex={-1}` terminal message or the first appended card.

**P2-16 · Hot-path partial indexes are unusable — `search-doc-queries.ts:834-842` vs migrations.** `search_doc_active_available_price_idx` etc. are predicated on `d.status='ACTIVE' AND d.available_slots>0`, but the list/map/count WHERE never references `d.status`/`d.available_slots` (eligibility filters live `Listing` columns). The planner can't use the partial indexes; bounded searches heap-join and filter every candidate. **Exposure: prod perf, live.** Fix: add `d.status='ACTIVE'` to the shared eligibility conditions (with sync guarantees) or drop the dead indexes.

**P2-18 · Search-cache event invalidation is dead code with mismatched tags — `search-cache.ts:23-33`.** `invalidateSearchCaches` has zero callers repo-wide, and its `revalidateTag("search-results"|"search-map"|"search-count")` targets match nothing: the three `unstable_cache` wrappers (`search-doc-queries.ts:1149,1493,1757`) declare **no `tags`**. So a capacity-affecting mutation never event-invalidates search caches; freshness is TTL-only (60s), contradicting the function's own doc and the client's "Results refreshed to keep public availability accurate" affordance. **Exposure: prod, live (bounded by 60s TTL).** Fix: add `tags:[…]` to the cache options and call `invalidateSearchCaches` from capacity-affecting mutations, or delete the dead function and document TTL-only.

**P2-19 · `QuerySnapshot` rows are never reaped — `query-snapshots.ts:89-125`.** A row is written per first-page projection search and per snapshot-contract search (5-min TTL), but `loadValidQuerySnapshot` only checks `expiresAt`; there is no `querySnapshot.deleteMany` anywhere and daily-maintenance reaps rateLimit/idempotency/typing but not snapshots → unbounded table growth. **Exposure: dev live now; prod the day snapshot-writing flags flip.** Fix: add an expired-snapshot reaper to daily-maintenance (mirror the idempotency reaper).

**P2-20 · Keyset cursors are not bound to the filter set — `cursor.ts:106-121`.** KeysetCursorV1/V2 encode sort+keys+id but no filter `queryHash`; the service applies a decoded keyset cursor against the *current* filterParams with no filter check (`search-v2-service.ts:854`). Snapshot cursors DO validate `cursor.queryHash` and reject. A valid keyset cursor from query A replayed with query B's filters (same sort) is honored → B's WHERE + A's boundary → duplicates/skips. Mitigated in the normal UI flow (cursor reset on param change), so this is a robustness gap for crafted/stale cursors. **Exposure: prod (keyset on via `CURSOR_SECRET`), crafted-input only.** Fix: add a `qh` field to keyset cursors and reject on mismatch (parity with snapshot cursors).

**P2-21 · `host-managed-patch-contract.md` is wholesale stale.** Cites `src/lib/listings/host-managed-write.ts`, `HOST_MANAGED_PATCH_KEYS`, `availabilitySource` dispatch, server-derived status transitions, and an error taxonomy — none exist. Real implementation: payload-shape dispatch (`isHostManagedAvailabilityPatch` = body has `openSlots`|`status`, `route.ts:259-266`), required-fields schema, status codes relocated to `src/app/actions/listing-status.ts`. Invariants *are* enforced (CAS + row lock + mixed-write 409 + dirty-in-tx verified) — this is doc drift that will mislead the next maintainer. Fix: rewrite to the two-surface reality or delete.

### P3 — latent, robustness, docs (grouped)

**Query/engine semantics**
- `vibeQuery` is silently inert unless `sort=recommended` — changes URL + cache key, affects zero rows/ordering on any other sort (`search-doc-queries.ts:856-872` never reads it; `search-v2-service.ts:719-720` gates rerank). Product decision needed: apply, warn, or strip.
- Map vs list can filter by different text when the service routes text through `vibeQuery` (map applies FTS `query` only) — markers/list mismatch on the vibe path.
- `sort` not in `generateQueryHash` → a snapshot cursor minted under one sort "matches" another; UI resets cursors on sort change so impact = crafted/stale cursors replay stale ordering (`search-v2-service.ts:644-665`).
- Projection SQL bounds gate uses the coarse `public_cell_id` centroid; the JS post-filter uses `public_point` — edge units dropped inconsistently; rows with NULL/malformed cell id silently excluded (`projection-search.ts:507-525` vs `:237-249`).
- Near-match expansion suppressed exactly when there are zero exact results (`items.length > 0` gate, `search-doc-queries.ts:1705-1711,2138-2143`) — confirm against product intent.
- `d.move_in_date <= $N` lacks the `::date` cast its sibling condition uses (`search-doc-queries.ts:947-951`) — TZ-boundary off-by-one risk.
- Facets add `d.status='ACTIVE'` (`facet-where.ts:83`) that the search WHERE doesn't — facet counts can be *narrower* than results when `d.status` lags `l.status`.
- `price: row.fromPrice ?? 0` renders null price as "$0" on the projection path (`projection-search.ts:332`); type is `number|null` — pass null through.
- Inverted-longitude bounds pass the parser by design (antimeridian) and **are** handled in all three engines' SQL (verified: `crossesAntimeridian` splits envelopes) — but `normalizeBounds` in `typed-location-resolver.ts:60-74` trusts upstream bbox order/ranges without validation (defense-in-depth).
- "Studio City"-class NL mis-parse: bare "studio" → roomType="Entire Place", location="City" (`natural-language-parser.ts:71-76,156-170`).
- `split-stay.ts:21-57` pairs by price only, ignores slot capacity vs requested occupants (documented stub; gate before de-stubbing).
- `search-orchestrator.ts` is test-only dead code whose V1-direct branch lacks a bounds guard — delete or guard.
- Point-fallback viewport is 0.27° (~30 km) while comments claim ~10 km (`location-bounds.ts:17-30` vs `validation.ts:200-211`) — reconcile.

**Cache / dedup / cursors**
- `buildBaseCacheFields` omits `vibeQuery` — safe today only because vibeQuery never reaches cached SearchDoc SQL (semantic path is uncached; soft-vibe rerank runs outside `unstable_cache`); one refactor away from cross-vibe cache collisions (`search-doc-queries.ts:286-307`). Add it defensively or assert the invariant.
- Dedup group-key normalization both under- and over-merges: "Apt 4"→"unit 4" but "#4" stays "#4" (same unit shown twice under different spellings); owner+addr+price+title+roomType collisions hide distinct units as siblings; a sibling beyond `SEARCH_DEDUP_LOOK_AHEAD` resurfaces as a fresh canonical on the next page (client `seenGroupKeys` hides it, but combined-slot metadata splits) (`dedup.ts:164-180`, `normalize-address.ts`, `normalize-listing-title.ts`). Data-quality dependent; largely by-design.
- Unsigned cursors are forgeable only when `CURSOR_SECRET` is unset (dev; prod throws) — bounded impact since keyset values are parameterized + NaN-guarded. Separately, `getCursorSecret()` accepts any non-empty secret while legacy cursors require `hasStrongSecret` — a weak dev secret signs keyset cursors but leaves legacy cursors unsigned (`cursor.ts:216-219`, `env.ts:544-566`).

**Write path / projections**
- `projection_epoch` is stamped but never used as a read/write fence — old-epoch worker with higher `source_version` can overwrite newer rows during a rolling deploy (`epoch.ts:17-22`; accepted 1-2 min window, but the fence is absent, not coarse).
- Cross-unit advisory-lock ordering (tombstone prev-unit → rebuild new-unit) can deadlock under two inventories swapping units (`canonical-inventory.ts:489-529` via `unit-projection.ts:59-61`) — acquire unit locks in canonical order.
- Dead dirty reasons `booking_hold_expired`/`reconcile_slots` (`search-doc-dirty.ts:38-39`) — a future holds system that decrements slots without `markListingDirty` goes silently stale; wire or remove.
- `queryProjectionUnitRows` builds raw SQL without `joinWhereClauseWithSecurityInvariant` (all values parameterized today; add the assertion for defense-in-depth) (`projection-search.ts:428-578`).
- Three sources of truth for the 21-day stale cutoff: `STALE_THRESHOLD_DAYS` constant vs hardcoded `INTERVAL '21 days'` literals in `search-doc-queries.ts:253` and `data.ts:76` — derive one from the other + parity test.
- Parallel flag accessors: `features.phase04ProjectionReads` (env.ts) AND `isPhase04ProjectionReadsEnabled` (`@/lib/flags/phase02`) decide the same flag — collapse to one.

**Listings / security hygiene**
- JSON-LD via `dangerouslySetInnerHTML` relies solely on write-time `noHtmlTags` filtering; `JSON.stringify` doesn't escape `<` → any future writer bypassing the zod filter yields stored XSS (`app/listings/[id]/page.tsx:344-350`). Escape at output.
- No DB CHECK constraints for slot invariants (openSlots≤totalSlots etc.) — app-layer-only enforcement; raw SQL/migrations can persist impossible states.
- Create idempotency depends on client-supplied `X-Idempotency-Key`; with `listingCreateCollisionWarn` off, a double-submit creates duplicates (`api/listings/route.ts:640-649`).
- `MIGRATION_REVIEW` is not write-locked (`moderation-write-lock.ts:27`) — hosts can edit migration-review listings (out of search regardless; confirm intent).
- `status=RENTED, openSlots=5` accepted; stale `statusReason` can survive an ACTIVE flip (cosmetic) (`[id]/route.ts:214-229, 777-786`).
- E2E scenario backdoor `ENABLE_SEARCH_TEST_SCENARIOS` lacks a `VERCEL_ENV !== "production"` guard and runs before rate limiting (`search-scenarios.ts:68`; scenario branches in listings + map-listings routes).
- `x-search-query-hash` header is uncapped, echoed into `meta.queryHash`, and logged (`map-listings/route.ts:71-79`) — length-cap + charset-restrict.
- Facets & search-count rate-limit on IP only (shared-NAT contention; see P2-5).
- Inert moderation flag + dead branch in `getHostModerationWriteLockResult` (see Adjudication #1) — remove the flag plumbing or make it real.
- `wholeUnitMode` block at `[id]/route.ts:1169` is unreachable (flag hard-false; bookingMode always derived from roomType) — dead code.
- Dead `LEGACY_BOOKING` branches: read SQL hardcodes `'HOST_MANAGED'`; `resolvePublicAvailability` voids its `legacySnapshot` arg; `buildLegacyPublicAvailability` unreachable (`search-doc-sync.ts:123,371-375`, `public-availability.ts:358,399`) — delete.

**UI (latent)**
- Detail-page SlotBadge omits `publicAvailability` (`ListingPageClient.tsx:1189-1192`) — surfaces agree today only because search-eligible ⇒ ACTIVE+fresh; diverges the moment eligibility widens.
- Non-overlay `toBadgeVariant` collapses warning/neutral to "info" (blue "Closed" badge with warning icon) — landmine for the first non-overlay caller with `publicAvailability` (`SlotBadge.tsx:121-130`).
- "Drag down at list-top to collapse" is unreachable from listing cards (cards are `<a>`, interactive-element guard eats the gesture) (`MobileBottomSheet.tsx:304-309`).
- `clientFetchedListings` not cleared on the SSR-fingerprint reset path (flag-gated, `SearchResultsClient.tsx:639-651`).
- aria-live result-count region remounts with the keyed component — SRs may not announce post-filter counts (`SearchResultsClient.tsx:1109-1122`).

**Docs**
- `search-contract.md`: all three version constants drifted (`SEARCH_RESPONSE_VERSION` v1→v3, `SEARCH_QUERY_HASH_VERSION`, `SEARCH_DOC_PROJECTION_VERSION` 1→3); meta documented as 3 fields, actually 10; §2.4 default is PAUSED not AVAILABLE; §2.3 freshness claim false (P2-11); changelog stops 2026-04-17; nearly all line anchors off by 40-60.
- `cfm-inventory.md` stale both directions: `booking.ts`/`BookingForm`/`SlotSelector`/`manage-booking` marked `not_started` but **deleted**; `ContactHostButton` marked `not_started` but shipped as primary CTA.

## 4. Flag matrix (CFM-relevant, verified against `src/lib/env.ts`)

`phaseCutoverDefault(env)` = `"true"`→true, `"false"`→false, else `NODE_ENV !== "production"` → **dev/preview ON, prod OFF unless env set**.

| Flag | Dev | Prod default | Gates | Risk note |
|---|---|---|---|---|
| multiSlotBooking, wholeUnitMode, softHolds*, bookingAudit, bookingRetirementFreeze | false | false (hard-coded) | nothing live | env schema entries + cross-validation inert; dead branches |
| phase04ProjectionReads | ON | **OFF** | entire projection read path + card shape | largest dev/prod gap (P2-13); dual accessors (P3) |
| searchListingDedup | ON | **OFF** | result grouping + totals | P2-6 lives behind it |
| contactFirstListings, contactPaywall(+Enforcement), searchAlertPaywall, entitlementState, publicAutocompleteContract, publicCacheCoherence, listingCreateCollisionWarn, privateFeedback | ON | **OFF** | user-visible behavior | QA parity hazard |
| moderationWriteLocks | ON | OFF | *(nothing — inert)* | lock enforced regardless; dead branch |
| searchDoc (`ENABLE_SEARCH_DOC`) | explicit | explicit (**docs mandate true**) | SearchDoc vs legacy LIKE engine | confirm set in prod |
| searchKeyset | via `CURSOR_SECRET` | via `CURSOR_SECRET` | keyset pagination + HMAC cursors | — |
| searchDocRescan | ON (default true) | ON (default true) | rescan backstop | only repairs existing docs (P2-9) |
| staleAutoPause, freshnessNotifications | OFF | OFF | crons | safe: reads SQL-exclude stale |
| semanticSearch | OFF unless env | OFF | semantic/vibe rerank | P2-14 latent behind it |

## 5. Test gaps (prioritized, consolidated)

1. **Prod-flag E2E config** — run critical search/listing Playwright flows with prod-effective flags (`phase04ProjectionReads=false`, `searchListingDedup=false`, paywalls off). Today every dev-default E2E validates the non-prod engine.
2. **Count/list parity** — same URL through `search-count` and `search/listings` must agree, incl. default sort + projection-on + freshness holes (P1-2).
3. **Dirty-race regression** — concurrent re-mark between cron snapshot-read and `clearDirtyFlags` must survive (P1-1); plus rescan-recreates-missing-doc (P2-9).
4. **Cross-engine filter equivalence** — gender NULL semantics, move-in gap window, occupants aliases: assert projection and SearchDoc builders produce equivalent membership for the same parsed query (P1-4, P2-4, P2-7).
5. **Two concurrent host PATCHes** — exercise the `FOR UPDATE` + version CAS with real concurrency, not just stale `expectedVersion`; add action-level tests for `listing-status.ts` (`HOST_MANAGED_ACTIVE_REQUIRES_OPEN_SLOTS`).
6. **viewer-state redaction** — hidden/moderated listing returns null availability to non-owner (P2-1).
7. **PATCH address-change coordinate coherence** — `Location.coords` vs canonical unit geocode (P2-2).
8. **Serialized `publicAvailability` = exactly 7 fields** on list + geojson (P2-12); SlotBadge tolerates the narrow shape (P2-11).
9. **Cache-key/limiter hardening** — facets jittered-bounds burst stays coalesced (P2-5); `ENABLE_SEARCH_TEST_SCENARIOS` inert in prod; oversized `x-search-query-hash` truncated.
10. **Stale-threshold parity** — assert the SQL read-exclusion interval equals `STALE_THRESHOLD_DAYS` across all three engines.
11. **Client-hash vs `meta.queryHash` parity for SEMANTIC and PROJECTION responses** — the exact P1-5 gap; `query-hash-semantic-equivalence.test` covers URL→hash only, not client-vs-service agreement.
12. **UI**: load-more terminal focus (P2-15); warning/neutral badge variants; aria-live announcement after keyed remount; 0-value/array URL round-trip from the UI layer.
13. **Identity merge/split projection coherence** at the new epoch (P2-8); mixed-epoch overwrite; cross-unit lock-order deadlock.
14. **Index-usage (EXPLAIN) regression** for the hot list/map queries (would have caught P2-16).
15. **Cache/cursor hardening** — a capacity-affecting mutation invalidates the list/map/count `unstable_cache` entries (P2-18); expired `QuerySnapshot` rows get reaped (P2-19); a keyset cursor minted under filter set A is rejected under filter set B (P2-20); a pinned snapshot listing that turned paused/filled is dropped as a hole by the JS eligibility gate, not shown with a stale label.

## 6. Verified solid (checked and confirmed — don't re-litigate)

- **No SQL injection anywhere in scope**: every user value is a `$N` parameter; `joinWhereClauseWithSecurityInvariant` runs a real runtime assertion; sort/enum clauses are hard-coded maps. NaN/Infinity/negative/huge numerics cannot reach SQL unclamped (all normalizers finite-check + clamp).
- **Cursor integrity**: HMAC-signed (with `CURSOR_SECRET`), zod `.strict()` per-sort validation, forged/malformed → null, legacy page clamped; keyset snapshot pins response/projection/embedding versions and rejects mismatches; no unbounded OFFSET from crafted cursors.
- **Coordinate privacy**: deterministic 2-dp rounding (~1.1 km) applied at the data layer on every public path; no per-call jitter → no averaging attack; `(0,0)` guards; exact coords only owner/admin; `exact_point` never leaves `physical_units`.
- **AuthZ on mutations**: no IDOR found; every mutation re-reads under `SELECT … FOR UPDATE` + version CAS in one tx; non-owner → 404; suspended/moderation locks enforced (flag-independent); create serialized per-user via advisory lock (TOCTOU-safe); trusted-address validation on POST and PATCH (signed suggestion token, fails closed).
- **Mixed-state guard real**: retired availability keys on the profile branch → 409 `HOST_MANAGED_WRITE_PATH_REQUIRED`; `.strict()` schemas prevent cross-branch smuggling; multislot invariants (openSlots≤totalSlots, ACTIVE⇒openSlots>0+moveInDate) enforced in zod AND canonical sync.
- **Every mutating path marks the search doc dirty in the same tx** (create, both PATCH branches, delete/suppress, admin moderation, view-count) — the P1 race is on the *clear* side only.
- **Moderation/stale exclusion at read time** in all three engines (the §1 safety net).
- **Tombstone/resurrection defenses**: source-version CAS no-ops stale events; hidden-status guard under `FOR UPDATE`; semantic requires `PUBLISHED`; suppress path tombstones canonical inventory in-tx; hard delete cascades the doc.
- **Outbox drain**: `FOR UPDATE SKIP LOCKED` disjoint claims, per-row try/catch (no batch poisoning), time-box + stale-in-flight recovery; emergency stop (`FEATURE_PHASE01_CANONICAL_WRITES=false`) degrades all-or-nothing per call; **Invariant #9 upheld** (no repair loop writes host-managed availability).
- **Duplicate PhysicalUnit prevented** under concurrency (advisory lock + unique constraint).
- **Rate-limit identity**: `getClientIP` prefers unspoofable `x-real-ip` on Vercel; XFF only trusted in dev/explicit proxy; search v2/list/map keyed ip:userId.
- **Telemetry PII-safe**: queryHash not raw text, HMAC'd owner hashes, sanitized error strings (except P2-10), free-text reasons never logged; metrics sink strictly allowlisted.
- **All four CLAUDE.md search-UI invariants hold** with line evidence: keyed remount resets cursor/accumulation; `seenIdsRef` dedups before append; `MAX_ACCUMULATED=60` enforced; no cursor in URL. Mobile-sheet spec (snap points, drag guards, Escape, body-lock) matches. Stale-response races defended (AbortController + double query-hash gating); load-more re-entry guarded; `ListingCard` memo includes all `publicAvailability` fields.
- **Legacy booking surface is gone**: `BookingForm`/`SlotSelector` deleted (zero bundle cost), no booking/hold mutation routes exist, `bookingMode` server-derived.
- **Query-hash semantic equivalence** (modulo P2-14) via `normalizeHashableSearchQuery` with regression tests; legacy URL aliases parse with parity tests; unbounded browse capped (48) with page clamps; text-query-without-bounds throws.
- **Price units consistent** (dollars, Decimal(10,2)) end-to-end; date-only→UTC-midnight conversion explicit; `ListingStatus` enum fully handled.
- **Keyset pagination order-parity**: WHERE OR-chains match the ORDER BY exactly (`… DESC NULLS LAST, listing_created_at DESC, id ASC`), stable id tiebreak, and `ts_rank_cd` is skipped on BOTH keyset pages so page-1↔page-N ordering can't diverge on FTS rank.
- **Ranking is deterministic where it matters**: `rankListings` tie-breaks by id; the time/distance-dependent runtime score only tiers map pins, never orders the keyset list — cursor pagination cannot drift.
- **SearchDoc list/map/count cache keys cover every WHERE dimension** (`buildBaseCacheFields` audited field-by-field vs the WHERE builder); the #170 facets gender fix is present and complete.
- **Projection snapshot pagination slices frozen `orderedUnitKeys`** and maps to live rows — an earlier-page hole can't shift a later listing into an already-served page.

## 7. Suggested fix order

1. **Same-day, small diffs:** P1-1 conditional clear (one SQL predicate); P1-3 reorder admission check; P2-10 sanitize two log lines; P2-1 viewer-state visibility gate; P2-2 thread coords on PATCH; P2-19 snapshot reaper (copy the idempotency reaper).
2. **Next:** P1-2 count engine alignment + freshness guard; P1-4 + P2-7 + P2-4 cross-engine filter parity (one "engine-parity" PR + equivalence tests); P2-5 facets cache-key quantization + limiter identity; P2-18 wire cache tags or delete the dead invalidator; P2-20 bind keyset cursors to the filter hash.
3. **Then:** P2-9 missing-doc backstop; P2-15 focus management; P2-16 index alignment; P2-12 payload field-pick; P2-11 unified availability resolution.
4. **Pre-cutover gates (before flipping `phase04ProjectionReads`/`searchListingDedup`/unified V2 client/semantic in prod):** **P1-5 hash contract** (release-blocking for those flags), P2-6, P2-8, P2-13 prod-flag E2E, epoch fence (P3), cell-id vs point bounds (P3).
5. **Cleanups/docs batch:** dead flags + LEGACY branches + orchestrator; rewrite/delete `host-managed-patch-contract.md`; refresh `search-contract.md` + `cfm-inventory.md`.

---

*All eight reviewer reports are integrated, including the cache/cursor/ranking pass (P1-5, P2-18/19/20, and the cache/dedup/cursor P3 group).*
