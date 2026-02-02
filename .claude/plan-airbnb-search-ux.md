# Airbnb Search UX — 5-Terminal Implementation Plan

## Strategy: Git Worktrees + Shared Spec Files

Each of the 5 Claude Code terminals runs in its own **git worktree** on a dedicated branch. A shared spec file (this document) serves as the coordination layer. After each terminal completes its work, branches are merged sequentially into `main`.

---

## Setup (run once before starting)

```bash
# From the repo root (/mnt/d/Documents/roomshare)
mkdir -p ../roomshare-worktrees

# Create 5 worktrees — one per terminal
git worktree add ../roomshare-worktrees/t1-map-pins    -b feat/map-pins
git worktree add ../roomshare-worktrees/t2-list-ux      -b feat/list-ux
git worktree add ../roomshare-worktrees/t3-filters-nav   -b feat/filters-nav
git worktree add ../roomshare-worktrees/t4-mobile        -b feat/mobile-ux
git worktree add ../roomshare-worktrees/t5-a11y-perf     -b feat/a11y-perf

# Install deps in each (they share node_modules via symlink or separate install)
for d in t1-map-pins t2-list-ux t3-filters-nav t4-mobile t5-a11y-perf; do
  (cd ../roomshare-worktrees/$d && pnpm i)
done
```

Then open 5 terminals:
```bash
# Terminal 1:  cd ../roomshare-worktrees/t1-map-pins && claude
# Terminal 2:  cd ../roomshare-worktrees/t2-list-ux && claude
# Terminal 3:  cd ../roomshare-worktrees/t3-filters-nav && claude
# Terminal 4:  cd ../roomshare-worktrees/t4-mobile && claude
# Terminal 5:  cd ../roomshare-worktrees/t5-a11y-perf && claude
```

### Merge order (after all complete)
```
main ← t1-map-pins ← t2-list-ux ← t3-filters-nav ← t4-mobile ← t5-a11y-perf
```
Merge sequentially to resolve conflicts incrementally.

---

## Terminal 1: Map Pins & Map Features

**Branch:** `feat/map-pins`
**Scope:** Everything on the map canvas
**Files touched:** `src/components/Map.tsx`, `src/components/map/`, `src/lib/search/`, new files under `src/components/map/`

### Tasks

#### 1.1 — Two-Tier Pin System (enhance existing)
- **Current state**: Already has `primary`/`mini` tiers in `Map.tsx:779-878`
- **Changes**:
  - Mini-pins become **gray dots** (no price) that expand into price pins on zoom
  - Add zoom-level threshold logic: below zoom 12 → dots only, 12-14 → top-N as price pins, 14+ → all price pins
  - Smooth CSS transition on tier change (`scale(0) → scale(1)` with 200ms ease)

#### 1.2 — Cluster Markers (enhance existing)
- **Current state**: Mapbox native clustering exists
- **Changes**:
  - Custom cluster circle renderer showing count (e.g., "50+")
  - Click-to-zoom animation (flyTo with padding)
  - Cluster ring color based on avg price bucket (green/yellow/red)

#### 1.3 — Synchronized Highlighting (enhance existing)
- **Current state**: Bidirectional hover sync via `ListingFocusContext`
- **Changes**:
  - Pin color change on hover: white → black (light mode), zinc-700 → white (dark mode)
  - Scale-up animation (1.0 → 1.15) with spring easing
  - Pulsing ring on active pin (CSS keyframe)

#### 1.4 — Privacy Circles
- New component: `src/components/map/PrivacyCircle.tsx`
- Render a ~200m radius translucent circle instead of exact pin for unbooked listings
- Use Mapbox `circle` layer with `circle-radius` interpolated by zoom

#### 1.5 — Boundary Polygons
- When search query matches a named area, fetch boundary GeoJSON (from Mapbox Geocoding API `types=neighborhood,locality`)
- Render as a faint shaded `fill` layer with `fill-opacity: 0.08`
- New file: `src/components/map/BoundaryLayer.tsx`

#### 1.6 — Custom User Markers
- "Drop a pin" button in map controls
- Click-to-place marker with address label (reverse geocode)
- Show walking/driving distance from user pin to hovered listing
- Store in session state (not persisted)
- New file: `src/components/map/UserMarker.tsx`

#### 1.7 — POI & Neighborhood Labels
- Toggle layer showing curated POIs (transit, landmarks, parks)
- Neighborhood "vibe" labels rendered as Mapbox symbol layer
- Data source: derive from listing descriptions/amenities (aggregate per area)
- New file: `src/components/map/POILayer.tsx`

#### 1.8 — Map Layers Toggle
- Floating button group: Standard / Satellite / Transit
- Switch Mapbox style URL on selection
- Persist choice in sessionStorage

---

## Terminal 2: List Page & Card UX

**Branch:** `feat/list-ux`
**Scope:** Search results grid, listing cards, carousels, badges, pricing
**Files touched:** `src/components/ListingCard.tsx`, `src/components/search/SearchResultsClient.tsx`, new components

### Tasks

#### 2.1 — Enhanced Image Carousels
- **Current state**: Embla Carousel exists
- **Changes**:
  - Add dot indicators below images (max 5 dots)
  - Swipe/arrow navigation (arrows appear on hover, desktop only)
  - Lazy-load images beyond first 2
  - Prevent card click when swiping (pointer-events guard)

#### 2.2 — Trust Badges
- "Guest Favorite" badge (top-left overlay on card image)
  - Derive from review score: ≥4.9 → "Guest Favorite" (gold)
  - Superhost badge if host qualifies
- New component: `src/components/ui/TrustBadge.tsx`

#### 2.3 — Total Price Toggle
- Toggle switch in search header: "Show total price"
- When ON: display `price × estimated_days + fees`
- Store preference in `searchParams` or `sessionStorage`
- Update `ListingCard` to conditionally render total vs nightly

#### 2.4 — Skeleton Loading States (enhance existing)
- **Current state**: Some skeleton exists
- **Changes**:
  - Shimmer animation (CSS `@keyframes shimmer` with gradient)
  - Match exact card layout (image ratio, text lines, badge position)
  - Show 12 skeletons during initial load

#### 2.5 — "Show More" Pagination (enhance existing)
- **Current state**: Cursor-based pagination with "Load more" exists
- **Changes**:
  - Add progress indicator: "Showing 12 of ~48 listings"
  - Contextual footer: "100+ stays in [Location]"
  - Respect 60-item cap (already exists via `MAX_ACCUMULATED`)

#### 2.6 — Wishlist Heart Animation
- **Current state**: SavedListing functionality exists
- **Changes**:
  - Lottie-style heart animation on save (CSS keyframes: scale bounce + color fill)
  - Optimistic UI update (instant heart fill, revert on error)
  - New file: `src/components/ui/HeartButton.tsx`

#### 2.7 — Split Stay Cards
- For trips >7 days where no single listing covers all dates
- Special card layout showing 2 listings side-by-side with a connecting arc
- Server-side: new search mode that finds complementary pairs
- New files: `src/components/search/SplitStayCard.tsx`, `src/lib/search/split-stay.ts`

#### 2.8 — Flexible Date Pills
- Row of date suggestion pills above results
- Show alternative dates with lower avg price
- Server action to compute cheapest nearby date ranges
- New file: `src/components/search/DatePills.tsx`

---

## Terminal 3: Filters & Navigation

**Branch:** `feat/filters-nav`
**Scope:** Filter system, category bar, search bar, sorting
**Files touched:** `src/components/SearchForm.tsx`, `src/components/search/FilterModal.tsx`, `src/lib/filter-schema.ts`, new components

### Tasks

#### 3.1 — Category Icon Bar
- Horizontal scrollable bar with icons: "Entire Place", "Near Transit", "Pet Friendly", "Furnished", "Short Term", etc.
- High-fidelity icons (use Lucide or custom SVGs)
- Scroll with grab-to-drag + arrow buttons on desktop
- Selection applies as a filter param
- New file: `src/components/search/CategoryBar.tsx`

#### 3.2 — Price Histogram
- Inside price filter section of FilterModal
- Bar chart showing price distribution in current bounds
- Use server action to fetch histogram data (`SELECT price_bucket, count`)
- Highlight selected range with accent color
- New files: `src/components/search/PriceHistogram.tsx`, server action in `src/lib/search/`

#### 3.3 — Recommended Filters
- Context-aware filter suggestions based on location
- E.g., "Near Campus" for college towns, "Furnished" for short-term areas
- Derive from aggregate listing data in current bounds
- Show as pill row below category bar
- New file: `src/components/search/RecommendedFilters.tsx`

#### 3.4 — Shrinking Search Bar
- On scroll, collapse the full search form into a compact pill
- Show: location name + date range + guest count (summary)
- Click to expand back to full form
- Use `IntersectionObserver` or scroll position tracking
- Modify: `src/components/SearchForm.tsx`, `src/components/search/SearchHeaderWrapper.tsx`

#### 3.5 — Enhanced Sort Options
- Add sort options: "Best Match", "Price ↑", "Price ↓", "Newest", "Rating"
- Visual sort dropdown with active indicator
- Modify: `src/lib/filter-schema.ts`, sort handling in search service

#### 3.6 — Filter Impact Analysis UI
- **Current state**: Server-side filter impact analysis exists
- **Changes**:
  - When 0 results, show "Remove [filter] to see X more listings" suggestions
  - Inline filter badges with "×" to quickly remove individual filters
  - Active filter count badge on filter button

#### 3.7 — Natural Language Search (AI-Powered)
- Enhance search bar to accept natural language queries
- Parse with server action: extract location, price range, amenities, room type
- Use pattern matching + keyword extraction (no LLM needed for V1)
- Map extracted entities to existing filter params
- New file: `src/lib/search/natural-language-parser.ts`

---

## Terminal 4: Mobile UX

**Branch:** `feat/mobile-ux`
**Scope:** Mobile bottom sheet, touch interactions, mobile-specific features
**Files touched:** `src/components/search/MobileBottomSheet.tsx`, `src/components/SearchViewToggle.tsx`, new components

### Tasks

#### 4.1 — Enhanced Bottom Sheet (improve existing)
- **Current state**: 3 snap points (15vh, 50vh, 85vh) with drag
- **Changes**:
  - Spring physics for snap animations (use Framer Motion spring)
  - Overscroll rubber-band effect at sheet edges
  - Sheet header shows result count + "Pull up for listings"
  - Dim map overlay when sheet is expanded (opacity 0.3 overlay)

#### 4.2 — Floating Map Button
- Redesign the map/list toggle as a floating pill at bottom-center
- Show "Map" with icon when in list mode, "List · 48" with count when in map mode
- Thumb-accessible position (bottom: 24px, centered)
- Smooth morph animation between states

#### 4.3 — Pull-to-Refresh
- On list view, pull down to refresh listings
- Subtle loading animation at top
- Trigger re-fetch with current search params
- New file: `src/components/search/PullToRefresh.tsx`

#### 4.4 — Touch-Optimized Map Interactions
- Larger hit targets for map pins on mobile (min 44×44px)
- Tap pin → bottom sheet slides to half with listing preview
- Swipe between listing previews in half-sheet mode
- Pinch-to-zoom gestures remain native to Mapbox

#### 4.5 — Mobile Search Bar Optimization
- Compact search bar on mobile (location only, expandable)
- Full-screen search overlay on tap (with recent searches)
- "Back" gesture dismisses overlay
- Modify: `src/components/SearchForm.tsx` responsive behavior

#### 4.6 — Mobile Carousel Enhancements
- Full-bleed image carousels on mobile cards
- Swipe between images with momentum
- Page dots (max 5) below image
- Prevent vertical scroll while swiping horizontally

#### 4.7 — Haptic-Style Feedback (CSS)
- Short vibration on pin tap (if `navigator.vibrate` available)
- Micro-animations as haptic substitutes: quick scale pulse on interactive elements
- Active state feedback on all tappable elements (background flash)

---

## Terminal 5: Accessibility & Performance

**Branch:** `feat/a11y-perf`
**Scope:** A11y compliance, performance optimization, cross-cutting concerns
**Files touched:** Multiple files (additive changes only — ARIA attrs, perf optimizations)

### Tasks

#### 5.1 — Screen Reader Optimization
- Audit all listing cards for ARIA labels
- Enforce read order: Price → Rating → Room Type → Location → Badges
- Add `aria-live="polite"` region for search results updates
- Map pins: `role="button"` with `aria-label="$X/month, [listing title]"`

#### 5.2 — Keyboard Navigation
- Tab through listing cards (focus ring visible)
- Arrow keys navigate image carousels within focused card
- Enter/Space activates focused card or pin
- Escape closes popups, modals, expanded sheet
- Skip-to-content link for search results

#### 5.3 — High Contrast Map
- Detect `prefers-contrast: more` media query
- Switch to high-contrast Mapbox style (darker land, lighter roads)
- Increase pin border width and contrast
- Ensure all text labels meet WCAG AA (4.5:1 ratio)

#### 5.4 — Dynamic Type / Large Print
- Respect OS font size preferences (`font-size: clamp(...)`)
- Map labels scale with system settings
- Test at 200% zoom — no horizontal scroll, no overflow

#### 5.5 — Performance: Bundle Optimization
- Audit with `next build` + bundle analyzer
- Lazy-load map component (`dynamic(() => import('./Map'), { ssr: false })`)
- Code-split filter modal
- Defer non-critical JS (POI layer, split-stay logic)

#### 5.6 — Performance: Search Debouncing & Cancellation
- **Current state**: 300ms debounce on search, 600ms on map move, AbortController exists
- **Changes**:
  - Verify AbortController cancels previous in-flight requests
  - Add request deduplication (skip if params unchanged)
  - Implement stale-while-revalidate for search results cache (30s)

#### 5.7 — Performance: Image Optimization
- Ensure all listing images use `next/image` with proper `sizes` attr
- Lazy-load images below fold (`loading="lazy"`)
- Use `blur` placeholder for images
- WebP/AVIF format via Next.js image optimizer

#### 5.8 — Core Web Vitals Targets
- LCP < 2.5s (hero content = first listing card)
- FID < 100ms (main thread budget)
- CLS < 0.1 (skeleton loaders prevent shifts)
- Add performance marks for key interactions
- Test with Lighthouse CI in Playwright

#### 5.9 — E2E Tests for New Features
- Add Playwright tests covering:
  - Pin tier changes on zoom
  - Category bar filter application
  - Total price toggle
  - Bottom sheet snap points
  - Keyboard navigation through cards
  - Screen reader label verification

---

## Dependency Map

```
T1 (Map Pins) ──────┐
                     ├──→ T4 (Mobile) depends on T1's pin changes
T2 (List UX) ───────┤
                     ├──→ T5 (A11y/Perf) depends on T1+T2+T3 for audit
T3 (Filters/Nav) ───┘

T4 (Mobile) ────────→ T5 (A11y/Perf) audits mobile features too
```

**Low-conflict zones** (safe to parallelize):
- T1 owns `Map.tsx` and `src/components/map/*`
- T2 owns `ListingCard.tsx` and card-level components
- T3 owns `SearchForm.tsx`, `FilterModal.tsx`, filter logic
- T4 owns `MobileBottomSheet.tsx` and mobile-specific components
- T5 makes additive-only changes (ARIA attrs, perf wrappers)

---

## Coordination Protocol

1. **Before starting**: Each terminal reads this spec file
2. **No shared file edits**: Each terminal owns specific files (see above)
3. **New components only**: Prefer creating new files over editing shared ones
4. **Interface contracts**: If T2 needs data from T3's filter changes, use existing context APIs
5. **Merge order**: T1 → T2 → T3 → T4 → T5 (resolve conflicts at each step)
6. **Verification**: Each terminal runs `pnpm lint && pnpm typecheck` before committing

---

## Prompt Templates (copy-paste into each terminal)

### Terminal 1
```
Read the plan at .claude/plan-airbnb-search-ux.md, section "Terminal 1: Map Pins & Map Features".
Implement tasks 1.1 through 1.8 in order. You own src/components/Map.tsx and src/components/map/.
Create new files as needed. Run lint+typecheck after each task. Commit after each task.
```

### Terminal 2
```
Read the plan at .claude/plan-airbnb-search-ux.md, section "Terminal 2: List Page & Card UX".
Implement tasks 2.1 through 2.8 in order. You own src/components/ListingCard.tsx and listing card components.
Create new files as needed. Run lint+typecheck after each task. Commit after each task.
```

### Terminal 3
```
Read the plan at .claude/plan-airbnb-search-ux.md, section "Terminal 3: Filters & Navigation".
Implement tasks 3.1 through 3.7 in order. You own src/components/SearchForm.tsx and filter components.
Create new files as needed. Run lint+typecheck after each task. Commit after each task.
```

### Terminal 4
```
Read the plan at .claude/plan-airbnb-search-ux.md, section "Terminal 4: Mobile UX".
Implement tasks 4.1 through 4.7 in order. You own src/components/search/MobileBottomSheet.tsx and mobile components.
Create new files as needed. Run lint+typecheck after each task. Commit after each task.
```

### Terminal 5
```
Read the plan at .claude/plan-airbnb-search-ux.md, section "Terminal 5: Accessibility & Performance".
Implement tasks 5.1 through 5.9 in order. You make additive-only changes (ARIA attrs, perf wrappers, tests).
Run lint+typecheck after each task. Commit after each task.
```
