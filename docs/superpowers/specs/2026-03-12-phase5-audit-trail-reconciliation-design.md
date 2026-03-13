# Phase 5: Audit Trail + Reconciliation — Design Spec

**Date**: 2026-03-12
**Status**: Approved
**Feature flag**: `ENABLE_BOOKING_AUDIT` (requires `ENABLE_SOFT_HOLDS=on`)
**Risk**: LOW — additive read-only logging + weekly safety-net cron. No state mutation logic changes.

---

## 1. Existing Infrastructure (No Migration Needed)

Phase 2-4 already built the following, verified on disk:

### 1A. BookingAuditLog Model (`prisma/schema.prisma:396-416`)

```prisma
model BookingAuditLog {
  id             String   @id @default(cuid())
  bookingId      String
  action         String   // CREATED, HELD, ACCEPTED, REJECTED, CANCELLED, EXPIRED
  previousStatus String?  // null for CREATED
  newStatus      String
  actorId        String?  // null for system actions (cron sweeper)
  actorType      String   @default("USER") // USER, HOST, SYSTEM, ADMIN
  details        Json?    // slotsRequested, rejectionReason, heldUntil, version, etc.
  ipAddress      String?
  createdAt      DateTime @default(now())

  booking Booking @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  actor   User?   @relation("BookingAuditActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([bookingId])
  @@index([bookingId, createdAt])
  @@index([actorId])
  @@index([action])
  @@index([createdAt])
}
```

### 1B. Migration (`prisma/migrations/20260312000000_phase1_schema_evolution/migration.sql`)

Creates `BookingAuditLog` table with:
- CHECK constraint on `action`: CREATED, HELD, ACCEPTED, REJECTED, CANCELLED, EXPIRED, STATUS_CHANGED
- CHECK constraint on `actorType`: USER, HOST, SYSTEM, ADMIN
- 5 indexes including composite `(bookingId, createdAt)`

### 1C. Feature Flag (`src/lib/env.ts`)

- `ENABLE_BOOKING_AUDIT: z.enum(["true", "false"]).optional()` (line 109)
- Cross-flag validation: requires `ENABLE_SOFT_HOLDS=on` (lines 144-149)
- Accessor: `features.bookingAudit` returns boolean (lines 448-451)
- Import pattern: `import { features } from "@/lib/env"`

### 1D. State Machine (`src/lib/booking-state-machine.ts`)

6 states: PENDING, ACCEPTED, REJECTED, CANCELLED, HELD, EXPIRED
Transitions include HELD→ACCEPTED, HELD→REJECTED, HELD→CANCELLED, HELD→EXPIRED.

### 1E. Booking Model (`prisma/schema.prisma:186-211`)

Has `slotsRequested` (default 1), `heldUntil`, `heldAt`, `version` (optimistic locking), and `bookingAuditLogs` relation.

---

## 2. `logBookingAudit` Helper Function

**New file**: `src/lib/booking-audit.ts`

### Signature

```typescript
import { Prisma } from '@prisma/client';
import { BookingStatus } from '@prisma/client';
import { features } from '@/lib/env';

// STATUS_CHANGED exists in DB CHECK constraint but is reserved for future use — not exposed in this type.
export type BookingAuditAction = 'CREATED' | 'HELD' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
export type BookingAuditActorType = 'USER' | 'HOST' | 'SYSTEM' | 'ADMIN';

export async function logBookingAudit(
  tx: Prisma.TransactionClient,  // from @prisma/client — NOT PrismaTransactionClient
  params: {
    bookingId: string;
    action: BookingAuditAction;
    previousStatus: BookingStatus | null;  // null only for CREATED
    newStatus: BookingStatus;
    actorId: string | null;                // null for SYSTEM actions
    actorType: BookingAuditActorType;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
  }
): Promise<void>
```

### Design Rules

1. **Transaction-bound**: Receives `tx` (the Prisma transaction client), NOT global `prisma`. Guarantees atomicity: if state change rolls back, audit INSERT rolls back too.
2. **Feature-flag gated**: First line checks `features.bookingAudit`. If off, returns immediately (no-op, zero overhead).
3. **Fire-and-forget within TX**: No return value. Errors propagate up and roll back the parent transaction. Correct behavior: no unaudited transitions.
4. **No PII**: `details` contains IDs and machine values only (slotsRequested, version, heldUntil). Never email/phone/name.
5. **Type-safe**: `BookingAuditAction` type exported, matches CHECK constraint values.

### Why Not Extend `src/lib/audit.ts`?

That module requires `adminId` (non-optional), serves admin panel audit trails, and has a different access pattern. Separate module = clear separation of concerns.

---

## 3. Audit Write Points (6 Transitions)

Each call goes **inside the existing Prisma `$transaction`** callback, after the status-changing `prisma.booking.update/create`.

### 3A. CREATED (None -> PENDING)

**File**: `src/app/actions/booking.ts` (~line 224, after `tx.booking.create()`)

**Important**: `executeBookingTransaction` receives `userId: string` as a parameter — NOT `session`. The `actorId` must use `userId`, not `session.user.id`.

```typescript
await logBookingAudit(tx, {
  bookingId: booking.id,
  action: 'CREATED',
  previousStatus: null,
  newStatus: 'PENDING',
  actorId: userId,  // NOT session.user.id — this function receives userId directly
  actorType: 'USER',
  details: { slotsRequested: booking.slotsRequested, listingId },
});
```

### 3B. HELD (PENDING -> HELD)

**File**: `src/app/actions/booking.ts` — hold-creation path

This path does not exist yet (Phase 2 schema supports it but no action creates HELD bookings). When added, the audit call goes inside its transaction. **No code change needed now.** The sweep cron already handles HELD->EXPIRED.

### 3C. ACCEPTED (PENDING/HELD -> ACCEPTED)

**File**: `src/app/actions/manage-booking.ts` — **TWO separate `$transaction` blocks**

There are TWO distinct transaction blocks for ACCEPTED, each needs its own audit call:

**Path 1: HELD→ACCEPTED** (line 132, `prisma.$transaction(async (tx) => { ... })`):
Insert after `tx.booking.updateMany()` succeeds (after the `updateResult.count === 0` check, ~line 161):

```typescript
await logBookingAudit(tx, {
  bookingId: bookingId,  // from function param, not booking.id (updateMany doesn't return object)
  action: 'ACCEPTED',
  previousStatus: 'HELD',
  newStatus: 'ACCEPTED',
  actorId: session.user.id,
  actorType: 'HOST',
  details: { slotsRequested: booking.slotsRequested, version: booking.version },
});
```

**Path 2: PENDING→ACCEPTED** (line 184, separate `prisma.$transaction(async (tx) => { ... })`):
Insert after `tx.booking.updateMany()` succeeds (after the `updateResult.count === 0` check):

```typescript
await logBookingAudit(tx, {
  bookingId: bookingId,
  action: 'ACCEPTED',
  previousStatus: 'PENDING',
  newStatus: 'ACCEPTED',
  actorId: session.user.id,
  actorType: 'HOST',
  details: { slotsRequested: booking.slotsRequested, version: booking.version },
});
```

Both calls use the `tx` from their respective transaction closures.

### 3D. REJECTED (PENDING/HELD -> REJECTED)

**File**: `src/app/actions/manage-booking.ts` (~lines 204-350)

The REJECTED path handles both PENDING->REJECTED and HELD->REJECTED (line 342-350 restores slots for HELD). Use dynamic `previousStatus`:

```typescript
await logBookingAudit(tx, {
  bookingId: booking.id,
  action: 'REJECTED',
  previousStatus: booking.status,  // PENDING or HELD — dynamic, not hardcoded
  newStatus: 'REJECTED',
  actorId: session.user.id,
  actorType: 'HOST',
  details: { rejectionReason, version: booking.version },
});
```

### 3E. CANCELLED (PENDING/ACCEPTED/HELD -> CANCELLED)

**File**: `src/app/actions/manage-booking.ts` (~lines 400-464)

Two sub-paths with different transaction structures:

**Path 1: ACCEPTED/HELD -> CANCELLED** (lines 405-435): Already inside `prisma.$transaction(async (tx) => { ... })`. Add audit call inside the existing TX:

```typescript
await logBookingAudit(tx, {
  bookingId: bookingId,
  action: 'CANCELLED',
  previousStatus: booking.status,  // ACCEPTED or HELD
  newStatus: 'CANCELLED',
  actorId: session.user.id,
  actorType: 'USER',
  details: { slotsRequested: booking.slotsRequested, previousStatus: booking.status },
});
```

**Path 2: PENDING -> CANCELLED** (lines 446-456): Currently uses `prisma.booking.updateMany()` outside any transaction. **Must wrap in `prisma.$transaction`** to maintain the key invariant (audit INSERT inside TX):

```typescript
// BEFORE (current code, lines 447-463):
const updateResult = await prisma.booking.updateMany({ ... });
if (updateResult.count === 0) return { error: '...', code: 'CONCURRENT_MODIFICATION' };

// AFTER (Phase 5 change):
try {
  await prisma.$transaction(async (tx) => {
    const updateResult = await tx.booking.updateMany({
      where: { id: bookingId, version: booking.version },
      data: { status: 'CANCELLED', version: { increment: 1 } },
    });
    if (updateResult.count === 0) throw new Error('CONCURRENT_MODIFICATION');

    await logBookingAudit(tx, {
      bookingId: bookingId,
      action: 'CANCELLED',
      previousStatus: 'PENDING',
      newStatus: 'CANCELLED',
      actorId: session.user.id,
      actorType: 'USER',
      details: { slotsRequested: booking.slotsRequested },
    });
  });
} catch (error) {
  if (error instanceof Error && error.message === 'CONCURRENT_MODIFICATION') {
    return {
      error: 'Booking was modified by another request. Please refresh and try again.',
      code: 'CONCURRENT_MODIFICATION'
    };
  }
  throw error;
}
```

This wraps the TX in try/catch matching the existing ACCEPTED/HELD cancel pattern (lines 436-444). The current code returns an error response for `count === 0` — inside a TX this becomes a thrown error that must be caught outside.

### 3F. EXPIRED (HELD -> EXPIRED)

**File**: `src/app/api/cron/sweep-expired-holds/route.ts`

```typescript
await logBookingAudit(tx, {
  bookingId: hold.id,
  action: 'EXPIRED',
  previousStatus: 'HELD',
  newStatus: 'EXPIRED',
  actorId: null,
  actorType: 'SYSTEM',
  details: { slotsRequested: hold.slotsRequested, heldUntil: hold.heldUntil },
  // NOTE: hold.heldUntil is NOT in the current sweep query SELECT. Phase 5 must add
  // b."heldUntil" to the raw SQL SELECT and the ExpiredHoldInfo TypeScript interface.
});
```

### Key Invariant

Every `logBookingAudit` receives `tx` (the transaction client), never `prisma`. If the parent transaction rolls back, the audit row disappears too. No ghost audit entries.

---

## 4. Reconciliation Cron

**New file**: `src/app/api/cron/reconcile-slots/route.ts`

### Purpose

Weekly safety net detecting and fixing `availableSlots` drift on listings. Catches bugs where a transaction partially commits or a slot increment/decrement is lost.

### Pattern

Follows `sweep-expired-holds/route.ts` exactly:

```
validateCronAuth -> feature flag check -> advisory lock -> query -> fix -> structured log -> JSON response
```

### Advisory Lock

Uses `hashtext()` with a string constant, matching the existing pattern:
- New constant in `src/lib/hold-constants.ts`: `RECONCILER_ADVISORY_LOCK_KEY = 'reconcile-slots'`
- Lock call: `SELECT pg_try_advisory_xact_lock(hashtext(${RECONCILER_ADVISORY_LOCK_KEY})) as locked`

### Feature Flag

The reconciler is gated on `ENABLE_BOOKING_AUDIT` (not a separate flag) to reduce configuration surface area. Both audit logging and slot reconciliation are Phase 5 features that ship together. If a future need arises to run reconciliation without audit logging, a separate flag can be introduced then (YAGNI).

```typescript
import { features } from "@/lib/env";

if (!features.bookingAudit) {
  return NextResponse.json({ skipped: true, reason: "ENABLE_BOOKING_AUDIT is off" });
}
```

### Drift Detection SQL

Only counts HELD bookings that haven't expired yet (mirrors the slot consumption logic in `manage-booking.ts`). Expired-but-not-yet-swept HELD bookings are excluded to prevent false drift detection:

```sql
SELECT
  l.id,
  l."availableSlots" AS actual,
  l."totalSlots" - COALESCE(SUM(b."slotsRequested") FILTER (
    WHERE b.status = 'ACCEPTED'
    OR (b.status = 'HELD' AND b."heldUntil" > NOW())
  ), 0) AS expected
FROM "Listing" l
LEFT JOIN "Booking" b ON b."listingId" = l.id
WHERE l.status = 'ACTIVE'
GROUP BY l.id
HAVING l."availableSlots" != l."totalSlots" - COALESCE(SUM(b."slotsRequested") FILTER (
  WHERE b.status = 'ACCEPTED'
  OR (b.status = 'HELD' AND b."heldUntil" > NOW())
), 0)
```

### Fix Logic

All detection and fix operations run **inside the same `prisma.$transaction`** callback that holds the advisory lock. The advisory lock is transaction-scoped (`pg_try_advisory_xact_lock`), so releasing it before the fix UPDATE would allow a concurrent reconciler to race.

- If `abs(delta) <= 5`: auto-fix via `UPDATE "Listing" SET "availableSlots" = expected` **inside the TX**. After the TX commits, call `markListingsDirty([listingId], 'reconcile_slots')` **outside the TX** (it uses global `prisma`, not `tx`). **Prerequisite**: Add `| "reconcile_slots"` to the `DirtyReason` union type in `src/lib/search/search-doc-dirty.ts` (line 25)
- If `abs(delta) > 5`: Sentry alert only, no auto-fix (requires manual review). Threshold rationale: 5 exceeds the maximum expected concurrent in-flight transitions for any single listing, so drift >5 likely indicates a systemic bug rather than a timing race.
- Structured log for every drift: `{ listingId, actual, expected, delta }`
- Does NOT write to BookingAuditLog (`bookingId` is NOT NULL — listing-level events don't fit)

### Schedule

`0 5 * * 0` (Sunday 5:00 AM UTC) — avoids overlap with `cleanup-rate-limits` at `0 3 * * *` AND `cleanup-idempotency-keys` at `0 4 * * *` (which runs every day including Sundays).

### vercel.json Updates

Add 2 entries (sweep-expired-holds was also missing):

```json
{ "path": "/api/cron/sweep-expired-holds", "schedule": "*/5 * * * *" },
{ "path": "/api/cron/reconcile-slots", "schedule": "0 5 * * 0" }
```

---

## 5. GET Audit Endpoint

**New file**: `src/app/api/bookings/[id]/audit/route.ts`

### Route Signature

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // ...
}
```

Uses Next.js 15 async params pattern (verified from `listings/[id]/route.ts:61`).

### Auth & Authorization

```typescript
import { auth } from '@/auth';

const session = await auth();
if (!session?.user?.id) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Booking lookup (must include listing.ownerId for auth check):

```typescript
const booking = await prisma.booking.findUnique({
  where: { id },
  include: { listing: { select: { ownerId: true } } },
});
if (!booking) {
  return NextResponse.json({ error: "Booking not found" }, { status: 404 });
}
```

Authorization check:

```typescript
const userId = session.user.id;
const isAuthorized =
  userId === booking.tenantId ||
  userId === booking.listing.ownerId ||
  session.user.isAdmin;  // boolean, not role string
```

| Viewer | Access |
|--------|--------|
| Tenant (booking creator) | Own bookings only |
| Host (listing owner) | Bookings on their listings |
| Admin (`isAdmin: true`) | All bookings |
| Anyone else | 403 |

### Response Shape

```typescript
{
  bookingId: string;
  entries: Array<{
    id: string;
    action: string;
    previousStatus: string | null;
    newStatus: string;
    actorType: string;
    details: object | null;
    createdAt: string;
    // actorId excluded — PII protection
  }>;
}
```

### Design Decisions

- **No pagination**: max ~6 entries per booking
- **No `actorId` in response**: actor identity derivable from `actorType` + booking context
- **404 when feature flag off**: feature doesn't exist from client perspective
- **No caching headers**: audit data changes with each transition
- **Ordered by `createdAt ASC`**: chronological
- **Input validation**: Validate `id` param before DB query — reject empty strings and strings longer than 30 chars (CUID max length) with 400. Prevents malformed input from reaching the database.
- **No rate limiting**: endpoint requires authentication and returns only the requesting user's own bookings (or their listings' bookings). The data volume per booking is trivially small (~6 rows). Enumeration risk is mitigated by the authorization check (user can only see bookings they're party to). If abuse patterns emerge, rate limiting can be added later.
- **Deleted bookings**: If a booking has been cascade-deleted, `findUnique` returns null and the endpoint returns 404. This is correct behavior — no special handling needed.

---

## 6. Test Plan

### 6A. Unit: `src/__tests__/lib/booking-audit.test.ts` (NEW)

| Test | Verifies |
|------|----------|
| Inserts audit row with correct fields | All params passed to `tx.bookingAuditLog.create` |
| No-ops when `features.bookingAudit` is false | Returns immediately, no DB call |
| Passes `tx` (not `prisma`) to create | Transaction isolation preserved |
| Validates all 6 action types | CREATED, HELD, ACCEPTED, REJECTED, CANCELLED, EXPIRED |
| `previousStatus` is null only for CREATED | Type/runtime contract |
| `actorId` is null only when `actorType === 'SYSTEM'` | Actor contract |
| `details` never contains PII fields | Rejects email/phone/name keys |
| Audit INSERT failure rolls back parent TX | `tx.bookingAuditLog.create` throws → entire TX rejects (central invariant) |

**Mock strategy**: Mock `features` getter via `jest.mock('@/lib/env')`, provide fake `tx` with `bookingAuditLog.create` as `jest.fn()`.

### 6B. Unit: `src/__tests__/api/cron/reconcile-slots.test.ts` (NEW)

| Test | Verifies |
|------|----------|
| Returns 401 without valid CRON_SECRET | Auth gate |
| Returns `{ skipped: true }` when feature flag off | Feature gate |
| Skips when advisory lock not acquired | Concurrent protection |
| Detects drift and fixes it | Core algorithm |
| Does NOT auto-fix when `abs(delta) > 5` | Safety threshold |
| Logs structured event with listingId, actual, expected, delta | Observability |
| Returns JSON summary with reconciled count | API contract |
| Calls `markListingsDirty` after auto-fix | Search doc refresh triggered |
| Uses `SUM(b."slotsRequested")` not `COUNT(b.id)` | Multi-slot correctness |

**Mock strategy**: Mock `prisma.$transaction`, `prisma.$queryRaw`, `features.bookingAudit`, `validateCronAuth`, `markListingsDirty` (from `@/lib/search/search-doc-dirty`). Follows `cleanup-rate-limits.test.ts` pattern.

### 6C. Unit: `src/__tests__/api/bookings/audit.test.ts` (NEW)

| Test | Verifies |
|------|----------|
| Returns 404 when feature flag off | Feature gate |
| Returns 401 when not authenticated | Auth gate |
| Returns 400 for malformed bookingId (empty, too long) | Input validation |
| Returns 404 when booking not found | Not found handling |
| Returns 403 when user is neither tenant, host, nor admin | Authorization |
| Returns audit entries for tenant | Tenant access |
| Returns audit entries for host (listing owner) | Host access |
| Returns audit entries for admin | Admin bypass |
| Entries ordered by `createdAt ASC` | Chronological order |
| Response excludes `actorId` | PII protection |

**Mock strategy**: Mock `auth()`, `prisma.booking.findUnique`, `prisma.bookingAuditLog.findMany`.

### 6D. Integration: Audit Write Point Assertions (4 EXISTING files modified)

Add `jest.mock('@/lib/booking-audit', () => ({ logBookingAudit: jest.fn() }))` and one assertion per transition:

| File | Transition | Assertion |
|------|-----------|-----------|
| `src/__tests__/actions/booking-whole-unit.test.ts` | CREATED | `expect(logBookingAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'CREATED' }))` |
| `src/__tests__/actions/booking-hold.test.ts` | HELD | **Deferred** — add `jest.mock('@/lib/booking-audit')` and a `TODO` comment only. No assertions until hold-creation action is built (section 3B). |
| `src/__tests__/actions/manage-booking.test.ts` | ACCEPTED (PENDING path), REJECTED, CANCELLED | One assertion per path |
| `src/__tests__/actions/manage-booking-hold.test.ts` | ACCEPTED (HELD path) | Assert audit call with `previousStatus: 'HELD'` |
| `src/__tests__/api/cron/sweep-expired-holds.test.ts` | EXPIRED | Assert audit call with `actorType: 'SYSTEM'` |

**Breaking change in existing mocks**: When `logBookingAudit` is NOT mocked at the module level (i.e., tests that exercise the real function path), existing `tx` mock objects in `sweep-expired-holds.test.ts` and `manage-booking.test.ts` must be updated to include `bookingAuditLog: { create: jest.fn() }` on the transaction client mock. Approximately ~14 tests across these files will fail without this mock property. Since we ARE mocking at the module level via `jest.mock('@/lib/booking-audit')`, this is only relevant if any test bypasses the mock.

**Existing feature mocks**: `booking-whole-unit.test.ts` mocks `features` — ensure the mock includes `bookingAudit: true` (or the `logBookingAudit` mock will early-return, and the assertion will fail because the mocked function was still called but the real one wouldn't be).

### 6E. What We Do NOT Test

- Prisma schema/migration (verified by `prisma migrate` and existing Phase 2-4 tests)
- Feature flag itself (already tested via env mock patterns)
- State machine transitions (already tested in `src/__tests__/lib/booking-state-machine.test.ts`)

---

## 7. Files Summary

### New Files (4)

| File | Purpose |
|------|---------|
| `src/lib/booking-audit.ts` | `logBookingAudit` helper |
| `src/app/api/bookings/[id]/audit/route.ts` | GET audit trail endpoint |
| `src/app/api/cron/reconcile-slots/route.ts` | Weekly slot reconciliation cron |
| `src/lib/hold-constants.ts` (modify) | Add `RECONCILER_ADVISORY_LOCK_KEY` |

### Modified Files (5 production)

| File | Change |
|------|--------|
| `src/app/actions/booking.ts` | Add CREATED audit call |
| `src/app/actions/manage-booking.ts` | Add ACCEPTED (x2 paths)/REJECTED/CANCELLED audit calls + wrap PENDING cancel in TX with try/catch |
| `src/app/api/cron/sweep-expired-holds/route.ts` | Add EXPIRED audit call + add `heldUntil` to SELECT & TypeScript interface |
| `src/lib/search/search-doc-dirty.ts` | Add `"reconcile_slots"` to `DirtyReason` union type (line 25) |
| `vercel.json` | Add 2 cron entries |

### Test Files (3 new + 5 modified)

| File | Type |
|------|------|
| `src/__tests__/lib/booking-audit.test.ts` | NEW |
| `src/__tests__/api/cron/reconcile-slots.test.ts` | NEW |
| `src/__tests__/api/bookings/audit.test.ts` | NEW |
| `src/__tests__/actions/booking-whole-unit.test.ts` | MODIFIED |
| `src/__tests__/actions/booking-hold.test.ts` | MODIFIED |
| `src/__tests__/actions/manage-booking.test.ts` | MODIFIED |
| `src/__tests__/actions/manage-booking-hold.test.ts` | MODIFIED |
| `src/__tests__/api/cron/sweep-expired-holds.test.ts` | MODIFIED |

---

## 8. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Audit INSERT slows transactions | Feature flag disables entirely; single INSERT adds <1ms |
| Reconciler auto-fixes incorrectly | Delta >5 threshold triggers Sentry alert, no auto-fix |
| Concurrent reconcilers | Advisory lock via `pg_try_advisory_xact_lock(hashtext(...))` |
| PII in audit details | `logBookingAudit` only accepts `Record<string, unknown>`, tests reject PII keys |
| Backward compatibility | `features.bookingAudit` defaults to false; zero behavior change when off |
| Ghost audit entries | TX-bound INSERT rolls back with parent transaction |
| PENDING cancel path has no TX | Wrap in `prisma.$transaction` — safe refactor, adds negligible overhead |
| Reconciler stales search docs | Calls `markListingsDirty` after auto-fix, matching sweep-expired-holds pattern |
| Expired-but-un-swept HELD in reconciler | SQL filters to `heldUntil > NOW()` only, excluding stale holds |
