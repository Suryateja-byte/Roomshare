# Cross-Review: Pages Plan (03) vs All Other Plans

**Reviewer:** pages-redesigner
**Date:** 2026-03-24
**Status:** All plans read in full. Findings below.

---

## 1. Undefined Tokens

**Verdict: No undefined tokens.**

Every token referenced in the pages plan (03) is defined in the design tokens plan (01):
- `surface-canvas`, `surface-container-lowest`, `surface-container-high` -- defined in `@theme` block (01, Section 3)
- `primary`, `primary-container`, `tertiary` -- defined
- `on-surface`, `on-surface-variant`, `outline-variant`, `on-primary` -- defined
- `shadow-ambient`, `shadow-ambient-lg` -- defined as `--shadow-ambient` and `--shadow-ambient-lg` in `@theme`
- `font-display` (Newsreader), `font-body` (Manrope) -- defined in `@theme` and font loading (01, Section 5)
- `rounded-lg`, `rounded-full` -- defined in `@theme` radius tokens
- Semantic colors (`destructive`, `success`, `warning`) -- defined

**One minor naming discrepancy (non-blocking):**
- Pages plan references `shadow-ambient-sm` (0 4px 24px) and `shadow-ambient-md` (0 8px 40px). Design tokens plan defines `shadow-ambient-sm` (0 2px 20px) and `shadow-ambient` (0 8px 40px). The "md" suffix in the pages plan maps to the unsuffixed `shadow-ambient` in tokens. Implementation should use the token names as defined in 01.

---

## 2. Missing Components

**Verdict: Almost complete. Two items need attention.**

### Covered by component plan (02):
- Editorial Listing Card (ListingCard.tsx -- Section 3, `listings/ListingCard.tsx`)
- Glassmorphism Search Bar (SearchForm.tsx -- Section 3)
- Gradient CTA Button (button.tsx primary variant -- Section 2)
- Ghost Button (button.tsx outline variant -- Section 2)
- Warm Shimmer Skeleton (Skeleton.tsx -- Section 2b)
- Editorial Empty State (empty-state.tsx -- Section 2)
- Notification Item (NotificationCenter.tsx -- Section 3)
- Booking Status Badge (badge.tsx variants -- Section 2)
- FavoriteButton warm heart (Section 3)

### Not explicitly covered:
1. **BottomNavBar.tsx** -- Referenced by mobile plan (04, Section 2) as a NEW component. Not in component plan (02) inventory. This is a new file, not a redesign of an existing component. The mobile plan provides the full spec, but the component plan should acknowledge it exists.
   - **Impact:** Low. The mobile plan has the full spec. Component plan just needs awareness.

2. **Connection Score badge** -- Referenced by mobile plan (04, Section 4) as a new element on listing cards. Not in component plan (02). I already messaged component-redesigner about this.
   - **Impact:** Medium. Needs a component spec (size, position, font, color). Mobile plan provides visual spec but not a standalone component definition.

3. **Newsletter CTA section** -- Pages plan Section 2.8 specifies a newsletter signup section on homepage. This requires an email input + gradient button composition. The individual primitives (input, button) are covered, but no one owns the section-level component.
   - **Impact:** Low. It's a composition of existing primitives, not a new component.

---

## 3. Mobile Layout Conflicts

**Verdict: No conflicts. Two gaps to note.**

### Alignment confirmed:
- Homepage hero responsive behavior: clamp typography, hidden cinematic image on mobile -- both plans agree
- Search page split view: list + map with bottom sheet on mobile -- both plans agree
- Auth pages: split layout hidden on mobile (hidden lg:flex) -- both plans agree
- Messages: side-by-side desktop, navigate between views on mobile -- both plans agree
- Bottom nav padding (pb-20 md:pb-0): mobile plan specifies, pages plan doesn't explicitly state it per page but cross-cutting rule is clear

### Gaps:
1. **"Curated Corners" and "Recently Discovered" sections** -- Mobile plan (04, Section 5) introduces these as new homepage sections. Pages plan (03) does not reference them. The pages plan has Neighborhoods Mosaic (Section 2.6) and Featured Listings (Section 2.7) for desktop. These mobile-first sections are complementary additions, not replacements.
   - **Resolution:** Pages plan should be understood as desktop-canonical. Mobile plan adds mobile-specific sections that are `md:hidden` or collapse into the desktop layout. No conflict, but implementers should know both exist.

2. **Listing card mobile rounded corners** -- Pages plan specifies `rounded-xl` for listing card images. Mobile plan specifies `rounded-lg` (always, even on mobile). Component plan specifies `rounded-lg`. Two say `rounded-lg`, one says `rounded-xl`.
   - **Resolution:** Align on `rounded-lg` (component and mobile plans agree, this is the minimum per design rules). Pages plan should defer to component spec for this detail.

---

## 4. Animation Triggers

**Verdict: All scroll-triggered sections are covered.**

### Confirmed coverage in animation plan (05):
- Homepage hero stagger (Section 3) -- covered, enhanced with word-level stagger
- ScrollAnimation warm retheme (Section 6) -- covered, text overlays get Newsreader
- Features section whileInView (Section 6) -- covered, standardized to y:30 reveal
- CTA section whileInView (Section 6) -- covered
- Card hover lift (Section 4) -- covered, translateY(-4px), scale(1.02) image
- Warm shimmer skeleton (Section 9) -- covered with editorial-shimmer keyframe
- Page transitions (Section 5) -- covered with fade + translateY

### Pages plan items covered by animation plan:
- Neighborhoods Mosaic scroll reveal -- covered by generic "Section Reveals" (Section 6)
- Testimonial entrance -- covered by RevealOnScroll wrapper (Section 10)
- Ghost button hover opacity -- covered by form animations (Section 7, input focus patterns apply)
- Gradient CTA hover brightness -- covered by submit button hover (Section 7)

### One gap:
- **Newsletter CTA section entrance animation** -- Pages plan Section 2.8 doesn't specify animation, and animation plan doesn't mention newsletter section specifically. However, the generic RevealOnScroll wrapper (animation plan Section 10) applies to all sections, so it's implicitly covered.

---

## 5. Surface Color Consistency

**Verdict: Fully consistent.**

| Token | Pages Plan (03, Section 11) | Design Tokens (01, Section 3) | Match? |
|-------|---------------------------|-------------------------------|--------|
| surface-canvas | #fbf9f4 | #fbf9f4 | Yes |
| surface-container-lowest | #ffffff | #ffffff | Yes |
| surface-container-high | #eae8e3 | #eae8e3 | Yes |
| primary | #9a4027 | #9a4027 | Yes |
| primary-container | #b9583c | #b9583c | Yes |
| tertiary | #904917 | #904917 | Yes |
| on-surface | #1b1c19 | #1b1c19 | Yes |
| on-surface-variant | #4a4941 | #4a4941 | Yes |
| outline-variant | #dcc1b9 | #dcc1b9 | Yes |
| on-primary | #ffffff | #ffffff | Yes |

Surface usage is consistent across all plans:
- Body/page bg: `surface-canvas` (all plans agree)
- Cards/forms: `surface-container-lowest` (all plans agree)
- Footer/sidebars/alternating sections: `surface-container-high` (all plans agree)
- Skeleton shimmer: `surface-container-high` to `surface-canvas` (all plans agree)

---

## 6. Typography Conflicts

**Verdict: Minor discrepancy in body line-height. Otherwise consistent.**

### Font families: All plans agree
- Display/headings: Newsreader (serif) via `font-display`
- Body/titles/labels: Manrope (sans) via `font-body`

### Font sizes:
- Pages plan (03, Section 12) specifies `display-lg` as `clamp(3rem, 5vw, 5.5rem)`.
- Mobile plan (04, Section 7) specifies hero display as `text-3xl` (30px) mobile, `text-5xl` (48px) md, `text-6xl/7xl` (60-72px) lg+.
- These are equivalent: clamp(3rem, 5vw, 5.5rem) produces ~30px at 320px, ~48px at 768px, ~72px at 1280px. Consistent.

### Line heights:
- Pages plan (03, Section 12): body-md line-height 1.7
- Mobile plan (04, Section 7): body leading-relaxed (1.625)
- Animation plan (05): No line-height specs.
- **Minor discrepancy:** 1.7 vs 1.625 for body text. Tailwind's `leading-relaxed` is 1.625. The pages plan specifies 1.7 for content pages (About/Privacy/Terms) where readability is paramount.
  - **Resolution:** Use `leading-relaxed` (1.625) as default body line-height. Use `leading-7` (1.75rem, ~1.7) specifically on long-form content pages. No conflict -- pages plan already says "generous line-height" for content pages specifically.

### Label tracking:
- All plans specify `tracking-[0.05em]` for uppercase labels. Consistent.
- Footer section headings: pages plan says `0.2em`, component plan says `0.2em`. Consistent.

### Animation duration base:
- Design tokens plan (01): `--transition-base: 200ms ease`
- Animation plan (05): `--duration-base: 300ms`, `--ease-warm: cubic-bezier(0.25, 0.1, 0.25, 1.0)`
- **Discrepancy:** Design tokens has 200ms base, animation plan has 300ms base with custom easing.
  - This is the animation plan's domain. The design tokens plan defines transition tokens for CSS utility classes, while the animation plan defines animation-specific duration tokens. Both can coexist: `--transition-base` (200ms) for simple hover/focus transitions, `--duration-base` (300ms) for entrance/reveal animations.
  - **No action needed** -- different purposes, both valid.

---

## 7. Dark Mode References

**One issue found.**

Mobile plan (04) has a stray dark mode reference:
- Section 2 (Mobile Navigation): `"Dark mode: bg-[#1b1c19]/80 backdrop-blur-[20px]"` for the nav overlay.
- Section 11 (Bottom Sheet): `"Dark: bg-[#1b1c19]/95 backdrop-blur-[16px]"` and `"Glassmorphism: bg-white/95"`.
- These should be removed since all plans agree dark mode is being eliminated. The warm cream `bg-surface-canvas/80 backdrop-blur-[20px]` should be the only overlay treatment.
- **Impact:** Low -- these are plan comments, not code. But implementers should ignore the "Dark:" lines.

---

## 8. Lenis Smooth Scroll

Animation plan (05, Section 11) proposes adding Lenis (~3KB) for smooth scroll. This is a new dependency.

Pages plan doesn't reference Lenis but doesn't conflict with it. Key interaction:
- Lenis must be disabled on search pages (map interaction needs native scroll) -- animation plan already notes this.
- Lenis must coordinate with MobileBottomSheet drag -- animation plan notes `data-lenis-prevent` attribute.
- **No conflict. Just noting the dependency addition.**

---

## Summary

| Check | Status | Action Needed |
|-------|--------|---------------|
| Undefined tokens | PASS | Shadow naming: use `shadow-ambient` not `shadow-ambient-md` |
| Missing components | MINOR | BottomNavBar acknowledged in mobile plan; Connection Score badge needs component spec |
| Mobile layout conflicts | PASS | Listing card rounds: align on `rounded-lg` per component/mobile plans |
| Animation triggers | PASS | All sections covered by RevealOnScroll or explicit specs |
| Surface color consistency | PASS | 100% hex match across all plans |
| Typography conflicts | MINOR | Body line-height: use leading-relaxed default, leading-7 for content pages |
| Dark mode stray refs | MINOR | Mobile plan has 2 "Dark:" lines to ignore during implementation |
| New dependencies | NOTE | Lenis (~3KB) addition proposed by animation plan -- no conflict |
