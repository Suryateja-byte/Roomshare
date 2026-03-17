# Roomshare Search Page — Complete Feature Report

> **Purpose:** Hand this to an AI (Claude/Gemini) to generate comprehensive user flow tests and edge case scenarios.
> **Generated:** 2026-03-16

---

## Architecture Overview

The search page (`/search`) is a hybrid SSR + client-side app with:
- **Server-rendered list results** (Next.js RSC)
- **Client-side map** (MapLibre, persistent across navigations)
- **Dual search engine:** Semantic (Gemini embeddings + pgvector) AND keyword (PostgreSQL FTS)
- **Two data paths:** V2 (SearchDoc table, single-table reads) and V1 (legacy multi-JOIN)

---

## 1. SEARCH BAR (Header)

### 1.1 WHAT Field (Semantic AI Search)
- Natural language input: "sunny room with parking", "quiet place near park"
- Only visible when `NEXT_PUBLIC_ENABLE_SEMANTIC_SEARCH=true`
- URL param: `what=` (also sets `q=` to same value)
- Triggers vector similarity search via Gemini embeddings
- Min 3 characters required, sort must be "recommended"

### 1.2 WHERE Field (Location)
- Autocomplete location input with geocoding suggestions
- User MUST select from dropdown to get coordinates
- Typing without selecting shows warning: "Select a location from the dropdown"
- URL params: `q=` (location text), `lat=`, `lng=` (coordinates)
- Coordinates converted to ~30km bounding box

### 1.3 BUDGET Fields (Min/Max Price)
- Two inline number inputs
- Auto-swaps if min > max on submit
- URL params: `minPrice`, `maxPrice` (canonical); `minBudget`, `maxBudget` (aliases)
- Max safe price: 1,000,000,000

### 1.4 Use My Location Button
- Geolocation API with 10s timeout
- States: loading (spinner), success (auto-submits), error (toast with specific message)
- Dispatches `mapFlyToLocation` custom event

### 1.5 Natural Language Parser
- Extracts filters from free-text: "under $1000" → maxPrice=1000, "private room" → roomType, "furnished" → amenities, "pet friendly" → houseRules, "month to month" → leaseDuration
- Only fires when user types location without selecting from autocomplete

### 1.6 Recent Searches
- Stored in localStorage
- Shown as dropdown when focusing location input
- Each entry has remove button; "Clear all" button
- Saved on form submission with location

### 1.7 Keyboard Shortcuts
- `Cmd+K` / `Ctrl+K`: Focus search input
- `M`: Toggle map/list view
- `Escape`: Close dropdowns/modals

### 1.8 Search Debouncing
- 300ms debounce on form submissions
- Duplicate search prevention via `lastSearchRef`

---

## 2. CATEGORY BAR

Horizontally scrollable row of 8 quick-filter buttons:

| Category | Maps To |
|----------|---------|
| Entire Place | `roomType=ENTIRE_PLACE` |
| Private Room | `roomType=PRIVATE` |
| Pet Friendly | `houseRules=Pets allowed` |
| Furnished | `amenities=Furnished` |
| Short Term | `leaseDuration=MONTH_TO_MONTH` |
| Under $1000 | `maxPrice=1000` |
| Shared Room | `roomType=SHARED` |
| Wifi | `amenities=Wifi` |

- Toggle behavior (click on = apply, click off = remove)
- Resets pagination on click
- Scroll arrows appear on overflow

---

## 3. RECOMMENDED FILTER PILLS

- Shows up to 5 contextual suggestions above results
- Only shows filters NOT already applied
- Options: Furnished, Pet Friendly, Wifi, Parking, Washer, Private Room, Entire Place, Month-to-month, Under $1000, Couples OK
- Resets pagination on click

---

## 4. APPLIED FILTER CHIPS

- Renders removable chip for each active URL filter
- Types: price range, move-in date, room type, lease duration, amenities (one each), house rules (one each), languages (one each), gender preference, household gender
- "Clear all" button preserves: `q`, `lat`, `lng`, bounds, `sort`
- Horizontal scroll on mobile with fade edge

---

## 5. FILTER MODAL (Drawer)

Right-side slide-out drawer with sections:

### 5.1 Price Range Slider
- Dual-thumb Radix slider with histogram overlay
- Step sizes: 10 (≤$1000), 25 (≤$5000), 50 (>$5000)
- Default range: $0–$10,000

### 5.2 Move-in Date
- DatePicker: YYYY-MM-DD, today to +2 years
- Past dates rejected

### 5.3 Lease Duration
- Options: Any, Month-to-month, 3 months, 6 months, 12 months, Flexible
- Aliases supported: `mtm`, `month_to_month`, `6_months`, `1_year`

### 5.4 Room Type
- Options: Any, Private Room, Shared Room, Entire Place
- Facet counts shown; zero-count options disabled
- Aliases: `private`, `shared`, `entire`, `whole`, `studio`

### 5.5 Minimum Open Spots
- Stepper control: 2–10 or "Any"

### 5.6 Amenities Grid
- Wifi, AC, Parking, Washer, Dryer, Kitchen, Gym, Pool, Furnished
- Facet counts; zero-count disabled

### 5.7 House Rules Grid
- Pets allowed, Smoking allowed, Couples allowed, Guests allowed
- Facet counts; zero-count disabled

### 5.8 Languages Filter
- Searchable input + chip selection
- Normalized language codes

### 5.9 Gender Preference
- Any, Male Identifying Only, Female Identifying Only, Any Gender / All Welcome

### 5.10 Household Gender
- Any, All Male, All Female, Mixed (Co-ed)

### 5.11 Dynamic Count Button
- Footer "Show Results" shows live count (debounced)
- Amber when count=0
- Zero state: warning banner with removable filter suggestions

### 5.12 Clear All / Apply
- Clear all resets filters; Apply commits and navigates

---

## 6. SORT OPTIONS

| Option | URL Value | Notes |
|--------|-----------|-------|
| Recommended | `sort=recommended` (default, omitted from URL) | Uses semantic ranking when available |
| Price: Low to High | `sort=price_asc` | |
| Price: High to Low | `sort=price_desc` | |
| Newest First | `sort=newest` | |
| Top Rated | `sort=rating` | |

- Resets pagination on change
- Mobile: bottom sheet dialog
- Desktop: Radix Select dropdown

---

## 7. LIST VIEW

### 7.1 Results Grid
- 1 column mobile, 2 columns sm+
- Keyed by `searchParamsString` — any param change remounts (resets all state)
- `role="feed"` for accessibility

### 7.2 Listing Card Features
- Image carousel (swipeable, with dots)
- Title, city/state, price/mo
- Amenity badges (up to 2)
- Language badge (first + count)
- Slot availability badge
- Multi-room badge
- Rating/review badge or "New" label
- Favorite (heart) button
- "Show on map" pin button
- Hover: shadow + ring; Active from map: indigo ring

### 7.3 Total Price Toggle
- When lease ≥ 2 months, toggle between per-month and total price
- Persisted in sessionStorage

### 7.4 Card-Map Coordination
- Hover card → highlight map marker
- Click pin button → fly map to listing + highlight
- Click map marker → highlight card in list

### 7.5 Screen Reader Announcements
- `aria-live="polite"` announces result counts on render

---

## 8. PAGINATION (Load More)

### 8.1 Load More Button
- "Show more places" below results
- Only when `nextCursor` exists AND accumulated < 60

### 8.2 Cursor-Based Pagination
- Server action: `fetchMoreListings(cursor, rawParams)`
- Default page size: 12 items
- Max accumulated: 60 items (client cap)

### 8.3 Deduplication
- `seenIdsRef` (Set) filters duplicates across pages

### 8.4 Cap Message
- At 60 items with more available: "Showing 60 results. Refine your filters to narrow down."

### 8.5 End of Results
- When no more cursor: "You've seen all N results"

### 8.6 Error Handling
- Error alert with "Try again" button
- Rate limit gets friendly message

---

## 9. ZERO RESULTS STATE

### 9.1 Smart Suggestions
- Server action `getFilterSuggestions()` returns which filters to remove
- Removable suggestion pills
- "Try a different area" links
- "Expand search area" doubles bounds
- "Clear all filters" and "Browse all" buttons

### 9.2 Bounds-Required Error
- When `q` exists but no geographic bounds
- Friendly page: "Please select a location"

---

## 10. MAP VIEW

### 10.1 Persistent Map
- Lives in layout (not page) — stays mounted across navigations
- MapLibre GL JS, lazy-loaded
- 55% list / 45% map split on desktop

### 10.2 Map Toggle
- "Show map" / "Hide map" button (desktop)
- Preference persisted in localStorage
- `M` keyboard shortcut

### 10.3 Map Markers
- Individual pins (< 50 listings) or clusters (≥ 50)
- Cluster numbers show count
- Click cluster → zoom in
- Click pin → show popup with listing preview
- Highlighted pin when card is hovered in list
- Max markers: 200

### 10.4 Search as I Move
- Toggle on map: green = ON (default per session)
- When ON: list + map auto-update on pan/zoom
- When OFF: "Search this area (N)" banner appears
- 600ms debounce on area count; 30s client cache

### 10.5 Map Data Fetching
- V1 path: Client fetches `/api/map-listings` with 250ms debounce
- V2 path: Data from SSR via context
- Spatial LRU cache (20 entries)
- Viewport hysteresis: 90% overlap skips refetch
- Bounds padded 20% for pre-fetch
- When semantic search active: text query stripped from map (shows all in bounds)

### 10.6 Map Error States
- Loading: thin animated bar at top
- Error: amber banner + retry button
- Rate limit: auto-retry with Retry-After header
- "No listings in this area" + Zoom out button

### 10.7 Map Controls
- Zoom +/- buttons
- Drop pin for custom location
- Fullscreen toggle
- Layer toggles: Transit, POIs, Parks
- MapLibre attribution

---

## 11. MOBILE EXPERIENCE

### 11.1 Bottom Sheet
- 3 snap points: collapsed (~15vh), half (~50vh), expanded (~85vh)
- Default: half
- Drag handle for gesture control
- Flick velocity detection (0.4 px/ms threshold)
- Rubber-band effect at edges
- Interactive elements excluded from drag
- Keyboard accessible: Arrow keys, Enter/Space, Home/End, Escape

### 11.2 Body Scroll Lock
- Locked when expanded or during drag
- Released on orientation change to desktop

### 11.3 Z-Index Management
- Expanded: z-1200 (above header z-1100)
- Not expanded: z-40

### 11.4 Pull-to-Refresh
- Only in expanded state
- 60px pull threshold
- Arrow indicator + spinner

### 11.5 Floating Map Button
- Centered pill at bottom: "Map" or "List - N"
- Toggles between map view and list view
- Haptic feedback
- Safe-area padding for notched devices

### 11.6 Mobile Search Overlay
- Full-screen slide-up when tapping collapsed search bar
- Shows search input + recent searches
- Focus-trapped, body scroll locked

### 11.7 Collapsed Mobile Header
- Compact search bar replacing full form on scroll
- Click to expand or open filters

---

## 12. SEMANTIC SEARCH ENGINE

### 12.1 Embedding Generation
- Provider: Google Gemini (`gemini-embedding-2-preview`)
- Dimensions: 768 (L2-normalized)
- Task types: `RETRIEVAL_DOCUMENT` (listings) and `RETRIEVAL_QUERY` (searches)
- Multimodal: text + up to 5 images per listing

### 12.2 Hybrid Search (Semantic + Keyword)
- Reciprocal Rank Fusion (RRF) combines semantic and keyword rankings
- Formula: `score = semantic_weight * 1/(k + semantic_rank) + (1 - semantic_weight) * 1/(k + keyword_rank)`
- Default weight: 60% semantic, 40% keyword
- RRF constant k=60
- Minimum similarity threshold: ≥0.25 cosine similarity (filters out irrelevant results)

### 12.3 Query Cache
- In-memory LRU: 100 entries, 5-minute TTL
- Prevents redundant Gemini API calls
- Cache keys include model name

### 12.4 Fallback Chain
- Semantic search fails → falls back to FTS (keyword)
- FTS fails → falls back to LIKE queries (V1)

---

## 13. SAVE SEARCH

- Bookmark icon button opens modal
- Name input (auto-generated default)
- Email alert toggle: Instant / Daily / Weekly
- Server action: `saveSearch()`

---

## 14. SPLIT STAY SUGGESTIONS

- When lease ≥ 6 months and no single listing covers full period
- Shows pairs of listings that together cover the duration
- Two half-width cards side by side with connecting arc
- Combined total price displayed

---

## 15. LOADING & TRANSITION STATES

### 15.1 Search Transition
- Floating "Updating results..." pill during filter/sort changes
- Content dimmed with translucent overlay
- `aria-busy="true"` on container
- "Still loading..." after 6 seconds

### 15.2 Map Transition
- Translucent overlay with "Updating..." pill
- Data loading bar (thin animated)
- Stale-while-revalidate: previous markers stay visible during fetch

### 15.3 Focus Management
- On filter change: focus moves to `#search-results-heading`
- Screen reader announcement when transition completes

---

## 16. ACCESSIBILITY

- Skip link: "Skip to search results"
- All interactive elements keyboard accessible
- Bottom sheet: `role="slider"` with aria-valuemin/max/now
- Results grid: `role="feed"`
- Screen reader live regions for result counts
- Focus trapping in modals/drawers
- WCAG-compliant color contrast

---

## 17. URL PARAMETERS — COMPLETE REFERENCE

| Parameter | Type | Default | Validation |
|-----------|------|---------|------------|
| `q` | string | - | Max 200 chars |
| `what` | string | - | Semantic search signal |
| `minPrice` / `maxPrice` | number | - | 0 to 1B |
| `minBudget` / `maxBudget` | number | - | Aliases for price |
| `amenities` | string[] | - | Allowlist, max 20 |
| `moveInDate` | string | - | YYYY-MM-DD, today to +2yr |
| `leaseDuration` | string | - | Allowlist + aliases |
| `houseRules` | string[] | - | Allowlist, max 20 |
| `languages` | string[] | - | Normalized codes, max 20 |
| `roomType` | string | - | Allowlist + aliases |
| `genderPreference` | string | - | MALE_ONLY, FEMALE_ONLY, NO_PREFERENCE |
| `householdGender` | string | - | ALL_MALE, ALL_FEMALE, MIXED |
| `bookingMode` | string | - | Valid modes |
| `minSlots` | number | - | 1-20 |
| `nearMatches` | boolean | - | true/false |
| `minLat` / `maxLat` | number | - | -90 to 90 |
| `minLng` / `maxLng` | number | - | -180 to 180 |
| `lat` / `lng` | number | - | Point → ~30km bbox |
| `page` | number | 1 | 1 to 100 |
| `sort` | string | recommended | 5 options |
| `cursor` | string | - | Keyset or legacy |

---

## 18. KEY CONSTANTS & THRESHOLDS

| Constant | Value | Purpose |
|----------|-------|---------|
| `DEFAULT_PAGE_SIZE` | 12 | Items per page |
| `MAX_ACCUMULATED` | 60 | Client-side listing cap |
| `MAX_MAP_MARKERS` | 200 | Max map pins |
| `CLUSTER_THRESHOLD` | 50 | Switch pins → clusters |
| `SEARCH_DEBOUNCE_MS` | 300 | Form submit debounce |
| `MAP_FETCH_DEBOUNCE_MS` | 250 | Map data fetch debounce |
| `AREA_COUNT_DEBOUNCE_MS` | 600 | Area count debounce |
| `AREA_COUNT_CACHE_TTL_MS` | 30000 | Area count cache (30s) |
| `MAP_FETCH_TIMEOUT_MS` | 15000 | Map fetch timeout (15s) |
| `FETCH_BOUNDS_PADDING` | 0.2 | 20% bounds pre-fetch |
| `SPATIAL_CACHE_MAX_ENTRIES` | 20 | Map LRU cache entries |
| `SLOW_TRANSITION_MS` | 6000 | "Still loading" threshold |
| `SEMANTIC_MIN_SIMILARITY` | 0.25 | Min cosine similarity |
| `SEMANTIC_WEIGHT` | 0.6 | 60% semantic, 40% keyword |
| `QUERY_CACHE_TTL` | 300000 | Embedding cache (5min) |
| `QUERY_CACHE_MAX` | 100 | Embedding cache entries |
| `LAT_OFFSET_KM` | 30 | Default geo radius |
| `DRAG_THRESHOLD` | 40px | Bottom sheet drag min |
| `FLICK_VELOCITY` | 0.4 px/ms | Bottom sheet flick |

---

## 19. EDGE CASES TO TEST

### Search
- Empty query with no bounds → browse mode (48 capped results)
- Query with no location selected → "Please select a location" page
- Very long query (200+ chars) → truncated
- Special characters in query → sanitized
- Inverted price range (min > max) → silently cleared
- Past move-in date → rejected

### Pagination
- Double-click "Load more" → debounce guard prevents double-fetch
- Stale cursor after filter change → component remounts, cursor reset
- Reach 60-item cap with more results available → cap message
- Reach end of results → "You've seen all N" message

### Map
- Pan map with "Search as I move" ON → list + map update
- Pan map with "Search as I move" OFF → banner with count
- Zoom out beyond max span (60° lat) → clamped
- Antimeridian crossing → handled in bounds calculation
- Rate limited → auto-retry with Retry-After

### Filters
- Apply filter that yields 0 results → zero state with suggestions
- Apply all possible filters simultaneously → works
- Remove single filter from multi-filter state → correct update
- Filter aliases (e.g., `mtm` = `month_to_month`) → resolved
- Array params via CSV vs repeated → both work

### Mobile
- Drag bottom sheet from collapsed → half → expanded
- Flick gesture (fast swipe) → snaps to next position
- Scroll list to top in expanded sheet, then drag down → collapses
- Rotate device during expanded sheet → body scroll unlock
- Interactive elements in sheet (buttons, links) → not captured by drag

### Semantic Search
- Short query (< 3 chars) → falls back to FTS
- Sort ≠ recommended → semantic disabled, FTS only
- Gemini API rate limited → falls back to FTS gracefully
- Completely irrelevant query → filtered by 0.25 threshold
- Map with semantic query → shows all in bounds (query stripped)
