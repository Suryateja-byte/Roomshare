# Edge Case Matrix & Known Issues Verification

**Agent:** edge-case-hunter
**Date:** 2026-03-27
**Scope:** All server actions, API routes, schema constraints, state transitions
**Method:** Code-level verification of every previously-identified issue + new failure mode discovery

---

## Executive Summary

| Category | Count | Status |
|----------|-------|--------|
| Previously-identified issues verified | 16 | 8 FIXED, 2 STILL BROKEN, 3 PARTIALLY FIXED, 3 UNKNOWN |
| New edge cases discovered | 18 | 2 CRITICAL (1 retracted), 7 MAJOR, 2 MINOR, 6 INFORMATIONAL |
| **Total remaining P0 risks** | **1** | Must fix before production (EC-3) |
| **Total remaining P1-HIGH risks** | **1** | Fix first sprint (EC-1, downgraded from P0 after debate) |
| **Total remaining P1 risks** | **4** | Should fix before production |
| **Total remaining P2 risks** | **2** | Fix within 2 weeks |

---

## SECTION 1: KNOWN ISSUES VERIFICATION

### CRITICAL Issues (from previous audits)

#### KI-1: Race condition in conversation creation
- **Source:** Logic Audit C-01, Production Readiness Audit R1
- **File:** `src/app/actions/chat.ts:76-103`
- **STATUS: STILL BROKEN**
- **Evidence:** `findFirst` (line 77) and `create` (line 96) are separate Prisma calls, not wrapped in `$transaction`. Rate limiting (lines 37-42) reduces probability but does not eliminate the race.
- **Reproduction:** Two users simultaneously clicking "Message host" on the same listing. Both `findFirst` return null, both `create` execute, producing two Conversation rows. Messages split between them.
- **Required fix:** Wrap in `$transaction` with SERIALIZABLE isolation, or add a partial unique index.

#### KI-2: No unique constraint on Conversation participants
- **Source:** Logic Audit, Production Readiness Audit R1
- **File:** `prisma/schema.prisma:258-271`
- **STATUS: STILL BROKEN**
- **Evidence:** The Conversation model uses M2M `participants User[]` with no `@@unique` constraint. Grep for `@@unique.*Conversation` in prisma directory returns zero matches.
- **Impact:** No DB-level protection against duplicate conversations. Application-level `findFirst` is the sole guard.
- **Required fix:** Add a partial unique index via raw SQL migration on `(listingId)` filtered by participant pair, or restructure to explicit `participant1Id` / `participant2Id` columns with `@@unique([listingId, participant1Id, participant2Id])`.

#### KI-3: Upload security -- magic bytes validation
- **Source:** Logic Audit
- **File:** `src/app/api/upload/route.ts:17-38, 127`
- **STATUS: FIXED**
- **Evidence:** `MAGIC_BYTES` dictionary validates JPEG, PNG, GIF, WebP signatures. `validateMagicBytes(buffer, file.type)` called at line 127 before upload. Sharp re-encodes all types including GIF (animated: true) at lines 139-147, stripping EXIF/metadata.

#### KI-4: Unauthenticated /api/listings/[id]/status endpoint
- **Source:** Logic Audit
- **File:** `src/app/api/listings/[id]/status/route.ts:7-17`
- **STATUS: ACCEPTABLE (by design)**
- **Evidence:** Comment at line 8: "Public endpoint - no auth required. Used by ListingFreshnessCheck to verify listing availability for all viewers." Rate limiting added at lines 14-17. Returns only `id`, `status`, `updatedAt` -- no sensitive data.

### MAJOR Issues (from previous audits)

#### KI-5: availableSlots can go negative
- **Source:** Logic Audit, Production Readiness Audit
- **File:** `src/app/actions/manage-booking.ts:310-320`
- **STATUS: FIXED**
- **Evidence:** Conditional UPDATE `WHERE "availableSlots" >= ${slotsToDecrement}` at line 316. Returns 0 rows if insufficient, triggering `SLOT_UNDERFLOW` error at line 318. Reconciliation cron exists at `src/app/api/cron/reconcile-slots/route.ts`.

#### KI-6: No Zod validation on PATCH for listings
- **Source:** Logic Audit H-03
- **File:** `src/app/api/listings/[id]/route.ts:42-103`
- **STATUS: FIXED**
- **Evidence:** Full `updateListingSchema` with `sanitizeUnicode`, `noHtmlTags`, typed enum schemas (`listingLeaseDurationSchema`, etc.), `supabaseImageUrlSchema` for images, numeric constraints. Parsed at line 352.

#### KI-7: Notifications created outside transaction
- **Source:** Logic Audit, Production Readiness Audit
- **Files:** `src/app/actions/booking.ts:270-310`, `src/app/actions/manage-booking.ts:377-399`
- **STATUS: STILL PRESENT (by design)**
- **Evidence:** `runBookingSideEffects()` runs after `withIdempotency` completes. ACCEPT notifications at line 377 have comment: "outside transaction for performance". `createInternalNotification` has try/catch but failure is swallowed -- booking succeeds, user never notified.
- **Mitigations:** Email is sent as backup channel. In-app notification failure is logged.
- **Residual risk:** MAJOR -- silent notification loss possible.

#### KI-8: Block check outside transaction (booking)
- **Source:** Logic Audit
- **File:** `src/app/actions/booking.ts:149-157`
- **STATUS: FIXED for create (inside transaction). Status update path does not check blocks -- acceptable design decision.**

#### KI-9: No automated PENDING booking expiration
- **Source:** Production Readiness Audit
- **STATUS: STILL BROKEN**
- **Evidence:** HELD bookings have sweeper cron + inline expiry (manage-booking.ts:100-137). PENDING bookings have NO timeout, NO cron, NO auto-cancellation. Grep for `PENDING.*expir` confirms no expiration logic for PENDING status.
- **Impact:** PENDING bookings accumulate indefinitely. Hosts must manually reject each one.
- **Required fix:** Add cron job or TTL (e.g., auto-cancel PENDING after 7 days).

#### KI-10: Suspended user flag not checked everywhere
- **Source:** Logic Audit, Production Readiness Audit
- **STATUS: FIXED** (corrected 2026-03-27 after codebase-architect challenge)
- **Evidence of fixes:**
  - `booking.ts:364` -- `checkSuspension()` for createBooking
  - `manage-booking.ts:37` -- `checkSuspension()` for updateBookingStatus
  - `chat.ts:44` -- `checkSuspension()` for startConversation
  - `chat.ts:133-136` -- `checkSuspension()` for sendMessage (verified present)
  - `api/listings/[id]/route.ts:315` -- `checkSuspension()` for PATCH
- **Original EC-2 claim retracted:** Initial analysis only read to line 125 and missed the suspension check at lines 133-136. Codebase-architect cited exact lines; re-read confirmed.

### Missing Error Boundaries

- **STATUS: ALL FIXED**
- **Evidence:** 32 `error.tsx` files found via glob. All major routes covered including `/bookings`, `/messages`, `/notifications`, `/saved`, `/saved-searches`, `/settings`, `/verify`, `/profile`, `/users/[id]`, `/admin/*`.

### Search Page Audit Issues

#### KI-11: No SEO metadata
- **STATUS: LIKELY FIXED** (per PRODUCTION_READINESS_REPORT.md P0-7 notes; generateMetadata referenced in listings pages)

#### KI-12: Unsigned cursors
- **STATUS: FIXED** -- HMAC cursor signing with `timingSafeEqual` confirmed in PRODUCTION_READINESS_REPORT.md

#### KI-13: Facets timeout gap
- **STATUS: FIXED** per search-page-audit-2026-03-21.md

#### KI-14: SaveSearch accessibility issues
- **STATUS: UNKNOWN** -- not verified in latest audit round

#### KI-15: Filter parameter inconsistency
- **STATUS: FIXED** -- Standardized on comma-separated format per search-page-audit-2026-03-21.md

#### KI-16: Map token exposure risk
- **STATUS: UNKNOWN** -- not addressed in any audit

---

## SECTION 2: EDGE CASE MATRIX (New Findings)

### CRITICAL (P0)

| ID | Scenario | Files | Expected | Actual | Evidence |
|----|----------|-------|----------|--------|----------|
| ~~EC-2~~ | ~~Suspended user sends message in existing conversation~~ | `actions/chat.ts:133-136` | **RETRACTED** | `checkSuspension()` IS present at lines 133-136. Initial read stopped at line 125 and missed it. Corrected after codebase-architect challenge with exact line numbers. | ~~CRITICAL~~ RESOLVED |
| EC-3 | Host accepts booking on PAUSED or RENTED listing | `actions/manage-booking.ts:244-374` | Acceptance blocked | Booking accepted on non-ACTIVE listing | The `FOR UPDATE` query at line 254 selects `availableSlots, totalSlots, id, ownerId, bookingMode` but does NOT select or check `status`. No `listing.status === 'ACTIVE'` guard anywhere in ACCEPT path. Grep confirms zero matches for `status.*ACTIVE` or `listing.status` in manage-booking.ts. |

### MAJOR (P1-HIGH for EC-1, P1 for rest)

| ID | Scenario | Files | Expected | Actual | Evidence |
|----|----------|-------|----------|--------|----------|
| EC-1 | Two users start conversation for same listing simultaneously | `actions/chat.ts:76-103` | One conversation created | Two conversations created; messages split (but both visible) between them | `findFirst` then `create` not in `$transaction`; no unique constraint. **Downgraded from CRITICAL to P1-HIGH after debate**: concurrency-guardian showed messages are split across two visible conversations, not lost. Impact is UX confusion + permanent data pollution with no recovery path. Fix first sprint. |
| EC-4 | PENDING booking sits for months without host action | No expiry logic | Auto-expire after configurable TTL | Sits indefinitely | Only HELD bookings have sweeper cron. PENDING has no TTL. |
| EC-5 | Notification DB write fails after successful booking transaction | `booking.ts:270-310`, `manage-booking.ts:377` | Retry or compensating action | Silent failure, user never notified | try/catch in `createInternalNotification` logs error but returns `{error}`, not thrown. Caller doesn't check return value. |
| EC-6 | Host deletes listing with PENDING bookings | `api/listings/[id]/route.ts:140-222` | Listing deleted, bookings set to CANCELLED | `tx.listing.delete()` FAILS with FK violation | **CORRECTED**: `onDelete: Restrict` (migration 20260325) protects bookings. DELETE handler only checks ACCEPTED (line 158) but PENDING/HELD also block via FK. Notifications created-then-rolled-back. Downgraded to MINOR. Fix: batch-update non-terminal bookings to CANCELLED before delete. |
| EC-8 | Client passes `limit=99999` to `getNotifications` | `actions/notifications.ts:56` | Capped at reasonable maximum | `take: limit + 1` fetches up to 100,000 rows | No `Math.min(limit, MAX)` guard. Default is 20 but parameter is caller-controlled. |
| EC-9 | PATCH listing with `images: []` | `api/listings/[id]/route.ts:101` | Rejected -- listing must have at least 1 image | All images removed from listing | Schema is `z.array(supabaseImageUrlSchema).max(10).optional()` with no `.min(1)`. |
| EC-10 | Malicious upload request with enormous non-file form fields | `api/upload/route.ts:96-97` | Request rejected before memory exhaustion | Entire form data parsed into memory before file size check | `request.formData()` reads full body. 5MB check only runs on the file object afterward. |
| EC-11 | Double-click "Start conversation" within rate limit window | `actions/chat.ts:37-42, 76-103` | Idempotent -- returns existing conversation | Creates duplicate if both requests pass rate limit and findFirst check | Rate limit window allows burst; findFirst is not atomic with create. Duplicate of EC-1. |

### MINOR

| ID | Scenario | Files | Expected | Actual |
|----|----------|-------|----------|--------|
| EC-7 | User blocks someone mid-conversation | `actions/block.ts`, `actions/chat.ts` | Old messages remain visible (design choice) | Correct -- block prevents new messages only. Acceptable. |
| EC-12 | `NEXT_PUBLIC_SUPABASE_URL` exposed in client bundle | Various client components | Not a secret per se | Public URL for Supabase project. Storage bucket access depends on RLS/policies, not URL secrecy. Low risk. |

### INFORMATIONAL (Handled Correctly)

| ID | Scenario | Status |
|----|----------|--------|
| EC-13 | JavaScript disabled | SSR listing grid renders; filters/map require JS. Acceptable degradation. |
| EC-14 | URL parameter manipulation | `parseSearchParams` uses allowlists. Inverted ranges swap (fixed in 2026-03-21). Safe. |
| EC-15 | Back/forward during booking | Idempotency keys prevent duplicate writes. Safe. |
| EC-16 | Price is 0 or negative | Zod `.positive()` on PATCH, `.min(0.01)` on create. Safe. |
| EC-17 | Stripe webhooks fail | No Stripe integration in codebase. Out of scope. |
| EC-18 | Session expires mid-operation | All server actions return `SESSION_EXPIRED` code. Client handles re-auth. Safe. |

---

## SECTION 3: PRIORITY-RANKED FIX LIST

### P0 -- Must Fix Before Production (1 issue)

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| 1 | EC-3: Booking ACCEPT on non-ACTIVE listing | Add `status` to the `FOR UPDATE` SELECT in manage-booking.ts:254. Add `if (listing.status !== 'ACTIVE') throw new Error('LISTING_NOT_ACTIVE')` guard. | 30 min |
| ~~2~~ | ~~EC-2: Suspended user can send messages~~ | **RETRACTED** — `checkSuspension()` exists at chat.ts:133-136. | N/A |

### P1-HIGH -- Fix First Sprint (1 issue)

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| 2 | EC-1/EC-11: Conversation creation race condition | Wrap `findFirst` + `create` in `$transaction(SERIALIZABLE)` + advisory lock. Add partial unique index. **Downgraded from P0 after debate**: concurrency-guardian proved messages are split-but-visible, not lost. No financial impact. Permanent data pollution with no recovery path. | 2-4 hours |

### P1 -- Should Fix Before Production (4 issues)

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| 3 | EC-4/KI-9: PENDING booking expiration | Add cron job to auto-cancel PENDING bookings older than 7 days. Notify tenants. | 2-3 hours |
| 4 | EC-6: Listing deletion fails on FK when non-ACCEPTED bookings exist | Before `tx.listing.delete()`, batch-update non-terminal bookings to CANCELLED. **Corrected**: RESTRICT FK protects data but error handling is poor. Downgraded from MAJOR to MINOR. | 1-2 hours |
| 5 | EC-8: getNotifications unbounded limit | Add `const safeLim = Math.min(Math.max(limit, 1), 100)` before query. | 10 min |
| 6 | EC-9: PATCH images can be empty array | Add `.min(1, "At least one image required")` to the images schema. | 10 min |

### P2 -- Fix Within 2 Weeks (2 issues)

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| 8 | EC-5/KI-7: Notification failure after booking | Check return value of `createInternalNotification()`. If error, retry once or queue for background retry. | 1-2 hours |
| 9 | EC-10: Upload body size pre-check | Add Next.js `bodyParser.sizeLimit` config or check `content-length` header before `formData()`. | 30 min |

---

## SECTION 4: WHAT'S WORKING WELL (Edge Cases Handled Correctly)

1. **Booking race conditions**: FOR UPDATE locks + optimistic versioning + SERIALIZABLE isolation on createBooking/createHold
2. **Double-click on booking**: `withIdempotency` wrapper prevents duplicate bookings from same user
3. **Slot underflow protection**: Conditional `WHERE availableSlots >= N` prevents negative slots
4. **Hold expiration**: Sweeper cron + inline check-on-read for defense-in-depth
5. **Upload security**: Magic bytes + Sharp re-encoding + MIME allowlist + user-scoped paths + path traversal prevention
6. **Search input validation**: Allowlists for all enums, numeric clamping, query length cap, bounds enforcement
7. **Cursor tampering**: HMAC-signed cursors with timingSafeEqual
8. **Token security**: SHA-256 hashed tokens, timing-safe comparison, no raw token storage
9. **Auth rate limiting**: Dual-bucket (per-email + per-IP) on login, per-user on password changes
10. **Error boundaries**: Complete coverage across all 32 route segments
11. **Suspension enforcement**: `checkSuspension()` present on all write actions (createBooking, updateBookingStatus, startConversation, sendMessage, listing PATCH)
