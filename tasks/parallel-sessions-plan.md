# Search Page Stability Fixes — 5-Session Parallel Execution Plan

## Setup: Git Worktrees (run ONCE before starting sessions)

```bash
# From your main repo directory:
git worktree add ../roomshare-s1-filters -b fix/search-filters-pipeline
git worktree add ../roomshare-s2-validation -b fix/search-validation-consistency
git worktree add ../roomshare-s3-map -b fix/search-map-stale-data
git worktree add ../roomshare-s4-searchdoc -b fix/search-doc-dirty-wiring
git worktree add ../roomshare-s5-resilience -b fix/search-resilience-dedup

# Install deps in each worktree:
cd ../roomshare-s1-filters && pnpm i
cd ../roomshare-s2-validation && pnpm i
cd ../roomshare-s3-map && pnpm i
cd ../roomshare-s4-searchdoc && pnpm i
cd ../roomshare-s5-resilience && pnpm i
```

Then open one Claude Code session per worktree directory.

## Merge Order (sequential, after all sessions complete)

```
s4 (search-doc wiring) → s2 (validation) → s1 (filters) → s3 (map) → s5 (resilience)
```

s4 first because it's the most isolated (backend-only, no shared files).
s5 last because it touches hooks that other sessions also touch.

---

## Session 1: Filter Pipeline — `../roomshare-s1-filters`

**Branch:** `fix/search-filters-pipeline`

### Prompt to paste into Session 1:

```
/rs-ship Implement useBatchedFilters fully and unify filter count requests

## Context
`useBatchedFilters` at src/hooks/useBatchedFilters.ts is a stub (line 38 says "full implementation pending"). All filter UI must go through this single hook for pending→committed state flow.

## Tasks

1. **Implement useBatchedFilters** (src/hooks/useBatchedFilters.ts)
   - Initialize pending state from current URL search params
   - Track dirty vs committed state (isDirty = pending differs from URL)
   - `setPending(values)` updates local pending state
   - `commit()` writes pending state to URL via SearchTransitionContext.navigateWithTransition
   - `reset()` restores pending to match current committed URL state
   - Must handle all filter types: price range, amenities, houseRules, languages, roomType, genderPreference, householdGender, moveInDate, leaseDuration, nearMatches

2. **Wire filter UI to use it** — update FilterModal.tsx and any filter components that currently write directly to URL to instead go through useBatchedFilters

3. **Consolidate count fetching** — useDebouncedFilterCount (src/hooks/useDebouncedFilterCount.ts) and useFilterImpactCount (src/hooks/useFilterImpactCount.ts) should read pending state from useBatchedFilters when drawer is open, not from URL

4. **Tests** — add unit tests for:
   - pending state initialization from URL
   - isDirty correctly computed
   - commit() writes to URL
   - reset() restores committed state
   - rapid setPending calls don't race

## Files to touch
- src/hooks/useBatchedFilters.ts (main implementation)
- src/hooks/useDebouncedFilterCount.ts (read pending from batched)
- src/hooks/useFilterImpactCount.ts (read pending from batched)
- src/components/search/FilterModal.tsx (wire to batched hook)
- src/__tests__/hooks/useBatchedFilters.test.ts (new)

## Do NOT touch
- Any map components
- Any API routes
- SearchV2DataContext
- MapBoundsContext

## Verification
- pnpm lint && pnpm typecheck && pnpm test
```

### Skills & Agents to use:
- `/rs-ship` (end-to-end Roomshare feature)
- Uses: `feature-dev:code-architect` → `backend-development:tdd-orchestrator`
- Agent: `code-reviewer` after implementation

---

## Session 2: Validation Consistency — `../roomshare-s2-validation`

**Branch:** `fix/search-validation-consistency`

### Prompt to paste into Session 2:

```
/rs-ship Fix inverted range handling inconsistency between filter-schema.ts and search-params.ts

## Context
Two validation systems handle inverted lat bounds differently:
- filter-schema.ts (normalizeFilters) SWAPS inverted lat silently (lines 246-249)
- search-params.ts (parseSearchParams) THROWS on inverted lat (lines 354-361, P1-3 fix)

Price inversion: both THROW correctly (consistent).
Lng inversion: both PRESERVE correctly (antimeridian support).

The lat behavior must be unified. Since P1-3 was an intentional fix to make lat consistent with price, filter-schema.ts should also THROW on inverted lat.

## Tasks

1. **Fix filter-schema.ts** (src/lib/filter-schema.ts lines 246-249)
   - Change lat swap to throw: `if (minLat > maxLat) throw new Error('minLat cannot exceed maxLat')`
   - Keep the lng comment about antimeridian crossing

2. **Update filter-schema tests** (src/__tests__/lib/filter-schema.test.ts)
   - Change the "swaps inverted lat" test (line 425-431) to expect a throw instead
   - Add test: inverted lng is preserved (antimeridian)
   - Add test: normal lat bounds pass through unchanged

3. **Add client-side normalization** — in buildSearchUrl (src/lib/search-utils.ts) and wherever map bounds are written to URL, ensure minLat < maxLat before writing. The client should prevent invalid URLs rather than relying on server throws.

4. **Unify unbounded query handling across endpoints**
   - Document the contract: v2 returns 200 + unboundedSearch flag, facets returns 400, count returns 200 + boundsRequired flag
   - Add a shared constant or utility that all three endpoints reference for the "needs bounds" logic

## Files to touch
- src/lib/filter-schema.ts
- src/__tests__/lib/filter-schema.test.ts
- src/lib/search-utils.ts (buildSearchUrl normalization)
- src/lib/search-params.ts (add shared bounds-required helper)

## Do NOT touch
- Any React components
- Any hooks
- MapBoundsContext
- API route handlers (just the shared lib they call)

## Verification
- pnpm lint && pnpm typecheck && pnpm test
- Run: pnpm test -- --grep "filter-schema" --grep "search-params"
```

### Skills & Agents to use:
- `/rs-ship` (end-to-end Roomshare feature)
- Uses: `feature-dev:code-explorer` → `backend-development:tdd-orchestrator`
- Agent: `debugger` for root cause tracing

---

## Session 3: Map Stale Data & nearMatches — `../roomshare-s3-map`

**Branch:** `fix/search-map-stale-data`

### Prompt to paste into Session 3:

```
/rs-ship Fix V2 map stale data protection and nearMatches desync between list and map

## Context
Two issues:

### Issue A: MAP_RELEVANT_KEYS missing nearMatches
PersistentMapWrapper.tsx (lines 50-68) defines MAP_RELEVANT_KEYS with 17 params but excludes `nearMatches`. SearchV2DataContext's FILTER_RELEVANT_KEYS (line 18-31) DOES include nearMatches. This means toggling nearMatches updates the list but the map doesn't refetch, causing list/map desync.

### Issue B: V2 stale protection and bounds
SearchV2DataContext intentionally excludes bounds from filter-relevant params (map panning shouldn't invalidate v2 data). This is correct for filter changes. BUT rapid map panning can cause out-of-order responses. The version guard exists but V2MapDataSetter (line 27) doesn't pass version param when calling setV2MapData.

## Tasks

1. **Add nearMatches to MAP_RELEVANT_KEYS** (src/components/PersistentMapWrapper.tsx)
   - Add "nearMatches" to the MAP_RELEVANT_KEYS array

2. **Fix V2MapDataSetter to pass version** (src/components/search/V2MapDataSetter.tsx)
   - When calling setV2MapData, pass the current dataVersion from context
   - This ensures version guard actually works for rapid navigations

3. **Add SearchMapUIProvider to layout** (src/app/search/layout.tsx)
   - SearchMapUIProvider is implemented but not wired into the layout (only in tests)
   - Wrap it around SearchLayoutView inside the existing provider stack
   - This enables the card→map focus flow

4. **Tests**
   - Test: changing nearMatches triggers map refetch
   - Test: V2MapDataSetter version guard rejects stale data
   - Test: SearchMapUIProvider nonce dedup works in layout

## Files to touch
- src/components/PersistentMapWrapper.tsx (add nearMatches to keys)
- src/components/search/V2MapDataSetter.tsx (pass version)
- src/app/search/layout.tsx (add SearchMapUIProvider)
- src/contexts/SearchMapUIContext.tsx (verify, no changes expected)
- Tests for above

## Do NOT touch
- filter-schema.ts or search-params.ts
- useBatchedFilters
- API routes
- MapBoundsContext state logic

## Verification
- pnpm lint && pnpm typecheck && pnpm test
```

### Skills & Agents to use:
- `/rs-ship` (end-to-end Roomshare feature)
- Uses: `feature-dev:code-architect` → `frontend-design:frontend-design` for context wiring
- Agent: `code-reviewer` after implementation

---

## Session 4: Search Doc Dirty Wiring — `../roomshare-s4-searchdoc`

**Branch:** `fix/search-doc-dirty-wiring`

### Prompt to paste into Session 4:

```
/rs-ship Wire up markListingDirty() calls in production code — the dirty flag pipeline is disconnected

## Context
CRITICAL BUG: markListingDirty() and markListingsDirty() in src/lib/search/search-doc-dirty.ts are fully implemented but NEVER CALLED in production code. Only test files import them. This means the cron job (api/cron/refresh-search-docs) processes an empty queue, and listing_search_docs never gets refreshed after initial backfill.

## Tasks

1. **Find all listing mutation points** — search for places where listings are created, updated, deleted, status changed. Look in:
   - src/app/api/listings/ (CRUD routes)
   - src/actions/ (server actions)
   - Any service layer that mutates Listing table

2. **Add markListingDirty() calls** after each mutation:
   - Listing created → markListingDirty(id, 'listing_created')
   - Listing updated → markListingDirty(id, 'listing_updated')
   - Status changed → markListingDirty(id, 'status_changed')
   - Review created/updated/deleted → markListingDirty(listingId, 'review_changed')
   - View count increment → markListingsDirty([id], 'view_count') (batch, lower priority)

3. **Ensure fire-and-forget pattern** — markListingDirty errors must NOT fail the parent mutation. Wrap in try-catch or use .catch(() => {}) pattern. The function already logs errors internally.

4. **Add integration test** — create a test that:
   - Creates a listing
   - Verifies dirty flag is set
   - Calls the cron endpoint
   - Verifies search doc is created/updated
   - Verifies dirty flag is cleared

## Files to touch
- src/app/api/listings/route.ts (or wherever listing CRUD lives)
- src/app/api/listings/[id]/route.ts
- Any server actions that mutate listings
- Any review mutation handlers
- src/__tests__/integration/search-doc-dirty-integration.test.ts (new)

## Do NOT touch
- search-doc-dirty.ts itself (already correct)
- The cron route (already correct)
- Any frontend components
- Any search hooks or contexts

## Verification
- pnpm lint && pnpm typecheck && pnpm test
- Verify: grep -r "markListingDirty\|markListingsDirty" src/ --include="*.ts" --include="*.tsx" | grep -v test | grep -v __tests__
  (should show multiple production call sites)
```

### Skills & Agents to use:
- `/rs-ship` (end-to-end Roomshare feature)
- Uses: `feature-dev:code-explorer` (find mutation points) → `backend-development:backend-architect` → `backend-development:tdd-orchestrator`
- Skill: `roomshare-db-migrations` if schema changes needed

---

## Session 5: Resilience & Dedup — `../roomshare-s5-resilience`

**Branch:** `fix/search-resilience-dedup`

### Prompt to paste into Session 5:

```
/rs-ship Fix rate limit resilience, consolidate duplicate hooks, and add unified 429 handling

## Context
Three issues to fix:

### Issue A: Duplicate network status hooks
useNetworkStatus (src/hooks/useNetworkStatus.ts) and useOnlineStatus (src/hooks/useOnlineStatus.ts) do the same thing with different return types. Consolidate.

### Issue B: No unified 429/rate-limit handling
When Redis is down, all search endpoints return 429 (fail-closed). There's no coordinated client-side response — each hook handles errors independently. Need a shared rate-limit-aware fetch utility.

### Issue C: Slow transition UX lacks degradation
SearchTransitionContext flags slow transitions after 6s but doesn't disable background fetches or offer retry actions.

## Tasks

1. **Consolidate network hooks**
   - Keep useNetworkStatus (more flexible API: {isOnline, isOffline})
   - Update OfflineIndicator (src/components/OfflineIndicator.tsx or similar) to use useNetworkStatus instead of useOnlineStatus
   - Delete useOnlineStatus.ts
   - Update all imports

2. **Create shared rate-limit-aware fetch** (src/lib/rate-limit-client.ts, new file)
   - Wraps fetch with:
     - Parse Retry-After header from 429 responses
     - Shared backoff state (module-level, not per-component)
     - isThrottled() check that other hooks can call before fetching
   - Wire into: useDebouncedFilterCount, useFilterImpactCount, useFacets, MapBoundsContext area count

3. **Improve slow transition UX** (src/contexts/SearchTransitionContext.tsx)
   - When isSlowTransition=true, expose a `retryLastNavigation()` callback
   - Components can show "Still loading... [Retry]" instead of just a spinner

4. **Tests**
   - Test: useNetworkStatus returns correct state
   - Test: rate-limit-client respects Retry-After
   - Test: isThrottled prevents fetch when in backoff
   - Test: slow transition retry works

## Files to touch
- src/hooks/useNetworkStatus.ts (keep, verify)
- src/hooks/useOnlineStatus.ts (DELETE)
- src/components/ (update imports from useOnlineStatus)
- src/lib/rate-limit-client.ts (NEW)
- src/hooks/useDebouncedFilterCount.ts (use rate-limit-client)
- src/hooks/useFilterImpactCount.ts (use rate-limit-client)
- src/hooks/useFacets.ts (use rate-limit-client)
- src/contexts/SearchTransitionContext.tsx (retry on slow)

## Do NOT touch
- API routes
- filter-schema.ts or search-params.ts
- useBatchedFilters (Session 1 owns this)
- Map components (Session 3 owns these)
- search-doc-dirty.ts (Session 4 owns this)

## Verification
- pnpm lint && pnpm typecheck && pnpm test
```

### Skills & Agents to use:
- `/rs-ship` (end-to-end Roomshare feature)
- Uses: `feature-dev:code-explorer` → `backend-development:backend-architect` → `backend-development:tdd-orchestrator`
- Agent: `code-reviewer` for final review

---

## File Ownership Matrix (NO OVERLAPS)

| File | S1 | S2 | S3 | S4 | S5 |
|------|----|----|----|----|-----|
| useBatchedFilters.ts | ✏️ | | | | |
| useDebouncedFilterCount.ts | ✏️ | | | | ✏️* |
| useFilterImpactCount.ts | ✏️ | | | | ✏️* |
| useFacets.ts | | | | | ✏️ |
| FilterModal.tsx | ✏️ | | | | |
| filter-schema.ts | | ✏️ | | | |
| search-params.ts | | ✏️ | | | |
| search-utils.ts | | ✏️ | | | |
| PersistentMapWrapper.tsx | | | ✏️ | | |
| V2MapDataSetter.tsx | | | ✏️ | | |
| search/layout.tsx | | | ✏️ | | |
| search-doc-dirty.ts | | | | (read) | |
| listings API routes | | | | ✏️ | |
| useNetworkStatus.ts | | | | | ✏️ |
| useOnlineStatus.ts | | | | | ❌ |
| rate-limit-client.ts | | | | | ✏️ |
| SearchTransitionContext.tsx | | | | | ✏️ |

*S5 touches count hooks for rate-limit integration. If S1 finishes first, S5 rebases. If concurrent, S5 only adds the rate-limit check import — doesn't change pending-state logic.

## Post-Merge Checklist

After merging all 5 branches (in order: s4→s2→s1→s3→s5):

```bash
cd /mnt/d/Documents/roomshare
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e  # if available
```

Then run `/rs-review` on the combined diff to catch integration issues.
