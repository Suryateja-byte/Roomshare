# Micro-Interaction Audit — INTERACTION-DESIGNER

## Part 1: Current Interaction Inventory

### A. Animation Token System (globals.css)

The design system defines a mature set of animation primitives:

**Easings:**
- `--ease-warm`: cubic-bezier(0.25, 0.1, 0.25, 1.0) — general-purpose smooth
- `--ease-warm-in`: cubic-bezier(0.55, 0, 1, 0.45) — enter acceleration
- `--ease-warm-out`: cubic-bezier(0, 0.55, 0.45, 1) — exit deceleration
- `--ease-editorial`: cubic-bezier(0.16, 1, 0.3, 1) — dramatic overshoot for reveals
- `--ease-bounce`: cubic-bezier(0.34, 1.56, 0.64, 1) — playful spring overshoot

**Durations:**
- `--duration-instant`: 100ms | `--duration-fast`: 150ms | `--duration-base`: 300ms
- `--duration-slow`: 500ms | `--duration-reveal`: 800ms | `--duration-cinematic`: 1200ms

**Stagger timing:**
- `--stagger-tight`: 50ms | `--stagger-normal`: 100ms | `--stagger-wide`: 150ms

**Keyframe animations defined:**
- `fadeUp` — opacity 0 + translateY(20px) to visible (hero content)
- `slideDown` — opacity 0 + translateY(-10px) to visible (dropdowns)
- `shake` — 4-step horizontal shake (form validation)
- `shimmer` — skeleton loading gradient sweep
- `heart-bounce` — 4-step scale bounce for favoriting (1 -> 1.3 -> 0.95 -> 1.15 -> 1.1)
- `warm-pulse` — gentle scale+opacity pulse for notification dots
- `pulse-ring` — map pin ring pulse

**Utility classes:**
- `.transition-editorial` — all properties, 300ms, ease-warm
- `.transition-lift` — transform+shadow, 300ms, ease-warm
- `.transition-fade` — opacity, 200ms, ease-warm
- `.shadow-card-hover` — elevated shadow for card hover state

**Reduced motion:** Global `prefers-reduced-motion: reduce` rule kills all animation/transition durations to 0.01ms. Correct approach.

### B. Component-by-Component Interaction Audit

---

#### COMPONENT: HomeClient (Hero Section)
**File:** `src/app/HomeClient.tsx`
**States:** default | scroll-revealed
**Current interactions:**
- Stagger container with 100ms stagger between children (framer-motion `m` + `Variants`)
- `fadeInUp` variant: opacity 0 + y:20 -> visible, 600ms, ease-warm
- Cinematic showcase image: opacity 0 + y:40 -> visible, 800ms, delay 200ms, ease-editorial
- CTA arrow icon: `group-hover:translate-x-1 transition-transform`
- Features section: `whileInView` with stagger, viewport margin -100px, `once: true`
- CTA section: `whileInView` fade+slide, 600ms, ease-editorial

**Missing:**
- No hover state on FeatureCard icons (icon circle is static)
- No entrance animation on the "New here?" CTA link
- Search form container has no focus-within glow/elevation change
- Hero image has no parallax or subtle movement on scroll

---

#### COMPONENT: ListingCard
**File:** `src/components/listings/ListingCard.tsx`
**States:** default | hovered (list) | hovered (map) | active (map-selected) | focused
**Current interactions:**
- Card wrapper: `transition-shadow` on article element
- Active state: `ring-2 ring-primary ring-offset-2`
- Hovered state: `shadow-ambient ring-1 ring-primary/20`
- Image container: `group-hover:scale-110 transition-transform duration-[2s] ease-out` (slow zoom)
- Gradient overlay on image: `opacity-0 group-hover:opacity-100 transition-opacity duration-500`
- Card body: `transition-lift` class + `group-hover:shadow-ambient-lg group-hover:-translate-y-1`
- Focus visible: `ring-2 ring-primary/30 ring-offset-2`

**Missing:**
- No active/pressed state on card (no scale-down on click)
- Image carousel arrows appear/disappear but have no entrance spring
- "New" badge has no subtle animation to draw attention
- No loading skeleton transition (skeleton -> real content crossfade)
- Price text has no emphasis animation on hover

---

#### COMPONENT: FavoriteButton (Heart)
**File:** `src/components/FavoriteButton.tsx`
**States:** default | saved | loading | animating | disabled
**Current interactions:**
- Heart icon: `transition-all duration-300` between saved/unsaved
- Saved: `fill-current scale-110`
- Unsaved: `scale-100`
- Bounce animation: `animate-heart-bounce` keyframe on save (400ms)
- Button: `transition-colors shadow-ambient-sm`
- Optimistic update with revert on error

**Missing:**
- No particle burst or confetti-like effect on save (would add delight)
- No unsave animation (heart just shrinks back — feels abrupt)
- No loading spinner during API call (only `disabled` state)
- No haptic feedback integration (haptics.ts exists but is not wired to FavoriteButton)

---

#### COMPONENT: ScrollAnimation (Cinematic Scroll)
**File:** `src/components/ScrollAnimation.tsx`
**States:** loading | ready | failed | reduced-motion
**Current interactions:**
- Canvas frame-by-frame scroll-driven animation (96 desktop / 64 mobile frames)
- Full-bleed dark overlay with scroll-driven opacity
- Three text overlays with staggered scroll-driven fade in/out
- Loading: circular SVG progress indicator with percentage
- Scroll hint: mouse icon with bounce animation, fades on scroll start
- Navbar auto-hide during animation zone
- Reduced motion: static end frame with overlaid text

**Missing:**
- Loading progress ring has no entrance animation (just appears)
- Text overlays could benefit from slight y-translate parallax, not just opacity
- No transition between loading poster and canvas reveal (currently opacity toggle)

---

#### COMPONENT: NavbarClient
**File:** `src/components/NavbarClient.tsx`
**States:** transparent | scrolled (glass) | hidden (during scroll-anim) | mobile-menu-open
**Current interactions:**
- Scroll state: `transition-all duration-500 ease-editorial` between transparent and glassmorphism
- Hide/show during scroll animation: `translate-y` + opacity via data attribute
- Logo: `group-hover:rotate-[10deg] group-hover:scale-110 duration-500`
- Nav links: `transition-all duration-300` with active bg state
- Profile dropdown: CSS-animated scale+opacity+translate, 300ms, ease-editorial
- Mobile menu: `transition-all duration-300` opacity fade
- Notification badge: `pulse-ring` animation
- Menu items: `transition-colors` on hover

**Missing:**
- Mobile menu links have no staggered entrance (all appear at once)
- No active page indicator animation (instant background swap)
- Profile dropdown has no backdrop overlay on mobile
- Menu icon to X icon transition is a hard swap (no morph animation)
- Mobile menu has no slide-in direction (just opacity fade)

---

#### COMPONENT: BookingForm
**File:** `src/components/BookingForm.tsx`
**States:** default | validating | loading | success | error (5 error types) | offline | already-submitted
**Current interactions:**
- Availability indicator: pulsing green dot for ACTIVE status
- Error shake: `animate-shake` class (400ms horizontal shake)
- Loading state: `Loader2` spinner with `animate-spin`
- Success state: `CheckCircle` icon (static)
- Confirmation modal: portal with `FocusTrap`
- Offline indicator: `WifiOff` icon

**Missing:**
- No entrance animation for the booking sidebar
- Success state has no celebration animation (just a static green icon)
- Error messages appear without transition (hard cut)
- Date picker selection has no feedback animation
- Price calculation update has no number transition/counter effect
- No progress indication during multi-step booking flow
- Modal overlay has no fade-in (relies on FocusTrap portal)

---

#### COMPONENT: SearchForm
**File:** `src/components/SearchForm.tsx`
**States:** default | compact | focused | loading | with-filters
**Current interactions:**
- Search button: `hover:scale-105 active:scale-95 transition-all duration-500`
- Shadow: `shadow-ambient-lg shadow-primary/20` on search button
- Filter count badge animation: uses `useDebouncedFilterCount` hook

**Missing:**
- No focus-within glow on the search bar container
- Filter modal entrance/exit has no spring physics
- Recent searches dropdown has no stagger animation
- NL query parse feedback has no typing/processing animation
- Location autocomplete dropdown has no entrance animation

---

#### COMPONENT: ImageCarousel
**File:** `src/components/listings/ImageCarousel.tsx`
**States:** default | hover (shows controls) | focused | dragging
**Current interactions:**
- Arrow buttons: `transition-all duration-200` with opacity+translate entrance
- Left arrow: `opacity-0 -translate-x-2` -> `opacity-100 translate-x-0`
- Right arrow: `opacity-0 translate-x-2` -> `opacity-100 translate-x-0`
- Dots: `transition-all duration-200` between active/inactive sizes
- Active dot: `w-2.5 h-1.5` pill shape; inactive: `w-1.5 h-1.5` circle
- Embla carousel with loop, touch/swipe support
- Drag state tracking to prevent parent link click

**Missing:**
- No slide transition animation (Embla handles this but no custom easing specified)
- Image placeholder blur-up has no fade-in transition after load
- No indicator for total image count beyond dots

---

#### COMPONENT: ImageGallery (Listing Detail)
**File:** `src/components/ImageGallery.tsx`
**States:** default | lightbox-open | zoomed
**Current interactions:**
- Gallery items: `transition-transform duration-slow ease-warm group-hover:scale-[1.03]`
- Overlay tint: `bg-on-surface/5 group-hover:bg-on-surface/0 transition-colors duration-500`
- Lightbox zoom: `transition-transform duration-200` between scale-100 and scale-150
- Lightbox buttons: `hover:bg-white/10 transition-colors`
- Thumbnails: `opacity-50 hover:opacity-100` transition
- "+N more" overlay: `bg-on-surface/50 hover:bg-on-surface/40 transition-colors`

**Missing:**
- No lightbox entrance/exit animation (hard mount/unmount)
- No slide animation between images in lightbox (hard swap)
- No pinch-to-zoom on mobile
- Thumbnail strip has no scroll indication

---

#### COMPONENT: BottomNavBar
**File:** `src/components/BottomNavBar.tsx`
**States:** visible | hidden | active-item
**Current interactions:**
- Show/hide: `transition-transform duration-300` with translateY
- Scroll-aware: hides on scroll down, shows on scroll up (10px threshold)
- Active item: `text-primary` with `stroke-[2.5]` vs inactive `stroke-[1.5]`
- Items: `transition-colors duration-200`

**Missing:**
- No active indicator dot/pill animation (common in modern mobile nav)
- No icon scale animation on active state change
- No haptic feedback on tab switch (haptics.ts not wired)
- Hide/show animation feels mechanical (linear translateY, no spring)

---

#### COMPONENT: MobileBottomSheet
**File:** `src/components/search/MobileBottomSheet.tsx`
**States:** collapsed | half | expanded | dragging
**Current interactions:**
- Spring animation: stiffness 400, damping 30, mass 0.8
- Rubber-band overscroll with exponential dampening
- Flick velocity detection (0.4 px/ms threshold)
- Drag threshold: 40px minimum
- Overlay: AnimatePresence fade (opacity 0 -> 0.3, 200ms)
- GPU-accelerated with translateZ(0) and backfaceVisibility hidden
- CSS scroll-snap on content area

**Missing:**
- No handle indicator animation (the 12x1.5 pill is static)
- Content has no crossfade when snap state changes
- No shadow intensity change based on sheet height

---

#### COMPONENT: Button (UI Primitive)
**File:** `src/components/ui/button.tsx`
**States:** default | hover | focus | active | disabled
**Current interactions:**
- `transition-all duration-200`
- Focus: `ring-2 ring-offset-2`
- Active: `active:scale-[0.97]` (press feedback)
- Disabled: `opacity-60 pointer-events-none`
- Primary variant: gradient + `hover:brightness-110`
- Filter variant: `data-[active=true]` gradient swap

**Missing:**
- No loading state built into button primitive (each consumer implements their own)
- No ripple/ink effect on press
- Hover brightness change is subtle — no shadow elevation change

---

#### COMPONENT: Dialog (Modal)
**File:** `src/components/ui/dialog.tsx`
**States:** open | closed
**Current interactions:**
- Overlay: `fade-in-0 / fade-out-0` with backdrop-blur
- Content: combined `fade + zoom-95 + slide` animation via Radix animate-in/animate-out
- Close button: `opacity-70 hover:opacity-100 transition-opacity`

**Missing:**
- No spring physics on open (uses CSS animation, feels linear)
- Close button has no scale feedback on press

---

#### COMPONENT: DropdownMenu
**File:** `src/components/ui/dropdown-menu.tsx`
**States:** open | closed
**Current interactions:**
- Content: `fade-in/out + zoom-95/100 + slide-in-from-[side]` via Radix
- Glassmorphism: `backdrop-blur-[20px]`
- Items: `transition-colors` on focus/hover
- Disabled items: `opacity-50 pointer-events-none`

**Missing:**
- No stagger animation on menu items
- No active/pressed state on items

---

#### COMPONENT: Skeleton
**File:** `src/components/skeletons/Skeleton.tsx`
**States:** pulse | shimmer | none
**Current interactions:**
- Pulse: `animate-pulse` (Tailwind default)
- Shimmer: custom `animate-shimmer` with warm gradient sweep (1.5s infinite)

**Missing:**
- No crossfade transition when skeleton is replaced by real content (hard swap in every consumer)

---

#### COMPONENT: Haptics Utility
**File:** `src/lib/haptics.ts`
**States:** N/A (utility)
**Current:** Defines `triggerHaptic`, `triggerLightHaptic`, `triggerMediumHaptic` + CSS classes `HAPTIC_CLASSES.tap`, `.flash`, `.interactive`
**Missing:** Not wired to ANY component. The utility exists but is entirely unused in practice. FavoriteButton, BottomNavBar, BookingForm, and all buttons lack haptic integration.

---

## Part 2: Missing Interaction Inventory (Gap Analysis)

### Critical Gaps (affect perceived quality)

| # | Gap | Components Affected | Impact |
|---|-----|---------------------|--------|
| 1 | No skeleton-to-content crossfade | ListingCard, SearchResults, all skeleton consumers | Content "pops" in abruptly; feels janky |
| 2 | No booking success celebration | BookingForm | Most important conversion moment feels flat |
| 3 | No form error transition | BookingForm, SearchForm, all forms | Error messages appear/disappear with hard cuts |
| 4 | Haptics utility completely unwired | FavoriteButton, BottomNavBar, BookingForm, buttons | Mobile feedback layer exists but is dead code |
| 5 | No mobile menu stagger entrance | NavbarClient | Full-screen menu appears as a flat block |
| 6 | Lightbox has no entrance/exit animation | ImageGallery | Hard mount/unmount feels cheap |
| 7 | No active indicator animation on BottomNavBar | BottomNavBar | Tab switches feel static/lifeless |

### Secondary Gaps (polish-level)

| # | Gap | Components Affected |
|---|-----|---------------------|
| 8 | FeatureCard icon has no hover animation | HomeClient |
| 9 | ListingCard has no press feedback | ListingCard |
| 10 | No slide animation in lightbox image nav | ImageGallery |
| 11 | Profile dropdown no stagger on items | NavbarClient |
| 12 | Search bar no focus-within glow | SearchForm |
| 13 | MobileBottomSheet handle is static | MobileBottomSheet |
| 14 | Menu hamburger-to-X has no morph | NavbarClient |
| 15 | Price counter has no number transition | BookingForm |

---

## Part 3: Proposed Micro-Interactions

### P0 — Essential (Ship-blocking quality improvements)

#### P0-1: Skeleton-to-Content Crossfade

- **What:** When real content replaces a skeleton, the skeleton fades out (opacity 1->0, 150ms) while real content fades in (opacity 0->1, 200ms) with a slight upward translate (y: 8px -> 0).
- **Where:** Every component that renders a `<Skeleton>` placeholder — ListingCard grid, search results, listing detail page, profile sections.
- **Trigger:** Content load completion (React Suspense boundary resolution, data fetch completion).
- **Duration:** 200ms total (150ms skeleton fade-out overlapping with 200ms content fade-in).
- **Easing:** `--ease-warm` (cubic-bezier(0.25, 0.1, 0.25, 1.0)).
- **Priority:** P0 — This is the single highest-impact polish item. Every user sees skeleton loading dozens of times per session. The current hard swap creates a "flash" that makes the app feel unfinished.
- **Reduced motion:** Instant swap (no fade), preserve the slight y-translate at 4px for spatial continuity.
- **Implementation approach:** A thin `<ContentReveal>` wrapper component using framer-motion `AnimatePresence` with `mode="wait"`. Skeleton gets `exit={{ opacity: 0 }}`, content gets `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}`.

#### P0-2: Booking Success Celebration

- **What:** When a booking or hold is confirmed, a brief celebration sequence plays: (1) the success icon scales in with a spring bounce (0 -> 1.2 -> 1, 400ms), (2) a subtle confetti-like burst of 6-8 small terracotta/amber dots radiates outward from the icon and fades (600ms), (3) the success message text fades up (200ms delay, 300ms duration).
- **Where:** BookingForm — the success state after `createBooking` or `createHold` returns successfully.
- **Trigger:** Successful booking/hold API response.
- **Duration:** 800ms total sequence (icon 400ms, particles 600ms overlapping, text 300ms delayed).
- **Easing:** Icon: `--ease-bounce`; Particles: `--ease-warm-out`; Text: `--ease-editorial`.
- **Priority:** P0 — This is the single most important conversion moment in the entire app. A flat "Booking confirmed" with a static green icon is a missed opportunity for emotional payoff. This is where "luxury magazine" earns its keep.
- **Reduced motion:** Icon appears at scale(1) immediately. No particles. Text appears without translate. Static but still celebratory via color.
- **Performance:** Particles are CSS-only (::before/::after pseudo-elements with `@keyframes`), no JS animation loop. GPU-composited via `transform` + `opacity` only.

#### P0-3: Form Error Message Transitions

- **What:** Error messages slide down from behind the input field (translateY: -8px -> 0, opacity: 0 -> 1, 200ms). When resolved, they slide back up and fade (reverse, 150ms). Field borders transition to destructive color (150ms).
- **Where:** BookingForm date fields, SearchForm, any form with inline validation.
- **Trigger:** Validation failure (client-side or server-side error response).
- **Duration:** Enter: 200ms. Exit: 150ms.
- **Easing:** Enter: `--ease-editorial` (overshooting snap). Exit: `--ease-warm-in` (accelerating departure).
- **Priority:** P0 — Error handling is a trust-critical interaction in a booking app. Abrupt error appearance feels like the app is scolding the user. Animated entrance with spatial context ("this error belongs to this field") feels guided.
- **Reduced motion:** Instant show/hide with no translate. Border color still transitions (color is not motion).

### P1 — High-Value (Noticeable quality lift)

#### P1-1: Mobile Menu Staggered Entrance

- **What:** When mobile menu opens, links stagger in from below with 80ms delay between each. Each link: translateY(24px) + opacity(0) -> translateY(0) + opacity(1), 400ms each with `--ease-editorial`. Exit: simultaneous fade-out (200ms, no stagger — quick dismissal).
- **Where:** NavbarClient mobile overlay menu.
- **Trigger:** Hamburger menu button press.
- **Duration:** Entrance: 400ms per item, ~80ms stagger (total ~720ms for 5 items). Exit: 200ms simultaneous.
- **Easing:** Entrance: `--ease-editorial`. Exit: `--ease-warm-in`.
- **Priority:** P1 — Full-screen overlays that pop in as a monolithic block feel cheap. Stagger creates the "editorial unfurling" that matches the brand.
- **Reduced motion:** All links appear simultaneously with opacity transition only (no translateY).

#### P1-2: Wire Haptic Feedback to Key Interactions

- **What:** Connect the existing `haptics.ts` utility to: (1) FavoriteButton toggle — `triggerLightHaptic()` on save, (2) BottomNavBar tab switch — `triggerLightHaptic()`, (3) BookingForm submit button — `triggerMediumHaptic()` on confirmed action, (4) MobileBottomSheet snap — `triggerLightHaptic()` on snap completion.
- **Where:** FavoriteButton, BottomNavBar, BookingForm, MobileBottomSheet.
- **Trigger:** User action completion (not start).
- **Duration:** 5-15ms vibration per the existing utility.
- **Priority:** P1 — The haptic utility is fully implemented but completely dead. Wiring it to 4 key touch points adds a tactile layer to the entire mobile experience with minimal code.
- **Reduced motion:** Haptics are NOT motion. They should fire regardless of prefers-reduced-motion.

#### P1-3: Lightbox Entrance/Exit Animation

- **What:** Lightbox overlay fades in (bg opacity 0 -> 0.95, 300ms) while the clicked image scales from its gallery position to center screen (shared-element-like effect using `layoutId` or FLIP). Exit: reverse to original position, or simple fade+scale-down if FLIP is too complex.
- **Where:** ImageGallery lightbox modal.
- **Trigger:** Click on gallery image / close button / Escape key.
- **Duration:** Enter: 300ms. Exit: 250ms.
- **Easing:** Enter: `--ease-editorial`. Exit: `--ease-warm-in`.
- **Priority:** P1 — Lightbox open/close is one of the most common interactions on listing detail pages. The current hard mount/unmount is the most visually jarring transition in the app.
- **Reduced motion:** Simple crossfade (no scale/position animation). Overlay still fades.

#### P1-4: BottomNavBar Active Indicator

- **What:** A small pill indicator (4px tall, 24px wide, terracotta colored) slides horizontally beneath the active tab icon using `layoutId` (framer-motion shared layout animation). On tab switch, the pill glides from old position to new with spring physics.
- **Where:** BottomNavBar — below the active icon.
- **Trigger:** Route change / tab click.
- **Duration:** 350ms spring (stiffness: 300, damping: 25).
- **Easing:** Spring physics (not CSS timing function).
- **Priority:** P1 — Mobile bottom navigation is the most-used navigation element. A sliding indicator adds spatial continuity and makes the app feel native.
- **Reduced motion:** Indicator snaps to new position instantly (no slide). Color still applied.

### P2 — Polish (Nice-to-have, editorial flair)

#### P2-1: FeatureCard Icon Hover Animation

- **What:** On hover, the icon circle background subtly scales to 1.08 and the icon itself rotates 8 degrees, both over 300ms.
- **Where:** HomeClient FeatureCard component.
- **Trigger:** Mouse enter on card.
- **Duration:** 300ms.
- **Easing:** `--ease-warm`.
- **Priority:** P2.
- **Reduced motion:** No scale/rotation. Color transition only.

#### P2-2: ListingCard Press Feedback

- **What:** On mousedown/touchstart, card scales to 0.98 (50ms). On release, springs back to 1.0 (150ms). Adds tactile depth to card interactions.
- **Where:** ListingCard link wrapper.
- **Trigger:** Pointer down / touch start.
- **Duration:** Down: 50ms. Up: 150ms.
- **Easing:** Down: `--ease-warm-in`. Up: `--ease-bounce`.
- **Priority:** P2.
- **Reduced motion:** No scale. Rely on existing shadow/ring states.

#### P2-3: Search Bar Focus-Within Glow

- **What:** When any input inside the search bar receives focus, the outer container gains a subtle warm glow: `box-shadow: 0 0 0 3px rgb(154 64 39 / 0.12)` transitioning in over 200ms. The border also transitions from `outline-variant/20` to `primary/30`.
- **Where:** HomeClient search form wrapper and SearchForm on search page.
- **Trigger:** Focus-within on the search container.
- **Duration:** 200ms.
- **Easing:** `--ease-warm`.
- **Priority:** P2.
- **Reduced motion:** Glow still appears (not motion, just visual emphasis).

#### P2-4: Profile Dropdown Menu Item Stagger

- **What:** Menu items stagger in with 40ms delay, each sliding down 6px with opacity fade (150ms per item).
- **Where:** NavbarClient profile dropdown.
- **Trigger:** Dropdown open.
- **Duration:** 150ms per item, 40ms stagger.
- **Easing:** `--ease-warm-out`.
- **Priority:** P2.
- **Reduced motion:** All items appear simultaneously.

#### P2-5: MobileBottomSheet Handle Breathing Animation

- **What:** When sheet is at half position and idle for 3+ seconds, the drag handle pill does a single gentle scale pulse (1.0 -> 1.15 -> 1.0, 800ms) as a hint that it's draggable. Fires once per session, not on every idle.
- **Where:** MobileBottomSheet drag handle.
- **Trigger:** Idle timer (3 seconds at half snap with no interaction).
- **Duration:** 800ms.
- **Easing:** `--ease-warm`.
- **Priority:** P3 (discoverability aid, not essential).
- **Reduced motion:** No animation. Static handle with aria-label is sufficient.

#### P2-6: Number Counter for Price Calculation

- **What:** When booking duration changes and total price updates, the price number counts up/down to the new value over 300ms instead of instant swap.
- **Where:** BookingForm price display.
- **Trigger:** Date selection change that alters calculated price.
- **Duration:** 300ms.
- **Easing:** `--ease-editorial`.
- **Priority:** P3.
- **Reduced motion:** Instant number swap.

---

## Part 4: Priority Ranking with Justification

| Rank | ID | Proposal | Justification |
|------|----|----------|---------------|
| 1 | P0-1 | Skeleton-to-content crossfade | Highest frequency interaction. Every user, every page load. Current hard swap is the #1 "unfinished" signal. |
| 2 | P0-2 | Booking success celebration | Highest emotional-stakes moment. Conversion endpoint. Current static icon is a missed payoff. |
| 3 | P0-3 | Form error transitions | Trust-critical. Error handling reveals app quality. Hard-cut errors feel hostile. |
| 4 | P1-1 | Mobile menu stagger | High visibility. Full-screen takeover that currently feels like a light switch. |
| 5 | P1-2 | Wire haptic feedback | Zero new code — just function calls. Activates an entire dead tactile layer. |
| 6 | P1-3 | Lightbox entrance/exit | High frequency on listing detail. Most jarring hard-mount in the app. |
| 7 | P1-4 | BottomNavBar active indicator | Most-used mobile navigation. Sliding pill is an expected modern pattern. |
| 8 | P2-3 | Search bar focus glow | Brand moment. First interaction on homepage. Signals interactivity. |
| 9 | P2-2 | ListingCard press feedback | High frequency. Cards are the primary browse element. |
| 10 | P2-1 | FeatureCard icon hover | Low priority but easy. Homepage polish. |
| 11 | P2-4 | Dropdown menu stagger | Desktop polish. Low effort, subtle improvement. |
| 12 | P2-5 | Bottom sheet handle hint | Discoverability. One-time animation. |
| 13 | P2-6 | Price counter animation | Delightful but non-essential. |

---

## Part 5: Performance Budget

### Simultaneous Animation Limits
- **Maximum 3 concurrent framer-motion layout animations** on any single screen
- **Maximum 5 concurrent CSS transitions** (transform + opacity only — no layout-triggering properties)
- **Zero `width`, `height`, `top`, `left`, `margin`, `padding` animations** — these trigger layout recalculation
- **All proposed animations use only GPU-composited properties:** `transform`, `opacity`, `filter`, `box-shadow` (the last one paints but does not trigger layout)

### GPU Layer Management
- Avoid `will-change` on more than 4 elements simultaneously
- MobileBottomSheet already uses `translateZ(0)` for GPU promotion — avoid duplicating on its children
- Booking celebration particles: use CSS `@keyframes` on pseudo-elements, not JS-driven
- Skeleton shimmer is already GPU-composited via `background-position` animation

### Frame Budget
- All interactions must complete within 16ms per frame (60fps target)
- Spring animations (framer-motion) are inherently frame-budget-safe as they are rAF-driven
- CSS transitions are browser-optimized and do not block the main thread
- The scroll animation canvas is the most expensive item — no new animations should fire while it is in the active zone (scrollYProgress 0.1-0.9)

### Bundle Size
- No new animation library imports. framer-motion (already installed, LazyMotion with domAnimation tree-shakes to ~17KB) handles all proposed JS animations
- CSS-only animations (particles, shimmer, pulse) add zero JS weight
- Haptic wiring is function calls to existing utility — zero bundle impact

---

## Part 6: Reduced Motion Compliance Plan

### Global Strategy
The existing `prefers-reduced-motion: reduce` media query in `globals.css` already kills all CSS animations and transitions to 0.01ms. This is correct but aggressive. Proposed refinement:

### Per-Proposal Compliance

| Proposal | Reduced Motion Behavior |
|----------|------------------------|
| P0-1 Skeleton crossfade | Instant swap, no fade. Slight y-translate (4px) preserved for spatial context. |
| P0-2 Booking celebration | Icon appears at full size. No particles. Text appears instantly. Color still celebratory. |
| P0-3 Error transitions | Instant show/hide. Border color transition preserved (color is not motion). |
| P1-1 Mobile menu stagger | All items appear simultaneously. Opacity transition removed. |
| P1-2 Haptic feedback | Haptics still fire. Vibration is not visual motion. |
| P1-3 Lightbox animation | Simple crossfade (opacity only, no scale/position). |
| P1-4 Bottom nav indicator | Indicator snaps to position. No slide. |
| P2-1 FeatureCard hover | No scale/rotation. Background color change only. |
| P2-2 Card press feedback | No scale. Existing ring/shadow states provide feedback. |
| P2-3 Search focus glow | Glow appears instantly (box-shadow is visual, not motion). |
| P2-4 Dropdown stagger | All items appear at once. |
| P2-5 Handle hint | No animation. |
| P2-6 Price counter | Instant number update. |

### Implementation Note
All framer-motion animations should check `useReducedMotion()` hook and adjust variants accordingly. CSS animations are already handled by the global media query. The key principle: **information delivery is preserved, only the choreography changes.**

---

## Debate Positions (My 3 Most Impactful/Controversial Proposals)

### 1. P0-2: Booking Success Celebration (particle burst)
**Controversial because:** Some teammates may argue this is "decoration" or adds complexity to a critical path. I will defend that the booking confirmation is the ONE moment where the app should feel emotional. A static green checkmark is not "clean design" — it is a missed conversion payoff. Every competitor from Airbnb to Zillow celebrates this moment. The particle effect is CSS-only (no JS overhead) and fires once per booking.

### 2. P1-2: Wire Haptic Feedback (activating dead code)
**Controversial because:** Haptics are invisible in design reviews and some may question their value. I will defend that the `haptics.ts` file was deliberately written with three intensity levels and CSS companion classes — someone identified this as valuable then abandoned it. Wiring 4 function calls to 4 components creates a tactile dimension that separates "website" from "app" on mobile.

### 3. P0-1: Skeleton-to-Content Crossfade (requires wrapper component)
**Controversial because:** This requires modifying every skeleton consumer, which FLOW-ARCHITECT may flag as scope creep. I will defend that a thin `<ContentReveal>` wrapper is a one-time investment that eliminates the single most common visual glitch in the app. The alternative — every developer independently implementing fade-in — leads to inconsistency.
