# Stability Contract: Multi-Slot & Whole-Room Booking System

> **Version**: 1.0 | **Date**: 2026-03-13 | **Status**: Active
> **Source**: Derived from `01-codebase-discovery.md` (verified inventory) + source code audit of 86 error paths

---

## How to Use This Document

- **QA engineers**: Derive test specs from Section 5 (Stability Test Matrix). Every row maps to a testable scenario with file references.
- **On-call engineers**: Use Section 3 (Error Taxonomy) to map user-reported symptoms to root causes and recovery paths.
- **Release managers**: Section 6 (Definition of Stable) is the go/no-go gate for production launches.
- **Developers**: Section 1 (Invariants) defines what must never break. Section 2 (Boundary Conditions) defines what to test when changing booking code.

---

## 1. Invariants (Must ALWAYS Be True)

Every invariant is a testable statement that must hold under normal AND concurrent operation. Organized by domain.

### 1.1 Data Integrity Invariants

| ID | Name | Source INV | Statement | Why It Matters | Enforcement | How to Test |
|----|------|-----------|-----------|----------------|-------------|-------------|
| SI-01 | Slot Capacity | INV-01 | `SUM(slotsRequested)` for ACCEPTED + active HELD bookings ≤ `totalSlots` for any listing at any time | Overbooking = two tenants assigned the same bed | `FOR UPDATE` + SUM query inside Serializable TX | Create bookings until `totalSlots` reached; next must fail with capacity error |
| SI-02 | availableSlots Accuracy | INV-02 | `availableSlots = totalSlots - SUM(ACCEPTED + active HELD slotsRequested)` | Stale counter → false availability display → user frustration or phantom bookings | Atomic decrement/restore + LEAST clamp + weekly reconciler cron | After N bookings + cancels, compare `availableSlots` to ground-truth SUM query |
| SI-03 | State Machine Integrity | INV-05 | Only transitions defined in `VALID_TRANSITIONS` map succeed; all others are rejected | Invalid states → orphaned holds, stuck bookings, unrecoverable state | `validateTransition()` called before every status UPDATE (`manage-booking.ts:110-121`) | Attempt every invalid transition (30 combos from 6 states); all must return `INVALID_STATE_TRANSITION` |
| SI-04 | Price Authority | INV-06 | Server DB price is sole source of truth; client price is advisory only | Price manipulation → financial loss for hosts | `Math.abs(clientPrice - dbPrice) > 0.01` rejection (`booking.ts:107-114`, `booking.ts:561-569`) | Submit booking with manipulated price ±$1; must fail with `PRICE_CHANGED` |
| SI-05 | PENDING Slot Neutrality | INV-11 | PENDING bookings do NOT consume slots | PENDING consuming slots → availability understated → lost revenue | No `availableSlots` decrement in `createBooking` (`booking.ts:214-225` — Booking.create only, no Listing UPDATE) | Create PENDING booking, verify `availableSlots` unchanged |
| SI-06 | HELD Immediate Consumption | INV-12 | HELD bookings consume slots at creation time | Delayed consumption → overbooking during hold window | Conditional UPDATE `availableSlots -= slotsRequested` in createHold TX (`booking.ts:655-663`) | Create hold, verify `availableSlots` decreased by `slotsRequested` |
| SI-07 | D4: HELD→ACCEPTED No Double-Count | INV-13 | HELD→ACCEPTED does NOT decrement slots again | Double-count → phantom slot consumption → false "no availability" | No decrement code at `manage-booking.ts:173` (comment: "NO slot decrement — D4") | Accept a HELD booking, verify `availableSlots` unchanged before and after |
| SI-08 | LEAST Clamp on Restore | INV-14 | All slot restores use `LEAST(availableSlots + N, totalSlots)` | Without clamp → `availableSlots > totalSlots` → impossible state, CHECK constraint violation | SQL LEAST in all 3 restore paths (`manage-booking.ts:366-370`, `manage-booking.ts:461-465`, `sweep-expired-holds/route.ts:119-123`) | Cancel after partial drift; verify `availableSlots ≤ totalSlots` always |

### 1.2 Concurrency Invariants

| ID | Source INV | Statement | Why It Matters | How to Test |
|----|-----------|-----------|----------------|-------------|
| SI-09 | INV-01 | Two simultaneous bookings for last slot: exactly one succeeds, other gets capacity error | Without serialization → overbooking | E2E RC-06: parallel pages, `Promise.all`, assert one success + one capacity error |
| SI-10 | INV-09 | TOCTOU: `FOR UPDATE` + optimistic version prevent stale-read exploits | Stale reads → concurrent modifications corrupt state | E2E RC-05: accept+cancel race; assert one wins, other gets `CONCURRENT_MODIFICATION` |
| SI-11 | INV-21 | Sweeper advisory lock: only one instance runs concurrently | Concurrent sweepers → double slot restore → `availableSlots > totalSlots` | Unit test: two concurrent sweep calls; first processes, second returns `{ skipped: true, reason: "lock_held" }` |
| SI-12 | INV-03/04 | Idempotency: same key+body = cached result; same key+different body = 400 | Without idempotency → double-bookings on retry; without hash check → key reuse attacks | E2E RC-09: verify sessionStorage key lifecycle; unit: hash mismatch returns `IDEMPOTENCY_MISMATCH` |
| SI-13 | INV-22 | Serialization conflicts (P2034) retry max 3 times with exponential backoff | Without retry → transient failures surface to users unnecessarily | Unit: mock P2034, verify 3 retries with increasing delays (50ms × attempt in booking.ts, 50 × 2^attempt in idempotency.ts) |
| SI-14 | — (new) | Hold expired mid-confirmation → ACCEPT fails cleanly with "hold has expired" | Accepting expired hold → booking without slot reservation → overbooking | E2E: create hold, wait past `heldUntil`, attempt accept; must get "This hold has expired" |

### 1.3 Authorization Invariants

| ID | Source INV | Statement | Why It Matters | How to Test |
|----|-----------|-----------|----------------|-------------|
| SI-15 | — (new) | Unauthenticated users cannot create bookings or holds | Open booking endpoint → spam, abuse, cost | E2E RC-07: anon user sees login gate + form disabled; unit: `createBooking` without session returns `SESSION_EXPIRED` |
| SI-16 | — (new) | Tenants can only cancel their own bookings | Cross-tenant cancellation → trust violation, data integrity breach | Unit: tenant A tries to cancel tenant B's booking; must fail with "Only the tenant can cancel a booking" |
| SI-17 | — (new) | Only hosts can accept/reject bookings for their listings | Non-owner accept → unauthorized state transitions | Unit: non-owner attempts accept; must fail with "Only the listing owner can accept or reject bookings" |
| SI-18 | INV-20 | Manual EXPIRED transition blocked (sweeper-only) | Manual expiry → bypass hold TTL, manipulate availability | Unit: attempt `updateBookingStatus(id, 'EXPIRED')`; must fail with `INVALID_TARGET_STATUS` |
| SI-19 | INV-19 | No PII in audit logs | PII in logs → GDPR/privacy violation, compliance risk | Unit: `stripPii()` removes all keys in `PII_KEYS` set; audit log `details` field never contains email/phone/name |

### 1.4 Hold System Invariants

| ID | Source INV | Statement | Why It Matters | How to Test |
|----|-----------|-----------|----------------|-------------|
| SI-20 | INV-15 | `MAX_HOLDS_PER_USER = 3` enforced atomically inside TX | Without limit → single user can hold-lock all listings | Unit: create 3 holds for one user; 4th must fail with `MAX_HOLDS_EXCEEDED` |
| SI-21 | INV-07 | Sweeper is primary expiry mechanism; inline check in `updateBookingStatus` is defense-in-depth | If sweeper lags, inline check prevents operating on stale holds | Unit: expired hold + `updateBookingStatus(ACCEPT)` → returns "This hold has expired" |
| SI-22 | INV-16 | WHOLE_UNIT forces `slotsRequested = totalSlots` regardless of client value | Client requesting 1 slot on WHOLE_UNIT → partial occupation of whole-unit listing | Unit: WHOLE_UNIT listing, client requests 1 slot; server overrides `effectiveSlotsRequested` to `totalSlots` |
| SI-23 | INV-17/18 | WHOLE_UNIT trigger prevents overlapping bookings; partial unique index allows re-application after rejection | Overlapping whole-unit bookings → double-occupancy; blocked re-application → user stuck | Unit: two WHOLE_UNIT bookings for overlapping dates → second fails; after first rejected → re-apply succeeds (REJECTED excluded from partial unique index) |

### 1.5 Rate Limiting Invariants

| ID | Source INV | Statement | Why It Matters | How to Test |
|----|-----------|-----------|----------------|-------------|
| SI-24 | INV-10 | Rate limiter fails closed: DB outage → deny (not allow), with degraded in-process Map fallback (10 req/min) | Open rate limiter during outage → abuse flood | Unit: mock DB error in `checkRateLimit`; verify deny response; verify degraded fallback allows up to `DEGRADED_MODE_LIMIT` then denies |
| SI-25 | — (new) | Rate limits enforced: 10/hr user booking, 30/hr IP booking, 10/hr user hold, 30/hr IP hold, 3/hr per-listing hold | Without per-operation limits → spam, hold-cycling attacks, resource exhaustion | Unit: exhaust each limit independently; next request returns `RATE_LIMITED` with appropriate message |

### 1.6 Audit & Observability Invariants

| ID | Source INV | Statement | Why It Matters | How to Test |
|----|-----------|-----------|----------------|-------------|
| SI-26 | INV-08 | Every state transition is logged atomically inside the transaction | Non-atomic audit → transitions without audit trail → unaccountable state changes | Unit: every transition path → `BookingAuditLog` row created with correct `action`, `previousStatus`, `newStatus` |
| SI-27 | INV-09 | Feature flag cross-validation prevents misconfiguration at startup | Invalid flag combos → runtime errors, undefined behavior | Unit: `WHOLE_UNIT=true + MULTI_SLOT=false` → Zod `superRefine` startup error; `SOFT_HOLDS=on + MULTI_SLOT=false` → startup error |

**Total: 27 invariants** (22 from discovery + 5 new: SI-14, SI-15, SI-16, SI-17, SI-25)

---

## 2. Boundary Conditions & Edge Cases

Organized by risk priority:
- **P0** = Blocks deployment (must be handled before any release)
- **P1** = Must fix before GA (required for production readiness)
- **P2** = Should fix (improves reliability)
- **P3** = Nice to have (polish)

### 2.1 Temporal Edge Cases

| # | Scenario | Expected Behavior | Priority | Test Approach | Existing Coverage |
|---|----------|-------------------|----------|---------------|-------------------|
| BC-01 | Hold expires at exact moment user clicks Confirm | ACCEPT returns "This hold has expired" (inline expiry at `manage-booking.ts:83-106` kicks in); sweeper may also process it | P0 | E2E: create hold, advance time past `heldUntil`, attempt accept | `manage-booking-hold.test.ts` (unit) |
| BC-02 | Booking submitted with past dates | Zod validation rejects `startDate < today` | P2 | Unit: submit with past `startDate`; expect validation error from `createBookingSchema` | `booking.test.ts` |
| BC-03 | Sweeper runs during host's ACCEPT action on same hold | Sweeper uses `FOR UPDATE SKIP LOCKED` → skips the hold if ACCEPT has it locked; ACCEPT proceeds. If sweeper locks first → ACCEPT gets `CONCURRENT_MODIFICATION` | P1 | Unit: mock concurrent sweeper + accept; verify single transition, no double restore | `manage-booking-hold.test.ts`, Risk R-10 |
| BC-04 | Client hold timer shows "expired" but server hasn't swept yet | `HoldCountdown` shows "Hold expired" gray text; server-side ACCEPT still works if `heldUntil > NOW()` on DB | P2 | E2E: verify `HoldCountdown` `onExpired` callback fires; server still accepts within server-side window | `HoldCountdown.test.tsx` |

### 2.2 Capacity Edge Cases

| # | Scenario | Expected Behavior | Priority | Existing Coverage |
|---|----------|-------------------|----------|-------------------|
| BC-05 | Last slot — two users race for it | `FOR UPDATE` serializes; first wins, second gets "Not enough available slots" | P0 | E2E RC-06, `race-condition.test.ts` |
| BC-06 | WHOLE_UNIT booking attempted when 1 slot already HELD | Capacity check includes HELD in SUM; returns "Not enough available slots" | P1 | `booking-whole-unit.test.ts` |
| BC-07 | `availableSlots = 0` but all bookings are PENDING (none ACCEPTED/HELD) | `createBooking` succeeds (PENDING capacity check only counts ACCEPTED); `createHold` fails (checks ACCEPTED + active HELD against `availableSlots`) | P1 | `booking-slots-validation.test.ts` |
| BC-08 | Cancel + re-book same slot rapidly | LEAST clamp restores correctly; new booking succeeds; idempotency key must be fresh (different key for new request) | P2 | `bookings-edge-cases.test.ts` |

### 2.3 Network & Infrastructure Edge Cases

| # | Scenario | Expected Behavior | Priority | Existing Coverage |
|---|----------|-------------------|----------|-------------------|
| BC-09 | Double-click on "Book Now" | `isSubmittingRef` + `DEBOUNCE_MS=1000` blocks second click; button disabled during submission; single booking created | P0 | E2E RC-04, `BookingForm.test.tsx` |
| BC-10 | Browser back after successful booking | `booking_submitted_` sessionStorage flag → "already submitted" message shown instead of re-submission | P1 | E2E RC-09, `BookingForm.tsx:103-110` |
| BC-11 | Page refresh during submission (`isLoading=true`) | `beforeunload` warning shown; if refresh happens, idempotency key in sessionStorage enables safe retry | P1 | `BookingForm.tsx:113-125` |
| BC-12 | Serialization conflict (Prisma P2034) | Retry up to 3 times with exponential backoff; if exhausted, return "Failed to create booking. Please try again." | P1 | `race-condition.test.ts`, `idempotency.test.ts` |
| BC-13 | Rate limit DB unreachable | Degraded in-process Map fallback (`DEGRADED_MODE_LIMIT=10` req/min); fail-closed when Map exhausted | P1 | `booking-rate-limit.test.ts` |

### 2.4 User Behavior Edge Cases

| # | Scenario | Expected Behavior | Priority | Existing Coverage |
|---|----------|-------------------|----------|-------------------|
| BC-14 | User opens multiple tabs, books same listing+dates in both | Partial unique index `idx_booking_active_unique` rejects second; duplicate check in TX also catches it | P0 | E2E RC-03 (J24), `bookings-edge-cases.test.ts` |
| BC-15 | Blocked user attempts to book | `checkBlockBeforeAction()` returns "Unable to book this listing" | P1 | `bookings-edge-cases.test.ts` |
| BC-16 | User tries to book own listing | Guard returns "You cannot book your own listing." (`booking.ts:127-132`) | P2 | `booking.test.ts` |
| BC-17 | 4th hold attempt (max = 3) | Returns "You can have at most 3 active holds at a time." with code `MAX_HOLDS_EXCEEDED` | P1 | `booking-hold.test.ts` |

---

## 3. Error Taxonomy

Consolidated from 86 error paths across 6 files into a deduplicated reference table. Grouped by HTTP status equivalent.

### 3.1 Authentication Errors (401)

| Error Code | HTTP | User Message | Internal Cause | Recovery Path | Test File |
|-----------|------|-------------|----------------|---------------|-----------|
| `SESSION_EXPIRED` | 401 | "You must be logged in to book" | No valid session in `auth()` | Redirect to login; re-authenticate | `booking.test.ts` |
| `SESSION_EXPIRED` | 401 | "You must be logged in to place a hold" | No valid session in `auth()` for hold path | Redirect to login; re-authenticate | `booking-hold.test.ts` |
| `SESSION_EXPIRED` | 401 | "Unauthorized" | No valid session in `updateBookingStatus` or `getMyBookings` | Redirect to login; re-authenticate | `manage-booking.test.ts` |

### 3.2 Forbidden Errors (403)

| Error Code | HTTP | User Message | Internal Cause | Recovery Path | Test File |
|-----------|------|-------------|----------------|---------------|-----------|
| — | 403 | "Account suspended" | `checkSuspension()` returns `suspended: true` | Contact support to resolve suspension | `booking.test.ts` |
| — | 403 | "Please verify your email to book" | `checkEmailVerified()` returns `verified: false` | Complete email verification flow | `booking.test.ts` |
| — | 403 | "You cannot book your own listing." | `listing.ownerId === userId` | Book a different listing | `booking.test.ts` |
| — | 403 | "Unable to book this listing" | `checkBlockBeforeAction()` returns `allowed: false` (blocked user) | N/A — block is intentional | `bookings-edge-cases.test.ts` |
| `FEATURE_DISABLED` | 403 | "Multi-slot booking is not currently available." | `slotsRequested > 1` but `features.multiSlotBooking` is false | Wait for feature enablement or book single slot | `booking.test.ts` |
| `FEATURE_DISABLED` | 403 | "Hold feature is not currently available." | `features.softHoldsEnabled` is false/drain | Wait for feature enablement or use standard booking | `booking-hold.test.ts` |
| `UNAUTHORIZED` | 403 | "Only the listing owner can accept or reject bookings" | Non-owner attempts accept/reject; TOCTOU re-check inside TX | Only listing owner can perform this action | `manage-booking.test.ts` |
| — | 403 | "Only the tenant can cancel a booking" | Non-tenant attempts cancel | Only booking tenant can cancel | `manage-booking.test.ts` |

### 3.3 Rate Limited Errors (429)

| Error Code | HTTP | User Message | Internal Cause | Recovery Path | Test File |
|-----------|------|-------------|----------------|---------------|-----------|
| `RATE_LIMITED` | 429 | "Too many booking requests. Please wait before trying again." | User booking limit (10/hr) or IP limit (30/hr) exceeded | Wait for window reset (`retryAfter` seconds) | `booking-rate-limit.test.ts` |
| `RATE_LIMITED` | 429 | "Too many hold requests. Please wait before trying again." | User hold limit (10/hr) or IP hold limit (30/hr) exceeded | Wait for window reset | `booking-rate-limit.test.ts` |
| `RATE_LIMITED` | 429 | "Too many hold attempts on this listing. Please wait." | Per-listing hold limit (3/hr per user+listing) exceeded | Wait for window reset; anti-cycling protection | `booking-rate-limit.test.ts` |
| — | 429 | "Too many requests. Please wait." | `updateBookingStatus` rate limit (30/min) exceeded | Wait for window reset | `manage-booking.test.ts` |

### 3.4 Validation Errors (400)

| Error Code | HTTP | User Message | Internal Cause | Recovery Path | Test File |
|-----------|------|-------------|----------------|---------------|-----------|
| — | 400 | Zod validation message (dynamic) | `createBookingSchema.parse()` fails — invalid dates, missing fields, `slotsRequested < 1` | Fix form inputs per `fieldErrors` map | `booking.test.ts` |
| — | 400 | Zod validation message (dynamic) | `createHoldSchema.parse()` fails | Fix form inputs per `fieldErrors` map | `booking-hold.test.ts` |
| `PRICE_CHANGED` | 400 | "The listing price has changed. Please review the updated price and try again." | `Math.abs(clientPrice - dbPrice) > 0.01` | Refresh page to get current price; `currentPrice` returned in response | `booking.test.ts`, `bookings-edge-cases.test.ts` |
| `INVALID_TARGET_STATUS` | 400 | "Cannot manually expire bookings" | Caller attempts `status = 'EXPIRED'` via API | EXPIRED is system-only (sweeper); use CANCELLED instead | `manage-booking.test.ts` |
| `INVALID_STATE_TRANSITION` | 400 | "Cannot change booking from {FROM} to {TO}" | `validateTransition()` rejects transition not in `VALID_TRANSITIONS` | Check allowed transitions for current state | `booking-state-machine.test.ts` |
| `IDEMPOTENCY_MISMATCH` | 400 | "Idempotency key reused with different request body" | SHA-256 hash of request body doesn't match stored hash for key | Generate new idempotency key for different request | `idempotency.test.ts` |
| — | 400 | "Invalid booking data" / "Invalid hold data" | Non-Zod exception during validation | Retry with corrected data | `booking.test.ts` |

### 3.5 Not Found Errors (404)

| Error Code | HTTP | User Message | Internal Cause | Recovery Path | Test File |
|-----------|------|-------------|----------------|---------------|-----------|
| — | 404 | "Listing not found" | `FOR UPDATE` query returns no rows for `listingId` | Verify listing ID; listing may have been deleted | `booking.test.ts` |
| — | 404 | "Booking not found" | `prisma.booking.findUnique()` returns null for `bookingId` | Verify booking ID; booking may have been deleted | `manage-booking.test.ts` |
| — | 404 | "Listing owner not found" | Owner `User` row missing for `listing.ownerId` | Data integrity issue; contact support | `booking.test.ts` |

### 3.6 Conflict Errors (409)

| Error Code | HTTP | User Message | Internal Cause | Recovery Path | Test File |
|-----------|------|-------------|----------------|---------------|-----------|
| — | 409 | "You already have a booking request for these exact dates." | Duplicate check finds existing PENDING/ACCEPTED/HELD booking | View existing booking; cancel if needed | `booking.test.ts` |
| — | 409 | "Not enough available slots. {N} of {M} slots available." | SUM capacity check exceeds `totalSlots` | Reduce `slotsRequested` or choose different dates | `booking-slots-validation.test.ts` |
| — | 409 | "You already have a booking request for overlapping dates." | User overlap check finds active booking for overlapping date range | Cancel existing booking first | `booking.test.ts` |
| `MAX_HOLDS_EXCEEDED` | 409 | "You can have at most 3 active holds at a time." | COUNT of active holds ≥ `MAX_HOLDS_PER_USER` | Wait for existing holds to expire or cancel one | `booking-hold.test.ts` |
| `CONCURRENT_MODIFICATION` | 409 | "Booking was modified by another request. Please refresh and try again." | Optimistic version check fails (`updateResult.count === 0`) | Refresh page and retry | `manage-booking.test.ts` |
| `CONCURRENT_MODIFICATION` | 409 | "This hold has expired or was modified. Please refresh and try again." | HELD→ACCEPTED version check fails (concurrent sweeper or cancel) | Refresh page; hold may have expired | `manage-booking-hold.test.ts` |
| `DUPLICATE_HOLD` | 409 | "You already have an active hold for overlapping dates on this listing." | Duplicate hold check finds existing PENDING/HELD/ACCEPTED with overlap | Cancel existing hold first | `booking-hold.test.ts` |
| — | 409 | "No available slots for this listing." | `availableSlots < effectiveSlotsRequested` (defense-in-depth guard) or conditional UPDATE returns 0 rows | Wait for cancellations/expirations | `booking-hold.test.ts` |
| — | 409 | "Cannot accept: all slots for these dates are already booked" | PENDING→ACCEPTED capacity re-check fails (`CAPACITY_EXCEEDED`) | Wait for cancellations/expirations | `manage-booking.test.ts` |
| — | 409 | "Cannot accept: overlapping booking exists for this whole-unit listing" | PL/pgSQL `check_whole_unit_overlap()` trigger raises exception | Wait for conflicting booking to be cancelled/rejected | `manage-booking-whole-unit.test.ts` |
| — | 409 | "Cannot place hold: overlapping booking exists for this whole-unit listing" | WHOLE_UNIT_OVERLAP trigger on hold creation | Wait for conflicting booking to be cancelled/rejected | `booking-whole-unit.test.ts` |
| — | 409 | "No available slots for this listing" / `SLOT_UNDERFLOW` | Conditional UPDATE `WHERE availableSlots >= slotsToDecrement` returns 0 | Refresh page; slots were consumed between checks | `manage-booking.test.ts` |

### 3.7 Gone Errors (410)

| Error Code | HTTP | User Message | Internal Cause | Recovery Path | Test File |
|-----------|------|-------------|----------------|---------------|-----------|
| — | 410 | "This hold has expired." | Inline expiry: `heldUntil < NOW()` detected in `updateBookingStatus` read path | Create new hold if slots available | `manage-booking-hold.test.ts` |
| — | 410 | "This hold has expired. The booking has been automatically released." | HELD→ACCEPTED but `heldUntil` already past | Create new hold if slots available | `manage-booking-hold.test.ts` |

### 3.8 Server Errors (500)

| Error Code | HTTP | User Message | Internal Cause | Recovery Path | Test File |
|-----------|------|-------------|----------------|---------------|-----------|
| — | 500 | "Failed to create booking. Please try again." | Unhandled exception in `createBooking` TX (non-P2034) | Retry; if persistent, contact support | `booking.test.ts` |
| — | 500 | "Failed to create booking after multiple attempts." | P2034 retry exhaustion (3 attempts) | Retry later; high contention period | `race-condition.test.ts` |
| — | 500 | "Failed to create hold. Please try again." | Unhandled exception in `createHold` TX | Retry; if persistent, contact support | `booking-hold.test.ts` |
| — | 500 | "Failed to create hold after multiple attempts." | P2034 retry exhaustion for holds | Retry later; high contention period | `race-condition.test.ts` |
| `IDEMPOTENCY_ERROR` | 500 | "Failed to acquire idempotency lock" | Idempotency key row missing after INSERT ON CONFLICT (should never happen) | Retry with new idempotency key | `idempotency.test.ts` |
| — | 500 | "Failed to update booking status" | Unhandled exception in `updateBookingStatus` | Retry; if persistent, contact support | `manage-booking.test.ts` |
| — | 500 | "Sweeper failed" | Transaction failure in sweep-expired-holds cron | Auto-retries on next cron invocation (1-2 min) | `sweep-expired-holds.test.ts` |
| — | 500 | "Reconciler failed" | Transaction failure in reconcile-slots cron | Auto-retries on next cron invocation (weekly) | `reconcile-slots.test.ts` |
| — | 500 | "Cached result data missing" | Idempotency key completed but `resultData` is null | Retry with new idempotency key | `idempotency.test.ts` |

---

## 4. Performance Baselines

Based on system characteristics: Serializable isolation, `FOR UPDATE` locks, advisory locks, SUM queries, audit logging inside TX.

| Operation | P50 Target | P95 Target | P99 Target | Max | Primary Bottleneck |
|-----------|-----------|-----------|-----------|-----|-------------------|
| `createBooking` (→ PENDING) | <300ms | <800ms | <1.5s | 5s | Serializable TX + FOR UPDATE + SUM + duplicate check + audit |
| `createHold` (→ HELD) | <300ms | <800ms | <1.5s | 5s | Serializable TX + FOR UPDATE + SUM + slot decrement + audit |
| `updateBookingStatus` (ACCEPT) | <200ms | <500ms | <1s | 3s | FOR UPDATE + version check + conditional decrement + audit |
| `updateBookingStatus` (CANCEL) | <200ms | <500ms | <1s | 3s | FOR UPDATE + LEAST restore + version check + audit |
| `updateBookingStatus` (REJECT) | <200ms | <500ms | <1s | 3s | FOR UPDATE + conditional LEAST restore + version check + audit |
| `getMyBookings` | <100ms | <300ms | <500ms | 1s | Prisma query with includes (listing, tenant, location, owner) |
| `sweep-expired-holds` (per batch) | <500ms | <1s | <2s | 5s | Advisory lock + 100-row batch + FOR UPDATE SKIP LOCKED + restores |
| `reconcile-slots` | <1s | <3s | <5s | 10s | Full table scan + SUM comparison + conditional fixes |
| `GET /api/bookings/[id]/audit` | <100ms | <300ms | <500ms | 1s | Index scan on `bookingId` + `createdAt` |

**Note**: These are design-informed targets, not measured baselines. No existing performance benchmarks exist in the codebase. Phase 3 should establish actual measurements under simulated load.

---

## 5. Stability Test Matrix

### Tier 1 — Smoke Tests (Deployment Gate)

Must pass before any deployment. Failure = blocked release.

| # | Test | Validates | Existing Coverage | File |
|---|------|-----------|-------------------|------|
| T1-01 | Create single-slot booking E2E | SI-01, SI-05 | YES | `tests/e2e/journeys/05-booking.spec.ts` |
| T1-02 | Create hold E2E | SI-06, SI-20 | YES | `tests/e2e/journeys/05-booking.spec.ts` |
| T1-03 | Cancel booking E2E | SI-08 | YES | `tests/e2e/journeys/21-booking-lifecycle.spec.ts` (J23) |
| T1-04 | Search shows available rooms | SI-02 | YES | Other search specs |
| T1-05 | Unauthenticated user blocked | SI-15 | YES | `tests/e2e/booking/booking-race-conditions.spec.ts` (RC-07) |
| T1-06 | State machine rejects invalid transition | SI-03 | YES | `src/__tests__/lib/booking-state-machine.test.ts` |

### Tier 2 — Core Business Logic (Pre-Production Gate)

Must pass before production release. Covers all critical booking invariants.

| # | Test | Validates | Existing Coverage | File |
|---|------|-----------|-------------------|------|
| T2-01 | All valid state transitions succeed | SI-03 | YES | `src/__tests__/lib/booking-state-machine.test.ts` |
| T2-02 | All invalid transitions rejected (30 combos) | SI-03 | YES | `src/__tests__/lib/booking-state-machine.test.ts` |
| T2-03 | Concurrent last-slot race — one wins, one fails | SI-09 | YES | RC-06, `src/__tests__/booking/race-condition.test.ts` |
| T2-04 | Hold expiration releases slots via sweeper | SI-21, SI-08 | YES | `src/__tests__/api/cron/sweep-expired-holds.test.ts` |
| T2-05 | WHOLE_UNIT locks all slots atomically | SI-22 | YES | `src/__tests__/actions/booking-whole-unit.test.ts` |
| T2-06 | Price validation rejects tampered price | SI-04 | YES | `src/__tests__/actions/booking.test.ts` |
| T2-07 | Cancellation restores correct slot count | SI-08 | YES | `src/__tests__/actions/manage-booking.test.ts` |
| T2-08 | Idempotency: duplicate submission returns cached result | SI-12 | YES | `src/__tests__/booking/idempotency.test.ts` |
| T2-09 | MAX_HOLDS_PER_USER enforced at 3 | SI-20 | YES | `src/__tests__/actions/booking-hold.test.ts` |
| T2-10 | Audit log created for every transition | SI-26 | YES | `src/__tests__/lib/booking-audit.test.ts` |
| T2-11 | PII stripped from audit details | SI-19 | YES | `src/__tests__/lib/booking-audit.test.ts` |
| T2-12 | Rate limiting enforced (all 5 booking/hold limits) | SI-25 | YES | `src/__tests__/actions/booking-rate-limit.test.ts` |
| T2-13 | Slot reconciler detects and fixes drift (delta ≤ 5) | SI-02 | YES | `src/__tests__/api/cron/reconcile-slots.test.ts` |
| T2-14 | Feature flag cross-validation rejects invalid combos | SI-27 | YES | `src/__tests__/lib/env-feature-flags.test.ts` |

### Tier 3 — Edge Cases & Resilience (Production-Ready Gate)

Must pass for production readiness. Covers boundary conditions and resilience.

| # | Test | Validates | Existing Coverage | File | Gap? |
|---|------|-----------|-------------------|------|------|
| T3-01 | Double-click protection (single booking created) | BC-09 | YES | RC-04 | — |
| T3-02 | Multi-tab booking conflict (second rejected) | BC-14 | YES | RC-03, J24 | — |
| T3-03 | Browser back after success → "already submitted" | BC-10 | PARTIAL | RC-09 (sessionStorage only) | Need E2E: back button navigation → verify "already submitted" message rendered |
| T3-04 | Accept+cancel race (host vs tenant) — one wins | SI-10 | YES | RC-05 | — |
| T3-05 | Hold expires during confirmation → ACCEPT fails | SI-14 | YES (unit) | `manage-booking-hold.test.ts` | Need E2E with real timer advancement |
| T3-06 | Blocked user booking attempt rejected | BC-15 | YES | `bookings-edge-cases.test.ts` | — |
| T3-07 | WHOLE_UNIT + PER_SLOT overlap race | SI-23 | YES (unit) | `whole-unit-concurrent.test.ts` | No E2E coverage |
| T3-08 | Error messages user-friendly (no stack traces) | Section 3 | PARTIAL | RC-08 | Need E2E: trigger each error category → verify `[role="alert"]` text contains user message, not stack trace |
| T3-09 | HoldCountdown urgency transitions (green→amber→red→gray) | SI-21 | YES | `HoldCountdown.test.tsx` | — |
| T3-10 | Serialization retry exhaustion returns user-friendly error | SI-13 | YES (unit) | `race-condition.test.ts` | — |

### Tier 4 — Performance & Scale (High-Traffic Gate)

Required for high-traffic readiness. Major gaps exist.

| # | Test | Validates | Existing Coverage | Gap? |
|---|------|-----------|-------------------|------|
| T4-01 | Response times within P95 baselines (Section 4) | Section 4 | NO | Need: k6/Artillery load test measuring all endpoints |
| T4-02 | 10 concurrent booking attempts — correct winner/loser | SI-09 | NO | Need: load test with 10 concurrent virtual users on same listing |
| T4-03 | Sweeper handles 100 expired holds per batch | SI-11 | YES (unit) | `sweep-expired-holds.test.ts` (mocked, not under load) |
| T4-04 | Rate limiter under sustained load — degraded mode works | SI-24 | NO | Need: load test saturating rate limits, verify degraded fallback |

### Coverage Summary

| Tier | Description | Covered | Total | Coverage |
|------|-------------|---------|-------|----------|
| Tier 1 | Smoke Tests (deployment gate) | 6 | 6 | **100%** |
| Tier 2 | Core Business Logic (pre-production gate) | 14 | 14 | **100%** |
| Tier 3 | Edge Cases & Resilience (production-ready gate) | 7 complete + 3 partial | 10 | **70% complete, 100% partial** |
| Tier 4 | Performance & Scale (high-traffic gate) | 1 | 4 | **25%** |

**Key gaps**:
- T3-03, T3-05, T3-07, T3-08: Need E2E tests for browser-back, hold-expiry-with-timer, WHOLE_UNIT E2E race, and error message validation
- T4-01, T4-02, T4-04: No load/performance testing infrastructure exists

---

## 6. Definition of "Stable"

### STABLE (Required for Any Release)

The booking system is **STABLE** when ALL of the following hold:

1. **All 27 invariants** (SI-01 through SI-27) hold under normal AND concurrent operation
2. **All Tier 1 and Tier 2 tests** pass with 100% reliability (0 flakes across 10 consecutive CI runs)
3. **All Tier 3 tests** pass with ≥95% reliability (≤1 flake per 20 runs)
4. **All error scenarios** from Section 3 produce correct user-facing messages (never raw errors, never unhandled 500 shown to user)
5. **All P0 and P1 edge cases** from Section 2 are handled with tested mitigations
6. **State machine**: no invalid state reached in any test run (every booking ends in a valid `VALID_TRANSITIONS` state)
7. **Slot accounting**: `availableSlots` matches ground-truth `SUM(slotsRequested)` query after full test suite completion
8. **Zero orphaned holds** remain after test cleanup (all HELD with `heldUntil <= NOW()` → EXPIRED by sweeper or inline expiry)

### PRODUCTION-READY (Required for GA Launch)

Production-ready additionally requires:

9. **Performance baselines** from Section 4 met under simulated load (P95 targets with ≥10 concurrent users)
10. **All Tier 1-3 tests** passing (Tier 4 T4-03 also required; T4-01/T4-02/T4-04 recommended)
11. **Zero P0/P1 open issues** in the risk register (Section 11 of discovery document)
12. **Sweeper cron confirmed running** in target environment (verified via `sweep_expired_holds_complete` log events)
13. **Sentry alerts configured** for:
    - Slot drift detected with delta > 5 (`[reconcile-slots] Large slot drift detected`)
    - Serialization retry exhaustion (`Serialization failed after 3 attempts`)
    - Rate limit degraded mode activation (`[RateLimit] Degraded mode active`)
14. **Rollback procedure documented**: Feature flags can disable `SOFT_HOLDS` (set to "drain" mode to wind down holds gracefully) and `WHOLE_UNIT` independently without data loss

---

## Appendix A: Cross-Reference Tables

### Invariant → Test Mapping

| Invariant | Primary Test | Secondary Test |
|-----------|-------------|----------------|
| SI-01 | T2-03, T2-05 | `booking-slots-validation.test.ts` |
| SI-02 | T2-07, T2-13 | `reconcile-slots.test.ts` |
| SI-03 | T2-01, T2-02 | T1-06 |
| SI-04 | T2-06 | `bookings-edge-cases.test.ts` |
| SI-05 | T1-01 | `booking-slots-validation.test.ts` |
| SI-06 | T1-02 | `booking-hold.test.ts` |
| SI-07 | — | `manage-booking-hold.test.ts` |
| SI-08 | T2-07 | `manage-booking.test.ts`, `sweep-expired-holds.test.ts` |
| SI-09 | T2-03 | RC-06 |
| SI-10 | T3-04 | RC-05 |
| SI-11 | — | `sweep-expired-holds.test.ts` |
| SI-12 | T2-08 | RC-09, `idempotency.test.ts` |
| SI-13 | T3-10 | `race-condition.test.ts` |
| SI-14 | T3-05 | `manage-booking-hold.test.ts` |
| SI-15 | T1-05 | RC-07 |
| SI-16 | — | `manage-booking.test.ts` |
| SI-17 | — | `manage-booking.test.ts` |
| SI-18 | — | `manage-booking.test.ts` |
| SI-19 | T2-11 | `booking-audit.test.ts` |
| SI-20 | T2-09 | `booking-hold.test.ts` |
| SI-21 | T2-04 | `manage-booking-hold.test.ts` |
| SI-22 | T2-05 | `booking-whole-unit.test.ts` |
| SI-23 | T3-07 | `whole-unit-concurrent.test.ts` |
| SI-24 | — | `booking-rate-limit.test.ts` |
| SI-25 | T2-12 | `booking-rate-limit.test.ts` |
| SI-26 | T2-10 | `booking-audit.test.ts` |
| SI-27 | T2-14 | `env-feature-flags.test.ts` |

### Risk Register → Invariant Mapping

| Risk | Related Invariants | Mitigation Status |
|------|--------------------|-------------------|
| R-01 (Sweeper stops) | SI-21, SI-14 | Mitigated: inline expiry defense-in-depth |
| R-02 (Clock skew) | SI-06, SI-14 | Mitigated: all time comparisons use `NOW()` in SQL |
| R-03 (Slot drift) | SI-02, SI-08 | Mitigated: reconciler cron + LEAST clamp |
| R-04 (Rate limit DB outage) | SI-24 | Mitigated: degraded in-process Map fallback |
| R-05 (WHOLE_UNIT trigger bypass) | SI-22, SI-23 | Mitigated: defense-in-depth (trigger + app checks) |
| R-06 (Stale heldUntil on client) | SI-14, SI-21 | Partially mitigated: inline expiry + HoldCountdown |
| R-07 (IdempotencyKey growth) | SI-12 | Accepted: 24hr expiry, no cleanup cron |
| R-08 (Notification failure) | SI-26 | Accepted: side effects outside TX |
| R-09 (Feature flag misconfig) | SI-27 | Mitigated: Zod `superRefine()` cross-validation |
| R-10 (Sweeper+inline double-restore) | SI-08, SI-11 | Mitigated: SKIP LOCKED + version check + LEAST clamp |
| R-11 (No notification backpressure) | — | Accepted: fire-and-forget with try/catch |
| R-12 (Client hold timer drift) | SI-21 | Accepted: server `heldUntil` is source of truth |
