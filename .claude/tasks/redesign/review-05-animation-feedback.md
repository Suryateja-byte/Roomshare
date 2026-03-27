# Cross-Review: Animation-Polish Feedback on Plans 01, 02, 03, 04

**Reviewer:** animation-polish
**Date:** 2026-03-24

---

## Plan 01: Design Tokens (design-tokens-architect)

### Issue 1: Transition tokens use generic `ease` — should use editorial easing

**Location:** Section 3 (`@theme` block, line ~235) and Section 4 (`:root` block, line ~318)

**Current in plan 01:**
```css
--transition-fast: 150ms ease;
--transition-base: 200ms ease;
--transition-slow: 300ms ease;
```

**Should be (per animation plan):**
```css
--ease-warm: cubic-bezier(0.25, 0.1, 0.25, 1.0);
--ease-warm-in: cubic-bezier(0.55, 0, 1, 0.45);
--ease-warm-out: cubic-bezier(0, 0.55, 0.45, 1);
--ease-editorial: cubic-bezier(0.16, 1, 0.3, 1);
--duration-instant: 100ms;
--duration-fast: 150ms;
--duration-base: 300ms;
--duration-slow: 500ms;
--duration-reveal: 800ms;
--transition-fast: var(--duration-fast) var(--ease-warm);
--transition-base: var(--duration-base) var(--ease-warm);
--transition-slow: var(--duration-slow) var(--ease-warm);
```

**Impact:** Without the easing curves and extended durations in the token layer, every component will use CSS default `ease` instead of the warm editorial feel. The base duration should also be 300ms, not 200ms.

**Severity:** HIGH — this is the foundational animation token, affects every transition in the app.

### Issue 2: Missing ambient shadow animation tokens

**Location:** Section 3 (`@theme` block)

The plan defines `--shadow-ambient-sm`, `--shadow-ambient`, `--shadow-ambient-lg`, `--shadow-card-hover` but these are static values. The animation plan needs paired tokens for hover state transitions:

```css
--shadow-ambient-hover: 0 12px 60px rgb(27 28 25 / 0.06), 0 4px 20px rgb(27 28 25 / 0.03);
```

This is already `--shadow-ambient-lg` in the tokens plan. **Resolution:** Animation plan should use `shadow-ambient-lg` for hover instead of defining a separate `--shadow-ambient-hover`. I'll align my plan to the tokens plan naming.

**Severity:** LOW — naming alignment, no functional gap.

### Issue 3: Missing stagger/reveal timing tokens

The animation plan defines `--stagger-tight` (50ms), `--stagger-normal` (100ms), `--stagger-wide` (150ms). These are not in the `@theme` block.

**Recommendation:** Add these to the `@theme` block since they'll be used across components:
```css
--stagger-tight: 50ms;
--stagger-normal: 100ms;
--stagger-wide: 150ms;
```

**Severity:** LOW — these could live in globals.css `:root` instead of `@theme`, but consistency is better.

---

## Plan 02: Component Redesign (component-redesigner)

### Issue 4: Card interactive variant missing lift animation spec

**Location:** Section 2, card.tsx redesign

**Current in plan 02:**
```
Interactive: bg-surface-container-lowest rounded-lg hover:-translate-y-0.5 hover:shadow-ambient-lg transition-all
```

**Animation plan specifies:**
- `translateY(-4px)` not `-0.5` (which is 2px in Tailwind)
- Duration: 300ms (not generic `transition-all` which uses browser default)
- Easing: `--ease-warm` specifically

**Recommendation:** Update to:
```
hover:-translate-y-1 hover:shadow-ambient-lg transition-[transform,box-shadow] duration-300
```

And apply `--ease-warm` via the `.transition-lift` utility class.

**Severity:** MEDIUM — the lift distance and timing are core to the editorial card feel.

### Issue 5: Dialog/AlertDialog overlay opacity mismatch

**Plan 02 says:** `bg-on-surface/40 backdrop-blur-[20px]`
**Animation plan says:** Backdrop fades to `rgba(27,28,25,0.6)` over 300ms

The opacity values differ: 40% vs 60%.

**Recommendation:** Use 50% as a compromise — `bg-on-surface/50 backdrop-blur-[20px]`. The blur makes lower opacity viable, but 40% may feel too transparent.

**Severity:** LOW — visual preference, easily adjusted during implementation.

### Issue 6: ScrollAnimation.tsx listed as "logic only, no visual changes"

**Location:** Section 3, component list at bottom

**Plan 02 says:** "ScrollAnimation.tsx — logic only, no visual changes"

**Animation plan says:** Text overlays should use Newsreader font, shadow style updated, scroll hint bounce should use `--ease-warm`.

**Recommendation:** Mark ScrollAnimation as needing visual updates (font, shadow, easing) even though the core logic stays the same.

**Severity:** LOW — documentation accuracy.

### Issue 7: FavoriteButton heart color — alignment confirmed

Both plans agree: heart changes from `red-500` to `primary (#9a4027)`. Animation plan adds the glow pulse. No conflict.

### Issue 8: Missing notification badge animation change

**Plan 02** mentions notification center styling but doesn't explicitly call out replacing `animate-ping` on the NavbarClient unread badge with a gentler pulse.

**Recommendation:** Add to NavbarClient spec: "Replace `animate-ping` on unread badge with gentle primary pulse (`box-shadow` expanding/contracting, 2s infinite, primary color)."

**Severity:** MEDIUM — the current `animate-ping` is visually aggressive and doesn't match editorial warmth.

---

## Plan 03: Pages Redesign (pages-redesigner)

### Issue 9: Scroll Animation section — "no pure black backgrounds"

**Location:** Section 2.2

**Plan 03 says:** "Replace dark zinc-950 background with warm editorial treatment... gradient from surface-canvas to surface-container-high... no pure black backgrounds"

**Animation plan says:** The ScrollAnimation component uses a full-viewport `bg-zinc-950` overlay that fades in/out during scroll. This is intentional — it creates a cinematic "theater mode" for the frame sequence (Apple-style immersive scroll).

**Recommendation:** Keep the dark background for the scroll animation. The warmth comes from the easing/timing, not from making every background cream. The contrast is what makes it feel cinematic. The text overlays should use Newsreader, and the overall timing should be editorial, but the dark canvas is functionally necessary for the image sequence readability.

**Severity:** HIGH — changing this to warm cream would break the visual impact of the scroll animation and make frame images hard to see.

### Issue 10: Homepage sections missing animation specs

**Location:** Sections 2.4, 2.5, 2.6 (new sections: AI Connection, Testimonial, Neighborhoods Mosaic)

These are NEW page sections not in the current codebase. The animation plan doesn't cover them because they don't exist yet. They will need:

- **AI Connection (2.4):** whileInView reveal with stagger between left/right columns, 300ms, `--ease-warm`.
- **Testimonial (2.5):** Fade in on scroll, quote text could have word-stagger for editorial feel. Avatar subtle scale-in.
- **Neighborhoods Mosaic (2.6):** Staggered tile reveal, 100ms between tiles, `translateY(30px→0)`. Tiles should animate in reading order (left-to-right, top-to-bottom).

**Severity:** MEDIUM — these sections need animation specs before implementation. I can add them to `05-animation-plan.md`.

### Issue 11: Search page "no scroll-triggered animations" — confirmed correct

**Plan 03** doesn't mention scroll animations for search results. **Animation plan** explicitly says "no scroll-triggered animations" for search results (performance-critical). Both aligned.

### Issue 12: Page transition system not mentioned

**Plan 03** describes page-level redesigns but doesn't mention the route-change transition system (fade + translateY) proposed in the animation plan.

**Recommendation:** The animation plan's page transition system (Section 5) needs to be coordinated with the layout.tsx changes in plan 03. The `AnimatePresence` wrapper keyed by pathname would go in the root layout or in the page-level wrappers.

**Severity:** MEDIUM — implementation coordination needed.

---

## Plan 04: Mobile Responsive (mobile-responsive)

### Issue 13: Button press `scale(0.95)` vs animation plan `scale(0.98)`

**Location:** Section 10 (Button Press States)

**Plan 04 says:** `active:scale-95` (0.95) + `active:brightness-95`
**Animation plan says:** `scale(0.98)` at 100ms

0.95 is a 5% reduction — very noticeable. 0.98 is a 2% reduction — subtle. The editorial aesthetic calls for subtlety.

Also, `brightness-95` triggers a repaint (not compositor-only). `transform: scale()` is compositor-thread only.

**Recommendation:** Use `scale(0.97)` as compromise. Drop `brightness` for performance. For primary gradient buttons, `active:shadow-inner` is fine as a static state change (not animated).

**Severity:** MEDIUM — affects every button interaction on mobile.

### Issue 14: Nav overlay animation already aligned

**Plan 04** references "see animation plan" for entry/exit animations. I've already added the spec (stagger 50ms, 200ms ease-warm-out). Aligned.

### Issue 15: Bottom nav bar animation spec needed

**Plan 04** defines a new `BottomNavBar.tsx` component but doesn't specify its appear/disappear behavior on scroll.

**Recommendation:**
- On scroll down (content scrolling up): bottom nav slides down and hides (`translateY(100%)`, 200ms `--ease-warm`).
- On scroll up (content scrolling down): bottom nav slides back in (`translateY(0)`, 300ms `--ease-warm-out`).
- Never hide when at top of page.

This follows the same pattern as the existing navbar hide/show in ScrollAnimation.tsx.

**Severity:** MEDIUM — new component needs animation spec.

### Issue 16: Shimmer duration mismatch

**Plan 04** Section 9 says shimmer is `2s infinite linear`.
**Animation plan** says `1.5s infinite linear`.
**Plan 02** uses `animate-shimmer` which currently is `2s infinite linear` in globals.css.

**Recommendation:** Use 1.5s for the editorial shimmer — slightly faster feels more alive. But this is a minor preference.

**Severity:** LOW — 0.5s difference, visual preference.

### Issue 17: Connection Score badge animation covered

**Plan 04** defines the badge but doesn't specify animation. I've already added it to the animation plan per mobile-responsive's message: `scale(0.8→1)` spring on viewport entry. Aligned.

---

## Summary: Action Items by Severity

### HIGH
1. **Plan 01:** Add editorial easing curves and extended durations to `@theme` tokens (Issue 1)
2. **Plan 03:** Keep dark background for ScrollAnimation — do NOT warm-ify (Issue 9)

### MEDIUM
3. **Plan 02:** Fix card interactive lift distance (-translate-y-1 not -0.5) and add explicit duration (Issue 4)
4. **Plan 02:** Add notification badge animation change to NavbarClient spec (Issue 8)
5. **Plan 03:** Add animation specs for 3 new homepage sections (Issue 10)
6. **Plan 03:** Coordinate page transition AnimatePresence with layout (Issue 12)
7. **Plan 04:** Reduce button press scale to 0.97, drop brightness filter (Issue 13)
8. **Plan 04:** Add bottom nav bar scroll hide/show animation spec (Issue 15)

### LOW
9. **Plan 01:** Naming alignment for shadow hover tokens (Issue 2)
10. **Plan 01:** Add stagger timing tokens to @theme (Issue 3)
11. **Plan 02:** Mark ScrollAnimation as needing visual updates (Issue 6)
12. **Plan 02/04:** Align dialog backdrop opacity (40% vs 60%) (Issue 5)
13. **Plan 04:** Align shimmer duration (1.5s vs 2s) (Issue 16)
