# Deliberate Plan: Fix All 27 Remaining Issues (Medium + Low)

**Task Type**: FIX | **Date**: 2026-03-17 | **Confidence**: 4.7/5.0 (HIGH)

## Summary

27 issues → 24 actual fixes + 3 ACCEPTED (no change needed)

### ACCEPTED (intentional, no change)
- **M12**: SearchForm `max-w-2xl` wrapper is intentional for hero layout
- **M15**: CTA/FeaturedListings `border-t` separator is adequate for minimal design
- **L8**: Footer placeholder buttons are semantically correct (`<button>` for actions) — just add `type="button"`

---

## Implementation Plan (24 fixes across 10 files)

### Group 1: ScrollAnimation.tsx (7 fixes)

| Issue | Change |
|-------|--------|
| M2 | Reduced motion fallback: add `py-24 md:py-32`, change `bg-zinc-950` to `bg-zinc-50 dark:bg-zinc-950` |
| M4 | Bottom gradient: `from-white` → `from-zinc-50` |
| M17 | `role="img"` → `role="region"` |
| M18 | Add ARIA progressbar attributes to loading container |
| M19 | `h-screen` → `h-screen-safe` |
| M20 | Add `useEffect` with reducedMotion media query change listener |
| L6 | Remove `<LazyMotion>` wrapper + remove unused imports |

### Group 2: NavbarClient.tsx (3 fixes)

| Issue | Change |
|-------|--------|
| M10 | `cubic-bezier(0.16, 1, 0.3, 1)` → `ease-[cubic-bezier(0.16,1,0.3,1)]` |
| M16 | Add `inert` on `#main-content` when mobile menu open (extend scroll lock effect) |
| L8-nav | Already fixed type="button" on hamburger — n/a |

### Group 3: Navbar.tsx (1 fix)

| Issue | Change |
|-------|--------|
| M8 | Import `auth()`, fetch session, pass real user to NavbarClient |

### Group 4: FooterWrapper.tsx (1 fix)

| Issue | Change |
|-------|--------|
| M9 | Add `/forgot-password`, `/reset-password`, `/verify` to shouldHideFooter |

### Group 5: Footer.tsx (1 fix)

| Issue | Change |
|-------|--------|
| L8 | Add `type="button"` to all 10 placeholder buttons |

### Group 6: layout.tsx (2 fixes)

| Issue | Change |
|-------|--------|
| L7 | Remove duplicate `<SkipLink href="#search-results">` (already in search/layout.tsx) |
| L9 | `themeColor: "#ffffff"` → array format with light/dark variants |

### Group 7: HomeClient.tsx (6 fixes)

| Issue | Change |
|-------|--------|
| M1 | `text-[10px]` → `text-xs` on hero badge (line 55) |
| M5 | Grid: add `sm:grid-cols-2 lg:grid-cols-3`, change `gap-12` → `gap-8 sm:gap-12` |
| M7 | Remove hardcoded overlay text (lines 103-106) |
| M11 | `overflow-hidden` → `overflow-x-hidden` on hero section |
| L5 | Move `px-6` from section to inner `max-w-3xl` container |
| L10 | `lg:aspect-[4/4]` → `lg:aspect-square` |

### Group 8: FeaturedListingsClient.tsx (2 fixes)

| Issue | Change |
|-------|--------|
| M1 | `text-[10px]` → `text-xs` on "New Arrivals" badge |
| L2 | `staggerChildren: 0.1` → `0.05` to match HomeClient |

### Group 9: FavoriteButton.tsx (1 fix)

| Issue | Change |
|-------|--------|
| M13 | Add `dark:bg-zinc-800/90 dark:hover:bg-zinc-700 dark:focus-visible:ring-zinc-400/40 dark:focus-visible:ring-offset-zinc-950` |

### Group 10: ImageCarousel.tsx (1 fix)

| Issue | Change |
|-------|--------|
| M14 | Remove `aspect-[16/9]` from Embla viewport div (parent controls aspect) |

---

## Execution Sequence

1. ScrollAnimation.tsx (M2, M4, M17, M18, M19, M20, L6)
2. NavbarClient.tsx (M10, M16)
3. Navbar.tsx (M8)
4. FooterWrapper.tsx (M9)
5. Footer.tsx (L8)
6. layout.tsx (L7, L9)
7. HomeClient.tsx (M1, M5, M7, M11, L5, L10)
8. FeaturedListingsClient.tsx (M1, L2)
9. FavoriteButton.tsx (M13)
10. ImageCarousel.tsx (M14)
11. Verify: typecheck + lint + test
