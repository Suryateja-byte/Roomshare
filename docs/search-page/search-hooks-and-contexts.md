# Search Hooks & Context Providers

Comprehensive reference for all React hooks and context providers powering the Roomshare search page.

---

## Table of Contents

- [Context Providers](#context-providers)
  - [SearchV2DataContext](#searchv2datacontext)
  - [FilterStateContext](#filterstatecontext)
  - [SearchTransitionContext](#searchtransitioncontext)
  - [MapBoundsContext](#mapboundscontext)
  - [SearchMapUIContext](#searchmapuicontext)
  - [ListingFocusContext](#listingfocuscontext)
  - [MobileSearchContext](#mobilesearchcontext)
- [Hooks](#hooks)
  - [useBatchedFilters](#usebatchedfilters)
  - [useDebouncedFilterCount](#usedebouncedfiltercount)
  - [useFilterImpactCount](#usefilterimpactcount)
  - [useFacets](#usefacets)
  - [useRecentSearches](#userecentsearches)
  - [useNearbySearchRateLimit](#usenearbysearchratelimit)
  - [useMapPreference](#usemappreference)
  - [useScrollHeader](#usescrollheader)
  - [useKeyboardShortcuts](#usekeyboardshortcuts)
  - [useAbortableServerAction](#useabortableserveraction)
  - [useNetworkStatus](#usenetworkstatus)
  - [useRateLimitHandler](#useratelimithandler)
- [Utilities](#utilities)
  - [rate-limit-client](#rate-limit-client)

---

## Context Providers

### SearchV2DataContext

**File**: `/mnt/d/Documents/roomshare/src/contexts/SearchV2DataContext.tsx`

**Purpose**: Shares V2 map data (GeoJSON/pins) between the page component (list side) and the `PersistentMapWrapper` (map side) without prop drilling. This enables sibling component data sharing across the search layout.

#### Context Shape

| Field | Type | Description |
|-------|------|-------------|
| `v2MapData` | `V2MapData \| null` | GeoJSON FeatureCollection + optional pins + rendering mode |
| `setV2MapData` | `(data: V2MapData \| null, version?: number) => void` | Versioned setter that rejects stale data |
| `isV2Enabled` | `boolean` | Whether V2 search mode is active |
| `setIsV2Enabled` | `(enabled: boolean) => void` | Toggle V2 mode |
| `dataVersion` | `number` | Monotonically increasing version counter |

#### V2MapData Shape

```ts
interface V2MapData {
  geojson: SearchV2GeoJSON;       // FeatureCollection for Mapbox clustering
  pins?: SearchV2Pin[];            // Tiered pins for sparse results (<50)
  mode: SearchV2Mode;             // 'geojson' | 'pins'
}
```

#### Internal Logic

- **Stale data prevention**: The provider tracks a `dataVersionRef` ref. When filter-relevant URL params change OR bounds change, it clears `v2MapData` and increments the version. Callers pass the version when setting data; if the version does not match the current one, the write is silently rejected.
- **Filter-relevant keys** (lines 18-31): `q`, `minPrice`, `maxPrice`, `amenities`, `moveInDate`, `leaseDuration`, `houseRules`, `languages`, `roomType`, `genderPreference`, `householdGender`, `nearMatches`.
- **Bounds keys** (line 42): `minLat`, `maxLat`, `minLng`, `maxLng`.
- **Separate effects**: Two `useEffect` hooks (lines 97-110 and 115-127) track filter params and bounds separately, both clearing stale data and incrementing version on change.

```ts
// Version-guarded setter (lines 130-137)
const setV2MapData = (data: V2MapData | null, version?: number) => {
  if (version !== undefined && version !== dataVersionRef.current) {
    return; // Reject stale data
  }
  setV2MapDataInternal(data);
};
```

#### Hooks

- `useSearchV2Data()` -- returns the full context value (lines 160-162).

#### Consumers

- **V2MapDataSetter**: Injects map data from `page.tsx` after server fetch.
- **PersistentMapWrapper**: Reads map data and skips legacy v1 fetch when available.

---

### FilterStateContext

**File**: `/mnt/d/Documents/roomshare/src/contexts/FilterStateContext.tsx`

**Purpose**: Shares pending filter state (dirty flag, change count, drawer open/close) across the search layout so components outside the filter drawer can react to uncommitted changes (e.g., showing a "Pending changes" banner).

#### Context Shape

| Field | Type | Description |
|-------|------|-------------|
| `isDirty` | `boolean` | Whether pending filters differ from URL |
| `changeCount` | `number` | Number of individual filter changes |
| `isDrawerOpen` | `boolean` | Whether filter drawer is open |
| `setDirtyState` | `(isDirty: boolean, changeCount: number) => void` | Update dirty state |
| `setDrawerOpen` | `(isOpen: boolean) => void` | Update drawer open state |
| `openDrawer` | `() => void` | Trigger drawer open (reads from ref) |
| `registerOpenDrawer` | `(callback: () => void) => void` | Register the open callback |

#### Internal Logic

- Uses a **ref-based callback registration** pattern for `openDrawer` to avoid infinite re-render loops. `SearchForm` registers its open callback via `registerOpenDrawer` (lines 62-64), and consumers call `openDrawer` which reads from the ref (lines 67-69).
- Context value is memoized with `useMemo` (lines 72-91) to prevent unnecessary consumer re-renders.

#### Hooks

- `useFilterState()` -- throws if used outside provider (lines 112-118).
- `useFilterStateSafe()` -- returns `null` if outside provider (lines 104-106).

#### Consumers

- **SearchForm**: Calls `setDirtyState`, `setDrawerOpen`, `registerOpenDrawer`.
- **SearchLayoutView**: Reads `isDirty`, `changeCount` to show pending-changes banner.

---

### SearchTransitionContext

**File**: `/mnt/d/Documents/roomshare/src/contexts/SearchTransitionContext.tsx`

**Purpose**: Wraps React's `useTransition` to coordinate navigation transitions across search components. Keeps current results visible while new data loads instead of showing a blank page flash.

#### Context Shape

| Field | Type | Description |
|-------|------|-------------|
| `isPending` | `boolean` | Whether a transition is in progress |
| `isSlowTransition` | `boolean` | Whether transition exceeds 6s threshold |
| `navigateWithTransition` | `(url: string, options?) => void` | `router.push` inside transition |
| `replaceWithTransition` | `(url: string, options?) => void` | `router.replace` inside transition (no history entry) |
| `startTransition` | `TransitionStartFunction` | Raw React `startTransition` for custom logic |
| `retryLastNavigation` | `(() => void) \| null` | Replay the last navigation (available only during slow transitions) |

#### Internal Logic

- **Slow transition detection** (lines 61-74): A `setTimeout` fires after `SLOW_TRANSITION_THRESHOLD_MS` (6000ms from `@/lib/constants`). If `isPending` is still true, `isSlowTransition` is set to `true`. This resets when the transition completes.
- **Scroll preservation**: Both `navigateWithTransition` (lines 76-85) and `replaceWithTransition` (lines 87-96) default `scroll: false` to maintain the user's scroll position during filter changes.
- **History hygiene**: `replaceWithTransition` uses `router.replace` to avoid polluting browser history (used for map panning).
- **Retry mechanism** (lines 58, 99-109): Stores last navigation details (URL, method, scroll) in a ref. When slow transition occurs, `retryLastNavigation` callback becomes available to replay the navigation.

#### Hooks

- `useSearchTransition()` -- throws if outside provider (lines 131-139).
- `useSearchTransitionSafe()` -- returns `null` if outside provider (lines 145-147).

#### Consumers

- **SearchForm**: Navigates with transition on filter apply.
- **Map.tsx**: Uses `replaceWithTransition` for bounds updates.
- **SearchResultsClient**: Shows loading overlay based on `isPending`, displays retry UI when `isSlowTransition` is true.

---

### MapBoundsContext

**File**: `/mnt/d/Documents/roomshare/src/contexts/MapBoundsContext.tsx`

**Purpose**: The most complex context in the search system. Tracks map movement state, bounds dirty tracking, "search as I move" toggle, location conflict detection, and area count fetching. Enables the "Map moved -- results not updated" banner to appear both on the map overlay and above the list results.

#### Context Shape

| Field | Type | Description |
|-------|------|-------------|
| `hasUserMoved` | `boolean` | User manually panned/zoomed (not programmatic) |
| `boundsDirty` | `boolean` | Map bounds differ from URL bounds |
| `searchAsMove` | `boolean` | Auto-search toggle (default `true`) |
| `isProgrammaticMove` | `boolean` | Current movement is from `flyTo`/`fitBounds`/`easeTo` |
| `searchLocationName` | `string \| null` | Original search location from `q` param |
| `searchLocationCenter` | `PointCoords \| null` | Geocoded center of search location |
| `locationConflict` | `boolean` | Map viewport no longer contains search location |
| `areaCount` | `number \| null` | Listing count in current map area (`null` = 100+) |
| `isAreaCountLoading` | `boolean` | Whether area count is fetching |
| `searchCurrentArea` | `() => void` | Trigger search with current map bounds |
| `resetToUrlBounds` | `() => void` | Reset map to URL bounds |
| `setProgrammaticMove` | `(value: boolean) => void` | Set with auto-clear timeout |
| `setHasUserMoved` | `(value: boolean) => void` | Guards against programmatic moves |
| `setCurrentMapBounds` | `(bounds: MapBoundsCoords \| null) => void` | Update current map viewport |
| `isProgrammaticMoveRef` | `RefObject<boolean>` | Synchronous ref for Mapbox event handlers |
| ... | | Several other setters for search location, handlers, etc. |

#### Type Definitions

```ts
interface MapBoundsCoords {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

interface PointCoords {
  lat: number;
  lng: number;
}
```

#### Internal Logic

- **Programmatic move guard** (lines 194-211): `setProgrammaticMove(true)` sets both state and a ref, then auto-clears after `PROGRAMMATIC_MOVE_TIMEOUT_MS` (2500ms from `@/lib/constants`). `setHasUserMoved(true)` checks the ref (lines 217-227) and rejects if programmatic. This prevents the "map moved" banner from appearing during `flyTo` animations.
- **Route change detection** (lines 149-179): On URL change, compares non-bounds params. If only bounds changed (from map panning), resets dirty state but keeps handlers. If other params changed (true navigation), resets everything.
- **Area count fetching** (lines 279-376): When `hasUserMoved && boundsDirty && !searchAsMove` (line 277), fetches `/api/search-count` with current map bounds. Uses `AREA_COUNT_DEBOUNCE_MS` (600ms) debounce, `AbortController`, `AREA_COUNT_CACHE_TTL_MS` (30s) cache, and `rateLimitedFetch` from `rate-limit-client.ts`. Only one request in-flight at a time.
- **Location conflict** (lines 259-266): Computed via `useMemo` -- checks if `searchLocationCenter` is within `currentMapBounds` using `isPointInBounds()`.

```ts
const areaCountEnabled = hasUserMoved && boundsDirty && !searchAsMove;
```

#### Hooks

- `useMapBounds()` (lines 434-462) -- returns full context with safe SSR defaults.
- `useMapMovedBanner()` (lines 468-497) -- derived hook for banner display logic:
  - `showBanner`: bounds dirty + user moved + search-as-move OFF + no location conflict.
  - `showLocationConflict`: location conflict + search-as-move OFF (takes priority).
  - Also returns `areaCount` and `isAreaCountLoading`.

#### Consumers

- **Map.tsx**: Source of truth -- calls setters on `moveend`, `zoomend`.
- **SearchLayoutView**: Shows inline "map moved" banner.
- **MapOverlayBanner**: Shows floating banner on the map.

---

### SearchMapUIContext

**File**: `/mnt/d/Documents/roomshare/src/contexts/SearchMapUIContext.tsx`

**Purpose**: Coordinates "View on map" actions from listing cards to the map component. When a user clicks "View on map" on a `ListingCard`, this context stores a pending focus request, opens the map if hidden, and the map consumes the request to fly to the marker and open a popup.

#### Context Shape

| Field | Type | Description |
|-------|------|-------------|
| `pendingFocus` | `{ listingId: string; nonce: number } \| null` | Current focus request |
| `focusListingOnMap` | `(listingId: string) => void` | Request focus (auto-opens map if hidden) |
| `acknowledgeFocus` | `(nonce: number) => void` | Clear request if nonce matches |
| `clearPendingFocus` | `() => void` | Force clear |
| `registerDismiss` | `(fn: () => void) => void` | Map registers popup dismiss handler |
| `dismiss` | `() => void` | Dismiss popups before navigation |

#### Internal Logic

- **Nonce deduplication** (lines 61-74): Each `focusListingOnMap` call increments a nonce. Rapid clicks only honor the latest request. `acknowledgeFocus` only clears if the nonce matches (lines 76-78).
- **Auto-open map** (lines 69-71): If `shouldShowMap` is false when focus is requested, calls `showMap()` (passed as a prop to the provider).
- **No timeout**: `pendingFocus` persists until the map acknowledges it or a new request replaces it.
- **Dismiss handler** (lines 84-90): `registerDismiss` stores handler in ref; `dismiss` calls it before navigation.

#### Provider Props

```ts
interface SearchMapUIProviderProps {
  children: React.ReactNode;
  showMap: () => void;        // From useMapPreference
  shouldShowMap: boolean;     // From useMapPreference
}
```

#### Hooks

- `useSearchMapUI()` (lines 121-135) -- returns no-op fallback if outside provider (safe for non-search pages).
- `usePendingMapFocus()` (lines 140-144) -- convenience hook for Map.tsx (returns only `pendingFocus`, `acknowledgeFocus`, `clearPendingFocus`).

---

### ListingFocusContext

**File**: `/mnt/d/Documents/roomshare/src/contexts/ListingFocusContext.tsx`

**Purpose**: Enables two-way hover/selection sync between listing cards and map markers. Hovering a card highlights the map marker; clicking a map marker scrolls to and highlights the card.

#### Context Shape

| Field | Type | Description |
|-------|------|-------------|
| `hoveredId` | `string \| null` | Currently hovered listing |
| `activeId` | `string \| null` | Persistently selected listing |
| `scrollRequest` | `{ id: string; nonce: number } \| null` | One-shot scroll command |
| `focusSource` | `'map' \| 'list' \| null` | Where the focus originated (auto-clears 300ms) |
| `setHovered` | `(id: string \| null, source?: FocusSource) => void` | Set hover with source tracking |
| `setActive` | `(id: string \| null) => void` | Set persistent selection |
| `requestScrollTo` | `(id: string) => void` | Fire scroll command (nonce-based) |
| `ackScrollTo` | `(nonce: number) => void` | Clear scroll request if nonce matches |
| `clearFocus` | `() => void` | Clear all focus state |

#### Type Definitions

```ts
export interface ScrollRequest {
  id: string;
  nonce: number;
}

export type FocusSource = "map" | "list" | null;
```

#### Internal Logic

- **Focus source with auto-clear** (lines 103-113): When `setHovered` is called with a source (`'map'` or `'list'`), a 300ms timeout automatically clears `focusSource`. This prevents hover-to-scroll-to-hover feedback loops.
- **Nonce-based scroll requests** (lines 119-131): `requestScrollTo` increments a nonce, enabling re-scrolling to the same listing. `ackScrollTo` only clears if the nonce matches, preventing stale acknowledgments.
- **Stable SSR fallback** (lines 68-78): A module-level `SSR_FALLBACK` object is used when outside the provider, preventing re-render cascades.

#### Hooks

- `useListingFocus()` (lines 177-180) -- returns fallback if outside provider.
- `useIsListingFocused(listingId)` (lines 186-196) -- memoized per-listing hook returning `{ isHovered, isActive, isFocused }`.

#### Consumers

- **ListingCard**: Calls `setHovered` on mouse enter/leave, reads `isHovered`/`isActive`.
- **Map.tsx**: Calls `setHovered` on marker hover, `requestScrollTo` on marker click, reads `hoveredId` for marker highlighting.
- **SearchResultsClient**: Handles `scrollRequest` to scroll cards into view.

---

### MobileSearchContext

**File**: `/mnt/d/Documents/roomshare/src/contexts/MobileSearchContext.tsx`

**Purpose**: Coordinates the collapsed/expanded state of the mobile search bar and provides a way for the layout to open the filter drawer.

#### Context Shape

| Field | Type | Description |
|-------|------|-------------|
| `isExpanded` | `boolean` | Whether search bar is forcibly expanded |
| `expand` | `() => void` | Expand search bar (also scrolls to top) |
| `collapse` | `() => void` | Collapse (let scroll behavior take over) |
| `openFilters` | `() => void` | Open filter drawer via registered handler |
| `registerOpenFilters` | `(handler: () => void) => void` | Register handler (ref-based, no re-render) |

#### Internal Logic

- **Ref-based handler registration** (lines 54-76): Same pattern as `FilterStateContext`. The filter drawer open handler is stored in a ref to avoid re-renders on registration.
- **Stable module-level fallback** (lines 39-45): `FALLBACK_CONTEXT` is defined at module scope (not inside a function) so `useMobileSearch()` always returns the same reference outside the provider, preventing infinite re-render loops.
- **Scroll-to-top on expand** (lines 58-62): `expand()` calls `window.scrollTo({ top: 0, behavior: 'smooth' })`.

#### Hooks

- `useMobileSearch()` (lines 96-101) -- returns stable fallback if outside provider.

---

## Hooks

### useBatchedFilters

**File**: `/mnt/d/Documents/roomshare/src/hooks/useBatchedFilters.ts`

**Purpose**: Manages pending filter state before it is committed to the URL. Provides read/write access to uncommitted filter values and dirty state tracking.

#### Interface

```ts
interface BatchedFilterValues {
  minPrice: string;
  maxPrice: string;
  roomType: string;
  leaseDuration: string;
  moveInDate: string;
  amenities: string[];
  houseRules: string[];
  languages: string[];
  genderPreference: string;
  householdGender: string;
}
```

#### Return Value

| Field | Type | Description |
|-------|------|-------------|
| `pending` | `BatchedFilterValues` | Current pending filter state |
| `isDirty` | `boolean` | Whether pending differs from committed |
| `setPending` | `(values: Partial<BatchedFilterValues>) => void` | Update pending values |
| `reset` | `() => void` | Discard pending changes, restore to URL state |
| `commit` | `() => void` | Write pending state to URL and navigate |
| `committed` | `BatchedFilterValues` | The committed (URL) filter values |

#### Internal Logic

- **URL parsing** (lines 115-156): Reads filter values from URL search params via `readFiltersFromURL()` which normalizes values using allowlists, handles aliases (e.g., "private" -> "Private room"), and clamps price params.
- **Dirty comparison** (lines 167-183): Compares pending vs. committed state using deep equality for arrays and value equality for strings.
- **Sync on URL change** (lines 218-220): `useEffect` syncs pending state when URL changes (back/forward navigation, external filter changes).
- **Commit navigation** (lines 238-295): Uses `SearchTransitionContext` if available for smooth transitions, falls back to `router.push`. Deletes pagination params (page, cursor, cursorStack, pageNumber) and preserves non-filter params (bounds, sort, q, lat, lng, nearMatches).

#### Exports

- `emptyFilterValues` (lines 39-50) -- default empty state, used as initial value throughout the filter system.
- `BatchedFilterValues` type -- imported by `useDebouncedFilterCount`, `useFacets`, and filter components.
- `readFiltersFromURL` function (lines 115-156) -- exported for external use.

---

### useDebouncedFilterCount

**File**: `/mnt/d/Documents/roomshare/src/hooks/useDebouncedFilterCount.ts`

**Purpose**: Fetches listing counts from `/api/search-count` for the filter drawer "Show X listings" button. Debounces requests, caches results, and handles abort/cleanup.

#### Parameters

| Option | Type | Description |
|--------|------|-------------|
| `pending` | `BatchedFilterValues` | Current pending filter state |
| `isDirty` | `boolean` | Whether filters differ from URL |
| `isDrawerOpen` | `boolean` | Whether filter drawer is open |

#### Return Value

| Field | Type | Description |
|-------|------|-------------|
| `count` | `number \| null` | Matching listing count (`null` = 100+) |
| `previousCount` | `number \| null` | Count before current loading (optimistic UI) |
| `baselineCount` | `number \| null` | Count from committed filters (delta calculation) |
| `isLoading` | `boolean` | Request in progress |
| `formattedCount` | `string` | e.g., `"45 listings"`, `"100+ listings"`, `"Select a location"` |
| `boundsRequired` | `boolean` | API indicates bounds selection needed |

#### Internal Logic

- **Guard** (line 292): Only fetches when drawer is open AND filters are dirty.
- **Debounce** (lines 35, 328): 300ms delay before fetch (`DEBOUNCE_MS`).
- **Cache** (lines 31, 170-179): Module-level `Map<string, CacheEntry>` with 30s TTL (`CACHE_TTL_MS`). Cache key combines all pending filter values + committed URL bounds/location params.
- **Abort** (lines 219-226): `AbortController` cancels in-flight requests when filters change.
- **Rate limiting** (line 232): Uses `rateLimitedFetch` from `rate-limit-client.ts` which provides shared rate-limit backoff across all search endpoints.
- **Baseline capture** (lines 302-317): On first dirty state after drawer opens, captures current count as baseline for delta display.
- **Bounds from URL** (lines 134-148): Uses committed bounds from the URL, not pending map bounds.
- **Reset on close** (lines 274-281): Clears baseline, boundsRequired, and count when drawer closes.
- **boundsRequired handling** (lines 244, 346-348): When API returns `boundsRequired: true`, displays "Select a location" instead of count.

```ts
// Cache key generation combines filter state + URL bounds (lines 71-101)
function generateCacheKey(pending: BatchedFilterValues, searchParams: URLSearchParams): string
```

---

### useFilterImpactCount

**File**: `/mnt/d/Documents/roomshare/src/hooks/useFilterImpactCount.ts`

**Purpose**: Calculates how removing a specific filter would change the result count. Fetches lazily on hover to minimize API cost. Displays a "+22" badge on filter chips.

#### Parameters

| Option | Type | Description |
|--------|------|-------------|
| `searchParams` | `URLSearchParams` | Current URL params |
| `chip` | `FilterChipData` | The filter chip being evaluated |
| `isHovering` | `boolean` | Whether the chip is hovered |
| `currentCount` | `number \| null` | Current result count |

#### Return Value

| Field | Type | Description |
|-------|------|-------------|
| `impactDelta` | `number \| null` | Delta when filter removed |
| `isLoading` | `boolean` | Fetch in progress |
| `formattedDelta` | `string \| null` | e.g., `"+22"`, `"+100"` |

#### Internal Logic

- **Lazy fetch** (line 185): Only fetches when `isHovering && !hasFetched`.
- **Debounce** (lines 29, 198): 200ms hover delay before fetch (`DEBOUNCE_MS`).
- **Cache** (lines 25, 81-86): Module-level `Map` with 60s TTL (longer than filter count cache since removal impact changes less frequently).
- **Rate limiting** (line 134): Uses `rateLimitedFetch` from `rate-limit-client.ts` for shared backoff coordination.
- **Cache key** (lines 54-61): URL params with the target filter removed (via `removeFilterFromUrl`).
- **Delta calculation** (lines 220-237): `countWithoutFilter - currentCount`. If removing the filter yields 100+ (`null`), shows `"+100"`.
- **Reset on chip change** (lines 214-217): `hasFetched` resets when `chip.id` changes.

---

### useFacets

**File**: `/mnt/d/Documents/roomshare/src/hooks/useFacets.ts`

**Purpose**: Fetches facet counts (e.g., how many listings have "WiFi") and price histogram data from `/api/search/facets`. Used to populate filter drawer option counts and the price slider distribution.

#### Parameters

| Option | Type | Description |
|--------|------|-------------|
| `pending` | `BatchedFilterValues` | Current pending filter state |
| `isDrawerOpen` | `boolean` | Only fetches when drawer is open |

#### Return Value

| Field | Type | Description |
|-------|------|-------------|
| `facets` | `FacetsResponse \| null` | Facet counts and histogram data |
| `isLoading` | `boolean` | Fetch in progress |

#### Internal Logic

- **Cache key excludes price** (lines 42-66): Price slider changes do not trigger a refetch. The cache key includes all other filters + location bounds but deliberately omits `minPrice`/`maxPrice`. The API request still includes price params so that non-price facet counts reflect the price selection.
- **Debounce** (lines 26, 195): 300ms (`DEBOUNCE_MS`).
- **Cache** (lines 24, 153-156): Module-level `Map` with 30s TTL (`CACHE_TTL_MS`).
- **Abort** (lines 132-136): `AbortController` cancels in-flight requests.
- **Rate limiting** (line 142): Uses `rateLimitedFetch` from `rate-limit-client.ts` for coordinated backoff.

```ts
// Cache key excludes price intentionally (lines 42-66)
function generateFacetsCacheKey(pending: BatchedFilterValues, searchParams: URLSearchParams): string {
  const parts = [
    // Exclude minPrice/maxPrice
    `roomType=${pending.roomType}`,
    // ...
  ];
}
```

---

### useRecentSearches

**File**: `/mnt/d/Documents/roomshare/src/hooks/useRecentSearches.ts`

**Purpose**: Manages recent search history in `localStorage`. Stores up to 5 entries with full filter state, deduplicates by location, and supports legacy format migration.

#### Return Value

| Field | Type | Description |
|-------|------|-------------|
| `recentSearches` | `RecentSearch[]` | Newest first, max 5 |
| `isLoaded` | `boolean` | Whether loaded from localStorage |
| `saveRecentSearch` | `(location, coords?, filters?, resultCount?) => void` | Save a search |
| `clearRecentSearches` | `() => void` | Clear all |
| `removeRecentSearch` | `(id: string) => void` | Remove by ID |
| `formatSearch` | `(search: RecentSearch) => string` | e.g., `"Austin, TX · $500-1000 · Wifi, Parking"` |
| `getFilterSummary` | `(filters: RecentSearchFilters) => string \| null` | Short filter summary |

#### RecentSearch Shape

```ts
interface RecentSearch {
  id: string;
  location: string;
  coords?: { lat: number; lng: number };
  timestamp: number;
  filters: RecentSearchFilters;
  resultCount?: number;
}

interface RecentSearchFilters {
  minPrice?: string;
  maxPrice?: string;
  roomType?: string;
  amenities?: string[];
  leaseDuration?: string;
  houseRules?: string[];
}
```

#### Internal Logic

- **Legacy migration** (lines 161-187): On load, detects entries without `id` or `filters` fields and migrates them to the new format, persisting the updated data back.
- **Deduplication** (lines 216-223): `saveRecentSearch` removes existing entries with the same location (case-insensitive) before adding.
- **Error handling**: All `localStorage` operations are wrapped in try/catch for private browsing / quota exceeded scenarios.
- **Max entries** (line 18): `MAX_RECENT_SEARCHES = 5`.

#### Exported Functions

- `formatRecentSearch(search: RecentSearch): string` (lines 92-118) -- exported for external formatting.
- `getFilterSummary(filters: RecentSearchFilters): string | null` (lines 123-149) -- exported for filter summary.

---

### useNearbySearchRateLimit

**File**: `/mnt/d/Documents/roomshare/src/hooks/useNearbySearchRateLimit.ts`

**Purpose**: Session-based rate limiting for nearby place searches on listing detail pages. Prevents excessive API calls to the places service.

#### Parameters

| Param | Type | Description |
|-------|------|-------------|
| `listingId` | `string` | Current listing ID |

#### Return Value

| Field | Type | Description |
|-------|------|-------------|
| `canSearch` | `boolean` | Whether a search is permitted |
| `remainingSearches` | `number` | Searches left (out of 3) |
| `isDebounceBusy` | `boolean` | In debounce window |
| `debounceRemainingMs` | `number` | Milliseconds remaining (for countdown UI) |
| `startDebounce` | `() => void` | Start debounce timer |
| `incrementCount` | `() => void` | Increment search count (after success) |
| `reset` | `() => void` | Reset rate limit |

#### Limits

| Limit | Value |
|-------|-------|
| Max searches per listing | 3 |
| Debounce between searches | 10 seconds |
| Session expiry (counter reset) | 30 minutes of inactivity |

#### Internal Logic

- **sessionStorage persistence** (lines 45-96): State is keyed by `nearby-search-limit-${listingId}`. Stale data (>30min) is auto-cleared on read.
- **Separated debounce and count** (lines 239-272): `startDebounce()` starts the 10s timer; `incrementCount()` is called separately after a successful search. This decoupling prevents issues when searches fail.
- **Countdown interval** (lines 165-172, 203-226): Updates `debounceRemainingMs` every 100ms for smooth countdown UI.
- **Functional state updates** (lines 259-272): `incrementCount` uses `setState(prev => ...)` to avoid stale closure issues with rapid increments.

#### Exported Constants

```ts
export const RATE_LIMIT_CONFIG = {
  maxSearchesPerListing: 3,
  debounceMs: 10000,
  sessionExpiryMs: 1800000,
};
```

---

### useMapPreference

**File**: `/mnt/d/Documents/roomshare/src/hooks/useMapPreference.ts`

**Purpose**: Manages map visibility preference with localStorage persistence. Key for **Mapbox billing optimization** -- defers map initialization until user opts in on mobile.

#### Return Value

| Field | Type | Description |
|-------|------|-------------|
| `shouldShowMap` | `boolean` | Whether map should be visible (mobile: always true due to bottom sheet) |
| `shouldRenderMap` | `boolean` | Whether map component should mount (gated on hydration) |
| `toggleMap` | `() => void` | Toggle for current device type |
| `showMap` | `() => void` | Explicitly show map |
| `hideMap` | `() => void` | Explicitly hide map |
| `isMobile` | `boolean` | Current device type (<768px) |
| `isLoading` | `boolean` | True during hydration |

#### Defaults

| Device | Default | Rationale |
|--------|---------|-----------|
| Mobile | `list` (map hidden) | Biggest cost savings -- most mobile users won't tap "Show Map" |
| Desktop | `split` (map visible) | User expectation for desktop search |

#### Internal Logic

- **Hydration gate** (line 111): `shouldRenderMap = isHydrated && shouldShowMap`. This prevents mobile devices from initializing the Mapbox `Map` object during SSR when `isMobile` incorrectly defaults to `false`.
- **MediaQuery listener** (lines 88-98): Watches `(max-width: 767px)` for responsive breakpoint changes.
- **localStorage validation** (lines 35-52): Validates stored preference shape before applying.
- **Mobile override** (lines 103-105): On mobile, `shouldShowMap` is always `true` because the bottom sheet overlays the map.

#### Type Definitions

```ts
type DesktopPreference = "split" | "list-only";
type MobilePreference = "list" | "map";

interface MapPreference {
  desktop: DesktopPreference;
  mobile: MobilePreference;
}
```

---

### useScrollHeader

**File**: `/mnt/d/Documents/roomshare/src/hooks/useScrollHeader.ts`

**Purpose**: Tracks scroll state for collapsible header behavior (iOS Safari-style). Collapses header when scrolling down past threshold, expands when scrolling up.

#### Parameters

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `threshold` | `number` | `100` | Pixels before collapse triggers |

#### Return Value

| Field | Type | Description |
|-------|------|-------------|
| `isCollapsed` | `boolean` | Whether header should be collapsed |
| `scrollY` | `number` | Current scroll position |
| `isScrollingUp` | `boolean` | Scroll direction |

#### Internal Logic

- **requestAnimationFrame** (lines 68-73): Uses RAF-based throttling for smooth 60fps updates. A `ticking` ref prevents multiple RAF calls per frame.
- **Momentum thresholds** (lines 48-56): Requires >5px downward delta to collapse, >20px upward delta to expand. This prevents jitter from small scroll adjustments.
- **Always expand near top** (lines 54-56): Forces expansion when `scrollY <= threshold`.

#### Convenience Hook

```ts
export function useHeaderCollapsed(threshold = 100): boolean
```

Returns only the `isCollapsed` boolean (lines 101-104).

---

### useKeyboardShortcuts

**File**: `/mnt/d/Documents/roomshare/src/hooks/useKeyboardShortcuts.ts`

**Purpose**: Global keyboard shortcut management with meta key support, input awareness, and accessibility.

#### Parameters

| Param | Type | Description |
|-------|------|-------------|
| `shortcuts` | `ShortcutConfig[]` | Array of shortcut configurations |
| `options` | `{ disabled?: boolean }` | Global disable flag |

#### ShortcutConfig

```ts
interface ShortcutConfig {
  key: string;              // e.g., 'k', 'Escape', 'Enter'
  meta?: boolean;           // Require Cmd/Ctrl
  shift?: boolean;          // Require Shift
  action: () => void;
  disabled?: boolean;
  description?: string;
  preventInInput?: boolean; // Skip when typing in input/textarea
}
```

#### Built-in Presets

| Preset | Shortcut | Description |
|--------|----------|-------------|
| `SEARCH_SHORTCUTS.FOCUS_SEARCH` | Cmd/Ctrl+K | Focus search input |
| `SEARCH_SHORTCUTS.CLOSE` | Escape | Close drawer/modal |
| `SEARCH_SHORTCUTS.APPLY_FILTERS` | Cmd/Ctrl+Enter | Apply filters |

#### Internal Logic

- **Ref-based shortcut storage** (lines 90-95): Shortcuts array is stored in a ref and updated via effect, preventing handler recreation on every render.
- **Input awareness** (lines 53-67, 108-111): Checks `document.activeElement` against input/textarea/select/contenteditable elements when `preventInInput` is set.
- **Platform-aware formatting** (lines 148-175): `formatShortcut()` returns platform-appropriate strings (e.g., `"⌘K"` on Mac, `"Ctrl+K"` on Windows).
- **First match wins** (line 133): Only the first matching shortcut executes.

#### Helper Exports

```ts
export function formatShortcut(config: Pick<ShortcutConfig, 'key' | 'meta' | 'shift'>): string
```

---

### useAbortableServerAction

**File**: `/mnt/d/Documents/roomshare/src/hooks/useAbortableServerAction.ts`

**Purpose**: Wraps Next.js server actions with request sequencing to prevent race conditions. Since server actions do not support `AbortSignal`, this uses a request ID pattern to discard stale responses.

#### Parameters

```ts
interface UseAbortableServerActionOptions<TParams, TResult> {
  action: (params: TParams) => Promise<TResult>;
  onSuccess?: (result: TResult) => void;
  onError?: (error: Error) => void;
}
```

#### Return Value

| Field | Type | Description |
|-------|------|-------------|
| `execute` | `(params: TParams) => Promise<void>` | Invoke the action |
| `data` | `TResult \| null` | Latest successful result |
| `isLoading` | `boolean` | Request in flight |
| `error` | `Error \| null` | Latest error (cleared on new request) |
| `cancel` | `() => void` | Invalidate in-flight request |

#### Internal Logic

- **Request ID sequencing** (lines 65, 77-90): Each `execute` call increments `requestIdRef`. When the promise resolves, it checks if the captured ID still matches the current ref. If not, the response is silently discarded.
- **Mounted guard** (lines 67-75, 88): A `mountedRef` prevents state updates after unmount.
- **Cancel** (lines 108-112): `cancel()` increments the request ID (invalidating any in-flight response) and sets `isLoading` to false.

```ts
const execute = useCallback(async (params: TParams) => {
  const currentRequestId = ++requestIdRef.current;
  // ...
  if (currentRequestId !== requestIdRef.current) return; // stale
  // ...
}, [action, onSuccess, onError]);
```

---

### useNetworkStatus

**File**: `/mnt/d/Documents/roomshare/src/hooks/useNetworkStatus.ts`

**Purpose**: Tracks browser online/offline status via the `online` and `offline` window events.

#### Return Value

| Field | Type | Description |
|-------|------|-------------|
| `isOnline` | `boolean` | Current online status |
| `isOffline` | `boolean` | Inverse of `isOnline` |

#### Internal Logic

- Initializes state from `navigator.onLine` on mount (line 14)
- Registers event listeners for `online` and `offline` events (lines 19-20)
- Cleans up listeners on unmount (lines 22-25)

---

### useRateLimitHandler

**File**: `/mnt/d/Documents/roomshare/src/hooks/useRateLimitHandler.ts`

**Purpose**: Handles HTTP 429 rate limit errors with countdown state. Detects rate limit responses and provides state for displaying countdown UI.

#### Return Value

| Field | Type | Description |
|-------|------|-------------|
| `isRateLimited` | `boolean` | Whether currently rate limited |
| `retryAfter` | `number` | Seconds until retry (default 60) |
| `handleError` | `(result: RateLimitResult) => boolean` | Returns `true` if error was rate-limit |
| `reset` | `() => void` | Clear rate limit state |

#### RateLimitResult Interface

```ts
interface RateLimitResult {
  error?: string;
  retryAfter?: number;
}
```

#### Internal Logic

- **Detection** (lines 41-54): Checks `result.error` for "too many requests" or "rate limit" (case-insensitive), or the presence of `result.retryAfter`.
- **Default retry** (line 50): 60 seconds if `retryAfter` is not provided.
- **No auto-timer**: The hook sets state but does not auto-reset. The consuming component is responsible for calling `reset()` (typically via a `RateLimitCountdown` component's `onRetryReady` callback).

---

## Utilities

### rate-limit-client

**File**: `/mnt/d/Documents/roomshare/src/lib/rate-limit-client.ts`

**Purpose**: Shared, module-level 429/rate-limit handling for client fetches. Provides coordinated backoff across all search-related endpoints.

#### Key Features

- **Shared backoff state** (line 11): When any endpoint returns 429, every consumer backs off for the duration specified by `Retry-After`.
- **Drop-in fetch replacement**: `rateLimitedFetch()` is a drop-in replacement for `fetch()` with built-in rate limit handling.
- **Automatic backoff** (lines 60-64): Parses `Retry-After` header (supports both delta-seconds and HTTP-date formats).
- **RateLimitError** (lines 32-40): Throws a custom error when throttled, allowing hooks to handle backoff gracefully.
- **Default backoff** (line 71): 60 seconds (`DEFAULT_BACKOFF_MS`) if `Retry-After` is missing or unparseable.

#### Public API

```ts
// Main fetch wrapper (lines 50-67)
export async function rateLimitedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response>

// Helper functions
export function isThrottled(): boolean          // lines 16-18
export function getRetryAfterMs(): number       // lines 21-23
export function resetThrottle(): void           // lines 26-28

// Error class (lines 32-40)
export class RateLimitError extends Error {
  retryAfterMs: number;
}
```

#### Usage Pattern

```ts
import { rateLimitedFetch, RateLimitError } from "@/lib/rate-limit-client";

try {
  const response = await rateLimitedFetch(url, { signal });
  // ... handle response
} catch (error) {
  if (error instanceof RateLimitError) {
    // Silently back off - shared state prevents further fetches
    return;
  }
  // ... handle other errors
}
```

#### Integration

Used by:
- `useDebouncedFilterCount` - Filter count fetching
- `useFilterImpactCount` - Filter impact calculation
- `useFacets` - Facet data fetching
- `MapBoundsContext` - Area count fetching

---

## Provider Nesting Order

The search page layout nests providers in approximately this order (outermost first):

1. `SearchTransitionProvider`
2. `SearchV2DataProvider`
3. `FilterStateProvider`
4. `MapBoundsProvider`
5. `MobileSearchProvider`
6. `ListingFocusProvider`
7. `SearchMapUIProvider` (receives `showMap`/`shouldShowMap` from `useMapPreference`)

---

## Common Patterns

### Debounce + Abort + Cache

Several hooks share the same pattern:

1. **Debounce timeout** (300-600ms) prevents rapid-fire requests.
2. **AbortController** cancels in-flight requests when inputs change.
3. **Module-level Map with TTL** provides short-lived caching (30-60s).
4. **Cache check on mount** returns cached data synchronously before debounce.

Hooks using this pattern: `useDebouncedFilterCount`, `useFilterImpactCount`, `useFacets`, `MapBoundsContext` (area count).

### Rate-Limited Fetch

All search-related endpoints use `rateLimitedFetch` from `rate-limit-client.ts` for coordinated backoff:

- Shared module-level throttle state
- Automatic 429 detection and backoff
- `RateLimitError` for graceful handling
- No redundant requests during backoff period

### Nonce-Based Deduplication

Used when multiple rapid actions should only honor the latest:

- `SearchMapUIContext`: `focusListingOnMap` increments nonce; `acknowledgeFocus` only clears if nonce matches.
- `ListingFocusContext`: `requestScrollTo` increments nonce; `ackScrollTo` only clears if nonce matches.

### Ref-Based Callback Registration

Used to avoid infinite re-render loops when a child component registers a callback with a parent context:

- `FilterStateContext.registerOpenDrawer`
- `MobileSearchContext.registerOpenFilters`
- `SearchMapUIContext.registerDismiss`
- `MapBoundsContext.setSearchHandler` / `setResetHandler`

### Stable SSR Fallbacks

Module-level constant objects are used as fallbacks when hooks are called outside their provider (SSR or non-search pages):

- `ListingFocusContext`: `SSR_FALLBACK`
- `MobileSearchContext`: `FALLBACK_CONTEXT`
- `SearchMapUIContext`: inline no-op object in `useSearchMapUI`
- `MapBoundsContext`: inline defaults in `useMapBounds`
