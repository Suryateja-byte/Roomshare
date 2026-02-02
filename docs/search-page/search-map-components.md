# Search Page: Map Components & Map Integration

Comprehensive documentation of the map system powering the Roomshare search page. The map stack is built on **Mapbox GL JS** via `react-map-gl`, with a **MapLibre adapter** for listing detail pages and a **Google Maps** loader for Places UI Kit autocomplete.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Component Hierarchy](#component-hierarchy)
- [PersistentMapWrapper](#persistentmapwrapper)
- [DynamicMap](#dynamicmap)
- [Map (Main Component)](#map-main-component)
- [MapClient (Legacy)](#mapclient-legacy)
- [Map Sub-Components](#map-sub-components)
  - [BoundaryLayer](#boundarylayer)
  - [PrivacyCircle](#privacycircle)
  - [POILayer](#poilayer)
  - [UserMarker](#usermarker)
  - [MapMovedBanner](#mapmovedbbanner)
  - [MapGestureHint](#mapgesturehint)
  - [StackedListingPopup](#stackedlistingpopup)
- [Data Flow: V2MapDataSetter](#data-flow-v2mapdatasetter)
- [SearchMapUIProvider](#searchmapuiprovider)
- [Library Utilities](#library-utilities)
  - [mapbox-init](#mapbox-init)
  - [mapAdapter (MapLibre)](#mapadapter-maplibre)
  - [googleMapsUiKitLoader](#googlemapsuikitloader)
- [Map Bounds & Search Sync](#map-bounds--search-sync)
- [Clustering](#clustering)
- [Two-Tier Pin System](#two-tier-pin-system)
- [Dark Mode & Accessibility](#dark-mode--accessibility)
- [Performance](#performance)

---

## Architecture Overview

```
layout.tsx (persists across navigations)
  └─ SearchLayoutView
       └─ SearchMapUIProvider             ← Card-to-map focus coordination
            └─ PersistentMapWrapper        ← fetches marker data, lazy-loads map bundle
                 └─ <Suspense>
                      └─ DynamicMap         ← next/dynamic wrapper (SSR: false)
                           └─ Map (Map.tsx) ← Mapbox GL via react-map-gl
                                ├─ BoundaryLayer
                                ├─ PrivacyCircle
                                ├─ <Source> + <Layer> (clusters)
                                ├─ <Marker> (price pins)
                                ├─ <Popup> (listing preview)
                                ├─ UserMarker
                                ├─ POILayer
                                ├─ MapMovedBanner
                                └─ MapGestureHint

page.tsx (re-renders on navigation)
  └─ V2MapDataSetter               ← injects server-fetched map data into context
```

**Data flow paths:**

| Path | Description |
|------|-------------|
| **v2 (primary)** | `page.tsx` SSR fetches data, renders `V2MapDataSetter` which writes to `SearchV2DataContext`. `PersistentMapWrapper` reads context and skips its own fetch. |
| **v1 (fallback)** | `PersistentMapWrapper` fetches `/api/map-listings` client-side when v2 data is unavailable. |

---

## Component Hierarchy

| File | Purpose | Renders UI? |
|------|---------|-------------|
| `src/components/PersistentMapWrapper.tsx` | Layout-level wrapper; data fetching, lazy loading | Loading states only |
| `src/components/DynamicMap.tsx` | `next/dynamic` SSR-disabled import of Map | Pass-through |
| `src/components/Map.tsx` | Core map with markers, clusters, popups, controls | Yes (full map) |
| `src/components/map/MapClient.tsx` | Legacy standalone map (server-action based) | Yes (full map) |
| `src/components/map/BoundaryLayer.tsx` | Neighborhood boundary polygon overlay | Mapbox layers |
| `src/components/map/PrivacyCircle.tsx` | ~200m translucent radius around listings | Mapbox layer |
| `src/components/map/POILayer.tsx` | Toggle transit/POI/park layer visibility | Control buttons |
| `src/components/map/UserMarker.tsx` | Drop-a-pin with reverse geocode + distance | Marker + label |
| `src/components/map/MapMovedBanner.tsx` | "Search this area" / "Map moved" banner | Banner UI |
| `src/components/map/MapGestureHint.tsx` | One-time "Pinch to zoom" hint for touch | Toast overlay |
| `src/components/map/StackedListingPopup.tsx` | Multi-listing popup for co-located pins | Popup UI |
| `src/components/search/V2MapDataSetter.tsx` | Injects v2 map data into context | None (effect-only) |
| `src/contexts/SearchMapUIContext.tsx` | Card-to-map focus coordination | None (context) |
| `src/lib/mapbox-init.ts` | CSP-safe worker URL init | None |
| `src/lib/maps/mapAdapter.ts` | MapLibre GL adapter (listing detail pages) | None |
| `src/lib/googleMapsUiKitLoader.ts` | Google Maps Places UI Kit singleton loader | None |

---

## PersistentMapWrapper

**File:** `/mnt/d/Documents/roomshare/src/components/PersistentMapWrapper.tsx`

**Purpose:** Lives in `layout.tsx` so the map stays mounted across `/search` navigations. Handles data fetching, viewport validation, and lazy bundle loading.

### Props

```ts
interface PersistentMapWrapperProps {
  shouldRenderMap: boolean; // When false, Mapbox bundle (~944KB) is NOT loaded
}
```

### Key behaviors

- **Lazy bundle loading:** Uses `React.lazy(() => import('./DynamicMap'))` so Mapbox JS is only loaded when `shouldRenderMap` is `true`.
- **v2 data priority:** Reads `SearchV2DataContext`. If `v2MapData` is present, skips the `/api/map-listings` fetch entirely.
- **Map-relevant param filtering:** Only re-fetches when map-affecting params change (price, amenities, bounds, etc.). Pagination and sort changes are ignored.
- **Viewport validation:** Client-side bounds check mirrors server validation. Viewports wider than 5 degrees are clamped to center rather than rejected.
- **Race guard:** When v2 mode is signaled but data hasn't arrived yet, delays v1 fetch by 100ms to avoid double-fetch.
- **Fetch throttling:** 2-second debounce on all marker fetches to stay within 30 req/min rate limit.
- **Transition overlay:** Shows a subtle loading overlay when the list panel is transitioning (filter change), coordinating visual feedback.

### Map-relevant URL params

```ts
const MAP_RELEVANT_KEYS = [
  "q", "minLat", "maxLat", "minLng", "maxLng", "lat", "lng",
  "minPrice", "maxPrice", "amenities", "moveInDate", "leaseDuration",
  "houseRules", "languages", "roomType", "genderPreference", "householdGender",
  "nearMatches", // Added for near-match filtering
];
```

### Loading states

| State | Visual |
|-------|--------|
| Initial v2 placeholder | Pulsing "Loading map..." |
| Fetching marker data | Thin shimmer bar at top of map (`MapDataLoadingBar`) |
| List transitioning | "Updating..." overlay with blur |
| Error | Amber banner with retry button |

### MapDataLoadingBar component

**Lines 191-210:** New thin loading bar component rendered at the top of the map during data fetches:

```tsx
function MapDataLoadingBar() {
  return (
    <div className="absolute top-0 left-0 right-0 z-20 h-1 overflow-hidden pointer-events-none">
      <div className="h-full bg-zinc-900/80 dark:bg-white/80 animate-[shimmer_1.5s_ease-in-out_infinite]" />
    </div>
  );
}
```

Shown when:
- `isFetchingMapData` (v1 fetch in progress)
- `isListTransitioning` (filter/sort change)
- `showV2LoadingOverlay` (waiting for v2 data refresh)

---

## DynamicMap

**File:** `/mnt/d/Documents/roomshare/src/components/DynamicMap.tsx`

**Purpose:** Thin `next/dynamic` wrapper that defers the 944KB `mapbox-gl` bundle. SSR is disabled since Mapbox requires the DOM.

```tsx
const MapComponent = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => <div className="...animate-pulse...">Loading map...</div>,
});

export default function DynamicMap({ listings }: DynamicMapProps) {
  return <MapComponent listings={listings} />;
}
```

---

## Map (Main Component)

**File:** `/mnt/d/Documents/roomshare/src/components/Map.tsx`

**Purpose:** The core interactive map component. Renders Mapbox GL JS with clustering, price-pill markers, popups, boundary overlays, privacy circles, and all map controls.

### Props

```ts
interface Listing {
  id: string;
  title: string;
  price: number;
  availableSlots: number;
  ownerId?: string;
  images?: string[];
  location: { lat: number; lng: number };
  tier?: "primary" | "mini"; // Pin size tier
}

// Component signature
export default function MapComponent({ listings }: { listings: Listing[] })
```

### Mapbox configuration

| Setting | Value |
|---------|-------|
| Map library | `react-map-gl` (Mapbox GL JS) |
| Worker init | `@/lib/mapbox-init` (CSP-safe same-origin worker) |
| Token | `NEXT_PUBLIC_MAPBOX_TOKEN` env var |
| Default style | `mapbox://styles/mapbox/streets-v11` (light) / `dark-v11` (dark) |
| High contrast | `navigation-day-v1` / `navigation-night-v1` |
| Satellite | `satellite-streets-v12` |
| Default center | San Francisco (37.7749, -122.4194) |
| Default zoom | 12 |

### Map styles

Three styles are available via a toggle control, persisted in `sessionStorage` under the key `roomshare-map-style`:

| Key | Style URL | Notes |
|-----|-----------|-------|
| `standard` | `streets-v11` / `dark-v11` | Default |
| `satellite` | `satellite-streets-v12` | Aerial imagery |
| `transit` | `light-v11` / `dark-v11` | Same as standard (transit labels toggled via POILayer) |

### Initial view state

Computed once on mount (memoized with empty deps):

1. If URL has `minLat/maxLat/minLng/maxLng` bounds, center between them at zoom 12.
2. Else if listings exist, center on first listing at zoom 12.
3. Else fall back to San Francisco defaults.

On map load, if URL bounds exist, `fitBounds` is called with `duration: 0` to restore the exact viewport.

### Search-as-move

The "Search as I move" toggle is a `role="switch"` pill button at the top-center of the map. When enabled:

- `handleMoveEnd` fires after each pan/zoom with a **500ms debounce** + **2s throttle** to prevent excessive requests.
- Bounds are written to the URL via `router.replace` (no history entries).
- Pagination params (`page`, `cursor`, `cursorStack`, `pageNumber`) are reset on each bounds change.
- Viewports wider than 5 degrees skip the search and mark bounds as dirty.
- Request deduplication: bounds are rounded to 4 decimal places (~11m precision); identical bounds are skipped.

When disabled, map panning sets `boundsDirty` and shows the `MapMovedBanner`.

### Programmatic move tracking

A `isProgrammaticMoveRef` flag prevents banner/search-as-move from triggering during:
- Auto-fly to search results
- Cluster expansion zoom
- Card "Show on Map" centering
- Location search fly-to
- Fit-all-results button
- Reset to URL bounds

The `isInitialMoveRef` flag skips the very first `moveEnd` event (map settling at `initialViewState`) to prevent locking the URL to SF defaults before auto-fly runs.

### Fly-to events

The map listens for `MAP_FLY_TO_EVENT` custom events dispatched by `SearchForm` when a user selects a location. Supports both point-based `flyTo` and bbox-based `fitBounds`.

```ts
interface MapFlyToEventDetail {
  lat: number;
  lng: number;
  bbox?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  zoom?: number;
}
```

### Listing focus integration

Uses `ListingFocusContext` for bidirectional highlighting between map and list:

- **Marker hover** sets `hoveredId`, dims other markers (opacity 0.60), scales hovered marker to 1.15x with spring easing, and triggers `requestScrollTo` on the list.
- **Marker click** sets `activeId`, opens popup, and pans map with -150px Y offset.
- **Card "Show on Map"** sets `activeId` from the list side; the map detects the change, opens the popup, and eases to the listing.
- A `lastMapActiveRef` prevents re-triggering the popup when the map itself set `activeId`.

### Popup card

When a marker is clicked, a `<Popup>` renders with:
- 16:9 image thumbnail via `next/image` (280px sizing)
- Availability badge (green "N Available" or dark "Filled")
- Price display
- "View Details" link to `/listings/{id}`
- "Message" link to `/messages?userId={ownerId}` (if ownerId present)
- Close button + Escape key dismissal
- Screen reader live region announcing the selection

### E2E testing instrumentation

When `NEXT_PUBLIC_E2E=true`:
- `window.__roomshare.mapInstanceId` is set once per mount (UUID).
- `window.__roomshare.mapInitCount` increments each mount.
- `window.__roomshare.markerCount` is updated when listings change.

### Overlapping marker offsets

When multiple listings share the same coordinates, offsets are applied in a circular pattern (~150m radius) so all markers are visible and clickable.

```ts
const angle = (index / count) * 2 * Math.PI;
const offsetDistance = 0.0015; // ~150 meters
```

---

## MapClient (Legacy)

**File:** `/mnt/d/Documents/roomshare/src/components/map/MapClient.tsx`

**Purpose:** An older standalone map component that manages its own data fetching via a server action (`getListingsInBounds`). Used on detail or standalone map pages. Simpler than the main `Map.tsx` (no search-as-move, no banner, no boundary layer, no privacy circles, no user pin).

### Props

```ts
export default function MapClient({ initialListings = [] }: { initialListings?: MapListing[] })
```

### Key differences from Map.tsx

| Feature | Map.tsx | MapClient.tsx |
|---------|---------|---------------|
| Data source | Props from PersistentMapWrapper | Self-fetching via `getListingsInBounds` server action |
| Debounce | 500ms debounce + 2s throttle | 500ms debounce via `use-debounce` |
| Clustering threshold | Always on | Only when >= 50 listings |
| Search-as-move | Yes (toggle + banner) | No (auto-fetches on every move) |
| Boundary layer | Yes | No |
| Privacy circles | Yes | No |
| User pin | Yes | No |
| POI toggles | Yes | No |
| Listing focus sync | Yes (bidirectional) | No |
| Two-tier pins | Yes | No |
| Abort handling | URL navigation-based | `useAbortableServerAction` hook |

---

## Map Sub-Components

### BoundaryLayer

**File:** `/mnt/d/Documents/roomshare/src/components/map/BoundaryLayer.tsx`

**Purpose:** Renders a faint polygon overlay showing the boundary of a searched neighborhood/locality.

```ts
interface BoundaryLayerProps {
  query: string | null;       // Search text (e.g., "Mission District, SF")
  mapboxToken: string;
  isDarkMode: boolean;
}
```

**How it works:**
1. Fetches Mapbox Geocoding v5 API with `types=neighborhood,locality,place&limit=1`.
2. Extracts the `bbox` from the first result.
3. Creates a bounding-box polygon (since Mapbox geocoding doesn't return actual boundary polygons).
4. Renders via `<Source type="geojson">` with two layers:
   - `boundary-fill`: 8% opacity fill (zinc-700 light / zinc-400 dark)
   - `boundary-line`: Dashed stroke at 30% opacity

Includes `AbortController` for cancelling previous fetches and deduplication via `lastQueryRef`.

### PrivacyCircle

**File:** `/mnt/d/Documents/roomshare/src/components/map/PrivacyCircle.tsx`

**Purpose:** Renders translucent ~200m radius circles around listing locations to obscure exact pin placement for privacy.

```ts
interface PrivacyCircleProps {
  listings: Array<{ id: string; location: { lat: number; lng: number } }>;
  isDarkMode: boolean;
}
```

The circle radius scales with zoom using exponential interpolation to maintain consistent real-world size:

| Zoom | Pixel radius |
|------|-------------|
| 10 | 1px |
| 12 | 3px |
| 14 | 12px |
| 16 | 48px |
| 18 | 192px |

Rendered as a single Mapbox `circle` layer on top of GeoJSON point features.

### POILayer

**File:** `/mnt/d/Documents/roomshare/src/components/map/POILayer.tsx`

**Purpose:** Provides toggle buttons for showing/hiding built-in Mapbox map layers (transit, landmarks, parks).

```ts
interface POILayerProps {
  mapRef: React.RefObject<any>;
  isMapLoaded: boolean;
}
```

**Categories:**

| Category | Mapbox Layer IDs | Icon |
|----------|-----------------|------|
| Transit | `transit-label`, `transit-station-label`, `transit-line` | Bus |
| Landmarks | `poi-label` | Landmark |
| Parks | `landuse`, `national-park` | Trees |

A master "POIs" button toggles all categories on/off. Individual category buttons toggle each. Visibility is controlled via `map.setLayoutProperty(id, 'visibility', ...)`.

### UserMarker

**File:** `/mnt/d/Documents/roomshare/src/components/map/UserMarker.tsx`

**Purpose:** Allows users to drop a custom pin on the map, shows reverse-geocoded address and straight-line distance to hovered listings.

```ts
interface UserMarkerProps {
  isDropMode: boolean;
  onToggleDropMode: () => void;
  pin: UserPinState | null;
  onSetPin: (pin: UserPinState | null) => void;
  mapboxToken: string;
  hoveredListingCoords: { lat: number; lng: number } | null;
  isDarkMode: boolean;
}

interface UserPinState {
  lng: number;
  lat: number;
  address: string | null;
}
```

**Features:**
- **Drop mode:** Rose-colored button toggles drop mode. Map click places pin.
- **Reverse geocode:** Uses Mapbox Geocoding v5 (`types=address,poi&limit=1`) to label the pin.
- **Draggable:** Pin can be dragged; re-geocodes on drag end.
- **Distance:** When a listing card is hovered, shows Haversine straight-line distance.
- **Session-only state:** Not persisted across page loads.

The `useUserPin` hook encapsulates all state management:

```ts
export function useUserPin(mapboxToken: string) {
  // Returns: { isDropMode, toggleDropMode, pin, setPin, handleMapClick }
}
```

### MapMovedBanner

**File:** `/mnt/d/Documents/roomshare/src/components/map/MapMovedBanner.tsx`

**Purpose:** Shown when the user panned the map but results haven't updated (search-as-move is OFF or location conflicts detected).

```ts
interface MapMovedBannerProps {
  variant: "map" | "list";
  onSearch: () => void;
  onReset: () => void;
  areaCount?: number | null;    // null = 100+, undefined = not loaded
  isAreaCountLoading?: boolean;
}
```

| Variant | Placement | Style |
|---------|-----------|-------|
| `map` | Floating pill at top-center of map | White rounded-full with blue "Search this area (N)" button + X |
| `list` | Banner above results list | Amber warning bar with MapPin icon |

The button label dynamically shows the listing count: "Search this area", "Search this area (42)", or "Search this area (100+)".

### MapGestureHint

**File:** `/mnt/d/Documents/roomshare/src/components/map/MapGestureHint.tsx`

**Purpose:** One-time toast for first-time touch device users explaining map gestures.

- Shows only on touch devices (`ontouchstart` in window).
- Persisted via `localStorage` key `roomshare-map-hints-seen`.
- Displays "Pinch to zoom" / "Tap markers for listing details".
- Dismissable via X button (44x44px touch target).

### StackedListingPopup

**File:** `/mnt/d/Documents/roomshare/src/components/map/StackedListingPopup.tsx`

**Purpose:** When multiple listings share the same coordinates, displays a scrollable popup with all listings at that location.

```ts
interface StackedListingPopupProps {
  group: ListingGroup;  // from @/lib/maps/marker-utils
  onClose: () => void;
  isDarkMode: boolean;
}
```

Each listing row shows:
- 64px thumbnail
- Title, price, available spots
- Hover/focus integrates with `ListingFocusContext`
- Click sets active listing and requests scroll-to
- ChevronRight link opens listing detail page

---

## Data Flow: V2MapDataSetter

**File:** `/mnt/d/Documents/roomshare/src/components/search/V2MapDataSetter.tsx`

**Purpose:** Bridges server-rendered map data from `page.tsx` into the persistent map wrapper via React context.

```ts
interface V2MapDataSetterProps {
  data: V2MapData;  // GeoJSON features + pin tier data
}
```

**Flow:**
1. `page.tsx` fetches search results server-side (includes GeoJSON for map).
2. `page.tsx` renders `<V2MapDataSetter data={mapData} />`.
3. On mount, the setter calls `setIsV2Enabled(true)` and `setV2MapData(data, dataVersion)`.
4. `PersistentMapWrapper` reads context and skips its own `/api/map-listings` fetch.

**Key implementation detail (line 27):**
```ts
setV2MapData(data, dataVersion);  // Version passed for stale data protection
```

**Cleanup note:** Effect cleanup intentionally does NOT clear `v2MapData` to null. This prevents a race condition during "search as I move" navigations where cleanup would fire before new data arrives, causing markers to flash.

---

## SearchMapUIProvider

**File:** `/mnt/d/Documents/roomshare/src/contexts/SearchMapUIContext.tsx`

**Purpose:** Context for coordinating card-to-map focus interactions when users click "View on map" from listing cards.

**Wired into layout:** `SearchLayoutView` wraps children with `SearchMapUIProvider`, passing `showMap` callback and `shouldShowMap` state.

### Architecture

```ts
interface SearchMapUIContextValue {
  pendingFocus: PendingMapFocus | null;
  focusListingOnMap: (listingId: string) => void;
  acknowledgeFocus: (nonce: number) => void;
  clearPendingFocus: () => void;
  registerDismiss: (fn: () => void) => void;
  dismiss: () => void;
}
```

### Flow

1. User clicks "View on map" on a `ListingCard`
2. Card calls `focusListingOnMap(listingId)`
3. Context stores pending focus with nonce (deduplication)
4. If map is hidden, calls `showMap()` to reveal it
5. `Map.tsx` consumes `pendingFocus`, flies to listing, opens popup
6. Map acknowledges with `acknowledgeFocus(nonce)` to clear pending state

**Key design decisions:**
- No timeout: `pendingFocus` persists until acknowledged or replaced
- Nonce deduplication: rapid clicks only honor the latest request
- ListingCard owns `setActive` (user-initiated), Map only handles flyTo + popup

---

## Library Utilities

### mapbox-init

**File:** `/mnt/d/Documents/roomshare/src/lib/mapbox-init.ts`

**Purpose:** Sets the Mapbox GL JS web worker URL to a same-origin file for CSP compliance. Must be imported before any map rendering.

```ts
// Sets worker to /mapbox-gl-csp-worker.js (copied from node_modules)
(mapboxgl as any).workerUrl = '/mapbox-gl-csp-worker.js';
```

Import order in Map.tsx is critical:
```ts
import '@/lib/mapbox-init'; // Must be first
import Map from 'react-map-gl';
```

### mapAdapter (MapLibre)

**File:** `/mnt/d/Documents/roomshare/src/lib/maps/mapAdapter.ts`

**Purpose:** Adapter layer wrapping MapLibre GL JS for listing detail pages and other non-search map uses. Provides a testable interface that prevents mock sprawl.

**Exports:**

| Function | Description |
|----------|-------------|
| `createMap(options)` | Create a MapLibre map instance |
| `createMarker(options)` | Create a marker |
| `createPopup(options)` | Create a popup |
| `createBounds()` | Create an empty LngLatBounds |
| `addMarkerToMap(marker, map)` | Add marker to map |
| `removeMarker(marker)` | Remove marker |
| `fitMapBounds(map, bounds, options)` | Fit bounds |
| `flyTo(map, options)` | Fly to location |
| `escapeHtml(text)` | XSS-safe HTML escaping for popups |
| `mapAdapter` | Object collecting all functions (for test mocking) |

Type re-exports: `MapInstance`, `MarkerInstance`, `PopupInstance`, `BoundsInstance`.

### googleMapsUiKitLoader

**File:** `/mnt/d/Documents/roomshare/src/lib/googleMapsUiKitLoader.ts`

**Purpose:** Singleton loader for the Google Maps JavaScript API with Places UI Kit. Used for the location autocomplete in the search form (not for map rendering).

```ts
export async function loadPlacesUiKit(): Promise<void>
export function isPlacesUiKitLoaded(): boolean
export function resetPlacesLoader(): void  // For tests
```

Key behaviors:
- Singleton promise prevents duplicate script tags.
- Uses callback pattern (`__googleMapsCallback`) for reliable initialization.
- Polls for existing script tags (handles race with other loaders).
- 10-second timeout on load.
- Requires `NEXT_PUBLIC_GOOGLE_MAPS_UIKIT_KEY` env var.

---

## Map Bounds & Search Sync

The map-to-search synchronization uses `MapBoundsContext` with these key pieces:

| Context value | Purpose |
|---------------|---------|
| `searchAsMove` | Toggle state for auto-search on pan |
| `hasUserMoved` | Whether user has manually panned |
| `boundsDirty` | Whether map viewport differs from search results |
| `currentMapBounds` | Current viewport bounds (for area count requests) |
| `searchHandler` | Function registered by Map.tsx to execute search with current bounds |
| `resetHandler` | Function to fly back to URL bounds |
| `searchLocation` | Named location + coords from URL for conflict detection |
| `isProgrammaticMoveRef` | Ref to suppress dirty tracking during animations |

**Search execution flow:**

```
User pans map
  → handleMoveEnd fires
  → skip if programmatic or initial move
  → setHasUserMoved(true)
  → if searchAsMove ON:
      → 500ms debounce → 2s throttle → executeMapSearch(bounds)
      → bounds written to URL via router.replace
      → pagination params reset
  → if searchAsMove OFF:
      → setBoundsDirty(true) → MapMovedBanner shows
```

---

## Clustering

Mapbox GL native clustering is **always enabled** (no threshold). With few listings, clusters simply don't form and individual markers show.

### GeoJSON Source configuration

```tsx
<Source
  id="listings"
  type="geojson"
  data={geojsonData}
  cluster={true}
  clusterMaxZoom={14}
  clusterRadius={50}
  clusterProperties={{
    priceSum: ['+', ['get', 'price']],  // Aggregated price for ring color
  }}
>
```

### Cluster layers (3 layers)

1. **`cluster-ring`** (outer ring) - Color-coded by average price:
   - Green (`#22c55e`): avg < $800/mo
   - Yellow (`#eab308`): avg $800-$1500/mo
   - Red (`#ef4444`): avg > $1500/mo

2. **`clusters`** - Main circle (zinc-900 light / white dark), radius steps by point count:
   - < 10 points: 20px
   - 10-49: 25px
   - 50-99: 32px
   - 100+: 40px

3. **`cluster-count`** - Text label showing count. Shows "50+" for large clusters. Text size scales with OS font-size settings (`textScale = rootFontSize / 16`).

### Cluster click behavior

Clicking a cluster calls `getClusterExpansionZoom` to determine the zoom level needed to expand the cluster, then `flyTo` with 700ms animation.

### Unclustered listing tracking

After each `moveEnd`, `querySourceFeatures` with filter `['!', ['has', 'point_count']]` extracts visible unclustered points. These are deduplicated by ID and used to render individual `<Marker>` components with price pills.

---

## Two-Tier Pin System

Listings have an optional `tier` property (`"primary"` or `"mini"`) for differentiated pin styling at different zoom levels.

| Zoom level | Primary tier | Mini tier |
|------------|-------------|-----------|
| < 12 | Gray dot (no price) | Gray dot (no price) |
| 12 - 14 | Price pill (full size) | Gray dot (no price) |
| >= 14 | Price pill (full size) | Price pill (smaller) |

When a mini-tier pin is hovered, it always shows as a full price pill regardless of zoom.

Constants:
```ts
const ZOOM_DOTS_ONLY = 12;
const ZOOM_TOP_N_PINS = 14;
```

---

## Dark Mode & Accessibility

### Dark mode detection

Uses a `MutationObserver` on `document.documentElement` to detect `class="dark"` changes. All map layers, markers, popups, and controls have dark variants.

### High contrast

Detects `prefers-contrast: more` media query. When active, switches to Mapbox navigation styles (`navigation-day-v1` / `navigation-night-v1`) which have higher contrast labels and roads.

### Dynamic Type / font scaling

Cluster label text size scales with the OS/browser root font size:

```ts
const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
setTextScale(rootFontSize / 16);
// Applied: 'text-size': Math.round(14 * textScale)
```

### Screen reader support

- Map container has `role="region"`, `aria-label="Interactive map showing listing locations"`, `aria-roledescription="map"`.
- Markers have `role="button"`, `tabIndex={0}`, descriptive `aria-label` (price, title, availability).
- Keyboard navigation: Enter/Space activates markers, Escape closes popups.
- Live region (`aria-live="polite"`) announces selected listing details.
- Loading states use `role="status"` with `aria-label`.
- All touch targets are minimum 44x44px.
- `motion-reduce:animate-none` on animations.

---

## Performance

### Bundle splitting

| Technique | Savings |
|-----------|---------|
| `next/dynamic` SSR:false in DynamicMap | Mapbox GL (~944KB) excluded from SSR bundle |
| `React.lazy` in PersistentMapWrapper | Bundle only loaded when `shouldRenderMap=true` |
| Persistent layout mount | Mapbox re-init avoided on navigation (saves billing + load time) |

### Fetch optimization

| Technique | Detail |
|-----------|--------|
| Map-relevant param filtering | Ignores pagination/sort changes for re-fetch decisions |
| Request deduplication | Bounds rounded to 4 decimal places; identical bounds skipped |
| 500ms debounce + 2s throttle | On search-as-move to limit API calls |
| AbortController | Stale fetches cancelled on new navigation or param change |
| v2 data injection | SSR data avoids redundant client-side fetch |
| Viewport clamping | Too-wide viewports clamped to 5-degree max rather than rejected |

### Rendering optimization

| Technique | Detail |
|-----------|--------|
| `useMemo` on GeoJSON data | Recomputed only when listings change |
| `useMemo` on marker positions | Recomputed only when unclustered listings change |
| `useMemo` on layer configs | Cluster layers recomputed only on `textScale` change |
| Native Mapbox clustering | GPU-accelerated; no React re-renders for cluster updates |
| `isMountedRef` guard | Prevents state updates after component unmount (P0 Issue #25) |
| Haptic feedback | `triggerHaptic()` on marker click for tactile confirmation |

### HMR error suppression

Worker communication errors during Turbopack hot reload are suppressed:
```ts
if (message.includes("reading 'send'") || message.includes("reading 'target'")) {
  event.preventDefault();
}
```
