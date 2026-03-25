# Page-Level Redesign Specification: Editorial Living Room Aesthetic

> Every route in the app, mapped from current state to new editorial design.
> PLAN MODE ONLY -- no file edits.

---

## Section 1: Root Layout Changes

### File: `src/app/layout.tsx`

**Current state:**
- Font: Inter (localFont, variable `--font-inter`)
- Body class: `inter.className` (sans-serif only)
- Theme: Providers wraps a dark/light theme provider (likely next-themes)
- Viewport themeColor: `#ffffff` light / `#09090b` dark
- Background: inherited from children (no explicit body bg)
- Structure: `<html> > <body> > <Providers> > <SkipLink> > <CustomScrollContainer> > flex-col min-h-screen > Navbar + MainLayout(children) + Footer`

**Editorial redesign:**

| Change | Details |
|--------|---------|
| **Fonts** | Replace Inter with **Newsreader** (serif, variable, for Display/Headlines) + **Manrope** (sans, variable, for Body/Titles/Labels). Load both via `next/font/google`. Body gets `manrope.className` as base. Newsreader available via `--font-newsreader` CSS variable. |
| **Body background** | Set `bg-surface-canvas` (`#fbf9f4`) as the default body background. Remove white/zinc-950 bg patterns. |
| **Theme removal** | Strip dark mode entirely. Remove `suppressHydrationWarning`, `dark:` prefixes project-wide, and next-themes provider. The Editorial Living Room is a light-only design. |
| **Viewport themeColor** | Change to `#fbf9f4` (surface-canvas). Remove dark media query entry. |
| **Text color** | Default body text: `text-on-surface` (`#1b1c19`). Never use `#000000`. |
| **Selection color** | `selection:bg-primary selection:text-on-primary` (terracotta selection). |
| **Metadata** | Title: "RoomShare -- Find Your People, Not Just a Place". Description updated to editorial tone. |
| **Scroll container** | Keep `CustomScrollContainer` but restyle scrollbar to warm tones (surface-container-high track, primary thumb). |

### Font Provider Setup (new)
```
Newsreader: weights 300-700, italic, display: swap, variable: --font-newsreader
Manrope: weights 300-700, display: swap, variable: --font-manrope
```

---

## Section 2: Homepage Redesign

### Files: `src/app/page.tsx`, `src/app/HomeClient.tsx`, `src/components/FeaturedListings.tsx`

**Current state:**
- Hero: "Love where you live." in Inter, 5xl-7xl, zinc-900, centered, badge "Now in 12 cities", SearchForm below, cinematic Unsplash image (21/9 aspect, hidden on mobile)
- Scroll Animation: dark bg-zinc-950 "walk through the door" immersive section
- Features: "Why people switch to RoomShare" -- 3 cards (ShieldCheck, Zap, Coffee) in grid, zinc-50 bg
- CTA: "Your next roommate is already here" with two buttons (Create Profile + See Rooms Near You)
- FeaturedListings: "Featured" label, grid of 6 listing cards, white bg with zinc borders
- All uses framer-motion (LazyMotion, m. components)

**Editorial redesign -- section by section:**

### 2.1 Hero Section
- **Background:** `surface-canvas` (`#fbf9f4`), no image behind hero text
- **Heading:** Newsreader display-lg (clamp 3rem-5.5rem), regular weight with italic emphasis:
  > "Finding *Your* People, Not Just a Place"
  - "Your" in Newsreader italic, rest in Newsreader regular
  - Color: `on-surface` (`#1b1c19`)
- **Subheading:** Manrope body-lg, `on-surface-variant` (`#4a4941`), font-light, max-w-2xl
  > "Verified roommates. Real listings. People who actually show up to the tour."
- **Badge:** Remove "Now in 12 cities" pill. Replace with a small Manrope uppercase label above heading: `FIND YOUR PEOPLE` in `on-surface-variant`, 0.05em tracking
- **Search bar:** Glassmorphism treatment:
  - `surface-container-lowest` (`#ffffff`) bg with `backdrop-blur-xl`
  - Ghost border: `border border-outline-variant/20` (warm rose-beige at 20% opacity)
  - `rounded-2xl` with ambient shadow (`shadow-[0_8px_40px_rgba(27,28,25,0.06)]`)
  - Input text in Manrope, placeholder in `on-surface-variant`
  - Search button: gradient CTA (`bg-gradient-to-r from-primary to-primary-container`, `#9a4027` to `#b9583c`), `rounded-full`, `text-on-primary` (`#ffffff`)
- **CTA below search (logged out):** "New here? Create an account" -- Manrope body, `on-surface-variant` for "New here?", link in `primary` (`#9a4027`) with underline-offset-4
- **Mobile search:** Hero search bar is `hidden md:block` in current code. On mobile, search is handled by `CollapsedMobileSearch` (compact bar) + `MobileSearchOverlay` (full-screen). See mobile plan Sections 3 for editorial restyling of these mobile search components.
- **Cinematic image:** Keep but restyle -- `rounded-2xl` (not 2rem), warm-toned overlay: `bg-gradient-to-t from-surface-canvas/20 to-transparent`. Remove harsh shadow; use ambient shadow instead. `hidden md:block` (desktop only).

### 2.2 Scroll Animation Section
- **Keep dark cinematic background:** The dark canvas is functionally necessary for frame sequence image readability and creates an immersive "theater mode" experience (Apple-style). Do NOT replace with cream/warm bg.
- Background: Keep near-black (`#0a0a0b` or similar) as the scroll animation container background
- **Editorial warmth via:** Newsreader serif text overlays, warm easing curves (`--ease-editorial`), editorial timing (slower reveals)
- Text overlays: Newsreader display-sm headings, white text with warm drop-shadow
- Scroll hint: warm-toned bounce animation, `primary` accent dot

### 2.3 "Why People Switch" Features Section
- **Rename section title:** "Cozy Spaces, Real People" (Newsreader display-md)
- **Background:** `surface-container-high` (`#eae8e3`)
- **Section label:** Manrope uppercase label `WHY ROOMSHARE` above title, `on-surface-variant`, 0.05em tracking
- **Feature cards:** 3-column grid
  - Each card: `surface-container-lowest` (`#ffffff`) bg
  - No borders -- use ambient shadow: `shadow-[0_4px_24px_rgba(27,28,25,0.04)]`
  - `rounded-xl` (min rounded-lg per design rules)
  - `p-8` padding, spacing-only separation (no dividers)
  - Icon: 48x48 circle in `primary/10` bg with `primary` icon color
  - Title: Manrope title-md, `on-surface`
  - Description: Manrope body-md, `on-surface-variant`, font-light

### 2.4 AI Connection Section (NEW)
- **Asymmetric layout:** 60/40 split on desktop (`md:grid md:grid-cols-5`, left col-span-3, right col-span-2)
- Left: Newsreader display-md heading "AI for Human Connection", Manrope body text explaining compatibility matching
- Right: Warm terracotta accent block (`primary-container` bg, rounded-2xl), editorial illustration or abstract warm graphic
- Background: `surface-canvas`
- Large whitespace: `py-16 md:py-20` (spacing-16 mobile, spacing-20 desktop)
- **Mobile:** Stack vertically (`flex flex-col`), text first, accent block second. Full-width accent block with `rounded-xl`, reduced height. `gap-8` between elements.

### 2.5 Testimonial Section (NEW)
- **Background:** Warm gradient overlay: `bg-gradient-to-br from-primary to-primary-container` (`#9a4027` to `#b9583c`)
- **Quote:** Newsreader italic display-sm, `on-primary` (`#ffffff`)
- **Avatar:** 80x80 `rounded-full`, warm border: `border-4 border-on-primary/20`
- **Attribution:** Manrope body-sm, `on-primary/80`
- **Layout:** Centered, max-w-3xl, generous padding `py-24`

### 2.6 Neighborhoods Mosaic (NEW)
- **Section label:** Manrope uppercase `EXPLORE NEIGHBORHOODS`, `on-surface-variant`
- **Title:** Newsreader display-md "Where Will You Land?"
- **Desktop grid (lg+):** Mosaic layout (CSS grid with variable row/col spans):
  - First item: 2x2 span (large)
  - Remaining: 1x1 or 1x2 (varied)
- Each tile: warm-toned image, `rounded-xl`, overlay gradient `from-on-surface/60 to-transparent` at bottom
  - Location name: Newsreader title-lg, `on-primary` (white)
  - Listing count: Manrope label, `on-primary/80`
- Background: `surface-canvas`
- **Mobile (< sm):** Single-row horizontal scroll carousel (`flex gap-4 overflow-x-auto snap-x snap-mandatory`), cards at `w-[260px] flex-shrink-0 snap-start`, `aspect-[3/4]`. No grid -- phones < 375px cannot fit 2-col with Newsreader overlay text. See mobile plan Section 5 "Curated Corners" for full carousel spec.
- **Tablet (sm to lg):** 2-col grid (`sm:grid sm:grid-cols-2 gap-4`), mosaic tiles at equal size.
- **Desktop (lg+):** Full mosaic grid with variable row/col spans as described above.

### 2.7 Featured Listings Grid
- **Section label:** Manrope uppercase `CURATED SPACES`, `on-surface-variant`
- **Title:** Newsreader display-md "Cozy Spaces, Real People"
- **Cards:** Editorial listing cards (delegate to component-redesigner):
  - `surface-container-lowest` bg, ambient shadow, no border
  - `rounded-xl` image, Manrope body
  - Price: Manrope title-md, `on-surface`
  - Location: Manrope body-sm, `on-surface-variant`
- **CTA link:** "See all listings" in Manrope, `primary` color, arrow icon
- Background: `surface-canvas`

### 2.8 Newsletter CTA Section
- **Background:** `surface-container-high` (`#eae8e3`)
- **Heading:** Newsreader display-sm "Stay in the Loop"
- **Body:** Manrope body-md, `on-surface-variant`
- **Input + button:**
  - Input: `surface-container-lowest` bg, ghost border, `rounded-full`
  - Button: gradient CTA (`from-primary to-primary-container`), `rounded-full`, Manrope label uppercase
- **Layout:** Centered, max-w-xl, `py-20`

### 2.9 Footer
- **Background:** `surface-container-high` (`#eae8e3`)
- **No dividers** between sections -- spacing only (gap-16)
- **Brand:** "RoomShare" in Manrope semibold + terracotta dot (`.` in `primary`)
- **Tagline:** "Find your people, not just a place." Manrope body-sm, `on-surface-variant`
- **Link groups:** Manrope body-sm, `on-surface-variant`, hover: `on-surface`
- **Section headers:** Manrope uppercase label, `on-surface`, 0.2em tracking
- **Copyright:** Manrope body-xs, `on-surface-variant`

### 2.10 Homepage Loading Skeleton
- **Current:** zinc-200 pulse blocks
- **New:** Warm shimmer -- `surface-container-high` to `surface-canvas` pulse animation
  - Skeleton shapes use `rounded-xl` minimum
  - Replace `animate-pulse` with custom warm shimmer keyframe

---

## Section 3: Search Page Redesign

### Files: `src/app/search/page.tsx`, `src/app/search/layout.tsx`, `src/app/search/loading.tsx`

**Current state:**
- Layout: Full-height split view (list + map), fixed search header with backdrop-blur, white/zinc-950 bg
- Header: white/95 bg, zinc border, fixed at top with z-1100
- Results: h1 count, subtitle, SortSelect + SaveSearchButton, SearchResultsClient grid
- CategoryBar + RecommendedFilters + AppliedFilterChips above results
- Map: Side panel (SearchLayoutView manages toggle)
- Bounds-required: amber icon, zinc bg empty state
- Rate limit: simple text message

**Editorial redesign:**

### 3.1 Search Layout
- **Background:** `surface-canvas` (`#fbf9f4`) for entire search view
- **Fixed header:**
  - `surface-container-lowest/95` (`#ffffff/95`) with `backdrop-blur-xl`
  - No bottom border -- use ambient shadow: `shadow-[0_1px_8px_rgba(27,28,25,0.04)]`
  - z-index remains high
- **Split divider:** No visible border between list and map -- use shadow or just spacing

### 3.2 Search Header / Filter Bar
- **Search input:** Glassmorphism style matching homepage search bar
- **Filter chips:** `surface-container-lowest` bg, ghost border (`border-outline-variant/20`), `rounded-full`
  - Active state: `primary` bg, `on-primary` text
  - Manrope label uppercase, 0.05em tracking
- **Applied filter chips:** `primary/10` bg, `primary` text, `rounded-full`, remove button with `primary` X

### 3.3 Category Bar
- **Tabs:** Manrope label, `on-surface-variant` default, `on-surface` active
- Active indicator: `primary` bottom line (2px), not a full bg change
- No borders -- spacing between items only

### 3.4 Results Header
- **Count heading:** Newsreader title-lg: `"42 places in 'San Francisco'"`
- **Subtitle:** Manrope body-sm, `on-surface-variant`: "Find the perfect sanctuary..."
- **Sort/Save buttons:** `surface-container-lowest` bg, ghost border, `rounded-lg`, Manrope label

### 3.5 Listing Cards in Results
- (Delegate detailed card spec to component-redesigner)
- Summary: `surface-container-lowest` bg, ambient shadow, `rounded-xl`, no border
- Image: `rounded-lg` top, warm overlay on hover
- Price: Manrope title-md, `on-surface`
- Location: Manrope body-sm, `on-surface-variant`
- Save heart: `primary` color when saved

### 3.6 Map Styling
- Map tiles: Apply warm tint via map style overlay or custom map theme
- Map markers: `primary` color pin, `on-primary` text
- Hover card on marker: `surface-container-lowest` bg, ambient shadow, Newsreader title, Manrope body

### 3.7 Empty / Bounds-required / Rate-limit States
- Icon: Warm illustration or editorial icon in `primary/10` circle
- Heading: Newsreader title-lg, `on-surface`
- Body: Manrope body-md, `on-surface-variant`
- CTA button: gradient CTA style
- Background: `surface-canvas`

### 3.8 Search Loading Skeleton
- Use warm shimmer (`surface-container-high` pulse to `surface-canvas`)
- Card placeholders: `rounded-xl`, matching the result card dimensions

---

## Section 4: Listing Detail Redesign

### Files: `src/app/listings/[id]/page.tsx`, `ListingPageClient` (delegated rendering)

**Current state:**
- Server component fetches listing, reviews, coordinates, similar listings, booked dates
- Renders `ListingPageClient` with all props
- JSON-LD structured data for SEO
- Not-found: basic gray text, blue link

**Editorial redesign:**

### 4.1 Image Gallery
- `rounded-2xl` images with warm overlay on hover
- Gallery grid: 1 large (2/3 width) + 2 stacked small (1/3 width), `gap-2`, all `rounded-xl`
- Lightbox: `surface-container-lowest` bg overlay, warm close button
- Mobile: Full-width swipeable carousel with dot indicators in `primary`

### 4.2 Listing Title & Location
- **Title:** Newsreader display-sm, `on-surface`
- **Location:** Manrope body-md with map-pin icon, `on-surface-variant`
- **Status badge (if not active):** `tertiary` (`#904917`) bg with `on-primary` text, Manrope label
- **Rating:** Star icon in `tertiary`, Manrope body-sm for count

### 4.3 Description & Details
- **Description:** Manrope body-md, `on-surface`, generous line-height (1.7), max-w-prose
- **Section headings:** Newsreader title-md, `on-surface`, margin-bottom spacing-4

### 4.4 Amenity Grid
- No borders, no dividers
- Grid of icon + label pairs, `gap-4`
- Icon: 36x36 circle, `primary/10` bg, `primary` icon
- Label: Manrope body-sm, `on-surface-variant`

### 4.5 Booking Sidebar
- **Desktop (lg+):** Sticky right sidebar (`sticky top-24`), `w-[380px]`
  - **Container:** `surface-container-lowest` (`#ffffff`), ambient shadow 40-60px blur, `rounded-2xl`
  - **Price:** Newsreader display-sm, `on-surface`, "/month" in Manrope body-sm `on-surface-variant`
  - **Date picker:** Ghost-border inputs (`border-outline-variant/20`), `rounded-lg`
  - **CTA button:** Gradient CTA (`from-primary to-primary-container`), `rounded-full`, Manrope label uppercase
  - **Breakdown:** Manrope body-sm, no dividers, spacing-3 between rows
  - Ghost borders at 20% for input containers
- **Mobile (< lg):** Fixed bottom CTA bar
  - `fixed bottom-0 left-0 right-0` (above bottom nav if present: `bottom-16 md:bottom-0`)
  - `surface-container-lowest` bg, `shadow-[0_-4px_24px_rgba(27,28,25,0.08)]` upward shadow
  - Compact: price left-aligned (Newsreader title-md), gradient CTA button right-aligned, single row
  - Tapping CTA scrolls to or opens a bottom sheet with full date picker + breakdown
  - `z-[1050]` (below search header, above content, below bottom nav at 1100)

### 4.6 Host Profile Card
- **Avatar:** 64x64 `rounded-full`, warm border: `border-2 border-outline-variant` (`#dcc1b9`)
- **Name:** Newsreader title-md, `on-surface`
- **Verified badge:** `primary` checkmark icon
- **Bio:** Manrope body-sm, `on-surface-variant`
- **Member since:** Manrope label, `on-surface-variant`
- **Message button:** Ghost button with `primary` border, `rounded-full`

### 4.7 Reviews Section
- **Section heading:** Newsreader title-lg, `on-surface`
- **Review card:** No border, `surface-container-lowest` bg, `rounded-xl`, `p-6`
- **Reviewer avatar:** 40x40 `rounded-full`
- **Rating stars:** `tertiary` (`#904917`) filled, `outline-variant` empty
- **Comment:** Manrope body-sm, `on-surface-variant`
- **Date:** Manrope label, `on-surface-variant`

### 4.8 Similar Listings
- **Section heading:** Newsreader title-lg "You Might Also Like"
- **Horizontal scroll:** 4 editorial cards, same style as search results cards
- Background: `surface-canvas`

### 4.9 Map Section
- **Desktop:** Warm-tinted interactive map with `primary` marker, `rounded-xl` container with ambient shadow
- **Mobile:** Static map image (screenshot or tile snapshot) with "View on map" button overlay. Saves Mapbox costs and improves mobile performance. Tapping opens full-screen map modal or navigates to search page centered on listing coordinates.
- Approximate location disclosure text: Manrope body-xs, `on-surface-variant`

### 4.10 Listing Not-Found (`listings/[id]/not-found.tsx`)
- **Current:** Gray text, blue link, minimal
- **New:** Centered layout, warm illustration
  - Heading: Newsreader title-lg "This listing has moved on"
  - Body: Manrope body-md, `on-surface-variant`
  - CTA: gradient button "Browse Listings", ghost button "Back to Home"
  - Background: `surface-canvas`

---

## Section 5: Auth Pages (Login / Signup / Forgot Password / Reset Password)

### Files: `src/app/login/LoginClient.tsx`, `src/app/signup/SignUpClient.tsx`, `src/app/forgot-password/`, `src/app/reset-password/`

**Current state:**
- Login/Signup: Split layout -- left half dark zinc-900 panel with testimonial, right half white form
- Forms: zinc borders, rounded-lg inputs, indigo accent dot on brand, uppercase labels, Google OAuth button
- Forgot/Reset: Delegate to client components (thin wrappers)

**Editorial redesign:**

### 5.1 Split Layout (Login & Signup)
- **Left panel:** Replace dark zinc-900 with warm editorial treatment:
  - Background: `primary` (`#9a4027`) to `primary-container` (`#b9583c`) gradient
  - Testimonial: Newsreader italic display-xs, `on-primary` (`#ffffff`)
  - Avatar: `rounded-full`, warm ghost border (`on-primary/20`)
  - Brand: "RoomShare." Manrope semibold, `on-primary`
  - Copyright: Manrope body-xs, `on-primary/60`
- **Right panel (form):**
  - Background: `surface-canvas` (`#fbf9f4`)
  - Heading: Newsreader display-xs ("Welcome back" / "Join RoomShare")
  - Subtitle: Manrope body-md, `on-surface-variant`

### 5.2 Form Styling
- **Inputs:** Ghost border (`border-outline-variant/20`), `surface-container-lowest` bg, `rounded-lg`
  - Focus: `border-primary`, `ring-primary/20`
  - Label: Manrope uppercase label, `on-surface-variant`, 0.05em tracking
  - Icon tint: `on-surface-variant`
- **Google button:** `surface-container-lowest` bg, ghost border, `rounded-lg`, Manrope body
- **Divider:** "or continue with email" -- no visible line, just Manrope label text centered with `surface-canvas` bg knockout over a ghost line (`on-surface/5`)
- **Submit button:** Gradient CTA (`from-primary to-primary-container`), `rounded-full`, Manrope label uppercase
- **Error alerts:** `tertiary/10` bg, `tertiary` text, `rounded-xl`, no harsh red
- **Success alerts:** `primary/10` bg, `primary` text

### 5.3 Forgot Password Page
- **Background:** `surface-canvas`
- **Card:** `surface-container-lowest`, ambient shadow, `rounded-2xl`, centered max-w-md
- **Heading:** Newsreader title-lg "Reset Your Password"
- **Body:** Manrope body-md, `on-surface-variant`
- **Input + button:** Same styling as login form
- **Back link:** Manrope body-sm, `on-surface-variant`, arrow-left icon

### 5.4 Reset Password Page
- Same card treatment as forgot password
- Heading: Newsreader title-lg "Set New Password"
- Password fields with strength meter (restyle meter to warm palette: `tertiary` weak, `primary` strong)

---

## Section 6: Dashboard Pages (Profile / Settings / Bookings / Messages)

### 6.1 Profile Page (`src/app/profile/page.tsx`, `ProfileClient`)
- **Background:** `surface-canvas`
- **Profile header:** Centered layout
  - Avatar: 120x120 `rounded-full`, `border-4 border-outline-variant` (`#dcc1b9`)
  - Name: Newsreader display-xs, `on-surface`
  - Bio: Manrope body-md, `on-surface-variant`
  - Verified badge: `primary` shield icon with "Verified" Manrope label
  - Edit button: Ghost button, `rounded-full`, `primary` border
- **Stats row:** Listings count, reviews, member since -- Manrope body-sm in `surface-container-lowest` cards
- **Listings grid:** Editorial cards matching search results style
- **Tab navigation:** Manrope label, `on-surface-variant` inactive, `on-surface` active, `primary` bottom indicator

### 6.2 Edit Profile (`src/app/profile/edit/page.tsx`, `EditProfileClient`)
- **Background:** `surface-canvas`
- **Form card:** `surface-container-lowest`, `rounded-2xl`, ambient shadow, `p-8`
- **Avatar upload:** 120x120 `rounded-full` with camera overlay icon on hover
- **Inputs:** Ghost borders, `rounded-lg`, Manrope labels
- **Save button:** Gradient CTA
- **Section dividers:** No lines -- `spacing-8` between form sections

### 6.3 Settings Page (`src/app/settings/page.tsx`, `SettingsClient`)
- **Current:** zinc-50 bg, Settings icon in indigo-100, zinc borders
- **New:**
  - Background: `surface-canvas`
  - Header icon: `primary/10` bg circle with `primary` Settings icon
  - Heading: Newsreader title-lg "Settings"
  - Back link: Manrope body-sm with arrow, `on-surface-variant`
  - **Settings sections:** `surface-container-lowest` cards, `rounded-xl`, ambient shadow
    - Section headers: Manrope title-sm, `on-surface`
    - Toggle switches: `primary` when active, `outline-variant` when inactive
    - Form inputs: Ghost borders
    - No dividers between settings items -- spacing-4 only
  - **Blocked users:** `surface-container-lowest` card, user avatars `rounded-full`
  - **Danger zone (delete account):** `tertiary/10` bg card, `tertiary` text

### 6.4 Bookings Page (`src/app/bookings/page.tsx`, `BookingsClient`)
- **Background:** `surface-canvas`
- **Tab bar:** "Sent" / "Received" tabs, Manrope label, `primary` active indicator
- **Booking cards:** `surface-container-lowest`, `rounded-xl`, ambient shadow
  - Listing image: `rounded-lg`, small (80x80)
  - Title: Manrope title-sm, `on-surface`
  - Date range: Manrope body-sm, `on-surface-variant`
  - Status badge: rounded-full pill
    - PENDING: `tertiary/10` bg, `tertiary` text
    - ACCEPTED: `primary/10` bg, `primary` text
    - REJECTED: `on-surface-variant/10` bg, `on-surface-variant` text
    - HELD: `outline-variant` bg, `on-surface-variant` text
  - Price: Manrope title-sm, `on-surface`
  - Action buttons: Ghost buttons with `primary` border, `rounded-full`
- **Empty state:** Warm illustration, Newsreader heading, gradient CTA to browse

### 6.5 Messages Page (`src/app/messages/page.tsx`, `MessagesPageClient`)
- **Background:** `surface-canvas`
- **Desktop layout (md+):** Side-by-side: conversation list `w-[400px]` + chat window `flex-1`
- **Mobile layout (< md):** Mutually exclusive views:
  - No active conversation: Full-width conversation list
  - Active conversation: Full-width chat window with back button
  - Toggle pattern: `activeId ? "hidden md:flex" : "flex"` on conversation list, inverse on chat window
- **Conversation list:**
  - Items: `surface-container-lowest` bg, `rounded-xl`, no border
  - Hover: `surface-container-high` bg
  - Active: `primary/5` bg, `primary` left accent (3px `rounded-full` bar)
  - Avatar: 48x48 `rounded-full`
  - Name: Manrope title-sm, `on-surface`
  - Last message: Manrope body-sm, `on-surface-variant`, truncated
  - Timestamp: Manrope label, `on-surface-variant`
  - Unread dot: `primary` 8x8 circle
- **Chat window (messages/[id]):**
  - Header: Other user name in Manrope title-sm, avatar 36x36 `rounded-full`
  - **Mobile header:** Back arrow button (left), avatar + name (center), `surface-container-lowest` bg with ambient shadow
  - Messages:
    - Sent: `primary` bg, `on-primary` text, `rounded-2xl rounded-br-md`
    - Received: `surface-container-high` bg, `on-surface` text, `rounded-2xl rounded-bl-md`
  - Input: Ghost border, `surface-container-lowest` bg, `rounded-full`
  - Send button: `primary` bg, `rounded-full`

---

## Section 7: Content Pages (About / Privacy / Terms)

### Files: `src/app/about/page.tsx` (AboutClient), `src/app/privacy/page.tsx` (PrivacyClient), `src/app/terms/page.tsx` (TermsClient)

**Current state:** Thin wrappers delegating to client components.

**Editorial redesign (shared treatment):**

- **Background:** `surface-canvas`
- **Content card:** `surface-container-lowest`, `rounded-2xl`, ambient shadow, max-w-3xl centered
- **Heading:** Newsreader display-sm, `on-surface`
- **Subheadings (h2):** Newsreader title-lg, `on-surface`, `mt-12 mb-4`
- **Subheadings (h3):** Manrope title-md, `on-surface`, `mt-8 mb-3`
- **Body text:** Manrope body-md, `on-surface`, `leading-7` (1.75), max-w-prose
- **Links:** `primary` color, `underline-offset-4`, `decoration-primary/40` hover: `decoration-primary`
- **Lists:** Manrope body-md, `on-surface-variant`, `space-y-2`, custom bullet: `primary` dot
- **Blockquotes:** `border-l-4 border-primary/30`, `pl-6`, Newsreader italic, `on-surface-variant`
- **Horizontal rules:** None -- use `spacing-12` gaps between sections
- **Last updated:** Manrope label, `on-surface-variant`, top of page

### About Page (specific additions)
- Hero: Newsreader display-md "About RoomShare", `surface-canvas` bg, editorial layout
- Team / values grid: `surface-container-lowest` cards, Newsreader titles, Manrope body
- "How It Works" section: 3-step editorial flow with Newsreader numbers and warm accents

---

## Section 8: Utility Pages (Saved / Saved Searches / Recently Viewed / Notifications)

### 8.1 Saved Listings (`src/app/saved/page.tsx`, `SavedListingsClient`)
- **Background:** `surface-canvas`
- **Grid:** Editorial listing cards matching search results
- **Empty state:**
  - Warm heart icon in `primary/10` circle
  - Newsreader title-lg "No saved places yet"
  - Manrope body-md, `on-surface-variant`
  - Gradient CTA "Start Exploring"

### 8.2 Saved Searches (`src/app/saved-searches/page.tsx`, `SavedSearchList`)
- **Current:** zinc-900 icon box, zinc borders, zinc bg
- **New:**
  - Background: `surface-canvas`
  - Header icon: `primary` bg `rounded-xl` with `on-primary` Bookmark icon
  - Heading: Newsreader title-lg "Saved Searches"
  - Count: Manrope body-sm, `on-surface-variant`
  - **Search items:** `surface-container-lowest` cards, `rounded-xl`, ambient shadow
    - Search name: Manrope title-sm, `on-surface`
    - Filter summary: Manrope body-sm, `on-surface-variant`
    - Run search button: Ghost button, `primary` border, `rounded-full`
    - Delete button: `on-surface-variant` trash icon, hover: `tertiary`
  - **Empty state:** Warm bookmark icon, Newsreader heading, gradient CTA

### 8.3 Recently Viewed (`src/app/recently-viewed/page.tsx`, `RecentlyViewedClient`)
- Same editorial card grid treatment as Saved Listings
- Header: Newsreader title-lg "Recently Viewed"
- Timestamp indicator: Manrope label, `on-surface-variant` "Viewed 2h ago"

### 8.4 Notifications (`src/app/notifications/page.tsx`, `NotificationsClient`)
- **Background:** `surface-canvas`
- **Notification items:** `surface-container-lowest` bg, `rounded-xl`, no border
  - Unread: `primary` accent dot (8px circle) on left edge
  - Read: no accent
  - Icon: contextual icon in `primary/10` circle
  - Title: Manrope title-sm, `on-surface`
  - Body: Manrope body-sm, `on-surface-variant`
  - Time: Manrope label, `on-surface-variant`
  - Hover: `surface-container-high` bg
- **Mark all read:** Ghost button, `primary` border, `rounded-full`
- **Empty state:** Warm bell icon, Newsreader heading

---

## Section 9: Admin Pages

### Files: `src/app/admin/page.tsx`, `admin/users/`, `admin/reports/`, `admin/audit/`, `admin/listings/`, `admin/verifications/`

**Current state:** Functional admin with zinc-50 bg, colored stat card icons (blue/green/purple/etc), zinc borders and dividers, basic data tables.

**Editorial redesign (maintain functionality, warm aesthetic):**

### 9.1 Admin Dashboard
- **Background:** `surface-canvas`
- **Heading:** Newsreader display-xs "Admin Dashboard"
- **Stat cards:** `surface-container-lowest`, `rounded-xl`, ambient shadow
  - Icon circles: Use warm palette instead of rainbow:
    - Users/Verified: `primary/10` bg, `primary` icon
    - Listings: `tertiary/10` bg, `tertiary` icon
    - Verifications: `outline-variant` bg, `on-surface-variant` icon
    - Reports: `tertiary` bg, `on-primary` icon (alert state)
    - Bookings/Messages: `primary-container/10` bg, `primary-container` icon
  - Value: Manrope display-xs, `on-surface`
  - Label: Manrope body-sm, `on-surface-variant`
  - Alert indicator: `tertiary` dot instead of amber
- **Quick Actions:** `surface-container-lowest` card, `rounded-xl`
  - No dividers -- `gap-1` between items
  - Hover: `surface-container-high` bg
  - Icons: 40x40 `rounded-lg`, `surface-container-high` bg, `on-surface-variant` icon
  - Count badges: `tertiary/10` bg, `tertiary` text, `rounded-full`
- **Activity section:** `surface-container-lowest` card, `rounded-xl`

### 9.2 Admin Sub-pages (Users, Listings, Reports, Verifications, Audit)
- **Shared layout:**
  - Background: `surface-canvas`
  - Back link: Manrope body-sm, `on-surface-variant`, arrow-left
  - Header icon: Warm-themed circle (same palette as dashboard stats)
  - Heading: Newsreader title-lg
  - Subtitle: Manrope body-sm, `on-surface-variant`

- **Data tables (Audit, Reports):**
  - `surface-container-lowest` card, `rounded-xl`, ambient shadow
  - **Header row:** Manrope label uppercase, `on-surface-variant`, 0.05em tracking
    - No visible border -- `surface-container-high` bg for header row
  - **Data rows:** No dividers -- use alternating bg (odd: `surface-container-lowest`, even: `surface-canvas`)
  - Hover: `surface-container-high`
  - Status badges: `rounded-full`, warm palette
  - Pagination: Ghost border buttons, `rounded-lg`

- **Filter chips (Audit):**
  - Default: `surface-container-high` bg, `on-surface-variant` text, `rounded-lg`
  - Active: `primary` bg, `on-primary` text
  - Manrope label, no uppercase

- **User/Listing lists (mobile-first requirement):**
  - **Mobile (< md):** Card-based layout only (no tables). Each item is a `surface-container-lowest` card, `rounded-xl`, ambient shadow, stacked vertically. Avatar/image inline with text. Action buttons collapse into a kebab menu or single primary action.
  - **Desktop (md+):** Can render as data table with horizontal scroll as fallback, or keep card layout. Cards preferred for consistency.
  - `surface-container-lowest` cards, `rounded-xl`, ambient shadow
  - Avatar/image: `rounded-lg`
  - Action buttons: Ghost style, `primary` border, `rounded-full`

- **Data tables mobile behavior:**
  - Tables (Audit, Reports) get `overflow-x-auto` on mobile with horizontal scroll indicator
  - Consider collapsing non-essential columns on mobile (hide Details, show only Action + Target + Time)
  - Pagination: full-width buttons on mobile, inline on desktop

---

## Section 10: Error / Loading / Not-Found States

### 10.1 Global Error (`src/app/error.tsx`)
- **Current:** Red-100 circle with AlertTriangle, zinc text, Button components
- **New:**
  - Background: `surface-canvas`
  - Icon: Warm editorial illustration or abstract shape in `tertiary/10` circle (80x80)
  - Heading: Newsreader title-lg "Something went sideways", `on-surface`
  - Body: Manrope body-md, `on-surface-variant`
  - "Try again" button: Gradient CTA, `rounded-full`
  - "Go to homepage" button: Ghost button, `primary` border, `rounded-full`
  - Help text: Manrope body-xs, `on-surface-variant`

### 10.2 Global Not-Found (`src/app/not-found.tsx`)
- **Current:** Zinc circle with Home icon, "This page packed up and moved out"
- **New:**
  - Background: `surface-canvas`
  - Illustration: Warm abstract shape or editorial "404" in Newsreader display-lg, `primary/20`
  - Heading: Newsreader title-lg "This page packed up and moved out"
  - Body: Manrope body-md, `on-surface-variant`
  - CTAs: Gradient "Browse Listings" + Ghost "Back to Home", both `rounded-full`

### 10.3 Global Loading (`src/app/loading.tsx`)
- **Current:** Centered `Loader2` spin icon with `text-primary`
- **New:** Warm shimmer skeleton
  - Replace spinner with editorial loading state:
    - Three warm shimmer bars (title + subtitle + content), `rounded-xl`
    - `surface-container-high` to `surface-canvas` pulse animation
    - Centered, max-w-xl
  - OR minimal warm spinner: `primary` color, custom animation

### 10.4 Search Loading (`src/app/search/loading.tsx`)
- Warm shimmer card skeletons matching listing card dimensions
- `surface-container-high` pulse to `surface-canvas`

### 10.5 All route-specific error.tsx files
- Same warm treatment as global error
- Route-specific messaging where appropriate
- All use `surface-canvas` bg, Newsreader heading, Manrope body

### 10.6 All route-specific loading.tsx files
- Warm shimmer skeletons appropriate to each page's content shape
- Never use raw spinner without a skeleton structure around it

---

## Section 11: Surface Color Mapping

| Location | Token | Hex | Rationale |
|----------|-------|-----|-----------|
| Body / page backgrounds | `surface-canvas` | `#fbf9f4` | Warm cream base -- the "room" itself |
| Cards, form containers, sidebar | `surface-container-lowest` | `#ffffff` | Clean white for content containers -- things "on" the surface |
| Section backgrounds (features, footer, newsletter) | `surface-container-high` | `#eae8e3` | Warm gray for alternating sections -- like a different wall |
| Table header rows, hover states | `surface-container-high` | `#eae8e3` | Subtle differentiation without borders |
| Primary actions, CTA text, links | `primary` | `#9a4027` | Terracotta -- warm, editorial, authoritative |
| CTA gradients (end), accent blocks | `primary-container` | `#b9583c` | Lighter terracotta for gradient endpoints |
| Secondary accents, ratings, warnings | `tertiary` | `#904917` | Warm amber-brown for secondary emphasis |
| Body text, headings | `on-surface` | `#1b1c19` | Near-black -- never pure #000 |
| Secondary text, labels, placeholders | `on-surface-variant` | `#4a4941` | Warm gray for supporting text |
| Ghost borders, decorative lines | `outline-variant` | `#dcc1b9` | Warm blush for subtle structural hints |
| Text on primary/gradient backgrounds | `on-primary` | `#ffffff` | White on warm backgrounds |
| Chat sent messages, mobile active states | `primary` | `#9a4027` | Brand color for user-generated emphasis |
| Skeleton shimmer pulse from | `surface-container-high` | `#eae8e3` | Warm shimmer base |
| Skeleton shimmer pulse to | `surface-canvas` | `#fbf9f4` | Warm shimmer peak |

---

## Section 12: Typography Hierarchy Per Page

### Display (Newsreader serif)

| Level | Size (clamp) | Weight | Usage |
|-------|-------------|--------|-------|
| `display-lg` | clamp(3rem, 5vw, 5.5rem) | 400 | Homepage hero |
| `display-md` | clamp(2.25rem, 4vw, 3.75rem) | 400 | Section titles (Features, Neighborhoods, CTA) |
| `display-sm` | clamp(1.75rem, 3vw, 2.5rem) | 400 | Listing detail title, newsletter heading, testimonial |
| `display-xs` | clamp(1.5rem, 2.5vw, 2rem) | 400 | Auth page heading, admin dashboard, profile name |

### Titles (Manrope sans)

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| `title-lg` | 1.5rem (24px) | 600 | Search results count, settings heading, section headings |
| `title-md` | 1.25rem (20px) | 600 | Card titles, feature titles, amenity section headings |
| `title-sm` | 1rem (16px) | 600 | Conversation names, booking card titles, form section headers |

### Body (Manrope sans)

| Level | Size | Weight | Line height | Usage |
|-------|------|--------|-------------|-------|
| `body-lg` | 1.125rem (18px) | 300 | 1.7 | Hero subtitle, content page intro |
| `body-md` | 1rem (16px) | 400 | 1.7 | Body text, descriptions, form help text |
| `body-sm` | 0.875rem (14px) | 400 | 1.6 | Secondary text, metadata, timestamps |
| `body-xs` | 0.75rem (12px) | 400 | 1.5 | Copyright, fine print |

### Labels (Manrope sans, uppercase)

| Level | Size | Weight | Tracking | Usage |
|-------|------|--------|----------|-------|
| `label-lg` | 0.875rem (14px) | 700 | 0.05em | CTA button text, form labels |
| `label-md` | 0.75rem (12px) | 600 | 0.05em | Section labels (CURATED SPACES), filter chips |
| `label-sm` | 0.6875rem (11px) | 600 | 0.05em | Badge text, table headers |

---

## Section 13: White Space Strategy

### Between Major Page Sections

| Boundary | Spacing | Token |
|----------|---------|-------|
| Hero to next section | `py-20` to `py-24` (80-96px) | `spacing-20` to `spacing-24` |
| Standard section gaps | `py-16` to `py-20` (64-80px) | `spacing-16` to `spacing-20` |
| Section title to content | `mb-12` to `mb-16` (48-64px) | `spacing-12` to `spacing-16` |
| Card internal padding | `p-6` to `p-8` (24-32px) | `spacing-6` to `spacing-8` |
| Form field gaps | `space-y-5` to `space-y-6` (20-24px) | `spacing-5` to `spacing-6` |
| Grid gaps (cards) | `gap-6` to `gap-8` (24-32px) | `spacing-6` to `spacing-8` |
| Inline elements | `gap-2` to `gap-4` (8-16px) | `spacing-2` to `spacing-4` |
| Footer sections | `gap-16` (64px) | `spacing-16` |
| Content page paragraph gap | `mb-6` (24px) | `spacing-6` |

### Page-specific whitespace

| Page | Strategy |
|------|----------|
| Homepage | Massive whitespace between sections (py-20 to py-24). Hero has extra top padding (pt-32 md:pt-40). |
| Search | Compact -- results need density. Use py-4 to py-6 between result cards. Header is tight. |
| Listing Detail | Generous -- gallery full width, then content area with max-w-4xl centered, sidebar offset. py-12 between sections. |
| Auth | Balanced -- centered form card, form fields at space-y-5. Left panel has p-8 xl:p-12. |
| Dashboard | Medium -- cards at gap-6, sections at gap-8. Heading area mb-8. |
| Content (About/Privacy/Terms) | Generous line spacing (leading-7), large gaps between h2 sections (mt-12), readable column width (max-w-prose). |
| Admin | Dense but clear -- stats grid gap-4, table rows compact, action items gap-1. |

---

## Verify Page / Verify-Expired Redesign

### Verify (`src/app/verify/page.tsx`)
- **Current:** zinc-50 bg, gradient header (zinc-900 to zinc-800), status-dependent content (not_started/pending/rejected/verified)
- **New:**
  - Background: `surface-canvas`
  - **Header banner:** Replace dark gradient with `primary` to `primary-container` gradient
    - Shield icon: `on-primary` in `on-primary/10` circle
    - Title: Manrope title-lg, `on-primary`
    - Subtitle: Manrope body-sm, `on-primary/80`
  - **Status cards:** `surface-container-lowest`, `rounded-xl`, ambient shadow
    - Verified: `primary/10` circle with check, Newsreader title "You're Verified!"
    - Pending: `tertiary/10` circle with clock, Newsreader title
    - Rejected: `tertiary/10` circle with X, Newsreader title, tips in `surface-container-high` card
    - Not started: Benefits grid with `primary/10` icon circles
  - **Form (when visible):** Ghost borders, gradient CTA submit button
  - **Tip list:** Custom check bullets in `primary`

### Verify-Expired (`src/app/verify-expired/page.tsx`)
- Background: `surface-canvas`
- Centered card: `surface-container-lowest`, `rounded-2xl`
- Warm clock icon in `tertiary/10` circle
- Newsreader heading, Manrope body, gradient CTA to resend

---

## Offline Page (`src/app/offline/page.tsx`)

- Background: `surface-canvas`
- Centered layout with warm cloud/disconnect illustration
- Newsreader title-lg "You're Offline"
- Manrope body-md explaining offline state
- Retry button: Gradient CTA, `rounded-full`

---

## User Profile (Public) (`src/app/users/[id]/page.tsx`)

- **Background:** `surface-canvas`
- **Profile header:** Same editorial treatment as own profile but read-only
  - Avatar: 120x120 `rounded-full`, `outline-variant` border
  - Name: Newsreader display-xs
  - Country/languages: Manrope body-sm with flag emoji
  - Verified badge: `primary` shield
  - Message/Report buttons: Ghost buttons, `rounded-full`
- **Listings grid:** Editorial cards
- **Reviews section:** Same as listing detail reviews
- **Rating summary:** Large Newsreader number, star icons in `tertiary`

---

## Listings Create/Edit (`src/app/listings/create/page.tsx`, `src/app/listings/[id]/edit/page.tsx`)

### Create Listing
- **Current:** zinc-50/50 bg, Inter font, zinc-100 border card with large rounded corners
- **New:**
  - Background: `surface-canvas`
  - Back link: Manrope body-sm, `on-surface-variant`, arrow-left
  - Heading: Newsreader display-xs "List Your Sanctuary"
  - Subtitle: Manrope body-md, `on-surface-variant`
  - **Form card:** `surface-container-lowest`, `rounded-2xl`, ambient shadow
  - **Form sections:** No dividers, spacing-8 between groups
  - **Inputs:** Ghost borders, `rounded-lg`, Manrope labels
  - **Image upload:** Dashed ghost border area, `rounded-xl`, `primary` upload icon
  - **Submit:** Gradient CTA, `rounded-full`
  - **Profile warning banner:** `tertiary/10` bg, `tertiary` text, `rounded-xl`

### Edit Listing
- **Current:** Uses `bg-background`, `text-foreground`, `text-muted-foreground` -- shadcn theme tokens
- **New:** Same editorial treatment as Create, heading: "Edit Your Listing"
  - Replace shadcn theme tokens with editorial tokens
  - Same form card, same input styling

---

## Cross-Cutting Notes for All Pages

1. **No `dark:` prefixes anywhere** -- single light editorial theme
2. **No borders** -- use color shifts (surface hierarchy) and ambient shadows
3. **Ghost borders at 20%** only where structural clarity is needed (inputs, ghost buttons)
4. **No pure black (#000)** -- always `on-surface` (#1b1c19) or lighter
5. **No dividers/hr** -- spacing and surface color shifts create separation
6. **`rounded-lg` minimum** on all containers, `rounded-full` on buttons and pills
7. **Ambient shadows**: `shadow-[0_4px_24px_rgba(27,28,25,0.04)]` for cards, `shadow-[0_8px_40px_rgba(27,28,25,0.06)]` for elevated elements
8. **All CTA buttons**: gradient `from-primary to-primary-container`, `rounded-full`, Manrope uppercase label
9. **All section labels**: Manrope uppercase, 0.05em tracking, `on-surface-variant`
10. **Newsreader for all display/headline text**, Manrope for everything else
11. **Mobile bottom nav clearance**: All pages need `pb-20 md:pb-0` to clear the 64px bottom nav bar + safe-area-inset-bottom. Apply globally via `MainLayout` or per-page. Search page already has `pb-24 md:pb-6` which is sufficient.
12. **Mobile-first responsive stacking**: All desktop multi-column layouts (grids, split views, sidebars) must specify their mobile collapse behavior (stack order, horizontal scroll, or hidden). Desktop-only elements use `hidden md:block` or `hidden lg:block`.
