# Search Page Production Readiness Audit — Complete Documentation

**Date**: 2026-03-21
**PR**: #66 — `fix/search-page-10-verified-issues`
**Scope**: 24 files, +658/-160 lines, 18 commits
**Tests**: 6,976/6,976 passing (10 new tests added)

---

## Table of Contents

1. [Audit Methodology](#1-audit-methodology)
2. [Issues Fixed (33)](#2-issues-fixed-33)
3. [Issues Retracted (11)](#3-issues-retracted-11)
4. [Issues Accepted as Intentional Design (2)](#4-issues-accepted-as-intentional-design-2)
5. [Key Decisions Made](#5-key-decisions-made)
6. [Files Modified](#6-files-modified)
7. [Test Coverage Added](#7-test-coverage-added)

---

## 1. Audit Methodology

### Phase 1: Discovery
Six specialized agents ran in parallel to explore the search page:
- **search-explorer**: Mapped the complete file inventory (~150 files)
- **api-explorer**: Reviewed all API routes and database queries
- **test-explorer**: Identified test coverage gaps
- **map-context-reviewer**: Reviewed PersistentMapWrapper + all contexts
- **service-reviewer**: Reviewed search service, SQL queries, cursor pagination
- **map-reviewer**: Reviewed Map component, event handling, race conditions

### Phase 2: Verification
Every issue from the discovery phase was verified by reading the actual code at the exact line numbers. Issues that couldn't be confirmed were retracted. The initial report of 55 issues was reduced to 46 verified issues after code review.

### Phase 3: Implementation
Each fix was planned using the deliberate-plan skill (Socratic interview, codebase analysis, pre-mortem analysis, harsh critic review) before implementation. Fixes were applied incrementally with typecheck + lint + full test suite verification after each commit.

### Phase 4: Final Review
A code review agent examined all 24 changed files across 18 commits. Result: all 33 fixes verified correct, no critical issues found.

---

## 2. Issues Fixed (33)

### P0 — Critical (3 fixes)

#### #1 — 429 Retry Uses Stale Aborted Signal
**File**: `src/components/PersistentMapWrapper.tsx:640-643`
**Problem**: When a map fetch got a 429 rate limit, the retry closure captured the original caller's AbortSignal. If the user panned during the retry delay, effect cleanup aborted that signal, causing the retry fetch to immediately fail with AbortError — silently swallowed, leaving the map empty with no data and no error.
**Fix**: Create a fresh `AbortController` inside the retry `setTimeout` and assign it to `searchAbortRef.current` so subsequent cleanup cycles can still abort the retry.
**Test added**: Verifies the retry's signal is not pre-aborted at call time.

#### #29 — Rating Keyset Cursor Skips Rows
**File**: `src/lib/search/search-doc-queries.ts:354-369`
**Problem**: The keyset WHERE clause for `sort="rating"` with `cursorCount === null` was missing rows where `avg_rating = cursorRating AND review_count IS NOT NULL`. PostgreSQL `DESC` defaults to `NULLS FIRST`, so NULL counts sort before non-NULL counts. The missing branch meant non-NULL count rows at the same rating were silently skipped during pagination.
**Fix**: Added `OR (d.avg_rating = cursorRating AND d.review_count IS NOT NULL)` branch.
**Discovery during implementation**: `review_count` is `NOT NULL DEFAULT 0` in the schema, so this branch is defensive hardening (only reachable via crafted/legacy cursors).
**Tests added**: 8 tests including full walk-through pagination proofs (page sizes 1 and 3), zero gaps, zero duplicates.

#### #30 — Orchestrator Unbounded Search Falls Through to V1
**File**: `src/lib/search/search-orchestrator.ts:56-67`
**Problem**: When `executeSearchV2` returned `{ unboundedSearch: true }`, the error field was `undefined`, so `fetchError` became `null`. The code fell through to V1 `getListingsPaginated` without bounds — potentially causing a full-table scan.
**Fix**: Added early return checking `v2Result.unboundedSearch` before the V1 fallback.
**Discovery during implementation**: `page.tsx` already catches `boundsRequired` at line 148 before any search attempt. The orchestrator is only called by tests — this is defensive hardening.
**Test added**: Verifies V1 is NOT called when V2 signals unbounded search.

---

### P1 — High Priority (2 fixes)

#### #4 — Shared AbortController Between Search and Pan Effects
**File**: `src/components/PersistentMapWrapper.tsx:553-558`
**Problem**: Both the search effect and pan effect wrote to the same `abortControllerRef`. When the user panned during a search debounce window, the pan effect aborted the search controller, causing the search fetch to silently fail. The map showed pan data instead of filter data.
**Fix**: Split `abortControllerRef` into `searchAbortRef` and `panAbortRef`. Each effect creates and aborts only its own controller. `fetchTimeoutRef` and `lastFetchedParamsRef` remain shared (intentional — latest fetch wins, dedup works). Added cleanup function to pan effect.
**Test added**: Verifies search fetch signal is not pre-aborted.

#### #8 — Inconsistent URL Format for Array Params
**Files**: `src/components/SearchForm.tsx:556-558`, `src/lib/search-utils.ts:34-44`
**Problem**: `useBatchedFilters.commit()` used `params.set("amenities", joined)` (comma-separated) while `SearchForm.handleSearch()` used `params.append("amenities", a)` (repeated params). Same filters produced different URL strings → cache key mismatches in `useDebouncedFilterCount` and `useFacets`.
**Fix**: Changed `SearchForm.handleSearch()` and `buildSearchUrl()` to use `.set()` with `.join(",")` — matching the `useBatchedFilters.commit()` pattern. Updated 4 test assertions.
**Decision**: Standardized on comma-separated format. The parser (`parseParamList`) handles both formats via `getAll()` + `flatMap(split(","))`, so this is backward-compatible with bookmarked URLs.

---

### Performance (6 fixes)

#### #40 — Amenities Filter LIKE Bypasses GIN Index
**Files**: `src/lib/search/search-doc-queries.ts:530-541`, `src/app/api/search/facets/route.ts:253-265`
**Problem**: Amenities WHERE clause used `NOT EXISTS / LIKE '%' || search_term || '%'` which could not use the GIN index on `amenities_lower`. Comment claimed "DB may have 'Pool Access'" — verified this is false.
**Fix**: Switched to `@>` containment (same pattern as house_rules). The GIN index (`search_doc_amenities_gin_idx`) was created in the original migration but unused until now.
**Decision**: Safe because VALID_AMENITIES has only 9 exact values enforced by Zod schema validation. No migration needed.

#### #34 — Near-Match Expansion Bypasses Cache
**File**: `src/lib/search/search-doc-queries.ts:1037,1415`
**Problem**: Near-match expansion called the uncached `getSearchDocListingsPaginatedInternal` directly, doubling DB load on cache misses. `getSearchDocListingsFirstPage` called itself recursively (also uncached).
**Fix**: Both callbacks now route through the cached `getSearchDocListingsPaginated` wrapper (60s `unstable_cache` TTL). The `nearMatches: false` guard prevents infinite recursion.

#### #11 — ResizeObserver Recreated on Every Scroll
**File**: `src/components/SearchHeaderWrapper.tsx:145`
**Problem**: `useEffect` deps were `[isCollapsed, isExpanded]`. Every scroll direction change disconnected and recreated the `ResizeObserver`.
**Fix**: Changed deps to `[]`. The observer fires on size changes regardless of scroll state.

#### #44 — Prototype Patch Runs Every Render
**File**: `src/components/Map.tsx:2021`
**Problem**: `patchMapPrototypeAddLayer` `useEffect` had no dependency array — ran after every render. The patch is idempotent but wasteful.
**Fix**: Added `[isMapLoaded]` as dependency — runs once when map loads.

#### #16 — Favorites Refetch All IDs on Load-More
**File**: `src/components/search/SearchResultsClient.tsx:212-248`
**Problem**: The favorites hydration effect used `allListings` as dependency, refetching ALL listing IDs (up to 60) on every "Load More" click.
**Fix**: Added `fetchedFavIdsRef` to track already-fetched IDs. The effect computes a delta, fetches only new IDs, and merges results. The ref resets when the search fingerprint changes.

#### #19 — Facets Cache Key Excludes Price
**File**: `src/hooks/useFacets.ts:52-53`
**Problem**: Cache key excluded `minPrice`/`maxPrice` to prevent histogram refetches during slider drag. But this also staled non-price facet counts (amenities, roomTypes, houseRules) after price changes.
**Fix**: Added `minPrice` and `maxPrice` to the cache key. The 300ms debounce and AbortController already prevent excessive fetches during drag. Updated test to verify price changes trigger refetches.

---

### UX & Accessibility (7 fixes)

#### #9 — Mobile Bottom Sheet Stays Collapsed After Navigation
**File**: `src/components/SearchViewToggle.tsx:43-60`
**Problem**: `mobileSnap` was local state that persisted across `/search` navigations. When a user collapsed the sheet and changed filters, the sheet stayed collapsed — no results visible.
**Fix**: Added `filterParamsKey` (memoized, geo-stripped) + `useEffect` that resets `mobileSnap` to 1 when filter params change. Skips initial mount and map pan bounds changes. Uses the same geo-stripping pattern as `SearchResultsLoadingWrapper`.

#### #12 — SortSelect Mobile Sheet No Body Scroll Lock
**File**: `src/components/SortSelect.tsx:9,38`
**Problem**: Mobile sort bottom sheet rendered with backdrop but no `useBodyScrollLock`. Background content scrolled behind the sheet.
**Fix**: Added `import { useBodyScrollLock }` and `useBodyScrollLock(mobileOpen)`.

#### #15 — "Clear All" Clears Location
**File**: `src/components/SearchForm.tsx:690-716`
**Problem**: `handleClearAllFilters` navigated to bare `/search`, clearing location, coordinates, bounds, and sort. Inconsistent with `AppliedFilterChips` "Clear all" which preserves location.
**Fix**: Use the shared `clearAllFilters()` from `filter-chip-utils.ts` which preserves `q`, `lat`, `lng`, bounds, and `sort`. Removed `setLocation("")` and `setSelectedCoords(null)` — keep location context.
**Decision**: User confirmed "Preserve location + sort" is the desired behavior.

#### #17 — Profile Dropdown No Escape Key
**File**: `src/components/SearchHeaderWrapper.tsx:92-108`
**Problem**: Profile dropdown closed on click outside but had no Escape key handler. WCAG 2.1 SC 1.4.13 requires Escape dismissal for interactive popups.
**Fix**: Added `keydown` event listener for Escape when `isProfileOpen` is true. Added `isProfileOpen` to deps to avoid global Escape interception.

#### #22 — Total Price Toggle Flickers on Hydration
**File**: `src/components/search/SearchResultsClient.tsx:61-65`
**Problem**: `showTotalPrice` defaults to `false`, then reads `sessionStorage` in `useEffect`. Returning users saw a one-frame flicker from monthly to total prices.
**Fix**: Added `effectiveShowTotalPrice = isHydrated && showTotalPrice`. Both flags set in the same batched `useEffect` — no intermediate flicker. All JSX uses `effectiveShowTotalPrice` instead of `showTotalPrice`.

#### #27 — "Clear All" Shows With 1 Filter
**File**: `src/components/filters/AppliedFilterChips.tsx:83`
**Problem**: `chips.length >= 1` showed "Clear all" even with a single filter — redundant since the user can click the chip's X.
**Fix**: Changed to `chips.length > 1`.

#### #43 — MapErrorBoundary Retry Doesn't Remount
**File**: `src/components/map/MapErrorBoundary.tsx`
**Problem**: Clicking "Retry" only cleared `hasError`, causing React to resume children from corrupted state. WebGL crashes would immediately re-throw.
**Fix**: Added `retryKey` counter to state. Children wrapped in `React.Fragment` keyed by `retryKey` — forces full unmount + remount on retry.

---

### Correctness & Robustness (14 fixes)

#### #36 — Count Query Error Kills Keyset Response
**File**: `src/lib/search/search-doc-queries.ts:1236`
**Problem**: In `getSearchDocListingsWithKeyset`, the data query succeeded but `getSearchDocLimitedCount` was called separately. If count threw, the entire function threw, discarding valid listings.
**Fix**: Wrapped count query in try/catch with `null` fallback. UI shows "100+" instead of error.

#### #35 — Semantic Search Rows Missing Rating Fields
**File**: `src/lib/search/search-doc-queries.ts:1628-1630`
**Problem**: `mapSemanticRowsToListingData` didn't map `avgRating`, `reviewCount`, or `viewCount`. ListingCard reads these for star rating display — semantic search results showed no ratings.
**Fix**: Added 3 fields matching the `mapRawListingsToPublic` pattern.

#### #42 — (0,0) Coordinates Produce Ghost Markers
**File**: `src/lib/search/search-doc-queries.ts:697,1610`
**Problem**: `Number(l.lat) || 0` mapped null/NaN coordinates to (0,0) — Gulf of Guinea.
**Fix**: Added `.filter(hasValidCoordinates)` before `.map()` in both `mapRawListingsToPublic` and `mapSemanticRowsToListingData`. Removed `|| 0` / `?? 0` fallbacks.

#### #39 — isPointInBounds No Antimeridian Handling
**File**: `src/contexts/MapBoundsContext.tsx:240-247`
**Problem**: Simple `minLng <= lng <= maxLng` comparison always returns false when viewport crosses the antimeridian (`minLng > maxLng`).
**Fix**: Added `if (bounds.minLng > bounds.maxLng) return lng >= bounds.minLng || lng <= bounds.maxLng`.

#### #33 — Legacy Cursor Unbounded OFFSET
**File**: `src/lib/search/search-v2-service.ts:149`
**Problem**: `decodeLegacyCursor` validated `p > 0` but no maximum. A crafted cursor `{p: 99999}` would cause a large OFFSET scan.
**Fix**: `page = Math.min(decoded.page, 100)`.

#### #32 — Orphaned programmaticClearTimeout in handleMoveEnd
**File**: `src/components/Map.tsx:1876`
**Problem**: `handleMoveEnd` called `setProgrammaticMove(false)` without clearing the safety timeout. The orphaned timeout would fire unnecessarily.
**Fix**: Added `clearTimeout(programmaticClearTimeoutRef.current)` + null assignment before `setProgrammaticMove(false)`.

#### #37 — onMoveThrottleRef Not Cleaned Up on Unmount
**File**: `src/components/Map.tsx:1538`
**Problem**: The cleanup effect cleared 9 timeout refs but missed `onMoveThrottleRef`.
**Fix**: Added `clearTimeout(onMoveThrottleRef.current)` to the cleanup block.

#### #25 — quantizeBounds Float Precision
**File**: `src/components/PersistentMapWrapper.tsx:84-85`
**Problem**: `Math.round(n / 0.001) * 0.001` has IEEE 754 precision issues.
**Fix**: `Math.round(n * 1000) / 1000` — integer math avoids float multiplication errors.

#### #23 — minMoveInDate Fragile Timezone Math
**File**: `src/components/SearchForm.tsx:845`
**Problem**: Verbose timezone offset calculation could produce wrong dates near DST transitions.
**Fix**: `new Date().toLocaleDateString("en-CA")` — produces `YYYY-MM-DD` in local timezone.

#### #14 — Area Count Cache Unbounded
**File**: `src/contexts/MapBoundsContext.tsx:519-532`
**Problem**: `areaCountCacheRef` (Map) had TTL validation on read but stale entries were never evicted. Unbounded memory growth during extended browsing.
**Fix**: Added `AREA_COUNT_CACHE_MAX_ENTRIES = 50` with soonest-to-expire eviction. Matches the `PersistentMapWrapper` spatial cache pattern.

#### #18 — useMapMovedBanner Uses Monolithic Context
**File**: `src/contexts/MapBoundsContext.tsx:665-676`
**Problem**: `useMapMovedBanner` called `useMapBounds()` (monolithic context), causing re-renders on every action dispatch (e.g., `setActivePanBounds` during map drag).
**Fix**: Split into `useMapBoundsState()` (7 state fields) + `useMapBoundsActions()` (2 callbacks). Actions context is stable — banner only re-renders on actual state changes.

#### #20 — CategoryBar Missing Pagination Resets
**File**: `src/components/search/CategoryBar.tsx:209-210`
**Problem**: Only deleted `cursor` and `page`. Every other navigation handler also deletes `cursorStack` and `pageNumber`.
**Fix**: Added `params.delete("cursorStack"); params.delete("pageNumber")`.

#### #38 — ListScrollBridge Infinite Retry Loop
**File**: `src/components/listings/ListScrollBridge.tsx:37-42`
**Problem**: When scroll request targeted a listing not in DOM (filtered out), the effect ran on every re-render indefinitely.
**Fix**: Added `retryCountRef` with `MAX_SCROLL_RETRIES = 10`. Auto-acknowledges after 10 failed attempts.

### Cleanup (2 fixes)

#### #24 — Unused sortOption Prop
**Files**: `src/app/search/page.tsx:343`, `src/components/search/SearchResultsClient.tsx:38`
**Fix**: Removed from both interface and caller. Verified via grep — never destructured or used.

#### #13 — Duplicate Body Scroll Lock
**File**: `src/components/SearchForm.tsx:841-849`
**Problem**: SearchForm manually set `document.body.style.overflow = "hidden"`. FilterModal already uses `useBodyScrollLock(isOpen)`.
**Fix**: Removed the 6-line manual lock. Added comment documenting FilterModal handles it.

---

## 3. Issues Retracted (11)

Each retraction includes the verification that proved it was a false positive.

| # | Issue | Why Retracted |
|---|-------|---------------|
| **#2** | MapBoundsContext `setProgrammaticMove` timeout fires after unmount | React 18+ silently ignores `setState` on unmounted components. No warning, no error. |
| **#3** | SearchV2DataContext version race | `dataVersionRef.current` is read at call time (not closure time) because `setV2MapData` has `[]` deps but reads the ref. The pattern is correct. |
| **#5** | handleRetry bypasses bounds clamping | Both the search effect and `handleRetry` call `isValidViewport(searchParams)` with the same params. Neither clamps — both reject oversized viewports entirely. |
| **#6** | handleSearch `isSearching` in deps | Removing `isSearching` from deps broke the form submission test. Root cause: `handleSearch` needs the latest closure when `requestSubmit()` fires after `flushSync`. The `navigationVersionRef` guard already prevents race conditions. |
| **#10** | `generateMetadata` canonical URL without metadataBase | `metadataBase` IS set in `src/app/layout.tsx:26`. |
| **#16-orig** | MobileSearchContext `window.scrollTo` without SSR guard | The file has `"use client"`. `useCallback` callbacks are never called during SSR. |
| **#31** | Map.tsx stale searchParams in throttled executeMapSearch | Already fixed by existing `executeMapSearchRef` pattern (P2-FIX #79 at lines 1730-1733). |
| **#41** | useNearbySearchRateLimit dual countdown intervals | Both the effect (line 166-168) and `startCountdown` (line 212-214) clear `countdownIntervalRef.current` before setting a new interval. Guards already exist. |
| **#46** | Sourcedata listener leak after style reload | MapLibre style reload reuses the same `maplibregl.Map` instance. `mapRef.current.getMap()` returns the correct object. The cleanup at line 2380 removes from the right instance. Remount cleanup uses captured `mapInstanceAtMount`. |

---

## 4. Issues Accepted as Intentional Design (2)

#### #7 — SearchViewToggle Dual-Render Fires Effects Twice
**Verdict**: Intentional SSR hydration pattern. Children are rendered in both mobile and desktop containers before mount so SSR HTML matches client regardless of viewport. After mount, one container is removed. Effects in children (sessionStorage read, `setIsHydrated`) are idempotent — double-mount is transient and harmless.

#### #45 — hideMap() on Mobile Has No Effect
**Verdict**: Intentional. Mobile bottom sheet requires the map always rendered as background. `shouldShowMap = true` on mobile prevents the sheet from losing its backdrop. The stored preference persists for next session reload, which is correct behavior for the cost optimization strategy.

---

## 5. Key Decisions Made

### Decision 1: Comma-separated vs. repeated URL params (#8)
**Choice**: Standardized on comma-separated (`amenities=Wifi,Parking`).
**Rationale**: `useBatchedFilters.commit()` already used this format. The parser handles both. One canonical format prevents cache key mismatches.

### Decision 2: "Clear all" preserves location (#15)
**Choice**: Preserve `q`, `lat`, `lng`, bounds, and `sort` when clearing filters.
**Rationale**: User confirmed. Matches the `AppliedFilterChips` "Clear all" behavior. Standard UX pattern (Airbnb, Zillow).

### Decision 3: Include price in facets cache key (#19)
**Choice**: Include `minPrice`/`maxPrice` in the facets cache key.
**Rationale**: The 300ms debounce and AbortController already prevent excessive fetches during slider drag. Excluding price caused stale non-price facet counts — a correctness bug.

### Decision 4: Amenities LIKE → GIN @> containment (#40)
**Choice**: Switch from LIKE partial matching to @> exact containment.
**Rationale**: The comment "DB may have 'Pool Access'" was verified as false. `VALID_AMENITIES` has 9 exact values enforced by Zod schema validation. GIN index existed but was unused.

### Decision 5: Near-match through cached wrapper (#34)
**Choice**: Route near-match expansion through `getSearchDocListingsPaginated` (cached) instead of the uncached internal function.
**Rationale**: `nearMatches: false` guard prevents infinite recursion. Same query, different cache path. Eliminates doubled DB load.

### Decision 6: Split abort controllers vs. version counter (#4)
**Choice**: Split into `searchAbortRef` + `panAbortRef` (separate controllers).
**Rationale**: Simpler than a version counter. Each effect manages its own abort lifecycle. `fetchTimeoutRef` remains shared (latest fetch wins — intentional).

### Decision 7: ListScrollBridge retry cap (#38)
**Choice**: 10-render retry limit with auto-acknowledge.
**Rationale**: Retry counter (not setTimeout) aligns with React's render cycle. 10 renders ≈ 1-2 seconds. If the card hasn't appeared by then, it was filtered out. Auto-ack is silent — user won't notice.

### Decision 8: MapErrorBoundary key-based remount (#43)
**Choice**: `React.Fragment key={retryKey}` wrapper with incrementing counter.
**Rationale**: Changing `key` forces React to fully unmount and remount children, creating a fresh WebGL context. Simpler than passing a remount callback through the boundary.

---

## 6. Files Modified

| File | Changes | Issues |
|------|---------|--------|
| `src/lib/search/search-doc-queries.ts` | Cursor fix, coord filter, near-match cache, amenities GIN, count try/catch, semantic rows, export buildKeysetWhereClause | #29, #35, #36, #40, #42, #34 |
| `src/components/PersistentMapWrapper.tsx` | Split abort controllers, retry signal, quantize bounds, remove BOUNDS_EPSILON import | #1, #4, #25 |
| `src/components/SearchForm.tsx` | Array param format, clear-all preserves location, remove body scroll lock, minMoveInDate fix, import clearAllFilters | #8, #13, #15, #23 |
| `src/components/search/SearchResultsClient.tsx` | Favorites delta fetch, total price flicker, remove sortOption | #16, #22, #24 |
| `src/contexts/MapBoundsContext.tsx` | LRU cache, antimeridian, split hooks | #14, #18, #39 |
| `src/components/Map.tsx` | Timeout cleanup, prototype patch deps, programmatic clear | #32, #37, #44 |
| `src/components/SearchViewToggle.tsx` | mobileSnap reset on navigation | #9 |
| `src/components/SearchHeaderWrapper.tsx` | Escape key, ResizeObserver deps | #11, #17 |
| `src/components/SortSelect.tsx` | Body scroll lock | #12 |
| `src/components/filters/AppliedFilterChips.tsx` | Clear all threshold | #27 |
| `src/components/listings/ListScrollBridge.tsx` | Retry cap | #38 |
| `src/components/map/MapErrorBoundary.tsx` | Key-based remount | #43 |
| `src/components/search/CategoryBar.tsx` | Pagination reset | #20 |
| `src/app/search/page.tsx` | Remove sortOption prop | #24 |
| `src/app/api/search/facets/route.ts` | Amenities GIN | #40 |
| `src/lib/search/search-orchestrator.ts` | Unbounded search guard | #30 |
| `src/lib/search/search-v2-service.ts` | Legacy cursor clamp | #33 |
| `src/lib/search-utils.ts` | Array param format | #8 |
| `src/hooks/useFacets.ts` | Price in cache key | #19 |
| `src/__tests__/components/PersistentMapWrapper.networking.test.tsx` | 2 new tests | #1, #4 |
| `src/__tests__/lib/search/keyset-pagination.test.ts` | 8 new tests | #29 |
| `src/__tests__/lib/search/search-orchestrator.test.ts` | 1 new test | #30 |
| `src/__tests__/lib/search-utils.test.ts` | 4 updated tests | #8 |
| `src/__tests__/hooks/useFacets.test.ts` | 1 updated test | #19 |

---

## 7. Test Coverage Added

| Test File | Tests Added | What They Cover |
|-----------|------------|-----------------|
| `PersistentMapWrapper.networking.test.tsx` | 2 | 429 retry with fresh signal; search/pan abort independence |
| `keyset-pagination.test.ts` | 8 | Rating cursor boundary transitions; full walk-through (page sizes 1 and 3); SQL clause verification for null and non-null count cursors |
| `search-orchestrator.test.ts` | 1 | Unbounded search blocks V1 fallback |
| `search-utils.test.ts` | 4 updated | Comma-separated array param format |
| `useFacets.test.ts` | 1 updated | Price change triggers refetch |

**Total**: 10 new tests, 5 updated tests.
