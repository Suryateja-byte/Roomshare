# Plan: React Rendering Performance — HIGH Priority Fixes

**Task Type**: REFACTOR (performance optimization)
**Clarity Score**: 4.1/5.0
**Date**: 2026-03-17

---

## Executive Summary

Two React rendering performance issues cause excessive re-renders on the search page:

1. **PERF-H1**: Zero `React.memo` usage — every ListingCard re-renders when any parent state changes (hover, context, pagination)
2. **PERF-H2**: `SearchV2DataContext` is a single monolithic context — any state change (v2MapData, isV2Enabled, dataVersion) re-renders ALL consumers

---

## Confidence Score

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Research Grounding | 15% | 5 | React docs, well-established patterns |
| Codebase Accuracy | 25% | 5 | All file paths, interfaces, consumers verified |
| Assumption Freedom | 20% | 5 | Every claim verified against source |
| Completeness | 15% | 5 | All steps, rollback, tests included |
| Harsh Critic Verdict | 15% | 4 | No blockers; one major mitigated |
| Specificity | 10% | 5 | Junior dev executable |

**Overall: 4.85/5.0 — 🟢 HIGH CONFIDENCE**

---

## Codebase Analysis (Verified)

### Current State

**ListingCard** (`src/components/listings/ListingCard.tsx:99`):
- Default export function component, NOT memoized
- Props interface `ListingCardProps` (line 87): `listing: Listing`, `isSaved?: boolean`, `className?: string`, `priority?: boolean`, `showTotalPrice?: boolean`, `estimatedMonths?: number`
- Internally uses `useListingFocus()` and `useIsListingFocused(listing.id)` — these pull from `ListingFocusContext`
- `ListingFocusContext` (line 144-168 in ListingFocusContext.tsx) context value changes on ANY hover/active change across ALL listings
- `useIsListingFocused` (line 190-200) derives `isHovered`/`isActive` with `useMemo`, BUT the parent `useListingFocus()` call at line 102 still triggers re-render because it destructures `{ setHovered, setActive, focusSource, hasProvider }` from a context that changes on every hover

**ImageCarousel** (`src/components/listings/ImageCarousel.tsx:31`):
- Named export function component, NOT memoized
- Props interface `ImageCarouselProps` (line 8): `images: string[]`, `alt: string`, `priority?: boolean`, `className?: string`, `onImageError?: (index: number) => void`, `onDragStateChange?: (isDragging: boolean) => void`
- Contains internal state (selectedIndex, showControls) and Embla carousel API
- Called from ListingCard at line 203 with `onDragStateChange={setIsDragging}` — `setIsDragging` is a setState call, which is referentially stable

**SearchResultsClient** (`src/components/search/SearchResultsClient.tsx:310-319`):
- Renders `allListings.map()` → `<ListingCard>` in a grid
- Keyed by `listing.id` (good)
- `isSaved` comes from `savedIdsSet.has(listing.id)` — stable Set lookup
- `showTotalPrice` and `estimatedMonths` change when user toggles price display (all cards re-render)
- Parent component is keyed by `searchParamsString` in page.tsx (line 280), so filter changes remount entirely

**FeaturedListingsClient** (`src/components/FeaturedListingsClient.tsx:129-137`):
- Also renders ListingCard but without `isSaved` prop, no performance concern (small list, homepage)

**SearchV2DataContext** (`src/contexts/SearchV2DataContext.tsx`):
- Single context with value: `{ v2MapData, setV2MapData, isV2Enabled, setIsV2Enabled, dataVersion }` (line 66-77)
- Context value is memoized via `useMemo` (line 140-149), good
- BUT all 4 "selector" hooks (lines 178-221) call `useContext(SearchV2DataContext)` — same single context
- These are NOT true selectors — React `useContext` always re-renders on ANY context value change
- The comment at line 7-22 claims fine-grained subscriptions, but this is **misleading** — it only destructures different fields, it does NOT prevent re-renders

**Consumers of SearchV2DataContext** (production, verified):
1. `V2MapDataSetter` — uses `setV2MapData, setIsV2Enabled` (setters only) — RE-RENDERS when v2MapData/dataVersion changes (unnecessary)
2. `V1PathResetSetter` — uses `setV2MapData, setIsV2Enabled, dataVersion` — RE-RENDERS on any change
3. `PersistentMapWrapper` (line 410) — uses `v2MapData, isV2Enabled, setIsV2Enabled` — needs state re-renders

**MapBoundsContext** (`src/contexts/MapBoundsContext.tsx`) — REFERENCE PATTERN:
- Split into 3 contexts: `MapBoundsContext`, `MapBoundsStateContext`, `MapBoundsActionsContext` (lines 120, 162, 163)
- Provider wraps children in all 3 providers nested (lines 613-621)
- State context (`MapBoundsStateValue`, line 130-141): all mutable state
- Actions context (`MapBoundsActionsValue`, line 147-160): all stable callbacks
- SSR fallbacks for both (lines 168-197)
- Selector hooks compose from the split contexts (e.g., `useAreaCount` reads from State only)

---

## PERF-H1: Add React.memo to ListingCard and ImageCarousel

### Problem Analysis

When user hovers a listing card, `ListingFocusContext` updates → `hoveredId` changes → context value changes → `useListingFocus()` in EVERY ListingCard re-renders ALL cards. With 12+ cards on search page, this means 12 unnecessary re-renders per hover event.

Additionally, when `showTotalPrice` toggles, all cards re-render. When `savedIdsSet` recalculates after favorites API call, all cards re-render.

### Root Cause Chain

1. `ListingCard` calls `useListingFocus()` (line 102) which subscribes to the full `ListingFocusContext`
2. `ListingFocusContext` value changes on any hover (new `hoveredId` → new memoized object)
3. Every ListingCard re-renders because React re-renders all context consumers
4. `useIsListingFocused` correctly memoizes the derived `isHovered`/`isActive`, but the PARENT RENDER still occurs
5. Without `React.memo`, the full render tree (ImageCarousel, FavoriteButton, badges, etc.) re-renders

### Solution Design

**Key insight**: `React.memo` alone won't help here because `useListingFocus()` triggers re-renders from INSIDE the component (context subscription). The memo comparison runs on props, but the re-render is from context, not props.

**Two-pronged approach**:

1. **Split ListingCard's context usage**: Move `useListingFocus()` props (`setHovered`, `setActive`, `focusSource`, `hasProvider`) into a wrapper or use `useMapBoundsActions()`-style stable actions context
2. **Add `React.memo` to protect against parent re-renders** from `showTotalPrice`, `savedIdsSet` changes, etc.

#### Step 1: Refactor ListingCard context usage

**Problem**: `useListingFocus()` returns a value that changes on every hover. ListingCard needs:
- `setHovered`, `setActive` → stable callbacks (from context, already `useCallback`-wrapped)
- `focusSource` → changes on hover (but only used in guard condition)
- `hasProvider` → constant after mount
- `isHovered`, `isActive` → already from `useIsListingFocused` (properly memoized)

**Fix**: The `ListingFocusContext` needs the same State/Actions split as `MapBoundsContext`. However, that's a larger change affecting 11 consumers. A lighter approach:

**Option A (RECOMMENDED)**: Add `React.memo` to ListingCard AND fix the re-render source by splitting `ListingFocusContext` into State+Actions contexts.

**Option B (MINIMAL)**: Only add `React.memo`. This won't prevent context-driven re-renders but WILL prevent parent-driven re-renders (showTotalPrice, savedIdsSet, etc.).

**Decision**: Go with **Option A** because the ListingFocusContext split is the same proven pattern as MapBoundsContext and addresses the root cause.

#### Step 1a: Split ListingFocusContext into State + Actions

**File**: `src/contexts/ListingFocusContext.tsx`

**Changes**:

```typescript
// NEW: Split contexts (same pattern as MapBoundsContext.tsx:162-163)
interface ListingFocusStateValue {
  hoveredId: string | null;
  activeId: string | null;
  scrollRequest: ScrollRequest | null;
  focusSource: FocusSource;
}

interface ListingFocusActionsValue {
  setHovered: (id: string | null, source?: FocusSource) => void;
  setActive: (id: string | null) => void;
  requestScrollTo: (id: string) => void;
  ackScrollTo: (nonce: number) => void;
  clearFocus: () => void;
  hasProvider: boolean;
}

const ListingFocusStateContext = createContext<ListingFocusStateValue | null>(null);
const ListingFocusActionsContext = createContext<ListingFocusActionsValue | null>(null);

// SSR fallbacks
const SSR_STATE_FALLBACK: ListingFocusStateValue = {
  hoveredId: null, activeId: null, scrollRequest: null, focusSource: null,
};
const SSR_ACTIONS_FALLBACK: ListingFocusActionsValue = {
  setHovered: () => {}, setActive: () => {}, requestScrollTo: () => {},
  ackScrollTo: () => {}, clearFocus: () => {}, hasProvider: false,
};
```

**Provider changes**: Nest 3 providers (same as MapBoundsContext:613-621):
```tsx
return (
  <ListingFocusContext.Provider value={contextValue}>
    <ListingFocusStateContext.Provider value={stateValue}>
      <ListingFocusActionsContext.Provider value={actionsValue}>
        {children}
      </ListingFocusActionsContext.Provider>
    </ListingFocusStateContext.Provider>
  </ListingFocusContext.Provider>
);
```

**New selector hooks**:
```typescript
export function useListingFocusState(): ListingFocusStateValue {
  const context = useContext(ListingFocusStateContext);
  return context ?? SSR_STATE_FALLBACK;
}

export function useListingFocusActions(): ListingFocusActionsValue {
  const context = useContext(ListingFocusActionsContext);
  return context ?? SSR_ACTIONS_FALLBACK;
}
```

**Backward compatibility**: Keep existing `useListingFocus()` unchanged — it returns the combined context. Migrate consumers one by one.

#### Step 1b: Update ListingCard to use split context

**File**: `src/components/listings/ListingCard.tsx`

**Current** (line 102-103):
```typescript
const { setHovered, setActive, focusSource, hasProvider } = useListingFocus();
const { isHovered, isActive } = useIsListingFocused(listing.id);
```

**New**:
```typescript
const { setHovered, setActive, hasProvider } = useListingFocusActions();
const { focusSource } = useListingFocusState();
const { isHovered, isActive } = useIsListingFocused(listing.id);
```

**Wait** — `focusSource` still comes from state context, so ListingCard STILL re-renders on every hover change (hoveredId changes the state context value).

**Better approach**: `focusSource` is only used in the guard condition `if (focusSource === "map") return;` at lines 157 and 162. This can be read from a ref instead.

**Revised approach**: Add a `focusSourceRef` to the Actions context (same pattern as `isProgrammaticMoveRef` in MapBoundsContext):

```typescript
// In ListingFocusContext provider:
const focusSourceRef = useRef<FocusSource>(null);
// Update ref in setHovered callback (already exists)
const setHovered = useCallback((id: string | null, source?: FocusSource) => {
  setHoveredId(id);
  if (id && source) {
    focusSourceRef.current = source; // <-- ADD
    // ... existing timeout logic
  }
}, []);

// In Actions context value:
interface ListingFocusActionsValue {
  // ... existing
  focusSourceRef: React.RefObject<FocusSource>;
}
```

**Then in ListingCard** (line 102):
```typescript
const { setHovered, setActive, hasProvider, focusSourceRef } = useListingFocusActions();
const { isHovered, isActive } = useIsListingFocused(listing.id);
```

**And** update the guard (lines 157, 162):
```typescript
onMouseEnter={() => {
  if (focusSourceRef.current === "map") return;
  setHovered(listing.id, "list");
}}
```

This way ListingCard ONLY subscribes to:
1. `useListingFocusActions()` — stable, never re-renders
2. `useIsListingFocused(listing.id)` — re-renders ONLY when THIS card's hover/active state changes

#### Step 1c: Add React.memo to ListingCard

**File**: `src/components/listings/ListingCard.tsx`

**Current** (line 99):
```typescript
export default function ListingCard({ listing, isSaved, ... }: ListingCardProps) {
```

**New**: Wrap with `React.memo` + custom comparison:

```typescript
import { memo } from 'react';

function ListingCardInner({ listing, isSaved, className, priority = false, showTotalPrice = false, estimatedMonths = 1 }: ListingCardProps) {
  // ... existing component body unchanged
}

function arePropsEqual(prev: ListingCardProps, next: ListingCardProps): boolean {
  return (
    prev.listing.id === next.listing.id &&
    prev.listing.price === next.listing.price &&
    prev.listing.title === next.listing.title &&
    prev.listing.availableSlots === next.listing.availableSlots &&
    prev.listing.totalSlots === next.listing.totalSlots &&
    prev.listing.avgRating === next.listing.avgRating &&
    prev.listing.reviewCount === next.listing.reviewCount &&
    prev.listing.images === next.listing.images &&
    prev.listing.amenities === next.listing.amenities &&
    prev.listing.householdLanguages === next.listing.householdLanguages &&
    prev.listing.location.city === next.listing.location.city &&
    prev.listing.location.state === next.listing.location.state &&
    prev.isSaved === next.isSaved &&
    prev.className === next.className &&
    prev.priority === next.priority &&
    prev.showTotalPrice === next.showTotalPrice &&
    prev.estimatedMonths === next.estimatedMonths
  );
}

export default memo(ListingCardInner, arePropsEqual);
```

**Why custom comparison**: The `listing` object is rebuilt on every SSR response. Default `React.memo` uses `Object.is` which would fail for new listing object references even when data is identical. The custom function compares only the fields that ListingCard actually renders.

**Why these specific fields**: Every field in the comparison appears in the render output:
- `id` → key, data attributes, FavoriteButton
- `price`, `title` → display text
- `availableSlots`, `totalSlots` → SlotBadge
- `avgRating`, `reviewCount` → TrustBadge, rating display
- `images` → ImageCarousel (reference comparison intentional — SSR props are stable per render)
- `amenities` → amenity display
- `householdLanguages` → language display
- `location.city`, `location.state` → formatLocation display
- `isSaved` → FavoriteButton initialIsSaved
- `className`, `priority`, `showTotalPrice`, `estimatedMonths` → direct render props

**Fields NOT compared** (intentionally):
- `listing.description` — not rendered by ListingCard (only used in detail page)
- `listing.houseRules`, `listing.genderPreference`, etc. — not rendered

#### Step 1d: Add React.memo to ImageCarousel

**File**: `src/components/listings/ImageCarousel.tsx`

**Current** (line 31):
```typescript
export function ImageCarousel({ ... }: ImageCarouselProps) {
```

**New**:
```typescript
import { memo } from 'react';

function ImageCarouselInner({ ... }: ImageCarouselProps) {
  // ... existing body unchanged
}

function areCarouselPropsEqual(prev: ImageCarouselProps, next: ImageCarouselProps): boolean {
  return (
    prev.images === next.images &&
    prev.alt === next.alt &&
    prev.priority === next.priority &&
    prev.className === next.className &&
    prev.onImageError === next.onImageError &&
    prev.onDragStateChange === next.onDragStateChange
  );
}

export const ImageCarousel = memo(ImageCarouselInner, areCarouselPropsEqual);
export default ImageCarousel;
```

**Note on `images` comparison**: Using `===` (reference equality) is correct here. In ListingCard, `displayImages` is derived from `listing.images` with filtering. When the parent ListingCard is memoized and doesn't re-render, `displayImages` retains the same reference. When it DOES re-render (actual data change), we want ImageCarousel to re-render too.

**Note on `onImageError`/`onDragStateChange`**: In ListingCard:
- `handleImageError` is wrapped in `useCallback([], [])` (line 106) — stable reference
- `setIsDragging` is from `useState` — React guarantees stable reference

Both are referentially stable, so `===` comparison works.

#### Step 1e: Stabilize ListingCard's handleImageError

**Current** (line 106-108):
```typescript
const handleImageError = useCallback((index: number) => {
    setImageErrors(prev => new Set(prev).add(index));
}, []);
```

This is already stable (`[]` deps). Good.

### Migration Plan for ListingFocusContext Consumers

The 11 files using `useListingFocus` or `useIsListingFocused`:

| File | Current Hook | Migration Target | Reason |
|------|-------------|-----------------|--------|
| `ListingCard.tsx` | `useListingFocus` + `useIsListingFocused` | `useListingFocusActions` + `useIsListingFocused` | Primary optimization target |
| `Map.tsx` | `useListingFocus` or `useIsListingFocused` | Evaluate — may need state | Map needs hoveredId for markers |
| `SplitStayCard.tsx` | `useListingFocus` or `useIsListingFocused` | Same as ListingCard pattern | Also in search results |
| `SearchViewToggle.tsx` | TBD | TBD | Check usage |
| `ListScrollBridge.tsx` | TBD | TBD | Scroll orchestration |
| `StackedListingPopup.tsx` | TBD | TBD | Map popup |

**Migration priority**: ListingCard first (most impactful). Others can migrate later since backward-compatible `useListingFocus()` is preserved.

---

## PERF-H2: Split SearchV2DataContext into State + Setter Contexts

### Problem Analysis

`SearchV2DataContext` has a single context (line 79). The "selector hooks" (lines 178-221) are misleadingly named — they ALL call `useContext(SearchV2DataContext)`, which means ALL consumers re-render when ANY value changes.

**Real-world impact**:
- When `v2MapData` changes (new search results arrive), `V2MapDataSetter` re-renders even though it only needs setters
- When `dataVersion` increments (URL change), `PersistentMapWrapper` re-renders even though it hasn't consumed the new data yet
- When `isV2Enabled` toggles, all consumers re-render

### Solution Design

Split into **2 contexts** (not 3 — there's no need for a separate "data" vs "enabled" split given only 3 production consumers):

1. **SearchV2DataStateContext**: `{ v2MapData, isV2Enabled, dataVersion }` — changes when data changes
2. **SearchV2DataSetterContext**: `{ setV2MapData, setIsV2Enabled }` — stable callbacks, never changes

### Detailed Implementation

**File**: `src/contexts/SearchV2DataContext.tsx`

#### Add new context interfaces and contexts

After line 85 (after existing `SearchV2DataContext`):

```typescript
// ============================================================================
// SPLIT CONTEXTS - Separate State (changes) from Setters (stable)
// ============================================================================

interface SearchV2DataStateValue {
  v2MapData: V2MapData | null;
  isV2Enabled: boolean;
  dataVersion: number;
}

interface SearchV2DataSetterValue {
  setV2MapData: (data: V2MapData | null, version?: number) => void;
  setIsV2Enabled: (enabled: boolean) => void;
}

const SearchV2DataStateContext = createContext<SearchV2DataStateValue>({
  v2MapData: null,
  isV2Enabled: false,
  dataVersion: 0,
});

const SearchV2DataSetterContext = createContext<SearchV2DataSetterValue>({
  setV2MapData: () => {},
  setIsV2Enabled: () => {},
});
```

#### Update Provider

In `SearchV2DataProvider` (line 92), add memoized state and setter values, and nest providers:

```typescript
export function SearchV2DataProvider({ children }: { children: ReactNode }) {
  // ... existing state declarations (lines 93-99) unchanged

  // ... existing useEffect and setV2MapData callback unchanged

  // Memoize STATE value
  const stateValue = useMemo<SearchV2DataStateValue>(
    () => ({ v2MapData, isV2Enabled, dataVersion }),
    [v2MapData, isV2Enabled, dataVersion]
  );

  // Memoize SETTER value (stable callbacks)
  const setterValue = useMemo<SearchV2DataSetterValue>(
    () => ({ setV2MapData, setIsV2Enabled }),
    [setV2MapData, setIsV2Enabled]
  );

  // Keep combined context for backward compat
  const contextValue = useMemo<SearchV2DataContextValue>(
    () => ({ ...stateValue, ...setterValue }),
    [stateValue, setterValue]
  );

  return (
    <SearchV2DataContext.Provider value={contextValue}>
      <SearchV2DataStateContext.Provider value={stateValue}>
        <SearchV2DataSetterContext.Provider value={setterValue}>
          {children}
        </SearchV2DataSetterContext.Provider>
      </SearchV2DataStateContext.Provider>
    </SearchV2DataContext.Provider>
  );
}
```

#### Update selector hooks to use split contexts

```typescript
// TRUE selector: Only re-renders when v2MapData changes
export function useV2MapData(): V2MapData | null {
  const { v2MapData } = useContext(SearchV2DataStateContext);
  return v2MapData;
}

// TRUE selector: Stable callbacks, almost never re-renders
export function useV2MapDataSetter(): {
  setV2MapData: (data: V2MapData | null, version?: number) => void;
  dataVersion: number;
} {
  const { setV2MapData } = useContext(SearchV2DataSetterContext);
  const { dataVersion } = useContext(SearchV2DataStateContext);
  return useMemo(
    () => ({ setV2MapData, dataVersion }),
    [setV2MapData, dataVersion]
  );
}

// TRUE selector: Only re-renders when isV2Enabled changes
export function useIsV2Enabled(): {
  isV2Enabled: boolean;
  setIsV2Enabled: (enabled: boolean) => void;
} {
  const { isV2Enabled } = useContext(SearchV2DataStateContext);
  const { setIsV2Enabled } = useContext(SearchV2DataSetterContext);
  return useMemo(
    () => ({ isV2Enabled, setIsV2Enabled }),
    [isV2Enabled, setIsV2Enabled]
  );
}

// TRUE selector: Only re-renders when dataVersion changes
export function useDataVersion(): number {
  const { dataVersion } = useContext(SearchV2DataStateContext);
  return dataVersion;
}
```

**IMPORTANT caveat**: `useV2MapDataSetter` still reads `dataVersion` from state context. This is intentional — `V1PathResetSetter` needs the current `dataVersion` to pass to `setV2MapData(null, dataVersion)`. This means it will re-render when dataVersion changes, but NOT when v2MapData or isV2Enabled changes.

#### Migrate production consumers

**V2MapDataSetter** (`src/components/search/V2MapDataSetter.tsx`):

Current (line 21):
```typescript
const { setV2MapData, setIsV2Enabled } = useSearchV2Data();
```

New — use setter-only context:
```typescript
import { useV2MapDataSetter, useIsV2Enabled } from "@/contexts/SearchV2DataContext";
// ...
const { setV2MapData } = useV2MapDataSetter();
const { setIsV2Enabled } = useIsV2Enabled();
```

Wait — `useIsV2Enabled` still reads from state context. For a setter-only consumer like V2MapDataSetter, we need direct access to the setter context:

```typescript
// Add a pure setter hook:
export function useSearchV2Setters(): SearchV2DataSetterValue {
  return useContext(SearchV2DataSetterContext);
}
```

Then V2MapDataSetter:
```typescript
const { setV2MapData, setIsV2Enabled } = useSearchV2Setters();
```

This means V2MapDataSetter will NEVER re-render from context changes — only from prop changes (`data` prop from page.tsx).

**V1PathResetSetter** (`src/components/search/V1PathResetSetter.tsx`):

Current (line 28):
```typescript
const { setV2MapData, setIsV2Enabled, dataVersion } = useSearchV2Data();
```

New:
```typescript
const { setV2MapData, dataVersion } = useV2MapDataSetter();
const { setIsV2Enabled } = useSearchV2Setters();
```

This re-renders only on `dataVersion` change (needed for the version guard), not on `v2MapData` or `isV2Enabled` changes.

**PersistentMapWrapper** (`src/components/PersistentMapWrapper.tsx:410`):

Current:
```typescript
const { v2MapData, isV2Enabled, setIsV2Enabled } = useSearchV2Data();
```

New:
```typescript
const v2MapData = useV2MapData();
const { isV2Enabled, setIsV2Enabled } = useIsV2Enabled();
```

PersistentMapWrapper legitimately needs all these values, so it will re-render when any of them change — this is correct behavior.

### Consumer Migration Summary

| File | Current | New Hook(s) | Re-render reduction |
|------|---------|-------------|---------------------|
| `V2MapDataSetter.tsx` | `useSearchV2Data()` | `useSearchV2Setters()` | No longer re-renders on v2MapData/isV2Enabled/dataVersion changes |
| `V1PathResetSetter.tsx` | `useSearchV2Data()` | `useV2MapDataSetter()` + `useSearchV2Setters()` | Only re-renders on dataVersion change (needed) |
| `PersistentMapWrapper.tsx` | `useSearchV2Data()` | `useV2MapData()` + `useIsV2Enabled()` | Same re-renders (legitimately needs all state) |

---

## Dependency Graph

```
PERF-H1 and PERF-H2 are independent — can be executed in parallel.

PERF-H1 internal order:
  1a. Split ListingFocusContext (State + Actions + focusSourceRef)
  1b. Update ListingCard to use split context
  1c. Add React.memo to ListingCard
  1d. Add React.memo to ImageCarousel
  1e. Verify handleImageError stability (already done — no change needed)

PERF-H2 internal order:
  2a. Add split context interfaces and createContext calls
  2b. Update SearchV2DataProvider to nest 3 providers
  2c. Add useSearchV2Setters() hook
  2d. Update selector hooks to use split contexts
  2e. Migrate V2MapDataSetter
  2f. Migrate V1PathResetSetter
  2g. Migrate PersistentMapWrapper
```

---

## Test Strategy

### PERF-H1 Tests

**Unit tests** (`src/__tests__/contexts/ListingFocusContext.test.tsx` — extend existing):

1. **State/Actions split isolation**:
   - `useListingFocusActions()` returns stable references across state changes
   - `useListingFocusState()` updates when hoveredId changes
   - `focusSourceRef.current` updates synchronously with `setHovered`

2. **ListingCard re-render count** (`src/__tests__/components/ListingCard.test.tsx` — extend existing):
   ```typescript
   it('does not re-render when a DIFFERENT listing is hovered', () => {
     const renderCount = jest.fn();
     // Render ListingCard with listing.id = "A" inside ListingFocusProvider
     // Trigger setHovered("B", "list") — different listing
     // Assert renderCount called only once (initial render)
   });

   it('re-renders when THIS listing is hovered', () => {
     // Trigger setHovered("A", "list") — same listing
     // Assert renderCount called twice (initial + hover)
   });

   it('does not re-render when only showTotalPrice changes but listing data is identical', () => {
     // Wrap in React.memo test — re-render parent with same listing object
     // Assert ListingCard did not re-render
   });
   ```

3. **ImageCarousel memo test**:
   ```typescript
   it('does not re-render when parent re-renders with same images reference', () => {
     // Verify memo prevents re-render with stable props
   });
   ```

### PERF-H2 Tests

**Unit tests** (`src/__tests__/contexts/SearchV2DataContext.test.tsx` — extend existing):

1. **Setter isolation**:
   ```typescript
   it('useSearchV2Setters does not re-render when v2MapData changes', () => {
     const renderCount = { current: 0 };
     function TestConsumer() {
       useSearchV2Setters();
       renderCount.current++;
       return null;
     }
     // Render inside provider
     // Call setV2MapData with new data
     // Assert renderCount.current === 1 (only initial render)
   });
   ```

2. **State selector isolation**:
   ```typescript
   it('useV2MapData re-renders only when v2MapData changes, not when isV2Enabled changes', () => {
     // Render consumer using useV2MapData
     // Toggle isV2Enabled
     // Assert no re-render
     // Change v2MapData
     // Assert re-render occurred
   });
   ```

3. **Backward compatibility**:
   ```typescript
   it('useSearchV2Data still returns all values', () => {
     // Verify existing hook still works for backward compat
   });
   ```

### E2E Verification

No new E2E tests needed — existing search flow tests cover functional correctness. Performance gains are verified via unit test render counts.

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Custom `arePropsEqual` misses a rendered field | 🟠 MAJOR | Compare against JSX output; include every field used in render. If a field is missed, worst case is stale UI on that field change — not a crash. |
| `focusSourceRef` read in event handler may be stale | 🟡 MINOR | Refs are always current in event handlers (they're not closures). This is the same pattern as `isProgrammaticMoveRef` in MapBoundsContext. |
| Triple-nested providers add overhead | 🟡 MINOR | React docs confirm: "Context providers don't add significant overhead." MapBoundsContext already uses this pattern successfully. |
| Backward-compat `useSearchV2Data()` still uses old single context | 🟡 MINOR | This is intentional. It will still re-render on all changes, but consumers are being migrated to selector hooks. Remove after migration complete. |
| Tests break due to context structure change | 🟡 MINOR | All existing hooks are preserved. New hooks are additive. Test wrapper functions may need to nest providers — update test utils. |

---

## Harsh Critic Report

### Verdict: CONDITIONAL PASS

**🟠 MAJOR — arePropsEqual fragility**: If `ListingData` interface gains new rendered fields in the future, the custom comparison function must be updated. Otherwise the card shows stale data for the new field.

**Mitigation**: Add a code comment in `arePropsEqual` listing the contract: "Update this function whenever adding new fields to ListingCard's render output." Alternatively, use shallow comparison of all `listing` sub-fields — but this risks false positives on unused fields.

**🟡 MINOR — focusSource still triggers re-renders for other consumers**: The `focusSource` field is in the State context. Components like Map.tsx that need `focusSource` will still re-render on every hover. This is correct for Map (needs to update marker styles) but could be further optimized with a dedicated `useFocusSource()` selector.

**🟡 MINOR — SearchV2DataContext selector hooks still have mixed concerns**: `useV2MapDataSetter` reads from BOTH contexts (setter for `setV2MapData`, state for `dataVersion`). This is intentional for version guarding but means it's not a pure setter hook.

**All 🟠 items have mitigations. No 🔴 blockers.**

---

## Rollback Plan

Both changes are purely additive:
- New contexts are added alongside existing ones
- Existing hooks (`useListingFocus()`, `useSearchV2Data()`) continue to work
- `React.memo` can be removed by reverting to `export default function ListingCard`

**Rollback**: Revert the commit. No data changes, no migrations, no schema changes.

---

## Implementation Steps (Execution Checklist)

### PERF-H1: React.memo + ListingFocusContext Split

- [ ] **H1.1**: In `src/contexts/ListingFocusContext.tsx`:
  - Add `ListingFocusStateValue` and `ListingFocusActionsValue` interfaces
  - Add `ListingFocusStateContext` and `ListingFocusActionsContext` with `createContext`
  - Add `SSR_STATE_FALLBACK` and `SSR_ACTIONS_FALLBACK` constants
  - Add `focusSourceRef` to provider (useRef, update in setHovered callback)
  - Add `stateValue` useMemo (hoveredId, activeId, scrollRequest, focusSource)
  - Add `actionsValue` useMemo (setHovered, setActive, requestScrollTo, ackScrollTo, clearFocus, hasProvider, focusSourceRef)
  - Nest 3 providers in return JSX
  - Export `useListingFocusState()` and `useListingFocusActions()` hooks
  - Keep `useListingFocus()` and `useIsListingFocused()` unchanged for backward compat

- [ ] **H1.2**: In `src/components/listings/ListingCard.tsx`:
  - Change import: add `useListingFocusActions` from `ListingFocusContext`
  - Replace `useListingFocus()` with `useListingFocusActions()`
  - Use `focusSourceRef.current` instead of `focusSource` in event handlers
  - Rename component function to `ListingCardInner`
  - Add `arePropsEqual` comparison function
  - Export `memo(ListingCardInner, arePropsEqual)` as default

- [ ] **H1.3**: In `src/components/listings/ImageCarousel.tsx`:
  - Rename function to `ImageCarouselInner`
  - Add `areCarouselPropsEqual` comparison function
  - Export `memo(ImageCarouselInner, areCarouselPropsEqual)` as named + default

- [ ] **H1.4**: Run lint + typecheck: `pnpm lint && pnpm typecheck`

- [ ] **H1.5**: Run existing tests: `pnpm test -- --testPathPattern="ListingCard|ListingFocus|ImageCarousel"`

- [ ] **H1.6**: Add re-render count tests to `ListingCard.test.tsx` and `ListingFocusContext.test.tsx`

- [ ] **H1.7**: Run full test suite: `pnpm test`

### PERF-H2: Split SearchV2DataContext

- [ ] **H2.1**: In `src/contexts/SearchV2DataContext.tsx`:
  - Add `SearchV2DataStateValue` and `SearchV2DataSetterValue` interfaces
  - Add `SearchV2DataStateContext` and `SearchV2DataSetterContext` with `createContext`
  - Add `stateValue` and `setterValue` useMemos in provider
  - Nest 3 providers in return JSX
  - Update selector hooks to use split contexts
  - Add `useSearchV2Setters()` hook for pure setter access
  - Keep `useSearchV2Data()` unchanged for backward compat

- [ ] **H2.2**: Migrate `V2MapDataSetter.tsx` to `useSearchV2Setters()`

- [ ] **H2.3**: Migrate `V1PathResetSetter.tsx` to `useV2MapDataSetter()` + `useSearchV2Setters()`

- [ ] **H2.4**: Migrate `PersistentMapWrapper.tsx` to `useV2MapData()` + `useIsV2Enabled()`

- [ ] **H2.5**: Run lint + typecheck: `pnpm lint && pnpm typecheck`

- [ ] **H2.6**: Run existing tests: `pnpm test -- --testPathPattern="SearchV2Data|V1Path|V2MapData|PersistentMap"`

- [ ] **H2.7**: Add re-render isolation tests to `SearchV2DataContext.test.tsx`

- [ ] **H2.8**: Run full test suite: `pnpm test`

---

## Open Questions

None — all implementation details are verified and specified.
