# USER FLOW SIMULATIONS — Complete Production Readiness Test Plan

**Author:** flow-strategist
**Date:** 2026-03-27
**Status:** DRAFT — awaiting team debate and approval
**Scope:** Every user persona, every feature surface, happy + sad + edge paths

---

## Table of Contents

1. [Persona Definitions](#1-persona-definitions)
2. [Flow 1: Anonymous Visitor](#2-flow-1-anonymous-visitor)
3. [Flow 2: Authentication (Signup / Login / Password Reset)](#3-flow-2-authentication)
4. [Flow 3: Tenant — Search & Discovery](#4-flow-3-tenant-search-discovery)
5. [Flow 4: Tenant — Booking Lifecycle](#5-flow-4-tenant-booking-lifecycle)
6. [Flow 5: Host — Listing Management](#6-flow-5-host-listing-management)
7. [Flow 6: Host — Booking Response](#7-flow-6-host-booking-response)
8. [Flow 7: Messaging & Conversations](#8-flow-7-messaging-conversations)
9. [Flow 8: Reviews & Reputation](#9-flow-8-reviews-reputation)
10. [Flow 9: Profile & Settings](#10-flow-9-profile-settings)
11. [Flow 10: Notifications](#11-flow-10-notifications)
12. [Flow 11: Saved Listings & Saved Searches](#12-flow-11-saved-listings-saved-searches)
13. [Flow 12: Identity Verification](#13-flow-12-identity-verification)
14. [Flow 13: Admin Panel](#14-flow-13-admin-panel)
15. [Flow 14: Destructive Actions](#15-flow-14-destructive-actions)
16. [Flow 15: Cross-Feature Interactions](#16-flow-15-cross-feature-interactions)
17. [Flow 16: Mobile-Specific Flows](#17-flow-16-mobile-specific-flows)
18. [Flow 17: Error & Empty States](#18-flow-17-error-empty-states)
19. [Flow 18: Security & Abuse Prevention](#19-flow-18-security-abuse-prevention)

---

## 1. Persona Definitions

### P1: Anonymous Visitor
- No account, no session
- Can: browse homepage, search listings, view listing details, view map, view public profiles
- Cannot: book, message, save, review, access settings/admin

### P2: New User (Signing Up)
- Entering the registration flow for the first time
- Goes through: signup form -> email verification -> onboarding
- Email unverified until they click the verification link

### P3: Tenant (Searching)
- Authenticated, email verified, not suspended
- Primary goal: find a room that fits their criteria
- Uses: search, filters, map, sort, pagination, saved searches

### P4: Tenant (Booking)
- Authenticated, email verified, not suspended
- Primary goal: secure a room
- Uses: booking form, hold system, slot selection, booking status tracking

### P5: Host (Creating Listings)
- Authenticated, email verified, not suspended
- Primary goal: list their room(s) for rent
- Uses: create listing form, image upload, edit listing, manage availability

### P6: Host (Responding to Bookings)
- Same user as P5 but in response mode
- Uses: bookings page, accept/reject, view tenant profile, messaging

### P7: Admin
- Authenticated, `isAdmin: true`
- Uses: admin dashboard, user management, listing management, report moderation, verification review, audit logs

### P8: Profile/Settings User
- Any authenticated user managing their account
- Uses: profile edit, password change, notification preferences, blocked users

### P9: Messaging User
- Any authenticated user in a conversation
- Uses: start conversation, send/receive messages, typing indicators, read receipts

### P10: Blocked/Suspended User
- A user whose account is suspended or who has been blocked by another user
- Tests: access denial, graceful degradation, error messaging

### P11: User with Expired Session
- Session token expired or invalidated
- Tests: redirect to login, session recovery, form data preservation

---

## 2. Flow 1: Anonymous Visitor

### F1.1 — Homepage Browse (Happy Path)
**Persona:** P1 (Anonymous Visitor)
**Pre-conditions:** No session cookie, clean browser state
**Steps:**
1. Navigate to `/`
2. Verify homepage renders: hero section, featured listings, CTA buttons
3. Verify navbar shows Login/Sign Up buttons (no user menu)
4. Verify footer links work (About, Privacy, Terms)
5. Click a featured listing card
6. Verify listing detail page renders with full info
7. Verify "Request to Book" button prompts login
8. Verify "Contact Host" button prompts login
9. Verify "Save" heart button prompts login
**Expected:** All public content visible, all authenticated actions redirect to login
**Post-conditions:** No session created, no DB writes

### F1.2 — Search Page Browse (Happy Path)
**Persona:** P1
**Pre-conditions:** Listings exist in the database
**Steps:**
1. Navigate to `/search`
2. Verify search page renders with map + list view
3. Verify listings appear in the list
4. Verify map markers correspond to listings
5. Apply a price filter (e.g., min $500, max $1500)
6. Verify URL updates with filter params
7. Verify results update to match filter
8. Click a listing card
9. Verify navigation to `/listings/[id]`
10. Click back button
11. Verify search state preserved (filters, scroll position)
**Expected:** Full search functionality available without auth
**Post-conditions:** No session, URL reflects search state

### F1.3 — Listing Detail View (Happy Path)
**Persona:** P1
**Pre-conditions:** Active listing exists with images, reviews, location
**Steps:**
1. Navigate to `/listings/[id]`
2. Verify: title, description, price, amenities, house rules, images gallery
3. Verify: map shows listing location (privacy circle, not exact pin)
4. Verify: reviews section loads (if reviews exist)
5. Verify: host profile card visible with avatar, name, verification badge
6. Verify: nearby places / neighborhood module loads
7. Verify: "Similar Listings" section (if semantic search enabled)
8. Verify: share button works (copy link)
9. Verify: view count increments (check via API or DB)
**Expected:** Full listing info visible, auth-gated actions show login prompts
**Post-conditions:** `RecentlyViewed` NOT created (requires auth), `viewCount` incremented

### F1.4 — Anonymous Access Boundaries (Sad Path)
**Persona:** P1
**Steps:**
1. Navigate directly to `/bookings` -> verify redirect to `/login`
2. Navigate to `/messages` -> verify redirect to `/login`
3. Navigate to `/saved` -> verify redirect to `/login`
4. Navigate to `/settings` -> verify redirect to `/login`
5. Navigate to `/profile` -> verify redirect to `/login`
6. Navigate to `/admin` -> verify redirect to `/login`
7. Navigate to `/notifications` -> verify redirect to `/login`
8. Call `POST /api/bookings` without auth -> verify 401
9. Call `POST /api/favorites` without auth -> verify 401
10. Call `POST /api/messages` without auth -> verify 401
**Expected:** All protected routes redirect, all protected APIs return 401
**Post-conditions:** No session created

### F1.5 — Static Pages (Happy Path)
**Persona:** P1
**Steps:**
1. Navigate to `/about` -> verify content renders
2. Navigate to `/privacy` -> verify privacy policy renders
3. Navigate to `/terms` -> verify terms of service renders
4. Navigate to `/offline` -> verify offline page renders
5. Navigate to a non-existent URL -> verify 404 page renders
**Expected:** All static pages accessible without auth

---

## 3. Flow 2: Authentication

### F2.1 — Email/Password Signup (Happy Path)
**Persona:** P2 (New User)
**Pre-conditions:** Email not already registered
**Steps:**
1. Navigate to `/signup`
2. Fill in: name, email, password, confirm password
3. Submit form
4. Verify: success message shown ("Check your email")
5. Verify: user record created in DB with `emailVerified: null`
6. Verify: verification email sent (check email service or mock)
7. Extract verification token from email
8. Navigate to `/verify?token=[token]`
9. Verify: success message, `emailVerified` set in DB
10. Verify: redirect to login or auto-login
**Expected:** Account created, email verified, user can now use all features
**Post-conditions:** User exists with `emailVerified` set, session active

### F2.2 — Signup Validation Errors (Sad Path)
**Persona:** P2
**Steps:**
1. Submit empty form -> verify all field errors shown
2. Submit with invalid email format -> verify email error
3. Submit with short password (<8 chars) -> verify password error
4. Submit with mismatched passwords -> verify confirm password error
5. Submit with already-registered email -> verify duplicate error
6. Submit with XSS in name field (`<script>alert(1)</script>`) -> verify sanitized
**Expected:** All validation errors shown inline, no DB writes, no XSS

### F2.3 — Email Verification Expiry (Edge Case)
**Persona:** P2
**Pre-conditions:** User signed up, verification token expired
**Steps:**
1. Navigate to `/verify?token=[expired-token]`
2. Verify: error message about expired token
3. Navigate to `/verify-expired`
4. Verify: option to resend verification email
5. Submit resend request
6. Verify: new verification email sent
7. Use new token -> verify success
**Expected:** Expired tokens handled gracefully, resend flow works

### F2.4 — Login (Happy Path)
**Persona:** P2 (returning user)
**Pre-conditions:** User exists with verified email and known password
**Steps:**
1. Navigate to `/login`
2. Enter email and password
3. Submit
4. Verify: redirect to homepage or intended destination
5. Verify: navbar shows user menu (avatar, name)
6. Verify: session cookie set
**Expected:** Successful login, session established

### F2.5 — Login Failures (Sad Path)
**Persona:** P2
**Steps:**
1. Submit with wrong password -> verify "Invalid credentials" error
2. Submit with non-existent email -> verify same generic error (no enumeration)
3. Submit with unverified email -> verify "Please verify your email" error
4. Submit with suspended account -> verify suspension message
5. Rapid-fire 10 login attempts -> verify rate limiting kicks in
**Expected:** Errors do not leak information, rate limiting prevents brute force

### F2.6 — Forgot/Reset Password (Happy Path)
**Persona:** P2
**Pre-conditions:** User exists with verified email
**Steps:**
1. Navigate to `/forgot-password`
2. Enter email
3. Submit
4. Verify: success message (always shown, even for non-existent emails — no enumeration)
5. Extract reset token from email
6. Navigate to `/reset-password?token=[token]`
7. Enter new password + confirm
8. Submit
9. Verify: success message
10. Login with new password -> verify success
11. Verify: `passwordChangedAt` updated in DB
**Expected:** Password reset works, old password no longer valid

### F2.7 — Reset Password with Expired Token (Edge Case)
**Persona:** P2
**Steps:**
1. Navigate to `/reset-password?token=[expired-token]`
2. Verify: error message about expired or invalid token
3. Verify: link back to forgot-password page
**Expected:** Expired token handled gracefully

### F2.8 — OAuth Login (If Implemented)
**Persona:** P2
**Pre-conditions:** NextAuth providers configured
**Steps:**
1. Navigate to `/login`
2. Click OAuth provider button (Google, GitHub, etc.)
3. Complete OAuth flow
4. Verify: redirect back with session established
5. Verify: Account record created linking OAuth provider
**Expected:** OAuth login creates account + session

---

## 4. Flow 3: Tenant — Search & Discovery

### F3.1 — Basic Search (Happy Path)
**Persona:** P3 (Tenant Searching)
**Pre-conditions:** Multiple active listings exist with varied attributes
**Steps:**
1. Navigate to `/search`
2. Enter a location in the search bar (e.g., "San Francisco")
3. Verify: map centers on location
4. Verify: listings in that area appear in list
5. Verify: map markers match list results
6. Verify: result count shown
7. Verify: URL updated with search params
**Expected:** Location-based search works, map + list in sync
**Post-conditions:** URL shareable with current search state

### F3.2 — Filter Application (Happy Path)
**Persona:** P3
**Pre-conditions:** Listings exist with diverse attributes
**Steps:**
1. Start from `/search`
2. Open filter modal
3. Set price range: $600-$1200
4. Select room type: "Private Room"
5. Select amenities: "WiFi", "Laundry"
6. Apply filters
7. Verify: results filtered correctly
8. Verify: filter chips shown below search bar
9. Verify: URL params updated
10. Remove one filter chip (e.g., "Laundry")
11. Verify: results update, chip removed
12. Click "Clear All Filters"
13. Verify: all filters cleared, full results restored
**Expected:** Filters work additively, removable individually, URL stays in sync
**Cross-ref:** F3.6 (filter edge cases)

### F3.3 — Map Interaction (Happy Path)
**Persona:** P3
**Steps:**
1. Start from `/search` with results visible
2. Pan the map to a new area
3. Verify: "Search as I move" banner appears (or auto-searches if enabled)
4. Verify: results update for new map bounds
5. Zoom in -> verify results refine
6. Zoom out -> verify results broaden
7. Click a map marker -> verify listing popup/highlight
8. Click listing in list -> verify map marker highlights
9. Hover over listing card -> verify corresponding marker highlights on map
**Expected:** Map and list are fully synchronized
**Post-conditions:** Map bounds reflected in search state

### F3.4 — Pagination / Load More (Happy Path)
**Persona:** P3
**Pre-conditions:** >20 listings match search criteria
**Steps:**
1. Perform search returning many results
2. Verify: initial batch of listings shown (e.g., 20)
3. Scroll to bottom / click "Load More"
4. Verify: additional listings appended (no duplicates)
5. Verify: `seenIdsRef` prevents duplicate IDs
6. Continue loading until 60-item cap
7. Verify: "Load More" button disappears at cap
8. Change a filter
9. Verify: cursor resets, listings reset to fresh batch
**Expected:** Pagination works, no duplicates, 60-item cap enforced, filter change resets
**Invariants:** Per CLAUDE.md search pagination invariants

### F3.5 — Sort Options (Happy Path)
**Persona:** P3
**Steps:**
1. Perform search with multiple results
2. Change sort to "Price: Low to High"
3. Verify: results reorder correctly
4. Change sort to "Price: High to Low"
5. Verify: results reorder correctly
6. Change sort to "Newest"
7. Verify: results ordered by creation date
8. Change sort to "Recommended" (if available)
9. Verify: results reorder, cursor resets on each sort change
**Expected:** Sort changes trigger fresh search, cursor resets

### F3.6 — Filter Edge Cases (Edge)
**Persona:** P3
**Steps:**
1. Set price min > price max -> verify validation error or auto-swap
2. Apply all possible filters simultaneously -> verify no crash
3. Apply filters that return 0 results -> verify empty state with suggestions
4. Apply filters, then share URL -> verify filters restored from URL
5. Modify URL params directly with invalid values (e.g., `minPrice=-1`) -> verify handled
6. Apply filter, navigate away, come back -> verify state behavior
7. Rapid-fire filter changes (debounce test) -> verify no race conditions
**Expected:** All edge cases handled gracefully, no 500 errors
**Cross-ref:** F17.1 (empty states)

### F3.7 — Semantic / Natural Language Search (Happy Path)
**Persona:** P3
**Pre-conditions:** Embeddings enabled, `FEATURE_SEMANTIC_SEARCH=true`
**Steps:**
1. Enter natural language query: "quiet room near campus with fast wifi"
2. Verify: results returned ranked by relevance
3. Verify: semantic search indicator shown in UI
4. Enter another query: "pet-friendly apartment downtown"
5. Verify: results update
6. Clear query -> verify fallback to standard search
**Expected:** Natural language queries return relevant results

### F3.8 — Recently Viewed (Happy Path)
**Persona:** P3 (authenticated)
**Steps:**
1. View listing A detail page
2. View listing B detail page
3. View listing C detail page
4. Navigate to `/recently-viewed`
5. Verify: listings A, B, C shown in reverse chronological order
6. View listing A again
7. Verify: listing A moves to top of recently viewed
**Expected:** Recently viewed tracks views, most recent first, deduplicates

### F3.9 — Search URL Deep Linking (Happy Path)
**Persona:** P1 or P3
**Steps:**
1. Construct URL with search params: `/search?q=boston&minPrice=500&maxPrice=1500&roomType=private`
2. Navigate to URL
3. Verify: all filters applied correctly from URL
4. Verify: results match the URL-specified filters
5. Share URL to another browser/incognito
6. Verify: same results rendered
**Expected:** URLs are fully shareable and reproducible

---

## 5. Flow 4: Tenant — Booking Lifecycle

### F4.1 — Create Booking Request (Happy Path)
**Persona:** P4 (Tenant Booking)
**Pre-conditions:** Active listing with available slots, user email verified
**Steps:**
1. Navigate to listing detail page
2. Verify: "Request to Book" button visible
3. Select start date and end date
4. Select number of slots (if multi-slot listing)
5. Verify: total price calculated correctly
6. Click "Request to Book"
7. Verify: confirmation dialog/modal
8. Confirm booking
9. Verify: booking created with status `PENDING`
10. Verify: host receives notification (in-app + email)
11. Verify: tenant redirected to bookings page or success state
12. Verify: `BookingAuditLog` entry created with action `CREATED`
**Expected:** Booking created successfully, both parties notified
**Post-conditions:** Booking with status PENDING, notification sent, audit logged

### F4.2 — Create Hold (Happy Path)
**Persona:** P4
**Pre-conditions:** Listing with `bookingMode: "SHARED"`, available slots, holds enabled
**Steps:**
1. Navigate to listing detail page
2. Click "Hold" / reserve button
3. Verify: hold created with status `HELD`
4. Verify: `heldUntil` set to now + `holdTtlMinutes`
5. Verify: countdown timer shown to user
6. Verify: `availableSlots` decremented
7. Verify: `BookingAuditLog` entry with action `HELD`
8. Wait for hold to expire (or verify via cron sweep)
9. Verify: status transitions to `EXPIRED`
10. Verify: `availableSlots` restored
**Expected:** Hold lifecycle works end-to-end
**Post-conditions:** Hold created then expired, slots restored

### F4.3 — Booking on Own Listing (Sad Path)
**Persona:** P4 (who is also the listing owner)
**Steps:**
1. Navigate to own listing detail page
2. Verify: "Request to Book" button NOT shown (or disabled)
3. Attempt API call `POST /api/bookings` with own listing ID
4. Verify: error response "Cannot book your own listing"
**Expected:** Self-booking prevented at UI and API level

### F4.4 — Booking on Fully Booked Listing (Sad Path)
**Persona:** P4
**Pre-conditions:** Listing with 0 available slots
**Steps:**
1. Navigate to listing with no available slots
2. Verify: "Request to Book" disabled or shows "No slots available"
3. Attempt API call -> verify error "No available slots"
**Expected:** Cannot book when no slots available

### F4.5 — Booking with Invalid Dates (Sad Path)
**Persona:** P4
**Steps:**
1. Select end date before start date -> verify validation error
2. Select dates in the past -> verify validation error
3. Select dates too far in the future -> verify validation
4. Submit without selecting dates -> verify required field error
**Expected:** Date validation prevents invalid bookings

### F4.6 — Duplicate Booking Prevention (Edge)
**Persona:** P4
**Pre-conditions:** User already has a PENDING or HELD booking for this listing
**Steps:**
1. Attempt to create another booking for same listing + overlapping dates
2. Verify: error "You already have an active booking for this listing"
3. Verify: idempotency key prevents duplicate on double-click
**Expected:** Duplicate bookings prevented by partial unique index and idempotency

### F4.7 — Booking While Suspended (Sad Path)
**Persona:** P10 (suspended user)
**Steps:**
1. Navigate to listing detail
2. Attempt to book
3. Verify: suspension banner shown
4. Verify: booking action returns suspension error
**Expected:** Suspended users cannot create bookings

### F4.8 — Booking While Email Unverified (Sad Path)
**Persona:** P2 (unverified email)
**Steps:**
1. Navigate to listing detail
2. Attempt to book
3. Verify: error "Please verify your email"
**Expected:** Email verification required for booking

### F4.9 — View My Bookings (Happy Path)
**Persona:** P4
**Pre-conditions:** User has bookings in various states
**Steps:**
1. Navigate to `/bookings`
2. Verify: bookings listed with correct statuses (PENDING, ACCEPTED, REJECTED, CANCELLED, HELD, EXPIRED)
3. Verify: each booking shows listing title, dates, price, status
4. Click a booking -> verify details shown
5. Verify: appropriate actions available per status (e.g., Cancel for PENDING)
**Expected:** All bookings visible with correct state

### F4.10 — Cancel Booking (Happy Path)
**Persona:** P4
**Pre-conditions:** PENDING booking exists
**Steps:**
1. Navigate to `/bookings`
2. Find PENDING booking
3. Click "Cancel"
4. Confirm cancellation
5. Verify: status changes to `CANCELLED`
6. Verify: host notified
7. Verify: `BookingAuditLog` with action `CANCELLED`
8. Verify: slots restored if was HELD
**Expected:** Cancellation works, both parties notified, audit logged

### F4.11 — Booking Rate Limiting (Edge)
**Persona:** P4
**Steps:**
1. Rapidly submit 5+ booking requests in succession
2. Verify: rate limit error returned after threshold
3. Verify: `RateLimitCountdown` component shown
4. Wait for rate limit window to expire
5. Verify: can submit again
**Expected:** Rate limiting prevents booking spam

---

## 6. Flow 5: Host — Listing Management

### F5.1 — Create Listing (Happy Path)
**Persona:** P5 (Host)
**Pre-conditions:** Authenticated, email verified
**Steps:**
1. Navigate to `/listings/create`
2. Fill in all required fields:
   - Title, description, price
   - Room type, amenities, house rules
   - Total slots, lease duration
   - Move-in date
   - Gender preference, household gender
   - Household languages
3. Upload images (1-10)
4. Set location (address autocomplete)
5. Submit form
6. Verify: `POST /api/listings` succeeds
7. Verify: listing created with status `ACTIVE`
8. Verify: redirect to listing detail page
9. Verify: location geocoded and stored
10. Verify: listing appears in search results
**Expected:** Listing created with all attributes, searchable immediately
**Post-conditions:** Listing with status ACTIVE, Location record created

### F5.2 — Create Listing Validation (Sad Path)
**Persona:** P5
**Steps:**
1. Submit with empty required fields -> verify field errors
2. Submit with price = 0 -> verify min price error
3. Submit with price = 999999 -> verify max price error
4. Submit with totalSlots = 0 -> verify min slots error
5. Submit with no images -> verify "at least 1 image required"
6. Submit with title > max length -> verify length error
7. Submit with description containing XSS -> verify sanitized
8. Submit with invalid address -> verify geocoding error
**Expected:** All validation errors shown, no listing created

### F5.3 — Edit Listing (Happy Path)
**Persona:** P5
**Pre-conditions:** Own listing exists
**Steps:**
1. Navigate to `/listings/[id]`
2. Verify: "Edit" button visible (owner only)
3. Click Edit -> navigate to edit form
4. Change title, price, description
5. Add/remove an amenity
6. Upload a new image
7. Submit changes via `PATCH /api/listings/[id]`
8. Verify: listing updated
9. Verify: changes reflected on detail page
10. Verify: `version` incremented (optimistic locking)
11. Verify: listing re-indexed for search
**Expected:** Edit saves all changes, version bumped

### F5.4 — Edit Other User's Listing (Sad Path)
**Persona:** P3 (not the owner)
**Steps:**
1. Navigate to `/listings/[id]` for another user's listing
2. Verify: no Edit button visible
3. Attempt `PATCH /api/listings/[id]` via API
4. Verify: 403 Forbidden
**Expected:** Only owner can edit their listing

### F5.5 — Change Listing Status (Happy Path)
**Persona:** P5
**Pre-conditions:** Own active listing exists
**Steps:**
1. Pause listing -> verify status changes to `PAUSED`
2. Verify: listing no longer appears in search results
3. Reactivate listing -> verify status changes to `ACTIVE`
4. Verify: listing reappears in search
5. Mark as rented -> verify status changes to `RENTED`
6. Verify: listing hidden from search but accessible via direct URL
**Expected:** Status transitions work correctly, search visibility updates

### F5.6 — Image Upload (Happy Path + Edge)
**Persona:** P5
**Steps:**
1. Upload a valid JPEG image -> verify success
2. Upload a valid PNG image -> verify success
3. Upload an image > max size -> verify error
4. Upload a non-image file (.pdf) -> verify error
5. Upload 10 images (max) -> verify success
6. Attempt 11th image -> verify max limit error
7. Delete an image -> verify removed
8. Reorder images (if drag-and-drop) -> verify order saved
**Expected:** Image upload validates type/size/count

---

## 7. Flow 6: Host — Booking Response

### F6.1 — Accept Booking (Happy Path)
**Persona:** P6 (Host)
**Pre-conditions:** PENDING booking exists for host's listing
**Steps:**
1. Navigate to `/bookings`
2. Verify: incoming booking request visible
3. Click "Accept"
4. Verify: booking status -> `ACCEPTED`
5. Verify: `availableSlots` decremented on listing
6. Verify: tenant notified (in-app + email)
7. Verify: `BookingAuditLog` with action `ACCEPTED`
**Expected:** Booking accepted, slots updated, notifications sent

### F6.2 — Reject Booking (Happy Path)
**Persona:** P6
**Pre-conditions:** PENDING booking exists
**Steps:**
1. Navigate to `/bookings`
2. Find pending booking
3. Click "Reject"
4. Enter rejection reason (optional)
5. Confirm rejection
6. Verify: booking status -> `REJECTED`
7. Verify: rejection reason stored
8. Verify: tenant notified with reason
9. Verify: slots NOT decremented (was PENDING, not HELD)
10. Verify: `BookingAuditLog` with action `REJECTED`
**Expected:** Booking rejected with reason, tenant notified

### F6.3 — Accept on Paused Listing (Sad Path — Known Issue R2)
**Persona:** P6
**Pre-conditions:** Listing is PAUSED, PENDING booking exists
**Steps:**
1. Attempt to accept the booking
2. **Expected per audit:** Currently ALLOWS acceptance (bug R2)
3. **Desired behavior:** Should reject with "Listing is not active"
**Cross-ref:** Production readiness audit R2

### F6.4 — Accept When No Slots Available (Sad Path)
**Persona:** P6
**Pre-conditions:** All slots taken by other accepted bookings
**Steps:**
1. Attempt to accept a new booking
2. Verify: error "No available slots"
3. Verify: booking remains PENDING
**Expected:** Cannot accept beyond available capacity

### F6.5 — Host Views Booking Audit Trail (Happy Path)
**Persona:** P6
**Steps:**
1. Navigate to booking detail
2. View audit trail section
3. Verify: all state transitions listed chronologically
4. Verify: actor (user/system), timestamps, and details shown
**Expected:** Full audit trail visible to host

---

## 8. Flow 7: Messaging & Conversations

### F7.1 — Start Conversation (Happy Path)
**Persona:** P9 (Tenant messaging host)
**Pre-conditions:** Listing exists, tenant != host, no existing conversation
**Steps:**
1. Navigate to listing detail page
2. Click "Contact Host"
3. Verify: conversation created (or existing one opened)
4. Type a message
5. Send
6. Verify: message appears in conversation
7. Verify: host receives notification
8. Verify: message stored in DB
**Expected:** Conversation started, message delivered, host notified
**Post-conditions:** Conversation record, Message record, Notification record

### F7.2 — Continue Existing Conversation (Happy Path)
**Persona:** P9
**Pre-conditions:** Conversation already exists between tenant and host for this listing
**Steps:**
1. Click "Contact Host" on same listing
2. Verify: opens EXISTING conversation (no duplicate created)
3. Send another message
4. Verify: appended to existing thread
**Expected:** No duplicate conversations (addresses audit issue R1)
**Cross-ref:** Production readiness audit R1

### F7.3 — Message Validation (Sad Path)
**Persona:** P9
**Steps:**
1. Send empty message -> verify error
2. Send message > 2000 chars -> verify error
3. Send message with XSS -> verify sanitized
4. Send message to self (own listing) -> verify "Cannot chat with yourself"
**Expected:** Input validation enforced

### F7.4 — Messaging with Blocked User (Sad Path)
**Persona:** P9
**Pre-conditions:** Host has blocked this tenant (or vice versa)
**Steps:**
1. Attempt to start conversation
2. Verify: error "Unable to contact this user" (generic, doesn't reveal block)
3. Attempt to send message in existing conversation
4. Verify: same error
**Expected:** Block prevents all messaging, no information leakage about block status

### F7.5 — Message Read Receipts (Happy Path)
**Persona:** P9
**Steps:**
1. Tenant sends message
2. Host opens conversation
3. Verify: messages marked as read
4. Verify: tenant sees read indicator
**Expected:** Read receipts work bidirectionally

### F7.6 — Typing Indicators (Happy Path)
**Persona:** P9
**Steps:**
1. Host starts typing
2. Verify: tenant sees typing indicator
3. Host stops typing (idle)
4. Verify: typing indicator disappears
**Expected:** Real-time typing status (via Supabase realtime or polling)

### F7.7 — Conversation Deletion (Happy Path)
**Persona:** P9
**Steps:**
1. Delete a conversation (per-user deletion)
2. Verify: conversation hidden from deleting user's view
3. Verify: conversation still visible to other participant
4. Other participant sends new message
5. Verify: conversation "resurrects" for deleting user
**Expected:** Per-user deletion with resurrection on new message
**Post-conditions:** ConversationDeletion record created

### F7.8 — Message Soft Delete (Happy Path)
**Persona:** P9
**Steps:**
1. Send a message
2. Delete the message
3. Verify: message shows "deleted" placeholder (not removed from DB)
4. Verify: `deletedAt` and `deletedBy` set in DB
**Expected:** Soft delete preserves audit trail

---

## 9. Flow 8: Reviews & Reputation

### F8.1 — Write Review (Happy Path)
**Persona:** P4 (Tenant with completed booking)
**Pre-conditions:** Booking with status ACCEPTED exists, tenant has stayed
**Steps:**
1. Navigate to listing detail or bookings page
2. Click "Write Review"
3. Select rating (1-5 stars)
4. Write review comment
5. Submit
6. Verify: review created, displayed on listing page
7. Verify: host notified of new review
8. Verify: duplicate review for same listing prevented (@@unique constraint)
**Expected:** Review submitted, visible on listing, host notified
**Post-conditions:** Review record, Notification sent

### F8.2 — Duplicate Review Prevention (Sad Path)
**Persona:** P4
**Pre-conditions:** User already reviewed this listing
**Steps:**
1. Attempt to submit another review for same listing
2. Verify: error "You have already reviewed this listing"
**Expected:** @@unique([authorId, listingId]) enforced

### F8.3 — Review Validation (Sad Path)
**Persona:** P4
**Steps:**
1. Submit with no rating -> verify error
2. Submit with rating 0 or 6 -> verify error
3. Submit with empty comment -> verify error
4. Submit with comment > max length -> verify error
**Expected:** All validation rules enforced

### F8.4 — Host Responds to Review (Happy Path)
**Persona:** P6 (Host)
**Pre-conditions:** Review exists on host's listing
**Steps:**
1. View review on listing page
2. Click "Respond"
3. Write response
4. Submit
5. Verify: `ReviewResponse` created, displayed below review
6. Verify: one response per review (@@unique on reviewId)
**Expected:** Host can respond once per review

### F8.5 — Review Pagination (Happy Path)
**Persona:** P1 or P3
**Pre-conditions:** Listing with many reviews
**Steps:**
1. View listing with 20+ reviews
2. Verify: initial batch loaded
3. Load more reviews
4. Verify: additional reviews appended
**Expected:** Reviews paginate correctly via API

---

## 10. Flow 9: Profile & Settings

### F9.1 — View Own Profile (Happy Path)
**Persona:** P8
**Steps:**
1. Navigate to `/profile`
2. Verify: name, bio, image, languages, country of origin displayed
3. Verify: verification badge shown if verified
4. Verify: "Edit Profile" button visible
**Expected:** Profile data displayed correctly

### F9.2 — Edit Profile (Happy Path)
**Persona:** P8
**Steps:**
1. Navigate to `/profile/edit`
2. Change name, bio, languages, country
3. Upload new profile image
4. Save
5. Verify: changes reflected on profile page
6. Verify: changes reflected in navbar user menu
**Expected:** Profile updates saved

### F9.3 — View Public Profile (Happy Path)
**Persona:** P1 or P3
**Steps:**
1. Navigate to `/users/[id]`
2. Verify: public profile shows name, bio, verification status
3. Verify: no private info shown (email, phone, address)
4. Verify: user's listings shown (if host)
5. Verify: reviews about this user shown
**Expected:** Public profile shows only public data

### F9.4 — Change Password (Happy Path)
**Persona:** P8
**Pre-conditions:** User has a password-based account
**Steps:**
1. Navigate to `/settings`
2. Enter current password
3. Enter new password + confirm
4. Submit
5. Verify: `passwordChangedAt` updated in DB
6. Verify: success message
7. Login with new password -> verify success
8. Login with old password -> verify failure
**Expected:** Password changed, old password invalidated

### F9.5 — Notification Preferences (Happy Path)
**Persona:** P8
**Steps:**
1. Navigate to `/settings`
2. Toggle email notifications:
   - Booking requests: ON/OFF
   - Booking updates: ON/OFF
   - Messages: ON/OFF
   - Reviews: ON/OFF
   - Search alerts: ON/OFF
   - Marketing: ON/OFF
3. Save
4. Verify: preferences stored in `notificationPreferences` JSON
5. Trigger a booking notification
6. Verify: email sent (or not) based on preference
**Expected:** Preferences saved and respected by notification system

### F9.6 — Block/Unblock User (Happy Path)
**Persona:** P8
**Steps:**
1. Navigate to another user's profile
2. Click "Block User"
3. Verify: blocked (check `BlockedUser` table)
4. Verify: blocked user's messages hidden
5. Verify: blocked user cannot start conversations
6. Navigate to settings -> blocked users list
7. Click "Unblock"
8. Verify: unblocked, messaging restored
**Expected:** Block/unblock works, affects messaging visibility

### F9.7 — Block Self Prevention (Sad Path)
**Persona:** P8
**Steps:**
1. Attempt to block own user ID
2. Verify: error "You cannot block yourself"
**Expected:** Self-block prevented

---

## 11. Flow 10: Notifications

### F10.1 — View Notifications (Happy Path)
**Persona:** P3/P4/P5/P6
**Pre-conditions:** Notifications exist from various events
**Steps:**
1. Navigate to `/notifications`
2. Verify: notifications listed by type (booking, message, review, etc.)
3. Verify: unread count shown in navbar
4. Click a notification
5. Verify: marked as read
6. Verify: navigates to relevant page (booking, conversation, listing)
**Expected:** Notifications listed, clickable, mark-as-read works

### F10.2 — Notification Types Coverage
**Persona:** Various
**Steps:** Trigger each notification type and verify:
1. `BOOKING_REQUEST` — tenant books -> host gets notification
2. `BOOKING_ACCEPTED` — host accepts -> tenant gets notification
3. `BOOKING_REJECTED` — host rejects -> tenant gets notification
4. `BOOKING_CANCELLED` — tenant cancels -> host gets notification
5. `BOOKING_HOLD_REQUEST` — tenant holds -> host gets notification
6. `BOOKING_EXPIRED` — booking expires -> both parties notified
7. `BOOKING_HOLD_EXPIRED` — hold expires -> tenant notified
8. `NEW_MESSAGE` — message sent -> recipient notified
9. `NEW_REVIEW` — review written -> host notified
10. `LISTING_SAVED` — listing saved -> host notified (if enabled)
11. `SEARCH_ALERT` — saved search matches new listing -> user notified
**Expected:** All 11 notification types fire correctly

### F10.3 — Notification Email Integration
**Persona:** P3/P5
**Pre-conditions:** Email notifications enabled in preferences
**Steps:**
1. Trigger a booking notification
2. Verify: in-app notification created
3. Verify: email sent (respecting user preference)
4. Disable email for this type in preferences
5. Trigger same notification type again
6. Verify: in-app notification created, NO email sent
**Expected:** Email follows user preferences

---

## 12. Flow 11: Saved Listings & Saved Searches

### F11.1 — Save/Unsave Listing (Happy Path)
**Persona:** P3
**Steps:**
1. Navigate to listing detail
2. Click heart/save button
3. Verify: listing saved (heart filled)
4. Verify: `SavedListing` record created
5. Navigate to `/saved`
6. Verify: saved listing appears
7. Click heart again to unsave
8. Verify: removed from saved list
**Expected:** Save/unsave toggles correctly

### F11.2 — Save Listing While Unauthenticated (Sad Path)
**Persona:** P1
**Steps:**
1. Click save button on listing
2. Verify: redirect to login
3. After login, verify: returned to listing (intent preserved)
**Expected:** Auth required, redirect back after login

### F11.3 — Save Search (Happy Path)
**Persona:** P3
**Pre-conditions:** Active search with filters
**Steps:**
1. Perform search with filters
2. Click "Save Search"
3. Enter a name for the search
4. Configure alert frequency (Instant/Daily/Weekly)
5. Save
6. Verify: `SavedSearch` record created with filters as JSON
7. Navigate to `/saved-searches`
8. Verify: saved search listed with name and filters
9. Click saved search -> verify filters restored on search page
**Expected:** Search saved with all filter state, restorable

### F11.4 — Search Alert (Happy Path)
**Persona:** P3
**Pre-conditions:** Saved search with alertEnabled = true
**Steps:**
1. New listing created that matches saved search criteria
2. Cron job `search-alerts` runs
3. Verify: `SEARCH_ALERT` notification created for user
4. Verify: email sent if preference enabled
**Expected:** Saved search alerts trigger when new matching listings appear

### F11.5 — Delete Saved Search (Happy Path)
**Persona:** P3
**Steps:**
1. Navigate to `/saved-searches`
2. Delete a saved search
3. Verify: removed from list
4. Verify: no more alerts for this search
**Expected:** Deletion stops future alerts

---

## 13. Flow 12: Identity Verification

### F12.1 — Submit Verification Request (Happy Path)
**Persona:** P8
**Pre-conditions:** User not yet verified, no pending request
**Steps:**
1. Click "Get Verified" button (on profile or listing)
2. Select document type (passport, driver_license, national_id)
3. Upload document image
4. Upload selfie (optional)
5. Submit
6. Verify: `VerificationRequest` created with status `PENDING`
7. Verify: user sees "Verification pending" status
**Expected:** Verification request submitted successfully
**Post-conditions:** VerificationRequest with PENDING status

### F12.2 — Duplicate Verification Request (Sad Path)
**Persona:** P8
**Pre-conditions:** User already has PENDING verification request
**Steps:**
1. Attempt to submit another verification request
2. Verify: error "You already have a pending verification request"
**Expected:** Only one pending request allowed

### F12.3 — Verification Cooldown After Rejection (Edge)
**Persona:** P8
**Pre-conditions:** Previous request was REJECTED less than 24 hours ago
**Steps:**
1. Attempt to submit new verification request
2. Verify: error about 24-hour cooldown
3. Wait 24 hours (or mock time)
4. Submit again -> verify accepted
**Expected:** 24-hour cooldown enforced after rejection

### F12.4 — Admin Reviews Verification (Happy Path)
**Persona:** P7 (Admin)
**Pre-conditions:** PENDING verification request exists
**Steps:**
1. Navigate to `/admin/verifications`
2. View pending request with document and selfie
3. Click "Approve"
4. Verify: request status -> `APPROVED`
5. Verify: user's `isVerified` set to true
6. Verify: user notified of approval
7. Verify: verified badge appears on user profile
**Expected:** Admin approval flow works, user gets verified badge

### F12.5 — Admin Rejects Verification (Happy Path)
**Persona:** P7
**Steps:**
1. View pending verification request
2. Click "Reject"
3. Enter admin notes (reason)
4. Confirm
5. Verify: request status -> `REJECTED`
6. Verify: admin notes stored
7. Verify: user notified with reason
8. Verify: user's `isVerified` remains false
**Expected:** Rejection with reason, user notified

---

## 14. Flow 13: Admin Panel

### F13.1 — Admin Dashboard (Happy Path)
**Persona:** P7 (Admin)
**Steps:**
1. Navigate to `/admin`
2. Verify: dashboard with summary stats
3. Verify: links to Users, Listings, Reports, Verifications, Audit Log
**Expected:** Admin dashboard accessible with navigation

### F13.2 — User Management (Happy Path)
**Persona:** P7
**Steps:**
1. Navigate to `/admin/users`
2. Verify: user list with search/filter options
3. Search for a user by name or email
4. Click user -> view details
5. Suspend a user -> verify `isSuspended` set to true
6. Verify: `AuditLog` entry created
7. Unsuspend user -> verify restored
8. Toggle admin status -> verify `isAdmin` changed
**Expected:** Full user CRUD with audit trail

### F13.3 — Listing Management (Happy Path)
**Persona:** P7
**Steps:**
1. Navigate to `/admin/listings`
2. Verify: listing list with filters (status, owner)
3. View listing details
4. Delete a listing (if allowed)
5. Verify: `AuditLog` entry
**Expected:** Admin can manage listings

### F13.4 — Report Moderation (Happy Path)
**Persona:** P7
**Pre-conditions:** OPEN reports exist
**Steps:**
1. Navigate to `/admin/reports`
2. View open reports
3. Click a report -> see details (listing, reporter, reason)
4. Resolve report -> verify status -> `RESOLVED`
5. Dismiss report -> verify status -> `DISMISSED`
6. Verify: `AuditLog` entry for each action
7. Verify: admin notes saved
**Expected:** Report moderation with full audit trail

### F13.5 — Audit Log (Happy Path)
**Persona:** P7
**Steps:**
1. Navigate to `/admin/audit`
2. Verify: chronological list of admin actions
3. Filter by action type
4. Filter by date range
5. Verify: each entry shows admin, action, target, timestamp
**Expected:** Complete audit trail browsable and filterable

### F13.6 — Non-Admin Access to Admin (Sad Path)
**Persona:** P3 (regular user)
**Steps:**
1. Navigate to `/admin` -> verify access denied / redirect
2. Call admin API endpoints -> verify 401/403
3. Attempt admin actions via direct API call -> verify rejected
**Expected:** Admin routes fully protected

### F13.7 — Suspended User Accessing Admin (Sad Path — Known Issue S1)
**Persona:** P10 (suspended admin)
**Steps:**
1. Admin account gets suspended
2. Attempt to access `/admin`
3. **Expected per audit:** Currently ALLOWS access (bug S1)
4. **Desired behavior:** Should deny access
**Cross-ref:** Production readiness audit S1

---

## 15. Flow 14: Destructive Actions

### F14.1 — Delete Listing (Happy Path)
**Persona:** P5 (Host)
**Pre-conditions:** Own listing with no active bookings
**Steps:**
1. Navigate to listing detail
2. Click "Delete Listing"
3. Verify: confirmation dialog with warning
4. Check `can-delete` API first
5. Confirm deletion
6. Verify: listing removed (or soft-deleted)
7. Verify: associated records cascade (SavedListing, RecentlyViewed, etc.)
8. Verify: listing no longer appears in search
**Expected:** Listing deleted with cascade, no orphaned records

### F14.2 — Delete Listing with Active Bookings (Sad Path)
**Persona:** P5
**Pre-conditions:** Listing has PENDING or ACCEPTED bookings
**Steps:**
1. Attempt to delete listing
2. Verify: `can-delete` returns false
3. Verify: error "Cannot delete listing with active bookings"
**Expected:** Deletion blocked, bookings preserved (Restrict on delete)

### F14.3 — Cancel Accepted Booking (Tenant)
**Persona:** P4
**Pre-conditions:** Booking with status ACCEPTED
**Steps:**
1. Navigate to booking
2. Click "Cancel"
3. Confirm
4. Verify: status -> `CANCELLED`
5. Verify: `availableSlots` restored on listing
6. Verify: host notified of cancellation
7. Verify: audit logged
**Expected:** Cancellation restores inventory

### F14.4 — Delete Conversation (Per-User)
**Persona:** P9
**Steps:** (Covered in F7.7)

### F14.5 — Block User Impact on Existing Conversations
**Persona:** P8
**Pre-conditions:** Active conversation exists with other user
**Steps:**
1. Block the other user
2. Verify: existing conversation hidden/inaccessible
3. Verify: cannot send new messages
4. Unblock
5. Verify: conversation accessible again
**Expected:** Block immediately affects conversation visibility

---

## 16. Flow 15: Cross-Feature Interactions

### F15.1 — Full Tenant Journey: Search -> Book -> Message -> Review
**Persona:** P4
**Steps:**
1. Search for listings in a city
2. Apply filters (price, room type)
3. Save a listing to favorites
4. View listing detail
5. Contact host (start conversation)
6. Send a question about the listing
7. Host responds
8. Submit booking request
9. Host accepts booking
10. Write a review after stay
11. Verify: all notifications sent at each step
12. Verify: all audit records created
**Expected:** Complete happy path through entire platform

### F15.2 — Booking -> Notification -> Email Chain
**Persona:** P4 + P6
**Steps:**
1. Tenant creates booking
2. Verify: host gets in-app notification + email
3. Host accepts
4. Verify: tenant gets in-app notification + email
5. Verify: email contains correct booking details
6. Verify: notification links navigate to correct pages
**Expected:** Full notification chain works bidirectionally

### F15.3 — Listing Status Change -> Search Visibility -> Booking Impact
**Persona:** P5
**Steps:**
1. Host pauses listing
2. Verify: listing hidden from search
3. Verify: existing PENDING bookings still visible to both parties
4. Host reactivates listing
5. Verify: listing reappears in search
6. Verify: bookings unaffected
**Expected:** Status changes propagate correctly through system

### F15.4 — Saved Search -> New Listing -> Alert
**Persona:** P3 + P5
**Steps:**
1. User A saves a search for "private room in Boston under $1000"
2. User B creates a listing matching these criteria
3. Cron `search-alerts` runs
4. Verify: User A receives `SEARCH_ALERT` notification
5. Verify: notification links to the new listing
**Expected:** Saved search alerts fire for newly matching listings

### F15.5 — User Suspension Cascade
**Persona:** P7 + P10
**Steps:**
1. Admin suspends a user
2. Verify: user sees suspension banner on next page load
3. Verify: user cannot create bookings
4. Verify: user cannot send messages
5. Verify: user cannot create listings
6. Verify: user's existing listings remain visible (but new actions blocked)
7. Admin unsuspends
8. Verify: all capabilities restored
**Expected:** Suspension blocks all write actions, unsuspend restores

---

## 17. Flow 16: Mobile-Specific Flows

### F16.1 — Mobile Search with Bottom Sheet
**Persona:** P3 (mobile viewport)
**Steps:**
1. Navigate to `/search` on mobile viewport (375px)
2. Verify: map visible, bottom sheet in half position
3. Drag sheet up -> verify expanded to ~85vh
4. Drag sheet down -> verify collapsed to ~15vh
5. Verify: map still interactive when sheet collapsed
6. Tap a map marker -> verify sheet shows listing detail
7. Verify: escape key collapses to half position
**Expected:** Bottom sheet UX per CLAUDE.md mobile rules
**Cross-ref:** CLAUDE.md mobile bottom sheet rules

### F16.2 — Mobile Navigation
**Persona:** P3 (mobile)
**Steps:**
1. Verify: hamburger menu or mobile nav visible
2. Tap menu -> verify navigation options
3. Navigate to bookings, messages, profile
4. Verify: all pages responsive at 375px width
5. Verify: no horizontal scrollbar on any page
6. Verify: touch targets >= 44px
**Expected:** Full mobile responsiveness

### F16.3 — Mobile Forms
**Persona:** P5 (mobile)
**Steps:**
1. Navigate to create listing form on mobile
2. Verify: form fields stack vertically
3. Verify: keyboard doesn't obscure active input
4. Verify: form submission works on mobile
5. Navigate to booking form on mobile -> verify same
**Expected:** Forms usable on mobile devices

### F16.4 — Mobile Messaging
**Persona:** P9 (mobile)
**Steps:**
1. Navigate to `/messages` on mobile
2. Select a conversation
3. Verify: conversation view fills screen
4. Type and send a message
5. Verify: keyboard handling correct
6. Navigate back to conversation list
**Expected:** Messaging works on mobile

---

## 18. Flow 17: Error & Empty States

### F17.1 — Empty States
**Persona:** Various
**Steps:**
1. New user visits `/bookings` (no bookings) -> verify empty state message
2. New user visits `/messages` (no conversations) -> verify empty state
3. New user visits `/saved` (no saved listings) -> verify empty state
4. New user visits `/saved-searches` (no saved searches) -> verify empty state
5. New user visits `/notifications` (no notifications) -> verify empty state
6. New user visits `/recently-viewed` (no views) -> verify empty state
7. Search with filters returning 0 results -> verify `ZeroResultsSuggestions` component
8. Listing with 0 reviews -> verify "No reviews yet"
**Expected:** All empty states have user-friendly messaging with guidance

### F17.2 — Error States
**Persona:** Various
**Steps:**
1. Navigate to `/listings/nonexistent-id` -> verify 404 page
2. Server returns 500 on search -> verify error boundary catches
3. Network disconnected during form submission -> verify error handling
4. API timeout on map load -> verify `MapErrorBoundary` shows fallback
5. Image upload fails -> verify error message, retry option
**Expected:** All errors caught by error boundaries, user-friendly messages

### F17.3 — Loading States
**Persona:** Various
**Steps:**
1. Verify: search page shows skeleton while loading
2. Verify: listing detail shows skeleton while loading
3. Verify: bookings page shows loading state
4. Verify: messages page shows loading state
5. Verify: no layout shifts during loading (CLS)
**Expected:** All pages have loading skeletons, no layout shifts

---

## 19. Flow 18: Security & Abuse Prevention

### F18.1 — Rate Limiting Verification
**Persona:** P4
**Steps:**
1. Rapidly submit booking requests -> verify rate limit after threshold
2. Rapidly send messages -> verify rate limit
3. Rapidly start conversations -> verify rate limit
4. Rapidly submit reports -> verify rate limit
5. Rapidly attempt password resets -> verify rate limit
**Expected:** All rate-limited endpoints enforce limits

### F18.2 — XSS Prevention
**Persona:** P4
**Steps:**
1. Submit listing with XSS in title: `<script>alert(1)</script>` -> verify escaped
2. Send message with XSS payload -> verify escaped
3. Submit review with XSS -> verify escaped
4. Submit profile bio with XSS -> verify escaped
5. Search query with XSS -> verify escaped
**Expected:** All user input sanitized, no XSS possible

### F18.3 — IDOR Prevention
**Persona:** P3
**Steps:**
1. Attempt to view another user's bookings by guessing booking ID -> verify 403
2. Attempt to edit another user's listing via API -> verify 403
3. Attempt to read another user's messages via API -> verify 403
4. Attempt to view another user's notifications -> verify 403
**Expected:** All resources properly authorization-checked

### F18.4 — CSRF Protection
**Persona:** P3
**Steps:**
1. Verify: server actions use proper origin validation
2. Verify: API routes check session/CSRF tokens
3. Attempt cross-origin POST to booking endpoint -> verify rejected
**Expected:** CSRF attacks prevented

### F18.5 — SQL Injection Prevention
**Persona:** P3
**Steps:**
1. Search query: `'; DROP TABLE listings; --` -> verify no SQL injection
2. Filter params with SQL payloads -> verify parameterized queries used
3. Listing ID with SQL payload -> verify safe
**Expected:** All queries parameterized (Prisma handles this)

### F18.6 — Report Listing (Happy Path)
**Persona:** P3
**Steps:**
1. Navigate to listing detail
2. Click "Report" button
3. Select reason, add details
4. Submit
5. Verify: `Report` created with status `OPEN`
6. Verify: admin can see report in admin panel
**Expected:** Reporting works, creates actionable admin items

### F18.7 — Session Expiry Handling
**Persona:** P11 (expired session)
**Steps:**
1. Session expires while user is on a page
2. User attempts an action (book, message, save)
3. Verify: graceful redirect to login with return URL
4. Verify: action does not silently fail
5. After re-login, verify: returned to intended page
**Expected:** Session expiry handled gracefully with redirect

---

## Priority Classification (FINAL — Team Ruling 2026-03-27)

### P0 — Must Test Before Launch
- F1.4 (access boundaries)
- F2.1, F2.4 (signup + login)
- F3.1, F3.2 (search + filters)
- F4.1, F4.2, F4.6, F4.9, F4.10 (booking lifecycle)
- F5.1, F5.3 (create + edit listing)
- F6.1, F6.2 (accept/reject booking)
- **F6.3 (accept on PAUSED listing — CONFIRMED P0, EC-3)**
- F7.1 (messaging)
- **F7.2 (duplicate conversation prevention — CONFIRMED P0, EC-1)**
- F13.6 (admin access control)
- F14.1, F14.2 (delete listing)
- F15.1 (full tenant journey)
- F18.1, F18.2, F18.3 (security)

### P1 — Should Test Before Launch
- F1.1, F1.2, F1.3 (anonymous browsing)
- F2.2, F2.5, F2.6 (auth error handling)
- F3.3, F3.4, F3.5 (map, pagination, sort)
- F4.3, F4.4, F4.5, F4.7, F4.8, F4.11 (booking sad paths)
- F5.2, F5.5, F5.6 (listing validation, status, images)
- F6.4 (host sad paths)
- F7.3, F7.4 (messaging edge cases)
- F8.1, F8.4 (reviews)
- F9.1 - F9.6 (profile/settings)
- F10.1, F10.2, F10.3 (notifications)
- F11.1, F11.3 (saved listings + searches)
- F12.1, F12.4, F12.5 (verification)
- F13.1 - F13.5 (admin CRUD)
- F15.2, F15.5 (cross-feature)
- F17.1, F17.2 (empty/error states)

### P2 — Test Within 2 Weeks Post-Launch
- F2.3, F2.7, F2.8 (auth edge cases)
- F3.6, F3.7, F3.8, F3.9 (search edge cases, semantic, recently viewed)
- F7.5, F7.6, F7.7, F7.8 (messaging advanced)
- F8.2, F8.3, F8.5 (review edge cases)
- F9.7 (block self)
- F11.2, F11.4, F11.5 (saved edge cases)
- F12.2, F12.3 (verification edge cases)
- F13.7 (suspended admin — known bug S1)
- F14.3, F14.5 (destructive edge cases)
- F15.3, F15.4 (cross-feature edge cases)
- F16.1 - F16.4 (mobile)
- F17.3 (loading states)
- F18.4, F18.5, F18.6, F18.7 (security advanced)

### P3 — Backlog
- F1.5 (static pages)
- F6.5 (audit trail view)

---

## Known Bug Cross-References

| Bug ID | Audit Ref | Flow | Description |
|--------|-----------|------|-------------|
| R1 | Production Audit R1 | F7.2 | Duplicate conversation creation race condition |
| R2 | Production Audit R2 | F6.3 | Accept booking on PAUSED listing |
| S1 | Production Audit S1 | F13.7 | Suspended admin retains access |
| BUG-001 | BUGS_FOUND.md | F4.6 | Concurrent booking 500 error (FIXED) |

---

## Test Data Requirements

For all simulations, the following seed data is needed:

1. **Users:** At least 5 users (admin, verified host, verified tenant, unverified user, suspended user)
2. **Listings:** At least 10 active listings with varied attributes (price, room type, amenities, locations)
3. **Bookings:** At least 5 bookings in varied states (PENDING, ACCEPTED, REJECTED, CANCELLED, HELD, EXPIRED)
4. **Conversations:** At least 3 conversations with message history
5. **Reviews:** At least 5 reviews across different listings
6. **Notifications:** Notifications from various event types
7. **Saved Listings/Searches:** At least 2 of each
8. **Reports:** At least 2 (OPEN, RESOLVED)
9. **Verification Requests:** At least 2 (PENDING, APPROVED)
10. **Blocked Users:** At least 1 block relationship

---

## Metrics & Success Criteria

- **Coverage:** Every route in `src/app/` has at least one flow that tests it
- **API Coverage:** Every route handler in `src/app/api/` has at least one flow exercising it
- **State Machine Coverage:** Every BookingStatus transition tested
- **Auth Boundary:** Every protected resource tested with both authenticated and unauthenticated users
- **Error Handling:** Every error boundary / error.tsx has a flow that triggers it
- **Empty State:** Every page with dynamic content has an empty state flow
- **Mobile:** Every critical flow has a mobile variant in F16

**Total flows:** 95 individual test scenarios across 18 flow categories and 11 user personas

---

## ADDENDUM A: Cross-Reference with Team Deliverables

### Gaps Identified from FEATURE_MAP.md

The following features from the feature map are NOT yet covered by the 95 flows above and need dedicated test scenarios:

#### A1. AI Neighborhood Chat (`/api/agent`, `/api/chat`)
**Missing flow — add to F15 or new F19:**
- P3 navigates to listing detail -> opens neighborhood chat
- Sends question: "What's the neighborhood like?"
- Verify: Groq AI responds with relevant info
- Verify: origin guard prevents cross-origin access
- Verify: rate limiting on chat endpoint
- Edge: send XSS payload in chat query -> verify sanitized
- Edge: send query when Groq API is down -> verify graceful fallback

#### A2. Account Deletion (in `settings.ts:deleteAccount`)
**Missing from F9 (Profile/Settings) — add as F9.8:**
- F9.8: Navigate to settings, click "Delete Account", confirm
- Verify: cascade deletes user data (listings, bookings, messages, etc.)
- Verify: audit trail preserved (BookingAuditLog actorId set to null via SetNull)
- Verify: redirected to homepage, session invalidated
- Sad path: attempt delete while having active bookings -> verify warning/block

#### A3. SEO/Meta Pages (sitemap.ts, robots.ts, opengraph-image, twitter-image)
**Missing from F1 (Anonymous Visitor) — add as F1.6:**
- F1.6: Verify `/sitemap.xml` returns valid XML with listing URLs
- Verify: `/robots.txt` returns correct directives
- Verify: OG image and Twitter card image generated for listing pages
- Verify: `<meta>` tags present on search and listing pages

#### A4. Cron Job Verification
**Missing entirely — add as F19 (Infrastructure Flows):**
- F19.1: Sweep expired holds (verify `heldUntil < now()` bookings -> EXPIRED, slots restored)
- F19.2: Reconcile slots (verify `availableSlots` matches actual booking state)
- F19.3: Search alerts (verify saved search matches trigger notification)
- F19.4: Cleanup stale typing indicators
- F19.5: Cleanup expired rate limit / idempotency entries
- F19.6: Refresh search docs (verify dirty SearchDoc rows rebuilt)
- Each cron requires: CRON_SECRET auth, advisory lock preventing duplicate runs

#### A5. Feature Flag Behavior
**Missing entirely — add to F19 or separate F20:**
- When `ENABLE_SOFT_HOLDS=off`: hold button should not appear, createHold returns error
- When `ENABLE_SEMANTIC_SEARCH=false`: natural language search falls back to text search
- When `ENABLE_MULTI_SLOT_BOOKING=false`: slot selector hidden, slotsRequested locked to 1
- When `ENABLE_BOOKING_AUDIT=false`: audit trail endpoint returns empty/404

#### A6. Health Check Endpoints
**Missing from F18 — add as F18.8:**
- `/api/health/live` returns 200
- `/api/health/ready` returns 200 when DB is connected, 503 when not
- `/api/metrics` returns application metrics
- `/api/metrics/ops` requires HMAC auth

#### A7. Upload DELETE (path traversal — Production Audit V1)
**Partially covered in F5.6 but path traversal not explicit:**
- Attempt `DELETE /api/upload` with path `../other-user/image.jpg`
- Verify: path traversal blocked

#### A8. Listing Viewer State API (`/api/listings/[id]/viewer-state`)
**Missing — used by listing detail to show personalized state:**
- Authenticated user visits listing -> viewer-state returns: isSaved, isBlocked, bookingStatus
- Anonymous user -> returns defaults
- Verify: no IDOR (cannot query viewer state as another user)

---

### Gaps Identified from EDGE_CASE_MATRIX.md

The following edge cases from the edge-case-hunter are NOT yet covered:

#### B1. EC-2: Suspended user sends message in existing conversation
**OVERRULED by codebase-architect:** `checkSuspension()` IS present at `chat.ts:133` in `sendMessage`. This is NOT a bug.
**Revised flow F7.9 (verification test, not a bug test):**
- Pre-condition: User is suspended, has existing conversation
- User opens existing conversation, types message, sends
- **Expected behavior:** Message blocked with suspension error (CORRECTLY IMPLEMENTED)
- Priority: P2 (verification test, not a bug fix)

#### B2. EC-4: PENDING bookings never expire
**Add to F4 as F4.12:**
- Create a PENDING booking
- Wait indefinitely (no cron job exists to expire it)
- Verify: booking remains PENDING forever (known design gap)
- This is a **design issue** not a test — but we should verify the behavior is documented

#### B3. EC-5: Notification DB write fails after successful booking
**Add to F15 as F15.6:**
- Simulate notification creation failure (mock or break notifications table)
- Create a booking
- Verify: booking succeeds, notification is lost silently
- Verify: email backup channel still fires (if configured)
- This tests the fire-and-forget design decision

#### B4. EC-6: Host deletes listing with PENDING bookings via API route
**Extend F14.2:**
- Specifically test owner-deletion via `DELETE /api/listings/[id]` (not admin deletion)
- Pre-condition: listing has PENDING bookings
- **Current behavior:** `tx.listing.delete()` CASCADE-deletes bookings entirely
- **Expected behavior:** Bookings set to CANCELLED, preserved for tenant records
- Note: Admin `deleteListing` in `actions/admin.ts` correctly cancels first — API route does not

#### B5. EC-8: Unbounded notification limit parameter
**Add to F18 as F18.9:**
- Call `getNotifications({ limit: 99999 })`
- Verify: should be capped at reasonable maximum (currently not)

#### B6. EC-10: Suspended user still able to send messages
**Same as B1 — already captured.**

#### B7. KI-16: Map token exposure risk
**Add to F18 as F18.10:**
- Verify: map API keys are not exposed in client-side JavaScript bundles
- Verify: Stadia/Mapbox tokens use proper domain restrictions

---

### Gaps Identified from CONCURRENCY_TEST_MATRIX.md

The concurrency-guardian identified 16 scenarios. These map to my flows as follows:

| Concurrency Scenario | My Flow | Status |
|---|---|---|
| S1: Two tenants booking same room | F4.6 (partial) | **EXTEND** — add multi-context Playwright pattern |
| S2: Two tenants holding last slot | Not covered | **ADD as F4.13** |
| S3: Host accepts while tenant cancels | Not covered | **ADD as F4.14** |
| S4: Duplicate conversation creation | F7.2 (partial) | **EXTEND** — add simultaneous multi-user test |
| S5: Host accepts while sweeper expires hold | Not covered | **ADD as F4.15** |
| S6: Host updates listing while tenant books | Not covered | **ADD as F4.16** (price change during booking) |
| S7: Admin vs host concurrent listing status | Not covered | **ADD as F13.8** |
| S8: Multiple users messaging simultaneously | Covered by F7.1/F7.5 | OK |
| S9: Same user double-click booking | F4.6 (partial) | **EXTEND** — two-tab pattern |
| S10: Hold expires during checkout | Not covered | **ADD as F4.17** |
| S12: Sweeper vs sweeper (duplicate cron) | Not covered | **ADD to F19.1** |
| S13: State machine integrity under load | Not covered | **ADD as F4.18** (multi-operation slot math) |
| S15: Pause listing while accept in-flight | F6.3 (partial) | **EXTEND** — concurrent pattern |
| S16: Triple-click start conversation | F7.2 (partial) | **EXTEND** — rapid-fire pattern |

**New flows to add: 8 new scenarios + 6 extensions = 14 additions**

---

### Revised Flow Count

| Category | Original | Added | New Total |
|---|---|---|---|
| Anonymous Visitor (F1) | 5 | 1 (F1.6 SEO) | 6 |
| Authentication (F2) | 8 | 0 | 8 |
| Tenant Search (F3) | 9 | 0 | 9 |
| Tenant Booking (F4) | 11 | 7 (F4.12-F4.18) | 18 |
| Host Listing (F5) | 6 | 0 | 6 |
| Host Booking (F6) | 5 | 0 (F6.3 extended) | 5 |
| Messaging (F7) | 8 | 1 (F7.9 suspended msg) | 9 |
| Reviews (F8) | 5 | 0 | 5 |
| Profile/Settings (F9) | 7 | 1 (F9.8 delete account) | 8 |
| Notifications (F10) | 3 | 0 | 3 |
| Saved (F11) | 5 | 0 | 5 |
| Verification (F12) | 5 | 0 | 5 |
| Admin (F13) | 7 | 1 (F13.8 concurrent) | 8 |
| Destructive (F14) | 5 | 0 (F14.2 extended) | 5 |
| Cross-Feature (F15) | 5 | 1 (F15.6 notification failure) | 6 |
| Mobile (F16) | 4 | 0 | 4 |
| Error/Empty States (F17) | 3 | 0 | 3 |
| Security (F18) | 7 | 3 (F18.8-F18.10) | 10 |
| **NEW: Infrastructure (F19)** | 0 | 6 (cron jobs) | 6 |
| **NEW: Feature Flags (F20)** | 0 | 4 (flag behavior) | 4 |
| **NEW: AI Chat (F21)** | 0 | 1 | 1 |
| **NEW: Viewer State (F22)** | 0 | 1 | 1 |
| **TOTAL** | **95** | **27** | **122** |

### Revised Priority Classification

**P0 (must test before launch): 27 flows** (+6 from original 21)
- Added: F4.13 (concurrent holds), F4.14 (accept vs cancel race), F4.15 (accept vs sweeper), F9.8 (account deletion), F18.8 (health checks), F19.1 (sweeper cron)
- NOTE: F7.9 (suspended user messaging) moved to P2 — codebase-architect confirmed `checkSuspension()` IS present at chat.ts:133. EC-2 overruled.

**P1 (should test before launch): 44 flows** (+6)
- Added: F4.16 (price change during booking), F4.17 (hold expiry during checkout), F4.18 (state machine integrity), F13.8 (admin vs host race), F15.6 (notification failure), F19.2 (reconcile slots)

**P2 (within 2 weeks post-launch): 41 flows** (+11)
- Added: F1.6 (SEO), F7.9 (suspended user messaging verification), F19.3-F19.6 (cron jobs), F20.1-F20.4 (feature flags), F18.9 (unbounded notifications), F18.10 (map token exposure)

**P3 (backlog): 10 flows** (+4)
- Added: F21.1 (AI chat), F22.1 (viewer state), F14.2 extended (cascade delete), F4.12 (PENDING never expires)

---

## ADDENDUM B: Challenge Resolutions (Phase 3 Debate)

### Resolution 1: codebase-architect's 3 Remaining Gaps — ACCEPTED

**GAP 5 (P0): HELD booking reject/cancel with slot restoration**
codebase-architect is correct. HELD bookings consume slots at creation (unlike PENDING which do not). The HELD->REJECTED and HELD->CANCELLED paths have DIFFERENT slot restoration logic from the PENDING paths. These need dedicated flows.

**F6.6 — Host Rejects Held Booking (NEW — P0)**
**Persona:** P6 (Host)
**Pre-conditions:** Listing with totalSlots=2, availableSlots=1 (one HELD booking consuming a slot)
**Steps:**
1. Host navigates to `/bookings`
2. Finds HELD booking from tenant
3. Clicks "Reject"
4. Verify: booking status -> `REJECTED`
5. Verify: `availableSlots` restored from 1 to 2 (slot returned)
6. Verify: `BookingAuditLog` entry with action `REJECTED`, previousStatus `HELD`
7. Verify: tenant notified
**Expected:** Slot restoration occurs on HELD->REJECTED (unlike PENDING->REJECTED which does NOT touch slots)
**Why P0:** Slot restoration failure means phantom slot consumption — the listing shows fewer available slots than reality. This is an inventory invariant.
**Code path:** `manage-booking.ts` HELD->REJECTED uses conditional UPDATE `availableSlots + slotsRequested` with LEAST clamp

**F4.19 — Tenant Cancels Own Hold (NEW — P0)**
**Persona:** P4 (Tenant)
**Pre-conditions:** Tenant has an active HELD booking, listing shows reduced availableSlots
**Steps:**
1. Tenant navigates to `/bookings`
2. Finds their HELD booking
3. Clicks "Cancel"
4. Verify: booking status -> `CANCELLED`
5. Verify: `availableSlots` restored (slot returned)
6. Verify: `BookingAuditLog` entry with action `CANCELLED`, previousStatus `HELD`
7. Verify: host notified of cancellation
**Expected:** Slot restoration occurs on HELD->CANCELLED
**Why P0:** Same inventory invariant as F6.6

**GAP 6 (P2): Review response edit/delete lifecycle**

**F8.6 — Host Edits Review Response (NEW — P2)**
**Persona:** P6 (Host)
**Pre-conditions:** Host has already responded to a review
**Steps:**
1. Navigate to listing with existing review response
2. Click "Edit Response"
3. Modify response text
4. Save
5. Verify: `ReviewResponse.updatedAt` changed, content updated
**Expected:** Edit works, preserves the one-response-per-review constraint

**F8.7 — Host Deletes Review Response (NEW — P2)**
**Persona:** P6 (Host)
**Pre-conditions:** ReviewResponse exists
**Steps:**
1. Click "Delete Response"
2. Confirm
3. Verify: ReviewResponse removed from DB
4. Verify: original Review still exists
**Expected:** Deletion does not cascade to the Review itself

**GAP 7 (P2): Recently-viewed 20-item cap**

**F3.10 — Recently Viewed Cap Pruning (NEW — P2)**
**Persona:** P3 (Tenant, authenticated)
**Pre-conditions:** User already has 20 recently viewed listings
**Steps:**
1. View a 21st listing
2. Navigate to `/recently-viewed`
3. Verify: exactly 20 items shown
4. Verify: oldest item pruned, newest item at top
5. Verify: no duplicate entries (upsert behavior via `@@unique([userId, listingId])`)
**Expected:** 20-item cap maintained, oldest pruned on overflow

---

### Resolution 2: concurrency-guardian's VETO — ACCEPTED, Dedicated Flow Category Created

The concurrency-guardian is right: race conditions CANNOT be tested as steps within single-user flows. They require **dedicated multi-context Playwright tests** where multiple browser contexts act simultaneously via `Promise.all`. I accept this challenge and create a new dedicated flow category.

**Flow 23: Concurrency & Multi-User Races (8 dedicated multi-context flows)**

Each flow below requires `browser.newContext()` for each concurrent actor and `Promise.all` for simultaneous actions. These are NOT embeddable as steps in single-user flows.

**CC-1 — Two Tenants Race for Last Slot (P0)**
**Personas:** P4a + P4b (two different tenants)
**Pre-conditions:** Listing with totalSlots=1, availableSlots=1
**Multi-context setup:**
- Context A: Tenant A authenticated
- Context B: Tenant B authenticated
**Steps:**
1. Both navigate to the listing detail page
2. Both fill booking form with same dates
3. `Promise.all`: Both click "Book Now" simultaneously
4. Capture both API responses
5. Verify: exactly ONE succeeds (booking created)
6. Verify: exactly ONE fails with "Not enough available slots"
7. Verify: `availableSlots` = 0 (not negative)
8. Verify: only one Booking record with status PENDING/HELD
**Post-verification:** Query DB via test-helpers to confirm slot count and booking count

**CC-2 — Host Accept vs Tenant Cancel Race (P0)**
**Personas:** P6 (Host) + P4 (Tenant)
**Pre-conditions:** PENDING booking B1 exists
**Multi-context setup:**
- Context A: Host authenticated
- Context B: Tenant authenticated
**Steps:**
1. Host opens `/bookings`, sees B1
2. Tenant opens `/bookings`, sees B1
3. `Promise.all`: Host clicks "Accept", Tenant clicks "Cancel"
4. Verify: exactly ONE transition succeeds
5. Verify: final status is either ACCEPTED or CANCELLED (not both, not corrupted)
6. Verify: optimistic lock (version field) caught the concurrent modification
7. If ACCEPTED: verify slots decremented. If CANCELLED: verify slots unchanged.
**Post-verification:** Check `BookingAuditLog` for exactly one successful transition

**CC-3 — Host Accept vs Sweeper Expire Race (P0)**
**Personas:** P6 (Host) + System (sweeper cron)
**Pre-conditions:** HELD booking B1 with `heldUntil` = NOW() - 1 second (just expired but sweeper hasn't run)
**Multi-context setup:**
- Context A: Host authenticated
- Sweeper: Direct API call to `/api/cron/sweep-expired-holds` with CRON_SECRET
**Steps:**
1. Host opens `/bookings`, sees B1 as HELD
2. `Promise.all`: Host clicks "Accept" AND sweeper cron is triggered
3. Verify: exactly ONE succeeds
4. If host wins: booking ACCEPTED (inline expiry check at manage-booking.ts:100-137 may still catch it)
5. If sweeper wins: booking EXPIRED, host gets HOLD_EXPIRED_OR_MODIFIED
6. Verify: `availableSlots` is correct regardless of winner
**Post-verification:** Sweeper uses SKIP LOCKED — if host holds FOR UPDATE lock, sweeper skips. Verify this pattern.

**CC-4 — Accept Booking on PAUSED Listing — Concurrent (P0)**
**Personas:** P6 Tab 1 (listing management) + P6 Tab 2 (booking management)
**Pre-conditions:** ACTIVE listing L1 with PENDING booking B1
**Multi-context setup:**
- Context A: Host tab 1 on listing management
- Context B: Host tab 2 on bookings page
**Steps:**
1. `Promise.all`: Tab 1 pauses listing L1 AND Tab 2 accepts booking B1
2. Verify: if pause succeeds first, accept SHOULD fail (KNOWN BUG EC-3: currently does NOT fail)
3. Verify: final state is consistent (listing status + booking status + slot count)
4. This test DOCUMENTS the EC-3 race condition until the fix lands
**Expected (current broken behavior):** Both may succeed — booking accepted on PAUSED listing
**Expected (after fix):** Accept fails with "LISTING_NOT_ACTIVE"

**CC-5 — Same User Multi-Tab Idempotency (P1)**
**Personas:** P4 (same tenant, two tabs)
**Pre-conditions:** Active listing with available slots
**Multi-context setup:**
- Context A: Tenant tab 1 (same auth state)
- Context B: Tenant tab 2 (same auth state)
**Steps:**
1. Both tabs navigate to same listing
2. `Promise.all`: Both click "Book Now"
3. Verify: if same idempotency key -> second returns cached result
4. Verify: if different keys -> partial unique index prevents duplicate active booking
5. Verify: exactly one Booking created
**Post-verification:** Check `IdempotencyKey` table for claim pattern

**CC-6 — Concurrent Conversation Creation (P0 — per team ruling on EC-1)**
**Personas:** P4 (tenant, single user, rapid-fire)
**Pre-conditions:** No existing conversation for this tenant+listing
**Multi-context setup:**
- Single context, but intercept at network level or use two tabs
**Steps:**
1. Tenant has listing detail open in two tabs
2. `Promise.all`: Both tabs click "Contact Host"
3. Verify: exactly ONE conversation created (KNOWN RACE: currently may create two)
4. Check `Conversation` count for this (listingId, tenantId, ownerId) tuple
5. This test DOCUMENTS the EC-1 race condition
**Expected (current broken behavior):** May create 2 conversations
**Expected (after fix):** Exactly 1 conversation, second request returns existing

**CC-7 — Hold Expiry During Checkout Flow (P1)**
**Personas:** P4 (Tenant) + System (time progression)
**Pre-conditions:** HELD booking with 15-minute TTL, currently at minute 14:50
**Steps:**
1. Tenant navigates to booking checkout at T=14:50
2. Use test-helpers to set `heldUntil` to NOW() - 1 second (simulate expiry)
3. Tenant submits "Convert hold to booking"
4. Verify: inline expiry check at manage-booking.ts:100-137 catches the expired hold
5. Verify: error "This hold has expired" returned
6. Verify: no slot double-counting (hold already consumed slot, should be restored)
**Post-verification:** Verify `availableSlots` restored after expiry

**CC-8 — Sweeper vs Sweeper Advisory Lock (P1)**
**Personas:** System + System (two concurrent cron invocations)
**Pre-conditions:** HELD bookings exist past TTL
**Steps:**
1. `Promise.all`: Trigger `/api/cron/sweep-expired-holds` twice with CRON_SECRET
2. Verify: exactly ONE sweeper runs (acquires `pg_try_advisory_xact_lock`)
3. Verify: second returns `{ skipped: true, reason: "lock_held" }`
4. Verify: expired bookings processed exactly once (no double-expiry)
5. Verify: slot restoration happens exactly once
**Post-verification:** Check BookingAuditLog for exactly one EXPIRED entry per booking

---

### Resolution 3: EC-2 Stale Reference — ALREADY FIXED

EC-2 was corrected in a previous update. The plan at line 1595 now reads:
> **OVERRULED by codebase-architect:** `checkSuspension()` IS present at `chat.ts:133` in `sendMessage`. This is NOT a bug.
F7.9 was reclassified from P0 to P2 (verification test).

---

### Final Revised Flow Count (Post-Debate)

| Category | Previous | Added | New Total |
|---|---|---|---|
| Tenant Booking (F4) | 18 | +1 (F4.19 cancel own hold) | 19 |
| Host Booking (F6) | 5 | +1 (F6.6 reject held booking) | 6 |
| Reviews (F8) | 5 | +2 (F8.6 edit response, F8.7 delete response) | 7 |
| Tenant Search (F3) | 9 | +1 (F3.10 recently viewed cap) | 10 |
| **NEW: Concurrency (F23)** | 0 | +8 (CC-1 through CC-8) | 8 |
| All other categories | unchanged | 0 | unchanged |
| **TOTAL** | **122** | **+13** | **135** |

### Final Priority Counts (Post Team Ruling)

| Priority | Count | Change |
|---|---|---|
| P0 | **34** | +F6.3, F7.2 promoted from P1; +F6.6, F4.19, CC-1, CC-2, CC-3, CC-4, CC-6 (EC-1 ruling) |
| P1 | **45** | -F6.3, -F7.2, -CC-6 moved to P0; +CC-5, CC-7, CC-8 |
| P2 | **46** | +F8.6, F8.7, F3.10 + prior P2 adjustments |
| P3 | 10 | unchanged |
| **TOTAL** | **135** | +13 from Addendum A baseline |

### Confirmed P0 Bug List (Team Consensus)
1. **EC-1 (P0)**: Conversation creation race — `chat.ts:77-103` — tested by F7.2 + CC-6
2. **EC-3 (P0)**: Booking ACCEPT on non-ACTIVE listing — `manage-booking.ts:171,255` — tested by F6.3 + CC-4
3. **GAP-5 (P0)**: HELD slot restoration — tested by F6.6 (reject) + F4.19 (cancel)
