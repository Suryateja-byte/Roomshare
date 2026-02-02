# Search Results and Filter UI Components

Reference documentation for all components under `src/components/search/`.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [SearchResultsClient](#searchresultsclient)
- [FilterModal](#filtermodal)
- [FilterPill](#filterpill)
- [RecommendedFilters](#recommendedfilters)
- [PriceRangeFilter](#pricerangefilter)
- [PriceHistogram](#pricehistogram)
- [CategoryBar](#categorybar)
- [CategoryTabs](#categorytabs)
- [CompactSearchPill](#compactsearchpill)
- [DatePills](#datepills)
- [TotalPriceToggle](#totalpricetoggle)
- [SuggestedSearches](#suggestedsearches)
- [SearchResultsLoadingWrapper](#searchresultsloadingwrapper)
- [FloatingMapButton](#floatingmapbutton)
- [SplitStayCard](#splitstaycard)
- [Barrel Export (index.ts)](#barrel-export)

---

## Architecture Overview

The search UI follows a **presentational/container split**. Most components are pure presentational -- they receive props and render UI. All filter state, URL synchronization, and business logic lives in `SearchForm.tsx` (located at `src/components/SearchForm.tsx`), which is the parent container.

**Key patterns:**

- **URL as source of truth** -- Filter changes push new URL search params via `next/navigation`. The page re-renders server-side with fresh data.
- **Batched filter updates** -- SearchForm uses `useBatchedFilters` hook to manage pending vs committed filter state. This allows users to adjust multiple filters in the modal before committing them to the URL.
- **Cursor pagination is ephemeral** -- "Load more" state lives in `SearchResultsClient` local state, not in the URL. Changing any filter remounts the component (it is keyed by `searchParamsString`), which resets pagination.
- **Deduplication** -- A `Set<string>` of seen listing IDs prevents duplicates across pagination loads.
- **60-item cap** -- Client stops fetching after `MAX_ACCUMULATED = 60` listings to protect low-end devices.
- **Session-scoped preferences** -- `showTotalPrice` is stored in `sessionStorage`, not `localStorage`, so it does not persist across browser sessions.

**Component relationship diagram:**

```
SearchPage (server)
  +-- SearchForm (container in src/components/ -- owns filter state with useBatchedFilters, URL sync)
  |     +-- LocationSearchInput
  |     +-- Room Type Tabs (inline)
  |     +-- FilterModal
  |     |     +-- PriceRangeFilter
  |     |     |     +-- PriceHistogram
  |     |     +-- DatePicker
  |     |     +-- Amenities/HouseRules/Languages toggles
  |     +-- FilterPill × N (active filters)
  +-- SearchResultsLoadingWrapper
        +-- SearchResultsClient
              +-- TotalPriceToggle
              +-- ListingCard (per result)
              +-- SplitStayCard (per pair, for 6+ month stays)
              +-- SuggestedSearches (browse mode)
              +-- ZeroResultsSuggestions (zero results)
  +-- FloatingMapButton (mobile only)
```

---

## SearchResultsClient

**File:** `src/components/search/SearchResultsClient.tsx`

**Purpose:** Renders the listing grid with cursor-based "Load more" pagination. Handles deduplication, the 60-item cap, total-price toggle, split-stay suggestions, and zero-results states.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `initialListings` | `ListingData[]` | SSR-provided first page of results |
| `initialNextCursor` | `string \| null` | Cursor for fetching the next page |
| `initialTotal` | `number \| null` | Total result count (`null` means 100+) |
| `savedListingIds` | `string[]` | IDs the user has saved/bookmarked |
| `searchParamsString` | `string` | Serialized URL params (filters + sort, no cursor) |
| `query` | `string` | The location/text query |
| `browseMode` | `boolean` | True when user is browsing without a query |
| `hasConfirmedZeroResults` | `boolean` | True when the server confirmed zero matches |
| `filterSuggestions` | `FilterSuggestion[]` | Server-generated filter relaxation suggestions |
| `sortOption` | `string` | Current sort selection |

### Local State

| State | Type | Purpose |
|-------|------|---------|
| `extraListings` | `ListingData[]` | Listings fetched via "Load more" |
| `nextCursor` | `string \| null` | Cursor for next fetch |
| `isLoadingMore` | `boolean` | Loading spinner guard |
| `loadError` | `string \| null` | Error message from failed fetch |
| `showTotalPrice` | `boolean` | Whether to show total (vs. monthly) price; initialized from `sessionStorage` |

### Refs

| Ref | Purpose |
|-----|---------|
| `seenIdsRef` | `Set<string>` -- tracks all seen listing IDs for deduplication across loads |
| `rawParamsRef` | Parsed `Record` of search params, computed once |

### Key Behavior

**Estimated months calculation:** Derives `estimatedMonths` from `moveInDate`/`moveOutDate` URL params, falling back to `leaseDuration`. Used for total price display and split-stay matching.

```tsx
const estimatedMonths = useMemo(() => {
  const sp = new URLSearchParams(searchParamsString);
  const moveIn = sp.get('moveInDate');
  const moveOut = sp.get('moveOutDate');
  if (moveIn && moveOut) {
    const start = new Date(moveIn);
    const end = new Date(moveOut);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
      const diffMs = end.getTime() - start.getTime();
      const months = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44)));
      return months;
    }
  }
  const ld = sp.get('leaseDuration');
  if (!ld) return 1;
  const match = ld.match(/^(\d+)\s+months?$/i);
  return match ? parseInt(match[1], 10) : 1;
}, [searchParamsString]);
```

**Split stays:** When `estimatedMonths >= 6`, calls `findSplitStays()` to find listing pairs that together cover the full duration. Renders `SplitStayCard` components below the main grid.

**Load more handler:**

```tsx
const handleLoadMore = useCallback(async () => {
  if (!nextCursor || isLoadingMore) return;
  setIsLoadingMore(true);
  const result = await fetchMoreListings(nextCursor, rawParamsRef.current!);
  // Deduplicate by ID
  const dedupedItems = result.items.filter((item) => {
    if (seenIdsRef.current.has(item.id)) return false;
    seenIdsRef.current.add(item.id);
    return true;
  });
  setExtraListings((prev) => [...prev, ...dedupedItems]);
  setNextCursor(result.nextCursor);
}, [nextCursor, isLoadingMore]);
```

**Performance:** Uses `performance.mark` / `performance.measure` to instrument load-more timing.

### Accessibility

- `aria-live="polite"` region announces result count to screen readers
- `role="feed"` on the listing grid
- Load-more button has dynamic `aria-label` with current/total count
- First 4 listing cards receive `priority={true}` for image loading

### Responsive

- Grid: 1 column on mobile, 2 columns at `sm` breakpoint
- Gap adjusts from `gap-4` to `gap-x-6 gap-y-8` at `sm`
- Zero-results padding adjusts between `py-12` (mobile) and `py-20` (desktop)

---

## FilterModal

**File:** `src/components/search/FilterModal.tsx`

**Purpose:** Full-screen slide-out drawer containing all advanced filters. Pure presentational -- all state and handlers are passed in as props from `SearchForm`.

**State Management:** SearchForm uses the `useBatchedFilters` hook to manage pending filter state. When the user clicks "Apply", SearchForm calls `commitFilters()` which writes pending state to the URL and navigates.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `isOpen` | `boolean` | Controls visibility |
| `onClose` | `() => void` | Close handler |
| `onApply` | `() => void` | Apply filters and close (calls `commitFilters()` in SearchForm) |
| `onClearAll` | `() => void` | Reset all filters |
| `hasActiveFilters` | `boolean` | Show "Clear all" button |
| `activeFilterCount` | `number` | Badge count in header |
| `moveInDate` | `string` | Current move-in date value |
| `leaseDuration` | `string` | Current lease duration |
| `roomType` | `string` | Current room type |
| `amenities` | `string[]` | Selected amenity values |
| `houseRules` | `string[]` | Selected house rule values |
| `languages` | `string[]` | Selected language codes |
| `genderPreference` | `string` | Gender preference filter |
| `householdGender` | `string` | Household gender filter |
| `on[Filter]Change` | callbacks | One handler per filter (calls `setPending()` from useBatchedFilters) |
| `languageSearch` | `string` | Language search input value |
| `filteredLanguages` | `string[]` | Filtered language codes to display |
| `minPrice` | `number?` | Current price range min (numeric) |
| `maxPrice` | `number?` | Current price range max (numeric) |
| `priceAbsoluteMin` | `number` | Dataset price bounds (default 0) |
| `priceAbsoluteMax` | `number` | Dataset price bounds (default 10000) |
| `priceHistogram` | `PriceHistogramBucket[] \| null` | Histogram data for price visualization |
| `onPriceChange` | `(min, max) => void` | Price range change handler |
| `facetCounts` | `object` | Live counts per filter option (amenities, houseRules, roomTypes) |
| `formattedCount` | `string` | Dynamic "Show N results" text from `useDebouncedFilterCount` |
| `isCountLoading` | `boolean` | Whether count is being fetched |
| `boundsRequired` | `boolean` | Disables apply button when map bounds needed |

### Filter Sections (in order)

1. **Price Range** -- `PriceRangeFilter` with histogram visualization
2. **Move-in Date** -- `DatePicker` component
3. **Lease Duration** -- Select (Any, Month-to-month, 3/6/12 months, Flexible)
4. **Room Type** -- Select with facet counts; zero-count options are disabled
5. **Amenities** -- Toggle pills with facet counts; `aria-pressed` state; disabled if count is zero
6. **House Rules** -- Toggle pills with facet counts; disabled if count is zero
7. **Languages** -- Search input + selected chips + available chips
8. **Gender Preference** -- Select (Any, Male Only, Female Only, All Welcome)
9. **Household Gender** -- Select (Any, All Male, All Female, Mixed)

### Accessibility

- `role="dialog"` with `aria-modal="true"` and `aria-labelledby`
- `FocusTrap` wraps the drawer to keep keyboard focus inside
- Backdrop click closes the drawer
- All filter groups use `<fieldset>`/`<legend>` or `<label>` associations
- Toggle buttons use `aria-pressed` and `aria-disabled`

### Rendering

Rendered via `createPortal` to `document.body`. Returns `null` when `!isOpen` or during SSR (`typeof document === 'undefined'`).

### Footer

The apply button shows a dynamic count from `formattedCount` (e.g., "Show 42 places"). A loading spinner appears while `isCountLoading` is true. The button is disabled when `boundsRequired` is true (map bounds not yet available).

---

## FilterPill

**File:** `src/components/search/FilterPill.tsx`

**Purpose:** Small removable chip displaying one active filter. Clicking it removes the filter.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | -- | Filter name (e.g., "Room Type") |
| `value` | `string?` | -- | Filter value (e.g., "Private Room"); if present, displays as "label: value" |
| `onRemove` | `() => void` | -- | Remove handler |
| `variant` | `'default' \| 'active'` | `'active'` | Visual style |

### Accessibility

- `aria-label="Remove {displayText} filter"` on the button
- Text truncated with `max-w-[120px]` / `sm:max-w-[150px]` / `lg:max-w-[180px]`

### Variants

- **active**: Dark background (`bg-zinc-900`), white text
- **default**: Light background (`bg-zinc-100`), dark text

---

## RecommendedFilters

**File:** `src/components/search/RecommendedFilters.tsx`

**Purpose:** Contextual "Try:" suggestion pills shown above search results. Displays up to 5 filters that are not yet applied.

### State Management

- Reads current filters from `useSearchParams()`
- Uses `useTransition()` for non-blocking URL navigation
- No local state beyond the transition pending flag

### Suggestions

```tsx
const SUGGESTIONS = [
  { label: 'Furnished', param: 'amenities', value: 'Furnished' },
  { label: 'Pet Friendly', param: 'houseRules', value: 'Pets allowed' },
  { label: 'Wifi', param: 'amenities', value: 'Wifi' },
  { label: 'Parking', param: 'amenities', value: 'Parking' },
  { label: 'Washer', param: 'amenities', value: 'Washer' },
  { label: 'Private Room', param: 'roomType', value: 'Private Room' },
  { label: 'Entire Place', param: 'roomType', value: 'Entire Place' },
  { label: 'Month-to-month', param: 'leaseDuration', value: 'Month-to-month' },
  { label: 'Under $1000', param: 'maxPrice', value: '1000' },
  { label: 'Couples OK', param: 'houseRules', value: 'Couples allowed' },
];
```

**Filtering logic:** Array params (amenities, houseRules) check comma-separated values. `maxPrice` checks if existing value is higher. Scalar params check exact match. Already-applied filters are excluded. Maximum 5 pills shown.

**On click:** Merges the suggestion param into the current URL params, deletes `cursor` and `page`, and navigates via `router.push`.

---

## PriceRangeFilter

**File:** `src/components/search/PriceRangeFilter.tsx`

**Purpose:** Dual-thumb price range slider with histogram overlay. Uses `@radix-ui/react-slider` for accessibility and cross-browser support. Used inside `FilterModal`.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `minPrice` | `number` | Current minimum price |
| `maxPrice` | `number` | Current maximum price |
| `absoluteMin` | `number` | Dataset floor (default 0) |
| `absoluteMax` | `number` | Dataset ceiling (default 10000) |
| `histogram` | `PriceHistogramBucket[] \| null` | Bar chart data for visualization |
| `onChange` | `(min, max) => void` | Committed value callback |

### State

- `localMin` / `localMax` -- Local state for immediate visual feedback during drag
- `isDragging` ref -- Prevents external prop sync from overwriting during active drag
- Props sync back to local state when they change externally (e.g., "Clear all" reset)

### Slider

Built on `@radix-ui/react-slider`. Key details:

- **Step size:** Dynamic based on range (10 for <=1000, 25 for <=5000, 50 otherwise)
- **`onValueChange`:** Updates local state for instant visual feedback during drag
- **`onValueCommit`:** Fires `onChange` prop to propagate to parent when drag ends

```tsx
<Slider.Root
  min={absoluteMin}
  max={absoluteMax}
  step={step}
  value={[localMin, localMax]}
  onValueChange={handleValueChange}
  onValueCommit={handleValueCommit}
  aria-label="Price range"
>
  <Slider.Track>
    <Slider.Range />
  </Slider.Track>
  <Slider.Thumb aria-label="Minimum price" />
  <Slider.Thumb aria-label="Maximum price" />
</Slider.Root>
```

### Price Display

- Formats prices using `toLocaleString()`
- Shows "+" suffix when max price equals absoluteMax (e.g., "$10,000+")
- Range label: `$min – $max` or `$min – $max+`

### Accessibility

- `aria-label="Price range"` on the slider root
- `aria-label="Minimum price"` / `"Maximum price"` on each thumb
- Focus ring on thumbs (`focus:ring-2`)
- Keyboard navigation supported via Radix primitives

---

## PriceHistogram

**File:** `src/components/search/PriceHistogram.tsx`

**Purpose:** Visual bar chart showing price distribution. Bars within the selected range are highlighted dark; bars outside are dimmed light gray. Renders a skeleton when data is loading.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `buckets` | `PriceHistogramBucket[] \| null` | -- | Histogram data with `{ min, max, count }` per bucket |
| `selectedMin` | `number` | -- | Current range min for highlighting |
| `selectedMax` | `number` | -- | Current range max for highlighting |
| `height` | `number` | `80` | Chart height in px |
| `barGap` | `number` | `1` | Gap between bars in px |

### Rendering

- Each bar height is proportional to `bucket.count / maxCount`
- Bars where `bucket.max > selectedMin && bucket.min < selectedMax` are highlighted (dark gray/zinc-900)
- Bars outside selected range are dimmed (light gray/zinc-200)
- Skeleton uses pre-computed `SKELETON_HEIGHTS` array (no `Math.random()` during render to avoid hydration mismatches)
- Entire element is `aria-hidden="true"` (decorative visualization)

### Example Bucket Data

```tsx
interface PriceHistogramBucket {
  min: number;   // Bucket lower bound
  max: number;   // Bucket upper bound
  count: number; // Number of listings in this price range
}
```

---

## CategoryBar

**File:** `src/components/search/CategoryBar.tsx`

**Purpose:** Horizontally scrollable icon+label category filter bar (similar to Airbnb's category row). Each category is a shortcut that applies one or more URL filter params.

### Categories

| ID | Label | Params Applied |
|----|-------|---------------|
| `entire` | Entire Place | `roomType=Entire Place` |
| `private` | Private Room | `roomType=Private Room` |
| `transit` | Near Transit | `amenities=Near Transit` |
| `pet` | Pet Friendly | `houseRules=Pets allowed` |
| `furnished` | Furnished | `amenities=Furnished` |
| `shortTerm` | Short Term | `leaseDuration=Month-to-month` |
| `budget` | Under $1000 | `maxPrice=1000` |
| `shared` | Shared Room | `roomType=Shared Room` |
| `wifi` | Wifi | `amenities=Wifi` |

### State

- `useSearchParams()` / `useRouter()` / `usePathname()` for URL management
- `useTransition()` for non-blocking navigation
- `canScrollLeft` / `canScrollRight` booleans control arrow button visibility
- Scroll overflow detected via `ResizeObserver` and `scroll` event listener

### Toggle Behavior

Clicking an active category removes its params from the URL. Clicking an inactive one adds/merges them. Array params (amenities, houseRules) handle comma-separated values. Pagination (`cursor`, `page`) is reset on every change.

### Accessibility

- `role="navigation"` with `aria-label="Category filters"`
- Each button has `aria-pressed` reflecting active state
- Scroll arrows have descriptive `aria-label`
- Fade edges are `aria-hidden="true"`

### Responsive

- Scroll arrows (`ChevronLeft`/`ChevronRight`) are hidden below `md` breakpoint -- touch scrolling only on mobile
- Fade gradients on left/right edges when content overflows

---

## CategoryTabs

**File:** `src/components/search/CategoryTabs.tsx`

**Purpose:** Segmented control for quick room-type filtering (All / Private / Shared / Entire). Pure presentational. Used inline in SearchForm.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `selectedRoomType` | `string` | Current room type value |
| `onRoomTypeChange` | `(value: string) => void` | Change handler; receives empty string for "Any" |

### Options

| Value | Label | Icon |
|-------|-------|------|
| `any` | All | `LayoutGrid` |
| `Private Room` | Private | `Home` |
| `Shared Room` | Shared | `Users` |
| `Entire Place` | Entire | `Building2` |

### Responsive

- Labels (`<span>`) hidden below `sm` breakpoint; only icons shown on mobile
- Minimum touch target: `min-h-[44px]`

### Accessibility

- Each button has `aria-pressed` reflecting selection state
- `aria-label` describes action (e.g., "Filter by Private room")

---

## CompactSearchPill

**File:** `src/components/search/CompactSearchPill.tsx`

**Purpose:** Collapsed search bar shown on desktop when the user scrolls down. Displays a summary of current search state (location, price, room type, lease). Clicking it expands the full search form.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `onExpand` | `() => void` | Expand the full search form |
| `onOpenFilters` | `(() => void)?` | Open the filter modal; if provided, a filter button is shown |

### State

Reads from `useSearchParams()` to derive:
- **Segments:** Location (or "Anywhere"), price range, room type, lease duration
- **Filter count:** Counts all active filters (amenities split by comma, etc.)

### Responsive

- Entire component is `hidden md:flex` -- desktop only
- Text segments are separated by vertical dividers

### Accessibility

- Main button: `aria-label="Expand search form"`
- Filter button: `aria-label="Filters (N active)"` with badge count

---

## DatePills

**File:** `src/components/search/DatePills.tsx`

**Purpose:** Horizontal row of alternative date suggestions showing cheaper date ranges. Encourages flexibility.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `suggestions` | `DateSuggestion[]` | Array of date options with label, avgPrice, and params |

### DateSuggestion Interface

```tsx
interface DateSuggestion {
  label: string;      // e.g., "Feb 15 – Mar 15"
  avgPrice: number;   // Average monthly price
  params: string;     // URL search params to merge
}
```

### Behavior

On click, merges the suggestion's params into the current URL and navigates to `/search?...`. Returns `null` if no suggestions.

### Display

Each pill shows the date range label and a green price indicator (e.g., "~$850/mo").

---

## TotalPriceToggle

**File:** `src/components/search/TotalPriceToggle.tsx`

**Purpose:** Switch between monthly and total price display in search results.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `showTotal` | `boolean` | Current toggle state |
| `onToggle` | `(showTotal: boolean) => void` | State change handler |

### Persistence

Stores preference in `sessionStorage` under key `showTotalPrice`. Wrapped in try/catch for SSR and private browsing compatibility.

### Accessibility

- `role="switch"` on the toggle button
- `aria-checked` reflects current state
- `focus-visible:ring-2` for keyboard users
- Wrapped in a `<label>` for click-to-toggle

---

## SuggestedSearches

**File:** `src/components/search/SuggestedSearches.tsx`

**Purpose:** Shown in browse mode (no active query). Displays either recent searches (from `useRecentSearches` hook) or hardcoded popular areas.

### Data Sources

**Recent searches:** From `useRecentSearches()` hook (backed by localStorage).

**Popular areas (fallback):**
Austin TX, San Francisco CA, New York NY, Los Angeles CA, Chicago IL, Seattle WA, Denver CO, Portland OR.

### Rendering

- If recent searches exist: shows them with a clock icon and "Recent searches" heading
- Otherwise: shows popular areas with a trending icon and "Popular areas" heading
- Each item links to `/search?q={location}`

---

## SearchResultsLoadingWrapper

**File:** `src/components/search/SearchResultsLoadingWrapper.tsx`

**Purpose:** Overlay wrapper that shows a loading indicator during filter/sort transitions without hiding current results.

### State

- Consumes `SearchTransitionContext` via `useSearchTransitionSafe()` for `isPending` and `isSlowTransition`
- Focuses `#search-results-heading` when search params change (skips initial mount)
- Announces result count to screen readers when transition completes

### UX Design

- Current results remain visible (no content flash)
- Translucent white overlay dims content during loading (`bg-white/40`)
- Floating pill spinner at top: "Updating results..." or "Still loading..." for slow transitions
- Both overlays are `pointer-events-none` so content remains scrollable

### Accessibility

- `aria-busy` on the wrapper reflects pending state
- `aria-live="polite"` region announces updated result count text
- Focus management: auto-focuses the results heading after param changes

---

## FloatingMapButton

**File:** `src/components/search/FloatingMapButton.tsx`

**Purpose:** Fixed floating pill at the bottom center of the mobile viewport. Toggles between map-focused and list-focused views.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `isListMode` | `boolean` | Whether the bottom sheet is showing list content |
| `resultCount` | `number?` | Number of results (shown on the "List" label) |
| `onToggle` | `() => void` | Toggle between map and list views |

### Animation

Uses `framer-motion` (`LazyMotion` with `domAnimation` for tree-shaking). Spring animation on enter/exit with scale and opacity transitions.

### Haptics

Calls `triggerHaptic()` on click for tactile feedback on supported devices.

### Responsive

- `md:hidden` -- only visible on mobile
- Fixed position: `bottom-6 left-1/2 -translate-x-1/2`

### Accessibility

- `aria-label` switches between "Show map" and "Show list"

---

## SplitStayCard

**File:** `src/components/search/SplitStayCard.tsx`

**Purpose:** Displays a pair of listings that together cover a long-duration stay. Shown when no single listing spans the full requested period (6+ months).

### Props

| Prop | Type | Description |
|------|------|-------------|
| `pair` | `SplitStayPair` | Object with `first`, `second` listings, `combinedPrice`, and `splitLabel` |

### SplitStayPair Interface

```tsx
interface SplitStayPair {
  first: ListingData;
  second: ListingData;
  combinedPrice: number;
  splitLabel: string; // e.g., "3mo + 3mo"
}
```

### Layout

- Header: "Split Stay" badge with split label (e.g., "3mo + 3mo")
- Two-column grid: First listing on left, second on right
- Connecting arc SVG between the two halves (decorative, `aria-hidden`)
- Footer: Combined total price

### Sub-component: SplitStayHalf

Internal component rendering one half of the split stay with image, title, and monthly price. Each half is a `<Link>` to the listing detail page.

---

## Barrel Export

**File:** `src/components/search/index.ts`

Re-exports the three core presentational components used by `SearchForm`:

```tsx
export { FilterPill } from './FilterPill';
export { FilterModal } from './FilterModal';
export { CategoryTabs } from './CategoryTabs';
```

Other components (`CategoryBar`, `CompactSearchPill`, `SearchResultsClient`, etc.) are imported directly by their consumers.
