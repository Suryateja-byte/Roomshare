# Mobile Search Experience & Components

Technical documentation for the Roomshare mobile search interface. This covers all components involved in the mobile search flow: bottom sheet, search overlays, listing previews, gesture handling, floating buttons, and card layouts.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [MobileBottomSheet](#mobilebottomsheet)
- [MobileSearchOverlay](#mobilesearchoverlay)
- [MobileCardLayout](#mobilecardlayout)
- [MobileListingPreview](#mobilelistingpreview)
- [PullToRefresh](#pulltorefresh)
- [CompactSearchPill](#compactsearchpill)
- [FloatingMapButton](#floatingmapbutton)
- [Component Relationship Diagram](#component-relationship-diagram)

---

## Architecture Overview

The mobile search experience is built around a **map + bottom sheet** pattern. On screens below the `md` breakpoint (768px), the map fills the viewport and search results appear inside a draggable `MobileBottomSheet`. The `CompactSearchPill` provides a compact desktop search summary; tapping it expands to the full search form. On mobile, `MobileSearchOverlay` provides a full-screen search takeover.

Key design decisions:

- **Bottom sheet owns scroll** -- the sheet manages its own content scrolling and prevents body scroll when expanded.
- **Touch events are partitioned** -- drag gestures on the sheet handle resize the sheet; all other touches pass through to the map.
- **URL is source of truth for filters** -- components read from `useSearchParams()` and push new URLs on change.
- **framer-motion (LazyMotion)** powers all animations, loaded on-demand via `domAnimation` to minimize bundle cost.
- **Haptic feedback** -- `FloatingMapButton` triggers haptic feedback on toggle via `triggerHaptic()` from `@/lib/haptics`.

---

## MobileBottomSheet

**File**: `/mnt/d/Documents/roomshare/src/components/search/MobileBottomSheet.tsx`

**Purpose**: Draggable bottom sheet overlay for mobile search results. Sits over the map and snaps to three vertical positions.

### Exports

```tsx
export default function MobileBottomSheet({
  children,
  headerText,
  snapIndex,
  onSnapChange,
  onRefresh,
}: MobileBottomSheetProps): JSX.Element
```

### Props Interface

```tsx
// Lines 33-43
interface MobileBottomSheetProps {
  children: ReactNode;
  /** Result count text shown in the sheet header */
  headerText?: string;
  /** Controlled snap index (0=collapsed, 1=half, 2=expanded) */
  snapIndex?: number;
  /** Callback when snap index changes */
  onSnapChange?: (index: number) => void;
  /** Called when pull-to-refresh gesture completes */
  onRefresh?: () => Promise<void>;
}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | -- | Sheet content (listing cards) |
| `headerText` | `string` | `"Search results"` | Text shown in the sheet header (line 302) |
| `snapIndex` | `number` | `1` (internal) | Controlled snap index (0/1/2). If omitted, internally managed starting at 1 (half). |
| `onSnapChange` | `(index: number) => void` | -- | Called when snap position changes |
| `onRefresh` | `() => Promise<void>` | -- | Pull-to-refresh callback. Wraps children in `PullToRefresh` when provided. |

### Snap Points

```tsx
// Lines 17-21
const SNAP_COLLAPSED = 0.15; // ~15vh
const SNAP_HALF = 0.5;       // ~50vh
const SNAP_EXPANDED = 0.85;  // ~85vh

const SNAP_POINTS = [SNAP_COLLAPSED, SNAP_HALF, SNAP_EXPANDED] as const;
```

| Index | Constant | Viewport Height | Behavior |
|-------|----------|----------------|----------|
| 0 | `SNAP_COLLAPSED` | 0.15 (~15vh) | Header peek only. Content scroll disabled (line 335). Shows "Pull up for listings" hint (lines 304-307). |
| 1 | `SNAP_HALF` | 0.5 (~50vh) | Default starting position. Content scrollable. Map visible above. |
| 2 | `SNAP_EXPANDED` | 0.85 (~85vh) | Near full-screen. Body scroll locked (lines 243-250). Dim overlay behind sheet (opacity 0.3, lines 258-270). |

### Drag Constants

```tsx
// Lines 23-28
const DRAG_THRESHOLD = 40;   // px minimum to trigger snap change
const FLICK_VELOCITY = 0.4;  // px/ms for flick detection
const MAX_OVERSCROLL = 80;   // px rubber-band limit
```

### Spring Configuration

```tsx
// Line 31
const SPRING_CONFIG = { stiffness: 400, damping: 30, mass: 0.8 };
```

### Touch & Gesture Handling

The sheet uses raw touch events (not framer-motion drag) for precise control:

**Handle area drag** (`onTouchStart/Move/End` on the header div, lines 289-294):
- `handleTouchStart` (lines 153-165): Records `dragStartY`, current snap, and time. Sets `isDragging` state.
- `handleTouchMove` (lines 167-185): Computes `dragOffset` from delta Y. Cancels drag if content has `scrollTop > 0`.
- `handleTouchEnd` (lines 187-207): Calculates velocity (`dragOffset / elapsed`). Flick up (velocity < -0.4) advances to next higher snap; flick down advances lower. Small drags below threshold are ignored.

**Content area drag** (`handleContentTouchStart`, lines 217-228):
- Only activates when sheet is not collapsed (index > 0) AND content is scrolled to top (`scrollTop <= 0`).
- Sets `isScrollDrag.current = true` to track origin.
- If content has `scrollTop > 0` during move, drag is cancelled and native scroll takes over (lines 173-180).

**Touch cancel handler** (`handleTouchCancel`, lines 210-214):
- Resets drag state on system interruption (incoming call, notification, gesture conflict).

**Rubber-band effect** (lines 94-117):

```tsx
const getRubberbandOffset = useCallback(
  (rawOffset: number): number => {
    const heightPx = currentSnap * window.innerHeight;
    const minPx = SNAP_COLLAPSED * window.innerHeight;
    const maxPx = SNAP_EXPANDED * window.innerHeight;
    const proposedPx = heightPx - rawOffset;

    if (proposedPx > maxPx) {
      // Dragging above expanded — rubber-band
      const excess = proposedPx - maxPx;
      const dampened = MAX_OVERSCROLL * (1 - Math.exp(-excess / MAX_OVERSCROLL));
      return heightPx - (maxPx + dampened);
    }
    if (proposedPx < minPx) {
      // Dragging below collapsed — rubber-band
      const excess = minPx - proposedPx;
      const dampened = MAX_OVERSCROLL * (1 - Math.exp(-excess / MAX_OVERSCROLL));
      return heightPx - (minPx - dampened);
    }
    return rawOffset;
  },
  [currentSnap],
);
```

**Animation**: During active drag, height is set directly in pixels with zero-duration transition for instant feedback (line 282). On release, spring animation with `SPRING_CONFIG` is applied.

### Accessibility

- `role="region"` with `aria-label="Search results"` (lines 274-275)
- Escape key collapses to half position (index 1) when sheet is not already collapsed (lines 231-240)
- Expand/Collapse button in header with dynamic `aria-label`: "Collapse results" or "Expand results" (lines 315-317)
- Body `overflow: hidden` when expanded to prevent background scroll (lines 243-250)
- Dim overlay when expanded: `bg-black` with `opacity: 0.3`, `pointer-events-none`, `aria-hidden="true"` (lines 258-269)

### Visual Structure

- Container: `fixed bottom-0 left-0 right-0 z-40`, `rounded-t-2xl`, shadow styling (line 276)
- Handle bar: `w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600` (line 297)
- Header: Shows `headerText`, hint text when collapsed, Expand/Collapse button when not collapsed
- Content area: `flex-1 overflow-y-auto overscroll-contain scrollbar-hide` (line 328)

### Connection to Other Components

- Wraps children in `PullToRefresh` when `onRefresh` is provided (lines 338-341).
- Typically receives `MobileCardLayout` with listing cards as children.
- Parent page controls `snapIndex` to coordinate with map pin taps.

---

## MobileSearchOverlay

**File**: `/mnt/d/Documents/roomshare/src/components/search/MobileSearchOverlay.tsx`

**Purpose**: Full-screen search input overlay for mobile. Slides up when the compact search bar is tapped.

### Exports

```tsx
export default function MobileSearchOverlay({
  isOpen,
  onClose,
  onSearch,
  currentQuery,
}: MobileSearchOverlayProps): JSX.Element
```

### Props Interface

```tsx
// Lines 8-17
interface MobileSearchOverlayProps {
  /** Whether the overlay is open */
  isOpen: boolean;
  /** Close the overlay */
  onClose: () => void;
  /** Called when user selects a recent search or submits */
  onSearch: (query: string) => void;
  /** Current search query */
  currentQuery?: string;
}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | `boolean` | -- | Controls visibility |
| `onClose` | `() => void` | -- | Closes the overlay |
| `onSearch` | `(query: string) => void` | -- | Called on submit or recent search selection |
| `currentQuery` | `string` | `""` | Pre-fills the input (line 29) |

### Animation

- **Slide-up animation**: `y: "100%"` to `y: 0` with spring physics (line 84):
  ```tsx
  transition={{ type: "spring", stiffness: 400, damping: 35 }}
  ```

### Behavior

- **Auto-focus**: Input receives focus 100ms after opening (lines 34-39).
- **Body scroll lock**: `overflow: hidden` on body while open (lines 53-60).
- **Escape closes**: Listens for Escape key (lines 43-50).
- **Recent searches**: Fetched via `useRecentSearches()` hook (line 31). Each entry shows location name, optional filter summary, and a remove button.
- **Z-index**: `z-[60]` (line 85)
- **Mobile-only**: Hidden on desktop via `md:hidden` class (line 85).
- Submitting or selecting a recent search calls `onSearch(query)` then `onClose()` (lines 62-74).

### Hooks Used

```tsx
// Line 31
const { recentSearches, removeRecentSearch, formatSearch } = useRecentSearches();
```

### Accessibility

- Back button: `aria-label="Back"` (line 92)
- Remove buttons: `aria-label="Remove {location} from recent searches"` (line 146)
- Input: `enterKeyHint="search"` for mobile keyboard (line 106)
- Placeholder: `"Search by city, neighborhood..."` (line 104)

### Visual Structure

- Header with back button and search input in a rounded pill (lines 88-110)
- Recent searches list with Clock icon and X remove button (lines 112-155)
- Empty state: "No recent searches" centered message (lines 157-161)

### Connection to Other Components

- Opened by `CompactSearchPill.onExpand` or mobile collapsed search bar
- Calls parent's search handler which typically navigates to a new URL

---

## MobileCardLayout

**File**: `/mnt/d/Documents/roomshare/src/components/search/MobileCardLayout.tsx`

**Purpose**: Responsive layout wrapper that switches between mobile full-bleed and desktop grid.

### Exports

```tsx
export default function MobileCardLayout({ children }: MobileCardLayoutProps): JSX.Element
```

### Props Interface

```tsx
// Lines 5-7
interface MobileCardLayoutProps {
  children: ReactNode;
}
```

| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | Listing cards |

### Responsive Behavior

| Breakpoint | Layout | Details |
|-----------|--------|---------|
| `< md` (mobile) | Single column, `gap-0` | Full-bleed with `border-radius: 0` on carousel containers, 1px border-bottom between cards, 12px vertical padding per card (lines 23-26) |
| `>= md` (desktop) | 2-column grid | `gap-4 sm:gap-x-6 sm:gap-y-8`, 16px padding (`p-4`) (line 28) |

### CSS Styling (via `<style jsx>`)

Lines 31-45:

```css
/* Mobile full-bleed: remove card image rounding */
.mobile-card-layout :global(.md\:hidden [data-carousel-container]) {
  border-radius: 0;
}

/* Prevent vertical scroll while swiping carousel horizontally */
.mobile-card-layout :global(.md\:hidden .embla) {
  touch-action: pan-y;
}

/* Tighter card spacing on mobile */
.mobile-card-layout :global(.md\:hidden > .flex > *) {
  border-bottom: 1px solid var(--border-color, #e4e4e7);
  padding: 12px 0;
}
```

### Connection to Other Components

- Receives listing card components as children.
- Used inside `MobileBottomSheet` for the results list.

---

## MobileListingPreview

**File**: `/mnt/d/Documents/roomshare/src/components/search/MobileListingPreview.tsx`

**Purpose**: Horizontal snap-scroll strip for previewing listings one at a time in half-sheet mode. Syncs with map pin selection.

### Exports

```tsx
export default function MobileListingPreview({
  activeListingId,
  listingIds,
  onListingChange,
  renderPreview,
}: MobileListingPreviewProps): JSX.Element | null
```

### Props Interface

```tsx
// Lines 5-14
interface MobileListingPreviewProps {
  /** Currently active/selected listing ID */
  activeListingId: string | null;
  /** All listing IDs in order */
  listingIds: string[];
  /** Called when user swipes to a different listing */
  onListingChange?: (id: string) => void;
  /** Render a single listing preview card */
  renderPreview: (id: string) => ReactNode;
}
```

| Prop | Type | Description |
|------|------|-------------|
| `activeListingId` | `string \| null` | Currently selected listing (e.g., from map pin tap) |
| `listingIds` | `string[]` | All listing IDs in order |
| `onListingChange` | `(id: string) => void` | Called when user swipes to a different card |
| `renderPreview` | `(id: string) => ReactNode` | Render function for each card |

### Swipe & Sync Behavior

- Uses native CSS `scroll-snap-type: x mandatory` with `snap-center` alignment (lines 67-69).
- Each card is full-width (`w-full flex-shrink-0`) with `px-4 py-2` padding (line 74).
- **External sync** (lines 30-38): When `activeListingId` changes (e.g., user taps a map pin), the strip scrolls smoothly to that card:
  ```tsx
  container.scrollTo({ left: index * cardWidth, behavior: "smooth" });
  ```
- **Scroll detection** (`handleScroll`, lines 41-60): `onScrollCapture` calculates which card is centered via `Math.round(scrollLeft / cardWidth)` and fires `onListingChange`.
- **Guard against loops** (lines 27, 43, 57-59): `isScrollingRef` prevents the scroll handler from re-triggering during programmatic scrolls (reset via `requestAnimationFrame`).

### Early Return

Returns `null` if `listingIds.length === 0` (line 62).

### Connection to Other Components

- Displayed in the bottom sheet at half-snap as an alternative to the full card list.
- `activeListingId` is typically driven by map marker hover/click state.

---

## PullToRefresh

**File**: `/mnt/d/Documents/roomshare/src/components/search/PullToRefresh.tsx`

**Purpose**: Touch-based pull-to-refresh gesture wrapper for mobile list views.

### Exports

```tsx
export default function PullToRefresh({
  children,
  onRefresh,
  enabled,
}: PullToRefreshProps): JSX.Element
```

### Props Interface

```tsx
// Lines 10-16
interface PullToRefreshProps {
  children: ReactNode;
  /** Called when pull gesture completes. Should return a promise that resolves when refresh is done. */
  onRefresh: () => Promise<void>;
  /** Whether pull-to-refresh is enabled (disable when not at scroll top) */
  enabled?: boolean;
}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | -- | Wrapped content |
| `onRefresh` | `() => Promise<void>` | -- | Async callback when pull completes |
| `enabled` | `boolean` | `true` | Disable when not at scroll top (line 26) |

### Constants

```tsx
// Lines 7-8
const PULL_THRESHOLD = 60;  // px minimum pull to trigger refresh
const MAX_PULL = 100;       // px maximum visual pull distance
```

### Gesture Mechanics

1. **Touch start** (lines 34-44): Only activates if `enabled`, not already refreshing, and container `scrollTop <= 0`.
2. **Touch move** (lines 46-59): Pull distance is dampened (`dy * 0.5`, capped at `MAX_PULL`).
   ```tsx
   const dampened = Math.min(MAX_PULL, dy * 0.5);
   ```
3. **Touch end** (lines 61-77):
   - If `pullDistance >= PULL_THRESHOLD`: triggers refresh, holds indicator at 36px (`PULL_THRESHOLD * 0.6`) during async operation (line 67).
   - Otherwise: snaps back to 0.

### Visual Indicator

- **Progress calculation** (line 79): `Math.min(1, pullDistance / PULL_THRESHOLD)`
- **Show condition** (line 80): `pullDistance > 10 || isRefreshing`
- Arrow icon (`ArrowDown`) rotates 180 degrees when `progress >= 1` (lines 101-106).
- Switches to spinning `Loader2` during the refresh promise (lines 98-99).
- Uses framer-motion `m.div` for smooth height/opacity animations (lines 93-108).

### Connection to Other Components

- Used inside `MobileBottomSheet` when `onRefresh` prop is provided (lines 338-341 in MobileBottomSheet).
- Disabled when sheet is collapsed (content not scrollable).

---

## CompactSearchPill

**File**: `/mnt/d/Documents/roomshare/src/components/search/CompactSearchPill.tsx`

**Purpose**: Desktop-only compact search bar shown when scrolled. Displays a summary of current search state; click expands back to full form.

### Exports

```tsx
export function CompactSearchPill({ onExpand, onOpenFilters }: CompactSearchPillProps): JSX.Element
export default CompactSearchPill;
```

### Props Interface

```tsx
// Lines 7-10
interface CompactSearchPillProps {
  onExpand: () => void;
  onOpenFilters?: () => void;
}
```

| Prop | Type | Description |
|------|------|-------------|
| `onExpand` | `() => void` | Opens full search form |
| `onOpenFilters` | `() => void` | Opens filter drawer directly (optional) |

### Displayed State

Reads directly from URL via `useSearchParams()` (line 17):

- **Location**: `q` param or "Anywhere" placeholder (lines 19, 27)
- **Price** (lines 28-34):
  - Both present: `"$500–$1500"`
  - Only min: `"$500+"`
  - Only max: `"Up to $1500"`
- **Room type**: Shown if present and not "any" (line 35)
- **Lease duration**: Shown if present and not "any" (line 36)

### Filter Count Calculation (lines 41-55)

Counts active non-default values for:
- `moveInDate`, `leaseDuration`, `roomType`, `genderPreference`, `householdGender` (if not "any")
- `amenities` (comma-separated, counts each)
- `houseRules` (comma-separated, counts each)
- `minPrice`, `maxPrice` (if present)

### Layout

- **Desktop-only**: `hidden md:flex` (line 58)
- Container: `max-w-2xl mx-auto`, `gap-2`
- Search pill: `flex-1`, `h-12`, `px-5`, rounded-full, white bg with shadow and border (lines 59-82)
- Filter button (optional): Fixed `w-12 h-12`, shows count badge when `filterCount > 0` (lines 85-98)

### Accessibility

- Search button: `aria-label="Expand search form"` (line 62)
- Filter button: `aria-label="Filters (N active)"` with dynamic count (line 89)

### Connection to Other Components

- `onExpand` typically expands to full `SearchForm`.
- `onOpenFilters` opens `FilterModal`.

---

## FloatingMapButton

**File**: `/mnt/d/Documents/roomshare/src/components/search/FloatingMapButton.tsx`

**Purpose**: Floating pill button at the bottom center of mobile viewport. Toggles between map-focused (sheet collapsed) and list-focused (sheet half) views.

### Exports

```tsx
export default function FloatingMapButton({
  isListMode,
  resultCount,
  onToggle,
}: FloatingMapButtonProps): JSX.Element
```

### Props Interface

```tsx
// Lines 7-14
interface FloatingMapButtonProps {
  /** Whether the bottom sheet is showing list content (half or expanded) */
  isListMode: boolean;
  /** Number of results to display */
  resultCount?: number;
  /** Toggle between map-focused and list-focused views */
  onToggle: () => void;
}
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isListMode` | `boolean` | -- | Whether the bottom sheet is showing list content (half or expanded) |
| `resultCount` | `number` | -- | Number of results to display in label |
| `onToggle` | `() => void` | -- | Toggle between map and list views |

### Label Logic (lines 25-29)

```tsx
const label = isListMode
  ? "Map"
  : resultCount != null
    ? `List · ${resultCount}`
    : "List";
```

### Animation

```tsx
// Lines 37-40
initial={{ scale: 0.9, opacity: 0 }}
animate={{ scale: 1, opacity: 1 }}
exit={{ scale: 0.9, opacity: 0 }}
transition={{ type: "spring", stiffness: 500, damping: 30 }}
```

### Haptic Feedback

Uses `triggerHaptic()` from `@/lib/haptics` on click (line 36).

### Visual Structure

- Position: `fixed bottom-6 left-1/2 -translate-x-1/2 z-50` (line 41)
- Styling: `px-5 py-3`, `bg-zinc-900 dark:bg-white`, `text-white dark:text-zinc-900`, `rounded-full`, shadow (line 41)
- Icons: `Map` when `isListMode`, `List` otherwise (lines 44-48)
- Mobile-only: `md:hidden` (line 41)
- Active state: `active:scale-95` (line 41)

### Accessibility

- `aria-label`: "Show map" when `isListMode`, "Show list" otherwise (line 42)

### Connection to Other Components

- Typically controls `MobileBottomSheet` snap index.
- `isListMode` is true when sheet is at half or expanded position.

---

## Component Relationship Diagram

```
Search Page (mobile)
|
+-- CompactSearchPill (desktop only, hidden on mobile)
|   |-- [tap] --> Expand search form
|   |-- [filter tap] --> FilterModal
|
+-- MobileSearchOverlay (z-[60], mobile only)
|   |-- Back button --> closes overlay
|   |-- Recent searches --> onSearch callback
|   |-- Input submit --> onSearch callback
|
+-- Map (fills viewport)
|
+-- MobileBottomSheet (z-40, overlays map)
|   |-- Drag handle (touch gestures)
|   |-- Header: "Search results" + Expand/Collapse button
|   |-- PullToRefresh (optional, when onRefresh provided)
|   |-- MobileCardLayout
|   |   +-- Listing cards (full-bleed on mobile)
|   +-- MobileListingPreview (half-sheet mode, horizontal snap-scroll)
|
+-- FloatingMapButton (z-50, mobile only)
    |-- [tap] --> Toggle sheet snap position
    |-- Haptic feedback on press
```

### Data Flow

1. **User searches**: Compact search pill tap expands form, or `MobileSearchOverlay` opens. User types, selects location. `onSearch` callback triggers navigation.
2. **URL updates**: Search form builds URL params and navigates. All components re-read from `useSearchParams()`.
3. **Map syncs**: Search form dispatches `mapFlyToLocation` custom event. Map flies to new location and emits new bounds.
4. **Results appear**: Server returns listings. `MobileBottomSheet` displays them in `MobileCardLayout`.
5. **Pin interaction**: Tapping a map pin sets `activeListingId`, which scrolls `MobileListingPreview` to that card via `scrollTo({ behavior: 'smooth' })`.
6. **View toggle**: `FloatingMapButton` toggles between map-focused (collapsed) and list-focused (half) sheet positions.
7. **Pull to refresh**: Pulling down on sheet content (when at scroll top) triggers `onRefresh` callback.

### Z-Index Hierarchy

| Component | Z-Index |
|-----------|---------|
| `MobileSearchOverlay` | `z-[60]` |
| `FloatingMapButton` | `z-50` |
| `MobileBottomSheet` | `z-40` |
| Sheet dim overlay | `z-30` |

### Responsive Breakpoints

| Breakpoint | Behavior |
|-----------|----------|
| `< md` (< 768px) | Bottom sheet + floating button + full-screen overlay. Single-column full-bleed cards. |
| `>= md` (768px+) | No bottom sheet. `CompactSearchPill` visible. Standard side-by-side map + list layout. |

All mobile-only components use `md:hidden` to self-remove on desktop. Desktop-only components use `hidden md:flex` or `hidden md:grid`.
