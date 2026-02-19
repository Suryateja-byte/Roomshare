# Roomshare Search Page — Production Readiness Audit

**Team**: 5 Opus 4.6 agents | **Scope**: ~160 files, ~48,000 lines | **Date**: 2026-02-19

---

## Scorecard

| Domain | Reviewer | Issues | Verdict |
|--------|----------|--------|---------|
| API & Data Layer | api-reviewer | 3H, 5M, 3L | Good — 2 must-fix |
| Client Components & UX | ui-reviewer | 2H, 8M, 4L | Good — a11y gaps |
| Map & Geospatial | map-reviewer | 4H, 6M, 5L | Good — dead code risk |
| Hooks & State | hooks-reviewer | 3H, 5M, 4L | Good — memory + error gaps |
| Security & Performance | security-reviewer | 1H, 4M, 2L sec / 2H, 3M, 2L perf | Strong posture |
| **TOTAL** | | **13 High, 24 Medium, 18 Low** | **Production-capable with targeted fixes** |

---

## CRITICAL / HIGH Issues — Fix Before Launch

### Data Correctness

| # | Issue | File | Impact |
|---|-------|------|--------|
| **H1-API** | Gender filter missing from list cache key | `search-doc-queries.ts:105-125` | **Wrong results** — User B gets User A's gender-filtered cache |
| **H3-API** | `search-doc-sync` doesn't populate `search_tsv` | `search-doc-sync.ts:113-167` | New listings invisible to text search for up to 6 hours |

### Security

| # | Issue | File | Impact |
|---|-------|------|--------|
| **H2-API / S1** | `assertParameterizedWhereClause` disabled in prod | `search-doc-queries.ts:73-74` | Defense-in-depth gap — future injection bugs undetectable in prod |
| **S2** | URL params `?searchDoc=0` force expensive legacy queries | `search-doc-queries.ts:1416-1428` | Targeted DoS via forcing unindexed query path |

### Accessibility

| # | Issue | File | Impact |
|---|-------|------|--------|
| **H1-UI** | SortSelect mobile sheet: no focus trap, no dialog role, no Escape | `SortSelect.tsx:104-144` | Keyboard users can tab behind overlay; screen readers don't announce modal |
| **H2-UI** | MobileSearchOverlay missing `role="dialog"` + `aria-modal` | `MobileSearchOverlay.tsx:80-86` | Focus leaks, screen reader silence |

### Performance

| # | Issue | File | Impact |
|---|-------|------|--------|
| **P1** | Facets endpoint opens **5 DB transactions** per request | `facets/route.ts:541-553` | 5x connection pool pressure under burst traffic |
| **H1-MAP** | Legacy `MapClient.tsx` is 640 lines of dead code | `map/MapClient.tsx` | Developer confusion, missing production fixes |
| **H3-MAP** | `sourcedata` handler fires dozens of times/sec without throttle | `Map.tsx:1755-1778` | Performance degradation on low-end mobile during pan |

### State Management

| # | Issue | File | Impact |
|---|-------|------|--------|
| **H1-HOOKS** | Module-level caches grow unbounded (no eviction) | `useDebouncedFilterCount.ts:31`, `useFacets.ts:24`, `useFilterImpactCount.ts:25` | Memory leak in long sessions |
| **H2-HOOKS** | `useDebouncedFilterCount` effect has `count` in deps — wasteful re-render cycle | `useDebouncedFilterCount.ts:341` | Extra render on every count fetch |
| **H3-HOOKS** | `useAbortableServerAction` callback identity unstable with inline callbacks | `useAbortableServerAction.ts:106` | Cascading unnecessary re-renders |

---

## MEDIUM Issues — Should Fix

### API & Data

- **M1**: Facets endpoint skips bounds validation when no text query (DoS vector) — `facets/route.ts:604-672`
- **M2**: `fetchMoreListings` uses `console.warn` instead of structured logger — `search/actions.ts:69,79`
- **M3**: `search-alerts` instant path fetches all subscriptions unbounded (no pagination) — `search-alerts.ts:384-399`
- **M4**: V1 fallback leaks Prisma error messages to UI — `search-orchestrator.ts:85-86`
- **M5**: Alert text matching uses ILIKE instead of FTS (different results than search) — `search-alerts.ts:189-192`
- **M6**: Unsafe `any` casts on raw query results (no type safety) — `search-doc-queries.ts:683,835,1087,1271`
- **M7**: Error messages in search-alerts may contain PII paths — `search-alerts.ts:261,276`

### Client Components

- **M1-UI**: Body `overflow: hidden` race between 3 components (permanent scroll lock possible) — `MobileBottomSheet.tsx:272-279`, `FilterModal.tsx:129-133`, `MobileSearchOverlay.tsx:53-60`
- **M2-UI**: `allListings` array rebuilt every render without `useMemo` — `SearchResultsClient.tsx:86`
- **M3-UI**: `splitStayPairs` uses length proxy instead of stable reference — `SearchResultsClient.tsx:114-117`
- **M4-UI**: RecommendedFilters bypasses `SearchTransitionContext` navigation — `RecommendedFilters.tsx:87-89`
- **M5-UI**: FilterChipWithImpact fires N individual API calls (no batching) — `FilterChipWithImpact.tsx:42-44`
- **M6-UI**: AppliedFilterChips left fade always `opacity-0` (dead code) — `AppliedFilterChips.tsx:93-97`
- **M7-UI**: MobileBottomSheet stores `viewportHeight` as state causing extra renders on drag — `MobileBottomSheet.tsx:99`
- **M8-UI**: SearchForm mount effect has missing dependencies — `SearchForm.tsx:158-174`

### Map

- **H2-MAP**: Search-as-move doesn't handle antimeridian-crossing bounds — `Map.tsx:1278-1281`
- **M1-MAP**: `initialViewState` useMemo stale closure on `listings` (fragile) — `Map.tsx:911-955`
- **M2-MAP**: No WebGL support detection before map init (poor fallback UX) — `DynamicMap.tsx`, `PersistentMapWrapper.tsx`
- **M3-MAP**: `onMoveStart` sets tile loading immediately (visual flash on every pan) — `Map.tsx:1806`
- **M4-MAP**: `markerPositions` memo uses `void` trick (non-obvious, fragile) — `Map.tsx:683-733`
- **M5-MAP**: `MapGestureHint` uses `localStorage` (violates session-only rule) — `MapGestureHint.tsx:6`
- **M6-MAP**: Client abort doesn't cancel server-side DB query — `PersistentMapWrapper.tsx:571-574`

### Hooks & State

- **M1-HOOKS**: Fetch hooks silently swallow errors (no `error` state exposed) — `useDebouncedFilterCount.ts:255-269`, `useFacets.ts:162-172`, `useFilterImpactCount.ts:155-173`
- **M2-HOOKS**: Fetch hooks don't check `navigator.onLine` before requests — `useDebouncedFilterCount.ts`, `useFacets.ts`, `useFilterImpactCount.ts`
- **M3-HOOKS**: `useBatchedFilters` 10s magic number for sync window — `useBatchedFilters.ts:268`
- **M4-HOOKS**: `useBlockStatus` uses `any` for Supabase payload — `useBlockStatus.ts:71`
- **M5-HOOKS**: API response type assertions without runtime validation — `useDebouncedFilterCount.ts:243`, `useFilterImpactCount.ts:144`, `useFacets.ts:151`

### Security & Performance

- **S3**: `ownerId` (internal CUID) exposed in public API responses — `get-listings.ts:99`, `search-doc-queries.ts:673`, `types/listing.ts:28`
- **S4**: Facets allows full-table aggregations with no bounds — `facets/route.ts:604-606`
- **S5**: Saved search name logged with potential PII — `saved-search.ts:122`
- **P2**: `COUNT(*) OVER()` on every map listing row (prevents early termination) — `search-doc-queries.ts:675`
- **P3**: Cache key determinism relies on object field ordering — `search-doc-queries.ts:105-125`, `facets/route.ts:514-532`
- **P4**: FilterModal not code-split (470+ lines in initial bundle) — `FilterModal.tsx`
- **P5**: Near-match expansion doubles query cost for low-result scenarios — `search-doc-queries.ts:885-926`

---

## LOW Issues

### API & Data

- **L1**: `buildFacetWhereConditions` duplicates `buildSearchDocWhereConditions` (~150 lines) — `facets/route.ts:139-296` vs `search-doc-queries.ts:380-528`
- **L2**: `parseDateOnly` duplicated in 3 files — `facets/route.ts:123`, `search-doc-queries.ts:172`, `search-alerts.ts:46`
- **L3**: Listing data mapping code duplicated 3x — `search-doc-queries.ts:841-866,1093-1118,1277-1302`

### Client Components

- **L1-UI**: SuggestedSearches hardcoded popular areas (TODO in code) — `SuggestedSearches.tsx:11-20`
- **L2-UI**: handleUseMyLocation stale closure on geoLoading guard (mitigated by disabled button) — `SearchForm.tsx:209-246`
- **L3-UI**: PriceRangeFilter sync misses same-value re-applies (extremely unlikely) — `PriceRangeFilter.tsx:33-44`
- **L4-UI**: ListingCardCarousel keyboard focus ring not visible — `ListingCardCarousel.tsx:163`

### Map

- **L1-MAP**: Duplicate popup styling CSS across Map.tsx and MapClient.tsx — `Map.tsx:2057-2060`
- **L2-MAP**: MapMovedBanner "Search this area" button has no loading state — `MapMovedBanner.tsx:46-51`
- **L3-MAP**: E2E testing hooks exposed in non-E2E builds — `Map.tsx:1743-1748`
- **L4-MAP**: Longitude offset doesn't account for latitude-dependent distortion — `Map.tsx:719`
- **L5-MAP**: handleContentTouchStart misses some form controls — `MobileBottomSheet.tsx:244`

### Hooks & State

- **L1-HOOKS**: `useKeyboardShortcuts` uses deprecated `navigator.platform` — `useKeyboardShortcuts.ts:155`
- **L2-HOOKS**: No retry-with-backoff for failed API requests — `useDebouncedFilterCount.ts`, `useFacets.ts`, `useFilterImpactCount.ts`
- **L3-HOOKS**: `useAbortableServerAction` naming misleading (doesn't abort server-side) — `useAbortableServerAction.ts`
- **L4-HOOKS**: `useFacets` effect has redundant `fetchFacets` dependency — `useFacets.ts:207`

### Security & Performance

- **S6**: Debug ranking signals available behind env flag (needs admin gate) — `search-v2-service.ts:300-302`
- **S7**: `getListingsInBounds` requires auth but public search doesn't (inconsistent) — `get-listings.ts:38-39`
- **S8**: No middleware.ts found for CSP nonce injection — `next.config.ts:77`
- **P6**: `unstable_cache` closure captures params by reference — `search-doc-queries.ts:960-968`
- **P7**: Inconsistent Cache-Control headers (facets is `private, no-store` but could be public) — various route files

---

## What's Excellent (Patterns Worth Preserving)

All 5 reviewers independently identified these as production-grade:

1. **Parameterized SQL everywhere** with `SECURITY INVARIANT` comments at every raw query
2. **Allowlist-based validation** — invalid filter values silently drop, never error
3. **Rate limiting on every endpoint** with auth-aware differentiation
4. **Full-table scan prevention** — bounds required, MAX_UNBOUNDED_RESULTS, statement timeouts
5. **Keyset cursor pagination** with proper NULL handling and mixed ASC/DESC support
6. **Parallel query execution** with `Promise.allSettled` + partial failure tolerance
7. **Double-protection cursor reset** (component key + useEffect) for pagination invariants
8. **60-item client cap** with `seenIdsRef` dedup across Load More appends
9. **WebGL context recovery** with 5s remount fallback
10. **Comprehensive accessibility** in FilterModal (focus trap, dialog role, fieldset/legend)
11. **Mobile bottom sheet** gesture isolation (all 6 CLAUDE.md rules verified passing)
12. **CLS prevention** throughout (skeletons match card dimensions, SSR-safe hydration)
13. **Cache poisoning prevention** with `PublicListing` types and `USER_SPECIFIC_FIELDS` blocklist
14. **Persistent map mount** across navigations preventing re-initialization costs
15. **Search-as-move** with debounce + throttle + AbortController + 30s cache

---

## Recommended Fix Priority

### Sprint 1 (Before launch)

1. Fix gender filter cache key (H1-API) — 1 line fix, prevents wrong results
2. Re-enable SQL assertion in prod (H2-API/S1) — remove early return
3. Disable URL feature-flag overrides in prod (S2) — prevent DoS vector
4. Add focus trap + dialog role to SortSelect and MobileSearchOverlay (H1-UI, H2-UI)
5. Consolidate facets into single transaction (P1) — prevent connection exhaustion

### Sprint 2 (Post-launch stabilization)

6. Add LRU eviction to module-level caches (H1-HOOKS)
7. Throttle `sourcedata` handler (H3-MAP)
8. Delete dead `MapClient.tsx` (H1-MAP)
9. Centralize body scroll lock (M1-UI)
10. Stabilize `useAbortableServerAction` callbacks (H3-HOOKS)
11. Add `error` state to fetch hooks (M1-HOOKS)
12. Confirm `search_tsv` population path (H3-API)

### Sprint 3 (Hardening)

13. Remaining Medium issues by area
14. Low issues as time permits

---

## CLAUDE.md Invariant Compliance

### Search Pagination Invariants — ALL PASS

| Invariant | Status | Evidence |
|-----------|--------|----------|
| Cursor reset on filter/sort/query change | PASS | `key={searchParamsString}` (page.tsx:362) remounts + useEffect reset (SearchResultsClient.tsx:74-84) |
| No duplicate listings via seenIdsRef | PASS | Initialized with SSR IDs, dedup filter in handleLoadMore |
| 60-item cap (MAX_ACCUMULATED) | PASS | `reachedCap` check, hides Load More, shows nudge |
| URL contains only initial params (no cursor) | PASS | apiParams excludes cursor/page/v2 |

### Mobile Bottom Sheet Rules — ALL PASS

| Rule | Status | Evidence |
|------|--------|----------|
| 3 snap points (~15vh, ~50vh, ~85vh) | PASS | Constants at MobileBottomSheet.tsx:18-20 |
| Default half | PASS | `useState(1)` at line 74 |
| Drag limited to handle/header | PASS | touchAction: "none" only on handle |
| Expanded+scrolled to top+drag down=collapse | PASS | isScrollDrag logic |
| Escape collapses to half | PASS | `setSnapIndex(1)` with dialog priority check |
| Body scroll locked when expanded | PASS | `if (snapIndex === 2 \|\| isDragging)` |
