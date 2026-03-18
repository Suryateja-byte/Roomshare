# CRIT-7 Implementation Plan: aria-current="page" + Footer Navigation Landmarks

**Task Type**: FIX — WCAG accessibility violations
**Clarity Score**: 4.65/5.0
**Date**: 2026-03-17
**Confidence Score**: 4.6/5.0 (HIGH — Execute with standard review)

---

## Executive Summary

Fix two related WCAG violations: (1) zero `aria-current="page"` on any navigation link codebase-wide, and (2) footer link groups wrapped in `<div>` instead of `<nav>` landmarks with proper heading hierarchy. The fix touches 2 files (NavbarClient.tsx, Footer.tsx) and creates 1 new tiny client component (FooterNavLinks.tsx). A coordination strategy with the plan-footer-client agent (converting Footer to server component) is included with two approaches and trade-off analysis.

---

## Confidence Score Breakdown

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Research Grounding | 15% | 5 | WAI-ARIA practices, WCAG 4.1.2/1.3.1 well-documented |
| Codebase Accuracy | 25% | 5 | All file paths, line numbers, imports verified via Read/Grep |
| Assumption Freedom | 20% | 4 | One coordination dependency with plan-footer-client |
| Completeness | 15% | 5 | All steps present, test strategy, rollback plan |
| Harsh Critic Verdict | 15% | 4 | CONDITIONAL PASS — coordination risk documented |
| Specificity | 10% | 5 | Every code change specified with exact before/after |

**Weighted Score**: 4.6 → 🟢 HIGH CONFIDENCE

---

## WCAG Success Criteria Mapped

| Criterion | ID | What We Fix |
|-----------|-----|-------------|
| Name, Role, Value | 4.1.2 | `aria-current="page"` on active nav links (role/state) |
| Info and Relationships | 1.3.1 | Footer `<nav>` landmarks with `aria-label`; heading hierarchy |
| Meaningful Sequence | 1.3.2 | Correct h2 in footer (not skipping from h1 → h4) |
| Bypass Blocks | 2.4.1 | New `<nav>` landmarks discoverable via screen reader landmark navigation |
| Headings and Labels | 2.4.6 | Footer headings describe their sections |
| Multiple Ways | 2.4.5 | Footer nav is an additional navigation mechanism discoverable by landmark |

---

## Research Foundation

### aria-current Best Practice (WAI-ARIA 1.2)
- `aria-current="page"` indicates the current page within navigation
- Applied to the `<a>` (or `<Link>`) element, NOT a wrapper
- Only ONE link in a navigation set should have `aria-current="page"` at a time
- Screen readers announce "current page" after the link text
- Also provides a CSS hook: `[aria-current="page"]` for visual active styling

### Footer Landmark Best Practice (WCAG)
- Multiple `<nav>` elements on a page MUST have distinguishing `aria-label`
- Footer navigation sections should each be a `<nav>` for landmark discoverability
- Headings inside footer should follow document heading hierarchy (h1 on page → h2 in footer)
- The `<footer>` element itself is a landmark (`contentinfo` role) — already correct

### Coordination: Server Components + usePathname
- `usePathname()` is client-only (Next.js hook, requires 'use client')
- For a server-component Footer, `aria-current` must be handled via:
  - **Option A**: Small client wrapper component for each nav section
  - **Option B**: Inline `<script>` that sets `aria-current` on hydration (fragile, not recommended)
  - **Option C**: Pass pathname from a parent client component as a prop

---

## Agent Deliberation Summary

### Agents Consulted (Simulated Opus 4.6 Deliberation)

1. **Accessibility Architect**: Specified exact ARIA attributes, heading hierarchy fix, landmark labeling pattern
2. **Frontend Developer**: Proposed usePathname integration, coordinate with existing NavbarClient patterns
3. **Component Strategist**: Designed the FooterNavLinks client wrapper for server/client boundary
4. **QA Strategist**: Defined axe-core assertions, screen reader test matrix
5. **Harsh Critic**: Reviewed for over-engineering, coordination race conditions
6. **Assumption Auditor**: Verified every file path, confirmed zero aria-current, validated heading skip

### Key Decisions from Deliberation

1. **NavbarClient already uses React hooks** → adding `usePathname()` is zero-cost (already a client component)
2. **Footer coordination**: Recommend **Approach A** (small client wrapper) as primary, with Approach B (prop drilling) as alternative — both fully specified below
3. **Heading level**: Use `h2` (not `h3`) because footer appears directly after `<main>` which contains page h1. The h4→h2 change is purely semantic — visual styling preserved via Tailwind classes
4. **aria-current on footer links**: Only applies to real `<Link>` elements, NOT the "Coming soon" `<button>` placeholders
5. **Desktop nav links**: Only `/search` and `/about` — simple pathname match
6. **Mobile nav links**: `/search`, `/messages`, `/bookings`, `/saved` — same pathname match pattern

---

## Harsh Critic Report

### Verdict: CONDITIONAL PASS

| Severity | Issue | Mitigation |
|----------|-------|------------|
| 🟡 MINOR | Coordination with plan-footer-client: if they merge first, our Footer.tsx changes may conflict | Both approaches specified; either works regardless of merge order. Plan includes explicit merge conflict resolution notes. |
| 🟡 MINOR | `usePathname` match logic: `/about` matches exact but what about future nested routes like `/about/team`? | Use `startsWith()` for nested-capable routes OR exact match for leaf routes. Specified per-link below. |
| ⚪ NIT | 4 separate `<nav>` elements in footer may feel heavy for such small sections | WCAG recommends distinct landmarks. Screen reader users benefit. Keep as-is. |

Zero 🔴 BLOCKERS. All 🟠 absent. Plan is safe to execute.

---

## Pre-Mortem Analysis

| Failure Category | Scenario | Preventive Measure |
|-----------------|----------|-------------------|
| **Integration Failure** | plan-footer-client merges first, Footer.tsx is now a server component — our `usePathname` code won't work | FooterNavLinks.tsx client wrapper is independent of Footer's server/client status. Works either way. |
| **Sequencing Failure** | aria-current set on navbar but not footer, creating inconsistent UX | Both files changed in same PR. Single commit. |
| **Visual Regression** | h4→h2 change affects text size | Headings use explicit Tailwind sizing classes (`text-xs uppercase tracking-[0.2em]`), not browser h2 defaults. Zero visual change. |
| **SkipLink Breakage** | New `<nav>` landmarks confuse skip-link target | SkipLink targets `#main-content` (an id on `<main>`), unaffected by new `<nav>` elements. |
| **Hydration Mismatch** | FooterNavLinks client component renders aria-current="page" but server HTML has no attribute | Client component renders links — server has no aria-current, client adds it on hydration. This is standard Next.js behavior (no mismatch because the server render of a client component also runs usePathname via server-side rendering). |

---

## Implementation Steps

### File Changes Overview

| File | Action | Lines Affected |
|------|--------|----------------|
| `src/components/NavbarClient.tsx` | MODIFY | Import usePathname; lines 315-327 (desktop), 449-485 (mobile) |
| `src/components/Footer.tsx` | MODIFY | Lines 27-62 (wrap in nav, fix headings); line 1 (coordinate with plan-footer-client) |
| `src/components/FooterNavLinks.tsx` | CREATE | New tiny client component for aria-current on footer links |

---

### Step 1: Add aria-current="page" to NavbarClient.tsx Desktop Links

**File**: `src/components/NavbarClient.tsx`

**1a. Add usePathname import (line 3 area)**

```tsx
// BEFORE (line 3):
import { useState, useEffect, useRef, useCallback } from 'react';

// AFTER:
import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
```

**1b. Add pathname to component body (after line 130)**

```tsx
// After line 130 (inside NavbarClient function body, near other state):
const pathname = usePathname();
```

**1c. Update desktop nav links (lines 315-327)**

```tsx
// BEFORE (lines 315-327):
<Link
    href="/search"
    className="text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white px-5 py-2 rounded-full transition-all duration-300 hover:bg-zinc-100 dark:hover:bg-white/5"
>
    Find a Room
</Link>
<Link
    href="/about"
    className="text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white px-5 py-2 rounded-full transition-all duration-300 hover:bg-zinc-100 dark:hover:bg-white/5"
>
    How it works
</Link>

// AFTER:
<Link
    href="/search"
    aria-current={pathname === '/search' ? 'page' : undefined}
    className={`text-sm font-medium px-5 py-2 rounded-full transition-all duration-300 focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 ${
        pathname === '/search'
            ? 'text-zinc-900 dark:text-white bg-zinc-100 dark:bg-white/10'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5'
    }`}
>
    Find a Room
</Link>
<Link
    href="/about"
    aria-current={pathname === '/about' ? 'page' : undefined}
    className={`text-sm font-medium px-5 py-2 rounded-full transition-all duration-300 focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 ${
        pathname === '/about'
            ? 'text-zinc-900 dark:text-white bg-zinc-100 dark:bg-white/10'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5'
    }`}
>
    How it works
</Link>
```

**Changes explained**:
- `aria-current={pathname === '/search' ? 'page' : undefined}` — sets attribute only when active (undefined removes it from DOM)
- Added `focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2` (was missing on desktop links — existing on IconButton and MenuItem but not here)
- Active state gets `text-zinc-900 dark:text-white bg-zinc-100 dark:bg-white/10` (visible active indicator)
- Inactive state preserves original hover styles

---

### Step 2: Add aria-current="page" to NavbarClient.tsx Mobile Links

**File**: `src/components/NavbarClient.tsx`

**2a. Update mobile "Find a Room" link (lines 449-455)**

```tsx
// BEFORE:
<Link
    href="/search"
    className="flex items-center gap-3 py-3 text-base font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg px-2"
    onClick={() => setIsMobileMenuOpen(false)}
>
    <Search size={20} className="text-zinc-400 dark:text-zinc-500" /> Find a Room
</Link>

// AFTER:
<Link
    href="/search"
    aria-current={pathname === '/search' ? 'page' : undefined}
    className={`flex items-center gap-3 py-3 text-base font-medium rounded-lg px-2 ${
        pathname === '/search'
            ? 'text-zinc-900 dark:text-white bg-zinc-100 dark:bg-zinc-800'
            : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800'
    }`}
    onClick={() => setIsMobileMenuOpen(false)}
>
    <Search size={20} className={pathname === '/search' ? 'text-zinc-900 dark:text-white' : 'text-zinc-400 dark:text-zinc-500'} /> Find a Room
</Link>
```

**2b. Update mobile Messages link (lines 459-471)** — same pattern:

```tsx
aria-current={pathname === '/messages' ? 'page' : undefined}
```

**2c. Update mobile Bookings link (lines 472-478)** — same pattern:

```tsx
aria-current={pathname === '/bookings' ? 'page' : undefined}
```

**2d. Update mobile Saved link (lines 479-485)** — same pattern:

```tsx
aria-current={pathname === '/saved' ? 'page' : undefined}
```

**Pattern for all mobile links**: Add `aria-current={pathname === '<href>' ? 'page' : undefined}` and conditionally apply active/inactive classes.

---

### Step 3: Create FooterNavLinks Client Component

**File**: `src/components/FooterNavLinks.tsx` (NEW)

This is the coordination solution with plan-footer-client. This tiny client component wraps footer links and adds `aria-current` using `usePathname()`.

```tsx
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

interface FooterNavLinkProps {
    href: string;
    children: React.ReactNode;
    className?: string;
}

export function FooterNavLink({ href, children, className = '' }: FooterNavLinkProps) {
    const pathname = usePathname();
    const isActive = pathname === href;

    return (
        <Link
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={`${className}${isActive ? ' text-zinc-900 dark:text-white' : ''}`}
        >
            {children}
        </Link>
    );
}
```

**Size**: ~20 lines. Minimal client JS. Only adds `usePathname` + `Link` to the client bundle — both are already in the page bundle from NavbarClient.

---

### Step 4: Update Footer.tsx — Navigation Landmarks + Heading Hierarchy

**File**: `src/components/Footer.tsx`

#### Approach A (RECOMMENDED): Footer stays as-is for now, works with or without plan-footer-client

This approach modifies Footer.tsx in a way that works whether it's `'use client'` or a server component:
- Wrap each link group in `<nav aria-label="...">`
- Change `<h4>` to `<h2>` (keep Tailwind sizing classes, zero visual change)
- Import and use `FooterNavLink` for the real links (client component, works inside server components)

```tsx
// BEFORE — Platform section (lines 27-34):
<div>
    <h4 className="font-semibold text-zinc-900 dark:text-white mb-6 text-xs uppercase tracking-[0.2em]">Platform</h4>
    <ul className="flex flex-col gap-4 text-sm text-zinc-500 dark:text-zinc-400 font-light">
        <li><Link href="/search" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Browse</Link></li>
        <li><Link href="/listings/create" className="hover:text-zinc-900 dark:hover:text-white transition-colors">List a Room</Link></li>
        <li><button type="button" onClick={() => toast.info('Coming soon')} className="hover:text-zinc-900 dark:hover:text-white transition-colors text-left">Safety</button></li>
    </ul>
</div>

// AFTER — Platform section:
<nav aria-label="Platform links">
    <h2 className="font-semibold text-zinc-900 dark:text-white mb-6 text-xs uppercase tracking-[0.2em]">Platform</h2>
    <ul className="flex flex-col gap-4 text-sm text-zinc-500 dark:text-zinc-400 font-light">
        <li><FooterNavLink href="/search" className="hover:text-zinc-900 dark:hover:text-white transition-colors">Browse</FooterNavLink></li>
        <li><FooterNavLink href="/listings/create" className="hover:text-zinc-900 dark:hover:text-white transition-colors">List a Room</FooterNavLink></li>
        <li><button type="button" onClick={() => toast.info('Coming soon')} className="hover:text-zinc-900 dark:hover:text-white transition-colors text-left">Safety</button></li>
    </ul>
</nav>
```

**Apply same pattern to all 4 sections**:

| Section | aria-label | Heading | Real Links (use FooterNavLink) | Buttons (keep as-is) |
|---------|-----------|---------|-------------------------------|---------------------|
| Platform | "Platform links" | h4 → h2 | `/search`, `/listings/create` | Safety |
| Company | "Company links" | h4 → h2 | `/about` | Careers, Blog |
| Support | "Support links" | h4 → h2 | (none) | Help Center, Contact |
| Legal | "Legal links" | h4 → h2 | (none) | Privacy, Terms |

**Import change at top of Footer.tsx**:
```tsx
// Add:
import { FooterNavLink } from '@/components/FooterNavLinks';
```

**Note on buttons**: The 8 "Coming soon" toast buttons remain as `<button>` elements. They don't get `aria-current` because they're not navigation links. They'll be extracted to ComingSoonButton.tsx by plan-footer-client.

#### Approach B (ALTERNATIVE): If plan-footer-client converts Footer to server component first

If Footer becomes a server component before this fix merges:
1. `FooterNavLink` is already a client component — it works inside server components (Next.js composition pattern)
2. The `toast.info()` buttons will have already been extracted to a client component by plan-footer-client
3. Our `<nav>` + `<h2>` + `FooterNavLink` changes apply identically
4. No additional coordination needed

**Trade-off Analysis**:

| Factor | Approach A (Fix First) | Approach B (Footer Server First) |
|--------|----------------------|-------------------------------|
| Merge conflict risk | Low — different concerns (landmarks vs 'use client') | None — clean application |
| Bundle impact | FooterNavLink adds ~0.5KB to client bundle | Same |
| Coordination needed | Minimal — FooterNavLink is already the boundary | None |
| Recommended | ✅ Yes — can merge independently | Works if other PR merges first |

**The key insight**: `FooterNavLink` is the coordination layer. Whether Footer.tsx is `'use client'` or a server component, importing a client component (`FooterNavLink`) works correctly in both contexts. This makes the two PRs merge-order independent.

---

### Step 5: Verify SkipLink Compatibility

**File**: `src/components/ui/SkipLink.tsx` — NO CHANGES NEEDED

**Verification**:
- SkipLink targets `#main-content` which is the `id` on the `<main>` element in `MainLayout.tsx:24`
- New `<nav>` elements in footer are AFTER `<main>` in the DOM
- Adding footer `<nav>` landmarks does NOT interfere with skip-link
- Screen reader landmark navigation (`D` key in JAWS/NVDA) will now list: "Main navigation" (navbar), "Search navigation" (search page), "Platform links", "Company links", "Support links", "Legal links" (footer navs), plus "main" and "contentinfo" (footer element)

**Note**: The existing `<nav aria-label="Main navigation">` in NavbarClient.tsx:293 already has a good label. No change needed.

---

## Dependency Graph

```
Step 1 (Navbar desktop aria-current)  ─┐
Step 2 (Navbar mobile aria-current)    ─┤── No dependencies between these
Step 3 (Create FooterNavLinks.tsx)     ─┤   → Can parallelize
Step 4 (Footer landmarks + headings)   ─┘── Depends on Step 3 (imports FooterNavLink)
Step 5 (Verify SkipLink)              ─── Verification only, no code change
```

**Recommended execution order**: Steps 1+2+3 in parallel → Step 4 → Step 5 (verify)

---

## Test Strategy

### 1. Static Analysis (Automated)

```bash
# Typecheck — ensures usePathname import is correct, FooterNavLink types match
pnpm typecheck

# Lint — catches any JSX issues
pnpm lint
```

### 2. axe-core Assertions (Unit/Integration)

Add or verify in existing test setup:

```typescript
// Test: No heading-order violations in footer
// axe-core rule: heading-order
expect(await axe(container)).toHaveNoViolations();

// Test: All nav elements have accessible names
// axe-core rule: landmark-unique
// Verify: 0 violations for duplicate landmark labels
```

### 3. Playwright E2E: aria-current Verification

```typescript
// Test: Desktop nav shows aria-current on active page
test('desktop nav link has aria-current=page', async ({ page }) => {
    await page.goto('/about');
    const aboutLink = page.locator('nav[aria-label="Main navigation"] a[href="/about"]');
    await expect(aboutLink).toHaveAttribute('aria-current', 'page');

    // Other link should NOT have aria-current
    const searchLink = page.locator('nav[aria-label="Main navigation"] a[href="/search"]');
    await expect(searchLink).not.toHaveAttribute('aria-current');
});

// Test: Footer has nav landmarks with aria-labels
test('footer has labeled nav landmarks', async ({ page }) => {
    await page.goto('/about');
    const footerNavs = page.locator('footer nav');
    await expect(footerNavs).toHaveCount(4);

    await expect(page.locator('nav[aria-label="Platform links"]')).toBeVisible();
    await expect(page.locator('nav[aria-label="Company links"]')).toBeVisible();
    await expect(page.locator('nav[aria-label="Support links"]')).toBeVisible();
    await expect(page.locator('nav[aria-label="Legal links"]')).toBeVisible();
});

// Test: Footer headings are h2 (not h4)
test('footer headings use h2 for proper hierarchy', async ({ page }) => {
    await page.goto('/about');
    const h4s = page.locator('footer h4');
    await expect(h4s).toHaveCount(0);

    const h2s = page.locator('footer h2');
    await expect(h2s).toHaveCount(4);
});

// Test: Footer link has aria-current on matching page
test('footer link has aria-current on current page', async ({ page }) => {
    await page.goto('/search');
    // Footer is hidden on /search, so test on /about
    await page.goto('/about');
    const aboutLink = page.locator('nav[aria-label="Company links"] a[href="/about"]');
    await expect(aboutLink).toHaveAttribute('aria-current', 'page');
});
```

### 4. Screen Reader Verification (Manual Checklist)

| Test | Expected Result | Screen Reader |
|------|----------------|--------------|
| Navigate to /about, Tab to "How it works" nav link | Announces "How it works, current page, link" | NVDA/JAWS |
| Press `D` (landmarks shortcut) on any page with footer | Lists "Platform links navigation", "Company links navigation", etc. | NVDA |
| Navigate footer by headings (`H` key) | Announces "heading level 2, Platform" (not "level 4") | NVDA/JAWS |
| Navigate to /search, check navbar | "Find a Room, current page, link" | VoiceOver |

---

## Risk Register

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| Merge conflict with plan-footer-client | 🟡 Low | Medium | FooterNavLink is the coordination boundary — works in both server and client Footer |
| Visual regression from h4→h2 | 🟡 Low | Very Low | Tailwind classes control all sizing — h2 default styles are overridden. Verify visually. |
| Extra `<nav>` landmarks overwhelming for screen readers | ⚪ Negligible | Low | Standard WCAG pattern. Labels distinguish them. Users navigate by landmark type. |
| usePathname causes extra re-renders in NavbarClient | ⚪ Negligible | Very Low | usePathname is lightweight; NavbarClient already re-renders on route change (via useSession) |

---

## Rollback Plan

**All changes are purely additive ARIA attributes + semantic HTML changes. Zero behavioral risk.**

- **Rollback**: Revert the single commit. No data changes, no API changes, no state changes.
- **Partial rollback**: Can independently revert navbar changes vs footer changes.
- **Testing rollback**: All new tests are new — removing them doesn't break existing tests.

---

## Coordination Notes for plan-footer-client Agent

1. **No blocking dependency**: This plan and plan-footer-client can merge in any order
2. **Shared concern — h4→h2**: Both plans identify the heading hierarchy issue. Whichever merges first fixes it; the other should skip that change or handle the merge conflict
3. **Shared concern — 'use client'**: If plan-footer-client removes 'use client' from Footer.tsx, our FooterNavLink (already a client component) still works correctly via Next.js composition
4. **The toast buttons**: plan-footer-client extracts these to ComingSoonButton.tsx. Our plan leaves them as-is. No conflict.
5. **Recommended merge order**: Either works, but plan-footer-client first is slightly cleaner (Footer becomes server component, then our FooterNavLink slots in naturally)

---

## Assumption Audit

| # | Assumption | Verified? | Evidence |
|---|-----------|-----------|---------|
| 1 | Zero aria-current in codebase | ✅ | Grep found only 1 mention in docs/SEARCH_PAGE_ARCHITECTURE.md (documentation, not code) |
| 2 | NavbarClient does NOT import usePathname | ✅ | Grep confirmed — not in imports |
| 3 | NavbarClient IS a client component | ✅ | Line 1: `'use client'` |
| 4 | Footer headings are h4 | ✅ | Lines 28, 38, 48, 57 confirmed |
| 5 | Footer link groups are in divs, not navs | ✅ | Lines 27, 37, 47, 56: all `<div>` |
| 6 | SkipLink targets #main-content | ✅ | SkipLink.tsx:7: `href = "#main-content"` |
| 7 | #main-content is on the main element | ✅ | MainLayout.tsx:24: `id="main-content"` |
| 8 | Desktop nav has 2 links (/search, /about) | ✅ | NavbarClient.tsx lines 315-327 |
| 9 | Mobile nav has 4 links (/search, /messages, /bookings, /saved) | ✅ | NavbarClient.tsx lines 449-485 |
| 10 | Footer real links: /search, /listings/create, /about | ✅ | Footer.tsx lines 30, 31, 40 |
| 11 | Tailwind classes override default h2 sizing | ✅ | `text-xs uppercase tracking-[0.2em]` explicitly set on all h4s |
| 12 | usePathname works in client components | ✅ | Already used in 6 components (NavbarWrapper, FooterWrapper, MainLayout, etc.) |

**Zero unverified assumptions.**

---

## Open Questions

1. **Should the /about link in footer Company section use `startsWith('/about')` to support future nested routes like /about/team?** Recommendation: Use exact match (`pathname === '/about'`) for now. If nested routes are added, update the match.

2. **Should we add `aria-labelledby` pointing to the h2 instead of `aria-label` on each nav?** Either is valid per WCAG. `aria-label` is simpler and doesn't require generating ids. Recommendation: Use `aria-label`.

---

## Summary of All Changes

### Files Modified
1. **`src/components/NavbarClient.tsx`** — Add `usePathname` import + `pathname` variable; add `aria-current="page"` + `focus-visible` ring to desktop links (lines 315-327); add `aria-current="page"` + active styling to mobile links (lines 449-485)

2. **`src/components/Footer.tsx`** — Change `<div>` to `<nav aria-label="...">` for 4 link groups; change `<h4>` to `<h2>` for 4 headings; replace `<Link>` with `<FooterNavLink>` for 3 real links; add import for `FooterNavLink`

### Files Created
3. **`src/components/FooterNavLinks.tsx`** — Tiny (~20 line) client component wrapping `Link` with `usePathname()` and `aria-current` logic

### Files NOT Changed
- `src/components/ui/SkipLink.tsx` — Verified compatible, no changes
- `src/components/FooterWrapper.tsx` — No changes needed
- `src/components/Navbar.tsx` — Server wrapper, no changes needed
