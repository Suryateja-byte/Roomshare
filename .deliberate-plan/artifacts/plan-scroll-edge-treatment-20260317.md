# Plan: Scroll Animation Edge Treatment — Light/Dark Theme

**Confidence: 4.8/5.0** | **Task: FIX**

## Problem

The scroll animation section (dark canvas, `bg-zinc-950`) sits inside a white-background page. With gradient edges removed, there's a harsh dark-to-white boundary that looks like a misplaced box. The user screenshot shows this jarring contrast.

## Research Findings

**How Apple handles this**: Apple's AirPods Pro page makes the ENTIRE page background transition to dark when the animation section enters the viewport. The page itself becomes the dark canvas — there's no "dark box within white page" problem because the surrounding area is also dark.

**Best approach for this codebase**: Change the page background to dark (`bg-zinc-950`) when the ScrollAnimation section is in the active viewport zone. Use the existing `scrollYProgress` value (already tracked) to drive a background color transition on the parent container. This eliminates the "dark box" problem entirely — the whole viewport goes dark for the cinematic section.

## Design

### Approach: Full-bleed dark background during animation

When the scroll animation section enters the viewport, the page background smoothly transitions from white to `zinc-950` (dark). When the user scrolls past, it transitions back. This is the Apple technique.

**Implementation**:
1. The `ScrollAnimation` component already tracks `scrollYProgress` (0→1 as section scrolls through)
2. Use `useTransform` to map scroll progress to a background color
3. Apply this color to the parent wrapper OR use a full-screen fixed background layer behind the canvas
4. The transition zones: fade to dark as section approaches (0→0.05), stay dark during animation (0.05→0.95), fade back as leaving (0.95→1.0)

### Exact approach chosen: CSS background on a pseudo-layer

Rather than manipulating parent DOM elements, add a `position: fixed` full-screen background layer INSIDE the ScrollAnimation component that:
- Starts transparent (section not in view)
- Transitions to `bg-zinc-950` as the section enters
- Returns to transparent as the section exits

This layer sits BEHIND the sticky canvas (lower z-index) but ABOVE the page content, creating the effect of the page going dark. The sticky canvas itself already has `bg-zinc-950`, so they merge seamlessly.

## Files Changed

1. `src/components/ScrollAnimation.tsx` — Add full-bleed background layer driven by scroll progress

## Exact Change

In the component, add a new `useTransform` for background opacity, and render a fixed full-screen overlay behind the canvas:

```tsx
// After existing useTransform declarations, add:
const bgOpacity = useTransform(scrollYProgress, [0, 0.08, 0.92, 1], [0, 1, 1, 0]);

// In the JSX, before the sticky container, add:
<m.div
  style={{ opacity: bgOpacity }}
  className="fixed inset-0 bg-zinc-950 pointer-events-none z-0"
  aria-hidden="true"
/>
```

This fixed overlay:
- Fades in as the section enters (0→0.08 scroll progress = first ~1.5vh of the 400vh section)
- Stays fully opaque during the entire animation
- Fades out as the section exits (0.92→1.0)
- `pointer-events-none` ensures it doesn't block interaction
- `aria-hidden` keeps it invisible to screen readers
- `z-0` puts it behind the sticky canvas (`z-10` on gradients, etc.)

The sticky canvas container already has `bg-zinc-950`, so when the overlay is visible, the entire viewport is dark — no edges visible.

## Risk Analysis

| Risk | Mitigation |
|------|-----------|
| Overlay covers navbar | Navbar is `z-dropdown` (much higher). Not affected. |
| Overlay visible on other pages | Only rendered inside ScrollAnimation component. When component is off-screen, opacity is 0. |
| Dark flash on page load | `scrollYProgress` starts at 0, `bgOpacity` maps 0→0, overlay starts transparent. |
| Performance | Single opacity animation on a fixed element — GPU-composited, near-zero cost. |
| Dark mode: already dark, overlay redundant | In dark mode the page is already zinc-950. A zinc-950 overlay on zinc-950 is invisible. No harm. |
