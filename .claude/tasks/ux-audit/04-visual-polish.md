# Visual Polish Audit — Editorial Art Director Assessment

**Auditor**: VISUAL-POLISH
**Date**: 2026-03-24
**Scope**: Every page and shared component in the RoomShare design system

---

## Executive Summary

The "Editorial Living Room" design system is well-established in its token foundation — warm cream canvas, terracotta primary, Newsreader/Manrope typography pairing, tonal shifts instead of borders, ambient shadows. The APPLICATION, however, has several consistency gaps that weaken the overall editorial feel: a stale `bg-background` token leaking through on the conversion page, inconsistent uppercase label tracking values across components, uneven section spacing rhythms, and a few pages where the editorial voice goes silent (404, error states, bookings dashboard). The homepage is the strongest expression of the brand; other pages fall on a spectrum from "close" to "template-y."

---

## Page-by-Page Visual Hierarchy Assessment

### 1. Homepage (HomeClient.tsx) — FLAGSHIP

**Primary focal point**: Hero headline "Finding Your People, Not Just a Place" — clear within 1 second. Strong Z-pattern: label -> headline -> subhead -> search bar -> CTA.

**What works well**:
- Newsreader display heading with italic emphasis on "Your" — textbook editorial treatment
- Glassmorphism search bar with `backdrop-blur-xl` + ambient shadow
- Stagger animation orchestration is tasteful (0.1s intervals)
- Editorial label "Find Your People" uses correct `tracking-[0.15em]` uppercase pattern
- Section rhythm: hero -> scroll animation -> features (py-16 md:py-20) -> CTA (py-16 md:py-20) — consistent

**Issues**:
- **Feature card heading** (line 290): `text-lg font-medium` — should be `font-display` for Newsreader on section card headings, maintaining brand voice even on small elements
- **CTA section heading** (line 232): Missing the editorial label above it that the Features section has ("Why RoomShare"). The CTA feels abrupt without the cadence of label -> heading -> body that the Features section establishes

**Verdict**: 9/10 — Near-perfect flagship page

---

### 2. Search Page (search/page.tsx) — WORKHORSE

**Primary focal point**: Result count heading "X places in Y" — visible immediately. F-pattern scan of result cards below.

**What works well**:
- Result heading uses `font-display font-semibold tracking-tight` — correct
- Subtext uses `font-light` for the editorial lightness
- Clean hierarchy: heading -> sort/save controls -> cards

**Issues**:
- **Heading uses `font-semibold`** (line 392) while most other page headings use `font-bold`. This is actually MORE editorial (lighter weight = magazine feel) but inconsistent with the rest of the app
- **"Please select a location" heading** (line 166): Uses `font-display font-bold` — correct, but the CTA link below uses a hardcoded `bg-primary text-white rounded-lg` instead of the shared Button component. Inconsistent radius (rounded-lg vs rounded-full elsewhere)

**Verdict**: 7.5/10 — Functional but the search page is mostly a container; the card grid does the heavy lifting

---

### 3. Listing Detail (ListingPageClient.tsx) — CONVERSION PAGE

**This is the most critical page for the business and has the most visual issues.**

**Primary focal point**: Image gallery -> title -> price (in sidebar). The sidebar booking form IS the CTA, but it competes with the management card for owners.

**Issues**:
- **CRITICAL: `bg-background` instead of `bg-surface-canvas`** (line 339): This is a non-token color. The listing detail page uses the raw Tailwind `bg-background` class instead of the design system's `bg-surface-canvas`. This breaks the warm cream canvas on this page. Same issue on the listing loading skeleton (listings/[id]/loading.tsx line 10) and edit pages.
- **Section heading weight inconsistency**: "About this place" (line 431), "What this place offers" (line 443), "Household Details" (line 488), "Reviews" (line 594) — all use `text-xl font-bold font-display`. But "Hosted by" uses `text-lg font-bold font-display` (line 554). The section headings should be one harmonious size, with the host name potentially being a different element.
- **StatusBadge** (lines 140-185): Uses hardcoded `bg-green-50`, `bg-yellow-50`, `bg-blue-50` colors instead of design tokens. These raw Tailwind colors clash with the warm palette.
- **Amenity cards** (line 451): Uses `rounded-2xl` while the sidebar booking form uses `rounded-3xl`. The amenity cards also use `bg-surface-canvas/50` — the opacity creates a muddy tonal shift rather than a clean one.
- **"Click to enlarge" overlay** (line 383): Only appears on hover, but the overlay uses `text-xs font-bold uppercase tracking-wider`. The tracking should be `tracking-[0.15em]` or `tracking-[0.2em]` to match the design system's editorial uppercase pattern, not the generic `tracking-wider`.
- **Edit listing button** (line 681): Uses `bg-gradient-to-br from-primary to-primary-container` — this gradient is the ONLY gradient button in the entire app. It breaks the flat/tonal design language. Should be a solid `bg-primary`.

**Verdict**: 6/10 — The conversion page needs the most work

---

### 4. Login & Signup (LoginClient.tsx, SignUpClient.tsx) — FIRST IMPRESSION

**Primary focal point**: The split layout is strong — testimonial left, form right. The heading "Welcome back" / "Join RoomShare" is clear.

**What works well**:
- Split layout with primary-color left panel + warm cream right panel
- Testimonial typography uses `font-display` — correct
- Form labels use the editorial uppercase pattern with `tracking-wide`
- Glassmorphism Google button with `backdrop-blur` effect implied by border treatment

**Issues**:
- **Left panel gradient** (line 96-97 of LoginClient): Uses `bg-gradient-to-br from-primary to-primary-container` plus a radial gradient overlay. This is visually rich but the gradient complexity doesn't appear anywhere else in the app. The About page CTA section is a solid `bg-primary`. Pick one approach.
- **Form label tracking**: Uses `tracking-wide` (lines 206, 231) which is ~0.025em. The design system's editorial uppercase labels use `tracking-[0.15em]` or `tracking-[0.2em]`. This makes form labels feel less editorial than homepage labels.
- **Submit button uses `rounded-lg`** (line 304) while the Google button uses `rounded-full` (line 164). On the same page, two primary actions have different border radii. The sign-in button should be `rounded-full` to match.
- **`font-sans`** class on the root div (line 94, 100): Uses `font-sans` which is a Tailwind default. Should be `font-body` to use the Manrope token explicitly, even though they may resolve to the same font.

**Verdict**: 7/10 — Strong layout, inconsistent details

---

### 5. About Page (AboutClient.tsx) — BRAND STORYTELLING

**Primary focal point**: The hero headline "Shared living shouldn't be a compromise" is massive (text-5xl to text-8xl) and immediate. Strong Z-pattern.

**What works well**:
- Hero typography with `tracking-tighter` and tight `leading-[0.95]` — magazine cover feel
- Team member images with grayscale-to-color hover — editorial portfolio treatment
- Value card hover state flips to primary color — bold and intentional

**Issues**:
- **Section spacing is inconsistent**: Hero `pb-32`, Story `py-24`, Values `py-32`, Team `py-24`, CTA `py-20`. This creates an uneven rhythm. Should follow a predictable scale like py-24 throughout with py-32 for the hero.
- **Story section heading** (line 99): `text-3xl md:text-4xl font-bold` — should this be `font-semibold` or `font-medium` for editorial lightness? The homepage uses `font-normal` (line 182) for equivalent section headings. The About page goes heavier.
- **CTA section buttons** (lines 193-204): Use inline Link styling (`px-10 py-4 bg-white text-primary rounded-full font-bold`) instead of the shared Button component. This bypasses any future button style updates.
- **Value card icon container** (line 18): `rounded-2xl` for the icon box but `rounded-lg` for the card itself. The icon box is MORE rounded than its container — inverted hierarchy.
- **`min-h-screen bg-surface-container-lowest`** (line 59): The About page is the only page that uses `bg-surface-container-lowest` as its base instead of `bg-surface-canvas`. This makes it slightly lighter than every other page.

**Verdict**: 7.5/10 — Strong editorial voice but needs rhythm tightening

---

### 6. Bookings Dashboard (BookingsClient.tsx) — MANAGEMENT

**Primary focal point**: Tabs (Received/Sent) with pending count badge. Clear.

**Issues**:
- **Page title** (line 576): `font-display text-3xl font-bold` — correct
- **Booking card** (line 192-193): `rounded-2xl border border-outline-variant/20 shadow-ambient-sm` — follows design system
- **Status badges** (lines 82-118): Use raw Tailwind colors (`bg-yellow-100 text-yellow-700`, `bg-green-100 text-green-700`, `bg-red-100 text-red-700`, `bg-blue-100 text-blue-700`). These should use the design system's tonal palette. Same issue as listing detail StatusBadge.
- **Booking detail labels** (lines 225-246): Use `text-xs text-on-surface-variant uppercase font-medium` — missing `tracking-wide` or `tracking-[0.05em]` for the editorial uppercase pattern. The homepage uses `tracking-[0.15em]` for equivalent labels.
- **Empty state heading** (line 747): `text-lg font-semibold` — missing `font-display`. Editorial headings should always use Newsreader, even in empty states.
- **Duplicate `py-4 py-4`** (line 223): CSS duplication suggesting rushed edit.

**Verdict**: 6.5/10 — Functional but not editorial

---

### 7. Profile Page (ProfileClient.tsx) — USER IDENTITY

**What works well**:
- Avatar with `ring-4 ring-surface-container-lowest shadow-ambient-lg` — editorial portrait frame
- Verified badge placement at avatar bottom-right — clean
- Card system with `rounded-2xl sm:rounded-[2rem]` — generous, magazine-like radii

**Issues**:
- **Trust section items** (lines 291-327): Use `text-sm` body text without `font-body` explicit call. While inherited, explicit token usage is clearer for maintenance.
- **Profile listing card heading** (line 135): `font-semibold text-on-surface` — missing `font-display`. Interior card headings on profile should use Newsreader.
- **"No listings yet" empty state** (line 437-438): `font-display font-semibold` — correct. But the CTA button uses `bg-primary text-on-primary rounded-full` inline instead of the shared Button component.
- **Logout button** (line 391-401): `text-red-500 hover:bg-red-50` — raw color tokens. Should use a semantic destructive color.

**Verdict**: 7/10 — Good structure, needs typography polish

---

### 8. Notifications (NotificationsClient.tsx)

**Issues**:
- **Notification icon containers** (lines 64-76): Use raw Tailwind colors (`bg-blue-100 text-blue-600`, `bg-green-100 text-green-600`, etc.) — not design system tokens. Same pattern as status badges across the app.
- **Empty state heading** (line 240): `font-display text-lg font-semibold` — correct
- **Filter buttons** use `rounded-lg` (lines 215, 225) instead of `rounded-full` which is used for filter chips on the Bookings page. Inconsistent.

**Verdict**: 6.5/10 — Functional, generic

---

### 9. Saved Listings (SavedListingsClient.tsx)

**Issues**:
- **Card design** (line 167): `rounded-2xl border border-outline-variant/20 shadow-ambient-sm` — follows design system
- **"View details" link** (line 254-256): `text-on-surface-variant hover:text-on-surface hover:bg-surface-canvas rounded-lg` — should be `rounded-full` for pill-shaped interactive elements
- **Duplicate `pt-4 pt-4`** (line 252): CSS duplication like the bookings page.

**Verdict**: 7/10 — Clean, minor radius issues

---

### 10. Footer (Footer.tsx) — MAGAZINE MASTHEAD

**What works well**:
- Section headers use `font-body uppercase tracking-[0.2em]` — excellent editorial column heading treatment
- Bottom bar uses `text-[10px] font-bold uppercase tracking-[0.2em]` — masthead footer feel
- Generous `pt-24 pb-12` padding — magazine breathing room
- Logo treatment matches navbar

**Issues**:
- **Footer background** `bg-surface-container-high` is correct but the `mb-20` gap between the link grid and bottom bar creates a slight visual "hole" in the footer rhythm. A horizontal rule or tonal shift would anchor the bottom bar better.

**Verdict**: 8.5/10 — One of the strongest brand expressions

---

### 11. Navbar (NavbarClient.tsx)

**What works well**:
- Logo "R" block with `rounded-lg` + hover rotation — playful but controlled
- Glassmorphism on scroll (`glass-nav` class) — editorial blur treatment
- Profile dropdown with `backdrop-blur-[20px]` — consistent with search bar treatment
- Mobile menu with `font-display text-3xl` links — bold, magazine-like

**Issues**:
- **Navigation link active state** (lines 522-524): Uses `bg-surface-container-high` — correct, but the pill shape creates a small radius difference: nav pills use `rounded-full`, dropdown items use `rounded-xl`. Minor.

**Verdict**: 8.5/10 — Polished

---

### 12. ListingCard (ListingCard.tsx) — MOST REPEATED ELEMENT

**What works well**:
- Image carousel with hover zoom (`group-hover:scale-110 transition-transform duration-[2s]`) — cinematic
- Badge stack with `backdrop-blur-sm` overlay treatment — editorial photo badge feel
- Price uses `font-display font-semibold text-xl` — prominent

**Issues**:
- **Card title** (line 366): `font-semibold text-base` — missing `font-display`. For the most-repeated visual element, the title should be in Newsreader to maintain the editorial voice.
- **Amenity text** (line 421): `text-[10px]` — this is very small and may fail WCAG AA contrast requirements at this size depending on the color. Test with actual rendering.
- **"New" badge** (line 372): `text-[10px] uppercase font-bold text-primary tracking-[0.1em]` — uses `tracking-[0.1em]` while homepage labels use `tracking-[0.15em]`. Pick one.

**Verdict**: 7.5/10 — Strong foundation, typography token gap

---

### 13. 404 Page (not-found.tsx) — BRAND MOMENT

**What works well**:
- Copy is editorial: "This page packed up and moved out" — personality
- Uses `font-display text-4xl font-bold` — correct

**Issues**:
- **No warm illustration or brand graphic** — just a generic Home icon in a grey circle. This is a brand moment (visitors land here when lost) and should feel more "editorial living room" — perhaps a warm terracotta illustration or at minimum a warm-toned icon container (`bg-primary/10` instead of `bg-surface-container-high`).
- **Button radii**: One uses `rounded-full`, consistent. Good.

**Verdict**: 6/10 — Great copy, generic visuals

---

### 14. Error Page (error.tsx) — RECOVERY

**Issues**:
- **Icon container**: `bg-red-100` — raw color. Should be `bg-primary/10` or a warm error tone to stay on-brand.
- **Missing `font-display`** on "Unable to load this page" would strengthen the brand even in error states.
- **Buttons**: No `rounded-full` — uses default Button component rounding.

**Verdict**: 5.5/10 — Generic error page

---

## Cross-Cutting Findings

### A. Typography Consistency Report

| Pattern | Expected | Actual |
|---------|----------|--------|
| Editorial uppercase labels (homepage) | `tracking-[0.15em]` | Correct |
| Editorial uppercase labels (footer) | `tracking-[0.2em]` | Correct (different from homepage) |
| UI uppercase labels (badges, forms) | `tracking-[0.05em]` | Correct |
| Form field labels (auth pages) | `tracking-[0.15em]` | `tracking-wide` (~0.025em) — TOO TIGHT |
| ListingCard "New" badge | `tracking-[0.15em]` | `tracking-[0.1em]` — INCONSISTENT |
| ListingCard "No Photos" label | `tracking-[0.2em]` | Correct |
| Section headings (homepage) | `font-display font-normal` | Correct |
| Section headings (about page) | `font-display font-normal` | `font-bold` — HEAVIER |
| Card headings (homepage features) | `font-display` | Missing `font-display` (uses default) |
| Card headings (listing cards) | `font-display` | Missing — uses system font |
| Empty state headings | `font-display` | MIXED — some have it, some don't |

**Key finding**: There are THREE tracking value systems in play for uppercase labels:
1. `tracking-[0.05em]` — UI badges and form elements
2. `tracking-[0.15em]` — editorial section labels
3. `tracking-[0.2em]` — footer and masthead elements

This is actually acceptable IF intentional (tighter for UI, wider for editorial). But `tracking-wide` on form labels breaks the pattern.

### B. Whitespace Rhythm Analysis

| Page | Section Spacing | Verdict |
|------|----------------|---------|
| Homepage | py-16/py-20 consistently | GOOD |
| About | py-20, py-24, py-32 (varies) | INCONSISTENT |
| Bookings | py-10 (single section) | OK |
| Profile | py-6 (tight) | Could breathe more |
| Notifications | py-10 | OK |
| Saved | py-10 | OK |

### C. Color Usage Audit

**Non-token colors found**:
- `bg-background` (ListingPageClient.tsx, listing loading/edit pages)
- `bg-green-50`, `bg-yellow-50`, `bg-blue-50`, `bg-red-50` (status badges across bookings, listing detail, notifications)
- `bg-green-100`, `bg-blue-100`, `bg-amber-100`, `bg-purple-100`, `bg-pink-100`, `bg-yellow-100`, `bg-orange-100` (notification icon backgrounds)
- `text-green-700`, `text-yellow-700`, `text-red-700`, etc. (status text colors)
- `text-red-500` (logout button, delete actions)
- `text-foreground` (FeatureCard.tsx line 25 — legacy class)

**Primary (#9a4027) usage**: Appropriate — used for CTAs, links, active states, badges. Not overused.

**Tertiary (#904917) usage**: Used sparingly — TrustBadge and household detail dot. Could be used more for badges/highlights.

### D. Image Treatment

- **Consistent `rounded-lg`**: Yes, ImageGallery uses `rounded-lg` consistently
- **ListingCard images**: Uses `rounded-none sm:rounded-lg` (mobile edge-to-edge, desktop rounded) — intentional responsive treatment
- **Aspect ratios**: `aspect-[16/10]` on mobile cards, `aspect-[4/3]` on desktop cards, `aspect-[21/9]` for hero — consistent per context
- **Alt text**: Present on all images checked
- **Warm fallback states**: "No Photos" placeholder uses `bg-surface-canvas` — warm. Good.

### E. Missing Visual Elements

- **404 page**: Needs warm illustration or branded graphic instead of generic icon
- **Error pages**: All error pages use `bg-red-100` containers — should use warm-toned alternatives
- **Empty states**: Generally well-designed with design system tokens. Bookings empty state could use a warmer icon treatment.
- **Loading states**: Root loading.tsx uses a bare spinner. Compare to search/loading.tsx which has a full shimmer skeleton — inconsistent loading experience depth.

---

## Priority-Ranked Proposals

### P0 — Critical (Brand-Breaking)

**1. Fix `bg-background` on listing detail page**
- File: `src/app/listings/[id]/ListingPageClient.tsx` line 339
- Also: `src/app/listings/[id]/loading.tsx` line 10, `src/app/listings/[id]/edit/loading.tsx` line 6, `src/app/listings/[id]/edit/page.tsx` line 41
- Before: `bg-background`
- After: `bg-surface-canvas`
- Why: The conversion page shows a different background color than the rest of the app. Users on the listing detail page see a white/cool tone instead of the warm cream canvas.

### P1 — High (Visual Hierarchy)

**2. Add `font-display` to ListingCard title**
- File: `src/components/listings/ListingCard.tsx` line 366
- Before: `font-semibold text-base text-on-surface`
- After: `font-display font-semibold text-base text-on-surface`
- Why: The most-repeated element in the app uses system font for its headline. This is the single highest-impact typography change.

**3. Add `font-display` to HomeClient FeatureCard headings**
- File: `src/app/HomeClient.tsx` line 290
- Before: `text-lg font-medium mb-3 text-on-surface tracking-tight`
- After: `font-display text-lg font-medium mb-3 text-on-surface tracking-tight`
- Why: Homepage feature cards are above-the-fold brand moments.

**4. Remove gradient from Edit Listing button**
- File: `src/app/listings/[id]/ListingPageClient.tsx` line 681
- Before: `bg-gradient-to-br from-primary to-primary-container`
- After: `bg-primary`
- Why: Only gradient button in the entire app. Breaks the flat/tonal design language.

### P2 — Medium (Consistency)

**5. Standardize auth form label tracking**
- Files: `LoginClient.tsx` lines 206/231, `SignUpClient.tsx` lines 213/239/261/301
- Before: `tracking-wide`
- After: `tracking-[0.05em]` (matches UI label system)
- Why: Form labels are a UI element, not an editorial label. They should use the UI tracking value.

**6. Standardize auth submit button radius**
- Files: `LoginClient.tsx` line 304, `SignUpClient.tsx` line 419
- Before: `rounded-lg`
- After: `rounded-full`
- Why: Google button above is `rounded-full`. Primary CTAs across the app use `rounded-full`.

**7. Warm up the 404 page icon**
- File: `src/app/not-found.tsx` line 9
- Before: `bg-surface-container-high`
- After: `bg-primary/10`
- Also: Change `<Home>` icon color from `text-on-surface-variant` to `text-primary`
- Why: Brand moment — visitors who are lost should still feel the warm editorial tone.

**8. Warm up error page icon containers**
- File: `src/app/error.tsx` line 31
- Before: `bg-red-100`
- After: `bg-primary/10` (and icon from `text-red-600` to `text-primary`)
- Why: Even errors should feel on-brand.

### P3 — Low (Polish)

**9. Remove duplicate CSS classes**
- `BookingsClient.tsx` line 223: `py-4 py-4` -> `py-4`
- `SavedListingsClient.tsx` line 252: `pt-4 pt-4` -> `pt-4`

**10. Normalize About page section spacing**
- Currently: py-20, py-24, py-32, py-24, py-20
- Proposed: py-24, py-24, py-28, py-24, py-20 (hero gets extra, CTA stays compact)

**11. Add `font-display` to empty state headings that lack it**
- `BookingsClient.tsx` line 747
- `BookingCalendar.tsx` line 147
- `BlockedUserMessage.tsx` lines 27, 44
- Various error.tsx pages

**12. Replace raw status badge colors with tonal tokens**
- All `bg-green-50/100`, `bg-yellow-50/100`, `bg-red-50/100`, `bg-blue-50/100` in status badges
- Propose: Create semantic status color tokens or use primary/tertiary tints

---

## Top 3 Most Impactful Improvements (for team debate)

1. **Fix `bg-background` on listing detail** — The conversion page has a different background color than the entire app. This is the most visible brand break.

2. **Add `font-display` to ListingCard titles** — The most-repeated element uses system font instead of Newsreader. Fixing this would make every search result, every homepage featured listing, and every similar listing section feel editorial.

3. **Standardize auth page button radii to `rounded-full`** — Login/signup are the first impression for new users. Having two different button shapes on the same form (Google = pill, Submit = rectangle) creates visual discord on the pages that set brand expectations.
