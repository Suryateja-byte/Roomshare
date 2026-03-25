# 00 — MASTER REDESIGN PLAN: The Editorial Living Room

**Status:** FINAL — Consensus achieved across 5-agent team
**Date:** 2026-03-24
**Scope:** Full frontend migration from dual dark/light theme to single warm editorial design system
**Source Plans:** 01 (tokens), 02 (components), 03 (pages), 04 (mobile), 05 (animation)
**Cross-Reviews:** 5 peer reviews completed, all conflicts resolved

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Team Lead Decisions (Resolved Conflicts)](#2-team-lead-decisions)
3. [Phase 0: Prerequisites](#3-phase-0-prerequisites)
4. [Phase 1: Design Tokens & Theme Infrastructure](#4-phase-1-design-tokens--theme-infrastructure)
5. [Phase 2: Theme System Removal](#5-phase-2-theme-system-removal)
6. [Phase 3: UI Primitives (src/components/ui/)](#6-phase-3-ui-primitives)
7. [Phase 4: Shared Components (src/components/)](#7-phase-4-shared-components)
8. [Phase 5: Page-Level Redesign](#8-phase-5-page-level-redesign)
9. [Phase 6: Mobile & Responsive](#9-phase-6-mobile--responsive)
10. [Phase 7: Animation & Polish](#10-phase-7-animation--polish)
11. [Phase 8: New Components](#11-phase-8-new-components)
12. [Phase 9: Cleanup & Verification](#12-phase-9-cleanup--verification)
13. [Verification Commands](#13-verification-commands)
14. [Rollback Strategy](#14-rollback-strategy)
15. [Appendix: Full File Change List](#15-appendix-full-file-change-list)

---

## 1. Executive Summary

### What Changes
- **REMOVE:** Entire dark/light theme system (next-themes, ThemeProvider, ThemeToggle, 2,300+ `dark:` classes across 181 files, `.dark` CSS blocks)
- **REMOVE:** All zinc-based color classes (2,162 occurrences across 185 files) and indigo accent classes (73 occurrences)
- **REPLACE:** With single warm "Editorial Living Room" design tokens in Tailwind v4 `@theme` block
- **ADD:** Newsreader (serif) + Manrope (sans-serif) fonts via `next/font/google`
- **ADD:** Lenis smooth scroll library (~3KB gzip)
- **ADD:** 3 new mobile components (BottomNavBar, ConnectionScoreBadge, full-screen nav overlay)
- **REDESIGN:** Every component, page, and layout to match editorial aesthetic

### Scale of Change
| Category | Count |
|----------|-------|
| `dark:` classes to remove | 2,300+ across 181 .tsx/.ts files |
| `dark:` CSS selectors to remove | 23 across 2 CSS files |
| `zinc-*` classes to replace | 2,162 across 185 files |
| `bg-white`/`text-black` to replace | 946 across 167 files |
| `border` classes to update | 641 across 147 files |
| `shadow-*` classes to update | 230 across 89 files |
| `indigo-*` classes to replace | 73 across 34 files |
| Component files to update | 87+ |
| Page routes to update | 32 |
| Files to DELETE | 2 (ThemeProvider.tsx, ThemeToggle.tsx) |
| Packages to REMOVE | 1 (next-themes) |
| Packages to ADD | 1 (lenis) |
| Fonts to swap | Inter → Newsreader + Manrope |
| New components to create | 3 (BottomNavBar, ConnectionScoreBadge, full-screen nav overlay) |

---

## 2. Team Lead Decisions (Resolved Conflicts)

All 5 cross-reviews surfaced these conflicts. Decisions are FINAL.

| # | Issue | Decision | Rationale |
|---|-------|----------|-----------|
| 1 | **Font naming:** `font-body` vs `font-sans` | Use `font-display` (Newsreader) + `font-body` (Manrope). Add `font-sans` as alias in `@theme`. | Semantic naming avoids Tailwind default collision. Alias preserves convenience. |
| 2 | **Ghost borders:** `on-surface/10` vs `outline-variant/20` | **`outline-variant/20`** everywhere. `on-surface/10` is NOT acceptable. | Spec says ghost borders = outline_variant at 20%. `on-surface/10` produces cool grey, not warm rose-beige. |
| 3 | **Shadow tokens:** pure black vs tinted charcoal | **Tinted charcoal** `rgb(27 28 25 / ...)` in ALL shadows. Dual-layer. | Spec requires tinted charcoal. Pure black (#000) breaks editorial warmth. |
| 4 | **Shadow naming:** hover tokens | `shadow-ambient-sm`, `shadow-ambient`, `shadow-ambient-lg` (tokens plan). Hover uses `shadow-ambient-lg`. No separate `-hover` token. | Single naming convention, tokens plan is source of truth. |
| 5 | **Duration base:** 200ms vs 300ms | **300ms** with `--ease-warm: cubic-bezier(0.25, 0.1, 0.25, 1.0)` | Animation plan owns timing. 300ms creates editorial warmth. Use `--duration-fast` (150ms) for mobile interactive feedback. |
| 6 | **Dark mode refs in mobile plan** | **Removed.** Single warm theme, no dark mode anywhere. | All 5 plans agree dark mode is eliminated. |
| 7 | **New mobile components** | **Approved:** BottomNavBar (P0), ConnectionScoreBadge (P1), CuratedCorners section (P2), RecentlyDiscovered section (P2). | Essential for mobile editorial UX per reference mockups. |
| 8 | **`text-2xs` in badges** | Replace with `text-xs` (12px). | `text-2xs` (10px) is below WCAG 12px minimum. Already deprecated in globals.css. |
| 9 | **Shimmer class naming** | Update existing `animate-shimmer` keyframe with warm colors. No new class name. | Simpler migration, one shimmer class. |
| 10 | **Shimmer duration** | **1.5s** infinite linear. | Slightly faster feels more alive than current 2s. |
| 11 | **Lenis dependency** | **Approved.** ~3KB gzip, smooth scroll is core to editorial feel. | Must add `data-lenis-prevent` on: MobileBottomSheet contentRef, MobileSearchOverlay, LocationSearchInput dropdown, SortSelect mobile sheet, all Radix Dialog/AlertDialog content. |
| 12 | **Card corners** | **`rounded-lg`** (1rem). Not `rounded-xl` or `rounded-3xl`. | 2 of 3 plans agree. Matches design rule: "rounded-lg (1rem) minimum." |
| 13 | **ScrollAnimation dark bg** | **Keep dark background** for the cinematic frame sequence. | Dark canvas is functionally necessary for image sequence readability. Warmth comes from easing/timing/typography, not cream background. |
| 14 | **Button press scale** | **`scale(0.97)`**, drop `brightness` filter. | Subtle editorial feel. `brightness` triggers repaint; `transform: scale()` is compositor-only. |
| 15 | **Dialog overlay opacity** | **`bg-on-surface/50`** + `backdrop-blur-[20px]`. | Compromise between 40% (component) and 60% (animation). Blur compensates for lower opacity. |
| 16 | **Card hover lift** | **`-translate-y-1`** (4px), duration 300ms, `--ease-warm`. | Not `-translate-y-0.5` (2px). Animation plan's spec is correct for editorial feel. |
| 17 | **Hero text animation** | **framer-motion manual spans**, NOT GSAP SplitText. | Avoid adding GSAP as dependency. framer-motion is already installed. |
| 18 | **Hero breathing bg** | **CSS-only**, `will-change: none`, 3s+ cycle, disabled by `prefers-reduced-motion`. | No JS overhead, battery-friendly on mobile. |
| 19 | **Bottom nav show/hide** | Slide down on scroll-down, slide up on scroll-up. Never hide at top. 200ms/300ms `--ease-warm`. | Standard mobile UX pattern, matches navbar behavior. |
| 20 | **Notification badge pulse** | Replace `animate-ping` with gentle primary pulse (`box-shadow` expand/contract, 2s infinite). | `animate-ping` is visually aggressive, doesn't match editorial warmth. |

---

## 3. Phase 0: Prerequisites

### 0.1 Create Git Branch
```bash
git checkout -b feat/editorial-living-room
```

### 0.2 Install Fonts
In `src/app/layout.tsx`:
```typescript
import { Newsreader, Manrope } from 'next/font/google';

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-display',
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-body',
});
```

Apply to `<body>`: `className={`${newsreader.variable} ${manrope.variable} font-body`}`

### 0.3 Install Lenis
```bash
pnpm add lenis
```

### 0.4 Remove next-themes
```bash
pnpm remove next-themes
```

### 0.5 Remove Inter Font
- Delete `src/fonts/InterVariable.woff2`
- Remove `localFont` import and config from `layout.tsx`
- Remove `Inter-fallback` font-face from `globals.css`

---

## 4. Phase 1: Design Tokens & Theme Infrastructure

**Source:** Plan 01 (design-tokens-plan.md), Sections 3-6
**Files modified:** `src/app/globals.css`

### 1.1 Replace globals.css @theme Block

Remove the existing `@custom-variant dark` line and the entire `:root` / `.dark` variable blocks. Replace with:

```css
@import "tailwindcss";

@theme {
  /* === COLORS: Editorial Living Room === */
  --color-surface-canvas: #fbf9f4;
  --color-surface-container-lowest: #ffffff;
  --color-surface-container-high: #eae8e3;
  --color-primary: #9a4027;
  --color-primary-container: #b9583c;
  --color-tertiary: #904917;
  --color-on-surface: #1b1c19;
  --color-on-surface-variant: #4a4941;
  --color-outline-variant: #dcc1b9;
  --color-on-primary: #ffffff;
  --color-destructive: #c4321c;
  --color-success: #2d7a3a;
  --color-warning: #b45309;
  --color-info: #1e6fa0;
  --color-social-twitter: #1DA1F2;
  --color-social-facebook: #1877F2;

  /* === TYPOGRAPHY === */
  --font-display: "Newsreader", "Newsreader-fallback", Georgia, "Times New Roman", serif;
  --font-body: "Manrope", "Manrope-fallback", ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-sans: "Manrope", "Manrope-fallback", ui-sans-serif, system-ui, -apple-system, sans-serif;

  /* === BORDER RADIUS === */
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-full: 9999px;

  /* === SHADOWS (tinted charcoal, dual-layer) === */
  --shadow-ambient-sm: 0 2px 20px rgb(27 28 25 / 0.03), 0 1px 6px rgb(27 28 25 / 0.02);
  --shadow-ambient: 0 8px 40px rgb(27 28 25 / 0.04), 0 2px 12px rgb(27 28 25 / 0.02);
  --shadow-ambient-lg: 0 12px 60px rgb(27 28 25 / 0.06), 0 4px 20px rgb(27 28 25 / 0.03);
  --shadow-ambient-deep: 0 16px 80px rgb(27 28 25 / 0.08), 0 6px 24px rgb(27 28 25 / 0.04);

  /* === STAGGER TIMING === */
  --stagger-tight: 50ms;
  --stagger-normal: 100ms;
  --stagger-wide: 150ms;
}
```

### 1.2 Replace :root CSS Custom Properties

```css
:root {
  /* === ANIMATION TOKENS (owned by animation plan) === */
  --ease-warm: cubic-bezier(0.25, 0.1, 0.25, 1.0);
  --ease-warm-in: cubic-bezier(0.55, 0, 1, 0.45);
  --ease-warm-out: cubic-bezier(0, 0.55, 0.45, 1);
  --ease-editorial: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);

  --duration-instant: 100ms;
  --duration-fast: 150ms;
  --duration-base: 300ms;
  --duration-slow: 500ms;
  --duration-reveal: 800ms;
  --duration-cinematic: 1200ms;

  --transition-fast: var(--duration-fast) var(--ease-warm);
  --transition-base: var(--duration-base) var(--ease-warm);
  --transition-slow: var(--duration-slow) var(--ease-warm);

  /* === Z-INDEX (unchanged) === */
  --z-dropdown: 1000;
  --z-sticky: 1100;
  --z-modal-backdrop: 1200;
  --z-modal: 1300;
  --z-popover: 1400;
  --z-tooltip: 1500;

  /* === LAYOUT === */
  --header-height: 80px;

  /* === SEMANTIC ALIASES (shadcn compat) === */
  --background: var(--color-surface-canvas);
  --foreground: var(--color-on-surface);
  --card: var(--color-surface-container-lowest);
  --card-foreground: var(--color-on-surface);
  --popover: var(--color-surface-container-lowest);
  --popover-foreground: var(--color-on-surface);
  --primary: var(--color-primary);
  --primary-foreground: var(--color-on-primary);
  --muted: var(--color-surface-container-high);
  --muted-foreground: var(--color-on-surface-variant);
  --accent: var(--color-tertiary);
  --accent-foreground: var(--color-on-primary);
  --destructive: var(--color-destructive);
  --border: var(--color-outline-variant);
  --input: var(--color-outline-variant);
  --ring: var(--color-primary);
}

@media (min-width: 640px) {
  :root {
    --header-height: 120px;
  }
}
```

### 1.3 Remove Dark Mode CSS

Delete from `globals.css`:
- Line 2: `@custom-variant dark (&:where(.dark, .dark *));`
- Lines 83-114: Entire `.dark { }` block with all dark variable definitions
- All `.dark`-prefixed selectors throughout the file (glassmorphism, autofill, high-contrast, maplibre)

Delete from `src/styles/nearby-map.css`:
- Lines 72-104: All `.dark`-prefixed popup/marker styles

### 1.4 Update @keyframes

Replace shimmer with warm editorial version:
```css
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```
Update shimmer gradient colors wherever referenced: `from-surface-container-high via-surface-canvas to-surface-container-high`

Duration: 1.5s (was 2s).

### 1.5 Add Glassmorphism Utilities
```css
.glass-nav {
  background: rgb(251 249 244 / 0.8);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.glass {
  background: rgb(251 249 244 / 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.glass-card {
  background: rgb(255 255 255 / 0.8);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}
```

---

## 5. Phase 2: Theme System Removal

**Source:** Plan 01 Section 2
**Order:** Remove infrastructure first, then clean up consumers.

| Step | File | Action |
|------|------|--------|
| 2.1 | `src/components/ThemeProvider.tsx` | **DELETE** entire file |
| 2.2 | `src/components/ThemeToggle.tsx` | **DELETE** entire file |
| 2.3 | `src/components/Providers.tsx` | Remove `ThemeProvider` import and wrapper. Keep `MotionConfig` and `SessionProvider`. |
| 2.4 | `src/components/NavbarClient.tsx` | Remove `ThemeToggle` import (line 24) and render (line 648) |
| 2.5 | `src/components/SearchHeaderWrapper.tsx` | Remove `ThemeToggle` import (line 36) and render (line 270) |
| 2.6 | `src/components/nearby/NearbyPlacesMap.tsx` | Remove `useTheme` import and usage. Hardcode light map tile style. |
| 2.7 | `src/app/layout.tsx` | Remove `suppressHydrationWarning` from `<html>`. Set single `themeColor: '#fbf9f4'`. Apply font variables + `font-body` + `bg-surface-canvas text-on-surface`. |
| 2.8 | `src/__tests__/.../NearbyPlacesMap.markers.test.tsx` | Remove `jest.mock("next-themes")` |
| 2.9 | `src/__tests__/.../NearbyPlacesMap.test.tsx` | Remove `jest.mock("next-themes")` and dark theme test case |
| 2.10 | `tests/e2e/visual/dark-mode-visual.anon.spec.ts` | **DELETE** (dark mode E2E test) |
| 2.11 | `tests/e2e/journeys/search-p0-darkmode-fouc.anon.spec.ts` | **DELETE** (dark mode FOUC test) |
| 2.12 | `tests/e2e/a11y/dark-mode-a11y.auth.spec.ts` | **DELETE** (dark mode a11y test) |
| 2.13 | `tests/e2e/helpers/dark-mode-helpers.ts` | **DELETE** (dark mode test helpers) |

---

## 6. Phase 3: UI Primitives (src/components/ui/)

**Source:** Plan 02 Section 2
**Order:** Bottom-up — primitives first since all other components depend on them.

### Color Migration Map (apply to ALL files)

| Old Class | New Class |
|-----------|-----------|
| `bg-white` | `bg-surface-container-lowest` |
| `bg-zinc-50` | `bg-surface-canvas` |
| `bg-zinc-100` | `bg-surface-container-high` |
| `bg-zinc-900` / `bg-zinc-950` | `bg-on-surface` (rare, for inverted sections) |
| `text-zinc-900` | `text-on-surface` |
| `text-zinc-700` / `text-zinc-600` | `text-on-surface-variant` |
| `text-zinc-500` / `text-zinc-400` | `text-on-surface-variant` |
| `text-white` (on primary) | `text-on-primary` |
| `text-black` | `text-on-surface` |
| `border-zinc-200` / `border-zinc-100` | `border-outline-variant/20` |
| `border-zinc-300` | `border-outline-variant/30` |
| `divide-zinc-*` | `divide-outline-variant/20` |
| `bg-indigo-600` / `bg-indigo-500` | `bg-primary` or `bg-gradient-to-br from-primary to-primary-container` |
| `text-indigo-600` | `text-primary` |
| `ring-zinc-900/30` | `ring-primary/30` |
| `shadow-sm` / `shadow-md` | `shadow-ambient-sm` / `shadow-ambient` |
| `shadow-lg` / `shadow-xl` | `shadow-ambient-lg` |
| ALL `dark:*` classes | **DELETE** (strip entirely) |

### Per-Component Changes

**button.tsx:**
- Primary: `bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-full shadow-ambient`
- Outline: `bg-transparent border border-outline-variant/20 text-on-surface rounded-full`
- Ghost: `text-on-surface-variant hover:bg-surface-container-high rounded-full`
- Filter active: `data-[active=true]:bg-gradient-to-br data-[active=true]:from-primary data-[active=true]:to-primary-container`
- Hover primary: `hover:brightness-110` (gradient darkening)
- Press: `active:scale-[0.97]` (was 0.98)
- Focus: `focus-visible:ring-primary/30`
- Remove `ghost-inverse`, `accent-ghost` variants

**input.tsx:**
- `bg-surface-container-lowest border border-outline-variant/20 rounded-lg`
- `focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30`
- `text-on-surface placeholder:text-on-surface-variant/60`

**textarea.tsx:** Same pattern as input.tsx, `rounded-lg`.

**card.tsx:**
- Default: `bg-surface-container-lowest rounded-lg`
- Elevated: `+ shadow-ambient`
- Glass: `bg-surface-container-lowest/80 backdrop-blur-[20px] rounded-lg`
- Interactive: `hover:-translate-y-1 hover:shadow-ambient-lg transition-[transform,box-shadow] duration-300`
- CardTitle: `text-on-surface font-display`
- CardDescription: `text-on-surface-variant`

**badge.tsx:**
- Base: `font-body uppercase tracking-[0.05em] text-xs` (NOT text-2xs)
- Default: `bg-surface-container-high text-on-surface-variant`
- Highlight: `bg-tertiary/10 text-tertiary` (replaces purple/indigo)

**dialog.tsx:**
- Overlay: `bg-on-surface/50 backdrop-blur-[20px]` (Decision #15)
- Content: `bg-surface-container-lowest rounded-lg shadow-ambient-lg`

**alert-dialog.tsx:** Same overlay/content pattern as dialog.

**dropdown-menu.tsx:**
- Panel: `bg-surface-container-lowest/95 backdrop-blur-[20px] rounded-lg shadow-ambient border border-outline-variant/20`
- Item hover: `bg-surface-container-high`

**select.tsx:**
- Trigger: `border border-outline-variant/20 bg-surface-container-lowest rounded-lg`
- Content: glassmorphism panel like dropdown

**checkbox.tsx:** `border-primary data-[state=checked]:bg-primary`

**date-picker.tsx:** Warm calendar, `primary` selected dates, ghost borders on calendar cells.

**label.tsx:** `text-xs font-bold uppercase tracking-[0.05em] text-on-surface-variant font-body`

**empty-state.tsx:**
- Icon bg: `bg-surface-container-high`
- Heading: `text-on-surface font-display`
- Description: `text-on-surface-variant`

**Skeleton.tsx:**
- Base: `bg-surface-container-high` (was `bg-zinc-200`)
- Shimmer: `from-surface-container-high via-surface-canvas to-surface-container-high`
- Card: `bg-surface-container-lowest` border `border-outline-variant/20`
- Duration: 1.5s

**CustomScrollContainer.tsx:**
- Track: `bg-surface-container-high`
- Thumb: `bg-primary/40`

**SkipLink.tsx:** `bg-primary text-on-primary` (was `bg-zinc-900 text-white`)

**InfiniteScroll.tsx:** Spinner/text: `text-on-surface-variant`

**LazyImage.tsx:** Error fallback bg: `bg-surface-container-high`

---

## 7. Phase 4: Shared Components (src/components/)

**Source:** Plan 02 Section 3

### Top 20 Files by dark: Count (highest-effort files)

| # | File | dark: count | Key changes |
|---|------|-------------|-------------|
| 1 | BookingForm.tsx | 71 | Replace zinc bg/borders/text → editorial tokens, gradient CTA |
| 2 | NavbarClient.tsx | 43 | Glassmorphism bg, warm links, remove ThemeToggle, primary accent |
| 3 | MessagesPageClient.tsx | 43 | Surface hierarchy, warm thread cards |
| 4 | ReviewForm.tsx | 39 | Ghost-border inputs, editorial styling |
| 5 | NeighborhoodChat.tsx | 32 | Warm chat bubbles, editorial typography |
| 6 | FeaturedListingsClient.tsx | ~30 | Remove border-t, Newsreader section title, editorial cards |
| 7 | NotificationCenter.tsx | ~25 | Warm notification cards, primary accent dot |
| 8 | Footer.tsx | ~20 | surface-container-high bg, no dividers, editorial links |
| 9 | LocationSearchInput.tsx | ~20 | Glassmorphism dropdown, ghost-border input |
| 10 | ProfileCompletionBanner.tsx | ~15 | Replace indigo/purple gradient → primary/primary-container gradient |

### Key Component Redesigns

**Navbar/NavbarClient:** `bg-surface-canvas/80 backdrop-blur-[20px]` (glassmorphism on scroll), Manrope links in `on-surface-variant`, primary accent dot, remove ThemeToggle.

**Footer:** `bg-surface-container-high`, Manrope uppercase section headings `tracking-[0.2em]`, `text-on-surface-variant` links, primary hover. No dividers — spacing only.

**ListingCard (src/components/listings/ListingCard.tsx):** `bg-surface-container-lowest rounded-lg shadow-ambient`, `hover:-translate-y-1 hover:shadow-ambient-lg transition-[transform,box-shadow] duration-300`, image `rounded-lg` with `hover:scale-[1.02] transition-transform duration-500`, Manrope title, no borders between image/title/price.

**FavoriteButton:** Heart color `primary` (#9a4027) replaces `red-500`. Keep bounce animation.

**ImageGallery:** Bento grid with `rounded-lg` images, lightbox overlay `bg-on-surface/90`, warm-tinted.

**BookingCalendar:** Editorial date styling, primary selected dates, tertiary for special dates.

**Filter chips:** `border-outline-variant/20 bg-surface-container-lowest rounded-full min-h-[36px]`, active: `bg-gradient-to-br from-primary to-primary-container text-on-primary`.

**ScrollAnimation:** Keep dark background (Decision #13). Update text overlays to Newsreader font. Warm easing `--ease-editorial`.

**Skeleton components (all):** Replace zinc/grey → `bg-surface-container-high`, shimmer `from-surface-container-high via-surface-canvas to-surface-container-high`, 1.5s duration.

**ProfileCompletionBanner:** Replace `from-indigo-500 to-purple-600` → `from-primary to-primary-container`.

---

## 8. Phase 5: Page-Level Redesign

**Source:** Plan 03, all 13 sections

### Root Layout (`src/app/layout.tsx`)
- Body: `bg-surface-canvas text-on-surface font-body`
- Fonts: Newsreader + Manrope via `next/font/google` (see Phase 0)
- Remove `suppressHydrationWarning`
- Viewport themeColor: `#fbf9f4`
- Selection: `selection:bg-primary selection:text-on-primary`
- Add `pb-20 md:pb-0` to main content area (bottom nav clearance)

### Homepage (`src/app/page.tsx`, `HomeClient.tsx`)
- **Hero:** Newsreader display `clamp(3rem, 5vw, 5.5rem)`, italic on "Your": `Finding *Your* People, Not Just a Place`. Label above: `FIND YOUR PEOPLE` in Manrope uppercase.
- **Search bar:** Glassmorphism — `bg-surface-container-lowest backdrop-blur-xl rounded-2xl shadow-ambient border border-outline-variant/20`. Gradient CTA button.
- **ScrollAnimation:** Keep dark background. Newsreader text overlays. Warm easing.
- **Features ("Cozy Spaces, Real People"):** Renamed. Newsreader section title. Editorial feature cards on `surface-canvas`.
- **FeaturedListings:** Remove `border-t`. Newsreader heading. Editorial card grid.
- **CTA section:** Gradient CTA button, Newsreader heading, `surface-container-high` bg.

### Search Page (`src/app/search/`)
- Glassmorphism filter bar
- Editorial listing cards in results
- Map: warm-tinted map style
- No scroll-triggered animations (performance)

### Listing Detail (`src/app/listings/[id]/`)
- Warm image gallery with `rounded-lg`
- Newsreader title, Manrope body
- Booking sidebar: `surface-container-lowest`, gradient CTA, ghost borders
- Host card: circular avatar, Newsreader name

### Auth Pages (login, signup, forgot-password, reset-password)
- `surface-canvas` bg, centered card `surface-container-lowest`
- Ghost-border inputs, gradient submit button
- Split layout on desktop (editorial illustration left, form right) — `hidden lg:flex`

### Dashboard Pages (profile, settings, bookings, messages)
- Surface hierarchy: canvas → container-high → container-lowest
- Messages: preserve mobile toggle behavior (thread list ↔ chat view)

### Content Pages (about, privacy, terms)
- `leading-7` line-height (1.75rem) for long-form readability
- Newsreader headings, Manrope body, max-w-3xl

### Error/Loading/Not-Found
- Warm shimmer skeletons (surface-container-high → surface-canvas)
- Newsreader headings on error states
- surface-canvas backgrounds

---

## 9. Phase 6: Mobile & Responsive

**Source:** Plan 04, all 12 sections

### Breakpoints (unchanged, mobile-first)
- base (0-639px): Mobile
- sm (640px): Large phones
- **md (768px): PRIMARY mobile/desktop split**
- lg (1024px): Desktop with sidebars
- xl (1280px): Wide desktop

### Mobile Navigation
- Hamburger → full-screen glassmorphism overlay: `bg-surface-canvas/80 backdrop-blur-[20px]` fixed inset-0
- Nav links: Newsreader `text-3xl`, stacked vertically, `space-y-8`
- Close: editorial X, 44px touch target
- Entry: fade-in + children stagger (50ms, ease-warm-out)

### Bottom Navigation Bar (NEW — Phase 8)
- Fixed bottom-0, `md:hidden`, `surface-container-lowest`, shadow-ambient upward
- 4-5 icons, primary active state, h-16 + safe-area-inset-bottom
- Hide on scroll-down, show on scroll-up (200ms/300ms --ease-warm)

### Mobile Search
- `rounded-full` search pill (collapsed), ghost border
- Filter chips: horizontal scroll, `rounded-full`, min-h-[36px]
- Single-column results

### Font Size Scaling

| Element | Mobile | md | lg+ |
|---------|--------|-----|-----|
| Display | text-3xl | text-4xl/5xl | text-5xl/6xl/7xl |
| H1 | text-2xl | text-3xl | text-4xl |
| Body | text-base | text-base | text-lg |
| Label | text-xs | text-xs | text-sm |

### Spacing Compression
- Section gaps: `py-12` mobile → `py-16` tablet → `py-20` desktop
- Card padding: `p-4` mobile → `p-6` tablet → `p-8` desktop

### Bottom Padding for All Pages
Every page wrapper needs: `pb-20 md:pb-0` to clear the bottom nav on mobile.

---

## 10. Phase 7: Animation & Polish

**Source:** Plan 05, all 14 sections

### Animation Tokens (in :root, see Phase 1)
Already defined: `--ease-warm`, `--ease-editorial`, `--duration-base` (300ms), etc.

### Key Animation Changes

**Card hover:** `-translate-y-1`, shadow-ambient → shadow-ambient-lg, image `scale-[1.02]`, 300ms `--ease-warm`.

**Section reveals:** IntersectionObserver + framer-motion: `y: 30 → 0, opacity: 0 → 1`, 300ms, stagger 100ms.

**Hero text:** framer-motion manual span wrapping for word-level stagger. NOT GSAP. 50ms stagger, `--ease-editorial`.

**Navbar scroll:** glassmorphism intensifies — `backdrop-blur: 0 → 20px`, `bg-opacity: 0 → 0.8`, triggered by scroll position.

**Skeleton shimmer:** `from-surface-container-high via-surface-canvas to-surface-container-high`, 1.5s linear infinite.

**Heart animation:** Primary color (#9a4027) replaces red-500. Keep bounce keyframe.

**Notification badge:** Replace `animate-ping` with gentle primary pulse (box-shadow, 2s infinite).

**Page transitions:** framer-motion AnimatePresence keyed by pathname. Fade out (200ms) + `translateY(10px)`, fade in (300ms).

**Lenis config:**
```js
{ lerp: 0.08, duration: 1.2, smoothWheel: true, orientation: 'vertical' }
```
Add `data-lenis-prevent` to: MobileBottomSheet contentRef, MobileSearchOverlay, LocationSearchInput dropdown, SortSelect mobile sheet, Radix Dialog/AlertDialog content.

### Mobile Animation Constraints
- Parallax: DISABLED on mobile
- Stagger: cap at 4 items on mobile
- Duration: use `--duration-fast` (150ms) for interactive feedback on mobile
- Hero breathing bg: CSS-only, will-change: none, 3s+ cycle

### Reduced Motion
- Existing `prefers-reduced-motion: reduce` global in globals.css → maintained
- framer-motion `MotionConfig reducedMotion="user"` → maintained
- All new animations must include reduced-motion fallback

---

## 11. Phase 8: New Components

**Source:** Plans 03, 04 (approved in Decision #7)

### 8.1 BottomNavBar.tsx (P0)
- Location: `src/components/BottomNavBar.tsx`
- Fixed bottom-0, `md:hidden`
- `bg-surface-container-lowest shadow-[0_-4px_20px_rgb(27_28_25/0.04)]`
- 4-5 icons: Home, Search, Messages, Profile (+ Bookings if logged in)
- Active: `text-primary`, inactive: `text-on-surface-variant`
- h-16 + `pb-[env(safe-area-inset-bottom)]`
- z-1100 (--z-sticky)
- Animation: slide-up entrance, hide on scroll-down / show on scroll-up

### 8.2 ConnectionScoreBadge.tsx (P1)
- Location: `src/components/ui/ConnectionScoreBadge.tsx`
- `w-10 h-10 rounded-full bg-primary text-on-primary font-display font-bold`
- Positioned absolute top-4 right-4 on listing cards
- Spring entrance: `scale(0.8 → 1)` on viewport entry
- Requires backend compatibility score data (may need stub/placeholder initially)

### 8.3 Full-Screen Mobile Nav Overlay (P0)
- Modify `NavbarClient.tsx` mobile menu from slide-down panel to full-screen overlay
- `fixed inset-0 z-modal-backdrop bg-surface-canvas/80 backdrop-blur-[20px]`
- Newsreader nav links, stagger animation

---

## 12. Phase 9: Cleanup & Verification

### 9.1 Global dark: Class Sweep
Run across entire `src/` directory. Every `dark:` class must be removed. Zero tolerance.

### 9.2 Global zinc-* Sweep
Every `zinc-*` Tailwind class must be replaced with editorial token. Zero tolerance.

### 9.3 Hardcoded Color Sweep
Check for any remaining `#000000`, `#000`, `rgb(0,0,0)` → replace with `on-surface` (#1b1c19).

### 9.4 border Sweep
Every `border-zinc-*` → `border-outline-variant/20` (or /30 for emphasis).
Every bare `divide-*` → `divide-outline-variant/20` or remove (prefer spacing).

### 9.5 Test Updates
- Remove all dark-mode-specific test files (listed in Phase 2)
- Update snapshot tests if any exist
- Run full test suite: `pnpm test`
- Run E2E: `pnpm test:e2e` (if configured)
- Run typecheck: `pnpm typecheck`
- Run lint: `pnpm lint`

---

## 13. Verification Commands

After each phase, run these checks:

```bash
# Phase 1 verification: no dark mode CSS
grep -c "@custom-variant dark" src/app/globals.css  # should be 0
grep -c "\.dark" src/app/globals.css                 # should be 0
grep -c "\.dark" src/styles/nearby-map.css           # should be 0

# Phase 2 verification: no theme infrastructure
grep -r "next-themes" src/ --include="*.tsx" --include="*.ts" -l  # should be empty
grep -r "ThemeProvider" src/ --include="*.tsx" -l                  # should be empty
grep -r "ThemeToggle" src/ --include="*.tsx" -l                    # should be empty
grep -r "useTheme" src/ --include="*.tsx" -l                       # should be empty

# Phase 3-4 verification: no old color classes
grep -rn "dark:" src/ --include="*.tsx" --include="*.ts" | wc -l  # should be 0
grep -rn "zinc-" src/ --include="*.tsx" --include="*.ts" | wc -l  # should be 0
grep -rn "indigo-" src/ --include="*.tsx" --include="*.ts" | wc -l  # should be 0

# Phase 9 final verification
pnpm lint
pnpm typecheck
pnpm test
# grep -rn "dark:" src/ should return 0 results
# grep -rn "#000000\|#000\b" src/ --include="*.tsx" should return 0
```

---

## 14. Rollback Strategy

### Before Starting
```bash
git checkout -b feat/editorial-living-room
```
All changes on a feature branch. Main is untouched.

### Per-Phase Rollback
Each phase should be committed separately:
```
feat(tokens): add Editorial Living Room design tokens
feat(theme): remove dark/light theme system
feat(ui): migrate UI primitives to editorial tokens
feat(components): migrate shared components to editorial
feat(pages): redesign all pages with editorial aesthetic
feat(mobile): add mobile editorial components and responsive updates
feat(animation): add editorial animation system
feat(cleanup): final sweep and verification
```

### Nuclear Rollback
```bash
git checkout main
git branch -D feat/editorial-living-room
```

---

## 15. Appendix: Full File Change List

### Files to DELETE (5)
1. `src/components/ThemeProvider.tsx`
2. `src/components/ThemeToggle.tsx`
3. `tests/e2e/visual/dark-mode-visual.anon.spec.ts`
4. `tests/e2e/journeys/search-p0-darkmode-fouc.anon.spec.ts`
5. `tests/e2e/a11y/dark-mode-a11y.auth.spec.ts`
6. `tests/e2e/helpers/dark-mode-helpers.ts`
7. `src/fonts/InterVariable.woff2`

### Files to CREATE (3)
1. `src/components/BottomNavBar.tsx`
2. `src/components/ui/ConnectionScoreBadge.tsx`
3. (Full-screen nav is a modification of NavbarClient.tsx, not a new file)

### Highest-Effort Files (by dark: count, descending)

| File | dark: count | Phase |
|------|-------------|-------|
| `src/components/BookingForm.tsx` | 71 | 4 |
| `src/app/listings/[id]/ListingPageClient.tsx` | 68 | 5 |
| `src/app/listings/create/CreateListingForm.tsx` | 57 | 5 |
| `src/app/privacy/PrivacyClient.tsx` | 54 | 5 |
| `src/app/admin/audit/page.tsx` | 53 | 5 |
| `src/app/bookings/BookingsClient.tsx` | 53 | 5 |
| `src/app/users/[id]/UserProfileClient.tsx` | 52 | 5 |
| `src/app/settings/SettingsClient.tsx` | 49 | 5 |
| `src/app/terms/TermsClient.tsx` | 49 | 5 |
| `src/app/verify/page.tsx` | 46 | 5 |
| `src/components/nearby/NearbyPlacesPanel.tsx` | 45 | 4 |
| `src/app/listings/[id]/edit/EditListingForm.tsx` | 43 | 5 |
| `src/components/NavbarClient.tsx` | 43 | 4 |
| `src/components/MessagesPageClient.tsx` | 43 | 4 |
| `src/components/ReviewForm.tsx` | 39 | 4 |
| `src/components/chat/NearbyPlacesCard.tsx` | 34 | 4 |
| `src/app/profile/edit/EditProfileClient.tsx` | 33 | 5 |
| `src/components/skeletons/PageSkeleton.tsx` | 33 | 3 |
| `src/components/NeighborhoodChat.tsx` | 32 | 4 |
| `src/app/verify/VerificationForm.tsx` | 32 | 5 |

### Detailed Sub-Plans (for implementation reference)
- `01-design-tokens-plan.md` — complete @theme block, globals.css, font loading
- `02-component-plan.md` — per-component class-level changes for all 87+ components
- `03-pages-plan.md` — section-by-section redesign for all 32 routes
- `04-mobile-plan.md` — breakpoint strategy, mobile components, responsive specs
- `05-animation-plan.md` — timing tokens, per-animation specs, performance budget

---

*This plan was produced by a 5-agent team with full cross-review consensus. All conflicts resolved by team lead. Every detail references actual codebase state verified by grep/read operations. A developer can execute this plan phase-by-phase without ambiguity.*
