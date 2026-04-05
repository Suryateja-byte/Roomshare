# Search Page UI/UX Redesign — Architectural Context Document

## PHASE 0: DUAL CODEBASE DISCOVERY

---

### STEP A: Reference Implementation Inventory

The reference is a single-file React SPA (~800 lines). Key inventory:

**Visual Components:**
1. Smart Header — Logo + collapsible search + actions; morphs on scroll (isScrolled state)
2. Big Search Bar — Airbnb-style "Where" + "Budget" split pill with large search icon button
3. Compact Search Pill — Shows in scrolled state with location + price range summary
4. CMD+K Search Modal — Full-screen with location input, suggestions, recent searches, AI query builder
5. Category Tabs — Horizontal scrollable pills (All Spaces, Entire Place, Private Room, etc.)
6. Filter Drawer — Right-slide with price histogram, range slider, room type checkboxes, amenities grid, house rules pills
7. Property Cards — 4:3 aspect image carousel, hover-reveal nav arrows, dot indicators, tags (NEW, LIVED-IN), favorites, rating badge, serif price
8. Leaflet Map — Price markers with hover/active states, search-as-I-move, dropped pin feature
9. Property Detail Drawer — Right-slide with gallery, host info, amenities list, sticky action footer
10. Save Search Modal — Center popup with name field, email toggle
11. Mobile Map Toggle — Floating pill bottom-center
12. Zero Results State — Dashed border, illustration, dual CTAs
13. Applied Filter Chips — Below heading with X remove buttons
14. Sort Dropdown — Hover-reveal menu (Recommended, Price Low/High, Newest, Top Rated)
15. Total Price Toggle — Switch monthly/total
16. Load More Button — With loading spinner ring
17. "Don't miss out" CTA — Save search banner with sparkle decoration

**Animations:**
| Animation | Trigger | Duration/Easing | Technique |
|---|---|---|---|
| `fade-in-up` | Mount/appear | 0.6s cubic-bezier(0.16,1,0.3,1) | CSS @keyframes |
| Header morph (logo/search/categories) | Scroll position | 500ms cubic-bezier(0.16,1,0.3,1) | CSS transitions on max-width, opacity, grid-template-rows |
| Search modal slide | Open/close | 500ms cubic-bezier(0.16,1,0.3,1) | CSS transform translate-y + scale |
| Filter drawer slide | Open/close | 500ms cubic-bezier(0.16,1,0.3,1) | CSS transform translate-x |
| Save search modal scale | Open/close | 400ms cubic-bezier(0.16,1,0.3,1) | CSS transform scale + translate-y |
| Detail drawer slide | Open/close | 500ms cubic-bezier(0.16,1,0.3,1) | CSS transform translate-x |
| Card hover lift | mouseEnter | 300ms | CSS -translate-y-1 |
| Card image zoom | mouseEnter | 1000ms ease-out | CSS scale-105 |
| Map marker hover | mouseEnter | 200ms | CSS scale-110 + color change |
| Category pill active | Click | 300ms | CSS bg/border/shadow |
| Search area button | Map moveend | 400ms cubic-bezier(0.16,1,0.3,1) | CSS translate-y + scale |
| Loader spinner | Loading state | 0.8s cubic-bezier(0.4,0,0.2,1) infinite | CSS @keyframes spin |
| Staggered card entrance | Mount | 50ms per card delay | CSS animation-delay on fade-in-up |
| Image dot indicator | Slide change | 300ms | CSS width transition |

**Layout Architecture:**
- Full viewport: `h-[100dvh]` flex container
- Split panels: List (50-60%) / Map (40-50%) with CSS transitions
- Mobile: absolute positioned panels with translate-x sliding
- Header: Sticky with scroll-driven grid-template-rows collapse (0fr/1fr)
- Card grid: 1col → 2col (sm) → 3col (lg, map hidden) → 4col (xl, map hidden) / 2col (map shown)
- Max width constraints on search bar (max-w-3xl), content padding (px-5 to px-12 responsive)

**Styling Approach:**
- Color palette: `#fbf9f4` (cream bg), `#1b1c19` (near-black text), `#9a4027` (terracotta accent), `#dcc1b9` (warm secondary), `#eae8e3` (muted)
- Typography: Manrope (sans-serif, body) + Newsreader (serif italic, prices/headings)
- Glass morphism: `backdrop-blur-24px` on overlays
- Ghost shadows: `0 12px 40px -12px rgba(27,28,25,0.12)`
- Large border radius: up to `rounded-[2.5rem]`
- Micro-labels: `text-[0.6rem] uppercase tracking-[0.2em] font-bold`

**Libraries/Dependencies:**
- Leaflet 1.9.4 (CDN loaded, ~170KB)
- Google Fonts: Manrope 400-800, Newsreader 400-500 italic
- NO animation library (pure CSS transitions/keyframes)
- NO component library (all custom)
- Inline SVG icons (no icon library)

---

### STEP B: Our Current Implementation Inventory

**Architecture:** Next.js 16 App Router, SSR, 10+ React contexts, URL-driven state, Mapbox GL JS

**Files in scope (68+ files):**
- `src/app/search/page.tsx` — SSR server component, V2/V1 search orchestration
- `src/app/search/layout.tsx` — Persistent providers: SearchTransition, FilterState, MobileSearch, MapBounds, ListingFocus, SearchV2Data
- `src/app/search/actions.ts` — Server action: fetchMoreListings
- `src/app/search/loading.tsx` — Shimmer skeleton
- `src/app/search/error.tsx` — Error boundary with Sentry
- `src/components/SearchLayoutView.tsx` — Split view orchestrator
- `src/components/SearchHeaderWrapper.tsx` — Collapsible header with auth, notifications, messages
- `src/components/SearchViewToggle.tsx` — Desktop split + mobile bottom sheet
- `src/components/SearchForm.tsx` — Filter state management (master)
- `src/components/CollapsedMobileSearch.tsx` — Mobile compact pill
- `src/components/search/CompactSearchPill.tsx` — Desktop compact pill
- `src/components/search/MobileSearchOverlay.tsx` — Full-screen mobile search
- `src/components/search/MobileBottomSheet.tsx` — Draggable sheet (snap points, gestures)
- `src/components/search/FloatingMapButton.tsx` — Mobile map/list toggle
- `src/components/search/SearchResultsClient.tsx` — Client-side pagination, dedup, load more
- `src/components/search/FilterModal.tsx` — Full filter drawer (Framer Motion)
- `src/components/search/CategoryBar.tsx` — Category pills with URL sync
- `src/components/search/PriceRangeFilter.tsx` — Radix slider + histogram
- `src/components/search/PriceHistogram.tsx` — Histogram bars
- `src/components/search/TotalPriceToggle.tsx` — Price display toggle
- `src/components/search/RecommendedFilters.tsx` — Contextual suggestions
- `src/components/search/MobileListingPreview.tsx` — Swipeable preview strip
- `src/components/search/SuggestedSearches.tsx` — Browse mode suggestions
- `src/components/search/DrawerZeroState.tsx` — Zero-count warning
- `src/components/search/SearchResultsLoadingWrapper.tsx` — Transition wrapper
- `src/components/search/SplitStayCard.tsx` — Split stay suggestions
- `src/components/search/ListingCardErrorBoundary.tsx` — Per-card error boundary
- `src/components/search/SearchResultsErrorBoundary.tsx` — Results error boundary
- `src/components/search/V1PathResetSetter.tsx` — V2 context reset
- `src/components/search/V2MapDataSetter.tsx` — V2 map data bridge
- `src/components/listings/ListingCard.tsx` — Card with Embla carousel, ratings, slots
- `src/components/listings/ImageCarousel.tsx` — Embla-based with keyboard nav
- `src/components/listings/ListScrollBridge.tsx` — Card↔map scroll sync
- `src/components/listings/SlotBadge.tsx` — Availability indicator
- `src/components/listings/NearMatchSeparator.tsx` — Near-match divider
- `src/components/listings/ListingCardSkeleton.tsx` — Loading skeleton
- `src/components/filters/AppliedFilterChips.tsx` — Removable filter chips
- `src/components/filters/FilterChipWithImpact.tsx` — Count impact on hover
- `src/components/filters/FilterChip.tsx` — Base chip component
- `src/components/filters/filter-chip-utils.ts` — Shared filter utilities
- `src/components/Map.tsx` — Mapbox GL with markers, popups, clusters
- `src/components/map/*` — POILayer, BoundaryLayer, MapGestureHint, MapMovedBanner, etc.
- `src/contexts/ListingFocusContext.tsx` — Bidirectional card↔map hover/active sync
- `src/contexts/SearchMapUIContext.tsx` — Card-to-map focus coordination
- `src/contexts/FilterStateContext.tsx` — Pending filter state sharing
- `src/contexts/SearchTransitionContext.tsx` — URL navigation transitions
- `src/contexts/SearchV2DataContext.tsx` — V2 search data bridge
- `src/contexts/MobileSearchContext.tsx` — Mobile search overlay state
- `src/contexts/MapBoundsContext.tsx` — Map bounds + "search this area"
- `src/contexts/ActivePanBoundsContext.tsx` — Active pan bounds
- `src/contexts/ScrollContainerContext.tsx` — Scroll container ref
- `src/contexts/NavbarVisibilityContext.tsx` — Navbar visibility
- `src/lib/search-params.ts` — URL param parsing/building
- `src/lib/search-types.ts` — Filter type definitions
- `src/lib/search-utils.ts` — Search utilities
- `src/lib/search-layout.ts` — Layout utilities
- `src/lib/mobile-layout.ts` — Mobile snap point constants
- Various hooks: useMapPreference, useScrollHeader, useKeyboardShortcuts, useBodyScrollLock, useMediaQuery, useRecentSearches, useFacets, etc.

**Data Features:**
- SSR search with V2 orchestrator + V1 fallback (page.tsx:141-446)
- Cursor-based keyset pagination (SearchResultsClient.tsx:195-267)
- 60-item cap with dedup (SearchResultsClient.tsx:97-99, MAX_ACCUMULATED=60)
- Near-match expansion (page.tsx:328-330, SearchResultsClient.tsx:136-139)
- Split stay computation (SearchResultsClient.tsx:172-175)
- Faceted counts per filter option (FilterModal.tsx:387-409)
- Price histogram from API (PriceRangeFilter.tsx)
- Saved listings hydration from /api/favorites (SearchResultsClient.tsx:273-329)
- Filter suggestions on zero results (SearchResultsClient.tsx:331-356)

**Business Logic:**
- Rate limiting: SSR bucket (120/min), server action bucket (60/min) (page.tsx:194-216)
- Circuit breaker for V2 (page.tsx:255-272)
- Timeout protection on all search paths (page.tsx:305-307)
- Unbounded search guard (page.tsx:155-185)
- Canonical URL normalization for React key (page.tsx:356-371)
- Price quantization for bounds (page.tsx:363-369)

**Accessibility:**
- Skip link to results (layout.tsx:46)
- ARIA labels on all interactive elements
- Screen reader announcements for result counts (SearchResultsClient.tsx:361-377)
- Keyboard navigation: CMD+K search, M map toggle, arrow keys in menus
- Focus management in modals (FocusTrap)
- WAI-ARIA menu button pattern (SearchHeaderWrapper.tsx:529-604)
- `aria-setsize`/`aria-posinset` on feed items (SearchResultsClient.tsx:464-465)
- `role="feed"` on results grid (SearchResultsClient.tsx:439)
- Touch target minimum sizes (44px)
- `prefers-reduced-motion` respect (via Framer Motion)

**State Management:**
- URL is source of truth for filters (searchParams → page.tsx → components)
- ListingFocusContext: hoveredId, activeId, scrollRequest, focusSource (split contexts for perf)
- SearchMapUIContext: pendingMapFocus with nonce deduplication
- FilterStateContext: isDirty, changeCount, isDrawerOpen
- MobileSearchContext: isExpanded, openFilters
- MapBoundsContext: bounds, showBanner, areaCount
- SearchTransitionContext: URL navigation with transition
- SearchV2DataContext: V2 data bridge for map
- Client state: showTotalPrice (sessionStorage), extraListings, nextCursor, favorites

---

### STEP C: Gap & Overlap Analysis

| Aspect | Our Implementation | Reference | Assessment |
|---|---|---|---|
| **HEADER** | | | |
| Logo | "R" square icon + text link to / | "CuratedSpaces" serif text | Ours is functional, theirs is more polished typographically |
| Header scroll morph | Desktop: shows/hides full form. Mobile: always collapsed bar | Smooth grid-template-rows 0fr/1fr collapse with hysteresis | REFERENCE BETTER: smoother transition, categories collapse too |
| Desktop search form | Button opening MobileSearchOverlay | Split "Where"/"Vibe" pill with search icon | SIMILAR: Both use collapsible search pill |
| Mobile search | CollapsedMobileSearch pill → MobileSearchOverlay | Collapsed pill → CMD+K modal (same for mobile/desktop) | OURS BETTER: Dedicated mobile overlay with LocationSearchInput |
| Auth/profile | Full dropdown with avatar, messages, notifications | Simple "Sign In" text button | OURS BETTER: Complete auth system |
| **SEARCH** | | | |
| Search modal | Full-screen overlay with location autocomplete, budget, filters access, recent searches | CMD+K modal with search input, location suggestions, AI query builder | REFERENCE HAS: AI query builder (interesting but gimmicky) |
| Location input | LocationSearchInput with real geocoding + bounds | Simple text input with hardcoded location list | OURS BETTER: Real geocoding |
| Recent searches | Stored + displayed in overlay | Hardcoded "Arts District", "West Village" buttons | OURS BETTER: Real persistence |
| **FILTERS** | | | |
| Category bar | 8 categories with icons, URL sync, toggle on/off | 8 categories, simple filter, no icons | OURS BETTER: Icons, proper URL sync |
| Filter drawer | Framer Motion slide, 12+ filter types, facet counts, zero-state | CSS slide, 4 filter types (price, room, amenities, house rules) | OURS BETTER: Far more comprehensive |
| Price range | Radix slider + real histogram | HTML range input + decorative bars | OURS BETTER: Real data, proper dual slider |
| Applied chips | Dedicated component with impact counts, clear all | Inline chips below heading | OURS BETTER: Impact preview on hover |
| Recommended filters | Contextual suggestions ("Try: Parking, Washer...") | MISSING | Unique to us |
| **LISTING CARDS** | | | |
| Image carousel | Embla-based with swipe, arrow nav, windowed dots, keyboard accessible | Manual index state, hover arrows, basic dots | OURS BETTER: Real swipe, accessibility |
| Card hover | ring-1/ring-2 primary highlight, shadow-xl | -translate-y-1 lift, shadow enhancement | REFERENCE BETTER: Lift effect feels more premium |
| Card image hover | scale-105 (1000ms) | scale-105 (1000ms) + gradient overlay appears | REFERENCE BETTER: Gradient overlay adds depth |
| Favorite button | FavoriteButton with API persistence | Heart icon with local state toggle | OURS BETTER: Real persistence |
| Rating display | Star + number, top-right of content | Star + number, inline with title | SIMILAR |
| Price typography | `font-display italic text-2xl` + "/mo" | `font-newsreader italic text-[1.65rem]` + uppercase "MONTH" | REFERENCE BETTER: Serif italic price is more elegant |
| Tags/badges | SlotBadge (availability), Top Rated, New | "LIVED-IN", "PLANT HEAVY" custom tags, New badge | REFERENCE HAS: Lifestyle tags (we have functional badges) |
| Map pin button | "Show on map" MapPin icon on each card | MISSING | Unique to us |
| **MAP** | | | |
| Map library | Mapbox GL JS (persistent, billing-optimized) | Leaflet (CDN loaded) | OURS BETTER: Production-grade, persistent |
| Map markers | Price markers via Mapbox | Price markers via Leaflet divIcon with pointer arrow | REFERENCE BETTER: Marker design with arrow pointer is cleaner |
| Search as I move | Checkbox + banner with area count | Checkbox + "Search this area" button | OURS BETTER: Area count preview |
| Dropped pin | MISSING | Draggable pin to explore area | REFERENCE HAS: Nice exploration feature |
| Mobile map popup | MobileListingPreview (horizontal swipe strip) | PropertyCard in mini format (isMapPopup) | DIFFERENT: Both approaches valid |
| POI layer | POILayer component | MISSING | Unique to us |
| **RESULTS** | | | |
| Zero results | Dedicated empty state with smart suggestions | Dashed border, illustration, dual CTAs | REFERENCE BETTER: Visual presentation more polished |
| Pagination | Cursor-based "Show more places" with progress | Simple visibleCount increment | OURS BETTER: Real pagination |
| Near matches | NearMatchSeparator + expansion description | MISSING | Unique to us |
| Split stays | SplitStayCard for long durations | MISSING | Unique to us |
| Loading states | Shimmer skeletons (loading.tsx), per-card error boundaries | None visible | OURS BETTER: Comprehensive loading/error |
| **DETAIL VIEW** | | | |
| Property detail | Navigates to /listings/[id] (separate page) | Right-slide drawer with full details | REFERENCE HAS: In-page detail drawer (reduces navigation) |
| **SAVE SEARCH** | | | |
| Save search | SaveSearchButton (real API) | Center modal with name + email toggle | REFERENCE BETTER: More prominent, better UX flow |
| "Don't miss out" CTA | MISSING | Bottom banner with sparkle decoration | REFERENCE HAS: Nice engagement CTA |
| **ANIMATIONS** | | | |
| Card entrance | None (static render) | Staggered fade-in-up (50ms delay per card) | REFERENCE BETTER: Adds polish |
| Header transitions | Basic show/hide | Smooth grid collapse with hysteresis | REFERENCE BETTER: Much smoother |
| Modal/drawer animations | Framer Motion spring | CSS cubic-bezier transitions | SIMILAR quality |
| **VISUAL DESIGN** | | | |
| Color palette | Material Design tokens (--color-primary, etc.) | Warm cream/terracotta custom palette | REFERENCE BETTER: More distinctive, warmer feel |
| Typography | System-like sans-serif | Manrope + Newsreader serif pairing | REFERENCE BETTER: Dual font system is more refined |
| Spacing/rhythm | Consistent but compact | More generous whitespace | REFERENCE BETTER: More breathing room |
| Border radius | rounded-xl to rounded-2xl | Up to rounded-[2.5rem] | REFERENCE BETTER: Softer, more modern |
| Shadows | shadow-sm, shadow-ambient | Ghost shadows, glass panels | REFERENCE BETTER: More atmospheric |

---

## PHASE 1: ARCHITECTURAL CONTEXT DOCUMENT

### 1. WHAT WE HAVE THAT THEY DON'T (NON-NEGOTIABLE — must survive)

These features are production-critical and must NOT be touched:

1. **SSR + V2/V1 Search Engine** (page.tsx:141-446) — Server rendering, circuit breaker, rate limiting, timeout protection
2. **Real Authentication** (SearchHeaderWrapper.tsx:115-623) — NextAuth session, profile menu, notifications, messages
3. **Cursor-Based Pagination** (SearchResultsClient.tsx:195-267, actions.ts:25-123) — Dedup, 60-item cap, degraded state handling
4. **Near-Match Expansion** (page.tsx:328-330, SearchResultsClient.tsx:136-139) — Shows nearby listings when exact matches are sparse
5. **Split Stay Suggestions** (SearchResultsClient.tsx:172-175, SplitStayCard.tsx) — Long-duration stay splitting
6. **Faceted Filter Counts** (FilterModal.tsx:387-409, useFacets hook) — Real counts per amenity/rule/room type
7. **12+ Filter Types** (FilterModal.tsx) — Move-in date, lease duration, languages, gender preference, household gender, min spots
8. **LocationSearchInput Geocoding** (MobileSearchOverlay.tsx:106-117) — Real place autocomplete with bounds
9. **Persistent Mapbox Map** (layout.tsx, SearchLayoutView.tsx, PersistentMapWrapper) — Billing-optimized, never remounts
10. **Bidirectional Card↔Map Sync** (ListingFocusContext.tsx, SearchMapUIContext.tsx) — Hover/active/scroll sync with split contexts
11. **Mobile Bottom Sheet** (MobileBottomSheet.tsx) — Drag gestures, snap points, rubber-band, pull-to-refresh
12. **Comprehensive Accessibility** — Skip links, ARIA, focus traps, screen reader announcements, keyboard nav, role="feed"
13. **Error Handling** — Error boundaries (per-card, results, page), Sentry reporting, degraded state
14. **SEO Metadata** (page.tsx:64-139) — Dynamic title/description, noindex for filtered/paginated
15. **Saved Listings API** (SearchResultsClient.tsx:273-329) — Real favorites hydration
16. **Filter Impact Preview** (FilterChipWithImpact.tsx) — Shows count delta on chip hover
17. **Recommended Filters** (RecommendedFilters.tsx) — Contextual filter suggestions
18. **POI Layer** (Map.tsx, POILayer.tsx) — Points of interest on map

### 2. WHAT THEY HAVE THAT WE DON'T (CANDIDATES for adoption)

| Feature | Reference Location | Adoption Priority | Risk |
|---|---|---|---|
| Staggered card fade-in-up animation | CSS @keyframes + animation-delay | HIGH | LOW — CSS only, no structural change |
| Card hover lift (-translate-y-1) | PropertyCard className | HIGH | LOW — CSS only |
| Card image gradient overlay on hover | PropertyCard image container | HIGH | LOW — CSS only |
| Serif italic price typography | font-newsreader on price display | MEDIUM | LOW — Font addition + class change |
| Header scroll morph (grid collapse) | Header grid-template-rows transition | MEDIUM | MEDIUM — Requires header restructure |
| "Don't miss out" save search CTA | Bottom of results list | MEDIUM | LOW — New component, no structural change |
| More generous whitespace/padding | Global spacing patterns | MEDIUM | LOW — CSS adjustments |
| Larger border radii (2.5rem) | Global rounded-[2.5rem] | LOW | LOW — CSS only but affects design consistency |
| AI query builder in search | CMD+K modal textarea | LOW | HIGH — Would need real AI integration |
| Dropped pin on map | Map right panel | LOW | MEDIUM — Requires map feature addition |
| In-page detail drawer | Detail overlay on right | LOW | HIGH — Would bypass /listings/[id] routing |
| Ghost shadows / glass panels | CSS classes | MEDIUM | LOW — CSS additions |

### 3. WHAT WE BOTH HAVE BUT THEY DO BETTER (CANDIDATES for enhancement)

| Area | What They Do Better | Files Affected | Risk |
|---|---|---|---|
| Zero results state | More polished visual (dashed border, large icon, dual CTAs, breathing room) | SearchResultsClient.tsx:379-414 | LOW |
| Sort dropdown | Hover-reveal vs our Select component — feels lighter | SortSelect.tsx | LOW |
| Map price markers | Arrow pointer below pill, cleaner pill design | Map.tsx markers section | MEDIUM |
| Save search flow | Prominent modal with name field + toggle vs our button | SaveSearchButton.tsx | MEDIUM |
| Filter drawer price section | Visual histogram bars above slider, min/max input fields | PriceRangeFilter.tsx (we already have histogram) | LOW |
| Card dot indicators | Cleaner active state (width expansion) | ImageCarousel.tsx | LOW |

### 4. WHAT WE BOTH HAVE AND OURS IS FINE (DO NOT TOUCH)

- Image carousel (Embla > manual index state)
- Category bar (icons + URL sync > plain text)
- Filter drawer completeness (12 types > 4 types)
- Mobile search overlay (dedicated overlay > shared modal)
- Pagination (cursor-based > visibleCount)
- Authentication
- Map (Mapbox > Leaflet)
- Mobile bottom sheet
- Applied filter chips (impact preview)
- Error handling / loading states
- Accessibility implementation

### 5. DEPENDENCY RISKS

| Component | Tightly Coupled To | Risk If Changed |
|---|---|---|
| SearchHeaderWrapper | MobileSearchContext, useScrollHeader, CollapsedMobileSearch, SearchForm | Header restructure affects all these |
| SearchResultsClient | keyed by normalizedKeyString, fetchMoreListings action, seenIdsRef dedup | Key change = state reset |
| ListingCard | ListingFocusContext (hover/active), FavoriteButton, ImageCarousel, link to /listings/[id] | Style changes safe; structure changes affect focus sync |
| SearchViewToggle | MobileBottomSheet, FloatingMapButton, PersistentMapWrapper, useMapPreference | Layout changes here cascade to mobile+desktop |
| FilterModal | SearchForm state, Framer Motion, PriceRangeFilter, facetCounts, useDebouncedFilterCount | Pure presentational — style changes safe |
| MobileBottomSheet | SNAP_COLLAPSED/SNAP_EXPANDED constants, FloatingMapButton positioning, sheet z-index coordination | Touch gesture code is fragile — avoid restructuring |

### 6. TECH STACK COMPATIBILITY

| Reference Dependency | Our Stack | Compatible? | Bundle Impact |
|---|---|---|---|
| Leaflet 1.9.4 | Mapbox GL JS | NO — We use Mapbox, not adopting Leaflet | N/A |
| Google Fonts (Manrope + Newsreader) | System fonts + font-display | YES — Can add via next/font | ~20-40KB |
| CSS transitions/keyframes | Framer Motion | YES — Can use CSS for simple animations alongside FM | 0KB (CSS only) |
| Inline SVG icons | Lucide icons | NO conflict — We keep Lucide | N/A |
| No component library | shadcn/ui + Radix | NO conflict — We keep ours | N/A |

### 7. ANIMATION & INTERACTION INVENTORY (Reference)

Full catalog of every animation to evaluate:

1. **fade-in-up** (cards, suggestions) — `0.6s cubic-bezier(0.16,1,0.3,1)` — translateY(20px)→0, opacity 0→1. **Safe to adopt.** Pure CSS, no conflict with existing interactions.

2. **Staggered entrance** (card grid) — `animation-delay: ${index * 0.05}s` on fade-in-up. **Safe to adopt.** CSS only.

3. **Header grid collapse** — `grid-template-rows: 0fr/1fr` with 500ms transition. **Requires evaluation.** Our header uses different collapse mechanism (useScrollHeader + CSS classes).

4. **Card hover lift** — `-translate-y-1` on 300ms. **Safe to adopt.** Pure CSS class addition.

5. **Card image zoom** — `scale-105` on 1000ms ease-out. **Already have this** (ImageCarousel.tsx line 292 — `group-hover:scale-105`).

6. **Card image gradient overlay** — `from-black/40 via-transparent to-black/10` appearing on hover. **Safe to adopt.** CSS class addition.

7. **Map marker scale** — `scale-110` on hover/active. **Mapbox markers work differently** — need to evaluate Mapbox approach.

8. **Modal/drawer slides** — CSS transitions. **We already use Framer Motion** for these — keep Framer Motion.

9. **Loader ring spin** — CSS keyframes. **We already have loading states** — style comparison only.

10. **Dot indicator width transition** — Active dot `w-4`, inactive `w-1.5`. **We have similar** (ImageCarousel.tsx line 284-289) — already implemented.
