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
- [MobileBottomSheet](#mobilebottomsheet)
- [MobileSearchOverlay](#mobilesearchoverlay)
- [MobileListingPreview](#mobilelistingpreview)
- [MobileCardLayout](#mobilecardlayout)
- [PullToRefresh](#pulltorefresh)
- [V1PathResetSetter](#v1pathresetsetter)
- [V2MapDataSetter](#v2mapdatasetter)
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
  +-- MobileBottomSheet (mobile only)
        +-- PullToRefresh
        +-- Search results content
  +-- FloatingMapButton (mobile only)
  +-- MobileSearchOverlay (mobile only)
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
| `onLanguageSearchChange` | `(value: string) => void` | Language search change handler |
| `filteredLanguages` | `string[]` | Filtered language codes to display |
| `minMoveInDate` | `string` | Minimum selectable move-in date |
| `amenityOptions` | `readonly string[]` | Available amenity options |
| `houseRuleOptions` | `readonly string[]` | Available house rule options |
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

1. **Price Range** -- `PriceRangeFilter` with histogram visualization (only renders if `onPriceChange` is provided)
2. **Move-in Date** -- `DatePicker` component with `minDate` constraint
3. **Lease Duration** -- Select with options: Any, Month-to-month, 3 months, 6 months, 12 months, Flexible
4. **Room Type** -- Select with facet counts: Any, Private Room, Shared Room, Entire Place; zero-count options are disabled
5. **Amenities** -- Toggle pills with facet counts; `aria-pressed` state; disabled if count is zero and not currently selected
6. **House Rules** -- Toggle pills with facet counts; disabled if count is zero and not currently selected
7. **Languages** -- Search input + selected chips (with border separator) + available chips; "Can Communicate In" label with helper text
8. **Gender Preference** -- Select: Any, Male Identifying Only, Female Identifying Only, Any Gender / All Welcome
9. **Household Gender** -- Select: Any, All Male, All Female, Mixed (Co-ed)

### Accessibility

- `role="dialog"` with `aria-modal="true"` and `aria-labelledby="filter-drawer-title"`
- `FocusTrap` wraps the drawer to keep keyboard focus inside
- Backdrop click closes the drawer with `aria-label="Close filters"`
- All filter groups use `<fieldset>`/`<legend>` or `<label>` associations
- Toggle buttons use `aria-pressed` and `aria-disabled`
- Close button has `aria-label="Close filters"`

### Rendering

Rendered via `createPortal` to `document.body`. Returns `null` when `!isOpen` or during SSR (`typeof document === 'undefined'`).

### Footer

- "Clear all" button: shown when `hasActiveFilters` is true; has `data-testid="filter-modal-clear-all"`
- Apply button: shows dynamic count from `formattedCount` (e.g., "Show 42 places") or "Show Results" as fallback
- A loading spinner appears while `isCountLoading` is true
- Button is disabled when `boundsRequired` is true (map bounds not yet available)
- Apply button has `data-testid="filter-modal-apply"`

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

- **active**: Dark background (`bg-zinc-900 dark:bg-white`), white/dark text, hover `bg-zinc-700 dark:hover:bg-zinc-200`
- **default**: Light background (`bg-zinc-100 dark:bg-zinc-800`), dark/light text, hover `bg-zinc-200 dark:hover:bg-zinc-700`

### Exports

Both named and default exports:
```tsx
export function FilterPill({ ... }) { ... }
export default FilterPill;
```

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

**Max pills shown:** 5 (`MAX_PILLS = 5`)

**Filtering logic:** Array params (amenities, houseRules) check comma-separated values. `maxPrice` checks if existing value is higher. Scalar params check exact match. Already-applied filters are excluded.

**On click:** Merges the suggestion param into the current URL params (appends to comma-separated arrays), deletes `cursor` and `page`, and navigates via `router.push`.

### Visual Design

- Horizontally scrollable container with `overflow-x-auto scrollbar-hide`
- Sparkles icon prefix with "Try:" label
- Pills: rounded-full bordered buttons with hover states
- Disabled state during transition with `disabled:opacity-60 disabled:cursor-not-allowed`

### Exports

Both named and default exports:
```tsx
export function RecommendedFilters() { ... }
export default RecommendedFilters;
```

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

### Local State

- `localMin` / `localMax` -- Local state for immediate visual feedback during drag
- `isDragging` ref -- Prevents external prop sync from overwriting during active drag
- Props sync back to local state when they change externally (e.g., "Clear all" reset) only when not dragging

### Constants

- `HISTOGRAM_HEIGHT = 80` -- Height of histogram in pixels

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

- Formats prices: values >= 10000 shown as `$Xk`, otherwise `toLocaleString()`
- Shows "+" suffix when max price equals absoluteMax (e.g., "$10,000+")
- Range label displayed in header: `$min – $max` or `$min – $max+`

### Accessibility

- `aria-label="Price range"` on the slider root
- `aria-label="Minimum price"` / `"Maximum price"` on each thumb
- Focus ring on thumbs (`focus:ring-2`)
- Keyboard navigation supported via Radix primitives
- Cursor changes: `cursor-grab` default, `active:cursor-grabbing` during drag

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

- Each bar height is proportional to `bucket.count / maxCount` with minimum height of 2px
- Bars where `bucket.max > selectedMin && bucket.min < selectedMax` are highlighted (dark: `--color-zinc-900`)
- Bars outside selected range are dimmed (light: `--color-zinc-200`)
- Skeleton uses pre-computed `SKELETON_HEIGHTS` array: `[45, 72, 33, 58, 80, 25, 67, 41, 55, 38, 75, 50]` (no `Math.random()` during render to avoid hydration mismatches)
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

| ID | Label | Icon | Params Applied |
|----|-------|------|---------------|
| `entire` | Entire Place | `Building2` | `roomType=Entire Place` |
| `private` | Private Room | `Home` | `roomType=Private Room` |
| `transit` | Near Transit | `Train` | `amenities=Near Transit` |
| `pet` | Pet Friendly | `PawPrint` | `houseRules=Pets allowed` |
| `furnished` | Furnished | `Sofa` | `amenities=Furnished` |
| `shortTerm` | Short Term | `CalendarClock` | `leaseDuration=Month-to-month` |
| `budget` | Under $1000 | `DollarSign` | `maxPrice=1000` |
| `shared` | Shared Room | `Users` | `roomType=Shared Room` |
| `wifi` | Wifi | `Sparkles` | `amenities=Wifi` |

### Hooks and State

- `useSearchParams()` / `useRouter()` / `usePathname()` for URL management
- `useTransition()` for non-blocking navigation (`isPending` disables buttons during transition)
- `scrollRef` -- ref to the scrollable container
- `canScrollLeft` / `canScrollRight` -- booleans control arrow button visibility

### Helper Functions

**`isCategoryActive(categoryParams, searchParams)`**:
Checks if a category's params match the current URL. For array params (amenities, houseRules), checks both `getAll()` results and comma-separated values within a single param.

### Scroll Overflow Detection

- `checkOverflow()` callback calculates if scroll arrows should appear
- `ResizeObserver` and `scroll` event listener (passive) trigger `checkOverflow()`
- Scroll threshold: 2px tolerance for edge detection

### Toggle Behavior

**`handleSelect(categoryParams)`**:
- If category is active: removes its params from URL (handles comma-separated array values)
- If category is inactive: adds/merges params (array params append if not already present)
- Always resets pagination by deleting `cursor` and `page` params
- Uses `startTransition()` for non-blocking navigation

### Accessibility

- `role="navigation"` with `aria-label="Category filters"` on container
- Each button has `aria-pressed` reflecting active state
- Scroll arrows have descriptive `aria-label`: "Scroll categories left" / "Scroll categories right"
- Fade edge gradients are `aria-hidden="true"`
- Buttons disabled during pending transition with `disabled:opacity-60 disabled:cursor-not-allowed`

### Responsive

- Scroll arrows (`ChevronLeft`/`ChevronRight`) are `hidden md:flex` -- touch scrolling only on mobile
- Category buttons have `min-w-[72px]` for consistent sizing
- Fade gradients on left/right edges when content overflows

### Exports

Both named and default exports:
```tsx
export function CategoryBar() { ... }
export default CategoryBar;
```

---

## CategoryTabs

**File:** `src/components/search/CategoryTabs.tsx`

**Purpose:** Segmented control for quick room-type filtering (All / Private / Shared / Entire). Pure presentational component -- receives state via props. Used inline in SearchForm.

### Props

```tsx
interface CategoryTabsProps {
  selectedRoomType: string;
  onRoomTypeChange: (value: string) => void;
}
```

| Prop | Type | Description |
|------|------|-------------|
| `selectedRoomType` | `string` | Current room type value (empty string for "Any") |
| `onRoomTypeChange` | `(value: string) => void` | Change handler; receives empty string `''` for "Any" selection |

### Options

Defined as `ROOM_TYPE_OPTIONS` constant:

| Value | Label | Icon |
|-------|-------|------|
| `any` | All | `LayoutGrid` |
| `Private Room` | Private | `Home` |
| `Shared Room` | Shared | `Users` |
| `Entire Place` | Entire | `Building2` |

### Selection Logic

```tsx
const isSelected = selectedRoomType === value || (!selectedRoomType && value === 'any');
```

When clicked, returns empty string for 'any' value, otherwise returns the value directly:
```tsx
onClick={() => onRoomTypeChange(value === 'any' ? '' : value)}
```

### Responsive

- Labels (`<span>`) have `hidden sm:inline` -- only icons shown on mobile
- Padding adjusts: `px-3 sm:px-4`
- Minimum touch target: `min-h-[44px]`

### Accessibility

- Each button has `aria-pressed` reflecting selection state
- No explicit `aria-label` (relies on visible text label on desktop, icon-only on mobile)

### Styling

- Container: `flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl`
- Selected state: `bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm`
- Unselected state: `text-zinc-700 dark:text-zinc-300` with hover states
- Transition: `transition-all duration-200`

### Exports

Both named and default exports:
```tsx
export function CategoryTabs({ ... }) { ... }
export default CategoryTabs;
```

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
- **Segments:** Location (or "Anywhere"), price range formatted as "$min–$max" or "$min+" or "Up to $max", room type, lease duration
- **Filter count:** Counts all active filters including: moveInDate, leaseDuration, roomType, genderPreference, householdGender, amenities (split by comma), houseRules (split by comma), minPrice, maxPrice

### Responsive

- Entire component is `hidden md:flex` -- desktop only
- Text segments are separated by vertical dividers (`w-px h-4 bg-zinc-200`)

### Accessibility

- Main button: `aria-label="Expand search form"`
- Filter button: `aria-label="Filters (N active)"` with badge count when active

### Visual Design

- Main button: rounded-full with shadow, border, hover shadow-md
- Search icon prefix
- First segment (location) is bold, subsequent segments are muted
- Filter button: circular with SlidersHorizontal icon, badge shows filter count if > 0

### Exports

Both named and default exports:
```tsx
export function CompactSearchPill({ ... }) { ... }
export default CompactSearchPill;
```

---

## DatePills

**File:** `src/components/search/DatePills.tsx`

**Purpose:** Horizontal scrollable row of alternative date suggestions showing cheaper date ranges. Encourages flexibility by displaying lower-priced alternatives.

### Props

```tsx
interface DatePillsProps {
  suggestions: DateSuggestion[];
}
```

| Prop | Type | Description |
|------|------|-------------|
| `suggestions` | `DateSuggestion[]` | Array of date options with label, avgPrice, and params |

### DateSuggestion Interface

Exported interface:

```tsx
export interface DateSuggestion {
  /** Display label, e.g. "Feb 15 – Mar 15" */
  label: string;
  /** Average price for this date range */
  avgPrice: number;
  /** Search params to apply when selected */
  params: string;
}
```

### Hooks

- `useRouter()` for navigation
- `useSearchParams()` for current URL params

### Behavior

**`handleSelect(params)`**:
- Creates new `URLSearchParams` from current params
- Merges suggestion's params (iterates over new params and sets each)
- Navigates to `/search?{mergedParams}`

Returns `null` if `suggestions.length === 0`.

### Display

- Header text: "Flexible dates? Try these for lower prices:"
- Each pill shows:
  - Date range label (e.g., "Feb 15 – Mar 15") in `text-zinc-700`
  - Price indicator in green: `~${avgPrice}/mo` formatted with `toLocaleString('en-US', { maximumFractionDigits: 0 })`
- Horizontally scrollable container with `overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none`
- Pills styled as rounded-full bordered buttons with hover states

### Exports

Both named and default exports:
```tsx
export function DatePills({ suggestions }: DatePillsProps) { ... }
export default DatePills;
```

---

## TotalPriceToggle

**File:** `src/components/search/TotalPriceToggle.tsx`

**Purpose:** Switch between monthly and total price display in search results. Renders as a compact toggle in the search results header.

### Props

```tsx
interface TotalPriceToggleProps {
  showTotal: boolean;
  onToggle: (showTotal: boolean) => void;
}
```

| Prop | Type | Description |
|------|------|-------------|
| `showTotal` | `boolean` | Current toggle state |
| `onToggle` | `(showTotal: boolean) => void` | State change handler (receives the new value) |

### Persistence

**`handleToggle()`**:
- Toggles state and calls `onToggle(next)`
- Stores preference in `sessionStorage` under key `'showTotalPrice'` as JSON boolean
- Wrapped in try/catch for SSR and private browsing compatibility (sessionStorage may be unavailable)

```tsx
const handleToggle = useCallback(() => {
  const next = !showTotal;
  onToggle(next);
  try {
    sessionStorage.setItem('showTotalPrice', JSON.stringify(next));
  } catch {
    // sessionStorage unavailable (SSR, private browsing)
  }
}, [showTotal, onToggle]);
```

### Accessibility

- `role="switch"` on the toggle button
- `aria-checked={showTotal}` reflects current state
- `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2` for keyboard users
- Wrapped in a `<label>` element for click-to-toggle behavior

### Visual Design

- Label text: "Show total price"
- Toggle track: `h-5 w-9 rounded-full`
- Toggle thumb: `h-3.5 w-3.5 rounded-full` with shadow
- Active state: dark track (`bg-zinc-900 dark:bg-white`)
- Inactive state: light track (`bg-zinc-300 dark:bg-zinc-600`)
- Thumb position: `translate-x-[18px]` when on, `translate-x-[3px]` when off

### Exports

Both named and default exports:
```tsx
export function TotalPriceToggle({ showTotal, onToggle }: TotalPriceToggleProps) { ... }
export default TotalPriceToggle;
```

---

## SuggestedSearches

**File:** `src/components/search/SuggestedSearches.tsx`

**Purpose:** Shown in browse mode (no active query). Displays either recent searches (from `useRecentSearches` hook) or hardcoded popular areas as a fallback.

### Data Sources

**Recent searches:** From `useRecentSearches()` hook, backed by localStorage.

**Popular areas (fallback):** Hardcoded `POPULAR_AREAS` constant:

| Label | Query Parameter |
|-------|-----------------|
| Austin, TX | `Austin, TX` |
| San Francisco, CA | `San Francisco, CA` |
| New York, NY | `New York, NY` |
| Los Angeles, CA | `Los Angeles, CA` |
| Chicago, IL | `Chicago, IL` |
| Seattle, WA | `Seattle, WA` |
| Denver, CO | `Denver, CO` |
| Portland, OR | `Portland, OR` |

### Rendering Logic

**If recent searches exist**:
- Header: Clock icon + "Recent searches" heading
- Items keyed by `search.location`
- Links to `/search?q=${encodeURIComponent(search.location)}`

**Otherwise**:
- Header: TrendingUp icon + "Popular areas" heading
- Items keyed by `area.q`
- Links to `/search?q=${encodeURIComponent(area.q)}`

### Visual Design

- Container: `py-6`
- Header: flex with gap-2, icon `w-4 h-4 text-zinc-400`, heading `text-sm font-medium text-zinc-600 dark:text-zinc-400`
- Items: `flex flex-wrap gap-2`
- Each pill: rounded-full link with `MapPin` icon, hover states for light/dark mode
- Link styling: `px-3 py-2 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700`

### Icons Used

- `Clock` -- Recent searches header
- `TrendingUp` -- Popular areas header
- `MapPin` -- Each search/area pill

### Export

Default export only:
```tsx
export default function SuggestedSearches() { ... }
```

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
- Floating pill spinner at top: "Updating results..." or "Still loading..." for slow transitions
- Both overlays are `pointer-events-none` so content remains scrollable
- Translucent overlay dims content during loading (`bg-white/40 dark:bg-zinc-950/40`) at `z-[5]`
- Loading pill at `z-10` with backdrop blur

### Accessibility

- `aria-busy` on the wrapper reflects pending state
- `aria-live="polite"` region with `role="status"` announces updated result count text
- Focus management: auto-focuses the results heading after param changes (skips initial mount)

---

## FloatingMapButton

**File:** `src/components/search/FloatingMapButton.tsx`

**Purpose:** Fixed floating pill at the bottom center of the mobile viewport. Toggles between map-focused and list-focused views.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `isListMode` | `boolean` | Whether the bottom sheet is showing list content (half or expanded) |
| `resultCount` | `number?` | Number of results (shown on the "List" label as "List · N") |
| `onToggle` | `() => void` | Toggle between map and list views |

### Animation

Uses `framer-motion` (`LazyMotion` with `domAnimation` for tree-shaking). Spring animation on enter/exit with scale and opacity transitions:
- Initial: `scale: 0.9, opacity: 0`
- Animate: `scale: 1, opacity: 1`
- Exit: `scale: 0.9, opacity: 0`
- Transition: spring with `stiffness: 500, damping: 30`

### Haptics

Calls `triggerHaptic()` from `@/lib/haptics` on click for tactile feedback on supported devices.

### Responsive

- `md:hidden` -- only visible on mobile
- Fixed position: `bottom-6 left-1/2 -translate-x-1/2`
- z-index: `z-50`

### Visual Design

- Dark pill: `bg-zinc-900 dark:bg-white text-white dark:text-zinc-900`
- Shadow: `shadow-xl shadow-zinc-900/30 dark:shadow-black/20`
- Active scale: `active:scale-95`
- Icons: `Map` for map mode, `List` for list mode

### Accessibility

- `aria-label` switches between "Show map" and "Show list"

### Export

Default export only:
```tsx
export default function FloatingMapButton({ ... }) { ... }
```

---

## SplitStayCard

**File:** `src/components/search/SplitStayCard.tsx`

**Purpose:** Displays a pair of listings that together cover a long-duration stay. Shown when no single listing spans the full requested period (6+ months).

### Props

| Prop | Type | Description |
|------|------|-------------|
| `pair` | `SplitStayPair` | Object with `first`, `second` listings, `combinedPrice`, and `splitLabel` |

### SplitStayPair Interface

From `@/lib/search/split-stay`:

```tsx
interface SplitStayPair {
  first: ListingData;
  second: ListingData;
  combinedPrice: number;
  splitLabel: string; // e.g., "3mo + 3mo"
}
```

### Layout

- Header: "Split Stay · {splitLabel}" badge (e.g., "Split Stay · 3mo + 3mo") in uppercase tracking-wide
- Two-column grid with divider: First listing on left ("First stay"), second on right ("Then")
- Connecting arc SVG between the two halves (decorative, `aria-hidden`)
- Footer: "Combined total" label with combined price formatted as currency

### Sub-component: SplitStayHalf

Internal component rendering one half of the split stay:
- Small uppercase label ("First stay" or "Then")
- Image with 4/3 aspect ratio
- Title (line-clamp-1)
- Monthly price
- Each half is a `<Link>` to `/listings/${listing.id}` with hover state

### Exports

Both named and default exports:
```tsx
export function SplitStayCard({ pair }: SplitStayCardProps) { ... }
export default SplitStayCard;
```

---

## MobileBottomSheet

**File:** `src/components/search/MobileBottomSheet.tsx`

**Purpose:** Draggable bottom sheet for mobile search results. Overlays the map and snaps to 3 positions.

### Snap Points

```tsx
const SNAP_COLLAPSED = 0.15; // ~15vh - just header peek
const SNAP_HALF = 0.5;       // ~50vh - half screen
const SNAP_EXPANDED = 0.85;  // ~85vh - near full
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | Sheet content |
| `headerText` | `string?` | Result count text shown in the sheet header (default: "Search results") |
| `snapIndex` | `number?` | Controlled snap index (0=collapsed, 1=half, 2=expanded) |
| `onSnapChange` | `(index: number) => void?` | Callback when snap index changes |
| `onRefresh` | `() => Promise<void>?` | Called when pull-to-refresh gesture completes |

### Gesture Handling

- **Drag threshold:** 40px minimum to trigger snap change
- **Flick velocity:** 0.4 px/ms threshold for quick gestures
- **Max overscroll:** 80px with rubber-band resistance effect
- **Spring config:** `{ stiffness: 400, damping: 30, mass: 0.8 }`

### Gesture Behavior

- Drag the handle/header to resize
- When expanded and scrolled to top, dragging down collapses
- Flick velocity determines snap direction
- Rubber-band effect at sheet edges (exponential dampening)
- Touch cancel resets drag state (handles system interruptions)

### Keyboard

- Escape key collapses sheet to half position (index 1)

### Body Scroll Lock

- Body scroll is locked (`overflow: hidden`) when sheet is expanded (index 2)

### Visual Elements

- Dim overlay behind sheet when expanded (opacity 0.3)
- Drag handle: visual bar `w-10 h-1 rounded-full bg-zinc-300`
- Expand/Collapse button in header (hidden when collapsed)
- "Pull up for listings" hint when collapsed

### Accessibility

- `role="region"` with `aria-label="Search results"`
- Expand/collapse button has `aria-label="Collapse results"` or `"Expand results"`

### Pull to Refresh

If `onRefresh` prop is provided, wraps children in `PullToRefresh` component (disabled when collapsed).

### Export

Default export only:
```tsx
export default function MobileBottomSheet({ ... }) { ... }
```

---

## MobileSearchOverlay

**File:** `src/components/search/MobileSearchOverlay.tsx`

**Purpose:** Full-screen search overlay for mobile. Slides up when compact search bar is tapped. Shows recent searches and an input field.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `isOpen` | `boolean` | Whether the overlay is open |
| `onClose` | `() => void` | Close the overlay |
| `onSearch` | `(query: string) => void` | Called when user selects a recent search or submits |
| `currentQuery` | `string?` | Current search query (default: "") |

### Behavior

- Auto-focuses input when opened (100ms delay for animation)
- Escape key closes overlay
- Body scroll locked when open
- Recent searches displayed with remove buttons
- Form submission calls `onSearch` and closes

### Animation

Spring animation slide-up from bottom:
- `y: "100%"` → `y: 0`
- Transition: `{ type: "spring", stiffness: 400, damping: 35 }`

### Visual Layout

- Header with back button (ArrowLeft) and search input
- Search input: rounded-full with Search icon prefix
- Recent searches list with Clock icons
- Each recent search has remove button (X icon)
- Empty state: "No recent searches"

### Accessibility

- Back button: `aria-label="Back"`
- Remove button: `aria-label="Remove {location} from recent searches"`

### Responsive

- `md:hidden` on container - mobile only
- z-index: `z-[60]`

### Export

Default export only:
```tsx
export default function MobileSearchOverlay({ ... }) { ... }
```

---

## MobileListingPreview

**File:** `src/components/search/MobileListingPreview.tsx`

**Purpose:** Horizontal swipeable listing preview strip for mobile half-sheet mode. Shows one listing at a time with snap-scroll between them.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `activeListingId` | `string \| null` | Currently active/selected listing ID |
| `listingIds` | `string[]` | All listing IDs in order |
| `onListingChange` | `(id: string) => void?` | Called when user swipes to a different listing |
| `renderPreview` | `(id: string) => ReactNode` | Render function for a single listing preview card |

### Behavior

- Scrolls to active listing when `activeListingId` changes externally (e.g., pin tap)
- Detects which listing is centered after scroll ends and calls `onListingChange`
- Uses `scrollTo` with smooth behavior for programmatic scrolling
- Debounces scroll detection with `requestAnimationFrame`

### Visual Layout

- Horizontal scroll with snap: `snap-x snap-mandatory`
- Each card: `flex-shrink-0 w-full snap-center px-4 py-2`
- Hidden scrollbar: `scrollbar-hide`

### Returns

Returns `null` if `listingIds.length === 0`.

### Export

Default export only:
```tsx
export default function MobileListingPreview({ ... }) { ... }
```

---

## MobileCardLayout

**File:** `src/components/search/MobileCardLayout.tsx`

**Purpose:** Mobile-optimized card layout wrapper for search results. Provides different layouts for mobile vs desktop.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | Card content to render |

### Layout Behavior

**On mobile (`<md`):**
- Full-bleed images (no horizontal padding, no rounded corners on images)
- `touch-action: pan-y` on carousel areas to prevent vertical scroll during horizontal swipe
- Single-column layout with tighter spacing
- Border-bottom dividers between cards

**On desktop (`≥md`):**
- Standard 2-column grid layout with rounded images
- Gap: `gap-4 sm:gap-x-6 sm:gap-y-8`
- Padding: `p-4`

### CSS-in-JS Styles

Uses `<style jsx>` for mobile-specific overrides:
- Removes card image rounding on mobile
- Sets `touch-action: pan-y` on embla carousels
- Adds border-bottom dividers with `--border-color` CSS variable

### Export

Default export only:
```tsx
export default function MobileCardLayout({ children }: MobileCardLayoutProps) { ... }
```

---

## PullToRefresh

**File:** `src/components/search/PullToRefresh.tsx`

**Purpose:** Pull-to-refresh wrapper for mobile list views. Shows an animated indicator when pulling down from the top of the content.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | Content to wrap |
| `onRefresh` | `() => Promise<void>` | Called when pull gesture completes. Should return a promise that resolves when refresh is done. |
| `enabled` | `boolean?` | Whether pull-to-refresh is enabled (default: true) |

### Constants

- `PULL_THRESHOLD = 60` -- Pixels to pull before refresh triggers
- `MAX_PULL = 100` -- Maximum pull distance with dampening

### State

- `pullDistance` -- Current pull distance in pixels
- `isRefreshing` -- Whether refresh is in progress
- `isPulling` -- Whether user is actively pulling

### Gesture Behavior

- Only activates when `enabled` and `scrollTop <= 0`
- Pull distance is dampened: `Math.min(MAX_PULL, dy * 0.5)`
- When release and `pullDistance >= PULL_THRESHOLD`: triggers refresh
- Holds indicator at 60% of threshold during refresh

### Visual Indicator

- Shows when `pullDistance > 10` or `isRefreshing`
- ArrowDown icon rotates 180deg when threshold reached
- Loader2 spinner during refresh
- Height animates with pull distance

### Export

Default export only:
```tsx
export default function PullToRefresh({ ... }) { ... }
```

---

## V1PathResetSetter

**File:** `src/components/search/V1PathResetSetter.tsx`

**Purpose:** Side-effect-only component that resets V2 search context state when the V1 fallback search path runs. This is the mirror of `V2MapDataSetter`.

### Problem Solved

- `SearchV2DataContext` state persists at layout level across page navigations
- When V2 search fails, `V2MapDataSetter` doesn't render (no V2 data available)
- But `isV2Enabled` stays `true` from the previous successful V2 search
- `PersistentMapWrapper`'s race guard would loop forever waiting for V2 data that will never arrive

### Solution

When the V1 fallback path runs, this component explicitly resets:
- `isV2Enabled = false` (stops race guard from waiting for V2 data)
- `v2MapData = null` (clears any stale V2 data)

### Implementation

```tsx
export function V1PathResetSetter() {
  const { setV2MapData, setIsV2Enabled } = useSearchV2Data();

  useEffect(() => {
    // Reset v2 state to signal "v1 mode active"
    // This breaks the race guard loop in PersistentMapWrapper
    setIsV2Enabled(false);
    setV2MapData(null);
    // No cleanup needed - see comments in source
  }, [setV2MapData, setIsV2Enabled]);

  // Render nothing - this is a side-effect-only component
  return null;
}
```

### Related Components

- `V2MapDataSetter` -- The V2 success path equivalent
- `PersistentMapWrapper` -- Contains the race guard that depends on this state
- `SearchV2DataContext` -- The context being reset

### Export

Named export only:
```tsx
export function V1PathResetSetter() { ... }
```

---

## V2MapDataSetter

**File:** `src/components/search/V2MapDataSetter.tsx`

**Purpose:** Client component that injects V2 map data into `SearchV2DataContext`. Rendered by page.tsx when V2 mode is enabled.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `data` | `V2MapData` | V2 map data to inject into context |

### Behavior

- Runs on mount to set context data before `PersistentMapWrapper` reads it
- Sets `isV2Enabled = true` to signal V2 mode is active
- Sets `v2MapData` with the provided data and current `dataVersion`
- No cleanup function to prevent race condition during "search as I move" (new data should overwrite old data)

### Data Flow

```
page.tsx → V2MapDataSetter → context → PersistentMapWrapper
```

### Implementation

```tsx
export function V2MapDataSetter({ data }: V2MapDataSetterProps) {
  const { setV2MapData, setIsV2Enabled, dataVersion } = useSearchV2Data();

  useEffect(() => {
    setIsV2Enabled(true);
    setV2MapData(data, dataVersion);
    // NOTE: Cleanup intentionally removed to prevent race condition
  }, [data, dataVersion, setV2MapData, setIsV2Enabled]);

  return null;
}
```

### Related Components

- `V1PathResetSetter` -- The V1 fallback path equivalent
- `PersistentMapWrapper` -- Consumes the context data
- `SearchV2DataContext` -- The context being set

### Export

Named export only:
```tsx
export function V2MapDataSetter({ data }: V2MapDataSetterProps) { ... }
```

---

## Barrel Export

**File:** `src/components/search/index.ts`

Re-exports the three core presentational components used by `SearchForm`:

```tsx
/**
 * Search UI Components
 *
 * Presentational components for the search page filter UI.
 * All filter state and URL-sync logic remains in SearchForm.tsx.
 */

export { FilterPill } from './FilterPill';
export { FilterModal } from './FilterModal';
export { CategoryTabs } from './CategoryTabs';
```

Other components (`CategoryBar`, `CompactSearchPill`, `SearchResultsClient`, `DatePills`, `TotalPriceToggle`, `SuggestedSearches`, `MobileBottomSheet`, `MobileSearchOverlay`, `MobileListingPreview`, `MobileCardLayout`, `PullToRefresh`, `V1PathResetSetter`, `V2MapDataSetter`, etc.) are imported directly by their consumers.
