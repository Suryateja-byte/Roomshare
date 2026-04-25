# Playwright Test Blueprint: Booking System Stability

> Note: CFM-701 removed the public booking CTA and form from listing pages. The UI-driven stability specs that depended on that surface have been deleted; keep this blueprint only for API-backed helpers and host-legacy `/bookings` flows until it is rewritten.

> **Version**: 1.0 | **Date**: 2026-03-13 | **Status**: Ready for implementation
> **Source**: `02-stability-contract.md` (invariants, boundary conditions, test matrix) + existing E2E infrastructure audit

---

## How to Use This Document

Each test below is specified with enough detail that a developer (or Claude Code) can implement it without ambiguity. Tests are organized by tier and reference the stability contract invariants directly.

**Naming convention**: `TEST-{tier}{sequence}` (e.g., TEST-101 = Tier 1, test 01)

**File organization**:
```
tests/e2e/stability/
  tier1-smoke.spec.ts
  tier2-business-logic.spec.ts
  tier3-edge-cases.spec.ts
  tier3-error-messages.spec.ts
  tier4-performance.spec.ts
  fixtures/
    booking-fixtures.ts          # DB seeding, cleanup, API client
    booking-page-objects.ts      # Page Object Models
    multi-user-context.ts        # Two-browser-context helpers
```

---

## Part 1: Test Infrastructure

### 1.1 Test Utilities & Fixtures Needed

#### Database Seeding Functions (`booking-fixtures.ts`)

```typescript
import { prisma } from '@/lib/prisma';

interface TestListing {
  id: string;
  title: string;
  ownerId: string;
  totalSlots: number;
  availableSlots: number;
  price: number;
  bookingMode: 'PER_SLOT' | 'WHOLE_UNIT';
}

interface TestBooking {
  id: string;
  listingId: string;
  tenantId: string;
  status: string;
  slotsRequested: number;
  startDate: Date;
  endDate: Date;
}

/**
 * Create a test listing with known slot count.
 * Uses unique title prefix for isolation: `stability-{testId}-{timestamp}`
 */
async function createTestListing(overrides?: Partial<TestListing>): Promise<TestListing>;

/**
 * Create a booking directly in DB (bypasses server action for setup speed).
 * Used to set up preconditions, NOT for testing the booking flow itself.
 */
async function createTestBooking(
  listingId: string,
  tenantId: string,
  status: string,
  overrides?: Partial<TestBooking>
): Promise<TestBooking>;

/**
 * Create a HELD booking with specific heldUntil for expiry tests.
 * Returns booking ID + heldUntil timestamp.
 */
async function createTestHold(
  listingId: string,
  tenantId: string,
  heldUntilOffset: number, // minutes from now (negative = already expired)
  slotsRequested?: number
): Promise<{ bookingId: string; heldUntil: Date }>;

/**
 * Query ground-truth slot count via SUM query (bypasses availableSlots).
 * Used for post-test invariant verification.
 */
async function getGroundTruthAvailableSlots(listingId: string): Promise<number>;

/**
 * Query current availableSlots from Listing row.
 */
async function getAvailableSlots(listingId: string): Promise<number>;

/**
 * Get booking by ID with full details.
 */
async function getBooking(bookingId: string): Promise<TestBooking | null>;

/**
 * Count audit log entries for a booking.
 */
async function getAuditLogCount(bookingId: string): Promise<number>;

/**
 * Clean up all bookings and listings created by stability tests.
 * Uses title prefix `stability-` for identification.
 */
async function cleanupStabilityTestData(): Promise<void>;
```

#### Authentication Helpers

Reuse existing infrastructure from `tests/e2e/helpers/auth-helpers.ts`:

```typescript
// Existing auth state files:
const USER_STATE = 'playwright/.auth/user.json';   // e2e-test@roomshare.dev
const USER2_STATE = 'playwright/.auth/user2.json';  // e2e-other@roomshare.dev
const ADMIN_STATE = 'playwright/.auth/admin.json';   // e2e-admin@roomshare.dev

// For multi-user tests:
async function createUserContext(browser: Browser, storageState: string): Promise<{
  context: BrowserContext;
  page: Page;
}>;

// For anon tests:
async function createAnonContext(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
}>;
```

#### API Client for Direct Assertions

```typescript
/**
 * Call server actions directly via fetch (bypasses UI for faster setup/verification).
 * Reuses session cookies from storageState.
 */
async function callServerAction(
  page: Page,
  actionName: string,
  args: unknown[]
): Promise<unknown>;

/**
 * Direct DB query wrapper for assertions (runs via Prisma in test context).
 * Alternative: use /api/test-helpers route behind E2E flag.
 */
async function queryDB<T>(query: string, params?: unknown[]): Promise<T>;
```

#### Clock/Time Mocking for Hold Expiration

```typescript
/**
 * Strategy: Use DB-level time manipulation since server uses NOW() in SQL.
 *
 * Option A (preferred): Create hold with heldUntil already in the past.
 *   - createTestHold(listingId, tenantId, -1) // expired 1 minute ago
 *
 * Option B: Use page.clock for client-side HoldCountdown tests.
 *   - await page.clock.install({ time: new Date('2026-04-01T12:00:00Z') });
 *   - await page.clock.fastForward('16:00'); // 16 minutes
 *
 * Option C: For sweeper tests, directly invoke the cron endpoint:
 *   - await page.request.get('/api/cron/sweep-expired-holds', {
 *       headers: { Authorization: `Bearer ${CRON_SECRET}` }
 *     });
 */
```

### 1.2 Page Object Models

#### ListingDetailPage

```typescript
class ListingDetailPage {
  readonly page: Page;

  // Selectors
  readonly startDatePicker = '#booking-start-date';
  readonly endDatePicker = '#booking-end-date';
  readonly slotSelector = '#slot-selector';
  readonly slotIncrease = '[aria-label="Increase slots"]';
  readonly slotDecrease = '[aria-label="Decrease slots"]';
  readonly slotBadge = '[data-testid="slot-badge"]';
  readonly bookNowButton: Locator; // getByRole('button', { name: /request to book/i })
  readonly placeHoldButton: Locator; // getByRole('button', { name: /place hold/i })
  readonly confirmModal = '[role="dialog"][aria-modal="true"]';
  readonly confirmButton: Locator; // modal getByRole('button', { name: /confirm/i })
  readonly cancelModalButton: Locator; // modal getByRole('button', { name: /cancel/i })
  readonly errorAlert = '[role="alert"]';
  readonly startDateError = '#startDate-error';
  readonly endDateError = '#endDate-error';

  constructor(page: Page) {
    this.page = page;
    this.bookNowButton = page.locator('main').getByRole('button', { name: /request to book/i }).first();
    this.placeHoldButton = page.locator('main').getByRole('button', { name: /place hold/i }).first();
    this.confirmButton = page.locator(this.confirmModal).getByRole('button', { name: /confirm/i });
    this.cancelModalButton = page.locator(this.confirmModal).getByRole('button', { name: /cancel/i });
  }

  async goto(listingId: string): Promise<void>;
  async waitForHydration(): Promise<void>;  // Wait for #booking-start-date[data-state]
  async selectDates(startMonthOffset: number, endMonthOffset?: number): Promise<void>;
  async setSlots(count: number): Promise<void>;
  async submitBooking(): Promise<void>;     // Click book now + confirm
  async submitHold(): Promise<void>;        // Click place hold + confirm
  async getSlotBadgeText(): Promise<string>;
  async getErrorText(): Promise<string | null>;
  async clearSessionStorageKeys(listingId: string): Promise<void>;
  async isSubmitDisabled(): Promise<boolean>;
}
```

#### BookingsManagementPage

```typescript
class BookingsManagementPage {
  readonly page: Page;

  // Selectors
  readonly bookingItem = '[data-testid="booking-item"]';
  readonly emptyState = '[data-testid="empty-state"]';
  readonly sentTab: Locator;     // getByRole('button', { name: /sent/i })
  readonly receivedTab: Locator; // getByRole('button', { name: /received/i })
  readonly acceptButton: Locator;
  readonly rejectButton: Locator;
  readonly cancelButton: Locator;
  readonly rejectionReasonInput = '#rejection-reason';
  readonly holdCountdown: Locator; // span with MM:SS pattern

  constructor(page: Page) { ... }

  async goto(): Promise<void>;            // Navigate to /bookings
  async switchToSentTab(): Promise<void>;
  async switchToReceivedTab(): Promise<void>;
  async findBookingByStatus(status: string): Promise<Locator | null>;
  async acceptBooking(bookingIndex?: number): Promise<void>;
  async rejectBooking(reason?: string, bookingIndex?: number): Promise<void>;
  async cancelBooking(bookingIndex?: number): Promise<void>;
  async getBookingStatus(bookingIndex: number): Promise<string>;
  async getBookingCount(): Promise<number>;
  async getHoldCountdownText(): Promise<string | null>;
}
```

#### Multi-User Context Helper

```typescript
class MultiUserBookingContext {
  private userAContext: BrowserContext;
  private userBContext: BrowserContext;
  pageA: Page;
  pageB: Page;
  listingPageA: ListingDetailPage;
  listingPageB: ListingDetailPage;

  static async create(browser: Browser): Promise<MultiUserBookingContext>;

  /**
   * Navigate both users to the same listing and prepare booking forms.
   * Uses different month offsets to avoid date collisions between test runs.
   */
  async prepareBothUsers(listingUrl: string, monthOffset: number): Promise<void>;

  /**
   * Submit bookings simultaneously via Promise.all.
   * Returns which user succeeded and which failed.
   */
  async submitSimultaneously(): Promise<{
    winnerPage: Page;
    loserPage: Page;
    winnerResult: 'success';
    loserResult: string; // error message
  }>;

  async close(): Promise<void>;
}
```

### 1.3 Concurrency Test Patterns

#### Pattern A: Two Users Racing for Last Slot

```typescript
// 1. Create listing with totalSlots=1 via DB seed
// 2. Open two browser contexts (USER_STATE, USER2_STATE)
// 3. Both navigate to listing page
// 4. Both select dates (same dates, different month offset per browser)
// 5. Both click "Request to Book" (separate steps — NOT simultaneous)
// 6. Both arrive at confirmation modal
// 7. Promise.all([confirmA.click(), confirmB.click()])
// 8. Wait for both to resolve (success or error)
// 9. Assert: exactly one success, exactly one error containing "slots"
// 10. DB assertion: exactly 1 PENDING booking, availableSlots matches
```

#### Pattern B: Host Accept vs Tenant Cancel Race

```typescript
// 1. Create booking in PENDING state via DB seed
// 2. Open host context (listing owner) + tenant context
// 3. Both navigate to /bookings
// 4. Host sees booking in "Received" tab, tenant in "Sent" tab
// 5. Promise.all([hostAcceptBtn.click(), tenantCancelBtn.click()])
// 6. Assert: exactly one succeeds
// 7. DB assertion: booking status is either ACCEPTED or CANCELLED (not both)
```

#### Pattern C: Hold Expiration During Accept

```typescript
// Strategy: Create hold with heldUntil in the past via DB seed.
// This avoids needing real-time clock manipulation.
//
// 1. createTestHold(listingId, tenantId, -1) // expired 1 min ago
// 2. Host navigates to /bookings, sees HELD booking
// 3. Host clicks Accept
// 4. Assert: error message contains "hold has expired"
// 5. DB: booking status = EXPIRED (inline expiry triggered), slots restored
```

#### Pattern D: Deterministic Concurrency Without Flakiness

```typescript
// Key principles:
// 1. Use DB-seeded preconditions (not UI-created) for setup speed
// 2. Use Promise.all only for the critical race moment (button clicks)
// 3. Wait for BOTH outcomes before asserting (success OR error pattern)
// 4. Use .or() chains for flexible outcome detection:
const outcome = page.getByText(/request sent|booking confirmed|submitted/i)
  .or(page.locator('[role="alert"]'));
await outcome.waitFor({ state: 'visible', timeout: 20_000 });
// 5. Assert on DB state (ground truth), not just UI
// 6. Use unique date ranges per test to prevent cross-test interference
```

### 1.4 CI/CD Integration Notes

#### Recommended Playwright Config Additions

```typescript
// playwright.config.ts — stability test project
{
  name: 'stability-smoke',
  testMatch: 'tests/e2e/stability/tier1-smoke.spec.ts',
  use: { ...devices['Desktop Chrome'] },
  dependencies: ['setup'],
  // Smoke tests: no retries, fast fail
  retries: 0,
  timeout: 30_000,
},
{
  name: 'stability-business',
  testMatch: 'tests/e2e/stability/tier2-business-logic.spec.ts',
  use: { ...devices['Desktop Chrome'] },
  dependencies: ['stability-smoke'],
  retries: 1,
  timeout: 60_000,
},
{
  name: 'stability-edge',
  testMatch: 'tests/e2e/stability/tier3-*.spec.ts',
  use: { ...devices['Desktop Chrome'] },
  dependencies: ['stability-business'],
  retries: 2,
  timeout: 90_000,
},
```

#### Database Isolation Strategy

```
Strategy: Unique date windows per test + cleanup afterAll.

- Each test uses a unique month offset (derived from testInfo.workerIndex + tier).
- Listing IDs are seeded per worker (title prefix `stability-w{workerIndex}-`).
- afterAll: delete all Bookings + Listings matching the prefix.
- This avoids needing per-worker databases or transaction rollback.
- Rate limits: bypassed via E2E_DISABLE_RATE_LIMIT=true (already supported).
```

#### Tiered Pipeline Execution

```yaml
# .github/workflows/stability.yml
jobs:
  tier1-smoke:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm playwright test --project=stability-smoke
    # If smoke fails, skip everything else

  tier2-business:
    needs: tier1-smoke
    steps:
      - run: pnpm playwright test --project=stability-business

  tier3-edge:
    needs: tier2-business
    steps:
      - run: pnpm playwright test --project=stability-edge

  # Tier 4 runs on schedule, not per-PR
  tier4-performance:
    if: github.event_name == 'schedule'
    steps:
      - run: pnpm playwright test --project=stability-perf
```

---

## Part 2: Test Specifications

### Tier 1 — Smoke Tests

---

### TEST-101: Create Single-Slot Booking E2E
- **Tier**: 1
- **Contract Ref**: T1-01
- **Invariant(s) Tested**: SI-01, SI-05
- **Priority**: P0
- **Type**: Smoke
- **Preconditions**:
  - Authenticated as `e2e-test@roomshare.dev` (USER_STATE)
  - At least one active listing exists in seed data (owned by different user)
  - No existing booking for test user on the target listing for the chosen dates
- **Steps**:
  1. Navigate to `/` (home page)
  2. Find a listing card and extract its href: `page.locator('[data-testid="listing-card"] a').first().getAttribute('href')`
  3. Navigate to listing detail page: `page.goto(href)`
  4. Wait for BookingForm hydration: `page.locator('#booking-start-date[data-state]').waitFor({ state: 'attached', timeout: 15_000 })`
  5. Clear stale sessionStorage keys: `page.evaluate(() => { Object.keys(sessionStorage).filter(k => k.startsWith('booking_')).forEach(k => sessionStorage.removeItem(k)) })`
  6. Click start date picker: `page.locator('#booking-start-date').click()`
  7. Navigate forward 3+ months (use `testInfo.project.name` offset map from existing tests)
  8. Select day 1: `page.locator('[data-radix-popper-content-wrapper] button').filter({ hasText: /^1$/ }).first().dispatchEvent('click')`
  9. Click end date picker, navigate to next month, select day 1
  10. Click "Request to Book": `page.locator('main').getByRole('button', { name: /request to book/i }).first().click()`
  11. Wait for confirmation modal: `page.locator('[role="dialog"][aria-modal="true"]').waitFor({ state: 'visible' })`
  12. Click "Confirm Booking": `page.locator('[role="dialog"]').getByRole('button', { name: /confirm/i }).click()`
  13. Wait for success indicator: `page.getByText(/request sent|booking confirmed|submitted/i).or(page.locator('[data-sonner-toast][data-type="success"]')).waitFor({ state: 'visible', timeout: 20_000 })`
- **Assertions**:
  - UI: Success message or toast visible; no `[role="alert"]` with error text
  - DB: New booking exists with `status='PENDING'`, correct `listingId`, `tenantId`, `slotsRequested=1`
  - DB (SI-05): `availableSlots` on listing unchanged (PENDING does not consume slots)
- **Cleanup**: Cancel the booking via DB or navigate to /bookings and cancel via UI
- **Flakiness Mitigation**:
  - Wait for `#booking-start-date[data-state]` before interacting (Radix hydration)
  - Use `dispatchEvent('click')` for calendar day buttons (off-viewport portal)
  - Use month offset map to avoid date collisions across parallel workers
  - Clear sessionStorage before each test run

---

### TEST-102: Create Hold E2E
- **Tier**: 1
- **Contract Ref**: T1-02
- **Invariant(s) Tested**: SI-06, SI-20
- **Priority**: P0
- **Type**: Smoke
- **Preconditions**:
  - Authenticated as `e2e-test@roomshare.dev`
  - Feature flag `ENABLE_SOFT_HOLDS=on`
  - Target listing has `availableSlots > 0`
  - User has < 3 active holds
- **Steps**:
  1. Navigate to listing detail page (same approach as TEST-101, steps 1-5)
  2. Wait for BookingForm hydration
  3. Clear sessionStorage booking keys
  4. Select dates (month offset = project offset + 2 to avoid collision with TEST-101)
  5. Locate "Place Hold" button: `page.locator('main').getByRole('button', { name: /place hold/i }).first()`
  6. If not visible, skip test with `test.skip()` (feature flag may be off)
  7. Click "Place Hold"
  8. Wait for confirmation modal
  9. Click confirm
  10. Wait for success: `page.getByText(/hold placed|hold confirmed|held/i).or(page.locator('[data-sonner-toast][data-type="success"]')).waitFor({ state: 'visible', timeout: 20_000 })`
- **Assertions**:
  - UI: Success message visible; hold countdown timer may appear
  - DB: Booking with `status='HELD'`, `heldUntil` set to ~15 minutes from now
  - DB (SI-06): `availableSlots` decreased by `slotsRequested`
- **Cleanup**: Cancel the hold via /bookings or let sweeper expire it
- **Flakiness Mitigation**:
  - `test.skip` if hold button not visible (graceful feature-flag handling)
  - Same hydration + calendar patterns as TEST-101

---

### TEST-103: Cancel Booking E2E
- **Tier**: 1
- **Contract Ref**: T1-03
- **Invariant(s) Tested**: SI-08
- **Priority**: P0
- **Type**: Smoke
- **Preconditions**:
  - Authenticated user has at least one PENDING or ACCEPTED booking
  - (Setup: create booking via TEST-101 or DB seed first)
- **Steps**:
  1. Navigate to `/bookings`
  2. Wait for page load: `page.locator('[data-testid="booking-item"]').first().waitFor({ state: 'visible', timeout: 15_000 })`
  3. Switch to "Sent" tab if not already: `page.getByRole('button', { name: /sent/i }).first().click()`
  4. Find a booking with status PENDING or ACCEPTED
  5. Click "Cancel Booking" button on that booking card
  6. Wait for confirmation dialog: `page.locator('[role="alertdialog"]').waitFor({ state: 'visible' })`
  7. Click confirm in the alert dialog
  8. Wait for status update: `page.getByText(/cancelled/i).waitFor({ state: 'visible', timeout: 15_000 })`
- **Assertions**:
  - UI: Booking status badge shows "CANCELLED"
  - UI: After `page.reload()`, booking still shows CANCELLED (persisted)
  - DB: Booking `status = 'CANCELLED'`, `version` incremented
  - DB (SI-08): If was ACCEPTED/HELD, `availableSlots` increased by `slotsRequested` (LEAST clamped)
- **Cleanup**: None needed (cancelled is terminal)
- **Flakiness Mitigation**:
  - Wait for booking item visibility before interacting
  - Reload after cancel to verify persistence (not just optimistic UI)

---

### TEST-104: Unauthenticated User Blocked
- **Tier**: 1
- **Contract Ref**: T1-05
- **Invariant(s) Tested**: SI-15
- **Priority**: P0
- **Type**: Smoke
- **Preconditions**:
  - No authentication (use anon browser context)
  - Known listing URL available
- **Steps**:
  1. Create anon context: `browser.newContext()` (no storageState)
  2. Navigate to a listing detail page
  3. Check for booking form visibility
  4. Assert: Either form is not rendered, or submit buttons are disabled, or a login prompt is shown
  5. If form is visible, attempt to click "Request to Book"
  6. Assert: Redirected to `/login` or error message about authentication
- **Assertions**:
  - UI: Login gate visible OR booking form disabled/hidden
  - API: No booking created in DB for anonymous user
- **Cleanup**: Close anon context
- **Flakiness Mitigation**:
  - Use `page.waitForURL()` to detect redirect to login
  - Handle both cases: form hidden vs form visible but gated

---

### TEST-105: Search Shows Available Rooms
- **Tier**: 1
- **Contract Ref**: T1-04
- **Invariant(s) Tested**: SI-02
- **Priority**: P0
- **Type**: Smoke
- **Preconditions**:
  - Authenticated user
  - Seed data includes active listings in SF area
- **Steps**:
  1. Navigate to `/search` with bounds params: `nav.goToSearch({ bounds: '37.7,-122.52,37.85,-122.35' })`
  2. Wait for listing cards: `scopedCards(page).first().waitFor({ state: 'visible', timeout: 20_000 })`
  3. Verify at least one listing card is visible
  4. Check slot badge is present: `page.locator('[data-testid="slot-badge"]').first().waitFor({ state: 'attached' })`
- **Assertions**:
  - UI: At least 1 listing card visible in search results
  - UI: Slot badge text matches one of: "Available", "X of Y open", "All X open"
  - UI: No "Filled" badge on a listing that has `availableSlots > 0` in DB
- **Cleanup**: None
- **Flakiness Mitigation**:
  - Use `scopedCards(page)` helper to avoid strict-mode dual-container issues
  - Use bounds-only query (no text search) to maximize results

---

### Tier 2 — Core Business Logic

---

### TEST-201: Concurrent Last-Slot Race — One Wins, One Fails
- **Tier**: 2
- **Contract Ref**: T2-03
- **Invariant(s) Tested**: SI-09, SI-01
- **Priority**: P0
- **Type**: Concurrency
- **Preconditions**:
  - Two authenticated users (USER_STATE, USER2_STATE)
  - Listing with `totalSlots=1` and `availableSlots=1` (DB seed or API)
  - No existing bookings on target listing for chosen dates
- **Steps**:
  1. Create two browser contexts:
     ```typescript
     const ctxA = await browser.newContext({ storageState: USER_STATE });
     const ctxB = await browser.newContext({ storageState: USER2_STATE });
     const pageA = await ctxA.newPage();
     const pageB = await ctxB.newPage();
     ```
  2. Both navigate to the listing detail page
  3. Both wait for hydration and select SAME dates (same month offset)
  4. Both clear sessionStorage booking keys
  5. Both click "Request to Book"
  6. Both wait for confirmation modal
  7. Simultaneously click confirm:
     ```typescript
     const confirmA = pageA.locator('[role="dialog"]').getByRole('button', { name: /confirm/i });
     const confirmB = pageB.locator('[role="dialog"]').getByRole('button', { name: /confirm/i });
     await Promise.all([confirmA.click(), confirmB.click()]);
     ```
  8. Wait for both outcomes:
     ```typescript
     const successPattern = (p: Page) => p.getByText(/request sent|booking confirmed|submitted/i);
     const errorPattern = (p: Page) => p.locator('[role="alert"]').or(p.locator('[data-sonner-toast][data-type="error"]'));

     await Promise.all([
       successPattern(pageA).or(errorPattern(pageA)).waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {}),
       successPattern(pageB).or(errorPattern(pageB)).waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {}),
     ]);
     ```
  9. Determine winner/loser:
     ```typescript
     const aSuccess = await successPattern(pageA).isVisible().catch(() => false);
     const bSuccess = await successPattern(pageB).isVisible().catch(() => false);
     ```
- **Assertions**:
  - Exactly one user sees success message (`aSuccess XOR bSuccess`)
  - Loser sees error containing "slots" or "capacity" or "already have"
  - DB: Exactly 1 PENDING booking for this listing+dates
  - DB: `availableSlots` unchanged (PENDING doesn't consume — SI-05)
  - DB: Audit log has exactly 1 CREATED entry
- **Cleanup**: Cancel the winning booking; close both contexts
- **Flakiness Mitigation**:
  - Use `Promise.all` for simultaneous submission (not sequential)
  - Accept either user winning (non-deterministic by design)
  - `.catch(() => {})` on wait — handle case where one resolves before the other
  - Use unique date window far in the future (month offset 8+)

---

### TEST-202: Double-Click Protection
- **Tier**: 2
- **Contract Ref**: T3-01 (elevated to Tier 2 for this blueprint — P0 severity)
- **Invariant(s) Tested**: BC-09
- **Priority**: P0
- **Type**: Edge Case
- **Preconditions**:
  - Authenticated user
  - Available listing with slots
- **Steps**:
  1. Navigate to listing, select dates, clear sessionStorage
  2. Click "Request to Book"
  3. Wait for confirmation modal
  4. Set up request counter:
     ```typescript
     let bookingRequests = 0;
     page.on('request', req => {
       if (req.url().includes('/bookings') || req.headers()['next-action']) {
         bookingRequests++;
       }
     });
     ```
  5. Rapid-fire click confirm button 3 times with 100ms gaps:
     ```typescript
     const confirmBtn = page.locator('[role="dialog"]').getByRole('button', { name: /confirm/i });
     await confirmBtn.click();
     await page.waitForTimeout(100);
     await confirmBtn.click({ force: true }).catch(() => {}); // May be disabled
     await page.waitForTimeout(100);
     await confirmBtn.click({ force: true }).catch(() => {});
     ```
  6. Wait for outcome
- **Assertions**:
  - UI: Confirm button becomes disabled after first click (check `disabled` attribute)
  - At most 1 server action request sent (bookingRequests <= 1)
  - DB: Exactly 1 booking created (not 2 or 3)
  - UI: Single success message (no duplicates)
- **Cleanup**: Cancel the booking
- **Flakiness Mitigation**:
  - `force: true` on subsequent clicks (button may already be disabled)
  - `.catch(() => {})` on impossible clicks
  - Count requests via `page.on('request')` rather than relying on UI state

---

### TEST-203: Duplicate Booking Prevention (Multi-Tab)
- **Tier**: 2
- **Contract Ref**: T3-02
- **Invariant(s) Tested**: SI-12, BC-14
- **Priority**: P0
- **Type**: Edge Case
- **Preconditions**:
  - Authenticated user (single user, two pages in same context)
  - Available listing
- **Steps**:
  1. Create single context with two pages (simulating two tabs):
     ```typescript
     const context = await browser.newContext({ storageState: USER_STATE });
     const page1 = await context.newPage();
     const page2 = await context.newPage();
     ```
  2. Both navigate to same listing
  3. Both select same dates
  4. Clear sessionStorage on BOTH pages
  5. Page 1: Submit booking (full flow) → wait for success
  6. Page 2: Submit booking (same dates) → wait for outcome
- **Assertions**:
  - Page 1: Success message
  - Page 2: Error containing "already have a booking" or "overlapping dates" or duplicate detection
  - DB: Exactly 1 booking for this user+listing+dates
- **Cleanup**: Cancel the booking; close context
- **Flakiness Mitigation**:
  - Sequential submission (not simultaneous) — this tests duplicate detection, not race condition
  - Clear sessionStorage per page to ensure fresh idempotency keys

---

### TEST-204: Hold Expiration Releases Slots
- **Tier**: 2
- **Contract Ref**: T2-04
- **Invariant(s) Tested**: SI-21, SI-08
- **Priority**: P0
- **Type**: Business Logic
- **Preconditions**:
  - Feature flag `ENABLE_SOFT_HOLDS=on`
  - Listing with known `totalSlots` and `availableSlots`
  - Test can invoke sweeper cron endpoint
  - `CRON_SECRET` env var available
- **Steps**:
  1. Record initial `availableSlots` for target listing
  2. Create an already-expired hold via DB seed:
     ```typescript
     const { bookingId } = await createTestHold(listingId, tenantId, -5); // expired 5 min ago
     ```
  3. Verify `availableSlots` decreased by `slotsRequested` (hold consumed slots)
  4. Invoke sweeper cron:
     ```typescript
     const response = await page.request.get('/api/cron/sweep-expired-holds', {
       headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }
     });
     const body = await response.json();
     ```
  5. Verify sweeper response: `body.expired >= 1`, `body.success === true`
  6. Query DB for booking status
  7. Query DB for `availableSlots`
- **Assertions**:
  - API: Sweeper returns `{ success: true, expired: N }` where N >= 1
  - DB: Booking `status = 'EXPIRED'`, `heldUntil = null`
  - DB (SI-08): `availableSlots` restored to initial value (or initial + slotsRequested, LEAST-clamped)
  - DB: Audit log entry with `action = 'EXPIRED'`, `actorType = 'SYSTEM'`
- **Cleanup**: None (EXPIRED is terminal)
- **Flakiness Mitigation**:
  - Use already-expired hold (no real-time waiting)
  - Direct cron invocation (no dependency on scheduled execution)
  - DB assertions (not UI) for slot verification

---

### TEST-205: Price Validation Rejects Tampered Price
- **Tier**: 2
- **Contract Ref**: T2-06
- **Invariant(s) Tested**: SI-04
- **Priority**: P0
- **Type**: Business Logic
- **Preconditions**:
  - Authenticated user
  - Known listing with specific price (e.g., $1500/month)
- **Steps**:
  1. Navigate to listing detail page
  2. Select dates via UI
  3. Intercept the server action request and modify the price payload:
     ```typescript
     await page.route('**/*', async (route) => {
       const request = route.request();
       if (request.method() === 'POST' && request.headers()['next-action']) {
         const postData = request.postData();
         if (postData && postData.includes('pricePerMonth')) {
           // Modify price in the RSC flight request body
           const modified = postData.replace(/"pricePerMonth":\d+(\.\d+)?/, '"pricePerMonth":9999.99');
           await route.continue({ postData: modified });
           return;
         }
       }
       await route.continue();
     });
     ```
  4. Submit booking
  5. Wait for error response
- **Assertions**:
  - UI: Error alert visible with text containing "price has changed"
  - DB: No booking created
  - API: Response contains `code: 'PRICE_CHANGED'` and `currentPrice` field
- **Cleanup**: Remove route interception
- **Flakiness Mitigation**:
  - RSC flight format makes request interception complex — consider alternative: use `page.evaluate` to call `createBooking` directly with wrong price
  - Alternative approach (more reliable):
    ```typescript
    const result = await page.evaluate(async () => {
      const { createBooking } = await import('/src/app/actions/booking');
      return createBooking(listingId, startDate, endDate, 9999.99, 1);
    });
    expect(result.code).toBe('PRICE_CHANGED');
    ```

---

### TEST-206: Cancellation Restores Correct Slot Count
- **Tier**: 2
- **Contract Ref**: T2-07
- **Invariant(s) Tested**: SI-08, SI-02
- **Priority**: P0
- **Type**: Business Logic
- **Preconditions**:
  - Listing with `totalSlots=4`, known `availableSlots`
  - ACCEPTED booking exists on the listing (consuming 1 slot)
- **Steps**:
  1. Record `availableSlots` before cancel: `const before = await getAvailableSlots(listingId)`
  2. Navigate to `/bookings`
  3. Find the ACCEPTED booking
  4. Cancel it via UI (click Cancel → confirm dialog)
  5. Wait for cancellation confirmation
  6. Record `availableSlots` after cancel: `const after = await getAvailableSlots(listingId)`
  7. Also verify ground truth: `const truth = await getGroundTruthAvailableSlots(listingId)`
- **Assertions**:
  - DB: `after === before + slotsRequested` (slot restored)
  - DB: `after <= totalSlots` (LEAST clamp — SI-08)
  - DB: `after === truth` (availableSlots matches ground truth — SI-02)
  - DB: Audit log entry with `action = 'CANCELLED'`, `previousStatus = 'ACCEPTED'`
- **Cleanup**: None (CANCELLED is terminal)
- **Flakiness Mitigation**:
  - Use DB assertions (not UI badge) for slot verification
  - Verify ground truth SUM query matches denormalized counter

---

### TEST-207: Idempotency — Duplicate Submission Returns Cached Result
- **Tier**: 2
- **Contract Ref**: T2-08
- **Invariant(s) Tested**: SI-12
- **Priority**: P0
- **Type**: Business Logic
- **Preconditions**:
  - Authenticated user
  - Available listing
- **Steps**:
  1. Navigate to listing, select dates
  2. Submit booking successfully (full flow)
  3. Record the sessionStorage idempotency key:
     ```typescript
     const idempotencyKey = await page.evaluate((listingId) => {
       return sessionStorage.getItem(`booking_key_${listingId}`);
     }, listingId);
     ```
  4. Verify key exists and is a valid UUID
  5. Clear the `booking_submitted_` flag but keep the idempotency key:
     ```typescript
     await page.evaluate((listingId) => {
       sessionStorage.removeItem(`booking_submitted_${listingId}`);
       // Keep booking_key_ — simulates retry with same key
     }, listingId);
     ```
  6. Attempt to submit again (reload page, same dates)
- **Assertions**:
  - Second submission: either server returns cached result (same bookingId) or duplicate detection blocks it
  - DB: Still exactly 1 booking (not 2)
  - SessionStorage: `booking_submitted_` flag re-set after retry
- **Cleanup**: Cancel the booking
- **Flakiness Mitigation**:
  - Two valid outcomes: idempotency cache hit OR duplicate detection — both are correct

---

### TEST-208: Accept+Cancel Race (Host vs Tenant)
- **Tier**: 2
- **Contract Ref**: T3-04
- **Invariant(s) Tested**: SI-10
- **Priority**: P0
- **Type**: Concurrency
- **Preconditions**:
  - PENDING booking exists (created by USER, listing owned by USER2 or vice versa)
  - Two browser contexts: host (listing owner) + tenant
- **Steps**:
  1. Create contexts for host and tenant
  2. Both navigate to `/bookings`
  3. Host: switch to "Received" tab, find the PENDING booking, locate Accept button
  4. Tenant: stay on "Sent" tab, find same booking, locate Cancel button
  5. Simultaneously:
     ```typescript
     await Promise.all([
       hostPage.getByRole('button', { name: /accept/i }).click(),
       tenantPage.getByRole('button', { name: /cancel/i }).click(),
     ]);
     ```
  6. Wait for both outcomes (one success, one error or "already modified")
- **Assertions**:
  - DB: Booking is in exactly ONE terminal-or-accepted state (ACCEPTED XOR CANCELLED), never both
  - DB: Booking `version` incremented exactly once
  - The "loser" sees error: "Booking was modified by another request"
  - DB: Audit log has exactly 1 state transition entry (not 2)
- **Cleanup**: Close contexts; cancel booking if ACCEPTED
- **Flakiness Mitigation**:
  - Accept either outcome as valid (non-deterministic race)
  - Verify final DB state is consistent regardless of winner

---

### Tier 3 — Edge Cases & Resilience

---

### TEST-301: Browser Back After Successful Booking
- **Tier**: 3
- **Contract Ref**: T3-03
- **Invariant(s) Tested**: BC-10
- **Priority**: P1
- **Type**: Edge Case
- **Preconditions**:
  - Authenticated user
  - Available listing
- **Steps**:
  1. Navigate to listing detail page
  2. Select dates, clear sessionStorage
  3. Submit booking successfully (full flow through confirmation)
  4. Wait for success message
  5. Verify sessionStorage flag is set:
     ```typescript
     const submitted = await page.evaluate((id) =>
       sessionStorage.getItem(`booking_submitted_${id}`), listingId
     );
     expect(submitted).toBeTruthy();
     ```
  6. Press browser back:
     ```typescript
     await page.goBack();
     await page.waitForLoadState('domcontentloaded');
     ```
  7. Check the booking form state
- **Assertions**:
  - UI: Either "already submitted" message shown, OR form is in a non-submittable state, OR redirect away from booking form
  - DB: Still exactly 1 booking (no duplicate created by back navigation)
  - SessionStorage: `booking_submitted_` flag still present
- **Cleanup**: Cancel the booking
- **Flakiness Mitigation**:
  - Wait for `domcontentloaded` after `goBack()` (not `networkidle`)
  - Accept multiple valid UI states (message, disabled form, redirect)

---

### TEST-302: Hold Expires During Confirmation Attempt
- **Tier**: 3
- **Contract Ref**: T3-05
- **Invariant(s) Tested**: SI-14
- **Priority**: P0
- **Type**: Edge Case
- **Preconditions**:
  - Listing with available slots, owned by host user
  - Feature flag `ENABLE_SOFT_HOLDS=on`
- **Steps**:
  1. Create already-expired hold via DB seed:
     ```typescript
     const { bookingId } = await createTestHold(listingId, tenantId, -2, 1);
     // Hold expired 2 minutes ago, 1 slot
     ```
  2. Record `availableSlots` before test
  3. Authenticate as host (listing owner)
  4. Navigate to `/bookings`
  5. Switch to "Received" tab
  6. Find the HELD booking and click "Accept"
  7. Wait for error response
- **Assertions**:
  - UI: Error message containing "hold has expired"
  - DB: Booking `status = 'EXPIRED'` (inline expiry triggered by the accept attempt)
  - DB: `availableSlots` restored (slot returned by inline expiry)
  - DB: Audit log entry with `action = 'EXPIRED'`, `actorType = 'SYSTEM'` (or no entry if sweeper gets it first)
- **Cleanup**: None (EXPIRED is terminal)
- **Flakiness Mitigation**:
  - Use DB-seeded expired hold (no real clock manipulation needed)
  - Accept either inline expiry or sweeper handling (both are correct)

---

### TEST-303: Error Messages Are User-Friendly (No Stack Traces)
- **Tier**: 3
- **Contract Ref**: T3-08
- **Invariant(s) Tested**: Section 3 (Error Taxonomy)
- **Priority**: P1
- **Type**: Edge Case
- **Preconditions**:
  - Authenticated user
  - Various error scenarios triggerable via UI or API
- **Steps**:
  Test multiple error scenarios in sub-tests:

  **Sub-test A: Capacity error**
  1. Navigate to a listing with `availableSlots=0` (or create via DB seed)
  2. Attempt to book → expect user-friendly error

  **Sub-test B: Duplicate booking error**
  1. Create existing PENDING booking via DB seed for same listing+dates
  2. Navigate to listing, select same dates, submit
  3. Expect "already have a booking" message

  **Sub-test C: Own listing error**
  1. Navigate to listing owned by test user
  2. Attempt to book → expect "cannot book your own listing"

  For each sub-test:
  ```typescript
  const alerts = page.locator('[role="alert"]');
  await alerts.first().waitFor({ state: 'visible', timeout: 15_000 });
  const alertText = await alerts.first().textContent();
  ```
- **Assertions**:
  - Each error message:
    - Does NOT contain "Error:", "at ", "stack", ".ts:", ".js:", "TypeError", "undefined", "null", `{`, `}`
    - IS in plain English (matches a known message from Section 3 of stability contract)
    - Appears in an element with `role="alert"` or a toast
  - No raw JSON objects displayed to user
  - No HTTP status codes shown (no "500", "409" visible in UI)
- **Cleanup**: None
- **Flakiness Mitigation**:
  - Use DB-seeded preconditions for predictable errors
  - Test negative assertions (absence of stack trace patterns) rather than exact message matching

---

### TEST-304: HoldCountdown Urgency Transitions
- **Tier**: 3
- **Contract Ref**: T3-09
- **Invariant(s) Tested**: SI-21
- **Priority**: P1
- **Type**: Edge Case
- **Preconditions**:
  - Active HELD booking visible on /bookings page
  - Feature flag `ENABLE_SOFT_HOLDS=on`
- **Steps**:
  1. Create a hold with `heldUntil` 15 minutes from now via DB seed
  2. Navigate to `/bookings`
  3. Find the HELD booking card
  4. Locate countdown timer: `page.locator('span').filter({ hasText: /\d+:\d{2}/ })`
  5. Verify initial state:
     ```typescript
     // Timer should show ~15:00 and be green (>50% remaining)
     const timerText = await countdown.textContent();
     expect(timerText).toMatch(/1[0-5]:\d{2}/); // Between 10:00-15:00
     ```
  6. Use `page.clock` to fast-forward to test urgency states:
     ```typescript
     await page.clock.install();
     // Fast forward to <2 minutes (red pulsing state)
     await page.clock.fastForward('13:30'); // 13.5 minutes
     ```
  7. Check for red urgency state
- **Assertions**:
  - Green state (>50%): Timer text visible, green color class present
  - Red state (<2min): `animate-pulse` class present on timer, red color
  - Expired state (0:00): Text shows "Hold expired" or similar gray text
  - `onExpired` callback fires only once (no multiple invocations)
- **Cleanup**: Cancel or let expire
- **Flakiness Mitigation**:
  - Use `page.clock.install()` + `fastForward()` instead of real-time waiting
  - Check CSS classes (reliable) rather than color values (theme-dependent)
  - Component test (`HoldCountdown.test.tsx`) already covers this thoroughly — E2E is supplementary

---

### TEST-305: WHOLE_UNIT Booking Overlap Prevention (E2E)
- **Tier**: 3
- **Contract Ref**: T3-07
- **Invariant(s) Tested**: SI-23
- **Priority**: P1
- **Type**: Concurrency
- **Preconditions**:
  - Listing with `bookingMode = 'WHOLE_UNIT'`, `totalSlots >= 1`
  - Feature flag `ENABLE_WHOLE_UNIT_MODE=true`
  - Two authenticated users
- **Steps**:
  1. Create two browser contexts (USER, USER2)
  2. Both navigate to the WHOLE_UNIT listing
  3. Both select overlapping dates
  4. User A submits booking → succeeds (PENDING)
  5. Host accepts User A's booking → ACCEPTED
  6. User B attempts to submit booking with overlapping dates
- **Assertions**:
  - User B: Error containing "overlapping" or "not enough available slots"
  - DB: Only 1 ACCEPTED booking exists
  - DB: PL/pgSQL trigger `check_whole_unit_overlap()` prevents the second booking at DB level
- **Cleanup**: Cancel User A's booking; close both contexts
- **Flakiness Mitigation**:
  - Sequential submission (User A first, then B) — deterministic order
  - DB-level verification of trigger enforcement

---

### TEST-306: Slot Accounting Invariant Verification
- **Tier**: 3
- **Contract Ref**: SI-02 (comprehensive)
- **Invariant(s) Tested**: SI-02, SI-05, SI-06, SI-07, SI-08
- **Priority**: P0
- **Type**: Business Logic (integration)
- **Preconditions**:
  - Fresh listing with `totalSlots=3`, `availableSlots=3`
  - Two authenticated users
  - Feature flag `ENABLE_SOFT_HOLDS=on`
- **Steps**:
  This is a multi-step lifecycle test verifying slot accounting through all transitions:

  1. **Initial state**: Verify `availableSlots = 3`, ground truth = 3
  2. **Create PENDING booking** (User A, 1 slot):
     - Assert `availableSlots` still 3 (SI-05: PENDING doesn't consume)
  3. **Create HOLD** (User B, 1 slot):
     - Assert `availableSlots = 2` (SI-06: HELD consumes immediately)
  4. **Host accepts HELD booking** (HELD→ACCEPTED):
     - Assert `availableSlots` still 2 (SI-07: no double-count)
  5. **Host accepts PENDING booking** (PENDING→ACCEPTED):
     - Assert `availableSlots = 1` (PENDING→ACCEPTED decrements)
  6. **Cancel ACCEPTED booking** (User A's):
     - Assert `availableSlots = 2` (SI-08: restore with LEAST clamp)
  7. **Final verification**: `availableSlots === ground truth SUM query`
- **Assertions**:
  - At each step: `availableSlots` matches expected value
  - Final: `availableSlots` matches `totalSlots - SUM(ACCEPTED + active HELD slotsRequested)`
  - Final: `availableSlots <= totalSlots` (LEAST clamp)
- **Cleanup**: Cancel remaining bookings
- **Flakiness Mitigation**:
  - Use DB-level assertions at each step (not UI badges)
  - Sequential operations (not concurrent) for deterministic accounting
  - This test is the "golden path" — if it passes, slot accounting is correct

---

### Tier 4 — Performance & Scale

---

### TEST-401: Response Time Baselines
- **Tier**: 4
- **Contract Ref**: T4-01
- **Invariant(s) Tested**: Section 4 (Performance Baselines)
- **Priority**: P1
- **Type**: Performance
- **Preconditions**:
  - Application running under normal conditions
  - Seed data with 50+ listings, 100+ bookings
- **Steps**:
  Measure response times for key operations across 10 iterations:

  1. **createBooking timing**:
     ```typescript
     const timings: number[] = [];
     for (let i = 0; i < 10; i++) {
       const start = Date.now();
       // Submit booking via page.evaluate or UI
       const elapsed = Date.now() - start;
       timings.push(elapsed);
       // Cancel booking for next iteration
     }
     const p95 = percentile(timings, 95);
     ```
  2. **getMyBookings timing**: Navigate to /bookings, measure load time
  3. **updateBookingStatus timing**: Accept/cancel operations
- **Assertions**:
  - `createBooking` P95 < 800ms (from Section 4)
  - `getMyBookings` P95 < 300ms
  - `updateBookingStatus` P95 < 500ms
  - No operation exceeds Max timeout (5s for booking, 3s for status update)
- **Cleanup**: Cancel all test bookings
- **Flakiness Mitigation**:
  - Run 10 iterations and use P95 (not worst case)
  - Exclude first iteration (cold start / JIT compilation)
  - Run in isolation (no parallel tests)
  - Mark as `test.slow()` for 3x timeout

---

### TEST-402: 10 Concurrent Booking Attempts
- **Tier**: 4
- **Contract Ref**: T4-02
- **Invariant(s) Tested**: SI-09, SI-01
- **Priority**: P1
- **Type**: Performance
- **Preconditions**:
  - Listing with `totalSlots=3`
  - 10 browser contexts (or API-level requests)
- **Steps**:
  1. Create listing with `totalSlots=3` via DB seed
  2. Create 10 browser contexts with different user sessions:
     ```typescript
     // Since we only have 2-3 test users, use API-level concurrency instead:
     const promises = Array.from({ length: 10 }, (_, i) =>
       page.evaluate(async (params) => {
         const { createBooking } = await import('/src/app/actions/booking');
         return createBooking(params.listingId, params.startDate, params.endDate, params.price, 1);
       }, { listingId, startDate, endDate, price })
     );
     const results = await Promise.all(promises);
     ```
  3. Count successes and failures
- **Assertions**:
  - Exactly 3 successes (one per available slot) — may be fewer due to PENDING not consuming slots
  - All failures have user-friendly error messages
  - DB: No more bookings than `totalSlots` in ACCEPTED+HELD state
  - DB: `availableSlots` consistent with ground truth
  - No 500 errors in any response
- **Cleanup**: Cancel all test bookings
- **Flakiness Mitigation**:
  - API-level concurrency (not 10 full browser contexts — too resource intensive)
  - Accept range of valid outcomes (PENDING doesn't consume slots, so >3 may succeed)
  - Mark as `test.slow()`

---

### TEST-403: Sweeper Handles Full Batch
- **Tier**: 4
- **Contract Ref**: T4-03
- **Invariant(s) Tested**: SI-11
- **Priority**: P1
- **Type**: Performance
- **Preconditions**:
  - 100 expired HELD bookings in DB (SWEEPER_BATCH_SIZE = 100)
  - Feature flag `ENABLE_SOFT_HOLDS=on`
- **Steps**:
  1. Seed 100 expired holds via DB:
     ```typescript
     for (let i = 0; i < 100; i++) {
       await createTestHold(listingId, tenantId, -(i + 1)); // All expired
     }
     ```
  2. Record start time
  3. Invoke sweeper:
     ```typescript
     const response = await page.request.get('/api/cron/sweep-expired-holds', {
       headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }
     });
     ```
  4. Record end time
- **Assertions**:
  - Response: `{ success: true, expired: 100 }`
  - Duration: < 5s (Max from Section 4)
  - DB: All 100 bookings now `status = 'EXPIRED'`
  - DB: All affected listings have correct `availableSlots` (LEAST-clamped)
- **Cleanup**: None (EXPIRED is terminal)
- **Flakiness Mitigation**:
  - Use generous timeout (batch operations are slower)
  - Mark as `test.slow()`
  - May need to split across multiple listings (100 holds on 1 listing may hit slot limits)

---

## Part 3: Gap Tests (New Coverage)

These tests fill specific gaps identified in the stability contract (Section 5, "Gap?" column).

---

### TEST-GAP-01: Browser Back Full E2E (Gap: T3-03)
- **Tier**: 3
- **Contract Ref**: T3-03 (gap: "Need E2E: back button navigation → verify message")
- **Invariant(s) Tested**: BC-10
- **Priority**: P1
- **Type**: Edge Case
- **Preconditions**:
  - Authenticated user, available listing
- **Steps**:
  1. Complete full booking flow (navigate to listing → select dates → submit → confirm → success)
  2. Record the booking ID from success response (if visible) or DB
  3. Press browser back button: `await page.goBack()`
  4. Wait for page to settle: `await page.waitForLoadState('domcontentloaded')`
  5. Check for "already submitted" guard:
     ```typescript
     // BookingForm checks sessionStorage for booking_submitted_{listingId}
     const guardMessage = page.getByText(/already submitted|already booked|booking exists/i);
     const formDisabled = page.locator('form button[type="submit"][disabled]');
     const guardActive = guardMessage.or(formDisabled);
     ```
  6. Attempt to click submit again (if form is visible)
- **Assertions**:
  - UI: Guard message visible OR form submit disabled OR redirect away
  - DB: Still exactly 1 booking (back-navigation did not create duplicate)
  - SessionStorage: `booking_submitted_` flag persists across back navigation
- **Cleanup**: Cancel the booking
- **Flakiness Mitigation**:
  - Accept multiple valid guard behaviors (message, disabled, redirect)
  - `domcontentloaded` wait (not `networkidle`)

---

### TEST-GAP-02: Hold Expiry with Real Timer (Gap: T3-05)
- **Tier**: 3
- **Contract Ref**: T3-05 (gap: "Need E2E with real timer advancement")
- **Invariant(s) Tested**: SI-14, SI-21
- **Priority**: P0
- **Type**: Edge Case
- **Preconditions**:
  - Feature flag `ENABLE_SOFT_HOLDS=on`
  - `CRON_SECRET` available
- **Steps**:
  1. Create HELD booking with very short TTL via DB seed (already expired):
     ```typescript
     const { bookingId } = await createTestHold(listingId, tenantId, -1, 1);
     ```
  2. Authenticate as HOST (listing owner)
  3. Navigate to `/bookings`
  4. Switch to "Received" tab
  5. Find the HELD booking
  6. Click "Accept" button
  7. Wait for error:
     ```typescript
     const errorMsg = page.locator('[role="alert"]')
       .or(page.locator('[data-sonner-toast][data-type="error"]'));
     await errorMsg.waitFor({ state: 'visible', timeout: 15_000 });
     ```
- **Assertions**:
  - UI: Error containing "hold has expired" or "expired"
  - DB: Booking status = EXPIRED (inline expiry triggered)
  - DB: Slots restored to listing
- **Cleanup**: None
- **Flakiness Mitigation**:
  - Pre-expired hold eliminates timing dependency
  - Same as TEST-302 but explicitly covers the gap marker

---

### TEST-GAP-03: Error Message Audit — All Categories (Gap: T3-08)
- **Tier**: 3
- **Contract Ref**: T3-08 (gap: "Need E2E: all error paths → verify [role=alert] text")
- **Invariant(s) Tested**: Section 3 (Error Taxonomy)
- **Priority**: P1
- **Type**: Edge Case
- **Preconditions**:
  - Authenticated user
  - DB-seeded scenarios for each error type
- **Steps**:
  Run as parameterized test with multiple scenarios:

  ```typescript
  const errorScenarios = [
    {
      name: 'duplicate booking',
      setup: () => createTestBooking(listingId, userId, 'PENDING', { startDate, endDate }),
      action: () => submitBookingViaUI(page, listingId, startDate, endDate),
      expectedPattern: /already have a booking/i,
      forbiddenPatterns: [/Error:/, /\.ts:/, /TypeError/, /undefined/],
    },
    {
      name: 'no available slots',
      setup: () => fillAllSlots(listingId),
      action: () => submitBookingViaUI(page, listingId, startDate, endDate),
      expectedPattern: /not enough available slots|no available slots/i,
      forbiddenPatterns: [/Error:/, /\.ts:/, /500/],
    },
    {
      name: 'own listing',
      setup: () => {}, // navigate to own listing
      action: () => submitBookingOnOwnListing(page),
      expectedPattern: /cannot book your own/i,
      forbiddenPatterns: [/Error:/, /stack/, /at /],
    },
  ];

  for (const scenario of errorScenarios) {
    test(`error message: ${scenario.name}`, async () => {
      await scenario.setup();
      await scenario.action();
      const alert = page.locator('[role="alert"]').first();
      await alert.waitFor({ state: 'visible', timeout: 15_000 });
      const text = await alert.textContent();

      expect(text).toMatch(scenario.expectedPattern);
      for (const forbidden of scenario.forbiddenPatterns) {
        expect(text).not.toMatch(forbidden);
      }
    });
  }
  ```
- **Assertions**:
  - Each error scenario:
    - Shows message matching expected pattern
    - Never contains: stack traces, file paths, TypeErrors, raw status codes, JSON objects
    - Appears in `[role="alert"]` or sonner toast
- **Cleanup**: Undo setup for each scenario
- **Flakiness Mitigation**:
  - DB-seeded preconditions for deterministic errors
  - Negative assertions (absence of bad patterns) are stable

---

## Part 4: Shared Utilities Reference

### Existing Helpers to Reuse

| Helper | Location | Usage |
|--------|----------|-------|
| `test` (extended fixture) | `tests/e2e/helpers/test-utils.ts` | All tests — provides `auth`, `nav`, `network`, `data`, auto-mocked maps |
| `searchResultsContainer(page)` | `tests/e2e/helpers/test-utils.ts` | Scope to visible results container (desktop vs mobile) |
| `scopedCards(page)` | `tests/e2e/helpers/test-utils.ts` | Listing cards in visible container |
| `waitForStable(page)` | `tests/e2e/helpers/test-utils.ts` | Wait for DOM settled state |
| `selectBookingDates(page)` | `tests/e2e/helpers/booking-helpers.ts` | Basic date selection (30 days out) |
| `dataHelpers.futureDate(n)` | `tests/e2e/helpers/data-helpers.ts` | Generate YYYY-MM-DD n days from now |
| `authHelpers.loginViaUI` | `tests/e2e/helpers/auth-helpers.ts` | Manual login for auth tests |

### Selectors Reference

| Element | Selector | Notes |
|---------|----------|-------|
| Start date picker | `#booking-start-date` | Wait for `[data-state]` attribute for hydration |
| End date picker | `#booking-end-date` | Same hydration wait |
| Slot selector input | `#slot-selector` (`role="spinbutton"`) | Has `aria-valuemin`, `aria-valuemax`, `aria-valuenow` |
| Slot increase | `[aria-label="Increase slots"]` | |
| Slot decrease | `[aria-label="Decrease slots"]` | |
| Slot badge | `[data-testid="slot-badge"]` | Text: "Available", "Filled", "X of Y open", "All X open" |
| Book button | `main button` matching `/request to book/i` | Use `.first()` to avoid strict mode |
| Hold button | `main button` matching `/place hold/i` | May not exist if feature flag off |
| Confirm modal | `[role="dialog"][aria-modal="true"]` | Has `aria-labelledby="booking-confirm-title"` |
| Confirm button | Modal `button` matching `/confirm/i` | |
| Error alert | `[role="alert"]` | Multiple may exist; use `.first()` |
| Date error | `#startDate-error`, `#endDate-error` | Have `role="alert"` |
| Booking card | `[data-testid="booking-item"]` | On /bookings page |
| Empty state | `[data-testid="empty-state"]` | On /bookings when no bookings |
| Accept button | Button matching `/accept/i` | On received booking cards |
| Reject button | Button matching `/reject/i` | On received booking cards |
| Cancel button | Button matching `/cancel booking/i` | On sent booking cards |
| Rejection reason | `#rejection-reason` | In reject dialog |
| Toast (sonner) | `[data-sonner-toast]` | `[data-type="success"]` or `[data-type="error"]` |
| Hold countdown | `span` matching `/\d+:\d{2}/` | Color classes indicate urgency |
| Calendar next month | `button[aria-label="Next month"]` | Inside Radix popover |
| Calendar day | Popover `button` matching `/^{day}$/` | Use `dispatchEvent('click')` |

### Month Offset Strategy for Test Isolation

```typescript
// Each browser project uses different months to avoid date collisions.
// Each test within a spec uses an additional offset.
// Each retry adds +2 months.

function getMonthOffset(testInfo: TestInfo, testIndex: number): number {
  const PROJECT_OFFSETS: Record<string, number> = {
    'chromium': 3,
    'firefox': 5,
    'webkit': 7,
    'Mobile Chrome': 9,
    'Mobile Safari': 11,
    // Stability tests use high offsets to avoid collision with journey tests
    'stability-smoke': 13,
    'stability-business': 15,
    'stability-edge': 17,
  };

  const base = PROJECT_OFFSETS[testInfo.project.name] ?? 13;
  const retryOffset = testInfo.retry * 2;
  const testOffset = testIndex; // 0, 1, 2, ... for tests within same spec

  return base + retryOffset + testOffset;
}
```

### Session Storage Keys Reference

```typescript
// BookingForm.tsx manages these keys:
const SESSION_KEYS = {
  submitted: (listingId: string) => `booking_submitted_${listingId}`,
  pendingKey: (listingId: string) => `booking_pending_key_${listingId}`,
  bookingKey: (listingId: string) => `booking_key_${listingId}`,
};

// Clear all booking session state for a listing:
async function clearBookingSessionState(page: Page, listingId: string) {
  await page.evaluate((id) => {
    sessionStorage.removeItem(`booking_submitted_${id}`);
    sessionStorage.removeItem(`booking_pending_key_${id}`);
    sessionStorage.removeItem(`booking_key_${id}`);
  }, listingId);
}

// Clear ALL booking session state:
async function clearAllBookingSessionState(page: Page) {
  await page.evaluate(() => {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith('booking_'))
      .forEach(k => sessionStorage.removeItem(k));
  });
}
```

---

## Part 5: Implementation Priority

### Phase 1 — Immediate (fill gaps, highest ROI)

| Test | Why First | Effort |
|------|-----------|--------|
| TEST-306 (Slot Accounting Lifecycle) | Golden-path invariant verification; catches regression in any slot operation | Medium |
| TEST-201 (Last-Slot Race) | P0 concurrency — existing RC-06 but this version adds DB assertions | Medium |
| TEST-204 (Hold Expiration) | Validates sweeper + slot restore + audit via direct cron invocation | Low |
| TEST-GAP-01 (Browser Back) | Fills T3-03 gap — only gap at P1 priority | Low |
| TEST-GAP-02 (Hold Expiry Accept) | Fills T3-05 gap — P0 invariant | Low |

### Phase 2 — Core Coverage

| Test | Why | Effort |
|------|-----|--------|
| TEST-101 through TEST-105 | Smoke tier — deployment gate | Medium |
| TEST-202 (Double-Click) | P0 UX protection | Low |
| TEST-203 (Multi-Tab Duplicate) | P0 data integrity | Low |
| TEST-208 (Accept+Cancel Race) | P0 concurrency invariant | Medium |

### Phase 3 — Completeness

| Test | Why | Effort |
|------|-----|--------|
| TEST-205 (Price Tampering) | Financial integrity — may need API-level test | Medium |
| TEST-206 (Cancel Restores Slots) | Validates LEAST clamp | Low |
| TEST-207 (Idempotency) | Validates sessionStorage lifecycle | Medium |
| TEST-301 (Browser Back) | P1 edge case | Low |
| TEST-303 (Error Messages) | P1 UX quality — parameterized test | Medium |
| TEST-304 (HoldCountdown) | P1 UI behavior — supplementary to component test | Medium |
| TEST-305 (WHOLE_UNIT E2E) | P1 mode-specific test | Medium |
| TEST-GAP-03 (Error Audit) | Fills T3-08 gap | Medium |

### Phase 4 — Performance (scheduled, not per-PR)

| Test | Why | Effort |
|------|-----|--------|
| TEST-401 (Response Times) | Establishes baselines | High |
| TEST-402 (10 Concurrent) | Load test via API | High |
| TEST-403 (Sweeper Batch) | Validates batch performance | Medium |
