# Mobile Search Experience & Components

Technical documentation for the Roomshare mobile search interface. This covers all components involved in the mobile search flow: bottom sheet, search overlays, listing previews, gesture handling, filter chips, and the search form.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [MobileBottomSheet](#mobilebottomsheet)
- [MobileSearchOverlay](#mobilesearchoverlay)
- [MobileCardLayout](#mobilecardlayout)
- [MobileListingPreview](#mobilelistingpreview)
- [PullToRefresh](#pulltorefresh)
- [CollapsedMobileSearch](#collapsedmobilesearch)
- [SearchForm](#searchform)
- [LocationSearchInput](#locationsearchinput)
- [SaveSearchButton](#savesearchbutton)
- [FilterChip](#filterchip)
- [FilterChipWithImpact](#filterchipwithimpact)
- [AppliedFilterChips](#appliedfilterchips)
- [Component Relationship Diagram](#component-relationship-diagram)

---

## Architecture Overview

The mobile search experience is built around a **map + bottom sheet** pattern. On screens below the `md` breakpoint (768px), the map fills the viewport and search results appear inside a draggable `MobileBottomSheet`. The compact `CollapsedMobileSearch` bar sits at the top; tapping it opens `MobileSearchOverlay` as a full-screen takeover.

Key design decisions:

- **Bottom sheet owns scroll** -- the sheet manages its own content scrolling and prevents body scroll when expanded.
- **Touch events are partitioned** -- drag gestures on the sheet handle resize the sheet; all other touches pass through to the map.
- **URL is source of truth for filters** -- components read from `useSearchParams()` and push new URLs on change. Filter state is ephemeral in `SearchForm` until submission.
- **framer-motion (LazyMotion)** powers all animations, loaded on-demand via `domAnimation` to minimize bundle cost.

---

## MobileBottomSheet

**File**: `src/components/search/MobileBottomSheet.tsx`

**Purpose**: Draggable bottom sheet overlay for mobile search results. Sits over the map and snaps to three vertical positions.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | -- | Sheet content (listing cards) |
| `headerText` | `string` | `"Search results"` | Text shown in the sheet header |
| `snapIndex` | `number` | -- | Controlled snap index (0/1/2). If omitted, internally managed (starts at 1 = half). |
| `onSnapChange` | `(index: number) => void` | -- | Called when snap position changes |
| `onRefresh` | `() => Promise<void>` | -- | Pull-to-refresh callback. Wraps children in `PullToRefresh` when provided. |

### Snap Points

| Index | Constant | Viewport Height | Behavior |
|-------|----------|----------------|----------|
| 0 | `SNAP_COLLAPSED` | 0.15 (~15vh) | Header peek only. Content scroll disabled. Shows "Pull up for listings" hint. |
| 1 | `SNAP_HALF` | 0.5 (~50vh) | Default starting position. Content scrollable. Map visible above. |
| 2 | `SNAP_EXPANDED` | 0.85 (~85vh) | Near full-screen. Body scroll locked. Dim overlay behind sheet (opacity 0.3). |

### Touch & Gesture Handling

The sheet uses raw touch events (not framer-motion drag) for precise control:

```tsx
// Drag constants
const DRAG_THRESHOLD = 40;   // px minimum to trigger snap change
const FLICK_VELOCITY = 0.4;  // px/ms for flick detection
const MAX_OVERSCROLL = 80;   // px rubber-band limit
```

**Handle area drag** (`onTouchStart/Move/End` on the header div):
- Tracks `dragStartY`, computes `dragOffset` on move.
- On touch end, calculates velocity (`dragOffset / elapsed`).
- Flick up (velocity < -0.4) advances to next higher snap; flick down advances lower.
- Small drags below threshold are ignored (snap position unchanged).

**Content area drag** (`handleContentTouchStart`):
- Only activates when sheet is expanded (index 2) AND content is scrolled to top (`scrollTop <= 0`).
- Dragging down from scrolled-to-top collapses the sheet.
- If content has `scrollTop > 0`, drag is cancelled and native scroll takes over.

**Rubber-band effect**:

```tsx
const getRubberbandOffset = (rawOffset: number): number => {
  // Exponential dampening past sheet edges
  const dampened = MAX_OVERSCROLL * (1 - Math.exp(-excess / MAX_OVERSCROLL));
  // ...
};
```

Dragging past collapsed or expanded limits produces diminishing-return resistance that snaps back on release.

**Animation**: Spring-based via framer-motion with `{ stiffness: 400, damping: 30, mass: 0.8 }`. During active drag, height is set directly in pixels with zero-duration transition for instant feedback.

### Accessibility

- `role="region"` with `aria-label="Search results"`
- Escape key collapses to half position (index 1)
- Expand/Collapse button in header with dynamic `aria-label` (shown when not collapsed)
- Body `overflow: hidden` when expanded to prevent background scroll

### Connection to Other Components

- Wraps children in `PullToRefresh` when `onRefresh` is provided.
- Typically receives `MobileCardLayout` with listing cards as children.
- Parent page controls `snapIndex` to coordinate with map pin taps.

---

## MobileSearchOverlay

**File**: `src/components/search/MobileSearchOverlay.tsx`

**Purpose**: Full-screen search input overlay for mobile. Slides up when the collapsed search bar is tapped.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | `boolean` | -- | Controls visibility |
| `onClose` | `() => void` | -- | Closes the overlay |
| `onSearch` | `(query: string) => void` | -- | Called on submit or recent search selection |
| `currentQuery` | `string` | `""` | Pre-fills the input |

### Behavior

- **Slide-up animation**: `y: "100%"` to `y: 0` with spring physics (`stiffness: 400, damping: 35`).
- **Auto-focus**: Input receives focus 100ms after opening (delayed to let animation start).
- **Body scroll lock**: `overflow: hidden` on body while open.
- **Escape closes**: Listens for Escape key.
- **Recent searches**: Fetched via `useRecentSearches()` hook. Each entry shows location name and a remove button. Enhanced format includes filter summary (handled by hook's `formatSearch` method).
- Hidden on `md:` and above via `md:hidden` class.
- Submitting or selecting a recent search calls `onSearch(query)` then `onClose()`.
- Z-index: `z-[60]`

### Accessibility

- Back button has `aria-label="Back"`
- Remove buttons have `aria-label="Remove {location} from recent searches"`
- `enterKeyHint="search"` on the input for mobile keyboard

### Connection to Other Components

- Opened by `CollapsedMobileSearch.onExpand`
- Calls parent's search handler which typically navigates to a new URL via `SearchForm` logic.

---

## MobileCardLayout

**File**: `src/components/search/MobileCardLayout.tsx`

**Purpose**: Responsive layout wrapper that switches between mobile full-bleed and desktop grid.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | Listing cards |

### Responsive Behavior

| Breakpoint | Layout | Details |
|-----------|--------|---------|
| `< md` (mobile) | Single column, `gap-0` | Full-bleed with `border-radius: 0` on carousel containers, 1px border-bottom between cards, 12px vertical padding per card |
| `>= md` (desktop) | 2-column grid | `gap-4 sm:gap-x-6 sm:gap-y-8`, 16px padding (`p-4`), standard rounded images |

### Touch Handling

Uses `<style jsx>` to set `touch-action: pan-y` on Embla carousel containers inside mobile cards. This prevents vertical scroll interference when swiping horizontally through listing images.

```css
.mobile-card-layout :global(.md\:hidden .embla) {
  touch-action: pan-y;
}
```

Also targets `data-carousel-container` attribute for border-radius removal on mobile:

```css
.mobile-card-layout :global(.md\:hidden [data-carousel-container]) {
  border-radius: 0;
}
```

### Connection to Other Components

- Receives listing card components as children.
- Used inside `MobileBottomSheet` for the results list.

---

## MobileListingPreview

**File**: `src/components/search/MobileListingPreview.tsx`

**Purpose**: Horizontal snap-scroll strip for previewing listings one at a time in half-sheet mode. Syncs with map pin selection.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `activeListingId` | `string \| null` | Currently selected listing (e.g., from map pin tap) |
| `listingIds` | `string[]` | All listing IDs in order |
| `onListingChange` | `(id: string) => void` | Called when user swipes to a different card |
| `renderPreview` | `(id: string) => ReactNode` | Render function for each card |

### Swipe & Sync Behavior

- Uses native CSS `scroll-snap-type: x mandatory` with `snap-center` alignment.
- Each card is full-width (`w-full flex-shrink-0`) with `px-4 py-2` padding.
- **External sync**: When `activeListingId` changes (e.g., user taps a map pin), the strip scrolls smoothly to that card via `scrollTo({ left: index * cardWidth, behavior: 'smooth' })`.
- **Scroll detection**: `onScrollCapture` calculates which card is centered via `Math.round(scrollLeft / cardWidth)` and fires `onListingChange`.
- **Guard against loops**: `isScrollingRef` prevents the scroll handler from re-triggering during programmatic scrolls (reset via `requestAnimationFrame`).

### Connection to Other Components

- Displayed in the bottom sheet at half-snap as an alternative to the full card list.
- `activeListingId` is typically driven by map marker hover/click state.

---

## PullToRefresh

**File**: `src/components/search/PullToRefresh.tsx`

**Purpose**: Touch-based pull-to-refresh gesture wrapper for mobile list views.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | -- | Wrapped content |
| `onRefresh` | `() => Promise<void>` | -- | Async callback when pull completes |
| `enabled` | `boolean` | `true` | Disable when not at scroll top |

### Gesture Mechanics

```
PULL_THRESHOLD = 60px   // minimum pull to trigger refresh
MAX_PULL = 100px        // maximum visual pull distance
Dampening = dy * 0.5    // 50% resistance for natural feel
```

1. Touch starts only if container `scrollTop <= 0` and not already refreshing.
2. Pull distance is dampened (`dy * 0.5`, capped at 100px).
3. On release:
   - If `pullDistance >= 60px`: triggers refresh, holds indicator at 36px (`PULL_THRESHOLD * 0.6`) during async operation.
   - Otherwise: snaps back to 0.

### Visual Indicator

- Arrow icon (`ArrowDown`) rotates 180 degrees when pull passes threshold (`progress >= 1`, indicating "release to refresh").
- Switches to spinning `Loader2` during the refresh promise.
- Uses framer-motion `m.div` for smooth height/opacity animations.

### Connection to Other Components

- Used inside `MobileBottomSheet` when `onRefresh` prop is provided.
- Disabled when sheet is collapsed (content not scrollable).

---

## CollapsedMobileSearch

**File**: `src/components/CollapsedMobileSearch.tsx`

**Purpose**: Compact pill-shaped search bar for mobile, showing a summary of current search state. Tapping expands to full search.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `onExpand` | `() => void` | Opens full search (typically `MobileSearchOverlay`) |
| `onOpenFilters` | `() => void` | Opens filter drawer directly |

### Displayed State

Reads directly from URL via `useSearchParams()`:

- **Location**: `q` param or "Where to?" placeholder
- **Price**: Formatted from `minPrice`/`maxPrice`:
  - Both present: `"$500-$1500"`
  - Only min: `"$500+"`
  - Only max: `"Up to $1500"`
  - Neither: not displayed
- **Filter count badge**: Counts active non-default values for `moveInDate`, `leaseDuration` (≠ "any"), `roomType` (≠ "any"), `genderPreference` (≠ "any"), `householdGender` (≠ "any"), `amenities[]`, `houseRules[]`, `languages[]`

### Layout

- Hidden on desktop (`md:hidden`).
- Flex container with `gap-2`, centered via `max-w-md mx-auto px-3`.
- Two buttons side by side:
  - Search pill (flexible width, `flex-1`): 48px height (`h-12`), rounded-full, white bg with shadow and border
  - Filter icon button (fixed 48x48): rounded-full, shows count badge when `activeFilterCount > 0`

### Accessibility

- Search button: `aria-label="Expand search"`
- Filter button: `aria-label="Filters (N active)"` with dynamic count, `data-testid="mobile-filter-button"`

### Connection to Other Components

- `onExpand` typically opens `MobileSearchOverlay`.
- `onOpenFilters` opens `FilterModal` (loaded dynamically in `SearchForm`).

---

## SearchForm

**File**: `src/components/SearchForm.tsx`

**Purpose**: Primary search form with location autocomplete, price range, room type tabs, and filter modal integration. Handles URL-based search submission with debouncing and race condition protection.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `"default" \| "compact"` | `"default"` | Compact variant hides labels and room type tabs |

### Key Features

- **Natural language parsing**: Input like "2br in Brooklyn under $2000" is parsed via `parseNaturalLanguageQuery()` and converted to structured URL params via `nlQueryToSearchParams()`.
- **Location validation**: Requires autocomplete selection (non-empty location requires `selectedCoords`) to prevent unbounded full-table scans. Shows warning with shake animation (`animate-shake` class) if user types but does not select.
- **Geolocation**: "Use my location" button (`LocateFixed` icon) with proper error handling for permission denied / timeout / unavailable. Uses `flushSync` for immediate state update before form submission.
- **Debounced submission**: 300ms debounce (`SEARCH_DEBOUNCE_MS`) with `navigationVersionRef` counter to invalidate stale searches on rapid filter changes.
- **AbortController**: Cancels in-flight async operations when new searches supersede old ones.
- **Recent searches**: Saved on each search via `useRecentSearches()` hook with location + coords + active filters (enhanced format).
- **Filter modal**: Dynamically imported (`next/dynamic`, `ssr: false`) to keep initial bundle small. Receives all filter state as props.
- **INP optimization**: Toggle handlers (`toggleAmenity`, `toggleHouseRule`, `toggleLanguage`, `handleClearAllFilters`) wrapped in `startTransition` for responsive UI; room type changes use `queueMicrotask` before `formRef.current?.requestSubmit()` for immediate form submission.
- **Batched filter state**: Uses `useBatchedFilters` hook for pending vs. committed filter state management.

### Mobile-Specific Behavior

- Stacked vertical layout on mobile (`flex-col`), horizontal on desktop (`md:flex-row`).
- Full-width search button on mobile (`w-full`) with "Search"/"Searching..." text label; icon-only circle on desktop (`w-12`).
- Room type tabs and filters button hidden in compact variant.
- Min-height matches Suspense fallback to prevent CLS (`min-h-[56px] sm:min-h-[64px]`).

### URL Parameter Management

The form manages these search params:

| Param | Type | Notes |
|-------|------|-------|
| `q` | string | Location query text (min 2 chars if present) |
| `lat`, `lng` | float | Coordinates from autocomplete |
| `minPrice`, `maxPrice` | number | Auto-swapped if inverted, clamped to non-negative, converted to string for URL |
| `moveInDate` | YYYY-MM-DD | Validated via `validateMoveInDate()`: not past, not >2 years future |
| `leaseDuration` | string | From filter state |
| `roomType` | string | From filter state (empty string for "any") |
| `amenities` | string[] | Multi-value from filter state |
| `houseRules` | string[] | Multi-value from filter state |
| `languages` | string[] | Multi-value from filter state |
| `genderPreference` | string | From filter state |
| `householdGender` | string | From filter state |

On submit, pagination params (`page`, `cursor`, `cursorStack`, `pageNumber`) are cleared. Map bounds (`minLat`/`maxLat`/`minLng`/`maxLng`) are cleared when a new location is selected from autocomplete, but preserved for filter-only changes.

### Room Type Tabs

```tsx
const ROOM_TYPE_TABS = [
  { value: 'any', label: 'All', icon: LayoutGrid },
  { value: 'Private Room', label: 'Private', icon: Home },
  { value: 'Shared Room', label: 'Shared', icon: Users },
  { value: 'Entire Place', label: 'Entire', icon: Building2 },
];
```

Each tab is a 44px min-height button with icon + label (label hidden on `< sm`). Selected state shows white bg with shadow.

### Filter Modal Integration

- Uses `useDebouncedFilterCount` hook for dynamic result count preview in modal footer.
- Uses `useFacets` hook for price histogram and facet counts.
- Price slider bounds derived from facets (`priceAbsoluteMin`, `priceAbsoluteMax`) with fallback to 0-10000.
- `FilterModal` receives batched `pending` state and callbacks to update via `setPending`.
- Apply button calls `commitFilters()` to push pending state to URL.

### Connection to Other Components

- Contains `LocationSearchInput` for autocomplete.
- Dynamically imports `FilterModal`.
- Dispatches `mapFlyToLocation` custom event for map integration (includes `lat`, `lng`, optional `bbox`, `zoom: 13`).
- Uses `SearchTransitionContext` for coordinated loading states (`navigateWithTransition`).

---

## LocationSearchInput

**File**: `src/components/LocationSearchInput.tsx`

**Purpose**: Autocomplete input powered by Mapbox Geocoding API with debouncing, caching, rate-limit handling, and full ARIA combobox pattern.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `value` | `string` | Controlled input value |
| `onChange` | `(value: string) => void` | Text change handler |
| `onLocationSelect` | `(location: { name, lat, lng, bbox? }) => void` | Called when suggestion is selected |
| `onFocus` | `() => void` | Input focus callback |
| `onBlur` | `() => void` | Input blur callback |
| `placeholder` | `string` | Input placeholder (default: "City, neighborhood...") |
| `className` | `string` | Additional CSS classes |
| `id` | `string` | HTML id for label association |

### API Integration

- **Debounce**: 300ms via `useDebounce`.
- **Cache**: `getCachedResults()` / `setCachedResults()` from `@/lib/geocoding-cache`.
- **Deduplication**: `pendingQueryRef` prevents duplicate in-flight requests for the same query.
- **AbortController**: Cancels previous request when new one fires.
- **Rate limit (429)**: Sets `isRateLimited` flag, shows error dropdown, auto-retries after 2 seconds.
- **Input sanitization**: `sanitizeQuery()` strips control characters (`[\x00-\x1F\x7F]`), enforces 256-char Mapbox limit.
- **IME support**: `onCompositionStart/End` handlers prevent fetching during CJK character composition (`isComposingRef`).
- **API URL**: `https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json?types=place,locality,neighborhood,address,region&limit=5&autocomplete=true`

### Keyboard Navigation (WAI-ARIA Combobox)

| Key | Behavior |
|-----|----------|
| ArrowDown | Open dropdown or move to next suggestion |
| ArrowUp | Move to previous suggestion |
| Enter | Select highlighted suggestion |
| Tab | Select highlighted suggestion (if any), close, move focus |
| Escape | Close dropdown |

### Accessibility

- `role="combobox"` with `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete="list"`, `aria-haspopup="listbox"`, `aria-busy`
- Suggestions list has `role="listbox"` with `role="option"` items and `aria-selected`
- Error state uses `role="alert"` with `aria-live="assertive"`
- No-results and type-more hints use `role="status"` with `aria-live="polite"`
- Clear button: 44x44px touch target (`min-w-[44px] min-h-[44px]`), `aria-label="Clear search"`

### Dropdown States

| State | Condition | Display |
|-------|-----------|---------|
| Type more hint | 1 char typed, <2 chars, not composing | "Type at least 2 characters to search" |
| Suggestions | Results returned | List of locations with type-colored pin icons (neighborhood=orange, locality=blue, place=green, region=purple, default=zinc-400) |
| No results | 3+ chars, 0 results, no error | "No locations found" with "Try a different city or neighborhood name" |
| Error | API failure (not AbortError) | Red alert with error message (e.g., "Network error. Check your connection.") |
| Rate limited | 429 response | "Rate limit reached. Retrying shortly..." |

All dropdowns use consistent styling: `bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-zinc-200/80 dark:border-zinc-700/80 z-dropdown min-w-[300px] animate-in fade-in-0 slide-in-from-top-2`

### Connection to Other Components

- Used inside `SearchForm` for location input.
- `onLocationSelect` triggers map fly-to via custom event and coordinates storage in `SearchForm`.

---

## SaveSearchButton

**File**: `src/components/SaveSearchButton.tsx`

**Purpose**: Button + modal for saving the current search with optional email alert configuration.

### Props

| Prop | Type | Description |
|------|------|-------------|
| `className` | `string` | Additional CSS classes |

### Features

- Reads current filters from URL via `parseSearchParams()` (centralized server-side validation logic from `@/lib/search-params`).
- Auto-generates a default name from location + room type + price range via `generateDefaultName()`.
- Alert frequency options: `'INSTANT'`, `'DAILY'`, `'WEEKLY'`.
- Toggle for enabling/disabling email alerts (default: enabled).
- Calls `saveSearch` server action with `{ name, filters, alertEnabled, alertFrequency }`.
- Modal with backdrop, proper focus management, and error display.
- Z-index: `z-[1000]`

### Filter Conversion

Converts URL params to `SearchFilters` format:
- Uses `parseSearchParams(raw)` for validation (MAX_SAFE_PRICE, date validation, allowlists)
- Maps `FilterParams` to `SearchFilters` (including bounds flattening)

### Mobile Behavior

- Button label "Save Search" hidden on small screens (`hidden sm:inline`), icon-only (`Bookmark` icon).
- Modal is centered with `max-w-md w-full p-6` and `p-4` safe area on viewport.

### Accessibility

- Error input has `aria-describedby` pointing to error message and `aria-invalid`.
- Error message uses `role="alert"`.

---

## FilterChip

**File**: `src/components/filters/FilterChip.tsx`

**Purpose**: Individual removable filter pill with optional impact count badge.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | -- | Display text |
| `onRemove` | `() => void` | -- | Remove callback |
| `isRemoving` | `boolean` | `false` | Shows dimmed state during removal (`opacity-50`) |
| `impactDelta` | `string \| null` | -- | Impact badge text (e.g., "+22") |
| `isImpactLoading` | `boolean` | -- | Shows pulse animation for loading |
| `onHoverStart` | `() => void` | -- | Hover enter callback |
| `onHoverEnd` | `() => void` | -- | Hover leave callback |
| `className` | `string` | -- | Additional classes |

### Touch Target

The remove button is visually 16x16px (`w-4 h-4`) but uses a `before` pseudo-element with `-m-[14px]` to create a **44x44px WCAG-compliant touch target**:

```tsx
// WCAG: 44x44px minimum touch target via pseudo-element (16px + 14px*2 = 44px)
"before:absolute before:inset-0 before:-m-[14px] before:content-['']"
```

### Impact Badge

- Shows when `impactDelta` or `isImpactLoading` is present.
- Green/emerald theme: `bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300`.
- Opacity transitions: visible when `impactDelta` present, or on hover when loading (`opacity-0 group-hover/chip:opacity-100`).
- Loading state: small pulsing dot (`w-2 h-2 rounded-full bg-emerald-500 animate-pulse`).

### Accessibility

- Remove button: `aria-label="Remove filter: {label}"`
- Impact badge: `aria-label="Removing this filter adds {delta} more results"` or `"Loading impact count"`
- Keyboard: Enter/Space on the remove button triggers removal
- `focus-visible:ring-2 focus-visible:ring-zinc-400` for keyboard focus indicator

---

## FilterChipWithImpact

**File**: `src/components/filters/FilterChipWithImpact.tsx`

**Purpose**: Wrapper around `FilterChip` that auto-fetches the impact count (how many more results would appear if this filter were removed).

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `chip` | `FilterChipData` | -- | Filter chip data object |
| `onRemove` | `() => void` | -- | Remove callback |
| `isRemoving` | `boolean` | `false` | Removal in progress |
| `currentCount` | `number \| null` | `null` | Current result count for delta calculation |
| `index` | `number` | `0` | Position index for staggered fetch delay |

### Staggered Loading

To avoid flooding the API when many chips are displayed, each chip delays its auto-fetch by `500ms + index * 200ms`:

```tsx
useEffect(() => {
  const timer = setTimeout(() => setAutoFetch(true), 500 + index * 200);
  return () => clearTimeout(timer);
}, [index]);
```

The `useFilterImpactCount` hook fires when either hover (`isHovering`) or auto-fetch activates.

### Connection to Other Components

- Used by `AppliedFilterChips` to render each filter.
- Delegates rendering to `FilterChip`.
- Uses `useFilterImpactCount` hook with `searchParams`, `chip`, `isHovering || autoFetch`, and `currentCount`.

---

## AppliedFilterChips

**File**: `src/components/filters/AppliedFilterChips.tsx`

**Purpose**: Horizontal scrollable bar of applied filter chips with "Clear all" button.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `currentCount` | `number \| null` | `null` | Passed through to impact count calculation |

### Mobile Scrolling

- `overflow-x-auto scrollbar-hide` for horizontal scroll without visible scrollbar.
- Gradient fade edges on mobile (`md:hidden`) to indicate overflow:
  - Left fade: `w-4 bg-gradient-to-r from-white dark:from-zinc-950 to-transparent opacity-0` (visible when scrolled)
  - Right fade: `w-8 bg-gradient-to-l from-white dark:from-zinc-950 to-transparent` (visible when content overflows)
- Both fades: `pointer-events-none aria-hidden="true"`

### Filter Removal

- Individual removal: `removeFilterFromUrl(searchParams, chip)` computes new URL, navigates via `router.push()` wrapped in `startTransition`.
- Clear all: `clearAllFilters(searchParams)` strips all filter params, preserves non-filter params (bounds, sort). Shows when `chips.length >= 1`.
- Clear all button: `min-h-[44px]` for touch target, `flex-shrink-0` to prevent squishing.

### Accessibility

- Container: `role="region"` with `aria-label="Applied filters"`
- Clear all button: `aria-label="Clear all filters"`, disabled when `isPending`
- Fade edges: `aria-hidden="true"`, `pointer-events-none`

### Connection to Other Components

- Reads filter state from URL via `urlToFilterChips(searchParams)`.
- Renders `FilterChipWithImpact` for each active filter.
- Appears in the search results page between the search form and the results list.
- Returns `null` if no chips to render.

---

## Component Relationship Diagram

```
Search Page (mobile)
|
+-- CollapsedMobileSearch
|   |-- [tap] --> MobileSearchOverlay
|   |-- [filter tap] --> FilterModal (via SearchForm)
|
+-- SearchForm
|   |-- LocationSearchInput (Mapbox autocomplete)
|   |-- Price inputs
|   |-- Room type tabs (ROOM_TYPE_TABS: any/Private/Shared/Entire)
|   |-- FilterModal (dynamic import, ssr: false)
|   +-- SaveSearchButton
|
+-- AppliedFilterChips
|   +-- FilterChipWithImpact[]
|       +-- FilterChip
|
+-- Map (fills viewport)
|
+-- MobileBottomSheet (z-40, overlays map)
    |-- Drag handle (touch gestures)
    |-- PullToRefresh (optional, when onRefresh provided)
    |-- MobileCardLayout
    |   +-- Listing cards (full-bleed on mobile)
    +-- MobileListingPreview (half-sheet mode, horizontal snap-scroll)
```

### Data Flow

1. **User searches**: `CollapsedMobileSearch` tap opens `MobileSearchOverlay`. User types, selects location. `onSearch` callback triggers navigation.
2. **URL updates**: `SearchForm.handleSearch()` builds URL params (debounced 300ms, AbortController for race protection) and navigates via `transitionContext.navigateWithTransition()` or `router.push()`. All components re-read from `useSearchParams()`.
3. **Map syncs**: `SearchForm` dispatches `mapFlyToLocation` custom event with `{ lat, lng, bbox?, zoom: 13 }`. Map flies to new location and emits new bounds.
4. **Results appear**: Server returns listings. `MobileBottomSheet` displays them in `MobileCardLayout`.
5. **Pin interaction**: Tapping a map pin sets `activeListingId`, which scrolls `MobileListingPreview` to that card via `scrollTo({ behavior: 'smooth' })`.
6. **Filter removal**: `AppliedFilterChips` removes params from URL, triggering a new search.

### Responsive Breakpoints

| Breakpoint | Behavior |
|-----------|----------|
| `< md` (< 768px) | Bottom sheet + collapsed search bar + full-screen overlay. Single-column full-bleed cards. |
| `>= md` (768px+) | No bottom sheet. Standard side-by-side map + list layout. Desktop search form with inline filters. |

All mobile-only components use `md:hidden` to self-remove on desktop. Z-index hierarchy:
- `MobileSearchOverlay`: `z-[60]`
- `MobileBottomSheet`: `z-40`
- `SaveSearchButton` modal: `z-[1000]`
- `FilterModal`: (not specified in docs, check implementation)
- Autocomplete dropdown: `z-dropdown` (custom token)
