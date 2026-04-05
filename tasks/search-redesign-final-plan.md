# Search Page UI/UX Redesign — Final Execution Plan

**Status:** UNANIMOUSLY APPROVED by all 4 agents (Layout, Animation, Guardian, Design)
**Date:** 2026-04-05
**Scope:** Phase 1 — 12 CSS/JSX changes. No structural refactors. No new dependencies.

---

## APPROVED CHANGES

### P1: Staggered Card Entrance Animation
- **Category:** Animation
- **What Changes:** Listing cards fade-in-up with 50ms stagger on mount (post-hydration only)
- **Files Affected:**
  - `src/app/globals.css` — Add keyframe + utility class
  - `src/components/search/SearchResultsClient.tsx:439` — Add `data-hydrated={isHydrated || undefined}` to `role="feed"` div
  - `src/components/search/SearchResultsClient.tsx:462-475` — Add `className="animate-card-entrance"` and `style={{ animationDelay: '${index * 50}ms' }}` to card wrapper div
- **Reference Source:** Reference `fade-in-up` keyframe + staggered `animation-delay` pattern
- **Why It's Better:** Transforms static card grid into progressive reveal. Highest-impact visual polish available.
- **Safety Verification:** `[data-hydrated="true"]` CSS selector ensures animation ONLY fires after React hydration. SSR cards render at full opacity. `animation-fill-mode: backwards` holds initial state only during delay period post-hydration. Zero CLS. Covered by existing `prefers-reduced-motion` blanket rule at `globals.css:392-401`.
- **Dependencies:** None
- **New Libraries:** None
- **Accessibility:** `prefers-reduced-motion: reduce` disables animation. `role="feed"`, `aria-setsize`, `aria-posinset` preserved.
- **Exact CSS:**
  ```css
  @keyframes card-entrance {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
  }
  [data-hydrated="true"] .animate-card-entrance {
    animation: card-entrance 0.6s var(--ease-editorial) backwards;
  }
  @media (prefers-reduced-motion: reduce) {
    [data-hydrated="true"] .animate-card-entrance {
      animation: none;
    }
  }
  ```

### P2: Card Hover Lift
- **Category:** Animation
- **What Changes:** Cards lift 4px on hover with existing 500ms transition. Guarded by `!isActive`.
- **Files Affected:** `src/components/listings/ListingCard.tsx:252-256`
- **Reference Source:** Reference `-translate-y-1` on card hover
- **Why It's Better:** Provides physical "lift" affordance — universal interaction design language.
- **Safety Verification:** `!isActive` guard prevents stacking with active state's `-translate-y-0.5`. Uses existing `transition-all duration-500`. No split transitions needed. `data-testid="listing-card"` preserved.
- **Dependencies:** None
- **Exact className change:**
  ```tsx
  className={cn(
    "group relative flex flex-col rounded-2xl bg-surface-container-lowest mb-4 shadow-sm transition-all duration-500 overflow-hidden",
    !isActive && "hover:shadow-xl hover:-translate-y-1",
    isActive && "ring-2 ring-primary ring-offset-2 -translate-y-0.5 shadow-xl",
    isHovered && !isActive && "ring-1 ring-primary/20",
    className
  )}
  ```

### P3: Gradient Overlay Softening
- **Category:** Visual
- **What Changes:** Card image gradient darkening reduced from 40% to 30% black base
- **Files Affected:** `src/components/listings/ListingCard.tsx:296`
- **Reference Source:** Reference uses lighter overlays for softer image presentation
- **Why It's Better:** Softer gradient lets listing images show through more naturally
- **Safety Verification:** Keeps `opacity-100`. Navigation dots have own shadow (`shadow-[0_0_3px_rgb(0_0_0/0.4)]`) for contrast. Badges at `z-20` unaffected. `pointer-events-none` preserved.
- **Dependencies:** None
- **Exact change:** `from-black/40` → `from-black/30`

### P4: Responsive Padding
- **Category:** Structure
- **What Changes:** Content area gets more horizontal padding on large viewports
- **Files Affected:** `src/app/search/page.tsx:382`
- **Reference Source:** Reference uses up to `px-12` on desktop
- **Why It's Better:** More editorial breathing room on wider screens
- **Safety Verification:** CSS-only class addition inside `max-w-[840px]` container. No structural impact.
- **Dependencies:** None
- **Exact change:** `px-4 sm:px-5` → `px-4 sm:px-5 lg:px-8`

### P5: Card Grid Spacing Increase
- **Category:** Visual
- **What Changes:** Vertical gap between card rows increased for more breathing room
- **Files Affected:** `src/components/search/SearchResultsClient.tsx:442`
- **Reference Source:** Reference uses `gap-8 sm:gap-12` (significantly more generous)
- **Why It's Better:** More whitespace between rows = more premium, curated feel
- **Safety Verification:** Conservative — only vertical gap increases (36px from 32px). Horizontal gap unchanged (24px). Works at all column counts. `col-span-full` elements (NearMatchSeparator, expansion text) unaffected.
- **Dependencies:** None
- **Exact change:** `gap-4 sm:gap-x-6 sm:gap-y-8` → `gap-5 sm:gap-x-6 sm:gap-y-9`

### P6: Price Micro-Label Typography
- **Category:** Visual
- **What Changes:** Price suffix "/mo" becomes uppercase micro-label style
- **Files Affected:** `src/components/listings/ListingCard.tsx:357-359`
- **Reference Source:** Reference uses `text-[0.6rem] uppercase tracking-[0.2em] font-bold` micro-labels
- **Why It's Better:** Creates editorial typography contrast between serif price number and structured suffix
- **Safety Verification:** Class change on non-interactive `<span>`. `data-testid="listing-price"` is on parent span (line 350), not affected. Total price toggle text ("total" vs "/mo") gets same treatment — correct behavior.
- **Dependencies:** None
- **Exact change:** `text-sm text-on-surface-variant` → `text-xs uppercase tracking-wider font-semibold text-on-surface-variant`

### P7: Empty State Breathing Room
- **Category:** Visual
- **What Changes:** Zero-results container gets more vertical padding
- **Files Affected:** `src/components/search/SearchResultsClient.tsx:383`
- **Reference Source:** Reference has generous spacing in empty states
- **Why It's Better:** More padding = calmer, less panicked empty state
- **Safety Verification:** CSS-only padding change on `data-testid="empty-state"` container. Internal elements (ZeroResultsSuggestions, "Clear all filters" link) unaffected.
- **Dependencies:** None
- **Exact change:** `py-12 sm:py-20` → `py-16 sm:py-24`

### P8: "Don't Miss Out" Save Search CTA
- **Category:** UX Flow
- **What Changes:** New save-search engagement banner below results list
- **Files Affected:** `src/components/search/SearchResultsClient.tsx:575+` (new JSX block)
- **Reference Source:** Reference's "Don't miss out" bottom CTA with sparkle decoration
- **Why It's Better:** Drives save-search engagement at natural end-of-browse moment
- **Safety Verification:** Renders OUTSIDE `role="feed"` (feed closes at line 479). Positioned after contextual footer (line 575), before closing fragment. Gated by `allListings.length > 0 && !hasConfirmedZeroResults && isHydrated`. Uses existing SaveSearchButton API. Own `<section aria-label="Save search">`.
- **Dependencies:** Existing SaveSearchButton component
- **Render conditions:**
  - Show: results exist AND not zero-results AND hydrated AND not loading more
  - Don't show: zero results, during loading, before hydration

### P9: Ghost Shadow Design Token
- **Category:** Design System
- **What Changes:** Add `--shadow-ghost` CSS custom property to `@theme` block
- **Files Affected:** `src/app/globals.css` (add to `@theme` block)
- **Safety Verification:** Purely additive. No existing styles modified.
- **Dependencies:** None
- **Exact value:** `--shadow-ghost: 0 12px 40px -12px rgb(27 28 25 / 0.12)`

### P10: Micro-Label Utility Class
- **Category:** Design System
- **What Changes:** Add `.text-micro-label` reusable utility class
- **Files Affected:** `src/app/globals.css` (add utility class)
- **Safety Verification:** Purely additive. No existing classes modified.
- **Dependencies:** None
- **Exact CSS:**
  ```css
  .text-micro-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    font-weight: 600;
  }
  ```

### P11: Search Area Button Entrance Animation
- **Category:** Animation
- **What Changes:** MapMovedBanner animates in with translate-y + opacity when appearing
- **Files Affected:** `src/components/map/MapMovedBanner.tsx`
- **Reference Source:** Reference search-area button uses translate-y + scale + opacity entrance
- **Why It's Better:** Draws attention to "Search this area" CTA after map pan
- **Safety Verification:** `z-[50]` preserved. Button remains clickable. No handler changes. Use Framer Motion `AnimatePresence` + `m.div` for consistency with existing patterns (per Agent 2's ADAPT note).
- **Dependencies:** Framer Motion (already installed)

### P12: Category Pill Transition Verification
- **Category:** Verification
- **What Changes:** Confirm `CategoryBar.tsx` has transitions on active state (it does — `transition-all duration-200` at line 253)
- **Files Affected:** `src/components/search/CategoryBar.tsx:249-261` (verify only)
- **Safety Verification:** Already implemented. No change needed. This is a no-op verification.
- **Dependencies:** None

---

## PRESERVED FEATURES (Do Not Touch)

All 21 features verified safe by Agent 3 (Feature Guardian):

1. SSR Search Engine (V2/V1 + circuit breaker) — `page.tsx:141-446`
2. Rate Limiting (SSR: 120/min, action: 60/min) — `page.tsx:194-216`, `actions.ts:36-49`
3. Cursor-Based Pagination + Dedup (60-item cap) — `SearchResultsClient.tsx:33,65-69,97-99,195-267`
4. Near-Match Expansion — `page.tsx:327-330`, `SearchResultsClient.tsx:137-140,446-460`
5. Split Stay Suggestions — `SearchResultsClient.tsx:172-175,481-502`
6. Favorites Hydration — `SearchResultsClient.tsx:272-329`
7. 12+ Filter Types with Facet Counts — `FilterModal.tsx:1-649`
8. Category Bar URL Sync — `CategoryBar.tsx:1-283`
9. Mobile Bottom Sheet (snap, drag, rubber-band) — `MobileBottomSheet.tsx:1-541`
10. Mobile Search Overlay with Geocoding — `MobileSearchOverlay.tsx:1-387`
11. Bidirectional Card-Map Focus Sync — `ListingFocusContext.tsx:1-325`
12. Card-to-Map Focus (SearchMapUIContext) — `SearchMapUIContext.tsx:1-157`
13. Applied Filter Chips with Impact — `AppliedFilterChips.tsx:1-103`
14. Recommended Filters — `RecommendedFilters.tsx:1-112`
15. Total Price Toggle — `TotalPriceToggle.tsx:1-54`, `SearchResultsClient.tsx:76-95`
16. Price Range Filter (Radix + Histogram) — `PriceRangeFilter.tsx:1-108`
17. Search Header (Auth + Notifications + Messages) — `SearchHeaderWrapper.tsx:1-647`
18. Layout Provider Tree (8 providers) — `layout.tsx:41-77`
19. Persistent Mapbox Map — `SearchLayoutView.tsx`, `SearchViewToggle.tsx`, PersistentMapWrapper
20. Accessibility Infrastructure — Skip link, ARIA roles, screen reader, keyboard nav, focus traps
21. Error Handling — Error boundaries (card, results, page), Sentry, degraded state

---

## EXPLICITLY REJECTED CHANGES

| Change | Source | Reason |
|---|---|---|
| In-page detail drawer | Reference | Bypasses `/listings/[id]` routing, breaks SEO, deep linking, back button |
| AI query builder | Reference | Gimmick (hardcoded in reference), requires real AI integration |
| Lifestyle tags ("LIVED-IN") | Reference | Requires data we don't have, maintenance burden |
| Dropped pin on map | Reference | Medium risk Mapbox changes, POI layer serves similar purpose |
| Border radius increase (rounded-3xl) | Agent 4 (V4) | Badge clipping at `top-4 left-4`, cascading position changes |
| Gradient to 60% opacity | Agent 2 (A3 original) | Dot readability concern on bright images |
| Shared CMD+K modal for mobile+desktop | Reference | Loses dedicated mobile UX with LocationSearchInput |
| Absolute positioned panel sliding | Reference | Conflicts with MobileBottomSheet architecture |
| Flat state (no providers) | Reference | Breaks map persistence, card-map sync, filter state |
| Remove loading skeleton | Reference (has none) | Degrades perceived performance on slow connections |

---

## EXECUTION ROADMAP

### Phase 1A: CSS Infrastructure (No component changes — can be done first)
- P9: Add `--shadow-ghost` to `globals.css @theme`
- P10: Add `.text-micro-label` to `globals.css`
- P1 (CSS only): Add `@keyframes card-entrance` + `[data-hydrated]` selector to `globals.css`

**Complexity:** SMALL. Estimated: 3 additions to globals.css.

### Phase 1B: Card Visual Polish (ListingCard.tsx changes)
- P2: Add hover lift (`!isActive && "hover:-translate-y-1"`)
- P3: Change gradient from `from-black/40` to `from-black/30`
- P6: Change "/mo" suffix classes to micro-label style

**Complexity:** SMALL. Estimated: 3 class changes in one file.

### Phase 1C: Search Results Layout (SearchResultsClient.tsx + page.tsx changes)
- P1 (JSX): Add `data-hydrated` to feed div + animation class/delay to card wrappers
- P5: Increase grid gap to `gap-5 sm:gap-x-6 sm:gap-y-9`
- P7: Increase empty state padding to `py-16 sm:py-24`
- P4: Increase page.tsx padding to `px-4 sm:px-5 lg:px-8`

**Complexity:** SMALL-MEDIUM. Estimated: 4 changes across 2 files.

### Phase 1D: New Component + Map Enhancement
- P8: Add "Don't Miss Out" save search CTA after results
- P11: Add entrance animation to MapMovedBanner

**Complexity:** MEDIUM. P8 requires new JSX block. P11 requires Framer Motion wrapping.

### Phase 1E: Verification
- P12: Verify CategoryBar transitions (expected no-op)
- Run lint + typecheck
- Run test suites for affected components
- Visual QA: verify card entrance animation, hover lift, gradient, spacing, typography

---

## DESIGN TOKENS & CONFIGS NEEDED

Added to `globals.css` (Phase 1A):
```css
/* @theme block addition */
--shadow-ghost: 0 12px 40px -12px rgb(27 28 25 / 0.12);

/* Utility class addition */
.text-micro-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  font-weight: 600;
}

/* Card entrance animation */
@keyframes card-entrance {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
}
[data-hydrated="true"] .animate-card-entrance {
  animation: card-entrance 0.6s var(--ease-editorial) backwards;
}
@media (prefers-reduced-motion: reduce) {
  [data-hydrated="true"] .animate-card-entrance {
    animation: none;
  }
}
```

No changes to `tailwind.config.ts`. No new fonts. No new dependencies.

---

## TEST UPDATES REQUIRED

| Test File | Expected Impact | Action |
|---|---|---|
| `SearchResultsClient.test.tsx` | P1 adds `data-hydrated` attribute, P5 changes gap, P7 changes padding, P8 adds new JSX | Verify `data-testid="empty-state"` still works. Add test for CTA render conditions. |
| `ListingCard.test.tsx` | P2 adds hover class, P3 changes gradient value, P6 changes suffix classes | No behavioral change — tests query by `data-testid`, not CSS classes |
| `filter-chip-utils.test.ts` | No impact | None |
| `FloatingMapButton.test.tsx` | No impact | None |
| `MobileSearchOverlay.test.tsx` | No impact | None |
| `search-filters.e2e.test.ts` | P5 spacing change may affect visual regression screenshots | Update screenshot baselines |

---

## PHASE 2 BACKLOG (Future Work)

| Item | Approach | Prerequisites |
|---|---|---|
| D1: Header Grid Morph | `grid-template-rows: 0fr/1fr` with ResizeObserver throttling | Pre-calculate collapsed/expanded heights |
| D2: Adaptive Grid Columns | CSS container queries on list panel | Browser support verification (Chrome 107+, Safari 16.4+) |
| D3: Adaptive Container Max-Width | Remove `max-w-[840px]`, rely on container + padding | Depends on D2 |
| Map marker hover animation | Mapbox-specific marker styling | Investigate current marker implementation |
| Card hover lift magnitude tuning | Test `-translate-y-1.5` (6px) vs `-translate-y-1` (4px) | Browser visual QA of P2 |
