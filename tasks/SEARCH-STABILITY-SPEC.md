# SEARCH-STABILITY-SPEC.md

## Objective

Systematically audit the Roomshare search page for **runtime stability risks** — conditions that could cause degraded UX, data inconsistency, resource exhaustion, or unrecoverable error states in production. This audit covers the full stack: React component lifecycle, hook dependency chains, API routes, database queries, and external service integrations.

**Why now:** The search page is the primary user-facing surface (~80+ files, 7 context providers, 5 API routes, 3 external services). It has accumulated significant complexity through V1-to-V2 migration, spatial caching, proactive pan fetching, and batched filter state. A structured audit catches latent issues before they become production incidents.

**What "stable" means:** The search page can handle any realistic user interaction sequence — rapid filter toggling, aggressive map panning, slow networks, API failures, back/forward navigation, mobile bottom sheet gestures — without infinite loops, leaked resources, inconsistent state, or unrecoverable errors.

---

## Priority Tiers

Not all risks are equal. This audit is organized by blast radius and likelihood.

| Tier | Blast Radius | Likelihood | Audit Depth | Examples |
|------|-------------|------------|-------------|----------|
| **P0 — Ship-blockers** | Entire search page broken or data-corrupt | Medium-High | Full trace + test | `useSearchParams()` cascade (7a), hydration mismatches (7b), `effectiveListings` merge bug |
| **P1 — User-visible degradation** | Feature broken or confusing UX | Medium | Code trace + boundary test | Filter state drift (6a), race conditions (2a-2f), error recovery gaps (4h) |
| **P2 — Defense-in-depth** | Latent risk, would compound under load | Low-Medium | Code trace | Timer/AbortController leaks (3e-3f), resource bounds (3g-3i) |
| **P3 — Papercuts** | Minor or already-mitigated | Low | Quick verify | `seenIdsRef` bounds (3c), Redis connection type (3d), spatial cache size (3i) |

Items marked **[P3-SKIP]** are provably safe from code reading and should be verified in <5 minutes, then moved on. Don't spend audit time on things that can't break.

---

## Data Consistency Invariants (define BEFORE auditing)

Every audit needs a clear contract. If you don't define "correct," you can't find "wrong."

| Invariant | Description | Source of Truth |
|-----------|-------------|-----------------|
| **INV-1: URL = committed state** | URL search params are the single source of truth for committed filter/sort/bounds state. All components derive from URL. | `useSearchParams()` → `readFiltersFromURL()` |
| **INV-2: Map ⊇ List** | Map markers are a SUPERSET of list results (map pads bounds by 20% via `FETCH_BOUNDS_PADDING=0.2`). This is by design. Users may see pins without list entries. | `PersistentMapWrapper` padding vs `page.tsx` exact bounds |
| **INV-3: Pending ≠ URL until commit** | Filter drawer `pending` state is independent of URL until user clicks "Apply". Facets/count previews use `pending`; list/map use `committed`. | `useBatchedFilters` pending vs committed |
| **INV-4: Pagination is ephemeral** | "Load more" state (cursor, extraListings, seenIdsRef) is client-only. URL never contains cursor. Any param change resets pagination. | `SearchResultsClient` keyed by `searchParamsString` |
| **INV-5: No stale overwrites fresh** | If two async responses arrive out of order, the fresher one must win. Enforced by AbortController (cancel stale) or request ID checks (ignore stale). | All async hooks |

---

## Scope

### Page Routes & Layout
- `src/app/search/page.tsx` — SSR entry, `executeSearchV2` orchestration
- `src/app/search/layout.tsx` — 7 context providers, persistent map
- `src/app/search/actions.ts` — `fetchMoreListings` server action
- `src/app/search/loading.tsx`, `src/app/search/error.tsx`

### Context Providers (7)
- `src/contexts/SearchTransitionContext.tsx` — `navigateWithTransition()`, pending transition state
- `src/contexts/FilterStateContext.tsx`
- `src/contexts/MobileSearchContext.tsx`
- `src/contexts/MapBoundsContext.tsx` — area count, programmatic move, location conflict, split State+Actions pattern
- `src/contexts/ListingFocusContext.tsx`
- `src/contexts/SearchV2DataContext.tsx` — V2 data propagation from SSR to client
- `src/contexts/SearchMapUIContext.tsx`

### Core Hooks
- `src/hooks/useBatchedFilters.ts` — pending vs committed filter state, `forceSyncUntilRef` (10s), `previousCommittedRef`
- `src/hooks/useFacets.ts` — 300ms debounce, 30s TTL cache, AbortController, `fetchFacets` useCallback deps: `[cacheKey, pending, searchParams]`
- `src/hooks/useDebouncedFilterCount.ts` — 300ms debounce, AbortController, 30s TTL cache, baseline count tracking
- `src/hooks/useFilterImpactCount.ts`
- `src/hooks/useAbortableServerAction.ts`
- `src/hooks/useMapPreference.ts`
- `src/hooks/useRecentSearches.ts`
- `src/hooks/useScrollHeader.ts`
- `src/hooks/useBodyScrollLock.ts`
- `src/hooks/useKeyboardShortcuts.ts`
- `src/hooks/createTTLCache.ts` — LRU + TTL, `maxSize` bounding, `setInterval(sweep, 60_000)`

### Core Components
- `src/components/SearchLayoutView.tsx`
- `src/components/SearchViewToggle.tsx` — dual container rendering (desktop + mobile)
- `src/components/SearchHeaderWrapper.tsx` — ResizeObserver on `<header>`, deps `[isCollapsed, isExpanded]`
- `src/components/SearchForm.tsx`
- `src/components/LocationSearchInput.tsx` — Photon geocoding, AbortController, `requestIdRef`, `isComposingRef`, debounce 300ms
- `src/components/search/SearchResultsClient.tsx` — `seenIdsRef`, `MAX_ACCUMULATED=60`, `isLoadingRef` + `isLoadingMore` dual guard
- `src/components/PersistentMapWrapper.tsx` — spatial cache (`SPATIAL_CACHE_MAX_ENTRIES=20`), hysteresis, V2 race guard (200ms), `MAX_MAP_MARKERS=200`, `FETCH_BOUNDS_PADDING=0.2`
- `src/components/DynamicMap.tsx` — lazy Mapbox, WebGL detection
- `src/components/Map.tsx` — Mapbox GL events
- `src/components/search/MobileBottomSheet.tsx` — 3 snap points (0.15/0.5/0.85), spring animation (`stiffness:400, damping:30, mass:0.8`), framer-motion `<m.div>`

### API Routes
- `src/app/api/search/v2/route.ts`
- `src/app/api/search/facets/route.ts` — 5 parallel queries, transaction timeout
- `src/app/api/map-listings/route.ts`
- `src/app/api/search-count/route.ts`
- `src/app/api/nearby/route.ts` — Radar API, circuit breaker

### Search Service Layer
- `src/lib/search/search-v2-service.ts` — `executeSearchV2`, parallel list+map
- `src/lib/search/search-doc-queries.ts` — `$queryRawUnsafe`, `assertParameterizedWhereClause`
- `src/lib/search/cursor.ts` — keyset encode/decode
- `src/lib/search/hash.ts` — query hash with quantized bounds
- `src/lib/search/transform.ts` — GeoJSON, pin tiering
- `src/lib/search/ranking/` — score computation

### Parameter & Validation
- `src/lib/search-params.ts` — `parseSearchParams`, allowlists, aliases
- `src/lib/constants.ts` — pagination/timing/geographic constants

### External Services
- `src/lib/geocoding.ts`, `src/lib/geocoding/nominatim.ts`, `src/lib/geocoding/photon.ts` — circuit breaker
- `src/lib/geocoding-cache.ts` — Upstash Redis 24h cache, in-memory fallback
- `src/lib/rate-limit-client.ts` — client-side rate limit wrapper, `RateLimitError`
- `src/lib/fetch-with-timeout.ts` — `FetchTimeoutError`

---

## Stability Risk Categories

### 1. Infinite Loops & Re-render Cycles

#### 1a. useEffect Dependency Chains Across Context Providers

**Risk:** The 7 context providers are nested in `layout.tsx`. State changes in one provider can cascade through `useSearchParams()` subscriptions shared across multiple providers.

**Specific chains to trace:**

| Chain | Trigger | Path | Concern |
|-------|---------|------|---------|
| Filter commit loop | `useBatchedFilters.commit()` | `commit()` → `router.push`/`navigateWithTransition` → `useSearchParams` changes → `committed` recalculates via `useMemo([searchParams])` → `useEffect([committed, isDrawerOpen])` runs → `setPendingState(committed)` | The `forceSyncUntilRef` (10s window) should prevent re-sync of dirty state, but verify it doesn't cause double-navigation. Key check: `setPendingState(committed)` is idempotent when `pending === committed` via React's state equality — confirm React skips re-render. |
| MapBounds → URL → MapBounds | Map moveend | `setCurrentMapBounds()` → state update → URL push → `searchParams` changes → `useEffect([searchParams])` resets `hasUserMoved` | Verify `stripBounds` comparison in MapBoundsContext correctly distinguishes bounds-only changes from filter changes. Trace `stripBounds()` implementation — does it remove `minLat/maxLat/minLng/maxLng` before comparing? |
| V2 data race guard | V2 enabled but data late | `isV2Enabled && !hasV2Data` → 200ms timeout → `setIsV2Enabled(false)` → effect re-runs → V1 fetch starts → V2 data arrives late → `setLastV2Data()` → `effectiveListings` changes | Verify disabling V2 doesn't cause V2 data to be applied retroactively. Check: does `effectiveListings` memo guard on `isV2Enabled` before using V2 data? |
| Area count loop | Map pan | `currentMapBounds` changes → area count effect fires → fetch → `setAreaCount` → could this retrigger? | Verify `areaCountEnabled` guard prevents loop. In MapBoundsContext the guard requires `!searchAsMove && boundsDirty && hasUserMoved` — `setAreaCount` changes none of these, so no loop. Confirm by reading the effect deps. |
| Facets refetch loop | Pending filter change | `cacheKey` changes → `useEffect([cacheKey, isDrawerOpen, fetchFacets])` → `fetchFacets` is `useCallback([cacheKey, pending, searchParams])` | `cacheKey` is `useMemo([pending, searchParams])`. `pending` is an object — verify its identity is stable between renders when no filter changes. If `pending` is always a new object (via spread in `setPendingState`), `cacheKey` recalculates but may produce same string — confirm `useMemo` returns same reference for same string. |

**Audit method:**
1. Read each `useEffect` in all 7 context providers + `useBatchedFilters` + `useFacets` + `useDebouncedFilterCount`
2. For each effect, record: deps array, state changes it causes, and whether those state changes are deps of any other effect
3. Build a directed graph on paper/text: `[effect@file:line] --sets--> [state] --deps-of--> [other effect]`
4. Identify any cycle. For each potential cycle, trace whether it terminates (via guard condition, stable value check, or React state equality)

#### 1b. Filter Commit → URL Update → SSR Re-run Cycles

**Risk:** `useBatchedFilters.commit()` (line 291) does `router.push()` or `transitionContext.navigateWithTransition()`. This triggers SSR page re-render with new `searchParams`, then `committed` recalculates, then `useEffect([committed, isDrawerOpen])` (line 229) runs.

**Specific concerns:**
- Does `forceSyncUntilRef` (10s window, line 296) interact correctly with `isDrawerOpen` state? The effect at line 249 has a guard: `isPostCommitSyncActive && isDrawerOpen && hasUnsavedEdits` — verify this guard prevents overwriting user's in-progress edits during the sync window.
- Can `setPendingState(committed)` inside the effect (line 262) cause a state update that triggers another URL change? No — `setPending` only changes local state, not URL. But confirm the effect doesn't call `commit()`.
- What happens if `transitionContext.navigateWithTransition` is called while a transition is already pending? Read `SearchTransitionContext.tsx` for queueing/replacing behavior.

**Audit method:** Trace the exact sequence: user clicks "Apply" → `commit()` (line 291) → URL change → SSR → hydration → `useEffect([committed, isDrawerOpen])` (line 229) runs → `setPendingState(committed)` (line 262). Verify the effect is idempotent: calling `setPendingState(committed)` when `pending === committed` is a no-op via React's state equality check (React compares with `Object.is`, which checks reference equality — but `committed` is a new object from `useMemo`. Need to verify React does a shallow compare here or if the spread in `setPendingState` produces a new object that React considers different).

#### 1c. Infinite Scroll / fetchMoreListings Loop Safety

**Risk:** `SearchResultsClient` uses a button (not IntersectionObserver) for "Load more" (line 270). If the response returns the same cursor or if `seenIdsRef` filtering removes all new items, could repeated clicks loop?

**Specific concerns:**
- What happens if `fetchMoreListings` returns items that are ALL duplicates (all filtered by `seenIdsRef`)? `nextCursor` still advances (it comes from the server based on keyset position, not client-side items), so subsequent click would fetch next page. Not an infinite loop, but user sees no new items.
- What's the exit condition? `nextCursor === null` (line 264: `nextCursor && !reachedCap`) OR `accumulated >= MAX_ACCUMULATED` (line 92: `reachedCap = allListings.length >= MAX_ACCUMULATED`)
- Dual loading guard: `isLoadingRef.current` (ref, line 140) AND `isLoadingMore` (state, line 54). Both must be false to proceed. Verify both are properly reset in `finally` block (line 166-167).

**Audit method:** Read `handleLoadMore` (line 139-169). Verify: (1) `isLoadingRef.current` guard at line 140, (2) `finally` block resets both guards, (3) `nextCursor` is set from `result.nextCursor` which advances independently of client dedup, (4) `reachedCap` check prevents showing button when cap reached.

#### 1d. Map Move → Bounds Update → Re-fetch Cycles

**Risk:** `PersistentMapWrapper` has TWO effects that trigger fetches: one on `searchParams` changes, one on `activePanBounds` changes. Both use `lastFetchedParamsRef` dedup but with different debounce timings (250ms vs 100ms).

**Specific concerns:**
- Can the two effects race? (searchParams effect + activePanBounds effect both clear `fetchTimeoutRef` and set `abortControllerRef`)
- Does viewport hysteresis (`isViewportContained`) prevent fetches on small pans within already-fetched area?
- Can a fetch response trigger a state change that causes another fetch? `setListings()` → `effectiveListings` memo recalculates → Map re-render → could `react-map-gl` fire a moveend event on re-render? If `Map.tsx` uses `viewState` that changes, yes.

**Audit method:** Trace the fetch lifecycle in both effects. Verify shared refs (`fetchTimeoutRef`, `abortControllerRef`, `lastFetchedParamsRef`) are used consistently. Check if `setListings()` changes any state that `Map.tsx` uses for `viewState`. Read `Map.tsx` to determine if `viewState` is controlled (from parent) or uncontrolled (internal state). If controlled, `setListings()` doesn't change viewState, so no moveend loop.

#### 1e. MobileBottomSheet Spring Animation Stuck

**Risk:** `MobileBottomSheet.tsx` uses framer-motion `<m.div animate={...}>` with spring physics (line 333-338). The `animate` prop switches between `height: displayHeightPx` (during drag, instant) and `height: \`${displayHeightVh}dvh\`` (snapped, spring animation). If the animation target becomes invalid, the spring could fail to resolve.

**Specific concerns (verifiable by code reading):**
- `displayHeightPx` (line 135-137) is calculated as `currentSnap * (viewportHeight || window.innerHeight) - displayOffset`. Trace: what is `viewportHeight` initialized to? If it starts as `0` and `window.innerHeight` is also `0` (possible in SSR or test env), result is `NaN`. Read line 135-137 to verify whether there's a `NaN` guard or fallback.
- The `animate` prop switches between `height: displayHeightPx` (px string during drag) and `height: \`${displayHeightVh}dvh\`` (vh string when snapped). Read the animate prop at lines 333-338 to verify both branches produce valid CSS values.
- `handleTouchCancel` (line 230-234) sets `isDragging = false` mid-animation. Read whether this changes the `animate` target from px to vh in the same render, and whether framer-motion's `<m.div>` handles a target change mid-animation (read the `transition` prop for `type: "spring"` config).
- `handleTouchEnd` (line 203-227) calls `setSnapIndex(newIndex)` + `setDragOffset(0)` + `setIsDragging(false)` synchronously. React batches these into one render. Read: does the resulting render produce a valid `animate` target?

**Audit method:**
1. Read `MobileBottomSheet.tsx` lines 100-140 for `displayHeightPx` calculation. Check for `NaN`/`isFinite` guards. Read `viewportHeight` initialization (is it `0` or `window.innerHeight`?).
2. Trace `handleTouchEnd` (line 203-227): `isDraggingRef.current = false` → `setIsDragging(false)` → `setSnapIndex(newIndex)` → `setDragOffset(0)`. These all happen synchronously. React batches them into one render. The next render has `isDragging=false`, so `animate` target is `height: ${SNAP_POINTS[newIndex] * 100}dvh`. Read the `animate` prop at lines 333-338 to verify both branches always produce valid CSS.
3. Read where `viewportHeight` is set during drag start. Check: if the user doesn't drag (opens sheet via programmatic snap), is `viewportHeight` ever `0`? Trace the code path for non-drag snap changes.

#### 1f. ResizeObserver Re-creation in SearchHeaderWrapper

**Risk:** `SearchHeaderWrapper.tsx` line 93-119 creates a `ResizeObserver` inside a `useEffect` with deps `[isCollapsed, isExpanded]`. Each time collapse/expand state changes, the observer disconnects and a new one is created.

**Specific concerns:**
- If `isCollapsed` toggles rapidly (e.g., user scrolling near the 80px threshold), does the observer churn cause layout thrashing?
- The `requestAnimationFrame` wrapper (line 111) prevents ResizeObserver loop errors, but each new observer triggers an initial callback. Could rapid observer churn cause `--header-height` to flicker?
- Is the `observer.disconnect()` in cleanup (line 117) guaranteed to run before the new observer is created? (Yes — React runs cleanup before the next effect call)

**Audit method:** Read `useScrollHeader` to determine how frequently `isCollapsed` toggles. Check if it has hysteresis/debounce. If not, rapid scrolling near threshold could toggle `isCollapsed` every frame → observer churn. Verify `requestAnimationFrame` coalesces rapid callbacks.

---

### 2. Race Conditions

#### 2a. Filter Change During Active Search

**Risk:** User changes filters while SSR page is re-rendering or while `fetchMoreListings` is in flight.

**Specific concerns:**
- `SearchResultsClient` is keyed by `searchParamsString` — does remount properly abort/discard in-flight `fetchMoreListings`? (Remount creates new component instance, so `isLoadingRef.current` resets to `false`. But the old server action call is still in flight — does it resolve and try to set state on the unmounted component? React ignores setState on unmounted components.)
- Is the `abortControllerRef` in `useDebouncedFilterCount` properly aborted on cleanup? (Check effect return function)
- Can stale facets response arrive after a filter change and overwrite fresh data? (Check `signal.aborted` guard in `useFacets.fetchFacets`, lines 208-211)

**Audit method:** Check cleanup functions in `useFacets` (lines 250-256) and `useDebouncedFilterCount`. Verify `signal.aborted` checks before `setState`. Confirm `SearchResultsClient` key change triggers unmount → remount cycle (not just re-render).

#### 2b. Rapid Filter Toggling

**Risk:** User rapidly toggles amenity checkboxes in FilterModal. `useBatchedFilters.setPending()` is synchronous, but `useFacets` and `useDebouncedFilterCount` both debounce at 300ms.

**Specific concerns:**
- Each toggle calls `setPendingState(prev => ({...prev, amenities: newList}))` which creates a new `pending` object → new `cacheKey` string → `useEffect([cacheKey, ...])` fires → clears previous timeout → sets new 300ms timeout. This correctly coalesces: only the last timeout fires. Confirm by tracing `useFacets` effect (line 226-260).
- AbortController chain: the effect cleanup (line 254) aborts the previous controller. But if a fetch is already in flight when cleanup runs, does the abort prevent the response from being processed? Check `signal.aborted` guard in `fetchFacets` (lines 166, 181, 192, 208).

**Audit method:** Simulate: toggle amenity A at t=0, toggle amenity B at t=100ms, toggle amenity C at t=200ms. Trace through `useFacets` effect:
- t=0: cacheKey changes → effect fires → clears timeout → sets timeout for t=300
- t=100: cacheKey changes → effect cleanup runs (clears t=300 timeout, aborts controller) → sets timeout for t=400
- t=200: cacheKey changes → effect cleanup runs (clears t=400 timeout) → sets timeout for t=500
- t=500: timeout fires → `fetchFacets()` with amenities [A, B, C]
Result: one fetch with all 3 amenities. Correct.

#### 2c. Map Dragging During List Loading

**Risk:** User pans map while `executeSearchV2` is running SSR or while client-side `fetchMoreListings` is in flight.

**Specific concerns:**
- `PersistentMapWrapper` fetches `/api/map-listings` independently of the list. Can map data arrive before/after list data and show inconsistent results?
- V2 path: SSR provides both list+map in one response. Client pan fetches V1 path `/api/map-listings`. Can `mapSource` tracking (`'v1' | 'v2'`) get confused?
- Does `setMapSource('v1')` in `fetchListings` override V2 data that's about to arrive from SSR?

**Audit method:** Trace the V1/V2 source tracking in `PersistentMapWrapper`. Verify `effectiveListings` memo correctly prioritizes based on `mapSource` and `isV2Enabled`. Check: when SSR completes and provides V2 data via `SearchV2DataContext`, does `PersistentMapWrapper` detect this and switch back to V2 source?

#### 2d. Concurrent fetchMoreListings Calls

**Risk:** Multiple "Load more" clicks before previous fetch completes.

**Specific concerns:**
- Dual loading guard: `isLoadingRef.current` (ref for synchronous check, line 140) + `isLoadingMore` (state for UI, line 54). The ref prevents concurrent calls even within the same event loop tick.
- If two calls somehow get through (race between ref check and ref set), `seenIdsRef` prevents duplicate listings regardless.
- Can `nextCursor` be overwritten by an earlier response completing after a later one? Since the guard prevents concurrent calls, this can't happen. But verify the guard is truly synchronous (ref check + ref set happen before any await).

**Audit method:** Read `handleLoadMore` (line 139-169). Verify: line 140 checks `isLoadingRef.current` BEFORE the async call. Line 142 sets it to `true` synchronously. The `finally` block (line 165-168) resets both guards. No concurrent execution possible.

#### 2e. Facets API vs Search API Response Ordering

**Risk:** `/api/search/facets` and `/api/search/v2` are independent requests. Facets could return counts based on stale filters while search has already applied new ones.

**Specific concerns:**
- Facets use `pending` (uncommitted) state. Search uses `committed` (URL) state. These are intentionally different — facets show preview counts for uncommitted changes.
- After `commit()`, URL updates → search re-runs with new filters, but facets were already fetched with `pending` state. Is the displayed count accurate? Yes, because facets are only visible in the open drawer, and drawer closes on commit.
- After commit, when drawer reopens, `useBatchedFilters` resets `pending` from `committed` (line 233-238: `drawerJustOpened` guard). Facets refetch with new pending (= committed) values.

**Audit method:** Trace the commit sequence. Verify: (1) drawer closes on commit (check FilterModal/FilterDrawer close logic), (2) facets are only rendered inside the drawer, (3) drawer reopen triggers `drawerJustOpened` → `setPendingState(committed)` → new cacheKey → facets refetch.

#### 2f. Concurrent `navigateWithTransition` Calls

**Risk:** User clicks "Apply" on filters, then immediately clicks "Search this area" on map. Both call `navigateWithTransition` or `router.push`.

**Specific concerns:**
- `SearchTransitionContext` wraps navigation in `React.startTransition`. What happens if two transitions are started concurrently? React's `startTransition` does NOT queue — the second call interrupts the first.
- Can the interrupted first navigation leave state partially updated? (URL changed but SSR not complete?)
- Does `useBatchedFilters.commit()` interact correctly with `MapBoundsContext.searchCurrentArea()` when both push URLs?

**Audit method:** Read `SearchTransitionContext.tsx` implementation. Verify: (1) `startTransition` behavior with concurrent calls, (2) `isPending` flag from `useTransition` correctly reflects the latest transition, (3) no partial state from interrupted transitions.

#### 2g. LocationSearchInput Request Ordering

**Risk:** User types "San" → "San F" → "San Fr" rapidly. Three Photon API requests are created. Can responses arrive out of order?

**Specific concerns:**
- `requestIdRef` (line 70) is incremented per request. The response handler checks if current `requestIdRef` matches the request's ID. If not, response is discarded.
- `abortRef` (line 71) aborts the previous request when a new one starts. But AbortController abort is async — can the old request's response arrive before the abort signal propagates?
- `debouncedValue` (line 78) with 300ms debounce — actual fetches only happen every 300ms, reducing the window for out-of-order responses.

**Audit method:** Read `fetchSuggestions` callback. Verify: (1) `requestIdRef` is incremented BEFORE the fetch (not after), (2) response handler checks `requestIdRef.current === thisRequestId`, (3) `abortRef.current.abort()` is called before creating new controller.

---

### 3. Resource Leaks

#### 3a. Mapbox Event Listeners

**Risk:** `Map.tsx` registers Mapbox GL event listeners (moveend, click, load, etc.). If the component unmounts without cleanup, listeners accumulate.

**Specific concerns:**
- Does `react-map-gl` handle listener cleanup on unmount? (Yes — it uses `onMoveEnd`, `onClick` props which are managed by the library)
- Are any custom `map.on()` calls outside react-map-gl properly cleaned up?
- `PersistentMapWrapper` stays mounted in layout — does the inner `Map.tsx` ever unmount? (Only if `shouldRenderMap` toggles to false)
- `fixMarkerA11y.ts` — does it add DOM listeners that need cleanup?

**Audit method:** Read `Map.tsx` for any `map.on()`, `addEventListener`, or custom DOM listeners. Verify cleanup in `useEffect` return functions or `onRemove` handlers. Read `fixMarkerA11y.ts` for listener registration.

#### 3b. Supabase Connection Handling

**Risk:** Prisma client connections in serverless environment (Vercel). Each API route handler creates queries via Prisma.

**Specific concerns:**
- Are Prisma connections pooled correctly? (Check for connection pool exhaustion under load — look for `connection_limit` in Prisma schema or env)
- Do `$queryRawUnsafe` calls properly release connections on timeout?
- `$transaction` in facets route — are transactions auto-rolled-back on timeout? `SET LOCAL statement_timeout` is per-transaction when inside `$transaction`.
- Can a slow query block the Prisma connection pool? (If pool size is small and all connections are waiting on slow queries)

**Audit method:** Read `prisma/schema.prisma` for connection pool config. Read `src/lib/db.ts` or equivalent for Prisma client initialization (check for `connection_limit` URL param). Read facets route for `$transaction` usage and timeout config.

#### 3c. seenIdsRef Growing Unbounded **[P3-SKIP]**

**Verdict: SAFE.** `seenIdsRef` is bounded at ~120 strings worst case (`MAX_ACCUMULATED=60` + dupes). Resets on every param change via component key. Negligible memory. Verify in <2 minutes and move on.

**Quick verify:** Confirm `SearchResultsClient` is keyed by `searchParamsString` in parent. Done.

#### 3d. Redis Connection Handling in Geocoding **[P3-SKIP]**

**Verdict: SAFE.** Upstash uses HTTP REST API — stateless, no persistent connections, no leak possible. Verify import is `@upstash/redis` in <1 minute and move on.

#### 3e. Timer Leaks (setTimeout/setInterval)

**Risk:** Multiple hooks use `setTimeout` for debouncing. If cleanup functions are incomplete, timers survive across renders.

**Specific concerns (per hook):**

| Hook/Component | Timer Ref | Cleanup Location | Verified? |
|---------------|-----------|-----------------|-----------|
| `useFacets` | `debounceTimeoutRef` | Effect return (line 250-253) | Audit |
| `useDebouncedFilterCount` | `debounceTimeoutRef` | Effect return | Audit |
| `MapBoundsContext` | `areaCountDebounceRef` | Effect return | Audit |
| `MapBoundsContext` | `programmaticMoveTimeoutRef` | Effect return | Audit |
| `PersistentMapWrapper` | `fetchTimeoutRef` | Effect return | Audit |
| `PersistentMapWrapper` | `retryTimeoutRef` | Effect return | Audit |
| `LocationSearchInput` | via `useDebounce` (external) | Library-managed | Audit library |

**Audit method:** For each timer ref: (1) verify `clearTimeout` is called in the effect return function, (2) verify `clearTimeout` is called BEFORE `setTimeout` in the effect body (prevents accumulation on rapid re-renders), (3) check for `clearTimeout` on unmount (effect cleanup runs on unmount).

#### 3f. AbortController Leaks

**Risk:** AbortControllers created in hooks but never aborted on unmount.

**Specific concerns:**

| Hook/Component | AbortController Ref | Cleanup Location | Verified? |
|---------------|-------------------|-----------------|-----------|
| `useFacets` | `abortControllerRef` | Effect return (line 254-256) | Audit |
| `useDebouncedFilterCount` | `abortControllerRef` | Effect return | Audit |
| `PersistentMapWrapper` | `abortControllerRef` | Effect return | Audit |
| `MapBoundsContext` | `areaCountAbortRef` | Effect return | Audit |
| `LocationSearchInput` | `abortRef` | Separate unmount effect (line 81-87) | Audit |

**Audit method:** For each AbortController ref: (1) verify effect cleanup calls `.abort()`, (2) verify new controller is created AFTER aborting the previous one (not before — prevents gap where no controller is active), (3) verify `signal.aborted` check before every `setState` after the `await`.

#### 3g. createTTLCache `setInterval` Never Cleared

**Risk:** `createTTLCache.ts` line 37: `setInterval(sweep, 60_000)` runs every 60 seconds in browser but has no corresponding `clearInterval`. This interval persists for the entire page session.

**Specific concerns:**
- Module-level caches (`facetsCache` in `useFacets.ts` line 20, count cache in `useDebouncedFilterCount.ts`) are singletons — they persist for the lifetime of the SPA. The interval is harmless in practice because the cache is never garbage collected.
- However, if `createTTLCache` were ever used for a component-scoped cache (created inside a component), the interval would leak on every remount. Currently this doesn't happen, but it's a latent defect.
- The sweep function iterates the entire Map every 60s. For `maxSize=100`, this is negligible. But it's unnecessary work when the cache is empty.

**Audit method:** (1) Grep for all `createTTLCache` call sites — verify they are all module-level (not inside components). (2) Confirm the interval is harmless for module-level usage. (3) Note as a code quality finding: the cache should either expose a `destroy()` method or guard the sweep with an empty-check.

**Pre-finding:** This IS a confirmed code quality issue. The `setInterval` at `createTTLCache.ts:37` is never cleared. Since all current usages are module-level singletons, there's no practical memory leak, but it prevents GC if a cache were ever created dynamically.

#### 3h. ResizeObserver in SearchHeaderWrapper

**Risk:** `SearchHeaderWrapper.tsx` line 93-119 creates a new `ResizeObserver` each time `[isCollapsed, isExpanded]` changes.

**Specific concerns:**
- The old observer's `disconnect()` is called via effect cleanup (line 116-118) BEFORE the new observer is created. No leak.
- However, each observer creation triggers an initial callback (browser fires callback on `observe()`). Rapid collapse/expand toggling could cause rapid `--header-height` updates.
- The `requestAnimationFrame` wrapper (line 111) coalesces rapid callbacks within a single frame. This mitigates the issue.

**Audit method:** Verify effect cleanup properly disconnects old observer. Check `useScrollHeader` for hysteresis on `isCollapsed` to prevent rapid toggling. Note as minor inefficiency (not a leak).

#### 3i. Spatial Cache in PersistentMapWrapper

**Risk:** The spatial cache in `PersistentMapWrapper` stores map listings for previously-viewed viewports.

**Specific concerns:**
- Bounded at `SPATIAL_CACHE_MAX_ENTRIES = 20` with LRU eviction. Each entry contains up to `MAX_MAP_MARKERS = 200` listings. Worst-case memory: 20 * 200 * ~1KB per listing = ~4MB. Acceptable.
- Cache persists across navigations (component stays mounted in layout). Over a long session, the 20-entry cap with LRU ensures memory is bounded.
- Cache key uses quantized bounds (`BOUNDS_EPSILON`). Verify quantization prevents cache fragmentation from very similar viewports.

**Audit method:** Verify `SPATIAL_CACHE_MAX_ENTRIES` constant exists and is used in the LRU eviction logic. Estimate per-entry memory size. Confirm 20-entry cap is sufficient and not too aggressive.

#### 3j. MobileBottomSheet Document-Level Listeners

**Risk:** `MobileBottomSheet.tsx` adds document-level `touchend`/`touchcancel` listeners (line 237-255) when `isDragging` is true.

**Specific concerns:**
- Listeners are added in a `useEffect([isDragging])` and cleaned up in the effect return. Properly scoped.
- Can `isDragging` toggle rapidly (true/false/true) causing listener accumulation? No — React runs cleanup before the next effect. Each cycle: cleanup removes old listeners → effect adds new listeners.
- What if the component unmounts while `isDragging` is true? Effect cleanup runs on unmount, removing listeners. Correct.

**Audit method:** Verify effect cleanup (lines 251-254) removes both `touchend` and `touchcancel` listeners. Confirm event handler function identity is stable (it's defined inside the effect, so each effect run creates a new function — but cleanup removes the specific function that was added).

---

### 4. Timeout & Error Handling

#### 4a. Supabase Query Slow or Fails

**Current protections:**
- `SET LOCAL statement_timeout = '5000'` (5s) per query in `search-doc-queries.ts`
- `DEFAULT_TIMEOUTS.DATABASE` (5s) in `executeSearchV2`
- `$transaction` timeout in facets route

**Concerns:**
- What happens to the client when SSR `executeSearchV2` times out? Does `page.tsx` catch and render error boundary? Trace: `page.tsx` calls `executeSearchV2` → if it throws → does `error.tsx` catch it?
- Does the V1 fallback activate on V2 timeout, or does it also timeout?
- Is the facets transaction timeout independent of individual query timeouts? `SET LOCAL statement_timeout` scoping within `$transaction`.
- Can a slow query block the Prisma connection pool? If pool size is N and N concurrent requests all hit 5s timeouts, pool exhaustion for 5s.

**Audit method:** Read error handling in `page.tsx` (try/catch around `executeSearchV2`), `search-v2-service.ts` (internal error handling), and facets route (`$transaction` timeout parameter). Trace timeout propagation: Prisma timeout → Error thrown → caught where? → user sees what?

#### 4b. Mapbox Fails to Load or Tiles Timeout

**Current protections:**
- WebGL detection in `DynamicMap.tsx` — falls back to `WebGLFallback`
- `MapErrorBoundary` wraps `LazyDynamicMap`
- `Suspense` fallback for lazy load

**Concerns:**
- What happens if Mapbox JS loads but tile server is down? (Map shows but is gray/empty — no error event for tile timeout)
- What happens if Mapbox token is invalid or expired? (403 on tile requests — Mapbox fires `error` event with `status: 401`)
- Does `MapErrorBoundary` catch Mapbox runtime errors (WebGL context lost)? WebGL context lost is a DOM event, not a React render error — error boundary won't catch it.
- Is there a user-facing message for tile load failure?

**Audit method:** Read `DynamicMap.tsx`, `MapErrorBoundary.tsx`, `Map.tsx`. Check for Mapbox `error` event handling. Grep for `webglcontextlost` event listener. Verify error boundary catches render errors but note it can't catch Mapbox runtime/WebGL errors.

#### 4c. Nominatim/Photon Geocoding Service Fails

**Current protections:**
- Circuit breaker in `nominatim.ts`
- Redis cache (24h TTL) — cached results survive outages
- In-memory fallback when Redis is down

**Concerns:**
- What happens when geocoding fails on initial search? (No coordinates → no bounds → search query without geographic constraint → possibly unbounded query → `boundsRequired` response?)
- Does the circuit breaker have a reasonable open-circuit duration? Read circuit breaker config.
- Is there a user-facing error message for geocoding failure? Or does search silently return no results?
- Can stale cache serve wrong coordinates for a changed address? (24h TTL — addresses don't change frequently, acceptable)

**Audit method:** Read `geocoding.ts` and `nominatim.ts`. Trace failure path: `geocode()` throws → caught where in `page.tsx` or `search-v2-service.ts`? → what does user see? Check circuit breaker open duration and half-open probe logic.

#### 4d. Photon Autocomplete API Fails or Returns Empty

**Current protections:** `LocationSearchInput.tsx` uses Photon geocoding (NOT Google Places). Has AbortController (`abortRef`), 300ms debounce via `useDebounce`, error state, noResults state, input sanitization via `sanitizeQuery()`.

**Concerns:**
- **No results:** `setNoResults(true)` → UI shows "No locations found" (or similar). Verify this renders properly and doesn't block form submission.
- **API error/timeout:** `setError(errorMessage)` → UI shows error indicator. Does `FetchTimeoutError` from `fetch-with-timeout.ts` get caught? What timeout value is used for Photon requests?
- **Malformed response:** Does the Photon response parser handle unexpected JSON structure? (Missing `features` array, null coordinates, etc.)
- **Offline:** Is `navigator.onLine` checked before Photon requests? (Not in LocationSearchInput — only in useFacets)
- **User submits form without selecting suggestion:** Does the search work with just text input (no coordinates)? This triggers server-side geocoding via `geocoding.ts`.

**Audit method:** Read `LocationSearchInput.tsx` in full. Trace: (1) user types → debounce → `fetchSuggestions` → Photon API → response parsing → UI update, (2) error path → `setError` → error UI, (3) no results path → `setNoResults` → noResults UI. Read `searchPhoton` in `src/lib/geocoding/photon.ts` for timeout and error handling.

#### 4e. Radar API Down

**Current protections:**
- Circuit breaker in nearby route
- Per-user rate limiting

**Concerns:**
- What happens to the listing detail page when nearby search fails? (Feature should degrade gracefully — no nearby suggestions shown)
- Does circuit breaker state persist across serverless cold starts? (No — in-memory circuit breaker resets on cold start. Is this acceptable?)
- Is there a timeout on Radar requests? Read the fetch call for timeout config.

**Audit method:** Read `/api/nearby/route.ts` error handling. Verify circuit breaker implementation. Check: is circuit breaker state stored in-memory (resets on cold start) or in Redis (persists)? If in-memory, verify the retry-after-cold-start behavior is bounded (circuit opens on first failure, so at most one wasted request per cold start).

#### 4f. Client-side Rate Limit Exhaustion

**Risk:** `rateLimitedFetch` from `rate-limit-client.ts` wraps fetch calls in `useFacets` and `useDebouncedFilterCount`. If the rate limit is hit, what happens?

**Concerns:**
- `RateLimitError` is caught in `useFacets` (line 214-217) — sets `isLoading(false)` and returns. No error shown to user. Silent degradation.
- Is the rate limit per-session or per-page? (Client-side, so per-page — resets on navigation)
- Can aggressive filter toggling exhaust the rate limit? (Debounce helps, but 300ms with rapid toggling could still accumulate)

**Audit method:** Read `rate-limit-client.ts` implementation. Check: bucket size, refill rate, error class. Verify `useFacets` and `useDebouncedFilterCount` both handle `RateLimitError` gracefully.

#### 4g. framer-motion Animation Failure

**Risk:** `MobileBottomSheet` uses framer-motion spring animation. If the animation engine encounters an error, the sheet could get stuck.

**Concerns:**
- If `LazyMotion` (line 311) fails to load the `domAnimation` chunk (network error during dynamic import), does `<m.div>` throw a render error or silently degrade? Read `LazyMotion` source: it uses `React.createContext` and `<m.div>` reads from that context — if features aren't loaded, verify whether it falls back or crashes.
- `AnimatePresence` (line 313) wraps the overlay. If the overlay's exit animation errors, verify whether it blocks subsequent renders by reading `AnimatePresence` error handling.

**Audit method:** Read `MobileBottomSheet.tsx` lines 311-340. Check: (1) is `<LazyMotion>` wrapped in an error boundary or `<Suspense>`? (2) Read the framer-motion `LazyMotion` source to determine failure behavior when chunk load fails. (3) Grep for `ErrorBoundary` wrapping the bottom sheet.

---

### 5. Edge Cases

#### 5a. Zero Search Results

**Concerns:**
- `SearchResultsClient` renders a meaningful zero state when `hasConfirmedZeroResults` is true (line 184-215). Shows "No matches found" with either filter suggestions or "Clear all filters" link.
- Does the map show empty state? Check `MapEmptyState.tsx` for rendering when listings array is empty.
- Does the "Show X listings" button in filter drawer show "0 listings"? Check `useDebouncedFilterCount` return value when count is 0.
- Does the area count banner show "0 listings in this area"? Check MapBoundsContext area count display.
- Can zero results trigger infinite retry? No — "Load more" button only renders when `nextCursor && !reachedCap` (line 264). With zero results, `nextCursor` is null.

**Audit method:** Trace zero-result path from SSR through client rendering. Check all conditional renders. Verify filter drawer count shows 0 correctly without negative numbers or NaN.

#### 5b. Special Characters in Search Query

**Concerns — SQL injection:**
- `$queryRawUnsafe` in `search-doc-queries.ts` — does `assertParameterizedWhereClause` catch all injection attempts? This function likely verifies that all WHERE clause conditions use parameterized values (`$1`, `$2`) rather than interpolated strings.
- `plainto_tsquery()` sanitizes input by design — strips operators, treats everything as plain text terms.
- URL params are decoded by Next.js before being passed to route handlers.

**Concerns — XSS:**
- Search query `q` is rendered in the UI: `SearchResultsClient` line 194 (`for "{query}"`), line 227 (`in ${query}`), line 321 (`in ${query}`).
- React auto-escapes JSX template literals — `{query}` is safe from XSS.
- Grep for `innerHTML` patterns to ensure no unsafe rendering.

**Sample inputs:** `'; DROP TABLE listings; --`, `<script>alert(1)</script>`, emoji (`🏠🔍`), CJK characters (`東京マンション`), `NULL`, empty string, 10000-char string, `%00` null bytes

**Audit method:** Read `assertParameterizedWhereClause()` — verify it rejects non-parameterized WHERE clauses. Grep for `innerHTML` or `__html` across all search-related components. Trace query param `q` from URL → `parseSearchParams` → `search-doc-queries.ts` → `plainto_tsquery($N)` → verify parameterized.

#### 5c. Boundary Coordinates

**Concerns:**
- **Antimeridian crossing** (minLng > maxLng, e.g., Pacific Islands): Does `isValidViewport` handle this? Check `crossesAntimeridian` logic in `PersistentMapWrapper`.
- **Poles** (lat close to +/-90): Does `ST_MakeEnvelope` handle extreme latitudes? PostGIS supports -90 to 90 for latitude.
- **Null Island** (0,0): Does a search at 0,0 return results or error? Lat=0, Lng=0 is valid — verify no `if (!lat)` falsy checks that would reject 0.
- **Extreme zoom out** (entire world visible): `MAX_LAT_SPAN=10`, `MAX_LNG_SPAN=10` limits — what's the user experience when exceeded? Does the search still work but with wider bounds clamped?
- **Quantized bounds** (BOUNDS_EPSILON precision): Can rounding cause cache misses for nearby viewports?

**Sample inputs:** `minLng=170&maxLng=-170` (antimeridian), `minLat=89&maxLat=90` (pole), `lat=0&lng=0` (null island), `minLat=-90&maxLat=90&minLng=-180&maxLng=180` (world), `minLat=NaN` (invalid)

**Audit method:** Read bounds validation in `PersistentMapWrapper` (`isValidViewport()`), and `search-doc-queries.ts` (WHERE clause construction). Check `LAT_MIN/LAT_MAX/LNG_MIN/LNG_MAX` constants. Verify `0` is not treated as falsy for coordinates. Check for `Number.isNaN` guards.

#### 5d. Max Pagination (60-item Cap)

**Concerns:**
- At exactly 60 items: `reachedCap = allListings.length >= MAX_ACCUMULATED` (line 92, uses `>=`). So at 60, cap is reached.
- Cap condition for rendering: `reachedCap && nextCursor` (line 289) — shows "Showing 60 results. Refine your filters." Only if cursor exists (more results available).
- If `nextCursor` is null at 60: no cap message, just "You've seen all 60 results" (line 312-316, condition: `!nextCursor && allListings.length > 0 && extraListings.length > 0`).
- If user has 59 items and next page returns 12: `allListings` becomes 71. `reachedCap = true`. "Load more" button disappears. Items beyond 60 are still shown (no truncation). Cap is enforced at the button level, not the data level.
- Is the cap enforced pre-append or post-append? Post-append — items are added to `extraListings`, then `reachedCap` is checked on next render. User briefly sees >60 items, then button disappears.

**Audit method:** Read `SearchResultsClient` cap logic. Verify: `reachedCap` (line 92), load-more button condition (line 264), cap message condition (line 289), end-of-results condition (line 312). Trace the 59→71 scenario.

#### 5e. Very Large Result Sets (1000+ Pins on Map)

**Concerns:**
- `MAX_MAP_MARKERS = 200` caps server response in API route. Client receives at most 200 listings.
- `effectiveListings` memo in PersistentMapWrapper merges: `listings` (current fetch, max 200) + `previousListingsRef.current` (previous fetch) + spatial cache entries. Is the merge capped?
- Check if `.slice(0, MAX_MAP_MARKERS)` is applied after merge.
- GeoJSON mode: listings > 50 switch to GeoJSON source layer (clustered). This provides Mapbox-level clustering for many points.
- Below 50: individual `<Marker>` components (DOM nodes). Performance concern at 50 markers but acceptable.

**Audit method:** Read `effectiveListings` merge logic in `PersistentMapWrapper`. Search for `.slice(0, MAX_MAP_MARKERS)` or equivalent cap. Read `Map.tsx` for the 50-marker threshold and GeoJSON clustering config.

#### 5f. IME Composition in Search Input

**Risk:** `LocationSearchInput.tsx` uses `isComposingRef` (line 73) to track IME composition state. CJK input uses composition events — characters are assembled before being committed.

**Concerns:**
- Does `debouncedValue` (via `useDebounce`) fire during composition? If yes, partial/unfinished characters are sent to Photon, which returns no results.
- Is `isComposingRef` used to suppress fetches during composition? Check `fetchSuggestions` for composition guard.
- After composition ends (`compositionend` event), does the debounce correctly trigger with the final composed value?

**Audit method:** Read `LocationSearchInput.tsx` for `compositionstart`/`compositionend` event handlers. Trace: (1) user starts IME input → `isComposingRef = true` → debounce fires but fetch is suppressed? Or debounce fires and fetch runs with partial input? (2) user commits composition → `isComposingRef = false` → value updates → debounce triggers → fetch with final value. Verify no wasted Photon requests during composition.

#### 5g. Network Reconnection After Offline Period

**Risk:** `useFacets` checks `navigator.onLine` before fetching (line 132). When user goes offline, facets fetches are skipped. But what happens when they come back online?

**Concerns:**
- There is no `online` event listener to trigger a refetch. User must interact with filters to trigger a new cache key change, which re-runs the effect.
- If user was offline and opened the drawer, facets show stale cached data (or nothing if cache expired). Coming back online doesn't auto-refresh.
- `useDebouncedFilterCount` — does it also check `navigator.onLine`? If not, it will attempt fetches while offline, get network errors, and show error state.

**Audit method:** Grep for `addEventListener.*online` across all search hooks. Verify behavior: user goes offline → opens drawer → sees stale/no facets → comes back online → interacts with filter → facets refresh. Acceptable degradation?

#### 5h. Long Session Without Page Reload

**Risk:** A user keeps the search page open for hours, panning the map and toggling filters. Do accumulated caches and state cause memory pressure?

**Concerns:**
- `facetsCache` (module-level, maxSize=100, 30s TTL, 60s sweep) — bounded and self-cleaning. Acceptable.
- `countCache` in `useDebouncedFilterCount` (module-level, maxSize=100, 30s TTL) — same. Acceptable.
- Spatial cache in `PersistentMapWrapper` (component-level, max 20 entries, ~4MB worst case) — bounded. Acceptable.
- `seenIdsRef` in `SearchResultsClient` — resets on every search param change. Bounded at ~120 strings. Acceptable.
- Mapbox GL internal state — Mapbox manages its own tile cache with browser-level caching. Not our concern.
- React component tree — stays mounted in layout. No accumulation beyond what's designed.

**Audit method:** Enumerate all caches and bounded collections. Calculate worst-case total memory: `facetsCache (100 entries * ~5KB) + countCache (100 * ~100B) + spatial (20 * 200 * ~1KB) + seenIds (120 * ~40B) ≈ 4.5MB + 500KB + 5KB = ~5MB`. Acceptable for a long session.

---

### 6. State Sync Issues

#### 6a. URL Params vs Filter Context State Drift

**Risk:** `useBatchedFilters` maintains `pending` state separate from URL `committed` state. Drift can occur in several scenarios.

**Concerns:**
- User opens filter drawer, changes filters, navigates away without applying, comes back. Is `pending` still dirty? Trace: drawer opens → `drawerJustOpened` (line 230) → `setPendingState(committed)` → pending resets to URL state. Correct.
- Browser back/forward changes URL but `pending` doesn't update. `forceSyncUntilRef` (10s window) handles post-commit sync. After 10s, `committedFiltersChanged` check (line 243) detects URL change and syncs. But does it miss a case where URL changes WITHOUT `committed` changing? (e.g., only bounds changed — `committed` uses `readFiltersFromURL` which ignores bounds params)
- `previousCommittedRef` tracking (line 223, updated at line 264): can it get out of sync? It's updated at the END of the effect, so it always reflects the last processed `committed` value. Correct.

**Audit method:** Trace `useBatchedFilters` through these scenarios:
1. Open drawer → change price → close drawer (no apply) → open drawer again → verify `drawerJustOpened` resets pending
2. Apply filters → browser back → wait 11s → open drawer → verify `committedFiltersChanged` syncs
3. Apply filters → immediately browser back → open drawer (within 10s) → verify `forceSyncUntilRef` forces sync (but guard at line 249 checks `isDrawerOpen && hasUnsavedEdits` — if drawer just opened, `hasUnsavedEdits` is false, so sync proceeds)

#### 6b. Map Bounds vs List Results Mismatch

**Risk:** Map shows markers for current viewport but list shows results for different (URL-committed) bounds.

**Concerns:**
- After `searchCurrentArea()`, URL updates with map bounds → SSR re-runs → list shows results for new bounds → map also updates from SSR (V2 path) or client fetch (V1 path). Timing gap between URL update and map data arrival.
- V2 path: SSR returns both list+map in one response. V1 path: list from SSR, map from `/api/map-listings` client fetch. V1 path has a timing gap.
- `PersistentMapWrapper` pads bounds by 20% (`FETCH_BOUNDS_PADDING=0.2`). List uses exact URL bounds. Map shows MORE markers than list. This is by design — provides seamless panning experience. But can confuse users who see map pins without corresponding list entries.

**Audit method:** Trace `searchCurrentArea` → URL update → SSR → list results vs map markers. Verify map padding is documented/expected. Check if any UI element explains the discrepancy.

#### 6c. Mobile Search State vs Desktop State

**Risk:** `SearchViewToggle` renders children in TWO containers (desktop + mobile) with CSS visibility. Both containers share the same React tree.

**Concerns:**
- State is shared (same component instance renders in both containers). No sync issue.
- `MobileBottomSheet` has its own snap state. Desktop resize into mobile layout: snap state is initialized to 1 (half) via `useState(1)` at line 75. If user was on desktop and resizes to mobile, sheet starts at half. Acceptable.
- `useBodyScrollLock` (line 295): locks when `snapIndex === 2 || isDragging`. If user resizes from mobile (expanded, scroll locked) to desktop: `MobileBottomSheet` is hidden via CSS `display: none`, but the component is still mounted. Is `useBodyScrollLock` still active? If yes, desktop view has locked body scroll. This is a bug risk.

**Audit method:** Read `useBodyScrollLock` implementation. Check: does it use a ref to the actual DOM element, or does it manipulate `document.body.style.overflow`? If the latter, hiding the mobile container via CSS doesn't disable the lock. Read `SearchViewToggle.tsx` to see if mobile components are unmounted or just hidden.

#### 6d. Browser Back/Forward Button Behavior

**Risk:** `popstate` event changes URL → React re-renders → state sync needed.

**Concerns:**
- `useBatchedFilters`: `forceSyncUntilRef` (10s window) after `commit()` forces sync on back/forward. After 10s, `committedFiltersChanged` check still works. Correct.
- `SearchResultsClient`: Key changes on `searchParamsString` → full remount → clean state. Correct.
- `MapBoundsContext`: `useEffect([searchParams])` resets `hasUserMoved` and `boundsDirty` on non-bounds changes. Correct.
- `PersistentMapWrapper`: `lastFetchedParamsRef` check prevents redundant fetches on back to same URL. Correct.
- Scroll position: Next.js `router.push` does NOT preserve scroll. Browser back/forward DOES preserve scroll (via browser native behavior). `ScrollRestoration` is handled by Next.js automatically for app router.

**Audit method:** Trace back/forward through each stateful component. Verify state resets correctly. Test: navigate to search → scroll down → apply filter → browser back → verify scroll position restored.

#### 6e. SearchTransitionContext Concurrent Transitions

**Risk:** Two URL navigations started concurrently (e.g., filter apply + map search).

**Concerns:**
- `React.startTransition` does NOT queue transitions — the second one interrupts the first.
- If the first transition was a filter commit and the second is a map search, the filter commit's SSR render is aborted mid-flight. The URL may have already been pushed for the first transition. Does the second transition push a new URL that includes both changes?
- `useBatchedFilters.commit()` builds its URL from `pending` state + current `searchParams`. `searchCurrentArea()` builds its URL from `currentMapBounds` + current `searchParams`. If both run within the same event loop tick, they both read the same `searchParams` and create conflicting URLs.

**Audit method:** Read `SearchTransitionContext.tsx` implementation. Check: (1) does `navigateWithTransition` use `router.push` inside `startTransition`? (2) does it track `isPending` from `useTransition`? (3) is there a guard against concurrent navigations? (4) what happens to the URL history stack when two `router.push` calls happen rapidly?

#### 6f. sessionStorage Isolation Across Tabs

**Risk:** `SearchResultsClient` stores `showTotalPrice` in `sessionStorage` (line 63-64). `sessionStorage` is per-tab, so no cross-tab sync issue. But `useMapPreference` may store map preferences in `localStorage` (which IS shared across tabs).

**Concerns:**
- If user opens two tabs and toggles map preference in one, does the other tab's React state update? Only if there's a `storage` event listener — verify by reading `useMapPreference`.
- `useRecentSearches` may also use `localStorage`. Verify whether concurrent writes from two tabs could corrupt the stored array (read-modify-write race).

**Audit method:** (1) Grep for `localStorage` usage across all search hooks — list every read/write site. (2) Grep for `addEventListener.*storage` to check for cross-tab listeners. (3) For each `localStorage` writer, check if it does read-modify-write (race-prone) or atomic set.

---

### 7. Render Performance & Hydration **[P0]**

This section is the most likely source of user-visible performance degradation. The previous version of this spec entirely missed it.

#### 7a. `useSearchParams()` Re-render Cascade

**Risk: HIGH.** 22+ components/hooks call `useSearchParams()`. Every single URL param change — including map bounds — triggers a re-render of ALL 22 consumers. This is the search page's biggest performance risk.

**Known consumers (search-related):**
- `PersistentMapWrapper.tsx:390` — triggers on bounds changes, runs `getMapRelevantParams()` and `getFilterKey()` on every render
- `useBatchedFilters.ts:211` — recalculates `committed` via `useMemo([searchParams])`
- `useFacets.ts:116` — recalculates `cacheKey` via `useMemo([pending, searchParams])`
- `MapBoundsContext.tsx:281` — recalculates area count cache key
- `SearchV2DataContext.tsx:96` — invalidates V2 context
- `AppliedFilterChips.tsx:30`, `FilterChipWithImpact.tsx:37`, `CompactSearchPill.tsx:17`, `DatePills.tsx:25`, `RecommendedFilters.tsx:40`, `SortSelect.tsx:34`, `SaveSearchButton.tsx:25`, `LowResultsGuidance.tsx:39`, `CollapsedMobileSearch.tsx:30`, `CategoryBar.tsx:90`, `Map.tsx:528`, `SearchResultsLoadingWrapper.tsx:32`, `ZeroResultsSuggestions.tsx:26`

**The cascade:** User pans map → bounds change → URL updates → `useSearchParams()` fires in ALL 22 consumers → every filter chip, every facets hook, every category bar re-renders. Most of these re-renders produce identical output (filters didn't change, only bounds did).

**Specific concerns:**
- `PersistentMapWrapper` runs `getMapRelevantParams()` (line 693, O(n) URLSearchParams iteration + sort) and `getFilterKey()` (line 717, O(n) filter canonicalization) on every `useSearchParams()` change. Are these memoized?
- `AppliedFilterChips` re-renders on every bounds change even though it only displays filter chips (not bounds).
- `useFacets.cacheKey` depends on `searchParams` — but only uses location params from it (lines 63-69). A bounds-only change creates a new `cacheKey` string which triggers a new debounce cycle.

**Audit method:**
1. List all `useSearchParams()` consumers. For each, determine: does it actually need ALL params or just a subset?
2. Identify which consumers re-render on bounds-only changes but don't use bounds.
3. Check if `useMemo` guards prevent wasted computation (e.g., does `committed` in `useBatchedFilters` use `Object.is` comparison for `searchParams`? `useSearchParams()` returns a new `ReadonlyURLSearchParams` object on every render — `Object.is` returns false — so `useMemo([searchParams])` recalculates EVERY time).
4. For each consumer that re-renders unnecessarily: document the wasted work (memo recalculation, DOM diffing) and whether it causes user-visible jank (measure with React DevTools Profiler).

#### 7b. SSR/Hydration Mismatches

**Risk: MEDIUM.** Next.js SSR renders on the server, then hydrates on the client. Any server/client state divergence causes a hydration mismatch (console warning, possible UI flicker, sometimes broken interactivity).

**Known mismatch vectors:**

| Source | File:Line | Risk | Guarded? |
|--------|-----------|------|----------|
| `Date.now()` in filter sync | `useBatchedFilters.ts:245,296` | `forceSyncUntilRef` uses `Date.now()` inside `useEffect` state updater | Yes — inside `useEffect` (client-only). BUT the state updater runs during React's commit phase — verify this is truly client-only. |
| `sessionStorage.getItem` | `SearchResultsClient.tsx:63` | Reads `showTotalPrice` in `useEffect` | Yes — inside `useEffect`. But no `typeof window` guard. If test env simulates `useEffect` during SSR, crashes. |
| `sessionStorage.setItem` | `TotalPriceToggle.tsx:19` | Writes on toggle | Client-only event handler. Safe. |
| `window.innerHeight` | `MobileBottomSheet.tsx:108,136` | Used for drag calculations | Inside callbacks (client-only). Safe. |
| `navigator.onLine` | `useFacets.ts:132` | Checked before fetch | Inside `useCallback` (client-only). Safe. |
| `isHydrated` state | `SearchResultsClient.tsx:49,61` | False during SSR, true after mount | Correctly handled — hydration-safe pattern. |

**Provable risk:** Components that conditionally render based on `useSearchParams()` values (e.g., `AppliedFilterChips` rendering a chip only when a param is set) could produce different HTML on server vs client if the SSR `searchParams` prop and client-side `useSearchParams()` parse URL params differently. Verify by reading `page.tsx` to check if SSR passes the same `URLSearchParams` that client-side `useSearchParams()` returns.

**Audit method:**
1. Verify all `Date.now()`, `Math.random()`, `window.*`, `document.*`, `navigator.*`, `sessionStorage`, `localStorage` usages are inside `useEffect`, event handlers, or `typeof window` guards.
2. Check for conditional rendering that differs between server and client (e.g., `typeof window !== 'undefined' && <Component />`). This causes hydration mismatch.
3. Trace `useSearchParams()` through SSR: does `page.tsx` pass initial data that could diverge from what `useSearchParams()` returns on the client?

#### 7c. `effectiveListings` Memo Stability

**Risk: MEDIUM.** The `effectiveListings` memo in `PersistentMapWrapper.tsx` (lines 456-496) is the single most complex computation in the search page. It merges data from 4 sources and runs on every dependency change.

**Specific concerns:**
- Deps: `[isV2Enabled, v2MapData, lastV2Data, listings, isFetchingMapData]`
- `v2MapData` comes from `SearchV2DataContext`. If the context provides a new object reference on every render (even with identical data), the memo recalculates needlessly.
- During fetch: merges `listings` + `previousListingsRef` + spatial cache. Worst case: O(4,200) ID lookups (200 current + 200 previous + 20 cache entries * 200 each). This is acceptable but should be verified.
- **Critical question:** Does the memo correctly enforce `MAX_MAP_MARKERS` cap AFTER merge? If not, a merge of multiple cache entries could produce 4,000+ markers, crashing Mapbox.

**Audit method:**
1. Read the memo at `PersistentMapWrapper.tsx:456-496`. Trace: does `.slice(0, MAX_MAP_MARKERS)` appear after the merge? If not, calculate worst-case marker count from merge logic.
2. Read `SearchV2DataContext` — does it memoize `v2MapData` with `useMemo` or `useRef`, or does it pass a new object on each render? Check the context provider's value prop.
3. Read all 5 deps of the memo. For each, determine if it produces a new reference on every render or only when data changes.

#### 7d. Tab Backgrounding & Visibility

**Risk: MEDIUM.** Users leave tabs open for hours. When backgrounded: `setTimeout` is throttled to 1000ms minimum, `requestAnimationFrame` stops, fetch responses may be delayed.

**Current state:** Only `ListingFreshnessCheck.tsx` handles `visibilitychange`. The search page does NOT pause/resume any activity on tab backgrounding.

**Specific concerns (all verifiable by code reading):**
- `useFacets` and `useDebouncedFilterCount` use `setTimeout(fn, 300)`. Browsers throttle backgrounded tab timers to 1000ms minimum (documented spec behavior). Verify: do these hooks check `document.hidden` before fetching? If not, a fetch starts with stale params on tab restore.
- `PersistentMapWrapper` uses `setTimeout(fn, 100)` and `setTimeout(fn, 250)`. Same throttling concern. Verify: does the AbortController in the effect cleanup cancel fetches that started from throttled timers?
- `forceSyncUntilRef` in `useBatchedFilters` uses `Date.now()` — backgrounding for >10s expires the sync window. This is correct behavior (no issue).

**Audit method:**
1. Grep for `visibilitychange` and `document.hidden` across all search-related files. List every handler found.
2. For each `setTimeout`-based fetch in `useFacets`, `useDebouncedFilterCount`, and `PersistentMapWrapper`: read the effect cleanup to verify the AbortController is aborted, which cancels any stale fetch regardless of timer throttling.
3. Verify: after tab restore, the next user interaction (filter toggle, map pan) triggers a fresh fetch with current params, making the stale-timer concern self-correcting.

---

### 8. Observability & Error Recovery **[P1]**

An audit that finds bugs but can't detect them in production is half an audit.

#### 8a. No Structured Error Reporting on Search Page

**Risk: MEDIUM.** The search page has ZERO Sentry/error-tracking integration. All errors go to `console.error` or `console.warn`. In production, these are invisible.

**Evidence:**
- `useFacets.ts:218` — `console.error("[useFacets] Error:", err)` — silent in production
- `PersistentMapWrapper.tsx:562` — `console.error` for fetch failures — silent in production
- `MapBoundsContext.tsx` — area count errors logged to console only
- Contrast with other pages: `about/error.tsx:16` HAS `Sentry.captureException`. Search page's `error.tsx` does NOT.

**Specific concerns:**
- If `executeSearchV2` fails intermittently (e.g., connection pool exhaustion), there's no alert. Users see errors, team doesn't know.
- If facets API returns 500 repeatedly, it degrades silently to empty facets. No alert.
- If Photon geocoding is down, autocomplete silently fails. No alert.
- Rate limit exhaustion (`RateLimitError`) is silently swallowed. No metric.

**Audit method:**
1. Grep for `Sentry` in search-related files. Confirm absence.
2. List all `console.error` and `console.warn` calls in search hooks/components.
3. Recommend: add `Sentry.captureException` with tags (`{boundary: 'search', component: '...'}`) to: `error.tsx`, `useFacets` catch block, `PersistentMapWrapper` fetch error, `MapBoundsContext` area count error.

#### 8b. Error Recovery Completeness

**Risk: MEDIUM.** The audit must verify not just "does the error boundary catch?" but "can the user get back to a working search without a full page reload?"

**Recovery paths to verify:**

| Error Scenario | Current Recovery | Adequate? |
|---------------|-----------------|-----------|
| SSR `executeSearchV2` throws | `error.tsx` renders "Try again" button → `reset()` re-runs SSR | Yes — verify `reset()` works |
| Map fetch 429 | Auto-retry with `Retry-After` header, max 1 retry | Yes — but verify retry actually fires |
| Map fetch 5xx | `MapErrorBanner` with "Retry" button (line 239-263) | Yes |
| Facets API fails | Returns `EMPTY_FACETS`, no retry button | Partial — user sees empty counts, no way to retry facets without re-interacting with filters |
| Search count API fails | Returns null count, no retry | Partial — "Show listings" button shows no count |
| Photon autocomplete fails | Error state shown in LocationSearchInput, form still submittable | Yes |
| Mapbox tiles fail | Gray map, no user-facing error message | Verify: read `Map.tsx` for Mapbox `error` event handler. If absent, this is a gap — user sees gray map with no explanation. |
| WebGL context lost | Map goes blank, error boundary may not catch (DOM event, not React error) | Verify: grep for `webglcontextlost` in `Map.tsx` and `DynamicMap.tsx`. React error boundaries only catch render errors, not DOM events. If no handler exists, this is a gap. |

**Audit method:** For each row, trace the error path end-to-end. Verify the user can recover. Flag any dead-end error states.

#### 8c. Loading State Stuck / Infinite Spinner

**Risk: MEDIUM.** The worst UX bug is a loading spinner that never resolves. Every async operation must guarantee that `isLoading` returns to `false` within bounded time.

**Specific paths to verify:**

| Component | Loading State | Guaranteed Resolution? |
|-----------|--------------|----------------------|
| `useFacets` | `isLoading` state (line 118) | Set to `true` at line 148. Set to `false` in: cache hit (138), response success (210), 400/500 error (168,183,194), catch block (215,221). Check: what if fetch hangs forever (no response, no error)? `AbortController` timeout? |
| `useDebouncedFilterCount` | `isLoading` state | Same pattern — verify all paths set `false` |
| `SearchResultsClient` | `isLoadingMore` state (line 54) | Set in `handleLoadMore`. `finally` block (165-168) resets. Guaranteed. |
| `PersistentMapWrapper` | `isFetchingMapData` state | Set in fetch effects. Verify all paths (success, error, abort) reset to false. |
| SSR page load | Browser loading indicator | Bounded by `statement_timeout = 5000` + SSR timeout. Verify Next.js has SSR timeout config. |

**Audit method:** For each loading state, trace ALL code paths after `setIsLoading(true)`. Verify every path (success, error, abort, timeout, network failure) sets it to `false`. Special attention: does a raw network failure (no response at all) eventually resolve? Only if there's a timeout on the fetch itself (not just the DB query).

---

## Audit Method

### For Each Risk Category:

1. **Static Code Trace** (primary)
   - Read the source file(s) listed in scope
   - Trace execution paths for the specific concern, noting line numbers
   - Document dependency chains and state flows
   - Identify missing guards, missing cleanup, or missing error handling

2. **Dependency Graph Analysis**
   - For re-render risks: list every `useEffect` with its deps and side effects
   - Build a directed graph: `[effect@file:line] --sets--> [state] --deps-of--> [effect@file:line]`
   - Identify any cycle. For each potential cycle, determine termination condition
   - Check: does React state equality check (`Object.is`) prevent infinite updates?

3. **Temporal Sequence Analysis**
   - For race conditions: model concurrent events on a timeline with millisecond-level precision
   - Identify interleaving scenarios that violate invariants
   - Check for proper serialization (AbortController, loading guards, debounce)
   - Verify: last-writer-wins is acceptable, or if strict ordering is needed

4. **Boundary Value Testing**
   - For edge cases: identify boundary inputs and trace through the code
   - Check off-by-one errors in cap/limit logic (e.g., `>=` vs `>` for MAX_ACCUMULATED)
   - Verify error paths handle gracefully (no NaN, no undefined property access, no unhandled rejection)
   - Test falsy value handling: 0, "", null, undefined, NaN, false

5. **Resource Lifecycle Audit**
   - For leaks: match every `create` with a `cleanup`
   - Checklist per resource type:
     - `setTimeout` → `clearTimeout` in effect cleanup
     - `setInterval` → `clearInterval` (or justified permanent interval)
     - `new AbortController` → `.abort()` in effect cleanup
     - `addEventListener` → `removeEventListener` in effect cleanup
     - `ResizeObserver.observe()` → `.disconnect()` in effect cleanup
     - `IntersectionObserver.observe()` → `.disconnect()` in effect cleanup
     - Prisma `$queryRawUnsafe` → connection released (automatic via Prisma)
   - Verify caches are bounded: `maxSize` parameter or TTL expiration

---

## Sample Test Inputs

### Realistic Interactions
| # | Scenario | Inputs | What to Trace |
|---|----------|--------|---------------|
| R1 | Normal search | `q=San Francisco` + price $500-$1500 + WiFi amenity | Full SSR → render → map load → markers display |
| R2 | Filter then paginate | Apply price filter → "Load more" 3 times | Filter commit → remount → cursor reset → 3 pages → dedup |
| R3 | Map pan + search | Pan map east → "Search this area" → wait | Bounds dirty → area count fetch → search → list+map update |
| R4 | Mobile filter flow | Expand bottom sheet → open filters → apply → sheet returns to half | Sheet snap → drawer open → filter change → facets fetch → apply → URL → sheet snap |
| R5 | Back/forward | Search → apply filter → back → forward | URL → state sync → committed vs pending → remount |
| R6 | Long session | Pan map 20+ times, toggle 5+ filters over 30 minutes | Memory usage stable, no leaked timers, caches bounded |

### Race Condition Triggers
| # | Scenario | Inputs | What to Trace |
|---|----------|--------|---------------|
| C1 | Rapid filter toggle | Toggle amenity A, B, C within 100ms each | Debounce coalescing, AbortController chain, cache invalidation |
| C2 | Filter during load | Start search → while loading, change price → apply | SSR abort? Stale results? Key remount? |
| C3 | Double load-more | Click "Load more" rapidly 2 times | `isLoadingRef` guard, cursor consistency |
| C4 | Map pan during SSR | Navigate to /search → immediately pan map | V2 race guard, V1 fallback, data source tracking |
| C5 | Apply + immediate back | Click "Apply" → immediately browser back | `forceSyncUntilRef` behavior, pending state |
| C6 | Apply + Search this area | Click "Apply" on filters while "Search this area" also fires | Concurrent `navigateWithTransition`, URL conflict |
| C7 | Rapid Photon typing | Type "San Francisco" at 50ms/char | `requestIdRef` ordering, abort chain, debounce coalescing |

### Boundary Values
| # | Scenario | Inputs | What to Trace |
|---|----------|--------|---------------|
| B1 | Empty query | `q=` (empty) with no bounds | Unbounded search detection, boundsRequired |
| B2 | SQL injection attempt | `q='; DROP TABLE listings; --` | `assertParameterizedWhereClause`, `plainto_tsquery` sanitization |
| B3 | XSS attempt | `q=<img src=x onerror=alert(1)>` | React JSX escaping, no unsafe innerHTML |
| B4 | Antimeridian | `minLng=170&maxLng=-170&minLat=0&maxLat=10` | `isValidViewport`, `crossesAntimeridian` |
| B5 | Max zoom out | `minLat=-90&maxLat=90&minLng=-180&maxLng=180` | MAX_LAT_SPAN/MAX_LNG_SPAN validation |
| B6 | Exact cap (60) | Paginate to exactly 60 items with cursor available | `reachedCap && nextCursor` → cap message |
| B7 | CJK / IME search | `q=東京マンション` via IME composition | `isComposingRef`, debounce during composition, Photon CJK handling |
| B8 | Price boundaries | `minPrice=0&maxPrice=1000000000` | `MAX_SAFE_PRICE` validation, histogram rendering |
| B9 | 200+ map results | Wide bounds with dense area | MAX_MAP_MARKERS cap, spatial cache merge, rendering perf |
| B10 | Null coordinates | Listing with `lat=null` or `lng=null` | `v2MapDataToListings` filter, Map marker rendering |
| B11 | Coordinate zero | `lat=0&lng=0` (Null Island) | Falsy coordinate handling — verify `0` not rejected |
| B12 | NaN bounds | `minLat=NaN&maxLat=foo` | Input validation, `Number.isNaN` guards |
| B13 | Emoji search | `q=🏠 apartment 🌴` | URL encoding, Photon handling, DB encoding |
| B14 | Very long query | `q=` with 5000 characters | `PHOTON_QUERY_MAX_LENGTH` truncation, DB column limits |

### Failure Modes
| # | Scenario | Simulated Failure | What to Trace |
|---|----------|-------------------|---------------|
| F1 | Supabase down | 5s query timeout on `/api/search/v2` | Error boundary, page.tsx catch, user message |
| F2 | Mapbox tiles down | 403 on tile requests | Map renders but empty, error event handling |
| F3 | Redis down | Upstash connection failure | Geocoding fallback, rate limit fallback |
| F4 | Network offline | `navigator.onLine = false` | useFacets early return, useDebouncedFilterCount behavior |
| F5 | 429 rate limit | `/api/map-listings` returns 429 | Auto-retry with Retry-After, max 1 retry |
| F6 | Slow SSR + fast client | SSR takes 4s, user clicks filter at 2s | Hydration mismatch? Stale UI? |
| F7 | Photon API down | Autocomplete returns 500 or timeout | Error state in LocationSearchInput, form still submittable |
| F8 | Network reconnection | Go offline → open drawer → come back online | Stale facets? Auto-refresh on reconnect? |
| F9 | framer-motion load fail | `domAnimation` chunk fails to load (network) | MobileBottomSheet renders? Falls back? Crashes? |
| F10 | WebGL context lost | GPU driver crash mid-session | Map blank, error boundary catch, recovery possible? |

### Render Performance & Hydration [P0]
| # | Scenario | Inputs | What to Trace |
|---|----------|--------|---------------|
| P1 | Map pan re-render cascade | Pan map 10 times in 5s | Count re-renders in `AppliedFilterChips`, `CategoryBar`, `SortSelect` — all use `useSearchParams()` but don't use bounds. Should be zero re-renders. |
| P2 | Filter toggle re-render scope | Toggle one amenity checkbox | Which of the 22 `useSearchParams()` consumers re-render? Only `useBatchedFilters` should. |
| P3 | SSR/client mismatch vectors | Grep all search components for `Date.now()`, `sessionStorage`, `window.*`, `navigator.*`, `document.*` | Verify each usage is inside `useEffect`, event handler, or `typeof window` guard. Any usage outside these is a hydration mismatch risk. |
| P4 | `effectiveListings` churn | Pan map 5 times, observe `effectiveListings` recalculations | Verify `v2MapData` from context has stable reference when data hasn't changed. Count memo recalculations. |
| P5 | Tab background + foreground | Open search → background tab 30s → foreground | Verify no burst of stale fetches. Check timer coalescence. Verify AbortControllers cancel stale in-flight requests. |
| P6 | Long URL params | Apply 15+ filters simultaneously | Verify URL doesn't exceed browser limits (~2KB safe). Check if `searchParamsString` key causes excessive remounts. |
| P7 | Body scroll lock leak | Open mobile bottom sheet (expanded) → resize to desktop width | Verify `useBodyScrollLock` releases when mobile container is hidden. Desktop scrolling must work. |

### Observability & Recovery
| # | Scenario | Simulated Failure | What to Trace |
|---|----------|-------------------|---------------|
| O1 | Sentry coverage | Trigger `executeSearchV2` error | Verify error reaches Sentry (currently: it doesn't). Check `error.tsx` for `captureException`. |
| O2 | Silent facets failure | Force `/api/search/facets` to return 500 | Verify: error logged? Metric emitted? User sees empty facets — is that acceptable without any indication? |
| O3 | Infinite loading spinner | Kill network after facets fetch starts (mid-flight, no abort) | Verify `isLoading` returns to `false` within bounded time. Check: does raw network failure resolve the fetch promise? |
| O4 | Error recovery without reload | Trigger SSR error → click "Try again" → verify search works | Trace `error.tsx` `reset()` → does it properly re-run SSR? Does state in contexts reset? |
| O5 | Rate limit cascade | Exhaust client-side rate limit via rapid filter toggling | Verify `RateLimitError` is handled. User can still interact. Facets recover after cooldown. |

---

## Success Criteria

Each risk item receives a binary **PASS / FAIL** rating:

| Category | PASS Definition |
|----------|-----------------|
| **1. Infinite Loops** | No `useEffect` dependency chain can create a cycle. Every loop has a bounded termination condition. No effect can trigger itself. Spring animations resolve to stable targets. ResizeObserver churn is bounded. |
| **2. Race Conditions** | Every concurrent operation is either serialized (AbortController), idempotent (dedup guard), or has a last-writer-wins policy that preserves consistency. No stale data can overwrite fresh data. Concurrent navigations produce a valid final state. |
| **3. Resource Leaks** | Every `setTimeout` has a matching `clearTimeout` in cleanup. Every `setInterval` is either permanent-by-design (module-level) or has a `clearInterval`. Every `AbortController` is aborted on unmount. Every event listener has a removal path. Every observer has a disconnect path. Caches are bounded (max entries AND TTL). |
| **4. Timeout & Error** | Every external call (Supabase, Mapbox, Photon, Radar) has a timeout, a catch, and a user-facing degradation path. No unhandled promise rejections. No silent failures that leave UI in permanent loading state. Rate limit exhaustion degrades gracefully. |
| **5. Edge Cases** | Zero results render meaningfully. Special characters don't cause errors or injection. Boundary coordinates are validated (including 0, NaN, antimeridian). Pagination cap works correctly. IME composition doesn't trigger wasted requests. Large result sets are bounded. |
| **6. State Sync** | URL is always source of truth. Filter state syncs on drawer open. Map bounds sync on navigation. Back/forward restores correct state. Mobile/desktop state doesn't leak (body scroll lock released on viewport change). Concurrent transitions produce valid final state. |
| **7. Render Performance & Hydration** | `useSearchParams()` consumers that don't use bounds params do NOT re-render on bounds-only changes (or have memo guards that prevent wasted computation). No SSR/hydration mismatches — all `Date.now()`, `sessionStorage`, `window.*` usages are client-only. `effectiveListings` memo enforces `MAX_MAP_MARKERS` cap after merge. Tab backgrounding doesn't cause fetch bursts on restore. |
| **8. Observability & Error Recovery** | Every `console.error` in search-critical paths has a corresponding `Sentry.captureException` (or structured error reporting). Every error state has a user-recoverable path (retry button, auto-recovery, or clear guidance). No loading state can get permanently stuck — every `setIsLoading(true)` has a bounded resolution path covering success, error, abort, and network failure. |

**Overall verdict:** STABLE if all 8 categories PASS. UNSTABLE if any category FAILS. Each FAIL must include:
- Specific file path and line number
- Root cause description
- Suggested fix (code-level)
- Priority tier (P0/P1/P2/P3)
- Estimated blast radius (how many users would be affected under what conditions)
