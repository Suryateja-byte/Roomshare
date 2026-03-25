# Cross-Review: Component-Redesigner Feedback on Plans 01, 03, 04, 05

**Reviewer:** component-redesigner
**Date:** 2026-03-24

---

## 1. Token Usage Consistency

### PASS: All plans use the same token names
All four plans consistently reference:
- `surface-canvas` (#fbf9f4), `surface-container-lowest` (#ffffff), `surface-container-high` (#eae8e3)
- `primary` (#9a4027), `primary-container` (#b9583c), `tertiary` (#904917)
- `on-surface` (#1b1c19), `on-surface-variant` (#4a4941), `on-primary` (#ffffff)
- `outline-variant` (#dcc1b9)

### ISSUE 1: Font token naming mismatch
- **Plan 01 (tokens):** Uses `--font-display` (Newsreader) and `--font-body` (Manrope). Tailwind classes: `font-display`, `font-body`.
- **My plan (02):** Uses `font-display` (Newsreader) and `font-sans` (Manrope).
- **Plan 03 (pages):** References "Newsreader" and "Manrope" by name, no Tailwind class specified.
- **Plan 04 (mobile):** References "Newsreader serif" and "Manrope" by name.
- **Plan 05 (animation):** References "Newsreader" by name.

**Resolution needed:** The Tailwind class for Manrope body text needs to be consistent. Plan 01 defines `--font-body` which would generate `font-body` in Tailwind v4. My plan used `font-sans`. We should align on **`font-body`** since that's what the tokens architect defined. I will update my plan to use `font-body` instead of `font-sans`.

### ISSUE 2: Ghost border opacity inconsistency
- **My plan (02):** `outline-variant/20` (20% opacity) for decorative borders, `outline-variant/40` for inputs on focus.
- **Plan 01 (tokens):** Mentions `border-outline-variant/20` as the standard.
- **Plan 03 (pages):** Uses `border-on-surface/10` in several places (hero search, form inputs), which is a DIFFERENT token and opacity.
- **Plan 04 (mobile):** Uses `outline-variant/40` for mobile input borders, `outline-variant/30` for collapsed search.

**Resolution:** Pages plan uses `on-surface/10` while the rest use `outline-variant/20`. These produce very different visual results. `on-surface` (#1b1c19) at 10% is a cool grey-black; `outline-variant` (#dcc1b9) at 20% is a warm rose-beige. The editorial spec says "ghost borders = outline_variant at 20% opacity," so **plan 03 should use `outline-variant/20`** not `on-surface/10`.

### ISSUE 3: Shadow token naming
- **Plan 01 (tokens):** Defines `--shadow-ambient-sm`, `--shadow-ambient`, `--shadow-ambient-lg`, `--shadow-card-hover` in the @theme block.
- **My plan (02):** Uses `shadow-ambient` and `shadow-ambient-lg`.
- **Plan 05 (animation):** Defines `--shadow-ambient`, `--shadow-ambient-hover`, `--shadow-ambient-deep` in its own CSS block.

**Resolution:** Two different shadow scales are defined. Plan 01 has `shadow-ambient` / `shadow-ambient-lg` / `shadow-card-hover`. Plan 05 has `shadow-ambient` / `shadow-ambient-hover` / `shadow-ambient-deep`. The values are similar but not identical. **Tokens architect (Plan 01) should be the single source of truth.** Plan 05 should reference the token names from Plan 01, not define its own.

---

## 2. Component API Mismatches

### ISSUE 4: "Connection Score" badge — new component not in my plan
**Plan 04 (mobile)** introduces a "Connection Score" badge on listing cards:
> Position: absolute top-4 right-4, w-10 h-10 rounded-full, bg-primary, Newsreader font-bold text

This is a NEW UI element that doesn't exist in the codebase. My component plan doesn't include it because I inventoried only existing components. **If this is wanted, it needs to be added as a new Badge variant or a new component.** It would affect `ListingCard.tsx` layout.

**Question for team-lead:** Is the Connection Score badge approved? It requires backend data (compatibility score) that may not exist.

### ISSUE 5: "Curated Corners" and "Recently Discovered" sections — new components
**Plan 04 (mobile)** defines two new homepage sections with their own card components:
- Curated Corners: horizontal scroll carousel with neighborhood cards
- Recently Discovered: stacked vertical cards with overlap

These are entirely new components not in the codebase. My plan covers restyling existing components only. If these are approved, new component files would be needed.

### ISSUE 6: BottomNavBar — new component
**Plan 04 (mobile)** proposes a new `BottomNavBar.tsx` component. This doesn't exist in the codebase and isn't in my component plan. It's a valid mobile UX addition but requires a new file.

### PASS: No API changes on existing components
**Plan 03 (pages)** correctly notes that button variant names, card variants, and other component APIs remain unchanged. The redesign is class-level only, matching my plan.

---

## 3. Missing Component Variants for Mobile

### ISSUE 7: Input rounded-full vs rounded-lg conflict
- **My plan (02):** Changes input from `rounded-full` to `rounded-lg`.
- **Plan 04 (mobile):** Mobile search bar uses `rounded-full` for the collapsed search pill.
- **Plan 03 (pages):** Search bar container is `rounded-2xl`.

**Resolution:** The `Input` component itself should be `rounded-lg` (editorial rule: 1rem minimum). But the **SearchForm container** (which wraps multiple inputs) can be `rounded-full` or `rounded-2xl` as a compositional choice. These are different elements. No conflict — the Input primitive is rounded-lg, the search bar composition is rounded-full/2xl.

### ISSUE 8: Mobile bottom sheet handle styling
- **My plan (02):** `bg-on-surface-variant/30` (warm grey-green).
- **Plan 04 (mobile):** Not explicitly specified for the editorial redesign (uses current zinc-300 pattern).
- **Plan 05 (animation):** Specifies handle width animation `w-10 -> w-12` on grab.

**Minor gap:** Plan 04 should explicitly note the handle color change to `on-surface-variant/30`.

---

## 4. Animation Integration Gaps

### PASS: Animation plan covers all components I flagged
Plan 05 addresses all 9 animation areas I sent to animation-polish:
1. Button hover gradient shift -- covered in Section 7 (form animations)
2. Card hover lift + shadow -- covered in Section 4 (card interactions)
3. FavoriteButton heart color -- covered in Section 4
4. Dropdown glassmorphism -- covered in Section 8 (micro-interactions)
5. Dialog glassmorphism backdrop -- covered in Section 8
6. FeaturedListingsClient stagger -- covered in Section 6 (scroll animations)
7. NavbarClient dropdown -- covered in Section 6 (navbar glassmorphism on scroll)
8. ImageGallery hover -- covered implicitly by card interaction pattern
9. prefers-reduced-motion -- covered in Section 2 (existing `MotionConfig reducedMotion="user"`)

### ISSUE 9: Base transition duration change affects all components
**Plan 05 (animation):** Changes `--duration-base` from 200ms to 300ms.
**Plan 01 (tokens):** Keeps `--transition-base: 200ms ease`.

**Conflict:** Animation plan wants 300ms base, tokens plan keeps 200ms. This affects every `transition-all duration-200` class in the codebase (hundreds of occurrences). **Need alignment.** I recommend the tokens plan adopt the animation plan's 300ms for editorial warmth.

### ISSUE 10: Shimmer animation naming
- **My plan (02):** Uses existing `animate-shimmer` class with updated colors.
- **Plan 05 (animation):** Defines a new `animate-editorial-shimmer` class.

**Resolution:** Should be ONE shimmer class. Since we're replacing the old grey shimmer entirely, just update the existing `animate-shimmer` keyframe with warm colors. No need for a new class name.

---

## 5. Additional Observations

### OBSERVATION: ThemeToggle removal confirmed across all plans
All plans agree: ThemeToggle and ThemeProvider are removed. Plan 01 has the detailed file-by-file removal steps. No conflicts.

### OBSERVATION: Plan 04 has a dark mode reference
Plan 04 Section 2 mentions `bg-[#1b1c19]/80 backdrop-blur-[20px]` under "Dark mode:" for the mobile nav overlay. This contradicts the single-theme decision. It should be removed — the overlay should only use the warm glassmorphism treatment.

### OBSERVATION: Lenis dependency addition
Plan 05 Section 6 proposes adding Lenis smooth scroll library. This is a new dependency. Per project rules (CLAUDE.md): "Check package.json/pyproject.toml before using libraries." This should be flagged for team-lead approval.

---

## Summary of Issues Requiring Resolution

| # | Issue | Severity | Owner |
|---|-------|----------|-------|
| 1 | Font token: `font-sans` vs `font-body` | Medium | component-redesigner (me) — will update |
| 2 | Ghost border: `on-surface/10` vs `outline-variant/20` | High | pages-redesigner |
| 3 | Shadow tokens: duplicate definitions | Medium | animation-polish — defer to tokens plan |
| 4 | Connection Score badge: new component needed | Low | team-lead decision |
| 5 | Curated Corners / Recently Discovered: new components | Low | team-lead decision |
| 6 | BottomNavBar: new component needed | Low | team-lead decision |
| 9 | Base duration: 200ms vs 300ms | High | tokens-architect + animation-polish align |
| 10 | Shimmer class naming | Low | animation-polish — reuse existing name |
| -- | Dark mode reference in plan 04 | Low | mobile-responsive — remove |
| -- | Lenis dependency | Medium | team-lead approval needed |
