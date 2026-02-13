# Roomshare Playwright E2E Coverage Report

**Generated**: 2026-02-13 (updated)
**Total**: 140 spec files | ~1,425 test cases | 32 pages audited

---

## Table of Contents

- [Master Coverage Matrix](#master-coverage-matrix)
- [Coverage by Domain](#coverage-by-domain)
  - [Search & Filters](#1-search--filters)
  - [Map](#2-map)
  - [Pagination](#3-pagination)
  - [Mobile UX](#4-mobile-ux)
  - [Create Listing](#5-create-listing)
  - [Listing Detail](#6-listing-detail)
  - [Listing Edit](#7-listing-edit)
  - [Listing Management](#8-listing-management)
  - [Auth Flows](#9-auth-flows)
  - [Booking](#10-booking)
  - [Messaging](#11-messaging)
  - [Reviews](#12-reviews)
  - [Favorites & Saved Searches](#13-favorites--saved-searches)
  - [Profile & Settings](#14-profile--settings)
  - [Admin Panel](#15-admin-panel)
  - [Safety & Edge Cases](#16-safety--edge-cases)
  - [Nearby Places](#17-nearby-places)
  - [Static & Utility Pages](#18-static--utility-pages)
  - [Homepage](#19-homepage)
  - [Notifications](#20-notifications)
  - [Booking Race Conditions](#21-booking-race-conditions)
- [Cross-Cutting Coverage](#cross-cutting-coverage)
  - [Accessibility](#accessibility)
  - [Visual Regression](#visual-regression)
  - [Performance](#performance)
  - [Dark Mode](#dark-mode)
- [Critical Findings](#critical-findings)
  - [Pages with Zero Coverage](#pages-with-zero-test-coverage)
  - [Bugs in Existing Tests](#critical-bugs-in-existing-tests)
  - [Most Critical Functional Gaps](#most-critical-functional-gaps)
  - [Cross-Cutting Gaps](#cross-cutting-coverage-gaps)
- [Recommendations](#recommendations)

---

## Master Coverage Matrix

| Page / Route | Functional | A11y | Visual | Perf | Mobile | Dark Mode | **Overall** |
|---|---|---|---|---|---|---|---|
| `/search` | **HIGH** (~500+) | **HIGH** (10 files) | **MED** (3 files) | **MED** (2 files) | **HIGH** (6 files) | **MED** (3 files) | **EXCELLENT** |
| `/listings/create` | **HIGH** (~62) | **HIGH** (dedicated) | **HIGH** (5 viewports) | **HIGH** (LCP/CLS/TTI) | partial (visual) | NONE | **EXCELLENT** |
| `/listings/[id]` | **HIGH** (~22) | **HIGH** (axe + dedicated) | **MED** (3 tests) | **MED** (CWV) | partial (axe) | YES | **GOOD** |
| `/listings/[id]/edit` | **HIGH** (~20) | NONE | NONE | NONE | NONE | NONE | **GOOD** |
| `/login` | **HIGH** (~8) | YES (axe) | YES (dark-mode) | YES (CWV) | NONE | YES | **GOOD** |
| `/signup` | **MED** (~6) | YES (axe) | YES (dark-mode) | NONE | NONE | YES | **MODERATE** |
| `/forgot-password` | LOW (~4) | YES (axe) | NONE | NONE | NONE | NONE | **LOW** |
| `/reset-password` | **HIGH** (~17) | NONE | NONE | NONE | NONE | NONE | **MODERATE** |
| `/verify` | LOW (~4) | NONE | NONE | NONE | NONE | NONE | **LOW** |
| `/verify-expired` | **HIGH** (~14) | NONE | NONE | NONE | NONE | NONE | **MODERATE** |
| `/bookings` | **HIGH** (~57) | YES (axe) | YES (dark-mode) | NONE | YES (8) | YES | **GOOD** |
| `/messages` | **MED** (~14) | YES (axe) | YES (dark-mode) | NONE | YES (8) | YES | **MODERATE** |
| `/messages/[id]` | LOW (~3) | NONE | NONE | NONE | NONE | NONE | **LOW** |
| `/saved` | **MED** (~6) | YES (axe) | NONE | NONE | NONE | NONE | **LOW-MED** |
| `/saved-searches` | LOW (~6) | YES (axe) | NONE | NONE | NONE | NONE | **LOW** |
| `/profile` | LOW (~3) | YES (axe) | YES (dark-mode) | NONE | YES (6) | YES | **LOW-MED** |
| `/profile/edit` | LOW (~3) | YES (axe) | YES (dark-mode) | NONE | YES (6) | YES | **LOW-MED** |
| `/settings` | **MED** (~10) | YES (axe) | YES (dark-mode) | NONE | NONE | YES | **MODERATE** |
| `/users/[id]` | LOW (~3) | NONE | NONE | NONE | NONE | NONE | **LOW** |
| `/admin` | **MED** (~5) | NONE | NONE | NONE | NONE | NONE | **MODERATE** |
| `/admin/listings` | LOW (~3) | NONE | NONE | NONE | NONE | NONE | **LOW** |
| `/admin/reports` | **MED** (~4) | NONE | NONE | NONE | NONE | NONE | **LOW-MED** |
| `/admin/users` | **MED** (~4) | NONE | NONE | NONE | NONE | NONE | **LOW-MED** |
| `/admin/verifications` | LOW (~4) | NONE | NONE | NONE | NONE | NONE | **LOW** |
| `/admin/audit` | LOW (~3) | NONE | NONE | NONE | NONE | NONE | **LOW** |
| `/` (homepage) | **HIGH** (~12) | YES (axe) | YES (dark-mode) | YES (CWV) | NONE | YES | **GOOD** |
| `/about` | NONE | YES (axe) | NONE | NONE | NONE | NONE | **VERY LOW** |
| `/terms` | NONE | YES (axe) | NONE | NONE | NONE | NONE | **VERY LOW** |
| `/privacy` | NONE | YES (axe) | NONE | NONE | NONE | NONE | **VERY LOW** |
| `/notifications` | **HIGH** (~14) | YES (axe) | NONE | NONE | YES (6) | NONE | **GOOD** |
| `/recently-viewed` | NONE | YES (axe) | NONE | NONE | NONE | NONE | **VERY LOW** |
| `/offline` | NONE | NONE | NONE | NONE | NONE | NONE | **NONE** |

---

## Coverage by Domain

### 1. Search & Filters

**Rating: EXCELLENT | 37 files | ~450 tests**

#### Search Core & Smoke
| Spec File | Tests | What's Covered |
|---|---|---|
| `search-smoke.spec.ts` | ~9 | Basic search rendering, results display |
| `search-p0-smoke.anon.spec.ts` | ~18 | P0 smoke tests for anonymous users |
| `journeys/01-discovery-search.spec.ts` | ~10 | Full discovery search journey |
| `journeys/02-search-critical-journeys.spec.ts` | ~21 | Critical search paths |
| `journeys/03-search-advanced-journeys.spec.ts` | ~35 | Advanced search scenarios |
| `journeys/27-search-refinement.spec.ts` | ~3 | Search refinement flow |

#### Search Filters (22 dedicated files, ~146 tests)
| Spec File | Tests | Filter Type |
|---|---|---|
| `filter-price.anon.spec.ts` | ~7 | Price range slider |
| `filter-date.anon.spec.ts` | ~7 | Move-in date picker |
| `filter-amenities.anon.spec.ts` | ~7 | Amenities checkboxes |
| `filter-house-rules.anon.spec.ts` | ~7 | House rules (pets, smoking, etc.) |
| `filter-gender-language.anon.spec.ts` | ~7 | Gender preference & language |
| `filter-lease-duration.anon.spec.ts` | ~7 | Lease duration range |
| `filter-category-bar.anon.spec.ts` | ~7 | Category bar navigation |
| `filter-room-type.anon.spec.ts` | ~7 | Room type selection |
| `filter-modal.anon.spec.ts` | ~7 | Filter modal open/close/apply |
| `filter-chips.anon.spec.ts` | ~7 | Active filter chips display/remove |
| `filter-recommended.anon.spec.ts` | ~7 | Recommended sort integration |
| `filter-combinations.anon.spec.ts` | ~7 | Multiple filter combinations |
| `filter-dead-ends.anon.spec.ts` | ~7 | Zero-result handling |
| `filter-near-matches.anon.spec.ts` | ~7 | Near-match suggestions |
| `filter-count-preview.anon.spec.ts` | ~7 | Live count preview in modal |
| `filter-reset.anon.spec.ts` | ~7 | Filter reset/clear all |
| `filter-persistence.anon.spec.ts` | ~7 | Filter state persistence |
| `filter-url-desync.anon.spec.ts` | ~7 | URL/UI state sync |
| `filter-race-conditions.anon.spec.ts` | ~7 | Rapid filter changes |
| `filter-validation.anon.spec.ts` | ~7 | Invalid filter values |
| `filter-pagination-interaction.anon.spec.ts` | ~7 | Filters + pagination interaction |
| `filter-mobile.anon.spec.ts` | ~5 | Mobile filter UX |

#### Search URL State (4 files, ~46 tests)
| Spec File | Tests | What's Covered |
|---|---|---|
| `search-url-deeplink.spec.ts` | ~10 | Deep linking with params |
| `search-url-roundtrip.spec.ts` | ~9 | URL state roundtrip consistency |
| `search-url-navigation.spec.ts` | ~8 | Browser back/forward navigation |
| `search-url-invalid-params.spec.ts` | ~19 | Invalid/malicious URL params |

#### Search Additional
| Spec File | Tests | What's Covered |
|---|---|---|
| `search-sort-ordering.anon.spec.ts` | ~36 | All sort options and ordering |
| `search-loading-states.spec.ts` | ~8 | Loading skeletons, spinners |
| `search-error-resilience.anon.spec.ts` | ~25 | API errors, timeouts, fallbacks |
| `search-v2-fallback.spec.ts` | ~8 | V2 API fallback to V1 |
| `search-map-list-sync.anon.spec.ts` | ~30 | Map/list result synchronization |
| `list-ux.spec.ts` | ~14 | Listing card UX interactions |
| `terminal3-filters-nav.spec.ts` | ~8 | Filter navigation terminal flow |

**Gaps**: None significant. This is the best-covered area of the app.

---

### 2. Map

**Rating: EXCELLENT | 17 files | ~165 tests**

| Spec File | Tests | What's Covered |
|---|---|---|
| `map-interactions.anon.spec.ts` | ~9 | Basic map click, hover |
| `map-interactions-advanced.anon.spec.ts` | ~9 | Complex interactions |
| `map-interactions-edge.anon.spec.ts` | ~13 | Edge case interactions |
| `map-pan-zoom.spec.ts` | ~13 | Pan and zoom controls |
| `map-markers.anon.spec.ts` | ~19 | Marker rendering, clustering |
| `map-bounds-roundtrip.anon.spec.ts` | ~11 | Search-as-I-move, bounds sync |
| `map-search-results.anon.spec.ts` | ~14 | Results overlay on map |
| `map-search-toggle.anon.spec.ts` | ~10 | Search-as-I-move toggle |
| `map-loading.anon.spec.ts` | ~11 | Map loading states |
| `map-errors-a11y.anon.spec.ts` | ~9 | Error handling + accessibility |
| `map-features.anon.spec.ts` | ~8 | Map feature layers |
| `map-style.anon.spec.ts` | ~12 | Map style/theme |
| `map-persistence.anon.spec.ts` | ~13 | Map state persistence |
| `map-filters.spec.ts` | ~11 | Filter sync with map |
| `journeys/list-map-sync.spec.ts` | ~18 | List-map synchronization journey |
| `journeys/map-pin-tiering.spec.ts` | ~4 | Pin priority tiering |
| `journeys/12-map-error-handling.spec.ts` | varies | Map error scenarios |

**Gaps**: None significant.

---

### 3. Pagination

**Rating: HIGH | 8 files | ~53 tests**

| Spec File | Tests | What's Covered |
|---|---|---|
| `pagination/pagination-core.spec.ts` | ~7 | Load more, cursor management |
| `pagination/pagination-state.spec.ts` | ~7 | Pagination state management |
| `pagination/pagination-api.spec.ts` | ~7 | API cursor handling |
| `pagination/pagination-sort-reset.spec.ts` | ~7 | Sort change resets pagination |
| `pagination/pagination-browse-mode.spec.ts` | ~7 | Browse mode pagination |
| `pagination/pagination-split-stay.spec.ts` | ~7 | Split-stay pagination |
| `pagination/pagination-reset.spec.ts` | ~7 | Manual pagination reset |
| `pagination/pagination-a11y.spec.ts` | ~7 | Pagination accessibility |

**Gaps**: None significant.

---

### 4. Mobile UX

**Rating: HIGH (expanded) | 10 files | ~92 tests**

#### Search Mobile (6 files, ~64 tests)
| Spec File | Tests | What's Covered |
|---|---|---|
| `mobile-bottom-sheet.spec.ts` | ~23 | Drag gestures, snap points, collapse/expand |
| `mobile-interactions.anon.spec.ts` | ~23 | Touch interactions, swipe, tap |
| `mobile-toggle.anon.spec.ts` | ~9 | List/map toggle on mobile |
| `mobile-ux.anon.spec.ts` | ~9 | General mobile UX patterns |
| `search-filters/filter-mobile.anon.spec.ts` | ~5 | Mobile filter interactions |
| `journeys/search-p0-filters-mobile.spec.ts` | ~2 | P0 mobile filter journey |

#### Authenticated Pages Mobile (4 files, 28 tests) *(NEW — PR #20)*
| Spec File | Tests | What's Covered |
|---|---|---|
| `mobile/mobile-bookings.spec.ts` | 8 | MB-01–08: Booking list layout, card details, detail view, empty state, filter tabs, cancel button, refresh, responsive detail |
| `mobile/mobile-messages.spec.ts` | 8 | MM-01–08: Conversation list, message thread, input, back button, empty state, long messages, scroll, unread indicator |
| `mobile/mobile-profile.spec.ts` | 6 | MP-01–06: Profile page layout, edit link, edit form, full-width inputs, save button, avatar display |
| `mobile/mobile-notifications.spec.ts` | 6 | MN-01–06: Notifications layout, item display, actions (mark read/delete), filter tabs, empty state, badge count |

**Gaps**: Mobile testing for `/settings`, auth pages, and `/admin/*` still missing. No mobile visual regression tests.

---

### 5. Create Listing

**Rating: EXCELLENT | 7 files | ~62 tests**

| Spec File | Tests | What's Covered |
|---|---|---|
| `create-listing/create-listing.spec.ts` | ~18 | Happy path, validation, optional fields, character limits |
| `create-listing/create-listing-draft.spec.ts` | ~6 | Auto-save, resume, discard, navigation guard |
| `create-listing/create-listing-images.spec.ts` | ~8 | Upload, multi-image, remove, invalid type, max limit |
| `create-listing/create-listing.resilience.spec.ts` | ~11 | 500/429/401/403 errors, discriminatory language, geocoding failure, double-submit, network timeout |
| `create-listing/create-listing.a11y.spec.ts` | ~8 | Axe scans (4 states), keyboard nav, focus-to-error, labels |
| `create-listing/create-listing.visual.spec.ts` | ~7 | Visual regression across 5 viewports |
| `create-listing/create-listing.perf.spec.ts` | ~4 | LCP, CLS, TTI, page load |

**Gaps**: None significant. Most thoroughly tested flow in the app.

---

### 6. Listing Detail

**Rating: GOOD | 4 dedicated files | ~65 tests**

| Spec File | Tests | What's Covered |
|---|---|---|
| `listing-detail/listing-detail.spec.ts` | ~22 | **Visitor view**: h1 title, stats bar, about/amenities, host section, price, reviews heading. **Action buttons**: share fallback dropdown, save toggle, report dialog. **Gallery**: render check, lightbox navigation, zoom toggle. **Owner view**: management card, status toggle, stats cards, boost CTA. **Booking**: date pickers, DatePicker hydration, unauthenticated CTA. **Reviews**: star rating display, owner respond button |
| `a11y/listing-detail-a11y.spec.ts` | ~12 | Full axe scan, dark mode, mobile viewport, keyboard, landmarks |
| `visual/listing-detail-visual.spec.ts` | ~3 | Desktop/mobile/tablet visual regression |
| (+ nearby specs) | ~28 | Nearby places layout, attribution, accessibility |

**Remaining Gaps**:
- Map display on detail page untested
- Booking form submission flow (requires available dates in seed)
- Image upload interaction on owner edit untested
- Contact host → messaging thread not verified end-to-end

---

### 7. Listing Edit

**Rating: GOOD | 1 dedicated + 2 journey files | ~20 tests** *(rewritten in PR #20)*

#### Dedicated Tests (18 tests in `listing-edit/listing-edit.spec.ts`)
| Test IDs | Tests | What's Covered |
|---|---|---|
| LE-01–03 | 3 | **Auth & access guards**: unauthenticated redirect-or-skip, non-owner 403/redirect, owner form loads with pre-filled data |
| LE-04–10 | 7 | **Field editing**: title input, description textarea, price input, room type dropdown, amenities toggles, location fields, date inputs — all read-only assertions (no save) |
| LE-11–13 | 3 | **Image management**: existing images displayed, add image button visible, delete button visible (read-only to preserve seed) |
| LE-14–15 | 2 | **Draft persistence**: edit title → navigate away → return → draft restored from localStorage; clear draft button resets |
| LE-16–18 | 3 | **Form actions**: cancel navigates back, submit with no changes, validation error on cleared required field |

#### Journey Tests (2 tests)
- `journeys/03-listing-management.spec.ts` (1 edit test)
- `journeys/24-listing-management.spec.ts` (1 edit test)

**Remaining Gaps**:
- Image upload/remove/reorder interaction untested (read-only by design to preserve seed)
- Address change with re-geocoding untested
- Edit form accessibility (a11y) untested
- Visual regression untested

---

### 8. Listing Management

**Rating: MODERATE | 2 files | ~13 tests**

| Spec File | Tests | What's Covered |
|---|---|---|
| `journeys/03-listing-management.spec.ts` | ~9 | Edit, delete, cancel delete, toggle status, image upload |
| `journeys/24-listing-management.spec.ts` | ~4 | Pause/unpause, draft persistence, form validation |

**Gaps**: No test for managing multiple listings simultaneously, no listing analytics.

---

### 9. Auth Flows

**Rating: GOOD | 7 files | ~63 tests**

#### Login (HIGH - ~8 tests)
- Successful login + session persistence
- Invalid credentials error
- Form rendering (email/password fields)
- Link to signup
- Authenticated user redirect away from /login
- Protected route redirect to login

**Login Gaps**: Google OAuth login never functionally tested, show/hide password toggle untested, OAuth error handling untested.

#### Signup (MED - ~6 tests)
- Complete signup flow (name, email, password, confirm, terms)
- Existing email error
- Weak password validation
- Form rendering

**Signup Gaps**: Password strength meter levels untested, confirm password mismatch untested, show/hide toggles untested, Google OAuth untested.

#### Password Reset (HIGH - ~21 tests)
- Request reset (fill email, submit, "check email" message)
- Anti-enumeration (same response for any email)
- "Try another email" button
- Form rendering

**`/reset-password` page (17 tests in `reset-password.anon.spec.ts`)**:
- **No token state** (RP-01–03): invalid link heading, navigate to /forgot-password, back to /login
- **Invalid token** (RP-04–06): malformed token, non-existent hex token, loading spinner during validation
- **Valid token form** (RP-07–11, RP-17): form renders, field attributes (type, minLength, required), visibility toggle, mismatched passwords error, short password error, back to login link — all using mocked token validation to avoid rate limits
- **Full flow** (RP-12–14): real API forgot→reset→success, log in link, reused token rejected — skips gracefully in CI (NODE_ENV=production)
- **Edge cases** (RP-15–16): server error display, loading state during submission

**Password Reset Gaps**: Google OAuth password reset untested, rate limiting at 5/hr tested only via mock (RP-09).

#### Email Verification (MED - ~18 tests)

**`/verify` page (4 tests in `verify.spec.ts` — Phase 1)**:
- Auth guard redirect to /login with callbackUrl (VF-01)
- Page header renders with title (VF-02)
- Verified user sees "You're Verified!" badge + profile link (VF-03–04)

**Phase 2 (14 tests documented, requires seed extension with unverified user)**: VF-05 through VF-18 covering benefits section, document type selector, file upload, submit flow, pending state, rejected state with cooldown, privacy notice.

**`/verify-expired` page (14 tests in `verify-expired.spec.ts`)**:
- **Page structure** (VE-01–02): expired link header, back to home link
- **Authenticated state** (VE-03–04, VE-06): resend button, 24h expiry warning, loading state — all using mocked API (test user is already verified)
- **Resend flow** (VE-05, VE-07): success → "Check Your Inbox", "try again" resets state
- **Error handling** (VE-08–10): 500 error toast, 429 rate limit toast, 400 "already verified" toast
- **Unauthenticated state** (VE-11–14): login prompt, login button with callback URL, signup link, loading spinner

**Email Verification Gaps**: Document upload flow requires unverified seed user (Phase 2), verification states (pending/rejected) untested, cooldown after rejection untested.

#### Auth State (~8 tests)
- Logout clears session
- Protected route redirects
- Session persistence across tabs
- Rate limit on failed logins

**Auth State Gaps**: Logout on mobile skipped, session expiry handling untested, callback URL preservation untested.

---

### 10. Booking

**Rating: HIGH | 4 files | ~57 tests**

| Spec File | Tests | What's Covered |
|---|---|---|
| `journeys/05-booking.spec.ts` | ~10 | Request to book, can't book own, view pending, accept, reject, cancel, calendar, date validation, notifications |
| `journeys/21-booking-lifecycle.spec.ts` | ~4 | Full request submission, rejection flow, cancellation persistence |
| `journeys/30-critical-simulations.spec.ts` | ~34 | Booking simulations including double-booking |
| `booking/booking-race-conditions.spec.ts` | 9 | RC-01–09: Concurrent booking, overlapping dates, already-booked, double-click submit, accept+cancel race, last-slot race, expired session, optimistic locking, network retry *(NEW — PR #20)* |

**Gaps**:
- ~~**Double-booking prevention test (J24) ALWAYS PASSES**~~ — ✅ FIXED. J24 now properly submits a booking, clears session guards, attempts a duplicate, and asserts server rejection via `[role="alert"]`
- ~~Concurrent users competing for same listing~~ — ✅ COVERED by RC-01, RC-02, RC-06
- Expired hold auto-expiration — NOT tested
- Full state machine sequence (pending -> accepted -> cancelled) — NOT tested as complete chain
- Booking details page (individual booking view) — NOT tested
- Rollback behavior when downstream fails — NOT tested

---

### 11. Messaging

**Rating: MODERATE | 3 files | ~14 tests**

| Spec File | Tests | What's Covered |
|---|---|---|
| `journeys/06-messaging.spec.ts` | ~10 | Contact host, inbox, open conversation, send/receive, real-time polling, unread badge, mark read, block user, empty message prevention, offline handling |
| `journeys/22-messaging-conversations.spec.ts` | ~3 | Send in conversation, start from listing, empty inbox |
| `journeys/30-critical-simulations.spec.ts` | ~1 | Basic messaging simulation |

**Gaps**:
- Real-time/WebSocket updates NOT truly tested (only polling interval)
- Conversation deletion untested
- Message pagination/infinite scroll untested
- File/image attachments untested
- Access control (can't view others' conversations) untested
- Mobile messaging layout — J25 explicitly SKIPS mobile

---

### 12. Reviews

**Rating: GOOD | 2 files | ~15 tests**

| Spec File | Tests | What's Covered |
|---|---|---|
| `journeys/07-reviews.spec.ts` | ~12 | Display reviews, pagination, submit review, star rating, edit, delete, host response, filter by rating, sort by date, character limit, can't review without booking |
| `journeys/23-review-lifecycle.spec.ts` | ~3 | Write review, host response, review summary |

**Gaps**: Review moderation untested, multiple reviews prevention untested, sort verification weak (clicks sort but doesn't verify order).

---

### 13. Favorites & Saved Searches

**Rating: MODERATE | 2 files | ~12 tests**

| Spec File | Tests | What's Covered |
|---|---|---|
| `journeys/04-favorites-saved-searches.spec.ts` | ~9 | Toggle favorite, view saved, remove, save search, name it, set frequency, view saved searches, delete, run search, toggle alerts |
| `journeys/20-critical-journeys.spec.ts` | ~3 | Page loads, button presence |

**Gaps**: Favorite persistence after reload untested, unauthorized favorite untested, complex filter saved searches untested.

---

### 14. Profile & Settings

**Rating: MODERATE | 3 files | ~16 tests**

| Spec File | Tests | What's Covered |
|---|---|---|
| `journeys/08-profile-settings.spec.ts` | ~14 | View profile, edit name/bio, upload picture, toggle notifications, notification preferences, profile visibility, change password, password strength, OAuth providers, deactivate account, delete account warning, dark mode toggle, language preference |
| `journeys/25-user-profile-blocking.spec.ts` | ~3 | View public profile, block/unblock user, edit bio/languages |

**Gaps**: Blocked users management untested, save preferences persistence untested, OAuth connect/disconnect untested, actual password change not verified, delete account flow not completed.

---

### 15. Admin Panel

**Rating: MODERATE | 1 dedicated file | 23 tests (ADM-01–24)** *(rewritten in PR #19)*

All admin tests now run under the `chromium-admin` Playwright project with proper admin `storageState`, replacing the previous journey-based tests that had silent-skip guards.
All tests are **read-only** — they assert visibility but never click destructive actions (Approve/Reject/Delete/Suspend) to preserve seed data.

| Admin Page | Test IDs | Tests | What's Covered |
|---|---|---|---|
| `/admin` (dashboard) | ADM-01–03 | 3 | Header renders, 4 stat cards (Total Users, Active Listings, Pending Verifications, Reports), 4 quick action links |
| `/admin/verifications` | ADM-05–08 | 4 | Page heading, filter tabs (All/Pending/Approved/Rejected), PENDING badge displayed, Approve button visible on pending request |
| `/admin/users` | ADM-09–12 | 4 | Page heading, search input, "Showing X of Y users" hydration check, action menu (MoreVertical) on non-self user |
| `/admin/listings` | ADM-13–15 | 3 | Page heading, search + status filter buttons (All/Active), listing cards with $/mo pricing |
| `/admin/reports` | ADM-16–19 | 4 | Page heading, filter buttons (All/Open/Resolved/Dismissed), open report listing title, "Take Action" button |
| `/admin/audit` | ADM-20–22 | 3 | Page heading, action type filter links (All/User Suspended/Report Resolved), table rows with audit entries |
| Auth guards | ADM-23–24 | 2 | Regular user redirected from `/admin` and `/admin/users` (uses user storageState override) |

**Remaining Gaps**:
- Actual destructive action completion (approve/reject/suspend) untested (read-only by design to preserve seed)
- Individual stat card accuracy untested (just visibility)
- Listing moderation action flow untested
- Admin page accessibility (a11y) untested
- Admin page pagination untested
- No mobile viewport testing for admin pages

---

### 16. Safety & Edge Cases

**Rating: HIGH | 3 files | ~68 tests**

| Spec File | Tests | What's Covered |
|---|---|---|
| `journeys/28-safety-edge-cases.spec.ts` | ~6 | Report listing, XSS prevention, rate limit feedback, protected routes, offline page, cross-page navigation |
| `journeys/30-critical-simulations.spec.ts` | ~34 | Critical flow simulations across auth, booking, messaging, search |
| `journeys/20-critical-journeys.spec.ts` | ~28 | Critical user journeys including error handling |

**Gaps**: SQL injection untested, CSRF untested, file upload validation untested, IDOR untested, session fixation untested, CSP validation untested.

---

### 17. Nearby Places

**Rating: GOOD | 3 files | ~28 tests**

| Spec File | Tests | What's Covered |
|---|---|---|
| `nearby/nearby-accessibility.spec.ts` | ~8 | Focus outline, escape key, high contrast, font scaling, keyboard nav |
| `nearby/nearby-attribution.spec.ts` | ~8 | Radar attribution (mobile, dark mode), map tiles, links, CSP, privacy |
| `nearby/nearby-layout.spec.ts` | ~12 | CSS transforms, z-index, scroll containment, Safari zoom, resize, retina, mobile layout |

**Gaps**: Actual nearby places data display (names, categories, distances) untested. Tests use mocked API responses.

---

### 18. Static & Utility Pages

| Page | Tests | Coverage |
|---|---|---|
| `/` (homepage) | ~15 (12 functional + 3 a11y) | **GOOD** — See [Section 19: Homepage](#19-homepage) |
| `/about` | ~1 (axe only) | **VERY LOW** — No content or navigation tests |
| `/terms` | ~1 (axe only) | **VERY LOW** — Scroll spy, sidebar untested |
| `/privacy` | ~1 (axe only) | **VERY LOW** — Scroll spy, sidebar untested |
| `/notifications` | ~15 (14 functional + 1 axe) | **GOOD** — See [Section 20: Notifications](#20-notifications) |
| `/recently-viewed` | ~1 (axe only) | **VERY LOW** — List, empty state, view tracking untested |
| `/offline` | 0 | **NONE** — Retry button, rendering untested |

---

### 19. Homepage

**Rating: GOOD | 2 files | 12 tests** *(NEW — PR #20)*

#### Anonymous Tests (8 tests in `homepage/homepage.anon.spec.ts`)
| Test IDs | Tests | What's Covered |
|---|---|---|
| HP-01–02 | 2 | Hero section with heading and search CTA, stats counters (listings/users) |
| HP-03–05 | 3 | "How it works" feature cards, featured listings carousel, listing card click → detail |
| HP-06–08 | 3 | Search CTA → `/search`, footer links (About/Terms/Privacy), responsive mobile layout |

#### Authenticated Tests (4 tests in `homepage/homepage.spec.ts`)
| Test IDs | Tests | What's Covered |
|---|---|---|
| HP-09–10 | 2 | Auth user sees dashboard/listings CTA, navigate to create listing |
| HP-11–12 | 2 | User avatar/menu in header (mobile hamburger + desktop), "Post a listing" CTA |

**Remaining Gaps**: Homepage performance budget (already has CWV in perf suite), visual regression for authenticated state, search autocomplete from homepage.

---

### 20. Notifications

**Rating: GOOD | 1 file | 14 tests** *(NEW — PR #20)*

All tests in `notifications/notifications.spec.ts` — requires seed notification data.

| Test IDs | Tests | What's Covered |
|---|---|---|
| NF-01–03 | 3 | **Auth & page load**: unauthenticated redirect, page heading, notification items rendered |
| NF-04–06 | 3 | **Display**: unread visual distinction (bold/badge), read vs unread appearance, title/message/timestamp |
| NF-07–10 | 4 | **Actions**: mark single as read, mark all as read, delete notification, click → linked page |
| NF-11–13 | 3 | **Filters**: "All" filter, "Unread" filter, filter state persistence |
| NF-14 | 1 | **Empty state**: shown when no notifications |

**Remaining Gaps**: Notification push/real-time updates, pagination for large notification lists, mobile swipe-to-delete gesture, notification preferences integration.

---

### 21. Booking Race Conditions

**Rating: GOOD | 1 file | 9 tests** *(NEW — PR #20)*

All tests in `booking/booking-race-conditions.spec.ts` — uses multi-browser-context pattern for concurrent user simulation.

| Test IDs | Tests | What's Covered |
|---|---|---|
| RC-01–03 | 3 | **Concurrent booking**: two users submit simultaneously (one succeeds, one conflict), overlapping dates race, already-booked error |
| RC-04 | 1 | **Double-click guard**: rapid submit creates only one booking (idempotency) |
| RC-05–06 | 2 | **Status races**: accept+cancel simultaneously, last-slot competition |
| RC-07–09 | 3 | **Edge cases**: expired session redirect, optimistic locking on concurrent updates, network retry with idempotency |

**Remaining Gaps**: Expired hold auto-expiration race, rollback behavior when payment downstream fails, stress testing with >2 concurrent users.

---

## Cross-Cutting Coverage

### Accessibility

**Rating: HIGH | ~15 files | ~120+ tests**

| Spec File | Pages Covered | Tests |
|---|---|---|
| `a11y/axe-page-audit.anon.spec.ts` | /, /search, /login, /signup, /forgot-password, /listings/[id], /about, /terms, /privacy | ~9 |
| `a11y/axe-page-audit.auth.spec.ts` | /bookings, /messages, /saved, /saved-searches, /settings, /profile, /profile/edit, /notifications, /recently-viewed, /listings/create | ~10 |
| `a11y/axe-dynamic-states.spec.ts` | /, /login, /signup (dynamic state changes) | ~12 |
| `a11y/listing-detail-a11y.spec.ts` | /listings/[id] | ~12 |
| `search-a11y.anon.spec.ts` | /search | ~8 |
| `search-a11y-filters.anon.spec.ts` | /search (filters) | ~9 |
| `search-a11y-keyboard.anon.spec.ts` | /search (keyboard) | ~7 |
| `search-a11y-screenreader.anon.spec.ts` | /search (screen reader) | ~8 |
| `map-errors-a11y.anon.spec.ts` | /search (map errors) | ~8 |
| `create-listing/create-listing.a11y.spec.ts` | /listings/create | ~8 |
| `pagination/pagination-a11y.spec.ts` | /search (pagination) | ~6 |
| `nearby/nearby-accessibility.spec.ts` | /listings/[id] (nearby) | ~8 |
| `journeys/10-accessibility-edge-cases.spec.ts` | Multiple pages | ~15 |
| `journeys/a11y-audit.anon.spec.ts` | Multiple pages | ~10 |
| `journeys/a11y-perf.spec.ts` | Multiple pages | ~8 |

**Pages WITHOUT a11y testing**: `/reset-password`, `/verify`, `/verify-expired` (have functional tests but no dedicated axe scans), `/messages/[id]`, `/users/[id]`, `/listings/[id]/edit`, `/offline`, all `/admin/*` pages.

### Visual Regression

**Rating: MODERATE | 5 files | ~25 tests**

| Spec File | Pages Covered | Tests |
|---|---|---|
| `visual/dark-mode-visual.anon.spec.ts` | /, /search, /login, /signup, /listings/[id] | ~7 |
| `visual/filter-modal-visual.anon.spec.ts` | /search (filter modal) | ~3 |
| `visual/listing-detail-visual.spec.ts` | /listings/[id] | ~3 |
| `create-listing/create-listing.visual.spec.ts` | /listings/create (5 viewports) | ~7 |
| `journeys/search-visual.spec.ts` | /search | ~5 |

**Pages WITHOUT visual testing**: Auth pages (except dark-mode screenshots), `/bookings`, `/messages`, `/profile`, `/settings`, all `/admin/*`, `/about`, `/terms`, `/privacy`, `/notifications`, `/recently-viewed`, `/offline`.

### Performance

**Rating: MODERATE | 5 files | ~37 tests**

| Spec File | Pages Covered | Tests |
|---|---|---|
| `performance/core-web-vitals.anon.spec.ts` | /, /search, /login, /listings/[id] | ~8 |
| `performance/api-response-times.spec.ts` | API endpoints | ~6 |
| `performance/search-interaction-perf.spec.ts` | /search | ~7 |
| `create-listing/create-listing.perf.spec.ts` | /listings/create | ~4 |
| `journeys/a11y-perf.spec.ts` | Multiple pages | ~8 |

**Pages WITHOUT perf testing**: `/bookings`, `/messages`, `/settings`, `/profile`, all `/admin/*`, `/signup`, `/saved`.

### Dark Mode

**Rating: MED-HIGH | 7 files | ~60 tests**

| Spec File | Pages Covered |
|---|---|
| `visual/dark-mode-visual.anon.spec.ts` | /, /search, /login, /signup, /listings/[id] |
| `visual/dark-mode-visual.auth.spec.ts` | /bookings, /messages, /settings, /profile, /profile/edit (14 visual regression tests) |
| `dark-mode/dark-mode-functional.auth.spec.ts` | /bookings, /messages, /settings, /profile, /profile/edit (16 functional tests) |
| `a11y/dark-mode-a11y.auth.spec.ts` | /bookings, /messages, /settings, /profile, /profile/edit (15 axe + focus tests) |
| `journeys/search-p0-darkmode-fouc.anon.spec.ts` | /search (FOUC prevention) |
| `a11y/axe-dynamic-states.spec.ts` | /, /login, /signup (dark mode axe) |
| `a11y/listing-detail-a11y.spec.ts` | /listings/[id] (dark mode axe) |

**Pages WITHOUT dark mode testing**: `/saved`, `/admin/*`, `/listings/create`.

---

## Critical Findings

### Pages with Zero Test Coverage

| Page | Risk Level | Impact |
|---|---|---|
| **`/offline`** | LOW | Offline fallback page — retry button, rendering untested |

**Previously zero-coverage pages now covered (PR #19):**
- ~~`/reset-password`~~ → **17 tests** (RP-01–17) covering no token, invalid token, valid token form, full flow, edge cases
- ~~`/verify`~~ → **4 tests** (VF-01–04) covering auth guard, page structure, verified state (14 more planned for Phase 2)
- ~~`/verify-expired`~~ → **14 tests** (VE-01–14) covering page structure, resend flow, error handling, unauthenticated state

### Critical Bugs in Existing Tests

| Issue | Location | Impact | Status |
|---|---|---|---|
| ~~**Double-booking test always passes**~~ | ~~`journeys/21-booking-lifecycle.spec.ts` (J24)~~ | ~~`expect(... \|\| true).toBeTruthy()` — assertion is a no-op~~ | **FIXED** — J24 rewritten with proper 2-phase test: submits booking, clears session, attempts duplicate, asserts `[role="alert"]` with `/already have a booking/i` and confirms no redirect to `/bookings`. |
| ~~**Admin tests silently skip**~~ | ~~`journeys/09-verification-admin.spec.ts`~~ | ~~Tests wrapped in `if (await button.isVisible())` — pass even when elements don't exist~~ | **FIXED** (PR #19) — Admin tests rewritten as `admin.admin.spec.ts` with 23 proper assertions under `chromium-admin` project. Old journey file now contains only verification journeys J077–J079. |

### Most Critical Functional Gaps

| Gap | Why It Matters | Status |
|---|---|---|
| ~~**Listing edit page has ~2 journey tests only**~~ | ~~Owner auth check, image editing, re-geocoding, validation all untested~~ | ✅ FIXED — 18 dedicated tests (LE-01–18) |
| ~~**Concurrent booking race conditions**~~ | ~~Two users competing for same listing — not tested at all~~ | ✅ FIXED — 9 race condition tests (RC-01–09) |
| **Real-time messaging** | WebSocket/SSE never verified — only polling interval checked | OPEN |
| **Session expiry handling** | What happens when auth token expires mid-session — untested | OPEN |
| ~~**Homepage has ZERO functional tests**~~ | ~~Featured listings, hero section, CTA navigation all untested~~ | ✅ FIXED — 12 tests (HP-01–12) |
| ~~**Notifications page has ZERO functional tests**~~ | ~~Core authenticated feature with zero coverage~~ | ✅ FIXED — 14 tests (NF-01–14) |

### Cross-Cutting Coverage Gaps

| Category | Well-Covered Pages | Missing Pages |
|---|---|---|
| **Mobile** | `/search`, `/bookings`, `/messages`, `/profile`, `/notifications` | `/settings`, `/admin/*`, auth pages |
| **Visual Regression** | `/search`, `/listings/[id]`, `/listings/create` | Auth, admin, profile, bookings, messaging, homepage |
| **Performance** | `/`, `/search`, `/login`, `/listings/[id]`, `/listings/create` | `/bookings`, `/messages`, `/settings`, `/admin/*` |
| **Dark Mode** | `/`, `/search`, `/login`, `/signup`, `/listings/[id]`, `/bookings`, `/messages`, `/settings`, `/profile`, `/profile/edit` | `/saved`, `/admin/*`, `/listings/create` |

### Pages with A11y-Only Coverage (9 pages)

These pages have only basic axe-core scans and nothing else:
`/forgot-password`, `/saved`, `/saved-searches`, `/settings`, `/recently-viewed`, `/about`, `/terms`, `/privacy`, `/users/[id]`

**Previously a11y-only, now with functional tests (PR #20):**
~~`/bookings`~~, ~~`/messages`~~, ~~`/profile`~~, ~~`/profile/edit`~~, ~~`/notifications`~~ — now have mobile functional tests and/or dedicated functional tests

---

## Recommendations

### Priority 1 — Fix Broken Tests (Immediate) ✅ ALL DONE
1. ~~**Fix double-booking no-op assertion**~~ — ✅ DONE. J24 rewritten with proper 2-phase double-booking test: submit → clear session → duplicate attempt → assert `[role="alert"]` server rejection
2. ~~**Remove `if(isVisible)` guards from admin tests**~~ — ✅ DONE (PR #19). Admin tests rewritten as dedicated `admin.admin.spec.ts` with 23 proper assertions under `chromium-admin` project

### Priority 2 — Critical Missing Coverage (High) ✅ DONE (PR #19)
3. ~~**Add functional tests for `/listings/[id]`**~~ — ✅ 22 tests added (LD-01–22): visitor/owner views, gallery, booking form, reviews, action buttons
4. ~~**Add tests for `/reset-password`**~~ — ✅ 17 tests added (RP-01–17): token validation, form, full flow, edge cases
5. ~~**Add tests for `/verify` and `/verify-expired`**~~ — ✅ 18 tests added (VF-01–04 + VE-01–14): auth guard, verified state, resend flow, error handling. Phase 2: 14 more verify tests need unverified seed user

### Priority 3 — Important Gaps (Medium) ✅ ALL DONE (PR #20)
6. ~~**Add listing edit tests**~~ — ✅ 18 tests (LE-01–18): auth guards, field editing, image management, draft persistence, form actions
7. ~~**Add concurrent booking race condition tests**~~ — ✅ 9 tests (RC-01–09): concurrent booking, double-click, status races, expired session, optimistic locking
8. ~~**Expand mobile tests beyond search**~~ — ✅ 28 tests across 4 files: mobile bookings (8), messages (8), profile (6), notifications (6)
9. ~~**Add homepage functional tests**~~ — ✅ 12 tests (HP-01–12): hero, stats, features, carousel, CTAs, footer, responsive, auth state
10. ~~**Add notifications page functional tests**~~ — ✅ 14 tests (NF-01–14): auth, display, actions, filters, empty state

### Priority 4 — Cross-Cutting Expansion (Lower)
11. ~~**Expand dark mode testing** to authenticated pages (`/bookings`, `/messages`, `/settings`, `/profile`)~~ — ✅ DONE. 45 tests (DM-F01–16 functional, DM-A01–15 a11y, DM-V01–14 visual) across 3 new spec files + shared helper module
12. **Expand visual regression** to auth pages, admin, profile, messaging
13. **Add performance tests** for `/bookings`, `/messages`, `/settings`
14. **Add signup flow tests** — password strength meter, confirm mismatch, OAuth
15. ~~**Add admin page tests** with proper assertions (not silent skips)~~ — ✅ DONE (PR #19). 23 tests (ADM-01–24) with proper assertions. Remaining: a11y, destructive actions, pagination

---

## Test Distribution Summary

```
Search & Filters:  ~450 tests  ██████████████████████████████████        33%
Map:               ~165 tests  ████████████                              12%
A11y (cross-cut):  ~120 tests  █████████                                  9%
Mobile UX:          ~92 tests  ███████                                    7%
Safety/Simulations: ~68 tests  █████                                      5%
Listing Detail:     ~65 tests  █████                                      5%
Auth Flows:         ~63 tests  █████                                      5%
Create Listing:     ~62 tests  █████                                      5%
Booking:            ~57 tests  ████                                       4%
Pagination:         ~53 tests  ████                                       4%
Performance:        ~37 tests  ███                                        3%
Visual (cross-cut): ~25 tests  ██                                         2%
Admin Panel:        ~23 tests  ██                                         2%
Listing Edit:       ~20 tests  ██                                         1%  NEW
Notifications:      ~14 tests  █                                          1%  NEW
Homepage:           ~12 tests  █                                          1%  NEW
Race Conditions:     ~9 tests  █                                          1%  NEW
All Other:          ~45 tests  ███                                        3%
                  ─────────
Total:           ~1,380 tests  (+80 from PR #20)
```
