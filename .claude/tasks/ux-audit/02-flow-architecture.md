# Flow Architecture Audit -- RoomShare UX Journey Analysis

**Auditor:** FLOW-ARCHITECT
**Date:** 2026-03-24
**Method:** Code-level trace of every user journey with real click counts

---

## 1. FLOW MAPS WITH CLICK COUNTS

### Flow 1: New User Discovery (Landing --> See a Listing)

```
HOMEPAGE
  |
  v
[Hero Section] -- SearchForm embedded in hero
  |
  +-- Type location in LocationSearchInput (1 action: type)
  |     |
  |     v
  +-- Select suggestion from dropdown (1 click)
  |     |  (auto-submits form via formRef.current.requestSubmit())
  |     v
  +-- SEARCH RESULTS PAGE (auto-navigated, 0 clicks)
  |     |
  |     +-- CategoryBar (horizontal filter pills)
  |     +-- RecommendedFilters (smart suggestions)
  |     +-- AppliedFilterChips (removable badges)
  |     +-- SortSelect dropdown
  |     +-- ListingCard grid
  |     |
  |     v
  +-- Click any ListingCard (1 click)
  |     |
  |     v
  +-- LISTING DETAIL PAGE
       |
       +-- ImageGallery, description, amenities, host info
       +-- BookingForm in sticky sidebar (right col on desktop)
       +-- Reviews, similar listings

TOTAL CLICKS: 3 (type location + select suggestion + click listing)
ALTERNATIVE: "See Rooms Near You" CTA in bottom section --> /search (1 click, then 1 more to see a listing = 2 clicks)
ALTERNATIVE: Featured Listings on homepage --> click card (1 click direct to listing detail)
```

**Friction points:**
- NONE MAJOR. The auto-submit on location select is excellent -- saves a "Search" button click.
- ScrollAnimation between hero and features is a deliberate editorial pacing device (brand moment), NOT dead space. Well-engineered with reduced-motion fallback, loading indicator, and navbar auto-hide. AMENDED: flag as "needs analytics data" -- measure mobile scroll-through rate and bounce at animation midpoint before recommending changes.
- Mobile: No immediate listings visible without searching -- hero occupies full viewport.

**Abandonment risk:** LOW at each step. Search form is prominent and auto-submits.

---

### Flow 2: Booking Flow (Listing --> Confirmed Request)

```
LISTING DETAIL PAGE
  |
  v
[BookingForm in sticky sidebar]
  |
  +-- See price ($X/mo), availability status badge, slot count
  |
  +-- If NOT logged in:
  |     Shows "Sign in to book" link --> /login (1 click, redirects back after auth)
  |
  +-- If logged in:
  |     +-- Select Start Date via DatePicker (1 click to open + 1 click to pick = 2 clicks)
  |     +-- Select End Date via DatePicker (1 click to open + 1 click to pick = 2 clicks)
  |     +-- [Optional] Select slots if multi-slot PER_SLOT listing (1 click)
  |     +-- See calculated total price, duration, price breakdown
  |     +-- Click "Request to Book" or "Place Hold" (1 click)
  |     |     |
  |     |     v
  |     +-- CONFIRMATION MODAL (FocusTrap portal)
  |     |     Shows: dates, duration, total price, listing title
  |     |     +-- Click "Confirm Booking" (1 click)
  |     |     |     |
  |     |     |     v
  |     |     +-- Loading state with spinner
  |     |     +-- Success: "Request sent successfully!" banner
  |     |     +-- Auto-redirect to /bookings after 1500ms
  |     |
  |     v
  BOOKINGS PAGE (/bookings)
    |
    +-- "Sent" tab shows new PENDING booking
    +-- Can also view "Received" tab (for hosts)

TOTAL CLICKS (logged in): 7 (open start picker + pick date + open end picker + pick date + submit + confirm + auto-redirect)
TOTAL CLICKS (not logged in): +2 (sign in link + complete login form = ~4 more actions)
```

**Friction points:**
- MEDIUM: Two separate date pickers require 4 clicks minimum. A single date-range picker would reduce to 2.
- LOW: Confirmation modal adds 1 click but is important for trust/preventing accidental bookings.
- LOW: 1500ms delay before redirect is visible -- could feel slow.
- CONCERN: Price is only visible per-month in the sidebar. Total price calculation appears only AFTER selecting both dates. Users should see price early.

**Friction type distinction (AMENDED after debate with HEURISTIC-AUDITOR):**
- **Mechanical friction** (7 clicks): should be minimized. Current count is acceptable.
- **Comprehension friction** (reading price, availability, dates, confirmation summary): should be PRESERVED. This is trust-building friction in a financial commitment flow. The confirmation modal is correctly "heavy" -- it ensures informed consent and reduces post-booking regret. Proposals that reduce comprehension time are trust regressions.

**Abandonment risk:**
- HIGH at date selection (most mechanical friction in the flow)
- LOW at confirmation modal (clear summary reduces anxiety -- comprehension friction is trust-positive here)
- MEDIUM for unauthenticated users (login wall before booking)

---

### Flow 3: Sign Up --> First Action

```
SIGNUP PAGE (/signup)
  |
  +-- Option A: Google OAuth (1 click --> redirects to Google --> back to /)
  |
  +-- Option B: Email form
  |     +-- Fill: Name, Email, Password, Confirm Password (4 fields)
  |     +-- Check Terms of Service checkbox (1 click)
  |     +-- Wait for Turnstile verification (passive, 0 clicks)
  |     +-- Click "Join RoomShare" (1 click)
  |     |     |
  |     |     v
  |     +-- POST /api/register
  |     +-- Redirect to /login?registered=true
  |     |     |
  |     |     v
  |     +-- LOGIN PAGE shows "You're all set! Sign in to get started."
  |     +-- Must fill email + password AGAIN (2 fields + 1 click)
  |     |     |
  |     |     v
  |     +-- window.location.href = "/" (HARD REDIRECT to homepage)
  |           |
  |           v
  |     HOMEPAGE (now logged in)
  |     +-- "New here?" CTA is GONE (conditional on !isLoggedIn)
  |     +-- SearchForm still prominent
  |     +-- BottomNavBar now visible (mobile)
  |
  +-- NO onboarding, no profile setup prompt, no guided first search

TOTAL CLICKS (Google): 1 click + Google OAuth flow
TOTAL CLICKS (Email): 6 actions (fill 4 fields + check terms + submit) + 3 more (fill 2 login fields + submit) = 9 total actions
TIME TO VALUE: After sign-up + login, user lands on homepage. Must initiate their own search. NO guided path.
```

**Friction points:**
- CRITICAL: Email sign-up forces re-login. User fills 4 fields, then must fill 2 again. This is the single biggest abandonment risk in the entire app.
- HIGH: No onboarding after first login. User sees the same homepage as before. No "complete your profile" prompt, no "here's how to search" guide.
- MEDIUM: Password + Confirm Password is 2 fields that could be 1 with show/hide toggle (already has show/hide but still requires confirm field).
- LOW: Turnstile widget may confuse users if it shows a challenge.

**Abandonment risk:** HIGH -- Email signup flow is 9 actions before value. Google is 1.

---

### Flow 4: Host Listing Creation

```
Any page (logged in)
  |
  +-- Click "List" in BottomNavBar (mobile) or "+" icon in Navbar (desktop) (1 click)
  |     |
  |     v
  CREATE LISTING PAGE (/listings/create)
  |
  +-- SINGLE-PAGE FORM with 4 sections (scrollable, not stepped wizard):
  |     Section 1 - "The Basics" (icon: Home)
  |       - Title (text input)
  |       - Description (textarea with CharacterCounter, max 1000)
  |       - Price (number input, $/month)
  |       - Available Slots (number input)
  |       - Room Type (select: Private Room, Shared Room, Entire Place)
  |       - Booking Mode (select: SHARED, WHOLE_UNIT)
  |
  |     Section 2 - "Location" (icon: MapPin)
  |       - Address, City, State, Zip (4 text inputs)
  |
  |     Section 3 - "Photos" (icon: Camera)
  |       - ImageUploader component (drag-drop or click)
  |
  |     Section 4 - "Finer Details" (icon: List)
  |       - Gender Preference (select)
  |       - Household Gender (select)
  |       - Amenities (multi-select checkboxes)
  |       - House Rules (multi-select checkboxes)
  |       - Move-in Date (DatePicker)
  |       - Lease Duration (select)
  |       - Languages (multi-select with search)
  |
  |  +-- Form persistence (useFormPersistence): auto-saves draft to localStorage
  |  +-- Navigation guard (useNavigationGuard): warns before leaving with unsaved work
  |  +-- Cross-tab conflict detection
  |
  |  +-- Click "Publish Listing" (1 click)
  |     |
  |     v
  |  +-- Client-side validation (createListingClientSchema)
  |  +-- Language compliance check
  |  +-- POST with idempotency key
  |  +-- On success: router.push(`/listings/${result.id}`)
  |     |
  |     v
  LISTING DETAIL PAGE (owner view with management controls)

TOTAL FORM FIELDS: ~15-18 (depending on options selected)
TOTAL CLICKS: 1 (navigate) + ~20 (fill all fields) + 1 (submit) = ~22 actions
MINIMUM VIABLE: Title + Description + Price + City + State + 1 photo = ~7 fields
```

**Friction points:**
- MEDIUM: Single long-form page vs. stepped wizard. Progress is unclear. Users may not realize there are more sections below.
- LOW: Form persistence is excellent -- recovering from accidental navigation is handled.
- LOW: No preview before publishing. User goes straight from form to live listing.
- LOW: Section indicators (FORM_SECTIONS array) exist in data but it's unclear if they render as navigation tabs or just labels.

**Abandonment risk:** MEDIUM at photo upload (most effort). LOW everywhere else due to form persistence.

---

### Flow 5: Messaging (Contact Host)

```
LISTING DETAIL PAGE
  |
  +-- [Host section, below description] "Contact Host" button (1 click)
  |     |
  |     v
  |  +-- If not logged in: router.push("/login") (redirect, then back)
  |  +-- If logged in: startConversation(listingId) server action
  |     |
  |     v
  |  +-- Creates or finds existing conversation
  |  +-- router.push(`/messages/${conversationId}`)
  |     |
  |     v
  MESSAGES PAGE (/messages/{id})
  |
  +-- ChatWindow component
  |     +-- Message history
  |     +-- Text input (max 1000 chars, CharacterCounter)
  |     +-- Typing indicators
  |     +-- Read receipts (CheckCheck icon)
  |     +-- Block/unblock via DropdownMenu
  |     +-- Delete conversation
  |
  +-- Type message + press Send or Enter (2 actions)

TOTAL CLICKS: 3 (Contact Host button + type message + send)
```

**Friction points:**
- LOW: Flow is clean. 1-click to start conversation is ideal.
- CONCERN: "Contact Host" button is positioned in the host section, which is far down the page (after description, amenities, household details). On listing pages with many amenities, this is below the fold on most screens.
- CONCERN: No pre-filled message template. User sees an empty chat window and must compose from scratch.

**Abandonment risk:** LOW for the messaging flow itself. MEDIUM for discoverability of the Contact Host button.

---

### Flow 6: Saved Listings

```
SEARCH RESULTS or LISTING DETAIL
  |
  +-- Click heart/save icon on ListingCard or SaveListingButton (1 click)
  |     (requires login -- redirects if not authenticated)
  |
  ...later...
  |
  +-- Navigate to /saved via BottomNavBar "Saved" tab (1 click)
  |     |
  |     v
  SAVED LISTINGS PAGE
  |
  +-- Grid of saved listings with sort (date saved, price)
  +-- Each card: image, title, location, price, "View details" link, trash icon
  +-- Click "View details" (1 click) --> listing detail page
  |
  +-- Empty state: Heart icon + "No saved listings yet" + "Start exploring" --> /search

TOTAL ROUND-TRIP: 3 clicks (save + navigate to saved + view details)
```

**Friction points:**
- NONE MAJOR. Clean round-trip flow.
- MINOR: No indication of how many items are saved from the nav bar (no badge count on Heart icon in BottomNavBar).

**Abandonment risk:** LOW

---

### Flow 7: Return User

```
LOGIN PAGE (/login)
  |
  +-- Google OAuth (1 click) or Email/Password (3 actions)
  |     |
  |     v
  +-- window.location.href = "/" (ALWAYS goes to homepage)
  |     |
  |     v
  HOMEPAGE
  |
  +-- NO personalization for logged-in users:
  |     - No "Welcome back, {name}"
  |     - No recent searches
  |     - No "Continue where you left off"
  |     - No saved listing count
  |     - Same hero + search form as first-time visitor
  |
  +-- BottomNavBar is visible (Explore, Saved, List, Messages, Profile)
  +-- NavbarClient has user menu (Profile, Settings, Messages, etc.)
```

**Friction points:**
- CRITICAL: Login ALWAYS redirects to homepage (window.location.href = "/"), ignoring callbackUrl for credential login. Google OAuth uses callbackUrl: "/" hardcoded. Pages like /saved, /bookings, /messages correctly set callbackUrl in their redirect(), but the login form ignores it.
- HIGH: No session resumption. If a user was browsing listings and got logged out, they start over at the homepage.
- HIGH: No personalization for returning users. Homepage shows the same content regardless of history.
- MEDIUM: No "recently viewed" link visible in main navigation (page exists at /recently-viewed but not in BottomNavBar or main nav).

**Abandonment risk:** HIGH for return users who were in the middle of something.

---

## 2. EMPTY STATE AUDIT

| Page | Has Designed Empty State? | Quality | Recovery Path |
|------|--------------------------|---------|---------------|
| Search (zero results) | YES -- ZeroResultsSuggestions | EXCELLENT | Filter suggestions, "Clear filters", "Browse all", nearby area links |
| Search (no location) | YES -- "Please select a location" | GOOD | "Try a new search" link to homepage |
| Saved Listings | YES -- Heart icon + "No saved listings yet" | GOOD | "Start exploring" button --> /search |
| Bookings (sent) | YES -- Calendar icon + "No bookings made yet" | GOOD | "Find a Room" button --> /search |
| Bookings (received) | YES -- Home icon + "No booking requests yet" | GOOD | "List a Room" button --> /search |
| Profile (no listings) | YES -- "No listings yet" text | MINIMAL | No CTA to create listing |
| Messages | PARTIAL -- MessagesPageClient renders conversation list | UNKNOWN | Need to check empty state in MessagesPageClient |
| Notifications | PARTIAL -- notification list | UNKNOWN | Need to check empty state rendering |
| Map (no listings in view) | YES -- MapEmptyState component | GOOD | Map-specific guidance |

**Empty state gaps:**
1. **Profile page "No listings yet"** -- has text but no CTA button to /listings/create. Dead end for hosts.
2. **Messages empty state** -- MessagesPageClient receives conversations but unclear if "no conversations" has a designed state with CTA.
3. **Notifications empty state** -- likely renders an empty list without illustration or guidance.

---

## 3. DEAD END INVENTORY

| Dead End | Severity | Where | Proposed Fix |
|----------|----------|-------|-------------|
| Post-signup forced re-login | CRITICAL | /signup --> /login?registered=true | Auto-login after registration OR at minimum preserve callbackUrl |
| Login ignores callbackUrl for credentials | CRITICAL | LoginClient.tsx:83 | Use searchParams callbackUrl instead of hardcoded "/" |
| No onboarding after first login | HIGH | Homepage (logged in, new user) | Add "Complete your profile" banner or guided first-search |
| Profile "No listings" with no CTA | MEDIUM | /profile (host view) | Add "Create your first listing" button |
| "Promote now" button is non-functional | LOW | ListingPageClient.tsx:721 | Button text "Promote now" with no onClick handler -- appears to be a teaser |
| Recently Viewed not in navigation | LOW | /recently-viewed exists but not in BottomNavBar | Add to nav or link from profile |

---

## 4. TRUST SIGNAL PLACEMENT ANALYSIS

| Decision Moment | Trust Signals Present | Assessment |
|----------------|----------------------|------------|
| Homepage (first impression) | "No catfishing" card, "Verified ID" copy, ShieldCheck icon | GOOD -- features section communicates trust |
| Search results (browsing) | None visible on ListingCards | GAP -- no verified badge on cards |
| Listing detail (considering) | ShieldCheck "Identity verified" on host, Star "Superhost" badge, review count, slot availability | GOOD -- key signals at point of consideration |
| Booking form (committing) | Availability status (green/amber/red), hold countdown if enabled, price breakdown in confirmation modal | ADEQUATE -- could show "verified host" in booking sidebar |
| Host profile (/users/[id]) | Verified badge, join date, bio | GOOD |

**Trust signal gaps:**
1. **ListingCards in search results** show no verification badges. Users must click into each listing to see if the host is verified. A small ShieldCheck on verified-host cards would help.
2. **Booking sidebar** doesn't reiterate that the host is verified -- this is the conversion-critical moment.
3. **Review score** is not displayed on ListingCards in search results (avgRating and reviewCount exist in data but may not render on search cards -- need to verify ListingCard rendering).

---

## 5. PROGRESSIVE DISCLOSURE ANALYSIS

| Page | Information Density | Assessment |
|------|-------------------|------------|
| Homepage | LOW -- clean hero + 3 feature cards + CTA | EXCELLENT -- progressive reveal via scroll |
| Search results | MEDIUM -- filters + sort + listings grid | GOOD -- FilterModal is behind a button, CategoryBar is compact |
| Listing detail | HIGH -- all info on one page (gallery, stats, description, amenities, household, host, reviews, similar, booking form) | NEEDS WORK -- everything is in a single scroll. Could benefit from collapsible sections for amenities/household details on mobile |
| Create listing form | HIGH -- all 4 sections visible at once | MEDIUM -- section headers exist but no accordion/step behavior |
| Booking form | LOW-MEDIUM -- date pickers + price + confirm modal | GOOD -- confirmation modal shows summary at right moment |

---

## 6. PROPOSED OPTIMIZATIONS (Ranked by Impact)

### Optimization 1: Fix Post-Signup Re-Login (CRITICAL)
- **Current:** Sign up (9 actions) --> forced re-login (3 more actions) = 12 actions to first value
- **Proposed:** Auto-sign-in after registration, redirect to homepage with EmailVerificationBanner prominent
- **Click reduction:** 12 --> 7 (42% reduction)
- **IMPORTANT: Email verification dependency** (AMENDED after debate with INTERACTION-DESIGNER): Auto-sign-in puts users into authenticated-but-unverified state. Write actions (create listing, send message, book) are blocked until email is verified. Read actions (search, browse, save) work immediately. Implementation MUST: (1) auto-sign-in after registration, (2) redirect to homepage (NOT a "check email" interstitial), (3) show the existing EmailVerificationBanner prominently, (4) ensure browsing works unverified so 80% of users get immediate value. The banner already exists at `src/components/EmailVerificationBanner.tsx`.
- **Risk:** Must sanitize any redirects. Must ensure unverified users can browse but see clear messaging about verification requirements for write actions.

### Optimization 2: Fix Login callbackUrl for Credentials (CRITICAL)
- **Current:** `window.location.href = "/"` ignores `?callbackUrl=` param (LoginClient.tsx:83)
- **Proposed:** Read callbackUrl from searchParams, validate it's a relative URL, redirect there
- **Click reduction:** Saves entire re-navigation flow (2-5 clicks to get back to where user was)
- **Risk:** Must sanitize callbackUrl to prevent open redirect vulnerability

### Optimization 3: Add Return User Personalization (HIGH)
- **Current:** Logged-in homepage is identical to logged-out
- **Proposed:** Show "Welcome back" + recent searches + saved listing count + "Continue browsing" with last search params
- **Click reduction:** 0 --> 1 click to resume (vs. re-typing a search)
- **Impact:** Retention metric improvement for return users

---

## 7. FLOW CONFLICT NOTES FOR DEBATE

### For HEURISTIC-AUDITOR:
- Any accessibility fix that adds modals/confirmations to the booking flow should be weighed against the current 7-click count. The confirmation modal is already present -- adding more checkpoints risks increasing abandonment.

### For INTERACTION-DESIGNER:
- The ScrollAnimation component between hero and features adds ~200vh of scroll before featured listings. On mobile, this significantly delays content discovery. Any animation additions to the booking flow must not increase the 7-click count.

### For VISUAL-POLISH:
- The listing detail page has HIGH information density. Any layout changes (e.g., adding decorative elements, increasing spacing) in the booking sidebar must preserve the sticky positioning that keeps the BookingForm visible during scroll. The Contact Host button is already too far down the page -- don't push it further.

---

## 8. DEBATE OUTCOMES (Updated During Cross-Team Review)

### Resolved: Contact Host Placement
- **Original proposal:** Floating "Message Host" button OR duplicate in sidebar
- **After debate with VISUAL-POLISH:** Floating button WITHDRAWN. Two competing CTAs splits visual attention.
- **Agreed solution:** Add "Message Host" text link INSIDE the BookingForm card, below price breakdown but above submit button. Keeps sidebar as single conversion zone. Reduces Contact Host discovery from 5+ scrolls to 0 scrolls.
- **Click reduction:** 5+ scrolls + 1 click --> 0 scrolls + 1 click

### Resolved: Auth Page Coordination
- **VISUAL-POLISH** found button radius mismatch (Google=rounded-full, Submit=rounded-lg)
- **FLOW-ARCHITECT** found forced re-login after signup (12 actions to first value)
- **Agreed:** Ship both fixes together in one auth page PR. Button radius harmonization + auto-sign-in after registration = one test pass, one review.

### Resolved: bg-background Fix (VISUAL-POLISH P0)
- VISUAL-POLISH fixing listing detail from `bg-background` to `bg-surface-canvas`
- FLOW-ARCHITECT confirms: warm cream canvas IMPROVES BookingForm sidebar contrast (bg-surface-container-lowest pops more). Flow-positive change.

### Resolved: Interaction Designer Proposals
- **Booking celebration (P0-2):** SUPPORTED. Fires within existing 1500ms redirect delay. Fills dead time, zero click impact.
- **ContentReveal crossfade (P0-1):** SUPPORTED with condition: search filter transitions must use instant/100ms fade-in (not full 350ms crossfade) to avoid cumulative latency on rapid filter changes.
- **Haptic wiring (P1-2):** STRONGLY SUPPORTED. Dead code activation, zero flow penalty, reduces friction by providing non-visual confirmation.

### Pending: HEURISTIC-AUDITOR Response
- Awaiting a11y/heuristic findings for final cross-reference.
