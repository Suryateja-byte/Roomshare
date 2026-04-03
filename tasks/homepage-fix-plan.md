# Homepage Fix Plan — FINAL (v3, unanimously approved 2026-04-01)

## Summary
- **Total issues audited**: 27 (from original audit)
- **Confirmed real issues requiring fixes**: 18
- **Already fixed / non-issues**: 9
- **Critical**: 2, **Major**: 8, **Minor**: 5, **Nitpick**: 3
- **Files touched**: 8
  - `src/app/HomeClient.tsx`
  - `src/components/FeaturedListingsClient.tsx`
  - `src/components/Footer.tsx`
  - `src/components/listings/SlotBadge.tsx`
  - `src/components/listings/ListingCard.tsx`
  - `src/components/listings/ImageCarousel.tsx`
  - `src/components/SearchForm.tsx`
  - `src/components/ui/badge.tsx` (if Badge needs gap support)
- **Estimated scope**: Medium — targeted CSS/className changes + 1 component enhancement (SlotBadge icons) + 1 deferred feature (mobile AI search)

---

## Issues Disposition (all 27 original audit items)

### Confirmed Non-Issues (no action needed) — 9 items
| # | Original Description | Evidence |
|---|---|---|
| 4/10 | Eyebrow label tracking inconsistent | All eyebrows use identical `tracking-[0.15em]` — verified in `HomeClient.tsx:87,176`, `FeaturedListingsClient.tsx:110` |
| 14 | Heart icon tap target too small (desktop) | `FavoriteButton.tsx:85` has `min-w-[44px] min-h-[44px]` — meets WCAG 2.5.8 |
| 15 | CTA buttons missing hover/focus states | `button.tsx:12-14,46` — Button component provides `hover:bg-primary/90`, `focus-visible:ring-2 focus-visible:ring-offset-2`, `active:scale-[0.97]` |
| 16 | Search icon button no focus ring | Button base classes include `focus-visible:ring-2 focus-visible:ring-offset-2` |
| 22 | Bottom nav tap targets borderline | `BottomNavBar.tsx:113` — items have `min-w-[44px] min-h-[44px]`, container `h-16`, at 320px each item gets ~64px |
| 23 | Heart button too small on mobile | Same as #14 — `min-w-[44px] min-h-[44px]` already present |
| 25 | "See All Listings" missing on mobile | `FeaturedListingsClient.tsx:164-182` — mobile "Explore All Listings" button exists (`md:hidden`) |
| 27 | Missing alt text on listing images | `ListingCard.tsx:298` passes `alt={displayTitle}`, `ImageCarousel.tsx:205` renders `alt={\`${alt} - Image ${index+1}\`}` |

### Contrast Issues Downgraded (optional optical improvements only)
| # | Original Description | Contrast Ratio | Action |
|---|---|---|---|
| 8 | Subtitle contrast borderline | `#4a4941` on `#fbf9f4` = **7.1:1** (passes AA+AAA) | Optional: remove `font-light` |
| 9 | Card title vs location no hierarchy | Title: `font-semibold text-base text-on-surface` vs Location: `text-sm text-on-surface-variant font-light` | Hierarchy exists; optional enhancement |
| 11 | Feature card description WCAG failure | `#4a4941` on `#ffffff` = **7.7:1** (passes AA+AAA) | Optional: remove `font-light` |

---

## Execution Order (grouped by file, priority: Critical > Major > Minor > Nitpick)

### Group 1: `src/components/listings/SlotBadge.tsx` — Critical
Fix 1: Color-only badge indicators (WCAG 1.4.1)

### Group 2: `src/components/listings/ImageCarousel.tsx` — Minor
Fix 2: Carousel dots visibility

### Group 3: `src/components/listings/ListingCard.tsx` — Major
Fix 3: Descriptive image alt text
Fix 4: Mobile card image density

### Group 4: `src/app/HomeClient.tsx` — Multiple priorities
Fix 5: Hero heading text-balance (Minor)
Fix 6: Hero heading line break (Major)
Fix 7: Hero image height + blur placeholder (Major)
Fix 8: Hero min-height reduction (Major)
Fix 9: Feature card equal height + mobile padding (Minor)
Fix 10: Feature card grid mobile gap (Minor)
Fix 11: CTA section bottom nav clearance (Major)
Fix 12: Subtitle optical weight (Optional)
Fix 13: Feature card description optical weight (Optional)

### Group 5: `src/components/FeaturedListingsClient.tsx` — Mixed
Fix 14: Listing card motion wrapper height propagation (Major)
Fix 15: "See All Listings" alignment (Nitpick)
Fix 16: Mobile listings grid gap (Minor)
Fix 17: Mobile "See All" in section header (Major)

### Group 6: `src/components/Footer.tsx` — Minor/Nitpick
Fix 18: Footer bottom padding with safe-area (Major)
Fix 19: Footer nav list spacing (Nitpick)
Fix 20: Footer social links mobile gap (Nitpick)

### Group 7: `src/components/SearchForm.tsx` — Major
Fix 21: Normalize search bar divider colors (Major)

### Group 8: `src/components/SearchForm.tsx` — Critical (Deferred)
Fix 22: AI search mobile entry point (Deferred)

---

## Fix Details

### Fix 1: Color-Only Badge Indicators — Critical (WCAG 1.4.1)
- **File**: `src/components/listings/SlotBadge.tsx`
- **Line(s)**: 51-64 (overlay variant) and 67-71 (Badge variant)
- **Owner**: interaction-a11y-specialist + typography-color-specialist
- **Current code (overlay, lines 51-64)**:
```tsx
  if (overlay) {
    return (
      <span
        className={cn(
          "inline-flex items-center font-medium px-2.5 py-1 text-xs",
          overlayBase,
          overlayText[variant],
          className
        )}
        data-testid="slot-badge"
      >
        {label}
      </span>
    );
  }
```
- **Proposed code (overlay)**:
```tsx
  if (overlay) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 font-medium px-2.5 py-1 text-xs",
          overlayBase,
          overlayText[variant],
          className
        )}
        data-testid="slot-badge"
      >
        {variant === "success" && (
          <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
        )}
        {variant === "destructive" && (
          <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        )}
        {variant === "info" && (
          <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="4" /></svg>
        )}
        {label}
      </span>
    );
  }
```
- **Current code (Badge, lines 67-71)**:
```tsx
  return (
    <Badge variant={variant} className={className} data-testid="slot-badge">
      {label}
    </Badge>
  );
```
- **Proposed code (Badge)**:
```tsx
  return (
    <Badge variant={variant} className={cn("gap-1", className)} data-testid="slot-badge">
      {variant === "success" && (
        <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
      )}
      {variant === "destructive" && (
        <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      )}
      {variant === "info" && (
        <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="4" /></svg>
      )}
      {label}
    </Badge>
  );
```
- **Rationale**: WCAG 1.4.1 — information must not be conveyed solely by color. Icons: checkmark=success, X=destructive, dot=info. Use `currentColor` to inherit text color.
- **Cross-impacts**: None — self-contained component

---

### Fix 2: Carousel Dots Visibility — Minor
- **File**: `src/components/listings/ImageCarousel.tsx`
- **Line(s)**: 283-289
- **Owner**: typography-color-specialist
- **Current code**:
```tsx
                <span
                  className={`block rounded-full transition-[width,background-color] duration-200 h-2 ${
                    index === selectedIndex
                      ? "bg-surface-container-lowest w-6"
                      : "bg-white/60 w-2"
                  }`}
                />
```
- **Proposed code**:
```tsx
                <span
                  className={`block rounded-full transition-[width,background-color] duration-200 h-2 shadow-[0_0_3px_rgb(0_0_0/0.4)] ${
                    index === selectedIndex
                      ? "bg-surface-container-lowest w-6"
                      : "bg-white/80 w-2"
                  }`}
                />
```
- **Rationale**: Dark shadow ensures visibility on light images. Opacity bump from 60% to 80%.
- **Cross-impacts**: None

---

### Fix 3: Descriptive Image Alt Text — Major (WCAG 1.1.1)
- **File**: `src/components/listings/ListingCard.tsx`
- **Line(s)**: After line 238, and line 298
- **Owner**: interaction-a11y-specialist
- **Add after line 238**:
```tsx
  const imageAlt = `${displayTitle} in ${formatLocation(listing.location.city, listing.location.state)}`;
```
- **Change line 298** from `alt={displayTitle}` to `alt={imageAlt}`
- **Rationale**: Adds location context for screen readers. Kept concise since `<article>` already has comprehensive `aria-label`.

---

### Fix 4: Mobile Card Image Density — Major
- **File**: `src/components/listings/ListingCard.tsx`
- **Line(s)**: 293
- **Owner**: layout-specialist
- **Current code**:
```tsx
            <div className="relative aspect-[16/10] sm:aspect-[4/3] overflow-hidden bg-surface-canvas">
```
- **Proposed code**:
```tsx
            <div className="relative aspect-[16/9] sm:aspect-[4/3] overflow-hidden bg-surface-canvas">
```
- **Rationale**: `aspect-[16/9]` (1.78:1) vs `aspect-[16/10]` (1.6:1) saves ~21px per card image on mobile (~126px across 6 cards). Images still have enough height for evaluation.
- **Cross-impacts**: Affects listing cards everywhere (search results, saved listings). Verify that search page cards still look good.

---

### Fix 5: Hero Heading Text Balance — Minor
- **File**: `src/app/HomeClient.tsx`
- **Line(s)**: 95
- **Owner**: typography-color-specialist
- **Current**: `"font-display text-4xl sm:text-5xl md:text-6xl lg:text-[5.5rem] font-normal tracking-tight text-on-surface mb-6 leading-[1.05]"`
- **Proposed**: `"font-display text-4xl sm:text-5xl md:text-6xl lg:text-[5.5rem] font-normal tracking-tight text-on-surface mb-6 leading-[1.05] text-balance"`
- **Rationale**: Prevents orphaned words on narrow viewports.

---

### Fix 6: Hero Heading Line Break — Major
- **File**: `src/app/HomeClient.tsx`
- **Line(s)**: 98
- **Owner**: typography-color-specialist
- **Current**: `<br className="hidden md:block" />`
- **Proposed**: `<br className="hidden lg:block" />`
- **Rationale**: On md (768-1023px), forced break creates unbalanced lines. Push to lg+ for better tablet experience. Works synergistically with Fix 5's text-balance.

---

### Fix 7: Hero Image Height + Blur Placeholder — Major
- **File**: `src/app/HomeClient.tsx`
- **Line(s)**: 144 and 146-153
- **Owner**: layout-specialist + coordinator
- **Current (line 144)**:
```tsx
                  className="relative aspect-[21/9] rounded-2xl overflow-hidden bg-surface-container-high shadow-ambient-lg"
```
- **Proposed**:
```tsx
                  className="relative aspect-[21/7] rounded-2xl overflow-hidden bg-surface-container-high shadow-ambient-lg max-h-[300px]"
```
- **Current Image (lines 146-153)**:
```tsx
                  <Image
                    src="https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&q=80"
                    alt="Warm, lived-in shared living space"
                    fill
                    priority
                    sizes="(max-width: 1152px) 100vw, 1152px"
                    className="object-cover"
                  />
```
- **Proposed Image**:
```tsx
                  <Image
                    src="https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?ixlib=rb-4.0.3&auto=format&fit=crop&w=2340&q=80"
                    alt="Warm, lived-in shared living space"
                    fill
                    priority
                    sizes="(max-width: 1152px) 100vw, 1152px"
                    className="object-cover"
                    placeholder="blur"
                    blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjM0MCIgaGVpZ2h0PSI5MzYiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iI2VhZThlMyIvPjwvc3ZnPg=="
                  />
```
- **Rationale**: `max-h-[300px]` caps image height. Blur placeholder prevents blank flash during load.

---

### Fix 8: Hero Min-Height Reduction — Major
- **File**: `src/app/HomeClient.tsx`
- **Line(s)**: 74
- **Owner**: layout-specialist
- **Current**:
```tsx
        <section aria-label="Search for rooms" className="relative pt-24 pb-12 md:pt-32 md:pb-16 min-h-[60dvh] md:min-h-[80dvh] flex flex-col justify-center overflow-x-hidden">
```
- **Proposed**:
```tsx
        <section aria-label="Search for rooms" className="relative pt-24 pb-12 md:pt-32 md:pb-16 min-h-[60dvh] md:min-h-[70dvh] flex flex-col justify-center overflow-x-hidden">
```
- **Rationale**: Saves ~10vh on desktop, pushing "Why RoomShare" closer to fold. Combined with Fix 7, significantly improves content discoverability.

---

### Fix 9: Feature Card Equal Height + Mobile Padding — Minor
- **File**: `src/app/HomeClient.tsx`
- **Line(s)**: 289
- **Owner**: layout-specialist
- **Current**:
```tsx
      className="flex flex-col items-center text-center group bg-surface-container-lowest rounded-xl p-8 shadow-ambient-sm"
```
- **Proposed**:
```tsx
      className="flex flex-col items-center text-center group bg-surface-container-lowest rounded-xl p-6 sm:p-8 shadow-ambient-sm h-full"
```
- **Rationale**: `h-full` equalizes card heights in grid. `p-6 sm:p-8` reduces mobile padding (32px to 24px) while preserving desktop generosity.

---

### Fix 10: Feature Card Grid Mobile Gap — Minor
- **File**: `src/app/HomeClient.tsx`
- **Line(s)**: 200
- **Owner**: layout-specialist
- **Current**:
```tsx
              className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 lg:gap-10 max-w-5xl mx-auto"
```
- **Proposed**:
```tsx
              className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8 lg:gap-10 max-w-5xl mx-auto"
```
- **Rationale**: `gap-4` on mobile vs `gap-6` saves 8px per gap. Combined with Fix 9's padding reduction, saves ~56px total on mobile.

---

### Fix 11: CTA Section Bottom Nav Clearance — Major
- **File**: `src/app/HomeClient.tsx`
- **Line(s)**: 225
- **Owner**: layout-specialist
- **Current**:
```tsx
        <section aria-label="Get started" className="py-16 md:py-20 bg-surface-canvas text-center">
```
- **Proposed**:
```tsx
        <section aria-label="Get started" className="py-16 md:py-20 pb-24 md:pb-20 bg-surface-canvas text-center">
```
- **Rationale**: Bottom nav is 64px fixed. `pb-24` (96px) on mobile provides clearance. `md:pb-20` restores desktop padding.

---

### Fix 12: Subtitle Optical Weight — Optional
- **File**: `src/app/HomeClient.tsx`, **Line**: 105
- **Owner**: typography-color-specialist
- **Current**: `"text-lg md:text-xl text-on-surface-variant mb-10 max-w-2xl mx-auto font-light leading-relaxed"`
- **Proposed**: `"text-lg md:text-xl text-on-surface-variant mb-10 max-w-2xl mx-auto leading-relaxed"`
- **Rationale**: Remove `font-light` for improved optical readability at body size.

---

### Fix 13: Feature Card Description Optical Weight — Optional
- **File**: `src/app/HomeClient.tsx`, **Line**: 297
- **Owner**: typography-color-specialist
- **Current**: `"text-on-surface-variant font-light leading-relaxed"`
- **Proposed**: `"text-on-surface-variant leading-relaxed"`
- **Rationale**: Same as Fix 12. Default weight (400) renders more crisply.

---

### Fix 14: Listing Card Motion Wrapper Height — Major
- **File**: `src/components/FeaturedListingsClient.tsx`
- **Line(s)**: 154
- **Owner**: layout-specialist
- **Current**:
```tsx
              <m.div key={listing.id} variants={fadeInUp}>
```
- **Proposed**:
```tsx
              <m.div key={listing.id} variants={fadeInUp} className="h-full">
```
- **Rationale**: Propagates grid cell height through the motion wrapper to the ListingCard (which already receives `className="h-full"`).

---

### Fix 15: "See All Listings" Alignment — Nitpick
- **File**: `src/components/FeaturedListingsClient.tsx`
- **Line(s)**: 105
- **Owner**: layout-specialist
- **Current**: `"flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16 md:mb-20"`
- **Proposed**: `"flex flex-col md:flex-row md:items-center justify-between gap-8 mb-16 md:mb-20"`
- **Rationale**: `md:items-center` vertically centers the button relative to the text block. Better visual alignment than `items-end`.

---

### Fix 16: Mobile Listings Grid Gap — Minor
- **File**: `src/components/FeaturedListingsClient.tsx`
- **Line(s)**: 151
- **Owner**: layout-specialist
- **Current**:
```tsx
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 sm:gap-10"
```
- **Proposed**:
```tsx
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-10"
```
- **Rationale**: `gap-6` on mobile (24px vs 32px) saves 48px across 6 card gaps. Combined with Fix 4's aspect ratio change, significantly reduces scroll depth.

---

### Fix 17: Mobile "See All" in Section Header — Major
- **File**: `src/components/FeaturedListingsClient.tsx`
- **Line(s)**: After line 127 (after closing `</div>` of `max-w-2xl`)
- **Owner**: layout-specialist
- **Add**:
```tsx
            <m.div variants={fadeInUp} className="md:hidden mt-4">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="group rounded-full border-outline-variant/20 text-on-surface-variant hover:text-on-surface gap-2"
              >
                <Link href="/search">
                  See All
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </m.div>
```
- **Rationale**: The existing mobile "Explore All Listings" button is at the very bottom after 6 cards. This adds an early discovery point in the section header. Both buttons coexist — header for quick access, bottom for after-browsing.

---

### Fix 18: Footer Bottom Padding with Safe-Area — Major
- **File**: `src/components/Footer.tsx`
- **Line(s)**: 7
- **Owner**: layout-specialist
- **Current**:
```tsx
    <footer className="bg-surface-container-high pt-12 md:pt-24 pb-24 sm:pb-16 md:pb-12 overflow-hidden">
```
- **Proposed**:
```tsx
    <footer className="bg-surface-container-high pt-12 md:pt-24 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] sm:pb-16 md:pb-12 overflow-hidden">
```
- **Rationale**: Dynamic safe-area calculation. On standard devices: 96px. On notched iPhones: 96px + ~34px.

---

### Fix 19: Footer Nav List Spacing — Nitpick
- **File**: `src/components/Footer.tsx`
- **Line(s)**: 34, 64, 91, 110 (all 4 nav `<ul>` elements)
- **Owner**: layout-specialist
- **Current**: `"flex flex-col gap-4 text-sm text-on-surface-variant font-light"`
- **Proposed**: `"flex flex-col gap-3 text-sm text-on-surface-variant font-light"`
- **Rationale**: `gap-3` (12px) creates tighter grouping. With `min-h-[44px]` items, visual gap is already generous.

---

### Fix 20: Footer Social Links Mobile Gap — Nitpick
- **File**: `src/components/Footer.tsx`
- **Line(s)**: 130
- **Owner**: layout-specialist
- **Current**: `"flex items-center gap-8 order-1 sm:order-2"`
- **Proposed**: `"flex items-center gap-6 sm:gap-8 order-1 sm:order-2"`
- **Rationale**: `gap-6` on mobile gives breathing room with uppercase tracking text.

---

### Fix 21: Search Bar Divider Color Normalization — Major
- **File**: `src/components/SearchForm.tsx`
- **Line(s)**: 955-958, 1085-1088, 1153-1156
- **Owner**: layout-specialist
- **Change all 3 dividers to use `bg-outline-variant/20`**:

Line 955-958 (WHAT-WHERE divider):
- **Current**: `"w-full h-px lg:w-px lg:h-8 bg-surface-container-high mx-0 lg:mx-1 my-1 lg:my-0 hidden lg:block"`
- **Proposed**: `"w-full h-px lg:w-px lg:h-8 bg-outline-variant/20 mx-0 lg:mx-1 my-1 lg:my-0 hidden lg:block"`

Line 1085-1088 (WHERE-BUDGET divider):
- **Current**: `"w-full h-px md:w-px md:h-8 bg-surface-container-high mx-0 md:mx-1 my-1 md:my-0"`
- **Proposed**: `"w-full h-px md:w-px md:h-8 bg-outline-variant/20 mx-0 md:mx-1 my-1 md:my-0"`

Line 1153-1156 (FILTER divider):
- **Current**: `"hidden md:block w-px h-8 bg-surface-container-high mx-1"`
- **Proposed**: `"hidden md:block w-px h-8 bg-outline-variant/20 mx-1"`

- **Rationale**: `bg-surface-container-high` (#eae8e3) is too prominent for dividers inside the search bar. `bg-outline-variant/20` (terracotta at 20%) provides consistent, subtle separation.

---

### Fix 22: AI Search Mobile Entry Point — Critical (DEFERRED)
- **File**: `src/components/SearchForm.tsx`
- **Line(s)**: After line 959
- **Owner**: interaction-a11y-specialist + layout-specialist
- **Proposed addition** (mobile-only AI trigger):
```tsx
{semanticSearchEnabled && !isCompact && (
  <div className="lg:hidden w-full px-4 py-2">
    <button
      type="button"
      onClick={() => {
        // Phase 2: expand inline or open full-screen AI search overlay
      }}
      className="flex items-center gap-2 w-full text-left text-sm text-on-surface-variant hover:text-on-surface transition-colors rounded-xl p-2 -mx-2 hover:bg-surface-container-high/50"
      aria-label="Search with AI"
    >
      <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
      <span className="font-medium truncate">Describe your ideal room...</span>
      <span className="text-[10px] font-bold text-on-primary bg-primary px-1.5 py-0.5 rounded tracking-wider ml-auto flex-shrink-0">AI</span>
    </button>
  </div>
)}
```
- **STATUS**: DEFERRED. Visual entry point only. Full mobile AI search implementation requires separate ticket (expanding field, full-screen overlay, state management).

---

## Issues NOT Addressed (with justification)
| # | Description | Reason |
|---|---|---|
| 3 | Listing cards row 2 inconsistent aspect ratios | Aspect ratio is CSS-uniform. Visual differences come from image content. |
| 6 | TrustBadge inconsistent style | Intentional design distinction — "Guest Favorite" uses amber tint to stand apart from availability badges. |
| 12 | Badge readability on light images | Badges use `bg-surface-container-lowest/90 backdrop-blur-sm` which provides adequate contrast on most images. |
| 17 | Mobile card density too low | Addressed partially by Fix 4 (16/9 aspect ratio). Full density change would require product review. |

---

## Conflict Resolution Log
| Conflict | Resolution | Rationale |
|---|---|---|
| Fix 15: `md:items-baseline` (coordinator v1) vs `md:items-center` (layout-specialist) | **Accepted `md:items-center`** | Items-center provides better visual balance when heading has variable subtitle length |
| Fix 7: `aspect-[2.5/1]` (coordinator v1) vs `aspect-[21/7] max-h-[300px]` (layout-specialist) | **Accepted layout-specialist** | `max-h-[300px]` provides a hard cap that works regardless of container width |
| Fix 8 (hero min-height): Not in v1 | **Added from layout-specialist** | Saves ~10vh, combined with Fix 7 significantly reduces below-fold push |
| Fix 4 (mobile card aspect): Not in v1 | **Added from layout-specialist** | Saves ~126px across 6 cards on mobile |
| Fix 17 (mobile See All in header): Not in v1 | **Added from layout-specialist** | Improves discoverability without removing the existing bottom button |
| Fix 18: `pb-28` (coordinator v1) vs `pb-[calc(...)]` (layout-specialist) | **Accepted layout-specialist** | Dynamic safe-area calculation is more robust across device shapes |
| Fix 21 (search dividers): Not in v1 | **Added from layout-specialist** | Targeted 3-line color change, low risk |

---

## Approval

- [x] layout-specialist: APPROVED
- [x] typography-color-specialist: APPROVED (with notes: confirm SlotBadge icon sizing, verify font-light removal on retina screens)
- [x] interaction-a11y-specialist: APPROVED (with notes: consider aria-label enhancement, verify Fix 22 tap target on 320px)
- [x] coordinator: APPROVED — all specialist approvals collected, plan finalized
