# 01 — Design Tokens & Theme Migration Plan

**Status:** Plan complete
**Author:** design-tokens-architect
**Date:** 2026-03-24

---

## Section 1: Current Theme Audit

### 1.1 Theme Architecture Overview

The project uses **Tailwind CSS v4** (`^4.2.2`) with `@tailwindcss/postcss` — there is **no `tailwind.config.ts`** file. All configuration lives in `src/app/globals.css` via CSS custom properties.

Dark mode is implemented via:
- **`next-themes` v0.4.6** — provides `ThemeProvider` (class-based, `attribute="class"`, `defaultTheme="system"`)
- **CSS custom-variant:** `@custom-variant dark (&:where(.dark, .dark *));` in `globals.css:2`
- **`.dark` class** toggled on `<html>` by next-themes

Font system:
- **Inter Variable** loaded as a local woff2 font (`src/fonts/InterVariable.woff2`) via `next/font/local`
- CSS variable `--font-inter` applied to body
- Fallback font-face `Inter-fallback` with size-adjust metrics

### 1.2 Files Participating in Dark/Light Theme System

| File | Role |
|------|------|
| `src/app/globals.css` | CSS variables for `:root` (light) and `.dark`, `@custom-variant dark`, dark-prefixed utility overrides, glassmorphism dark variants, autofill dark styles, high-contrast dark overrides, maplibre dark styles |
| `src/components/ThemeProvider.tsx` | Wraps `next-themes` `NextThemesProvider` with `attribute="class"`, `defaultTheme="system"`, `enableSystem` |
| `src/components/ThemeToggle.tsx` | UI for Light/Dark/System toggle. Used in navbar and search header. Imports `useTheme` from `next-themes` |
| `src/components/Providers.tsx` | Wraps app in `ThemeProvider` (line 28) |
| `src/components/NavbarClient.tsx` | Imports and renders `ThemeToggle` (line 24, 648) |
| `src/components/SearchHeaderWrapper.tsx` | Imports and renders `ThemeToggle` (line 36, 270) |
| `src/components/nearby/NearbyPlacesMap.tsx` | Uses `useTheme()` → `resolvedTheme` for map tile style switching (line 18, 202) |
| `src/styles/nearby-map.css` | Dark-mode popup/marker styles via `.dark` prefix (lines 72-104) |
| `src/app/layout.tsx` | `suppressHydrationWarning` on `<html>` (needed by next-themes), viewport `themeColor` for light/dark |

### 1.3 CSS Custom Properties (globals.css :root)

**Semantic color tokens (HSL triplets):**
- `--background`, `--foreground`
- `--card`, `--card-foreground`
- `--popover`, `--popover-foreground`
- `--primary`, `--primary-foreground`
- `--secondary`, `--secondary-foreground`
- `--muted`, `--muted-foreground`
- `--accent`, `--accent-foreground`, `--accent-subtle`, `--accent-muted`
- `--destructive`
- `--ring`, `--border`, `--input`
- `--social-twitter`, `--social-facebook`

**Design system tokens:**
- `--radius-sm` (6px), `--radius-md` (12px), `--radius-lg` (16px), `--radius-xl` (24px), `--radius-full` (9999px)
- `--shadow-xs` through `--shadow-xl`
- `--transition-fast` (150ms), `--transition-base` (200ms), `--transition-slow` (300ms)
- `--z-dropdown` through `--z-tooltip`
- `--header-height` (80px mobile, 120px desktop)

### 1.4 Dark Mode Usage Statistics

| Category | Count | Files Affected |
|----------|-------|----------------|
| **`dark:` Tailwind classes** in `.tsx/.ts` | **2,300 occurrences** | **181 files** |
| **`dark:` classes in globals.css** | 16 selectors | 1 file |
| **`dark:` in nearby-map.css** | 7 selectors | 1 file |
| **`zinc-*` color classes** | 2,162 occurrences | 185 files |
| **`bg-white`/`bg-black`/`text-white`/`text-black`** | 946 occurrences | 167 files |
| **`indigo-*` accent classes** | 73 occurrences | 34 files |
| **`border` classes** | 641 occurrences | 147 files |
| **`divide-*` classes** | 8 occurrences | 7 files |
| **`shadow-*` classes** | 230 occurrences | 89 files |
| **Hardcoded colors** (rgb/rgba/hsl/#hex) | 89 occurrences | 12 files |

### 1.5 Top 20 Files by dark: Class Count

| File | dark: count |
|------|-------------|
| `src/components/BookingForm.tsx` | 71 |
| `src/app/listings/[id]/ListingPageClient.tsx` | 68 |
| `src/app/listings/create/CreateListingForm.tsx` | 57 |
| `src/app/privacy/PrivacyClient.tsx` | 54 |
| `src/app/admin/audit/page.tsx` | 53 |
| `src/app/bookings/BookingsClient.tsx` | 53 |
| `src/app/users/[id]/UserProfileClient.tsx` | 52 |
| `src/app/settings/SettingsClient.tsx` | 49 |
| `src/app/terms/TermsClient.tsx` | 49 |
| `src/app/verify/page.tsx` | 46 |
| `src/components/nearby/NearbyPlacesPanel.tsx` | 45 |
| `src/app/listings/[id]/edit/EditListingForm.tsx` | 43 |
| `src/components/NavbarClient.tsx` | 43 |
| `src/components/MessagesPageClient.tsx` | 43 |
| `src/components/ReviewForm.tsx` | 39 |
| `src/components/chat/NearbyPlacesCard.tsx` | 34 |
| `src/app/profile/edit/EditProfileClient.tsx` | 33 |
| `src/components/skeletons/PageSkeleton.tsx` | 33 |
| `src/components/NeighborhoodChat.tsx` | 32 |
| `src/app/verify/VerificationForm.tsx` | 32 |

---

## Section 2: Theme Removal Plan

### 2.1 Package Removal

**Remove `next-themes` (v0.4.6):**
```bash
pnpm remove next-themes
```

### 2.2 File-by-File Removal Steps

| # | File | Action |
|---|------|--------|
| 1 | `src/components/ThemeProvider.tsx` | **DELETE** entire file |
| 2 | `src/components/ThemeToggle.tsx` | **DELETE** entire file |
| 3 | `src/components/Providers.tsx` | Remove `import { ThemeProvider }` (line 8), remove `<ThemeProvider nonce={nonce}>` wrapper (lines 28-31), keep `MotionConfig` and `SessionProvider` |
| 4 | `src/components/NavbarClient.tsx` | Remove `import ThemeToggle` (line 24), remove `<ThemeToggle>` render (line 648) |
| 5 | `src/components/SearchHeaderWrapper.tsx` | Remove `import ThemeToggle` (line 36), remove `<ThemeToggle variant="menu-item">` render (line 270) |
| 6 | `src/components/nearby/NearbyPlacesMap.tsx` | Remove `import { useTheme }` (line 18), remove `const { resolvedTheme } = useTheme()` (line 202), hardcode map style to light |
| 7 | `src/app/layout.tsx` | Remove `suppressHydrationWarning` from `<html>` (line 63), simplify `viewport.themeColor` to single warm cream value `#fbf9f4` |
| 8 | `src/app/globals.css` | Remove `@custom-variant dark` (line 2), remove entire `.dark { }` block (lines 83-114), remove all `.dark` prefixed selectors throughout |
| 9 | `src/styles/nearby-map.css` | Remove all `.dark` prefixed selectors (lines 72-104) |

### 2.3 Test File Updates

| File | Action |
|------|--------|
| `src/__tests__/components/nearby/NearbyPlacesMap.markers.test.tsx` | Remove `jest.mock("next-themes"...)` (lines 19-22) |
| `src/__tests__/components/nearby/NearbyPlacesMap.test.tsx` | Remove `jest.mock("next-themes"...)` (lines 106-108, 117), remove dark theme test case (line 549) |

### 2.4 dark: Class Migration Strategy

Every `dark:` class in the 181 affected files must be removed. The migration approach:

1. **`dark:bg-zinc-*` / `dark:text-zinc-*`** -- These become unnecessary. The single-theme equivalent is determined by the editorial color token:
   - `bg-white dark:bg-zinc-900` --> `bg-surface-canvas`
   - `bg-zinc-50 dark:bg-zinc-800` --> `bg-surface-container-lowest` or `bg-surface-container-high`
   - `text-zinc-900 dark:text-white` --> `text-on-surface`
   - `text-zinc-500 dark:text-zinc-400` --> `text-on-surface-variant`
   - `border-zinc-200 dark:border-zinc-700` --> `border-outline-variant/20`
   - `bg-indigo-600 dark:bg-indigo-500` --> `bg-primary` (gradient for CTAs)

2. **Simple removal:** Any `dark:` prefix is stripped; the light value is evaluated against the new token system and replaced if it uses zinc/indigo.

3. **Execution order:** Bottom-up — UI primitives first (`src/components/ui/*`), then shared components, then page-level components.

---

## Section 3: New Tailwind Config

Since this project uses **Tailwind CSS v4**, configuration is done via CSS `@theme` directive in `globals.css` rather than a `tailwind.config.ts` file.

Add the following `@theme` block to the top of `globals.css` (after the `@import "tailwindcss"` line):

```css
@import "tailwindcss";

@theme {
  /* === COLORS: Editorial Living Room === */

  /* Surface system */
  --color-surface-canvas: #fbf9f4;
  --color-surface-container-lowest: #ffffff;
  --color-surface-container-high: #eae8e3;

  /* Primary (terracotta) */
  --color-primary: #9a4027;
  --color-primary-container: #b9583c;

  /* Tertiary (warm amber highlights) */
  --color-tertiary: #904917;

  /* On-surface (text) */
  --color-on-surface: #1b1c19;
  --color-on-surface-variant: #4a4941;

  /* Outline */
  --color-outline-variant: #dcc1b9;

  /* On-primary (text on primary buttons) */
  --color-on-primary: #ffffff;

  /* Semantic colors */
  --color-destructive: #c4321c;
  --color-success: #2d7a3a;
  --color-warning: #b45309;
  --color-info: #1e6fa0;

  /* Social brand colors (unchanged) */
  --color-social-twitter: #1DA1F2;
  --color-social-facebook: #1877F2;

  /* === TYPOGRAPHY === */

  --font-display: "Newsreader", "Newsreader-fallback", Georgia, "Times New Roman", serif;
  --font-body: "Manrope", "Manrope-fallback", ui-sans-serif, system-ui, -apple-system, sans-serif;

  /* === BORDER RADIUS === */

  --radius-sm: 0.5rem;    /* 8px */
  --radius-md: 0.75rem;   /* 12px */
  --radius-lg: 1rem;      /* 16px — minimum per design rules */
  --radius-xl: 1.5rem;    /* 24px */
  --radius-2xl: 2rem;     /* 32px */
  --radius-full: 9999px;  /* pill / buttons */

  /* === SHADOWS: Ambient (tinted charcoal, dual-layer, wide blur) === */
  /* NOTE: --shadow-ambient-lg also serves as the hover shadow (no separate --shadow-ambient-hover needed) */

  --shadow-ambient-sm: 0 2px 20px rgb(27 28 25 / 0.03), 0 1px 6px rgb(27 28 25 / 0.02);
  --shadow-ambient: 0 8px 40px rgb(27 28 25 / 0.04), 0 2px 12px rgb(27 28 25 / 0.02);
  --shadow-ambient-lg: 0 12px 60px rgb(27 28 25 / 0.06), 0 4px 20px rgb(27 28 25 / 0.03);
  --shadow-ambient-deep: 0 16px 80px rgb(27 28 25 / 0.08), 0 6px 24px rgb(27 28 25 / 0.04);
  --shadow-card-hover: 0 16px 50px -8px rgb(27 28 25 / 0.12), 0 4px 16px rgb(27 28 25 / 0.04);

  /* === SPACING: Editorial (extra-generous) === */
  /* Tailwind v4 default spacing is fine for 4-16.
     We add editorial-scale tokens for section spacing. */

  --spacing-18: 4.5rem;   /* 72px */
  --spacing-20: 5rem;     /* 80px — section gap */
  --spacing-24: 6rem;     /* 96px */
  --spacing-28: 7rem;     /* 112px */
  --spacing-32: 8rem;     /* 128px */

  /* === Z-INDEX (unchanged from current) === */

  --z-dropdown: 1000;
  --z-sticky: 1100;
  --z-modal: 1200;
  --z-popover: 1300;
  --z-tooltip: 1400;

  /* === TRANSITIONS (aligned with animation plan 05 editorial warmth) === */
  /* NOTE: Animation plan extends these with --ease-warm cubic-bezier(0.25, 0.1, 0.25, 1.0) in :root */

  --transition-fast: 150ms cubic-bezier(0.25, 0.1, 0.25, 1.0);
  --transition-base: 300ms cubic-bezier(0.25, 0.1, 0.25, 1.0);
  --transition-slow: 500ms cubic-bezier(0.25, 0.1, 0.25, 1.0);

  /* === HEADER HEIGHT === */

  --header-height: 80px;
}
```

### Token Name Reference (for teammates)

| Token Class | Hex Value | Usage |
|-------------|-----------|-------|
| `bg-surface-canvas` | `#fbf9f4` | Page background, warm cream |
| `bg-surface-container-lowest` | `#ffffff` | Elevated cards, floating search, modals |
| `bg-surface-container-high` | `#eae8e3` | Footers, secondary sidebars, muted containers |
| `bg-primary` | `#9a4027` | CTA buttons, primary actions |
| `bg-primary-container` | `#b9583c` | Gradient partner for CTAs |
| `bg-tertiary` | `#904917` | Highlight badges ("New Listing", "Verified") |
| `text-on-surface` | `#1b1c19` | Primary text (NEVER #000) |
| `text-on-surface-variant` | `#4a4941` | Secondary text, captions |
| `border-outline-variant` | `#dcc1b9` | Ghost borders (use at 20% opacity) |
| `text-on-primary` | `#ffffff` | Text on primary buttons |
| `text-destructive` | `#c4321c` | Error text |
| `text-success` | `#2d7a3a` | Success text |
| `text-warning` | `#b45309` | Warning text |
| `font-display` | Newsreader | Headlines, display text |
| `font-body` | Manrope | Body, titles, labels |
| `rounded-lg` | 1rem | Minimum corner radius |
| `rounded-full` | 9999px | Buttons (pill shape) |
| `shadow-ambient` | Dual-layer: 40px+12px blur, tinted charcoal | Default card shadow |
| `shadow-ambient-lg` | Dual-layer: 60px+20px blur, tinted charcoal | Elevated element shadow |

---

## Section 4: New globals.css

Replace the current `:root` and `.dark` blocks with this single-theme approach:

```css
@import "tailwindcss";

@theme {
  /* ... (all tokens from Section 3 above) ... */
}

/* === BASE LAYER === */
@layer base {
  :root {
    /* Legacy shadcn-compatible tokens (HSL triplets for existing components) */
    --background: 42 33% 97%;        /* #fbf9f4 */
    --foreground: 72 5% 10%;         /* #1b1c19 */
    --card: 0 0% 100%;               /* #ffffff */
    --card-foreground: 72 5% 10%;    /* #1b1c19 */
    --popover: 0 0% 100%;
    --popover-foreground: 72 5% 10%;
    --primary: 14 46% 37%;           /* #9a4027 */
    --primary-foreground: 0 0% 100%;
    --secondary: 40 10% 91%;         /* #eae8e3 */
    --secondary-foreground: 72 5% 10%;
    --muted: 40 10% 91%;             /* #eae8e3 */
    --muted-foreground: 48 6% 27%;   /* #4a4941 */
    --accent: 27 70% 33%;            /* #904917 */
    --accent-foreground: 0 0% 100%;
    --destructive: 10 75% 44%;       /* #c4321c */
    --ring: 14 46% 37%;              /* #9a4027 — focus ring matches primary */
    --border: 16 25% 80%;            /* #dcc1b9 — outline-variant */
    --input: 16 25% 80%;

    /* Design system tokens */
    --radius-sm: 0.5rem;
    --radius-md: 0.75rem;
    --radius-lg: 1rem;
    --radius-xl: 1.5rem;
    --radius-full: 9999px;

    --shadow-xs: 0 1px 8px rgb(27 28 25 / 0.03);
    --shadow-sm: 0 2px 20px rgb(27 28 25 / 0.03), 0 1px 6px rgb(27 28 25 / 0.02);
    --shadow-md: 0 8px 40px rgb(27 28 25 / 0.04), 0 2px 12px rgb(27 28 25 / 0.02);
    --shadow-lg: 0 12px 60px rgb(27 28 25 / 0.06), 0 4px 20px rgb(27 28 25 / 0.03);
    --shadow-xl: 0 16px 50px -8px rgb(27 28 25 / 0.12), 0 4px 16px rgb(27 28 25 / 0.04);

    --transition-fast: 150ms cubic-bezier(0.25, 0.1, 0.25, 1.0);
    --transition-base: 300ms cubic-bezier(0.25, 0.1, 0.25, 1.0);
    --transition-slow: 500ms cubic-bezier(0.25, 0.1, 0.25, 1.0);

    --z-dropdown: 1000;
    --z-sticky: 1100;
    --z-modal: 1200;
    --z-popover: 1300;
    --z-tooltip: 1400;

    --header-height: 80px;

    color-scheme: light;
  }

  @media (min-width: 640px) {
    :root {
      --header-height: 120px;
    }
  }

  /* NO .dark {} block */

  html,
  body {
    height: 100%;
    overflow: hidden;
  }

  body {
    background-color: #fbf9f4; /* surface-canvas — warm cream, NOT white */
    color: #1b1c19; /* on-surface — NEVER pure black */
    font-feature-settings: "rlig" 1, "calt" 1;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-family: var(--font-body);
    font-size: clamp(0.875rem, 0.833rem + 0.208vw, 1rem);
    padding-right: 0 !important;
  }

  /* Font fallback metrics */
  @font-face {
    font-family: "Manrope-fallback";
    src: local("Arial");
    size-adjust: 105%;
    ascent-override: 92%;
    descent-override: 22%;
    line-gap-override: 0%;
  }

  @font-face {
    font-family: "Newsreader-fallback";
    src: local("Georgia");
    size-adjust: 100%;
    ascent-override: 88%;
    descent-override: 24%;
    line-gap-override: 0%;
  }
}
```

**Key changes from current:**
- No `@custom-variant dark` line
- No `.dark { }` block
- Body background is warm cream `#fbf9f4` instead of pure white
- Body text is `#1b1c19` instead of zinc-based near-black
- Font family switches from Inter to Manrope (body) + Newsreader (display via class)
- Shadows use tinted charcoal (rgb 27,28,25) with wider blur (ambient style)
- Border/ring colors use terracotta/outline-variant instead of zinc
- HSL triplets updated for shadcn component compatibility

---

## Section 5: Font Loading Strategy

### 5.1 Replace Inter with Newsreader + Manrope

Update `src/app/layout.tsx` to use `next/font/google`:

```tsx
import { Newsreader, Manrope } from "next/font/google";

const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});
```

### 5.2 Apply to HTML

```tsx
<body className={`${newsreader.variable} ${manrope.variable} ${manrope.className}`}>
```

### 5.3 Fallback Font Stack

- **Display (Newsreader):** `"Newsreader", "Newsreader-fallback", Georgia, "Times New Roman", serif`
- **Body (Manrope):** `"Manrope", "Manrope-fallback", ui-sans-serif, system-ui, -apple-system, sans-serif`

### 5.4 Font File Cleanup

- **DELETE** `src/fonts/InterVariable.woff2` (no longer needed)
- Remove `localFont` import and `inter` variable from `layout.tsx`

### 5.5 Usage Pattern

```html
<!-- Headlines: Newsreader serif -->
<h1 class="font-display text-4xl italic">Editorial Headline</h1>

<!-- Body text: Manrope sans-serif -->
<p class="font-body text-base">Clean body text</p>

<!-- Labels: Manrope uppercase with tracking -->
<span class="font-body text-xs uppercase tracking-wider">LABEL TEXT</span>
```

---

## Section 6: shadcn/ui Theme Config

There is **no `components.json`** file in this project. The UI primitives in `src/components/ui/` follow shadcn patterns but are manually maintained.

### 6.1 CSS Variables for shadcn Components

The HSL-triplet variables in `:root` (Section 4) maintain compatibility with all existing shadcn-style components (`button.tsx`, `card.tsx`, `input.tsx`, `select.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `alert-dialog.tsx`, `badge.tsx`, `label.tsx`, `textarea.tsx`, `checkbox.tsx`, `date-picker.tsx`).

**Updated mappings:**

| shadcn variable | Old value (light) | New editorial value |
|-----------------|-------------------|---------------------|
| `--background` | `0 0% 100%` (white) | `42 33% 97%` (#fbf9f4 warm cream) |
| `--foreground` | `240 10% 3.9%` (near-black) | `72 5% 10%` (#1b1c19) |
| `--primary` | `240 5.9% 10%` (zinc dark) | `14 46% 37%` (#9a4027 terracotta) |
| `--secondary` | `240 4.8% 95.9%` (zinc light) | `40 10% 91%` (#eae8e3) |
| `--muted` | `240 4.8% 95.9%` | `40 10% 91%` (#eae8e3) |
| `--muted-foreground` | `240 3.8% 46.1%` | `48 6% 27%` (#4a4941) |
| `--accent` | `239 84% 67%` (indigo) | `27 70% 33%` (#904917 tertiary) |
| `--destructive` | `0 84.2% 60.2%` | `10 75% 44%` (#c4321c) |
| `--ring` | `240 5% 64.9%` | `14 46% 37%` (#9a4027 primary) |
| `--border` | `240 5.9% 90%` | `16 25% 80%` (#dcc1b9) |

### 6.2 Component Updates Required

Each `src/components/ui/` file currently references `hsl(var(--*))` which will continue to work with the updated HSL values. **No code changes needed** in the ui primitives for the token swap itself — the CSS variable values change, and the components pick them up automatically.

However, each component will need `dark:` class removal:
- `button.tsx` — 7 dark: occurrences
- `card.tsx` — 5
- `select.tsx` — 16
- `dropdown-menu.tsx` — 7
- `badge.tsx` — 7
- `date-picker.tsx` — 28
- `input.tsx` — 1
- `textarea.tsx` — 1
- `label.tsx` — 1
- `alert-dialog.tsx` — 3
- `empty-state.tsx` — 4
- `CustomScrollContainer.tsx` — 3
- `TrustBadge.tsx` — 1

---

## Section 7: npm Package Changes

### Packages to REMOVE

| Package | Version | Reason |
|---------|---------|--------|
| `next-themes` | `^0.4.6` | No longer needed — single theme, no dark mode |

### Packages to ADD

**None required.** `next/font/google` is built into Next.js — no additional package needed for Newsreader/Manrope.

### Optional Future Consideration

If the project later wants a `components.json` for shadcn tooling:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

---

## Section 8: Migration Execution Order

### Phase 1: Foundation (no visual changes yet)

| Step | Action | Files | Risk |
|------|--------|-------|------|
| 1.1 | Add `@theme` block to `globals.css` with all editorial tokens | `globals.css` | Low — additive only |
| 1.2 | Update `:root` HSL variables to editorial values | `globals.css` | Medium — changes all shadcn component colors |
| 1.3 | Add Newsreader + Manrope via `next/font/google` in `layout.tsx` | `layout.tsx` | Low — additive |
| 1.4 | Apply font CSS variables to body | `globals.css`, `layout.tsx` | Medium — changes all typography |

### Phase 2: Theme System Removal

| Step | Action | Files | Risk |
|------|--------|-------|------|
| 2.1 | Remove `@custom-variant dark` line | `globals.css` | **High** — breaks all `dark:` classes (must complete 2.3 first or do together) |
| 2.2 | Remove `.dark { }` block and all `.dark` prefixed selectors | `globals.css`, `nearby-map.css` | Medium |
| 2.3 | Remove all `dark:` classes from 181 component files | All 181 .tsx/.ts files | **High** — bulk change, must be done atomically with 2.1 |
| 2.4 | Remove `ThemeProvider.tsx`, `ThemeToggle.tsx` | 2 files deleted | Low |
| 2.5 | Update `Providers.tsx` — remove ThemeProvider wrapper | `Providers.tsx` | Low |
| 2.6 | Update `NavbarClient.tsx`, `SearchHeaderWrapper.tsx` — remove ThemeToggle | 2 files | Low |
| 2.7 | Update `NearbyPlacesMap.tsx` — remove useTheme, hardcode light style | 1 file | Low |
| 2.8 | Update `layout.tsx` — remove suppressHydrationWarning, simplify themeColor | `layout.tsx` | Low |
| 2.9 | Update test files — remove next-themes mocks | 2 test files | Low |
| 2.10 | `pnpm remove next-themes` | `package.json` | Low |

### Phase 3: Color Token Migration

| Step | Action | Scope |
|------|--------|-------|
| 3.1 | Replace `zinc-*` color classes with editorial tokens | 185 files, 2,162 occurrences |
| 3.2 | Replace `bg-white` with `bg-surface-canvas` or `bg-surface-container-lowest` | 167 files |
| 3.3 | Replace `text-black` / `#000` with `text-on-surface` | Various |
| 3.4 | Replace `indigo-*` accent classes with `primary` / `tertiary` tokens | 34 files, 73 occurrences |
| 3.5 | Replace hardcoded hex/rgb colors in CSS and inline styles | 12 files, 89 occurrences |

### Phase 4: Design Rule Application

| Step | Action |
|------|--------|
| 4.1 | Replace 1px solid borders with background color shifts (NO-LINE RULE) |
| 4.2 | Replace `shadow-sm`/`shadow-md` etc. with ambient shadows |
| 4.3 | Replace `divide-*` utilities with spacing (7 files, 8 occurrences) |
| 4.4 | Update border-radius: ensure minimum `rounded-lg` (1rem) on all containers |
| 4.5 | Apply `rounded-full` to all buttons |
| 4.6 | Add gradient backgrounds to CTA buttons (`bg-gradient-to-br from-primary to-primary-container`) |
| 4.7 | Update glassmorphism classes for warm cream tint |

### Phase 5: Font & Typography Migration

| Step | Action |
|------|--------|
| 5.1 | Delete `src/fonts/InterVariable.woff2` |
| 5.2 | Remove Inter font setup from `layout.tsx` |
| 5.3 | Apply `font-display` class to all headings/display text |
| 5.4 | Apply `font-body` + uppercase + tracking to all label elements |
| 5.5 | Update font fallback font-face declarations |

### Phase 6: Cleanup & Verification

| Step | Action |
|------|--------|
| 6.1 | Run `pnpm lint` — fix any issues |
| 6.2 | Run `pnpm typecheck` — fix type errors |
| 6.3 | Run `pnpm test` — fix broken tests |
| 6.4 | Visual review of all pages |
| 6.5 | Verify `suppressHydrationWarning` removal doesn't cause hydration mismatches |
| 6.6 | Verify high-contrast media query styles still function |
| 6.7 | Remove `src/components/ui/input.tsx` `suppressHydrationWarning` (was for dark mode) |

---

## Appendix A: Full dark: Class File List (181 files)

<details>
<summary>Click to expand — all 181 files with dark: class counts</summary>

```
src/components/BookingForm.tsx: 71
src/app/listings/[id]/ListingPageClient.tsx: 68
src/app/listings/create/CreateListingForm.tsx: 57
src/app/privacy/PrivacyClient.tsx: 54
src/app/admin/audit/page.tsx: 53
src/app/bookings/BookingsClient.tsx: 53
src/app/users/[id]/UserProfileClient.tsx: 52
src/app/settings/SettingsClient.tsx: 49
src/app/terms/TermsClient.tsx: 49
src/app/verify/page.tsx: 46
src/components/nearby/NearbyPlacesPanel.tsx: 45
src/app/listings/[id]/edit/EditListingForm.tsx: 43
src/components/NavbarClient.tsx: 43
src/components/MessagesPageClient.tsx: 43
src/components/ReviewForm.tsx: 39
src/components/chat/NearbyPlacesCard.tsx: 34
src/app/profile/edit/EditProfileClient.tsx: 33
src/components/skeletons/PageSkeleton.tsx: 33
src/components/NeighborhoodChat.tsx: 32
src/app/verify/VerificationForm.tsx: 32
src/app/signup/SignUpClient.tsx: 30
src/types/nearby.ts: 28
src/components/ui/date-picker.tsx: 28
src/app/messages/[id]/ChatWindow.tsx: 28
src/components/BookingCalendar.tsx: 27
src/components/Footer.tsx: 27
src/components/Map.tsx: 27
src/app/about/AboutClient.tsx: 25
src/components/ProfileCompletionIndicator.tsx: 23
src/components/search/FilterModal.tsx: 23
src/app/recently-viewed/RecentlyViewedClient.tsx: 19
src/components/nearby/NearbyPlacesMap.tsx: 19
src/components/LocationSearchInput.tsx: 19
src/app/admin/page.tsx: 19
src/app/login/LoginClient.tsx: 18
src/app/verify-expired/VerifyExpiredClient.tsx: 18
src/app/HomeClient.tsx: 17
src/components/SearchHeaderWrapper.tsx: 16
src/components/ui/select.tsx: 16
src/components/NotificationCenter.tsx: 15
src/components/search/SplitStayCard.tsx: 15
src/components/ThemeToggle.tsx: 14
src/components/SortSelect.tsx: 14
src/components/ProfileCompletionModal.tsx: 14
src/components/listings/ImageUploader.tsx: 14
src/components/search/SearchResultsClient.tsx: 13
src/components/SaveSearchButton.tsx: 13
src/components/listings/ListingCardSkeleton.tsx: 11
src/components/search/MobileSearchOverlay.tsx: 11
src/app/search/error.tsx: 11
src/components/ReviewCard.tsx: 11
src/components/ReviewList.tsx: 10
src/app/search/page.tsx: 10
src/components/ListingFreshnessCheck.tsx: 10
src/components/LowResultsGuidance.tsx: 10
src/components/PersistentMapWrapper.tsx: 10
src/components/nearby/NearbyPlacesSection.tsx: 9
src/components/search/CategoryBar.tsx: 9
src/components/BlockedUserMessage.tsx: 9
src/components/EmailVerificationBanner.tsx: 8
src/components/PasswordStrengthMeter.tsx: 8
src/components/map/MapMovedBanner.tsx: 8
src/components/listings/ImageCarousel.tsx: 8
src/app/profile/ProfileClient.tsx: 72
src/components/filters/FilterChip.tsx: 7
src/components/ui/dropdown-menu.tsx: 7
src/components/ui/button.tsx: 7
src/components/ui/badge.tsx: 7
src/app/global-error.tsx: 7
src/components/error/ErrorBoundary.tsx: 7
src/components/ReviewResponseForm.tsx: 7
src/components/DynamicMap.tsx: 7
src/components/CollapsedMobileSearch.tsx: 7
src/app/listings/create/page.tsx: 5
src/app/settings/error.tsx: 5
src/app/profile/error.tsx: 5
src/app/messages/error.tsx: 5
src/app/bookings/error.tsx: 5
src/app/error.tsx: 5
src/components/ui/card.tsx: 5
src/components/search/TotalPriceToggle.tsx: 5
src/components/search/SearchResultsErrorBoundary.tsx: 5
src/components/chat/BlockedConversationBanner.tsx: 5
src/components/listings/NearMatchSeparator.tsx: 5
src/components/bookings/HoldCountdown.tsx: 5
src/components/ListingStatusToggle.tsx: 6
src/app/settings/page.tsx: 6
src/components/ImageGallery.tsx: 6
src/app/admin/audit/error.tsx: 6
src/app/notifications/error.tsx: 6
src/app/admin/reports/error.tsx: 6
src/app/admin/users/error.tsx: 6
src/app/admin/verifications/error.tsx: 6
src/app/admin/verifications/page.tsx: 6
src/app/profile/edit/error.tsx: 6
src/app/messages/[id]/error.tsx: 6
src/app/saved-searches/error.tsx: 6
src/app/verify/error.tsx: 6
src/app/saved/error.tsx: 6
src/app/offline/OfflineClient.tsx: 6
src/app/users/[id]/error.tsx: 6
src/components/UserAvatar.tsx: 6
src/components/search/MobileBottomSheet.tsx: 6
src/components/search/PriceRangeFilter.tsx: 6
src/components/nearby/RadarAttribution.tsx: 6
src/components/search/CompactSearchPill.tsx: 6
src/components/neighborhood/ProUpgradeCTA.tsx: 6
src/components/neighborhood/NeighborhoodMap.tsx: 4
src/components/DeleteListingButton.tsx: 4
src/components/auth/AuthErrorAlert.tsx: 6
src/components/auth/PasswordConfirmationModal.tsx: 11
src/components/SlotSelector.tsx: 4
src/app/notifications/NotificationsClient.tsx: 21
src/app/recently-viewed/error.tsx: 4
src/app/admin/error.tsx: 4
src/app/listings/[id]/error.tsx: 4
src/app/listings/[id]/edit/error.tsx: 4
src/app/listings/create/error.tsx: 4
src/app/not-found.tsx: 4
src/components/ui/empty-state.tsx: 4
src/components/search/DrawerZeroState.tsx: 4
src/components/search/SearchResultsLoadingWrapper.tsx: 4
src/components/search/SuggestedSearches.tsx: 4
src/components/search/DatePills.tsx: 4
src/components/map/MapEmptyState.tsx: 7
src/components/map/UserMarker.tsx: 4
src/components/listings/SlotBadge.tsx: 4
src/components/BlockUserButton.tsx: 4
src/components/search/CategoryTabs.tsx: 3
src/components/CharacterCounter.tsx: 3
src/components/UserMenu.tsx: 3
src/components/skeletons/Skeleton.tsx: 3
src/components/ui/CustomScrollContainer.tsx: 3
src/components/ui/alert-dialog.tsx: 3
src/components/filters/AppliedFilterChips.tsx: 3
src/components/SearchViewToggle.tsx: 3
src/components/map/MapErrorBoundary.tsx: 3
src/components/map/POILayer.tsx: 3
src/components/SuspensionBanner.tsx: 3
src/components/error/AuthError.tsx: 4
src/components/map/MapGestureHint.tsx: 2
src/components/search/RecommendedFilters.tsx: 2
src/components/search/ListingCardErrorBoundary.tsx: 2
src/components/search/FilterPill.tsx: 2
src/app/search/layout.tsx: 2
src/app/offline/error.tsx: 2
src/app/terms/error.tsx: 2
src/app/privacy/error.tsx: 2
src/app/about/error.tsx: 2
src/lib/haptics.ts: 2
src/__tests__/components/FooterNavLink.test.tsx: 2
src/components/FavoriteButton.tsx: 1
src/components/ScrollAnimation.tsx: 1
src/components/FooterNavLink.tsx: 1
src/components/RateLimitCountdown.tsx: 1
src/components/ReportButton.tsx: 1
src/components/listings/ListingCard.tsx: 20
src/components/FeaturedListingsClient.tsx: 10
src/components/skeletons/ListingCardSkeleton.tsx: 1
src/components/search/PriceHistogram.tsx: 1
src/components/search/FloatingMapButton.tsx: 1
src/app/admin/listings/ListingList.tsx: 1
src/app/admin/reports/ReportList.tsx: 1
src/app/admin/users/UserList.tsx: 1
src/components/neighborhood/NeighborhoodPlaceList.tsx: 1
src/app/listings/[id]/loading.tsx: 1
src/app/listings/[id]/not-found.tsx: 2
src/app/saved-searches/page.tsx: 9
src/components/listings/ListingCardCarousel.tsx: 5
src/components/SearchForm.tsx: 22
src/components/ui/TrustBadge.tsx: 1
src/components/ui/label.tsx: 1
src/components/ui/input.tsx: 1
src/components/ui/textarea.tsx: 1
src/app/admin/verifications/VerificationList.tsx: 22
src/components/listings/ImageCarousel.tsx: 8
src/components/search/SearchResultsClient.tsx: 13
src/app/page.tsx: 11
```

</details>

---

## Appendix B: Color Mapping Reference (zinc -> editorial)

| Current zinc class | Editorial replacement | Notes |
|---|---|---|
| `bg-white` | `bg-surface-canvas` or `bg-surface-container-lowest` | canvas = page bg, container-lowest = elevated |
| `bg-zinc-50` | `bg-surface-canvas` | Warm cream |
| `bg-zinc-100` | `bg-surface-container-high` | Muted background |
| `bg-zinc-200` | `bg-surface-container-high` | |
| `bg-zinc-800` | N/A (was dark mode) | Remove |
| `bg-zinc-900` | N/A (was dark mode) | Remove |
| `text-zinc-900` | `text-on-surface` | #1b1c19 |
| `text-zinc-700` | `text-on-surface` | For primary text |
| `text-zinc-600` | `text-on-surface-variant` | #4a4941 |
| `text-zinc-500` | `text-on-surface-variant` | Secondary text |
| `text-zinc-400` | `text-on-surface-variant` | |
| `text-white` | `text-on-primary` | On primary/colored surfaces |
| `text-black` | `text-on-surface` | Never use pure black |
| `bg-indigo-600` | `bg-primary` | #9a4027 |
| `bg-indigo-500` | `bg-primary` | |
| `text-indigo-600` | `text-primary` | |
| `hover:bg-indigo-700` | `hover:bg-primary-container` | |
| `border-zinc-200` | `border-outline-variant/20` | Ghost border at 20% opacity |
| `border-zinc-300` | `border-outline-variant/20` | |
| `divide-zinc-200` | Remove (use spacing) | NO-LINE RULE |
| `ring-zinc-*` | `ring-primary` or `ring-outline-variant` | |
| `shadow-sm` | `shadow-ambient-sm` | Wider, tinted |
| `shadow-md` | `shadow-ambient` | |
| `shadow-lg` | `shadow-ambient-lg` | |
