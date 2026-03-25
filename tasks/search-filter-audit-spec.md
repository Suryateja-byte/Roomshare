# Search & Filter System — Behavioral Specification Document

## Phase 0 Summary

**Complete File Manifest**: 129 production files, ~33,636 lines of code.
**Test Files**: ~90 test files, ~70,000+ lines of test code.

### Dual-Page Verification

| Aspect | Homepage (`/`) | Search Page (`/search`) |
|--------|---------------|----------------------|
| Entry | `page.tsx` → `HomeClient.tsx` → lazy `SearchForm` | `layout.tsx` → 7 context providers → `page.tsx` (RSC) |
| SearchForm variant | `default` | `default` (in `SearchHeaderWrapper`) |
| Context providers | NONE (no search contexts wrapping SearchForm) | SearchTransition, FilterState, MobileSearch, MapBounds, ActivePanBounds, ListingFocus, SearchV2Data |
| Map | No map | PersistentMapWrapper via SearchLayoutView |
| Filter chips | No | Yes (AppliedFilterChips in page.tsx) |
| Results | No results (navigates to /search) | SSR results + client infinite scroll |

**DIVERGENCE RISK D-0**: SearchForm on Homepage calls `useSearchTransitionSafe()` which returns `null` — so `transitionContext?.navigateWithTransition(searchUrl)` is null, falling through to `router.push(searchUrl)`. This means Homepage search uses `router.push` while Search Page uses `navigateWithTransition` (wraps in `startTransition`). Different navigation strategies for the same component.

**DIVERGENCE RISK D-1**: `useBatchedFilters` on Homepage runs without `FilterStateProvider` — but it uses `useSearchParams()` and `useRouter()` directly, not context. This is safe because committed state derives from URL, which exists on both pages. However, `isDrawerOpen` defaults to `false` and has no provider to set it.

---

## 1. USER STORIES (Exhaustive)

### US-1: User types in search bar on Homepage
1. User focuses the "Where" field → `LocationSearchInput` renders dropdown portal
2. Each keystroke sets `location` state, clears `selectedCoords` (SearchForm:981-983)
3. `isUserTypingLocationRef` set to `true` to prevent URL sync from overwriting input (SearchForm:981)
4. After 3+ chars with no dropdown selection: `handleSearch` shows location-warning banner (SearchForm:456-468)
5. If user selects from dropdown: `handleLocationSelect` fires → `flushSync` sets coords → dispatches `MAP_FLY_TO_EVENT` → calls `formRef.current.requestSubmit()` (SearchForm:326-354)
6. Form submit → `handleSearch` builds URL params → `router.push(/search?...)` (Homepage has no transition context)
7. Debounce: 300ms via `searchTimeoutRef` with navigation version counter for race protection (SearchForm:626-646)

### US-2: User types in search bar on Search Page
1-5: Same as US-1 (shared SearchForm component)
6. Form submit → `handleSearch` builds URL params → `transitionContext.navigateWithTransition(searchUrl)` wraps in React `startTransition` (SearchForm:634-638)
7. SearchTransitionContext sets `isPending=true` → SearchResultsLoadingWrapper shows overlay
8. Server re-renders `page.tsx` with new params → new SSR results
9. `SearchResultsClient` receives new `key={normalizedKeyString}` → remounts → resets cursor/pagination

### US-3: User applies a filter (via FilterModal)
1. User clicks "Filters" button → `setShowFilters(true)` (SearchForm:181)
2. FilterModal renders with `pending` state from `useBatchedFilters`
3. User changes a filter → `setPending({...})` updates pending state only
4. `useDebouncedFilterCount` fetches count preview from `/api/search-count` with 300ms debounce
5. User clicks "Show N listings" → `commitFilters()` calls `useBatchedFilters.commit()`
6. `commit()` builds URLSearchParams from pending state → navigates via `transitionContext.navigateWithTransition` or `router.push`
7. URL updates → server re-renders page.tsx → results update

### US-4: User removes a filter via chip
1. `AppliedFilterChips` reads committed state from URL via `urlToFilterChips()`
2. User clicks X on chip → `handleRemove` calls `removeFilterFromUrl(searchParams, chip)`
3. `router.push` with updated params inside `startTransition`
4. Server re-renders with new params

### US-5: User clears all filters
1. Two paths: FilterModal "Clear all" button or AppliedFilterChips "Clear all"
2. Both use `clearAllFilters()` from filter-chip-utils.ts
3. `clearAllFilters` preserves: q, lat, lng, bounds, sort (PRESERVED_PARAMS)
4. Deletes: all filter params (price, amenities, roomType, leaseDuration, etc.)
5. Navigates to new URL

### US-6: User applies multiple filters simultaneously
- Filters are ANDed (all must match). Each filter narrows the result set.
- Array filters (amenities, houseRules, languages): items within same array are ORed (any match)
- Cross-category: ANDed (must match ALL selected categories)

### US-7: User navigates away and comes back
- Search state is URL-based → browser back/forward restores state
- `useBatchedFilters` syncs pending from URL via `readFiltersFromURL(searchParams)` (useBatchedFilters:218-221)
- `SearchResultsClient` detects fingerprint change → resets extra listings (SearchResultsClient:107-116)
- Recent searches stored in localStorage (useRecentSearches hook)

### US-8: User shares URL with search params
- All filter state is in URL params → recipient sees same filters
- Server-side `parseSearchParams(rawParams)` validates all params against allowlists
- Same DB query, same results (deterministic for same params + data)

### US-9: User hits Enter vs clicks suggestion
- **Enter without selection**: `handleSearch` prevents submission if `location.trim().length > 2 && !selectedCoords` (SearchForm:456)
- **Click suggestion**: `handleLocationSelect` sets coords → `requestSubmit()` → `handleSearch` with valid coords

### US-10: Mobile vs Desktop differences
- **Mobile**: CollapsedMobileSearch shown when scrolled, MobileSearchOverlay for full search, MobileBottomSheet for results
- **Desktop**: CompactSearchPill when scrolled, full SearchForm in header, side-by-side map+list
- SearchForm: `variant` prop controls compact mode; focus-triggered flex expansion (SearchForm:876-884)

### US-11: Edge cases
- **Empty search**: Allowed without location (browseMode) — shows capped results
- **Special characters**: `sanitizeSearchQuery` strips SQL injection chars, control chars, normalizes Unicode (search-types:160-196)
- **Long input**: Truncated to `MAX_QUERY_LENGTH` (search-params:352-354)
- **XSS payloads**: React auto-escapes JSX; server uses parameterized queries
- **Malformed URL params**: `parseSearchParams` validates everything — invalid values silently dropped

---

## 2. DATA FLOW MAP

### US-1/US-2: Search Submission Flow
```
User types location
  → LocationSearchInput.onChange (SearchForm:980-984)
    → setLocation(value) [React state]
    → setSelectedCoords(null) [clears stale coords]
    → isUserTypingLocationRef.current = true

User selects from dropdown
  → LocationSearchInput.onLocationSelect
    → handleLocationSelect (SearchForm:326-354)
      → flushSync: setSelectedCoords({lat, lng, bbox})
      → window.dispatchEvent(MAP_FLY_TO_EVENT)
      → formRef.current.requestSubmit()

Form submit
  → handleSearch (SearchForm:403-661)
    → parseNaturalLanguageQuery (if no coords) [search/natural-language-parser.ts]
    → Build URLSearchParams from:
      - pending.minPrice/maxPrice (SearchForm:536-563)
      - committed.* for modal filters (SearchForm:572-586)
      - selectedCoords → lat/lng (SearchForm:567-570)
      - whatQuery (semantic search) (SearchForm:521-530)
    → Delete pagination params (SearchForm:482-486)
    → Clear stale filter params (SearchForm:490-506)
    → Debounce 300ms + navigation version check (SearchForm:626-646)
    → Navigate:
      Homepage: router.push(searchUrl)
      Search:   transitionContext.navigateWithTransition(searchUrl)

Server renders /search/page.tsx
  → parseSearchParams(rawParams) [search-params.ts:348-534]
    → Validates ALL params against allowlists
    → Returns: q, filterParams, requestedPage, sortOption, boundsRequired, browseMode
  → executeSearchV2 OR getListingsPaginated
    → DB query with validated params
  → Returns SSR HTML with SearchResultsClient

Client hydration
  → SearchResultsClient key={normalizedKeyString}
    → Remounts on filter/sort/bounds change
    → seenIdsRef deduplicates listings
    → MAX_ACCUMULATED=60 cap
```

### US-3: Filter Application Flow
```
User opens FilterModal
  → setShowFilters(true) (SearchForm:181)
  → useBatchedFilters drawerJustOpened branch (useBatchedFilters:232-268)
    → Merges committed URL state with pending edits

User changes filter
  → setPending({key: value}) (useBatchedFilters:324-337)
  → isDirty = !filtersEqual(pending, committed) (useBatchedFilters:319-322)
  → useDebouncedFilterCount triggers 300ms debounce fetch to /api/search-count

User clicks "Show N listings"
  → commitFilters() → useBatchedFilters.commit() (useBatchedFilters:343-413)
    → Build URLSearchParams from pending state
    → Delete pagination + old filter params
    → Navigate via transitionContext or router.push
  → forceSyncUntilRef set for 10s (useBatchedFilters:347-348)
  → URL updates → server re-renders
```

---

## 3. STATE INVENTORY

### React State
| State | Component | File:Line | Purpose |
|-------|-----------|-----------|---------|
| `location` | SearchForm | SearchForm:151-153 | Text in location input |
| `selectedCoords` | SearchForm | SearchForm:205-209 | Lat/lng from dropdown selection |
| `whatQuery` | SearchForm | SearchForm:160 | Semantic search text |
| `showFilters` | SearchForm | SearchForm:181 | Filter drawer open/closed |
| `isSearching` | SearchForm | SearchForm:244 | Debounce guard |
| `geoLoading` | SearchForm | SearchForm:210 | Geolocation in progress |
| `pending` | useBatchedFilters | useBatchedFilters:224 | Uncommitted filter values |
| `extraListings` | SearchResultsClient | SearchResultsClient:58 | Load-more accumulated listings |
| `nextCursor` | SearchResultsClient | SearchResultsClient:59-61 | Pagination cursor |
| `isLoadingMore` | SearchResultsClient | SearchResultsClient:62 | Load-more spinner |

### URL State (source of truth for filters)
- `q`, `what`, `lat`, `lng`, `minLat/maxLat/minLng/maxLng` (location + bounds)
- `minPrice`, `maxPrice`, `amenities`, `moveInDate`, `leaseDuration`
- `houseRules`, `languages`, `roomType`, `genderPreference`, `householdGender`
- `minSlots`, `bookingMode`, `nearMatches`, `sort`, `cursor`, `page`

### Context State
| Context | Provider Location | Key State |
|---------|------------------|-----------|
| SearchTransitionContext | search/layout.tsx | isPending, isSlowTransition |
| FilterStateContext | search/layout.tsx | isDirty, changeCount, isDrawerOpen |
| MobileSearchContext | search/layout.tsx | isExpanded, openFilters callback |
| MapBoundsContext | search/layout.tsx | hasUserMoved, boundsDirty, searchAsMove, areaCount |
| ActivePanBoundsContext | search/layout.tsx | activePanBounds for map |
| ListingFocusContext | search/layout.tsx | hoveredListingId, selectedListingId |
| SearchV2DataContext | search/layout.tsx | v2MapData, isV2Enabled, dataVersion |

### Derived State
- `committed` in useBatchedFilters: derived from `readFiltersFromURL(searchParams)` — risk of staleness if URL and pending diverge
- `isDirty` in useBatchedFilters: `!filtersEqual(pending, committed) && !transitionContext?.isPending`
- `activeFilterCount` in SearchForm: computed from committed state
- `normalizedKeyString` in page.tsx: canonical filter+sort+bounds key for SearchResultsClient remount

---

## 4. SHARED vs DIVERGENT CODE MAP

| Feature | Homepage Implementation | Search Page Implementation | Shared? | Divergence Risk |
|---------|----------------------|--------------------------|---------|-----------------|
| SearchForm component | Lazy-loaded, default variant | In SearchHeaderWrapper, default variant | YES | LOW — same component |
| Navigation on submit | `router.push()` (no transition context) | `transitionContext.navigateWithTransition()` | NO | **MEDIUM** — D-0 |
| Filter contexts | Not wrapped in any context | Wrapped in 7 providers | NO | **HIGH** — D-1: useBatchedFilters works but filter drawer state has no context to broadcast to |
| LocationSearchInput | Works standalone | Works with map fly-to coordination | YES | LOW |
| Filter modal | Can open (showFilters state is local) | Can open with full context support | YES | **MEDIUM** — filter count/facets fetch works via API but no transition feedback |
| URL building | Same handleSearch logic | Same handleSearch logic | YES | LOW |
| Recent searches | localStorage via useRecentSearches | Same hook | YES | LOW |
| Keyboard shortcuts | useKeyboardShortcuts runs | Same | YES | LOW |

---

## 5. INVARIANTS

1. **INV-1 (URL = UI)**: Filter state displayed in UI must always match URL search params. No stale UI showing filters that aren't in the URL.
2. **INV-2 (URL = API)**: Search API must receive the exact same parameters the URL contains. No transformation loss between URL and API call.
3. **INV-3 (Idempotent parse)**: `parseSearchParams(buildRawParamsFromSearchParams(url))` must be idempotent — parse→serialize→parse produces same result.
4. **INV-4 (Allowlist enforcement)**: All filter values must pass through server-side allowlist validation. No arbitrary values accepted.
5. **INV-5 (Pagination reset)**: Any filter/sort/query change must reset cursor and page to initial state. Stale cursors must never be used with changed filters.
6. **INV-6 (Dedup guarantee)**: SearchResultsClient must never show duplicate listing IDs via seenIdsRef.
7. **INV-7 (60-item cap)**: Client must stop loading more at MAX_ACCUMULATED=60.
8. **INV-8 (Cross-page parity)**: Same URL params must produce identical server-side query results regardless of how the URL was reached (Homepage nav vs direct URL vs back button).
9. **INV-9 (No PII in logs)**: Logger must redact email, phone, address from all search-related log entries.
10. **INV-10 (Bounds protection)**: Text query without geographic bounds must not execute full-table scan — must return boundsRequired=true.
11. **INV-11 (Rate limiting)**: SSR search, API routes, and server actions all have independent rate limit buckets.
12. **INV-12 (Price sanity)**: minPrice <= maxPrice enforced; inverted ranges silently dropped (parseSearchParams) or throw (validateSearchFilters).
