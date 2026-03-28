# CONCURRENCY_TEST_MATRIX.md

> Concurrency Guardian Analysis — 2026-03-27
> Comprehensive multi-user race condition scenarios for Roomshare production readiness.

---

## DATABASE CONSTRAINT INVENTORY

### Unique Constraints (@@unique)
| Model | Constraint | Columns | Prevents |
|-------|-----------|---------|----------|
| Account | provider_providerAccountId | (provider, providerAccountId) | Duplicate OAuth accounts |
| User | email | (email) | Duplicate registration |
| SavedListing | userId_listingId | (userId, listingId) | Double-save |
| Review | authorId_listingId | (authorId, listingId) | Duplicate reviews |
| Location | listingId | (listingId) | Multiple locations per listing |
| RecentlyViewed | userId_listingId | (userId, listingId) | Duplicate view records |
| ConversationDeletion | conversationId_userId | (conversationId, userId) | Double-delete |
| TypingStatus | userId_conversationId | (userId, conversationId) | Duplicate typing records |
| IdempotencyKey | userId_endpoint_key | (userId, endpoint, key) | Idempotency key reuse |
| RateLimitEntry | identifier_endpoint | (identifier, endpoint) | Duplicate rate limit windows |
| BlockedUser | blockerId_blockedId | (blockerId, blockedId) | Double-block |
| ReviewResponse | reviewId | (reviewId) | Multiple responses per review |

### Partial Unique Index (SQL migration, not Prisma)
| Index | Columns | WHERE clause | Prevents |
|-------|---------|-------------|----------|
| idx_booking_active_unique | (tenantId, listingId, startDate, endDate) | status IN ('PENDING','HELD','ACCEPTED') | Duplicate active bookings for same dates |

### CHECK Constraints
**FINDING: No CHECK constraints exist.** The codebase relies on application-level validation only. There are no DB-level CHECK constraints to prevent:
- `availableSlots` going negative
- `availableSlots` exceeding `totalSlots`
- `slotsRequested` being 0 or negative
- `price` being negative
- Booking `endDate` before `startDate`

**GAP**: Missing CHECK constraints are partially mitigated by conditional UPDATE patterns (e.g., `WHERE "availableSlots" >= ${slotsToDecrement}`) and LEAST/GREATEST clamps in the reconciler. But a direct SQL injection or ORM bypass could create impossible states.

### Optimistic Locking
| Model | Column | Used in |
|-------|--------|---------|
| Listing | version | Not actively used (exists in schema but booking code locks via FOR UPDATE instead) |
| Booking | version | Used in manage-booking.ts for all status transitions (updateMany WHERE version = X) |

### Transaction Isolation Levels
| Flow | Isolation | Lock Type |
|------|-----------|-----------|
| createBooking (with idempotency) | SERIALIZABLE | FOR UPDATE on Listing row |
| createBooking (no idempotency) | SERIALIZABLE | FOR UPDATE on Listing row |
| createHold (with idempotency) | SERIALIZABLE | FOR UPDATE on Listing row |
| createHold (no idempotency) | SERIALIZABLE | FOR UPDATE on Listing row |
| updateBookingStatus (all paths) | READ COMMITTED (default) | FOR UPDATE on Listing row |
| updateListingStatus (host) | READ COMMITTED (default) | FOR UPDATE on Listing row |
| updateListingStatus (admin) | READ COMMITTED (default) | FOR UPDATE on Listing row |
| sendMessage | READ COMMITTED (default) | None (transaction for atomicity only) |
| startConversation | None | None — **KNOWN RACE CONDITION** |
| sweep-expired-holds | READ COMMITTED (default) | FOR UPDATE SKIP LOCKED + advisory lock |
| reconcile-slots | READ COMMITTED (default) | Advisory lock |

---

## CONCURRENCY SCENARIO MATRIX

---

### SCENARIO 1: Two Tenants Booking the Same Room Simultaneously
**Priority: P0 — CRITICAL**

**Setup**: Listing L1 with totalSlots=1, availableSlots=1, status=ACTIVE. Tenant A and Tenant B both authenticated.

**Concurrent Actions**:
1. Tenant A calls `createBooking(L1, dates, price, 1, idempKey_A)` at T=0
2. Tenant B calls `createBooking(L1, dates, price, 1, idempKey_B)` at T=0

**Expected Behavior**: Exactly one succeeds. The other gets "Not enough available slots."

**Current Protection**:
- `booking.ts:95-111`: `FOR UPDATE` lock on Listing row inside SERIALIZABLE transaction
- `booking.ts:175-183`: SUM(slotsRequested) capacity check runs inside lock scope
- `idempotency.ts:240`: SERIALIZABLE isolation level ensures phantom-read protection
- `idempotency.ts:101-103`: Up to 3 retries on serialization failure (P2034/40001)
- `migration.sql:21-23`: Partial unique index `idx_booking_active_unique` on (tenantId, listingId, startDate, endDate) WHERE status IN active states

**Gap Analysis**:
- **PROTECTED**: The SERIALIZABLE + FOR UPDATE combination is the strongest possible protection. The first transaction to acquire the lock will succeed; the second will either wait and then see the updated state, or get a serialization error and retry.
- **MINOR CONCERN**: The retry delay is short (50ms * attempt). Under sustained high concurrency, all 3 retries could fail. The user gets a "high demand" error, which is acceptable.
- **VERIFIED**: The partial unique index provides a DB-level safety net even if application logic fails.

**Playwright Multi-Context Pattern**:
```typescript
test('two tenants cannot double-book a single-slot listing', async ({ browser }) => {
  const tenantA = await browser.newContext({ storageState: tenantAAuth });
  const tenantB = await browser.newContext({ storageState: tenantBAuth });
  const pageA = await tenantA.newPage();
  const pageB = await tenantB.newPage();

  // Both navigate to the same listing
  await Promise.all([
    pageA.goto(`/listings/${listingId}`),
    pageB.goto(`/listings/${listingId}`)
  ]);

  // Both click "Book Now" simultaneously
  const [resultA, resultB] = await Promise.all([
    pageA.click('[data-testid="book-button"]').then(() => pageA.waitForResponse(r => r.url().includes('/bookings'))),
    pageB.click('[data-testid="book-button"]').then(() => pageB.waitForResponse(r => r.url().includes('/bookings')))
  ]);

  // Verify exactly one success, one failure
  const outcomes = [await resultA.json(), await resultB.json()];
  const successes = outcomes.filter(o => o.success);
  const failures = outcomes.filter(o => !o.success);
  expect(successes).toHaveLength(1);
  expect(failures).toHaveLength(1);
  expect(failures[0].error).toContain('slot');
});
```

---

### SCENARIO 2: Two Tenants Creating Holds on Last Slot
**Priority: P0 — CRITICAL**

**Setup**: Listing L1 with totalSlots=2, one slot already ACCEPTED. Tenant A and B both try to hold the last slot.

**Concurrent Actions**:
1. Tenant A calls `createHold(L1, dates, price, 1, idempKey_A)` at T=0
2. Tenant B calls `createHold(L1, dates, price, 1, idempKey_B)` at T=0

**Expected Behavior**: Exactly one gets the hold. The other gets "Not enough available slots."

**Current Protection**:
- `booking.ts:689-707`: FOR UPDATE on Listing row
- `booking.ts:761-783`: SUM-based capacity check includes ACCEPTED + active HELD
- `booking.ts:816-824`: Conditional UPDATE on availableSlots (`WHERE availableSlots >= X`) — hard error if insufficient
- SERIALIZABLE isolation (via idempotency wrapper)

**Gap Analysis**:
- **PROTECTED**: Double protection — SUM-based capacity check + conditional slot decrement. Both are inside the FOR UPDATE lock scope.
- **VERIFIED**: Even if SUM check passes for both (impossible under SERIALIZABLE, but defense-in-depth), the conditional `availableSlots` decrement would catch the second one.

**Playwright Pattern**: Same as Scenario 1 but with hold button.

---

### SCENARIO 3: Host Accepts Booking While Tenant Cancels
**Priority: P0 — CRITICAL**

**Setup**: Booking B1 in PENDING status. Host and Tenant both act on it.

**Concurrent Actions**:
1. Host calls `updateBookingStatus(B1, 'ACCEPTED')` at T=0
2. Tenant calls `updateBookingStatus(B1, 'CANCELLED')` at T=0

**Expected Behavior**: Exactly one transition succeeds. The loser gets "Booking was modified by another request."

**Current Protection**:
- `manage-booking.ts:294-307` (ACCEPTED path): `updateMany WHERE version = booking.version` — optimistic lock
- `manage-booking.ts:545-559` (CANCELLED path): Same optimistic lock pattern
- Both paths use FOR UPDATE on Listing row for slot operations
- State machine (`booking-state-machine.ts:19-26`): Validates PENDING→ACCEPTED and PENDING→CANCELLED are both valid

**Gap Analysis**:
- **PROTECTED**: Optimistic locking ensures exactly one transition succeeds. The first to commit increments `version`; the second finds `updateResult.count === 0`.
- **SUBTLE RISK**: The booking is read OUTSIDE the transaction (`manage-booking.ts:57-75`), then the version is used inside. This is a classic TOCTOU pattern. However, the optimistic lock on `version` inside the transaction catches any concurrent modification, so this is safe.
- **VERIFIED**: The `CONCURRENT_MODIFICATION` error code is correctly returned.

**Playwright Multi-Context Pattern**:
```typescript
test('host accept and tenant cancel race on same booking', async ({ browser }) => {
  const hostCtx = await browser.newContext({ storageState: hostAuth });
  const tenantCtx = await browser.newContext({ storageState: tenantAuth });
  const hostPage = await hostCtx.newPage();
  const tenantPage = await tenantCtx.newPage();

  await Promise.all([
    hostPage.goto('/bookings'),
    tenantPage.goto('/bookings')
  ]);

  // Simultaneously click accept (host) and cancel (tenant)
  const [hostResult, tenantResult] = await Promise.all([
    hostPage.click(`[data-testid="accept-booking-${bookingId}"]`)
      .then(() => hostPage.waitForResponse(r => r.url().includes('booking'))),
    tenantPage.click(`[data-testid="cancel-booking-${bookingId}"]`)
      .then(() => tenantPage.waitForResponse(r => r.url().includes('booking')))
  ]);

  // Exactly one succeeds
  const results = [await hostResult.json(), await tenantResult.json()];
  const successes = results.filter(r => r.success);
  expect(successes).toHaveLength(1);

  // Verify final state is consistent (either ACCEPTED or CANCELLED, not both)
  // Check DB directly via test-helpers API
});
```

---

### SCENARIO 4: Two Users Starting Conversation About Same Listing
**Priority: P1 — HIGH (KNOWN RACE CONDITION)**

**Setup**: Listing L1. User A is the listing owner. User B and User C are potential tenants.

**Concurrent Actions — Scenario 4a (different users, expected behavior)**:
1. User B calls `startConversation(L1)` — creates conversation between B and A
2. User C calls `startConversation(L1)` — creates conversation between C and A
These are independent (different participant sets), no race.

**Concurrent Actions — Scenario 4b (SAME user, double-click)**:
1. User B calls `startConversation(L1)` at T=0 (Request 1)
2. User B calls `startConversation(L1)` at T=0 (Request 2, double-click)

**Expected Behavior**: Both return the same conversationId. No duplicate conversation created.

**Current Protection**:
- `chat.ts:77-86`: `findFirst` check for existing conversation
- Rate limiting: `RATE_LIMITS.chatStartConversation`
- **NO transaction. NO unique constraint. NO FOR UPDATE.**

**Gap Analysis**:
- **RACE CONDITION CONFIRMED** (chat.ts:77-103): Between `findFirst` (line 77) and `create` (line 96), there is NO lock. Two concurrent requests can both see "no existing conversation" and both create one. This creates duplicate conversations for the same (listingId, userA, userB) tuple.
- **MISSING**: No `@@unique` constraint on Conversation for (listingId, participants). Prisma's implicit many-to-many on `participants` makes this hard to enforce at DB level.
- **IMPACT**: Duplicate conversations appear in the inbox. Messages split across two conversations. Users confused about which to use.
- **MITIGATION**: Rate limiting reduces probability but does not eliminate it. The rate limit window is per-second, and two requests arriving within the same millisecond would both pass.

**Recommended Fix**:
```sql
-- Option A: Advisory lock per (userId, listingId) pair
SELECT pg_advisory_xact_lock(hashtext(userId || ':' || listingId));
-- Then check + create inside transaction

-- Option B: Wrap in transaction with serializable isolation
-- and add a unique constraint on a junction table
```

**Playwright Multi-Context Pattern**:
```typescript
test('double-click on "Contact Host" does not create duplicate conversation', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: tenantAuth });
  const page = await ctx.newPage();
  await page.goto(`/listings/${listingId}`);

  // Rapid double-click
  await Promise.all([
    page.click('[data-testid="contact-host"]'),
    page.click('[data-testid="contact-host"]')
  ]);

  // Verify only one conversation exists
  const conversations = await getConversationsViaTestHelper(tenantId, listingId);
  expect(conversations).toHaveLength(1);
});
```

---

### SCENARIO 5: Host Accepts While Sweeper Expires the Same Hold
**Priority: P0 — CRITICAL**

**Setup**: Booking B1 in HELD status, `heldUntil` is about to expire. Host tries to accept right as sweeper runs.

**Concurrent Actions**:
1. Host calls `updateBookingStatus(B1, 'ACCEPTED')` at T=0
2. Sweeper cron runs and finds B1 has expired at T=0

**Expected Behavior**: Either the host accept succeeds (hold was still valid) or the sweeper expires it. Never both.

**Current Protection**:
- `manage-booking.ts:169-213` (HELD→ACCEPTED): FOR UPDATE lock on Listing + `updateMany WHERE status='HELD' AND version=X`
- `sweep-expired-holds/route.ts:100`: `FOR UPDATE OF b SKIP LOCKED` — if host transaction already locked the booking row, sweeper skips it
- `manage-booking.ts:102-137`: Inline expiry check — if hold is expired but sweeper hasn't run yet, the accept path catches it

**Gap Analysis**:
- **PROTECTED**: The sweeper uses `SKIP LOCKED`, so if the host already holds the FOR UPDATE lock on the booking row, the sweeper simply skips that booking. The host's `updateMany WHERE status='HELD'` will succeed.
- **PROTECTED**: If the sweeper runs first, it changes status to EXPIRED. The host's `updateMany WHERE status='HELD'` will find count=0 and return HOLD_EXPIRED_OR_MODIFIED.
- **EDGE CASE**: The sweeper locks `FOR UPDATE OF b` (Booking table) while the host path locks the Listing table first then the Booking. Different lock ordering could theoretically deadlock. BUT: The sweeper's SKIP LOCKED eliminates this — it never waits.
- **VERIFIED**: This is well-designed. The SKIP LOCKED pattern is the correct approach.

**Playwright Pattern**: Requires timing control — use test-helpers to set `heldUntil` to NOW() - 1 second, then trigger both accept and sweeper simultaneously.

---

### SCENARIO 6: Host Updates Listing While Tenant Is Booking
**Priority: P1 — HIGH**

**Setup**: Listing L1 with price $1000/mo. Host edits price to $1200/mo. Tenant submits booking at $1000/mo.

**Concurrent Actions**:
1. Tenant loads listing page (sees $1000)
2. Host updates price to $1200
3. Tenant submits booking with `pricePerMonth=1000`

**Expected Behavior**: Booking fails with "The listing price has changed" (PRICE_CHANGED code).

**Current Protection**:
- `booking.ts:118-129`: Price validation inside the FOR UPDATE lock scope. `clientPricePerMonth` is compared against the DB price (fetched under lock). Tolerance of $0.01.
- The listing update uses a separate transaction with FOR UPDATE (`listing-status.ts:50-87`).

**Gap Analysis**:
- **PROTECTED**: The booking transaction sees the updated price because it acquires the FOR UPDATE lock AFTER the listing update transaction commits. The price mismatch check correctly rejects stale prices.
- **UX CONCERN**: The `currentPrice` is returned in the error, allowing the client to show the new price. Good.
- **MINOR GAP**: If host changes `availableSlots` or `totalSlots` directly (not through booking flow), the listing `version` field exists but is NOT checked by the booking code. The booking code relies on FOR UPDATE which is stronger than version checking.

---

### SCENARIO 7: Admin Takes Action on Listing While Host Edits
**Priority: P1 — HIGH**

**Setup**: Admin pauses listing L1 while host is changing its status to RENTED.

**Concurrent Actions**:
1. Host calls `updateListingStatus(L1, 'RENTED')` (from listing-status.ts)
2. Admin calls `updateListingStatus(L1, 'PAUSED')` (from admin.ts)

**Expected Behavior**: One succeeds, the other operates on the updated state. No data corruption.

**Current Protection**:
- Both `listing-status.ts:50-87` and `admin.ts:440-444`: FOR UPDATE lock on Listing row
- Admin version (`admin.ts:440-444`): Uses separate transaction with FOR UPDATE

**Gap Analysis**:
- **PROTECTED**: Both paths use FOR UPDATE. The second transaction waits for the first to commit, then sees the new state.
- **MINOR GAP**: No optimistic locking (version check) is used in either path. If both transactions read the same initial state outside the transaction, the second one "wins" silently. This is acceptable because listing status is not a critical invariant — but it means the host might not realize the admin changed the status.
- **RECOMMENDATION**: Consider returning the current listing status in the response so the UI can detect conflicts.

---

### SCENARIO 8: Multiple Users Messaging in Same Conversation
**Priority: P2 — MEDIUM**

**Setup**: Conversation C1 between User A and User B. Both type and send messages.

**Concurrent Actions**:
1. User A calls `sendMessage(C1, "Hello")` at T=0
2. User B calls `sendMessage(C1, "Hi there")` at T=0

**Expected Behavior**: Both messages created. Ordering determined by DB `createdAt`.

**Current Protection**:
- `chat.ts:190-209`: Transaction wraps message creation + conversation `updatedAt` update + deletion resurrection
- Messages have auto-generated `createdAt` (DB `default(now())`)
- Index `@@index([conversationId, createdAt])` on Message

**Gap Analysis**:
- **PROTECTED**: Message creation is independent — two inserts do not conflict. Each runs in its own transaction for atomicity of the message + conversation update.
- **MINOR CONCERN**: If both messages get the exact same `createdAt` timestamp (sub-millisecond), message ordering is undefined. This is cosmetic, not a correctness issue. The DB `now()` resolution and transaction serialization make this extremely unlikely.
- **NO GAPS**: Message IDs are unique (cuid), no shared counters.

---

### SCENARIO 9: Same User, Multiple Browser Tabs — Double-Click Booking
**Priority: P0 — CRITICAL**

**Setup**: User B has listing L1 open in two tabs. Clicks "Book" in both.

**Concurrent Actions**:
1. Tab 1: `createBooking(L1, dates, price, 1, idempKey_1)` — different idempotency key per tab
2. Tab 2: `createBooking(L1, dates, price, 1, idempKey_2)` — different idempotency key per tab

**Expected Behavior**:
- If same idempotency key: Second request returns cached result (idempotency working correctly)
- If different keys: Partial unique index `idx_booking_active_unique` on (tenantId, listingId, startDate, endDate) prevents duplicate

**Current Protection**:
- `booking.ts:76-91`: Duplicate booking check inside transaction (`findFirst WHERE tenantId AND listingId AND dates AND status IN active`)
- `idempotency.ts`: Full idempotency wrapper with SERIALIZABLE isolation
- `idx_booking_active_unique`: DB-level safety net for (tenantId, listingId, startDate, endDate) WHERE status IN active

**Gap Analysis**:
- **PROTECTED** (same idempotency key): The `withIdempotency` wrapper returns cached result. Perfect.
- **PROTECTED** (different idempotency keys): The `findFirst` duplicate check inside the SERIALIZABLE transaction catches it. The partial unique index is the ultimate safety net.
- **CLIENT CONCERN**: The frontend should generate the idempotency key deterministically from (listingId, startDate, endDate) so that both tabs use the same key. If the key is randomly generated per-click, the duplicate check handles it but wastes a transaction.

**Playwright Pattern**:
```typescript
test('same user two tabs booking same listing', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: tenantAuth });
  const tab1 = await ctx.newPage();
  const tab2 = await ctx.newPage();

  await Promise.all([
    tab1.goto(`/listings/${listingId}`),
    tab2.goto(`/listings/${listingId}`)
  ]);

  const [r1, r2] = await Promise.all([
    tab1.click('[data-testid="book-button"]').then(() => tab1.waitForResponse(r => r.url().includes('booking'))),
    tab2.click('[data-testid="book-button"]').then(() => tab2.waitForResponse(r => r.url().includes('booking')))
  ]);

  const results = [await r1.json(), await r2.json()];
  const successes = results.filter(r => r.success);
  expect(successes).toHaveLength(1); // Only one booking created
});
```

---

### SCENARIO 10: Hold Expiration During Checkout Flow
**Priority: P0 — CRITICAL**

**Setup**: Tenant places a hold (15-minute TTL). At minute 14:55, tenant starts the "convert hold to booking" flow. At minute 15:01, the hold expires.

**Concurrent Actions**:
1. Tenant navigates to checkout at T=14:55
2. Sweeper expires the hold at T=15:01
3. Tenant submits booking at T=15:02

**Expected Behavior**: Booking fails because the hold expired. Tenant sees "This hold has expired."

**Current Protection**:
- `manage-booking.ts:100-137`: Inline expiry check catches expired holds before any transition
- `manage-booking.ts:156-166` (HELD→ACCEPTED): Double-check `heldUntil < now()` before accepting
- Sweeper: `FOR UPDATE SKIP LOCKED` avoids conflict with any in-flight transition

**Gap Analysis**:
- **PROTECTED**: The inline expiry check at line 100-137 catches this case. Even if the sweeper hasn't run yet, the application code detects the expired hold.
- **EDGE CASE**: If the tenant tries to create a NEW booking (not accept the hold) for the same dates, the `findFirst` duplicate check sees the HELD booking. If the sweeper hasn't expired it yet, the tenant gets "You already have a booking request for overlapping dates." If the sweeper HAS expired it, the tenant can proceed.
- **RECOMMENDATION**: The client should show a real-time countdown and disable the submit button when the hold expires. Server-side protection is solid.

---

### SCENARIO 11: Concurrent Notification Creation and Read
**Priority: P3 — LOW**

**Setup**: Host receives a booking notification. While the notification is being created, host refreshes the notification list.

**Concurrent Actions**:
1. System creates notification for host (INSERT)
2. Host reads notifications (SELECT)

**Expected Behavior**: Host either sees the new notification or doesn't (eventual consistency is acceptable).

**Current Protection**:
- Notifications are simple INSERT operations with no transaction coupling to the booking
- `manage-booking.ts:377-417`: Notifications sent OUTSIDE the booking transaction
- Index `@@index([userId, createdAt])` on Notification

**Gap Analysis**:
- **ACCEPTABLE**: There is no race condition here because notifications are fire-and-forget. The worst case is the host doesn't see the notification until the next refresh.
- **NO GAPS**: Notification creation failures are caught and logged but do not affect booking integrity.

---

### SCENARIO 12: Sweeper vs. Sweeper (Concurrent Cron Invocations)
**Priority: P1 — HIGH**

**Setup**: Two sweeper cron invocations run simultaneously (e.g., serverless platform duplicate triggers).

**Concurrent Actions**:
1. Sweeper Instance A starts at T=0
2. Sweeper Instance B starts at T=0

**Expected Behavior**: Exactly one runs. The other returns `{ skipped: true, reason: "lock_held" }`.

**Current Protection**:
- `sweep-expired-holds/route.ts:63-68`: `pg_try_advisory_xact_lock(hashtext('sweeper-expire-holds'))` — transaction-scoped advisory lock
- Non-blocking: `pg_try_*` returns false immediately if lock is held

**Gap Analysis**:
- **PROTECTED**: The advisory lock is the correct pattern for preventing concurrent cron executions in a serverless environment. The lock is transaction-scoped (auto-releases on commit).
- **VERIFIED**: Same pattern used by reconciler with different lock key.

---

### SCENARIO 13: HELD→PENDING→ACCEPTED Under Concurrent Load (State Machine Integrity)
**Priority: P0 — CRITICAL**

**Setup**: Listing L1 with totalSlots=2. Multiple operations happening simultaneously:
- Tenant A has a HELD booking
- Tenant B submits a PENDING booking
- Host accepts Tenant B's booking
- Tenant A's hold expires

**Concurrent Actions**:
1. T=0: Host accepts B's PENDING booking (PENDING→ACCEPTED, decrements availableSlots)
2. T=0: Sweeper expires A's HELD booking (HELD→EXPIRED, restores availableSlots)

**Expected Behavior**: `availableSlots` ends at correct value. No over-booking, no negative slots.

**Current Protection**:
- Host accept: FOR UPDATE on Listing, conditional `availableSlots` decrement
- Sweeper: FOR UPDATE SKIP LOCKED on Booking, `LEAST(availableSlots + slotsRequested, totalSlots)` clamp
- State machine: Validates transitions before executing
- Optimistic locking: Version field prevents double-application

**Gap Analysis**:
- **PROTECTED**: The FOR UPDATE lock on Listing serializes slot modifications. The LEAST clamp in the sweeper prevents `availableSlots > totalSlots`.
- **DESIGN NOTE**: The sweeper uses `SKIP LOCKED` on Booking rows but does not skip Listing rows. This means if the host accept holds the Listing FOR UPDATE lock, the sweeper's Listing update will WAIT (it only skips the Booking row lock). This is correct — the sweeper must wait to ensure accurate slot restoration.
- **VERIFIED**: The weekly reconciler (`reconcile-slots/route.ts`) provides an additional safety net by detecting and fixing any slot drift.

---

### SCENARIO 14: Listing Creation with Duplicate Location
**Priority: P2 — MEDIUM**

**Setup**: Two requests to create the same listing arrive simultaneously.

**Current Protection**:
- `Location` has `@@unique` on `listingId` (one location per listing)
- Listing creation (`api/listings/route.ts`) uses a single `prisma.listing.create` with nested location
- Rate limiting on listing creation

**Gap Analysis**:
- **PROTECTED**: Prisma creates listing and location atomically in a single transaction. The `listingId` unique constraint on Location prevents duplicates.
- **LOW RISK**: Two creates for the same user with the same data would create two different listings (different IDs). This is a user-error, not a race condition.

---

### SCENARIO 15: Host Pauses Listing While Accept Is In-Flight (EC-3)
**Priority: P0 — CRITICAL (NEW FINDING from edge-case-hunter)**

**Setup**: Listing L1 with status=ACTIVE. Booking B1 in PENDING status. Host has listing management open in one tab, booking management in another.

**Concurrent Actions**:
1. Host Tab 1: calls `updateListingStatus(L1, 'PAUSED')` at T=0
2. Host Tab 2 (or another admin): calls `updateBookingStatus(B1, 'ACCEPTED')` at T=0

**Expected Behavior**: Accept should fail because listing is PAUSED. Or pause should fail because there are active bookings.

**Current Protection**:
- `listing-status.ts:66-79`: PAUSE path checks for active bookings (`booking.count WHERE status IN ACCEPTED,PENDING`) — **BUT this runs BEFORE the accept commits**
- `manage-booking.ts:246-258` (PENDING→ACCEPTED): `FOR UPDATE` on Listing selects `availableSlots, totalSlots, id, ownerId, bookingMode` — **DOES NOT SELECT `status`**
- `manage-booking.ts:171-175` (HELD→ACCEPTED): `FOR UPDATE` on Listing selects only `ownerId` — **DOES NOT SELECT `status`**

**Gap Analysis**:
- **RACE CONDITION CONFIRMED**: The accept path acquires a FOR UPDATE lock on the Listing row but **never checks `listing.status`**. The locked SELECT at line 255 does not include `status` in the column list. This means:
  1. Host pauses listing (sets status=PAUSED, commits)
  2. Accept transaction acquires FOR UPDATE lock, reads the row — sees PAUSED status in DB but **never checks it**
  3. Accept proceeds, decrements `availableSlots`, creates ACCEPTED booking on a PAUSED listing
- **REVERSE RACE**: The `updateListingStatus` PAUSE path checks `booking.count WHERE status IN ACCEPTED,PENDING`. If the accept commits first, the pause correctly fails ("Cannot pause a listing with active or pending bookings"). But if the pause commits first, the accept succeeds on a paused listing.
- **IMPACT**: Bookings can be accepted on PAUSED listings. This violates the business invariant that PAUSED listings should not have new acceptances.

**Recommended Fix**: Add `status` to the SELECT in both accept paths and check it:
```typescript
// manage-booking.ts:255 — add "status" to the column list
SELECT "availableSlots", "totalSlots", "id", "ownerId", "booking_mode" as "bookingMode", "status"
FROM "Listing" WHERE "id" = ${booking.listing.id} FOR UPDATE

// Then check:
if (listing.status !== 'ACTIVE') {
  throw new Error("LISTING_NOT_ACTIVE");
}
```

**Playwright Multi-Context Pattern**:
```typescript
test('cannot accept booking on a listing being paused concurrently', async ({ browser }) => {
  const hostTab1 = await browser.newContext({ storageState: hostAuth });
  const hostTab2 = await browser.newContext({ storageState: hostAuth });
  const page1 = await hostTab1.newPage();
  const page2 = await hostTab2.newPage();

  // Tab 1: Navigate to listing management
  await page1.goto(`/listings/${listingId}/manage`);
  // Tab 2: Navigate to bookings
  await page2.goto('/bookings');

  // Simultaneously: pause listing + accept booking
  const [pauseResult, acceptResult] = await Promise.all([
    page1.click('[data-testid="pause-listing"]')
      .then(() => page1.waitForResponse(r => r.url().includes('listing'))),
    page2.click(`[data-testid="accept-booking-${bookingId}"]`)
      .then(() => page2.waitForResponse(r => r.url().includes('booking')))
  ]);

  // At most one should succeed. If pause succeeds, accept must fail.
  const results = { pause: await pauseResult.json(), accept: await acceptResult.json() };
  if (results.pause.success) {
    expect(results.accept.success).toBeFalsy();
  }
  // Verify listing status and booking status are consistent
});
```

---

### SCENARIO 16: Double-Click "Start Conversation" Rapid-Fire (EC-11)
**Priority: P1 — HIGH**

**Setup**: Tenant B on listing L1 detail page. Clicks "Contact Host" button rapidly.

**Concurrent Actions**:
1. Click 1: `startConversation(L1)` at T=0ms
2. Click 2: `startConversation(L1)` at T=50ms
3. Click 3: `startConversation(L1)` at T=100ms

**Expected Behavior**: Exactly one conversation created. All three return the same conversationId.

**Current Protection**:
- `chat.ts:37-42`: Rate limit on `chatStartConversation` (per IP:userId)
- `chat.ts:77-86`: `findFirst` check for existing conversation
- **NO transaction, NO lock, NO unique constraint**

**Gap Analysis**:
- **PARTIALLY PROTECTED**: Rate limiting may catch clicks 2 and 3 if the rate limit window is tight enough. But if the rate limit window is, say, 5 requests per 10 seconds, all three pass.
- **RACE**: Clicks 1 and 2 can both see "no existing conversation" at the `findFirst` check (line 77) and both proceed to `create` (line 96). Click 3 would then see one of the two created conversations.
- **IMPACT**: Same as Scenario 4 — duplicate conversations in inbox.

**Recommended Fix**: Same as Scenario 4 — wrap in transaction with advisory lock. Additionally, the frontend should debounce or disable the button after first click.

**Playwright Pattern**:
```typescript
test('rapid triple-click on Contact Host creates exactly one conversation', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: tenantAuth });
  const page = await ctx.newPage();
  await page.goto(`/listings/${listingId}`);

  // Triple rapid click
  const button = page.locator('[data-testid="contact-host"]');
  await Promise.all([
    button.click(),
    button.click(),
    button.click()
  ]);

  // Wait for navigation/response
  await page.waitForURL(/\/messages\//);

  // Verify exactly one conversation exists for this (tenant, listing) pair
  const convos = await getConversationsViaTestHelper(tenantId, listingId);
  expect(convos).toHaveLength(1);
});
```

---

## CRITICAL FINDINGS SUMMARY

### CONFIRMED RACE CONDITIONS

**1. Conversation Duplicate Creation — P1 (chat.ts:77-103)**
- `startConversation()` has a check-then-create pattern with NO transaction, NO lock, NO unique constraint
- Two concurrent requests for the same (listingId, userId, ownerId) tuple can create duplicate conversations
- **Recommended Fix**: Wrap in a SERIALIZABLE transaction or use `pg_advisory_xact_lock(hashtext(userId || ':' || listingId))` before the findFirst check

**2. Accept Booking on PAUSED Listing — P0 (manage-booking.ts:246-258, 171-175) [EC-3]**
- The ACCEPT path's FOR UPDATE lock on Listing does NOT select or check `listing.status`
- A booking can be accepted on a PAUSED (or RENTED) listing if the pause commits before the accept acquires the lock
- **Recommended Fix**: Add `"status"` to the locked SELECT and check `listing.status === 'ACTIVE'` before proceeding. Apply to both PENDING→ACCEPTED (line 255) and HELD→ACCEPTED (line 171) paths.

### MISSING DB-LEVEL CONSTRAINTS (P2 — DEFENSE IN DEPTH)

1. **No CHECK constraint on `availableSlots >= 0`**: Application code uses conditional UPDATE but a raw SQL bypass could create negative slots
2. **No CHECK constraint on `availableSlots <= totalSlots`**: LEAST clamp in sweeper/reconciler but not enforced at DB level
3. **No CHECK constraint on `slotsRequested > 0`**: Zod validation only
4. **No CHECK constraint on `endDate > startDate`**: Zod validation only

### WELL-PROTECTED FLOWS (verified correct)

1. **Booking creation**: SERIALIZABLE + FOR UPDATE + idempotency + partial unique index = 4 layers of protection
2. **Hold creation**: Same as booking creation + per-listing rate limit to prevent hold-cycling
3. **State transitions (slot math)**: Optimistic locking (version) + FOR UPDATE + state machine validation = 3 layers
4. **Sweeper concurrency**: Advisory lock + SKIP LOCKED + LEAST clamp = correct pattern
5. **Slot reconciliation**: Advisory lock + weekly drift detection + auto-fix with threshold = solid safety net

### DESIGN QUALITY NOTES

- **Notifications outside transactions**: All notification sends are OUTSIDE the database transaction. This is correct — prevents holding locks during potentially slow email/notification sends.
- **Side effects are fire-and-forget**: Booking/hold side effects (notifications, revalidation) are wrapped in try/catch. Failures do not roll back the booking. Correct design.
- **Idempotency is atomic**: The INSERT ON CONFLICT + FOR UPDATE pattern in `idempotency.ts` is the gold standard for idempotency in PostgreSQL. No race window between claim and execution.

---

## PLAYWRIGHT TEST ARCHITECTURE REQUIREMENTS

### Multi-Context Setup Helper
```typescript
async function createAuthenticatedContext(
  browser: Browser,
  userRole: 'tenant' | 'host' | 'admin',
  userId: string
): Promise<{ context: BrowserContext; page: Page }> {
  // Use test-helpers API to get auth state for specific user
  const storageState = await getStorageState(userRole, userId);
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  return { context, page };
}
```

### Concurrent Action Helper
```typescript
async function raceBetween<T>(
  actions: Array<() => Promise<T>>
): Promise<T[]> {
  // Start all actions simultaneously
  return Promise.all(actions.map(fn => fn()));
}
```

### State Verification Helper
```typescript
async function verifyBookingState(
  bookingId: string,
  expectedStatus: BookingStatus,
  expectedSlots?: number
): Promise<void> {
  const response = await fetch(`/api/test-helpers`, {
    method: 'POST',
    body: JSON.stringify({
      action: 'getBooking',
      bookingId
    })
  });
  const booking = await response.json();
  expect(booking.status).toBe(expectedStatus);
  if (expectedSlots !== undefined) {
    expect(booking.listing.availableSlots).toBe(expectedSlots);
  }
}
```

---

## PRIORITY SUMMARY

| Priority | Count | Scenarios |
|----------|-------|-----------|
| P0 | 8 | #1, #2, #3, #5, #9, #10, #13, #15 (RACE BUG — accept on paused listing) |
| P1 | 4 | #4 (RACE BUG — duplicate conversations), #6, #7, #12, #16 (rapid-click conversations) |
| P2 | 2 | #8, #14 |
| P3 | 1 | #11 |

**Verdict**: The booking/hold slot math is **well-protected** with 4 layers of defense. However, two confirmed race conditions need fixing before production:
1. **P0**: Accept path does not check `listing.status` under lock — bookings can be accepted on PAUSED listings (`manage-booking.ts:255`, `manage-booking.ts:171`)
2. **P1**: Conversation creation has check-then-create without transaction — duplicate conversations (`chat.ts:77-103`)

The missing CHECK constraints are P2 defense-in-depth improvements.
