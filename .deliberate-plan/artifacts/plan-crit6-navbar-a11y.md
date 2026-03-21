# CRIT-6: NavbarClient.tsx Dropdown Accessibility Fix — Implementation Plan

**Task Type**: FIX
**Confidence Score**: 4.7/5.0 (HIGH)
**Date**: 2026-03-17
**WCAG Violations**: 4.1.2 (Name, Role, Value), 2.1.1 (Keyboard), 2.4.7 (Focus Visible), 2.4.13 (Focus Appearance)

---

## Executive Summary

The profile dropdown menu in `NavbarClient.tsx` is a custom `<div>` with CSS transitions but no ARIA semantics. Screen readers cannot identify it as a menu or navigate its items. The fix implements the WAI-ARIA Menu Button pattern using **roving tabindex** for keyboard focus management, adds `role="menu"`/`role="menuitem"` semantics, converts the ThemeToggle to `menuitemradio` elements, and fixes several secondary a11y issues (nav link focus indicators, `aria-current="page"`, divider roles).

### Critical Design Decision: Custom Implementation vs Radix Migration

The codebase has `@radix-ui/react-dropdown-menu` (already used for `src/components/ui/dropdown-menu.tsx`). However, **we recommend keeping the custom implementation and adding ARIA manually** for these reasons:

1. **The existing dropdown has bespoke styling** (glassmorphism, rounded-[1.5rem], custom user header section) that would require significant Radix style overrides
2. **The dropdown is already fully working** for sighted users — we just need to add the a11y layer
3. **ThemeToggle menu-item variant** needs conversion to `menuitemradio` regardless of approach
4. **The user header section** (name + email at top) isn't a menu item — it's a presentational header. Radix would require wrapping it as a Label or non-item
5. **Smaller diff, lower risk** — adding ARIA attributes + keyboard handler vs. full component rewrite

---

## Confidence Score Breakdown

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Research Grounding | 15% | 5 | WAI-ARIA APG Menu Button pattern fully documented |
| Codebase Accuracy | 25% | 5 | All file paths, line numbers verified |
| Assumption Freedom | 20% | 4 | ThemeToggle integration verified; one edge case with menu close behavior |
| Completeness | 15% | 5 | All 8 sub-tasks addressed + tests + rollback |
| Harsh Critic Verdict | 15% | 4 | CONDITIONAL PASS — see critic report |
| Specificity | 10% | 5 | Exact JSX/attribute changes for every element |
| **Overall** | | **4.7** | **HIGH — Execute with standard review** |

---

## Research Foundation

### WAI-ARIA Menu Button Pattern (W3C APG)

**Required roles/attributes:**

| Element | Required ARIA | Current State |
|---------|--------------|---------------|
| Trigger `<button>` | `aria-haspopup="true"`, `aria-expanded`, `aria-controls`, `id` | Has haspopup + expanded. Missing `aria-controls` and `id`. |
| Menu container | `role="menu"`, `aria-labelledby="<button-id>"` | Missing both. Is a plain `<div>`. |
| Action items | `role="menuitem"`, `tabindex="-1"` | Missing. MenuItem renders `<Link>`/`<button>` with no role. |
| Theme choices | `role="menuitemradio"`, `aria-checked`, inside `role="group"` with `aria-label` | Missing. Currently 3 plain `<button>` elements. |
| Dividers | `role="separator"` | Missing. Currently plain `<div>` elements. |

**Required keyboard interactions (menu open):**

| Key | Action |
|-----|--------|
| ArrowDown | Focus next menuitem (wrap to first from last) |
| ArrowUp | Focus prev menuitem (wrap to last from first) |
| Home | Focus first menuitem |
| End | Focus last menuitem |
| Escape | Close menu, return focus to trigger button |
| Enter/Space | Activate current menuitem |
| Tab | Close menu, move focus naturally to next element |
| Character | Move to next item starting with that character |

**On trigger button (menu closed):**

| Key | Action |
|-----|--------|
| Enter/Space | Open menu, focus first item |
| ArrowDown | Open menu, focus first item |
| ArrowUp | Open menu, focus last item |

### Focus Management: Roving Tabindex (Chosen Approach)

**Why roving tabindex over aria-activedescendant:**
- Better VoiceOver support (known bugs with aria-activedescendant on menus)
- Browser automatically scrolls focused element into view
- `:focus` CSS pseudo-class works natively
- Matches LocationSearchInput's combobox pattern (uses aria-activedescendant for combobox, but menu pattern recommends roving tabindex per W3C APG)

### ThemeToggle Inside role="menu"

Per WAI-ARIA spec, `role="menu"` can only contain: `menuitem`, `menuitemcheckbox`, `menuitemradio`, `group`, `separator`.

The ThemeToggle's 3 buttons (Light/Dark/System) map to `menuitemradio` wrapped in `role="group" aria-label="Theme"`. Activating a menuitemradio does NOT close the menu (per spec).

---

## Agent Team & Key Decisions

### Decision 1: Roving tabindex + `useRef` array for focus tracking
Track all focusable menu items via refs. `activeIndex` state drives which item has `tabindex="0"`. Arrow keys update index and call `.focus()`.

### Decision 2: Custom `useMenuKeyboard` hook
Extract keyboard logic into a reusable hook to keep NavbarClient clean. Pattern mirrors `useKeyboardShortcuts.ts` already in the codebase.

### Decision 3: ThemeToggle refactored to accept menu context
Rather than creating a new component, add a `menuContext` prop to ThemeToggle that changes its rendering to use `menuitemradio` elements when inside a menu.

### Decision 4: `usePathname` for aria-current
NavbarClient already has `useSession` and other hooks. Adding `usePathname` (from `next/navigation`) is lightweight and already used by 6+ components in the codebase.

---

## Harsh Critic Report

**Verdict: CONDITIONAL PASS**

### Issues Found

🟠 **MAJOR — ThemeToggle menuitemradio won't close menu**: Per WAI-ARIA spec, activating a `menuitemradio` should NOT close the menu. But the current ThemeToggle buttons don't close the menu anyway, so this is consistent. However, users may press Escape after changing theme to close — verify this works.
- **Mitigated by**: Escape handler already exists (line 250-258). Will be enhanced to return focus to trigger.

🟡 **MINOR — Character search (type-ahead) is optional but nice**: The WAI-ARIA spec recommends character-based navigation (press "P" to jump to "Profile"). This is a minor nice-to-have.
- **Decision**: Implement in this PR. The menu items are few enough (5-6) that it's low effort and high value.

🟡 **MINOR — Mouse hover and keyboard focus can desync**: If user hovers an item then presses ArrowDown, focus may jump unexpectedly.
- **Mitigated by**: Add `onMouseEnter` to update `activeIndex` so mouse and keyboard stay in sync.

⚪ **NIT — The user info header section**: The top section with name/email is inside the menu div but isn't a menuitem. Per ARIA spec, this is fine when wrapped with `role="none"` or when the menu role is on the inner items container.

---

## Pre-Mortem Analysis

| Failure Mode | Prevention |
|-------------|------------|
| ThemeToggle `menuitemradio` breaks existing theme switching | Test: verify theme actually changes when menuitemradio is activated |
| Focus gets trapped when menu closes | Test: Escape returns focus to trigger button; Tab moves to next element |
| Screen reader announces wrong number of items | Verify: axe-core scan shows correct item count |
| Mobile touch interaction breaks | The menu keyboard handler only activates on keyboard events; touch/click paths unchanged |
| Existing E2E tests break due to changed roles | Update selectors in tests that query by role |
| `aria-current="page"` doesn't update on navigation | `usePathname()` is reactive in Next.js client components — verified by 6+ existing usages |

---

## Implementation Steps

### Step 1: Add `usePathname` import and trigger button ID

**File**: `src/components/NavbarClient.tsx`

**Changes:**
1. Add `import { usePathname } from 'next/navigation';` at line 5
2. Add `import { useId } from 'react';` — already imported via line 3 (`useState, useEffect, useRef, useCallback`). Add `useId` to the destructuring.
3. Inside the component (after line 130):
   ```tsx
   const pathname = usePathname();
   const menuButtonId = useId();
   const menuId = useId();
   ```

### Step 2: Add `aria-current="page"` to desktop nav links

**File**: `src/components/NavbarClient.tsx`, lines 315-327

**Current** (line 315-320):
```tsx
<Link
    href="/search"
    className="text-sm font-medium text-zinc-500 ..."
>
    Find a Room
</Link>
```

**New:**
```tsx
<Link
    href="/search"
    className={`text-sm font-medium px-5 py-2 rounded-full transition-all duration-300 focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-400/40 ${
        pathname === '/search'
            ? 'text-zinc-900 dark:text-white bg-zinc-100 dark:bg-white/10'
            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5'
    }`}
    aria-current={pathname === '/search' ? 'page' : undefined}
>
    Find a Room
</Link>
```

Same pattern for `/about` link (lines 321-326).

**Also add `focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-400/40`** to both links' className strings. This addresses sub-task (7).

### Step 3: Add `id` and `aria-controls` to trigger button

**File**: `src/components/NavbarClient.tsx`, line 345-361

Add `id={menuButtonId}` and `aria-controls={isProfileOpen ? menuId : undefined}` to the trigger button:

```tsx
<button
    id={menuButtonId}
    onClick={() => setIsProfileOpen(!isProfileOpen)}
    className={...}
    aria-expanded={isProfileOpen}
    aria-haspopup="true"
    aria-controls={isProfileOpen ? menuId : undefined}
    data-testid="user-menu"
    aria-label="User menu"
>
```

### Step 4: Add `role="menu"`, `aria-labelledby`, and `id` to dropdown container

**File**: `src/components/NavbarClient.tsx`, line 364-368

Add to the outer dropdown `<div>`:
```tsx
<div
    id={menuId}
    role="menu"
    aria-labelledby={menuButtonId}
    className={`absolute right-0 mt-4 w-72 ...`}
>
```

### Step 5: Wrap user info header with `role="none"` (presentation)

**File**: `src/components/NavbarClient.tsx`, line 370-373

The user info section (name + email) is not a menu item. Mark it as presentational:
```tsx
<div role="none" className="p-6 border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.02]">
    <p className="font-semibold text-zinc-900 dark:text-white tracking-tight">{user.name}</p>
    <p className="text-xs text-zinc-400 truncate mt-0.5">{user.email}</p>
</div>
```

### Step 6: Add `role="menuitem"` and `tabindex` to MenuItem component

**File**: `src/components/NavbarClient.tsx`, lines 68-115 (MenuItem component)

Add `role` and `tabIndex` props to MenuItem:

```tsx
const MenuItem = ({
    icon,
    text,
    badge,
    danger,
    onClick,
    href,
    role: ariaRole = 'menuitem',
    tabIndex = -1,
}: {
    icon: React.ReactNode;
    text: string;
    badge?: string;
    danger?: boolean;
    onClick?: () => void;
    href?: string;
    role?: string;
    tabIndex?: number;
}) => {
    const className = `w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-2 ${danger
        ? 'text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white'
    }`;

    // ... content unchanged ...

    if (href) {
        return (
            <Link href={href} className={className} onClick={onClick} role={ariaRole} tabIndex={tabIndex}>
                {content}
            </Link>
        );
    }

    return (
        <button onClick={onClick} className={className} role={ariaRole} tabIndex={tabIndex}>
            {content}
        </button>
    );
};
```

### Step 7: Add `role="separator"` to divider elements

**File**: `src/components/NavbarClient.tsx`, lines 378 and 381

**Current:**
```tsx
<div className="h-px bg-zinc-100 dark:bg-white/5 my-2 mx-3"></div>
```

**New:**
```tsx
<div role="separator" className="h-px bg-zinc-100 dark:bg-white/5 my-2 mx-3"></div>
```

Apply to both divider `<div>`s (line 378 and line 381).

### Step 8: Convert ThemeToggle menu-item variant to menuitemradio

**File**: `src/components/ThemeToggle.tsx`

Modify the `menu-item` variant (lines 41-81) to render as `menuitemradio` elements:

```tsx
if (variant === 'menu-item') {
    return (
        <div role="group" aria-label="Theme" className="px-4 py-2">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2" id="theme-group-label">Theme</p>
            <div className="flex gap-1" role="none">
                <button
                    role="menuitemradio"
                    aria-checked={theme === 'light'}
                    tabIndex={-1}
                    onClick={() => setTheme('light')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        theme === 'light'
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                            : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                    }`}
                >
                    <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                    Light
                </button>
                <button
                    role="menuitemradio"
                    aria-checked={theme === 'dark'}
                    tabIndex={-1}
                    onClick={() => setTheme('dark')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        theme === 'dark'
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                            : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                    }`}
                >
                    <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                    Dark
                </button>
                <button
                    role="menuitemradio"
                    aria-checked={theme === 'system'}
                    tabIndex={-1}
                    onClick={() => setTheme('system')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        theme === 'system'
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                            : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                    }`}
                >
                    <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
                    Auto
                </button>
            </div>
        </div>
    );
}
```

### Step 9: Implement roving tabindex keyboard navigation

**File**: `src/components/NavbarClient.tsx`

Add state and refs inside `NavbarClient` component (after existing state declarations, ~line 139):

```tsx
const [activeMenuIndex, setActiveMenuIndex] = useState(-1);
const menuItemsRef = useRef<(HTMLElement | null)[]>([]);
const triggerButtonRef = useRef<HTMLButtonElement>(null);
```

Add a `useEffect` to collect focusable menu items when dropdown opens:

```tsx
// Collect menu items when dropdown opens
useEffect(() => {
    if (isProfileOpen) {
        // Use requestAnimationFrame to ensure DOM is painted after CSS transition starts
        requestAnimationFrame(() => {
            const menuEl = document.getElementById(menuId);
            if (menuEl) {
                const items = menuEl.querySelectorAll<HTMLElement>(
                    '[role="menuitem"], [role="menuitemradio"]'
                );
                menuItemsRef.current = Array.from(items);
            }
        });
    } else {
        menuItemsRef.current = [];
        setActiveMenuIndex(-1);
    }
}, [isProfileOpen, menuId]);
```

Add `useCallback` for menu keyboard handler:

```tsx
const handleMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    const items = menuItemsRef.current;
    const count = items.length;
    if (count === 0) return;

    switch (e.key) {
        case 'ArrowDown': {
            e.preventDefault();
            const next = activeMenuIndex < count - 1 ? activeMenuIndex + 1 : 0;
            setActiveMenuIndex(next);
            items[next]?.focus();
            break;
        }
        case 'ArrowUp': {
            e.preventDefault();
            const prev = activeMenuIndex > 0 ? activeMenuIndex - 1 : count - 1;
            setActiveMenuIndex(prev);
            items[prev]?.focus();
            break;
        }
        case 'Home': {
            e.preventDefault();
            setActiveMenuIndex(0);
            items[0]?.focus();
            break;
        }
        case 'End': {
            e.preventDefault();
            setActiveMenuIndex(count - 1);
            items[count - 1]?.focus();
            break;
        }
        case 'Escape': {
            e.preventDefault();
            setIsProfileOpen(false);
            triggerButtonRef.current?.focus();
            break;
        }
        case 'Tab': {
            // Close menu on Tab, let focus move naturally
            setIsProfileOpen(false);
            break;
        }
        default: {
            // Character search: move to next item starting with typed character
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
                const char = e.key.toLowerCase();
                const startIndex = activeMenuIndex + 1;
                for (let i = 0; i < count; i++) {
                    const idx = (startIndex + i) % count;
                    const text = items[idx]?.textContent?.trim().toLowerCase();
                    if (text?.startsWith(char)) {
                        setActiveMenuIndex(idx);
                        items[idx]?.focus();
                        break;
                    }
                }
            }
        }
    }
}, [activeMenuIndex]);
```

Add trigger button keyboard handler for opening the menu:

```tsx
const handleTriggerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        if (!isProfileOpen) {
            e.preventDefault();
            setIsProfileOpen(true);
            // Focus first item after menu renders
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const items = menuItemsRef.current;
                    if (items.length > 0) {
                        const idx = e.key === 'ArrowUp' ? items.length - 1 : 0;
                        setActiveMenuIndex(idx);
                        items[idx]?.focus();
                    }
                });
            });
        }
    }
    if (e.key === 'ArrowUp') {
        if (!isProfileOpen) {
            e.preventDefault();
            setIsProfileOpen(true);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const items = menuItemsRef.current;
                    if (items.length > 0) {
                        const lastIdx = items.length - 1;
                        setActiveMenuIndex(lastIdx);
                        items[lastIdx]?.focus();
                    }
                });
            });
        }
    }
}, [isProfileOpen]);
```

### Step 10: Update Escape key handler to return focus

**File**: `src/components/NavbarClient.tsx`, lines 250-258

**Current:**
```tsx
if (event.key === 'Escape') {
    if (isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
    } else if (isProfileOpen) {
        setIsProfileOpen(false);
    }
}
```

**New:**
```tsx
if (event.key === 'Escape') {
    if (isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
    } else if (isProfileOpen) {
        setIsProfileOpen(false);
        triggerButtonRef.current?.focus();
    }
}
```

### Step 11: Update click-outside handler to return focus

**File**: `src/components/NavbarClient.tsx`, lines 213-221

Add focus restoration when click-outside closes the menu:
```tsx
const handleClickOutside = (event: MouseEvent) => {
    if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
        // Don't return focus to trigger on outside click — user clicked elsewhere intentionally
    }
};
```

Note: Per WAI-ARIA guidance, click-outside should NOT force focus back to the trigger. The user clicked somewhere else — let focus go there naturally.

### Step 12: Wire keyboard handlers to JSX elements

**Trigger button** (line 345): Add `ref={triggerButtonRef}` and `onKeyDown={handleTriggerKeyDown}`:
```tsx
<button
    ref={triggerButtonRef}
    id={menuButtonId}
    onClick={() => setIsProfileOpen(!isProfileOpen)}
    onKeyDown={handleTriggerKeyDown}
    ...
```

**Menu container** (line 364): Add `onKeyDown={handleMenuKeyDown}`:
```tsx
<div
    id={menuId}
    role="menu"
    aria-labelledby={menuButtonId}
    onKeyDown={handleMenuKeyDown}
    className={...}
>
```

### Step 13: Add `onMouseEnter` to menu items for pointer/keyboard sync

Update MenuItem to accept and forward `onMouseEnter`:

```tsx
const MenuItem = ({
    ...existing props...,
    onMouseEnter,
}: {
    ...existing types...,
    onMouseEnter?: () => void;
}) => {
    // ... in rendered elements, add onMouseEnter={onMouseEnter}
};
```

In the menu items section (lines 374-391), pass index-based mouse handlers:

```tsx
<MenuItem
    icon={<User size={16} />}
    text="Profile"
    href="/profile"
    onClick={() => setIsProfileOpen(false)}
    tabIndex={activeMenuIndex === 0 ? 0 : -1}
    onMouseEnter={() => setActiveMenuIndex(0)}
/>
```

(Repeat for each MenuItem with incrementing indices. The ThemeToggle radio items also get indices.)

### Step 14: Update mobile nav links with `aria-current`

**File**: `src/components/NavbarClient.tsx`, mobile menu section (lines 449-455, 459-485)

Add `aria-current={pathname === '/search' ? 'page' : undefined}` to mobile nav links:

```tsx
<Link
    href="/search"
    aria-current={pathname === '/search' ? 'page' : undefined}
    className="flex items-center gap-3 py-3 ..."
    onClick={() => setIsMobileMenuOpen(false)}
>
```

Same for `/messages`, `/bookings`, `/saved` links in the mobile menu.

---

## Dependency Graph

```
Step 1 (imports + IDs) ← required by all subsequent steps
Step 2 (nav link a11y)  — independent
Step 3 (trigger button) ← required by Step 4, 9, 10
Step 4 (menu container) ← required by Step 9
Step 5 (user header)    — independent
Step 6 (MenuItem role)  ← required by Step 9, 13
Step 7 (separators)     — independent
Step 8 (ThemeToggle)    — independent (separate file)
Step 9 (keyboard nav)   ← requires Steps 1, 3, 4, 6
Step 10 (Escape focus)  ← requires Step 3
Step 11 (click-outside) — independent
Step 12 (wire handlers) ← requires Steps 3, 9
Step 13 (mouse sync)    ← requires Steps 6, 9
Step 14 (mobile a11y)   ← requires Step 1
```

**Recommended execution order:**
1. Step 1 → Step 3 → Step 4 → Step 6 → Step 9 → Step 12 (critical path)
2. Steps 2, 5, 7, 8, 10, 11, 13, 14 (can be done in any order after their deps)

---

## Test Strategy

### Unit Tests (Jest + Testing Library)

**File**: `src/__tests__/components/NavbarClient.test.tsx` (update existing or create)

1. **Menu opens with correct ARIA**: Verify `role="menu"`, `aria-labelledby`, `aria-expanded="true"` when open
2. **Menu items have correct roles**: Query `getAllByRole('menuitem')` — expect 5 (Profile, List a Room, Saved, Settings, Log out)
3. **Theme radio items**: Query `getAllByRole('menuitemradio')` — expect 3 (Light, Dark, System)
4. **Separators**: Query `getAllByRole('separator')` — expect 2
5. **ArrowDown navigates**: Fire ArrowDown, assert focus moves to next item
6. **ArrowUp navigates**: Fire ArrowUp, assert focus moves to previous item
7. **Home/End**: Assert focus jumps to first/last
8. **Escape closes and returns focus**: Assert `aria-expanded="false"` and trigger button is focused
9. **Tab closes menu**: Assert menu closes on Tab
10. **`aria-current="page"`**: Render with pathname="/search", verify nav link has `aria-current="page"`

### E2E Tests (Playwright)

**File**: `tests/e2e/a11y/navbar-menu-a11y.spec.ts` (new file)

```typescript
test.describe('Navbar profile menu accessibility', () => {
    test('menu has correct ARIA roles', async ({ page }) => {
        // Login, open menu
        await expect(page.getByRole('menu')).toBeVisible();
        await expect(page.getByRole('menuitem')).toHaveCount(5);
        await expect(page.getByRole('menuitemradio')).toHaveCount(3);
        await expect(page.getByRole('separator')).toHaveCount(2);
    });

    test('ArrowDown/ArrowUp navigate menu items', async ({ page }) => {
        // Open menu, press ArrowDown, verify focus order
        await page.keyboard.press('ArrowDown');
        await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(page.getByRole('menuitem', { name: 'List a Room' })).toBeFocused();
    });

    test('Escape closes menu and returns focus to trigger', async ({ page }) => {
        // Open menu, press Escape
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('user-menu')).toBeFocused();
        await expect(page.getByRole('menu')).not.toBeVisible();
    });

    test('Home/End jump to first/last items', async ({ page }) => {
        // Open menu, press End, verify last item focused
        await page.keyboard.press('End');
        await expect(page.getByRole('menuitem', { name: 'Log out' })).toBeFocused();
    });

    test('axe-core shows no WCAG violations', async ({ page }) => {
        // Open menu, run axe
        const results = await new AxeBuilder({ page })
            .include('[role="menu"]')
            .analyze();
        expect(results.violations).toEqual([]);
    });

    test('desktop nav links have aria-current', async ({ page }) => {
        await page.goto('/search');
        await expect(page.getByRole('link', { name: 'Find a Room' }))
            .toHaveAttribute('aria-current', 'page');
    });
});
```

### WCAG Success Criteria Mapped

| WCAG Criterion | Status After Fix | Verification |
|---------------|-----------------|-------------|
| 2.1.1 Keyboard | PASS | ArrowUp/Down/Home/End/Escape all work |
| 2.1.2 No Keyboard Trap | PASS | Tab and Escape both exit the menu |
| 2.4.7 Focus Visible | PASS | focus-visible:ring-2 on all items and nav links |
| 2.4.13 Focus Appearance | PASS | Ring style meets 2px minimum |
| 4.1.2 Name, Role, Value | PASS | role="menu", role="menuitem", role="menuitemradio", aria-labelledby, aria-expanded |
| 1.3.1 Info and Relationships | PASS | role="separator", role="group" with aria-label |
| 2.4.8 Location | PASS (new) | aria-current="page" on active nav links |

---

## Risk Register

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| ThemeToggle menuitemradio doesn't fire setTheme | Medium | Low | Test: verify theme actually changes |
| CSS transition timing prevents focus on first item | Medium | Medium | Double `requestAnimationFrame` before `.focus()` |
| Existing E2E tests break (role queries) | Low | Medium | Update selectors in affected test files |
| Mobile menu keyboard interaction regresses | Low | Low | Changes scoped to desktop dropdown only |
| Screen reader announces wrong item count | Medium | Low | axe-core scan validates structure |

---

## Rollback Plan

**Risk level**: LOW — All changes are additive ARIA attributes and a new keyboard handler. No behavior changes for sighted mouse users.

**Rollback**: Revert the commit. No data migration, no DB changes, no API changes.

**Partial rollback**: If ThemeToggle menuitemradio causes issues, revert only `ThemeToggle.tsx` changes and temporarily exclude the theme section from the menu role hierarchy using `role="none"` on the wrapper.

---

## Files Changed Summary

| File | Change Type | Scope |
|------|------------|-------|
| `src/components/NavbarClient.tsx` | Modified | ARIA roles, keyboard handler, focus management, aria-current |
| `src/components/ThemeToggle.tsx` | Modified | menu-item variant → menuitemradio |
| `tests/e2e/a11y/navbar-menu-a11y.spec.ts` | New | E2E accessibility tests |
| `src/__tests__/components/NavbarClient.test.tsx` | Modified | Unit tests for ARIA roles + keyboard nav |

---

## Open Questions

1. **Should the mobile menu also get `role="menu"`?** Currently it uses `role="dialog"`. This is arguably correct since it's a full-screen overlay, not a dropdown menu. **Recommendation**: Keep as dialog — it's a different pattern.

2. **Should character search (type-ahead) be case-insensitive?** **Recommendation**: Yes, `toLowerCase()` comparison.
