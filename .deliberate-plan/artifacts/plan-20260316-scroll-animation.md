# Deliberate Plan: Scroll-Driven Video Animation for Roomshare Homepage

**Task Type**: IMPLEMENT
**Date**: 2026-03-16
**Confidence Score**: 4.4/5.0 (HIGH)
**Verdict**: CONDITIONAL PASS

---

## Executive Summary

Implement an Apple-style scroll-driven animation on the Roomshare homepage using the existing video (`Person_opening_door_going_inside_delpmaspu_.mp4`, 8.6MB H.264). The animation shows a person entering a house — as the user scrolls, they experience "walking through the door." Placed between the Features section and CTA section in `HomeClient.tsx`.

**Recommended approach**: Canvas frame sequence + Framer Motion `useScroll`/`useTransform` (already installed, MIT license, hardware-accelerated). No new dependencies required.

---

## Confidence Score

| Dimension | Weight | Score | Justification |
|-----------|--------|-------|---------------|
| Research Grounding | 15% | 5 | 6 approaches compared, Apple technique well-documented |
| Codebase Accuracy | 25% | 5 | All file paths verified, CustomScrollContainer constraint identified |
| Assumption Freedom | 20% | 4 | Video metadata partially inferred (no ffprobe), duration/fps unknown |
| Completeness | 15% | 4 | All steps present, rollback trivial (additive change) |
| Harsh Critic Verdict | 15% | 4 | Conditional pass — CustomScrollContainer scroll target is a risk |
| Specificity | 10% | 4 | Each step has exact file paths and code locations |

**Overall: 4.4/5.0 — HIGH. Execute with extra review at the CustomScrollContainer integration step.**

---

## Research Foundation

### Approach Comparison Matrix

| Approach | Payload | Mobile Safari | Smoothness | Complexity | New Deps |
|----------|---------|---------------|------------|------------|----------|
| **Canvas + Framer Motion useScroll** | ~3-5MB (WebP frames) | Excellent | Excellent | Moderate | None |
| Canvas + GSAP ScrollTrigger | ~3-5MB (WebP frames) | Good | Excellent | Moderate | gsap (~28KB) |
| Native video.currentTime | 8.6MB (single MP4) | Poor | Choppy | Low | None |
| WebCodecs scroll sync | 8.6MB (single MP4) | Partial | Good | High | None |
| CSS scroll-timeline | N/A | Safari 26+ only | Best | Low | None |

### Decision: Canvas Frame Sequence + Framer Motion

**Why Framer Motion over GSAP:**
- Already installed (`framer-motion ^12.23.25`) — zero new dependencies
- `useScroll()` + `useTransform()` provide hardware-accelerated scroll tracking
- Uses MotionValues (no React re-renders during scroll)
- MIT license vs GSAP's Webflow ownership
- Consistent with existing codebase patterns

**Why NOT native video scrubbing:**
- 250-500ms seeking latency on `video.currentTime`
- iOS Safari seeking is terrible — stutters and autoplay restrictions
- Reverse scrolling is especially janky
- Apple, Samsung, and every premium site moved to frame sequences for this reason

---

## Critical Codebase Constraint: CustomScrollContainer

**The page does NOT scroll on `window`.** It scrolls inside a `CustomScrollContainer` `<div>` with `overflow-y: auto` and `h-screen` (file: `src/components/ui/CustomScrollContainer.tsx`).

This means:
- `window.scrollY` is always 0
- Framer Motion's `useScroll()` defaults to `window` — will NOT work without configuration
- **Must pass the scroll container ref** to `useScroll({ container: scrollContainerRef })`
- OR use `useScroll({ target: sectionRef, offset: ["start end", "end start"] })` which uses IntersectionObserver (works regardless of scroll container)

**Recommendation**: Use `useScroll({ target: sectionRef })` — this tracks the section's visibility progress relative to the viewport, which works correctly inside any scroll container.

---

## Implementation Plan

### Phase 0: Video → Frame Extraction Pipeline (Pre-requisite, local)

**Goal**: Extract optimized WebP frames from the MP4 video.

**Step 0.1**: Install ffmpeg (if not already available)
```bash
# WSL/Ubuntu
sudo apt install ffmpeg
# OR download from ffmpeg.org
```

**Step 0.2**: Probe the video for metadata
```bash
ffprobe -v quiet -print_format json -show_streams \
  public/Person_opening_door_going_inside_delpmaspu_.mp4
# Need: duration, fps, resolution
```

**Step 0.3**: Extract frames as WebP
```bash
mkdir -p public/scroll-frames

# Extract every 2nd frame, scale to 1200px wide, WebP quality 80
ffmpeg -i public/Person_opening_door_going_inside_delpmaspu_.mp4 \
  -vf "select=not(mod(n\,2)),scale=1200:-1" \
  -vsync vfr -quality 80 \
  public/scroll-frames/frame_%04d.webp

# Count frames
ls public/scroll-frames/*.webp | wc -l
```

**Step 0.4**: Create responsive tiers
```bash
# Mobile (600px wide, every 4th frame from original = every 2nd from step 0.3)
mkdir -p public/scroll-frames/mobile
for f in public/scroll-frames/frame_*[02468].webp; do
  ffmpeg -i "$f" -vf "scale=600:-1" -quality 75 \
    "public/scroll-frames/mobile/$(basename $f)"
done

# Desktop frames are the 1200px from step 0.3 (already done)
```

**Step 0.5**: Measure total payload
```bash
du -sh public/scroll-frames/
du -sh public/scroll-frames/mobile/
```

**Target**: < 4MB desktop, < 1.5MB mobile. If over, increase frame skip rate or reduce quality.

**Step 0.6**: Generate a frame manifest
```bash
# Create a JSON manifest for the component
node -e "
const fs = require('fs');
const frames = fs.readdirSync('public/scroll-frames')
  .filter(f => f.endsWith('.webp') && !f.includes('mobile'))
  .sort();
const mobile = fs.readdirSync('public/scroll-frames/mobile')
  .filter(f => f.endsWith('.webp'))
  .sort();
fs.writeFileSync('public/scroll-frames/manifest.json', JSON.stringify({
  desktop: { count: frames.length, path: '/scroll-frames/', files: frames },
  mobile: { count: mobile.length, path: '/scroll-frames/mobile/', files: mobile }
}, null, 2));
console.log('Desktop frames:', frames.length, 'Mobile frames:', mobile.length);
"
```

---

### Phase 1: ScrollAnimation Component

**File to create**: `src/components/ScrollAnimation.tsx` (client component)

**Architecture**:
```
ScrollAnimation (client, dynamically imported)
├── useScroll({ target: sectionRef }) → scrollYProgress MotionValue
├── useTransform(scrollYProgress, [0, 1], [0, frameCount-1]) → frameIndex
├── useMotionValueEvent(frameIndex, "change", drawFrame)
├── <canvas> element (renders current frame)
├── Preloader (shows loading progress)
├── Text overlays with scroll-driven opacity (Framer Motion)
└── Reduced motion fallback (static image)
```

**Key implementation details**:

1. **Frame preloading**: Use `Image()` constructor to preload all frames into an array. Show a loading indicator until critical frames (every 10th) are loaded.

2. **Canvas rendering**: On each `frameIndex` change, draw the corresponding preloaded image onto the canvas using `ctx.drawImage()`. Use `requestAnimationFrame` for smooth rendering.

3. **Responsive frame selection**: Use `window.matchMedia('(max-width: 768px)')` to choose mobile vs desktop frame set.

4. **Scroll configuration**:
```tsx
const sectionRef = useRef<HTMLDivElement>(null);
const { scrollYProgress } = useScroll({
  target: sectionRef,
  offset: ["start end", "end start"]  // 0 when section enters viewport, 1 when it leaves
});
const frameIndex = useTransform(scrollYProgress, [0.1, 0.9], [0, frameCount - 1]);
```

5. **Sticky positioning**: The canvas wrapper uses `position: sticky; top: 0` inside a tall scroll container (300-500vh) to create the "pinned while scrolling" effect.

6. **Text overlays**: Fade in/out based on scroll progress using `useTransform` for opacity.

7. **Reduced motion**: Check `prefers-reduced-motion` → show a single static frame (the middle or end frame).

8. **Dark/light theme**: The animation content is the video itself (no background dependency). Add a subtle `mix-blend-mode` or overlay that adapts:
   - Light mode: no overlay (video is already well-lit)
   - Dark mode: subtle dark vignette border (`radial-gradient(ellipse, transparent 60%, var(--bg) 100%)`) to blend edges

---

### Phase 2: Homepage Integration

**File to modify**: `src/app/HomeClient.tsx`

**Insertion point**: Between Features section (line 147) and CTA section (line 149).

```tsx
// Line 147: </section> (end of Features)

{/* Scroll Animation Section */}
<ScrollAnimationSection />

// Line 149: <section> (CTA)
```

**Dynamic import** (in `HomeClient.tsx` or `page.tsx`):
```tsx
import dynamic from 'next/dynamic';
const ScrollAnimationSection = dynamic(
  () => import('@/components/ScrollAnimation'),
  { ssr: false, loading: () => <ScrollAnimationFallback /> }
);
```

**Fallback component**: A static image (middle frame) with the same dimensions, so the page doesn't jump during load.

---

### Phase 3: Text Overlay Content

**Narrative arc tied to scroll progress**:

| Scroll % | Visual | Text Overlay |
|-----------|--------|--------------|
| 0-10% | Person at door | — (no text, pure visual) |
| 20-35% | Approaching door | "Find your space." |
| 40-55% | Door opening | "Feel at home." |
| 60-75% | Stepping inside | "Love where you live." |
| 80-100% | Inside the room | CTA: "Start your search →" |

Each text element uses `useTransform(scrollYProgress, [startRange, endRange], [0, 1])` for opacity, creating smooth fade-in/fade-out transitions.

**Typography**: Match existing brand — Inter font, `text-3xl md:text-5xl font-medium tracking-tight`, white text with subtle text-shadow for readability over the video.

---

### Phase 4: Performance Optimization

1. **Lazy preloading**: Start loading frames when the section is 200px from the viewport (IntersectionObserver), not on page load.

2. **Progressive loading**: Load every 10th frame first (instant interactivity), then fill in between frames.

3. **Memory management**: On mobile, release desktop frames. Use `ImageBitmap` instead of `HTMLImageElement` for faster `drawImage()`.

4. **Canvas resolution**: Match `devicePixelRatio` for sharp rendering on Retina:
```tsx
canvas.width = canvas.clientWidth * window.devicePixelRatio;
canvas.height = canvas.clientHeight * window.devicePixelRatio;
ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
```

5. **Bundle impact**: Zero new dependencies. The component is ~2-3KB of JS. The frame images are the payload (~3-5MB desktop, ~1.5MB mobile), loaded lazily.

---

### Phase 5: Accessibility & Reduced Motion

1. **`prefers-reduced-motion: reduce`**: Show a single static image (the end frame — person inside the room). No animation.

2. **`aria-label`**: The section gets `aria-label="Scroll animation showing a person entering their new home"`.

3. **`role="img"`**: The canvas acts as a decorative image, not interactive content.

4. **Fallback for no-JS**: `<noscript>` block with a static `<img>` of the end frame.

5. **Skip link**: Not needed — the section is decorative, not blocking content flow.

---

## Dependency Graph

```
Phase 0 (frame extraction) ← requires ffmpeg installation
    ↓
Phase 1 (component) ← requires frame files in public/
    ↓
Phase 2 (integration) ← requires component
    ↓
Phase 3 (text overlays) ← requires integration working
    ↓
Phase 4 (optimization) ← requires baseline working
    ↓
Phase 5 (a11y) ← can be done in parallel with Phase 4
```

---

## Test Strategy

1. **Visual testing**: Open homepage, scroll through animation, verify smooth playback in Chrome, Firefox, Safari, Mobile Safari.

2. **Performance**: Lighthouse audit before/after — LCP should not regress (frames are lazy-loaded).

3. **Reduced motion**: Toggle `prefers-reduced-motion` in DevTools → verify static fallback.

4. **Dark/light mode**: Toggle theme → verify animation looks good in both.

5. **Mobile**: Test on real iOS device or BrowserStack — verify touch scrolling is smooth.

6. **CustomScrollContainer**: Verify scroll tracking works correctly inside the custom container.

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| CustomScrollContainer breaks useScroll | 🟠 MAJOR | Use `target` mode (IntersectionObserver-based), not `container` mode. Test early. |
| Frame payload too large (>5MB) | 🟡 MINOR | Reduce frame count, lower quality, serve mobile tier. Progressive loading masks perceived size. |
| iOS Safari scroll jank | 🟡 MINOR | Canvas frame approach is the most reliable on iOS. Use `will-change: transform` on sticky container. |
| Video has unexpected aspect ratio | 🟡 MINOR | Use `object-fit: cover` equivalent on canvas (center-crop). |
| ffmpeg not available in CI | ⚪ NIT | Frame extraction is a one-time local step. Commit extracted frames to repo (or host on CDN). |

---

## Harsh Critic Report

**Verdict: CONDITIONAL PASS**

- **No BLOCKERS**
- 🟠 **MAJOR**: The CustomScrollContainer scrolls content in a `div`, not on `window`. Framer Motion's `useScroll` must be configured correctly. **Mitigated by**: using `target` ref mode which uses IntersectionObserver and works in any scroll context. Must be tested early (Phase 2, step 1).
- 🟡 **MINOR**: No ffprobe available to confirm video duration/fps/resolution. Plan assumes ~5-10s at 24-30fps (~120-300 raw frames). **Mitigated by**: Step 0.2 explicitly probes the video before extraction.
- 🟡 **MINOR**: Committing ~100+ WebP frames to git bloats the repo. **Mitigated by**: Add to `.gitignore` if desired and serve from CDN, OR accept the tradeoff for simplicity (they're small WebP files).
- ⚪ **NIT**: The `position: sticky` inside the tall container may need `z-index` management to avoid overlapping with the navbar.

---

## Rollback Plan

This is a **purely additive change** — no existing code is modified, only:
1. New component file (`ScrollAnimation.tsx`)
2. One insertion point in `HomeClient.tsx`
3. New frame files in `public/scroll-frames/`

**Rollback**: Remove the `<ScrollAnimationSection />` line from `HomeClient.tsx`. Delete `ScrollAnimation.tsx` and `public/scroll-frames/`. Zero impact on existing functionality.

---

## Open Questions

1. **Video duration and FPS**: Need to run `ffprobe` to determine exact frame count. This affects the extraction pipeline parameters.
2. **Scroll height multiplier**: How long should the scroll region be? 300vh (quick) vs 500vh (luxurious) vs 600vh (like the prototype)? User preference needed.
3. **Text overlays**: Should the text match the existing brand copy ("Love where you live.") or be new copy specific to this animation?
4. **Frame hosting**: Commit to git repo or host on CDN? For initial implementation, committing is simpler. Can migrate to CDN later if repo size is a concern.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/ScrollAnimation.tsx` | CREATE | Main scroll animation component |
| `src/app/HomeClient.tsx` | MODIFY | Add dynamic import + insertion between Features and CTA |
| `public/scroll-frames/*.webp` | CREATE | Extracted video frames (desktop) |
| `public/scroll-frames/mobile/*.webp` | CREATE | Extracted video frames (mobile) |
| `public/scroll-frames/manifest.json` | CREATE | Frame count and path manifest |
| `scripts/extract-frames.sh` | CREATE | Frame extraction pipeline script |
