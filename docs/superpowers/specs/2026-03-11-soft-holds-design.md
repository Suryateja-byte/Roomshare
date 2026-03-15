# Phase 4: Soft Holds — Design Specification

**Date**: 2026-03-11
**Status**: Draft (v4 — reviewed by 5 specialized agents)
**Approach**: Schema-First, Code-Layers (Approach B)
**Depends on**: Phase 3 (Whole-Place Booking Mode) — complete in worktree

## Overview

Soft Holds replace the current PENDING (apply-and-wait) model with HELD (first-come-first-served with TTL). When an applicant applies, a time-bounded hold is created that **immediately decrements inventory**. The host must accept or reject within the TTL window, or the hold expires and inventory is released.

This is a fundamental inversion of inventory semantics: HELD decrements slots at creation (optimistic reservation), while the current PENDING model decrements at acceptance.

## Feature Flag

Three-state flag for safe rollout and rollback:

```typescript
// src/lib/env.ts — add to serverEnvSchema:
// ENABLE_SOFT_HOLDS: z.enum(["on", "drain", "off"]).optional().default("off")
// Expose via features object or dedicated getter function.
ENABLE_SOFT_HOLDS: "on" | "drain" | "off"
```

- **`off`** (default): Current PENDING behavior. No HELD status, no TTL, no sweeper.
- **`on`**: New HELD behavior. `createBooking` produces HELD status, TTL countdown starts, sweeper runs.
- **`drain`**: Stop creating new HELD bookings (fall back to PENDING), but continue sweeping existing holds until they all expire/resolve. Accept/reject/cancel for existing HELD bookings work identically in `drain` mode as in `on` mode — `drain` only affects `createBooking`. Used during rollback to safely wind down.

Code paths check the flag at:
1. `createBooking` — HELD vs PENDING path selection (server-side, reads env directly)
2. Sweeper cron — runs when `on` or `drain` (server-side, reads env directly)
3. UI — show HoldCountdown only when `on` (client components receive the flag as a prop from server components, NOT via `NEXT_PUBLIC_*` env var — this keeps the flag server-controlled and avoids client-side env leakage)

**Deployment ordering constraint**: All HELD-specific code branches (state machine, manage-booking branches, sweeper) must be deployed BEFORE the flag is switched to `on`. The code must handle HELD bookings in all paths (accept/reject/cancel/sweep) before any HELD bookings can be created. The flag change is the last step.

### Mixed PENDING + HELD Transition Period

During the `off` → `on` transition, a listing may have existing PENDING bookings alongside new HELD bookings. These use different inventory semantics:

- PENDING bookings do NOT decrement `availableSlots` at creation — they are phantom demand
- HELD bookings DO decrement `availableSlots` at creation — they are committed demand

**Consequence**: `availableSlots` reflects only HELD (committed) demand, not PENDING (phantom) demand. A HELD applicant may see "3 spots available" when 2 PENDING applications are also waiting. If the host accepts the PENDING applicants first, the HELD applicant's slot is consumed.

**Accepted risk**: This is a transient edge case that only occurs during the transition window. The hold is an optimistic reservation, not a guarantee — the host can still reject. The correct long-term fix is to fully migrate to HELD semantics (Phase 5 reconciliation). During transition:
- The HELD applicant's slot IS reserved in `availableSlots`
- The host cannot accept more bookings than `totalSlots` (both paths check capacity)
- The worst case is that a HELD hold gets rejected after the host accepts PENDING applicants that fill remaining capacity
- No inventory corruption occurs — the HELD rejection releases the slot correctly

## Section 1: Schema + State Machine + Feature Flag

### Schema Changes

**Note on existing schema state**: The worktree branch already has HELD/EXPIRED enum values, `heldUntil`/`heldAt`/`slotsRequested` columns on Booking, `holdTtlMinutes` on Listing, and `BOOKING_HOLD_REQUEST`/`BOOKING_HOLD_EXPIRED` notification types from Phase 1/2/3 prep work. Phase 4's migration adds: partial indexes, the unique constraint change, and any missing pieces not yet applied.

**BookingStatus enum** (already in worktree):

```prisma
enum BookingStatus {
  PENDING
  HELD      // active time-bounded hold
  ACCEPTED
  REJECTED
  CANCELLED
  EXPIRED   // hold that timed out
}
```

**NotificationType enum** (already in worktree):

```prisma
enum NotificationType {
  // ... existing values ...
  BOOKING_HOLD_REQUEST   // host receives when hold is placed
  BOOKING_HOLD_EXPIRED   // applicant receives when hold expires
}
```

The TypeScript `NotificationType` union in `src/lib/notifications.ts` must also be updated to include these values, along with the email preference map.

**Listing model** — `holdTtlMinutes` already exists (worktree):

```prisma
model Listing {
  // ... existing fields ...
  holdTtlMinutes Int  @default(15)  @map("hold_ttl_minutes")  // CHECK(5-60)
}
```

**Booking model** — columns already exist (worktree):

```prisma
model Booking {
  // ... existing fields ...
  heldUntil      DateTime?   // server-computed: createdAt + listing.holdTtlMinutes
  heldAt         DateTime?   // timestamp when hold was placed
  slotsRequested Int         @default(1)  // slots this booking claims
}
```

**Unique constraint change** — the current `@@unique([tenantId, listingId, startDate, endDate])` blocks re-application after hold expiry or rejection. Replace with a partial unique index that only constrains active bookings:

```sql
-- Drop the existing Prisma-managed unique constraint
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_tenantId_listingId_startDate_endDate_key";

-- Add partial unique index: only one active booking per tenant+listing+dates
CREATE UNIQUE INDEX idx_booking_active_unique
ON "Booking" ("tenantId", "listingId", "startDate", "endDate")
WHERE status IN ('PENDING', 'HELD', 'ACCEPTED');
```

This allows users to re-apply after their hold expires (EXPIRED), is rejected (REJECTED), or is cancelled (CANCELLED), while still preventing duplicate active bookings.

**Important**: Remove the `@@unique([tenantId, listingId, startDate, endDate])` directive from `schema.prisma` to prevent Prisma from recreating the full constraint on next `prisma migrate dev`. The partial index is managed via raw SQL in the migration only.

**Migration notes**:
- Add two partial indexes:
  - Sweeper index: `CREATE INDEX idx_booking_held_expiry ON "Booking" ("heldUntil") WHERE status = 'HELD'` — optimizes sweeper's WHERE clause (scans all listings)
  - Per-listing ghost-hold index: `CREATE INDEX idx_booking_held_by_listing ON "Booking" ("listingId", "heldUntil") WHERE status = 'HELD'` — optimizes ghost-hold LEFT JOIN per listing
- **Rollback note**: Columns (`heldUntil`, `heldAt`, `slotsRequested`) are droppable. Indexes are droppable. **Enum values (HELD, EXPIRED) are IRREVERSIBLE in PostgreSQL** — they cannot be removed once added. The three-state feature flag (`drain` → `off`) compensates at the application layer for rollback scenarios.
- **Existing DB constraints**: The database already has `CHECK ("availableSlots" >= 0)` and `CHECK ("availableSlots" <= "totalSlots")`. These serve as backstops. Application code uses GREATEST(0)/LEAST(totalSlots) clamps to avoid hitting the constraint, but if a clamped value indicates a lost-update bug (e.g., `availableSlots` would go negative), log a warning before clamping so the anomaly is detectable.

### State Machine Updates

Add to `VALID_TRANSITIONS` in `src/lib/booking-state-machine.ts`:

```
HELD → ACCEPTED    (host accepts within TTL)
HELD → REJECTED    (host rejects within TTL)
HELD → CANCELLED   (applicant cancels)
HELD → EXPIRED     (sweeper: heldUntil < NOW())

EXPIRED → []        (terminal state, no transitions out)

PENDING → ACCEPTED   (existing, unchanged)
PENDING → REJECTED   (existing, unchanged)
PENDING → CANCELLED  (existing, unchanged)

ACCEPTED → CANCELLED  (existing, unchanged — works for both PENDING-origin and HELD-origin bookings)
```

The TypeScript `BookingStatus` union type must be updated to include `'HELD' | 'EXPIRED'`. The `isTerminalStatus` function must return `true` for `EXPIRED`.

**Important**: `updateBookingStatus` must explicitly reject `EXPIRED` as a caller-supplied target status. Only the sweeper's direct SQL CTE should ever set `EXPIRED`. Add an early guard: `if (targetStatus === 'EXPIRED') return { error: 'invalid_target_status' }` before `validateTransition`.

Note on `ACCEPTED → CANCELLED`: This existing transition is preserved. For bookings that originated as HELD, inventory was already decremented at hold creation and not changed at acceptance. Therefore, cancelling an accepted booking must release inventory using `slotsRequested` from the booking record (NOT hardcoded `+1`). Update the existing cancel-after-accept path in `manage-booking.ts` to read `booking.slotsRequested` instead of using `decrement: 1`. This applies to both PENDING-origin and HELD-origin bookings (PENDING bookings default to `slotsRequested = 1`, so the behavior is unchanged).

### Inventory Semantics (Inverted)

| Event | PENDING (current) | HELD (new) |
|-------|-------------------|------------|
| Apply/Create | No slot change | `availableSlots -= slotsRequested` |
| Accept | `availableSlots -= slotsRequested` | No change (already decremented) |
| Reject | No change | `availableSlots += slotsRequested` |
| Cancel | No change | `availableSlots += slotsRequested` |
| Expire | N/A | `availableSlots += slotsRequested` (via sweeper) |
| Cancel after Accept | `availableSlots += slotsRequested` | `availableSlots += slotsRequested` |

Note: The PENDING accept row above is updated from hardcoded `-1` to `slotsRequested` for consistency. Existing PENDING bookings have `slotsRequested = 1` (DB default), so behavior is unchanged.

Critical invariant: `availableSlots` must never go below 0 or above `totalSlots`. All mutations use `LEAST`/`GREATEST` clamping. The DB has CHECK constraints as backstops.

## Section 2: createBooking HELD Path

### Function Signature

The existing `createBooking` signature in `src/app/actions/booking.ts` is:
```typescript
createBooking(listingId, startDate, endDate, pricePerMonth, idempotencyKey?)
```

For the HELD path, we add `slotsRequested` as an optional parameter (defaults to 1):
```typescript
createBooking(listingId, startDate, endDate, pricePerMonth, idempotencyKey?, slotsRequested = 1)
```

The date and price parameters are retained — holds still reference a time period and price.

**Input validation**: Add `slotsRequested` to `createBookingSchema` in `src/lib/schemas.ts`:
```typescript
slotsRequested: z.number().int().min(1).max(20).optional().default(1)
```
This validates BEFORE the transaction is entered, preventing negative/zero values from corrupting inventory. The `.max(20)` matches the maximum reasonable `totalSlots`. The actual `<= listing.totalSlots` check happens inside the transaction after reading the listing.

### Idempotency Strategy

The HELD path continues to use the existing `withIdempotency` wrapper (via the `IdempotencyKey` table) for network retry safety. Additionally, inside the transaction, a deduplication check queries for an existing `status IN ('HELD', 'PENDING', 'ACCEPTED')` booking for the same tenant+listing+dates. If found, the existing booking is returned (double-click prevention). Including `ACCEPTED` in the check prevents raw DB constraint errors from the partial unique index and provides a clean error message instead.

### Flow

```
User clicks "Apply"
  → createBooking(listingId, startDate, endDate, pricePerMonth, idempotencyKey, slotsRequested)
    → Zod schema validation (slotsRequested validated here)
    → Auth check
    → Rate limit check: checkRateLimit(userId, 'createBooking')
    → Block check: checkBlockBeforeAction(listing.ownerId) — prevent holds against blocking hosts
    → withIdempotency(idempotencyKey, tx =>):
      → (tx IS the SERIALIZABLE transaction — withIdempotency owns it, no nested transaction):
          1. Deduplication: check for existing HELD/PENDING/ACCEPTED booking for same tenant+listing+dates
             → If found, return existing booking (or error if ACCEPTED)
          2. SELECT listing FOR UPDATE
          3. Verify listing.status === 'ACTIVE' — reject if PAUSED or RENTED
          4. Compute effective_available (availableSlots + ghost holds for THIS listing)
          5. Opportunistically expire ghost holds for THIS listing (safe — we hold the row lock)
          6. Check: effective_available >= slotsRequested
          7. Anti-abuse: COUNT bookings WHERE tenantId = $user AND status = 'HELD' AND heldUntil > NOW() — must be <= 3
             (Only status='HELD' with non-expired TTL counts. PENDING and ACCEPTED are excluded.)
          8. Decrement: listing.availableSlots -= slotsRequested (with GREATEST(0) clamp)
          9. INSERT booking with status=HELD, heldUntil=NOW()+holdTtlMinutes, heldAt=NOW(), slotsRequested
      → Return booking with countdown info (see API Response section below)
```

### API Response

The `BookingResult` (or `InternalBookingResult`) success shape must include hold-specific fields for the UI:

```typescript
{
  success: true,
  bookingId: string,
  heldUntil: string,       // ISO 8601 datetime
  holdTtlMinutes: number,  // from listing.holdTtlMinutes
}
```

These fields are required by the `HoldCountdown` component (Section 6).

### Rate Limiting

The HELD path is more abuse-prone than PENDING because each hold consumes inventory.

**Global rate limit**: Add `checkRateLimit` at the top of `createBooking`, before the transaction. Add to `RATE_LIMITS` in `src/lib/rate-limit.ts`:
```typescript
createBooking: { limit: 10, windowMs: 60 * 60 * 1000 }  // 10 per user per hour
```

**Per-listing rate limit**: Add a secondary check to prevent single-listing cycling DoS:
```typescript
createBookingPerListing: { limit: 3, windowMs: 60 * 60 * 1000 }  // 3 per user per listing per hour
```
Use compound identifier `${userId}:${listingId}` with the existing `checkRateLimit` function. This prevents one user from repeatedly hold-cycling a 1-slot listing (place hold → let expire → re-apply).

### Race Safety

Five scenarios covered:

1. **Two users, one slot**: Both enter SERIALIZABLE transaction. First succeeds, second sees `effective_available = 0` and gets a clear error.
2. **Same user, double-click**: Deduplication check inside transaction catches existing HELD/PENDING/ACCEPTED booking for same tenant+listing+dates. Returns existing booking. `withIdempotency` also catches network retries.
3. **Hold expires during host review**: `heldUntil >= NOW()` in WHERE clause for accept/reject. If expired, return error "Hold has expired."
4. **Sweeper runs during createBooking**: SERIALIZABLE isolation prevents the sweeper from modifying the listing row while `createBooking` holds the `FOR UPDATE` lock.
5. **Anti-abuse circumvention**: The count of active holds (`status = 'HELD' AND heldUntil > NOW()`) is checked inside the same SERIALIZABLE transaction, so concurrent requests cannot race past the limit. Note: there is a narrow TTL-boundary edge case where a hold expires between the count query and the insert, temporarily allowing a 4th hold. This is acceptable — the 3-hold limit is a soft anti-abuse guard, not a hard invariant.

### Feature Flag Integration

```typescript
if (softHoldsFlag === 'on') {
  // HELD path: decrement slots, set heldUntil
} else {
  // PENDING path: existing behavior, no slot change
}
```

When `drain`: falls through to PENDING path (no new holds created).

## Section 3: Accept/Reject/Cancel for HELD

**File**: `src/app/actions/manage-booking.ts` — the existing `updateBookingStatus` function must be extended with HELD-specific branches.

The current code uses optimistic locking via the `version` field and `updateMany` with `version` check (not `SELECT FOR UPDATE`). The HELD path follows this same pattern for consistency.

**Guard against EXPIRED as target**: Before `validateTransition`, add: `if (targetStatus === 'EXPIRED') return { error: 'invalid_target_status' }`. Only the sweeper CTE sets EXPIRED.

### Accept (host)

```
1. Validate: session.user is listing owner
2. Branch: if booking.status === 'HELD':
   a. updateMany WHERE id = $1 AND status = 'HELD' AND version = $currentVersion AND heldUntil >= NOW()
   b. SET status = 'ACCEPTED', version = version + 1, updatedAt = NOW()
   c. If rowCount = 0: re-read booking
      → If status = EXPIRED: return { error: 'hold_expired' }
      → If version changed: return { error: 'concurrent_modification' }
   d. No inventory change (already decremented at hold creation)
   e. Send notification to applicant
3. Else (PENDING path): existing logic unchanged
```

### Reject (host)

```
1. Validate: session.user is listing owner
2. Branch: if booking.status === 'HELD':
   a. updateMany WHERE id = $1 AND status = 'HELD' AND version = $currentVersion AND heldUntil >= NOW()
   b. SET status = 'REJECTED', version = version + 1, updatedAt = NOW()
   c. If rowCount = 0: re-read booking → return appropriate error
   d. Release inventory: listing.availableSlots += booking.slotsRequested (with LEAST clamp)
   e. Send notification to applicant
3. Else (PENDING path): existing logic unchanged — NO inventory change on PENDING reject
```

**Important**: The HELD reject branch must be separate from the PENDING reject branch. Adding inventory release to the PENDING reject path would incorrectly increment `availableSlots` for bookings that never decremented it.

### Cancel (applicant)

```
1. Validate: session.user is booking.tenantId
2. Branch: if booking.status === 'HELD':
   a. updateMany WHERE id = $1 AND status = 'HELD' AND version = $currentVersion AND heldUntil >= NOW()
   b. SET status = 'CANCELLED', version = version + 1, updatedAt = NOW()
   c. If rowCount = 0: re-read booking
      → If status = EXPIRED: return { error: 'already_expired' } (sweeper got there first)
      → If version changed: return { error: 'concurrent_modification' }
   d. Release inventory: listing.availableSlots += booking.slotsRequested (with LEAST clamp)
3. Else if booking.status === 'ACCEPTED':
   a. Existing cancel-after-accept logic, BUT use booking.slotsRequested instead of hardcoded +1
4. Else (PENDING cancel): existing logic unchanged — NO inventory change
```

**Implementation note**: The `heldUntil >= NOW()` guard must ONLY appear in HELD-specific branches. PENDING bookings have `heldUntil = NULL`, and `NULL >= NOW()` is falsy in SQL, which would incorrectly block PENDING operations. Always branch on `booking.status === 'HELD'` before constructing the WHERE clause.

The `heldUntil >= NOW()` guard in the HELD paths is an atomic guard against race conditions with the sweeper. Without it, there's a window where the sweeper expires the hold (flipping status to EXPIRED and bumping version) but a concurrent action could attempt to double-release inventory. The atomic WHERE clause + version check together prevent this.

### LEAST Clamp

All inventory releases use:
```sql
SET "availableSlots" = LEAST("availableSlots" + $slotsRequested, "totalSlots")
```

Prevents `availableSlots` from exceeding `totalSlots` due to edge cases (manual admin edits, concurrent operations).

## Section 4: Sweeper Cron

**Trigger**: Cron job every 5 minutes
**Route**: `POST /api/cron/sweep-holds` with `CRON_SECRET` bearer token auth (uses existing `validateCronAuth` helper)
**Runs when**: Feature flag is `on` or `drain`

### Algorithm (Single CTE Batch)

```sql
WITH expired AS (
  UPDATE "Booking"
  SET status = 'EXPIRED',
      "updatedAt" = NOW(),
      version = version + 1
  WHERE status = 'HELD'
    AND "heldUntil" < NOW()
  RETURNING "listingId", "slotsRequested"
),
released AS (
  UPDATE "Listing"
  SET "availableSlots" = LEAST(
        "availableSlots" + sub.total_slots,
        "totalSlots"
      ),
      "updatedAt" = NOW()
  FROM (
    SELECT "listingId", SUM("slotsRequested") AS total_slots
    FROM expired
    GROUP BY "listingId"
  ) sub
  WHERE "Listing".id = sub."listingId"
  RETURNING "Listing".id
)
SELECT COUNT(*) AS expired_count FROM expired;
```

### Design Decisions

- **Single CTE, not a loop**: Atomic batch operation. All expired holds for a listing are summed and released in one UPDATE. Both the Booking status change and Listing inventory release happen atomically — no transient inconsistency window between the two writes.
- **LEAST clamp**: Prevents inventory from exceeding `totalSlots`.
- **Version bump**: `version = version + 1` on Booking ensures optimistic locking in `manage-booking.ts` detects concurrent sweeper modifications. Without this, a host accept could race with the sweeper and succeed on an already-expired hold.
- **No LIMIT**: Hold creation is bounded (max 3/user, TTL 5-60 min), so the expired set per 5-min window is naturally small.
- **Idempotent**: Running twice in quick succession is harmless — already-expired rows don't match the WHERE clause.
- **No row-level locking needed**: The CTE's UPDATE takes implicit row-level locks. Concurrent sweeper invocations (unlikely) are safe.
- **No opportunistic expiry in manage-booking.ts**: The sweeper is the ONLY bulk expiry path (aside from the per-listing opportunistic expiry inside `createBooking`'s `FOR UPDATE` lock). Do NOT add inline expiry logic to `updateBookingStatus` — it creates a deadlock risk with the sweeper (sweeper holds Booking lock → needs Listing lock; inline expiry holds Listing lock → needs Booking lock).

### Observability

- Log: `{ event: "sweep_complete", expired_count, duration_ms }` (no PII)
- Warning if `expired_count > 50` (unusual volume)
- On CTE failure: entire operation rolls back, Sentry captures exception, next cron retries

## Section 5: Ghost-Hold Queries

Between sweeper runs, some holds may have expired but not yet been swept (`status = 'HELD'` but `heldUntil < NOW()`). These are "ghost holds."

### Query Pattern

```sql
SELECT
  l.id,
  l."availableSlots" + COALESCE(gh.ghost_slots, 0) AS effective_available
FROM "Listing" l
LEFT JOIN (
  SELECT "listingId", SUM("slotsRequested")::int AS ghost_slots
  FROM "Booking"
  WHERE status = 'HELD'
    AND "heldUntil" < NOW()
  GROUP BY "listingId"
) gh ON gh."listingId" = l.id
WHERE l.id = $1;
```

Note: Uses `SUM("slotsRequested")` (not `COUNT(*)`) because a single ghost hold may reserve multiple slots. This matches the sweeper CTE's aggregation in Section 4.

### Usage Points

1. **`getListingAvailability(listingId)`** — new helper in `src/lib/listing-availability.ts`. Returns `{ availableSlots, effectiveAvailable, ghostHolds }`.
2. **`createBooking` transaction** — computes `effective_available` after `FOR UPDATE`. Opportunistically expires ghost holds for that listing within the same transaction (safe — row lock held).
3. **Listing detail page** — uses `getListingAvailability` for accurate display.
4. **Search results** — search results display `availableSlots` from the denormalized `listing_search_docs` table (which is slightly stale between sweeper runs). This is an acceptable trade-off: the search pipeline reads from the denormalized store for performance, and the listing detail page shows the accurate `effectiveAvailable`. Adding a live LEFT JOIN to the search query would defeat the purpose of denormalization. The search doc sync (`search-doc-sync.ts`) already updates `availableSlots` when listings change; the sweeper will trigger re-sync when it releases inventory.

### Index Support

Two partial indexes (see Section 1 migration notes):
- `idx_booking_held_expiry` on `("heldUntil") WHERE status = 'HELD'` — for sweeper
- `idx_booking_held_by_listing` on `("listingId", "heldUntil") WHERE status = 'HELD'` — for per-listing ghost-hold queries

### Design Decisions

- **LEFT JOIN with SUM, not COUNT**: Ghost holds may reserve multiple slots. Aggregation must use `SUM("slotsRequested")` to match inventory semantics.
- **No caching**: Counts change every minute. The JOIN is cheap enough to run live.
- **Opportunistic expiry only in createBooking**: Safe because we hold the `FOR UPDATE` lock on that listing. No cross-listing expiry (deadlock risk with sweeper). Do NOT add opportunistic expiry to `updateBookingStatus`.
- **Consistency**: `FOR UPDATE` lock serializes concurrent booking attempts; ghost-hold computation happens inside this critical section.
- **Search results are slightly stale**: Acceptable trade-off. Denormalized search docs show `availableSlots` (updated by sweeper), while listing detail page shows live `effectiveAvailable`.

## Section 6: UI + Notifications

### HoldCountdown Component

`src/components/bookings/HoldCountdown.tsx` — client component showing remaining time with visual urgency:

| TTL Remaining | Color | Effect |
|---------------|-------|--------|
| >50% | Green | Static |
| 10-50% | Amber | Static |
| <2 min | Red | Pulse animation |
| 0 | Grey | "Hold expired", disabled actions |

**Props**: `{ heldUntil: string; holdTtlMinutes: number; onExpired?: () => void }`

- `heldUntil` is an ISO 8601 datetime string (serialized from Prisma `DateTime`)
- `holdTtlMinutes` is used to compute color thresholds (percentage of original TTL)

**Implementation**:
- `setInterval(1000)` countdown, computing `remaining = new Date(heldUntil).getTime() - Date.now()`
- `onExpired()` callback when countdown hits 0 (parent invalidates/refetches)
- Pure client-side countdown — server is source of truth on actual expiry. The countdown is a UX hint, not authoritative. The `onExpired` callback triggers a refetch but does NOT push a server-side notification. The actual `BOOKING_HOLD_EXPIRED` in-app notification only appears when the sweeper runs and the user next loads a server-rendered page.

**Render locations**:
1. Applicant's "My Bookings" page — countdown + "Cancel Hold" button
2. Host's "Manage Listings" page — countdown + Accept/Reject buttons
3. Listing detail page — banner if current user has active hold

### Notifications

**Schema**: `NotificationType` enum additions (see Section 1):
- `BOOKING_HOLD_REQUEST` — sent to host when hold is placed
- `BOOKING_HOLD_EXPIRED` — sent to applicant when sweeper expires their hold

**Host** (on hold creation):
- In-app notification (type: `BOOKING_HOLD_REQUEST`): "New hold from [applicant name] — expires in X minutes"
- Email (if enabled): "Action needed: hold on [listing title] expires in X minutes"

**Applicant**:
- On creation: toast "Hold placed! The host has X minutes to respond"
- On accept: in-app + email (existing `BOOKING_ACCEPTED` type): "Your application was accepted!"
- On reject: in-app + email (existing `BOOKING_REJECTED` type): "Your application was not accepted"
- On expiry: in-app (type: `BOOKING_HOLD_EXPIRED`): "Your hold expired" — created by sweeper, shown on next page load (pull-based, no polling)

### Availability Display

Listing detail page uses `effectiveAvailable` (from `getListingAvailability`) instead of raw `availableSlots`. Search results use `availableSlots` from the denormalized search docs (see Section 5 design decision).

When `effectiveAvailable = 0`: "No spots available", Apply button disabled.
When user has active hold on this listing: show HoldCountdown banner instead of Apply button.

### Anti-Abuse UI Guard

When user has 3 active holds globally (`status = 'HELD' AND heldUntil > NOW()`): Apply button shows tooltip "You've reached the maximum of 3 active holds. Cancel an existing hold to apply for more."

## Implementation Slices

| Slice | Scope | Depends On |
|-------|-------|------------|
| 4A | Schema migration (partial indexes, unique constraint change) + State Machine + Feature Flag | — |
| 4B | createBooking HELD path (incl. Zod schema, rate limits, block check) | 4A |
| 4C | Accept/Reject/Cancel HELD variants (incl. slotsRequested fix for cancel-after-accept) | 4A |
| 4D | Sweeper cron | 4A |
| 4E | Ghost-hold queries + listing availability | 4A, 4D |
| 4F | UI (HoldCountdown) + Notifications + Anti-abuse | 4A-4E |

## Files Modified (Summary)

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Remove `@@unique([tenantId, listingId, startDate, endDate])` from Booking (replaced by partial index in raw migration SQL). Note: HELD/EXPIRED enum values, heldUntil/heldAt/slotsRequested columns, and notification types already exist from prior phases. |
| `prisma/migrations/` | New migration: partial unique index, two partial indexes (sweeper + ghost-hold) |
| `src/lib/env.ts` | Add `ENABLE_SOFT_HOLDS` to `serverEnvSchema` as `z.enum(["on", "drain", "off"]).optional().default("off")` |
| `src/lib/schemas.ts` | Add `slotsRequested: z.number().int().min(1).max(20).optional().default(1)` to `createBookingSchema` |
| `src/lib/booking-state-machine.ts` | Add HELD/EXPIRED states, transitions, update TypeScript union type, `isTerminalStatus` for EXPIRED |
| `src/lib/rate-limit.ts` | Add `createBooking: { limit: 10, windowMs: 3600000 }` and `createBookingPerListing: { limit: 3, windowMs: 3600000 }` entries |
| `src/app/actions/booking.ts` | Add HELD path to createBooking: rate limiting, block check, listing status check, anti-abuse, ghost-hold expiry, inventory decrement |
| `src/app/actions/manage-booking.ts` | Add HELD-specific accept/reject/cancel branches with TTL guard + version bump; EXPIRED target guard; update cancel-after-accept to use `slotsRequested` |
| `src/lib/listing-availability.ts` | NEW — getListingAvailability helper with ghost-hold query |
| `src/lib/notifications.ts` | Add BOOKING_HOLD_REQUEST, BOOKING_HOLD_EXPIRED types + email preference map |
| `src/app/api/cron/sweep-holds/route.ts` | NEW — sweeper cron endpoint with CTE |
| `src/components/bookings/HoldCountdown.tsx` | NEW — countdown timer component |
| `src/lib/search/search-doc-sync.ts` | Sweeper triggers re-sync when inventory changes |
| `src/app/api/listings/[id]/route.ts` | Update DELETE handler to notify HELD applicants before cascade delete; update PATCH totalSlots handler (see edge cases) |

## Edge Cases Addressed

### Listing deletion with active HELD bookings
The DELETE handler currently only checks for ACCEPTED bookings and notifies PENDING applicants. It must be updated to also:
1. Query active HELD bookings (`status = 'HELD' AND heldUntil >= NOW()`)
2. Send `BOOKING_HOLD_EXPIRED` notifications to HELD applicants before cascade delete
3. (Optional) Cancel the HELD bookings before delete to properly release inventory — though this is moot since the listing itself is being deleted

### totalSlots reduction while holds active
When a host reduces `totalSlots` via PATCH, the delta formula `availableSlots + (newTotal - oldTotal)` can create inconsistent states if active holds claim more slots than the new total. The PATCH handler must:
1. Count active HELD bookings (`status = 'HELD' AND heldUntil >= NOW()`)
2. Reject the `totalSlots` reduction if `newTotalSlots < acceptedCount + heldCount` with a clear error message
3. Alternatively, allow the reduction but warn the host that existing holds may need to be rejected

### Listing paused with active HELD bookings
The `createBooking` flow checks `listing.status === 'ACTIVE'` (Section 2, step 3). PAUSED listings block new holds. Existing HELD bookings on a listing that becomes PAUSED continue their TTL — the host can still accept/reject them. The sweeper handles expiry normally.

## What This Does NOT Touch

- **Reconciliation** — deferred to Phase 5
- **Payment integration** — out of scope
- **SMS notifications** — out of scope
- **Admin dashboard** — out of scope
- **WHOLE_UNIT-specific overlap trigger** — Phase 3 TODO, not Phase 4

## Testing Requirements

Each slice must include:
- Unit tests for pure logic (state machine, TTL computation, anti-abuse checks, slotsRequested validation)
- Integration tests for server routes (createBooking, accept/reject/cancel, sweeper)
- Edge case tests:
  - Double-click / repeated requests
  - Two concurrent users competing for last slot
  - Expired hold (accept/reject/cancel after expiry)
  - Unauthorized transition attempt
  - Rollback behavior when downstream fails
  - Cancel-after-accept for HELD-origin bookings (slotsRequested release)
  - EXPIRED as caller-supplied target (must be rejected)
  - Block check: blocked user cannot place hold
  - PAUSED listing: cannot create hold
  - Per-listing rate limit: cycling attack blocked
  - Mixed PENDING + HELD on same listing during transition
  - Listing deletion with active HELD bookings (notification sent)
  - totalSlots reduction with active holds (rejected or warned)
- E2E tests for critical flows: apply → hold countdown → host accepts, hold expiry
