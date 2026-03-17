# Deliberate Plan: Search Contract Bug Verification & Fix Safety Analysis

**Date**: 2026-03-16
**Task Type**: FIX (verification + planning only, no implementation)
**Confidence Score**: 4.6/5.0 (HIGH)
**Verdict**: All 7 issues CONFIRMED. 6 of 7 are worth fixing. Fix ordering and safety constraints identified.

---

## Executive Summary

Seven bugs were reported by Codex across the search system. All 7 have been **verified as real** through direct codebase analysis with exact line numbers. The pre-mortem and blast-radius analysis identified **one critical hidden risk** in the highest-priority fix (map contract — cache poisoning via missing `minAvailableSlots` in `createSearchDocMapCacheKey`) that would introduce a new bug if not addressed alongside the fix.

**Recommended fix order**: Fix 4 → Fix 3 → Fix 6 → Fix 2 → Fix 5 → Fix 1+7 (atomic pair)

---

## Issue Verification Matrix

| # | Issue | Codex Rating | Verified Rating | All Sub-Claims TRUE? | Worth Fixing? |
|---|-------|-------------|-----------------|---------------------|---------------|
| 1 | Map/list/fallback search contract mismatch | HIGH | **HIGH** | Yes (4/4) | YES — user-visible filter disagreement |
| 2 | "Show on map" not idempotent | HIGH | **MEDIUM** | Partially (3/4 true, 1 nuanced) | YES — latent defect + bonus bug found |
| 3 | Filter drawer preview wrong for minSlots | MEDIUM | **MEDIUM** | Yes (4/4) | YES — misleading preview counts |
| 4 | Drawer stuck loading offline | MEDIUM | **MEDIUM-LOW** | Yes (2/2) | YES — trivial fix, strictly better |
| 5 | Pagination state bleed | MEDIUM | **MEDIUM** | Yes (4/4) | CONDITIONAL — limited practical exposure |
| 6 | Header summaries canonical parsing | MEDIUM | **MEDIUM** | Yes (3/3) | YES — cosmetic but confusing |
| 7 | Test gate weakness | HIGH | **HIGH** | Yes (4/4) | YES — false safety net |

---

## Detailed Verification Evidence

### Issue 1: Map/List/Fallback Search Contract Mismatch — CONFIRMED HIGH

**Files investigated**:
- `/home/surya/roomshare/src/app/api/map-listings/route.ts` (lines 114-127, 132-138)
- `/home/surya/roomshare/src/lib/search/search-v2-service.ts` (lines 256-260)
- `/home/surya/roomshare/src/lib/data.ts` (lines 577-590, 793-809)
- `/home/surya/roomshare/src/lib/search/search-doc-queries.ts` (lines 429, 435, 762)

**Claim 1**: "Map API only forwards a subset of filters" — **TRUE**
- `map-listings/route.ts:114-127` cherry-picks 11 fields, omitting `bookingMode`, `minAvailableSlots`, `nearMatches`, `sort`
- V2 service at line 159 uses `{ ...parsed.filterParams, page, ... }` which spreads ALL fields

**Claim 2**: "Strips query for any 3+ char semantic search regardless of sort" — **TRUE**
- `map-listings/route.ts:132-138` checks only `features.semanticSearch && query.length >= 3`
- V2 service at `search-v2-service.ts:256-260` additionally requires `sortOption === "recommended"`

**Claim 3**: "V2 service only strips for recommended sort" — **TRUE**
- `search-v2-service.ts:256-260`: `isSemanticActive` condition includes `sortOption === "recommended"`

**Claim 4**: "V1 fallback omits bookingMode, minAvailableSlots, nearMatches" — **TRUE**
- `data.ts:577-590` (`getMapListings`): destructures only 12 fields, missing all three
- `data.ts:793-809` (`getListingsPaginated`): destructures only original fields, missing all three
- `data.ts:602`: hardcodes `availableSlots > 0` instead of respecting `minAvailableSlots`

**Contract mismatch summary table**:

| Filter | V2 Service | Map-listings Route | V1 getMapListings | V1 getListingsPaginated | SearchDoc |
|--------|-----------|-------------------|-------------------|------------------------|-----------|
| bookingMode | YES | NO | NO | NO | YES |
| minAvailableSlots | YES | NO | NO (hardcoded >0) | NO | YES |
| nearMatches | YES | NO | NO | NO | YES |
| sort | YES | NO | N/A | YES | YES |
| Query strip condition | sort=recommended | ANY sort | N/A | N/A | N/A |

**User-visible symptoms**: Map shows pins for listings the list filters out (booking mode, slots). Map over-strips query for non-recommended sorts. V1 fallback silently ignores three filter types.

---

### Issue 2: "Show on Map" Not Idempotent — CONFIRMED MEDIUM (downgraded from HIGH)

**Files investigated**:
- `/home/surya/roomshare/src/components/SearchLayoutView.tsx` (lines 37-42, 62)
- `/home/surya/roomshare/src/contexts/SearchMapUIContext.tsx` (lines 57, 72-84)
- `/home/surya/roomshare/src/hooks/useMapPreference.ts` (lines 113-124, 127-138)
- `/home/surya/roomshare/src/components/listings/ListingCard.tsx` (lines 176-180)
- `/home/surya/roomshare/src/contexts/ListingFocusContext.tsx` (lines 115-117)

**Claim 1**: "SearchLayoutView passes toggleMap instead of showMap" — **TRUE**
- `SearchLayoutView.tsx:62`: `<SearchMapUIProvider showMap={toggleMap} shouldShowMap={shouldShowMap}>`
- `showMap` is available from `useMapPreference` (line 127-138) but never destructured

**Claim 2**: "Context assumes callback only opens when hidden" — **TRUE**
- `SearchMapUIContext.tsx:72-84`: `focusListingOnMap` guards with `if (!shouldShowMap) { showMap(); }`
- The guard assumes `showMap()` is idempotent. But `toggleMap` is not.

**Claim 3**: "Real showMap() exists" — **TRUE**
- `useMapPreference.ts:127-138`: idempotent setter that always sets to visible

**Claim 4**: "Rapid clicks can flip map closed" — **TRUE IN THEORY, BUT DEAD CODE PATH TODAY**
- `focusListingOnMap` is defined in context but **never called from any production component**
- `ListingCard.tsx:179` calls `setActive(listing.id)` from `ListingFocusContext`, NOT `focusListingOnMap`
- The `setActive` function (line 115-117) only sets state — it does NOT call `showMap/toggleMap`

**Bonus bug discovered**: MapPin "Show on map" button does nothing when map is hidden on desktop. `setActive` stores the listing ID, but `Map.tsx` is unmounted when hidden, so the effect at line 1578 never runs.

**Severity downgraded to MEDIUM**: The toggle bug is real but latent (dead code). The bonus bug (MapPin silently fails) is arguably worse UX.

---

### Issue 3: Filter Drawer Preview Wrong for minSlots — CONFIRMED MEDIUM

**Files investigated**:
- `/home/surya/roomshare/src/components/search/FilterModal.tsx` (lines 272-319)
- `/home/surya/roomshare/src/hooks/useBatchedFilters.ts` (lines 350, 378-380)
- `/home/surya/roomshare/src/hooks/useDebouncedFilterCount.ts` (lines 74-104, 109-153)
- `/home/surya/roomshare/src/hooks/useFacets.ts` (lines 48-72, 74-110)
- `/home/surya/roomshare/src/app/api/search-count/route.ts` (lines 54-84)

**Claim 1**: "UI exposes minSlots and persists via useBatchedFilters" — **TRUE**
- `FilterModal.tsx:272-319`: Minimum Open Spots UI control
- `useBatchedFilters.ts:378-380`: writes `minSlots` to URL params on commit

**Claim 2**: "Both hooks omit minSlots from cache keys and request builders" — **TRUE**
- `useDebouncedFilterCount.ts:74-104` (`generateCacheKey`): NO minSlots
- `useDebouncedFilterCount.ts:109-153` (`buildCountUrl`): NO minSlots
- `useFacets.ts:48-72` (`generateFacetsCacheKey`): NO minSlots
- `useFacets.ts:74-110` (`buildFacetsUrl`): NO minSlots

**Claim 3**: "getLimitedCount returns null for !query && !bounds" — **TRUE**
- `data.ts:56-58`: `const isUnboundedBrowse = !params.query && !params.bounds; if (isUnboundedBrowse) { return null; }`
- This bypasses the route's `hasActiveFilters` guard at line 71-79 (which correctly includes minSlots)

**Result**: "Show X listings" button and facet counts ignore minSlots. User sees inflated count, then fewer results after applying.

---

### Issue 4: Drawer Stuck Loading Offline — CONFIRMED MEDIUM-LOW

**Files investigated**:
- `/home/surya/roomshare/src/hooks/useDebouncedFilterCount.ts` (lines 195-197, 321)
- `/home/surya/roomshare/src/hooks/useFacets.ts` (lines 130-132, 244)

**Claim 1**: "Both hooks set loading before debounced fetch" — **TRUE**
- `useDebouncedFilterCount.ts:321`: `setIsLoading(true)` before setTimeout at line 324
- `useFacets.ts:244`: `setIsLoading(true)` before setTimeout at line 246

**Claim 2**: "Return on !navigator.onLine without clearing loading" — **TRUE**
- `useDebouncedFilterCount.ts:195-197`: bare `return` with no `setIsLoading(false)`
- `useFacets.ts:130-132`: same pattern

**Lifecycle**: User changes filter → `setIsLoading(true)` → 300ms debounce → `fetchCount` called → `!navigator.onLine` → bare return → loading stuck forever. Only clears on drawer close or filter reset.

---

### Issue 5: Pagination State Bleed — CONFIRMED MEDIUM

**Files investigated**:
- `/home/surya/roomshare/src/app/search/page.tsx` (lines 231-242, 280)
- `/home/surya/roomshare/src/components/search/SearchResultsClient.tsx` (lines 54-61, 79)

**Claim 1**: "page.tsx strips page/cursor from searchParamsString" — **TRUE**
- `page.tsx:234-235`: `if (['cursor', 'cursorStack', 'pageNumber', 'page', 'v2'].includes(key)) continue`

**Claim 2**: "Keys client component with stripped value" — **TRUE**
- `page.tsx:280`: `<SearchResultsClient key={searchParamsString}`

**Claim 3**: "SearchResultsClient keeps mutable pagination state locally" — **TRUE**
- Lines 55-60: `extraListings`, `nextCursor`, `isLoadingMore` as useState
- Line 79: `seenIdsRef` as useRef (mutable, not reactive)

**Claim 4**: "Same filters with different cursor can reuse stale state" — **TRUE**
- Same `searchParamsString` (cursor stripped) → same React key → no remount → stale `extraListings`, `seenIdsRef`, `nextCursor` persist

**Mitigating factor**: System was designed so cursor is never in shareable URLs. CLAUDE.md documents: "URLs contain only initial search params (no cursor)." Main risk is browser back/forward with V1 offset pagination where `page` param ends up in URL.

---

### Issue 6: Header Summaries Canonical Parsing — CONFIRMED MEDIUM

**Files investigated**:
- `/home/surya/roomshare/src/components/CollapsedMobileSearch.tsx` (lines 33, 60-64)
- `/home/surya/roomshare/src/components/search/CompactSearchPill.tsx` (lines 19, 48-49)
- `/home/surya/roomshare/src/components/SearchForm.tsx` (lines 401-413, 445-447)
- `/home/surya/roomshare/src/hooks/useBatchedFilters.ts` (lines 57-67, 363-371)

**Claim 1**: "q treated as location even for semantic search" — **TRUE**
- `CollapsedMobileSearch.tsx:33`: `const location = searchParams.get("q") || ""`
- `CompactSearchPill.tsx:19`: `const location = searchParams.get('q') || ''`
- Neither checks the `what` param. When semantic search is active, `q` contains "quiet room with good wifi", not a location.
- `SearchForm.tsx:109` correctly handles this: `searchParams.get('what') ? '' : (searchParams.get('q') || '')`

**Claim 2**: "getAll() vs CSV serialization mismatch" — **TRUE**
- Writing: `SearchForm.tsx:445-447` uses repeated params (`append`): `?amenities=Wifi&amenities=AC`
- Writing: `useBatchedFilters.ts:363-371` uses CSV (`set+join`): `?amenities=Wifi,AC`
- Reading: Both headers use `getAll()` which returns `["Wifi,AC"]` (1 item) for CSV format
- Canonical parser exists at `useBatchedFilters.ts:57-67` (`parseParamList`) but neither header uses it

**Result**: Filter badge shows 1 instead of 3 when filter drawer serializes 3 amenities as CSV. Semantic query text displayed as location name.

---

### Issue 7: Test Gate Weakness — CONFIRMED HIGH

**Files investigated**:
- `/home/surya/roomshare/tests/e2e/journeys/search-v2-state.spec.ts` (lines 25, 77)
- `/home/surya/roomshare/tests/e2e/search-v2-fallback.spec.ts` (lines 169-277)
- `/home/surya/roomshare/tests/e2e/search-error-resilience.anon.spec.ts` (lines 202-683)
- `/home/surya/roomshare/src/__tests__/api/search/v2/route.test.ts`
- `/home/surya/roomshare/src/__tests__/api/map-listings-route.test.ts`

**Claim 1**: "V2 stale-state regression disabled" — **TRUE**
- `search-v2-state.spec.ts:25`: `test.skip(true, 'App bug: V1PathResetSetter not rendered...')`
- `search-v2-state.spec.ts:77`: same skip. Both tests cover an infinite-loop hang with zero coverage.

**Claim 2**: "Fallback E2Es only prove page renders" — **TRUE**
- `search-v2-fallback.spec.ts:169-194`: assertions are `toBeAttached()` + truthy heading text
- `search-v2-fallback.spec.ts:197-243`: conditional "Show more" test skips silently if button not visible
- `search-error-resilience.anon.spec.ts:202-297`: final assertion is `expect(bodyContent).toBeTruthy()` — proves page is not blank, nothing more
- `search-error-resilience.anon.spec.ts:353-392`: asserts `bodyContent.length > 50`
- `search-error-resilience.anon.spec.ts:394-431`: loading state locators created but never asserted on

**Claim 3/4**: "Unit tests mock wrong layer" — **TRUE**
- `route.test.ts`: mocks `@/lib/data` (getListingsPaginated/getMapListings) but route now calls `executeSearchV2` from `@/lib/search/search-v2-service`
- `map-listings-route.test.ts`: mocks `@/lib/data` but route now has dual SearchDoc path via `isSearchDocEnabled` + `getSearchDocMapListings` — completely untested

**Uncovered critical behaviors**: V2 service layer (`executeSearchV2`), SearchDoc path in map-listings, semantic query stripping for maps, race conditions in "search as I move" AbortController pattern.

---

## Fix Safety Analysis (Blast Radius + Pre-Mortem)

### Fix 1: Map Contract — MEDIUM-HIGH Regression Risk

**Proposed approach**: Spread `parsed.filterParams` instead of cherry-picking. Add sort check to query stripping.

**CRITICAL HIDDEN RISK DISCOVERED**: `createSearchDocMapCacheKey` in `search-doc-queries.ts:190-196` does NOT include `minAvailableSlots` in `buildBaseCacheFields` (lines 160-178). If the spread sends `minAvailableSlots` to `getSearchDocMapListings`, the SQL query will filter by it correctly, BUT `unstable_cache` will return stale results because different `minAvailableSlots` values share the same cache key. This is **cache poisoning** — a NEW bug the fix would introduce.

**Other risks**:
- `sort` propagation changes which markers survive `MAX_MAP_MARKERS` truncation
- `nearMatches` on map without matching list expansion creates map/list disagreement in the opposite direction
- V1 path silently ignores the new fields (harmless but misleading)

**Mitigation required before implementing**:
1. Add `minAvailableSlots` to `buildBaseCacheFields` in `search-doc-queries.ts`
2. Explicitly exclude `sort`, `page`, `limit` from the spread: `{ ...parsed.filterParams, sort: undefined, page: undefined, limit: undefined, bounds }`
3. Decision needed: should `nearMatches` propagate to map? If yes, list must also expand. If no, exclude from spread.

### Fix 2: Show on Map — LOW Regression Risk

**Safe, isolated change**. Destructure `showMap` from `useMapPreference` and pass to `SearchMapUIProvider`. `toggleMap` continues to be used for `SearchViewToggle` and keyboard shortcut (correct toggle behavior).

**Implementation trap**: Do NOT replace all 3 `toggleMap` references — only the `SearchMapUIProvider` prop. The keyboard shortcut (line 48) and `SearchViewToggle.onToggle` (line 69) must stay as `toggleMap`.

### Fix 3: minSlots Preview — LOW Regression Risk

**Safe, additive change**. Add `minSlots` to 4 functions across 2 files. Backend already parses and handles `minSlots` via `parseSearchParams`. Cache key cardinality increase is minimal (~20 valid values).

### Fix 4: Offline Loading — LOW Regression Risk

**Two-line fix**. Add `setIsLoading(false)` before offline `return` in both hooks. Strictly better behavior. No downstream state coupling.

**Minor caveat**: After fix, going back online doesn't auto-retry (no `navigator.onLine` event listener). User must interact to trigger new fetch. This is acceptable degradation and was already broken (stuck spinner).

### Fix 5: Pagination Bleed — MEDIUM Regression Risk

**Option A (cursor in key): DANGEROUS** — causes remount on every server render even without filter changes. Destroys "Load more" progress on back-navigation. **Do not use.**

**Option B (useEffect reset): SAFER** — watch `initialListings` prop changes, reset `extraListings`, `nextCursor`, AND `seenIdsRef` (ref must be manually cleared). Risk: array reference identity must be stable (it is, from server component props). Risk: forgetting to reset `seenIdsRef` causes silent deduplication bugs.

**Practical exposure**: Limited. System intentionally keeps cursor out of shareable URLs. Main vector is V1 offset pagination `page` param in browser history.

### Fix 6: Header Parsing — LOW Regression Risk

**Display-only changes**. Use `parseParamList`-style parsing (flatMap + split on commas) in both header components. Check `what` param to determine if `q` is location or semantic query. No state/data flow impact.

**Implementation note**: Do NOT import `parseParamList` from `useBatchedFilters` (creates coupling). Inline the split logic or extract to a tiny shared utility in `src/lib/search-params.ts`.

### Fix 7: Test Gate — MEDIUM Regression Risk (implementation quality)

**Must be atomic with Fix 1**. Updated tests must reflect the new contract (spread filterParams, sort-aware query stripping).

**Required mock updates**:
- `map-listings-route.test.ts`: add mock for `@/lib/search/search-doc-queries` (isSearchDocEnabled, getSearchDocMapListings)
- `route.test.ts`: mock `@/lib/search/search-v2-service` (executeSearchV2) instead of `@/lib/data`
- Both: mock `@/lib/env` features if needed

**E2E assertion strengthening**: Replace `expect(bodyContent).toBeTruthy()` with assertions on actual error UI elements (error boundary text, "Try again" button, alert messages).

**Disabled tests**: The 2 skipped tests in `search-v2-state.spec.ts` cover a real V1PathResetSetter bug. Un-skipping requires fixing the underlying app bug first (out of scope for this plan). Alternative: add unit tests covering the same scenario.

---

## Recommended Fix Ordering

Priority is based on: risk of the fix × impact of the bug × independence of the change.

| Order | Fix | Risk | Rationale |
|-------|-----|------|-----------|
| 1 | Fix 4 (offline loading) | LOW | Trivial 2-line fix, zero blast radius, immediate UX improvement |
| 2 | Fix 3 (minSlots preview) | LOW | Additive, backend ready, 4 targeted edits |
| 3 | Fix 6 (header parsing) | LOW | Display-only, no state coupling |
| 4 | Fix 2 (show on map) | LOW | Single prop change, idempotent improvement |
| 5 | Fix 5 (pagination bleed) | MEDIUM | Option B only; limited practical exposure justifies lower priority |
| 6 | Fix 1+7 (map contract + tests) | MEDIUM-HIGH | Highest impact but highest risk; do LAST with full test coverage; MUST also fix cache key |

### Fix Dependencies

```
Fix 4 ──────┐
Fix 3 ──────┤
Fix 6 ──────┤── All independent, can be parallelized
Fix 2 ──────┤
Fix 5 ──────┘

Fix 1 ◄──── MUST be atomic with ───► Fix 7
  │
  └── MUST ALSO fix: add minAvailableSlots to buildBaseCacheFields
      in search-doc-queries.ts:160-178 (cache poisoning prevention)
```

---

## Pre-Mortem: Top 5 Ways These Fixes Could Fail

| # | Failure Mode | Fix | Prevention |
|---|-------------|-----|------------|
| 1 | **Cache poisoning**: spreading `minAvailableSlots` to SearchDoc map path without updating `buildBaseCacheFields` causes stale cached results | Fix 1 | Add `minAvailableSlots` to `buildBaseCacheFields` in `search-doc-queries.ts:160-178` BEFORE spreading |
| 2 | **Map shows 0 markers**: spreading `sort` + `bookingMode` to map query over-filters; user sees empty map | Fix 1 | Explicitly exclude `sort`, `page`, `limit` from spread. Test with narrow bookingMode + low minSlots |
| 3 | **Map becomes uncloseable**: implementer replaces ALL `toggleMap` refs with `showMap` in SearchLayoutView | Fix 2 | Only change the `SearchMapUIProvider` prop (line 62). Verify keyboard "M" shortcut still toggles. |
| 4 | **seenIdsRef not reset**: useEffect resets `extraListings` and `nextCursor` but forgets `seenIdsRef.current = new Set(...)` | Fix 5 | Explicitly reset all 3: `setExtraListings([])`, `setNextCursor(initialNextCursor)`, `seenIdsRef.current = new Set(initialListings.map(l => l.id))` |
| 5 | **Tests pass vacuously**: updated mocks bypass real code paths, giving false confidence | Fix 7 | Each test must assert on the arguments passed to the mocked function, not just the response shape |

---

## Confidence Score Breakdown

| Dimension | Weight | Score | Evidence |
|-----------|--------|-------|----------|
| Research Grounding | 15% | 5/5 | All claims verified against actual source code |
| Codebase Accuracy | 25% | 5/5 | Every file path, line number, and code quote verified by agents |
| Assumption Freedom | 20% | 4.5/5 | One open question: should `nearMatches` propagate to map? |
| Completeness | 15% | 4.5/5 | All fixes analyzed; cache poisoning risk discovered |
| Harsh Critic Verdict | 15% | 4/5 | CONDITIONAL PASS — Fix 1 blocked until cache key fix confirmed |
| Specificity | 10% | 5/5 | Every step has exact file paths and line numbers |

**Overall**: 4.6/5.0 — **HIGH confidence**. Execute with standard review. Fix 1 requires extra attention to the cache key issue.

---

## Open Questions (Must Resolve Before Implementing Fix 1)

1. **Should `nearMatches` propagate to the map?** If yes, map shows expanded results but list may not (or vice versa). If no, explicitly set `nearMatches: false` in the map spread. **Recommendation**: exclude from map spread to maintain consistency.

2. **Should `sort` propagate to the map?** It affects which markers survive `MAX_MAP_MARKERS` truncation. **Recommendation**: exclude — map markers should be spatially representative, not sort-dependent.

3. **Is the V1 fallback path active in production?** If SearchDoc feature flag is always on, V1 `getMapListings`/`getListingsPaginated` fixes are low priority. Check `features.searchDoc` default in production env.

---

## Assumption Audit

| # | Statement | Source | Verified? |
|---|-----------|--------|-----------|
| 1 | `focusListingOnMap` is never called from production components | Grep for all callers | YES — only in test files |
| 2 | Backend search-count route already parses minSlots | Read `parseSearchParams` + route handler | YES — `minAvailableSlots` in filterParams |
| 3 | `buildBaseCacheFields` omits `minAvailableSlots` | Read `search-doc-queries.ts:160-178` | YES — confirmed by pre-mortem agent |
| 4 | SearchResultsClient key doesn't include cursor | Read `page.tsx:280` | YES — `key={searchParamsString}` |
| 5 | `parseParamList` handles both CSV and repeated params | Read `useBatchedFilters.ts:57-67` | YES — `flatMap(v => v.split(","))` |
| 6 | V1PathResetSetter unit tests are NOT skipped | Read test file | YES — all 6 tests active |
| 7 | The 2 skipped tests are in `search-v2-state.spec.ts` (E2E, not unit) | Read file | YES — `test.skip(true, ...)` |
