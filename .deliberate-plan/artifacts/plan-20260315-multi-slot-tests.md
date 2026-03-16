# Deliberate Plan: Multi-Slot Booking Unit Tests for Production Readiness

**Task Type**: IMPLEMENT (test suite)
**Date**: 2026-03-15
**Confidence Score**: 4.6/5.0 (HIGH)

---

## Executive Summary

Write a comprehensive unit test suite for the multi-slot booking feature such that **if all tests pass, the feature is stable and production-ready**. The strategy is: map every business invariant → verify each has a test → fill gaps → organize tests so coverage = confidence.

The existing codebase already has ~285+ booking-related tests across 19 files. This plan identifies **specific gaps** where passing tests do NOT guarantee production safety, and prescribes exactly which tests to add, where, and why.

---

## Confidence Score

| Dimension | Weight | Score | Justification |
|-----------|--------|-------|---------------|
| Research Grounding | 15% | 5 | Full codebase analysis with 3 parallel research agents |
| Codebase Accuracy | 25% | 5 | Every file path, function, and API verified by reading source |
| Assumption Freedom | 20% | 4 | All invariants traced to code; some gap in understanding payment flows |
| Completeness | 15% | 5 | All 19 existing test files inventoried; gaps identified |
| Harsh Critic Verdict | 15% | 4 | Conditional pass — mock fidelity is inherent risk |
| Specificity | 10% | 4 | Each test has exact file, describe block, test name |

**Overall: 4.6/5.0 — HIGH. Execute with standard review.**

---

## Existing Coverage Audit

### Well-Covered (existing tests are sufficient — no new tests needed)

| Area | File(s) | Tests | Verdict |
|------|---------|-------|---------|
| State machine transitions | `booking-state-machine.test.ts` | ~50+ | Complete matrix coverage |
| Booking creation auth/validation | `booking.test.ts` | 16 | Auth, price, UTC dates covered |
| Zod schema validation (slotsRequested) | `booking-slots-validation.test.ts` | 11 | Bounds, type, feature flag covered |
| WHOLE_UNIT auto-set | `booking-whole-unit.test.ts` | 7 | Override, capacity, regression covered |
| Hold creation (happy + error paths) | `booking-hold.test.ts` | 25 | Feature flags, max holds, capacity, duplicates, idempotency, rate limit, TTL |
| Hold management transitions | `manage-booking-hold.test.ts` | 14 | No-double-decrement, expiry, authorization, WHOLE_UNIT |
| Booking management (accept/reject/cancel) | `manage-booking.test.ts` | 37 | Authorization, slots, notifications, suspension, email resilience |
| WHOLE_UNIT management | `manage-booking-whole-unit.test.ts` | 9 | Overlap blocking, mode-change guard |
| Race conditions | `race-condition.test.ts` | 11 | SERIALIZABLE, FOR UPDATE, P2034 retry |
| WHOLE_UNIT concurrent | `whole-unit-concurrent.test.ts` | 3 | Double-accept, trigger error |
| Idempotency wrapper | `idempotency.test.ts` | 10 | Replay, hash mismatch, retry, rollback |
| Audit logging | `booking-audit.test.ts` | 15 | All actions, PII stripping, TX isolation |
| Booking utilities | `booking-utils.test.ts` | 14 | Active queries, counts, HELD inclusion |
| Listing availability (ghost holds) | `listing-availability.test.ts` | 4 | Ghost hold adjustment |
| Sweeper cron | `sweep-expired-holds.test.ts` | 10 | Expiry, slots, advisory lock, drain, auth |
| Reconciler cron | `reconcile-slots.test.ts` | 7 | Drift detection, auto-fix, threshold |
| Rate limiting | `booking-rate-limit.test.ts` | 4 | Per-user, per-IP, pre-transaction |
| Feature flag cross-validation | `env-feature-flags.test.ts` | 9 | All dependency chains |
| HoldCountdown component | `HoldCountdown.test.tsx` | 8 | Timer, colors, expiry callback |
| SlotBadge component | `SlotBadge.test.tsx` | 15 | All states, clamping, overlay |
| SlotSelector component | `SlotSelector.test.tsx` | 7 | Boundaries, clamping, disabled |
| BookingForm component | `BookingForm.test.tsx` | 21 | Rendering, login gate, status, idempotency |

### GAP ANALYSIS: Tests That Must Be Added

The following are gaps where **all existing tests could pass but a production bug could still ship**.

---

## Implementation Plan: New Tests to Write

### PRIORITY 1 (BLOCKERS — Must exist for production safety)

#### Gap 1: Multi-slot slot arithmetic across the full lifecycle

**Problem**: Individual operations (create, accept, cancel) are tested, but there is NO single test that traces a multi-slot booking through its complete lifecycle verifying slot counts at every step.

**File**: `src/__tests__/booking/multi-slot-lifecycle.test.ts` (NEW)

```
describe('Multi-slot booking lifecycle — slot arithmetic invariants')
  describe('SHARED mode: slotsRequested=3, totalSlots=5')
    it('PENDING booking does not consume slots')
      // Create booking with slotsRequested=3 → availableSlots stays 5
    it('ACCEPTED booking decrements by slotsRequested')
      // Accept → availableSlots goes from 5 to 2
    it('CANCELLED (after accept) restores slotsRequested')
      // Cancel accepted → availableSlots goes from 2 back to 5
    it('availableSlots never exceeds totalSlots after double-cancel')
      // Cancel + re-restore → LEAST clamp prevents 5+3=8 > 5

  describe('HELD mode: slotsRequested=3, totalSlots=5')
    it('HELD booking decrements slots at creation')
      // Create hold → availableSlots goes from 5 to 2
    it('HELD→ACCEPTED does NOT decrement again')
      // Accept hold → availableSlots stays 2
    it('HELD→EXPIRED restores slotsRequested')
      // Expire → availableSlots goes from 2 to 5
    it('HELD→REJECTED restores slotsRequested')
      // Reject → availableSlots goes from 2 to 5
    it('HELD→CANCELLED restores slotsRequested')
      // Cancel → availableSlots goes from 2 to 5

  describe('WHOLE_UNIT mode: totalSlots=4')
    it('forces slotsRequested=totalSlots regardless of input')
      // Create with slotsRequested=1 → stored as 4
    it('ACCEPTED consumes all totalSlots')
      // Accept → availableSlots = 0
    it('CANCELLED restores all totalSlots')
      // Cancel → availableSlots = 4

  describe('Mixed concurrent bookings: PENDING + HELD coexistence')
    it('HELD slots are counted in capacity check for new PENDING booking')
      // totalSlots=5, HELD with 3 → new booking with slotsRequested=3 fails (3+3=6>5)
    it('HELD slots are counted in capacity check for PENDING→ACCEPTED')
      // totalSlots=5, HELD=3, PENDING=3 → accepting PENDING fails (3+3=6>5)
    it('expired HELD slots are excluded from capacity check')
      // totalSlots=5, expired HELD with 3 → new booking with 3 succeeds (0+3=3<=5)
```

**Why**: This is the single most important gap. Each operation is tested in isolation, but a bug in the interaction between create→accept→cancel→restore across SHARED/HELD/WHOLE_UNIT modes would not be caught.

---

#### Gap 2: Slot boundary conditions (zero slots, exact capacity, overflow/underflow)

**Problem**: Edge cases around exact boundaries are partially covered in `bookings-edge-cases.test.ts` but use simplified mock logic, not the actual server action code path.

**File**: `src/__tests__/booking/multi-slot-boundaries.test.ts` (NEW)

```
describe('Multi-slot boundary conditions')
  describe('Exact capacity fill')
    it('booking that fills exactly to 0 availableSlots succeeds')
      // slotsRequested=5, totalSlots=5, usedSlots=0 → succeeds, availableSlots=0
    it('booking that would go 1 slot over capacity fails')
      // slotsRequested=3, totalSlots=5, usedSlots=3 → fails (3+3=6>5)
    it('hold that fills exactly to 0 availableSlots succeeds')
      // slotsRequested=5, totalSlots=5 → succeeds

  describe('Slot restoration clamping')
    it('restoring slots after drift does not exceed totalSlots')
      // Simulate: availableSlots=4, cancel booking with slotsRequested=3
      // → LEAST(4+3, 5) = 5, not 7
    it('restoring slots from 0 to partial works correctly')
      // availableSlots=0, cancel booking with slotsRequested=3, totalSlots=5
      // → LEAST(0+3, 5) = 3

  describe('slotsRequested edge values')
    it('slotsRequested=1 (minimum) works for all operations')
    it('slotsRequested=20 (maximum allowed by Zod) works when totalSlots >= 20')
    it('slotsRequested > availableSlots but <= totalSlots fails capacity check')
      // totalSlots=10, availableSlots=2, slotsRequested=5 → fails
```

---

#### Gap 3: Concurrent multi-slot operations (two users competing for limited slots)

**Problem**: `race-condition.test.ts` tests serialization retry but does NOT test the scenario where two multi-slot bookings compete for the LAST available slots.

**File**: `src/__tests__/booking/multi-slot-concurrency.test.ts` (NEW)

```
describe('Multi-slot concurrent operations')
  describe('Two bookings competing for last slots')
    it('first booking succeeds, second fails when combined slotsRequested > remaining')
      // totalSlots=5, usedSlots=2, booking1=2, booking2=2 → first succeeds (2+2=4<=5), second fails (4+2=6>5)
    it('both succeed when combined slotsRequested <= remaining capacity')
      // totalSlots=5, usedSlots=0, booking1=2, booking2=2 → both succeed

  describe('Hold + booking competing for last slots')
    it('hold created first blocks subsequent booking when capacity full')
      // totalSlots=5, hold=3, booking=3 → booking fails (hold counted in capacity)
    it('expired hold does not block subsequent booking')
      // totalSlots=5, expired hold=3, booking=3 → booking succeeds (expired excluded)

  describe('Accept race for WHOLE_UNIT')
    it('two PENDING bookings: accepting first blocks accepting second')
      // WHOLE_UNIT totalSlots=4, two PENDING bookings → first accept succeeds, second fails
    it('version conflict on concurrent accept returns CONCURRENT_MODIFICATION')
      // Same booking accepted twice simultaneously → version check catches it

  describe('Hold + Accept race')
    it('hold creation during pending accept — capacity check sees the HELD slots')
      // totalSlots=5, PENDING being accepted for 3, concurrent hold for 3 → one succeeds, other fails
```

---

#### Gap 4: BookingsClient component tests (ZERO coverage)

**Problem**: `BookingsClient.tsx` is the main dashboard for managing bookings. It renders sent/received tabs, status filters, accept/reject/cancel dialogs. It has NO tests.

**File**: `src/__tests__/components/BookingsClient.test.tsx` (NEW)

```
describe('BookingsClient')
  describe('Tab rendering')
    it('renders "Sent" and "Received" tabs')
    it('defaults to "Sent" tab')
    it('switches to "Received" tab on click')

  describe('Booking list display')
    it('renders sent bookings with correct status badges')
    it('renders received bookings with listing info')
    it('shows empty state when no bookings')

  describe('Status filter chips')
    it('renders filter chips for each status')
    it('filters bookings by selected status')
    it('shows count per status')

  describe('Action buttons')
    it('shows Cancel button for tenant on PENDING booking')
    it('shows Cancel button for tenant on ACCEPTED booking')
    it('shows Accept/Reject buttons for host on PENDING booking')
    it('shows Accept/Reject buttons for host on HELD booking')
    it('does not show action buttons for terminal states')

  describe('Confirmation dialogs')
    it('shows confirmation dialog before accepting')
    it('shows confirmation dialog before rejecting with reason input')
    it('shows confirmation dialog before cancelling')

  describe('HELD booking display')
    it('shows HoldCountdown for HELD bookings')
    it('shows hold expiry warning when < 2 minutes remain')

  describe('Multi-slot display')
    it('shows slotsRequested in booking card for multi-slot bookings')
    it('shows "Entire unit" label for WHOLE_UNIT bookings')

  describe('Calendar view')
    it('toggles between list and calendar view')
    it('renders BookingCalendar in calendar view mode')

  describe('Error handling')
    it('shows error toast on failed status update')
    it('refreshes booking list after successful status update')
```

---

### PRIORITY 2 (HIGH — Should exist for confidence)

#### Gap 5: Multi-slot feature flag interaction matrix

**Problem**: Feature flags are tested individually but not as a matrix. The interaction between `multiSlotBooking=OFF` + various operations is not fully covered.

**File**: `src/__tests__/booking/multi-slot-feature-flags.test.ts` (NEW)

```
describe('Multi-slot feature flag interaction matrix')
  describe('multiSlotBooking=OFF')
    it('createBooking with slotsRequested=1 succeeds (default path)')
    it('createBooking with slotsRequested=2 returns FEATURE_DISABLED')
    it('createHold with slotsRequested=1 succeeds (if softHolds=ON and multiSlot=ON)')
    it('createHold with slotsRequested=2 returns FEATURE_DISABLED')
    it('updateBookingStatus still works for existing multi-slot bookings')
      // Feature flag should not block management of already-created bookings

  describe('softHoldsEnabled=OFF')
    it('createHold returns FEATURE_DISABLED regardless of slotsRequested')
    it('existing HELD bookings can still be accepted/rejected/cancelled')
    it('sweeper still runs in OFF mode? (no — returns skipped)')

  describe('softHoldsEnabled=DRAIN')
    it('createHold returns FEATURE_DISABLED')
    it('existing HELD bookings can still be managed')
    it('sweeper runs and expires remaining holds')

  describe('wholeUnitMode=ON, multiSlotBooking=OFF')
    it('env.ts validation throws on startup')
    // This combination is invalid per cross-validation rules

  describe('bookingAudit=ON, softHolds=OFF')
    it('env.ts validation throws on startup')
    // This combination is invalid per cross-validation rules
```

---

#### Gap 6: Hold TTL edge cases

**Problem**: Per-listing TTL is tested for basic paths but not for edge cases.

**File**: Add to existing `src/__tests__/actions/booking-hold.test.ts`

```
describe('hold TTL edge cases')
  it('holdTtlMinutes=0 creates a hold that is immediately expired by sweeper')
    // Edge case: 0 TTL → heldUntil = now → sweeper expires immediately
  it('holdTtlMinutes=1440 (24 hours) sets correct heldUntil')
    // Long TTL
  it('holdTtlMinutes=null falls back to HOLD_TTL_MINUTES (15)')
    // Null TTL field
  it('hold created at exact TTL boundary (heldUntil === current time) is treated as expired')
    // Boundary: heldUntil === now → should be expired
```

---

#### Gap 7: Booking audit trail completeness for multi-slot operations

**Problem**: Audit tests verify individual actions but not that the `details` field contains `slotsRequested` for multi-slot operations.

**File**: Add to existing `src/__tests__/lib/booking-audit.test.ts`

```
describe('multi-slot audit details')
  it('CREATED action includes slotsRequested in details')
  it('HELD action includes slotsRequested and heldUntil in details')
  it('ACCEPTED action includes slotsRequested in details')
  it('CANCELLED action includes slotsRequested and slot restoration amount in details')
  it('EXPIRED action includes slotsRequested in details')
```

---

#### Gap 8: Block check + multi-slot interaction

**Problem**: Block checks are tested for single-slot but not verified to work with multi-slot bookings.

**File**: Add to existing `src/__tests__/actions/booking-slots-validation.test.ts`

```
describe('block check with multi-slot bookings')
  it('blocked user cannot create multi-slot booking (slotsRequested=3)')
  it('blocked user cannot create multi-slot hold')
  it('block check happens before capacity check (no slot leak)')
```

---

#### Gap 9: Duplicate booking detection with different slotsRequested

**Problem**: Duplicate prevention is tested for same dates, but what about same dates with different slotsRequested?

**File**: Add to existing `src/__tests__/actions/booking-hold.test.ts` or new section

```
describe('duplicate detection edge cases')
  it('rejects duplicate even when slotsRequested differs')
    // User has PENDING for 2 slots → new booking for 3 slots same dates = duplicate
  it('allows booking after previous one is EXPIRED')
    // EXPIRED (terminal) → new booking for same dates succeeds
  it('allows booking after previous one is CANCELLED')
    // CANCELLED (terminal) → new booking succeeds
  it('allows booking after previous one is REJECTED')
    // REJECTED (terminal) → new booking succeeds
```

---

### PRIORITY 3 (MEDIUM — Strengthens confidence)

#### Gap 10: BookingCalendar component tests (ZERO coverage)

**File**: `src/__tests__/components/BookingCalendar.test.tsx` (NEW)

```
describe('BookingCalendar')
  it('renders calendar grid with current month')
  it('highlights dates with bookings')
  it('shows booking count per date')
  it('color-codes by booking status')
  it('navigates between months')
  it('shows booking details on date click')
  it('handles months with no bookings')
```

---

#### Gap 11: Email notification content for multi-slot bookings

**Problem**: Email templates include multi-slot info but template rendering is not tested.

**File**: `src/__tests__/lib/email-templates-booking.test.ts` (NEW)

```
describe('Booking email templates')
  describe('bookingRequest')
    it('includes slotsRequested when > 1')
    it('shows "1 slot" for single-slot bookings')
    it('shows "Entire unit" for WHOLE_UNIT bookings')
  describe('bookingAccepted')
    it('includes slotsRequested in acceptance email')
  describe('bookingRejected')
    it('includes rejection reason when provided')
  describe('bookingHoldRequest')
    it('includes hold TTL and slotsRequested')
```

---

#### Gap 12: Sweeper with multi-slot holds (batch scenario)

**Problem**: Sweeper tests verify single-hold expiry but not batch scenarios with varying slotsRequested.

**File**: Add to existing `src/__tests__/api/cron/sweep-expired-holds.test.ts`

```
describe('sweeper with multi-slot holds')
  it('restores correct slotsRequested for each hold in batch')
    // Hold A: 2 slots on Listing X, Hold B: 3 slots on Listing Y → both restored correctly
  it('restores slots for multiple holds on same listing')
    // Hold A: 2 slots, Hold B: 1 slot, same listing, totalSlots=5
    // → availableSlots increases by 3 total (2+1)
  it('slot restoration does not exceed totalSlots even with multiple restores')
    // Two holds totaling more than totalSlots → LEAST clamp prevents overflow
```

---

#### Gap 13: Reconciler with multi-slot bookings

**Problem**: Reconciler tests don't verify it correctly handles multiple HELD bookings with different slotsRequested.

**File**: Add to existing `src/__tests__/api/cron/reconcile-slots.test.ts`

```
describe('reconciler with multi-slot bookings')
  it('correctly sums slotsRequested across ACCEPTED and active HELD bookings')
    // ACCEPTED: 2 slots, HELD (active): 3 slots → expected used = 5
  it('excludes expired HELD bookings from expected calculation')
    // ACCEPTED: 2, HELD expired: 3 → expected used = 2
  it('detects drift caused by failed slot restoration')
    // availableSlots=3 but should be 1 → drift = 2, auto-fix
```

---

## Dependency Graph

```
Priority 1 (blockers):
  Gap 1 (lifecycle) ─── no dependencies, start first
  Gap 2 (boundaries) ── depends on understanding Gap 1 patterns
  Gap 3 (concurrency) ─ depends on Gap 1 mock patterns
  Gap 4 (BookingsClient) ── independent, can parallel

Priority 2 (high):
  Gap 5 (feature flags) ── independent
  Gap 6 (TTL edges) ── add to existing file
  Gap 7 (audit details) ── add to existing file
  Gap 8 (block + multi-slot) ── add to existing file
  Gap 9 (duplicate edges) ── add to existing file

Priority 3 (medium):
  Gap 10 (calendar) ── independent
  Gap 11 (email templates) ── independent
  Gap 12 (sweeper batch) ── add to existing file
  Gap 13 (reconciler) ── add to existing file
```

---

## Execution Sequence

### Phase A: New Core Test Files (Priority 1)
1. `src/__tests__/booking/multi-slot-lifecycle.test.ts` — Gap 1 (13 tests)
2. `src/__tests__/booking/multi-slot-boundaries.test.ts` — Gap 2 (8 tests)
3. `src/__tests__/booking/multi-slot-concurrency.test.ts` — Gap 3 (8 tests)
4. `src/__tests__/components/BookingsClient.test.tsx` — Gap 4 (22 tests)

### Phase B: Augment Existing Files (Priority 2)
5. `src/__tests__/booking/multi-slot-feature-flags.test.ts` — Gap 5 (11 tests)
6. Add TTL tests to `booking-hold.test.ts` — Gap 6 (4 tests)
7. Add audit tests to `booking-audit.test.ts` — Gap 7 (5 tests)
8. Add block tests to `booking-slots-validation.test.ts` — Gap 8 (3 tests)
9. Add duplicate tests to `booking-hold.test.ts` — Gap 9 (4 tests)

### Phase C: Component + Infrastructure Tests (Priority 3)
10. `src/__tests__/components/BookingCalendar.test.tsx` — Gap 10 (7 tests)
11. `src/__tests__/lib/email-templates-booking.test.ts` — Gap 11 (7 tests)
12. Add sweeper tests to `sweep-expired-holds.test.ts` — Gap 12 (3 tests)
13. Add reconciler tests to `reconcile-slots.test.ts` — Gap 13 (3 tests)

### Phase D: Verification
14. Run full test suite: `pnpm test`
15. Run booking-specific tests: `pnpm test -- --testPathPattern="booking|hold|slot|manage-booking|sweep|reconcile|audit|BookingForm|BookingsClient|BookingCalendar|SlotBadge|SlotSelector|HoldCountdown|email-template|availability|feature-flag"`
16. Verify zero regressions
17. Check coverage report: `pnpm test:coverage -- --testPathPattern="booking|hold|slot"`

**Total new tests: ~98 across 6 new files + 7 augmented files**
**Combined with existing: ~385+ booking-related tests**

---

## Test Strategy: "All Pass = Production Ready" Guarantee

### What passing all tests proves:

| Invariant | Proved By |
|-----------|-----------|
| State machine is correct | `booking-state-machine.test.ts` (50+ transitions) |
| Slots never go negative | `multi-slot-boundaries.test.ts` (conditional UPDATE guard) |
| Slots never exceed totalSlots | `multi-slot-boundaries.test.ts` + `multi-slot-lifecycle.test.ts` (LEAST clamp) |
| PENDING doesn't consume slots | `multi-slot-lifecycle.test.ts` |
| HELD consumes at creation | `multi-slot-lifecycle.test.ts` + `booking-hold.test.ts` |
| HELD→ACCEPTED doesn't double-decrement | `manage-booking-hold.test.ts` + `multi-slot-lifecycle.test.ts` |
| Cancelled/expired/rejected bookings restore slots | `multi-slot-lifecycle.test.ts` (full trace) |
| WHOLE_UNIT forces slotsRequested=totalSlots | `booking-whole-unit.test.ts` + `multi-slot-lifecycle.test.ts` |
| Capacity check includes HELD | `booking-hold.test.ts` + `multi-slot-concurrency.test.ts` |
| Expired holds excluded from capacity | `multi-slot-concurrency.test.ts` |
| Race conditions prevented | `race-condition.test.ts` + `multi-slot-concurrency.test.ts` |
| Idempotency works | `idempotency.test.ts` |
| Feature flags gate correctly | `multi-slot-feature-flags.test.ts` + existing |
| Auth/authz enforced | `manage-booking.test.ts` + `booking.test.ts` |
| PII stripped from audit | `booking-audit.test.ts` |
| Rate limiting works | `booking-rate-limit.test.ts` |
| Sweeper expires + restores | `sweep-expired-holds.test.ts` + new batch tests |
| Reconciler detects + fixes drift | `reconcile-slots.test.ts` + new multi-slot tests |
| UI correctly shows slots | `SlotBadge.test.tsx` + `SlotSelector.test.tsx` + `BookingForm.test.tsx` |
| Dashboard works | `BookingsClient.test.tsx` (new) |
| Notifications sent correctly | `manage-booking.test.ts` + email template tests |

### What passing all tests does NOT prove (and why that's acceptable):

| Not Proved | Why Acceptable |
|------------|---------------|
| Real DB concurrency (FOR UPDATE, triggers) | Requires integration tests against PostgreSQL — out of scope for unit tests; covered by E2E + load tests |
| Real network behavior | E2E tests cover this; unit tests use mocks by design |
| Actual email delivery | Integration concern; unit tests verify template rendering |
| Browser behavior (mobile, a11y) | E2E/Playwright tests cover this separately |

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Mock fidelity: Prisma $transaction mock may not match real behavior | MAJOR | Use same mock pattern as existing tests; note that DB-level safety is covered by E2E + DB triggers |
| Test isolation: shared mock state between tests | MINOR | Use `beforeEach` reset pattern from existing tests |
| BookingsClient complexity: large component may need many mocks | MINOR | Follow BookingForm.test.tsx mock patterns |
| Feature flag env manipulation: tests may bleed env state | MINOR | Use `jest.resetModules()` + dynamic imports for flag tests |

---

## Rollback Plan

All changes are additive (new test files + additions to existing files). No production code is modified. Rollback = delete new files + revert additions to existing files.

---

## Harsh Critic Report

**Verdict: CONDITIONAL PASS**

- No BLOCKERS found
- MAJOR concern: Mock-based unit tests cannot verify DB-level safety (FOR UPDATE, triggers, SERIALIZABLE). This is acknowledged in the "Not Proved" section and is acceptable because E2E + load tests cover this.
- MINOR: Some test names in the plan are aspirational — exact mock setup will need to match the function signatures in the actual implementation code.
- NIT: The plan could include property-based tests (fast-check) for slot arithmetic. Recommended but not required.

---

## Open Questions

1. Should we add property-based tests (fast-check) for slot arithmetic invariants? (Recommended: yes, as a stretch goal)
2. Should `BookingsClient.test.tsx` use React Testing Library's `renderHook` for any hook logic, or stick to full render? (Recommendation: full render to test integration)
3. Are there any upcoming schema changes that would affect these tests? (Check with team)
