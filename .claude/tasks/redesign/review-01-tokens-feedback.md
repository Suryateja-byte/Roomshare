# Cross-Review: Design Tokens Architect Reviews Plans 02-05

**Reviewer:** design-tokens-architect
**Date:** 2026-03-24
**Scope:** Token name conflicts, missing tokens, Tailwind v4 compatibility, font loading conflicts

---

## Overall Assessment

All four plans are well-aligned with the design token system. Token names are used correctly and consistently. There are a few issues to resolve before implementation.

---

## Issue 1: Font Variable Naming Conflict (Plans 02, 03, 04)

**Severity: MUST FIX before implementation**

My plan (01) defines the Manrope variable as `--font-body` producing Tailwind class `font-body`. However:

- **Plan 02** (component-redesigner) uses `font-sans` throughout (e.g., label.tsx: `font-sans text-xs`, dropdown-menu: `font-sans text-on-surface-variant`).
- **Plan 03** (pages-redesigner) uses `--font-newsreader` for the display font variable name; my plan uses `--font-display`.
- **Plan 04** (mobile-responsive) uses "Manrope" directly in prose descriptions but doesn't specify class names.

**Resolution:** We need ONE agreed naming convention:
- **Option A (my plan):** `font-display` (Newsreader), `font-body` (Manrope) -- semantic, avoids Tailwind built-in collision
- **Option B (plan 02):** `font-display` (Newsreader), `font-sans` (Manrope) -- shorter, but collides with Tailwind's default `font-sans`

**Recommendation:** Use `font-display` and `font-body`. I'll also add `font-sans` as an alias in the `@theme` block pointing to Manrope so both work. Plan 03's `--font-newsreader` should be changed to `--font-display` for consistency.

**Action required from:**
- component-redesigner: Confirm `font-body` works or needs `font-sans` alias
- pages-redesigner: Change `--font-newsreader` references to `--font-display`

---

## Issue 2: Shadow Token Definitions Differ (Plan 05)

**Severity: SHOULD FIX**

Plan 05 (animation-polish) defines its own shadow tokens in Section 2:
```css
--shadow-ambient:       0 8px 40px rgba(0, 0, 0, 0.04);
--shadow-ambient-hover: 0 12px 60px rgba(0, 0, 0, 0.06);
--shadow-ambient-deep:  0 16px 80px rgba(0, 0, 0, 0.08);
```

My plan (01) and plan 02's request define dual-layer shadows with **tinted charcoal** (rgb 27,28,25), not plain black:
```css
--shadow-ambient: 0 8px 40px rgb(27 28 25 / 0.04), 0 2px 12px rgb(27 28 25 / 0.02);
```

**Differences:**
1. Plan 05 uses `rgba(0,0,0,...)` (pure black) instead of `rgb(27,28,25,...)` (tinted charcoal). The editorial spec requires tinted charcoal.
2. Plan 05 uses single-layer shadows; plans 01/02 use dual-layer for better depth.
3. Plan 05 adds `--shadow-ambient-deep` (80px blur) which is not in plan 01. This is a useful addition.
4. Plan 05 adds `--shadow-ambient-hover` which maps to plan 01's `--shadow-card-hover`.

**Resolution:** Plan 05 should adopt the tinted charcoal color and dual-layer approach. I'll add `--shadow-ambient-deep` to my plan. The naming can stay:
- `--shadow-ambient-sm` (plan 01)
- `--shadow-ambient` (both)
- `--shadow-ambient-lg` (plan 01) = `--shadow-ambient-hover` (plan 05) -- PICK ONE NAME
- `--shadow-ambient-deep` (plan 05 addition)
- `--shadow-card-hover` (plan 01) -- specifically for card hover with negative offset

**Action required from:** animation-polish -- use `rgb(27 28 25 / ...)` in all shadow definitions, adopt dual-layer approach.

---

## Issue 3: Dark Mode Reference in Plan 04

**Severity: SHOULD FIX**

Plan 04 (mobile-responsive) Section 11, bottom sheet styling, includes a dark mode reference:
```
Dark: bg-[#1b1c19]/95 backdrop-blur-[16px]
```

And Section 2, mobile nav overlay includes:
```
Dark mode:  bg-[#1b1c19]/80 backdrop-blur-[20px]
```

The editorial redesign eliminates dark mode entirely. These dark references should be removed from the plan.

**Action required from:** mobile-responsive -- remove dark mode references from Sections 2 and 11.

---

## Issue 4: Missing Token - `on-surface/10` (Plans 02, 03)

**Severity: INFO (no action needed)**

Plans 02 and 03 use `border-on-surface/10` for ghost borders (e.g., search bar border). This works with Tailwind's opacity modifier syntax (`text-on-surface/10` = on-surface at 10% opacity).

However, the design spec says ghost borders should use `outline-variant` at 20% opacity, not `on-surface` at 10%.

Both approaches produce a similar visual result (faint warm border), but for consistency:
- **Prefer `border-outline-variant/20`** (matches the spec exactly)
- `border-on-surface/10` is acceptable as an alternative where a cooler/darker ghost border is desired

**No blocking issue** -- just a consistency note for implementation.

---

## Issue 5: Transition Token Override (Plan 05)

**Severity: INFO**

Plan 05 redefines `--transition-fast/base/slow` to use `var(--ease-warm)` instead of `ease`:
```css
--transition-fast:  var(--duration-fast) var(--ease-warm);
--transition-base:  var(--duration-base) var(--ease-warm);
--transition-slow:  var(--duration-slow) var(--ease-warm);
```

And changes `--duration-base` from 200ms to 300ms.

This is intentional (editorial warmth) and acceptable. My plan (01) keeps the old values; plan 05's values should be the final ones since animation-polish owns this domain. I'll update my plan to note that plan 05 overrides these.

**No action needed** -- plan 05's values take precedence for transitions.

---

## Issue 6: New Animation Tokens Not in Plan 01 (Plan 05)

**Severity: INFO (will add)**

Plan 05 introduces several new CSS custom properties not in my `@theme` block:
- `--ease-warm`, `--ease-warm-in`, `--ease-warm-out`, `--ease-editorial`, `--ease-bounce`
- `--duration-instant`, `--duration-reveal`, `--duration-cinematic`
- `--stagger-tight`, `--stagger-normal`, `--stagger-wide`

These are animation-specific tokens that belong in globals.css `:root` block (not `@theme`, since they're not Tailwind utility-generating). Plan 05 correctly places them in `:root`. I'll add a note to my plan that Section 2 of plan 05 extends the `:root` block with animation tokens.

**No action needed** -- plan 05 extends `:root`, doesn't conflict with `@theme`.

---

## Issue 7: Tailwind v4 Compatibility -- All Plans OK

**No issues found.** All four plans:
- Correctly reference Tailwind utility classes (not config-file-based customization)
- Don't assume a `tailwind.config.ts` exists
- Use CSS custom properties and `@theme` block approach consistent with Tailwind v4
- Use opacity modifier syntax (`/20`, `/40`) which is supported in v4

---

## Issue 8: Lenis Dependency (Plan 05)

**Severity: INFO**

Plan 05 recommends adding `lenis` as a new dependency for smooth scrolling. This is the only new npm package proposed across all plans (besides the removal of `next-themes`). The bundle cost is ~3KB gzip which is reasonable.

My plan (Section 7) lists no packages to add. If the team agrees on Lenis, I'll add it to the "Packages to ADD" section.

---

## Issue 9: `text-2xs` Usage (Plan 02)

**Severity: INFO**

Plan 02 (component-redesigner) uses `text-2xs` for badge text. The current globals.css has this class marked as **DEPRECATED** (line 479: "Below WCAG 12px minimum. Use text-xs instead.").

Plan 02 should use `text-xs` (12px) instead of `text-2xs` (10px) for badge text to maintain WCAG compliance.

**Action required from:** component-redesigner -- replace `text-2xs` with `text-xs` in badge.tsx spec.

---

## Summary

| # | Issue | Severity | Assigned To |
|---|-------|----------|-------------|
| 1 | Font variable naming: `font-body` vs `font-sans` vs `--font-newsreader` | MUST FIX | All |
| 2 | Shadow color: pure black vs tinted charcoal | SHOULD FIX | animation-polish |
| 3 | Dark mode references in mobile plan | SHOULD FIX | mobile-responsive |
| 4 | Ghost border token consistency | INFO | component-redesigner, pages-redesigner |
| 5 | Transition token override | INFO | None (plan 05 takes precedence) |
| 6 | New animation tokens not in plan 01 | INFO | None (extends `:root`) |
| 7 | Tailwind v4 compatibility | OK | None |
| 8 | Lenis dependency | INFO | Team decision |
| 9 | `text-2xs` WCAG deprecation | INFO | component-redesigner |
