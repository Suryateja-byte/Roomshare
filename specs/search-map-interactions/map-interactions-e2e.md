# Test Plan: Map Interactions E2E (Gap Coverage)

**File**: `tests/e2e/map-interactions.anon.spec.ts`
**Scenario count**: 27
**Priority distribution**: P0 (10), P1 (10), P2 (7)
**Estimated runtime**: ~4 min (with WebGL skip fallbacks)

---

## Coverage Gap Analysis

### What existing tests already cover

| File | Scenarios | Coverage |
|------|-----------|----------|
| `map-loading.anon.spec.ts` | 1.1-1.5 | Load errors, markers display, persistence via E2E hooks, URL bounds init, no-bounds fallback |
| `map-pan-zoom.spec.ts` | 2.1-2.5 | Pan drag, scroll zoom, touch, double-click, debounce timing |
| `map-markers.anon.spec.ts` | 3.1-3.9 | Marker click/popup, cluster expansion, keyboard nav, ARIA, offset |
| `map-search-toggle.anon.spec.ts` | 4.1-4.7 | Toggle default, banner display, search-this-area click, reset, debounce, cache, abort |
| `map-style.anon.spec.ts` | 9.1-9.3 | Style buttons, sessionStorage, persistence across nav |
| `map-errors-a11y.anon.spec.ts` | 10.1-10.5, 11.1-11.5 | Empty state, network errors (skipped), invalid bounds, a11y checks |
| `map-features.anon.spec.ts` | 1.3, 1.5-1.8 | Hover smoke, drop pin, POI, style buttons, keyboard |

### What this plan covers (GAPS ONLY)

1. **Map-to-list scroll sync** -- `requestScrollTo()` -> `ListScrollBridge` -> `scrollIntoView` (not tested)
2. **Search as I move ON with result verification** -- existing test 2.1 has void assertions (no real check)
3. **"Search this area" with listing verification** -- existing test 4.3 checks URL only, not card refresh
4. **Map persistence across UI filter changes** -- existing test 1.3 depends on E2E hooks not all envs have
5. **Cluster merge/split at zoom thresholds** -- existing tests have void count assertions
6. **Stacked/overlapping marker popup** -- 3.9b/c are explicitly skipped; Map.tsx handles inline
7. **Map + sort order consistency** -- no verification markers are stable when sort changes
8. **Map bounds URL round-trip** -- verify bounds param -> map position -> new bounds param cycle
9. **DynamicMap lazy loading** -- deferred 944KB bundle not tested
10. **MapErrorBoundary fallback UI** -- render crash fallback not tested
11. **PrivacyCircle layer** -- circle layer presence not verified
12. **Location conflict banner** -- pan far from search query location (MapBoundsContext.locationConflict)

---

## User Stories

- [ ] As a user, I can click a map marker and see the matching listing card scroll into view in the list panel
- [ ] As a user, I can pan the map with "Search as I move" ON and see listing results auto-refresh
- [ ] As a user, I can click "Search this area" and see new listings for the visible map area
- [ ] As a user, I can change search filters and the map stays mounted (no re-initialization flash)
- [ ] As a user, I can zoom out and see markers cluster, zoom in and see them separate
- [ ] As a user, I can click overlapping markers and see a multi-listing popup
- [ ] As a user, I can change sort order and see the same markers remain on the map
- [ ] As a user, I can share a URL with map bounds and the recipient sees the same map area
- [ ] As a user, the map loads fast because the Mapbox bundle is deferred
- [ ] As a user, I see a friendly error screen if the map component crashes
- [ ] As a user, I see approximate locations (privacy circles) instead of exact pin placements
- [ ] As a user, I see a conflict warning when I pan far from my searched location

---

## Test Scenarios

### 1. Map + List Scroll Sync (ListScrollBridge)

#### 1.1 Marker click scrolls list to matching card (P0)

- **Preconditions**: Search page loaded with listings visible in both map and list; markers expanded from clusters
- **Mock/Live**: LIVE (needs real listings with `data-testid="listing-card-{id}"`)
- **Steps**:
  1. Navigate to `/search?minLat=37.7&maxLat=37.85&minLng=-122.52&maxLng=-122.35`
  2. Wait for map markers to render (use `zoomToExpandClusters` helper)
  3. Record the `aria-label` or listing ID of the first visible marker
  4. Scroll the list panel to the bottom (so the target card is NOT in view)
  5. Click the first map marker
  6. Wait 600ms for scroll animation
- **Assertions**:
  - The listing card with matching `data-testid="listing-card-{id}"` is visible in viewport
  - The card has a `ring-2` highlight class (active state)
- **Edge cases**:
  - Card not initially in DOM (virtualized) -- ListScrollBridge retries on next render
  - Rapid marker clicks -- only last clicked card should be scrolled to

#### 1.2 Marker hover triggers debounced scroll (P1)

- **Preconditions**: Markers visible, list panel with scrollable content
- **Mock/Live**: LIVE
- **Steps**:
  1. Navigate to search page with listings
  2. Expand clusters to show individual markers
  3. Hover (pointerenter, pointerType="mouse") over a marker
  4. Wait 300ms (hover scroll debounce from Map.tsx line 1755)
  5. Check if matching card scrolled into view
- **Assertions**:
  - After 300ms debounce, card with matching ID is in viewport or near it
  - Hovering off marker within 300ms cancels the scroll (no jank)
- **Edge cases**:
  - Touch device: `pointerType="touch"` should NOT trigger hover scroll (P1-FIX #114)

#### 1.3 List card highlight persists after popup close (P1)

- **Preconditions**: Marker clicked, popup open, card highlighted
- **Mock/Live**: LIVE
- **Steps**:
  1. Click a map marker to open popup and set activeId
  2. Verify card has `ring-2` highlight
  3. Close popup via Escape key
  4. Verify card STILL has `ring-2` highlight (activeId independent from selectedListing)
- **Assertions**:
  - Popup is closed
  - Card highlight ring persists (same as existing 3.8b but with explicit scroll verification)
- **Note**: Partially overlaps with 3.8b. Difference: this test also verifies the card was scrolled to.

---

### 2. Search as I Move ON -- Result Auto-Refresh

#### 2.1 Pan with toggle ON updates listings (P0)

- **Preconditions**: Search page loaded, "Search as I move" toggle ON (default)
- **Mock/Live**: LIVE (needs URL with bounds that have listings)
- **Steps**:
  1. Navigate to `/search?minLat=37.7&maxLat=37.85&minLng=-122.52&maxLng=-122.35`
  2. Wait for listing cards to render; record initial card count or first card title
  3. Verify toggle `aria-checked="true"`
  4. Pan map significantly (drag 30% of map width)
  5. Wait 1100ms (600ms debounce + 500ms buffer for URL update + fetch)
- **Assertions**:
  - URL `minLat`/`maxLat`/`minLng`/`maxLng` params have CHANGED (numeric comparison, not void)
  - Page still on `/search`
  - No critical console errors
- **Edge cases**:
  - Small pan may not change bounds enough to update -- use 30% drag distance

#### 2.2 Rapid pans with toggle ON coalesce into single update (P1)

- **Preconditions**: Toggle ON
- **Mock/Live**: MOCK `/api/search-count` to track call count
- **Steps**:
  1. Perform 3 rapid pan gestures with <100ms between each
  2. Wait for debounce + buffer
- **Assertions**:
  - URL updated at most once (debounce coalesces)
  - No console errors from rapid state updates

---

### 3. "Search This Area" -- Listing Verification

#### 3.1 Clicking "Search this area" updates listing cards (P0)

- **Preconditions**: Toggle OFF, map panned, banner visible with count
- **Mock/Live**: MOCK `/api/search-count` with count=15
- **Steps**:
  1. Navigate to search page
  2. Turn toggle OFF
  3. Pan map to move bounds
  4. Wait for banner to appear with "Search this area (15)"
  5. Record current listing card count
  6. Click "Search this area" button
  7. Wait for URL change + listing refresh
- **Assertions**:
  - Banner disappears after click
  - URL bounds have changed to match new map position
  - Page shows listing cards (count may differ from original)
  - "Search as I move" toggle state unchanged (still OFF)

#### 3.2 Reset button restores original listings (P0)

- **Preconditions**: Toggle OFF, map panned, banner visible
- **Mock/Live**: MOCK `/api/search-count`
- **Steps**:
  1. Navigate to search page; record initial URL
  2. Turn toggle OFF, pan map
  3. Wait for banner
  4. Click reset button (X icon, `aria-label="Reset map view"`)
  5. Wait for map fly-back animation (1500ms)
- **Assertions**:
  - Banner disappears
  - URL matches original URL
  - Map viewport returned to original bounds

---

### 4. Map Persistence Across Filter Changes

#### 4.1 Map stays mounted when price filter changes (P0)

- **Preconditions**: Search page with map visible
- **Mock/Live**: LIVE
- **Steps**:
  1. Navigate to `/search?minLat=37.7&maxLat=37.85&minLng=-122.52&maxLng=-122.35`
  2. Verify `.mapboxgl-canvas` is visible
  3. Apply a filter by navigating to `...&minPrice=500`
  4. Wait for page to update (2s)
- **Assertions**:
  - `.mapboxgl-canvas` is STILL visible (no unmount/remount flash)
  - No "Loading map..." placeholder appeared during transition
  - Map container maintained continuous visibility
- **Edge cases**:
  - Multiple rapid filter changes should not cause map to flicker

#### 4.2 Map stays mounted when query changes (P0)

- **Preconditions**: Search page with map visible
- **Mock/Live**: LIVE
- **Steps**:
  1. Navigate to `/search?q=Mission+District&<bounds>`
  2. Verify map canvas visible
  3. Navigate to `/search?q=Sunset+District&<bounds>`
  4. Wait 2s
- **Assertions**:
  - Map canvas visible throughout (PersistentMapWrapper in layout persists)
  - No full page reload indicator

---

### 5. Map Marker Clustering

#### 5.1 Zooming out creates cluster markers (P1)

- **Preconditions**: Search page with individual markers visible at high zoom
- **Mock/Live**: LIVE
- **Steps**:
  1. Navigate to search page
  2. Zoom in to expand clusters (use E2E hook `__e2eMapRef.jumpTo({ zoom: 14 })`)
  3. Count individual markers (`.mapboxgl-marker:visible`)
  4. Zoom out to level 10 programmatically
  5. Wait for cluster animation (700ms)
  6. Count markers again
- **Assertions**:
  - At zoom 14: individual marker count >= 1
  - At zoom 10: marker count may be DIFFERENT (clusters formed)
  - OR: cluster markers with numeric text content (e.g., "3", "5") appear
- **Edge cases**:
  - If only 1 listing exists, no clusters form -- skip gracefully

#### 5.2 Cluster click expands to show children (P1)

- **Preconditions**: Cluster markers visible (zoomed out)
- **Mock/Live**: LIVE
- **Steps**:
  1. Zoom out to create clusters
  2. Find a cluster marker (`.mapboxgl-marker:visible` with numeric-only text)
  3. Record zoom level via `__e2eMapRef.getZoom()`
  4. Click the cluster
  5. Wait 900ms (cluster animation + buffer)
- **Assertions**:
  - Zoom level increased OR marker count increased
  - Page no errors
- **Note**: Overlaps with 3.3 but with stronger zoom-level assertion.

---

### 6. Stacked/Overlapping Marker Popup

#### 6.1 Multiple listings at same coordinates show stacked popup (P1)

- **Preconditions**: Two or more listings with same/very close coordinates
- **Mock/Live**: LIVE (depends on seed data having co-located listings)
- **Steps**:
  1. Navigate to search page
  2. Zoom in to expand clusters
  3. Find markers that are visually overlapping (within 5px of each other)
  4. Click one of them
  5. Wait for popup
- **Assertions**:
  - Popup appears with either:
    - "View Details" button (single listing) OR
    - "N listings at this location" text (stacked popup)
  - If stacked: popup contains multiple listing items with prices and titles
- **Edge cases**:
  - If no overlapping listings in seed data, test should skip gracefully
  - Note: StackedListingPopup component exists but Map.tsx handles stacking inline

#### 6.2 Stacked popup item click scrolls to card (P2)

- **Preconditions**: Stacked popup open
- **Mock/Live**: LIVE
- **Steps**:
  1. Open stacked popup (if available)
  2. Click an individual listing item in the popup
  3. Wait for scroll
- **Assertions**:
  - Popup closes
  - Matching listing card scrolled into view and highlighted
- **Note**: Skip if no stacked markers available

---

### 7. Map + Sort Interaction

#### 7.1 Changing sort preserves map markers (P1)

- **Preconditions**: Search page with markers visible
- **Mock/Live**: LIVE
- **Steps**:
  1. Navigate to search page with bounds
  2. Wait for markers; record count of `.mapboxgl-marker:visible`
  3. Navigate to `...&sort=price_asc` (change sort via URL)
  4. Wait 2s for page update
- **Assertions**:
  - Map is still visible (`.mapboxgl-canvas` present)
  - Marker count has NOT changed (sort does not affect which listings are in bounds)
  - No "Loading map..." flash
- **Edge cases**:
  - PersistentMapWrapper's `MAP_RELEVANT_KEYS` excludes sort -- no re-fetch expected

#### 7.2 Sort change does not trigger map data re-fetch (P2)

- **Preconditions**: Search page loaded
- **Mock/Live**: MOCK `/api/map-listings` to track calls
- **Steps**:
  1. Navigate to search page
  2. Wait for initial map data fetch
  3. Record API call count
  4. Navigate to `...&sort=newest`
  5. Wait 3s (past the 2s throttle in PersistentMapWrapper)
- **Assertions**:
  - No additional `/api/map-listings` call made (PersistentMapWrapper filters out sort param)

---

### 8. Map Bounds URL Round-Trip

#### 8.1 URL bounds produce correct map viewport (P0)

- **Preconditions**: None
- **Mock/Live**: LIVE
- **Steps**:
  1. Navigate to `/search?minLat=37.76&maxLat=37.79&minLng=-122.44&maxLng=-122.41`
  2. Wait for map to load
  3. Read map center via `__e2eMapRef.getCenter()`
- **Assertions**:
  - Map center lat is between 37.76 and 37.79 (within bounds)
  - Map center lng is between -122.44 and -122.41 (within bounds)
  - Tolerance: 0.02 degrees
- **Note**: Similar to existing 1.4 but with E2E hook for reliable center access

#### 8.2 Map pan updates URL bounds correctly (P1)

- **Preconditions**: Toggle ON, search page loaded
- **Mock/Live**: LIVE
- **Steps**:
  1. Navigate with known bounds
  2. Record initial URL bounds (parse from query string)
  3. Pan map east (drag left)
  4. Wait for debounce + URL update (1100ms)
  5. Parse new URL bounds
- **Assertions**:
  - `minLng` and `maxLng` both INCREASED (panned east)
  - `minLat` and `maxLat` roughly unchanged (horizontal pan)
  - Bounds span (maxLng - minLng) approximately same as before (pan, not zoom)

#### 8.3 Shared URL shows same map area for different users (P2)

- **Preconditions**: None
- **Mock/Live**: LIVE
- **Steps**:
  1. Navigate to `/search?minLat=37.75&maxLat=37.80&minLng=-122.45&maxLng=-122.40`
  2. Wait for map load
  3. Copy the URL
  4. Open a new browser context
  5. Navigate to the copied URL
  6. Compare map centers (via `__e2eMapRef.getCenter()` in both contexts)
- **Assertions**:
  - Map centers within 0.01 degrees of each other
  - Both pages show listing cards

---

### 9. DynamicMap Lazy Loading

#### 9.1 Mapbox bundle is loaded lazily (P2)

- **Preconditions**: None
- **Mock/Live**: LIVE
- **Steps**:
  1. Navigate to `/` (homepage, no map)
  2. Collect all loaded JS chunk URLs via `page.on('response')`
  3. Verify no `mapbox-gl` chunk loaded
  4. Navigate to `/search?<bounds>` (has map)
  5. Wait for map to render
  6. Collect newly loaded JS chunks
- **Assertions**:
  - No `mapbox-gl` chunk in initial homepage load
  - `mapbox-gl` chunk loaded after navigating to search page
- **Edge cases**:
  - Next.js prefetching may load chunks early -- check `DynamicMap` is `lazy()` imported

#### 9.2 Map loading placeholder shows while bundle loads (P2)

- **Preconditions**: None
- **Mock/Live**: LIVE
- **Steps**:
  1. Throttle network to "Slow 3G" profile
  2. Navigate to search page
  3. Observe map area before Mapbox loads
- **Assertions**:
  - "Loading map..." text or loading skeleton visible before map canvas appears
  - Loading state resolves to actual map canvas
- **Note**: Timing-sensitive; may need network throttling to observe placeholder

---

### 10. Map Error Boundary

#### 10.1 Error boundary shows fallback UI (P1)

- **Preconditions**: None
- **Mock/Live**: MOCK (inject error via page.evaluate)
- **Steps**:
  1. Navigate to search page
  2. Wait for map to load
  3. Inject a render error into the map component via `page.evaluate`:
     - Set `window.__e2eMapRef = null` and force re-render, OR
     - Use `page.evaluate(() => { throw new Error('test crash') })` inside map container
  4. OR: Test the MapErrorBoundary component directly by verifying its static fallback
- **Assertions**:
  - Fallback UI renders: "Map unavailable -- try refreshing" text visible
  - "Retry" button visible
  - Rest of the page (listing cards, filters) still functional
- **Edge cases**:
  - Retry button click should attempt to re-render the map
  - NOTE: Simulating React render errors in E2E is difficult. Alternative approach:
    navigate with intentionally broken Mapbox token to trigger initialization failure

#### 10.2 MapErrorBanner shows on fetch failure (V1 path) (P2)

- **Preconditions**: V1 data path (no V2 context)
- **Mock/Live**: MOCK `/api/map-listings` to return 500
- **Steps**:
  1. Route `/api/map-listings*` to return `{ status: 500 }`
  2. Navigate to search page
  3. Wait for error banner
- **Assertions**:
  - `role="alert"` banner visible with "Server error" message
  - "Retry" button visible
  - Clicking Retry re-attempts the fetch
- **Note**: Only works in V1 mode. V2 mode provides data via context.

---

### 11. Privacy Circles

#### 11.1 Privacy circle layer renders for listings (P1)

- **Preconditions**: Map loaded with listings in bounds
- **Mock/Live**: LIVE
- **Steps**:
  1. Navigate to search page with bounds
  2. Wait for map to fully load (`__e2eMapRef` available)
  3. Query the Mapbox source via `page.evaluate`:
     ```js
     const map = window.__e2eMapRef;
     return map.getSource('privacy-circles') !== undefined;
     ```
- **Assertions**:
  - Source `privacy-circles` exists on the map
  - Layer `privacy-circles` exists on the map
- **Edge cases**:
  - If 0 listings in bounds, PrivacyCircle returns null (no source added)

#### 11.2 Privacy circles scale with zoom level (P2)

- **Preconditions**: Privacy circle layer rendered
- **Mock/Live**: LIVE
- **Steps**:
  1. Load map at zoom 12
  2. Query circle radius via `map.getPaintProperty('privacy-circles', 'circle-radius')`
  3. Zoom to 16
  4. Query circle radius again
- **Assertions**:
  - Circle radius at zoom 16 is larger than at zoom 12
  - Radius follows exponential interpolation (approx 3px at zoom 12, 48px at zoom 16)
- **Note**: The paint property is an expression, so we verify via `map.queryRenderedFeatures` instead

#### 11.3 Exact listing coordinates not exposed to DOM (P1)

- **Preconditions**: Markers visible
- **Mock/Live**: LIVE
- **Steps**:
  1. Load search page with listings
  2. Expand clusters
  3. Inspect marker elements for any data attributes containing raw coordinates
  4. Check popup content for exact lat/lng values
- **Assertions**:
  - No DOM element contains exact `lat`/`lng` coordinate values (to 6+ decimal places)
  - Marker positions may differ from listing's true coordinates (offset applied by `markerPositions` memo)
- **Edge cases**:
  - The Mapbox `transform` style on markers contains pixel coordinates, not geo coordinates -- this is fine

---

### 12. Location Conflict Banner

#### 12.1 Panning far from search location shows conflict warning (P2)

- **Preconditions**: Search with named location query (e.g., `q=Mission+District`)
- **Mock/Live**: LIVE
- **Steps**:
  1. Navigate to `/search?q=Mission+District&minLat=37.75&maxLat=37.77&minLng=-122.43&maxLng=-122.41`
  2. Turn "Search as I move" toggle OFF
  3. Pan map far enough that Mission District center (~37.76, -122.42) is outside viewport
  4. Wait for state update
- **Assertions**:
  - `locationConflict` state becomes true in MapBoundsContext
  - A location conflict banner or warning appears (distinct from regular "Search this area" banner)
  - Banner shows the original search location name
- **Edge cases**:
  - If search query does not resolve to coordinates (no `lat`/`lng` params), no conflict detection occurs
  - Conflict clears when toggle turned back ON or map reset

---

## Selectors Identified

| Element | Selector |
|---------|----------|
| Map container | `[data-testid="map"], .mapboxgl-map` |
| Map canvas | `.mapboxgl-canvas` |
| Map markers | `.mapboxgl-marker:visible` |
| Listing card | `[data-testid="listing-card"]` |
| Listing card by ID | `[data-testid="listing-card-{id}"]` |
| "Search as I move" toggle | `button[role="switch"]:has-text("Search as I move")` |
| "Search this area" button | `button:has-text("Search this area")` |
| Reset map button | `button[aria-label="Reset map view"]` |
| Map style radiogroup | `[role="radiogroup"][aria-label="Map style"]` |
| Map region | `[role="region"][aria-label="Interactive map showing listing locations"]` |
| Popup | `.mapboxgl-popup` |
| Popup close | `button[aria-label="Close listing preview"], button[aria-label="Close popup"]` |
| Stacked popup | `[data-testid="stacked-popup"]` |
| Stacked popup item | `[data-testid="stacked-popup-item-{id}"]` |
| Error boundary fallback | `text="Map unavailable"` |
| Error banner | `[role="alert"]` |
| Info banner | `[role="status"]` |
| Loading placeholder | `text="Loading map..."` |
| Gesture hint | `text="Pinch to zoom"` |
| Card highlight ring | `.ring-2` class on listing card |
| SR announcement | `.sr-only[role="status"][aria-live="polite"]` |

---

## E2E Hooks Used

| Hook | Purpose |
|------|---------|
| `window.__e2eMapRef` | Direct access to Mapbox GL instance (getCenter, getZoom, jumpTo, getSource, etc.) |
| `window.__e2eSetProgrammaticMove` | Flag moves as programmatic to prevent "Search as I move" URL updates |
| `window.__e2eUpdateMarkers` | Force marker re-render after programmatic zoom |
| `window.__roomshare.mapInstanceId` | Verify map instance persistence across navigation |
| `window.__roomshare.mapInitCount` | Verify map not re-initialized on filter change |

---

## Implementation Notes

### Test file structure

```
tests/e2e/map-interactions.anon.spec.ts
  - describe "Map + List Scroll Sync"
    - 1.1 Marker click scrolls list to matching card
    - 1.2 Marker hover triggers debounced scroll
    - 1.3 List card highlight persists after popup close
  - describe "Search as I Move - Result Refresh"
    - 2.1 Pan with toggle ON updates listings
    - 2.2 Rapid pans coalesce
  - describe "Search This Area - Listing Verification"
    - 3.1 Click updates listing cards
    - 3.2 Reset restores listings
  - describe "Map Persistence Across Filters"
    - 4.1 Price filter change
    - 4.2 Query change
  - describe "Map Marker Clustering"
    - 5.1 Zoom out creates clusters
    - 5.2 Cluster click expands
  - describe "Stacked Marker Popup"
    - 6.1 Overlapping markers show popup
    - 6.2 Popup item click scrolls to card
  - describe "Map + Sort Consistency"
    - 7.1 Sort preserves markers
    - 7.2 Sort does not trigger re-fetch
  - describe "Map Bounds URL Round-Trip"
    - 8.1 URL bounds produce correct viewport
    - 8.2 Pan updates URL correctly
    - 8.3 Shared URL same area
  - describe "DynamicMap Lazy Loading"
    - 9.1 Bundle loaded lazily
    - 9.2 Loading placeholder
  - describe "Map Error Boundary"
    - 10.1 Fallback UI
    - 10.2 Fetch failure banner
  - describe "Privacy Circles"
    - 11.1 Layer renders
    - 11.2 Scales with zoom
    - 11.3 Exact coords not exposed
  - describe "Location Conflict Banner"
    - 12.1 Panning far shows conflict warning
```

### Shared helpers to reuse

From existing test files:
- `waitForSearchPage(page)` -- goto + waitForLoadState + waitForTimeout
- `isMapAvailable(page)` -- check `.mapboxgl-canvas:visible`
- `waitForMarkersWithClusterExpansion(page)` -- zoom in via E2E hook
- `zoomToExpandClusters(page)` -- programmatic zoom without triggering search
- `waitForMapRef(page)` -- wait for `__e2eMapRef` to be exposed
- `getUrlBounds(url)` -- parse minLat/maxLat/minLng/maxLng from URL

New helpers needed:
- `getListingCardById(page, id)` -- find card via `data-testid="listing-card-{id}"`
- `isCardInViewport(page, id)` -- check if card is scrolled into visible area
- `getMarkerListingId(marker)` -- extract listing ID from marker's aria-label or data attributes

### WebGL skip strategy

All tests that interact with Mapbox markers or canvas must:
1. Check `isMapAvailable(page)` and skip if false
2. Check `waitForMapRef(page)` timeout and skip if false
3. Use informational annotations when skipping so CI reports explain why

### Test isolation

- Each test uses anonymous storage state (`storageState: { cookies: [], origins: [] }`)
- No cross-test dependencies
- API mocks reset per test via `page.route()` / `page.unroute()`

---

## Risks and Blockers

1. **WebGL in CI**: Headless Chromium without GPU will skip many map tests. Run with `--headed` or use `xvfb` for full coverage.
2. **Seed data**: Tests 6.1/6.2 (stacked popup) depend on seed data having co-located listings. If missing, tests skip gracefully.
3. **V2 data path**: Test 10.2 (fetch failure) only works in V1 mode. V2 mode provides map data via context, making API mocking ineffective.
4. **MapErrorBoundary testing**: Simulating React render errors in E2E is unreliable. Consider a unit test or integration test for the boundary component instead.
5. **Privacy circle assertion**: Verifying exact pixel radius in E2E is fragile. We verify layer existence and paint property expression structure instead.
