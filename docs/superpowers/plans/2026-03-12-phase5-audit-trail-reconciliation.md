# Phase 5: Audit Trail + Reconciliation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add transaction-bound audit logging to all 6 booking status transitions, a weekly slot reconciliation cron, and a GET audit trail endpoint — all gated by `ENABLE_BOOKING_AUDIT`.

**Architecture:** `logBookingAudit` helper receives `tx` (Prisma transaction client) ensuring atomicity with state changes. Reconciliation cron follows `sweep-expired-holds` pattern with advisory lock. GET endpoint uses tenant/host/admin authorization.

**Tech Stack:** Next.js 15 (App Router), Prisma (raw SQL + client), Jest, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-12-phase5-audit-trail-reconciliation-design.md`

---

## File Map

### New Files (4 production + 3 test)

| File | Responsibility |
|------|----------------|
| `src/lib/booking-audit.ts` | `logBookingAudit` helper — feature-gated, TX-bound audit INSERT |
| `src/app/api/cron/reconcile-slots/route.ts` | Weekly cron detecting/fixing `availableSlots` drift |
| `src/app/api/bookings/[id]/audit/route.ts` | GET audit trail for a booking (tenant/host/admin) |
| `src/__tests__/lib/booking-audit.test.ts` | Unit tests for `logBookingAudit` |
| `src/__tests__/api/cron/reconcile-slots.test.ts` | Unit tests for reconciliation cron |
| `src/__tests__/api/bookings/audit.test.ts` | Unit tests for GET audit endpoint |

### Modified Files (5 production + 5 test)

| File | Change |
|------|--------|
| `src/lib/hold-constants.ts` | Add `RECONCILER_ADVISORY_LOCK_KEY` |
| `src/lib/search/search-doc-dirty.ts` | Add `"reconcile_slots"` to `DirtyReason` union |
| `src/app/actions/booking.ts` | Add CREATED audit call in TX |
| `src/app/actions/manage-booking.ts` | Add ACCEPTED (x2)/REJECTED/CANCELLED audit calls + wrap PENDING cancel in TX |
| `src/app/api/cron/sweep-expired-holds/route.ts` | Add EXPIRED audit call + `heldUntil` to SELECT |
| `vercel.json` | Add 2 cron entries |
| `src/__tests__/actions/booking-whole-unit.test.ts` | Add audit mock + CREATED assertion |
| `src/__tests__/actions/booking-hold.test.ts` | Add audit mock (deferred TODO) |
| `src/__tests__/actions/manage-booking.test.ts` | Add audit mock + ACCEPTED/REJECTED/CANCELLED assertions |
| `src/__tests__/actions/manage-booking-hold.test.ts` | Add audit mock + HELD→ACCEPTED assertion |
| `src/__tests__/api/cron/sweep-expired-holds.test.ts` | Add audit mock + EXPIRED assertion |

---

## Chunk 1: Core Helper + Unit Tests

### Task 1: `logBookingAudit` — Failing Tests

**Files:**
- Create: `src/__tests__/lib/booking-audit.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
/**
 * Tests for logBookingAudit helper
 *
 * Verifies: feature-flag gating, TX-bound INSERT, all 6 action types,
 * actor contracts, PII rejection, and error propagation.
 */

jest.mock('@/lib/env', () => ({
  features: {
    bookingAudit: true,
  },
}));

import { logBookingAudit } from '@/lib/booking-audit';
import { features } from '@/lib/env';

// Factory for fake Prisma transaction client
function createMockTx() {
  return {
    bookingAuditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  } as any;
}

describe('logBookingAudit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (features as any).bookingAudit = true;
  });

  it('inserts audit row with correct fields', async () => {
    const tx = createMockTx();
    await logBookingAudit(tx, {
      bookingId: 'booking-1',
      action: 'CREATED',
      previousStatus: null,
      newStatus: 'PENDING',
      actorId: 'user-1',
      actorType: 'USER',
      details: { slotsRequested: 2, listingId: 'listing-1' },
    });

    expect(tx.bookingAuditLog.create).toHaveBeenCalledWith({
      data: {
        bookingId: 'booking-1',
        action: 'CREATED',
        previousStatus: null,
        newStatus: 'PENDING',
        actorId: 'user-1',
        actorType: 'USER',
        details: { slotsRequested: 2, listingId: 'listing-1' },
        ipAddress: undefined,
      },
    });
  });

  it('no-ops when features.bookingAudit is false', async () => {
    (features as any).bookingAudit = false;
    const tx = createMockTx();
    await logBookingAudit(tx, {
      bookingId: 'booking-1',
      action: 'ACCEPTED',
      previousStatus: 'PENDING',
      newStatus: 'ACCEPTED',
      actorId: 'host-1',
      actorType: 'HOST',
    });

    expect(tx.bookingAuditLog.create).not.toHaveBeenCalled();
  });

  it('passes tx (not prisma) to create — transaction isolation', async () => {
    const tx = createMockTx();
    await logBookingAudit(tx, {
      bookingId: 'b-1',
      action: 'REJECTED',
      previousStatus: 'HELD',
      newStatus: 'REJECTED',
      actorId: 'host-1',
      actorType: 'HOST',
      details: { rejectionReason: 'not suitable' },
    });

    // The test proves tx.bookingAuditLog.create was called, not any global prisma
    expect(tx.bookingAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['CREATED', null, 'PENDING', 'user-1', 'USER'],
    ['HELD', 'PENDING', 'HELD', 'user-1', 'USER'],
    ['ACCEPTED', 'PENDING', 'ACCEPTED', 'host-1', 'HOST'],
    ['REJECTED', 'HELD', 'REJECTED', 'host-1', 'HOST'],
    ['CANCELLED', 'ACCEPTED', 'CANCELLED', 'user-1', 'USER'],
    ['EXPIRED', 'HELD', 'EXPIRED', null, 'SYSTEM'],
  ] as const)('validates action=%s transition', async (action, prev, next, actorId, actorType) => {
    const tx = createMockTx();
    await logBookingAudit(tx, {
      bookingId: 'b-1',
      action,
      previousStatus: prev,
      newStatus: next,
      actorId,
      actorType,
    });

    expect(tx.bookingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action, previousStatus: prev, newStatus: next }),
      }),
    );
  });

  it('previousStatus is null only for CREATED', async () => {
    const tx = createMockTx();
    await logBookingAudit(tx, {
      bookingId: 'b-1',
      action: 'CREATED',
      previousStatus: null,
      newStatus: 'PENDING',
      actorId: 'u-1',
      actorType: 'USER',
    });

    expect(tx.bookingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ previousStatus: null }),
      }),
    );
  });

  it('actorId is null when actorType is SYSTEM', async () => {
    const tx = createMockTx();
    await logBookingAudit(tx, {
      bookingId: 'b-1',
      action: 'EXPIRED',
      previousStatus: 'HELD',
      newStatus: 'EXPIRED',
      actorId: null,
      actorType: 'SYSTEM',
    });

    expect(tx.bookingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: null, actorType: 'SYSTEM' }),
      }),
    );
  });

  it('audit INSERT failure propagates (rolls back parent TX)', async () => {
    const tx = createMockTx();
    tx.bookingAuditLog.create.mockRejectedValue(new Error('DB constraint violation'));

    await expect(
      logBookingAudit(tx, {
        bookingId: 'b-1',
        action: 'CREATED',
        previousStatus: null,
        newStatus: 'PENDING',
        actorId: 'u-1',
        actorType: 'USER',
      }),
    ).rejects.toThrow('DB constraint violation');
  });

  it.each(['email', 'phone', 'name', 'address'])('strips PII key "%s" from details', async (key) => {
    const tx = createMockTx();
    await logBookingAudit(tx, {
      bookingId: 'b-1',
      action: 'CREATED',
      previousStatus: null,
      newStatus: 'PENDING',
      actorId: 'u-1',
      actorType: 'USER',
      details: { slotsRequested: 1, [key]: 'sensitive-value' },
    });

    const callData = tx.bookingAuditLog.create.mock.calls[0][0].data;
    expect(callData.details).not.toHaveProperty(key);
    expect(callData.details).toHaveProperty('slotsRequested');
  });

  it('includes ipAddress when provided', async () => {
    const tx = createMockTx();
    await logBookingAudit(tx, {
      bookingId: 'b-1',
      action: 'CREATED',
      previousStatus: null,
      newStatus: 'PENDING',
      actorId: 'u-1',
      actorType: 'USER',
      ipAddress: '192.168.1.1',
    });

    expect(tx.bookingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ipAddress: '192.168.1.1' }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --testPathPattern booking-audit --forceExit`
Expected: FAIL — `Cannot find module '@/lib/booking-audit'`

- [ ] **Step 3: Commit failing tests**

```bash
git add src/__tests__/lib/booking-audit.test.ts
git commit -m "test: add failing tests for logBookingAudit helper (Phase 5)"
```

---

### Task 2: `logBookingAudit` — Implementation

**Files:**
- Create: `src/lib/booking-audit.ts`

- [ ] **Step 1: Write the implementation**

```typescript
import { Prisma } from '@prisma/client';
import { features } from '@/lib/env';

export type BookingAuditAction =
  | 'CREATED'
  | 'HELD'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export type BookingAuditActorType = 'USER' | 'HOST' | 'SYSTEM' | 'ADMIN';

// PII keys that must never appear in audit details
const PII_KEYS = new Set(['email', 'phone', 'name', 'address']);

function stripPii(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (!PII_KEYS.has(key)) clean[key] = value;
  }
  return clean;
}

/**
 * Insert an audit row inside the calling transaction.
 * No-ops when ENABLE_BOOKING_AUDIT is off.
 * Errors propagate — rolling back the parent TX (no unaudited transitions).
 */
export async function logBookingAudit(
  tx: Prisma.TransactionClient,
  params: {
    bookingId: string;
    action: BookingAuditAction;
    previousStatus: string | null;
    newStatus: string;
    actorId: string | null;
    actorType: BookingAuditActorType;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
  },
): Promise<void> {
  if (!features.bookingAudit) return;

  await tx.bookingAuditLog.create({
    data: {
      bookingId: params.bookingId,
      action: params.action,
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
      actorId: params.actorId,
      actorType: params.actorType,
      details: stripPii(params.details),
      ipAddress: params.ipAddress,
    },
  });
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm test -- --testPathPattern booking-audit --forceExit`
Expected: All tests PASS (8 `it` blocks + `it.each` expansions)

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/booking-audit.ts
git commit -m "feat: implement logBookingAudit helper (Phase 5)"
```

---

## Chunk 2: Prerequisite Modifications

### Task 3: Add `RECONCILER_ADVISORY_LOCK_KEY` + `DirtyReason` extension

**Files:**
- Modify: `src/lib/hold-constants.ts`
- Modify: `src/lib/search/search-doc-dirty.ts:18-25`

- [ ] **Step 1: Add constant to hold-constants.ts**

Add after line 8 of `src/lib/hold-constants.ts`:

```typescript
/** Advisory lock key for slot reconciler (used with hashtext()) */
export const RECONCILER_ADVISORY_LOCK_KEY = 'reconcile-slots';
```

- [ ] **Step 2: Add `"reconcile_slots"` to DirtyReason**

In `src/lib/search/search-doc-dirty.ts`, add `| "reconcile_slots"` after line 25 (`| "booking_hold_expired"`):

```typescript
type DirtyReason =
  | "listing_created"
  | "listing_updated"
  | "listing_deleted"
  | "status_changed"
  | "view_count"
  | "review_changed"
  | "booking_hold_expired"
  | "reconcile_slots";
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/hold-constants.ts src/lib/search/search-doc-dirty.ts
git commit -m "feat: add reconciler lock key and DirtyReason for reconcile_slots (Phase 5)"
```

---

## Chunk 3: Wire Audit Calls into Existing Transitions

### Task 4: CREATED audit call in `booking.ts`

**Files:**
- Modify: `src/app/actions/booking.ts:1,224`
- Modify: `src/__tests__/actions/booking-whole-unit.test.ts`

- [ ] **Step 1: Add import to booking.ts**

Add after the existing imports (after line 16) in `src/app/actions/booking.ts`:

```typescript
import { logBookingAudit } from '@/lib/booking-audit';
```

- [ ] **Step 2: Add audit call after `tx.booking.create()`**

In `src/app/actions/booking.ts`, after line 224 (`});` closing the `tx.booking.create()` call), add:

```typescript
    await logBookingAudit(tx, {
      bookingId: booking.id,
      action: 'CREATED',
      previousStatus: null,
      newStatus: 'PENDING',
      actorId: userId,
      actorType: 'USER',
      details: { slotsRequested: booking.slotsRequested, listingId },
    });
```

- [ ] **Step 3: Add audit mock + assertion to booking-whole-unit.test.ts**

Add mock at top (before imports) of `src/__tests__/actions/booking-whole-unit.test.ts`:

```typescript
jest.mock('@/lib/booking-audit', () => ({
  logBookingAudit: jest.fn(),
}));
```

Update the existing features mock (around line 96-102) to include `bookingAudit`:

```typescript
jest.mock('@/lib/env', () => ({
  features: {
    multiSlotBooking: true,
    wholeUnitMode: true,
    bookingAudit: true,
  },
  getServerEnv: jest.fn(() => ({})),
}));
```

Add import after other imports:

```typescript
import { logBookingAudit } from '@/lib/booking-audit';
```

Add a test in the appropriate describe block:

```typescript
it('calls logBookingAudit with CREATED action', async () => {
  // ... (after a successful booking creation test)
  expect(logBookingAudit).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ action: 'CREATED', newStatus: 'PENDING', previousStatus: null }),
  );
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- --testPathPattern booking-whole-unit --forceExit`
Expected: All tests PASS

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/app/actions/booking.ts src/__tests__/actions/booking-whole-unit.test.ts
git commit -m "feat: add CREATED audit call in booking transaction (Phase 5)"
```

---

### Task 5: ACCEPTED + REJECTED + CANCELLED audit calls in `manage-booking.ts`

**Files:**
- Modify: `src/app/actions/manage-booking.ts:1,161,236,350,435,445-463`
- Modify: `src/__tests__/actions/manage-booking.test.ts`
- Modify: `src/__tests__/actions/manage-booking-hold.test.ts`

- [ ] **Step 1: Add import to manage-booking.ts**

Add after line 9 of `src/app/actions/manage-booking.ts`:

```typescript
import { logBookingAudit } from '@/lib/booking-audit';
```

- [ ] **Step 2: Add HELD→ACCEPTED audit call**

In `src/app/actions/manage-booking.ts`, inside the HELD→ACCEPTED `prisma.$transaction` (starts at line 132), after the `updateResult.count === 0` check and its throw (around line 160), add before the closing `});` of the transaction:

```typescript
                        await logBookingAudit(tx, {
                          bookingId: bookingId,
                          action: 'ACCEPTED',
                          previousStatus: 'HELD',
                          newStatus: 'ACCEPTED',
                          actorId: session.user.id,
                          actorType: 'HOST',
                          details: { slotsRequested: booking.slotsRequested, version: booking.version },
                        });
```

- [ ] **Step 3: Add PENDING→ACCEPTED audit call**

In the PENDING→ACCEPTED `prisma.$transaction` (starts at line 184), after the `updateResult.count === 0` check, add before the closing `});` of the transaction:

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

- [ ] **Step 4: Add REJECTED audit call**

Inside the REJECTED `prisma.$transaction` (starts at line 314), after the `updateResult.count === 0` check (line 338-339) and the HELD slot-restore block (lines 342-350), add before the closing `});` of the transaction:

```typescript
                    await logBookingAudit(tx, {
                      bookingId: booking.id,
                      action: 'REJECTED',
                      previousStatus: booking.status,
                      newStatus: 'REJECTED',
                      actorId: session.user.id,
                      actorType: 'HOST',
                      details: { rejectionReason, version: booking.version },
                    });
```

- [ ] **Step 5: Add CANCELLED (ACCEPTED/HELD) audit call**

Inside the CANCELLED `prisma.$transaction` for ACCEPTED/HELD path (starts around line 405), after the slot restore (line 434), add before the closing `});`:

```typescript
                        await logBookingAudit(tx, {
                          bookingId: bookingId,
                          action: 'CANCELLED',
                          previousStatus: booking.status,
                          newStatus: 'CANCELLED',
                          actorId: session.user.id,
                          actorType: 'USER',
                          details: { slotsRequested: booking.slotsRequested, previousStatus: booking.status },
                        });
```

- [ ] **Step 6: Wrap PENDING cancel in transaction + add audit call**

Replace lines 446-463 of `src/app/actions/manage-booking.ts` (the PENDING cancel else-block body) with:

```typescript
                try {
                    await prisma.$transaction(async (tx) => {
                        const updateResult = await tx.booking.updateMany({
                            where: {
                                id: bookingId,
                                version: booking.version,
                            },
                            data: {
                                status: 'CANCELLED',
                                version: { increment: 1 },
                            }
                        });

                        if (updateResult.count === 0) {
                            throw new Error('CONCURRENT_MODIFICATION');
                        }

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

- [ ] **Step 7: Add audit mock + assertions to manage-booking.test.ts**

Add at top of `src/__tests__/actions/manage-booking.test.ts` (before imports):

```typescript
jest.mock('@/lib/booking-audit', () => ({
  logBookingAudit: jest.fn(),
}));
```

Add import:

```typescript
import { logBookingAudit } from '@/lib/booking-audit';
```

Add one assertion test per transition in the relevant describe blocks:

- ACCEPTED (PENDING path): `expect(logBookingAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'ACCEPTED', previousStatus: 'PENDING' }))`
- REJECTED: `expect(logBookingAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'REJECTED' }))`
- CANCELLED: `expect(logBookingAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'CANCELLED' }))`

- [ ] **Step 8: Add audit mock + assertion to manage-booking-hold.test.ts**

Add at top of `src/__tests__/actions/manage-booking-hold.test.ts` (before imports):

```typescript
jest.mock('@/lib/booking-audit', () => ({
  logBookingAudit: jest.fn(),
}));
```

Add import and assertion for HELD→ACCEPTED path:

```typescript
import { logBookingAudit } from '@/lib/booking-audit';

// In the HELD→ACCEPTED test:
expect(logBookingAudit).toHaveBeenCalledWith(
  expect.anything(),
  expect.objectContaining({ action: 'ACCEPTED', previousStatus: 'HELD' }),
);
```

- [ ] **Step 9: Run tests**

Run: `pnpm test -- --testPathPattern "manage-booking" --forceExit`
Expected: All tests PASS

- [ ] **Step 10: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 11: Commit**

```bash
git add src/app/actions/manage-booking.ts src/__tests__/actions/manage-booking.test.ts src/__tests__/actions/manage-booking-hold.test.ts
git commit -m "feat: add ACCEPTED/REJECTED/CANCELLED audit calls + wrap PENDING cancel in TX (Phase 5)"
```

---

### Task 6: EXPIRED audit call in sweep-expired-holds + deferred HELD mock

**Files:**
- Modify: `src/app/api/cron/sweep-expired-holds/route.ts:1,25-35,82-85,102-120`
- Modify: `src/__tests__/api/cron/sweep-expired-holds.test.ts`
- Modify: `src/__tests__/actions/booking-hold.test.ts`

- [ ] **Step 1: Add import to sweep-expired-holds/route.ts**

Add after line 23 of `src/app/api/cron/sweep-expired-holds/route.ts`:

```typescript
import { logBookingAudit } from '@/lib/booking-audit';
```

- [ ] **Step 2: Add `heldUntil` to SQL SELECT and TypeScript interface**

Update `ExpiredHoldInfo` interface (lines 25-35) to add:

```typescript
  slotsRequested: number;
  heldUntil: Date;
```

Update the raw SQL SELECT (line 82) to add `b."heldUntil",` after `b.version,`.

Update the inline TypeScript type of `expiredBookings` (lines 68-80) to add:

```typescript
  heldUntil: Date;
```

- [ ] **Step 3: Add EXPIRED audit call inside the for-loop**

Inside the `for (const hold of expiredBookings)` loop (starts at line 102), after the slot restore `$executeRaw` (line 119), add:

```typescript
        await logBookingAudit(tx, {
          bookingId: hold.id,
          action: 'EXPIRED',
          previousStatus: 'HELD',
          newStatus: 'EXPIRED',
          actorId: null,
          actorType: 'SYSTEM',
          details: { slotsRequested: hold.slotsRequested, heldUntil: hold.heldUntil },
        });
```

- [ ] **Step 4: Update `makeExpiredHold` factory + add audit mock/assertion to sweep-expired-holds.test.ts**

Add `heldUntil` to the `makeExpiredHold` factory helper (around line 85-111 of the test file). Add it to both the factory function's return object and its TypeScript type:

```typescript
heldUntil: overrides.heldUntil ?? new Date(Date.now() - 60000),
```

Add mock at top (before imports):

```typescript
jest.mock('@/lib/booking-audit', () => ({
  logBookingAudit: jest.fn(),
}));
```

Add import:

```typescript
import { logBookingAudit } from '@/lib/booking-audit';
```

Add test in the "expired hold processing" describe:

```typescript
it('calls logBookingAudit with EXPIRED action and SYSTEM actor', async () => {
  // ... (setup with one expired hold — makeExpiredHold now includes heldUntil)
  expect(logBookingAudit).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      action: 'EXPIRED',
      previousStatus: 'HELD',
      newStatus: 'EXPIRED',
      actorId: null,
      actorType: 'SYSTEM',
    }),
  );
});
```

- [ ] **Step 5: Add deferred audit mock to booking-hold.test.ts**

Add at top of `src/__tests__/actions/booking-hold.test.ts` (before imports):

```typescript
jest.mock('@/lib/booking-audit', () => ({
  logBookingAudit: jest.fn(),
}));
// TODO: Add HELD audit assertions when hold-creation action is built (Phase 5 section 3B)
```

- [ ] **Step 6: Run tests**

Run: `pnpm test -- --testPathPattern "sweep-expired-holds|booking-hold" --forceExit`
Expected: All tests PASS

- [ ] **Step 7: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/app/api/cron/sweep-expired-holds/route.ts src/__tests__/api/cron/sweep-expired-holds.test.ts src/__tests__/actions/booking-hold.test.ts
git commit -m "feat: add EXPIRED audit call in sweeper + add heldUntil to SELECT (Phase 5)"
```

---

## Chunk 4: Reconciliation Cron

### Task 7: Reconciliation Cron — Failing Tests

**Files:**
- Create: `src/__tests__/api/cron/reconcile-slots.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
/**
 * Tests for GET /api/cron/reconcile-slots route (Phase 5)
 *
 * Tests cron auth, feature flag gating, advisory lock, drift detection/fix,
 * safety threshold, markListingsDirty call, and structured logging.
 */

const mockQueryRaw = jest.fn();
const mockExecuteRaw = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

jest.mock('@/lib/cron-auth', () => ({
  validateCronAuth: jest.fn(),
}));

jest.mock('@/lib/env', () => ({
  features: {
    bookingAudit: true,
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    sync: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  },
}));

jest.mock('@/lib/search/search-doc-dirty', () => ({
  markListingsDirty: jest.fn(),
}));

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

jest.mock('next/server', () => ({
  NextRequest: class MockNextRequest extends Request {
    declare headers: Headers;
    constructor(url: string, init?: RequestInit) {
      super(url, init);
    }
  },
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}));

import { GET } from '@/app/api/cron/reconcile-slots/route';
import { prisma } from '@/lib/prisma';
import { validateCronAuth } from '@/lib/cron-auth';
import { features } from '@/lib/env';
import { markListingsDirty } from '@/lib/search/search-doc-dirty';
import * as Sentry from '@sentry/nextjs';
import { NextRequest } from 'next/server';

function createRequest(authHeader?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (authHeader) headers['authorization'] = authHeader;
  return new NextRequest('http://localhost:3000/api/cron/reconcile-slots', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/cron/reconcile-slots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateCronAuth as jest.Mock).mockReturnValue(null);
    (features as any).bookingAudit = true;
  });

  it('returns 401 without valid CRON_SECRET', async () => {
    const mockResp = { status: 401, json: async () => ({ error: 'Unauthorized' }) };
    (validateCronAuth as jest.Mock).mockReturnValue(mockResp);

    const response = await GET(createRequest());
    expect(response.status).toBe(401);
  });

  it('returns skipped when feature flag off', async () => {
    (features as any).bookingAudit = false;

    const response = await GET(createRequest('Bearer valid'));
    const data = await response.json();
    expect(data.skipped).toBe(true);
    expect(data.reason).toBe('ENABLE_BOOKING_AUDIT is off');
  });

  it('skips when advisory lock not acquired', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      return fn({
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([{ locked: false }]),
      });
    });

    const response = await GET(createRequest('Bearer valid'));
    const data = await response.json();
    expect(data.skipped).toBe(true);
    expect(data.reason).toBe('lock_held');
  });

  it('detects drift and fixes when delta <= 5', async () => {
    const driftRows = [{ id: 'listing-1', actual: 3, expected: 2 }];
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([{ locked: true }])
          .mockResolvedValueOnce(driftRows),
        $executeRaw: jest.fn().mockResolvedValue(1),
      };
      return fn(tx);
    });

    const response = await GET(createRequest('Bearer valid'));
    const data = await response.json();
    expect(data.reconciled).toBe(1);
  });

  it('calls markListingsDirty after auto-fix', async () => {
    const driftRows = [{ id: 'listing-1', actual: 3, expected: 2 }];
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([{ locked: true }])
          .mockResolvedValueOnce(driftRows),
        $executeRaw: jest.fn().mockResolvedValue(1),
      };
      return fn(tx);
    });

    await GET(createRequest('Bearer valid'));
    expect(markListingsDirty).toHaveBeenCalledWith(['listing-1'], 'reconcile_slots');
  });

  it('does NOT auto-fix when abs(delta) > 5', async () => {
    const driftRows = [{ id: 'listing-1', actual: 10, expected: 2 }];
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([{ locked: true }])
          .mockResolvedValueOnce(driftRows),
        $executeRaw: jest.fn(),
      };
      return fn(tx);
    });

    const response = await GET(createRequest('Bearer valid'));
    const data = await response.json();
    expect(data.reconciled).toBe(0);
    expect(data.alertedOnly).toBe(1);
    expect(Sentry.captureMessage).toHaveBeenCalled();
  });

  it('returns zero reconciled when no drift found', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn()
          .mockResolvedValueOnce([{ locked: true }])
          .mockResolvedValueOnce([]),
      };
      return fn(tx);
    });

    const response = await GET(createRequest('Bearer valid'));
    const data = await response.json();
    expect(data.reconciled).toBe(0);
    expect(data.drifted).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --testPathPattern reconcile-slots --forceExit`
Expected: FAIL — `Cannot find module '@/app/api/cron/reconcile-slots/route'`

- [ ] **Step 3: Commit failing tests**

```bash
git add src/__tests__/api/cron/reconcile-slots.test.ts
git commit -m "test: add failing tests for reconcile-slots cron (Phase 5)"
```

---

### Task 8: Reconciliation Cron — Implementation

**Files:**
- Create: `src/app/api/cron/reconcile-slots/route.ts`

- [ ] **Step 1: Write the implementation**

```typescript
/**
 * Reconcile Slots Cron Route (Phase 5 - Audit Trail)
 *
 * Weekly safety net detecting and fixing availableSlots drift.
 * Uses SUM(slotsRequested) to correctly count consumed slots.
 *
 * Schedule: 0 5 * * 0 (Sunday 5:00 AM UTC)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { validateCronAuth } from '@/lib/cron-auth';
import { features } from '@/lib/env';
import { markListingsDirty } from '@/lib/search/search-doc-dirty';
import * as Sentry from '@sentry/nextjs';
import { RECONCILER_ADVISORY_LOCK_KEY } from '@/lib/hold-constants';

interface DriftRow {
  id: string;
  actual: number;
  expected: number;
}

const AUTO_FIX_THRESHOLD = 5;

export async function GET(request: NextRequest) {
  try {
    const authError = validateCronAuth(request);
    if (authError) return authError;

    if (!features.bookingAudit) {
      return NextResponse.json({
        skipped: true,
        reason: 'ENABLE_BOOKING_AUDIT is off',
      });
    }

    const startTime = Date.now();

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Acquire advisory lock (transaction-scoped, auto-releases on commit)
      const [lockResult] = await tx.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${RECONCILER_ADVISORY_LOCK_KEY})) as locked
      `;

      if (!lockResult.locked) {
        return { skipped: true, reason: 'lock_held' } as const;
      }

      // Detect drift using SUM(slotsRequested), not COUNT
      const driftRows = await tx.$queryRaw<DriftRow[]>`
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
      `;

      const fixedIds: string[] = [];
      let alertedOnly = 0;

      for (const row of driftRows) {
        const delta = Math.abs(Number(row.actual) - Number(row.expected));

        logger.sync.info('[reconcile-slots] Drift detected', {
          event: 'slot_drift_detected',
          listingId: row.id.slice(0, 8) + '...',
          actual: Number(row.actual),
          expected: Number(row.expected),
          delta,
        });

        if (delta <= AUTO_FIX_THRESHOLD) {
          await tx.$executeRaw`
            UPDATE "Listing"
            SET "availableSlots" = ${Number(row.expected)}
            WHERE id = ${row.id}
          `;
          fixedIds.push(row.id);
        } else {
          Sentry.captureMessage(
            `[reconcile-slots] Large slot drift detected (delta=${delta})`,
            { level: 'warning', extra: { listingId: row.id, actual: row.actual, expected: row.expected, delta } },
          );
          alertedOnly++;
        }
      }

      return { skipped: false, drifted: driftRows.length, fixedIds, alertedOnly } as const;
    });

    if (result.skipped) {
      return NextResponse.json({
        success: true,
        reconciled: 0,
        skipped: true,
        reason: result.reason,
      });
    }

    // Mark fixed listings dirty for search doc refresh (OUTSIDE TX)
    if (result.fixedIds.length > 0) {
      await markListingsDirty(result.fixedIds, 'reconcile_slots');
    }

    const durationMs = Date.now() - startTime;

    logger.sync.info('[reconcile-slots] Reconciliation complete', {
      event: 'reconcile_slots_complete',
      drifted: result.drifted,
      reconciled: result.fixedIds.length,
      alertedOnly: result.alertedOnly,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      drifted: result.drifted,
      reconciled: result.fixedIds.length,
      alertedOnly: result.alertedOnly,
      skipped: false,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.sync.error('[reconcile-slots] Reconciliation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Reconciler failed' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm test -- --testPathPattern reconcile-slots --forceExit`
Expected: All 7 tests PASS

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/reconcile-slots/route.ts
git commit -m "feat: implement reconcile-slots cron with SUM-based drift detection (Phase 5)"
```

---

## Chunk 5: GET Audit Endpoint

### Task 9: GET Audit Endpoint — Failing Tests

**Files:**
- Create: `src/__tests__/api/bookings/audit.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
/**
 * Tests for GET /api/bookings/[id]/audit route (Phase 5)
 *
 * Tests feature flag, auth, input validation, authorization (tenant/host/admin),
 * response shape, chronological order, and PII exclusion.
 */

jest.mock('@/lib/prisma', () => ({
  prisma: {
    booking: {
      findUnique: jest.fn(),
    },
    bookingAuditLog: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/env', () => ({
  features: {
    bookingAudit: true,
  },
}));

jest.mock('next/server', () => ({
  NextRequest: class MockNextRequest extends Request {
    declare headers: Headers;
    constructor(url: string, init?: RequestInit) {
      super(url, init);
    }
  },
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}));

import { GET } from '@/app/api/bookings/[id]/audit/route';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { features } from '@/lib/env';
import { NextRequest } from 'next/server';

function createRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/bookings/booking-1/audit', {
    method: 'GET',
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/bookings/[id]/audit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (features as any).bookingAudit = true;
    (auth as jest.Mock).mockResolvedValue({
      user: { id: 'tenant-1', isAdmin: false },
    });
  });

  it('returns 404 when feature flag off', async () => {
    (features as any).bookingAudit = false;
    const response = await GET(createRequest(), makeParams('booking-1'));
    expect(response.status).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    const response = await GET(createRequest(), makeParams('booking-1'));
    expect(response.status).toBe(401);
  });

  it('returns 400 for empty bookingId', async () => {
    const response = await GET(createRequest(), makeParams(''));
    expect(response.status).toBe(400);
  });

  it('returns 400 for bookingId longer than 30 chars', async () => {
    const longId = 'a'.repeat(31);
    const response = await GET(createRequest(), makeParams(longId));
    expect(response.status).toBe(400);
  });

  it('returns 404 when booking not found', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue(null);
    const response = await GET(createRequest(), makeParams('booking-1'));
    expect(response.status).toBe(404);
  });

  it('returns 403 when user is neither tenant, host, nor admin', async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: { id: 'stranger-1', isAdmin: false },
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
      id: 'booking-1',
      tenantId: 'tenant-1',
      listing: { ownerId: 'host-1' },
    });

    const response = await GET(createRequest(), makeParams('booking-1'));
    expect(response.status).toBe(403);
  });

  it('returns audit entries for tenant', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
      id: 'booking-1',
      tenantId: 'tenant-1',
      listing: { ownerId: 'host-1' },
    });
    (prisma.bookingAuditLog.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'audit-1',
        action: 'CREATED',
        previousStatus: null,
        newStatus: 'PENDING',
        actorType: 'USER',
        actorId: 'tenant-1',
        details: { slotsRequested: 1 },
        createdAt: new Date('2026-03-12T00:00:00Z'),
      },
    ]);

    const response = await GET(createRequest(), makeParams('booking-1'));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.bookingId).toBe('booking-1');
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].action).toBe('CREATED');
  });

  it('returns audit entries for host (listing owner)', async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: { id: 'host-1', isAdmin: false },
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
      id: 'booking-1',
      tenantId: 'tenant-1',
      listing: { ownerId: 'host-1' },
    });
    (prisma.bookingAuditLog.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET(createRequest(), makeParams('booking-1'));
    expect(response.status).toBe(200);
  });

  it('returns audit entries for admin', async () => {
    (auth as jest.Mock).mockResolvedValue({
      user: { id: 'admin-1', isAdmin: true },
    });
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
      id: 'booking-1',
      tenantId: 'tenant-1',
      listing: { ownerId: 'host-1' },
    });
    (prisma.bookingAuditLog.findMany as jest.Mock).mockResolvedValue([]);

    const response = await GET(createRequest(), makeParams('booking-1'));
    expect(response.status).toBe(200);
  });

  it('response excludes actorId (PII protection)', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
      id: 'booking-1',
      tenantId: 'tenant-1',
      listing: { ownerId: 'host-1' },
    });
    (prisma.bookingAuditLog.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'audit-1',
        action: 'CREATED',
        previousStatus: null,
        newStatus: 'PENDING',
        actorType: 'USER',
        actorId: 'tenant-1',
        details: null,
        createdAt: new Date('2026-03-12T00:00:00Z'),
      },
    ]);

    const response = await GET(createRequest(), makeParams('booking-1'));
    const data = await response.json();
    expect(data.entries[0]).not.toHaveProperty('actorId');
  });

  it('entries ordered by createdAt ASC', async () => {
    (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
      id: 'booking-1',
      tenantId: 'tenant-1',
      listing: { ownerId: 'host-1' },
    });

    await GET(createRequest(), makeParams('booking-1'));

    expect(prisma.bookingAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'asc' },
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --testPathPattern "bookings/audit" --forceExit`
Expected: FAIL — `Cannot find module '@/app/api/bookings/[id]/audit/route'`

- [ ] **Step 3: Commit failing tests**

```bash
git add src/__tests__/api/bookings/audit.test.ts
git commit -m "test: add failing tests for GET /api/bookings/[id]/audit (Phase 5)"
```

---

### Task 10: GET Audit Endpoint — Implementation

**Files:**
- Create: `src/app/api/bookings/[id]/audit/route.ts`

- [ ] **Step 1: Write the implementation**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { features } from '@/lib/env';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!features.bookingAudit) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Input validation
  if (!id || id.length > 30) {
    return NextResponse.json({ error: 'Invalid booking ID' }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { listing: { select: { ownerId: true } } },
  });

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // Authorization: tenant, host, or admin
  const userId = session.user.id;
  const isAuthorized =
    userId === booking.tenantId ||
    userId === booking.listing.ownerId ||
    session.user.isAdmin;

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const auditLogs = await prisma.bookingAuditLog.findMany({
    where: { bookingId: id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      action: true,
      previousStatus: true,
      newStatus: true,
      actorType: true,
      details: true,
      createdAt: true,
      // actorId intentionally excluded — PII protection
    },
  });

  return NextResponse.json({
    bookingId: id,
    entries: auditLogs,
  });
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm test -- --testPathPattern "bookings/audit" --forceExit`
Expected: All 10 tests PASS

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/bookings/[id]/audit/route.ts
git commit -m "feat: implement GET /api/bookings/[id]/audit endpoint (Phase 5)"
```

---

## Chunk 6: vercel.json + Final Verification

### Task 11: Add cron entries to vercel.json

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add 2 cron entries**

In `vercel.json`, add these 2 entries to the `crons` array (after the `cleanup-idempotency-keys` entry):

```json
    {
      "path": "/api/cron/sweep-expired-holds",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/reconcile-slots",
      "schedule": "0 5 * * 0"
    }
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: add sweep-expired-holds and reconcile-slots cron entries (Phase 5)"
```

---

### Task 12: Full Verification

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: No errors

- [ ] **Step 3: Run ALL tests**

Run: `pnpm test -- --forceExit`
Expected: All tests PASS

- [ ] **Step 4: Verify no PII in audit details**

Manually check all `logBookingAudit` calls in modified files — confirm `details` objects contain only IDs and machine values (slotsRequested, version, listingId, rejectionReason, heldUntil, previousStatus). No email, phone, name, or address.

- [ ] **Step 5: Final commit message**

If any lint/test fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: address lint/test issues from Phase 5 integration"
```
