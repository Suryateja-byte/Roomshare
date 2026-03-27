# 04 -- Mobile/Tablet Responsive Redesign Plan

**Status:** PLAN ONLY -- no file edits
**Design system:** "The Editorial Living Room"
**Approach:** Mobile-first (base styles = mobile, upward breakpoint layering)

---

## Section 1: Breakpoint Strategy

### Defined Breakpoints

| Token | Width | Role |
|-------|-------|------|
| (base) | 0--639px | Mobile phones (portrait/landscape) |
| `sm` | 640px | Large phones, minor layout adjustments |
| `md` | 768px | Tablets -- **primary mobile/desktop split** |
| `lg` | 1024px | Small laptops, sidebar layouts appear |
| `xl` | 1280px | Standard desktops |
| `2xl` | 1536px | Wide monitors (optional, minimal changes) |

### Layout Transitions Per Breakpoint

| Breakpoint | What changes |
|------------|-------------|
| base->sm | Padding increases (px-4 -> px-6), font sizes bump slightly, side-by-side buttons |
| sm->md | **Critical split:** Mobile nav -> desktop nav, bottom sheet -> side panel map, single-col -> 2-col grids, bottom nav bar appears/disappears |
| md->lg | Sidebar nav links appear, 2-col -> 3-col grids, search form expands inline, nearby places panel goes side-by-side |
| lg->xl | Max-width containers widen, spacing opens up, hero text reaches full display size |
| xl->2xl | Cosmetic only -- max-w-7xl containers, minor padding bumps |

### Current Codebase Breakpoint Usage

The codebase uses Tailwind's default breakpoints consistently. Key split:
- **md (768px)** is the primary mobile/desktop boundary -- used in `useMediaQuery("(min-width: 768px)")`, `md:hidden`/`hidden md:flex` patterns for SearchViewToggle, MobileBottomSheet, NavbarClient, CollapsedMobileSearch, MessagesPageClient.
- **lg (1024px)** is the secondary split for nav links, 3-col grids, sidebar layouts.
- **sm (640px)** is used for minor padding/spacing/font bumps.

**Recommendation:** Keep md as the primary split. The editorial redesign does not need custom breakpoints -- Tailwind defaults align with standard device widths.

---

## Section 2: Mobile Navigation

### Current State
- `NavbarClient.tsx`: Hamburger (Menu icon) at `lg:hidden`, toggles a slide-down panel (`grid-rows-[1fr]` animation) with solid bg-white/dark, list links, and auth buttons.
- Mobile menu is a `<div role="dialog">` below the navbar, not a full-screen overlay.
- No bottom navigation bar exists.
- Logo text hidden on mobile (`hidden sm:block`), only "R" icon shown.

### Editorial Redesign Plan

#### Hamburger Menu -> Full-Screen Glassmorphism Overlay

**Trigger:** Hamburger icon remains at `lg:hidden` (editorial warm-styled icon, using Newsreader-inspired line weight).

**Overlay design:**
```
Background: bg-surface-canvas/80 backdrop-blur-[20px]
           (#fbf9f4 at 80% opacity + heavy blur)
           Single theme only -- no dark mode variant.
```

**Overlay layout:**
- Fixed inset-0, z-modal (1200)
- Close button: top-right, editorial X icon in on-surface color (#1b1c19), 44px touch target
- Nav links stacked vertically, centered:
  - Font: Newsreader (serif), text-3xl md:text-4xl, font-medium
  - Color: on-surface (#1b1c19)
  - Hover: primary (#9a4027) color, 300ms transition
  - Letter-spacing: tracking-tight
  - Spacing: space-y-8 between links
- Auth section at bottom: gradient CTA button (primary -> primary-container gradient), Manrope uppercase label
- Entry animation: fade-in + children stagger slide-up (see animation plan)
- Exit animation: fade-out 200ms

**Overlay links (authenticated):**
1. Find a Room
2. Messages (with unread badge -- primary bg, Newsreader count)
3. Bookings
4. Saved
5. Profile
6. List a Room (primary CTA)
7. Log out (tertiary color, at bottom)

**Overlay links (unauthenticated):**
1. Find a Room
2. How it works
3. Log in
4. Join (gradient CTA button)

#### Bottom Navigation Bar

**New component: `BottomNavBar.tsx`**

**Visibility:** `md:hidden` -- mobile only, hidden on tablet/desktop.

**Design:**
```
Position: fixed bottom-0 left-0 right-0
Background: surface-container-lowest (#ffffff)
Shadow: shadow-[0_-2px_16px_rgba(0,0,0,0.06)] (ambient upward shadow)
Border-top: 1px solid outline-variant (#dcc1b9) at 30% opacity
Height: h-16 + safe-area-inset-bottom padding
Z-index: z-sticky (1100)
```

**Items (4-5 icons):**

| Icon | Label | Active state |
|------|-------|-------------|
| Search (magnifier) | Explore | primary (#9a4027) fill, Manrope uppercase text-[10px] |
| Heart | Saved | primary fill |
| Plus-circle | List | primary fill |
| MessageSquare | Messages | primary fill + unread dot |
| User | Profile | primary fill |

**Icon style:**
- Inactive: on-surface-variant (#4a4941), strokeWidth 1.5
- Active: primary (#9a4027), strokeWidth 2, filled variant
- Label: Manrope, uppercase, tracking-widest, text-[10px]
- Touch target: min-h-[44px] min-w-[44px]
- Transition: color 200ms ease

**Content padding:** All mobile pages need `pb-20` (80px) to clear the bottom nav bar. Search page already has `pb-24 md:pb-6` -- just ensure consistency.

**Scroll hide/show behavior:**
- Scroll down: bar hides via `translateY(100%)`, 200ms `--ease-warm`
- Scroll up: bar reveals via `translateY(0)`, 300ms `--ease-warm-out`
- Implementation: track scroll direction in a `useScrollDirection` hook (debounce 50ms)
- On search page with MobileBottomSheet: always visible (no hide on scroll) to avoid conflicting with sheet drag gestures
- First page load: subtle slide-up entrance from `translateY(100%)`, 200ms `--ease-warm`

**Impact on existing components:**
- `MobileBottomSheet.tsx`: Needs bottom offset adjustment -- sheet collapsed position must clear the bottom nav. Currently `SNAP_COLLAPSED = 0.15` (15vh). May need to increase to `0.18` or add a `pb-16` inside the sheet.
- `FloatingMapButton.tsx`: Bottom position needs to account for bottom nav height. Currently `bottom: 1.5rem` in list mode and `calc(15dvh + 1rem)` in map mode. Add `bottom: calc(4rem + env(safe-area-inset-bottom))` offset when bottom nav is present.
- `globals.css`: Add `.maplibregl-ctrl-bottom-right { margin-bottom: 144px; }` for mobile to clear both bottom nav and floating button.

---

## Section 3: Mobile Search Experience

### Current State
- `SearchForm.tsx`: 3-field form (What/Where/Budget) with `flex-col md:flex-row` layout. On mobile: stacked vertically in rounded-3xl container. On desktop: horizontal pill with rounded-full.
- `CollapsedMobileSearch.tsx`: Compact bar (`md:hidden`) with search icon + location text + filter button, shown when scrolled.
- `SearchHeaderWrapper.tsx`: Manages expand/collapse, shows full form or collapsed bar.
- Filter chips: `AppliedFilterChips.tsx` with horizontal scroll + gradient fade on right (`md:hidden`).
- `MobileSearchOverlay.tsx`: Full-screen overlay for mobile search input.

### Editorial Redesign Plan

#### Search Bar (Expanded)
```
Container: rounded-full (not rounded-3xl on mobile too)
Background: surface-container-lowest (#ffffff)
Border: 1px solid outline-variant (#dcc1b9) at 40% opacity (ghost border)
Shadow: shadow-sm (ambient, not lifted)
Icon: Search icon in primary (#9a4027), size-5
Padding: px-5 py-3.5
```

**Input fields on mobile:**
- Single visible input (location/query) with "Where are you looking?" placeholder
- Newsreader italic placeholder, on-surface-variant color
- Tapping expands to full MobileSearchOverlay with all 3 fields stacked

**Desktop (md+):**
- Horizontal pill layout with dividers (keep current md:flex-row pattern)
- Dividers: outline-variant (#dcc1b9) at 30%

#### Filter Chips (Below Search Bar)
```
Layout: horizontal scroll, gap-2, snap-x snap-mandatory
Chip style:
  - Inactive: rounded-full, border border-outline-variant/40, px-3 py-1.5
    bg-transparent, Manrope text-xs uppercase tracking-wide, on-surface-variant color
  - Active: bg-primary (#9a4027), text-on-primary (#ffffff), border-primary
    Manrope text-xs uppercase tracking-wide font-semibold
Scroll: overflow-x-auto, scrollbar-hide, -mx-4 px-4 (full-bleed scroll)
```

**Chips order:** Room type, Price, Move-in, Duration, Amenities, More filters

#### CollapsedMobileSearch Redesign
```
Container: rounded-full, surface-container-lowest bg
Border: ghost border (outline-variant/30)
Shadow: shadow-xs
Icon: Search in primary color
Text: Manrope semibold, on-surface, truncated
Filter button: circular, outline-variant border, SlidersHorizontal in primary
Badge: primary bg, on-primary text, Newsreader bold count
```

#### Map Toggle (Floating Button)
```
Current: bg-zinc-900 pill (dark mode variant removed in redesign)
Redesign: bg-primary (#9a4027), text-on-primary (#ffffff)
  rounded-full, shadow-lg, Manrope uppercase text-xs tracking-widest
  Icon: Map/List in on-primary
  Haptic: keep existing triggerHaptic()
  Position: above bottom nav bar (bottom: calc(5rem + env(safe-area-inset-bottom)))
```

---

## Section 4: Mobile Listing Cards

### Current State
- `ListingCard.tsx`: `rounded-none sm:rounded-2xl`, `aspect-[16/10] sm:aspect-[4/3]`, `p-5 sm:p-6` content padding.
- `MobileCardLayout.tsx`: Single column (`flex flex-col gap-0`) on mobile, `md:grid md:grid-cols-2` on desktop.
- Cards have border-bottom separator on mobile, border-zinc-200/50 on desktop.
- Badges: TrustBadge, SlotBadge, rating badge -- all top-left stack.
- FavoriteButton: top area (managed by parent wrapper div).

### Editorial Redesign Plan

#### Card Structure (Mobile)
```
Container:
  bg-surface-container-lowest (#ffffff)
  rounded-lg (not rounded-none on mobile -- editorial cards always have radius)
  No borders -- ambient shadow only: shadow-[0_2px_12px_rgba(0,0,0,0.04)]
  overflow-hidden
  margin: mx-4 mb-4 (card-level spacing, not full-bleed)

Image:
  aspect-[16/10] (keep for mobile, wider view)
  rounded-t-lg (top corners follow card)
  overflow-hidden

"Connection Score" badge (NEW):
  Position: absolute top-4 right-4 z-20
  Shape: w-10 h-10 rounded-full
  Background: primary (#9a4027)
  Text: Newsreader font, text-lg font-bold, on-primary (#ffffff)
  Content: connection/compatibility score number (e.g., "87")
  Shadow: shadow-md

Heart/Favorite button:
  Position: absolute top-4 left-4 z-20
  Color: primary (#9a4027) when saved, on-surface-variant when not
  Size: w-8 h-8, min touch target via padding
  Background: surface-container-lowest/80 backdrop-blur-sm rounded-full

Content area:
  padding: p-4
  Title: Manrope, font-semibold, text-base, on-surface (#1b1c19)
  Location: Manrope, text-sm, on-surface-variant (#4a4941), font-light
  Price: Newsreader, text-xl, font-bold, on-surface, tracking-tight
  Amenity tags: hidden on mobile cards (save space), shown on detail page
```

#### Existing badges migration:
- TrustBadge: Keep top-left, restyle with editorial palette (surface-container-lowest/90 bg)
- SlotBadge: Keep top-left below TrustBadge
- Rating badge: Replace with Connection Score badge on top-right
- "New" badge: Move into content area, Manrope uppercase, tertiary (#904917) color

#### Desktop Grid (md+)
```
grid grid-cols-2 gap-6 (was gap-4 sm:gap-x-6 sm:gap-y-8)
lg:grid-cols-3 on home/saved/recently-viewed pages
Cards: rounded-xl, shadow-sm hover:shadow-lg transition
Image: aspect-[4/3]
Content: p-5
```

---

## Section 5: Mobile Sections (Home Page)

### Current State
- `HomeClient.tsx`: Hero with large text, search form (hidden on mobile `hidden md:block`), feature grid, CTA section.
- `FeaturedListingsClient.tsx`: Grid of listing cards with "View all" link.
- No "Curated Corners" or "Recently Discovered" sections exist yet.

### Editorial Redesign Plan

#### "Curated Corners" Section (NEW)

**Concept:** Horizontal scroll carousel of editorial neighborhood/area cards.

```
Section title:
  Newsreader serif, text-2xl md:text-3xl, on-surface
  "Curated Corners" or "Editorial Picks"
  mb-6

"See All" link:
  Manrope uppercase, text-xs, tracking-widest
  primary (#9a4027) color, hover:underline
  float right of title (flex justify-between)

Carousel:
  Layout: flex gap-4, overflow-x-auto, snap-x snap-mandatory
  Scroll padding: scroll-pl-4 (first card aligns with page margin)
  Scrollbar: scrollbar-hide
  Full-bleed: -mx-4 px-4 on mobile

Cards:
  Width: w-[280px] sm:w-[320px] flex-shrink-0
  snap-start
  rounded-lg overflow-hidden
  Image: aspect-[3/4], object-cover
  Overlay: gradient from-black/60 via-transparent to-transparent (bottom)
  Text overlay at bottom:
    Title: Newsreader serif, text-xl, font-medium, text-white
    Subtitle: Manrope, text-sm, text-white/80
  Background: surface-container-lowest
  Shadow: shadow-sm
```

**Touch behavior:**
- Swipe gestures via CSS snap (no JS library needed for basic)
- `touch-action: pan-x` on carousel container
- Optional: indicator dots below (primary color active, outline-variant inactive)

#### "Recently Discovered" Section

**Concept:** Stacked vertical cards with warm tones and slight overlap effect.

```
Section title:
  Newsreader serif, text-2xl md:text-3xl
  mb-6

Cards (mobile):
  Full-width (w-full - mx-4 margin)
  Stacked with -mt-3 overlap on each card after first (creates depth)
  rounded-xl
  bg-surface-container-lowest
  border: 1px solid outline-variant/20
  shadow-sm
  p-4

  Layout (inside card):
    flex flex-row gap-4
    Image: w-24 h-24 rounded-lg object-cover flex-shrink-0
    Content: flex-1
      Title: Manrope semibold, text-base, on-surface
      Location: Manrope, text-sm, on-surface-variant
      Price: Newsreader, font-bold, on-surface

Cards (desktop, lg+):
  grid grid-cols-2 gap-6, no overlap
  Larger images, horizontal card layout
```

---

## Section 6: Mobile Form Styling

### Current State
- Forms use standard shadcn/ui inputs: `rounded-lg`, zinc borders, zinc focus rings.
- Auth pages (login/signup): `h-11 sm:h-12`, stacked layout.
- Create/edit listing: `grid grid-cols-1 md:grid-cols-2 gap-6` pattern.
- Buttons: `rounded-full` or `rounded-xl` depending on context.

### Editorial Redesign Plan

#### Input Fields
```
All inputs (mobile):
  width: w-full (always full-width on mobile)
  height: h-12 (44px min touch target + padding)
  border: 1px solid outline-variant (#dcc1b9) at 40% opacity (ghost border)
  border-radius: rounded-lg
  background: surface-container-lowest (#ffffff)
  font: Manrope, text-base, on-surface
  placeholder: Manrope italic, on-surface-variant/60
  focus: border-primary (#9a4027), ring-2 ring-primary/20
  transition: border-color 200ms, box-shadow 200ms

Tablet/desktop (md+):
  May go side-by-side in grid-cols-2
  Same styling, slightly smaller h-11
```

#### Form Layouts
```
Mobile (base):
  All forms: flex flex-col gap-4
  No side-by-side fields
  Labels: Manrope uppercase, text-xs, tracking-wide, on-surface-variant, mb-1.5

Tablet (md+):
  grid grid-cols-2 gap-6 where appropriate
  Keep full-width for: description, address, bio textareas
```

#### CTA Buttons (Mobile)
```
Primary CTA:
  w-full rounded-full h-12
  background: linear-gradient(135deg, #9a4027, #b9583c)
    (primary -> primary-container gradient)
  text: on-primary (#ffffff), Manrope, font-semibold, uppercase, tracking-wide
  shadow: shadow-lg shadow-[#9a4027]/20
  active: scale-95, brightness-95
  transition: transform 150ms, filter 150ms

Secondary CTA:
  w-full rounded-full h-12
  background: transparent
  border: 1px solid outline-variant (#dcc1b9)
  text: on-surface (#1b1c19), Manrope, font-medium
  hover: bg-surface-container-high (#eae8e3)
```

#### Touch-Friendly Controls
```
Checkboxes/Radios:
  min-w-[44px] min-h-[44px] touch target (via padding, not scaling)
  Checkbox visual: w-5 h-5 rounded-md, border-outline-variant
  Checked: bg-primary, border-primary, check icon in on-primary
  Radio visual: w-5 h-5 rounded-full, same color pattern

Date picker:
  Mobile: native input[type="date"] with editorial styling overlay
  Touch: full-width, h-12, same ghost-border treatment
  Calendar popup: rounded-xl, surface-container-lowest bg, primary accent for selected dates

Select/Dropdown:
  h-12, ghost border, chevron in on-surface-variant
  Mobile: native <select> for best UX (no custom dropdown on mobile)
```

---

## Section 7: Font Size Scaling

### Typography Scale Across Breakpoints

| Element | Mobile (base) | Tablet (md) | Desktop (lg+) | Font |
|---------|--------------|-------------|----------------|------|
| Display (hero) | text-3xl (30px) | text-5xl (48px) | text-6xl/text-7xl (60-72px) | Newsreader |
| H1 (page title) | text-2xl (24px) | text-3xl (30px) | text-4xl (36px) | Newsreader |
| H2 (section) | text-xl (20px) | text-2xl (24px) | text-3xl (30px) | Newsreader |
| H3 (card title) | text-base (16px) | text-base (16px) | text-lg (18px) | Manrope |
| Body | text-base (16px) | text-base (16px) | text-base (16px) | Manrope |
| Body small | text-sm (14px) | text-sm (14px) | text-sm (14px) | Manrope |
| Label | text-xs (12px) | text-xs (12px) | text-sm (14px) | Manrope uppercase |
| Caption | text-xs (12px) | text-xs (12px) | text-xs (12px) | Manrope |
| Price (listing) | text-xl (20px) | text-xl (20px) | text-2xl (24px) | Newsreader |
| Nav links (mobile overlay) | text-3xl (30px) | text-4xl (36px) | N/A (desktop nav) | Newsreader |
| Bottom nav label | text-[10px] | N/A (hidden) | N/A | Manrope uppercase |
| Connection Score | text-lg (18px) | text-lg (18px) | text-xl (20px) | Newsreader |

### Line Heights
- Newsreader headings: leading-[1.1] to leading-[1.2]
- Manrope body: leading-relaxed (1.625)
- Manrope labels: leading-none (1.0) or leading-tight (1.25)

### Current Fluid Font Size
`globals.css` has `font-size: clamp(0.875rem, 0.833rem + 0.208vw, 1rem)` on body -- scales 14px->16px across 320-1280px. **Keep this** as the base; editorial headings use explicit responsive classes above.

---

## Section 8: Spacing Adjustments

### Spacing Scale Across Breakpoints

| Context | Mobile (base) | Tablet (md) | Desktop (lg+) |
|---------|--------------|-------------|----------------|
| Page horizontal padding | px-4 (16px) | px-6 (24px) | px-8 (32px) |
| Section vertical gap | py-16 (64px) | py-20 (80px) | py-24 (96px) |
| Card internal padding | p-4 (16px) | p-5 (20px) | p-6 (24px) |
| Card grid gap | gap-4 (16px) | gap-6 (24px) | gap-8 (32px) |
| Form field gap | gap-4 (16px) | gap-5 (20px) | gap-6 (24px) |
| Nav item spacing | space-y-8 | N/A (desktop) | gap-1 (inline) |
| Component margin-bottom | mb-6 (24px) | mb-8 (32px) | mb-10 (40px) |
| Hero vertical padding | pt-24 pb-16 | pt-32 pb-20 | pt-40 pb-24 |
| Bottom page padding | pb-24 (for bottom nav) | pb-8 | pb-8 |

### Mobile Compression Rules
- `py-24 md:py-32` sections -> `py-16 md:py-24 lg:py-32` (compress mobile, expand desktop)
- Inner containers: reduce max-w on mobile (already fluid via percentage widths)
- Listing detail grid: `gap-12` -> `gap-6 md:gap-8 lg:gap-12`
- Profile sections: `gap-8` -> `gap-6 md:gap-8`

### Safe Area Insets
```css
/* Bottom nav + safe area */
.pb-safe-bottom {
  padding-bottom: calc(4rem + env(safe-area-inset-bottom, 0px));
}

/* Top (for notched phones) */
.pt-safe-top {
  padding-top: env(safe-area-inset-top, 0px);
}
```

---

## Section 9: Image Strategy

### Aspect Ratios Per Breakpoint

| Context | Mobile | Tablet (md) | Desktop (lg+) |
|---------|--------|-------------|----------------|
| Listing card (grid) | aspect-[16/10] | aspect-[4/3] | aspect-[4/3] |
| Listing card (carousel) | aspect-[3/4] | N/A | N/A |
| Hero/Featured image | aspect-[16/9] | aspect-[16/9] | aspect-[21/9] |
| Gallery main image | h-[300px] | h-[400px] | h-[500px] |
| Gallery grid images | hidden | visible, aspect-square | visible, aspect-square |
| Profile avatar | w-28 h-28 | w-32 h-32 | w-40 h-40 |
| Curated Corners cards | aspect-[3/4] | aspect-[3/4] | aspect-[4/5] |
| Recently Discovered thumb | w-24 h-24 | w-28 h-28 | w-32 h-32 |

### Lazy Loading with Warm Shimmer
```
Placeholder:
  bg: surface-container-high (#eae8e3) (warm, not cold gray)
  Animation: shimmer -- linear gradient sweep
    from: #eae8e3
    via: #fbf9f4 (surface-canvas, lighter warm)
    to: #eae8e3
  Duration: 2s infinite linear
  Direction: left-to-right

Implementation:
  All images use next/image with:
    loading="lazy" (except first visible card which gets priority)
    placeholder="empty" (CSS handles the shimmer bg)
    sizes prop with responsive srcSet:
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
```

### srcSet/sizes Configuration
```tsx
// Listing card images
sizes="(max-width: 640px) calc(100vw - 32px), (max-width: 1024px) calc(50vw - 24px), calc(33vw - 32px)"

// Hero images
sizes="100vw"

// Gallery thumbnails
sizes="(max-width: 768px) 0px, (max-width: 1024px) 25vw, 20vw"
// 0px on mobile because they're hidden
```

### Max Heights on Mobile
```
Gallery: max-h-[300px] md:max-h-[500px]
Hero: max-h-[50vh] md:max-h-[60vh]
Curated Corners: max-h-[360px]
```

---

## Section 10: Touch Interactions

### Swipe Gestures
```
Curated Corners carousel:
  CSS: scroll-snap-type: x mandatory
  Cards: scroll-snap-align: start
  touch-action: pan-x (allow horizontal swipe, prevent vertical)
  Deceleration: -webkit-overflow-scrolling: touch (iOS momentum)

Image carousel (listing cards):
  Already uses Embla Carousel -- keep existing implementation
  Style update: dot indicators in primary (#9a4027) active, outline-variant inactive

Bottom sheet:
  Existing touch handling in MobileBottomSheet.tsx is solid
  Style update: drag handle color -> outline-variant (#dcc1b9)
```

### Pull-to-Refresh
```
Existing PullToRefresh component -- keep logic
Style update:
  Spinner: primary (#9a4027) color
  Use warm circular spinner (not default browser)
  Container: surface-canvas (#fbf9f4) bg during pull
```

### Touch-Friendly Spacing
```
All interactive elements: min-h-[44px] min-w-[44px] (WCAG 2.5.5 AA)
Already enforced via .touch-target class in globals.css
Ensure all redesigned buttons/links meet this:
  - Bottom nav items: checked (h-16 row, items centered)
  - Filter chips: px-3 py-1.5 with min-h[32px] -- increase to min-h-[36px]
  - Card action buttons (heart, score): checked (w-10 h-10 minimum)
```

### Button Press States
```
Scale: active:scale-[0.97] (subtle press feedback, transform-only for perf)
Duration: transition-transform 100ms ease
No brightness filter (triggers repaint -- prefer transform-only)

For primary gradient buttons specifically:
  active:shadow-inner active:shadow-[#9a4027]/30
  (static CSS state change, not animated -- no perf concern)
```

---

## Section 11: Mobile Bottom Sheet

### Current State
- `MobileBottomSheet.tsx`: 3 snap points (15%, 50%, 85%), spring animation, drag handle, framer-motion.
- `FloatingMapButton.tsx`: Toggle pill between map/list.
- Map always visible behind sheet on mobile.
- Sheet uses `bg-white`, `rounded-t-2xl`, `shadow` up (dark mode being removed).

### Editorial Redesign Plan

#### Sheet Styling
```
Background: surface-container-lowest (#ffffff)
  Glassmorphism: bg-surface-container-lowest/95 backdrop-blur-[16px]
  (Single theme only -- no dark variant)
Border-top-radius: rounded-t-2xl (keep)
Shadow: shadow-[0_-4px_24px_rgba(0,0,0,0.08)] (softer, warmer)
```

#### Drag Handle
```
Shape: w-10 h-1 rounded-full (slightly thinner than current w-12 h-1.5)
Color: outline-variant (#dcc1b9)
Margin: mx-auto mt-2 mb-3
Active (dragging): primary (#9a4027) color, w-12 (expands on grab)
Transition: width 200ms, background-color 200ms
```

#### Sheet Header
```
Text: Manrope, font-semibold, text-sm, on-surface
"Pull up for listings" hint: Manrope, text-xs, on-surface-variant
Expand/Collapse button: Manrope uppercase, text-xs, primary color
Close X: on-surface-variant, hover:on-surface, w-8 h-8 touch target
```

#### Snap Points (Keep Existing Values)
```
Collapsed: 15dvh (SNAP_COLLAPSED = 0.15) -- shows handle + header
Half: 50dvh (SNAP_HALF = 0.5) -- shows ~3-4 card previews
Expanded: 85dvh (SNAP_EXPANDED = 0.85) -- near full screen
```

**Adjustment for bottom nav:** When bottom nav bar is present, effective viewport for sheet calculations remains the same (sheet sits above the bottom nav via z-index layering). The bottom nav has `z-sticky (1100)`, sheet at `z-[40]` normally and `z-[1200]` when expanded. When collapsed, the handle should be visible above the bottom nav -- may need to increase SNAP_COLLAPSED slightly to 0.18 to account for the ~64px bottom nav.

---

## Section 12: Responsive Component Variants

### Component-by-Component Responsive Map

#### NavbarClient.tsx
| Breakpoint | Behavior |
|------------|----------|
| base | Logo icon only, hamburger menu, no center links, no notification/message icons |
| sm | Logo text appears (`hidden sm:block`), padding increases |
| md | Notification + message icons appear (`hidden md:flex`) |
| lg | Center nav links appear (`hidden lg:flex`), hamburger hidden (`lg:hidden`), full profile dropdown |
| **Redesign** | Add: warm editorial colors, Newsreader logo text, full-screen glassmorphism overlay for mobile menu |

#### SearchViewToggle.tsx
| Breakpoint | Behavior |
|------------|----------|
| base | Map fills background, MobileBottomSheet overlay, FloatingMapButton |
| md | Side-by-side split: list 55% + map 45%, no bottom sheet, desktop toggle button |
| **Redesign** | Warm styling on toggle buttons, editorial map pin styles, connection score visible on map pins |

#### SearchForm.tsx
| Breakpoint | Behavior |
|------------|----------|
| base | Stacked vertical fields in rounded-3xl container, full-width search button with text |
| md | Horizontal pill with dividers, fields inline, compact search icon-only button |
| **Redesign** | Ghost border, warm search icon, Newsreader placeholders, editorial filter chips below |

#### ListingCard.tsx
| Breakpoint | Behavior |
|------------|----------|
| base | Full-width, rounded-none, aspect-[16/10], p-5 content, border-bottom separator |
| sm | rounded-xl outer, rounded-2xl inner, aspect-[4/3], p-6 content |
| **Redesign** | rounded-lg always (even mobile), Connection Score badge top-right, warm shadow, editorial typography |

#### MobileBottomSheet.tsx
| Breakpoint | Behavior |
|------------|----------|
| base | Visible, 3 snap points, drag handle, pull-to-refresh |
| md | Hidden (`md:hidden` via parent), desktop split view takes over |
| **Redesign** | Glassmorphism bg, warm drag handle, editorial header text |

#### MessagesPageClient.tsx
| Breakpoint | Behavior |
|------------|----------|
| base | Thread list full-width when no active thread, thread detail full-width when active, back button |
| md | Side-by-side: thread list w-[400px] + detail flex-1 |
| **Redesign** | Warm colors, editorial typography, primary accent for unread indicators |

#### ImageGallery.tsx
| Breakpoint | Behavior |
|------------|----------|
| base | Single image, h-[400px], "Show all" button bottom-right (`md:hidden`) |
| md | 2-col or 4-col grid with thumbnails, h-[500px] |
| **Redesign** | Warm shimmer loading, rounded-xl, editorial "Show all" button styling |

#### Footer.tsx
| Breakpoint | Behavior |
|------------|----------|
| base | 2-col grid, stacked copyright/links |
| sm | 3-col grid |
| md | 6-col grid, inline copyright row |
| **Redesign** | Surface-canvas bg, warm colors, Newsreader brand text, Manrope body |
| **Mobile note** | Add pb-20 to ensure footer clears bottom nav bar |

#### BookingCalendar.tsx
| Breakpoint | Behavior |
|------------|----------|
| base | Stacked: calendar on top, details below (flex-col) |
| md | Side-by-side: calendar + details panel (flex-row), details w-80 with left border |
| **Redesign** | Primary accent for selected dates, warm borders, editorial typography |

#### ProfileClient.tsx
| Breakpoint | Behavior |
|------------|----------|
| base | Stacked: avatar centered, text centered, single-col sections |
| sm | Slightly larger avatar (w-32), rounded-[2rem] cards |
| md | Avatar + text side-by-side (flex-row), left-aligned, larger avatar (w-40) |
| lg | 3-col grid: sidebar 1-col + content 2-col |
| **Redesign** | Warm card backgrounds, editorial typography, Connection Score badge on profile |

#### Auth Pages (Login/Signup)
| Breakpoint | Behavior |
|------------|----------|
| base | Full-width form, centered, no side panel |
| sm | Slightly wider spacing |
| lg | Split layout: decorative panel left 50% + form right 50% |
| **Redesign** | Warm decorative panel (surface-canvas bg with editorial illustration), ghost-border inputs, gradient CTA button |

---

## Implementation Priority

1. **P0 -- Bottom Nav Bar** (new component, impacts all page padding)
2. **P0 -- Mobile Navigation Overlay** (replaces current slide-down menu)
3. **P0 -- Listing Card Mobile Variant** (most visible component)
4. **P1 -- Search Experience** (search bar, collapsed bar, filter chips)
5. **P1 -- Bottom Sheet Restyling** (glassmorphism, warm handle)
6. **P1 -- Form Styling** (inputs, buttons, CTAs)
7. **P2 -- Home Page Sections** (Curated Corners, Recently Discovered)
8. **P2 -- Font Size + Spacing Adjustments** (global pass)
9. **P2 -- Image Strategy** (warm shimmer, srcSet optimization)
10. **P3 -- Touch Interaction Polish** (press states, swipe refinements)

---

## Cross-Team Alignment Notes

### For component-redesigner (#2):
- ListingCard needs a `variant="mobile"` or responsive prop for Connection Score badge placement
- New BottomNavBar component needed
- CollapsedMobileSearch full restyle
- FloatingMapButton color change to primary
- MobileBottomSheet glassmorphism + warm handle

### For pages-redesigner (#3):
- All pages need `pb-20 md:pb-0` for bottom nav clearance on mobile
- Home page: new Curated Corners and Recently Discovered sections (mobile-first layout)
- Search page: filter chips below search bar, adjusted map toggle position
- Listing detail: Connection Score badge, responsive grid gap compression
- Auth pages: ghost-border inputs, gradient CTA

### For animation-polish (#5):
- Mobile constraints: NO parallax effects on mobile (performance)
- Simplify transitions: 200-300ms max on mobile (vs 500ms desktop)
- Bottom sheet spring animation: keep existing SPRING_CONFIG (stiffness:400, damping:30) -- already optimized
- Full-screen nav overlay: stagger children animation (50ms delay each), fade+slide-up
- Connection Score badge: subtle scale-in on card enter (100ms spring)
- prefers-reduced-motion: already handled globally in globals.css -- all animations killed
- Carousel snapping: CSS-only (scroll-snap), no JS animation needed
