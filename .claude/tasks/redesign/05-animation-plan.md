# 05 — Animation, Transitions & Micro-Interactions Plan

**Aesthetic:** The Editorial Living Room — warm, intentional, never flashy.
**Philosophy:** "Luxury magazine page turn" not "tech startup bounce." Every motion is a gentle invitation, not a demand for attention.

---

## Section 1: Current Animation Audit

### Animation Libraries in Use

| Library | Version | Usage |
|---------|---------|-------|
| framer-motion | ^12.38.0 | Primary animation library — LazyMotion, m components, AnimatePresence, useScroll, useTransform |
| GSAP | Not installed | Not in codebase |
| Lenis | Not installed | Not in codebase |

### Current Animation Inventory

| File | Animation Type | Current Implementation | Theme-Dependent? |
|------|---------------|----------------------|-------------------|
| **globals.css** | fadeUp keyframe | `translateY(20px)→0, opacity 0→1`, 0.8s cubic-bezier(0.16,1,0.3,1) | No |
| **globals.css** | slideDown keyframe | `translateY(-10px)→0, opacity 0→1`, 0.3s ease-out | No |
| **globals.css** | shake keyframe | `translateX ±4px/3px`, 0.4s ease-in-out | No |
| **globals.css** | shimmer keyframe | `background-position 200%→-200%`, 2s infinite linear | No |
| **globals.css** | heart-bounce keyframe | `scale 1→1.3→0.95→1.15→1.1`, 0.4s ease-out | No |
| **globals.css** | pulse-ring keyframe | `scale 1→1.2→1, opacity 0.3→0.15→0.3`, map pins | No |
| **globals.css** | Transition tokens | `--transition-fast: 150ms`, `--transition-base: 200ms`, `--transition-slow: 300ms`, all `ease` | No |
| **globals.css** | Motion duration utilities | `.duration-fast` 150ms, `.duration-normal` 200ms, `.duration-slow` 300ms | No |
| **globals.css** | Reduced motion | Global `prefers-reduced-motion: reduce` kills all animations/transitions to 0.01ms | No |
| **globals.css** | Glassmorphism | `.glass-nav` (blur 8px), `.glass` (blur 12px), `.glass-card` (blur 16px) | Yes (light/dark bg colors) |
| **globals.css** | shadow-card-hover | `box-shadow: 0 10px 40px -10px rgba(0,0,0,0.15)` | Yes (dark: 0.5 opacity) |
| **HomeClient.tsx** | fadeInUp variant | `opacity 0→1, y 10→0`, 0.5s cubic-bezier(0.16,1,0.3,1) | No |
| **HomeClient.tsx** | staggerContainer | `staggerChildren: 0.05`, children use fadeInUp | No |
| **HomeClient.tsx** | Hero image reveal | `opacity 0→1, y 40→0`, 0.8s delay 0.2s, cubic-bezier(0.16,1,0.3,1) | No |
| **HomeClient.tsx** | Features section | whileInView fadeInUp with stagger, viewport margin -100px | No |
| **HomeClient.tsx** | CTA section | `opacity 0→1, y 20→0`, 0.6s cubic-bezier(0.16,1,0.3,1) whileInView | No |
| **HomeClient.tsx** | Arrow hover | `group-hover:translate-x-1 transition-transform` | No |
| **HomeClient.tsx** | Feature card icon | `transition-colors group-hover:bg-indigo-50` | Yes (dark variants) |
| **ScrollAnimation.tsx** | Frame sequence | Canvas-based scroll-linked animation, 96 desktop / 64 mobile frames | No |
| **ScrollAnimation.tsx** | Text overlays | 3 phrases fade in/out via useTransform tied to scrollYProgress | No |
| **ScrollAnimation.tsx** | Background dim | Full-viewport dark overlay fades in/out during scroll | No |
| **ScrollAnimation.tsx** | Scroll hint | Bounce animation on dot, opacity fades with scroll | No |
| **ScrollAnimation.tsx** | Canvas reveal | `transition-opacity duration-500` on ready state | No |
| **ScrollAnimation.tsx** | Loading progress | SVG circle strokeDasharray animates with progress | No |
| **FeaturedListingsClient.tsx** | fadeInUp + stagger | Same variants as HomeClient, whileInView with margin -100px | No |
| **FeaturedListingsClient.tsx** | Mobile CTA | `opacity 0→1, y 10→0`, delay 0.2 | No |
| **FeaturedListingsClient.tsx** | Arrow hover | `group-hover:translate-x-1 transition-transform` | No |
| **MobileBottomSheet.tsx** | Sheet drag | framer-motion `m.div` with spring physics (stiffness 400, damping 30, mass 0.8) | No |
| **MobileBottomSheet.tsx** | Rubber-band overscroll | Custom dampened touch handling | No |
| **FloatingMapButton.tsx** | Button swap | AnimatePresence mode="wait", `scale 0.9→1, opacity 0→1`, spring stiffness 500 damping 30 | No |
| **FloatingMapButton.tsx** | Active press | `active:scale-95 transition-all` via Tailwind | No |
| **MobileSearchOverlay.tsx** | Slide up | `y: "100%"→0`, spring stiffness 400, damping 35 | No |
| **PullToRefresh.tsx** | Pull indicator | `opacity 0→1`, height animates with pull distance | No |
| **PullToRefresh.tsx** | Arrow rotation | `rotate 0→180` at threshold, 0.2s | No |
| **PullToRefresh.tsx** | Spinner | `animate-spin` on Loader2 icon | No |
| **NeighborhoodChat.tsx** | Message animation | framer-motion AnimatePresence for chat messages | No |
| **FavoriteButton.tsx** | Heart bounce | `animate-heart-bounce` class (0.4s), `scale-100→scale-110`, `transition-all duration-300` | No (color is red-500) |
| **SaveListingButton.tsx** | Heart fill | `transition-colors`, `transition-all` | No (color is red-500) |
| **SaveListingButton.tsx** | Loading spinner | `animate-spin` | No |
| **ListingCard.tsx** | Card hover | `transition-all duration-500 ease-out`, `group-hover:shadow-2xl`, `group-hover:border-zinc-300` | Yes (dark shadow/border) |
| **ListingCard.tsx** | Image zoom | `group-hover:scale-110 transition-transform duration-[2s] ease-out` | No |
| **ListingCard.tsx** | Gradient overlay | `opacity-0 group-hover:opacity-100 transition-opacity duration-500` | No |
| **ListingCardSkeleton.tsx** | Pulse + shimmer | `animate-pulse` on container, `animate-shimmer` gradient sweep | No |
| **ImageGallery.tsx** | Image hover | `group-hover/item:scale-[1.03]`, `duration-slow`, cubic-bezier(0.25,0.1,0.25,1) | No |
| **ImageGallery.tsx** | Overlay fade | `transition-colors duration-500 ease-out` on hover | No |
| **ImageCarousel.tsx** | Nav buttons + dots | `transition-all duration-200` | No |
| **Map.tsx** | Marker appear | `animate-[fadeIn_200ms_ease-out] motion-reduce:animate-none` | No |
| **Map.tsx** | Marker hover | `transition-all duration-200 cubic-bezier(0.34,1.56,0.64,1)`, `scale-[1.15]` | No |
| **Map.tsx** | Pulse ring | `animate-ping opacity-40` (hovered), `animate-[pulse-ring_2s] opacity-30` (active) | No |
| **MapGestureHint.tsx** | Fade in | `animate-[fadeIn_300ms_ease-out]` | No |
| **MapMovedBanner.tsx** | Loading spinner | `animate-spin` on Loader2 | No |
| **PersistentMapWrapper.tsx** | Progress bar shimmer | Inline `@keyframes shimmer`, translateX -100%→200%, with reduced-motion handling | No |
| **NavbarClient.tsx** | Notification badge | `animate-ping` on unread dot | No |
| **NotificationCenter.tsx** | Dropdown appear | `animate-in fade-in zoom-in-95 duration-200` | No |
| **ProfileCompletionBanner.tsx** | Progress bar | `transition-all duration-500` on width | No |
| **CategoryBar.tsx** | Tab underline | `transition-all duration-200` on border-b-2 active state | No |
| **CategoryBar.tsx** | Scroll arrows | `transition-shadow` on hover | No |
| **button.tsx** | Press scale | `active:scale-[0.98]`, `transition-all duration-200` | No |
| **input.tsx** | Focus ring | `transition-all duration-200`, border/ring changes on focus | Yes (dark border colors) |
| **dialog.tsx** | Overlay | `animate-in fade-in-0 / animate-out fade-out-0` (Radix) | No |
| **dialog.tsx** | Content | `zoom-in-95 / zoom-out-95 + slide-in/out-from-top-[48%]`, duration-200 | No |
| **alert-dialog.tsx** | Same as dialog | Radix animate-in/out with fade and zoom | No |
| **dropdown-menu.tsx** | Content appear | Radix animate-in/out with fade, zoom, slide | No |
| **dropdown-menu.tsx** | Item hover | `transition-colors` on focus | No |
| **Skeleton.tsx** | Pulse/shimmer | `animate-pulse` or `animate-shimmer` (gradient sweep) | Yes (zinc-200/100 colors) |
| **nearby-map.css** | Marker highlight | `.poi-marker.highlighted > div { transform: scale(1.25) }` (no transition) | No |
| **Providers.tsx** | MotionConfig | `reducedMotion="user"` wraps entire app — delegates to OS preference | N/A |

---

## Section 2: Animation Design Tokens

New CSS custom properties to replace current `ease` easing with warm editorial curves:

```css
:root {
  /* --- Editorial Easing Curves --- */
  --ease-warm:       cubic-bezier(0.25, 0.1, 0.25, 1.0);   /* gentle ease-out-ish */
  --ease-warm-in:    cubic-bezier(0.55, 0, 1, 0.45);        /* entering elements */
  --ease-warm-out:   cubic-bezier(0, 0.55, 0.45, 1);        /* exiting elements */
  --ease-editorial:  cubic-bezier(0.16, 1, 0.3, 1);         /* existing hero curve — keep */
  --ease-bounce:     cubic-bezier(0.34, 1.56, 0.64, 1);     /* existing marker bounce — keep */

  /* --- Editorial Durations --- */
  --duration-instant: 100ms;
  --duration-fast:    150ms;
  --duration-base:    300ms;    /* was 200ms — slightly longer for warmth */
  --duration-slow:    500ms;
  --duration-reveal:  800ms;
  --duration-cinematic: 1200ms; /* hero image, scroll animation canvas */

  /* --- Stagger Delays --- */
  --stagger-tight:  50ms;   /* hero text items */
  --stagger-normal: 100ms;  /* card grids, sibling reveals */
  --stagger-wide:   150ms;  /* section-level reveals */

  /* --- Ambient Shadow (tinted charcoal, dual-layer — aligned to plan 01 token names) --- */
  /* --shadow-ambient:    defined in plan 01 @theme */
  /* --shadow-ambient-lg: defined in plan 01 @theme (use for hover states) */
  --shadow-ambient-deep:  0 16px 80px rgb(27 28 25 / 0.08), 0 6px 24px rgb(27 28 25 / 0.04);
  /* ↑ NEW token — design-tokens-architect adding to plan 01 */

  /* --- Replaces current --transition-* tokens --- */
  --transition-fast:  var(--duration-fast) var(--ease-warm);
  --transition-base:  var(--duration-base) var(--ease-warm);
  --transition-slow:  var(--duration-slow) var(--ease-warm);
}
```

**Migration notes:**
- Current `--transition-fast/base/slow` use `ease` (CSS default). Replace with `--ease-warm` for intentional warmth.
- Current base duration is 200ms. Increase to 300ms for editorial pacing.
- The `cubic-bezier(0.16, 1, 0.3, 1)` in HomeClient is excellent — keep as `--ease-editorial`.

---

## Section 3: Hero Animations

### Current State
- Hero uses framer-motion `fadeInUp` variant: `y: 10→0, opacity: 0→1`, 0.5s with `cubic-bezier(0.16,1,0.3,1)`.
- Stagger: 0.05s between children.
- Showcase image: `y: 40→0, opacity: 0→1`, 0.8s, 0.2s delay.

### Editorial Redesign

**Text Reveal:**
- Replace simple fade with character-level stagger on the Newsreader headline.
- Implementation: GSAP SplitText (requires adding `gsap` + `@gsap/SplitText` or manual span wrapping).
- If no GSAP: manually wrap each word in `<span>` with framer-motion stagger.
- Timing: `--ease-editorial`, 50ms stagger between words, 800ms total sequence.
- Each word: `opacity 0→1, y 12→0` with warm easing.

**Search Bar Reveal:**
- Fade up from 20px below: `opacity 0→1, translateY(20px)→0`.
- Duration: `--duration-base` (300ms).
- Delay: 300ms after headline finishes (total ~1100ms from page load).
- Use framer-motion `m.div` with `initial={{ opacity: 0, y: 20 }}`.

**Background:**
- Subtle warm gradient shift on the surface canvas: `#fbf9f4` to slightly warmer `#f7f3ec` over 3s.
- CSS `@keyframes warm-ambient` with `background-color` transition.
- Infinite, very subtle, barely noticeable — "breathing" feel.
- Disable entirely with `prefers-reduced-motion`.

**Badge ("Now in 12 cities"):**
- Keep current approach but slow stagger to `--stagger-tight` (50ms) for more deliberate reveal.

---

## Section 4: Card Interactions

### Current State
- ListingCard: `transition-all duration-500 ease-out`, `group-hover:shadow-2xl`, image `group-hover:scale-110 duration-[2s]`.
- No translateY lift on hover.

### Editorial Redesign

**Hover:**
- Subtle lift: `translateY(-4px)` on hover.
- Shadow deepens: `--shadow-ambient` → `--shadow-ambient-lg` (40px→60px blur, 4%→6% opacity).
- Duration: `--duration-base` (300ms) with `--ease-warm`.
- Remove the current `duration-500` and `duration-[2s]` — too slow/fast respectively.

**Image Hover:**
- Scale from `scale(1)` to `scale(1.02)` (currently 1.10 — far too aggressive).
- Duration: `--duration-slow` (500ms) with `--ease-warm`.
- `overflow: hidden` on image container (already present).

**Click/Press:**
- `scale(0.98)` on active state (already implemented in button.tsx).
- Duration: `--duration-instant` (100ms).
- Apply to cards via `.group:active .card-inner { transform: scale(0.98); }`.

**Gradient Overlay on Hover:**
- Current: `from-black/40` fading in. Replace with warm tint: `from-[#9a4027]/15 via-transparent to-transparent`.
- Opacity: `0→1`, duration `--duration-base`.

**Favorite Button:**
- Keep `heart-bounce` keyframe.
- Change heart fill color from `red-500` to primary `#9a4027` for editorial warmth.
- Add subtle primary color glow pulse: `box-shadow: 0 0 0 0 rgba(154, 64, 39, 0.4)` expanding to `0 0 0 8px rgba(154, 64, 39, 0)`.

---

## Section 5: Page Transitions

### Current State
- No explicit page transition system.
- React `useTransition` via `SearchTransitionContext` for search navigations (keeps old UI visible during load).
- No route-change animations.

### Editorial Redesign

**Route Change (Next.js App Router):**
- Wrap page content in a framer-motion `AnimatePresence` + `m.div` keyed by pathname.
- **Placement:** Inside `MainLayout` component (which wraps `{children}` in layout.tsx). NOT around the entire layout — navbar, footer, banners should NOT animate on route change. Layout hierarchy per pages plan: `NavbarWrapper > EmailVerificationWrapper > SuspensionBannerWrapper > MainLayout > [AnimatePresence here] > {children}`.
- Exit: `opacity 1→0`, `translateY(0→10px)`, duration 200ms `--ease-warm-in`.
- Enter: `opacity 0→1`, `translateY(10px→0)`, duration 300ms `--ease-warm-out`.
- **Important:** Surface canvas color `#fbf9f4` must persist as `body` background during transition — no white flash.

**Loading Progress Bar:**
- Thin (2px) progress bar at top of viewport.
- Gradient: `primary (#9a4027) → primary_container (#b9583c)`.
- Appears after 200ms delay (avoid flash on fast navigations).
- Animate width `0%→80%` with `--ease-warm`, then jump to `100%` on complete.
- Fade out over 300ms.

**Search Transitions:**
- Already handled by SearchTransitionContext. Keep existing React.useTransition approach.
- Add a subtle opacity reduction (0.7) on stale content during transition.

---

## Section 6: Scroll Animations

### Current State
- `ScrollAnimation.tsx`: Full scroll-linked canvas frame sequence with text overlays, dark bg, navbar hide. Very complex, well-built.
- `HomeClient.tsx`: `whileInView` with fadeInUp variants on features/CTA sections.
- `FeaturedListingsClient.tsx`: Same whileInView approach.

### Editorial Redesign

**Section Reveals:**
- Use IntersectionObserver-triggered framer-motion animations (already in place).
- Standardize: `translateY(30px→0)`, `opacity 0→1`, duration `--duration-base` (300ms).
- Stagger between siblings: `--stagger-normal` (100ms).
- Viewport threshold: `margin: "-80px"` (trigger slightly before visible).
- Replace current `y: 10` with `y: 30` for more editorial "rising into place" feel.

**NEW Homepage Sections (from pages plan):**

*AI Connection Section (asymmetric 60/40 split):*
- Left column: whileInView reveal, `translateY(30px→0), opacity 0→1`, 300ms `--ease-warm`.
- Right column: same animation with 150ms delay (stagger between columns).
- Accent block: subtle `scale(0.95→1)` on reveal for editorial impact.

*Testimonial Section (gradient background):*
- Quote text: `opacity 0→1, scale(0.98→1)`, 500ms `--ease-warm`.
- Optional: word-by-word stagger on the Newsreader italic quote (50ms per word) for extra editorial feel.
- Avatar: `opacity 0→1, scale(0.9→1)` with spring (stiffness: 400, damping: 25), 200ms delay after quote.
- Attribution: simple `opacity 0→1`, 300ms, 400ms delay.

*Neighborhoods Mosaic (CSS grid with variable spans):*
- Tiles reveal in reading order: left-to-right, top-to-bottom.
- Each tile: `translateY(30px→0), opacity 0→1`, 300ms `--ease-warm`.
- Stagger: `--stagger-normal` (100ms) between tiles.
- Large (2x2) tile animates first, then smaller tiles follow.
- Image overlay gradient fades in simultaneously with tile reveal.

*Newsletter CTA Section:*
- Same pattern as other sections: whileInView, `translateY(30px→0), opacity 0→1`, 300ms.
- Input + button: staggered 100ms after heading.

**Parallax (Lifestyle Photography):**
- Desktop only: subtle `translateY` parallax with factor 0.15 on hero showcase image and any editorial photography sections.
- Use framer-motion `useScroll` + `useTransform` (already used in ScrollAnimation).
- **DISABLED on mobile** — reduces jank, respects performance budget.

**Navbar Glassmorphism on Scroll:**
- Current: `.glass-nav` with static `backdrop-filter: blur(8px)`, `bg: rgba(255,255,255,0.95)`.
- Redesign: Animate blur and opacity based on scroll position.
  - At `scrollY = 0`: `backdrop-blur(0)`, `background-opacity: 0`, no border.
  - At `scrollY > 50px`: `backdrop-blur(20px)`, `background-opacity: 0.8`, border fades in.
  - Transition: `--duration-base` (300ms) with `--ease-warm`.
  - Surface color: `rgba(251, 249, 244, 0.8)` — warm canvas, not white.

**ScrollAnimation Component:**
- Keep existing canvas frame-sequence approach (it's well-engineered).
- Update text overlays to use Newsreader font for editorial consistency.
- Replace `drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]` with warmer shadow.
- The "Scroll to explore" hint bounce animation should use `--ease-warm` instead of default `animate-bounce`.

**Lenis Smooth Scroll:**
- **Add Lenis** (`@studio-freight/lenis` or `lenis`) as a new dependency.
- Wrap CustomScrollContainer contents with Lenis instance.
- See Section 11 for config.

---

## Section 7: Form Animations

### Current State
- Input: `transition-all duration-200`, border/ring changes on focus.
- No shake animation on form errors (keyframe exists but isn't widely used).
- Loading spinners use `animate-spin`.

### Editorial Redesign

**Input Focus:**
- Ghost border opacity: `20%→40%` on focus.
- Primary ring: fade in with `--duration-fast` (150ms).
- Border: `border-zinc-200` → `border-[#9a4027]/40` on focus (warm primary hint).
- Background: very subtle warm tint on focus (`#fbf9f4`).

**Validation Errors:**
- Warm shake: `translateX(±3px)`, 300ms, `--ease-warm` (lighter than current ±4px shake).
- Red accent replaced with a warmer error tone to stay editorial.
- Apply existing `.animate-shake` class, adjusted to 3px amplitude.

**Validation Success:**
- Green checkmark fades in: `opacity 0→1`, `scale(0.8→1)`, 200ms `--ease-warm-out`.
- Use primary green or warm-adjusted green.

**Submit Button:**
- Gradient: `primary→primary_container` (`#9a4027→#b9583c`).
- Hover: gradient angle shifts `135deg→145deg`, duration `--duration-base`.
- Loading: replace content with warm-colored spinner (primary color), `animate-spin`.
- Active press: `scale(0.98)` (already implemented).

---

## Section 8: Micro-Interactions

### Current State
- Dialog: Radix `animate-in/out` with `zoom-in-95`, `fade-in-0`, slide from top 48%.
- Dropdown: Radix `animate-in/out` with slide and fade.
- Notification dropdown: `animate-in fade-in zoom-in-95 duration-200`.
- Floating map button: spring animation on toggle.

### Editorial Redesign

**Tooltip/Popover:**
- Fade in + scale from 0.95: `opacity 0→1, scale(0.95→1)`, 200ms `--ease-warm-out`.
- Origin: towards trigger element.

**Dropdown:**
- Slide down from top with fade: `translateY(-8px)→0, opacity 0→1`, 200ms `--ease-warm-out`.
- Keep Radix animation system but override timing.

**Modal/Dialog:**
- Backdrop: fade to `rgba(27, 28, 25, 0.6)` (on-surface color), 300ms.
- Content: `scale(0.95→1), opacity 0→1`, 200ms `--ease-warm-out`.
- Replace current `slide-in-from-top-[48%]` with simpler scale + fade (more editorial, less bouncy).

**Badge/Notification ("New" indicators):**
- Subtle pulse animation: primary color glow expanding/contracting.
- `box-shadow: 0 0 0 0 rgba(154, 64, 39, 0.3)` → `0 0 0 6px rgba(154, 64, 39, 0)`, 2s infinite.
- Replace current `animate-ping` on notification dot (too aggressive) with gentler pulse.

**Toggle/Switch:**
- Warm slide with primary fill, 200ms `--ease-warm`.
- Thumb: `translateX` from off to on position.
- Track: fills with primary `#9a4027` over 200ms.

**Accordion:**
- Height auto animation: use framer-motion `AnimatePresence` + `m.div` with `initial/animate/exit` on height.
- Duration: 300ms `--ease-warm`.
- Content fades in simultaneously: `opacity 0→1, 200ms`.

**Map Pin Interactions:**
- Keep current marker hover `scale(1.15)` with bounce easing.
- Replace `animate-ping` on hover with gentler `pulse-ring` (already defined).
- POI marker highlight: add `transition: transform 200ms var(--ease-warm)` to `.poi-marker.highlighted > div`.

**Full-Screen Mobile Nav Overlay (NEW):**
- Container: fade in over 200ms `--ease-warm`.
- Nav links: stagger 50ms between items 1-4, each `opacity 0→1, translateY(12px→0)`, 200ms `--ease-warm-out`.
- Items 5-7 (if present, auth-dependent): appear simultaneously with item 4's timing (no additional delay). Keeps entrance snappy for longer lists.
- Total sequence: ~350ms (200ms animation + 150ms max stagger).
- Exit: simple fade-out 200ms (no stagger on exit — keeps exit feeling quick).

**Connection Score Badge (NEW):**
- On viewport entry: `scale(0.8→1)` with spring (stiffness: 500, damping: 25), framer-motion.
- Subtle and quick — draws attention without being distracting.

**Bottom Sheet Drag Handle (NEW):**
- Width expands `w-10→w-12` on grab, 200ms `--ease-warm`.
- Provides tactile feedback that the drag gesture has been recognized.

---

## Section 9: Skeleton/Loading Animations

### Current State
- `Skeleton.tsx`: `animate-pulse` (Tailwind default) or `animate-shimmer` (custom gradient sweep).
- Skeleton shimmer gradient: `zinc-200 → zinc-100 → zinc-200` (grey-based).
- `ListingCardSkeleton.tsx`: `animate-pulse` container + `animate-shimmer` overlay.
- `PersistentMapWrapper.tsx`: Inline shimmer keyframe for progress bar.

### Editorial Redesign

**Warm Shimmer:**
- Replace grey pulse with editorial shimmer using warm palette:
  - Light: `surface-container-high (#eae8e3) → surface-canvas (#fbf9f4) → surface-container-high (#eae8e3)`
  - Dark: keep current dark mode shimmer (zinc-700 → zinc-600 → zinc-700) — dark mode is being removed per design spec, but keep fallback.
- Animation: linear gradient sweep, 1.5s duration, infinite.
- Direction: left-to-right sweep (current approach).

**Shape Consistency:**
- Skeletons match editorial `rounded-lg` corners.
- **NEVER use grey (#e5e7eb) skeleton colors** — always warm palette.

**Updated shimmer keyframe (replace existing `@keyframes shimmer` in globals.css):**
```css
/* Replace existing shimmer — same name, warm colors */
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.animate-shimmer {
  background: linear-gradient(
    90deg,
    #eae8e3 25%,
    #fbf9f4 50%,
    #eae8e3 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
}
```
**Note:** Reuse existing `animate-shimmer` class name — no new class needed. All current usages automatically get warm colors.

**Loading Spinners:**
- Replace default `animate-spin` color with primary `#9a4027`.
- Consider a warm pulsing dot-sequence for longer loads instead of spinner.

---

## Section 10: GSAP Configuration

### Recommendation: Do NOT add GSAP

The codebase is entirely framer-motion based. Adding GSAP would:
- Increase bundle size (~45KB min+gzip for core + SplitText plugin).
- Create two competing animation systems.
- Require learning a second API.

**Instead:** Use framer-motion for all animations, including:
- Character/word stagger: manual `<span>` wrapping + framer-motion stagger variants.
- ScrollTrigger equivalent: `useScroll` + `useTransform` + `useMotionValueEvent` (already used in ScrollAnimation.tsx).
- SplitText equivalent: split headline into word spans, apply stagger animation.

**Global framer-motion defaults** (in Providers.tsx MotionConfig):
```tsx
<MotionConfig
  reducedMotion="user"
  transition={{
    duration: 0.3,
    ease: [0.25, 0.1, 0.25, 1.0], // --ease-warm
  }}
>
```

### ScrollTrigger via framer-motion

For section reveals, use a reusable `RevealOnScroll` wrapper:
```tsx
function RevealOnScroll({ children, delay = 0 }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{
        duration: 0.3,
        delay,
        ease: [0.25, 0.1, 0.25, 1.0],
      }}
    >
      {children}
    </m.div>
  );
}
```

---

## Section 11: Lenis Configuration

**Add Lenis** for smooth scroll (consistent with editorial feel, ~3KB gzip):

```js
{
  lerp: 0.08,          // slightly slower for editorial feel
  duration: 1.2,       // smooth but not sluggish
  smoothWheel: true,
  orientation: 'vertical',
  touchMultiplier: 1.5, // responsive touch on mobile
}
```

**Integration:**
- Create `src/components/SmoothScroll.tsx` wrapper.
- Initialize Lenis in the scroll container context.
- Must coordinate with existing `CustomScrollContainer` and `ScrollContainerContext`.
- Disable on `prefers-reduced-motion: reduce`.
- Disable on search pages where map interaction requires native scroll behavior.

**Important:** Lenis conflicts with mobile bottom sheet drag gestures. Apply `data-lenis-prevent` to the MobileBottomSheet's `contentRef` div (the scrollable content area), NOT the outer sheet container. The outer container's drag gestures are framer-motion-managed, and the content area is the one with native scrolling that Lenis would interfere with. The drag handle already has `touchAction: none` separately.

---

## Section 12: CSS Transition Utilities

Tailwind utilities and custom classes for consistent editorial motion:

```css
/* --- Base editorial transition --- */
.transition-editorial {
  transition-property: all;
  transition-duration: var(--duration-base);        /* 300ms */
  transition-timing-function: var(--ease-warm);     /* cubic-bezier(0.25, 0.1, 0.25, 1.0) */
}

/* --- Lift on hover (cards, interactive surfaces) --- */
.transition-lift {
  transition-property: transform, box-shadow;
  transition-duration: var(--duration-base);
  transition-timing-function: var(--ease-warm);
}

.hover-lift:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-ambient-lg);
}

/* --- Fade (opacity-only transitions) --- */
.transition-fade {
  transition-property: opacity;
  transition-duration: var(--duration-fast);         /* 150ms */
  transition-timing-function: var(--ease-warm);
}

/* --- Color transitions (hover states, focus rings) --- */
.transition-warm-colors {
  transition-property: color, background-color, border-color, box-shadow;
  transition-duration: var(--duration-base);
  transition-timing-function: var(--ease-warm);
}

/* --- Scale press (active state) --- */
.active-press:active {
  transform: scale(0.98);
  transition-duration: var(--duration-instant);     /* 100ms */
}

/* --- Reveal animation (IntersectionObserver trigger) --- */
.reveal-initial {
  opacity: 0;
  transform: translateY(30px);
}

.reveal-visible {
  opacity: 1;
  transform: translateY(0);
  transition: opacity var(--duration-base) var(--ease-warm),
              transform var(--duration-base) var(--ease-warm);
}
```

---

## Section 13: Reduced Motion Compliance

### Current State
- Global `prefers-reduced-motion: reduce` in globals.css: kills ALL animations/transitions to 0.01ms. This is good.
- Providers.tsx: `<MotionConfig reducedMotion="user">` — framer-motion respects OS setting.
- ScrollAnimation.tsx: Explicit check for `prefers-reduced-motion`, shows static fallback.
- Map.tsx: `motion-reduce:animate-none` on markers.
- PersistentMapWrapper.tsx: Inline `@media (prefers-reduced-motion: reduce)` for shimmer.

### Editorial Redesign Compliance

**Mandatory for all new animations:**

1. **CSS animations:** Global `@media (prefers-reduced-motion: reduce)` already handles these. No per-animation work needed.

2. **framer-motion animations:** Already handled by `<MotionConfig reducedMotion="user">`. Framer-motion will skip animations automatically.

3. **Lenis smooth scroll:** Must be disabled when `prefers-reduced-motion: reduce`.
   ```js
   const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   if (!prefersReducedMotion) {
     // Initialize Lenis
   }
   ```

4. **Canvas ScrollAnimation:** Already has explicit reduced-motion fallback showing static end frame. Keep this.

5. **Parallax:** Must not apply when reduced motion is active. Check before applying `useTransform` parallax offsets.

6. **New editorial shimmer:** Must respect the global reduced-motion media query (it will, since global CSS handles it).

**Fallbacks under reduced motion:**
- No transforms — elements appear in final position immediately.
- Opacity-only transitions where state change needs to be visible (fade-in for modals/dialogs).
- Skeleton loading: static warm background color, no shimmer sweep.
- No parallax.
- No Lenis smooth scroll.

---

## Section 14: Performance Budget

### Constraints

| Metric | Budget |
|--------|--------|
| Max simultaneous animations per viewport | 5 |
| Max staggered items per group | 8 (desktop), 4 (mobile) |
| Animation-triggering CSS properties | `transform`, `opacity` ONLY (no width, height, top, left) |
| `will-change` usage | Applied on hover/intersection, removed after animation completes |
| framer-motion bundle | LazyMotion + domAnimation only (no full Motion) |
| Lenis bundle | ~3KB gzip |
| Total animation JS overhead | <50KB gzip |

### Cleanup Rules

- **GSAP timeline cleanup:** N/A (not using GSAP).
- **framer-motion:** `AnimatePresence` handles unmount animations. Ensure `key` props are stable.
- **IntersectionObserver:** Disconnect on unmount (already done in ScrollAnimation.tsx — follow this pattern).
- **Lenis:** Destroy instance on route change / unmount.
- **Canvas:** Clear context and null refs on unmount (already done in ScrollAnimation.tsx).

### Mobile Performance Adjustments

| Feature | Desktop | Mobile |
|---------|---------|--------|
| Parallax | 0.15 factor | DISABLED |
| Stagger items | Up to 8 | Max 4 |
| Section reveal distance | translateY(30px) | translateY(20px) |
| Duration reduction | Full durations | Reduce by 20% (not 30% — editorial warmth matters) |
| Image hover zoom | scale(1.02) | DISABLED (no hover on touch) |
| Card lift on hover | translateY(-4px) | DISABLED (no hover on touch) |
| Lenis smooth scroll | Enabled | Enabled (but prevent on drag surfaces) |
| Canvas frame count | 96 frames | 64 frames (already implemented) |
| Navbar glassmorphism scroll | Full animation | Simplified (static blur, no scroll-linked transition) |

### `will-change` Management

- Apply `will-change: transform` only during active animation.
- Remove via `transitionend` event or framer-motion `onAnimationComplete`.
- Never leave `will-change` permanently on elements.
- Exception: navbar (always visible, always transitioning) can keep `will-change: backdrop-filter`.

### GPU Compositing

- All animations use `transform` and `opacity` — these are compositor-thread properties.
- `backdrop-filter` is expensive — max 1 visible at a time. Allowed on: navbar, modals/dialogs, MobileBottomSheet, full-screen nav overlay. These are never simultaneously visible so GPU cost is sequential not additive. Fallback to solid bg on low-end devices if perf testing flags issues.
- No `box-shadow` animations (use `filter: drop-shadow` or opacity-swap between pre-rendered shadow layers).
- For card hover shadow: swap between two box-shadow layers using opacity, not animating box-shadow directly.

---

## Summary: Key Changes from Current → Editorial

| Area | Current | Editorial Redesign |
|------|---------|-------------------|
| Easing | `ease` (generic) | `--ease-warm` cubic-bezier(0.25,0.1,0.25,1.0) |
| Base duration | 200ms | 300ms |
| Card hover | shadow-2xl, scale(1.10) on image | translateY(-4px) lift, ambient shadow, scale(1.02) |
| Section reveals | y:10, stagger 50ms | y:30, stagger 100ms |
| Hero text | Simple fade-in | Word-by-word stagger |
| Skeleton colors | Grey (zinc-200) | Warm (#eae8e3 → #fbf9f4) |
| Smooth scroll | None | Lenis (lerp: 0.08, duration: 1.2) |
| Heart animation | Red bounce | Primary (#9a4027) bounce + glow |
| Notification dot | animate-ping (aggressive) | Gentle primary pulse |
| Page transitions | None | Fade + subtle translateY |
| Navbar on scroll | Static glassmorphism | Animated blur + opacity on scroll |
| Touch press (general) | N/A | scale(0.98), 100ms |
| Touch press (CTA) | N/A | scale(0.95), 100ms (deliberate feel) |
| backdrop-filter | Static on navbar | Max 1 visible at a time (navbar, modal, sheet, nav overlay) |
| GSAP | Not used | Not adding (stay framer-motion only) |
