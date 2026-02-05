# Test Plan: Search Pagination, Load More, and Results Accumulation

**Feature**: Cursor-based pagination with "Show more places" infinite scroll
**Component**: `SearchResultsClient` (`src/components/search/SearchResultsClient.tsx`)
**Server Action**: `fetchMoreListings` (`src/app/search/actions.ts`)
**Cursor System**: Keyset V2 (`src/lib/search/cursor.ts`)
**Split-Stay**: `findSplitStays` (`src/lib/search/split-stay.ts`)

**Impact**: ~40% of users scroll past the first page.
**Existing Coverage**: REG-004 (cursor no-duplicates, API-level), REG-005 (invalid cursor fallback, API-level), unit tests for SearchResultsClient (dedup, cap, error, loading, rapid-click).

---

## Architecture Summary

| Constant | Value | Location |
|---|---|---|
| `DEFAULT_PAGE_SIZE` | 12 | `src/lib/constants.ts:22` |
| `MAX_ACCUMULATED` | 60 | `SearchResultsClient.tsx:20` |
| `MAX_UNBOUNDED_RESULTS` | 48 | `src/lib/search/search-doc-queries.ts:66` |
| `MAX_PAGE_SIZE` | 100 | `src/lib/constants.ts` |

**Pagination flow**:
1. SSR renders first 12 listings + `initialNextCursor`
2. `SearchResultsClient` is keyed by `searchParamsString` -- any filter/sort/query change causes React unmount+remount, resetting all client state
3. User clicks "Show more places" button
4. `fetchMoreListings(cursor, rawParams)` server action is called
5. Response deduped via `seenIdsRef` (Set<string>), appended to `extraListings`
6. Repeats until: no `nextCursor`, OR `allListings.length >= MAX_ACCUMULATED` (60)

**Cursor format**: base64url-encoded JSON `{ v: 1, s: SortOption, k: (string|null)[], id: string }`

---

## Selectors Identified

| Element | Selector Strategy |
|---|---|
| Listing cards | `a[href^="/listings/c"]` or `[role="feed"] > *` |
| Results feed | `[role="feed"][aria-label="Search results"]` |
| "Show more places" button | `button:has-text("Show more places")` or `button[aria-label*="Show more places"]` |
| Loading state on button | `button[aria-busy="true"]` or `button:has-text("Loading")` |
| Load error text | `.text-red-600, .text-red-400` containing error message |
| "Try again" link | `button:has-text("Try again")` |
| Cap reached message | `text="Showing * results. Refine your filters to narrow down."` |
| End-of-results message | `text="You've seen all * results"` |
| Result count header | `text=/\d+ places/` or `text=/100\+ places/` |
| Progress indicator | `text=/Showing \d+ of/` |
| Sort dropdown (desktop) | `[aria-label*="Sort"]` via Radix Select |
| Sort button (mobile) | `button[aria-label^="Sort:"]` |
| Screen reader live region | `[aria-live="polite"][aria-atomic="true"]` |
| Split stay section | `h3:has-text("Split your stay")` |
| Split stay card | `text="Split Stay"` (header within card) |
| Search results container | `#search-results` |
| Zero results state | `h2:has-text("No matches found")` |

---

## Testing Strategy

### Data Constraint

The seed database has only ~5 SF listings, which likely fit on one page. Multi-page scenarios must use one of:

1. **API route interception** (`page.route()`) -- mock `/api/search/v2` and `fetchMoreListings` responses to simulate multi-page data sets. This is the primary strategy.
2. **Narrow bounds** -- use very tight geo bounds to get fewer initial results, then intercept load-more calls.
3. **API-level tests** (`request` fixture) -- validate cursor correctness without needing rendered pages.

The plan marks each scenario with `[MOCK]` if it requires route interception, `[LIVE]` if it can run against seed data, or `[API]` if it uses the API request fixture.

---

## Test Scenarios

---

### 1. Basic Load More

#### 1.1 Initial page renders up to 12 results [LIVE]
- **Priority**: P0
- **Preconditions**: Navigate to `/search?<SF_BOUNDS>`
- **Steps**:
  1. Navigate to search page with SF bounds
  2. Wait for `[role="feed"]` to appear
  3. Count listing card links (`a[href^="/listings/c"]`)
- **Assertions**:
  - Card count is between 1 and 12 (inclusive)
  - Results count header is visible (`N places` or `100+ places`)
- **Edge cases**: Seed data may have fewer than 12 listings

#### 1.2 "Show more places" button visible when hasNextPage is true [MOCK]
- **Priority**: P0
- **Preconditions**: Intercept initial SSR to return 12 items + a non-null `nextCursor`
- **Steps**:
  1. Navigate to search page (intercepted to return 12 results with cursor)
  2. Wait for feed to render
- **Assertions**:
  - Button with text "Show more places" is visible
  - Button has `aria-label` containing "Show more places. Currently showing 12"
  - Progress text "Showing 12 of ~N listings" is visible
- **Edge cases**: Button should NOT appear when nextCursor is null

#### 1.3 "Show more places" button hidden when hasNextPage is false [LIVE]
- **Priority**: P0
- **Preconditions**: Search returns fewer than 12 results (no second page)
- **Steps**:
  1. Navigate to search with bounds that return < 12 listings
  2. Wait for feed to render
- **Assertions**:
  - No "Show more places" button in the DOM
  - No progress indicator text visible
- **Edge cases**: Exactly 0 results should show zero-results UI instead

#### 1.4 Click "Load more" appends next batch [MOCK]
- **Priority**: P0
- **Preconditions**: Page with 12 initial results and valid nextCursor. Intercept `fetchMoreListings` server action response.
- **Steps**:
  1. Navigate to search page (SSR: 12 results, cursor present)
  2. Verify initial 12 cards visible
  3. Intercept the server action network call for load-more
  4. Click "Show more places"
  5. Wait for new cards to appear
- **Assertions**:
  - Total visible cards = 12 + N (where N is the mock response count)
  - New cards appear below existing cards (DOM order preserved)
  - Feed container has more children than before
  - Progress indicator updates ("Showing 24 of ~N")
- **Edge cases**: Empty second page (items: [], nextCursor: null)

#### 1.5 Loading spinner on button during fetch [MOCK]
- **Priority**: P1
- **Preconditions**: Intercept load-more to add artificial delay
- **Steps**:
  1. Navigate to search page with cursor
  2. Intercept load-more call with a delayed response (e.g., 2 seconds)
  3. Click "Show more places"
  4. Immediately check button state
- **Assertions**:
  - Button text changes to "Loading..." (contains "Loading")
  - Button has `aria-busy="true"`
  - Button is disabled (cannot be clicked again)
  - Loader2 SVG spinner (`animate-spin`) is visible inside button
  - After response resolves: button returns to "Show more places" or disappears
- **Edge cases**: Very fast response -- spinner may flash briefly

#### 1.6 Error during load more shows inline error with retry [MOCK]
- **Priority**: P0
- **Preconditions**: Intercept load-more to return an error (500 or throw)
- **Steps**:
  1. Navigate to search page with cursor
  2. Intercept load-more to fail with "Network error"
  3. Click "Show more places"
  4. Wait for error to appear
- **Assertions**:
  - Error message text is visible (red text, class `text-red-600`)
  - "Try again" button/link is visible next to error
  - "Show more places" button is no longer in loading state
  - Original listings remain visible (no data loss)
  - `aria-live` region does NOT announce the error text (it only announces result count)
- **Edge cases**: Generic "Failed to load more results" for non-Error throws

#### 1.7 Retry after error works [MOCK]
- **Priority**: P0
- **Preconditions**: Scenario 1.6 completed (error visible)
- **Steps**:
  1. From error state, intercept next load-more to succeed with new listings
  2. Click "Try again"
  3. Wait for new cards
- **Assertions**:
  - Error message disappears
  - New listings appear in the feed
  - "Show more places" button reappears (if more pages exist)
  - `loadError` state is cleared
- **Edge cases**: Double failure (error on retry too)

---

### 2. Deduplication

#### 2.1 No duplicate listing IDs across pages (seenIdsRef) [MOCK]
- **Priority**: P0
- **Preconditions**: Initial 12 listings with known IDs. Mock load-more to return some overlapping IDs.
- **Steps**:
  1. Navigate with 12 initial listings (IDs: listing-1 through listing-12)
  2. Mock load-more to return [listing-10, listing-11, listing-13, listing-14] (2 duplicates)
  3. Click "Show more places"
  4. Wait for load to complete
- **Assertions**:
  - Total visible cards = 14 (not 16)
  - No listing card ID appears more than once in the DOM
  - listing-13 and listing-14 are visible
  - listing-10 and listing-11 are NOT duplicated
- **Edge cases**: All items in second page are duplicates (result: 0 new items added, count stays at 12)

#### 2.2 Cursor stability: page 2 contains no IDs from page 1 [API]
- **Priority**: P0
- **Preconditions**: V2 search API enabled, enough seed data for 2 pages
- **Steps**:
  1. GET `/api/search/v2?sort=newest&<SF_BOUNDS>` -- capture page 1 IDs and nextCursor
  2. GET `/api/search/v2?sort=newest&cursor=<nextCursor>&<SF_BOUNDS>` -- capture page 2 IDs
  3. Compute intersection of page 1 and page 2 ID sets
- **Assertions**:
  - Intersection is empty (0 duplicates)
  - Page 2 IDs are all distinct
- **Edge cases**: Skip if < 13 listings in seed data. Already covered by REG-004 but worth keeping for regression.

#### 2.3 Deduplication maintained across 3+ load-more clicks [MOCK]
- **Priority**: P1
- **Preconditions**: Mock 3 consecutive load-more responses, each containing some duplicates from previous pages
- **Steps**:
  1. Initial: 4 listings (IDs 1-4)
  2. Load more 1: returns [3, 4, 5, 6] -- duplicates 3, 4
  3. Load more 2: returns [1, 5, 7, 8] -- duplicates 1, 5
  4. Load more 3: returns [7, 9, 10] -- duplicate 7
- **Assertions**:
  - After all loads: exactly 10 unique listings visible (IDs 1-10)
  - No DOM element has duplicate listing href
- **Edge cases**: Very large seenIdsRef Set (performance should not degrade)

---

### 3. Result Cap (MAX_ACCUMULATED = 60)

#### 3.1 Stops showing load-more at 60 items [MOCK]
- **Priority**: P0
- **Preconditions**: Mock initial SSR with 48 listings + cursor. Mock load-more to return 12 more + another cursor.
- **Steps**:
  1. Navigate (48 initial listings, nextCursor present)
  2. Click "Show more places"
  3. Wait for new listings to appear (total now 60)
- **Assertions**:
  - 60 listing cards visible
  - "Show more places" button is NOT visible
  - Cap message visible: "Showing 60 results. Refine your filters to narrow down."
- **Edge cases**: Initial load already at 60 (button never shown)

#### 3.2 Cap message text and styling [MOCK]
- **Priority**: P1
- **Preconditions**: Reach cap (scenario 3.1)
- **Steps**:
  1. After reaching 60 items, locate cap message
- **Assertions**:
  - Text matches: "Showing 60 results. Refine your filters to narrow down."
  - Text is centered (`text-center`)
  - Text color is muted (`text-zinc-500`)
  - No "Show more places" button anywhere on page
- **Edge cases**: Cap message appears only when `reachedCap && nextCursor` (not at natural end)

#### 3.3 Load-more button hidden when initial load exceeds cap [MOCK]
- **Priority**: P1
- **Preconditions**: Mock SSR to return 65 initial listings (exceeds cap) with cursor
- **Steps**:
  1. Navigate with 65 initial listings and nextCursor set
- **Assertions**:
  - "Show more places" button not visible (reachedCap is true)
  - Cap message is visible
  - All 65 listings are rendered (cap controls button visibility, not rendering)
- **Edge cases**: Exact boundary at 60

---

### 4. End of Results

#### 4.1 Shows "You've seen all N results" at end [MOCK]
- **Priority**: P0
- **Preconditions**: Initial 12 listings with cursor. Mock load-more to return remaining results with nextCursor=null.
- **Steps**:
  1. Navigate (12 initial, cursor present)
  2. Click "Show more places"
  3. Mock returns 5 items, nextCursor=null
- **Assertions**:
  - "You've seen all 17 results" message visible
  - "Show more places" button NOT visible
  - No cap message visible (this is natural end, not forced cap)
- **Edge cases**: Condition requires `extraListings.length > 0` -- so this only shows after at least one load-more

#### 4.2 End message not shown when all results fit on first page [LIVE]
- **Priority**: P1
- **Preconditions**: Search returns < 12 results, no cursor
- **Steps**:
  1. Navigate to search with bounds that return < 12 listings
- **Assertions**:
  - No "You've seen all" text visible (condition: `extraListings.length > 0` is false)
  - No "Show more places" button
- **Edge cases**: Exactly 12 results with no next page

#### 4.3 Total count: exact vs "100+" display [MOCK]
- **Priority**: P1
- **Preconditions**: Two scenarios: (a) total=25, (b) total=null
- **Steps (a)**:
  1. Navigate with total=25
  2. Check header and footer text
- **Assertions (a)**:
  - Header shows "25 places"
  - Progress shows "Showing 12 of ~25 listings"
  - Footer shows "25 stays"
- **Steps (b)**:
  1. Navigate with total=null
  2. Check header and footer text
- **Assertions (b)**:
  - Header shows "100+ places"
  - Progress shows "Showing 12 of 100+ listings"
  - Footer shows "100+ stays"
  - aria-live region announces "Found more than 100 listings"
- **Edge cases**: total=0 triggers zero-results UI (separate flow)

---

### 5. Cursor Reset on Filter/Sort Change

#### 5.1 Changing sort resets accumulated results [MOCK]
- **Priority**: P0
- **Preconditions**: Load 2 pages (24 results visible). Then change sort.
- **Steps**:
  1. Navigate (12 initial, cursor present)
  2. Click "Show more places" to load 12 more (24 total)
  3. Open sort dropdown (desktop: Radix Select; mobile: bottom sheet)
  4. Select "Price: Low to High" (`price_asc`)
  5. Wait for page navigation/transition
- **Assertions**:
  - URL updates to include `sort=price_asc`
  - URL does NOT contain `cursor` or `page` params
  - SearchResultsClient remounts (React key changes because `searchParamsString` changed)
  - Only new first-page results visible (12 or fewer)
  - Previously loaded extra results are gone
  - "Show more places" button reflects new pagination state
- **Edge cases**: Sort back to "Recommended" removes `sort` param entirely

#### 5.2 Changing a filter resets cursor [MOCK]
- **Priority**: P0
- **Preconditions**: Load 2 pages. Then apply a price filter.
- **Steps**:
  1. Navigate and load 2 pages (24 results)
  2. Apply a filter (e.g., add `minPrice=500` to URL or interact with filter UI)
  3. Wait for results to reload
- **Assertions**:
  - Component remounts (key={searchParamsString} changes)
  - Accumulated results reset to new first page
  - seenIdsRef re-initialized with new initial listings only
  - No stale data from previous filter visible
- **Edge cases**: Removing a filter also triggers reset

#### 5.3 Changing location/bounds resets cursor [MOCK]
- **Priority**: P1
- **Preconditions**: Load 2 pages. Then change map bounds.
- **Steps**:
  1. Navigate and load 2 pages
  2. Simulate bounds change (update URL params: minLat, maxLat, minLng, maxLng)
  3. Wait for reload
- **Assertions**:
  - SearchResultsClient remounts with new key
  - Fresh first page shown
  - Old accumulated results cleared
- **Edge cases**: Subtle bounds shift (1px pan) -- still triggers full reset per architecture

#### 5.4 seenIdsRef cleared on remount [MOCK]
- **Priority**: P1
- **Preconditions**: Load page with listing IDs [A, B, C]. Change filter. New page has same IDs [A, B, C].
- **Steps**:
  1. Navigate (initial: [A, B, C])
  2. Change sort to trigger remount
  3. New initial results are [A, B, C] (same IDs, different order)
  4. Click "Show more places"
  5. Load-more returns [D, E] (new)
- **Assertions**:
  - After remount, [A, B, C] are rendered (seenIdsRef was re-initialized)
  - After load-more, [D, E] appear (not blocked by stale seenIdsRef)
  - Total: 5 cards visible
- **Edge cases**: Tests that React key-based remount actually resets useRef

---

### 6. Sort + Pagination Order Preservation

#### 6.1 Load more with price_asc maintains ascending price order [MOCK]
- **Priority**: P1
- **Preconditions**: Navigate with `sort=price_asc`. Mock initial 12 with ascending prices. Mock load-more with next 12 continuing ascending.
- **Steps**:
  1. Navigate with sort=price_asc
  2. Verify first page prices are in ascending order
  3. Click "Show more places"
  4. Wait for second batch
- **Assertions**:
  - All 24 prices are in non-decreasing order
  - Last price on page 1 <= first price on page 2
- **Edge cases**: Equal prices (tie-broken by created_at then id)

#### 6.2 Load more with price_desc maintains descending price order [MOCK]
- **Priority**: P1
- **Preconditions**: Same as 6.1 but descending prices
- **Steps**: Mirror of 6.1 with `sort=price_desc`
- **Assertions**:
  - All prices in non-increasing order
  - Last price on page 1 >= first price on page 2

#### 6.3 Load more with newest maintains date order [MOCK]
- **Priority**: P1
- **Preconditions**: `sort=newest`, mock data with known created_at dates
- **Steps**:
  1. Navigate with sort=newest
  2. Load more
- **Assertions**:
  - Listings ordered by created_at descending
  - No newer listing appears after an older one across page boundary

#### 6.4 Load more with rating maintains rating order [MOCK]
- **Priority**: P2
- **Preconditions**: `sort=rating`, mock data with known ratings
- **Steps**: Navigate, load more
- **Assertions**:
  - Listings ordered by avg_rating DESC, review_count DESC, created_at DESC
  - Cross-page boundary maintains order

#### 6.5 Switch sort mid-pagination resets to page 1 [MOCK]
- **Priority**: P0
- **Preconditions**: Load 2+ pages with `sort=newest`. Then switch to `price_asc`.
- **Steps**:
  1. Navigate with sort=newest, load 2 pages (24 items)
  2. Change sort to price_asc
  3. Wait for new results
- **Assertions**:
  - Only 12 (or fewer) results visible
  - Results are price-ordered (not date-ordered)
  - URL has `sort=price_asc`, no `cursor`
  - Previous extra listings gone
- **Edge cases**: Rapid sort switching (debounce should prevent race conditions)

---

### 7. URL and State Management

#### 7.1 URL never contains cursor param [MOCK]
- **Priority**: P0
- **Preconditions**: Load 3 pages of results
- **Steps**:
  1. Navigate to search
  2. Click "Show more places" 3 times
  3. After each click, inspect `page.url()`
- **Assertions**:
  - URL never contains `cursor=` parameter at any point
  - URL never contains `cursorStack=` or `pageNumber=`
  - Only initial search params remain in URL
- **Edge cases**: Load-more state is purely ephemeral client state

#### 7.2 Page refresh during pagination shows first page only [MOCK]
- **Priority**: P0
- **Preconditions**: Load 3 pages (36 results visible)
- **Steps**:
  1. Navigate and load 3 pages
  2. Verify 36 results visible
  3. `page.reload()`
  4. Wait for page to load
- **Assertions**:
  - Only 12 (or initial page count) results visible
  - "Show more places" button reappears
  - Extra listings from load-more are gone
  - No stale data preserved
- **Edge cases**: Refresh during active load-more request

#### 7.3 Browser back/forward after load-more shows first page [MOCK]
- **Priority**: P1
- **Preconditions**: Navigate to search, load 2 pages, navigate to a listing detail, go back
- **Steps**:
  1. Navigate to search, load 2 pages (24 results)
  2. Click a listing card to navigate to `/listings/<id>`
  3. Press browser back
  4. Wait for search page
- **Assertions**:
  - Search page shows only first page of results (12)
  - Load-more state is not restored from history
  - "Show more places" button visible
- **Edge cases**: Browser may cache page state differently

#### 7.4 Deep link (shared URL) always starts at page 1 [LIVE]
- **Priority**: P1
- **Preconditions**: Copy a search URL
- **Steps**:
  1. Navigate to `/search?q=test&sort=newest&<SF_BOUNDS>` directly
- **Assertions**:
  - First page of results shown
  - No cursor or pagination state leaked into initial render
  - "Show more places" visible if more results exist
- **Edge cases**: URL with old-format cursor param -- should be ignored

---

### 8. Browse Mode

#### 8.1 Browse mode caps at 48 results total [MOCK]
- **Priority**: P1
- **Preconditions**: Navigate without query or bounds (browse mode). Mock API to return browse-mode results.
- **Steps**:
  1. Navigate to `/search` (no q, no bounds)
  2. Wait for results
  3. If "Show more places" visible, click repeatedly until it disappears
- **Assertions**:
  - Total accumulated results never exceed 48 (`MAX_UNBOUNDED_RESULTS`)
  - Browse mode banner visible ("Showing top listings. Select a location for more results.")
  - Results eventually stop loading (no load-more button)
- **Edge cases**: Server already enforces 48 cap -- client may hit this OR the 60 cap first

#### 8.2 Browse mode indicator visible [LIVE]
- **Priority**: P2
- **Preconditions**: Navigate to `/search` without query or bounds that triggers browse mode
- **Steps**:
  1. Navigate to browse search
- **Assertions**:
  - Amber text visible: "Showing top listings. Select a location for more results."
  - `SuggestedSearches` component rendered
- **Edge cases**: May see `boundsRequired` UI if query is present without bounds

---

### 9. Split-Stay Feature

#### 9.1 6+ month search shows split-stay suggestions [MOCK]
- **Priority**: P1
- **Preconditions**: Navigate with `leaseDuration=6 months` or `moveInDate`/`moveOutDate` spanning 6+ months. Need 2+ listings with price > 0.
- **Steps**:
  1. Navigate to `/search?leaseDuration=6%20months&<SF_BOUNDS>`
  2. Wait for results
  3. Look for split-stay section
- **Assertions**:
  - Heading "Split your stay" is visible
  - At least 1 `SplitStayCard` rendered
  - Card shows "Split Stay" header with split label (e.g., "3 mo + 3 mo")
  - Combined price is displayed
  - Both listing halves are clickable links to their listing pages
- **Edge cases**: Exactly 2 listings (minimum for split-stay)

#### 9.2 Short duration search shows no split-stay [MOCK]
- **Priority**: P2
- **Preconditions**: Navigate with `leaseDuration=3 months` (< 6 months)
- **Steps**:
  1. Navigate to search with 3-month duration
  2. Wait for results
- **Assertions**:
  - "Split your stay" heading NOT in DOM
  - No SplitStayCard rendered
- **Edge cases**: Exactly 5 months (boundary: must be >= 6)

#### 9.3 Split-stay updates after load-more adds new listings [MOCK]
- **Priority**: P2
- **Preconditions**: 6+ month search with 2 initial listings (split-stay may appear). Load more adds listings that change the cheapest/most expensive pairings.
- **Steps**:
  1. Navigate with 6-month duration, 2 initial listings priced $1000 and $2000
  2. Verify initial split-stay card shows those 2
  3. Click "Show more places", adding a $500 listing
  4. Wait for re-render
- **Assertions**:
  - Split-stay pairs may update to include the new $500 listing
  - Combined price recalculated
- **Edge cases**: `splitStayPairs` useMemo dependency is `[allListings.length, estimatedMonths]`, so it recomputes on length change

---

### 10. Edge Cases

#### 10.1 Empty results: no load-more button [LIVE]
- **Priority**: P0
- **Preconditions**: Search with very narrow criteria that returns 0 results
- **Steps**:
  1. Navigate to `/search?q=zzznonexistent&<SF_BOUNDS>` or similar zero-result query
  2. Wait for zero-results UI
- **Assertions**:
  - "No matches found" heading visible
  - No "Show more places" button
  - No progress indicator
  - No result count header (replaced by zero-results UI)
  - Filter suggestions may appear (if applicable)
- **Edge cases**: `hasConfirmedZeroResults` must be true (total === 0, not total === null)

#### 10.2 Exactly 12 results, no next page [MOCK]
- **Priority**: P1
- **Preconditions**: Mock SSR to return exactly 12 items, nextCursor=null, total=12
- **Steps**:
  1. Navigate to search
  2. Wait for feed
- **Assertions**:
  - 12 listing cards visible
  - No "Show more places" button (nextCursor is null)
  - No "You've seen all" message (extraListings.length === 0)
  - Result count shows "12 places"
- **Edge cases**: The limit+1 fetch pattern means 12 results fetched = exactly 12 available

#### 10.3 Exactly 13 results (first page + 1 on next) [MOCK]
- **Priority**: P2
- **Preconditions**: Mock SSR: 12 items + cursor. Mock load-more: 1 item + null cursor.
- **Steps**:
  1. Navigate (12 items, cursor present)
  2. Click "Show more places"
  3. Wait for 1 new item
- **Assertions**:
  - 13 cards visible
  - "Show more places" button disappears
  - "You've seen all 13 results" message visible
- **Edge cases**: Minimum multi-page scenario

#### 10.4 Rapid clicking load-more (prevented by guard) [MOCK]
- **Priority**: P1
- **Preconditions**: Intercept load-more with 2-second delay
- **Steps**:
  1. Navigate with cursor
  2. Click "Show more places" 5 times rapidly
- **Assertions**:
  - Only 1 network request is made (guard: `if (!nextCursor || isLoadingMore) return`)
  - Button becomes disabled after first click
  - No duplicate items appear
  - After response: button becomes clickable again (if more pages)
- **Edge cases**: JavaScript `disabled` attribute + early return in handler

#### 10.5 Slow network: load-more with high latency [MOCK]
- **Priority**: P2
- **Preconditions**: Intercept load-more with 5-second delay
- **Steps**:
  1. Navigate with cursor
  2. Click "Show more places"
  3. Wait up to 10 seconds
- **Assertions**:
  - Loading spinner visible during entire wait
  - Button stays disabled
  - Results eventually appear (no timeout on client side)
  - No error shown (server action has its own timeout)
- **Edge cases**: Server-side timeout may trigger error before client-side wait ends

#### 10.6 Server error during load more: graceful degradation [MOCK]
- **Priority**: P0
- **Preconditions**: Intercept load-more to return 500
- **Steps**:
  1. Navigate with cursor
  2. Mock server to fail with 500
  3. Click "Show more places"
- **Assertions**:
  - Error message visible in red
  - "Try again" link available
  - All previously loaded listings still visible (no data loss)
  - User can retry
- **Edge cases**: Rate limit error (429) -- message is "Rate limited"

#### 10.7 Invalid cursor handled gracefully [API]
- **Priority**: P0
- **Preconditions**: V2 API endpoint available
- **Steps**:
  1. GET `/api/search/v2?cursor=GARBAGE_STRING&<SF_BOUNDS>`
  2. GET `/api/search/v2?cursor=eyJpZCI6Im5vbmV4aXN0ZW50In0%3D&<SF_BOUNDS>`
- **Assertions**:
  - Response is NOT 500
  - Response is 200 with valid shape OR 400 with error message
  - Fallback to first page (items array present)
- **Edge cases**: Already covered by REG-005, included here for completeness

#### 10.8 Concurrent load-more requests prevented [MOCK]
- **Priority**: P1
- **Preconditions**: Slow network simulation
- **Steps**:
  1. Navigate with cursor
  2. Click "Show more places"
  3. While loading, attempt to trigger handleLoadMore via keyboard (Enter on button)
- **Assertions**:
  - Button is disabled, Enter does nothing
  - Only 1 fetch in flight
  - No race condition in state updates
- **Edge cases**: handleLoadMore guard: `if (!nextCursor || isLoadingMore) return`

---

### 11. Accessibility

#### 11.1 Screen reader announcement when results load [MOCK]
- **Priority**: P1
- **Preconditions**: Search page with results
- **Steps**:
  1. Navigate to search
  2. Inspect aria-live region
- **Assertions**:
  - `[aria-live="polite"][aria-atomic="true"]` exists with class `sr-only`
  - Announces "Found N listings" or "Found more than 100 listings"
  - For zero results: announces "No listings found"
- **Edge cases**: Live region only announces on initial render, NOT on load-more (no dynamic update to this region on load-more)

#### 11.2 Load-more button accessibility attributes [MOCK]
- **Priority**: P1
- **Preconditions**: Page with "Show more places" button
- **Steps**:
  1. Navigate with cursor
  2. Inspect button attributes
- **Assertions**:
  - When idle: `aria-label="Show more places. Currently showing N of M listings"`
  - When loading: `aria-label="Loading more results"` and `aria-busy="true"`
  - Button has `disabled` attribute when loading
  - Button has `touch-target` class (min 44px hit area for mobile)
- **Edge cases**: aria-label dynamically updates with count

#### 11.3 Feed container semantic structure [LIVE]
- **Priority**: P2
- **Preconditions**: Search page with results
- **Steps**:
  1. Navigate to search
  2. Inspect results container
- **Assertions**:
  - Container has `role="feed"` and `aria-label="Search results"`
  - Results container has `id="search-results"` and `tabIndex={-1}` (focusable for skip-link)
- **Edge cases**: Grid layout should not break screen reader navigation

#### 11.4 Keyboard navigation to load-more [MOCK]
- **Priority**: P2
- **Preconditions**: Page with results and load-more button
- **Steps**:
  1. Navigate to search
  2. Tab through the page until focus reaches "Show more places" button
  3. Press Enter
- **Assertions**:
  - Button is reachable via Tab
  - Enter activates load-more
  - Focus is not trapped
  - After load-more completes, focus remains in a sensible position
- **Edge cases**: Focus management after load -- spec does not explicitly manage focus post-load (potential a11y gap)

---

## Priority Summary

| Priority | Count | Description |
|---|---|---|
| P0 | 14 | Must-have: core pagination flow, dedup, error handling, cap, URL safety |
| P1 | 16 | Should-have: sort order, loading states, accessibility, rapid-click |
| P2 | 8 | Nice-to-have: edge boundaries, split-stay, slow network, keyboard |

---

## Implementation Notes

### Mock Strategy for E2E Tests

Since seed data is insufficient for multi-page scenarios, tests should use Playwright's route interception:

```typescript
// Intercept the server action for load-more
// Next.js server actions POST to the same URL with specific headers
await page.route('**/search', async (route) => {
  const request = route.request();
  if (request.method() === 'POST' && request.headers()['next-action']) {
    // This is a server action call
    await route.fulfill({
      status: 200,
      contentType: 'text/x-component',
      body: /* RSC encoded response */
    });
  } else {
    await route.continue();
  }
});
```

**Alternative approach**: Intercept the V2 API at the HTTP level:

```typescript
await page.route('**/api/search/v2*', async (route) => {
  const url = new URL(route.request().url());
  if (url.searchParams.has('cursor')) {
    // Return page 2+ mock data
    await route.fulfill({ json: mockPage2Response });
  } else {
    await route.continue();
  }
});
```

**Preferred approach**: Use a test fixture that seeds additional listings before pagination tests, then cleans up. This avoids fragile mock-interception of Next.js server actions.

### Known Gaps and Risks

1. **Focus management after load-more**: The component does not programmatically move focus to newly loaded items. Screen reader users may not notice new content appeared below. Consider adding focus management or an `aria-live` announcement for loaded items.

2. **No announcement for load-more completion**: The `aria-live` region only announces on initial render. When load-more adds items, there is no screen reader announcement of the new count. The button label updates, but only if the user re-focuses it.

3. **Server action interception complexity**: Next.js server actions use RSC wire format, making mock responses non-trivial. API-level tests via the `request` fixture may be more reliable for cursor validation.

4. **Seed data limitation**: Only ~5 SF listings exist. All multi-page scenarios marked [MOCK] need either route interception or test-specific data seeding.

5. **Browse mode vs client cap interaction**: Browse mode caps at 48 (server-side), while client caps at 60. In browse mode the server cap is the effective limit, but the client would still show load-more until 48.

6. **Performance marks**: `handleLoadMore` calls `performance.mark('load-more-start')` and `performance.measure('load-more')`. Performance tests could assert these marks exist via `page.evaluate()`.

### Relationship to Existing Tests

| Existing Test | Overlap | This Plan Adds |
|---|---|---|
| REG-004 (search-smoke) | API-level cursor no-dups | Full E2E user-flow: click button, verify DOM dedup |
| REG-005 (search-smoke) | API-level invalid cursor | Already sufficient; scenario 10.7 included for completeness |
| SearchResultsClient.test.tsx (unit) | Covers dedup, cap, error, loading, rapid-click at component level | Full E2E integration: real server action, real navigation, sort changes, URL state |

---

## Test File Organization (Recommended)

```
tests/e2e/
  search-pagination.spec.ts          # Scenarios 1.x, 2.x, 3.x, 4.x (core load-more)
  search-pagination-sort.spec.ts     # Scenarios 5.x, 6.x (sort + reset)
  search-pagination-state.spec.ts    # Scenarios 7.x, 8.x (URL, refresh, browse mode)
  search-pagination-edge.spec.ts     # Scenarios 10.x (edge cases)
  search-split-stay.spec.ts          # Scenarios 9.x (split-stay)
  search-pagination-a11y.spec.ts     # Scenarios 11.x (accessibility)
```

Each file should import shared helpers from `tests/e2e/helpers/` and use `SF_BOUNDS` for geo-filtering.
