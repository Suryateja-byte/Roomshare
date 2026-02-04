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

---

## 1. layout.tsx -- Persistent Shell

**Path**: `/mnt/d/Documents/roomshare/src/app/search/layout.tsx`

### Purpose

Wraps every `/search/*` route with:
1. Context providers required by child components.
2. A fixed-position header containing the search form.
3. The map + list split view (via `SearchLayoutView`).

### Function Signature

```ts
// Line 33-37
export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
})
```

`children` is the page segment (`page.tsx` output or `loading.tsx` / `error.tsx`).

### Provider Nesting Order (layout.tsx level)

```tsx
// Lines 39-66
<SearchTransitionProvider>        // URL transition state (pending navigations)
  <FilterStateProvider>           // Client-side filter draft state
    <MobileSearchProvider>        // Mobile header expand/collapse + filter sheet
      <div className="h-screen-safe flex flex-col ...">
        <header>...</header>      // Fixed SearchHeaderWrapper
        <div className="flex-1 ...">
          <MapBoundsProvider>         // Current map viewport bounds
            <ListingFocusProvider>    // Which listing card/pin is focused
              <SearchV2DataProvider>  // V2 search data bridge (page -> map)
                <SearchLayoutView>    // Split view manager (adds SearchMapUIProvider)
                  {children}          // page.tsx output
                </SearchLayoutView>
              </SearchV2DataProvider>
            </ListingFocusProvider>
          </MapBoundsProvider>
        </div>
      </div>
    </MobileSearchProvider>
  </FilterStateProvider>
</SearchTransitionProvider>
```

**Note**: `SearchMapUIProvider` is added by `SearchLayoutView`, not in the layout itself.

### Imports

```ts
// Lines 1-8
import SearchLayoutView from "@/components/SearchLayoutView";
import SearchHeaderWrapper from "@/components/SearchHeaderWrapper";
import { MapBoundsProvider } from "@/contexts/MapBoundsContext";
import { SearchTransitionProvider } from "@/contexts/SearchTransitionContext";
import { FilterStateProvider } from "@/contexts/FilterStateContext";
import { ListingFocusProvider } from "@/contexts/ListingFocusContext";
import { SearchV2DataProvider } from "@/contexts/SearchV2DataContext";
import { MobileSearchProvider } from "@/contexts/MobileSearchContext";
```

### Key Details

- The `<header>` is **fixed** (`fixed top-0 left-0 right-0 ... z-[1100]`) with `backdrop-blur-xl` (line 44).
- Main content area has explicit top padding matching header height to prevent CLS (line 52):
  - Mobile: `pt-[80px]` (py-3 * 2 + h-14 = 80px)
  - Desktop (`sm`+): `pt-[96px]` (py-4 * 2 + sm:h-16 = 96px)
- The layout uses `h-screen-safe` and `overflow-hidden` to create a full-viewport app shell (line 42).

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

### Function Signature

```ts
// Lines 45-71
export default async function SearchPage({
    searchParams,
}: {
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
        minLat?: string;
        maxLat?: string;
        minLng?: string;
        maxLng?: string;
        lat?: string;
        lng?: string;
        page?: string;
        sort?: string;
        cursor?: string;
        v2?: string;
    }>;
})
```

### Imports

```ts
// Lines 1-20
import { auth } from '@/auth';
import { getListingsPaginated, getSavedListingIds, analyzeFilterImpact, PaginatedResult, PaginatedResultHybrid, ListingData } from '@/lib/data';
import SortSelect from '@/components/SortSelect';
import SaveSearchButton from '@/components/SaveSearchButton';
import { SearchResultsClient } from '@/components/search/SearchResultsClient';
import Link from 'next/link';
import { Search, Clock } from 'lucide-react';
import { headers } from 'next/headers';
import { checkServerComponentRateLimit } from '@/lib/with-rate-limit';
import { parseSearchParams, buildRawParamsFromSearchParams } from '@/lib/search-params';
import { executeSearchV2 } from '@/lib/search/search-v2-service';
import { V2MapDataSetter } from '@/components/search/V2MapDataSetter';
import { V1PathResetSetter } from '@/components/search/V1PathResetSetter';
import { SearchResultsLoadingWrapper } from '@/components/search/SearchResultsLoadingWrapper';
import { AppliedFilterChips } from '@/components/filters/AppliedFilterChips';
import { CategoryBar } from '@/components/search/CategoryBar';
import { RecommendedFilters } from '@/components/search/RecommendedFilters';
import type { V2MapData } from '@/contexts/SearchV2DataContext';
import { features } from '@/lib/env';
import { preload } from 'react-dom';
```

### Key Logic Flow

```
1. Await searchParams (line 72)
2. Rate limit check (checkServerComponentRateLimit, lines 75-96)
   └─ If blocked → render "Too Many Requests" UI, return early
3. Authenticate (auth(), line 98)
4. Parse params (parseSearchParams, line 101) → { q, filterParams, requestedPage, sortOption, boundsRequired, browseMode }
5. Start savedPromise in parallel (non-blocking, line 104)
6. If boundsRequired → render "Please select a location" UI + V1PathResetSetter, return early (lines 108-138)
7. Try V2 search if feature flag or ?v2=1 (lines 146-184)
   ├─ Success → usedV2=true, extract paginatedResult + v2MapData
   └─ Failure → warn, fall through to V1
8. V1 fallback (getListingsPaginated, lines 188-191)
9. Await savedPromise (line 194)
10. If total === 0 (confirmed zero) → analyzeFilterImpact for suggestions (lines 208-211)
11. Preload first 4 listing images (react-dom preload, lines 216-221)
12. Build searchParamsString (exclude cursor/page/v2, lines 225-234)
13. Extract initialNextCursor (line 237)
14. Render: V2MapDataSetter or V1PathResetSetter + SearchResultsLoadingWrapper > listContent (lines 288-303)
```

### Early Return Paths

| Condition | Rendered UI | Key Component |
|-----------|-------------|---------------|
| Rate limited (line 77) | "Too Many Requests" with retry timer | None (inline JSX) |
| `boundsRequired` (no geo bounds, line 108) | "Please select a location" with link to home | `V1PathResetSetter` |
| `paginatedResult` undefined after both paths (line 197) | Throws error (caught by error.tsx) | -- |

### V2 vs V1 Search

The page supports two search backends:

- **V2** (`executeSearchV2`, lines 159-177): Returns listings + GeoJSON map data in a single call. Activated by `features.searchV2` env flag or `?v2=1` query param. On success, injects map data via `V2MapDataSetter` into `SearchV2DataContext`.
- **V1** (`getListingsPaginated`, line 190): Traditional paginated query. Map data is fetched independently by `PersistentMapWrapper` via `/api/map-listings`. Signals V1 mode via `V1PathResetSetter`.

### Total Count Handling

```ts
// Lines 201-208
const { items: listings, total: rawTotal } = paginatedResult;
// IMPORTANT: Keep null distinct from 0 - null means "unknown count (>100 results)"
// whereas 0 means "confirmed zero results"
const total = rawTotal;

// Only show zero-results UI when we have confirmed zero results (total === 0)
// Not when total is null (unknown count, >100 results)
const hasConfirmedZeroResults = total !== null && total === 0;
```

### Image Preloading (LCP Optimization)

```ts
// Lines 216-221
if (listings.length > 0) {
    listings.slice(0, 4).forEach((listing) => {
        const imageUrl = getFirstImageUrl(listing);
        preload(imageUrl, { as: 'image' });
    });
}
```

Uses deterministic placeholder selection when a listing has no images (hash of listing ID mod placeholder count, lines 36-43).

### Helper Functions

```ts
// Lines 36-43
function getFirstImageUrl(listing: { id: string; images?: string[] }): string {
    if (listing.images && listing.images.length > 0) {
        return listing.images[0];
    }
    // Deterministic placeholder selection based on listing ID
    const placeholderIndex = listing.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % PLACEHOLDER_IMAGES.length;
    return PLACEHOLDER_IMAGES[placeholderIndex];
}
```

### Rendered Output

```tsx
// Lines 288-303
<>
  {v2MapData ? <V2MapDataSetter data={v2MapData} /> : <V1PathResetSetter />}
  <SearchResultsLoadingWrapper>
    <div className="max-w-[840px] mx-auto pb-24 md:pb-6">
      <CategoryBar />
      <div className="px-4 sm:px-6 pt-4 sm:pt-6">
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
    </div>
  </SearchResultsLoadingWrapper>
</>
```

**Important**: `SearchResultsClient` is keyed by `searchParamsString` (line 272). Any filter/sort change causes a full remount, resetting cursor and accumulated listings. This is a deliberate invariant (see CLAUDE.md "Search pagination invariants").

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `ITEMS_PER_PAGE` (line 22) | 12 | Listings per page/cursor fetch |
| `PLACEHOLDER_IMAGES` (lines 26-33) | 6 Unsplash URLs | Deterministic fallback images |

---

## 3. loading.tsx -- Suspense Fallback

**Path**: `/mnt/d/Documents/roomshare/src/app/search/loading.tsx`

### Purpose

Next.js automatically wraps `page.tsx` in a `<Suspense>` boundary. When the page is streaming (async data fetching), this skeleton is shown.

### Full Implementation

```tsx
// Lines 1-5
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

### Props Interface

```ts
// Lines 8-14
{
  error: Error & { digest?: string };
  reset: () => void;  // Re-renders the page segment
}
```

### Function Signature

```ts
// Lines 8-14
export default function SearchError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
})
```

### Imports

```ts
// Lines 3-6
import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
```

### Behavior

1. Logs the error via `console.error` on mount (lines 15-18).
2. Shows a user-friendly message with two actions:
   - **Try again** -- calls `reset()` to re-render the page segment (line 39).
   - **Go home** -- links to `/` (lines 44-48).
3. In development mode, shows a collapsible `<details>` with the error message and digest (lines 53-63).

### Key Details

- Uses `'use client'` directive (line 1, required for error boundaries).
- Padding (`pt-[80px] sm:pt-[96px]`, line 21) matches the fixed header height from layout.tsx.
- The error boundary only wraps the page segment; the layout (header, map) remains functional.

---

## 5. actions.ts -- Server Actions (Pagination)

**Path**: `/mnt/d/Documents/roomshare/src/app/search/actions.ts`

### Purpose

Exports the `fetchMoreListings` server action, called by `SearchResultsClient` when the user clicks "Load more".

### Interface

```ts
// Lines 12-16
export interface FetchMoreResult {
  items: ListingData[];
  nextCursor: string | null;
  hasNextPage: boolean;
}
```

### Function Signature

```ts
// Lines 18-21
export async function fetchMoreListings(
  cursor: string,
  rawParams: Record<string, string | string[] | undefined>
): Promise<FetchMoreResult>
```

### Imports

```ts
// Lines 3-8
import { headers } from "next/headers";
import { executeSearchV2 } from "@/lib/search/search-v2-service";
import { getListingsPaginated, type ListingData } from "@/lib/data";
import { parseSearchParams, buildRawParamsFromSearchParams } from "@/lib/search-params";
import { checkServerComponentRateLimit } from "@/lib/with-rate-limit";
import { features } from "@/lib/env";
```

### Logic Flow

```
1. Validate cursor (non-empty string, lines 23-25)
2. Rate limit check (lines 28-32)
3. If V2 enabled (feature flag, line 38):
   ├─ Build params with cursor → executeSearchV2 (lines 40-55)
   ├─ Success → return { items, nextCursor, hasNextPage } (lines 57-63)
   └─ Failure → warn, fall through (lines 64-68)
4. V1 fallback → getListingsPaginated (lines 73-78)
   └─ Returns hasNextPage: false (V1 doesn't support cursor continuation)
```

### Key Details

- Marked `"use server"` (line 1) -- runs exclusively on the server, callable from client components.
- V1 fallback returns `hasNextPage: false` because V1 does not support cursor-based continuation (lines 80-84).
- Rate limiting uses the same `checkServerComponentRateLimit` as the page.

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `ITEMS_PER_PAGE` (line 10) | 12 | Listings per cursor fetch |

---

## 6. SearchLayoutView -- Split View Manager

**Path**: `/mnt/d/Documents/roomshare/src/components/SearchLayoutView.tsx`

### Purpose

Client component that orchestrates the list + map split view. Lives in the layout (persistent). Adds `SearchMapUIProvider` to manage map UI state.

### Props Interface

```ts
// Lines 13-15
interface SearchLayoutViewProps {
  children: ReactNode;  // Page segment output (search results)
}
```

### Function Signature

```ts
// Line 36
export default function SearchLayoutView({ children }: SearchLayoutViewProps)
```

### Imports

```ts
// Lines 3-11
import { ReactNode } from "react";
import SearchViewToggle from "./SearchViewToggle";
import PersistentMapWrapper from "./PersistentMapWrapper";
import ListScrollBridge from "./listings/ListScrollBridge";
import { useMapPreference } from "@/hooks/useMapPreference";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useMapMovedBanner } from "@/contexts/MapBoundsContext";
import { MapMovedBanner } from "./map/MapMovedBanner";
import { SearchMapUIProvider } from "@/contexts/SearchMapUIContext";
```

### Key Logic

```tsx
// Lines 37-42
const {
  shouldShowMap,
  shouldRenderMap,
  toggleMap,
  isLoading,
} = useMapPreference();

// Lines 44-51
useKeyboardShortcuts([
  {
    key: "m",
    preventInInput: true,
    action: toggleMap,
    description: "Toggle map/list view",
  },
]);

// Line 54
const { showBanner, showLocationConflict, onSearch, onReset, areaCount, isAreaCountLoading } = useMapMovedBanner();
```

### Rendered Output

```tsx
// Lines 61-85
<SearchMapUIProvider showMap={toggleMap} shouldShowMap={shouldShowMap}>
  {/* Bridge: Scrolls listing card into view when map marker clicked */}
  <ListScrollBridge />

  <SearchViewToggle
    mapComponent={<PersistentMapWrapper shouldRenderMap={shouldRenderMap} />}
    shouldShowMap={shouldShowMap}
    onToggle={toggleMap}
    isLoading={isLoading}
  >
    {/* List variant banner - shows above results when map is hidden or on mobile */}
    {(showBanner || showLocationConflict) && (
      <MapMovedBanner
        variant="list"
        onSearch={handleSearch}
        onReset={onReset}
        areaCount={areaCount}
        isAreaCountLoading={isAreaCountLoading}
      />
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

### Function Signature

```ts
// Line 32
export default function SearchHeaderWrapper()
```

Props: None (reads state from hooks and context).

### Imports

```ts
// Lines 16-26
import { Suspense, lazy, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useScrollHeader } from "@/hooks/useScrollHeader";
import {
  useKeyboardShortcuts,
  formatShortcut,
} from "@/hooks/useKeyboardShortcuts";
import { useMobileSearch } from "@/contexts/MobileSearchContext";
import CollapsedMobileSearch from "@/components/CollapsedMobileSearch";
import { CompactSearchPill } from "@/components/search/CompactSearchPill";
```

### States

| Viewport | At Top / Expanded | Scrolled Down (Collapsed) |
|----------|-------------------|--------------------------|
| Mobile | Full `SearchForm` | `CollapsedMobileSearch` (location summary + filter button) |
| Desktop | Full `SearchForm` | `CompactSearchPill` (clickable pill to re-expand) |

### Key Logic

```tsx
// Lines 33-34
const { isCollapsed } = useScrollHeader({ threshold: 80 });
const { isExpanded, expand, openFilters } = useMobileSearch();

// Line 46
const showCollapsed = isCollapsed && !isExpanded;
```

### Keyboard Shortcut

`Cmd/Ctrl+K` focuses the search location input (`#search-location`, lines 36-43).

### LCP Optimization

`SearchForm` is **lazy-loaded** to defer its large bundle (~875 lines + dependencies). This allows listing images (the actual LCP elements) to render first.

```tsx
// Line 30
const SearchForm = lazy(() => import("@/components/SearchForm"));

// Lines 80-92
<Suspense
  fallback={
    /*
     * CLS fix: Fallback dimensions must match actual SearchForm height
     * Mobile: p-1.5 (12px) + button h-11 (44px) = 56px ≈ h-14
     * Desktop: md:p-2 (16px) + button sm:h-12 (48px) = 64px ≈ sm:h-16
     * Use rounded-xl to match actual form, not rounded-full
     */
    <div className="h-14 sm:h-16 w-full bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded-xl border border-zinc-200/80 dark:border-zinc-700/80" />
  }
>
  <SearchForm />
</Suspense>
```

The Suspense fallback dimensions are carefully matched to the actual `SearchForm` height to prevent CLS.

---

## 8. SearchViewToggle -- Desktop/Mobile Rendering

**Path**: `/mnt/d/Documents/roomshare/src/components/SearchViewToggle.tsx`

### Purpose

Renders the appropriate layout for mobile (map background + bottom sheet) and desktop (side-by-side split).

### Props Interface

```ts
// Lines 9-20
interface SearchViewToggleProps {
  children: React.ReactNode;       // List content (page results)
  mapComponent: React.ReactNode;   // PersistentMapWrapper
  /** Whether the map should be visible */
  shouldShowMap: boolean;
  /** Toggle map visibility callback */
  onToggle: () => void;
  /** Whether the preference is still loading (hydrating from localStorage) */
  isLoading: boolean;
  /** Result count text for mobile bottom sheet header */
  resultHeaderText?: string;
}
```

### Function Signature

```ts
// Lines 41-48
export default function SearchViewToggle({
  children,
  mapComponent,
  shouldShowMap,
  onToggle,
  isLoading,
  resultHeaderText,
}: SearchViewToggleProps)
```

### Imports

```ts
// Lines 3-7
import { useRef, useState, useEffect, useCallback } from 'react';
import { Map, MapPinOff } from 'lucide-react';
import MobileBottomSheet from './search/MobileBottomSheet';
import FloatingMapButton from './search/FloatingMapButton';
import { useListingFocus } from '@/contexts/ListingFocusContext';
```

### Viewport Detection

Uses a custom `useIsDesktop` hook (768px breakpoint via `matchMedia`). Returns `undefined` during SSR to prevent hydration mismatch.

```ts
// Lines 27-39
function useIsDesktop(): boolean | undefined {
  const [isDesktop, setIsDesktop] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
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

- When a map pin is tapped (`activeId` changes), the sheet snaps to half (lines 55-59).
- `FloatingMapButton` toggles between collapsed (map visible) and half (list visible) (lines 61-65).

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
// Lines 70-71
const renderMapInMobile = isDesktop === false;
const renderMapInDesktop = isDesktop !== false && shouldShowMap;
```

During SSR (`isDesktop === undefined`), the desktop container is used since CSS classes (`hidden md:flex`) handle visibility.

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
| `SearchTransitionProvider` | `src/contexts/SearchTransitionContext` | layout.tsx (outer) | Tracks pending URL transitions (for loading indicators) |
| `FilterStateProvider` | `src/contexts/FilterStateContext` | layout.tsx | Draft filter state before applying to URL |
| `MobileSearchProvider` | `src/contexts/MobileSearchContext` | layout.tsx | Mobile header expand/collapse, filter sheet open/close |
| `MapBoundsProvider` | `src/contexts/MapBoundsContext` | layout.tsx (content div) | Current map viewport bounds; "search this area" banner state |
| `ListingFocusProvider` | `src/contexts/ListingFocusContext` | layout.tsx (content div) | Syncs focused listing between list cards and map pins |
| `SearchV2DataProvider` | `src/contexts/SearchV2DataContext` | layout.tsx (content div) | Bridge for V2 search data from page to persistent map |
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
