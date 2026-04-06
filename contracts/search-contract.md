# Search Page Contract

> Generated 2026-04-05 | Covers `/search` route, layout, and all imported components

---

## 1. UI INVENTORY

### Page-Level Architecture

```
SearchLayout (layout.tsx) — persistent across /search navigations
├── SkipLink (sr-only → "#search-results")
├── <header> (fixed, z-1100, backdrop-blur)
│   └── SearchHeaderWrapper
│       ├── FULL FORM (desktop, visible when not scrolled)
│       │   ├── Logo (Link → "/")
│       │   ├── SearchForm (Suspense-wrapped)
│       │   │   ├── "What" input (semantic search, if enabled)
│       │   │   ├── LocationSearchInput ("Where")
│       │   │   ├── BudgetInput (min/max price)
│       │   │   ├── Search button (submit)
│       │   │   └── Filters button (badge with active count)
│       │   └── Right Actions (lg:)
│       │       ├── NotificationCenter
│       │       ├── Messages link + unread-badge
│       │       └── ProfileDropdown | AuthButtons (login/join)
│       ├── COLLAPSED BAR (mobile default / desktop on scroll)
│       │   └── CollapsedMobileSearch (tap to expand)
│       ├── COMPACT PILL (desktop collapsed)
│       │   └── CompactSearchPill (click → scroll to top)
│       └── MobileSearchOverlay (full-screen, portal)
│
├── SearchTransitionProvider
│   └── FilterStateProvider
│       └── MobileSearchProvider
│           └── MapBoundsProvider
│               └── ActivePanBoundsProvider
│                   └── ListingFocusProvider
│                       └── SearchV2DataProvider
│                           └── SearchLayoutView
│                               ├── ListScrollBridge (invisible, returns null)
│                               ├── SearchMapUIProvider
│                               │   └── SearchViewToggle
│                               │       ├── MOBILE (md:hidden)
│                               │       │   ├── Map (absolute background)
│                               │       │   ├── MobileBottomSheet (draggable overlay)
│                               │       │   │   └── [page children]
│                               │       │   └── FloatingMapButton (bottom pill)
│                               │       └── DESKTOP (hidden md:flex)
│                               │           ├── LEFT: List (60% / 100%)
│                               │           │   └── [page children]
│                               │           ├── RIGHT: Map (40%, conditional)
│                               │           ├── "Hide map" button
│                               │           └── "Show map" button (when hidden)
│                               └── MapMovedBanner (conditional)

SearchPage (page.tsx) — re-renders on URL param change
├── V1PathResetSetter (invisible, resets V2 context)
└── SearchResultsLoadingWrapper (transition overlay)
    └── <div> max-w-[840px] mx-auto
        ├── CategoryBar (scrollable pills)
        ├── RecommendedFilters ("Try: Parking, Washer...")
        ├── AppliedFilterChips (removable chips + clear all)
        ├── Results Header Row
        │   ├── <h1> "{total} places in {q}"
        │   ├── Browse mode hint (conditional)
        │   ├── SaveSearchButton (bookmark icon + modal)
        │   └── SortSelect (dropdown / mobile sheet)
        └── SearchResultsErrorBoundary
            └── SearchResultsClient
                ├── SR Announcements (role="status", role="log")
                ├── TotalPriceToggle (conditional, multi-month)
                ├── Zero Results State (icon + suggestions)
                │   ├── SuggestedSearches (recent / popular areas)
                │   └── Filter suggestions
                └── Results Grid (role="feed", 1col mobile / 2col desktop)
                    ├── ListingCard × N (memoized, per-card error boundary)
                    │   ├── ImageCarousel + gradient overlay
                    │   ├── Badge Stack (SlotBadge, TrustBadge, MultiRoom, TopRated/Rating/New)
                    │   ├── Title, Location, Price
                    │   ├── Amenity/Language tags
                    │   ├── Map pin button (top-right)
                    │   └── FavoriteButton (heart)
                    ├── NearMatchSeparator (role="separator", amber divider)
                    ├── SplitStayCard × N (dual listing, multi-month)
                    └── Load More Section
                        ├── Progress text ("Showing X of ~Y")
                        ├── Load More button
                        ├── Cap message (60 limit)
                        ├── Error alert + retry
                        └── End-of-results footer
```

### Modal / Overlay Components

| Component | Trigger | z-index | Portal |
|---|---|---|---|
| FilterModal | Filters button in SearchForm | 1000 | body |
| SaveSearchButton modal | "Save Search" click | 1000 | inline |
| SortSelect mobile sheet | Sort button (mobile) | 50 | inline |
| MobileSearchOverlay | Tap collapsed search bar | 1200 | inline |
| MobileBottomSheet | Always present (mobile) | — | inline |
| Map Popup | Map marker click | — | maplibre |

### Mobile Bottom Sheet Snap Points

| Snap | Height | Behavior |
|---|---|---|
| Collapsed | ~15% viewport | Map fully visible, list header only |
| Expanded | ~85% viewport | List fills screen, map peek at top |

---

## 2. DATA MAP

### Server-Side Data (SSR in page.tsx)

| Data | Source | Function | Notes |
|---|---|---|---|
| `listings` (initial) | DB via Prisma/raw SQL | `executeSearchV2()` → `getSearchDocListingsPaginated()` | V2 with V1 fallback; circuit breaker + timeout |
| `total` | Same query (hybrid count) | Exact if <=100, `null` if >100 | `null` means "100+ results" |
| `initialNextCursor` | V2 keyset cursor or V1 | HMAC-signed JSON `{id, k[], s}` | |
| `nearMatchExpansion` | V2 near-match logic | Triggered when <5 results on page 1 | e.g. "+-$500 price range" |
| `searchParamsString` | URL params minus cursor/page | Serialized for client "Load more" | |
| `normalizedKeyString` | Canonical filter params | Used as React `key` for SearchResultsClient | Quantized bounds (3dp) |
| Rate limit check | Redis (or DB fallback) | `checkServerComponentRateLimit("search-ssr", 120/min)` | |

### Client-Side Data Sources

| Component | Data | Source | Mechanism |
|---|---|---|---|
| SearchResultsClient | `extraListings` | Server action `fetchMoreListings()` | Cursor pagination, dedup via `seenIdsRef` |
| SearchResultsClient | `resolvedSavedListingIds` | `GET /api/favorites?ids=...` | Fetched once per unique ID set |
| SearchResultsClient | `resolvedFilterSuggestions` | Server action `getFilterSuggestions()` | Only when `hasConfirmedZeroResults` |
| SearchResultsClient | `showTotalPrice` | `sessionStorage` | Persisted per session |
| PersistentMapWrapper | `listings` (map markers) | `GET /api/map-listings?bounds&filters` | Debounced 250ms, spatial cache (LRU 50, TTL 5min) |
| PersistentMapWrapper | V2 map data | `SearchV2DataContext` | From SSR (currently dead code path) |
| SearchHeaderWrapper | `currentUnreadCount` | `GET /api/messages?view=unreadCount` | Polled every 30s with exp backoff |
| FilterModal | facet counts | `GET /api/search/facets?filters` | Via `useFacets` hook (debounced, cached) |
| FilterModal | result preview count | `GET /api/search-count?filters` | Via `useDebouncedFilterCount` |
| FilterChipWithImpact | impact delta | `useFil terImpactCount` hook | Fetched on hover only |
| CategoryBar | active categories | URL `searchParams` | Derived from current URL |
| AppliedFilterChips | chips | URL `searchParams` via `urlToFilterChips()` | Validated against allowlists |
| SortSelect | current sort | URL `sort` param | Default: "recommended" |
| SaveSearchButton | filter snapshot | URL `searchParams` via `parseSearchParams()` | |
| SuggestedSearches | recent searches | `useRecentSearches()` hook | Browser storage |
| MapBoundsContext | `areaCount` | `POST /api/search/area-count` | Debounced 300ms, LRU cache 50, TTL 5min |
| MapMovedBanner | banner state | `useMapMovedBanner()` | Derived from MapBoundsContext |
| ListingCard | focus state | `ListingFocusContext` | `hoveredId`, `activeId`, `focusSource` |

### Context State Flow

```
URL Params (source of truth for filters/sort/bounds)
    │
    ├──→ page.tsx SSR (parseSearchParams → DB query → initial listings)
    ├──→ PersistentMapWrapper (reads params → fetches /api/map-listings)
    ├──→ CategoryBar (reads params → derives active categories)
    ├──→ AppliedFilterChips (reads params → urlToFilterChips)
    ├──→ SortSelect (reads sort param)
    └──→ FilterStateContext (pending vs committed filter state)

SearchTransitionContext
    └──→ isPending, isSlowTransition (React 18 transitions)
         └──→ SearchResultsLoadingWrapper (dim + spinner)

FilterStateContext
    └──→ pending: FilterParams (live as user edits)
    └──→ committed: FilterParams (applied to URL)
         └──→ useBatchedFilters hook (bridge: pending ↔ URL)

ListingFocusContext (split: state vs actions)
    ├──→ hoveredId → ListingCard highlight + Map marker highlight
    ├──→ activeId → Map popup + mobile sheet collapse
    ├──→ scrollRequest → ListScrollBridge (invisible scroll executor)
    └──→ focusSource → "map"|"list" (300ms auto-clear, prevents loops)

MapBoundsContext (split: state vs actions)
    ├──→ hasUserMoved → MapMovedBanner visibility
    ├──→ boundsDirty → "Search this area" button
    ├──→ areaCount → banner label ("Search this area (23)")
    └──→ isProgrammaticMove → suppress banner during flyTo

SearchMapUIContext
    └──→ pendingFocus → ListingCard "View on Map" → Map flyTo + popup

SearchV2DataContext
    └──→ isV2Enabled, v2MapData → V1PathResetSetter clears on every render

MobileSearchContext
    └──→ isExpanded → SearchHeaderWrapper collapsed/expanded toggle
```

---

## 3. EVENT MAP

### Navigation & Search

| Event | Component | Handler | Effect |
|---|---|---|---|
| Form submit | SearchForm | `handleSearch()` | `router.push(/search?...)` with transition |
| Location selected | LocationSearchInput | `onPlaceSelected()` | Sets lat/lng/bounds + triggers search |
| Sort change | SortSelect | `handleSortChange(sort)` | URL update (reset pagination), transition |
| Category pill click | CategoryBar | `handleSelect(params)` | Toggle URL params, reset pagination, transition |
| Recommended filter click | RecommendedFilters | `handleClick(suggestion)` | Append filter to URL, transition |
| Filter chip remove | AppliedFilterChips | `handleRemove(chip)` | `removeFilterFromUrl()` → router.push |
| Clear all filters | AppliedFilterChips | `handleClearAll()` | Strip all filters, keep q/bounds/sort |
| Filter modal apply | FilterModal | `onApply()` | Commit pending filters → URL update |
| Filter modal clear | FilterModal | `onClearAll()` | Reset all filter state |
| "Search this area" | MapMovedBanner | `onSearch()` | Update URL bounds to match map viewport |
| "Reset map" | MapMovedBanner | `onReset()` | Reset map to URL-defined bounds |

### Pagination & Loading

| Event | Component | Handler | Effect |
|---|---|---|---|
| "Load More" click | SearchResultsClient | `handleLoadMore()` | Server action `fetchMoreListings(cursor, rawParams)` → dedup → append |
| Rate limited response | SearchResultsClient | (inside handleLoadMore) | Shows "please wait ~30s" error |
| Degraded response | SearchResultsClient | (inside handleLoadMore) | Shows V2-unavailable message |
| Error boundary retry | SearchResultsErrorBoundary | `onClick` | Reset error + increment `retryKey` (full remount) |

### Map Interactions

| Event | Component | Handler | Effect |
|---|---|---|---|
| Pan/zoom | Map.tsx | `onViewStateChange()` | Updates MapBoundsContext (hasUserMoved, boundsDirty) |
| Marker click | Map.tsx | `onSelectedListingChange(id)` | Sets `activeId` in ListingFocusContext → mobile sheet collapses |
| Marker click | Map.tsx | internal | `requestScrollTo(id)` → ListScrollBridge scrolls card into view |
| Marker hover | Map.tsx | `setHovered(id, "map")` | ListingCard highlights |
| Cluster click | Map.tsx | internal | Zoom to cluster bounds |
| "View on Map" button | ListingCard | `focusListingOnMap(id)` | SearchMapUIContext → Map flyTo + popup; shows map if hidden |
| Toggle map (desktop) | SearchLayoutView | `toggleMap()` | `useMapPreference` toggle + localStorage |
| Toggle map (keyboard) | SearchLayoutView | `M` key | Same as above |
| `Cmd+K` / `Ctrl+K` | SearchHeaderWrapper | keydown | Focus location input |

### List ↔ Map Sync

| Event | Component | Handler | Effect |
|---|---|---|---|
| Card mouseenter/focus | ListingCard | `setHovered(id, "list")` | Map marker highlights (no scroll/zoom) |
| Card mouseleave/blur | ListingCard | `setHovered(null)` | Map marker un-highlights |
| Card map-pin click | ListingCard | `setActive(id)` | Map flies to listing, opens popup |
| Map marker click | Map.tsx | `setActive(id)` + `requestScrollTo(id)` | ListScrollBridge scrolls card into view |
| Map marker hover | Map.tsx | `setHovered(id, "map")` | ListingCard highlights |
| `focusSource` timeout | ListingFocusContext | 300ms auto-clear | Prevents hover→scroll→hover feedback loops |

### Mobile-Specific

| Event | Component | Handler | Effect |
|---|---|---|---|
| FloatingMapButton tap | FloatingMapButton | `onToggle()` + `triggerHaptic()` | Toggle bottom sheet snap (collapsed ↔ expanded) |
| Sheet drag | MobileBottomSheet | gesture handler | Snap based on velocity (flick) or position |
| Escape key | MobileBottomSheet | keydown | Collapse to half position |
| `activeId` changes | SearchViewToggle | useEffect | Collapse sheet (snap=0) on mobile |
| Filter change | SearchViewToggle | useEffect on filterParamsKey | Reset sheet to expanded (snap=1) |
| Tap collapsed search bar | CollapsedMobileSearch | `onExpand()` | Opens MobileSearchOverlay |

### Save & Favorite

| Event | Component | Handler | Effect |
|---|---|---|---|
| Save search open | SaveSearchButton | `handleOpen()` | Generates default name, opens modal |
| Save search submit | SaveSearchButton | `handleSave()` | Server action `saveSearch(...)` → toast |
| Alert toggle | SaveSearchButton | toggle click | `alertEnabled` state toggle |
| Alert frequency | SaveSearchButton | button group | `alertFrequency`: INSTANT/DAILY/WEEKLY |
| Favorite toggle | FavoriteButton | click | Optimistic UI + `POST /api/favorites` |
| Favorite 401 | FavoriteButton | response handler | Redirect to `/login`, revert optimistic |

### Scroll & Resize

| Event | Component | Handler | Effect |
|---|---|---|---|
| Window scroll | SearchHeaderWrapper | `useScrollHeader(threshold: 80)` | Collapses header on scroll-down |
| Window resize | CategoryBar | ResizeObserver | Updates `canScrollLeft`/`canScrollRight` fade edges |
| Category scroll | CategoryBar | scroll event (passive) | Updates fade edge visibility |
| Bottom sheet drag | MobileBottomSheet | pointer/touch events | Rubber-band + spring animation |
| Price toggle | TotalPriceToggle | `handleToggle()` | `showTotalPrice` state + sessionStorage persist |

---

## 4. AUTH DEPENDENCIES

### Server-Side Auth Enforcement

| Feature | File | Check | Unauthenticated Behavior |
|---|---|---|---|
| Save search | `app/actions/saved-search.ts:113` | `auth()` → `session?.user?.id` | Returns `{error: "Unauthorized"}` |
| Get saved searches | `app/actions/saved-search.ts:171` | `auth()` | Returns empty array `[]` |
| Delete saved search | `app/actions/saved-search.ts:201` | `auth()` | Returns `{error: "Unauthorized"}` |
| Toggle search alert | `app/actions/saved-search.ts:231` | `auth()` | Returns `{error: "Unauthorized"}` |
| Update search name | `app/actions/saved-search.ts:263` | `auth()` | Returns `{error: "Unauthorized"}` |

### Client-Side Auth Branching

| Component | Hook | Logged-In | Guest |
|---|---|---|---|
| SearchHeaderWrapper | `useSession()` | Profile dropdown + messages link + unread badge | Login/Join buttons |
| SearchHeaderWrapper | `useSession()` | Polls `/api/messages?view=unreadCount` every 30s | No polling |
| BottomNavBar | `useSession()` | Auth-aware nav items | Auth-aware nav items |
| FavoriteButton | Fetch 401 detection | Optimistic toggle + API call | Optimistic toggle → 401 → redirect to `/login` |
| SaveSearchButton | (no client check) | Modal opens, save succeeds | Modal opens, save fails server-side with "Unauthorized" |

### No Auth Required (public)

- Initial search results (SSR)
- "Load more" pagination (server action)
- Map listings fetch
- Facet counts
- Search count
- Filter operations
- Sort operations
- Category navigation
- Browse mode

---

## 5. INTEGRATION POINTS

### API Routes Called

| Route | Method | Called By | Purpose | Rate Limit |
|---|---|---|---|---|
| `/api/search/v2` | GET | SSR (page.tsx) + client | Unified search (list + map) | `search-v2` bucket |
| `/api/map-listings` | GET | PersistentMapWrapper | Map marker data | `map` bucket |
| `/api/search/facets` | GET | useFacets hook (FilterModal) | Amenity/rule/roomType counts + price histogram | `search-count` bucket |
| `/api/search-count` | GET | useDebouncedFilterCount | Preview count for "Show N results" button | — |
| `/api/search/area-count` | POST | MapBoundsContext | Listing count in current viewport | — |
| `/api/favorites` | GET | SearchResultsClient | Hydrate saved listing IDs | — |
| `/api/favorites` | POST | FavoriteButton | Toggle favorite | — |
| `/api/messages` | GET | SearchHeaderWrapper (polling) | Unread message count | — |

### Server Actions

| Action | File | Called By | Purpose |
|---|---|---|---|
| `fetchMoreListings(cursor, rawParams)` | `app/search/actions.ts` | SearchResultsClient "Load More" | Cursor-based pagination (V2 + V1 fallback) |
| `saveSearch(...)` | `app/actions/saved-search.ts` | SaveSearchButton | Persist saved search + alert config |
| `getFilterSuggestions(filterParams)` | (server action) | SearchResultsClient | Suggestions on zero results |

### Database Queries (SearchDoc Path)

| Query | Table | PostGIS | Index |
|---|---|---|---|
| Bounds filter | `listing_search_docs` | `location_geog && ST_MakeEnvelope(...)::geography` | GIST on `location_geog` |
| Antimeridian bounds | `listing_search_docs` | Split into eastern + western envelope | GIST |
| Full-text search | `listing_search_docs` | — | GIN on `search_tsv` |
| FTS ranking | `listing_search_docs` | — | `ts_rank_cd(search_tsv, query)` |
| Amenities (AND) | `listing_search_docs` | — | GIN on `amenities_lower` (`@>`) |
| Languages (OR) | `listing_search_docs` | — | GIN on `household_languages_lower` (`&&`) |
| House rules (AND) | `listing_search_docs` | — | GIN on `house_rules_lower` (`@>`) |
| Price range | `listing_search_docs` | — | B-tree on `price` |
| Room type | `listing_search_docs` | — | B-tree (`LOWER()`) |
| Hybrid count | subquery `LIMIT 101` | — | Exact if <=100, `null` if >100 |
| Facet aggregation | `listing_search_docs` | — | `GROUP BY` with sticky filtering |
| Price histogram | `listing_search_docs` | — | Adaptive bucket width |

### Database Queries (Legacy Path)

| Query | Tables | PostGIS |
|---|---|---|
| List search | `Listing` + `Location` JOIN + `Review` LEFT JOIN | `ST_Intersects(coords, ST_MakeEnvelope(...))` |
| Map listings | Same | `ST_X(coords::geometry)`, `ST_Y(coords::geometry)` |

### Pagination Strategies

| Strategy | When Used | Mechanism |
|---|---|---|
| Keyset (cursor) | `features.searchKeyset && cursor` | HMAC-signed cursor `{id, k[], s}`; composite WHERE clause |
| Offset | Legacy / first page / semantic fallback | `LIMIT $limit OFFSET $(page-1)*limit` |
| Hybrid count | Always | `SELECT COUNT(*) FROM (... LIMIT 101)` — exact <=100, null >100 |

### Caching Layers

| Layer | TTL | Scope |
|---|---|---|
| CDN (`s-maxage`) | 60s (search), 15s (count) | Public, same params = same response |
| Browser (`max-age`) | 30s | Per-client |
| `stale-while-revalidate` | 120s (search), 30s (count) | Serve stale while refreshing |
| `unstable_cache` | 60s (list/map/count), 30s (facets) | Server-side, per-query |
| Spatial cache (client) | LRU 50 entries, 5min TTL | PersistentMapWrapper |
| Area count cache (client) | LRU 50 entries, 5min TTL | MapBoundsContext |
| `fetchedFavIdsRef` (client) | Session lifetime | Prevents re-fetch of known favorite IDs |

### Circuit Breaker

| Breaker | Target | Behavior |
|---|---|---|
| `circuitBreakers.searchV2` | `executeSearchV2()` in SSR + server action | Opens after 3 consecutive failures; skips V2 entirely (instant V1 fallback) |

### Feature Flags

| Flag | Env Var | Effect |
|---|---|---|
| `features.searchV2` | — | Enable V2 search orchestration |
| `features.searchDoc` | `ENABLE_SEARCH_DOC=true` | Use denormalized `listing_search_docs` table |
| `features.searchKeyset` | Derived from `CURSOR_SECRET` | Enable cursor-based pagination |
| `features.semanticSearch` | `ENABLE_SEMANTIC_SEARCH=true` | Vector similarity search |
| `features.softHoldsEnabled` | `ENABLE_SOFT_HOLDS=on` | Deduct held slots from availability |
| `features.nearbyPlaces` | `RADAR_SECRET_KEY` | Enable nearby places feature |

### External Services

| Service | Used By | Purpose |
|---|---|---|
| MapLibre GL / Mapbox | Map.tsx (via DynamicMap) | Map rendering, tiles, clustering |
| Sentry | Error boundaries, V2 failures | Error capture with tags/context |
| Redis | Rate limiting | Per-user/IP request throttling |

---

## 6. TEST SELECTORS

### Search Components

| `data-testid` | Component | Element | Purpose |
|---|---|---|---|
| `empty-state` | SearchResultsClient | `<div>` | Zero results container |
| `search-results-container` | SearchViewToggle | `<div>` | Desktop list wrapper |
| `mobile-search-results-container` | SearchViewToggle | `<div>` | Mobile list wrapper |
| `mobile-filter-button` | CollapsedMobileSearch | `<button>` | Collapsed mobile filter toggle |

### Filter Components

| `data-testid` | Component | Element | Purpose |
|---|---|---|---|
| `filter-modal-clear-all` | FilterModal | `<button>` | Clear all filters |
| `filter-modal-apply` | FilterModal | `<button>` | Apply filters |
| `filter-chips` | MapEmptyState | `<div>` | Filter chips container |
| `filter-chip` | MapEmptyState | `<button>` | Individual filter chip |
| `filter-suggestions` | MapEmptyState | `<div>` | Suggested filters container |
| `suggestion-pill` | MapEmptyState | `<button>` | Individual suggestion pill |

### Listing Card Components

| `data-testid` | Component | Element | Purpose |
|---|---|---|---|
| `listing-card` | ListingCard | `<article>` | Main card container |
| `listing-card-${id}` | (ListScrollBridge ref) | `<article>` | Dynamic per-card selector for scroll targeting |
| `listing-price` | ListingCard | `<span>/<div>` | Price display (multiple instances per card) |
| `slot-badge` | SlotBadge | `<span>/<div>` | Available slots badge |

### Map Components

| `data-testid` | Component | Element | Purpose |
|---|---|---|---|
| `map-pin-${tier}-${listingId}` | Map.tsx | `<div>` | Map marker (tier: "primary"\|"mini") |
| `map-preview-card` | Map.tsx | `<div>` | Preview card on marker interaction |
| `search-toggle-indicator` | Map.tsx | `<div>` | Map view toggle indicator |
| `sheet-overlay` | MobileBottomSheet | `<div>` | Bottom sheet backdrop |
| `sheet-header-text` | MobileBottomSheet | `<div>` | Bottom sheet header text |

### Navigation & Header

| `data-testid` | Component | Element | Purpose |
|---|---|---|---|
| `unread-badge` | SearchHeaderWrapper | `<span>` | Unread messages notification |
| `user-menu` | SearchHeaderWrapper | `<button>` | Profile dropdown trigger |
| `bottom-nav` | BottomNavBar | `<nav>` | Bottom navigation bar |

### Nearby & Other

| `data-testid` | Component | Element | Purpose |
|---|---|---|---|
| `results-area` | NearbyPlacesPanel | `<div>` | Nearby places results |
| `loading-skeleton` | NearbyPlacesPanel | `<div>` | Loading skeleton |
| `featured-listings-section` | FeaturedListingsClient | `<section>` | Featured listings |
| `report-listing-label` | ReportButton | `<label>` | Report listing label |
| `report-listing` | ReportButton | `<button>` | Report listing button |
| `char-counter` | CharacterCounter | `<span>` | Character count display |

### Data Attributes (non-testid, used by tests/JS)

| Attribute | Component | Purpose |
|---|---|---|
| `data-listing-card-id={id}` | ListingCard | Card identification for ListScrollBridge |
| `data-listing-id={id}` | ListingCard | Listing ID reference |
| `data-mobile-variant={variant}` | ListingCard | "feed" or "default" layout variant |
| `data-focus-state={state}` | ListingCard | "active", "hovered", or "none" |

---

## Appendix A: Key Constants

```typescript
DEFAULT_PAGE_SIZE = 12
MAX_ACCUMULATED = 60          // Client-side listing cap
MAX_MAP_MARKERS = 200         // Map marker limit
HYBRID_COUNT_THRESHOLD = 100  // Exact count below, null above
MAX_QUERY_LENGTH = 200
MAX_ARRAY_ITEMS = 20
MAX_SAFE_PAGE = 100
MAX_SAFE_PRICE = 1_000_000_000
BOUNDS_EPSILON = 0.001        // ~100m precision for bounds quantization
MAP_FETCH_MAX_LAT_SPAN = 60
MAP_FETCH_MAX_LNG_SPAN = 130
CLUSTER_THRESHOLD = 50        // pins (<50) vs geojson (>=50)
BASE_POLL_INTERVAL = 30_000   // Unread messages polling (ms)
```

## Appendix B: ARIA / Accessibility

| Pattern | Component | Implementation |
|---|---|---|
| Skip link | SkipLink | sr-only → `#search-results` |
| Results feed | SearchResultsClient | `role="feed"` + `aria-busy` |
| Live announcements | SearchResultsClient | `role="status"` + `role="log"` (aria-live="polite") |
| Applied filters region | AppliedFilterChips | `role="region"` aria-label |
| Category nav | CategoryBar | `role="navigation"` + `aria-pressed` on pills |
| Near match separator | NearMatchSeparator | `role="separator"` + aria-label |
| Save search modal | SaveSearchButton | `role="dialog"` + aria-modal + focus trap |
| Alert toggle | SaveSearchButton | `role="switch"` + aria-checked |
| Filter chip remove | FilterChip | `aria-label="Remove filter: {label}"` + 44px touch target |
| Sort sheet | SortSelect | Body scroll lock + focus trap |
| Bottom sheet | MobileBottomSheet | `role="region"` + Escape key collapse |
| Listing card | ListingCard | aria-label with price/rating/slots/location/amenities |

## Appendix C: Keyboard Shortcuts

| Shortcut | Scope | Action |
|---|---|---|
| `M` | Search page (not in inputs) | Toggle map visibility |
| `Cmd+K` / `Ctrl+K` | Global | Focus location input |
| `Escape` | Filter modal / sort sheet / save modal / bottom sheet | Close / collapse |
| `Arrow Up/Down` | Profile dropdown menu | Navigate items |
| `Home/End` | Profile dropdown menu | Jump to first/last |
| `Enter/Space` | Filter checkboxes, sort options | Toggle / select |
