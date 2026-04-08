# Map Performance Plan: Make Search Feel Instant Like Airbnb

**Status:** Unanimously approved by 4-agent team (2026-04-06)
**Total cost:** $0/month additional
**Target:** Map-move search ~1200ms -> ~350ms (71% faster)

---

## Problem

Every map pan triggers `router.replace()` in `Map.tsx:2549-2573`, causing:
1. Full SSR re-execution of `page.tsx` (server component)
2. DB query via `executeSearchV2()` (~80-150ms)
3. Full HTML generation + streaming
4. `SearchResultsClient` remount (keyed by `normalizedKeyString`, page.tsx:432)

**Total: ~1200ms typical (range 800-2500ms)**

Meanwhile, map markers via `PersistentMapWrapper` already use client-side fetch
to `/api/map-listings` and complete in ~200-400ms. The solution: apply the same
pattern to listing results.

---

## Implementation Steps

### Step 1: Feature Flag + API Route (LOW risk, no dependencies)

**Files:**
- `src/lib/env.ts` — add `clientSideSearch` getter (~line 502)
- `src/app/api/search/listings/route.ts` — NEW file

**Details:**
- Feature flag: `ENABLE_CLIENT_SIDE_SEARCH` env var, default off
- API route mirrors `/api/map-listings/route.ts` pattern (proven, 185 lines)
- Calls `executeSearchV2({ rawParams, includeMap: false })` with circuit breaker + timeout
- V1 fallback via `getListingsPaginated` (same as page.tsx:317-325)
- Returns `{ items, nextCursor, total, nearMatchExpansion, vibeAdvisory }`
- CDN headers: `Cache-Control: public, s-maxage=60, max-age=30, stale-while-revalidate=120`
- Rate limited: `withRateLimitRedis` type `"search-list"` (separate bucket)

### Step 2: Client-Side Fetch in SearchResultsClient (MEDIUM risk, depends on Step 1)

**Files:**
- `src/components/search/SearchResultsClient.tsx` — add `useSearchParams()` listener + fetch logic
- `src/app/search/page.tsx` — pass `clientSideSearchEnabled` prop

**Details:**
- When feature flag enabled, add `useSearchParams()` to detect URL changes
- Track `previousBoundsRef` to detect bounds-only changes (map pans)
- On bounds change: fetch `/api/search/listings?${params}` with AbortController
- Cancel in-flight request on new bounds (same pattern as PersistentMapWrapper:905-911)
- On success: replace listings state in-place (no remount), reset cursor/pagination
- Stale-while-revalidate: keep old listings visible with 60% opacity during fetch
- `initialDataFingerprint` logic (lines 112-130) already handles data changes without remounting

**Expected:** ~200-400ms (API JSON) vs ~800-1500ms (SSR HTML)

### Step 3: replaceState in executeMapSearch (MEDIUM risk, depends on Step 2)

**Files:**
- `src/components/Map.tsx` — modify `executeMapSearch` (~lines 2549-2573)

**Details:**
When feature flag enabled:
```ts
// Before (triggers SSR):
transitionContext.replaceWithTransition(url);
// After (URL-only update, no SSR):
window.history.replaceState(null, '', url);
```

- `useSearchParams()` in SearchResultsClient + PersistentMapWrapper react to URL change
- Verified: Next.js patches `replaceState` to sync hooks. Does NOT trigger SSR.
- When flag OFF: unchanged behavior

### Step 4: Stale-While-Revalidate Loading UX (LOW risk, depends on Steps 2-3)

**Files:**
- `src/components/search/SearchResultsClient.tsx` — add loading states
- `src/components/search/SearchResultsLoadingWrapper.tsx` — coordinate with client fetch

**Details:**
- During client fetch: old listings at 60% opacity + 3px loading bar at top
- No skeleton flash, no blank state, no remount flicker
- Crossfade: new listings fade in (200ms `transition: opacity 0.2s ease-out`)
- Count header: "Updating..." while fetching, then new count
- aria-live announcement: "Updating search results"
- Respect `prefers-reduced-motion`

**Perceived latency: 0ms** (old content visible, new content fades in)

### Step 5: Filter Changes via Client Fetch (LOW risk, after Steps 1-4 validated)

**Files:**
- `src/components/search/InlineFilterStrip.tsx`
- Filter modal components that call `navigateWithTransition()`

**Details:**
- Same pattern: `window.history.replaceState` + client fetch
- Same API route (`/api/search/listings`)
- Only after Steps 1-4 validated in production

---

## What Stays Unchanged

- Initial page load: SSR (SEO + fast first paint)
- `generateMetadata()`: server-side SEO
- `PersistentMapWrapper` + `/api/map-listings`: already optimal
- `layout.tsx` structure
- `fetchMoreListings` server action ("Load More" pagination)
- V2/V1 fallback chain

---

## Expected Results

| Metric                    | Current (SSR)       | After Plan       | Improvement     |
|---------------------------|---------------------|------------------|-----------------|
| Map-move search (e2e)     | ~1200ms typical     | ~350ms typical   | 71% faster      |
| Perceived wait            | 600-1500ms          | 0ms              | Instant feel    |
| Server CPU per map-pan    | Full SSR render     | JSON API response| ~70% less work  |
| CDN cache for list data   | 0% (dynamic SSR)    | High (s-maxage=60)| Repeated ~50ms |
| Filter change latency     | ~800ms (SSR)        | ~300ms (API)     | 62% faster      |
| Monthly cost              | $0 (Hobby)          | $0 (Hobby)       | $0 additional   |

---

## Rollback

Single env var: `ENABLE_CLIENT_SIDE_SEARCH=false` reverts to full SSR. Zero code changes.

---

## Verification Checklist

- [ ] Unit test: `/api/search/listings` route (bounds, rate limit, fallback, CDN headers)
- [ ] Unit test: SearchResultsClient client-side fetch (mock API, no remount, AbortController)
- [ ] Integration: Map pan with flag ON -> no SSR request in network log
- [ ] Integration: Map pan with flag OFF -> SSR still works
- [ ] E2E: Full map-move flow -> latency < 500ms
- [ ] SEO: Crawl `/search?where=NYC` -> full HTML with listings
- [ ] Feature flag toggle: clean revert

---

## Approved By

- architect: APPROVED (evidence-backed, incremental, feature-flagged, zero-cost)
- client-perf: APPROVED (replaceState eliminates SSR, AbortController race protection proven)
- backend-db: APPROVED (API route reuses executeSearchV2 + circuit breaker, CDN reduces DB load)
- ux-cost: APPROVED ($0 cost, net reduction in server load, stale-while-revalidate UX)
