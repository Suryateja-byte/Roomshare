# Listing Display Components & Actions

Comprehensive reference for all components, types, and server actions involved in displaying and interacting with listings on the Roomshare search page and related surfaces.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Type Definitions](#type-definitions)
  - [ListingData](#listingdata)
  - [PublicListing](#publiclisting)
  - [PublicMapListing](#publicmaplisting)
  - [Pagination Types](#pagination-types)
  - [Cache Safety](#cache-safety)
- [Search Results Components](#search-results-components)
  - [SearchResultsClient](#searchresultsclient)
  - [SearchResultsLoadingWrapper](#searchresultsloadingwrapper)
  - [SplitStayCard](#splitstaycard)
  - [TotalPriceToggle](#totalpricetoggle)
  - [SuggestedSearches](#suggestedsearches)
  - [ZeroResultsSuggestions](#zeroresultssuggestions)
- [Core Display Components](#core-display-components)
  - [ListingCard](#listingcard)
  - [FavoriteButton](#favoritebutton)
  - [TrustBadge](#trustbadge)
  - [NearMatchSeparator](#nearmatchseparator)
  - [ImageCarousel (Embla)](#imagecarousel-embla)
  - [ListingCardCarousel (CSS Scroll-Snap)](#listingcardcarousel-css-scroll-snap)
  - [ListingCardSkeleton](#listingcardskeleton)
  - [ImageUploader](#imageuploader)
- [Action Buttons](#action-buttons)
  - [SaveListingButton](#savelistingbutton)
  - [ShareListingButton](#sharelistingbutton)
  - [ListingStatusToggle](#listingstatustoggle)
- [Freshness & Realtime](#freshness--realtime)
  - [ListingFreshnessCheck](#listingfreshnesscheck)
- [Featured Listings](#featured-listings)
  - [FeaturedListings (Server)](#featuredlistings-server)
  - [FeaturedListingsClient](#featuredlistingsclient)
- [Server Actions](#server-actions)
  - [fetchMoreListings](#fetchmorelistings)
  - [get-listings (Map Bounds Query)](#get-listings-map-bounds-query)
  - [saved-listings](#saved-listings)
  - [listing-status](#listing-status)
- [Split Stay Logic](#split-stay-logic)
- [Content Moderation](#content-moderation)
  - [Listing Language Guard](#listing-language-guard)

---

## Architecture Overview

```
Search Page
 |
 +-- SearchResultsLoadingWrapper (loading state overlay)
 |    +-- SearchResultsClient (main results container)
 |         +-- ListingCard (per result)
 |         |    +-- ImageCarousel (Embla-based, touch/swipe)
 |         |    +-- FavoriteButton (heart icon overlay)
 |         |    +-- MapPin button (show on map)
 |         |    +-- TrustBadge (Guest Favorite badge)
 |         |    +-- Amenity pills, language tags, price
 |         |
 |         +-- NearMatchSeparator (divider for near-match listings)
 |         +-- SplitStayCard (pairs for long stays, 6+ months)
 |         +-- TotalPriceToggle (price display mode)
 |         +-- ZeroResultsSuggestions (filter adjustment hints)
 |         +-- SuggestedSearches (browse mode, recent/popular areas)
 |
 +-- ListingCardSkeleton (loading placeholder)
 |
 +-- SaveListingButton (detail page, full button)
 +-- ShareListingButton (detail page, share dropdown/native)
 +-- ListingStatusToggle (owner dashboard)
 +-- ListingFreshnessCheck (detail page, polling banner)
 |
 +-- ImageUploader (create/edit listing forms)
 |
 +-- FeaturedListings (homepage server component)
      +-- FeaturedListingsClient (animated grid)

Server Actions:
  actions.ts           -> fetchMoreListings() (cursor-based pagination)
  get-listings.ts      -> getListingsInBounds() (PostGIS spatial query)
  saved-listings.ts    -> toggleSaveListing(), isListingSaved(), getSavedListings(), removeSavedListing()
  listing-status.ts    -> updateListingStatus(), incrementViewCount(), trackListingView(), getRecentlyViewed()

Content Guard:
  listing-language-guard.ts -> checkListingLanguageCompliance()

Split Stay Logic:
  split-stay.ts        -> findSplitStays() (complementary listing pairs)
```

---

## Type Definitions

### ListingData

**File**: `/mnt/d/Documents/roomshare/src/lib/data.ts` (lines 45-73)

Primary listing data transfer object used throughout search results.

```ts
export interface ListingData {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  availableSlots: number;
  totalSlots: number;
  amenities: string[];
  houseRules: string[];
  householdLanguages: string[];
  primaryHomeLanguage?: string;
  genderPreference?: string;
  householdGender?: string;
  leaseDuration?: string;
  roomType?: string;
  moveInDate?: Date;
  ownerId?: string;
  location: {
    address?: string; // Optional - only included in listing detail, not search
    city: string;
    state: string;
    zip?: string; // Optional - only included in listing detail, not search
    lat: number;
    lng: number;
  };
  // Near-match indicator for search results that partially match filters
  isNearMatch?: boolean;
}
```

### PublicListing

**File**: `/mnt/d/Documents/roomshare/src/types/listing.ts`

Cache-safe listing data transfer object. Contains **no user-specific data** so it can be stored in shared caches (unstable_cache, CDN).

```ts
export interface PublicListing {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  availableSlots: number;
  totalSlots: number;
  amenities: string[];
  houseRules: string[];
  householdLanguages: string[];
  primaryHomeLanguage?: string;
  leaseDuration?: string;
  roomType?: string;
  moveInDate?: Date;
  ownerId?: string;
  location: {
    address: string;
    city: string;
    state: string;
    zip: string;
    lat: number;
    lng: number;
  };
}
```

### PublicMapListing

Minimal listing data for map markers. Also cache-safe.

```ts
export interface PublicMapListing {
  id: string;
  title: string;
  price: number;
  availableSlots: number;
  ownerId?: string;
  images: string[];
  location: {
    lat: number;
    lng: number;
  };
}
```

### Cache Safety

The module exports a blocklist of fields that must **never** appear in cached responses:

```ts
export const USER_SPECIFIC_FIELDS = [
  "isSaved", "viewedAt", "messageThread", "bookingStatus",
  "savedAt", "userNotes", "privateHostContact", "viewerSpecificRanking",
] as const;
```

**Runtime guards**:

| Function | Purpose |
|----------|---------|
| `isPublicListingSafe(obj)` | Type guard -- returns `true` if no user-specific fields present |
| `assertPublicListing(listing)` | Throws if user-specific fields detected (use at cache write boundaries) |
| `assertPublicListings(listings)` | Array variant with per-index error messages |

### Pagination Types

**File**: `/mnt/d/Documents/roomshare/src/types/pagination.ts`

Hybrid keyset/offset pagination system.

**Sort categories**:

| Category | Sorts | Pagination Method | Benefit |
|----------|-------|-------------------|---------|
| Keyset-eligible | `newest`, `price_asc`, `price_desc` | Cursor-based | No duplicates, no OFFSET degradation |
| Offset-required | `recommended`, `rating` | Page number | Required for computed/aggregate sorts |

**Cursor encoding**: Base64url-encoded JSON (`{ sortValue, id, sort }`). URL-safe with no padding characters.

**Key types**:

```ts
interface KeysetCursor { sortValue: number | string; id: string; sort: KeysetSort; }
interface KeysetPaginatedResult<T> { items: T[]; nextCursor: string | null; hasNextPage: boolean; hasPrevPage?: boolean; sort: KeysetSort; limit: number; }
interface OffsetPaginatedResult<T> { items: T[]; total: number | null; totalPages: number | null; hasNextPage: boolean; hasPrevPage: boolean; page: number; limit: number; sort: OffsetSort; }
```

**Helper functions**: `isKeysetEligible()`, `encodeCursor()`, `decodeCursor()`, `createCursorFromItem()`, `isKeysetResult()`, `isOffsetResult()`.

---

## Search Results Components

### SearchResultsClient

**File**: `/mnt/d/Documents/roomshare/src/components/search/SearchResultsClient.tsx`

Main search results container component with cursor-based infinite scroll pagination and deduplication logic.

#### Props

```ts
interface SearchResultsClientProps {
  initialListings: ListingData[];
  initialNextCursor: string | null;
  initialTotal: number | null;
  savedListingIds: string[];
  /** Serialized search params for the /api/search/v2 fetch (filters + sort, no cursor/page) */
  searchParamsString: string;
  query: string;
  browseMode: boolean;
  hasConfirmedZeroResults: boolean;
  filterSuggestions: FilterSuggestion[];
  sortOption: string;
}
```

#### Key Constants

```ts
const MAX_ACCUMULATED = 60; // Maximum listings before showing "refine filters" message
const ITEMS_PER_PAGE = 12;  // Server-side page size (in actions.ts)
```

#### State Management (lines 48-64)

| State | Type | Purpose |
|-------|------|---------|
| `extraListings` | `ListingData[]` | Listings loaded via "Load more" button |
| `nextCursor` | `string \| null` | Cursor for next page fetch |
| `isLoadingMore` | `boolean` | Loading indicator state |
| `loadError` | `string \| null` | Error message from failed fetch |
| `showTotalPrice` | `boolean` | Price display mode (persisted to sessionStorage) |
| `seenIdsRef` | `Set<string>` | Ref for deduplication across all loads |

#### Cursor Reset Invariant

The component is **keyed by `searchParamsString`** at the parent level. Any filter/sort/query change remounts the component, which:

1. Resets `extraListings` to `[]`
2. Resets `seenIdsRef` to only contain `initialListings` IDs
3. Resets `nextCursor` to `initialNextCursor`

This ensures no stale listings persist across filter changes.

#### Deduplication Logic (lines 62-64, 125-129)

```ts
// Initialization: track all SSR listing IDs
const seenIdsRef = useRef<Set<string>>(
  new Set(initialListings.map((l) => l.id)),
);

// On load more: filter out already-seen IDs before appending
const dedupedItems = result.items.filter((item) => {
  if (seenIdsRef.current.has(item.id)) return false;
  seenIdsRef.current.add(item.id);
  return true;
});

setExtraListings((prev) => [...prev, ...dedupedItems]);
```

**Why this matters**: Prevents duplicate listings when:
- Real-time inventory changes occur between page loads
- Race conditions with concurrent fetches
- Sort order instability with equal-value records

#### Estimated Months Calculation (lines 70-87)

Used for total price display and split-stay suggestions:

```ts
const estimatedMonths = useMemo(() => {
  const sp = new URLSearchParams(searchParamsString);
  const moveIn = sp.get('moveInDate');
  const moveOut = sp.get('moveOutDate');

  // Priority 1: Calculate from date range
  if (moveIn && moveOut) {
    const start = new Date(moveIn);
    const end = new Date(moveOut);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
      const diffMs = end.getTime() - start.getTime();
      const months = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44)));
      return months;
    }
  }

  // Priority 2: Parse leaseDuration filter
  const ld = sp.get('leaseDuration');
  if (!ld) return 1;
  const match = ld.match(/^(\d+)\s+months?$/i);
  return match ? parseInt(match[1], 10) : 1;
}, [searchParamsString]);
```

#### Load More Handler (lines 112-140)

```ts
const handleLoadMore = useCallback(async () => {
  if (!nextCursor || isLoadingMore) return;

  setIsLoadingMore(true);
  setLoadError(null);
  performance.mark('load-more-start');

  try {
    const result = await fetchMoreListings(nextCursor, rawParamsRef.current!);
    performance.mark('load-more-end');
    performance.measure('load-more', 'load-more-start', 'load-more-end');

    // Deduplicate by ID
    const dedupedItems = result.items.filter((item) => {
      if (seenIdsRef.current.has(item.id)) return false;
      seenIdsRef.current.add(item.id);
      return true;
    });

    setExtraListings((prev) => [...prev, ...dedupedItems]);
    setNextCursor(result.nextCursor);
  } catch (err) {
    setLoadError(
      err instanceof Error ? err.message : "Failed to load more results",
    );
  } finally {
    setIsLoadingMore(false);
  }
}, [nextCursor, isLoadingMore]);
```

#### UI States

| Condition | Rendered UI |
|-----------|-------------|
| `hasConfirmedZeroResults` | Empty state with ZeroResultsSuggestions |
| `browseMode && !query` | SuggestedSearches component |
| `allListings.length > 0` | Result count header + TotalPriceToggle |
| `splitStayPairs.length > 0` | Split stay suggestion cards |
| `nextCursor && !reachedCap` | "Show more places" button |
| `reachedCap && nextCursor` | "Showing N results. Refine your filters" message |
| `loadError` | Error message with retry button |
| `!nextCursor && extraListings.length > 0` | "You've seen all N results" message |

#### Accessibility

- Container has `id="search-results"` and `tabIndex={-1}` for focus management
- `aria-live="polite"` region announces result count changes to screen readers
- Grid has `role="feed"` with `aria-label="Search results"`
- Load more button has comprehensive `aria-label` with current/total count

---

### SearchResultsLoadingWrapper

**File**: `/mnt/d/Documents/roomshare/src/components/search/SearchResultsLoadingWrapper.tsx`

Wraps search results to show loading state during filter transitions without jarring content flash.

#### Props

```ts
interface SearchResultsLoadingWrapperProps {
  children: React.ReactNode;
}
```

#### Behavior

| Feature | Implementation |
|---------|---------------|
| Loading detection | Uses `useSearchTransitionSafe()` context for `isPending` and `isSlowTransition` |
| Content visibility | Children always rendered (no conditional mount/unmount) |
| Visual feedback | Translucent overlay (`bg-white/40`) dims content during loading |
| Loading indicator | Floating pill with spinner + "Updating results..." / "Still loading..." text |
| Focus management | Focuses `#search-results-heading` when search params change (skips initial mount) |
| SR announcements | `aria-live="polite"` region announces result count when transition completes |

#### Loading Indicator States (lines 75-77)

```ts
<span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
  {isSlowTransition ? "Still loading..." : "Updating results..."}
</span>
```

#### Accessibility

- Container has `aria-busy={isPending}` attribute
- Screen reader announcement via `aria-live="polite"` region
- Loading overlay is `aria-hidden="true"`
- Content remains in DOM for automation/accessibility tools

---

### SplitStayCard

**File**: `/mnt/d/Documents/roomshare/src/components/search/SplitStayCard.tsx`

Shows two listings side-by-side for split-stay trips when a single listing can't cover the full requested duration (6+ months).

#### Props

```ts
interface SplitStayCardProps {
  pair: SplitStayPair;
}
```

#### SplitStayPair Interface

**File**: `/mnt/d/Documents/roomshare/src/lib/search/split-stay.ts` (lines 3-10)

```ts
export interface SplitStayPair {
  first: ListingData;
  second: ListingData;
  /** Total combined price for the full stay */
  combinedPrice: number;
  /** Label like "3 mo + 3 mo" */
  splitLabel: string;
}
```

#### Layout Structure

```
+------------------------------------------+
| Header: "Split Stay · 3 mo + 3 mo"       |
+------------------------------------------+
| [First stay]     |  [Then]               |
| [image]          |  [image]              |
| Title            |  Title                |
| $X,XXX/mo        |  $X,XXX/mo            |
+------------------------------------------+
|      (connecting arc SVG)                |
+------------------------------------------+
| Combined total           $X,XXX          |
+------------------------------------------+
```

#### SplitStayHalf Subcomponent (lines 53-72)

Internal component rendering each half of the split stay:

```ts
function SplitStayHalf({ listing, label }: { listing: SplitStayPair['first']; label: string }) {
  const image = listing.images?.[0];

  return (
    <Link href={`/listings/${listing.id}`} className="block p-3 hover:bg-zinc-50 ...">
      <p className="text-2xs ...">{label}</p>
      {image && (
        <div className="relative aspect-[4/3] rounded-lg overflow-hidden mb-2">
          <Image src={image} alt={listing.title} fill className="object-cover" sizes="(max-width: 640px) 50vw, 25vw" />
        </div>
      )}
      <h4 className="text-sm font-medium ... line-clamp-1">{listing.title}</h4>
      <p className="text-xs ...">${listing.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}/mo</p>
    </Link>
  );
}
```

---

### TotalPriceToggle

**File**: `/mnt/d/Documents/roomshare/src/components/search/TotalPriceToggle.tsx`

Switch between monthly and total price display in search results header.

#### Props

```ts
interface TotalPriceToggleProps {
  showTotal: boolean;
  onToggle: (showTotal: boolean) => void;
}
```

#### Behavior (lines 14-54)

- Renders as a compact toggle switch with "Show total price" label
- Persists preference to `sessionStorage` (survives page refreshes within session)
- Gracefully handles sessionStorage unavailability (SSR, private browsing)

#### Accessibility

- Uses `role="switch"` with `aria-checked` attribute
- `focus-visible:ring-2` for keyboard focus indication

---

### SuggestedSearches

**File**: `/mnt/d/Documents/roomshare/src/components/search/SuggestedSearches.tsx`

Shows suggested searches when there's no active query (browse mode).

#### Behavior (lines 26-76)

| Condition | Rendered UI |
|-----------|-------------|
| `recentSearches.length > 0` | Recent searches with Clock icon |
| No recent searches | Popular areas with TrendingUp icon |

#### Popular Areas (hardcoded MVP)

```ts
const POPULAR_AREAS = [
  { label: "Austin, TX", q: "Austin, TX" },
  { label: "San Francisco, CA", q: "San Francisco, CA" },
  { label: "New York, NY", q: "New York, NY" },
  { label: "Los Angeles, CA", q: "Los Angeles, CA" },
  { label: "Chicago, IL", q: "Chicago, IL" },
  { label: "Seattle, WA", q: "Seattle, WA" },
  { label: "Denver, CO", q: "Denver, CO" },
  { label: "Portland, OR", q: "Portland, OR" },
];
```

#### Integration

Uses `useRecentSearches()` hook to retrieve user's recent search history.

---

### ZeroResultsSuggestions

**File**: `/mnt/d/Documents/roomshare/src/components/ZeroResultsSuggestions.tsx`

Provides actionable filter adjustment suggestions when search returns zero results.

#### Props

```ts
interface ZeroResultsSuggestionsProps {
  suggestions: FilterSuggestion[];
  query?: string;
}
```

#### FilterSuggestion Interface

**File**: `/mnt/d/Documents/roomshare/src/lib/data.ts`

```ts
export interface FilterSuggestion {
  filter: string;       // Filter key to remove (e.g., 'maxPrice', 'amenities')
  label: string;        // Human-readable label for the filter
  suggestion: string;   // Actionable suggestion text
}
```

#### Filter Removal Logic (lines 27-63)

Handles removal of specific filter types:

| Filter | URL Params Removed |
|--------|-------------------|
| `maxPrice` | `maxPrice` |
| `minPrice` | `minPrice` |
| `amenities` | `amenities` |
| `houseRules` | `houseRules` |
| `roomType` | `roomType` |
| `leaseDuration` | `leaseDuration` |
| `location` | `lat`, `lng`, `minLat`, `maxLat`, `minLng`, `maxLng` |

#### UI States

| Condition | Rendered UI |
|-----------|-------------|
| `suggestions.length === 0` | Generic empty state with "Clear filters" and "Browse all" buttons |
| `suggestions.length > 0` | List of removable filter suggestions (max 3 shown) |

#### Nearby Area Suggestions

Fallback suggestions shown when location-specific ones aren't available:

```ts
const NEARBY_SUGGESTIONS: Record<string, string[]> = {
  _default: ['Austin, TX', 'San Francisco, CA', 'New York, NY', 'Los Angeles, CA'],
};
```

---

## Core Display Components

### ListingCard

**File**: `/mnt/d/Documents/roomshare/src/components/listings/ListingCard.tsx`

Primary listing display component used in search results and featured listings grids.

#### Props (lines 85-95)

```ts
interface ListingCardProps {
  listing: Listing;
  isSaved?: boolean;
  className?: string;
  /** Priority loading for LCP optimization -- use for above-fold images */
  priority?: boolean;
  /** When true, show total price (price × estimatedMonths) instead of per-month */
  showTotalPrice?: boolean;
  /** Number of months for total price calculation */
  estimatedMonths?: number;
}
```

#### Listing Interface (lines 13-28)

```ts
export interface Listing {
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
```

#### Rendering Logic

The card renders the following sections top-to-bottom:

1. **Overlay buttons** (top-right, z-20): MapPin "Show on map" button + FavoriteButton
2. **Image area** (aspect 16:10 mobile, 4:3 desktop):
   - `ImageCarousel` component for swiping through photos
   - "No Photos" placeholder overlay when no valid images exist
   - Top-left badge stack: Available/Filled status + TrustBadge
3. **Content area** (min-height 156px to prevent CLS):
   - Title (line-clamped to 1 line) + rating star or "New" label
   - Location (city, state abbreviation)
   - Up to 3 amenity pills
   - Up to 2 household language tags (with "+N" overflow)
   - Price row pushed to bottom via `mt-auto`

#### Price Display Modes (lines 272-284)

```ts
{showTotalPrice && estimatedMonths > 1 ? (
  <>
    <span className="font-bold text-xl ...">{formatPrice(listing.price * estimatedMonths)}</span>
    <span className="text-zinc-400 ... text-sm ml-0.5">total</span>
    <span className="text-zinc-400 ... text-xs ml-1.5">({formatPrice(listing.price)}/mo × {estimatedMonths})</span>
  </>
) : (
  <>
    <span className="font-bold text-xl ...">{formatPrice(listing.price)}</span>
    {listing.price > 0 && <span className="text-zinc-400 ... text-sm ml-0.5">/mo</span>}
  </>
)}
```

#### Location Formatting (lines 45-63)

The `formatLocation()` function prevents redundancy like "Irving, TX, TX" by:
1. Converting full state names to 2-letter abbreviations via a lookup map
2. Stripping trailing state abbreviations from city strings that already contain them

#### Image Fallback Strategy (lines 66-73, 112-115)

When a listing has no images or all images error out:
1. A deterministic placeholder is selected from 6 Unsplash URLs using a hash of the listing ID
2. A "No Photos" overlay is rendered on top with a Home icon

```ts
const placeholderIndex = listing.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % PLACEHOLDER_IMAGES.length;
const displayImages = hasValidImages ? validImages : [PLACEHOLDER_IMAGES[placeholderIndex]];
```

#### Map Focus Integration (lines 100-101, 145-154)

```ts
const { setHovered, setActive, focusSource } = useListingFocus();
const { isHovered, isActive } = useIsListingFocused(listing.id);
```

- **Hover**: `onMouseEnter`/`onFocus` sets hovered state (skipped if `focusSource === "map"`)
- **Active**: MapPin button click calls `setActive(listing.id)` to pan the map
- **Visual feedback**: Active = blue ring-2; Hovered = shadow-md + subtle ring

#### Drag Prevention (lines 99, 180-184)

When the user is swiping the image carousel, `isDragging` state is set to `true`. The parent `<Link>` gets `onClick={e => e.preventDefault()}` and `pointer-events-none` to prevent accidental navigation.

#### Accessibility

- `role="article"` on the root container
- Comprehensive `aria-label` built from: price, rating (or "new listing"), available slots, location, top 3 amenities
- `focus-visible` ring on the link wrapper
- MapPin and FavoriteButton have individual `aria-label` attributes
- Title has a `title` attribute for tooltip on truncation

---

### FavoriteButton

**File**: `/mnt/d/Documents/roomshare/src/components/FavoriteButton.tsx`

Compact heart button overlay used on ListingCard for quick save/unsave functionality.

#### Props

```ts
interface FavoriteButtonProps {
  listingId: string;
  initialIsSaved?: boolean;
  className?: string;
}
```

#### State Management

| State | Type | Purpose |
|-------|------|---------|
| `isSaved` | `boolean` | Current saved state (initialized from prop) |
| `isLoading` | `boolean` | Loading indicator during toggle |
| `animating` | `boolean` | Controls bounce animation on save |

#### Toggle Flow

1. **Optimistic update**: Immediately updates UI state before API call
2. **Bounce animation**: Triggers `animate-heart-bounce` for 400ms on save
3. **API call**: `POST /api/favorites` with listingId
4. **Auth redirect**: 401 response redirects to `/login`
5. **Error recovery**: Reverts to previous state on failure
6. **Server refresh**: Calls `router.refresh()` on success

#### Accessibility

- `aria-label` changes between "Save listing" and "Remove from saved"
- `aria-pressed` indicates current state
- Minimum 44px touch target for accessibility compliance
- `focus-visible` ring for keyboard navigation

---

### TrustBadge

**File**: `/mnt/d/Documents/roomshare/src/components/ui/TrustBadge.tsx`

Displays "Guest Favorite" badge for highly-rated listings.

#### Props

```ts
interface TrustBadgeProps {
  avgRating?: number | null;
  reviewCount?: number;
}
```

#### Display Criteria

Badge only renders when **both** conditions are met:
- `avgRating >= 4.9`
- `reviewCount >= 5`

Returns `null` otherwise to prevent layout shifts.

#### Visual Design

- Gold gradient background (`from-amber-100 to-yellow-50`)
- Star SVG icon
- "Guest Favorite" text in uppercase

---

### NearMatchSeparator

**File**: `/mnt/d/Documents/roomshare/src/components/listings/NearMatchSeparator.tsx`

Visual separator between exact matches and near-match listings in search results.

#### Props

```ts
interface NearMatchSeparatorProps {
  nearMatchCount: number;
}
```

#### Behavior

- Full-width separator spanning the grid (`col-span-full`)
- Dashed amber border lines on either side
- Central badge showing count: "N near match(es)"
- Uses `AlertCircle` icon for visual indicator

#### Accessibility

- `role="separator"` for semantic meaning
- `aria-label` announces the near-match count to screen readers

---

### ImageCarousel (Embla)

**File**: `/mnt/d/Documents/roomshare/src/components/listings/ImageCarousel.tsx`

The primary image carousel used inside `ListingCard`. Built on [Embla Carousel](https://www.embla-carousel.com/) with loop mode enabled.

#### Props

```ts
interface ImageCarouselProps {
  images: string[];
  alt: string;
  priority?: boolean;
  className?: string;
  onImageError?: (index: number) => void;
  /** Called when drag/swipe state changes -- use to block parent click */
  onDragStateChange?: (isDragging: boolean) => void;
}
```

#### Behavior

| Feature | Implementation |
|---------|---------------|
| Looping | `useEmblaCarousel({ loop: true })` -- wraps around at both ends |
| Touch/swipe | Native via Embla; `[touch-action:pan-y]` allows vertical scroll while capturing horizontal |
| Arrow buttons | Appear on hover/focus; hidden via opacity + pointer-events toggle; 44px min touch target |
| Navigation dots | Max 5 visible; windowed display shifts to keep selected dot centered |
| Lazy loading | First image eager + `priority`; rest use `loading="lazy"` |
| Blur placeholder | Inline SVG base64 data URL (light gray rectangle) |
| Keyboard | ArrowLeft/ArrowRight navigate slides when focused |
| Single image | Renders a plain `<Image>` with no carousel chrome |

#### Drag State Callback

Prevents parent `<Link>` navigation during swipe:

```ts
emblaApi.on('pointerDown', () => onDragStateChange(true));
emblaApi.on('pointerUp', () => {
  setTimeout(() => onDragStateChange(false), 10);
});
```

#### Dot Windowing Algorithm

When image count exceeds `MAX_DOTS` (5):

```ts
let start = Math.max(0, selectedIndex - Math.floor(MAX_DOTS / 2));
if (start + MAX_DOTS > count) start = count - MAX_DOTS;
```

Edge dots (first and last in visible window) render smaller (`w-1 h-1 bg-white/40`) to indicate more slides exist beyond the visible range.

#### Accessibility

- `role="region"` with `aria-roledescription="carousel"`
- Each slide: `role="group"`, `aria-roledescription="slide"`, `aria-label="N of M"`
- Arrow buttons: `aria-hidden` when not visible, `tabIndex={-1}` when hidden
- Dot buttons: `role="tab"`, `aria-selected`
- Container is focusable (`tabIndex={0}`) for keyboard navigation

---

### ListingCardCarousel (CSS Scroll-Snap)

**File**: `/mnt/d/Documents/roomshare/src/components/listings/ListingCardCarousel.tsx`

An alternative carousel implementation using CSS scroll-snap (no external library). **Not currently used by ListingCard** (which uses the Embla-based ImageCarousel) but available as a lightweight option.

#### Props

```ts
interface ListingCardCarouselProps {
  images: string[];
  alt: string;
  maxImages?: number;   // default: 5
  onImageError?: () => void;
}
```

#### Key Differences from ImageCarousel

| Feature | ListingCardCarousel | ImageCarousel |
|---------|-------------------|---------------|
| Engine | CSS `scroll-snap` | Embla Carousel |
| Looping | No | Yes |
| Max images | Configurable (default 5) | All images |
| Lazy loading | Manual adjacency tracking via `loadedImages` Set | Via `loading="lazy"` attribute |
| Bundle cost | Zero dependencies | ~20KB (embla-carousel) |
| Live region | `aria-live="polite"` announces slide changes | None (relies on aria-label) |
| Touch targets | 44px minimum for buttons | 44px minimum for buttons |

#### Lazy Loading Strategy

```ts
const [loadedImages, setLoadedImages] = useState<Set<number>>(
  () => new Set(totalImages > 1 ? [0, 1] : [0])
);
// On navigation, preload current + adjacent:
newSet.add(targetIndex);
if (targetIndex > 0) newSet.add(targetIndex - 1);
if (targetIndex < totalImages - 1) newSet.add(targetIndex + 1);
```

Unloaded images show a pulsing placeholder div.

#### Interaction Controls

- Arrow buttons appear on hover (desktop) or touch interaction (mobile)
- Controls auto-hide after 150ms timeout following interaction end
- Navigation dots always visible at bottom
- Keyboard navigation (ArrowLeft/ArrowRight) when focused

---

### ListingCardSkeleton

**File**: `/mnt/d/Documents/roomshare/src/components/listings/ListingCardSkeleton.tsx`

Shimmer loading placeholder that precisely matches the `ListingCard` layout to prevent layout shifts.

#### Exports

| Export | Purpose |
|--------|---------|
| `ListingCardSkeleton` | Single skeleton card |
| `ListingCardSkeletonGrid` | Grid of N skeleton cards (default 12) |

#### Layout Match

```
+---------------------------+
| Image area (aspect 4:3)   |  <- gradient shimmer animation
|  [badge placeholder]      |
+---------------------------+
| [title ----] [rating]     |  <- gray bars matching real dimensions
| [location --]             |
| [pill] [pill] [pill]      |
| (spacer)                  |
| [$price ---]              |  <- pushed to bottom like real card
+---------------------------+
```

- Uses `animate-pulse` on the container
- Image area has a custom `animate-shimmer` gradient overlay (`bg-[length:200%_100%]`)
- Content area uses `min-h-[156px]` matching ListingCard

#### Grid Component

```ts
export function ListingCardSkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-x-6 sm:gap-y-8">
      {Array.from({ length: count }, (_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </div>
  );
}
```

---

### ImageUploader

**File**: `/mnt/d/Documents/roomshare/src/components/listings/ImageUploader.tsx`

Drag-and-drop image uploader with preview grid, used in listing creation and editing forms.

#### Props

```ts
interface ImageUploaderProps {
  onImagesChange?: (images: ImageObject[]) => void;
  initialImages?: string[];
  maxImages?: number;        // default: 10
  uploadToCloud?: boolean;   // default: true
}

interface ImageObject {
  file?: File;
  id: string;
  previewUrl: string;
  uploadedUrl?: string;
  isUploading?: boolean;
  error?: string;
}
```

#### Features

| Feature | Implementation |
|---------|---------------|
| Upload methods | Click to browse, drag & drop |
| Accepted formats | JPEG, PNG, WebP, GIF |
| Max images | Configurable (default 10) |
| Cloud upload | Via `/api/upload` endpoint with FormData |
| Preview generation | `URL.createObjectURL()` for instant local preview |
| Main image badge | First image marked as "Main" |
| Error handling | Per-image error states with retry functionality |
| Memory management | Automatic `URL.revokeObjectURL()` cleanup on unmount |

#### Upload Flow

```
User selects/drops files
  |
  +-- Filter for valid image types
  +-- Check against maxImages limit
  +-- Create ImageObject with preview URL
  +-- Add to state (instant visual feedback)
  |
  +-- If uploadToCloud = true:
        For each image:
          POST /api/upload (FormData with file + type='listing')
            Success → Update ImageObject with uploadedUrl
            Error → Update ImageObject with error message
```

#### UI States

1. **Upload Area**: Drag-drop zone with hover states; hidden when at max capacity
2. **Preview Grid**: 2-4 column responsive grid
3. **Image States**:
   - Uploading: 50% opacity + centered spinner overlay
   - Error: Red overlay with error message + retry button
   - Success: Full opacity with delete button on hover
4. **Add More Button**: Mini button in grid when under max capacity
5. **Status Summary**: Image count, upload progress, success/failure counts

#### Error Recovery

- **Individual retry**: Click "Retry" button on failed image
- **Bulk retry**: "Retry All Failed" button appears when multiple failures exist
- Failed uploads preserve the File object for retry attempts
- Error messages display truncated with `line-clamp-2`

#### Accessibility

- Upload area is keyboard accessible (click to browse)
- Delete buttons have 44px minimum touch target
- Error overlays use `role="alert"`
- Remove buttons have `aria-label="Remove image"`
- Status messages provide feedback for screen readers

#### Memory Management

```ts
// Cleanup on unmount to prevent memory leaks
useEffect(() => {
  return () => {
    images.forEach(img => {
      if (img.previewUrl && !img.uploadedUrl) {
        URL.revokeObjectURL(img.previewUrl);
      }
    });
  };
}, []);
```

---

## Action Buttons

### SaveListingButton

**File**: `/mnt/d/Documents/roomshare/src/components/SaveListingButton.tsx`

Full-size save/unsave button used on the listing detail page (separate from the compact `FavoriteButton` overlay on cards).

#### Props

```ts
interface SaveListingButtonProps {
  listingId: string;
}
```

#### State Machine

```
[Loading] --check--> [Idle: unsaved] --toggle--> [Toggling] --success--> [Idle: saved]
                     [Idle: saved]   --toggle--> [Toggling] --success--> [Idle: unsaved]
                                                            --error----> [Idle: unchanged]
```

#### Behavior

1. **Mount**: Calls `isListingSaved(listingId)` server action to check initial state. Shows spinner while loading.
2. **Toggle**: Calls `toggleSaveListing(listingId)`. Disables button during request. Updates local state on success.
3. **Visual states**:
   - Loading: `<Loader2>` spinner, disabled
   - Unsaved: outline heart icon
   - Saved: red-filled heart, red-tinted background (`bg-red-50 border-red-200`)
   - Toggling: spinner, disabled

#### Accessibility

- `aria-label` changes between "Save listing" and "Remove from saved listings"
- Loading state: `aria-label="Loading saved status"`

---

### ShareListingButton

**File**: `/mnt/d/Documents/roomshare/src/components/ShareListingButton.tsx`

Share button with native Web Share API support and fallback dropdown.

#### Props

```ts
interface ShareListingButtonProps {
  listingId: string;
  title: string;
}
```

#### Share Flow

```
Click "Share"
  |
  +-- navigator.share available?
  |     Yes --> Native share sheet (title, text, url)
  |              |-- User cancels --> Open dropdown fallback
  |     No  --> Open dropdown
  |
Dropdown options:
  - Copy Link (clipboard API, shows checkmark for 2s)
  - Twitter (intent URL, new window)
  - Facebook (sharer URL, new window)
  - Email (mailto: link)
```

#### URL Construction

```ts
const url = typeof window !== 'undefined'
  ? `${window.location.origin}/listings/${listingId}`
  : `/listings/${listingId}`;
```

#### Dropdown UI

- Fixed-position invisible backdrop to catch outside clicks
- Animated dropdown (`animate-in fade-in zoom-in-95`) positioned right-aligned below the button
- Each option is a full-width button with icon + label

---

### ListingStatusToggle

**File**: `/mnt/d/Documents/roomshare/src/components/ListingStatusToggle.tsx`

Owner-facing status dropdown for changing listing visibility. Used on the listing management/dashboard page.

#### Props

```ts
interface ListingStatusToggleProps {
  listingId: string;
  currentStatus: ListingStatus;  // 'ACTIVE' | 'PAUSED' | 'RENTED'
}
```

#### Status Configuration

| Status | Label | Description | Color | Icon |
|--------|-------|-------------|-------|------|
| `ACTIVE` | Active | Visible to everyone | Green | `Eye` |
| `PAUSED` | Paused | Hidden from search | Yellow | `EyeOff` |
| `RENTED` | Rented | Marked as rented | Blue | `Home` |

#### Behavior

1. Displays current status as a colored pill with dot indicator and chevron
2. Click opens dropdown with all three options
3. Selecting a new status calls `updateListingStatus(listingId, newStatus)` server action
4. On success: updates local state, calls `router.refresh()` to revalidate page data
5. On error: shows toast notification via `sonner`
6. Selected item shows a filled dot indicator
7. Button disabled during update

---

## Freshness & Realtime

### ListingFreshnessCheck

**File**: `/mnt/d/Documents/roomshare/src/components/ListingFreshnessCheck.tsx`

Polling component that detects when a listing has been deleted, paused, or rented while the user is viewing it. Renders a fixed-position banner when staleness is detected.

#### Props

```ts
interface ListingFreshnessCheckProps {
  listingId: string;
  checkInterval?: number;  // milliseconds, default 30000 (30s)
}
```

#### Polling Strategy

```
Mount --> Immediate check --> setInterval(checkInterval)
  |
  +-- Tab hidden? Skip check (visibilityState !== 'visible')
  +-- Tab re-visible? Immediate check (visibilitychange listener)
  +-- Network error? Exponential backoff (2x multiplier, max 5 min)
  +-- Successful response? Reset backoff to base interval
  +-- Non-JSON response (HTML 404)? Silently ignore (routing issue)
  +-- 401/403/500? Silently ignore (don't show misleading banners)
```

#### Response Handling

| API Response | Banner |
|-------------|--------|
| 404 + `"Listing not found"` (JSON) | Red "Listing No Longer Available" + "Find Other Listings" button |
| 200 + status `PAUSED` or `RENTED` | Amber "Listing Currently Unavailable" + "Refresh Page" button |
| 200 + status `ACTIVE` | Clear any banner |
| HTML response / non-JSON | Ignore silently |
| Network error | Backoff, no banner |

#### Exponential Backoff

```ts
const MAX_BACKOFF_INTERVAL = 300000; // 5 minutes
const BACKOFF_MULTIPLIER = 2;
// newInterval = min(base * 2^failureCount, 300000)
```

Development-only console logging for first 3 failures.

#### Cleanup

On unmount: clears interval, removes visibilitychange listener, sets `isMountedRef = false` to prevent state updates on unmounted component.

---

## Featured Listings

### FeaturedListings (Server)

**File**: `/mnt/d/Documents/roomshare/src/components/FeaturedListings.tsx`

Server component that fetches the 6 newest listings and passes them to the client component.

```ts
// 'use server'
export default async function FeaturedListings() {
  const { items: listings } = await getListingsPaginated({
    sort: 'newest',
    limit: 6
  });
  return <FeaturedListingsClient listings={listings} />;
}
```

### FeaturedListingsClient

**File**: `/mnt/d/Documents/roomshare/src/components/FeaturedListingsClient.tsx`

Client component that renders the featured listings grid with staggered entrance animations.

#### Animation System

Uses `framer-motion` with `LazyMotion` + `domAnimation` for bundle optimization (~20KB instead of ~200KB):

```ts
const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};
const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};
```

#### Empty State

When no listings exist, renders a CTA section: "Be the First to List" with a link to `/listings/create`.

#### Grid Layout

- 1 column on mobile, 2 on `sm`, 3 on `lg`
- First 3 cards get `priority={true}` for LCP optimization
- Maps the full listing data down to the `ListingCard` `Listing` interface shape
- "View All Listings" button links to `/search`

---

## Server Actions

### fetchMoreListings

**File**: `/mnt/d/Documents/roomshare/src/app/search/actions.ts`

Server action for cursor-based pagination in search results.

#### Signature

```ts
export async function fetchMoreListings(
  cursor: string,
  rawParams: Record<string, string | string[] | undefined>
): Promise<FetchMoreResult>
```

#### FetchMoreResult Interface (lines 12-16)

```ts
export interface FetchMoreResult {
  items: ListingData[];
  nextCursor: string | null;
  hasNextPage: boolean;
}
```

#### Behavior (lines 18-85)

1. **Cursor validation**: Throws error if cursor is invalid/empty
2. **Rate limiting**: Checks via `checkServerComponentRateLimit()`, throws if rate limited
3. **V2 path** (if `features.searchV2` enabled):
   - Embeds cursor in params
   - Calls `executeSearchV2()` with `ITEMS_PER_PAGE` (12)
   - Returns paginated result
4. **V1 fallback**:
   - Falls back to `getListingsPaginated()` with offset pagination
   - Returns `nextCursor: null` (V1 doesn't support cursor continuation)

#### Page Size

```ts
const ITEMS_PER_PAGE = 12;
```

---

### get-listings (Map Bounds Query)

**File**: `/mnt/d/Documents/roomshare/src/app/actions/get-listings.ts`

#### `getListingsInBounds(bounds: Bounds): Promise<MapListing[]>`

Spatial query using PostGIS `ST_Intersects` + `ST_MakeEnvelope` to find listings within map viewport bounds.

**Bounds interface**:

```ts
interface Bounds { ne_lat: number; ne_lng: number; sw_lat: number; sw_lng: number; }
```

**MapListing interface**:

```ts
interface MapListing {
  id: string;
  title: string;
  price: number;
  availableSlots: number;
  ownerId: string;
  lat: number;
  lng: number;
  amenities: string[];
  images: string[];
}
```

**Antimeridian handling**: If `sw_lng > ne_lng` (crosses the dateline), the query splits into two envelopes: `[sw_lng, 180]` and `[-180, ne_lng]`.

**Result limit**: 50 listings maximum per query.

**Error handling**: Logs via structured logger, returns empty array on failure.

---

### saved-listings

**File**: `/mnt/d/Documents/roomshare/src/app/actions/saved-listings.ts`

All actions require authentication. `toggleSaveListing` and operations that modify data also check for account suspension.

| Action | Signature | Returns | Path Revalidation |
|--------|-----------|---------|-------------------|
| `toggleSaveListing` | `(listingId: string)` | `{ saved: boolean; error?: string }` | `/listings/{id}`, `/saved` |
| `isListingSaved` | `(listingId: string)` | `{ saved: boolean }` | None |
| `getSavedListings` | `()` | Array of `{ id, title, description, price, images, location, owner, savedAt }` | None |
| `removeSavedListing` | `(listingId: string)` | `{ success?: boolean; error?: string }` | `/saved` |

**Toggle logic**: Uses Prisma `findUnique` on composite key `userId_listingId`. If exists, deletes (unsave). If not, creates (save).

---

### listing-status

**File**: `/mnt/d/Documents/roomshare/src/app/actions/listing-status.ts`

| Action | Auth Required | Ownership Check | Returns |
|--------|--------------|-----------------|---------|
| `updateListingStatus(listingId, status)` | Yes + suspension check | Yes | `{ success?: boolean; error?: string }` |
| `incrementViewCount(listingId)` | No | No | `{ success?: boolean; error?: string }` |
| `trackListingView(listingId)` | No (increments view count for all; tracks recently viewed for auth users) | No | `{ success: true }` |
| `trackRecentlyViewed(listingId)` | Yes | No | `{ success?: boolean; error?: string }` |
| `getRecentlyViewed(limit?)` | Yes | No | Array of listing summaries (only ACTIVE status) |

**Status type**: `'ACTIVE' | 'PAUSED' | 'RENTED'`

**updateListingStatus revalidation**: `/listings/{id}`, `/profile`, `/search`

**Recently viewed management**: Upserts with `viewedAt` timestamp, keeps only the last 20 entries per user (deletes overflow).

**Search index integration**: Both `updateListingStatus` and `incrementViewCount` call `markListingDirty()` for search document refresh.

---

## Split Stay Logic

**File**: `/mnt/d/Documents/roomshare/src/lib/search/split-stay.ts`

### findSplitStays

```ts
export function findSplitStays(
  listings: ListingData[],
  stayMonths?: number,
): SplitStayPair[]
```

Finds complementary listing pairs for long stays (6+ months) when no single listing covers the full duration.

#### Algorithm (lines 21-56)

1. **Guard**: Returns `[]` if `stayMonths < 6` or `listings.length < 2`
2. **Split calculation**: `halfMonths = floor(stayMonths / 2)`, `remainderMonths = stayMonths - halfMonths`
3. **Sorting**: Sort listings by price (ascending), filter out free listings
4. **Pairing strategy**: Pair budget-friendly with premium options (first with last, second with second-to-last)
5. **Max pairs**: Returns up to 2 pairs
6. **Price calculation**: `first.price * halfMonths + second.price * remainderMonths`

#### Example Output

For 6-month stay with listings at $1000, $1500, $2000, $2500/mo:

```ts
[
  { first: $1000, second: $2500, combinedPrice: 1000*3 + 2500*3 = 10500, splitLabel: "3 mo + 3 mo" },
  { first: $1500, second: $2000, combinedPrice: 1500*3 + 2000*3 = 10500, splitLabel: "3 mo + 3 mo" },
]
```

---

## Content Moderation

### Listing Language Guard

**File**: `/mnt/d/Documents/roomshare/src/lib/listing-language-guard.ts`

Prevents discriminatory language requirements in listing descriptions. This is separate from the Fair Housing Policy gate used for neighborhood chat.

#### Blocked Patterns

Dynamically generated from the canonical `SUPPORTED_LANGUAGES` list (54+ languages). Patterns are sorted by length (longest first) for proper regex alternation.

| Pattern Type | Example Match |
|-------------|---------------|
| `<language> only` | "English only", "English-only" |
| `only <language>` | "only Spanish" |
| `no <language> speakers` | "no Chinese speakers" |
| `must speak <language>` | "must speak Korean", "required to know Hindi" |
| `<language> required` | "Mandarin is required", "French mandatory" |
| `fluent <language> only` | "fluent English speakers only", "native Japanese required" |

#### API

```ts
function checkListingLanguageCompliance(description: string): LanguageComplianceResult;
// Returns: { allowed: true } or { allowed: false, message: "Please describe..." }
```

**Design decisions**:
- Intentionally minimal to avoid false positives
- Generic refusal message does not reveal which pattern was matched (prevents gaming)
- Directs users to the "Languages spoken in the house" UI field instead
- Skips descriptions under 10 characters
- Case-insensitive matching
