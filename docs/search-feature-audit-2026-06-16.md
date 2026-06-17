# Search Page Feature Audit — 2026-06-16

Exhaustive review of **every** user-facing feature on `/search`. Method: 12 parallel
deep-review agents (one per feature cluster) read the real implementation end-to-end,
then **every** finding was independently re-verified by an adversarial agent that tried
to refute it against the actual code. Only findings that survived verification are listed.

## Baseline (empirical)

- ✅ `pnpm typecheck` — clean
- ✅ 1,395 search-related unit/integration tests pass (57 suites): search-params, filters
  (schema/regression/property/integration), edge-cases, contexts, hooks, saved-search,
  alerts, telemetry, map APIs, fixes.
- Scope reviewed: **134 distinct features** across search bar, filters, results/pagination,
  map, mobile sheet, sort/view, V2 backend, SEO/URL, saved searches/alerts, empty/near-match/
  split-stay/vibe states, security/rate-limit, and a11y/resilience.

## Headline

The search page is **fundamentally solid**. Core flows — query submit, filter apply/clear,
cursor pagination + dedup + 60-cap, map pan→bounds→refetch with query-hash parity, V2→V1
fallback with circuit breaker, sort, rate-limiting, allowlist validation, mobile sheet snap/
scroll-lock/Escape — all verified **working**. No critical bug, no security/PII leak, no
data-integrity or state-corruption defect was found.

29 verified defects remain, almost all **edge-case, cosmetic, a11y-polish, or gated behind
default-off feature flags**. One high-severity user-facing bug exists on the default path.

| Severity | Count |
|---|---|
| 🔴 High | 1 |
| 🟠 Medium | 8 |
| 🟡 Low | 20 |

### Dead code (implemented but unreachable from `/search`)
Not bugs, but worth noting — these render nowhere in production: `DatePills`, `CategoryBar`,
`CategoryTabs`, `RecommendedFilters` (filters), `MobileListingPreview`, `MobileCardLayout`.
`PullToRefresh` is implemented but never wired (see L-06).

---

## 🔴 HIGH

### H-01 — Zero-results "Try a different area" chips dead-end on the location screen
**File:** `src/components/ZeroResultsSuggestions.tsx:311-323` · **Feature:** zero-results recovery
The nearby-area chips link to `/search?q=${area}` with **no lat/lng/bounds**. `parseSearchParams`
treats a `q` without coords as a text query, `isBoundsRequired()` returns true, and `page.tsx:265-273`
short-circuits to the "Please select a location" screen whose only CTA goes home. So clicking a
suggested area (e.g. "Austin, TX") from an empty result lands the user on a dead-end instead of
that area's listings — the **primary recovery affordance is broken**.
`SuggestedSearches` avoids this by appending `&lat&lng` (legacy-point path derives bounds);
`ZeroResultsSuggestions` omits coords.
**Fix:** add coordinates to each area chip (mirror `SuggestedSearches.tsx`) so the point path
derives bounds, or route through a geocoded link that sets bounds.

---

## 🟠 MEDIUM

### M-01 — Snapshot-expired refresh leaves stale `clientFetchedListings` shadowing fresh data
**File:** `src/components/search/SearchResultsClient.tsx:729-752` · gated: clientSideSearch + V2 snapshot
The snapshot-expired branch resets pagination refs and calls `router.refresh()` but never sets
`clientFetchedListings = null`. Since `effectiveListings = clientFetchedListings ?? initialListings`,
the refreshed SSR data is shadowed and the user keeps seeing stale (possibly mis-ordered/unavailable)
listings, with "Show more" gone (`nextCursor=null`). The `PUBLIC_CACHE_INVALIDATED` handler (line 283)
does this correctly — this branch doesn't.
**Fix:** add `setClientFetchedListings(null)` (+ related `clientFetched*` resets) before `router.refresh()`.

### M-02 — Auto-zoom-out yanks the map after a deliberate pan into an empty area
**File:** `src/components/Map.tsx:2664-2681` + `src/contexts/MapBoundsContext.tsx:85-94`
The auto-zoom guard is `!hasUserMoved`, but `MapBoundsContext` resets `hasUserMoved=false` on **any**
searchParams change — including the pan's own URL write. So a user pan into a 0-result region (no
filters) re-zooms the camera out 2 levels, fighting the user. Bounded to once per filter context.
**Fix:** don't reset `hasUserMoved` for map-pan-origin URL writes, or gate auto-zoom on a session
"user has interacted" ref not reset by the map's own writes.

### M-03 — Mobile content-drag guard is dead: `isScrollDrag` immediately reset to false
**File:** `src/components/search/MobileBottomSheet.tsx:301-322, 189-205, 213-223`
`handleContentTouchStart` sets `isScrollDrag.current=true` then synchronously calls
`handleTouchStart` which sets it back to `false`. So the content-drag branch (which holds the
"abort if scrolled away from top" and "only allow downward drag" guards) is never entered. On real
touch, an upward swipe on a card at list-top can tug/expand the sheet instead of scrolling. (e2e
only drives the keyboard slider, so it's uncovered.)
**Fix:** set `isScrollDrag.current=true` **after** calling `handleTouchStart`; add a touch-path test.

### M-04 — Projection snapshot pagination can silently skip listings when units become holes
**File:** `src/lib/search/projection-search.ts:884-905` · gated: projection reads (on by default in dev/preview)
`hydratePhase04Snapshot` slices the **compacted** `visibleRows` by absolute `(page-1)*pageSize`
offset. If a page-1 unit becomes a hole before page 2, every later unit shifts down one index and a
matching listing destined for the page boundary is permanently skipped; `total` also shrinks
mid-session. No stable anchor in the v4 cursor to recover position.
**Fix:** carry the last `unitKey` of the previous page in the cursor and slice after it (keyset),
or retain hole placeholders instead of compacting.

### M-05 — SEO canonical collapses every location search to bare `/search`
**File:** `src/lib/search/search-query.ts:308-315`
`buildSeoCanonicalSearchUrl` reads only `query.query` (`q`), never `query.locationLabel`. The real
submit pipeline always sets `query:undefined` and stores the place in `locationLabel`+lat/lng, so
**every** production location search canonicalizes to `/search` while its `<title>` is location-specific
("Rooms for rent in Austin"). Google consolidates them → no per-location landing page can rank.
**Fix:** `const term = query.query ?? query.locationLabel; if (term) params.set('q', term);` + unit test.
(Same root cause as L-12/L-13.)

### M-06 — INSTANT-frequency saved searches get swept into the daily (digest) alert cron
**File:** `src/lib/search-alerts.ts:591-608`
`baseWhere.OR[0] = { lastAlertAt: null }` has no `alertFrequency` constraint, so a freshly-created
`INSTANT` search (lastAlertAt null) is selected by the scheduled cron and delivered as a batched
`SCHEDULED` digest ("N matching listings / View Matches") instead of the per-listing instant alert
the user opted into. Bounded to the first daily run after creation (lastAlertAt then bumps).
**Fix:** scope the null branch to `{alertFrequency: {in:['DAILY','WEEKLY']}}` or add
`alertFrequency: {not:'INSTANT'}` to `baseWhere`.

### M-07 — ExpandSearchSuggestions shows stale buttons on param change (no reset)
**File:** `src/components/search/ExpandSearchSuggestions.tsx:38-150` · gated: clientSideSearch
The effect never calls `setLoading(true)`/`setSuggestions([])` at the start, and the component is
rendered without a `key` and not remounted on URL change in the client-search path. After refining a
1–5-result search, the old "+N rooms" buttons stay clickable for ~500ms+ and relax the **previous**
query.
**Fix:** clear loading/suggestions at effect start, or add `key={searchParamsString}`.

### M-08 — Route loading skeleton doesn't match the real grid (layout shift)
**File:** `src/components/skeletons/PageSkeleton.tsx:350, 403-408`
`SearchResultsSkeleton` uses `max-w-[840px]` single-column rows; the real results use the wider panel
and a multi-column auto-fit card grid. On load the list reflows single-column→multi-column (and
widens in the map-hidden case), hurting CLS. (Width magnitude is smaller in the default map-split
layout where the panel is capped, but the column-structure reflow is always present.)
**Fix:** mirror the real container width + responsive auto-fit grid/card aspect in the skeleton.

---

## 🟡 LOW (edge-case / cosmetic / a11y polish / flag-gated)

- **L-01** Recent-search select can re-open the autocomplete dropdown ~300ms later (missing
  `justSelectedRef`/`lastSelectedValueRef` in `handleSelectFallback`) — `LocationSearchInput.tsx:646-654`.
- **L-02** Vibe-only search with no location silently defaults bounds to **San Francisco** —
  `search-intent.ts:118-121`. Bypasses the location-required prompt.
- **L-03** `?minSlots=1` (crafted URL) counts as active in the drawer badge but not the strip badge;
  no effect on results — `InlineFilterStrip.tsx:116`.
- **L-04** Price quick-filter Apply button reads "100+ listings" until the slider is touched, even
  when few match — `useDebouncedFilterCount.ts:313-384` (only fetches when dirty).
- **L-05** Load-more aria-live announces a stale "showing N" total (off by one page); reads
  `totalCountRef` before the deferred state updater runs — `SearchResultsClient.tsx:829-848`.
- **L-06** Pull-to-refresh is never wired (`onRefresh` never passed) — dead on `/search` —
  `SearchViewToggle.tsx:234-238`.
- **L-07** Two redundant "Show map" buttons render together on ≥1280px when map hidden, with
  inconsistent aria-labels — `SearchViewToggle.tsx:340-350` vs `SearchResultsToolbar.tsx:48-71`.
- **L-08** Re-selecting the already-active sort on **mobile** triggers a no-op transition/flicker
  (desktop Radix guards this) — `SortSelect.tsx:161-177`.
- **L-09** Non-snapshot cursor on the projection path silently restarts at page 1 (one stuck
  "Load more" click before the fresh cursor recovers) — `projection-search.ts:977-1025`.
- **L-10** Empty list page with `total=null` (deep/out-of-range page) ships stale/broader map pins →
  pins with empty list — `search-v2-service.ts:998-1006`.
- **L-11** Semantic eligible-list pagination OFFSET-walks the vector search on deep pages (latency/
  DB cost; PHASE04 deep-page cap not applied here) — `search-v2-service.ts:338-411`.
- **L-12** Legacy pagination aliases (`pageNumber`, `cursorStack`) bypass `noindex` —
  `page.tsx:165` (canonical still collapses, so impact limited).
- **L-13** `q`+lat/lng legacy point URLs also collapse canonical to `/search` —
  `search-params.ts:811-817` (same root as M-05; app no longer emits this shape).
- **L-14** `activeFilterCount` for noindex omits `endDate`, `bookingMode`, `minSlots`, `nearMatches`,
  `what` — heavily-filtered perms stay indexable — `page.tsx:166-178` (canonical mitigates).
- **L-15** Identical saved searches aren't deduped; the `searchSpecHash` infra exists but is unwired
  (max 10 dupes via the slot cap) — `saved-search.ts:125-167`.
- **L-16** ExpandSearchSuggestions fabricates "+N rooms" from a null (100+) count (`?? 101`),
  showing a falsely-precise number — `ExpandSearchSuggestions.tsx:130-131`.
- **L-17** Split-stay footer "Combined total" shows the full multi-month sum while halves show
  monthly price in the default (toggle-off) state — `SplitStayCard.tsx:102-108`.
- **L-18** Near-match expansion **description** text disappears once the v2/client path is active
  (hardcoded `undefined`; not plumbed through `SearchV2List`) — `SearchResultsClient.tsx:467,586-589`.
  (Cards/separator still render; only the explanatory text is lost.)
- **L-19** `role=feed`: `aria-setsize/posinset` sit on role-less wrapper divs while the real
  `<article>` is a grandchild; separators are direct feed children — `SearchResultsClient.tsx:1152-1211`.
- **L-20** Double SR announcement of loading + count on filter/sort change when clientSideSearch is on
  (wrapper + client both announce) — `SearchResultsClient.tsx:1046-1050,1025-1038` +
  `SearchResultsLoadingWrapper.tsx:69-103`.

---

## Verified working (high-signal sample)

Submit pipeline & canonical-on-write · location autocomplete (debounce/abort/session-token/error
states) · typed-but-unselected resolution · budget swap/clamp · filter apply/clear/chips · price
slider + histogram · amenities/rules/languages/roomType/gender/slots server narrowing · live facet/
result counts (debounce/abort/cache) · URL↔filter round-trip + allowlists · cursor reset on filter/
sort/query · Load-more cursor pagination · id+groupKey dedup · 60-item cap · rate-limit/degraded/error
load-more UI · client-side in-place replace with stale-response guards · map pan→bounds→refetch ·
50ms/800ms throttle · marker fetch abort/cache/hysteresis · fly-to · map/list query-hash parity ·
empty/error map states · mobile snap points/scroll-lock/Escape/floating toggle · sort options/
allowlist/URL persistence · V2→V1 fallback + circuit breaker · SSR `search-ssr` rate-limit · `v2=1`
override blocked in prod · public payload PII/coordinate handling · error boundaries isolate bad cards.
