# Heuristic Audit — RoomShare Editorial Living Room

## Summary

RoomShare implements the Editorial Living Room design system competently with strong visual identity (Newsreader serif + Manrope sans, warm cream + terracotta palette, ambient shadows). However, a systematic Nielsen heuristic evaluation reveals **significant gaps** in system feedback, error recovery, user control, and accessibility that undermine trust in a platform where trust is the core value proposition.

### Top 5 Most Critical Findings

1. **CRITICAL: No skip-navigation link exists anywhere in the app** — keyboard/screen-reader users must tab through the entire navbar on every page load (H7, H10)
2. **CRITICAL: Booking form has no undo path after confirmation modal closes** — once "confirm" is clicked, the user watches a loading spinner with no cancel option; the `beforeunload` warning is the only escape (H3)
3. **MAJOR: Search page provides zero aria-live feedback when results load/change** — `SearchResultsClient` silently replaces content; screen readers get no announcement of "15 places found" or "Loading more..." (H1, H9)
4. **MAJOR: Login/signup password fields use `tabIndex={-1}` on the show/hide toggle** — removes it from tab order entirely, making password visibility unreachable for keyboard-only users (H7)
5. **MAJOR: Listing detail breadcrumb is not a real breadcrumb** — it's decorative text (`<span>` elements with `ChevronRight`), not a `<nav aria-label="Breadcrumb">` with `<ol>` structure; offers no navigation and violates WCAG 2.4.8 (H6)

---

## Heuristic 1: Visibility of System Status

### Homepage — PARTIAL [Minor]
**Evidence:** Hero section has proper Suspense fallback with shimmer animation (`HomeClient.tsx:97-100`). FeaturedListings section has elaborate skeleton fallback (`page.tsx:36-63`). ScrollAnimation has a placeholder div when loading (`HomeClient.tsx:15-19`).
**Gap:** No loading indicator for the SearchForm lazy import beyond a shimmer bar. Users see an empty search area with no label indicating "search is loading." The shimmer has no `aria-busy` or screen reader announcement.

### Search Page — FAIL [Major]
**Evidence:** `SearchResultsLoadingWrapper` wraps content but the actual `SearchResultsClient` component does **not** use `aria-live` regions. When filters change, the entire component remounts via React key (`key={normalizedKeyString}` at `page.tsx:415`), causing a flash of no content. The heading `h1#search-results-heading` has `tabIndex={-1}` for programmatic focus but there is no evidence of `focus()` being called after results load.
**Gap:** No `aria-live="polite"` region announcing result count changes. No progress indicator during "Load more" operations visible in the server component. The `SearchResultsLoadingWrapper` name suggests it exists, but the loading state is opaque to assistive technology.

### Listing Detail — PARTIAL [Minor]
**Evidence:** `ListingPageClient.tsx:296-300` fetches viewer state with a loading guard (`viewerState.loaded`). ReviewForm and BookingForm only render after viewer state loads. NearbyPlacesSection has a proper shimmer skeleton (`ListingPageClient.tsx:58-65`).
**Gap:** The viewer state fetch (`/api/listings/${listing.id}/viewer-state`) has no visible loading indicator — the booking sidebar simply doesn't render until loaded. For slow connections, users see an incomplete page with no explanation.

### Auth Pages — PASS [Cosmetic]
**Evidence:** Both LoginClient and SignUpClient show `Loader2` spinner during form submission (`LoginClient.tsx:306-308`, `SignUpClient.tsx:421-423`). Google auth button shows "Signing in..." text. Success message appears on registration redirect (`LoginClient.tsx:135-138`).

### Bookings — PASS [Cosmetic]
**Evidence:** `BookingsClient.tsx` shows `Loader2` during status updates (`BookingsClient.tsx:298-301`). Offline banner with `WifiOff` icon appears when offline (`BookingsClient.tsx:593-601`). Status badges use color-coded system with icons.

### Messages — PARTIAL [Minor]
**Evidence:** Messages page has a Suspense fallback spinner (`messages/page.tsx:26-28`). However, it's a generic spinning border, not a labeled loading state — no text says "Loading conversations."

### Profile — PARTIAL [Minor]
**Evidence:** Profile page renders server-side data directly, no loading states needed for initial render. However, listing images within profile use `useState` for error tracking but show no loading skeleton while images load.

### Settings — PASS [Cosmetic]
**Evidence:** Save preferences shows `Loader2` and success check animation (`SettingsClient.tsx:80-91`). Password change has clear loading/success/error states.

### Notifications — PARTIAL [Minor]
**Evidence:** Has loading.tsx file. But the "Load more" pagination within notifications has no loading indicator visible in the initial code read.

---

## Heuristic 2: Match Between System and Real World

### Homepage — PASS [Cosmetic]
**Evidence:** Language is conversational and domain-appropriate: "Find Your People, Not Just a Place," "No catfishing," "Filters that actually help" (`HomeClient.tsx:68, 203-214`). Feature descriptions use real-world scenarios: "Sleep schedule, noise tolerance, guests policy."

### Search Page — PASS [Cosmetic]
**Evidence:** Uses domain-appropriate terms: "places" (not "results"), "curated spaces and compatible people" (`page.tsx:397-399`). Sort options, filter chips, and category bar use language renters would recognize.

### Listing Detail — PARTIAL [Minor]
**Evidence:** Mostly good — "About this place," "What this place offers," "Hosted by." Gender preference labels are clear: "Male Identifying Only," "Female Identifying Only," "Any Gender / All Welcome" (`ListingPageClient.tsx:247-254`).
**Gap:** "Household Details" section label is slightly clinical. The `holdTtlMinutes` prop is developer jargon that leaks into the component API (though not rendered directly). "Boost visibility" card (`ListingPageClient.tsx:708-727`) says "Promote now" but the button does nothing — it's a dead-end feature tease with no `onClick` handler.

### Auth Pages — PASS [Cosmetic]
**Evidence:** Clear, conversational copy: "Welcome back," "You're all set! Sign in to get started," "Verified roommates, real listings, zero guesswork." Error messages are human-readable: "Incorrect email or password. Check your details and try again."

### Bookings — PASS [Cosmetic]
**Evidence:** Status labels are clear: "Pending," "Accepted," "Rejected," "Held," "Expired." Date formatting uses "short month + day + year" format.

### Booking Form — PARTIAL [Minor]
**Evidence:** Uses "Check-in" and "Check-out" terminology which matches hotel/rental mental models.
**Gap:** The "30-day minimum booking" message (`BookingForm.tsx:61`) is presented as a hard constraint with no explanation of *why*. "Industry standard minimum stay" is a code comment, not user-facing copy.

---

## Heuristic 3: User Control and Freedom

### Homepage — PASS [Cosmetic]
**Evidence:** Clear navigation between homepage, search, login, signup. CTA buttons are bidirectional: "Create Your Profile" and "See Rooms Near You."

### Search Page — PARTIAL [Major]
**Evidence:** `AppliedFilterChips` component exists for showing and removing active filters. `clearAllFilters` utility exists in `filter-chip-utils.ts`. `SortSelect` allows changing sort order.
**Gap:** No visible "Clear all filters" button was found in the search page server component itself — `AppliedFilterChips` shows individual chips but the "clear all" affordance requires reading the chips component. The `CategoryBar` has no clear mechanism in the server component to indicate how to reset categories.

### Listing Detail — FAIL [Major]
**Evidence:** Breadcrumb at top (`ListingPageClient.tsx:352-357`) shows `<span>City</span> > <span>Listings</span>` but these are **not links** — they are plain text with a ChevronRight icon. There is no back button. The only way to return to search results is the browser back button or the navbar "Find a Room" link.
**Gap:** No escape hatch from the listing detail page to search results. This is a core navigation failure for a browsing-heavy flow.

### Auth Pages — PARTIAL [Minor]
**Evidence:** Login has link to signup and vice versa (`LoginClient.tsx:316-324`, `SignUpClient.tsx:430-439`). "Forgot password?" link exists.
**Gap:** No "cancel" or "go back" action on the auth forms. If a user navigates to /login by mistake, they must use browser back or manually navigate.

### Bookings — PASS [Cosmetic]
**Evidence:** Cancel booking has a confirmation dialog with "Keep Booking" option (`BookingsClient.tsx:345-386`). Reject booking has a dialog with "Cancel" escape (`BookingsClient.tsx:388-463`).

### Booking Form — FAIL [Critical]
**Evidence:** After form validation passes, `handleSubmit` opens a confirmation modal (`BookingForm.tsx:340`). After the user confirms, `confirmSubmit` fires (`BookingForm.tsx:354-458`). During submission, `isLoading` is true and Escape is explicitly **blocked** (`BookingForm.tsx:175-177`). The `beforeunload` event fires if user tries to navigate away (`BookingForm.tsx:156-169`).
**Gap:** Once the user clicks "confirm" in the modal, there is **no cancel button**, no abort mechanism, and Escape is disabled. The user is locked into watching the submission complete. If the network is slow, they are trapped. This violates H3 fundamentally.

### Settings — PASS [Cosmetic]
**Evidence:** Delete account requires typing confirmation text. Password change requires current password. Both have explicit cancel/back paths.

---

## Heuristic 4: Consistency and Standards

### Cross-Page Button Styling — PARTIAL [Minor]
**Evidence:** `button.tsx` defines a comprehensive variant system (primary, outline, ghost, destructive, etc.) with consistent size classes. All sizes enforce 44px minimum touch targets (`sizeClasses` at `button.tsx:37-42`).
**Gap:** The login page's Google sign-in button (`LoginClient.tsx:146-189`) is a custom `<button>` with inline classes rather than using the `Button` component. It has `h-11 sm:h-12` which is inconsistent with the Button component's `h-11 min-h-[44px]` default.

### Card Component Usage — PARTIAL [Minor]
**Evidence:** `card.tsx` defines variants (default, elevated, glass, interactive) with padding/radius options. However, `BookingsClient.tsx` builds booking cards with raw `div` elements and inline classes (`bg-surface-container-lowest rounded-2xl border...`) instead of using the Card component. Similarly, `ListingPageClient.tsx` uses raw divs for sidebar cards.

### Navigation Patterns — PASS [Cosmetic]
**Evidence:** `NavbarClient.tsx` implements consistent navigation across screen sizes. Desktop has center nav links + right actions. Mobile has full-screen overlay menu. Active page indicated with `aria-current="page"` and background highlight.

### Typography — PASS [Cosmetic]
**Evidence:** Consistent use of `font-display` (Newsreader) for headings and `font-body` (Manrope) for body text. Heading hierarchy is generally respected: `text-4xl md:text-6xl` for hero, `text-3xl md:text-5xl` for section heads, `text-xl` for subsections.

### Form Input Styling — PARTIAL [Minor]
**Evidence:** `input.tsx` defines a standard input component, but auth forms (`LoginClient.tsx:214-222`, `SignUpClient.tsx:221-228`) use custom inline input styling instead of the `Input` component. The inline styles are visually similar but have subtle differences (e.g., `py-2.5` vs `py-3 sm:py-3.5`, different `rounded-lg` vs the Input's `rounded-lg`).

---

## Heuristic 5: Error Prevention

### Booking Form — PASS [Cosmetic]
**Evidence:** Excellent error prevention:
- Date conflict detection with existing bookings (`BookingForm.tsx:206-230`)
- 30-day minimum validation client-side (`BookingForm.tsx:309-316`)
- Past date prevention (`BookingForm.tsx:295-300`)
- Idempotency keys prevent duplicate submissions (`BookingForm.tsx:124-141`)
- `beforeunload` warning during submission (`BookingForm.tsx:156-169`)
- Debounce protection (`BookingForm.tsx:122, DEBOUNCE_MS = 1000`)
- Offline detection blocks submission (`BookingForm.tsx:272-278`)

### Auth Forms — PASS [Cosmetic]
**Evidence:** Client-side email regex validation (`SignUpClient.tsx:66-71`). Password confirmation with real-time match indicator (`SignUpClient.tsx:317-351`). Password strength meter (`SignUpClient.tsx:294`). Terms checkbox required before submit (`SignUpClient.tsx:46-52`). Turnstile bot protection.

### Bookings Management — PASS [Cosmetic]
**Evidence:** Cancel booking requires confirmation dialog (`BookingsClient.tsx:345-386`). Reject requires explicit dialog with optional reason (`BookingsClient.tsx:388-463`). Offline state disables all actions (`BookingsClient.tsx:166-172`).

### Search — PARTIAL [Minor]
**Evidence:** Date validation prevents past and far-future dates (`SearchForm.tsx:88-121`). Filter values validated against allowlists (`VALID_AMENITIES`, `VALID_HOUSE_RULES`).
**Gap:** No confirmation when clearing all filters. The `clearAllFilters` function resets all params without asking "Are you sure?" This can be frustrating if a user accidentally taps "Clear all" after carefully building a complex filter set.

### Delete Listing — PASS [Cosmetic]
**Evidence:** `DeleteListingButton` exists as a separate component with (presumably) a confirmation dialog.

---

## Heuristic 6: Recognition Over Recall

### Navigation — PARTIAL [Major]
**Evidence:** Navbar shows current page with active state (`NavbarClient.tsx:520-540`). Profile dropdown shows user name and email. Unread message count badge appears on icon.
**Gap:** No breadcrumb navigation anywhere except the decorative (non-functional) breadcrumb on listing detail. Users browsing multiple listings have no way to recall which search brought them there or quickly return to filtered results. There is no "Recently viewed listings" feature.

### Search Filters — PASS [Cosmetic]
**Evidence:** `AppliedFilterChips` shows all active filters as dismissible chips. `RecommendedFilters` suggests relevant filters. Sort selection shows current value. Result count in heading ("15 places in 'San Francisco'").

### Booking Form — PASS [Cosmetic]
**Evidence:** Selected dates shown in summary. Price breakdown calculated and displayed. Availability status shown with color-coded badge.

### Listing Card — PASS [Cosmetic]
**Evidence:** Cards show all key information at a glance: price, location, rating, slot availability, amenities, languages. Favorite state persisted via FavoriteButton with `aria-pressed` state.

### Profile — PARTIAL [Minor]
**Evidence:** Profile shows user info and listings. But there's no "edit" indicator on editable fields — the user must navigate to settings to change preferences and back to profile to verify.

---

## Heuristic 7: Flexibility and Efficiency of Use

### Keyboard Shortcuts — PARTIAL [Major]
**Evidence:** `useKeyboardShortcuts.ts` exists and is used in SearchForm, SearchHeaderWrapper, SearchLayoutView. The navbar implements full roving tabindex for the profile dropdown menu (`NavbarClient.tsx:373-442`): ArrowDown/Up, Home/End, character search, Escape.
**Gap:** Password visibility toggles on both login and signup have `tabIndex={-1}` (`LoginClient.tsx:258`, `SignUpClient.tsx:284, 329`), making them completely unreachable via keyboard. Keyboard-only users cannot toggle password visibility — a significant efficiency and accessibility failure.

### Skip Navigation — FAIL [Critical]
**Evidence:** Grep for "skip" found zero skip-navigation links in any layout or page component. There is no `<a href="#main-content" class="sr-only focus:not-sr-only">Skip to content</a>` anywhere in the app. Keyboard users must tab through the entire navbar (logo + nav links + icons + profile) on every page.

### Power User Features — PARTIAL [Minor]
**Evidence:** Keyboard shortcuts exist for search. Recent searches stored via `useRecentSearches` hook. Save/favorite with optimistic updates.
**Gap:** No keyboard shortcut to open search from any page (e.g., Cmd+K). No "saved searches" quick access from search page (SaveSearchButton exists but saved searches live on a separate page).

### Mobile Efficiency — PARTIAL [Minor]
**Evidence:** Touch targets enforce 44px minimum (`button.tsx:38-41`). FavoriteButton has `min-w-[44px] min-h-[44px]`. Mobile menu is full-screen.
**Gap:** No pull-to-refresh on any page. No swipe gestures for listing cards (e.g., swipe to save).

---

## Heuristic 8: Aesthetic and Minimalist Design

### Homepage — PASS [Cosmetic]
**Evidence:** Clean editorial layout. Generous whitespace. Clear visual hierarchy: editorial label > display heading > subheading > search > CTA. Feature cards are simple with icon + title + description. No visual clutter.

### Search Page — PASS [Cosmetic]
**Evidence:** Results focused layout. Category bar for quick filtering. Clean listing cards with image, title, location, price, amenities. Good information density without overwhelming.

### Listing Detail — PARTIAL [Minor]
**Evidence:** Generally well-organized with clear sections. Image gallery, stats bar, description, amenities, host info, reviews, similar listings.
**Gap:** The owner management sidebar (`ListingPageClient.tsx:640-727`) shows both a management card AND a "Boost visibility" upsell card. The boost card is a dead feature (no onClick handler on "Promote now") that adds visual noise to an already complex page. The `ListingStatusToggle` appears **twice** — once in the quick stats bar (`line 400-407`) and again in the management sidebar (`line 653-659`).

### Listing Card — PARTIAL [Minor]
**Evidence:** Cards have clean layout with image carousel, badges, price, location, amenities.
**Gap:** Badge stacking on cards can be excessive. A card can simultaneously show: TrustBadge, SlotBadge, "Multi-Room" badge, AND a rating badge — four overlapping badges in the top-left corner of the image (`ListingCard.tsx:334-358`). This creates visual noise and can obscure the image.

### Auth Pages — PASS [Cosmetic]
**Evidence:** Split layout with testimonial on left, form on right. Minimal form fields. Clear hierarchy. Good use of whitespace.

---

## Heuristic 9: Help Users Recognize, Diagnose, and Recover from Errors

### Booking Form — PASS [Cosmetic]
**Evidence:** Excellent error recovery design:
- Error categorization by type: validation, server, network, blocked, auth, rate_limit (`BookingForm.tsx:233-256`)
- Color-coded error banners: amber for retryable (server/network), red for validation (`BookingForm.tsx:480-518`)
- Retry button for server/network errors (`BookingForm.tsx:515-518`)
- "Sign in again" link for auth errors
- Field-specific errors via `fieldErrors` state
- Idempotency recovery after page refresh (`BookingForm.tsx:127-141`)

### Auth Pages — PASS [Cosmetic]
**Evidence:** `AuthErrorAlert` component handles OAuth errors and custom errors (`LoginClient.tsx:142-143`). Specific messages for rate limiting ("Too many sign-in attempts"), incorrect credentials, network failures. Turnstile failure shows retry button.

### Search — PARTIAL [Major]
**Evidence:** `SearchResultsErrorBoundary` wraps results. Zero-results UI exists when `hasConfirmedZeroResults` is true. `nearMatchExpansion` provides "near match" disclosure.
**Gap:** The rate limit error page (`page.tsx:200-216`) shows "Too many requests / Please wait a moment" but provides **no retry mechanism, no countdown, and no alternative action**. The user is shown a dead-end page with no path forward except manually refreshing.

### Messages — PASS [Cosmetic]
**Evidence:** Has `error.tsx` boundary files for both `/messages` and `/messages/[id]`.

### Settings — PARTIAL [Minor]
**Evidence:** Password change shows `passwordError` state. Delete account requires confirmation.
**Gap:** Password mismatch error ("New passwords do not match") appears only after form submission, not in real-time like the signup form's live match indicator.

---

## Heuristic 10: Help and Documentation

### Onboarding — FAIL [Major]
**Evidence:** No onboarding flow exists for new users. After signing up and being redirected to login, the user is dropped into the app with no guidance on what to do next — create a listing? Complete their profile? Browse rooms?

### Contextual Help — FAIL [Major]
**Evidence:** Grep for "tooltip" found only 3 files. `BookingForm.tsx` has a tooltip reference, and `PersistentMapWrapper.tsx` has map tooltips. No contextual help exists for:
- What "Connection Score" means (the concept doesn't exist in code despite being mentioned in the CLAUDE.md audit requirements)
- How the booking hold system works
- What "Boost visibility" does (dead feature, no explanation)
- Why the 30-day minimum booking exists
- What verification means and how to get verified
- How the review system works (who can review, when)

### Help Center — FAIL [Major]
**Evidence:** No help page, FAQ, or documentation exists in the app. No `/help`, `/faq`, or `/support` routes found. The only "How it works" page is `/about` linked in the navbar.

### Empty State Guidance — PARTIAL [Minor]
**Evidence:** Bookings empty state has clear guidance: "When tenants request to book your listings, they will appear here" with a CTA button (`BookingsClient.tsx:734-761`). Profile empty state shows "No listings yet" (`ProfileClient.tsx:438`).
**Gap:** Notifications empty state is generic: "No notifications yet" with no explanation of what types of notifications will appear. Saved listings empty state says "No saved listings yet" without explaining how to save one.

---

## Priority Rankings

| # | Finding | Heuristic | Severity | Page | Evidence |
|---|---------|-----------|----------|------|----------|
| 1 | No skip-navigation link in the entire app | H7, H10 | Critical | Global | Grep for "skip" returns zero results in layout/page files |
| 2 | Booking form locks user during submission (no cancel, Escape blocked) | H3 | Critical | Listing Detail | `BookingForm.tsx:175-177` explicitly blocks Escape; no abort controller for the submission |
| 3 | Search results have no aria-live announcements for result changes | H1 | Major | Search | `SearchResultsClient` remounts via key without any live region |
| 4 | Password toggle buttons removed from tab order via tabIndex={-1} | H7 | Major | Login, Signup | `LoginClient.tsx:258`, `SignUpClient.tsx:284, 329` |
| 5 | Listing breadcrumb is decorative text, not navigable | H6, H3 | Major | Listing Detail | `ListingPageClient.tsx:352-357` uses `<span>` not `<nav>/<ol>/<a>` |
| 6 | No onboarding flow after signup | H10 | Major | Post-signup | Login redirect with no next-step guidance |
| 7 | No contextual help/tooltips for key concepts (holds, verification, boost) | H10 | Major | Multiple | Grep for "tooltip" finds 3 files total, none explanatory |
| 8 | Rate limit error page is a dead end — no retry, countdown, or alternative | H9 | Major | Search | `page.tsx:200-216` shows static error with no path forward |
| 9 | Search page has no aria-live region for result count updates | H1 | Major | Search | No `aria-live` in search results area |
| 10 | No help center, FAQ, or support page | H10 | Major | Global | No `/help`, `/faq`, `/support` routes exist |
| 11 | "Boost visibility" is a dead feature with no handler — misleads owners | H2, H5 | Major | Listing Detail | `ListingPageClient.tsx:721` has no onClick |
| 12 | ListingStatusToggle rendered twice on owner view (stats bar + sidebar) | H8 | Minor | Listing Detail | `ListingPageClient.tsx:400-407` and `653-659` |
| 13 | Google sign-in button uses inline classes instead of Button component | H4 | Minor | Login, Signup | `LoginClient.tsx:146-189` custom button |
| 14 | Auth form inputs don't use the shared Input component | H4 | Minor | Login, Signup | Custom inline input styles diverge from `input.tsx` |
| 15 | Listing cards can stack 4 overlapping badges on image | H8 | Minor | Search | `ListingCard.tsx:334-358` — TrustBadge + SlotBadge + Multi-Room + Rating |
| 16 | No "Clear all filters" confirmation on search | H5 | Minor | Search | `clearAllFilters` resets without confirmation |
| 17 | No recently viewed listings feature | H6 | Minor | Global | No history/recall mechanism for browsed listings |
| 18 | Message loading fallback is an unlabeled spinner | H1 | Minor | Messages | `messages/page.tsx:26-28` — spinning border with no text |
| 19 | Viewer state fetch on listing page has no visible loading indicator | H1 | Minor | Listing Detail | `ListingPageClient.tsx:296-336` — sidebar simply absent during load |
| 20 | Settings password mismatch only shown on submit, not live | H9 | Minor | Settings | Unlike signup which has live match indicator |
| 21 | No `prefers-reduced-motion` respect in framer-motion hero animations | H7 | Minor | Homepage | `HomeClient.tsx` uses `LazyMotion` but individual variants don't check for reduced motion preference |
| 22 | Homepage SearchForm shimmer has no aria-busy or screen reader text | H1 | Cosmetic | Homepage | `HomeClient.tsx:98-100` shimmer div with no a11y attributes |
| 23 | Profile has no inline edit indicators | H6 | Cosmetic | Profile | Fields shown but edit path unclear without Settings link |
| 24 | Notifications empty state lacks guidance on notification types | H10 | Cosmetic | Notifications | `NotificationsClient.tsx:243` — "No notifications yet" with no context |
