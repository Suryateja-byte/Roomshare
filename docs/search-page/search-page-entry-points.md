# Search Page Entry Points & Layout

Comprehensive documentation of the `/search` route: its Next.js file conventions, layout architecture, data flow, and supporting UI components.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [File Map](#file-map)
- [1. layout.tsx -- Persistent Shell](#1-layouttsx----persistent-shell)
- [2. page.tsx -- Server-Side Data Fetching](#2-pagetsx----server-side-data-fetching)
- [3. loading.tsx -- Suspense Fallback](#3-loadingtsx----suspense-fallback)
- [4. error.tsx -- Error Boundary](#4-errortsx----error-boundary)
- [5. actions.ts -- Server Actions (Pagination)](#5-actionsts----server-actions-pagination)
- [6. SearchLayoutView -- Split View Manager](#6-searchlayoutview----split-view-manager)
- [7. SearchHeaderWrapper -- Collapsible Header](#7-searchheaderwrapper----collapsible-header)
- [8. SearchViewToggle -- Desktop/Mobile Rendering](#8-searchviewtoggle----desktopmobile-rendering)
- [9. SearchErrorBanner -- Inline Error Alert](#9-searcherrorbanner----inline-error-alert)
- [Data Flow Diagram](#data-flow-diagram)
- [Context Providers](#context-providers)
- [Key Patterns](#key-patterns)

---

## Architecture Overview

The search page uses a **persistent layout** pattern. The layout (`layout.tsx`) wraps the entire `/search` route segment and stays mounted across all query-parameter navigations. The map component lives in the layout so it never unmounts and re-initializes (critical for Mapbox billing). Only the **page segment** re-renders when filters, sort, or location change.

```
/search?q=SF&minPrice=500...
         |
   layout.tsx (persistent -- providers, header, map)
         |
   page.tsx  (server component -- re-renders per navigation)
         |
   loading.tsx (shown while page.tsx suspends)
   error.tsx   (shown if page.tsx throws)
```

---

## File Map

| File | Type | Rendering | Purpose |
|------|------|-----------|---------|
| `src/app/search/layout.tsx` | Next.js Layout | Server | Persistent shell with context providers and header |
| `src/app/search/page.tsx` | Next.js Page | Server (async) | Data fetching, SSR of search results |
| `src/app/search/loading.tsx` | Next.js Loading | Server | Skeleton fallback during page suspension |
| `src/app/search/error.tsx` | Next.js Error | Client | Error boundary UI with retry |
| `src/app/search/actions.ts` | Server Action | Server | `fetchMoreListings` for cursor-based "Load more" |
| `src/components/SearchLayoutView.tsx` | Component | Client | Split view orchestration (list + map) with SearchMapUIProvider |
| `src/components/SearchHeaderWrapper.tsx` | Component | Client | Collapsible search header (mobile + desktop) |
| `src/components/SearchViewToggle.tsx` | Component | Client | Desktop split pane / mobile bottom sheet layout |
| `src/components/SearchErrorBanner.tsx` | Component | Client | Inline warning banner with optional retry |

---

## 1. layout.tsx -- Persistent Shell

**Path**: `/mnt/d/Documents/roomshare/src/app/search/layout.tsx`

### Purpose

Wraps every `/search/*` route with:
1. Context providers required by child components.
2. A fixed-position header containing the search form.
3. The map + list split view (via `SearchLayoutView`).

### Props

```ts
{ children: React.ReactNode }
```

`children` is the page segment (`page.tsx` output or `loading.tsx` / `error.tsx`).

### Provider Nesting Order (layout.tsx level)

```tsx
<SearchTransitionProvider>        // URL transition state (pending navigations)
  <FilterStateProvider>           // Client-side filter draft state
    <MobileSearchProvider>        // Mobile header expand/collapse + filter sheet
      <MapBoundsProvider>         // Current map viewport bounds
        <ListingFocusProvider>    // Which listing card/pin is focused
          <SearchV2DataProvider>  // V2 search data bridge (page -> map)
            <SearchLayoutView>    // Split view manager (adds SearchMapUIProvider)
              {children}          // page.tsx output
            </SearchLayoutView>
          </SearchV2DataProvider>
        </ListingFocusProvider>
      </MapBoundsProvider>
    </MobileSearchProvider>
  </FilterStateProvider>
</SearchTransitionProvider>
```

**Note**: `SearchMapUIProvider` is added by `SearchLayoutView`, not in the layout itself.

### Key Details

- The `<header>` is **fixed** (`fixed top-0 ... z-[1100]`) with `backdrop-blur-xl`.
- Main content area has explicit top padding matching header height to prevent CLS:
  - Mobile: `pt-[80px]` (py-3 * 2 + h-14 = 80px)
  - Desktop (`sm`+): `pt-[96px]` (py-4 * 2 + sm:h-16 = 96px)
- The layout uses `h-screen-safe` and `overflow-hidden` to create a full-viewport app shell.

### Connections

| Consumes | Provides to Children |
|----------|---------------------|
| `SearchHeaderWrapper` | `SearchTransitionProvider` context |
| `SearchLayoutView` | `FilterStateProvider` context |
| -- | `MobileSearchProvider` context |
| -- | `MapBoundsProvider` context |
| -- | `ListingFocusProvider` context |
| -- | `SearchV2DataProvider` context |

---

## 2. page.tsx -- Server-Side Data Fetching

**Path**: `/mnt/d/Documents/roomshare/src/app/search/page.tsx`

### Purpose

The main server component that:
1. Parses URL search params.
2. Rate-limits the request.
3. Authenticates the user (for saved listings).
4. Fetches paginated listings via V2 (with V1 fallback).
5. Preloads LCP images.
6. Renders the results list with `SearchResultsClient`.

### Parameters

```ts
{
  searchParams: Promise<{
    q?: string;
    minPrice?: string;
    maxPrice?: string;
    amenities?: string | string[];
    moveInDate?: string;
    leaseDuration?: string;
    houseRules?: string | string[];
    languages?: string | string[];
    roomType?: string;
    genderPreference?: string;
    householdGender?: string;
    minLat?: string; maxLat?: string;
    minLng?: string; maxLng?: string;
    lat?: string;    lng?: string;
    page?: string;
    sort?: string;
    cursor?: string;
    v2?: string;
  }>
}
```

### Key Logic Flow

```
1. Await searchParams
2. Rate limit check (checkServerComponentRateLimit)
   └─ If blocked → render "Too Many Requests" UI, return early
3. Authenticate (auth())
4. Parse params (parseSearchParams) → { q, filterParams, requestedPage, sortOption, boundsRequired, browseMode }
5. Start savedPromise in parallel (non-blocking)
6. If boundsRequired → render "Please select a location" UI + V1PathResetSetter, return early
7. Try V2 search (if feature flag or ?v2=1)
   ├─ Success → usedV2=true, extract paginatedResult + v2MapData
   └─ Failure → warn, fall through to V1
8. V1 fallback (getListingsPaginated)
9. Await savedPromise
10. If zero results → analyzeFilterImpact for suggestions
11. Preload first 4 listing images (react-dom preload)
12. Build searchParamsString (exclude cursor/page/v2)
13. Render: V2MapDataSetter or V1PathResetSetter + SearchResultsLoadingWrapper > listContent
```

### Early Return Paths

| Condition | Rendered UI | Key Component |
|-----------|-------------|---------------|
| Rate limited | "Too Many Requests" with retry timer | None (inline JSX) |
| `boundsRequired` (no geo bounds) | "Please select a location" with link to home | `V1PathResetSetter` |
| `paginatedResult` undefined after both paths | Throws error (caught by error.tsx) | -- |

### V2 vs V1 Search

The page supports two search backends:

- **V2** (`executeSearchV2`): Returns listings + GeoJSON map data in a single call. Activated by `features.searchV2` env flag or `?v2=1` query param. On success, injects map data via `V2MapDataSetter` into `SearchV2DataContext`.
- **V1** (`getListingsPaginated`): Traditional paginated query. Map data is fetched independently by `PersistentMapWrapper` via `/api/map-listings`. Signals V1 mode via `V1PathResetSetter`.

### Image Preloading (LCP Optimization)

```ts
// Preloads first 4 listing images as <link rel="preload" as="image">
if (listings.length > 0) {
    listings.slice(0, 4).forEach((listing) => {
        const imageUrl = getFirstImageUrl(listing);
        preload(imageUrl, { as: 'image' });
    });
}
```

Uses deterministic placeholder selection when a listing has no images (hash of listing ID mod placeholder count).

### Rendered Output

```tsx
<>
  {v2MapData ? <V2MapDataSetter data={v2MapData} /> : <V1PathResetSetter />}
  <SearchResultsLoadingWrapper>
    <div className="max-w-[840px] mx-auto pb-24 md:pb-6">
      <CategoryBar />
      <RecommendedFilters />
      <AppliedFilterChips currentCount={total} />
      {/* heading + sort + save search */}
      <SearchResultsClient
        key={searchParamsString}  // Remounts on filter change (resets cursor)
        initialListings={listings}
        initialNextCursor={initialNextCursor}
        initialTotal={total}
        savedListingIds={savedListingIds}
        searchParamsString={searchParamsString}
        query={q ?? ""}
        browseMode={browseMode}
        hasConfirmedZeroResults={hasConfirmedZeroResults}
        filterSuggestions={filterSuggestions}
        sortOption={sortOption}
      />
    </div>
  </SearchResultsLoadingWrapper>
</>
```

**Important**: `SearchResultsClient` is keyed by `searchParamsString`. Any filter/sort change causes a full remount, resetting cursor and accumulated listings. This is a deliberate invariant (see CLAUDE.md "Search pagination invariants").

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `ITEMS_PER_PAGE` | 12 | Listings per page/cursor fetch |
| `PLACEHOLDER_IMAGES` | 6 Unsplash URLs | Deterministic fallback images |

---

## 3. loading.tsx -- Suspense Fallback

**Path**: `/mnt/d/Documents/roomshare/src/app/search/loading.tsx`

### Purpose

Next.js automatically wraps `page.tsx` in a `<Suspense>` boundary. When the page is streaming (async data fetching), this skeleton is shown.

```tsx
import { SearchResultsSkeleton } from "@/components/skeletons/PageSkeleton";

export default function Loading() {
    return <SearchResultsSkeleton count={6} />;
}
```

### Key Details

- Renders 6 skeleton listing cards to match the initial viewport.
- Only the **results area** shows a skeleton; the header and map (in the layout) remain visible and interactive.
- The skeleton component lives in `src/components/skeletons/PageSkeleton.tsx`.

---

## 4. error.tsx -- Error Boundary

**Path**: `/mnt/d/Documents/roomshare/src/app/search/error.tsx`

### Purpose

Client-side error boundary for the search page segment. Catches errors thrown by `page.tsx` (e.g., database failures, network errors).

### Props

```ts
{
  error: Error & { digest?: string };
  reset: () => void;  // Re-renders the page segment
}
```

### Behavior

1. Logs the error via `console.error` on mount.
2. Shows a user-friendly message with two actions:
   - **Try again** -- calls `reset()` to re-render the page segment.
   - **Go home** -- links to `/`.
3. In development mode, shows a collapsible `<details>` with the error message and digest.

### Key Details

- Uses `'use client'` directive (required for error boundaries).
- Padding (`pt-[80px] sm:pt-[96px]`) matches the fixed header height from layout.tsx.
- The error boundary only wraps the page segment; the layout (header, map) remains functional.

---

## 5. actions.ts -- Server Actions (Pagination)

**Path**: `/mnt/d/Documents/roomshare/src/app/search/actions.ts`

### Purpose

Exports the `fetchMoreListings` server action, called by `SearchResultsClient` when the user clicks "Load more".

### Interface

```ts
export interface FetchMoreResult {
  items: ListingData[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export async function fetchMoreListings(
  cursor: string,
  rawParams: Record<string, string | string[] | undefined>
): Promise<FetchMoreResult>
```

### Logic Flow

```
1. Validate cursor (non-empty string)
2. Rate limit check
3. If V2 enabled (feature flag):
   ├─ Build params with cursor → executeSearchV2
   ├─ Success → return { items, nextCursor, hasNextPage }
   └─ Failure → warn, fall through
4. V1 fallback → getListingsPaginated (no cursor support, returns hasNextPage: false)
```

### Key Details

- Marked `"use server"` -- runs exclusively on the server, callable from client components.
- V1 fallback returns `hasNextPage: false` because V1 does not support cursor-based continuation.
- Rate limiting uses the same `checkServerComponentRateLimit` as the page.

---

## 6. SearchLayoutView -- Split View Manager

**Path**: `/mnt/d/Documents/roomshare/src/components/SearchLayoutView.tsx`

### Purpose

Client component that orchestrates the list + map split view. Lives in the layout (persistent). Adds `SearchMapUIProvider` to manage map UI state.

### Props

```ts
interface SearchLayoutViewProps {
  children: ReactNode;  // Page segment output (search results)
}
```

### Key Logic

```tsx
const { shouldShowMap, shouldRenderMap, toggleMap, isLoading } = useMapPreference();

useKeyboardShortcuts([
  { key: "m", preventInInput: true, action: toggleMap, description: "Toggle map/list view" },
]);

const { showBanner, showLocationConflict, onSearch, onReset, areaCount, isAreaCountLoading } = useMapMovedBanner();
```

### Rendered Output

```tsx
<SearchMapUIProvider showMap={toggleMap} shouldShowMap={shouldShowMap}>
  <ListScrollBridge />  {/* Scrolls listing card into view when map marker clicked */}
  <SearchViewToggle
    mapComponent={<PersistentMapWrapper shouldRenderMap={shouldRenderMap} />}
    shouldShowMap={shouldShowMap}
    onToggle={toggleMap}
    isLoading={isLoading}
  >
    {(showBanner || showLocationConflict) && (
      <MapMovedBanner variant="list" onSearch={handleSearch} onReset={onReset} ... />
    )}
    {children}
  </SearchViewToggle>
</SearchMapUIProvider>
```

### Connections

| Hook/Context | Purpose |
|-------------|---------|
| `useMapPreference` | Reads/writes map visibility preference (localStorage) |
| `useKeyboardShortcuts` | `M` key toggles map |
| `useMapMovedBanner` | "Search this area" banner when user pans with auto-search off |
| `SearchMapUIProvider` | Provides map UI state and controls (showMap callback, shouldShowMap state) |

### Cost Optimization

- `shouldRenderMap` controls whether the Mapbox GL instance is created at all.
- Desktop users can hide the map entirely (no Mapbox billing).
- Mobile defaults to list-only (map renders but Mapbox init is deferred).

---

## 7. SearchHeaderWrapper -- Collapsible Header

**Path**: `/mnt/d/Documents/roomshare/src/components/SearchHeaderWrapper.tsx`

### Purpose

Manages the search form header that collapses on scroll, with different behaviors for mobile and desktop.

### Props

None (reads state from hooks and context).

### States

| Viewport | At Top / Expanded | Scrolled Down (Collapsed) |
|----------|-------------------|--------------------------|
| Mobile | Full `SearchForm` | `CollapsedMobileSearch` (location summary + filter button) |
| Desktop | Full `SearchForm` | `CompactSearchPill` (clickable pill to re-expand) |

### Key Logic

```tsx
const { isCollapsed } = useScrollHeader({ threshold: 80 });
const { isExpanded, expand, openFilters } = useMobileSearch();
const showCollapsed = isCollapsed && !isExpanded;
```

### LCP Optimization

`SearchForm` is **lazy-loaded** to defer its large bundle (~875 lines + dependencies). This allows listing images (the actual LCP elements) to render first.

```tsx
const SearchForm = lazy(() => import("@/components/SearchForm"));

<Suspense fallback={
  <div className="h-14 sm:h-16 w-full bg-zinc-100 ... animate-pulse rounded-xl ..." />
}>
  <SearchForm />
</Suspense>
```

The Suspense fallback dimensions are carefully matched to the actual `SearchForm` height to prevent CLS.

### Keyboard Shortcut

`Cmd/Ctrl+K` focuses the search location input (`#search-location`).

---

## 8. SearchViewToggle -- Desktop/Mobile Rendering

**Path**: `/mnt/d/Documents/roomshare/src/components/SearchViewToggle.tsx`

### Purpose

Renders the appropriate layout for mobile (map background + bottom sheet) and desktop (side-by-side split).

### Props

```ts
interface SearchViewToggleProps {
  children: React.ReactNode;       // List content (page results)
  mapComponent: React.ReactNode;   // PersistentMapWrapper
  shouldShowMap: boolean;           // Map visibility preference
  onToggle: () => void;             // Toggle callback
  isLoading: boolean;               // Preference hydration state
  resultHeaderText?: string;        // Mobile bottom sheet header text
}
```

### Viewport Detection

Uses a custom `useIsDesktop` hook (768px breakpoint via `matchMedia`). Returns `undefined` during SSR to prevent hydration mismatch.

```ts
function useIsDesktop(): boolean | undefined {
  const [isDesktop, setIsDesktop] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mql.matches);
    // ...listener
  }, []);
  return isDesktop;
}
```

### Mobile Layout

```
┌─────────────────────┐
│ Map (absolute, full) │  ← Always rendered on mobile
├─────────────────────┤
│ MobileBottomSheet   │  ← Draggable overlay with 3 snap points
│   {children}        │     (collapsed ~15vh, half ~50vh, expanded ~85vh)
├─────────────────────┤
│ FloatingMapButton   │  ← Toggles between list/map focus
└─────────────────────┘
```

- When a map pin is tapped (`activeId` changes), the sheet snaps to half.
- `FloatingMapButton` toggles between collapsed (map visible) and half (list visible).

### Desktop Layout

```
┌──────────────┬───────────────┐
│ List (55%)   │ Map (45%)     │  ← shouldShowMap=true
│ {children}   │ mapComponent  │
│              │ [Hide map]    │
└──────────────┴───────────────┘

┌──────────────────────────────┐
│ List (100%)                  │  ← shouldShowMap=false
│ {children}                   │
│                  [Show map]  │  ← Fixed bottom-right button
└──────────────────────────────┘
```

### Dual Mount Prevention

The map is rendered in **exactly one** DOM container to prevent dual Mapbox initialization:

```ts
const renderMapInMobile = isDesktop === false;
const renderMapInDesktop = isDesktop !== false && shouldShowMap;
```

During SSR (`isDesktop === undefined`), the desktop container is used since CSS classes (`hidden md:flex`) handle visibility.

---

## 9. SearchErrorBanner -- Inline Error Alert

**Path**: `/mnt/d/Documents/roomshare/src/components/SearchErrorBanner.tsx`

### Purpose

A reusable inline warning banner for non-fatal errors (e.g., "Load more" failures, partial data issues). Distinct from `error.tsx` which handles full page errors.

### Props

```ts
interface SearchErrorBannerProps {
  message: string;       // Error description
  retryable?: boolean;   // Show retry button
  onRetry?: () => void;  // Retry callback
}
```

### Rendered Output

```
┌─ ⚠ ─────────────────────────────────┐
│ AlertTriangle  {message}   [Try again] │
└──────────────────────────────────────┘
```

- Uses `role="alert"` for accessibility.
- Styled with amber/warning colors (light and dark mode).
- Retry button only appears when both `retryable` and `onRetry` are provided.

---

## Data Flow Diagram

```
URL params ──→ page.tsx (SSR)
                  │
                  ├─ Rate limit check
                  ├─ Auth (session)
                  ├─ parseSearchParams()
                  │
                  ├─ V2: executeSearchV2() ──→ paginatedResult + v2MapData
                  │   or
                  └─ V1: getListingsPaginated() ──→ paginatedResult
                         (map fetched independently by PersistentMapWrapper)
                  │
                  ▼
          SearchResultsClient (hydrated)
                  │
                  ├─ "Load more" ──→ actions.ts/fetchMoreListings (server action)
                  │                     └─ V2 or V1 cursor fetch
                  │
                  └─ Renders ListingCard grid

layout.tsx ──→ SearchLayoutView ──→ SearchMapUIProvider ──→ SearchViewToggle
                  │                                               │
                  │                                          ┌─────┴─────┐
                  │                                          │ Mobile     │ Desktop
                  │                                          │ BottomSheet│ Split Pane
                  │                                          └─────┬─────┘
                  │                                                │
                  └─ PersistentMapWrapper ──────────────────────────┘
                       │
                       ├─ V2: reads SearchV2DataContext (set by V2MapDataSetter)
                       └─ V1: fetches /api/map-listings independently
```

---

## Context Providers

All providers listed below are instantiated across the layout hierarchy and persist across navigations.

| Provider | Source | Level | Purpose |
|----------|--------|-------|---------|
| `SearchTransitionProvider` | `src/contexts/SearchTransitionContext` | layout.tsx | Tracks pending URL transitions (for loading indicators) |
| `FilterStateProvider` | `src/contexts/FilterStateContext` | layout.tsx | Draft filter state before applying to URL |
| `MobileSearchProvider` | `src/contexts/MobileSearchContext` | layout.tsx | Mobile header expand/collapse, filter sheet open/close |
| `MapBoundsProvider` | `src/contexts/MapBoundsContext` | layout.tsx | Current map viewport bounds; "search this area" banner state |
| `ListingFocusProvider` | `src/contexts/ListingFocusContext` | layout.tsx | Syncs focused listing between list cards and map pins |
| `SearchV2DataProvider` | `src/contexts/SearchV2DataContext` | layout.tsx | Bridge for V2 search data from page to persistent map |
| `SearchMapUIProvider` | `src/contexts/SearchMapUIContext` | SearchLayoutView | Map UI state and controls (showMap callback, shouldShowMap state) |

---

## Key Patterns

### Persistent Map (No Remount)

The map lives in `layout.tsx` via `SearchLayoutView > SearchMapUIProvider > SearchViewToggle > PersistentMapWrapper`. Because Next.js layouts persist across same-segment navigations, the map never unmounts when URL params change. This saves Mapbox billing (charged per map load) and avoids re-initialization jank.

### SSR with Streaming

`page.tsx` is an async server component. Next.js streams it, showing `loading.tsx` (skeleton) until data resolves. The layout renders immediately with header and map, so users see a functional UI before results arrive.

### V2/V1 Dual Path with Graceful Fallback

The search supports two backends. V2 is tried first (when enabled); on any failure it falls through to V1 silently with a `console.warn`. The map data delivery mechanism differs:
- **V2**: Map data is bundled with search results and injected via `V2MapDataSetter` into context.
- **V1**: Map data is fetched independently by the map component via API route.

`V1PathResetSetter` clears stale V2 context state to prevent the map from waiting for V2 data that will never arrive.

### Cursor-Based Pagination

Initial results are SSR'd. "Load more" calls the `fetchMoreListings` server action with a cursor. The client deduplicates by listing ID (`seenIdsRef`) and caps at 60 accumulated items.

### LCP Optimization

Two techniques reduce Largest Contentful Paint:
1. **Image preloading**: Server-side `preload()` for the first 4 listing images.
2. **Lazy SearchForm**: The heavy search form is `lazy()` loaded so it does not block listing image rendering.

### CLS Prevention

- The `loading.tsx` skeleton matches the results layout dimensions.
- The `SearchForm` Suspense fallback has explicit height matching the actual form (`h-14 sm:h-16`).
- Fixed header padding values are documented and must match header height exactly.

### Rate Limiting

Both `page.tsx` and `actions.ts` check rate limits before executing any database queries. The rate limiter uses request headers and is scoped to the `search` action on the `/search` path.
