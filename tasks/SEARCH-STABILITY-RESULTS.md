# Search Stability Audit — Results

## Executive Summary

| Metric | Value |
|--------|-------|
| **Overall Verdict** | **STABLE** |
| **Spec Categories Audited** | 8/8 |
| **Total Items Checked** | ~50 |
| **Fixes Shipped** | 13 (2 P0, 8 P1, 3 P2) across 2 phases |
| **Residual Findings** | 5 (0 P0, 0 P1, 2 P2, 3 P3) — all accepted |

---

## Fix History

| Phase | Date | Commit | Scope | Fixes |
|-------|------|--------|-------|-------|
| **Phase 1** (Categories 1, 7) | 2026-03-03 | `ee81fa7` | 6 files, 7 bugs | 2 P0, 4 P1, 1 P2 |
| **Phase 2** (Categories 2, 4, 6, 8) | 2026-03-03 | `03254ff` | 6 files, 6 bugs | 4 P1, 2 P2 |
| **Re-audit** (All 8 categories) | 2026-03-03 | — | Full codebase | 0 new fixes needed |
| **Total** | | | 12 files, 13 bugs | 2 P0, 8 P1, 3 P2 |

---

## Re-Audit Verdicts (All 8 Categories)

### Category 1: Infinite Loops / Re-render Storms — PASS

| # | Item | File(s) | Verdict | Detail |
|---|------|---------|---------|--------|
| 1a | `effectiveListings` memo deps | `PersistentMapWrapper.tsx` | PASS | `mapSource` in deps (Phase 1 fix #1 verified) |
| 1b | `MAX_MAP_MARKERS` cap | `PersistentMapWrapper.tsx` | PASS | `.slice(0, MAX_MAP_MARKERS)` on both V2 and default paths (Phase 1 fix #2 verified) |
| 1c | Focus-steal on map pan | `SearchResultsLoadingWrapper.tsx` | PASS | `filterParamsKey` strips 7 geographic params (Phase 1 fix #3 verified) |
| 1d | `committed` useMemo stability | `useBatchedFilters.ts` | PASS | Keyed on `searchParams.toString()` (Phase 1 fix #4 verified) |
| 1e | `urlToFilterChips` memoization | `AppliedFilterChips.tsx` | PASS | Wrapped in `useMemo` (Phase 1 fix #5 verified) |
| 1f | `CategoryBar` render cost | `CategoryBar.tsx` | PASS | `activeCategoryIds` computed once via `useMemo` (Phase 1 fix #6 verified) |

### Category 2: Race Conditions — PASS

| # | Item | File(s) | Verdict | Detail |
|---|------|---------|---------|--------|
| 2a | Facets fetch abort on re-render | `useFacets.ts` | PASS | `AbortController` created per effect, aborted in cleanup |
| 2b | Filter count fetch abort | `useDebouncedFilterCount.ts` | PASS | Same `AbortController` pattern; `isCancelled` flag double-guard |
| 2c | Map fetch abort on re-render | `PersistentMapWrapper.tsx` | PASS | `AbortController` in effect, cleanup aborts |
| 2d | Debounce on filter changes | `useDebouncedFilterCount.ts` | PASS | 300ms debounce with proper cleanup |
| 2e | Dedup in `rateLimitedFetch` | `rate-limit-client.ts` | PASS | 429 throttle prevents duplicate requests during backoff |
| 2f | Map pan debounce | `MapBoundsContext.tsx` | PASS | 600ms debounce on bounds updates |
| 2g | Concurrent search abort | `SearchResultsClient.tsx` | PASS | `seenIdsRef` deduplication + `AbortController` on load-more |

### Category 3: Resource Leaks — PASS (2 residual P2/P3)

| # | Item | File(s) | Verdict | Detail |
|---|------|---------|---------|--------|
| 3a | Effect cleanup in `useFacets` | `useFacets.ts` | PASS | Cleanup aborts controller |
| 3b | Effect cleanup in `useDebouncedFilterCount` | `useDebouncedFilterCount.ts` | PASS | Cleanup clears timeout + aborts controller |
| 3c | Map effect cleanup | `PersistentMapWrapper.tsx` | PASS | Cleanup aborts fetch controller |
| 3d | `useMediaQuery` listener cleanup | `useMediaQuery.ts` | PASS | `removeEventListener` in cleanup |
| 3e | Bottom sheet event listeners | `MobileBottomSheet.tsx` | PASS | All touch/mouse listeners removed in cleanup |
| 3f | WebGL context recovery | `Map.tsx` | PASS | `webglcontextlost` + `webglcontextrestored` handlers at lines 2069-2103 |
| 3g | Resize observer cleanup | Various | PASS | All `ResizeObserver` instances disconnected in cleanup |
| 3h | `onMoveThrottleRef` cleanup | `Map.tsx:557` | **RESIDUAL P2** | `setTimeout` ref not cleared in unmount cleanup (see R1 below) |
| 3i | TTL cache intervals | `createTTLCache.ts:37` | **RESIDUAL P2** | 3 module-level `setInterval` never cleared (see R2 below) |
| 3j | `areaCountCacheRef` bounds | `MapBoundsContext.tsx` | **NOTE** | Unbounded `Map`, but entries are cheap (string → number). Acceptable. |

### Category 4: Timeout & Error Handling — PASS (1 residual P3)

| # | Item | File(s) | Verdict | Detail |
|---|------|---------|---------|--------|
| 4a | `rateLimitedFetch` timeout | `rate-limit-client.ts` | PASS | 15s timeout with `didTimeout` flag (Phase 2 fix #8+9 verified) |
| 4b | Map fetch timeout | `PersistentMapWrapper.tsx` | PASS | 15s timeout with same pattern (Phase 2 fix #12 verified) |
| 4c | SSR `withTimeout` protection | `search/page.tsx` | PASS | V2 and V1 paths wrapped with `withTimeout(DEFAULT_TIMEOUTS.DATABASE)` |
| 4d | Circuit breaker (geocoding) | `nominatim.ts` | PASS | `geocode()` uses circuit breaker at line 50 |
| 4e | Error boundary (search) | `search/error.tsx` | PASS | Error boundary with retry + Sentry (Phase 2 fix #10 verified) |
| 4f | Error boundary (map) | `MapErrorBoundary.tsx` | PASS | `componentDidCatch` + `getDerivedStateFromError` |
| 4g | Nominatim non-geocode functions | `nominatim.ts:104-173` | **RESIDUAL P3** | `reverseGeocode`/`searchBoundary` bypass circuit breaker (see R3 below) |

### Category 5: Edge Cases — PASS (1 residual P3)

| # | Item | File(s) | Verdict | Detail |
|---|------|---------|---------|--------|
| 5a | Empty search results | `SearchResultsClient.tsx` | PASS | `hasConfirmedZeroResults` with filter suggestions |
| 5b | XSS via search params | `search/page.tsx` | PASS | All params parsed via `parseSearchParams`; no raw injection into HTML |
| 5c | Bounds-required fallback | `search/page.tsx:152` | PASS | Early return with friendly UI when bounds missing |
| 5d | `seenIdsRef` deduplication | `SearchResultsClient.tsx` | PASS | Set-based dedup prevents duplicates across load-more |
| 5e | 60-item client cap | `SearchResultsClient.tsx` | PASS | `MAX_ACCUMULATED` enforced |
| 5f | Cursor reset on param change | `SearchResultsClient.tsx` | PASS | Component keyed by `searchParamsString` — remounts on change |
| 5g | Online/offline recovery | `useFacets.ts`, `useDebouncedFilterCount.ts` | **RESIDUAL P3** | `navigator.onLine` check exists but no `'online'` event listener for auto-recovery (see R4 below) |
| 5h | POI hydration mismatch | `POILayer.tsx` | PASS | `sessionStorage` deferred to `useEffect` (Phase 1 fix #7 verified) |

### Category 6: State Synchronization — PASS

| # | Item | File(s) | Verdict | Detail |
|---|------|---------|---------|--------|
| 6a | URL ↔ filter state sync | `useBatchedFilters.ts` | PASS | `committed` derived from `searchParams.toString()` |
| 6b | Browser back/forward | `AppliedFilterChips.tsx` | PASS | Chips recalculated from URL on navigation |
| 6c | Map bounds ↔ URL sync | `MapBoundsContext.tsx` | PASS | Bounds updates debounced and synced to URL |
| 6d | Body scroll lock cleanup | `MobileBottomSheet.tsx` | PASS | `useMediaQuery` guard prevents lock on desktop (Phase 2 fix #13 verified) |
| 6e | V2 ↔ V1 context reset | `V1PathResetSetter.tsx` | PASS | Resets stale V2 context on V1 fallback path |
| 6f | localStorage race (recent searches) | `useRecentSearches.ts` | **ACCEPTED P3** | Cross-tab race possible but low blast radius (one entry lost). Dropped in Phase 2 audit. |

### Category 7: Render / Hydration Issues — PASS

| # | Item | File(s) | Verdict | Detail |
|---|------|---------|---------|--------|
| 7a | POI `sessionStorage` SSR | `POILayer.tsx` | PASS | Deferred to `useEffect` (Phase 1 fix #7) |
| 7b | `useMediaQuery` SSR safety | `MobileBottomSheet.tsx` | PASS | Returns `undefined` during SSR; `isDesktop === false` strict equality safe |
| 7c | Map container SSR | `PersistentMapWrapper.tsx` | PASS | Lazy-loaded with `dynamic(() => import(...), { ssr: false })` |
| 7d | Search results SSR | `search/page.tsx` | PASS | Full SSR with streaming via `SearchResultsLoadingWrapper` |

### Category 8: Observability — PASS (1 residual P3)

| # | Item | File(s) | Verdict | Detail |
|---|------|---------|---------|--------|
| 8a | Search error Sentry | `search/error.tsx` | PASS | `Sentry.captureException` in `useEffect` (Phase 2 fix #10 verified) |
| 8b | V2 fallback Sentry | `search/page.tsx` | PASS | `Sentry.captureMessage` with `level: 'warning'` in both error paths (Phase 2 fix #11 verified) |
| 8c | Map error boundary Sentry | `MapErrorBoundary.tsx:25` | **RESIDUAL P3** | `componentDidCatch` logs to console only, no Sentry capture (see R5 below) |

---

## Residual Findings (Accepted)

| # | File:Line | Sev | Category | Issue | Why Accepted |
|---|-----------|-----|----------|-------|-------------|
| R1 | `Map.tsx:557` | P2 | 3 (Leak) | `onMoveThrottleRef` setTimeout not cleared on unmount — could fire after unmount | Fires once (100ms), no state update (ref only), no user-visible effect. Map unmounts rarely. |
| R2 | `createTTLCache.ts:37` | P2 | 3 (Leak) | 3 module-level `setInterval(sweep, 60_000)` never cleared. No `destroy()` method. | Module-level singletons live for app lifetime. Sweep is lightweight (Map.delete on expired entries). Adding destroy() for HMR is nice-to-have, not a production issue. |
| R3 | `nominatim.ts:104-173` | P3 | 4 (Timeout) | `reverseGeocode` and `searchBoundary` bypass circuit breaker (only `geocode` at line 50 uses it) | These functions are called infrequently (map click, initial load). They still have `fetchWithTimeout` protection. Circuit breaker is primarily for the high-frequency `geocode` path. |
| R4 | `useFacets.ts:132`, `useDebouncedFilterCount.ts:197` | P3 | 5 (Edge) | `navigator.onLine` check prevents fetch when offline, but no `'online'` event listener for auto-recovery when network returns | User can manually retry (change filter, close/reopen drawer). Auto-recovery would add complexity for a rare scenario. |
| R5 | `MapErrorBoundary.tsx:25` | P3 | 8 (Obs) | `componentDidCatch` logs to console only — no `Sentry.captureException` | Map errors are already recoverable (WebGL context restore, retry button). Lower priority than search error page (which is now instrumented). |

**Net assessment**: All P0 and P1 items are resolved. Remaining items are P2/P3 with low blast radius and acceptable risk. No further phases planned unless priorities change.

---

## Phase 1 — Categories 1 (Infinite Loops) & 7 (Render/Hydration)

### P0 — Critical

| # | File | Bug | Fix |
|---|------|-----|-----|
| 1 | `PersistentMapWrapper.tsx` | `mapSource` missing from `effectiveListings` memo deps — stale closure when V1 fetch completes | Added `mapSource` to deps array |
| 2 | `PersistentMapWrapper.tsx` | V2 and default return paths had no `MAX_MAP_MARKERS` cap — unbounded marker array could freeze browser | Applied `.slice(0, MAX_MAP_MARKERS)` to both paths |
| 3 | `SearchResultsLoadingWrapper.tsx` | Focus stolen from map on every pan (paramsKey included bounds) — breaks keyboard/screen-reader users | Strip 7 geographic params from `filterParamsKey`; focus only moves on filter/sort/query changes |

### P1 — Performance

| # | File | Bug | Fix |
|---|------|-----|-----|
| 4 | `useBatchedFilters.ts` | `committed` useMemo keyed on unstable `searchParams` reference — recalculated every render | Key on `searchParams.toString()` (string comparison, not reference) |
| 5 | `AppliedFilterChips.tsx` | `urlToFilterChips()` called inline with no memoization — runs on every render including map pans | Wrapped in `useMemo` keyed on `searchParamsString` |
| 6 | `CategoryBar.tsx` | 8x `new URLSearchParams` + `isCategoryActive` per render in `.map()` loop | Compute `activeCategoryIds` Set once via `useMemo`, use `.has()` in render |

### P2 — Defensive

| # | File | Bug | Fix |
|---|------|-----|-----|
| 7 | `POILayer.tsx` | `sessionStorage` read in `useState` initializer causes SSR/hydration mismatch | Defer to `useEffect` on mount; start with empty Set |

### Phase 1 Verification

- **Typecheck:** PASS
- **Lint:** 0 errors, 209 warnings (all pre-existing)
- **Unit tests:** 5535 passed, 3 failed (pre-existing in `SearchForm.test.tsx`, unrelated)
- **react-hooks/exhaustive-deps:** No violations in any changed file

---

## Phase 2 — Categories 2 (Race Conditions), 4 (Timeout & Error Handling), 6 (State Sync), 8 (Observability)

### P1 — Timeout & Observability

| # | File | Category | Bug | Fix |
|---|------|----------|-----|-----|
| 8 | `rate-limit-client.ts` | 4 (Timeout) | `rateLimitedFetch()` has no timeout — browser TCP timeout is ~5 min. Facets drawer and filter count spinners stuck indefinitely on network hang | Added 15s default timeout using `didTimeout` flag + internal `AbortController`. Throws `FetchTimeoutError` (not `AbortError`) so hooks' catch blocks correctly reset `isLoading`. Fixes both `useFacets.ts:153` and `useDebouncedFilterCount.ts:222` |
| 9 | `rate-limit-client.ts` | 4 (Timeout) | Same as #8 — `useDebouncedFilterCount` "Show N listings" button spinner stuck up to 5 min | Same fix (single file change fixes both hooks) |
| 10 | `search/error.tsx` | 8 (Observability) | Only error page in the app without `Sentry.captureException` — SSR search errors invisible in production | Added `Sentry.captureException(error, { tags: { errorBoundary: 'search' } })` in `useEffect` |
| 11 | `search/page.tsx` | 8 (Observability) | V2→V1 fallback errors logged via `console.warn` only — SSR-level errors not captured by API route Sentry; V2 regression rate invisible | Added `Sentry.captureMessage()` with `level: 'warning'` and `sanitizeErrorMessage()` in both the `v2Result.error` path and the catch block |

### P2 — Timeout & State Sync

| # | File | Category | Bug | Fix |
|---|------|----------|-----|-----|
| 12 | `PersistentMapWrapper.tsx` | 4 (Timeout) | Map `fetch()` has no timeout — loading overlay stuck on network hang (map remains functional with cached markers, lower blast radius) | Added 15s timeout with same `didTimeout` flag pattern. Timeout sets user-friendly error message; non-abort errors logged to console |
| 13 | `MobileBottomSheet.tsx` | 6 (State Sync) | `useBodyScrollLock` fires when mobile sheet container is CSS-hidden (`md:hidden`) — `document.body.style.position = "fixed"` persists on tablet rotation to desktop | Added `useMediaQuery("(min-width: 768px)")` guard: `useBodyScrollLock((snapIndex === 2 \|\| isDragging) && isDesktop === false)`. SSR-safe: `undefined === false` is `false` → no lock during hydration |

### Phase 2 Technical Details

#### `didTimeout` flag pattern (critical design decision)

Both `useFacets.ts:213` and `useDebouncedFilterCount.ts:251` have:
```typescript
if (err.name === "AbortError") return; // swallows AbortError WITHOUT resetting isLoading
```

Using `AbortSignal.timeout()` would throw `AbortError` on timeout — the catch block would swallow it silently, leaving `isLoading: true` forever. **This would create the exact bug we're fixing.**

The `didTimeout` flag pattern:
1. Internal `AbortController` wraps both caller signal and timeout
2. `setTimeout` sets `didTimeout = true` before aborting
3. Catch block checks: `if (didTimeout && err.name === "AbortError")` → throws `FetchTimeoutError` instead
4. `FetchTimeoutError.name === "FetchTimeoutError"` — doesn't match the `AbortError` guard, so hooks correctly call `setIsLoading(false)`

#### Signal composition

Caller's `AbortSignal` linked to internal timeout `AbortController` via:
```typescript
callerSignal.addEventListener("abort", () => {
  clearTimeout(timeoutId);
  timeoutController.abort();
}, { once: true });
```
Preserves both caller-abort (user changes filters → `AbortError` → swallowed correctly) and timeout-abort (network hang → `FetchTimeoutError` → handled correctly).

#### Sentry PII safety

All Sentry payloads use `sanitizeErrorMessage()` (project non-negotiable: no raw PII in logs). V2 fallback uses `level: 'warning'` to prevent alert fatigue during V2 rollout.

### Phase 2 Verification

- **Typecheck:** `pnpm typecheck` — PASS
- **Lint:** `pnpm lint` — PASS
- **Unit tests:** `pnpm test` — 239 suites, 5548 tests, 0 failures, 0 regressions
- **New tests:** 9 tests added to `rate-limit-client.test.ts` (see below)

### Phase 2 New Test Coverage

9 unit tests added to `src/__tests__/lib/rate-limit-client.test.ts`:

| # | Test | Verifies |
|---|------|----------|
| 1 | `returns response when fetch resolves before timeout` | Normal response with timeout enabled |
| 2 | `throws FetchTimeoutError when fetch exceeds timeout` | Timeout fires → `FetchTimeoutError` (not `AbortError`) |
| 3 | `throws AbortError (not FetchTimeoutError) when caller aborts` | Caller signal abort → `AbortError` preserved |
| 4 | `throws RateLimitError on 429 even with timeout enabled` | 429 handling unaffected by timeout |
| 5 | `throws RateLimitError when already throttled (timeout irrelevant)` | Pre-throttled → immediate reject, no fetch |
| 6 | `cleans up timeout timer on successful response` | `clearTimeout` called in `finally` block |
| 7 | `cleans up timeout timer on caller abort` | `clearTimeout` called on abort path |
| 8 | `uses default 15s timeout when timeout is not specified` | Default timeout value applied |
| 9 | `does not set timeout when timeout is 0` | `timeout: 0` disables timeout entirely |

---

## Phase 1 Test Coverage

4 Playwright test files in `tests/search-stability/`:

| File | Tests | Covers |
|------|-------|--------|
| `focus-management.anon.spec.ts` | 4 | Focus stays on map during pan; moves to heading on filter/sort/query change |
| `map-marker-cap.anon.spec.ts` | 3 | Marker count ≤ 200; no DOM limit errors; GeoJSON feature count within cap |
| `filter-state-sync.anon.spec.ts` | 4 | Chips from URL; browser back restores state; bounds change preserves filters; no chip flash |
| `poi-hydration.anon.spec.ts` | 4 | POI buttons render; toggle works; no hydration warnings; correct aria-labels |

Run: `pnpm playwright test tests/search-stability/ --project=chromium-anon`

---

## Combined Risk Assessment

| Fix | Phase | Confidence | Blast radius |
|-----|-------|-----------|--------------|
| #1 mapSource deps | 1 | 99% | Map markers only |
| #2 marker cap | 1 | 98% | Map markers only |
| #3 focus-steal | 1 | 92% | Focus management only |
| #4 committed memo | 1 | 97% | Filter state derivation |
| #5 chips memo | 1 | 99% | Filter chip display |
| #6 category memo | 1 | 99% | Category bar display |
| #7 POI hydration | 1 | 99% | POI toggle buttons |
| #8+9 fetch timeout | 2 | 95% | All client-side fetches via `rateLimitedFetch` (facets, filter count) |
| #10 search error Sentry | 2 | 99% | Search error page only (additive) |
| #11 V2 fallback Sentry | 2 | 97% | SSR search path only (additive) |
| #12 map fetch timeout | 2 | 93% | Map loading overlay (map remains functional with cached markers) |
| #13 scroll lock guard | 2 | 95% | Body scroll on tablet rotation with sheet expanded |

---

## Rollback

All fixes are single-file and independently revertible:
```bash
# Phase 1
git checkout ee81fa7~1 -- <file>

# Phase 2
git checkout 03254ff~1 -- <file>
```

No inter-file dependencies between fixes within either phase.
