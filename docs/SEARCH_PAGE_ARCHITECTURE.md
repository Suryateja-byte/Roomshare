# Roomshare Search Page Architecture

## Complete Technical Reference: Every Component, State, API, and Visual Change

**Generated:** January 2026
**Version:** 3.0
**Scope:** Ultrathink deep analysis of `/search` page implementation with exhaustive detail

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Component Hierarchy & Files](#3-component-hierarchy--files)
4. [Search Page Server Component](#4-search-page-server-component)
5. [SearchForm Component](#5-searchform-component)
6. [Filter System](#6-filter-system)
7. [Batched Filter System](#7-batched-filter-system)
8. [URL Parameter System](#8-url-parameter-system)
9. [Location Search & Geocoding](#9-location-search--geocoding)
10. [Map Implementation](#10-map-implementation)
11. [Map Markers & Clustering](#11-map-markers--clustering)
12. [Map Bounds Management](#12-map-bounds-management)
13. [Nearby Places & POI Search](#13-nearby-places--poi-search)
14. [Listing Card Component](#14-listing-card-component)
15. [Search Results Grid](#15-search-results-grid)
16. [Pagination System](#16-pagination-system)
17. [Sort System](#17-sort-system)
18. [Empty State & Zero Results](#18-empty-state--zero-results)
19. [Loading States & Skeletons](#19-loading-states--skeletons)
20. [Error Handling](#20-error-handling)
21. [Context Providers](#21-context-providers)
22. [API Endpoints](#22-api-endpoints)
23. [Database Queries](#23-database-queries)
24. [Caching Architecture](#24-caching-architecture)
25. [Rate Limiting](#25-rate-limiting)
26. [Responsive Design](#26-responsive-design)
27. [Dark Mode Support](#27-dark-mode-support)
28. [Accessibility Features](#28-accessibility-features)
29. [Animation & Transitions](#29-animation--transitions)
30. [Performance Optimizations](#30-performance-optimizations)
31. [Visual Change Matrix](#31-visual-change-matrix)
32. [State Flow Diagrams](#32-state-flow-diagrams)
33. [Complete File Reference](#33-complete-file-reference)
34. [CSS Class Reference](#34-css-class-reference)
35. [Constants & Configuration](#35-constants--configuration)

---

## 1. Executive Summary

The Roomshare search page implements a **URL-first state management** architecture with these key principles:

### Core Architecture Principles

| Principle                         | Implementation                                                       |
| --------------------------------- | -------------------------------------------------------------------- |
| **URL as Single Source of Truth** | All filter, sort, pagination state lives in URL params               |
| **Server-Side Rendering**         | Page component fetches data on server with SQL-level filtering       |
| **Lazy Map Loading**              | Mapbox only initializes when user opts in (mobile list-only default) |
| **Batched Filter Updates**        | Filters accumulate locally, apply via button click                   |
| **Hybrid Pagination**             | Exact counts for ≤100 results, "100+" for larger sets                |
| **Local-First Geocoding**         | ~100 US locations searched before Mapbox API                         |
| **Multi-Layer Caching**           | unstable_cache (60s) + CDN headers + local dataset                   |

### Key Cost Optimizations

| Optimization                 | Impact                                |
| ---------------------------- | ------------------------------------- |
| Lazy Map Initialization      | ~60% fewer Mapbox Map loads           |
| Local-First Location Search  | ~60-70% fewer Geocoding API calls     |
| Hybrid COUNT Queries         | ~40% fewer expensive COUNT operations |
| Search as Move OFF (default) | ~80% fewer map-triggered searches     |
| CDN Edge Caching             | ~70% faster map marker responses      |

### Primary Files

| Component     | File                                        | Lines | Purpose                                  |
| ------------- | ------------------------------------------- | ----- | ---------------------------------------- |
| Search Page   | `src/app/search/page.tsx`                   | 316   | Server component, data fetching, V2 path |
| Search Layout | `src/app/search/layout.tsx`                 | 65    | Persistent wrapper, context providers    |
| Layout View   | `src/components/SearchLayoutView.tsx`       | 268   | Mobile/desktop split view handling       |
| Search Form   | `src/components/SearchForm.tsx`             | 1256  | Filter UI, location search               |
| Map           | `src/components/Map.tsx`                    | 1392  | Mapbox GL with tiered markers            |
| Data Layer    | `src/lib/data.ts`                           | 2337  | SQL queries, caching                     |
| URL Parsing   | `src/lib/search-params.ts`                  | 584   | Validation, normalization                |
| Near Matches  | `src/lib/near-matches.ts`                   | 294   | Relaxed filter matching logic            |
| Listing Card  | `src/components/listings/ListingCard.tsx`   | 303   | Individual result card                   |
| Low Results   | `src/components/LowResultsGuidance.tsx`     | 159   | Guidance for low result counts           |
| Pagination    | `src/components/Pagination.tsx`             | 239   | Page navigation                          |
| V2 Service    | `src/lib/search/search-v2-service.ts`       | 280   | Unified search for list + map data       |
| V2 Types      | `src/lib/search/types.ts`                   | 119   | V2 response types and constants          |
| V2 Map Setter | `src/components/search/V2MapDataSetter.tsx` | 38    | Context injection for V2 map data        |

---

## 2. Architecture Overview

### 2.1 Complete Component Hierarchy

```
/search (URL)
│
├── SearchLayout (layout.tsx)
│   ├── SearchTransitionProvider (context)
│   │   └── FilterStateProvider (context)
│   │       └── MapBoundsProvider (context)
│   │           └── ListingFocusProvider (context)
│   │           │
│   │           ├── Header (sticky)
│   │           │   └── Suspense
│   │           │       └── SearchForm (client)
│   │           │           ├── LocationSearchInput (autocomplete)
│   │           │           ├── Filter Drawer (Portal)
│   │           │           │   ├── Price Range Inputs
│   │           │           │   ├── Amenities Multi-Select
│   │           │           │   ├── House Rules Multi-Select
│   │           │           │   ├── Languages Multi-Select
│   │           │           │   ├── Room Type Select
│   │           │           │   ├── Lease Duration Select
│   │           │           │   ├── Move-In Date Picker
│   │           │           │   ├── FilterStickyFooter
│   │           │           │   └── FocusTrap
│   │           │           ├── SortSelect (Radix)
│   │           │           └── SaveSearchButton (Modal)
│   │           │
│   │           └── Main Content
│   │               └── SearchLayoutView (client)
│   │                   │
│   │                   ├── Mobile View (< 768px)
│   │                   │   ├── List View (default)
│   │                   │   │   ├── PendingFiltersBanner
│   │                   │   │   ├── MapMovedBanner (variant="list")
│   │                   │   │   ├── ListLoadingOverlay
│   │                   │   │   └── {children} → SearchPage
│   │                   │   ├── Map View (on toggle)
│   │                   │   │   └── PersistentMapWrapper
│   │                   │   │       └── DynamicMap (lazy)
│   │                   │   │           └── Map.tsx
│   │                   │   └── FAB Toggle (fixed bottom)
│   │                   │
│   │                   └── Desktop View (≥ 768px)
│   │                       ├── Left Panel (50% or 100%)
│   │                       │   ├── PendingFiltersBanner
│   │                       │   ├── MapMovedBanner (variant="list")
│   │                       │   ├── ListLoadingOverlay
│   │                       │   └── {children} → SearchPage
│   │                       │
│   │                       └── Right Panel
│   │                           ├── Map (if shown)
│   │                           │   ├── [Hide Map] button
│   │                           │   └── PersistentMapWrapper
│   │                           │       └── DynamicMap
│   │                           │           └── Map.tsx
│   │                           │               ├── MapMovedBanner (variant="map")
│   │                           │               ├── Cluster Layers
│   │                           │               ├── Stack Markers
│   │                           │               └── StackedListingPopup
│   │                           └── MapPlaceholder (if hidden)
│
└── SearchPage (page.tsx - Server Component)
    ├── V2MapDataSetter (if V2 enabled, injects map data to context)
    ├── SearchErrorBanner (if fetch error)
    ├── Screen Reader Announcement (aria-live)
    ├── Header Section
    │   ├── Results Title ("X places in Y")
    │   ├── Location Subtitle
    │   ├── SaveSearchButton
    │   └── SortSelect
    │
    ├── Results Section
    │   └── Results Grid (2-column)
    │       └── ListingCard[] (server-rendered)
    │           ├── ListingCardCarousel (if multiple images)
    │           │   ├── Next.js Image[] (first 2 eager, rest lazy)
    │           │   ├── Navigation Buttons (hover on desktop)
    │           │   └── Dot Indicators (max 5)
    │           ├── Image Container (single image fallback)
    │           │   ├── Next.js Image (lazy)
    │           │   ├── Availability Badge
    │           │   └── FavoriteButton (toast on error)
    │           └── Content Area
    │               ├── Title + Rating
    │               ├── Location
    │               ├── Amenities (max 3)
    │               ├── Languages (max 2 + count)
    │               └── Price
    │
    ├── LowResultsGuidance (if 1-4 results & nearMatches OFF)
    │   ├── Filter Suggestions (remove price/date/roomType)
    │   └── "Include near matches" toggle button (+N badge)
    │
    ├── Empty State (if no results)
    │   ├── Search Icon
    │   ├── "No matches found" title
    │   ├── Description
    │   └── ZeroResultsSuggestions (lazy)
    │
    └── Pagination
        ├── Results Info
        ├── Page Numbers (or "Page N")
        └── Prev/Next Buttons
```

### 2.2 State Management Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      URL SEARCH PARAMS                           │
│            (Single Source of Truth for All State)                │
│                                                                  │
│  ?q=...&minPrice=...&maxPrice=...&amenities=...&page=...&sort=...│
│  &minLat=...&maxLat=...&minLng=...&maxLng=...&nearMatches=...   │
└─────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           │                  │                  │
           ▼                  ▼                  ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │ SearchForm  │    │    Map      │    │  SearchPage │
    │  (Filters)  │    │  (Mapbox)   │    │  (Results)  │
    │             │    │             │    │             │
    │ ┌─────────┐ │    │             │    │             │
    │ │ Pending │ │    │             │    │             │
    │ │ State   │ │    │             │    │             │
    │ └─────────┘ │    │             │    │             │
    └─────────────┘    └─────────────┘    └─────────────┘
           │                  │                  │
           └──────────────────┴──────────────────┘
                              │
                    useSearchParams()
                    router.push/replace()
```

### 2.3 Rendering Strategy

| Component    | Type             | Data Source              | Re-renders On      |
| ------------ | ---------------- | ------------------------ | ------------------ |
| SearchLayout | Server           | None                     | Never (persistent) |
| SearchPage   | Server           | `getListingsPaginated()` | URL change         |
| SearchForm   | Client           | `useSearchParams()`      | URL change         |
| Map          | Client (dynamic) | `/api/map-listings`      | URL bounds change  |
| ListingCard  | Server           | Props from parent        | Parent re-render   |
| Pagination   | Client           | `useSearchParams()`      | URL change         |
| SortSelect   | Client           | `useSearchParams()`      | URL change         |

---

## 3. Component Hierarchy & Files

### 3.1 App Directory Structure

```
src/app/search/
├── page.tsx          # Server component (280 lines)
├── layout.tsx        # Persistent layout (65 lines)
├── loading.tsx       # Streaming fallback
└── error.tsx         # Error boundary (~60 lines)
```

### 3.2 Component Files

```
src/components/
├── SearchForm.tsx                    # 1256 lines - Main filter UI with batched filters
├── SearchLayoutView.tsx              # 268 lines - Mobile/desktop split view
├── LocationSearchInput.tsx           # 443 lines - Autocomplete
├── LowResultsGuidance.tsx            # 159 lines - Near-matches guidance
├── Pagination.tsx                    # 239 lines - Page navigation
├── SortSelect.tsx                    # 91 lines - Sort dropdown
├── SaveSearchButton.tsx              # 280 lines - Save modal
├── SearchErrorBanner.tsx             # 72 lines - Error display
├── ZeroResultsSuggestions.tsx        # 153 lines - Filter suggestions
├── PersistentMapWrapper.tsx          # ~200 lines - Map persistence
├── DynamicMap.tsx                    # ~50 lines - Lazy import
├── Map.tsx                           # 1392 lines - Mapbox GL with tiered markers
│
├── listings/
│   ├── ListingCard.tsx               # 303 lines - Result card
│   ├── ListingCardCarousel.tsx       # ~120 lines - Photo carousel (CSS scroll-snap)
│   └── ListScrollBridge.tsx          # Scroll-to-card behavior
│
├── map/
│   ├── StackedListingPopup.tsx       # 175 lines - Multi-listing popup
│   └── MapMovedBanner.tsx            # 73 lines - Area search banner
│
├── filters/
│   ├── PendingFiltersBanner.tsx      # 61 lines - Dirty state banner
│   ├── AppliedFilterChips.tsx        # Removable active filter chips
│   └── FilterStickyFooter.tsx        # 126 lines - Apply/Reset with dynamic count
│
├── search/
│   └── V2MapDataSetter.tsx           # 38 lines - V2 map data context injection
│
├── skeletons/
│   ├── PageSkeleton.tsx              # Skeleton components
│   ├── Skeleton.tsx                  # Base skeleton
│   └── ListingCardSkeleton.tsx       # Card skeleton
│
└── ui/
    ├── FocusTrap.tsx                 # 89 lines - Focus management
    ├── badge.tsx                     # Badge variants
    ├── LazyImage.tsx                 # Lazy loading images
    └── InfiniteScroll.tsx            # Scroll detection
```

### 3.3 Library Files

```
src/lib/
├── data.ts                           # 2337 lines - All queries
├── search-params.ts                  # 584 lines - URL parsing with nearMatches
├── near-matches.ts                   # 294 lines - Relaxed filter matching
├── filter-schema.ts                  # 721 lines - Zod validation
├── geocoding.ts                      # ~55 lines - Mapbox geocoding
├── mapbox-init.ts                    # ~26 lines - Worker setup
│
├── locations/
│   └── us-locations.ts               # ~500 lines - Local dataset
│
├── maps/
│   ├── mapAdapter.ts                 # ~322 lines - MapLibre abstraction
│   ├── marker-utils.ts               # 207 lines - Grouping/tiering/formatting
│   └── stadia.ts                     # ~30 lines - Stadia config
│
├── geo/
│   └── distance.ts                   # 163 lines - Haversine math
│
├── places/
│   └── types.ts                      # 155 lines - POI interfaces
│
└── search/
    ├── search-v2-service.ts          # 280 lines - Unified search execution
    ├── types.ts                      # 119 lines - V2 response types
    ├── transform.ts                  # ~150 lines - List/map transformations
    ├── ranking.ts                    # ~200 lines - Score-based ranking
    └── hash.ts                       # ~100 lines - Query hash, cursor encoding
```

### 3.4 Hook Files

```
src/hooks/
├── useBatchedFilters.ts              # 216 lines - Filter batching
├── useDebouncedFilterCount.ts        # 302 lines - Debounced listing count for "Show X listings"
├── useMapPreference.ts               # ~80 lines - Map visibility
└── useAbortableServerAction.ts       # 127 lines - Race conditions
```

### 3.5 Context Files

```
src/contexts/
├── SearchTransitionContext.tsx       # 89 lines - Navigation transitions
├── FilterStateContext.tsx            # ~100 lines - Dirty state sharing
├── ListingFocusContext.tsx           # ~120 lines - List↔Map hover/selection sync
├── SearchMapUIContext.tsx            # 144 lines - Map UI state (pendingFocus, "View on map")
├── SearchV2DataContext.tsx           # 67 lines - V2 map data sharing
└── MapBoundsContext.tsx              # 157 lines - Map bounds state
```

---

## 4. Search Page Server Component

### 4.1 File: `src/app/search/page.tsx`

**Type:** Server Component
**Lines:** 316
**Primary Role:** Data fetching, near-match calculation, and results rendering

### 4.2 Props Interface

```typescript
interface SearchPageProps {
  searchParams: Promise<{
    q?: string; // Search query
    minPrice?: string; // Min price filter
    maxPrice?: string; // Max price filter
    nearMatches?: string; // Include near-match results ("1" = enabled)
    amenities?: string | string[]; // Array filters
    moveInDate?: string; // Date string (YYYY-MM-DD)
    leaseDuration?: string; // Lease duration
    houseRules?: string | string[]; // Array filters
    languages?: string | string[]; // Array filters
    roomType?: string; // Room type enum
    minLat?: string; // Map bounds
    maxLat?: string;
    minLng?: string;
    maxLng?: string;
    lat?: string; // Center point
    lng?: string;
    page?: string; // Pagination
    sort?: string; // Sort option
  }>;
}
```

### 4.3 Data Fetching Flow

```typescript
// 1. Rate limiting check
const rateLimitResult = await checkServerComponentRateLimit();
if (rateLimitResult.limited) {
  // Show rate limit message with retry countdown
}

// 2. Parse and validate URL params
const rawParams = await searchParams;
const filterParams = parseSearchParams(rawParams);

// 3. Parallel data fetches
const [paginatedResult, savedListingIds] = await Promise.all([
  getListingsPaginated({
    ...filterParams,
    page: requestedPage,
    limit: ITEMS_PER_PAGE, // 12
  }),
  getSavedListingIds().catch(() => []), // Graceful degradation
]);
```

### 4.4 Render Structure

```tsx
<div className="flex flex-col">
  {/* Error banner - shown when fetch failed */}
  {fetchError && (
    <SearchErrorBanner message={fetchError} />
  )}

  {/* Main content container */}
  <div className="px-4 sm:px-6 py-4 sm:py-6 max-w-[840px] mx-auto pb-24 md:pb-6">

    {/* Screen reader announcement */}
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {announces results count}
    </div>

    {/* Header section */}
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-zinc-900 dark:text-white">
          {total} places {q && `in "${q}"`}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          {location info or generic message}
        </p>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <SaveSearchButton />
        <SortSelect />
      </div>
    </div>

    {/* Results or empty state */}
    {listings.length === 0 ? (
      <EmptyState />
    ) : (
      <>
        <ResultsGrid />
        <Pagination />
      </>
    )}
  </div>
</div>
```

### 4.5 Constants

```typescript
const ITEMS_PER_PAGE = 12;
```

### 4.6 CSS Classes Used

| Element      | Classes                                                                         |
| ------------ | ------------------------------------------------------------------------------- |
| Container    | `px-4 sm:px-6 py-4 sm:py-6 max-w-[840px] mx-auto pb-24 md:pb-6`                 |
| Title        | `text-lg sm:text-xl font-semibold text-zinc-900 dark:text-white tracking-tight` |
| Subtitle     | `text-sm text-zinc-500 dark:text-zinc-400 mt-1`                                 |
| Results Grid | `grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-x-6 sm:gap-y-8`                   |

---

## 5. SearchForm Component

### 5.1 File: `src/components/SearchForm.tsx`

**Type:** Client Component
**Lines:** 1256
**Primary Role:** Filter UI with location autocomplete

### 5.2 State Variables

```typescript
// Location autocomplete
const [location, setLocation] = useState("");
const [showSuggestions, setShowSuggestions] = useState(false);
const [selectedCoords, setSelectedCoords] = useState<{
  lat: number;
  lng: number;
} | null>(null);

// Filter drawer
const [showFilters, setShowFilters] = useState(false);

// Batched filter state (from hook)
const {
  pending, // BatchedFilterValues - local changes
  committed, // BatchedFilterValues - URL state
  isDirty, // boolean
  changeCount, // number
  apply, // () => BatchedFilterValues
  reset, // () => void
  updateField, // (field, value) => void
  toggleArrayItem, // (field, item) => void
} = useBatchedFilters();

// UI state
const [recentSearches, setRecentSearches] = useState<string[]>([]);
const [languageSearch, setLanguageSearch] = useState("");
const [isSearching, setIsSearching] = useState(false);
const [hasMounted, setHasMounted] = useState(false);
```

### 5.3 Filter Options Constants

```typescript
const AMENITY_OPTIONS = [
  "Wifi",
  "AC",
  "Parking",
  "Washer",
  "Dryer",
  "Kitchen",
  "Gym",
  "Pool",
  "Furnished",
] as const;

const HOUSE_RULE_OPTIONS = [
  "Pets allowed",
  "Smoking allowed",
  "Couples allowed",
  "Guests allowed",
] as const;

const LEASE_DURATION_OPTIONS = [
  "any",
  "Month-to-month",
  "3 months",
  "6 months",
  "12 months",
  "Flexible",
] as const;

const ROOM_TYPE_OPTIONS = [
  "any",
  "Private Room",
  "Shared Room",
  "Entire Place",
] as const;
```

### 5.4 Layout Structure

```tsx
<div
  className="group relative flex flex-col md:flex-row md:items-center
                bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl
                rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)]
                dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)]
                border border-zinc-200/80 dark:border-zinc-700/50
                p-4 gap-4"
>
  {/* Location Input */}
  <LocationSearchInput
    value={location}
    onChange={setLocation}
    onSelect={handleLocationSelect}
  />

  {/* Filters Button with Badge */}
  <button onClick={() => setShowFilters(true)}>
    Filters
    {filterCount > 0 && <span className="badge">{filterCount}</span>}
  </button>

  {/* Search Button */}
  <button onClick={handleSearch}>Search</button>

  {/* Filter Drawer (via createPortal) */}
  {showFilters &&
    createPortal(
      <FocusTrap>
        <FilterDrawer />
      </FocusTrap>,
      document.body,
    )}
</div>
```

### 5.5 Filter Drawer Structure

```tsx
<div className="fixed inset-0 bg-black/50 z-40">
  <div
    className="absolute inset-y-0 right-0 w-full sm:w-[500px]
                  bg-white dark:bg-zinc-900 shadow-lg border-l"
  >
    {/* Header */}
    <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b p-4">
      <h2>Filters</h2>
      <button onClick={() => setShowFilters(false)}>×</button>
    </div>

    {/* Scrollable Content */}
    <div className="overflow-y-auto p-4 space-y-6">
      {/* Move-in Date */}
      <DatePicker
        selected={pending.moveInDate}
        onChange={(date) => updateField("moveInDate", date)}
        minDate={new Date()}
      />

      {/* Lease Duration */}
      <select
        value={pending.leaseDuration}
        onChange={(e) => updateField("leaseDuration", e.target.value)}
      >
        {LEASE_DURATION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Room Type */}
      <select
        value={pending.roomType}
        onChange={(e) => updateField("roomType", e.target.value)}
      >
        {ROOM_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Amenities (Toggle Buttons) */}
      <div className="flex flex-wrap gap-2">
        {AMENITY_OPTIONS.map((amenity) => (
          <button
            key={amenity}
            onClick={() => toggleArrayItem("amenities", amenity)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm border transition-colors",
              pending.amenities.includes(amenity)
                ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-transparent"
                : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
            )}
          >
            {amenity}
          </button>
        ))}
      </div>

      {/* House Rules (Toggle Buttons) */}
      <div className="flex flex-wrap gap-2">
        {HOUSE_RULE_OPTIONS.map((rule) => (
          <button
            key={rule}
            onClick={() => toggleArrayItem("houseRules", rule)}
            className={cn(/* similar to amenities */)}
          >
            {rule}
          </button>
        ))}
      </div>

      {/* Languages (Searchable Chips) */}
      <div>
        <input
          placeholder="Add languages..."
          value={languageSearch}
          onChange={(e) => setLanguageSearch(e.target.value)}
        />
        <div className="flex flex-wrap gap-2 mt-2">
          {pending.languages.map((lang) => (
            <span key={lang} className="chip">
              {lang}
              <button onClick={() => toggleArrayItem("languages", lang)}>
                ×
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>

    {/* Sticky Footer with Dynamic Count */}
    <FilterStickyFooter
      isDirty={isDirty}
      changeCount={changeCount}
      onApply={handleApply}
      onReset={reset}
      isApplying={isPending}
      pendingCount={pendingCount} // Count from useDebouncedFilterCount
      isCountLoading={isCountLoading} // Loading state for count
    />
  </div>
</div>
```

### 5.6 Debounce Constants

```typescript
const SEARCH_DEBOUNCE_MS = 300; // Filter search
const LOCATION_DEBOUNCE_MS = 350; // Location autocomplete
```

---

## 6. Filter System

### 6.1 Available Filters

| Filter         | URL Param       | Type    | Validation              | Default         | SQL Logic                                       |
| -------------- | --------------- | ------- | ----------------------- | --------------- | ----------------------------------------------- |
| Location Query | `q`             | string  | 2-200 chars, sanitized  | `""`            | `ILIKE` on title/desc/city/state                |
| Min Price      | `minPrice`      | number  | 0 - 1,000,000,000       | `""`            | `l.price >= ?`                                  |
| Max Price      | `maxPrice`      | number  | 0 - 1,000,000,000       | `""`            | `l.price <= ?`                                  |
| Move-in Date   | `moveInDate`    | date    | YYYY-MM-DD, future only | `""`            | `l.moveInDate IS NULL OR l.moveInDate <= ?`     |
| Lease Duration | `leaseDuration` | enum    | See aliases             | `""`            | `LOWER(l.leaseDuration) = LOWER(?)`             |
| Room Type      | `roomType`      | enum    | See aliases             | `""`            | `LOWER(l.roomType) = LOWER(?)`                  |
| Amenities      | `amenities`     | array   | Allowlist, max 20       | `[]`            | `NOT EXISTS (subquery)` - AND logic             |
| House Rules    | `houseRules`    | array   | Allowlist, max 20       | `[]`            | `l.houseRules @> ?::text[]` - AND logic         |
| Languages      | `languages`     | array   | ISO 639-1, max 20       | `[]`            | `l.household_languages && ?::text[]` - OR logic |
| Near Matches   | `nearMatches`   | boolean | "1" = true              | `false`         | Relaxed price/date filters (see §6.5)           |
| Sort           | `sort`          | enum    | 5 options               | `"recommended"` | `ORDER BY` clause                               |
| Page           | `page`          | number  | 1 - 100                 | `1`             | `OFFSET` calculation                            |
| Min Lat        | `minLat`        | number  | -90 to 90               | `null`          | PostGIS bounds                                  |
| Max Lat        | `maxLat`        | number  | -90 to 90               | `null`          | PostGIS bounds                                  |
| Min Lng        | `minLng`        | number  | -180 to 180             | `null`          | PostGIS bounds                                  |
| Max Lng        | `maxLng`        | number  | -180 to 180             | `null`          | PostGIS bounds                                  |

### 6.2 Filter Enum Aliases

**Lease Duration:**

```typescript
const LEASE_DURATION_ALIASES = {
  month_to_month: "Month-to-month",
  mtm: "Month-to-month",
  "month-to-month": "Month-to-month",
  "3_months": "3 months",
  "3-months": "3 months",
  "6_months": "6 months",
  "6-months": "6 months",
  "12_months": "12 months",
  "12-months": "12 months",
  "1_year": "12 months",
  flexible: "Flexible",
};
```

**Room Type:**

```typescript
const ROOM_TYPE_ALIASES = {
  private: "Private Room",
  private_room: "Private Room",
  "private-room": "Private Room",
  shared: "Shared Room",
  shared_room: "Shared Room",
  "shared-room": "Shared Room",
  entire: "Entire Place",
  entire_place: "Entire Place",
  "entire-place": "Entire Place",
  whole: "Entire Place",
  studio: "Entire Place",
};
```

**Amenity Aliases:**

```typescript
const AMENITY_ALIASES = {
  wifi: "Wifi",
  "wi-fi": "Wifi",
  ac: "AC",
  "air-conditioning": "AC",
  parking: "Parking",
  washer: "Washer",
  dryer: "Dryer",
  kitchen: "Kitchen",
  gym: "Gym",
  pool: "Pool",
  furnished: "Furnished",
};
```

### 6.3 Filter Validation Pipeline

```
URL Params
    │
    ▼
parseSearchParams() ────────────────────────────────────┐
    │                                                   │
    │ 1. Extract raw params                             │
    │ 2. Case-insensitive alias matching                │
    │ 3. Array deduplication                            │
    │ 4. Price validation (min ≤ max)                   │
    │                                                   │
    ▼                                                   │
normalizeFilters() (Zod schema)                         │
    │                                                   │
    │ 1. Type coercion                                  │
    │ 2. Range validation                               │
    │ 3. Enum validation                                │
    │ 4. Array item validation                          │
    │ 5. Geographic bounds validation                   │
    │                                                   │
    ▼                                                   │
FilterParams (validated) ───────────────────────────────┘
    │
    ▼
getListingsPaginated()
    │
    ▼
SQL Query with all filters applied at database level
```

### 6.4 Filter Count Badge Calculation

```typescript
// Base filters (always calculated)
const baseFilterCount = [
  minPrice,
  maxPrice,
  leaseDuration,
  roomType,
  amenities.length > 0,
  houseRules.length > 0,
  languages.length > 0,
].filter(Boolean).length;

// Date filter (mounted-only to prevent hydration mismatch)
const dateFilterCount =
  mounted && moveInDate && !isPast(new Date(moveInDate)) ? 1 : 0;

// Total
const totalFilterCount = baseFilterCount + dateFilterCount;
```

### 6.5 Near-Matches Feature

**Purpose:** When search results are low (< 5 exact matches), offer users the option to see "near matches" — listings that almost match their filters with relaxed price/date criteria.

**Files:**

- `src/lib/near-matches.ts` (294 lines) — Relaxation logic and constants
- `src/components/LowResultsGuidance.tsx` (159 lines) — UI for low-result guidance

#### Constants

```typescript
// Threshold for showing near-match guidance
export const LOW_RESULTS_THRESHOLD = 5;

// Price relaxation: ±20% tolerance
export const PRICE_TOLERANCE_PERCENT = 0.2;

// Date relaxation: ±14 days flexibility
export const DATE_FLEXIBILITY_DAYS = 14;
```

#### Near-Match Relaxation Logic

When `nearMatches=1` is set in the URL, the API relaxes filters:

```typescript
// Price relaxation (±20%)
const relaxedMinPrice = minPrice ? Math.floor(minPrice * 0.8) : undefined;
const relaxedMaxPrice = maxPrice ? Math.ceil(maxPrice * 1.2) : undefined;

// Date relaxation (±14 days)
const relaxedDateStart = subDays(moveInDate, 14);
const relaxedDateEnd = addDays(moveInDate, 14);
```

#### LowResultsGuidance Component

Displayed when:

1. Result count is 1-4 (below threshold but not zero)
2. `nearMatches` is currently OFF

**Features:**

- **Filter suggestions**: Buttons to remove restrictive filters (price, date, roomType, amenities, leaseDuration)
- **"Include near matches" button**: Toggles `nearMatches=1` in URL
- **Badge with count**: Shows `+N` available near-matches if `nearMatchCount` is provided

```tsx
<LowResultsGuidance
  resultCount={listings.length}
  filterParams={filterParams}
  nearMatchesEnabled={nearMatches}
  nearMatchCount={nearMatchCount} // From API response
/>
```

#### API Response Fields

```typescript
interface SearchResponse {
  listings: Listing[];
  total: number;
  nearMatchCount?: number; // Count of available near-matches (when nearMatches=0)
}

interface Listing {
  // ... existing fields
  isNearMatch?: boolean; // True if listing matched via relaxed criteria
}
```

#### Visual Differentiation

Near-match listings can be styled differently in the UI:

- Subtle border or background tint
- "Near match" badge/label
- Tooltip explaining why it's included

---

## 7. Batched Filter System

### 7.1 Hook: `useBatchedFilters`

**File:** `src/hooks/useBatchedFilters.ts`
**Lines:** 216

### 7.2 Interface

```typescript
interface BatchedFilterValues {
  minPrice: string;
  maxPrice: string;
  amenities: string[];
  houseRules: string[];
  languages: string[];
  roomType: string;
  leaseDuration: string;
  moveInDate: string;
}

interface UseBatchedFiltersReturn {
  pending: BatchedFilterValues; // Local changes (not in URL)
  committed: BatchedFilterValues; // Current URL state
  isDirty: boolean; // pending !== committed
  changeCount: number; // Number of changed fields
  apply: () => BatchedFilterValues; // Returns pending for URL update
  reset: () => void; // Resets pending to committed
  updateField: <K extends keyof BatchedFilterValues>(
    field: K,
    value: BatchedFilterValues[K],
  ) => void;
  toggleArrayItem: (
    field: "amenities" | "houseRules" | "languages",
    item: string,
  ) => void;
}
```

### 7.3 Implementation Details

```typescript
export function useBatchedFilters(): UseBatchedFiltersReturn {
  const searchParams = useSearchParams();

  // Parse committed state from URL
  const committed = useMemo(
    () => ({
      minPrice: searchParams.get("minPrice") || "",
      maxPrice: searchParams.get("maxPrice") || "",
      amenities: parseArrayParam(searchParams, "amenities"),
      houseRules: parseArrayParam(searchParams, "houseRules"),
      languages: parseArrayParam(searchParams, "languages"),
      roomType: searchParams.get("roomType") || "",
      leaseDuration: searchParams.get("leaseDuration") || "",
      moveInDate: searchParams.get("moveInDate") || "",
    }),
    [searchParams.toString()],
  ); // Key: use .toString() for stable deps

  // Local pending state
  const [pending, setPending] = useState(committed);

  // Sync pending with committed when URL changes externally
  useEffect(() => {
    setPending(committed);
  }, [committed]);

  // Change detection
  const isDirty = useMemo(
    () => !areFiltersEqual(pending, committed),
    [pending, committed],
  );

  const changeCount = useMemo(
    () => countDifferences(pending, committed),
    [pending, committed],
  );

  // Actions
  const apply = useCallback(() => {
    return pending; // Caller uses this to build URL
  }, [pending]);

  const reset = useCallback(() => {
    setPending(committed);
  }, [committed]);

  const updateField = useCallback(
    <K extends keyof BatchedFilterValues>(
      field: K,
      value: BatchedFilterValues[K],
    ) => {
      setPending((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const toggleArrayItem = useCallback(
    (field: "amenities" | "houseRules" | "languages", item: string) => {
      setPending((prev) => {
        const arr = prev[field];
        const newArr = arr.includes(item)
          ? arr.filter((i) => i !== item)
          : [...arr, item];
        return { ...prev, [field]: newArr };
      });
    },
    [],
  );

  return {
    pending,
    committed,
    isDirty,
    changeCount,
    apply,
    reset,
    updateField,
    toggleArrayItem,
  };
}
```

### 7.4 Change Count Calculation

```typescript
function countDifferences(
  pending: BatchedFilterValues,
  committed: BatchedFilterValues,
): number {
  let count = 0;

  if (pending.minPrice !== committed.minPrice) count++;
  if (pending.maxPrice !== committed.maxPrice) count++;
  if (!arraysEqual(pending.amenities, committed.amenities)) count++;
  if (!arraysEqual(pending.houseRules, committed.houseRules)) count++;
  if (!arraysEqual(pending.languages, committed.languages)) count++;
  if (pending.roomType !== committed.roomType) count++;
  if (pending.leaseDuration !== committed.leaseDuration) count++;
  if (pending.moveInDate !== committed.moveInDate) count++;

  return count;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}
```

### 7.5 Filter Categories

| Category                    | Behavior           | Examples                                              |
| --------------------------- | ------------------ | ----------------------------------------------------- |
| **Instant** (URL on change) | Update immediately | Sort, page, view mode                                 |
| **Batched** (Apply button)  | Accumulate changes | Price, amenities, rules, languages, room, lease, date |

### 7.6 Apply Button States (Dynamic Count)

| State         | Button Text          | Enabled | Visual          |
| ------------- | -------------------- | ------- | --------------- |
| No changes    | "Apply"              | No      | Grayed out      |
| Loading count | "Show listings" + 🔄 | Yes     | Loading spinner |
| 0 results     | "No listings found"  | Yes     | Warning state   |
| 1 result      | "Show 1 listing"     | Yes     | Normal          |
| N results     | "Show N listings"    | Yes     | Normal          |
| 100+ results  | "Show 100+ listings" | Yes     | Normal          |
| Applying      | "Applying..."        | No      | Loading spinner |

**Note:** The button now shows real-time listing counts via `useDebouncedFilterCount` hook.

---

## 8. URL Parameter System

### 8.1 File: `src/lib/search-params.ts`

**Lines:** 584
**Primary Role:** URL parsing, validation, normalization

### 8.2 Core Functions

```typescript
// Parse raw URL params into FilterParams
export function parseSearchParams(
  rawParams: Record<string, string | string[] | undefined>,
): FilterParams;

// Convert FilterParams back to URLSearchParams
export function filtersToSearchParams(filters: FilterParams): URLSearchParams;

// Build complete search URL
export function buildSearchUrl(filters: FilterParams, baseUrl?: string): string;
```

### 8.3 URL Parameter Encoding Rules

| Filter Type     | Encoding                 | Example                       |
| --------------- | ------------------------ | ----------------------------- |
| String (query)  | URL safe, spaces → `%20` | `q=New%20York`                |
| Numbers (price) | Direct integer           | `minPrice=1000`               |
| Array items     | Repeated param key       | `amenities=Wifi&amenities=AC` |
| Date string     | ISO format               | `moveInDate=2025-02-01`       |
| Spaces in enums | URL encoded              | `roomType=Private%20Room`     |
| Empty values    | Omitted                  | (param not in URL)            |

### 8.4 Parsing Logic

```typescript
function parseSearchParams(rawParams): FilterParams {
  // 1. Query string
  const query = rawParams.q?.toString().trim().slice(0, 200) || undefined;

  // 2. Price range
  const minPrice = parsePrice(rawParams.minPrice);
  const maxPrice = parsePrice(rawParams.maxPrice);

  // 3. Enum with aliases
  const leaseDuration = normalizeEnum(
    rawParams.leaseDuration,
    VALID_LEASE_DURATIONS,
    LEASE_DURATION_ALIASES,
  );

  const roomType = normalizeEnum(
    rawParams.roomType,
    VALID_ROOM_TYPES,
    ROOM_TYPE_ALIASES,
  );

  // 4. Arrays (deduplicated, validated)
  const amenities = parseArrayParam(rawParams.amenities)
    .map((a) => normalizeEnum(a, VALID_AMENITIES, AMENITY_ALIASES))
    .filter(Boolean);

  const houseRules = parseArrayParam(rawParams.houseRules)
    .map((r) => normalizeEnum(r, VALID_HOUSE_RULES, HOUSE_RULE_ALIASES))
    .filter(Boolean);

  const languages = parseArrayParam(rawParams.languages).filter((l) =>
    isValidLanguageCode(l),
  );

  // 5. Geographic bounds
  const bounds = parseBounds(rawParams);

  // 6. Pagination
  const page = parseInt(rawParams.page || "1", 10);
  const sort = normalizeEnum(rawParams.sort, VALID_SORTS);

  return {
    query,
    minPrice,
    maxPrice,
    leaseDuration,
    roomType,
    amenities,
    houseRules,
    languages,
    moveInDate: rawParams.moveInDate,
    bounds,
    page: Math.min(Math.max(1, page), 100),
    sort: sort || "recommended",
  };
}
```

### 8.5 Array Parameter Parsing

```typescript
function parseArrayParam(value: string | string[] | undefined): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    // Multiple params: ?amenities=Wifi&amenities=AC
    return [...new Set(value.flatMap((v) => v.split(",")))];
  }

  // Single param with CSV: ?amenities=Wifi,AC
  return [
    ...new Set(
      value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}
```

### 8.6 Example URLs

```
# Basic search
/search?q=austin

# Filtered search
/search?q=austin&minPrice=500&maxPrice=1500&amenities=Wifi,Kitchen&roomType=private

# Map bounds search
/search?minLat=30.2&maxLat=30.4&minLng=-97.8&maxLng=-97.6

# Full search with all parameters
/search?q=san+francisco
  &minPrice=1000
  &maxPrice=3000
  &moveInDate=2026-02-01
  &leaseDuration=6_months
  &roomType=private_room
  &amenities=Wifi,Kitchen,AC
  &houseRules=Pets+allowed
  &languages=en,es
  &sort=price_asc
  &page=2
  &minLat=37.7
  &maxLat=37.8
  &minLng=-122.5
  &maxLng=-122.3

# With near-matches enabled (relaxed price/date filters)
/search?q=austin&minPrice=800&maxPrice=1200&nearMatches=1
```

---

## 9. Location Search & Geocoding

### 9.1 Component: `LocationSearchInput`

**File:** `src/components/LocationSearchInput.tsx`
**Lines:** 443

### 9.2 Props

```typescript
interface LocationSearchInputProps {
  value: string;
  onChange: (location: string) => void;
  onSelect: (location: string, coords?: { lat: number; lng: number }) => void;
}
```

### 9.3 State

```typescript
const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
const [isLoading, setIsLoading] = useState(false);
const [showSuggestions, setShowSuggestions] = useState(false);
const [selectedIndex, setSelectedIndex] = useState(-1);
const [error, setError] = useState<string | null>(null);
const [noResults, setNoResults] = useState(false);
```

### 9.4 Local-First Search Strategy

```
User types "San"
      │
      ▼
1. LOCAL DATASET SEARCH (instant)
   └── Search ~100 US cities in memory
   └── Returns: San Francisco, San Antonio, San Diego, etc.
      │
      ▼
2. DETERMINE IF MAPBOX NEEDED
   └── Skip Mapbox if: localMatches >= 3 AND !looksLikeStreetAddress
   └── Call Mapbox if: localMatches < 3 OR query contains numbers
      │
      ▼
3. MERGE RESULTS (if Mapbox called)
   └── Local results first
   └── Mapbox results second
   └── Dedupe by place_name
   └── Limit to 5 suggestions
```

### 9.5 Local Dataset

**File:** `src/lib/locations/us-locations.ts`

```typescript
interface LocalLocation {
  id: string; // "nyc"
  name: string; // "New York City"
  searchTerms: string[]; // ["new york", "nyc", "ny"]
  displayName: string; // "New York City, NY"
  type: "city" | "neighborhood" | "region" | "metro" | "state";
  center: [number, number]; // [-74.006, 40.7128]
  bbox?: [number, number, number, number];
  population?: number; // For sorting
  state: string; // "NY"
}

// Coverage: ~100 US locations total
export const US_LOCATIONS: LocalLocation[] = [
  // Major cities and metro areas
  // College towns
  // States + abbreviations
  // Popular neighborhoods
];
```

### 9.6 Suggestion Result Interface

```typescript
interface LocationSuggestion {
  id: string;
  place_name: string; // "San Francisco, CA"
  center: [number, number]; // [lng, lat]
  place_type: string[]; // ["place", "neighborhood", "city"]
  bbox?: [number, number, number, number];
  source: "local" | "mapbox";
}
```

### 9.7 Place Type Colors

| Type         | Color  | CSS Classes                     |
| ------------ | ------ | ------------------------------- |
| neighborhood | Orange | `bg-orange-100 text-orange-700` |
| locality     | Blue   | `bg-blue-100 text-blue-700`     |
| place/city   | Green  | `bg-green-100 text-green-700`   |
| region/state | Purple | `bg-purple-100 text-purple-700` |

### 9.8 Keyboard Navigation

| Key       | Action                        |
| --------- | ----------------------------- |
| ArrowDown | Move to next suggestion       |
| ArrowUp   | Move to previous suggestion   |
| Enter     | Select highlighted suggestion |
| Escape    | Close suggestions dropdown    |

### 9.9 Debounce

```typescript
const LOCATION_DEBOUNCE_MS = 350;
```

### 9.10 Mapbox Geocoding API

**File:** `src/lib/geocoding.ts`

```typescript
export async function geocodeAddress(address: string): Promise<{
  lat: number;
  lng: number;
} | null> {
  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?` +
      `access_token=${MAPBOX_TOKEN}&` +
      `country=us&` +
      `types=address,place,locality,neighborhood`,
  );

  const data = await response.json();

  if (data.features?.[0]) {
    const [lng, lat] = data.features[0].center;
    return { lat, lng };
  }

  return null;
}
```

---

## 10. Map Implementation

### 10.1 Technology Stack

| Component   | Technology                                  |
| ----------- | ------------------------------------------- |
| Main Map    | Mapbox GL JS via `react-map-gl`             |
| Tile Source | Mapbox Streets v11 / Dark v11               |
| Clustering  | Mapbox GL native clustering                 |
| Worker      | CSP-compliant at `/mapbox-gl-csp-worker.js` |
| Bundle Size | ~944KB (lazy loaded)                        |

### 10.2 Component Architecture

```
layout.tsx
└── MapBoundsProvider
    └── SearchLayoutView
        └── PersistentMapWrapper (persists across navigations)
            └── DynamicMap (lazy-loaded, SSR disabled)
                └── Map.tsx (main component, 1392 lines)
```

### 10.3 File: `src/components/Map.tsx`

**Lines:** 1392

### 10.4 Core State Variables

```typescript
// Search behavior toggle (DEFAULT: OFF to reduce API costs)
const [searchAsMove, setSearchAsMove] = useState(false);

// Tracks if current map bounds differ from URL bounds
const [boundsDirty, setBoundsDirty] = useState(false);

// Tracks if USER (not programmatic) has moved the map
const [hasUserMoved, setHasUserMoved] = useState(false);

// Current map bounds for "Search this area" CTA
const currentMapBoundsRef = useRef<{
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
} | null>(null);

// Distinguishes programmatic moves (flyTo/fitBounds) from user moves
const isProgrammaticMoveRef = useRef(false);

// Prevents multiple auto-fits in a session
const hasAutoFitRef = useRef(false);

// Selected listing (for popup)
const [selectedListing, setSelectedListing] = useState<Listing | null>(null);

// Selected group (for stacked popup)
const [selectedGroup, setSelectedGroup] = useState<ListingGroup | null>(null);

// Unclustered listings at current zoom (for individual markers)
const [unclusteredListings, setUnclusteredListings] = useState<Listing[]>([]);
```

### 10.5 Lazy Map Initialization

**Hook:** `useMapPreference`

```typescript
interface MapPreference {
  desktop: 'split' | 'list-only';
  mobile: 'list' | 'map';
}

// Defaults (cost-conscious)
const DEFAULT_PREFERENCES: MapPreference = {
  desktop: 'split',   // Desktop shows split view by default
  mobile: 'list',     // Mobile shows list-only (no map initialization)
};

export function useMapPreference() {
  return {
    shouldShowMap: boolean;      // Whether map is visible
    shouldRenderMap: boolean;    // Whether to mount MapGL
    toggleMap: () => void;
    showMap: () => void;
    hideMap: () => void;
    isMobile: boolean;
    isLoading: boolean;          // During hydration
  };
}
```

### 10.6 Map Props

```typescript
<MapGL
  ref={mapRef}
  mapboxAccessToken={MAPBOX_TOKEN}
  initialViewState={{
    longitude: center?.lng || -98.5795,
    latitude: center?.lat || 39.8283,
    zoom: 4,
  }}
  style={{ width: '100%', height: '100%' }}
  mapStyle={isDark ? DARK_STYLE : LIGHT_STYLE}
  onMoveEnd={handleMoveEnd}
  onLoad={handleMapLoad}
  onClick={handleMapClick}
  interactiveLayerIds={['clusters', 'cluster-count']}
>
  {/* Cluster Source */}
  <Source
    id="listings"
    type="geojson"
    data={geojsonData}
    cluster={true}
    clusterMaxZoom={14}
    clusterRadius={50}
  >
    <Layer {...clusterLayer} />
    <Layer {...clusterCountLayer} />
    <Layer {...unclusteredPointLayer} />
  </Source>

  {/* Individual Markers (< 50 listings) */}
  {locationGroups.map(group => (
    <Marker key={group.key} longitude={group.lng} latitude={group.lat}>
      <MarkerContent group={group} />
    </Marker>
  ))}

  {/* Popups */}
  {selectedListing && (
    <Popup longitude={lng} latitude={lat}>
      <ListingPopupContent listing={selectedListing} />
    </Popup>
  )}

  {selectedGroup && (
    <StackedListingPopup group={selectedGroup} onClose={() => setSelectedGroup(null)} />
  )}
</MapGL>
```

### 10.7 Map Style URLs

```typescript
const LIGHT_STYLE = "mapbox://styles/mapbox/streets-v11";
const DARK_STYLE = "mapbox://styles/mapbox/dark-v11";
```

### 10.8 Dark Mode Detection

```typescript
useEffect(() => {
  // Watch for dark mode changes
  const observer = new MutationObserver(() => {
    const isDark = document.documentElement.classList.contains("dark");
    if (mapRef.current) {
      mapRef.current.setStyle(isDark ? DARK_STYLE : LIGHT_STYLE);
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  return () => observer.disconnect();
}, []);
```

---

## 11. Map Markers & Clustering

### 11.1 Clustering Strategy

```typescript
const CLUSTER_THRESHOLD = 50;

// Decision logic
if (listings.length >= CLUSTER_THRESHOLD) {
  // Use Mapbox GL clustering (GeoJSON source)
  // Cluster circles with count labels
} else {
  // Group listings by coordinate
  // Render stack markers at TRUE coordinates
}
```

### 11.2 Cluster Layers

```typescript
// Cluster circle layer
const clusterLayer: LayerProps = {
  id: "clusters",
  type: "circle",
  source: "listings",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": "#3B82F6", // Blue
    "circle-radius": [
      "step",
      ["get", "point_count"],
      30, // Default radius
      50,
      40, // 50+ points: 40px
      100,
      50, // 100+ points: 50px
    ],
    "circle-stroke-width": 2,
    "circle-stroke-color": "#fff",
  },
};

// Cluster count label layer
const clusterCountLayer: LayerProps = {
  id: "cluster-count",
  type: "symbol",
  source: "listings",
  filter: ["has", "point_count"],
  layout: {
    "text-field": "{point_count_abbreviated}",
    "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
    "text-size": 14,
  },
  paint: {
    "text-color": "#ffffff",
  },
};
```

### 11.3 Stack Marker Architecture

**File:** `src/lib/maps/marker-utils.ts`

```typescript
// Coordinate precision for grouping (~1.1m at equator)
export const COORD_PRECISION = 5;

export interface ListingGroup {
  key: string; // "40.71281,-74.00598"
  lat: number; // TRUE coordinate
  lng: number; // TRUE coordinate (not offset)
  listings: MapMarkerListing[]; // All listings at this point
}

export function groupListingsByCoord(
  listings: MapMarkerListing[],
  precision = COORD_PRECISION,
): ListingGroup[] {
  const groups = new Map<string, MapMarkerListing[]>();

  listings.forEach((listing) => {
    const key = `${listing.location.lat.toFixed(precision)},${listing.location.lng.toFixed(precision)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(listing);
  });

  return Array.from(groups.entries()).map(([key, groupListings]) => ({
    key,
    lat: groupListings[0].location.lat,
    lng: groupListings[0].location.lng,
    listings: groupListings,
  }));
}

export function formatStackPriceRange(listings: MapMarkerListing[]): string {
  const prices = listings.map((l) => l.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  return min === max
    ? fmt.format(min)
    : `${fmt.format(min)}–${fmt.format(max)}`; // en-dash
}
```

### 11.4 Stack Marker Rendering

```tsx
const locationGroups = useMemo(
  () => groupListingsByCoord(markersSource),
  [markersSource],
);

{
  locationGroups.map((group) => (
    <Marker
      key={group.key}
      longitude={group.lng}
      latitude={group.lat}
      onClick={() => handleMarkerClick(group)}
    >
      <div
        className={cn(
          "px-3 py-1.5 rounded-full font-semibold text-sm shadow-lg cursor-pointer",
          "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white",
          "border border-zinc-200 dark:border-zinc-700",
          "hover:scale-105 transition-transform",
        )}
      >
        {formatStackPriceRange(group.listings)}
        {group.listings.length > 1 && (
          <span className="ml-1 px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-700 rounded text-xs">
            {group.listings.length}
          </span>
        )}
      </div>
    </Marker>
  ));
}
```

### 11.5 StackedListingPopup Component

**File:** `src/components/map/StackedListingPopup.tsx`
**Lines:** 175

```tsx
<Popup
  longitude={group.lng}
  latitude={group.lat}
  onClose={() => onClose()}
  maxWidth="320px"
>
  <div
    className={cn(
      "rounded-xl overflow-hidden shadow-xl",
      "bg-white dark:bg-zinc-900",
      "border border-zinc-100 dark:border-zinc-800",
    )}
  >
    {/* Header */}
    <div
      className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800
                    flex items-center justify-between"
    >
      <span className="text-sm font-semibold text-zinc-900 dark:text-white">
        {group.listings.length} listings at this location
      </span>
      <button
        onClick={onClose}
        aria-label="Close"
        className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
      >
        <X className="w-4 h-4" />
      </button>
    </div>

    {/* Scrollable list */}
    <div className="max-h-64 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
      {group.listings.map((listing) => (
        <Link
          key={listing.id}
          href={`/listings/${listing.id}`}
          className="flex gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          {/* Thumbnail */}
          <div className="w-16 h-12 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex-shrink-0">
            {listing.images?.[0] && (
              <Image
                src={listing.images[0]}
                alt=""
                fill
                className="object-cover"
              />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
              {listing.title}
            </p>
            <p className="text-sm font-bold text-zinc-900 dark:text-white">
              ${listing.price.toLocaleString()}/mo
            </p>
            {listing.availableSlots > 0 && (
              <span className="text-xs text-green-600 dark:text-green-400">
                {listing.availableSlots} available
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  </div>
</Popup>
```

### 11.6 Tiered Marker Groups (Primary/Mini)

**Purpose:** Reduce visual clutter on dense maps by showing full price pills only for top-ranked listings, with smaller dots for lower-ranked ones.

**File:** `src/lib/maps/marker-utils.ts`

#### Configuration

```typescript
// Default limit for primary (full price pill) markers
const DEFAULT_PRIMARY_LIMIT = 15;
const MIN_PRIMARY_LIMIT = 5;
const MAX_PRIMARY_LIMIT = 50;

// Configurable via environment variable
export function getPrimaryPinLimit(): number {
  const envVal = process.env.NEXT_PUBLIC_PRIMARY_PINS;
  return envVal ? parseInt(envVal, 10) : DEFAULT_PRIMARY_LIMIT;
}
```

#### TieredGroup Interface

```typescript
export interface TieredGroup extends ListingGroup {
  /** Best rank among listings (lower = better, 0 = highest priority) */
  groupRank: number;
  /** Pin type to render: primary (price pill) or mini (small dot) */
  tier: "primary" | "mini";
}
```

#### Tiering Logic

```typescript
export function computeTieredGroups(
  groups: ListingGroup[],
  rankMap: Map<string, number>, // listing.id → search result rank
  primaryLimit: number = DEFAULT_PRIMARY_LIMIT,
): TieredGroup[] {
  // 1. Assign each group the best rank among its listings
  // 2. Sort groups by groupRank (ascending)
  // 3. Top N groups → tier="primary" (full price pills)
  // 4. Remaining groups → tier="mini" (small dots)
}
```

#### Rendering Order

```tsx
// Mini pins rendered first (lower z-index) - small colored dots
{miniGroups.map((group) => (
  <Marker key={`mini-${group.key}`} ...>
    <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow" />
  </Marker>
))}

// Primary pins rendered second (higher z-index) - full price pills
{primaryGroups.map((group) => (
  <Marker key={`primary-${group.key}`} ...>
    <div className="px-3 py-1.5 rounded-full bg-white shadow-lg text-sm font-semibold">
      {formatStackPriceRange(group.listings)}
    </div>
  </Marker>
))}
```

#### Visual Result

| Tier    | Appearance           | z-Index | Interaction               |
| ------- | -------------------- | ------- | ------------------------- |
| Primary | Price pill with $XXX | Higher  | Click → popup, hover sync |
| Mini    | Small colored dot    | Lower   | Click → popup, hover sync |

### 11.7 List↔Map Sync Marker Highlighting

**Integration:** Map.tsx reads from `ListingFocusContext` to highlight markers when corresponding cards are hovered.

```tsx
// Map.tsx - Reading hover state from context
import { useListingFocus } from "@/contexts/ListingFocusContext";

function Map() {
  const { hoveredId, selectedId, setHovered, setSelected } = useListingFocus();

  // Determine if a group contains the hovered listing
  const isGroupHighlighted = (group: ListingGroup) =>
    group.listings.some((l) => l.id === hoveredId || l.id === selectedId);

  return (
    <>
      {locationGroups.map((group) => (
        <Marker
          key={group.key}
          longitude={group.lng}
          latitude={group.lat}
          onClick={() => handleMarkerClick(group)}
        >
          <div
            onMouseEnter={() => {
              // For single-listing markers, highlight the corresponding card
              if (group.listings.length === 1) {
                setHovered(group.listings[0].id);
              }
            }}
            onMouseLeave={() => setHovered(null)}
            className={cn(
              "px-3 py-1.5 rounded-full font-semibold text-sm shadow-lg cursor-pointer",
              "transition-all duration-150",
              isGroupHighlighted(group)
                ? "bg-blue-600 text-white scale-110 ring-2 ring-blue-400"
                : "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white",
            )}
          >
            {formatStackPriceRange(group.listings)}
          </div>
        </Marker>
      ))}
    </>
  );
}
```

**Sync Behavior Matrix:**

| Action                 | List Effect                      | Map Effect                          |
| ---------------------- | -------------------------------- | ----------------------------------- |
| Hover card             | Card unchanged                   | Marker gets `bg-blue-600 scale-110` |
| Hover marker (single)  | Card gets `ring-2 ring-blue-500` | Marker highlighted                  |
| Hover marker (stacked) | No card effect                   | Marker highlighted                  |
| Click marker (single)  | Card scrolls into view           | Opens popup                         |
| Click marker (stacked) | No scroll                        | Opens stacked popup                 |

**Scroll-to-Card Implementation:**

```tsx
// When marker is clicked, scroll corresponding card into view
const handleMarkerClick = (group: ListingGroup) => {
  if (group.listings.length === 1) {
    const listingId = group.listings[0].id;
    setSelected(listingId);

    // Scroll card into view
    const cardElement = document.querySelector(
      `[data-listing-id="${listingId}"]`,
    );
    cardElement?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  } else {
    // Multiple listings - open stacked popup
    setSelectedGroup(group);
  }
};
```

---

## 12. Map Bounds Management

### 12.1 Context: `MapBoundsContext`

**File:** `src/contexts/MapBoundsContext.tsx`
**Lines:** 157

### 12.2 Interface

```typescript
interface MapBoundsState {
  hasUserMoved: boolean; // User panned/zoomed?
  boundsDirty: boolean; // Bounds differ from URL?
  searchAsMove: boolean; // Auto-search toggle ON?
  searchCurrentArea: () => void; // Execute search
  resetToUrlBounds: () => void; // Revert to original bounds
}

interface MapBoundsContextValue extends MapBoundsState {
  setHasUserMoved: (value: boolean) => void;
  setBoundsDirty: (value: boolean) => void;
  setSearchAsMove: (value: boolean) => void;
  setSearchHandler: (handler: () => void) => void;
  setResetHandler: (handler: () => void) => void;
}
```

### 12.3 Banner Display Logic

```typescript
// Banner shows when:
// 1. User has manually moved the map (not programmatic flyTo)
// 2. Current bounds differ from URL bounds
// 3. Auto-search is OFF

const showBanner = hasUserMoved && boundsDirty && !searchAsMove;
```

### 12.4 Viewport Change Handler

```typescript
const handleMoveEnd = useCallback(
  (e: ViewStateChangeEvent) => {
    // 1. Update unclustered listings
    updateUnclusteredListings();

    const mapBounds = e.target.getBounds();
    if (!mapBounds) return;

    const currentBounds = {
      minLng: mapBounds.getWest(),
      maxLng: mapBounds.getEast(),
      minLat: mapBounds.getSouth(),
      maxLat: mapBounds.getNorth(),
    };
    currentMapBoundsRef.current = currentBounds;

    // 2. Skip if programmatic move
    if (isProgrammaticMoveRef.current) {
      isProgrammaticMoveRef.current = false;
      return;
    }

    // 3. Mark user movement
    if (!hasUserMoved) {
      setHasUserMoved(true);
    }

    // 4. Compare with URL bounds
    const hasUrlBounds = searchParams.has("minLat");
    if (hasUrlBounds) {
      const urlBounds = {
        minLng: parseFloat(searchParams.get("minLng") || "0"),
        maxLng: parseFloat(searchParams.get("maxLng") || "0"),
        minLat: parseFloat(searchParams.get("minLat") || "0"),
        maxLat: parseFloat(searchParams.get("maxLat") || "0"),
      };
      setBoundsDirty(!boundsApproximatelyEqual(currentBounds, urlBounds));
    } else {
      setBoundsDirty(true);
    }

    // 5. If "Search as I move" is ON, update URL
    if (searchAsMove) {
      debouncedExecuteSearch(currentBounds);
    }
  },
  [searchAsMove, hasUserMoved, searchParams],
);
```

### 12.5 Bounds Comparison

```typescript
const boundsApproximatelyEqual = (
  a: { minLng: number; maxLng: number; minLat: number; maxLat: number },
  b: { minLng: number; maxLng: number; minLat: number; maxLat: number },
  epsilon = 0.001, // ~100m at equator
) => {
  return (
    Math.abs(a.minLng - b.minLng) < epsilon &&
    Math.abs(a.maxLng - b.maxLng) < epsilon &&
    Math.abs(a.minLat - b.minLat) < epsilon &&
    Math.abs(a.maxLat - b.maxLat) < epsilon
  );
};
```

### 12.6 MapMovedBanner Component

**File:** `src/components/map/MapMovedBanner.tsx`
**Lines:** 73

**Variants:**

| Variant | Location                | Style                             |
| ------- | ----------------------- | --------------------------------- |
| `map`   | Floating overlay on map | Centered pill buttons, dark theme |
| `list`  | Inline above results    | Amber warning banner, full-width  |

```tsx
// Map variant
<div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
  <button
    onClick={onSearch}
    className="px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900
               rounded-full text-sm font-medium shadow-lg"
  >
    Search this area
  </button>
  <button
    onClick={onReset}
    className="px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400
               rounded-full text-xs shadow border"
  >
    Reset
  </button>
</div>

// List variant
<div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30
                border-b border-amber-200 dark:border-amber-800 px-4 py-3">
  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
    <MapPin className="w-4 h-4" />
    <span className="text-sm">Map moved — results not updated</span>
  </div>
  <div className="flex items-center gap-2">
    <button onClick={onSearch} className="text-sm font-medium text-amber-800">
      Search this area
    </button>
    <button onClick={onReset} aria-label="Reset map view">
      <RotateCcw className="w-4 h-4" />
    </button>
  </div>
</div>
```

### 12.7 Search Execution

```typescript
const executeMapSearch = (bounds: Bounds) => {
  const params = new URLSearchParams(searchParams);

  // Remove single-point coordinates
  params.delete("lat");
  params.delete("lng");

  // Add bounds
  params.set("minLng", bounds.minLng.toString());
  params.set("maxLng", bounds.maxLng.toString());
  params.set("minLat", bounds.minLat.toString());
  params.set("maxLat", bounds.maxLat.toString());

  // Reset pagination
  params.delete("page");

  // Use replace() to avoid history bloat
  router.replace(`/search?${params.toString()}`);
};
```

### 12.8 Antimeridian Crossing Support

```typescript
// Detection
function crossesAntimeridian(minLng: number, maxLng: number): boolean {
  return minLng > maxLng;
}

// SQL Query Split (two envelopes)
if (crossesAntimeridian) {
  // Envelope 1: minLng to 180
  // Envelope 2: -180 to maxLng
  // Results: UNION of both
}
```

---

## 13. Nearby Places & POI Search

### 13.1 Overview

The platform supports two map modes for POI search:

| Feature       | Free Users      | Pro Users                 |
| ------------- | --------------- | ------------------------- |
| Map Library   | MapLibre GL JS  | Mapbox GL JS              |
| Tile Provider | Stadia Maps     | Mapbox                    |
| POI Search    | Radar API       | Radar API + Google Places |
| UI            | NearbyPlacesMap | NeighborhoodMap           |

### 13.2 API Route: `/api/nearby`

**File:** `src/app/api/nearby/route.ts`
**Lines:** 928
**Method:** POST

**Request Schema:**

```typescript
const requestSchema = z.object({
  listingLat: z.number().min(-90).max(90),
  listingLng: z.number().min(-180).max(180),
  query: z.string().max(100).optional(),
  categories: z.array(z.string()).optional(),
  radiusMeters: z.union([
    z.literal(1609), // 1 mile
    z.literal(3218), // 2 miles
    z.literal(8046), // 5 miles
  ]),
  limit: z.number().int().min(1).max(50).optional().default(20),
});
```

**Response:**

```typescript
{
  places: Array<{
    id: string;
    name: string;
    address: string;
    category: string;
    chain?: string;
    location: { lat: number; lng: number };
    distanceMiles: number;
  }>;
  meta: {
    cached: false; // Never cached per compliance
    count: number;
  }
}
```

### 13.3 Radar API Category Filtering

**Strict Filtering Strategy:**

```typescript
// Pharmacy category
PHARMACY_BLOCKLIST = ["dispensary", "cannabis", "marijuana", "weed"];
PHARMACY_ALLOWLIST = ["CVS", "Walgreens", "Rite Aid", "Walmart Pharmacy"];
PHARMACY_REQUIRED_TERMS = ["pharmacy", "drugstore", "rx", "prescription"];

// Grocery category
GROCERY_BLOCKLIST = ["liquor", "wine", "spirits", "cannabis", "tobacco"];
GROCERY_ALLOWLIST = [
  "Walmart",
  "Kroger",
  "Safeway",
  "Whole Foods",
  "Trader Joe's",
];
GROCERY_REQUIRED_TERMS = ["grocery", "supermarket", "market", "produce"];

// Gym/Fitness category
GYM_BLOCKLIST = ["nightclub", "bar", "lounge", "casino"];
GYM_ALLOWLIST = ["Planet Fitness", "LA Fitness", "Gold's Gym", "Equinox"];
GYM_REQUIRED_TERMS = ["gym", "fitness", "workout", "yoga", "pilates"];
```

**Filtering Algorithm:**

```
For each place:
  1. Check if chain matches known allowlist → INCLUDE
  2. Check if name matches allowed chain → INCLUDE
  3. If strong blocklist terms found → EXCLUDE
  4. If blocked term found and NO allowed term → EXCLUDE
  5. If STRICT mode and NO allowed term → EXCLUDE
  6. Otherwise → INCLUDE
```

### 13.4 Distance Utilities

**File:** `src/lib/geo/distance.ts`

```typescript
// Haversine formula constants
const EARTH_RADIUS_MILES = 3958.8;
const EARTH_RADIUS_METERS = 6371000;
const WALKING_SPEED_MPH = 3;

// Distance in miles
export function haversineMiles(lat1, lng1, lat2, lng2): number;

// Distance in meters
export function haversineMeters(lat1, lng1, lat2, lng2): number;

// Walking time estimation (20 min/mile at 3 mph)
export function estimateWalkMins(miles: number): number;

// Format walking time
export function formatWalkTime(minutes: number): string;
// Returns: "~6 min walk"

// Format distance
export function formatDistance(miles: number): string;
// <0.1 mi → "850 ft"
// ≥0.1 mi → "0.3 mi"

// Walkability rings (5/10/15 min)
export function getWalkabilityRings(): { minutes: number; meters: number }[];
// Returns: [{ minutes: 5, meters: 402 }, { minutes: 10, meters: 805 }, { minutes: 15, meters: 1207 }]
```

---

## 14. Listing Card Component

### 14.1 File: `src/components/listings/ListingCard.tsx`

**Type:** Client Component
**Lines:** 303

### 14.2 Props

```typescript
interface Listing {
  id: string;
  title: string;
  price: number;
  description: string;
  location: {
    city: string;
    state: string;
  };
  amenities: string[];
  householdLanguages?: string[];
  availableSlots: number;
  images?: string[];
  avgRating?: number;
  reviewCount?: number;
}

interface ListingCardProps {
  listing: Listing;
  isSaved?: boolean;
  className?: string;
}
```

### 14.3 Visual Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Image Container (aspect-[4/3])                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                          ││
│  │                     Primary Image                        ││
│  │                   (or placeholder)                       ││
│  │                                                          ││
│  │  ┌──────────────┐                    ┌─────────────────┐││
│  │  │ Availability │                    │ FavoriteButton  │││
│  │  │    Badge     │                    │      ❤️         │││
│  │  └──────────────┘                    └─────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  Content Area (p-4)                                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  ┌─Title──────────────────────────┐  ┌─Rating─────────┐││
│  │  │ Listing Title (truncated)      │  │ ⭐ 4.8         │││
│  │  └────────────────────────────────┘  │ or "New"       │││
│  │                                       └────────────────┘││
│  │  📍 Irving, TX                                          ││
│  │                                                          ││
│  │  ┌─Amenities─────────────────────────────────┐          ││
│  │  │ ┌────┐ ┌────────┐ ┌──────┐               │          ││
│  │  │ │WiFi│ │Parking │ │AC    │               │          ││
│  │  │ └────┘ └────────┘ └──────┘               │          ││
│  │  └────────────────────────────────────────────┘          ││
│  │                                                          ││
│  │  ┌─Languages─────────────────────────────────┐          ││
│  │  │ 🌐 English Spanish +1                      │          ││
│  │  └────────────────────────────────────────────┘          ││
│  │                                                          ││
│  │  ┌─Price─────────────────────────────────────┐          ││
│  │  │ $1,250 /mo                                 │          ││
│  │  └────────────────────────────────────────────┘          ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 14.4 CSS Classes

```typescript
// Card container
const cardClasses = cn(
  "bg-white dark:bg-zinc-900 rounded-xl overflow-hidden",
  "border border-zinc-200/60 dark:border-zinc-800",
  "hover:-translate-y-0.5 hover:shadow-lg hover:border-zinc-300 dark:hover:border-zinc-700",
  "transition-all duration-normal",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-400",
);

// Image container
const imageClasses =
  "aspect-[4/3] overflow-hidden bg-zinc-100 dark:bg-zinc-800 relative";

// Title
const titleClasses =
  "font-semibold text-sm text-zinc-900 dark:text-white line-clamp-1 leading-snug";

// Location
const locationClasses = "text-xs text-zinc-500 dark:text-zinc-400";

// Price amount
const priceClasses = "font-bold text-xl text-zinc-900 dark:text-white";

// Price suffix
const priceSuffixClasses = "text-zinc-400 dark:text-zinc-500 text-sm ml-0.5";

// Amenity pill
const amenityClasses = cn(
  "px-2 py-0.5 rounded text-2xs font-medium",
  "bg-zinc-100 dark:bg-zinc-800",
  "text-zinc-600 dark:text-zinc-300",
  "border border-zinc-200 dark:border-zinc-700",
);

// Language badge
const languageClasses = cn(
  "text-2xs px-2 py-0.5 rounded font-medium",
  "bg-blue-50 dark:bg-blue-900/30",
  "text-blue-700 dark:text-blue-300",
);
```

### 14.5 Price Formatting

```typescript
function formatPrice(price: number): string {
  if (price === 0) return "Free";
  if (price < 0) return "$0";
  if (!Number.isFinite(price)) return "$0";

  return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// Examples:
// formatPrice(1250)    → "$1,250"
// formatPrice(1500000) → "$1,500,000"
// formatPrice(0)       → "Free"
// formatPrice(-100)    → "$0"
// formatPrice(NaN)     → "$0"
```

### 14.6 Location Formatting

```typescript
function formatLocation(city: string, state: string): string {
  const abbreviation = STATE_ABBREVIATIONS[state] || state;

  // Prevent redundancy: "Irving, TX, TX" → "Irving, TX"
  if (city.endsWith(abbreviation)) {
    return city;
  }

  return `${city}, ${abbreviation}`;
}

const STATE_ABBREVIATIONS: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  // ... all 50 states
};
```

### 14.7 Availability Badge

```typescript
const isAvailable = listing.availableSlots > 0;

// Available state
<span className="px-2.5 py-1 rounded-md text-2xs font-bold uppercase tracking-wide shadow-sm
                bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white">
  Available
</span>

// Filled state
<span className="px-2.5 py-1 rounded-md text-2xs font-bold uppercase tracking-wide shadow-sm
                bg-zinc-900 dark:bg-white text-white dark:text-zinc-900">
  Filled
</span>
```

### 14.8 Rating Display

```typescript
{listing.reviewCount && listing.reviewCount > 0 && listing.avgRating ? (
  <div className="flex items-center gap-1">
    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
    <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
      {listing.avgRating.toFixed(1)}
    </span>
  </div>
) : (
  <span className="text-2xs uppercase font-bold text-zinc-400 dark:text-zinc-500 tracking-wide">
    New
  </span>
)}
```

### 14.9 Placeholder Images

```typescript
const PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400",
  "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=400",
  "https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=400",
  "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=400",
];

// Deterministic selection based on listing ID
const placeholderIndex =
  listing.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) %
  PLACEHOLDER_IMAGES.length;
```

### 14.10 Hover Effects

| Effect      | Before               | After              |
| ----------- | -------------------- | ------------------ |
| Translation | `translateY(0)`      | `translateY(-2px)` |
| Shadow      | `none`               | `shadow-lg`        |
| Border      | `border-zinc-200/60` | `border-zinc-300`  |
| Image scale | `scale(1)`           | `scale(1.05)`      |

### 14.11 Photo Carousel Component

**File:** `src/components/listings/ListingCardCarousel.tsx`
**Purpose:** Multi-image carousel with CSS scroll-snap navigation

#### Props Interface

```typescript
interface ListingCardCarouselProps {
  images: string[];
  alt: string;
}
```

#### Visual Structure

```
┌───────────────────────────────────────────────────────┐
│                                                        │
│  ←  │        Image 1 of N (snap-scroll)        │  →   │
│                                                        │
│                     ● ○ ○ ○ ○                          │
│                  (dot indicators)                      │
└───────────────────────────────────────────────────────┘
```

#### Key Features

| Feature       | Implementation                             |
| ------------- | ------------------------------------------ |
| Navigation    | CSS `scroll-snap-type: x mandatory`        |
| Controls      | Prev/Next buttons with `stopPropagation()` |
| Lazy Loading  | First 2 images eager, rest lazy            |
| Touch Support | Native scroll-snap swipe behavior          |
| Keyboard      | ArrowLeft/ArrowRight navigation            |
| Max Images    | Limited to first 5 images                  |

#### Lazy Loading Strategy

```typescript
// Load strategy prevents network overhead
<Image
  src={image}
  loading={index < 2 ? "eager" : "lazy"}  // First 2 eager, rest lazy
  priority={index === 0}                   // First image prioritized
/>
```

#### Control Visibility

| Context  | Behavior                                             |
| -------- | ---------------------------------------------------- |
| Desktop  | Controls appear on hover (`group-hover:opacity-100`) |
| Mobile   | Controls always visible for touch users              |
| Keyboard | Controls visible on focus                            |

#### CSS Classes

```typescript
// Carousel container
const containerClasses = cn(
  "relative aspect-[4/3] overflow-hidden",
  "bg-zinc-100 dark:bg-zinc-800",
  "group",
);

// Scroll container
const scrollClasses = cn(
  "flex snap-x snap-mandatory overflow-x-auto",
  "scrollbar-hide h-full",
);

// Individual slide
const slideClasses = "snap-center shrink-0 w-full h-full relative";

// Navigation button
const navButtonClasses = cn(
  "absolute top-1/2 -translate-y-1/2 z-10",
  "p-1.5 rounded-full",
  "bg-white/90 dark:bg-zinc-800/90",
  "shadow-lg backdrop-blur-sm",
  "opacity-0 group-hover:opacity-100",
  "transition-opacity duration-200",
  "hover:bg-white dark:hover:bg-zinc-700",
);

// Dot indicator
const dotClasses = (active: boolean) =>
  cn(
    "w-1.5 h-1.5 rounded-full transition-all",
    active ? "bg-white scale-110" : "bg-white/60 hover:bg-white/80",
  );
```

#### Accessibility

| Feature       | Implementation                                           |
| ------------- | -------------------------------------------------------- |
| Button Labels | `aria-label="Previous image"`, `aria-label="Next image"` |
| Screen Reader | `aria-live="polite"` announces image position changes    |
| Keyboard Nav  | ArrowLeft/ArrowRight when focused                        |
| Focus Ring    | `focus-visible:ring-2 focus-visible:ring-blue-500`       |

### 14.12 List-Map Sync Integration

**Context:** `ListingFocusContext` (see Section 21.4)

#### Card Hover Handlers

```typescript
// Memoized handlers prevent re-render cascade
const handleMouseEnter = useCallback(() => {
  setHovered(listing.id);
}, [setHovered, listing.id]);

const handleMouseLeave = useCallback(() => {
  setHovered(null);
}, [setHovered]);
```

#### Focus State Styling

```typescript
const { isSelected, isFocused } = useIsListingFocused(listing.id);

// Card gets ring highlight when map marker is hovered/selected
const cardClasses = cn(
  "bg-white dark:bg-zinc-900 rounded-xl overflow-hidden",
  "border border-zinc-200/60 dark:border-zinc-800",
  "transition-all duration-normal group",
  isFocused && "ring-2 ring-blue-500 ring-offset-2",
);
```

#### Data Attributes

```tsx
// Used for scroll-into-view targeting
<article
  data-listing-id={listing.id}
  data-testid="listing-card"
>
```

### 14.13 FavoriteButton Toast Notifications

**File:** `src/components/FavoriteButton.tsx`

The FavoriteButton implements optimistic UI with toast feedback for error states.

#### Optimistic Update Flow

```typescript
const [isSaved, setIsSaved] = useState(initialSaved);
const [isLoading, setIsLoading] = useState(false);

const handleClick = async (e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();

  if (isLoading) return;

  const previousState = isSaved;
  setIsSaved(!isSaved); // Optimistic toggle
  setIsLoading(true);

  try {
    const response = await fetch(`/api/listings/${listingId}/save`, {
      method: isSaved ? "DELETE" : "POST",
    });

    if (response.status === 401) {
      setIsSaved(previousState); // Revert
      toast.info("Sign in to save listings");
      router.push("/login");
      return;
    }

    if (!response.ok) throw new Error("Failed to save");

    router.refresh(); // Sync server state
  } catch (error) {
    setIsSaved(previousState); // Revert on error
    toast.error("Couldn't save listing. Please try again.");
  } finally {
    setIsLoading(false);
  }
};
```

#### Toast Messages

| Scenario             | Toast Type | Message                                    |
| -------------------- | ---------- | ------------------------------------------ |
| 401 Unauthorized     | `info`     | "Sign in to save listings"                 |
| Network/Server error | `error`    | "Couldn't save listing. Please try again." |
| Success              | None       | Silent (optimistic UI already shows state) |

#### Visual States

| State     | Icon            | Style                           |
| --------- | --------------- | ------------------------------- |
| Not saved | `Heart` outline | `text-white` with shadow        |
| Saved     | `Heart` filled  | `fill-rose-500 text-rose-500`   |
| Loading   | `Heart`         | `opacity-50 cursor-not-allowed` |

---

## 15. Search Results Grid

### 15.1 Grid Layout

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-x-6 sm:gap-y-8">
  {listings.map((listing) => (
    <ListingCard
      key={listing.id}
      listing={listing}
      isSaved={savedListingIds.includes(listing.id)}
    />
  ))}
</div>
```

### 15.2 Responsive Behavior

| Breakpoint       | Columns | Gap             |
| ---------------- | ------- | --------------- |
| < 640px (mobile) | 1       | 16px (gap-4)    |
| ≥ 640px (sm)     | 2       | 24px x / 32px y |

### 15.3 Results Header

```tsx
<div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
  <div>
    <h1
      id="search-results-heading"
      tabIndex={-1}
      className="text-lg sm:text-xl font-semibold text-zinc-900 dark:text-white
                 tracking-tight outline-none"
    >
      {total !== null ? total : "100+"} {total === 1 ? "place" : "places"}
      {q ? ` in "${q}"` : " available"}
    </h1>

    {q ? (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1">
        <MapPin className="w-3.5 h-3.5" />
        <span>
          Results pinned to <span className="font-medium">{q}</span>
        </span>
      </p>
    ) : (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
        Book a place that fits your lifestyle.
      </p>
    )}
  </div>

  <div className="flex items-center gap-2 sm:gap-3">
    <SaveSearchButton />
    <SortSelect currentSort={sort} />
  </div>
</div>
```

---

## 16. Pagination System

### 16.1 File: `src/components/Pagination.tsx`

**Lines:** 239

### 16.2 Props

```typescript
interface PaginationProps {
  currentPage: number;
  totalPages: number | null; // null = unknown (100+ results)
  totalItems: number | null; // null = unknown (100+ results)
  itemsPerPage: number;
  hasNextPage: boolean; // Always known via limit+1 pattern
  hasPrevPage: boolean;
}
```

### 16.3 Hybrid Pagination Strategy

| Condition     | Display Mode  | Features                                  |
| ------------- | ------------- | ----------------------------------------- |
| ≤ 100 results | Exact Total   | Page numbers, "Showing X-Y of Z"          |
| > 100 results | Unknown Total | "Page N · 100+ results", simple prev/next |

### 16.4 Results Info Display

**Exact Total:**

```tsx
<p className="text-sm text-zinc-500 dark:text-zinc-400">
  Showing{" "}
  <span className="font-medium text-zinc-900 dark:text-white">{startItem}</span>{" "}
  to
  <span className="font-medium text-zinc-900 dark:text-white">
    {endItem}
  </span>{" "}
  of
  <span className="font-medium text-zinc-900 dark:text-white">
    {totalItems}
  </span>{" "}
  results
</p>
```

**Unknown Total:**

```tsx
<p className="text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
  <span className="font-medium text-zinc-900 dark:text-white">
    Page {currentPage}
  </span>
  <span>·</span>
  <span className="group relative">
    100+ results
    {/* Tooltip */}
    <span
      className="invisible group-hover:visible group-focus-within:visible
                     absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1
                     bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900
                     text-xs rounded whitespace-nowrap shadow-lg"
    >
      Exact counts shown up to 100 for faster search
    </span>
  </span>
  {isPending && <span className="text-zinc-400">(Loading...)</span>}
</p>
```

### 16.5 Page Numbers Generation

```typescript
function generatePageNumbers(
  currentPage: number,
  totalPages: number,
): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [];

  // Always show first page
  pages.push(1);

  if (currentPage > 3) {
    pages.push("ellipsis");
  }

  // Pages around current
  for (
    let i = Math.max(2, currentPage - 1);
    i <= Math.min(totalPages - 1, currentPage + 1);
    i++
  ) {
    pages.push(i);
  }

  if (currentPage < totalPages - 2) {
    pages.push("ellipsis");
  }

  // Always show last page
  if (totalPages > 1) {
    pages.push(totalPages);
  }

  return pages;
}
```

### 16.6 CSS Classes

```typescript
// Navigation container
const navClasses = cn(
  "flex flex-col sm:flex-row items-center justify-between gap-4 py-6 sm:py-8",
  "transition-opacity",
  isPending && "opacity-70",
);

// Button container
const buttonContainerClasses = "flex items-center gap-1";

// Page button (inactive)
const pageButtonClasses = cn(
  "min-w-[40px] sm:min-w-[36px] h-10 sm:h-9 px-2 sm:px-3",
  "rounded-lg text-sm font-medium transition-colors touch-target",
  "text-zinc-600 dark:text-zinc-400",
  "hover:bg-zinc-100 dark:hover:bg-zinc-800",
);

// Page button (current)
const currentPageClasses = cn(
  pageButtonClasses,
  "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900",
);

// Prev/Next button
const navButtonClasses = cn(
  "p-2.5 sm:p-2 rounded-lg border border-zinc-200 dark:border-zinc-700",
  "text-zinc-600 dark:text-zinc-400",
  "hover:bg-zinc-50 dark:hover:bg-zinc-800",
  "disabled:opacity-50 disabled:cursor-not-allowed",
  "transition-colors touch-target",
);
```

---

## 17. Sort System

### 17.1 File: `src/components/SortSelect.tsx`

**Lines:** 91

### 17.2 Sort Options

```typescript
const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest First" },
  { value: "rating", label: "Top Rated" },
];
```

### 17.3 SQL Implementation

| Sort          | ORDER BY Clause                                                               |
| ------------- | ----------------------------------------------------------------------------- |
| `recommended` | `(avg_rating * 20 + viewCount * 0.1 + review_count * 5) DESC, createdAt DESC` |
| `price_asc`   | `price ASC, createdAt DESC`                                                   |
| `price_desc`  | `price DESC, createdAt DESC`                                                  |
| `newest`      | `createdAt DESC, id ASC`                                                      |
| `rating`      | `avg_rating DESC, review_count DESC, createdAt DESC`                          |

### 17.4 Recommended Score Algorithm

```
score = (avgRating × 20) + (viewCount × 0.1) + (reviewCount × 5)
```

- **avgRating weight: 20** — Emphasizes quality
- **viewCount weight: 0.1** — Minor engagement signal
- **reviewCount weight: 5** — Social proof
- **Secondary sort: createdAt DESC** — Newer first with same score

### 17.5 Component Structure

```tsx
<div
  className="hidden md:flex items-center gap-2 text-xs font-medium
                text-zinc-500 dark:text-zinc-400"
>
  <span>Sort by:</span>
  <Select value={currentSort} onValueChange={handleSortChange} modal={false}>
    <SelectTrigger
      className="h-9 w-auto min-w-[140px] border-none bg-transparent
                              hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3 py-1.5
                              text-zinc-900 dark:text-white font-semibold text-xs
                              focus:ring-0"
    >
      <SelectValue placeholder="Recommended">
        {SORT_OPTIONS.find((o) => o.value === currentSort)?.label}
      </SelectValue>
    </SelectTrigger>

    <SelectContent position="popper" sideOffset={8}>
      {SORT_OPTIONS.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

### 17.6 URL Update

```typescript
const handleSortChange = (newSort: string) => {
  const params = new URLSearchParams(searchParams.toString());

  if (newSort === "recommended") {
    params.delete("sort"); // Default, omit from URL
  } else {
    params.set("sort", newSort);
  }

  // Reset to page 1 on sort change
  params.delete("page");

  router.push(`/search?${params.toString()}`);
};
```

---

## 18. Empty State & Zero Results

### 18.1 Empty State Structure

```tsx
<div
  className="flex flex-col items-center justify-center py-12 sm:py-20
                border-2 border-dashed border-zinc-100 dark:border-zinc-800
                rounded-2xl sm:rounded-3xl
                bg-zinc-50/50 dark:bg-zinc-900/50"
>
  {/* Icon */}
  <div
    className="w-14 h-14 sm:w-16 sm:h-16 rounded-full
                  bg-white dark:bg-zinc-800 flex items-center justify-center
                  shadow-sm mb-4"
  >
    <Search className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-400" />
  </div>

  {/* Title */}
  <h3
    className="text-base sm:text-lg font-semibold
                 text-zinc-900 dark:text-white mb-2"
  >
    No matches found
  </h3>

  {/* Description */}
  <p
    className="text-zinc-500 dark:text-zinc-400 text-sm
                max-w-xs text-center px-4"
  >
    We couldn't find any listings{q ? ` for "${q}"` : ""}.
  </p>

  {/* Filter Suggestions (lazy) */}
  <div className="w-full max-w-sm px-4 mt-4">
    <Suspense fallback={null}>
      <ZeroResultsSuggestions filterParams={filterParams} query={q} />
    </Suspense>
  </div>
</div>
```

### 18.2 ZeroResultsSuggestions Component

**File:** `src/components/ZeroResultsSuggestions.tsx`
**Lines:** 153

**States:**

1. **Initial (not loaded):**

```tsx
<button onClick={handleShowSuggestions} disabled={isPending} className="...">
  {isPending ? (
    <>
      <Loader2 className="w-4 h-4 animate-spin" />
      Analyzing...
    </>
  ) : (
    "Show suggestions"
  )}
</button>
```

2. **After loading (with suggestions):**

```tsx
<div
  className="mt-4 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl
                border border-zinc-100 dark:border-zinc-800"
>
  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
    Try adjusting your filters:
  </p>
  <ul className="space-y-2">
    {suggestions.slice(0, 3).map((item) => (
      <li key={item.filter}>
        <button
          onClick={() => handleRemoveFilter(item.filter)}
          className="text-left w-full p-2 rounded hover:bg-zinc-100
                     dark:hover:bg-zinc-800 transition-colors"
        >
          <span className="text-sm text-zinc-900 dark:text-white">
            {item.suggestion}
          </span>
          <span className="text-xs text-zinc-500 block">
            Remove: {item.label}
          </span>
        </button>
      </li>
    ))}
  </ul>
</div>
```

### 18.3 Server Action

**File:** `src/app/actions/filter-suggestions.ts`

```typescript
"use server";

import { analyzeFilterImpact } from "@/lib/data";
import { FilterParams } from "@/lib/search-params";

export interface FilterSuggestion {
  filter: string; // Filter key to remove
  label: string; // Human-readable filter name
  suggestion: string; // "Increase budget to see X more"
  additionalCount: number; // How many more results
}

export async function getFilterSuggestions(
  params: FilterParams,
): Promise<FilterSuggestion[]> {
  return analyzeFilterImpact(params);
}
```

---

## 19. Loading States & Skeletons

### 19.1 Streaming Loading (loading.tsx)

```tsx
import { SearchResultsSkeleton } from "@/components/skeletons/PageSkeleton";

export default function Loading() {
  return <SearchResultsSkeleton count={6} />;
}
```

### 19.2 SearchResultsSkeleton

```tsx
function SearchResultsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="px-4 sm:px-6 py-4 sm:py-6 max-w-[840px] mx-auto pb-24 md:pb-6">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <div className="h-6 w-48 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
          <div className="h-4 w-64 bg-zinc-100 dark:bg-zinc-800 rounded mt-2 animate-pulse" />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="h-9 w-24 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
          <div className="h-9 w-32 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
        </div>
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-x-6 sm:gap-y-8">
        {Array.from({ length: count }).map((_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
```

### 19.3 ListingCardSkeleton

```tsx
function ListingCardSkeleton() {
  return (
    <div
      className="bg-white dark:bg-zinc-900 rounded-2xl border
                    border-zinc-100 dark:border-zinc-800 overflow-hidden animate-pulse"
    >
      {/* Image */}
      <div className="aspect-[4/3] bg-zinc-200 dark:bg-zinc-700" />

      {/* Content */}
      <div className="p-4 space-y-3">
        <div className="h-5 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4" />
        <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-1/2" />
        <div className="flex justify-between items-center pt-2">
          <div className="h-5 bg-zinc-200 dark:bg-zinc-700 rounded w-20" />
          <div className="h-8 w-8 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
        </div>
      </div>
    </div>
  );
}
```

### 19.4 Breathing Pending State (Non-Blocking)

**File:** `src/components/SearchLayoutView.tsx`
**Purpose:** Keep old results visible during filter transitions with subtle opacity fade

The search page uses a **non-blocking "breathing" pending state** instead of a blocking overlay:

| Approach    | Previous (Blocking)         | Current (Breathing)          |
| ----------- | --------------------------- | ---------------------------- |
| Overlay     | `bg-white/60 backdrop-blur` | None                         |
| Results     | Hidden behind overlay       | Fully visible at 60% opacity |
| Interaction | Blocked                     | `pointer-events-none`        |
| UX Feel     | Jarring interruption        | Smooth, continuous           |

#### Implementation

```tsx
// Results container with breathing pending state
<div
  data-testid="search-results-container"
  aria-busy={isPending}
  className={cn(
    "flex-1 relative",
    "transition-opacity duration-200", // Smooth 200ms animation
    isPending && "opacity-60 pointer-events-none", // Breathing fade effect
  )}
>
  {children}
</div>
```

#### CSS Classes

| Class                 | Purpose                                         |
| --------------------- | ----------------------------------------------- |
| `transition-opacity`  | Enables smooth opacity animation                |
| `duration-200`        | 200ms transition for snappy but visible effect  |
| `opacity-60`          | 60% opacity shows results are stale but visible |
| `pointer-events-none` | Prevents interaction during transition          |

#### Accessibility

```tsx
// aria-busy attribute announces loading state to screen readers
<div aria-busy={isPending}>
```

### 19.5 SlowTransitionBadge

**Purpose:** Inform users when transitions take longer than expected (>6 seconds)

```tsx
{
  isSlowTransition && (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50"
    >
      <div
        className="flex items-center gap-2 px-4 py-2 bg-amber-100 dark:bg-amber-900/80
                    text-amber-800 dark:text-amber-200 rounded-full shadow-lg
                    border border-amber-200 dark:border-amber-700"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm font-medium">
          Taking longer than expected...
        </span>
      </div>
    </div>
  );
}
```

#### Trigger Conditions

| Condition           | Threshold   | Action                   |
| ------------------- | ----------- | ------------------------ |
| Slow transition     | > 6 seconds | Show amber badge         |
| Transition complete | N/A         | Hide badge automatically |

### 19.6 MapLoadingFallback

```tsx
function MapLoadingFallback() {
  return (
    <div
      className="w-full h-full bg-zinc-100 dark:bg-zinc-900
                    flex items-center justify-center"
    >
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          Loading map...
        </span>
      </div>
    </div>
  );
}
```

---

## 20. Error Handling

### 20.1 Error Boundary (error.tsx)

```tsx
"use client";

import { AlertCircle } from "lucide-react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center
                    bg-zinc-50 dark:bg-zinc-950 p-4"
    >
      <div className="max-w-md text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />

        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-3">
          Something went wrong
        </h1>

        <p className="text-zinc-600 dark:text-zinc-400 mb-6">
          {error.message || "An unexpected error occurred"}
        </p>

        {/* Dev-only error details */}
        {process.env.NODE_ENV === "development" && (
          <details className="text-left bg-zinc-100 dark:bg-zinc-900 p-4 rounded mb-6">
            <summary className="cursor-pointer text-sm text-zinc-600 dark:text-zinc-400">
              Error details
            </summary>
            <pre className="text-xs overflow-auto mt-2 text-red-600 dark:text-red-400">
              {error.stack}
            </pre>
          </details>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900
                       rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 border border-zinc-200 dark:border-zinc-700
                       text-zinc-700 dark:text-zinc-300 rounded-lg font-medium
                       hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
```

### 20.2 SearchErrorBanner

**File:** `src/components/SearchErrorBanner.tsx`
**Lines:** 72

```tsx
interface SearchErrorBannerProps {
  message: string;
  requestId?: string;
}

export function SearchErrorBanner({
  message,
  requestId,
}: SearchErrorBannerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRetry = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div
      className="bg-amber-50 dark:bg-amber-950/50 border-b
                 border-amber-200 dark:border-amber-800 px-4 py-3"
      role="alert"
    >
      <div
        className="max-w-7xl mx-auto flex flex-wrap items-center
                      justify-between gap-3"
      >
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm">{message}</span>
          {requestId && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              (Ref: {requestId.slice(0, 8)})
            </span>
          )}
        </div>

        <button
          onClick={handleRetry}
          disabled={isPending}
          className="rounded-md border border-amber-300 dark:border-amber-700
                     bg-white dark:bg-amber-900/30 px-3 py-1.5 text-xs font-medium
                     text-amber-800 dark:text-amber-200
                     hover:bg-amber-100 dark:hover:bg-amber-900/50
                     disabled:opacity-50 transition-colors"
        >
          <RefreshCw
            className={cn("w-3 h-3 inline mr-1", isPending && "animate-spin")}
          />
          {isPending ? "Retrying..." : "Retry"}
        </button>
      </div>
    </div>
  );
}
```

---

## 21. Context Providers

### 21.1 SearchTransitionContext

**File:** `src/contexts/SearchTransitionContext.tsx`
**Lines:** 89

**Purpose:** Coordinates navigation transitions across search components

```typescript
interface SearchTransitionContextValue {
  isPending: boolean;
  isSlowTransition: boolean; // > 6 seconds
  navigateWithTransition: (url: string, options?: { scroll?: boolean }) => void;
  startTransition: TransitionStartFunction;
}
```

**Implementation:**

```typescript
export function SearchTransitionProvider({ children }: { children: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  const [isSlowTransition, setIsSlowTransition] = useState(false);
  const router = useRouter();
  const slowTransitionTimer = useRef<NodeJS.Timeout | null>(null);

  // Track slow transitions (> 6s)
  useEffect(() => {
    if (isPending) {
      slowTransitionTimer.current = setTimeout(() => {
        setIsSlowTransition(true);
      }, 6000);
    } else {
      if (slowTransitionTimer.current) {
        clearTimeout(slowTransitionTimer.current);
      }
      setIsSlowTransition(false);
    }

    return () => {
      if (slowTransitionTimer.current) {
        clearTimeout(slowTransitionTimer.current);
      }
    };
  }, [isPending]);

  const navigateWithTransition = useCallback(
    (url: string, options?: { scroll?: boolean }) => {
      startTransition(() => {
        router.push(url, { scroll: options?.scroll ?? false });
      });
    },
    [router, startTransition]
  );

  const value = useMemo(() => ({
    isPending,
    isSlowTransition,
    navigateWithTransition,
    startTransition,
  }), [isPending, isSlowTransition, navigateWithTransition]);

  return (
    <SearchTransitionContext.Provider value={value}>
      {children}
    </SearchTransitionContext.Provider>
  );
}
```

### 21.2 FilterStateContext

**File:** `src/contexts/FilterStateContext.tsx`

**Purpose:** Shares pending filter dirty state across components

```typescript
interface FilterStateContextValue {
  isDirty: boolean;
  changeCount: number;
  isDrawerOpen: boolean;
  setDirtyState: (dirty: boolean, count: number) => void;
  setDrawerOpen: (isOpen: boolean) => void;
  openDrawer: () => void;
  registerOpenDrawer: (callback: () => void) => void;
}
```

### 21.3 MapBoundsContext

**File:** `src/contexts/MapBoundsContext.tsx`
**Lines:** 157

**Purpose:** Tracks map bounds changes and enables cross-component banner display

```typescript
interface MapBoundsState {
  hasUserMoved: boolean;
  boundsDirty: boolean;
  searchAsMove: boolean;
  searchCurrentArea: () => void;
  resetToUrlBounds: () => void;
}

// Convenience hook for banner display
export function useMapMovedBanner() {
  const {
    hasUserMoved,
    boundsDirty,
    searchAsMove,
    searchCurrentArea,
    resetToUrlBounds,
  } = useMapBounds();

  const showBanner = hasUserMoved && boundsDirty && !searchAsMove;

  return { showBanner, onSearch: searchCurrentArea, onReset: resetToUrlBounds };
}
```

### 21.4 ListingFocusContext

**File:** `src/contexts/ListingFocusContext.tsx`
**Lines:** ~120

**Purpose:** Enables two-way synchronization between listing cards and map markers

```typescript
interface ListingFocusContextValue {
  hoveredId: string | null; // Card currently being hovered
  selectedId: string | null; // Marker clicked (triggers scroll-to)
  setHovered: (id: string | null) => void;
  setSelected: (id: string | null) => void;
  clearFocus: () => void;
}
```

#### SSR-Safe Fallback Pattern

To prevent performance cascade issues with context re-renders, the context uses a **stable SSR fallback object**:

```typescript
// Module-level constant prevents new object creation on each render
const SSR_FALLBACK: ListingFocusContextValue = {
  hoveredId: null,
  selectedId: null,
  setHovered: () => {},
  setSelected: () => {},
  clearFocus: () => {},
};

export function useListingFocus() {
  const context = useContext(ListingFocusContext);
  return context ?? SSR_FALLBACK; // Stable reference when outside provider
}
```

#### Memoized Focus State Hook

```typescript
export function useIsListingFocused(listingId: string) {
  const { hoveredId, selectedId } = useListingFocus();

  // Memoized to prevent re-render cascade
  return useMemo(
    () => ({
      isHovered: hoveredId === listingId,
      isSelected: selectedId === listingId,
      isFocused: hoveredId === listingId || selectedId === listingId,
    }),
    [hoveredId, selectedId, listingId],
  );
}
```

#### Auto-Clear Selection

When a marker is clicked (triggering `setSelected`), the selection automatically clears after 1 second:

```typescript
const setSelected = useCallback((id: string | null) => {
  setState((prev) => ({ ...prev, selectedId: id }));

  // Auto-clear selection after scroll animation completes
  if (id) {
    setTimeout(() => {
      setState((prev) => ({ ...prev, selectedId: null }));
    }, 1000);
  }
}, []);
```

#### Usage Flow

```
┌─────────────────┐                    ┌─────────────────┐
│   ListingCard   │                    │      Map        │
│                 │                    │                 │
│  onMouseEnter   │───setHovered(id)──▶│                 │
│  onMouseLeave   │───setHovered(null)▶│  Marker style   │
│                 │                    │  (blue + scale) │
└─────────────────┘                    └─────────────────┘
        ▲                                      │
        │                                      │
        │                              onClick marker
        │                                      │
        │                                      ▼
        │◀────────setSelected(id)───── │ setSelected() │
        │                                      │
  scrollIntoView()                    ┌───────▼───────┐
  + ring highlight                    │  Popup opens  │
                                      └───────────────┘
```

### 21.5 SearchV2DataContext

**File:** `src/contexts/SearchV2DataContext.tsx`
**Lines:** 67

**Purpose:** Shares V2 map data from page.tsx (SSR) to PersistentMapWrapper (client) via context, enabling sibling component data sharing without prop drilling.

```typescript
export interface V2MapData {
  geojson: SearchV2GeoJSON; // GeoJSON FeatureCollection for clustering
  pins?: SearchV2Pin[]; // Tiered pins for sparse results
  mode: SearchV2Mode; // 'geojson' or 'pins'
}

interface SearchV2DataContextValue {
  v2MapData: V2MapData | null;
  isV2Enabled: boolean;
  setV2MapData: (data: V2MapData | null) => void;
  setIsV2Enabled: (enabled: boolean) => void;
}
```

**Data Flow:**

```
page.tsx (SSR)
    │
    ├── executeSearchV2() → v2MapData
    │
    ├── V2MapDataSetter (client)
    │   └── useEffect → setV2MapData(data), setIsV2Enabled(true)
    │
    └── PersistentMapWrapper (sibling, client)
        └── useSearchV2Data() → reads v2MapData
            └── Skip fetch if isV2Enabled && v2MapData available
```

**Component: V2MapDataSetter**

```typescript
// src/components/search/V2MapDataSetter.tsx (38 lines)
export function V2MapDataSetter({ data }: V2MapDataSetterProps) {
  const { setV2MapData, setIsV2Enabled } = useSearchV2Data();

  useEffect(() => {
    setIsV2Enabled(true);
    setV2MapData(data);

    return () => {
      setV2MapData(null);
      setIsV2Enabled(false);
    };
  }, [data, setV2MapData, setIsV2Enabled]);

  return null; // Renders nothing, just sets context
}
```

### 21.6 SearchMapUIContext

**File:** `src/contexts/SearchMapUIContext.tsx`
**Lines:** 144

**Purpose:** Coordinates "View on map" button clicks from ListingCard to map marker focus, enabling card-to-map navigation with fly-to animation.

```typescript
interface SearchMapUIContextValue {
  pendingFocus: string | null; // Listing ID awaiting focus
  focusListingOnMap: (id: string) => void; // Card calls this
  acknowledgeFocus: () => string | null; // Map calls to consume
  dismiss: () => void; // Clear pending focus
}
```

**Usage Flow:**

```
ListingCard                           Map
    │                                  │
    ├── "View on map" click            │
    │   └── focusListingOnMap(id)      │
    │                                  │
    │                              useEffect
    │                                  │
    │                              pendingFocus changed
    │                                  │
    │                              acknowledgeFocus()
    │                                  │
    │                              flyTo(lng, lat)
    │                                  │
    │                              openPopup(listing)
    │                                  │
    └─────────────────────────────── dismiss()
```

**Integration with Map:**

```typescript
// In Map.tsx
useEffect(() => {
  const focusedId = acknowledgeFocus();
  if (!focusedId || !mapRef.current) return;

  const listing = listings.find((l) => l.id === focusedId);
  if (!listing) return;

  // Fly to listing location
  mapRef.current.flyTo({
    center: [listing.location.lng, listing.location.lat],
    zoom: 15,
    duration: 1000,
  });

  // Open popup after animation
  setTimeout(() => {
    setSelectedStack([listing]);
    dismiss();
  }, 1000);
}, [pendingFocus]);
```

---

## 22. API Endpoints

### 22.1 GET /api/listings

**Purpose:** Main listings search endpoint
**Rate Limit:** `listingsRead` (100 req/hour)

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Text search (min 2, max 100 chars) |
| `minPrice` | number | Minimum price |
| `maxPrice` | number | Maximum price |
| `amenities` | string[] | CSV amenities |
| `languages` | string[] | CSV languages |
| `houseRules` | string[] | CSV house rules |
| `moveInDate` | string | YYYY-MM-DD |
| `leaseDuration` | string | Lease duration enum |
| `roomType` | string | Room type enum |
| `page` | number | 1-100 |
| `limit` | number | 1-50 (default: 20) |
| `sort` | string | Sort option |

**Response:**

```typescript
{
  items: Listing[];
  total: number | null;      // null if >100
  totalPages: number | null;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  page: number;
  limit: number;
}
```

**Caching Headers:**

```
Cache-Control: public, s-maxage=60, max-age=30, stale-while-revalidate=120
Vary: Accept-Encoding
```

### 22.2 GET /api/map-listings

**Purpose:** Optimized map marker data
**Rate Limit:** Redis-backed (60 burst/min, 300 sustained/hour)

**Parameters:**
| Param | Type | Required |
|-------|------|----------|
| `minLng` | number | Yes |
| `maxLng` | number | Yes |
| `minLat` | number | Yes |
| `maxLat` | number | Yes |
| `q`, filters... | various | No |

**Response:**

```typescript
{
  listings: Array<{
    id: string;
    title: string;
    price: number;
    availableSlots: number;
    ownerId?: string;
    images?: string[];
    location: { lat: number; lng: number };
  }>;
}
```

### 22.3 POST /api/nearby

**Purpose:** Radar API POI search proxy
**Rate Limit:** `nearbySearch` (30 req/minute)
**Authentication:** Required

**Request:**

```typescript
{
  listingLat: number;
  listingLng: number;
  query?: string;
  categories?: string[];
  radiusMeters: 1609 | 3218 | 8046;
  limit?: number;
}
```

**Response:**

```typescript
{
  places: Array<{
    id: string;
    name: string;
    address: string;
    category: string;
    chain?: string;
    location: { lat: number; lng: number };
    distanceMiles: number;
  }>;
  meta: {
    cached: false;
    count: number;
  }
}
```

**Caching:** `Cache-Control: no-store` (compliance requirement)

### 22.4 Search API V2 (Unified List + Map)

**Files:**

- `src/lib/search/search-v2-service.ts` (280 lines) - Core service
- `src/lib/search/types.ts` (119 lines) - Response types
- `src/components/search/V2MapDataSetter.tsx` (38 lines) - Context injection

**Purpose:** Unified search endpoint combining list results and map data in a single request. Feature-flagged via `searchV2` environment variable or `?searchV2=1` URL parameter.

**Activation:**

```typescript
// In page.tsx
const useV2 = features.searchV2 || rawParams.searchV2 === "1";
```

**Response Types:**

```typescript
/** Mode determines pin rendering: 'geojson' for clustering, 'pins' for true markers */
export type SearchV2Mode = "geojson" | "pins";

/** Threshold: >= 50 listings = 'geojson' mode, < 50 = 'pins' mode */
export const CLUSTER_THRESHOLD = 50;

/** Complete v2 search response */
export interface SearchV2Response {
  meta: {
    queryHash: string; // 16-char SHA256 for cache key
    generatedAt: string; // ISO timestamp
    mode: SearchV2Mode; // Based on mapListings.length
    rankingVersion?: string; // Debug only
    rankingEnabled?: boolean; // Debug only
    topSignals?: DebugSignals[]; // Debug only, max 5
  };
  list: {
    items: SearchV2ListItem[];
    nextCursor: string | null; // Base64url encoded
    total?: number | null; // Exact if ≤100, null if >100
  };
  map: {
    geojson: SearchV2GeoJSON; // Always present
    pins?: SearchV2Pin[]; // Only in 'pins' mode
  };
}

/** Tiered pin for sparse results (< 50 listings) */
export interface SearchV2Pin {
  id: string;
  lat: number;
  lng: number;
  price?: number | null;
  tier?: "primary" | "mini"; // Primary = larger price pill, mini = small dot
  stackCount?: number; // Multiple listings at same location
}
```

**Data Flow:**

```
page.tsx (SSR)
    │
    ├── executeSearchV2({ rawParams, limit })
    │   ├── parseSearchParams()
    │   ├── getSearchDocListingsPaginated() or getListingsPaginated()
    │   ├── getSearchDocMapListings() or getMapListings()
    │   ├── determineMode() → geojson or pins
    │   ├── transformToListItems()
    │   ├── transformToMapResponse()
    │   └── Return { response, paginatedResult }
    │
    ├── V2MapDataSetter (client component)
    │   └── useEffect → setV2MapData(data) to context
    │
    └── PersistentMapWrapper (reads from context)
        └── Renders map with pre-fetched data (no HTTP call)
```

**Benefits:**

- Single fetch for list + map data (no HTTP self-call overhead)
- Server-side rendering with pre-fetched map data
- Tiered pin system for better visual hierarchy
- Keyset pagination support for stable cursors
- Ranking integration with debug signals

---

## 23. Database Queries

### 23.1 Main Query: `getListingsPaginated`

**File:** `src/lib/data.ts`

```sql
SELECT
  l.id, l.title, l.description, l.price, l.images,
  l."availableSlots", l."totalSlots",
  l.amenities, l."houseRules", l."household_languages",
  l."primary_home_language", l."leaseDuration", l."roomType", l."moveInDate",
  l."ownerId", l."createdAt", l."viewCount",
  loc.address, loc.city, loc.state, loc.zip,
  ST_X(loc.coords::geometry) as lng,
  ST_Y(loc.coords::geometry) as lat,
  COALESCE(AVG(r.rating), 0) as avg_rating,
  COUNT(r.id) as review_count
FROM "Listing" l
JOIN "Location" loc ON l.id = loc."listingId"
LEFT JOIN "Review" r ON l.id = r."listingId"
WHERE
  l.status = 'ACTIVE'
  AND l."availableSlots" > 0
  AND ST_Y(loc.coords::geometry) IS NOT NULL
  AND ST_X(loc.coords::geometry) IS NOT NULL
  ${whereClause}
GROUP BY l.id, loc.id
ORDER BY ${orderByClause}
LIMIT ${limit + 1} OFFSET ${offset}
```

### 23.2 Filter SQL Patterns

| Filter                | SQL Pattern                                                                                                                                   | Logic                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Bounds (normal)       | `ST_Y(loc.coords::geometry) >= ? AND ST_Y(loc.coords::geometry) <= ? AND ST_X(loc.coords::geometry) >= ? AND ST_X(loc.coords::geometry) <= ?` | AND                  |
| Bounds (antimeridian) | `(ST_X(loc.coords::geometry) >= ? OR ST_X(loc.coords::geometry) <= ?)`                                                                        | OR                   |
| Price                 | `l.price >= ? AND l.price <= ?`                                                                                                               | AND                  |
| Query                 | `(LOWER(l.title) LIKE ? OR LOWER(l.description) LIKE ? OR LOWER(loc.city) LIKE ? OR LOWER(loc.state) LIKE ?)`                                 | OR                   |
| Room Type             | `LOWER(l."roomType") = LOWER(?)`                                                                                                              | Exact                |
| Lease Duration        | `LOWER(l."leaseDuration") = LOWER(?)`                                                                                                         | Exact                |
| Move-in Date          | `(l."moveInDate" IS NULL OR l."moveInDate" <= ?)`                                                                                             | OR                   |
| Languages             | `l."household_languages" && ?::text[]`                                                                                                        | Array overlap (OR)   |
| Amenities             | Subquery with `NOT EXISTS` and `LIKE`                                                                                                         | AND (all required)   |
| House Rules           | `ARRAY(SELECT LOWER(x) FROM unnest(l."houseRules") AS x) @> ?::text[]`                                                                        | Array contains (AND) |

### 23.3 Hybrid COUNT Query

```sql
-- Efficient count with LIMIT 101 (hybrid approach)
SELECT COUNT(*) FROM (
  SELECT DISTINCT l.id
  FROM "Listing" l
  JOIN "Location" loc ON l.id = loc."listingId"
  WHERE ${whereClause}
  LIMIT 101
) subq
```

- Returns exact count if ≤ 100
- Returns `null` if > 100 (avoids full table scan)

---

## 24. Caching Architecture

### 24.1 Three-Layer Caching

```
┌─────────────────────────────────────────────────────────────────┐
│                    Client Layer (Browser)                        │
│                                                                  │
│  ┌─ Local-First Location Search ──────────────────────────────┐ │
│  │  • In-memory ~100 US locations (NOT a cache)                │ │
│  │  • Zero API calls for common searches                       │ │
│  │  • Mapbox API only for addresses or rare locations          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ Map Preference (localStorage) ────────────────────────────┐ │
│  │  • Persists user's desktop/mobile map visibility preference │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CDN/Edge Layer                                │
│                                                                  │
│  /api/map-listings Headers:                                      │
│  • s-maxage=60 (CDN: 60 seconds)                                │
│  • max-age=30 (Browser: 30 seconds)                             │
│  • stale-while-revalidate=120                                   │
│  • Vary: Accept-Encoding                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Server Layer (Next.js)                        │
│                                                                  │
│  unstable_cache (Data Functions):                                │
│  • TTL: 60 seconds                                              │
│  • getListingsPaginated → listings-paginated cache              │
│  • getLimitedCount → limited-count cache (filter-only key)      │
│  • getMapListings → map-listings cache                          │
└─────────────────────────────────────────────────────────────────┘
```

### 24.2 Cache Key Generation

```typescript
function createListingsCacheKey(params: FilterParams): string {
  const normalized = {
    q: params.query?.toLowerCase().trim() || "",
    minPrice: params.minPrice ?? "",
    maxPrice: params.maxPrice ?? "",
    amenities: [...(params.amenities || [])].sort().join(","),
    houseRules: [...(params.houseRules || [])].sort().join(","),
    languages: [...(params.languages || [])].sort().join(","),
    roomType: params.roomType?.toLowerCase() || "",
    leaseDuration: params.leaseDuration?.toLowerCase() || "",
    moveInDate: params.moveInDate || "",
    bounds: params.bounds
      ? `${params.bounds.minLng.toFixed(4)},${params.bounds.minLat.toFixed(4)},` +
        `${params.bounds.maxLng.toFixed(4)},${params.bounds.maxLat.toFixed(4)}`
      : "",
    page: params.page ?? 1,
    limit: params.limit ?? 12,
    sort: params.sort || "recommended",
  };
  return JSON.stringify(normalized);
}
```

---

## 25. Rate Limiting

### 25.1 Configuration

```typescript
export const RATE_LIMITS = {
  register: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5/hour
  search: { limit: 30, windowMs: 60 * 1000 }, // 30/minute
  nearbySearch: { limit: 30, windowMs: 60 * 1000 }, // 30/minute
  listingsRead: { limit: 100, windowMs: 60 * 60 * 1000 }, // 100/hour
  createListing: { limit: 5, windowMs: 24 * 60 * 60 * 1000 }, // 5/day
};
```

### 25.2 Redis Two-Tier Strategy

| API     | Burst Limit | Window | Sustained Limit | Window |
| ------- | ----------- | ------ | --------------- | ------ |
| Chat    | 5/min       | 1 min  | 30/hour         | 1 hour |
| Map     | 60/min      | 1 min  | 300/hour        | 1 hour |
| Metrics | 100/min     | 1 min  | 500/hour        | 1 hour |

### 25.3 Rate Limit Response

```typescript
{
  error: 'Too many requests',
  message: 'Please wait before making more requests',
  retryAfter: number  // seconds
}

// Headers
Retry-After: {seconds}
X-RateLimit-Limit: {burstLimit}
X-RateLimit-Remaining: 0
x-request-id: {requestId}
```

---

## 26. Responsive Design

### 26.1 Breakpoints

| Breakpoint       | Width    | Usage                                  |
| ---------------- | -------- | -------------------------------------- |
| Mobile (default) | < 640px  | Single column, full padding            |
| `sm`             | ≥ 640px  | 2-column grid, adjusted spacing        |
| `md`             | ≥ 768px  | Desktop split view, header adjustments |
| `lg`             | ≥ 1024px | Larger cards and spacing               |
| `xl`             | ≥ 1280px | Maximum content width                  |

### 26.2 Layout Behavior

```
┌─────────────────────────────────────────────────────────────┐
│ Mobile (< 768px)                                            │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Header: full width, compact                             │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ List or Map (toggle via FAB)                            │ │
│ │ Single view at a time                                   │ │
│ │ 1-column grid                                           │ │
│ └─────────────────────────────────────────────────────────┘ │
│ [Show List / Show Map] FAB at bottom                        │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Desktop (≥ 768px)                                            │
├──────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────┐  │
│ │ Header: sticky, expanded                               │  │
│ └────────────────────────────────────────────────────────┘  │
│ ┌──────────────────────┬─────────────────────────────────┐  │
│ │ List (50% or 100%)   │ Map (50%) or Placeholder        │  │
│ │ 2-column grid        │                                 │  │
│ │                      │ [Hide Map] btn at top-right     │  │
│ └──────────────────────┴─────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 26.3 Responsive Classes

| Element      | Classes                                                         |
| ------------ | --------------------------------------------------------------- |
| Container    | `px-4 sm:px-6 py-4 sm:py-6 max-w-[840px] mx-auto pb-24 md:pb-6` |
| Grid         | `grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-x-6 sm:gap-y-8`   |
| Title        | `text-lg sm:text-xl`                                            |
| Mobile view  | `md:hidden`                                                     |
| Desktop view | `hidden md:flex`                                                |
| Split panel  | `w-1/2` (with map) or `w-full` (without)                        |

---

## 27. Dark Mode Support

### 27.1 Implementation

```tsx
// Classes use dark: prefix
<div className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
```

### 27.2 Map Style Switching

```typescript
const LIGHT_STYLE = "mapbox://styles/mapbox/streets-v11";
const DARK_STYLE = "mapbox://styles/mapbox/dark-v11";

// Auto-switch on html class change
useEffect(() => {
  const observer = new MutationObserver(() => {
    const isDark = document.documentElement.classList.contains("dark");
    mapRef.current?.setStyle(isDark ? DARK_STYLE : LIGHT_STYLE);
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  return () => observer.disconnect();
}, []);
```

### 27.3 Color Palette

| Light             | Dark              |
| ----------------- | ----------------- |
| `bg-white`        | `bg-zinc-900`     |
| `bg-zinc-50`      | `bg-zinc-950`     |
| `bg-zinc-100`     | `bg-zinc-800`     |
| `text-zinc-900`   | `text-white`      |
| `text-zinc-600`   | `text-zinc-400`   |
| `text-zinc-500`   | `text-zinc-400`   |
| `border-zinc-200` | `border-zinc-800` |
| `border-zinc-100` | `border-zinc-800` |

---

## 28. Accessibility Features

### 28.1 Screen Reader Announcements

```tsx
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {listings.length === 0
    ? `No listings found${q ? ` for "${q}"` : ""}`
    : total !== null
      ? `Found ${total} ${total === 1 ? "listing" : "listings"}${q ? ` for "${q}"` : ""}`
      : `Found 100+ listings${q ? ` for "${q}"` : ""}`}
</div>
```

### 28.2 ARIA Labels

| Element         | ARIA                                    |
| --------------- | --------------------------------------- |
| Pagination nav  | `aria-label="Pagination navigation"`    |
| Current page    | `aria-current="page"`                   |
| Prev/Next       | `aria-label="Go to previous/next page"` |
| Loading overlay | `role="status"`                         |
| Error banner    | `role="alert"`                          |
| Close buttons   | `aria-label="Close"`                    |

### 28.3 Keyboard Navigation

| Key         | Action                        |
| ----------- | ----------------------------- |
| Tab         | Navigate interactive elements |
| Enter/Space | Activate buttons              |
| Escape      | Close modals/drawers          |
| Arrow keys  | Navigate suggestions          |

### 28.4 Focus Management (FocusTrap)

**File:** `src/components/ui/FocusTrap.tsx`

```typescript
interface FocusTrapProps {
  children: ReactNode;
  returnFocus?: RefObject<HTMLElement | null>;
  active?: boolean;
}
```

**Features:**

- Tab cycling within trapped region
- Shift+Tab reverse cycling
- Auto-focus first focusable element
- Focus returns to trigger on close

### 28.5 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 29. Animation & Transitions

### 29.1 CSS Classes

| Animation              | Class                             | Usage                        |
| ---------------------- | --------------------------------- | ---------------------------- |
| Pulse                  | `animate-pulse`                   | Skeletons                    |
| Spin                   | `animate-spin`                    | Loading spinners             |
| Transition             | `transition-all duration-300`     | State changes                |
| Scale on hover         | `hover:scale-105`                 | Images, markers              |
| Lift on hover          | `hover:-translate-y-0.5`          | Cards                        |
| Breathing pending      | `transition-opacity duration-200` | Search results pending state |
| Pending opacity        | `opacity-60`                      | Results during filter change |
| Focus ring             | `ring-2 ring-blue-500`            | List↔Map sync highlight      |
| Marker highlight scale | `scale-110`                       | Map marker on card hover     |
| Carousel snap          | `snap-x snap-mandatory`           | Photo carousel scroll        |

### 29.2 Duration Constants

```css
--duration-fast: 150ms;
--duration-normal: 300ms;
--duration-slow: 500ms;
```

### 29.3 Map Animations

| Animation      | Duration  |
| -------------- | --------- |
| flyTo          | 2000ms    |
| fitBounds      | 1000ms    |
| Cluster expand | Automatic |

---

## 30. Performance Optimizations

### 30.1 Summary Table

| Optimization       | Impact                  | Implementation       |
| ------------------ | ----------------------- | -------------------- |
| Lazy Map Init      | ~60% fewer loads        | `useMapPreference`   |
| Local-First Search | ~60-70% fewer API calls | Local dataset        |
| Hybrid COUNT       | ~40% fewer queries      | LIMIT 101 subquery   |
| Search as Move OFF | ~80% fewer searches     | Default toggle state |
| Server-side Cache  | ~50% fewer DB queries   | `unstable_cache` 60s |
| CDN Edge Caching   | ~70% faster responses   | `s-maxage=60`        |
| Dynamic Import     | 944KB deferred          | `next/dynamic`       |
| Image Lazy Loading | Reduces initial load    | `loading="lazy"`     |

### 30.2 Bundle Sizes

| Component     | Size   | Strategy                     |
| ------------- | ------ | ---------------------------- |
| Mapbox GL JS  | ~944KB | Dynamic import, SSR disabled |
| react-map-gl  | ~50KB  | With Map                     |
| SearchForm    | ~30KB  | Inline (critical)            |
| Listing Cards | ~10KB  | Server-rendered              |

---

## 31. Visual Change Matrix

### 31.1 When Filter Changes

| Action         | URL Change        | Results Change | Map Change  |
| -------------- | ----------------- | -------------- | ----------- |
| Type location  | ❌ (until search) | ❌             | ❌          |
| Click "Search" | ✅                | ✅ (reload)    | ✅ (fly to) |
| Toggle amenity | ❌ (batched)      | ❌             | ❌          |
| Click "Apply"  | ✅                | ✅ (reload)    | ❌          |
| Click "Reset"  | ❌                | ❌             | ❌          |
| Change sort    | ✅                | ✅ (reload)    | ❌          |
| Change page    | ✅                | ✅ (reload)    | ❌          |
| Clear all      | ✅                | ✅ (reload)    | ❌          |

### 31.2 When Map Changes

| Action                     | URL Change     | Results Change | Banner Shows  |
| -------------------------- | -------------- | -------------- | ------------- |
| Pan map                    | ❌             | ❌             | ✅ (if moved) |
| Zoom map                   | ❌             | ❌             | ✅ (if moved) |
| Click "Search this area"   | ✅             | ✅ (reload)    | ❌            |
| Click "Reset"              | ❌             | ❌             | ❌            |
| Toggle "Search as move" ON | ❌             | ❌             | ❌            |
| Pan with toggle ON         | ✅ (debounced) | ✅ (reload)    | ❌            |

### 31.3 Visual Feedback Summary

| State                  | Visual Change                          |
| ---------------------- | -------------------------------------- |
| Filter dirty (batched) | PendingFiltersBanner shows             |
| Map moved              | MapMovedBanner shows (both map & list) |
| Loading results        | ListLoadingOverlay with spinner        |
| Pagination transition  | Pagination fades to 70% opacity        |
| No results             | Empty state with icon                  |
| Error                  | SearchErrorBanner (amber)              |
| Rate limited           | Error banner with countdown            |

---

## 32. State Flow Diagrams

### 32.1 URL-Driven State Flow

```
URL SearchParams
    │
    ▼
parseSearchParams()
    │
    ▼
FilterParams
    │
    ├──────────────────────────────────────┐
    │                                      │
    ▼                                      ▼
getListingsPaginated()            useBatchedFilters()
    │                                      │
    ▼                                      ├── committed (from URL)
PaginatedResult                            ├── pending (local changes)
    │                                      ├── isDirty
    ▼                                      └── changeCount
SearchPage renders                              │
    │                                           ▼
    ▼                                     FilterStateContext
ListingCard[]                                   │
    │                                           ▼
    ▼                                     PendingFiltersBanner
Pagination                                      │
                                                ▼
                                          FilterStickyFooter
```

### 32.2 Map Bounds State Flow

```
User pans/zooms map
    │
    ▼
handleMoveEnd()
    │
    ├── isProgrammaticMoveRef? → Skip if true
    │
    ├── setHasUserMoved(true)
    │
    ├── Compare with URL bounds
    │   └── setBoundsDirty(true/false)
    │
    └── searchAsMove ON?
        ├── YES → debouncedExecuteSearch()
        └── NO → Show MapMovedBanner
                    │
                    ├── "Search this area" → executeMapSearch()
                    │                              │
                    │                              ▼
                    │                        URL updated
                    │                              │
                    │                              ▼
                    │                        Results reload
                    │
                    └── "Reset" → handleResetToUrlBounds()
                                        │
                                        ▼
                                  fitBounds(URL bounds)
```

### 32.3 Filter Application Flow

```
User changes filter in drawer
    │
    ▼
updateField() or toggleArrayItem()
    │
    ▼
pending state updated (local)
    │
    ▼
isDirty = true, changeCount++
    │
    ▼
setDirtyState() → FilterStateContext
    │
    ├── Drawer open → FilterStickyFooter shows "Show X listings" (with count)
    │
    └── Drawer closed → PendingFiltersBanner shows

User clicks "Apply"
    │
    ▼
apply() → returns pending values
    │
    ▼
buildSearchUrl(pending)
    │
    ▼
navigateWithTransition(url)
    │
    ▼
isPending = true → ListLoadingOverlay shows
    │
    ▼
URL updates → Server re-renders
    │
    ▼
committed syncs with pending → isDirty = false
```

---

## 33. Complete File Reference

### 33.1 App Directory

| File                         | Lines | Purpose                         |
| ---------------------------- | ----- | ------------------------------- |
| `src/app/search/page.tsx`    | 316   | Server component, data fetching |
| `src/app/search/layout.tsx`  | ~300  | Persistent layout, contexts     |
| `src/app/search/loading.tsx` | ~10   | Streaming fallback              |
| `src/app/search/error.tsx`   | ~60   | Error boundary                  |

### 33.2 Components

| File                                              | Lines | Purpose                        |
| ------------------------------------------------- | ----- | ------------------------------ |
| `src/components/SearchForm.tsx`                   | 1256  | Filter UI, location search     |
| `src/components/SearchLayoutView.tsx`             | 268   | Mobile/desktop split           |
| `src/components/LocationSearchInput.tsx`          | 443   | Autocomplete                   |
| `src/components/Pagination.tsx`                   | 239   | Page navigation                |
| `src/components/SortSelect.tsx`                   | 91    | Sort dropdown                  |
| `src/components/SaveSearchButton.tsx`             | 280   | Save modal                     |
| `src/components/SearchErrorBanner.tsx`            | 72    | Error display                  |
| `src/components/ZeroResultsSuggestions.tsx`       | 153   | Filter suggestions             |
| `src/components/PersistentMapWrapper.tsx`         | ~200  | Map persistence                |
| `src/components/DynamicMap.tsx`                   | ~50   | Lazy import                    |
| `src/components/Map.tsx`                          | 1392  | Mapbox GL                      |
| `src/components/listings/ListingCard.tsx`         | 303   | Result card                    |
| `src/components/map/StackedListingPopup.tsx`      | 175   | Multi-listing popup            |
| `src/components/map/MapMovedBanner.tsx`           | 73    | Area search banner             |
| `src/components/filters/PendingFiltersBanner.tsx` | 61    | Dirty state banner             |
| `src/components/filters/FilterStickyFooter.tsx`   | 126   | Apply/Reset with dynamic count |
| `src/components/ui/FocusTrap.tsx`                 | 89    | Focus management               |

### 33.3 Libraries

| File                                | Lines | Purpose                     |
| ----------------------------------- | ----- | --------------------------- |
| `src/lib/data.ts`                   | 2337  | All queries                 |
| `src/lib/search-params.ts`          | 584   | URL parsing                 |
| `src/lib/near-matches.ts`           | 294   | Near-match relaxation logic |
| `src/lib/filter-schema.ts`          | 721   | Zod validation              |
| `src/lib/geocoding.ts`              | ~55   | Mapbox geocoding            |
| `src/lib/locations/us-locations.ts` | 1276  | Local dataset (~100 cities) |
| `src/lib/maps/marker-utils.ts`      | 207   | Marker grouping/tiering     |
| `src/lib/geo/distance.ts`           | 163   | Haversine math              |

### 33.4 Hooks

| File                                   | Lines | Purpose                                       |
| -------------------------------------- | ----- | --------------------------------------------- |
| `src/hooks/useBatchedFilters.ts`       | 216   | Filter batching                               |
| `src/hooks/useDebouncedFilterCount.ts` | 302   | Debounced listing count for "Show X listings" |
| `src/hooks/useMapPreference.ts`        | ~80   | Map visibility                                |

### 33.5 Contexts

| File                                       | Lines | Purpose                          |
| ------------------------------------------ | ----- | -------------------------------- |
| `src/contexts/SearchTransitionContext.tsx` | 89    | Navigation transitions           |
| `src/contexts/FilterStateContext.tsx`      | ~100  | Dirty state sharing              |
| `src/contexts/MapBoundsContext.tsx`        | 157   | Map bounds state                 |
| `src/contexts/SearchV2DataContext.tsx`     | 67    | V2 map data sharing              |
| `src/contexts/SearchMapUIContext.tsx`      | 144   | Map UI state, "View on map" flow |

### 33.6 API Routes

| File                                | Purpose         |
| ----------------------------------- | --------------- |
| `src/app/api/listings/route.ts`     | Listings search |
| `src/app/api/map-listings/route.ts` | Map markers     |
| `src/app/api/nearby/route.ts`       | POI search      |

---

## 34. CSS Class Reference

### 34.1 Layout Classes

```css
/* Container */
.px-4.sm:px-6.py-4.sm:py-6.max-w-[840px].mx-auto.pb-24.md:pb-6

/* Grid */
.grid.grid-cols-1.sm:grid-cols-2.gap-4.sm:gap-x-6.sm:gap-y-8

/* Split view */
.flex.flex-1.overflow-hidden
.w-1/2  /* With map */
.w-full /* Without map */
```

### 34.2 Card Classes

```css
/* Container */
.bg-white.dark:bg-zinc-900.rounded-xl.overflow-hidden
.border.border-zinc-200/60.dark:border-zinc-800
.hover:-translate-y-0.5.hover:shadow-lg.transition-all

/* Image */
.aspect-[4/3].overflow-hidden.bg-zinc-100.dark:bg-zinc-800

/* Title */
.font-semibold.text-sm.text-zinc-900.dark:text-white.line-clamp-1

/* Price */
.font-bold.text-xl.text-zinc-900.dark:text-white
```

### 34.3 Filter Classes

```css
/* Drawer backdrop */
.fixed.inset-0.bg-black/50.z-40

/* Drawer panel */
.absolute.inset-y-0.right-0.w-full.sm:w-[500px]
.bg-white.dark:bg-zinc-900.shadow-lg.border-l

/* Toggle button active */
.bg-zinc-900.dark:bg-white.text-white.dark:text-zinc-900

/* Toggle button inactive */
.bg-white.dark:bg-zinc-800.text-zinc-700.dark:text-zinc-300
.border.border-zinc-200.dark:border-zinc-700
```

### 34.4 Map Classes

```css
/* Map container */
.w-full.h-full

/* Marker */
.px-3.py-1.5.rounded-full.font-semibold.text-sm.shadow-lg.cursor-pointer
.bg-white.dark:bg-zinc-800.text-zinc-900.dark:text-white

/* Banner (map variant) */
.absolute.top-16.left-1/2.-translate-x-1/2.z-10

/* Banner (list variant) */
.bg-amber-50.dark:bg-amber-950/30.border-b.border-amber-200.dark:border-amber-800
```

---

## 35. Constants & Configuration

### 35.1 Pagination

```typescript
const ITEMS_PER_PAGE = 12;
const MAX_SAFE_PAGE = 100;
const HYBRID_COUNT_THRESHOLD = 100;
```

### 35.2 Filters

```typescript
const MAX_SAFE_PRICE = 1_000_000_000;
const MAX_ARRAY_ITEMS = 20;
const MAX_QUERY_LENGTH = 200;
const MIN_QUERY_LENGTH = 2;
```

### 35.3 Map

```typescript
const CLUSTER_THRESHOLD = 50;
const COORD_PRECISION = 5; // ~1.1m at equator
const BOUNDS_EPSILON = 0.001; // ~100m
const MAP_DEBOUNCE_MS = 500;
const MAP_THROTTLE_MS = 2000;
```

### 35.4 Search

```typescript
const SEARCH_DEBOUNCE_MS = 300;
const LOCATION_DEBOUNCE_MS = 350;
const SLOW_TRANSITION_THRESHOLD_MS = 6000;
```

### 35.5 Caching

```typescript
const CACHE_TTL = 60; // seconds
const CDN_S_MAX_AGE = 60;
const CDN_MAX_AGE = 30;
const CDN_STALE_WHILE_REVALIDATE = 120;
```

---

## 36. Search API v2 Integration (Unified List + Map)

### 36.1 Overview

Search API v2 provides a **unified response** that returns both list results and map data in a single payload. This eliminates the need for separate API calls and ensures data consistency between the list and map views.

**Key Benefits:**

- Single server request for list + map data
- Guaranteed consistency (same filter results)
- Reduced network latency
- Server-side GeoJSON generation (no client-side transformation)
- Pre-computed pins for sparse mode (< 50 results)

### 36.2 Feature Flag Strategy

| Condition                                     | Behavior                |
| --------------------------------------------- | ----------------------- |
| `ENABLE_SEARCH_V2=false` AND no `?searchV2=1` | v1 path (unchanged)     |
| `ENABLE_SEARCH_V2=true` OR `?searchV2=1`      | v2 path (unified fetch) |

**Flag Location:** `src/lib/env.ts` (`features.searchV2` → `ENABLE_SEARCH_V2` env var)

**Detection Logic (page.tsx):**

```typescript
const useV2 = features.searchV2 || rawParams.searchV2 === "1";
```

### 36.3 Architecture Challenge: Sibling Components

The core challenge is passing v2 map data from `page.tsx` to `PersistentMapWrapper`, which are **siblings** in the render tree (not parent-child):

```
/search/layout.tsx (RSC)
├─ <SearchV2DataProvider> (Context wrapper)
│
└─ SearchLayoutView.tsx (Client)
    ├─ {children} (page.tsx output = list + V2MapDataSetter)
    └─ <PersistentMapWrapper /> (SIBLING - needs map data)
```

**Solution:** React Context with setter injection pattern.

### 36.4 SearchV2DataContext

**File:** `src/contexts/SearchV2DataContext.tsx`
**Lines:** ~80

**Purpose:** Bridge v2 map data from page.tsx to PersistentMapWrapper (siblings).

```typescript
export interface V2MapData {
  geojson: SearchV2GeoJSON;
  pins?: SearchV2Pin[];
  mode: SearchV2Mode;
}

interface SearchV2DataContextValue {
  v2MapData: V2MapData | null;
  setV2MapData: (data: V2MapData | null) => void;
  /** True when v2 mode is active (for race condition guard) */
  isV2Enabled: boolean;
  setIsV2Enabled: (enabled: boolean) => void;
}
```

**Provider Location:** Wrapped around `SearchLayoutView` in `layout.tsx`

### 36.5 V2MapDataSetter Component

**File:** `src/components/search/V2MapDataSetter.tsx`
**Lines:** ~35

**Purpose:** Client component that injects v2 map data into context on mount.

```typescript
export function V2MapDataSetter({ data }: { data: V2MapData }) {
  const { setV2MapData, setIsV2Enabled } = useSearchV2Data();

  useEffect(() => {
    // Signal v2 mode FIRST so PersistentMapWrapper knows to wait
    setIsV2Enabled(true);
    setV2MapData(data);
    return () => {
      setV2MapData(null);
      setIsV2Enabled(false);
    };
  }, [data, setV2MapData, setIsV2Enabled]);

  return null; // Renders nothing, just sets context
}
```

**Usage in page.tsx:**

```tsx
return (
  <div className="flex flex-col">
    {/* Inject v2 map data into context (renders nothing) */}
    {v2MapData && <V2MapDataSetter data={v2MapData} />}

    {/* Rest of list rendering... */}
  </div>
);
```

### 36.6 Search V2 Service (Server-Side)

**File:** `src/lib/search/search-v2-service.ts`
**Lines:** ~120

**Purpose:** Shared server function for v2 search. Called directly by both `page.tsx` and `/api/search/v2/route.ts` (no HTTP self-fetch overhead).

```typescript
export interface SearchV2Result {
  response: SearchV2Response | null;
  /** Full ListingData for ListingCard rendering (v2 list.items is simplified) */
  paginatedResult: PaginatedResultHybrid<ListingData> | null;
  error?: string;
}

export async function executeSearchV2(params: {
  rawParams: Record<string, string>;
  limit?: number;
}): Promise<SearchV2Result>;
```

**Key Design:**

- Returns both `SearchV2Response` (unified API format) AND `paginatedResult` (full ListingData)
- Full ListingData needed for ListingCard rendering (v2 list.items is a simplified subset)
- Handles errors gracefully, returns null to enable v1 fallback

### 36.7 Race Guard Pattern

**Problem:** When page.tsx renders, the `V2MapDataSetter` effect runs asynchronously. Meanwhile, `PersistentMapWrapper` might start its v1 fetch before the v2 data arrives.

**Solution:** Two-phase signaling with race guard:

```typescript
// PersistentMapWrapper.tsx
const { v2MapData, isV2Enabled } = useSearchV2Data();
const hasV2Data = v2MapData !== null;

useEffect(() => {
  if (!shouldRenderMap) return;

  // RACE GUARD: If v2 mode is signaled but data hasn't arrived yet,
  // delay the v1 fetch to give the setter time to run.
  if (isV2Enabled && !hasV2Data) {
    const raceGuardTimeout = setTimeout(() => {
      // After delay, if still no v2 data, fall back to v1
    }, 100); // 100ms is enough for React to flush the setter
    return () => clearTimeout(raceGuardTimeout);
  }

  // Skip fetch if v2 data is provided
  if (hasV2Data) return;

  // ... existing v1 fetch logic ...
}, [searchParams, fetchListings, shouldRenderMap, isV2Enabled, hasV2Data]);
```

**Visual State During Race Guard:**

```tsx
// Show loading placeholder while waiting for v2 data (not empty map)
if (isV2Enabled && !hasV2Data) {
  return (
    <div className="relative h-full">
      <MapLoadingPlaceholder />
    </div>
  );
}
```

### 36.8 Map.tsx V2 Data Handling

**File:** `src/components/Map.tsx`
**Changes:** Accept v2MapData prop, normalize data sources with `effectiveListings` memo

```typescript
interface MapComponentProps {
  listings?: MapListingData[]; // Optional when v2MapData provided
  v2MapData?: V2MapData | null;
}
```

**Data Normalization Pattern:**

```typescript
// Normalize v2 GeoJSON features to MapListingData format
const effectiveListings = useMemo<MapListingData[]>(() => {
  if (v2MapData?.geojson) {
    return v2MapData.geojson.features
      .filter((f) => f.geometry.type === "Point")
      .map((f) => ({
        id: f.properties.id,
        title: f.properties.title || "",
        price: f.properties.price ?? 0,
        availableSlots: f.properties.availableSlots ?? 1,
        location: {
          lat: f.geometry.coordinates[1], // GeoJSON: [lng, lat]
          lng: f.geometry.coordinates[0],
        },
        ownerId: f.properties.ownerId,
        images: f.properties.images,
      }));
  }
  return listings ?? [];
}, [v2MapData, listings]);
```

This pattern allows all existing Map.tsx logic to work unchanged by referencing `effectiveListings` instead of `listings`.

### 36.9 Data Flow Comparison

#### V1 Path (flag off)

```
page.tsx → getListingsPaginated() → renders list
                                            │
                                     {children} in layout
                                            │
PersistentMapWrapper ─────────────────────────────────────────┐
        │                                                     │
        └── /api/map-listings fetch ──→ listings[] ──→ Map.tsx
                                            │
                                     geojson (client-side)
```

#### V2 Path (flag on OR `?searchV2=1`)

```
page.tsx → executeSearchV2() [direct server function, no HTTP]
        │
        ├── paginatedResult.items → renders ListingCards (full data)
        │
        └── v2MapData → <V2MapDataSetter data={...}/> → context.setV2MapData()
                                                              │
                                                    setIsV2Enabled(true)
                                                              │
PersistentMapWrapper ─────────────────────────────────────────┤
        │                                                     │
        └── Reads v2MapData from context ──→ skips /api/map-listings fetch
                                                              │
                                                    passes v2MapData to Map.tsx
                                                              │
                                              Map.tsx uses geojson directly
                                              + pins for sparse mode markers
```

### 36.10 V2 Response Structure

```typescript
interface SearchV2Response {
  meta: {
    queryHash: string; // 16-char hash for cache invalidation
    generatedAt: string; // ISO timestamp
    mode: "geojson" | "pins"; // Clustering mode
  };
  list: {
    items: SearchV2ListItem[]; // Simplified list items
    nextCursor: string | null;
    total: number | null; // null if >100
  };
  map: {
    geojson: GeoJSON.FeatureCollection; // Always present
    pins?: SearchV2Pin[]; // Only in "pins" mode (<50 results)
  };
}
```

### 36.11 Mode Determination

| Result Count | Mode        | GeoJSON | Pins | Map Behavior         |
| ------------ | ----------- | ------- | ---- | -------------------- |
| ≥ 50         | `"geojson"` | ✅      | ❌   | Mapbox clustering    |
| < 50         | `"pins"`    | ✅      | ✅   | Tiered price markers |

### 36.12 Fallback Strategy

If v2 fails at any point, the system falls back to v1:

```typescript
// page.tsx
if (useV2) {
  const v2Result = await executeSearchV2({...});
  if (v2Result.response && v2Result.paginatedResult) {
    // Use v2 data
    v2MapData = {...};
    paginatedResult = v2Result.paginatedResult;
  } else {
    // V2 failed, fetchError captured
    fetchError = v2Result.error || null;
  }
}

// V1 fallback (or when v2 fails)
if (!paginatedResult) {
  paginatedResult = await getListingsPaginated({...});
}
```

### 36.13 Files Added/Modified for V2

| File                                        | Status   | Purpose                             |
| ------------------------------------------- | -------- | ----------------------------------- |
| `src/contexts/SearchV2DataContext.tsx`      | **NEW**  | Context for v2 map data bridging    |
| `src/components/search/V2MapDataSetter.tsx` | **NEW**  | Client component to inject data     |
| `src/lib/search/search-v2-service.ts`       | **NEW**  | Shared server function              |
| `src/lib/search/types.ts`                   | **NEW**  | V2 type definitions                 |
| `src/lib/search/transform.ts`               | **NEW**  | Data transformation utilities       |
| `src/app/api/search/v2/route.ts`            | **NEW**  | V2 API endpoint                     |
| `src/app/search/layout.tsx`                 | Modified | Add SearchV2DataProvider            |
| `src/app/search/page.tsx`                   | Modified | V2 detection + service call         |
| `src/components/PersistentMapWrapper.tsx`   | Modified | Read from context, race guard       |
| `src/components/DynamicMap.tsx`             | Modified | Forward v2MapData prop              |
| `src/components/Map.tsx`                    | Modified | Accept v2MapData, effectiveListings |

### 36.14 E2E Tests for V2

**File:** `tests/e2e/journeys/search-v2-api.spec.ts`

| Test                 | Description                                                |
| -------------------- | ---------------------------------------------------------- |
| Feature flag gating  | 404 without flag, 200 with `?v2=1` or `?v2=true`           |
| Response structure   | Validates meta, list, map objects and properties           |
| Mode determination   | GeoJSON always present, pins only in pins mode             |
| Query hash stability | Same params → same hash, different params → different hash |
| Pagination           | nextCursor, cursor-based navigation                        |
| Filter integration   | Price and bounds filters work correctly                    |
| Page integration     | `/search?searchV2=1` renders list and map                  |
| V1/V2 consistency    | Same result counts between v1 and v2                       |

### 36.15 State Flow Diagram (V2)

```
URL contains ?searchV2=1
    │
    ▼
page.tsx detects useV2 = true
    │
    ▼
executeSearchV2() [server-side, no HTTP]
    │
    ├── Parallel: getListingsPaginated() + getMapListings()
    │
    ├── Transform to SearchV2Response
    │
    └── Return { response, paginatedResult }
            │
            ▼
page.tsx renders:
    ├── <V2MapDataSetter data={v2MapData} />  ──┐
    │                                           │
    └── ListingCards (from paginatedResult)     │
                                                │
V2MapDataSetter useEffect fires:               │
    ├── setIsV2Enabled(true)  ─────────────────┤
    └── setV2MapData(data)    ─────────────────┤
                                                │
            ┌───────────────────────────────────┘
            │
            ▼
PersistentMapWrapper reads context:
    │
    ├── isV2Enabled = true
    ├── v2MapData = { geojson, pins, mode }
    │
    └── Skips /api/map-listings fetch
            │
            ▼
<LazyDynamicMap v2MapData={v2MapData} />
            │
            ▼
Map.tsx:
    ├── effectiveListings = normalize(v2MapData.geojson)
    ├── Use geojson directly for clustering
    └── Use v2MapData.pins for sparse mode markers
```

---

_This document was generated through ultrathink analysis of the Roomshare codebase._
_Version 4.0 includes Search API v2 unified list + map integration documentation._
