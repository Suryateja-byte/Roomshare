# Cross-Review: Mobile-Responsive Agent Feedback

**Reviewer:** mobile-responsive
**Plans reviewed:** 01-design-tokens, 02-component, 03-pages, 05-animation
**Focus areas:** Responsive class conflicts, missing mobile variants, page layout gaps, animation mobile constraints, touch targets, bottom nav alignment, dark mode references

---

## 1. Responsive Class Conflicts

### 01-design-tokens-plan.md

**NO CONFLICTS.** Token definitions are breakpoint-agnostic. The `@theme` block defines colors/fonts/shadows as CSS custom properties -- these work identically at all viewport sizes. The `--header-height` responsive media query at `sm:640px` (80px -> 120px) is correctly handled.

**One observation:** The plan changes `--transition-base` from `200ms ease` to `200ms ease` (same). The animation plan changes it to `300ms var(--ease-warm)`. These need to be reconciled -- the animation plan should be the authority on timing tokens.

### 02-component-plan.md

**MINOR CONFLICT -- input.tsx `rounded-full` -> `rounded-lg`:**
The component plan changes input from `rounded-full` to `rounded-lg`. My mobile plan (Section 6) specifies `rounded-lg` for mobile inputs. **Aligned -- no conflict.**

**POTENTIAL ISSUE -- card.tsx `rounded-3xl` -> `rounded-lg`:**
This is a global change. On desktop, some components that wrap cards may rely on the `rounded-3xl` overshoot for visual effect (e.g., profile page cards currently use `sm:rounded-[2.5rem]`). The pages plan needs to ensure all page-level card containers also update to `rounded-lg`.

**NO CONFLICTS** with responsive Tailwind classes. All component specs use standard tokens that work across breakpoints.

### 03-pages-plan.md

**GAP -- Missing `pb-20 md:pb-0` for bottom nav:**
The pages plan does NOT mention the mobile bottom nav bar or its padding requirement. Every page needs `pb-20 md:pb-0` (or `pb-safe-bottom`) to prevent content being obscured by the new bottom nav. This affects:
- Homepage (Section 2)
- Search page (Section 3) -- already has `pb-24 md:pb-6` which is fine
- Listing detail (Section 4)
- Auth pages (Section 5)
- All dashboard pages (Section 6)
- Content pages (Section 7)
- Utility pages (Section 8)
- Admin pages (Section 9)

**Severity: MEDIUM.** This is a global requirement that must be integrated.

**GAP -- No mobile-specific section layouts:**
The pages plan describes desktop layouts (grids, split views) but rarely specifies how they collapse on mobile. For example:
- Section 2.4 "AI Connection Section" specifies "60/40 split" but no mobile stack order
- Section 2.6 "Neighborhoods Mosaic" specifies CSS grid with variable spans but no mobile fallback
- Section 4.5 "Booking Sidebar" specifies sidebar but no mobile bottom-sheet or sticky CTA treatment

**Severity: LOW.** My mobile plan (Section 12) covers responsive behavior per component. But the pages plan should reference the mobile plan for mobile-specific layouts.

**GAP -- Homepage search bar hidden on mobile:**
Current code has `hidden md:block` on the hero search form. The pages plan (Section 2.1) redesigns the search bar but doesn't address this mobile visibility gap. My mobile plan covers this via the CollapsedMobileSearch and MobileSearchOverlay, but the pages plan should note the mobile treatment.

### 05-animation-plan.md

**NO CONFLICTS** with responsive classes. Animation specs are viewport-independent or properly gated with mobile conditions.

---

## 2. Missing Mobile Component Variants

### 02-component-plan.md

**MISSING: BottomNavBar component.**
My plan defines a new `BottomNavBar.tsx` component (Section 2). The component plan does not mention this component at all. It needs to be added to the component inventory with full editorial specs:
- Fixed bottom-0, md:hidden
- surface-container-lowest bg, ambient shadow upward
- 4-5 icons with primary active state
- h-16 + safe-area-inset-bottom padding
- z-sticky (1100)

**Severity: HIGH.** This is a P0 new component.

**MISSING: Full-screen nav overlay variant.**
My plan specifies replacing the slide-down mobile menu with a full-screen glassmorphism overlay. The component plan (NavbarClient section) mentions `bg-surface-canvas` for mobile menu but doesn't describe the full-screen overlay architecture (fixed inset-0, glassmorphism, stacked Newsreader links). The component plan should detail this mobile-specific variant.

**Severity: MEDIUM.** The current component plan's NavbarClient section says "Mobile menu: `bg-surface-canvas`" but this is a fundamentally different component from the current slide-down panel.

**COVERED: CollapsedMobileSearch, FloatingMapButton, MobileBottomSheet.**
The component plan doesn't have explicit entries for these mobile-only components, but they inherit editorial tokens from the shared components they use. My mobile plan covers their specific redesign in Sections 3, 4, and 11.

**COVERED: MobileCardLayout, MobileSearchOverlay.**
Not explicitly mentioned in component plan, but they're thin wrappers -- the styling comes from ListingCard and SearchForm which are covered.

**MISSING: SortSelect mobile bottom sheet variant.**
The component plan mentions `bg-surface-container-lowest rounded-t-[1rem]` for the mobile sheet but doesn't specify the full mobile bottom sheet treatment (drag handle, snap behavior, glassmorphism). This is a simpler sheet than MobileBottomSheet but should reference the editorial sheet styling pattern.

**Severity: LOW.**

---

## 3. Page Layout Gaps

### 03-pages-plan.md

**GAP: No responsive breakpoint table per page.**
The pages plan describes editorial styling per page but doesn't include responsive behavior per breakpoint. My plan Section 12 covers this for major components, but the pages plan should include at minimum:
- Which grid layouts collapse at which breakpoint (e.g., 3-col -> 2-col at md, 1-col at base)
- Mobile-specific section ordering (e.g., booking sidebar moves below content on mobile)
- Mobile-specific hero treatment (search bar visibility, image aspect ratios)

**GAP: Messages page mobile/desktop split not detailed.**
Section 6.5 describes the messages page styling but doesn't mention the critical mobile behavior: thread list and chat window are mutually exclusive on mobile (`activeId ? "hidden md:flex" : "flex"` pattern). The editorial redesign should preserve this toggle behavior and specify mobile-specific chat header with back button.

**GAP: Admin pages responsive behavior.**
Section 9 specifies admin layouts with stat card grids and data tables but doesn't address mobile treatment. Data tables are problematic on mobile -- the plan should specify card-based layout on mobile as mentioned in Section 9.2 ("Card-based layout (not table) for mobile friendliness") but this should be elevated to a clear mobile-first approach rather than an afterthought.

**GAP: No mention of mobile map behavior on listing detail.**
Section 4.9 specifies the map section but doesn't address mobile behavior. On mobile, the map should be a static image with a "View on map" button that opens a full-screen map overlay, rather than an inline interactive map (cost + performance concern on mobile).

---

## 4. Animation Mobile Constraints

### 05-animation-plan.md

**PROPERLY HANDLED:**
- Parallax disabled on mobile (Section 6)
- `prefers-reduced-motion` global kill (existing, maintained)
- ScrollAnimation already uses 64 frames on mobile vs 96 desktop
- MotionConfig `reducedMotion="user"` wraps entire app

**ISSUE: Base duration increase to 300ms may feel sluggish on mobile.**
The animation plan changes `--duration-base` from 200ms to 300ms. On mobile, where users expect snappier feedback, 300ms may feel slow for interactive elements (button presses, tab switches, input focus). **Recommend:** Keep 300ms for reveals/transitions but use `--duration-fast` (150ms) for interactive feedback on mobile.

**ISSUE: Lenis smooth scroll + MobileBottomSheet conflict.**
The animation plan (Section 6) adds Lenis smooth scrolling. The plan mentions wrapping CustomScrollContainer but doesn't address the MobileBottomSheet conflict. The sheet has its own scroll handling (`overscrollBehavior: contain`, custom touch handlers). Lenis must NOT intercept sheet scroll events. The plan mentions `data-lenis-prevent` but doesn't specify exactly which elements get it.

**Required `data-lenis-prevent` targets:**
- MobileBottomSheet `contentRef` div
- MobileSearchOverlay scroll container
- LocationSearchInput dropdown
- SortSelect mobile sheet
- Any Radix Dialog/AlertDialog content

**ISSUE: GSAP dependency for hero text.**
Section 3 suggests GSAP SplitText for character-level stagger on the hero headline. Adding GSAP as a new dependency increases bundle size. The plan correctly offers a framer-motion alternative (manual span wrapping), but this should be the default approach rather than GSAP, especially given mobile performance constraints.

**ISSUE: "Breathing" background animation.**
Section 3 proposes a subtle infinite `background-color` shift on the hero canvas. This is technically a continuous repainting operation. On mobile with battery concerns, any infinite animation should be:
- CSS-only (no JS)
- Very low frequency (3s+ cycle)
- `will-change: none` (don't promote to GPU layer for a bg color change)
- Properly disabled by `prefers-reduced-motion`

The plan mentions disabling with reduced-motion but doesn't specify the CSS-only requirement.

---

## 5. Touch Target Compliance

### 02-component-plan.md

**COMPLIANT:** All interactive elements reviewed maintain 44px minimum:
- Button sizes: h-10 to h-12 (40-48px) -- h-10 buttons need `min-h-[44px]` override
- Input heights: h-12 (48px) -- compliant
- IconButton: `min-w-[44px] min-h-[44px]` -- compliant
- Checkbox: needs explicit `min-w-[44px] min-h-[44px]` via padding (visual is w-5 h-5)

**POTENTIAL ISSUE: Badge text-2xs (10px) readability.**
Component plan Section 2 (badge.tsx) adds `text-2xs` to base badge styling. The `text-2xs` class is 10px, which is below WCAG 12px minimum (already marked as DEPRECATED in globals.css). This should use `text-xs` (12px) minimum.

**Severity: MEDIUM.** Accessibility violation.

**POTENTIAL ISSUE: Filter chips touch target.**
Component plan's FilterChip specifies `rounded-full` pills but doesn't specify minimum height. My mobile plan Section 10 recommends `min-h-[36px]` for filter chips. The component plan should specify explicit minimum dimensions.

---

## 6. Bottom Nav Alignment

### Cross-plan consistency check:

**01-design-tokens:** No mention of bottom nav. **Expected** -- tokens don't need to know about layout components.

**02-component:** **MISSING.** No BottomNavBar component specified. This is the primary gap.

**03-pages:** **MISSING.** No `pb-20` bottom padding mentioned for mobile pages. No reference to bottom nav bar in any page layout.

**05-animation:** No mention of bottom nav animations. **Needed:** Bottom nav should have a subtle slide-up entrance on first page load (200ms, ease-warm), and potentially hide on scroll-down / show on scroll-up for search page (saves viewport space).

**My mobile plan (04):** Fully specified in Section 2 (design, icons, spacing, z-index, impact on other components).

**Alignment needed:** The component plan and pages plan need to reference the bottom nav bar. The animation plan should include bottom nav show/hide behavior.

---

## 7. Dark Mode References (FIXED in my own plan)

**04-mobile-plan.md:** Fixed 4 dark mode references:
- Line 61: Removed `Dark mode: bg-[#1b1c19]/80` -- replaced with "Single theme only"
- Line 69: Removed `dark: on-surface-variant inverted`
- Line 190: Removed `dark:bg-white` from current state description
- Line 604: Removed `dark:bg-zinc-900` from current state description
- Line 612: Removed `Dark: bg-[#1b1c19]/95` -- replaced with "(Single theme only)"

**Other plans dark mode references:**
- 01-design-tokens: Properly removes all dark mode. Clean.
- 02-component: References dark mode only as "Current state" descriptions (correct for audit). All "New" specs omit dark. Clean.
- 03-pages: References dark mode only in "Current state" sections. All "Editorial redesign" specs omit dark. Clean.
- 05-animation: Section 9 mentions "Dark: keep current dark mode shimmer" -- this should be removed since dark mode is being eliminated. **Flag for animation-polish.**

---

## Summary: Action Items by Teammate

### design-tokens-architect (01)
- [ ] Reconcile `--transition-base` timing with animation plan (200ms vs 300ms)
- No other issues

### component-redesigner (02)
- [ ] **P0:** Add BottomNavBar component spec to the plan
- [ ] **P1:** Add full-screen nav overlay spec (separate from current slide-down menu)
- [ ] **P1:** Fix badge.tsx `text-2xs` -- should be `text-xs` minimum (WCAG)
- [ ] **P1:** Add explicit min-height to FilterChip (min-h-[36px])
- [ ] **P2:** Add SortSelect mobile sheet editorial styling details

### pages-redesigner (03)
- [ ] **P0:** Add `pb-20 md:pb-0` requirement to all pages for bottom nav clearance
- [ ] **P1:** Add mobile layout collapse notes (which grids stack at which breakpoints)
- [ ] **P1:** Specify messages page mobile toggle behavior (thread list vs chat)
- [ ] **P2:** Address listing detail mobile map behavior
- [ ] **P2:** Note mobile-specific hero treatment (search bar visibility)
- [ ] **P2:** Elevate admin mobile card-based layout to explicit requirement

### animation-polish (05)
- [ ] **P1:** Remove dark mode shimmer reference (Section 9 "Dark: keep current dark mode shimmer")
- [ ] **P1:** Specify `data-lenis-prevent` targets explicitly
- [ ] **P1:** Use `--duration-fast` for interactive feedback on mobile, keep 300ms for reveals
- [ ] **P2:** Default to framer-motion spans for hero text (not GSAP) to avoid new dependency
- [ ] **P2:** Specify hero "breathing" animation as CSS-only, will-change:none
- [ ] **P2:** Add bottom nav show/hide animation spec
