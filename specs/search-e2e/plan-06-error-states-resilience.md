# Test Plan: Error States & Resilience (Search Page)

**File:** `specs/search-e2e/plan-06-error-states-resilience.md`
**Scenario count:** 13 scenarios, 42 test cases
**Priority distribution:** P0 (5), P1 (5), P2 (3)
**Auth requirement:** All anonymous (no login required)
**Target spec file:** `tests/e2e/search-error-resilience.anon.spec.ts`

---

## Coverage Gap Analysis

### Already covered by existing tests
- `map-errors-a11y.anon.spec.ts` 10.1: Zero results with map still interactive
- `map-errors-a11y.anon.spec.ts` 10.4: Invalid bounds / "Zoom in" message
- `map-errors-a11y.anon.spec.ts` 10.5: Map interactive during error state
- `12-map-error-handling.spec.ts`: Viewport validation, v1 rate limit/server error (skipped for v2)
- `30-critical-simulations.spec.ts` S5: Slow network visitor, S10: Empty search, S30: Error boundary
- `10-accessibility-edge-cases.spec.ts` J091: No results empty state, J092: 404/network error

### New coverage this plan adds
- Zero results suggestions UI: filter relaxation buttons, nearby area links
- LowResultsGuidance panel: few results with near-match toggle
- Server-side rate limit page (429 rendered in page.tsx, not map API)
- V2-to-V1 fallback verification via SSR route mocking
- Loading skeleton visibility during Next.js navigation transitions
- "Load more" error and retry within SearchResultsClient
- Concurrent partial failures: map fails but list succeeds
- Error boundary full-page recovery via "Try again" button
- Slow network search with loading state visibility
- Stale-while-revalidate / cache behavior

---

## Selectors Identified

```typescript
// Error boundary (full-page)
const errorBoundary = {
  container:    'div:has(> div > h1:text("Unable to load search results"))',
  heading:      'h1:text("Unable to load search results")',
  retryButton:  'button:has-text("Try again")',
  homeButton:   'a[href="/"]:has-text("Go home")',
  refId:        'code',  // error.digest reference ID
  devDetails:   'details:has(summary:text("Error details"))',
};

// SearchErrorBanner (inline)
const errorBanner = {
  container:    '[role="alert"]',
  message:      '[role="alert"] span',
  retryButton:  '[role="alert"] button:has-text("Try again")',
};

// Zero results
const zeroResults = {
  emptyHeading:         'h2:text("No matches found")',
  emptyDescription:     'text=/couldn.*find any listings/i',
  clearFiltersLink:     'a[href="/search"]:has-text("Clear all filters")',
  suggestionsContainer: 'text=/No exact matches/i',
  suggestionButton:     'button:has(span:text(/Remove:/))',
  clearAllButton:       'button:has-text("Clear all filters")',
  nearbyAreaLink:       'a[href^="/search?q="]:has(svg)',
  browseAllButton:      'button:has-text("Browse all")',
};

// Low results guidance
const lowResults = {
  container:       'div:has(h3:text(/Only \\d+ listing/))',
  heading:         'h3:text(/Only \\d+ listing/)',
  suggestion:      'button:has-text(/Expand|Increase|Lower|Flexible|Any|Fewer/)',
  nearMatchToggle: 'button:has-text("Include near matches")',
  nearMatchBadge:  'span:text(/\\+\\d+/)',
};

// Rate limit page (server-rendered)
const rateLimitPage = {
  heading:     'h1:text("Too Many Requests")',
  message:     'text=/searching too quickly/i',
  retryTimer:  'text=/Try again in \\d+ seconds/i',
};

// Loading skeleton
const skeleton = {
  container:    '[aria-busy="true"][aria-label="Loading search results"]',
  cardSkeleton: '[aria-busy="true"] [class*="animate-pulse"]',
};

// Search results
const results = {
  heading:         '#search-results-heading',
  feed:            '[role="feed"][aria-label="Search results"]',
  listingCard:     'a[href^="/listings/"]:not([href="/listings/create"])',
  loadMoreButton:  'button:has-text("Show more places")',
  loadMoreSpinner: 'button[aria-busy="true"]:has-text("Loading")',
  loadError:       'text=/Failed to load/ ~ button:has-text("Try again")',
  endOfResults:    'text=/seen all \\d+ results/i',
};

// Map error boundary
const mapError = {
  container:   'text="Map unavailable — try refreshing"',
  retryButton: 'button:text("Retry")',
};

// Map panel controls
const mapPanel = {
  hideMapButton: 'button:has-text("Hide map")',
  showMapButton: 'button:has-text("Show map")',
};
```

---

## Test Scenarios

### Scenario 1: Zero results with no active filters
**Priority:** P0 | **Type:** LIVE | **Auth:** Anonymous

**Preconditions:**
- Search page accessible
- No active filters (clean `/search?q=...` URL)

**Steps:**
1. Navigate to `/search?q=xyznonexistentlocation123456789`
2. Wait for `domcontentloaded` + results area to render
3. Verify zero results UI appears

**Assertions:**
- [ ] "No matches found" heading (`h2`) is visible
- [ ] Description text includes the query string ("xyznonexistentlocation123456789")
- [ ] "Clear all filters" link is visible and links to `/search`
- [ ] No listing cards are rendered (`[role="feed"]` either absent or empty)
- [ ] Screen reader live region announces "No listings found for..."
- [ ] Page title heading shows `0 places`

**Edge cases:**
- Empty query string (`/search?q=`) should not show zero-results (shows default browse)
- Unicode/emoji query: `/search?q=%F0%9F%8F%A0` should degrade gracefully
- XSS attempt in query is sanitized (no script execution)

---

### Scenario 2: Zero results with filter suggestions
**Priority:** P0 | **Type:** LIVE | **Auth:** Anonymous

**Preconditions:**
- Search with restrictive filters that yield zero results
- At least one filter is active so `analyzeFilterImpact` returns suggestions

**Steps:**
1. Navigate to `/search?minLat=37.7&maxLat=37.85&minLng=-122.52&maxLng=-122.35&maxPrice=1&roomType=studio`
2. Wait for zero results state
3. Verify filter suggestions appear
4. Click a filter suggestion button
5. Verify URL updates with filter removed and page reloads

**Assertions:**
- [ ] "No exact matches" heading visible (when suggestions > 0)
- [ ] At least 1 filter suggestion button is visible (up to 3 shown)
- [ ] Each suggestion shows "Remove: [filter name]" subtext
- [ ] Clicking a suggestion removes the corresponding URL parameter
- [ ] URL no longer contains the removed filter after click
- [ ] "Clear all filters" button navigates to `/search`
- [ ] Nearby area links visible when query is present (e.g., Austin, San Francisco)

**Edge cases:**
- All suggestions removed one-by-one until no filters remain
- Clicking "Clear all" navigates to bare `/search` with no params
- `page` param is removed when filters change (cursor reset)

---

### Scenario 3: Zero results with nearby area suggestions
**Priority:** P1 | **Type:** LIVE | **Auth:** Anonymous

**Preconditions:**
- Search with a location query that yields zero results
- Suggestions list is empty (or has suggestions with query present)

**Steps:**
1. Navigate to `/search?q=MarsColony2099&minLat=0&maxLat=1&minLng=0&maxLng=1`
2. Wait for zero results
3. Verify nearby area suggestions section appears
4. Click one of the area links

**Assertions:**
- [ ] "Try a different area" section is visible
- [ ] Default areas shown: "Austin, TX", "San Francisco, CA", "New York, NY", "Los Angeles, CA"
- [ ] Current query is excluded from suggestions (if it matches a default area)
- [ ] Clicking an area link navigates to `/search?q=[encoded area name]`
- [ ] "Browse all" button navigates to `/search`

**Edge cases:**
- If no suggestions AND no query, the simpler empty state with "Browse all" is shown
- If query matches a default area exactly (case-insensitive), that area is filtered out

---

### Scenario 4: Few results triggers LowResultsGuidance
**Priority:** P1 | **Type:** LIVE | **Auth:** Anonymous

**Preconditions:**
- Search returns 1-4 results (below `LOW_RESULTS_THRESHOLD` of 5)
- At least one relaxable filter is active (price, date, roomType, amenities, leaseDuration)
- `nearMatches` param is NOT set

**Steps:**
1. Navigate to `/search?minLat=37.7&maxLat=37.85&minLng=-122.52&maxLng=-122.35&maxPrice=50&roomType=studio`
2. Wait for results to load
3. Verify LowResultsGuidance panel appears if resultCount is 1-4
4. Click a filter suggestion pill
5. Verify URL updates and results refresh

**Assertions:**
- [ ] "Only N listing(s) found" heading visible with correct count
- [ ] "Try adjusting your filters" guidance text visible
- [ ] Filter suggestion pills rendered (based on active filters)
- [ ] "Include near matches" button visible with optional `+N` badge
- [ ] Clicking "Include near matches" adds `nearMatches=1` to URL
- [ ] Clicking a suggestion pill removes the corresponding filter param
- [ ] `page` param deleted on filter/near-match changes
- [ ] LowResultsGuidance NOT shown when `nearMatches=1` is already set
- [ ] LowResultsGuidance NOT shown when resultCount >= 5
- [ ] LowResultsGuidance NOT shown when resultCount === 0

**Edge cases:**
- Exactly 1 result shows "1 listing" (singular)
- Exactly 4 results shows "4 listings" (plural)
- 5 results: guidance hidden (at threshold)
- No active filters: no suggestion pills rendered, but near-match toggle may still show

---

### Scenario 5: Network offline during search navigation
**Priority:** P1 | **Type:** MOCK | **Auth:** Anonymous

**Preconditions:**
- User is on the home page with a working connection
- Network can be toggled via `context.setOffline()`

**Steps:**
1. Navigate to home page `/`
2. Go offline via `network.goOffline()`
3. Attempt to navigate to `/search`
4. Observe error behavior
5. Go back online via `network.goOnline()`
6. Retry navigation

**Assertions:**
- [ ] Browser shows a network error or the page fails to load
- [ ] No unhandled JS exceptions (check `page.on('pageerror')`)
- [ ] After going online, navigation to `/search` succeeds
- [ ] Search results load normally after recovery

**Edge cases:**
- Going offline mid-page-load (after some resources loaded)
- Offline during "Load more" fetch (client-side)

---

### Scenario 6: API 500 triggers error boundary
**Priority:** P0 | **Type:** MOCK | **Auth:** Anonymous

**Preconditions:**
- V2 search API and V1 fallback can both be forced to fail
- Route interception set up BEFORE navigation

**Steps:**
1. Mock the search page SSR to fail by intercepting the page navigation itself
   - `page.route('**/search**', route => route.fulfill({ status: 500, body: 'Server Error' }))`
   - Alternative: Force the server component to throw via an impossible state
2. Navigate to `/search?minLat=37.7&maxLat=37.85&minLng=-122.52&maxLng=-122.35`
3. Verify error boundary page appears

**Assertions:**
- [ ] Error boundary heading "Unable to load search results" is visible
- [ ] Temporary message "usually temporary" displayed
- [ ] "Try again" button with RefreshCw icon is visible
- [ ] "Go home" link button navigates to `/`
- [ ] In development mode: `<details>` with error info is present
- [ ] In production mode: `<details>` is NOT rendered
- [ ] Error digest reference ID shown when `error.digest` exists
- [ ] No PII leaked in error display

**Edge cases:**
- Double-clicking "Try again" does not cause additional errors
- "Go home" link is accessible via keyboard (Tab + Enter)
- Error boundary captures both V2 and V1 combined failure

**Note:** This scenario is difficult to test via route interception because the page is server-rendered. The most reliable approach is to mock the fetch for the V2 search endpoint AND the V1 Prisma query simultaneously, which requires server-side test infrastructure. Consider testing the error boundary component in isolation (unit test) and using route-level interception for the SSR HTML response.

---

### Scenario 7: Server-side rate limit (429) page
**Priority:** P0 | **Type:** MOCK | **Auth:** Anonymous

**Preconditions:**
- The search page checks rate limits via `checkServerComponentRateLimit`
- When rate-limited, the page renders a custom "Too Many Requests" UI (not an error boundary)

**Steps:**
1. This is server-rendered, so we cannot easily mock the Redis rate limiter
2. Alternative approach: make rapid requests to trigger actual rate limiting
   - Navigate to `/search` 30+ times in quick succession
   - Check if the rate limit page appears
3. If rate limiting cannot be triggered in test env, verify the static UI contract:
   - Navigate with a mocked page response containing the rate limit HTML

**Assertions:**
- [ ] "Too Many Requests" heading (`h1`) visible
- [ ] Clock icon visible (amber background circle)
- [ ] Message text "You are searching too quickly" visible
- [ ] Retry timer shows "Try again in N seconds"
- [ ] No retry button (user must wait) -- page is static, not interactive
- [ ] No error boundary (this is a deliberate server response, not an exception)
- [ ] Page still has valid HTML structure (no blank page)

**Edge cases:**
- Rate limit response includes correct `retryAfter` value
- Very fast repeated requests do not crash the server
- Rate limit does not leak user IP or request metadata

**Implementation note:** Testing server-side rate limiting in E2E requires either:
(a) A test environment with very low rate limit thresholds, or
(b) Intercepting the full-page HTML response via `page.route()` to serve the rate-limit HTML.
Option (b) is recommended for deterministic tests.

---

### Scenario 8: V2-to-V1 fallback on V2 failure
**Priority:** P0 | **Type:** MOCK | **Auth:** Anonymous

**Preconditions:**
- V2 search feature flag is enabled OR `?v2=1` query param used
- V2 API endpoint can be intercepted

**Steps:**
1. Intercept the V2 search API endpoint to return 500:
   ```typescript
   await page.route('**/api/search/v2*', route => route.fulfill({
     status: 500,
     contentType: 'application/json',
     body: JSON.stringify({ error: 'V2 search failed' }),
   }));
   ```
2. Navigate to `/search?v2=1&minLat=37.7&maxLat=37.85&minLng=-122.52&maxLng=-122.35`
3. Wait for page to fully render
4. Verify results still appear (from V1 fallback)

**Assertions:**
- [ ] Search results page renders successfully (no error boundary)
- [ ] Listing cards are visible (V1 data loaded)
- [ ] Results heading shows a count > 0 (assuming data exists)
- [ ] `V1PathResetSetter` component is rendered (not `V2MapDataSetter`)
- [ ] Console shows `[search/page] V2 orchestration failed, falling back to v1` warning
- [ ] Map still functions (loads via independent V1 `/api/map-listings` path)
- [ ] No user-visible error banner or degradation notice

**Edge cases:**
- V2 times out (10s DATABASE timeout) then falls back to V1
- V2 returns partial error (non-throwing) then falls back
- Both V2 AND V1 fail: error boundary should catch
- V2 retry succeeds on second attempt: should use V2 data (no fallback)

**Console verification (optional):**
```typescript
const consoleWarnings: string[] = [];
page.on('console', msg => {
  if (msg.type() === 'warning' && msg.text().includes('V2 orchestration failed')) {
    consoleWarnings.push(msg.text());
  }
});
// After page load:
expect(consoleWarnings.length).toBeGreaterThan(0);
```

---

### Scenario 9: Loading skeleton during navigation
**Priority:** P2 | **Type:** LIVE | **Auth:** Anonymous

**Preconditions:**
- Next.js streaming/Suspense boundary active
- `loading.tsx` renders `SearchResultsSkeleton` during route transitions

**Steps:**
1. Navigate to home page `/`
2. Slow down network slightly: `network.setCondition('slow-4g')`
3. Navigate to `/search?minLat=37.7&maxLat=37.85&minLng=-122.52&maxLng=-122.35`
4. Immediately check for loading skeleton
5. Wait for actual results to appear

**Assertions:**
- [ ] `[aria-busy="true"][aria-label="Loading search results"]` container appears during transition
- [ ] Skeleton has animated pulse elements (visual placeholder cards)
- [ ] Skeleton disappears once results load
- [ ] Results heading and listing cards replace skeleton content
- [ ] No layout shift (skeleton occupies similar space to final content)

**Edge cases:**
- Very fast network: skeleton may flash briefly or not appear at all (acceptable)
- Very slow network: skeleton stays visible for extended period without timeout
- Navigation abort (user clicks back during load): no crash

**Note:** This test is inherently timing-sensitive. Use `{ timeout: 2000 }` for skeleton visibility check and accept that on fast connections, the skeleton may not be captured.

---

### Scenario 10: Slow network search with visible loading
**Priority:** P2 | **Type:** MOCK | **Auth:** Anonymous

**Preconditions:**
- Network can be throttled via CDP or route delay
- Search page is accessible

**Steps:**
1. Set network to slow-3g: `network.setCondition('slow-3g')`
2. Navigate to `/search?minLat=37.7&maxLat=37.85&minLng=-122.52&maxLng=-122.35`
   with extended timeout (60s)
3. Verify page eventually loads
4. Reset network: `network.reset()`

**Assertions:**
- [ ] Page does not show an error (server query completes within 10s DATABASE timeout)
- [ ] Body element is visible (page rendered, not blank)
- [ ] Search results or empty state eventually appear
- [ ] No unhandled JS errors captured via `page.on('pageerror')`
- [ ] Map panel eventually renders (or shows loading state gracefully)

**Edge cases:**
- Network so slow that 10s server timeout is hit: should fall to error boundary
- Slow network + "Load more" click: loading spinner visible, eventually resolves or shows error
- CDPSession not available on non-Chromium: test should skip gracefully

---

### Scenario 11: MapErrorBoundary catch and recovery
**Priority:** P1 | **Type:** MOCK | **Auth:** Anonymous

**Preconditions:**
- Desktop viewport (map only renders >= 768px)
- Mapbox can be made to fail

**Steps:**
1. Block Mapbox GL JS from loading:
   ```typescript
   await page.route('**/api.mapbox.com/**', route => route.abort('blockedbyclient'));
   ```
2. Navigate to `/search?minLat=37.7&maxLat=37.85&minLng=-122.52&maxLng=-122.35`
3. Wait for map panel to appear
4. Check for MapErrorBoundary fallback UI
5. Unblock Mapbox: `await page.unrouteAll()`
6. Click "Retry" button
7. Verify map attempts to recover

**Assertions:**
- [ ] "Map unavailable -- try refreshing" text visible in map panel
- [ ] "Retry" button visible and focusable
- [ ] Map panel maintains its layout dimensions (min-h-[300px])
- [ ] List results still load and function independently of map failure
- [ ] Clicking "Retry" clears the error boundary state (`hasError: false`)
- [ ] After retry, map either recovers (if resources now available) or shows error again

**Edge cases:**
- WebGL not available (headless CI): map may not render at all -- test should skip
- Mobile viewport (< 768px): map not rendered, test should skip
- Webkit browser: map has timing issues, test should skip

---

### Scenario 12: Error boundary full-page recovery
**Priority:** P1 | **Type:** MOCK | **Auth:** Anonymous

**Preconditions:**
- Error boundary can be triggered (requires server-side error or route mock)

**Steps:**
1. Intercept the search page to fail on first load:
   ```typescript
   let loadCount = 0;
   await page.route('**/search*', async route => {
     loadCount++;
     if (loadCount === 1 && route.request().resourceType() === 'document') {
       await route.fulfill({
         status: 500,
         contentType: 'text/html',
         body: '<html><body>Internal Server Error</body></html>',
       });
     } else {
       await route.continue();
     }
   });
   ```
2. Navigate to `/search`
3. Observe the error state (500 HTML or error boundary if RSC error)
4. Click "Try again" or manually reload
5. Verify page recovers on second attempt

**Assertions:**
- [ ] First load shows error (either browser error page or Next.js error boundary)
- [ ] Second load (after retry) shows normal search results
- [ ] No lingering error state after recovery
- [ ] URL remains `/search` (not redirected to error page)

**Edge cases:**
- "Try again" calls `reset()` which re-renders the server component
- If error persists on retry, error boundary re-displays (no infinite loop)
- "Go home" link navigates away from error state cleanly

**Implementation note:** Next.js error boundaries for server components behave differently from client-side error boundaries. The `reset()` function attempts to re-render the server component. Testing this requires the server error to be transient (succeed on retry). This is best verified by using a request counter in `page.route()`.

---

### Scenario 13: "Load more" error and retry
**Priority:** P2 | **Type:** MOCK | **Auth:** Anonymous

**Preconditions:**
- Initial search returns results with `nextCursor` (more pages available)
- "Load more" API can be intercepted

**Steps:**
1. Navigate to `/search?minLat=37.7&maxLat=37.85&minLng=-122.52&maxLng=-122.35`
2. Wait for initial results to render
3. Intercept the server action for fetchMoreListings to fail:
   ```typescript
   await page.route('**/search*', async route => {
     if (route.request().method() === 'POST') {
       await route.fulfill({
         status: 500,
         contentType: 'application/json',
         body: JSON.stringify({ error: 'Server error' }),
       });
     } else {
       await route.continue();
     }
   });
   ```
4. Click "Show more places" button
5. Verify error message appears
6. Remove the route intercept: `await page.unrouteAll()`
7. Click "Try again" link within the error message
8. Verify load more succeeds

**Assertions:**
- [ ] "Show more places" button becomes loading state (`aria-busy="true"`)
- [ ] On failure, red error text appears with the error message
- [ ] "Try again" link is visible within the error message
- [ ] Initial results remain visible (not cleared by the error)
- [ ] After retry, new results append below existing ones
- [ ] No duplicate listing IDs (deduplication via `seenIdsRef`)
- [ ] Loading state clears after both failure and success

**Edge cases:**
- Double-clicking "Show more" while loading: second click ignored (`isLoadingMore` guard)
- Error message shows actual error text from server (not generic)
- Cap reached (60 items): "Show more" button hidden, replaced with "Refine your filters" text

---

## Accessibility Requirements (all scenarios)

- [ ] Error states have `role="alert"` for screen reader announcement
- [ ] Loading states have `aria-busy="true"` and descriptive `aria-label`
- [ ] Retry/action buttons are keyboard accessible (Tab + Enter/Space)
- [ ] Focus management: after retry, focus returns to a logical element
- [ ] Error text has sufficient color contrast (red-600 on white, red-400 on dark)
- [ ] Screen reader live region (`aria-live="polite"`) announces result count changes
- [ ] Zero results empty state is announced to screen readers

---

## Test Infrastructure Notes

### Route interception patterns
```typescript
// Mock full-page SSR response (for error boundary testing)
await page.route('**/search*', async route => {
  if (route.request().resourceType() === 'document') {
    await route.fulfill({ status: 500, body: 'Error' });
  } else {
    await route.continue();
  }
});

// Mock API endpoint (for map/load-more testing)
await network.mockApiResponse('**/api/map-listings*', {
  status: 500,
  body: { error: 'Internal server error' },
});

// Transient error (fail once, then succeed)
let callCount = 0;
await page.route('**/api/search/v2*', async route => {
  callCount++;
  if (callCount <= 1) {
    await route.fulfill({ status: 500, body: '{"error":"fail"}' });
  } else {
    await route.continue();
  }
});
```

### Network condition helpers
```typescript
// Available via test fixture: network.setCondition(), network.goOffline(), etc.
await network.setCondition('slow-3g');   // 400kbps, 400ms latency
await network.setCondition('slow-4g');   // 2Mbps, 100ms latency
await network.goOffline();               // context.setOffline(true)
await network.goOnline();                // context.setOffline(false)
await network.simulateFlaky(0.3);        // 30% failure rate
await network.addLatency(2000);          // 2s delay on all requests
await network.forceApiError('**/api/**', 500);
```

### Browser compatibility
- **Chromium:** Full support (CDP throttling, all route interception)
- **Firefox:** Most tests work; CDP throttling unavailable (skip slow network tests)
- **WebKit:** Map tests should be skipped (rendering timing issues)
- **Mobile emulation:** Map tests should be skipped (map requires >= 768px viewport)

### Shared test config
```typescript
test.describe('Error States & Resilience', () => {
  test.use({
    storageState: { cookies: [], origins: [] },  // Anonymous
    viewport: { width: 1280, height: 800 },       // Desktop for map tests
  });

  // Skip on webkit/mobile
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name.includes('Mobile')) {
      test.skip(true, 'Error resilience tests require desktop viewport');
    }
  });
});
```

---

## Priority Summary

| Priority | Scenarios | Rationale |
|----------|-----------|-----------|
| **P0** | 1, 2, 6, 7, 8 | Core error paths that ~15% of users hit; trust-critical |
| **P1** | 3, 4, 5, 11, 12 | Important UX flows for error recovery and guidance |
| **P2** | 9, 10, 13 | Loading states and edge-case resilience; lower user impact |

---

## Blockers and Concerns

1. **Server-side mocking limitation:** Scenarios 6, 7, and 8 require mocking server-side behavior (Prisma queries, Redis rate limiter, V2 search service). Playwright can intercept HTTP but cannot mock server-side function calls. Two approaches:
   - Intercept the full document response via `page.route()` to serve error HTML
   - Use a test API endpoint that forces specific error conditions (requires app-level test hooks)

2. **V2/V1 fallback verification:** The V2-to-V1 fallback happens entirely server-side during SSR. The test can verify the *result* (page loads with data despite V2 failure) but not directly observe the fallback mechanism. Console log capture (`page.on('console')`) can partially verify this.

3. **Rate limit timing:** Server-side rate limiting uses Redis with sliding window. Test environments may not have Redis configured, or thresholds may be too high to trigger in tests. Recommend a test-environment override for rate limit thresholds.

4. **Loading skeleton timing:** The `loading.tsx` skeleton is shown during Next.js streaming/navigation. On fast local dev servers, it may appear for <100ms and be undetectable. This test is best-effort.

5. **SearchErrorBanner usage:** The `SearchErrorBanner` component is defined but its usage in the current search page flow is not evident in `SearchResultsClient` or `page.tsx`. It may be used in other flows or reserved for future use. Scenarios should verify the inline error pattern that IS used (the `loadError` state in SearchResultsClient).

---

## Dependencies on Existing Helpers

| Helper | Source | Used in Scenarios |
|--------|--------|-------------------|
| `network.mockApiResponse()` | `tests/e2e/helpers/network-helpers.ts` | 6, 7, 8, 11, 13 |
| `network.goOffline()` / `goOnline()` | `tests/e2e/helpers/network-helpers.ts` | 5 |
| `network.setCondition()` | `tests/e2e/helpers/network-helpers.ts` | 9, 10 |
| `network.forceApiError()` | `tests/e2e/helpers/network-helpers.ts` | 6, 13 |
| `tags.anon` | `tests/e2e/helpers/test-utils.ts` | All scenarios |
| `selectors.emptyState` | `tests/e2e/helpers/test-utils.ts` | 1, 2, 3 |
| `selectors.listingCard` | `tests/e2e/helpers/test-utils.ts` | 4, 8, 9, 13 |
| `SF_BOUNDS` | `tests/e2e/helpers/test-utils.ts` | 4, 8, 9, 10, 11, 13 |
| `timeouts.action` | `tests/e2e/helpers/test-utils.ts` | All scenarios |
