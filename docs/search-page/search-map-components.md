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
  - [MapErrorBoundary](#maperrorboundary)
- [Data Flow: V2MapDataSetter](#data-flow-v2mapdatasetter)
- [Context: SearchV2DataContext](#context-searchv2datacontext)
- [Context: MapBoundsContext](#context-mapboundscontext)
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
       └─ SearchV2DataProvider          ← V2 map data context provider
            └─ MapBoundsProvider         ← Map bounds dirty tracking
                 └─ SearchMapUIProvider   ← Card-to-map focus coordination
                      └─ PersistentMapWrapper ← fetches marker data, lazy-loads map bundle
                           └─ <Suspense>
                                └─ MapErrorBoundary ← Error boundary for map crashes
                                     └─ LazyDynamicMap  ← React.lazy wrapper (SSR: false)
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
| **v1 (fallback)** | `PersistentMapWrapper` fetches `/api/map-listings` client-side when v2 data is unavailable or v2 mode is disabled. |

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
| `src/components/map/MapErrorBoundary.tsx` | Error boundary for map rendering crashes | Fallback UI |
| `src/components/search/V2MapDataSetter.tsx` | Injects v2 map data into context | None (effect-only) |
| `src/contexts/SearchV2DataContext.tsx` | V2 map data sharing between page and map | None (context) |
| `src/contexts/MapBoundsContext.tsx` | Map bounds dirty tracking and area count | None (context) |
| `src/contexts/SearchMapUIContext.tsx` | Card-to-map focus coordination | None (context) |
| `src/lib/mapbox-init.ts` | CSP-safe worker URL init | None |
| `src/lib/maps/mapAdapter.ts` | MapLibre GL adapter (listing detail pages) | None |
| `src/lib/googleMapsUiKitLoader.ts` | Google Maps Places UI Kit singleton loader | None |

---

## PersistentMapWrapper

**File:** `src/components/PersistentMapWrapper.tsx`

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
- **Race guard:** When v2 mode is signaled but data hasn't arrived yet, delays v1 fetch by 200ms to avoid double-fetch.
- **Fetch throttling:** 2-second debounce on all marker fetches to stay within 30 req/min rate limit.
- **429 rate limit handling:** Automatic retry with exponential backoff on 429 responses (max 1 retry).
- **Transition overlay:** Shows a subtle loading overlay when the list panel is transitioning (filter change), coordinating visual feedback.

### Map-relevant URL params

```ts
const MAP_RELEVANT_KEYS = [
  "q", "minLat", "maxLat", "minLng", "maxLng", "lat", "lng",
  "minPrice", "maxPrice", "amenities", "moveInDate", "leaseDuration",
  "houseRules", "languages", "roomType", "genderPreference", "householdGender",
  "nearMatches",
];
```

### Loading states

| State | Visual | Component |
|-------|--------|-----------|
| Initial v2 placeholder | Pulsing "Loading map..." | `MapLoadingPlaceholder` |
| Fetching marker data | Thin shimmer bar at top of map | `MapDataLoadingBar` |
| List transitioning | "Updating..." overlay with blur | `MapTransitionOverlay` |
| Error | Amber banner with retry button | `MapErrorBanner` |

### MapDataLoadingBar component

Thin loading bar component rendered at the top of the map during data fetches:

```tsx
function MapDataLoadingBar() {
  return (
    <div className="absolute top-0 left-0 right-0 z-20 h-1 overflow-hidden pointer-events-none" role="status" aria-label="Loading map data">
      <div className="h-full bg-zinc-900/80 dark:bg-white/80 animate-[shimmer_1.5s_ease-in-out_infinite] origin-left" />
    </div>
  );
}
```

Shown when:
- `isFetchingMapData` (v1 fetch in progress)
- `isListTransitioning` (filter/sort change)
- `showV2LoadingOverlay` (waiting for v2 data refresh)

### v2MapDataToListings helper

Converts V2 GeoJSON features to the `MapListingData` format expected by `Map.tsx`:

```ts
function v2MapDataToListings(v2MapData: V2MapData): MapListingData[] {
  // Build lookup map from pins for tier data (O(1) lookups)
  const pinTierMap = new Map<string, "primary" | "mini">();
  if (v2MapData.pins) {
    for (const pin of v2MapData.pins) {
      if (pin.tier) {
        pinTierMap.set(pin.id, pin.tier);
      }
    }
  }

  return v2MapData.geojson.features.map((feature) => ({
    id: feature.properties.id,
    title: feature.properties.title ?? "",
    price: feature.properties.price ?? 0,
    availableSlots: feature.properties.availableSlots,
    ownerId: feature.properties.ownerId,
    images: feature.properties.image ? [feature.properties.image] : [],
    location: {
      lng: feature.geometry.coordinates[0],
      lat: feature.geometry.coordinates[1],
    },
    tier: pinTierMap.get(feature.properties.id),
  }));
}
```

---

## DynamicMap

**File:** `src/components/DynamicMap.tsx`

**Purpose:** Thin `next/dynamic` wrapper that defers the 944KB `mapbox-gl` bundle. SSR is disabled since Mapbox requires the DOM.

```tsx
const MapComponent = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-zinc-100 dark:bg-zinc-800 animate-pulse flex items-center justify-center">
      <div className="text-zinc-400 dark:text-zinc-500 text-sm">Loading map...</div>
    </div>
  ),
});

export default function DynamicMap({ listings }: DynamicMapProps) {
  return <MapComponent listings={listings} />;
}
```

---

## Map (Main Component)

**File:** `src/components/Map.tsx`

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

export default function MapComponent({ listings }: { listings: Listing[] })
```

### MarkerPosition interface

```ts
interface MarkerPosition {
  listing: Listing;
  lat: number;
  lng: number;
}
```

### Mapbox configuration

| Setting | Value |
|---------|-------|
| Map library | `react-map-gl` (Mapbox GL JS) |
| Worker init | `@/lib/mapbox-init` (CSP-safe same-origin worker) |
| Token | `NEXT_PUBLIC_MAPBOX_TOKEN` env var |
| Default style (light) | `mapbox://styles/mapbox/streets-v11` |
| Default style (dark) | `mapbox://styles/mapbox/dark-v11` |
| High contrast (light) | `mapbox://styles/mapbox/navigation-day-v1` |
| High contrast (dark) | `mapbox://styles/mapbox/navigation-night-v1` |
| Satellite | `mapbox://styles/mapbox/satellite-streets-v12` |
| Transit (light) | `mapbox://styles/mapbox/light-v11` |
| Transit (dark) | `mapbox://styles/mapbox/dark-v11` |
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

- `handleMoveEnd` fires after each pan/zoom with a **600ms debounce** + **2s throttle** to prevent excessive requests.
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

Safety timeout: programmatic move flag auto-clears after `PROGRAMMATIC_MOVE_TIMEOUT_MS` (2500ms) if `moveEnd` doesn't fire.

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

- **Marker hover** sets `hoveredId`, dims other markers (opacity 0.60), scales hovered marker to 1.15x with spring easing, and triggers `requestScrollTo` on the list after a 300ms debounce.
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

### Key constants

```ts
const MIN_SEARCH_INTERVAL_MS = 2000;  // Throttle between searches
const ZOOM_DOTS_ONLY = 12;            // Below: all pins are gray dots
const ZOOM_TOP_N_PINS = 14;           // 12-14: primary = price, mini = dots
```

---

## MapClient (Legacy)

**File:** `src/components/map/MapClient.tsx`

**Purpose:** An older standalone map component that manages its own data fetching via a server action (`getListingsInBounds`). Used on detail or standalone map pages. Simpler than the main `Map.tsx` (no search-as-move, no banner, no boundary layer, no privacy circles, no user pin).

### Props

```ts
export default function MapClient({ initialListings = [] }: { initialListings?: MapListing[] })
```

### Key differences from Map.tsx

| Feature | Map.tsx | MapClient.tsx |
|---------|---------|---------------|
| Data source | Props from PersistentMapWrapper | Self-fetching via `getListingsInBounds` server action |
| Debounce | 600ms debounce + 2s throttle | 500ms debounce via `use-debounce` |
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

**File:** `src/components/map/BoundaryLayer.tsx`

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

**Layer configurations:**
```ts
// Fill layer
{ 'fill-color': isDarkMode ? '#a1a1aa' : '#3f3f46', 'fill-opacity': 0.08 }

// Line layer
{ 'line-color': isDarkMode ? '#a1a1aa' : '#71717a', 'line-width': 1.5, 'line-opacity': 0.3, 'line-dasharray': [4, 2] }
```

### PrivacyCircle

**File:** `src/components/map/PrivacyCircle.tsx`

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

**Circle paint configuration:**
```ts
{
  'circle-color': isDarkMode ? 'rgba(161, 161, 170, 0.15)' : 'rgba(113, 113, 122, 0.12)',
  'circle-stroke-width': 1,
  'circle-stroke-color': isDarkMode ? 'rgba(161, 161, 170, 0.25)' : 'rgba(113, 113, 122, 0.2)',
  'circle-stroke-opacity': 0.6,
}
```

### POILayer

**File:** `src/components/map/POILayer.tsx`

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

**Session persistence:** Active categories stored in `sessionStorage` under key `roomshare:poi-layer-active`.

### UserMarker

**File:** `src/components/map/UserMarker.tsx`

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

**Distance calculation:**
```ts
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

**useUserPin hook:**

```ts
export function useUserPin(mapboxToken: string) {
  // Returns: { isDropMode, toggleDropMode, pin, setPin, handleMapClick }
}
```

### MapMovedBanner

**File:** `src/components/map/MapMovedBanner.tsx`

**Purpose:** Shown when the user panned the map but results haven't updated (search-as-move is OFF or location conflicts detected).

```ts
export interface MapMovedBannerProps {
  variant: "map" | "list";
  onSearch: () => void;
  onReset: () => void;
  areaCount?: number | null;    // null = 100+, undefined = not loaded
  isAreaCountLoading?: boolean;
}
```

| Variant | Placement | Style |
|---------|-----------|-------|
| `map` | Floating pill at top-center of map (below search-as-move toggle) | White rounded-full with blue "Search this area (N)" button + X |
| `list` | Banner above results list | Amber warning bar with MapPin icon |

The button label dynamically shows the listing count: "Search this area", "Search this area (42)", or "Search this area (100+)".

### MapGestureHint

**File:** `src/components/map/MapGestureHint.tsx`

**Purpose:** One-time toast for first-time touch device users explaining map gestures.

- Shows only on touch devices (`ontouchstart` in window).
- Persisted via `localStorage` key `roomshare-map-hints-seen`.
- Displays "Pinch to zoom" / "Tap markers for listing details".
- Dismissable via X button (44x44px touch target).

### StackedListingPopup

**File:** `src/components/map/StackedListingPopup.tsx`

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

### MapErrorBoundary

**File:** `src/components/map/MapErrorBoundary.tsx`

**Purpose:** React error boundary that catches map rendering crashes and displays a fallback UI.

```ts
interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class MapErrorBoundary extends React.Component<Props, State>
```

**Fallback UI:** Shows "Map unavailable - try refreshing" with a Retry button that resets the error state.

---

## Data Flow: V2MapDataSetter

**File:** `src/components/search/V2MapDataSetter.tsx`

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

**Key implementation detail:**
```ts
useEffect(() => {
  setIsV2Enabled(true);
  setV2MapData(data, dataVersion);
  // NOTE: Cleanup intentionally removed to prevent race condition
}, [data, dataVersion, setV2MapData, setIsV2Enabled]);
```

**Cleanup note:** Effect cleanup intentionally does NOT clear `v2MapData` to null. This prevents a race condition during "search as I move" navigations where cleanup would fire before new data arrives, causing markers to flash.

---

## Context: SearchV2DataContext

**File:** `src/contexts/SearchV2DataContext.tsx`

**Purpose:** Enables data sharing between `page.tsx` (list) and `PersistentMapWrapper` (map) siblings without prop drilling.

### V2MapData interface

```ts
export interface V2MapData {
  geojson: SearchV2GeoJSON;      // GeoJSON FeatureCollection for Mapbox clustering
  pins?: SearchV2Pin[];          // Tiered pins for sparse results (<50 listings)
  mode: SearchV2Mode;            // 'geojson' for clustering, 'pins' for individual markers
}
```

### Context value

```ts
interface SearchV2DataContextValue {
  v2MapData: V2MapData | null;
  setV2MapData: (data: V2MapData | null, version?: number) => void;
  isV2Enabled: boolean;
  setIsV2Enabled: (enabled: boolean) => void;
  dataVersion: number;
}
```

### Key behaviors

- **Stale data protection:** `setV2MapData` accepts an optional `version` parameter. If provided, data is only accepted if it matches `dataVersionRef.current`.
- **Auto-invalidation on filter change:** When filter params change, `v2MapData` is cleared and version incremented.
- **Auto-invalidation on bounds change:** When map bounds change (pan/zoom), `v2MapData` is cleared to ensure fresh data.

---

## Context: MapBoundsContext

**File:** `src/contexts/MapBoundsContext.tsx`

**Purpose:** Shared state for map bounds dirty tracking, enabling the "Map moved - results not updated" banner to show in both the map overlay and above the list results.

### Context value

```ts
interface MapBoundsContextValue {
  hasUserMoved: boolean;                    // User has manually panned/zoomed
  boundsDirty: boolean;                     // Map bounds differ from URL bounds
  searchAsMove: boolean;                    // "Search as I move" toggle state
  isProgrammaticMove: boolean;              // Current move is programmatic
  searchLocationName: string | null;        // Original search location name
  searchLocationCenter: PointCoords | null; // Original search location coords
  locationConflict: boolean;                // Map no longer contains search location
  areaCount: number | null;                 // Listings in current area (null = 100+)
  isAreaCountLoading: boolean;              // Area count is loading
  searchCurrentArea: () => void;            // Trigger search with current bounds
  resetToUrlBounds: () => void;             // Reset map to URL bounds
  setHasUserMoved: (value: boolean) => void;
  setBoundsDirty: (value: boolean) => void;
  setSearchAsMove: (value: boolean) => void;
  setProgrammaticMove: (value: boolean) => void;
  setSearchLocation: (name: string | null, center: PointCoords | null) => void;
  setCurrentMapBounds: (bounds: MapBoundsCoords | null) => void;
  setSearchHandler: (handler: () => void) => void;
  setResetHandler: (handler: () => void) => void;
  isProgrammaticMoveRef: React.RefObject<boolean>;
}
```

### useMapMovedBanner hook

```ts
export function useMapMovedBanner() {
  // Returns: { showBanner, showLocationConflict, locationName, onSearch, onReset, areaCount, isAreaCountLoading }
}
```

### Area count behavior

- Enabled only when banner would show: `hasUserMoved && boundsDirty && !searchAsMove`
- Debounced by `AREA_COUNT_DEBOUNCE_MS` (600ms)
- Client-side cache with `AREA_COUNT_CACHE_TTL_MS` (30s) TTL
- Uses `rateLimitedFetch` for rate limit handling

---

## Library Utilities

### mapbox-init

**File:** `src/lib/mapbox-init.ts`

**Purpose:** Sets the Mapbox GL JS web worker URL to a same-origin file for CSP compliance. Must be imported before any map rendering.

```ts
try {
  // Only set worker URL in browser environment
  if (typeof window !== 'undefined') {
    (mapboxgl as unknown as { workerUrl: string }).workerUrl = '/mapbox-gl-csp-worker.js';
  }
} catch (error) {
  // Log but don't crash - map may still work with default worker
  console.error('[MAPBOX] Failed to initialize worker URL:', error);
}
```

Import order in Map.tsx is critical:
```ts
import '@/lib/mapbox-init'; // Must be first
import Map from 'react-map-gl';
```

### mapAdapter (MapLibre)

**File:** `src/lib/maps/mapAdapter.ts`

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

**File:** `src/lib/googleMapsUiKitLoader.ts`

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
      → 600ms debounce → 2s throttle → executeMapSearch(bounds)
      → bounds written to URL via router.replace
      → pagination params reset
  → if searchAsMove OFF:
      → setBoundsDirty(true) → MapMovedBanner shows
```

**Constants from `src/lib/constants.ts`:**
```ts
PROGRAMMATIC_MOVE_TIMEOUT_MS = 2500;  // Auto-clear timeout for programmatic flag
AREA_COUNT_DEBOUNCE_MS = 600;         // Debounce for area count requests
AREA_COUNT_CACHE_TTL_MS = 30000;      // Client cache TTL for area count
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
const ZOOM_DOTS_ONLY = 12;     // Below: all pins are gray dots (no price)
const ZOOM_TOP_N_PINS = 14;    // 12-14: primary = price pins, mini = dots. 14+: all price pins
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
| `React.lazy` in PersistentMapWrapper | Mapbox GL (~944KB) excluded from SSR bundle, only loaded when `shouldRenderMap=true` |
| `next/dynamic` SSR:false in DynamicMap | Map bundle excluded from server rendering |
| Persistent layout mount | Mapbox re-init avoided on navigation (saves billing + load time) |
| `MapErrorBoundary` | Prevents map crashes from taking down the whole page |

### Fetch optimization

| Technique | Detail |
|-----------|--------|
| Map-relevant param filtering | Ignores pagination/sort changes for re-fetch decisions |
| Request deduplication | Bounds rounded to 4 decimal places; identical bounds skipped |
| 600ms debounce + 2s throttle | On search-as-move to limit API calls |
| AbortController | Stale fetches cancelled on new navigation or param change |
| v2 data injection | SSR data avoids redundant client-side fetch |
| Viewport clamping | Too-wide viewports clamped to 5-degree max rather than rejected |
| 429 auto-retry | Automatic retry with exponential backoff on rate limit |
| Area count caching | 30s client-side cache for area count responses |

### Rendering optimization

| Technique | Detail |
|-----------|--------|
| `useMemo` on GeoJSON data | Recomputed only when listings change |
| `useMemo` on marker positions | Recomputed only when unclustered listings change |
| `useMemo` on layer configs | Cluster layers recomputed only on `textScale` change |
| Native Mapbox clustering | GPU-accelerated; no React re-renders for cluster updates |
| `isMountedRef` guard | Prevents state updates after component unmount |
| `updateUnclusteredDebounceRef` | 100ms debounce on unclustered listing updates |
| `hoverScrollTimeoutRef` | 300ms debounce on marker hover scroll |
| Haptic feedback | `triggerHaptic()` on marker click for tactile confirmation |

### HMR error suppression

Worker communication errors during Turbopack hot reload are suppressed:
```ts
if (message.includes("reading 'send'") || message.includes("reading 'target'")) {
  event.preventDefault();
}
```
