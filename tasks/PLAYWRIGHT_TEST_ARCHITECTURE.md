# Playwright Test Architecture Specification

**Author**: simulation-validator
**Date**: 2026-03-27
**Status**: DRAFT (awaiting simulation plans from flow-strategist, edge-case-hunter, concurrency-guardian)

---

## 0. Executive Summary

RoomShare already has **extensive** E2E infrastructure: 189 spec files, 1,719 test cases, ~20 helper modules, 2 Page Object Models, a test API layer, and a 10-shard CI pipeline. The infrastructure is mature but suffers from **41% test.skip rate** (1,178 skipped tests out of 1,719), suggesting many tests were written speculatively or are unstable.

**Key recommendation**: The highest-ROI action is NOT writing more tests — it's triaging existing skipped tests, stabilizing what exists, and filling coverage gaps with surgical precision. This architecture document provides both the triage framework and the specification for new tests.

---

## 1. Current Infrastructure Audit

### 1.1 What Already Exists (DO NOT REWRITE)

| Component | Location | Status |
|---|---|---|
| Playwright config | `playwright.config.ts` | Production-ready, 10 projects |
| Auth setup (3 users) | `tests/e2e/auth.setup.ts` | Working: user, admin, user2 |
| Global seed | `tests/e2e/global-setup.ts` → `scripts/seed-e2e.js` | Working: 15+ SF listings, users, conversations |
| Test fixture | `tests/e2e/helpers/test-utils.ts` | Auto-mocks map tiles, disables animations |
| Test API client | `tests/e2e/helpers/stability-helpers.ts:testApi()` | DB operations via `/api/test-helpers` |
| Data factory | `tests/e2e/helpers/data-helpers.ts` | Generators for all entities |
| A11y helpers | `tests/e2e/helpers/a11y-helpers.ts` | axe-core integration |
| Mobile helpers | `tests/e2e/helpers/mobile-helpers.ts` | Bottom sheet, viewport utils |
| Network helpers | `tests/e2e/helpers/network-helpers.ts` | Throttling, offline simulation |
| Booking helpers | `tests/e2e/helpers/booking-helpers.ts` + `stability-helpers.ts` | Date selection, race condition setup |
| Messaging helpers | `tests/e2e/messaging/messaging-helpers.ts` | Multi-user context, send/receive |
| Filter helpers | `tests/e2e/helpers/filter-helpers.ts` | Filter modal interactions |
| Session expiry helpers | `tests/e2e/helpers/session-expiry-helpers.ts` | Token expiration simulation |
| Sync helpers | `tests/e2e/helpers/sync-helpers.ts` | Polling-based assertions |
| Map mock helpers | `tests/e2e/helpers/map-mock-helpers.ts` | Tile/style/geocoding mocking |
| POM: CreateListingPage | `tests/e2e/page-objects/create-listing.page.ts` | Complete: form fill, upload, submit, assertions |
| POM: NearbyPlacesPage | `tests/e2e/nearby/nearby-page.pom.ts` | Complete: search, category, radius, map |
| Test images | `tests/e2e/fixtures/test-images/` | 3 valid + 1 invalid type |

### 1.2 Playwright Configuration (DO NOT MODIFY)

```
Version: @playwright/test ^1.58.2
Test dir: ./tests/e2e
Projects: 10 (chromium, firefox, webkit, Mobile Chrome, Mobile Safari,
          chromium-admin, chromium-anon, firefox-anon, webkit-anon, setup)
CI shards: 10 (NOT 40 — correcting original brief)
CI workers: 1 per shard
Retries: 2 on CI, 0 local
Timeouts: 60s test / 15s action / 45s navigation / 15s expect
Reporter: list + html + json
Artifacts: traces on first retry, screenshots on failure, video on first retry
```

### 1.3 Skip Triage (CRITICAL — do before adding new tests)

**Total skips**: ~1,178 `test.skip()` calls across 136 files
**CI threshold**: 1,200 (dangerously close — `scripts/count-test-skips.sh --threshold 1200`)

**Skip categories** (from skip reason analysis):

| Category | Approx Count | Action |
|---|---|---|
| Map/WebGL unavailable in headless | ~300 | KEEP skipped — WebGL is inherently unavailable in headless CI. Guard with `isMapAvailable()`. |
| Precondition missing (data not seeded) | ~150 | FIX seed script or use `testApi()` to create data in `beforeAll`. |
| Feature not implemented / TODO | ~200 | REMOVE spec if feature doesn't exist; UNSKIP if feature was implemented since. |
| CI environment (flaky in CI only) | ~100 | INVESTIGATE — likely timing issues. Add explicit waits or `expect.poll()`. |
| Auth/session expired | ~50 | FIX auth setup or add session refresh. |
| Hardcoded `test.skip(true, ...)` | ~200+ | TRIAGE individually — many are stale. |
| Insufficient test data | ~80 | FIX seed to provide adequate data (e.g., >12 listings for pagination). |

**Recommended triage process**:
1. Run `bash scripts/count-test-skips.sh` to get current baseline
2. Sort by severity: fix precondition/data skips first (quick wins)
3. Remove specs for features that don't exist
4. Convert hardcoded skips to conditional skips with runtime guards
5. Target: reduce to <800 skips (33% improvement)

---

## 2. Test File Structure

The existing structure is **already well-organized**. Do NOT reorganize. Instead, extend it:

```
tests/e2e/
├── auth.setup.ts                    # EXISTS — 3 user auth setup
├── global-setup.ts                  # EXISTS — DB seed
├── fixtures/
│   └── test-images/                 # EXISTS — test image files
│   └── api-responses/               # NEW — mock API response JSON fixtures
├── page-objects/
│   ├── create-listing.page.ts       # EXISTS
│   ├── listing-detail.page.ts       # NEW — needed for booking/review flows
│   ├── search.page.ts               # NEW — consolidate scattered search selectors
│   ├── messages.page.ts             # NEW — wrap messaging-helpers into POM
│   ├── bookings.page.ts             # NEW — booking dashboard POM
│   ├── profile.page.ts              # NEW — profile/settings POM
│   ├── admin.page.ts                # NEW — admin panel POM
│   └── base.page.ts                 # NEW — shared navbar, footer, toast assertions
├── helpers/                         # EXISTS — 20+ helper modules (DO NOT restructure)
│   └── index.ts                     # EXISTS — central export
├── a11y/                            # EXISTS (6 specs)
├── admin/                           # EXISTS (3 specs)
├── auth/                            # EXISTS (5 specs)
├── booking/                         # EXISTS (6 specs)
├── create-listing/                  # EXISTS (7 specs)
├── journeys/                        # EXISTS (37 specs)
├── messaging/                       # EXISTS (4 specs)
├── search-filters/                  # EXISTS (22 specs)
├── search-stability/                # EXISTS (4 specs)
├── semantic-search/                 # EXISTS (6 specs)
├── session-expiry/                  # EXISTS (7 specs)
├── pagination/                      # EXISTS (8 specs)
├── nearby/                          # EXISTS (6 specs)
├── performance/                     # EXISTS (6 specs)
├── visual/                          # EXISTS (4 specs)
├── security/                        # EXISTS (1 spec)
├── stability/                       # EXISTS (2 specs)
├── notifications/                   # EXISTS (2 specs)
├── mobile/                          # EXISTS (4 specs)
├── responsive/                      # EXISTS (3 specs)
├── seo/                             # EXISTS (1 spec)
├── saved/                           # EXISTS (1 spec)
├── recently-viewed/                 # EXISTS (1 spec)
├── listing-detail/                  # EXISTS (1 spec)
├── listing-edit/                    # EXISTS (1 spec)
├── profile/                         # EXISTS (1 spec)
├── settings/                        # EXISTS (1 spec)
├── homepage/                        # EXISTS (2 specs)
├── api-depth/                       # EXISTS (2 specs)
└── concurrent/                      # NEW — multi-user race condition tests
```

### New directories needed:
- `tests/e2e/concurrent/` — multi-user race condition tests (from concurrency-guardian)
- `tests/e2e/fixtures/api-responses/` — shared mock response fixtures

### New files to create:
- 7 new Page Object Model classes (Section 3)
- Test specs per simulation plan (Section 5, pending from teammates)

---

## 3. Page Object Model Classes

### 3.1 Design Principles (matching existing POMs)

All POMs follow the pattern established by `CreateListingPage` and `NearbyPlacesPage`:
- Constructor takes `Page` and defines all locators via `getByRole`, `getByLabel`, `getByText`, or `data-testid`
- Public readonly locator properties for direct assertions
- Action methods (`async goto()`, `async fill*()`, `async submit()`)
- Assertion methods (`async expect*()`)
- Wait methods for async operations
- Import `expect` from `@playwright/test`, not from helpers

### 3.2 BasePage (new — shared across all POMs)

```typescript
// tests/e2e/page-objects/base.page.ts
export class BasePage {
  readonly page: Page;

  // Navbar
  readonly navbar: Locator;
  readonly userMenuButton: Locator;
  readonly loginLink: Locator;
  readonly signupLink: Locator;
  readonly messagesLink: Locator;
  readonly notificationsBell: Locator;
  readonly unreadBadge: Locator;

  // Toast notifications (Sonner)
  readonly toast: Locator;
  readonly toastSuccess: Locator;
  readonly toastError: Locator;

  // Footer
  readonly footer: Locator;

  // Actions
  async goto(path: string): Promise<void>;
  async waitForPageLoad(): Promise<void>;
  async expectToast(text: string | RegExp): Promise<void>;
  async expectNoToast(): Promise<void>;
  async isLoggedIn(): Promise<boolean>;
  async logout(): Promise<void>;
}
```

### 3.3 SearchPage (new — consolidates search selectors)

```typescript
// tests/e2e/page-objects/search.page.ts
export class SearchPage {
  // Search bar
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly locationInput: Locator;

  // Results container (viewport-aware: mobile vs desktop)
  readonly resultsContainer: Locator; // Uses searchResultsContainer() pattern
  readonly listingCards: Locator;     // Scoped to visible container
  readonly emptyState: Locator;
  readonly resultCount: Locator;

  // Sort
  readonly sortDropdown: Locator;

  // Filter modal
  readonly filtersButton: Locator;
  readonly filterModal: Locator;
  readonly priceMin: Locator;
  readonly priceMax: Locator;
  readonly roomTypeCheckboxes: Locator;
  readonly amenityCheckboxes: Locator;
  readonly applyFiltersButton: Locator;
  readonly resetFiltersButton: Locator;
  readonly activeFilterChips: Locator;

  // Pagination
  readonly loadMoreButton: Locator;

  // Map
  readonly mapContainer: Locator;
  readonly mapMarkers: Locator;
  readonly searchAsIMoveToggle: Locator;

  // Mobile bottom sheet
  readonly bottomSheet: Locator;
  readonly bottomSheetHandle: Locator;

  // Actions
  async goto(params?: URLSearchParams): Promise<void>;
  async search(query: string): Promise<void>;
  async openFilters(): Promise<void>;
  async applyFilters(): Promise<void>;
  async resetFilters(): Promise<void>;
  async selectSort(option: string): Promise<void>;
  async loadMore(): Promise<void>;
  async getCardCount(): Promise<number>;
  async clickCard(index: number): Promise<void>;
  async waitForResults(): Promise<void>;

  // Assertions
  async expectResultCount(min: number): Promise<void>;
  async expectEmptyState(): Promise<void>;
  async expectFilterChip(text: string): Promise<void>;
  async expectSortedBy(field: string): Promise<void>;
}
```

### 3.4 ListingDetailPage (new)

```typescript
// tests/e2e/page-objects/listing-detail.page.ts
export class ListingDetailPage {
  // Listing info
  readonly title: Locator;
  readonly price: Locator;
  readonly description: Locator;
  readonly roomType: Locator;
  readonly amenities: Locator;
  readonly images: Locator;
  readonly imageCarousel: Locator;

  // Host info
  readonly hostName: Locator;
  readonly hostAvatar: Locator;
  readonly contactHostButton: Locator;

  // Booking form
  readonly bookingForm: Locator;
  readonly dateInput: Locator;
  readonly slotsInput: Locator;
  readonly bookButton: Locator;
  readonly holdButton: Locator;
  readonly availabilityBadge: Locator;

  // Reviews section
  readonly reviewsSection: Locator;
  readonly reviewCards: Locator;
  readonly writeReviewButton: Locator;
  readonly averageRating: Locator;

  // Nearby places (delegates to NearbyPlacesPage)
  readonly nearbySection: Locator;

  // Save/favorite
  readonly saveButton: Locator;

  // Actions
  async goto(listingId: string): Promise<void>;
  async book(dates?: { start: string; end: string }): Promise<void>;
  async holdSpot(): Promise<void>;
  async contactHost(message: string): Promise<void>;
  async writeReview(rating: number, comment: string): Promise<void>;
  async saveToFavorites(): Promise<void>;

  // Assertions
  async expectBookable(): Promise<void>;
  async expectFullyBooked(): Promise<void>;
  async expectHeld(): Promise<void>;
  async expectPrice(amount: number): Promise<void>;
}
```

### 3.5 MessagesPage (new — wraps messaging-helpers)

```typescript
// tests/e2e/page-objects/messages.page.ts
export class MessagesPage {
  // Conversation list
  readonly conversationList: Locator;
  readonly conversationItems: Locator;
  readonly unreadBadges: Locator;

  // Chat window
  readonly chatWindow: Locator;
  readonly chatHeader: Locator;
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly messageBubbles: Locator;
  readonly typingIndicator: Locator;
  readonly connectionStatus: Locator;
  readonly charCounter: Locator;

  // Actions
  async goto(): Promise<void>;
  async openConversation(index: number): Promise<void>;
  async sendMessage(text: string): Promise<void>;
  async waitForMessage(text: string): Promise<void>;

  // Assertions
  async expectConversationCount(count: number): Promise<void>;
  async expectMessageSent(text: string): Promise<void>;
  async expectTypingIndicator(): Promise<void>;
}
```

### 3.6 BookingsPage (new)

```typescript
// tests/e2e/page-objects/bookings.page.ts
export class BookingsPage {
  // Booking list
  readonly bookingCards: Locator;
  readonly statusFilters: Locator;
  readonly emptyState: Locator;

  // Booking detail
  readonly bookingStatus: Locator;
  readonly bookingDates: Locator;
  readonly bookingPrice: Locator;
  readonly listingLink: Locator;

  // Host actions
  readonly acceptButton: Locator;
  readonly rejectButton: Locator;
  readonly rejectionReasonInput: Locator;

  // Tenant actions
  readonly cancelButton: Locator;

  // Hold countdown
  readonly holdCountdown: Locator;
  readonly convertHoldButton: Locator;

  // Actions
  async goto(): Promise<void>;
  async filterByStatus(status: string): Promise<void>;
  async acceptBooking(index: number): Promise<void>;
  async rejectBooking(index: number, reason: string): Promise<void>;
  async cancelBooking(index: number): Promise<void>;

  // Assertions
  async expectBookingStatus(index: number, status: string): Promise<void>;
  async expectBookingCount(count: number): Promise<void>;
}
```

### 3.7 ProfilePage and AdminPage (new)

These follow the same pattern. Detailed locators depend on actual page implementation — will be finalized after codebase-architect completes the feature map.

---

## 4. Custom Fixtures

### 4.1 Existing Fixtures (DO NOT MODIFY)

The current `test` fixture in `test-utils.ts` already provides:
- `auth` — auth helpers
- `nav` — navigation helpers
- `network` — network condition helpers
- `assert` — assertion helpers
- `data` — test data factory
- `_mockMapTiles` (auto) — external map request mocking
- `_disableAnimations` (auto) — CSS transition/animation suppression

### 4.2 New Fixtures Needed

```typescript
// Extend the existing test fixture in test-utils.ts, NOT create a new base

export const test = base.extend<{
  // ... existing fixtures ...

  // Multi-user contexts (for concurrency tests)
  tenantContext: { context: BrowserContext; page: Page };
  hostContext: { context: BrowserContext; page: Page };
  adminContext: { context: BrowserContext; page: Page };
  user2Context: { context: BrowserContext; page: Page };

  // Test API client (wraps testApi for convenience)
  api: {
    createExpiredHold: (listingId: string, email: string) => Promise<any>;
    cleanupBookings: (listingId: string) => Promise<void>;
    getSlotInfo: (listingId: string) => Promise<any>;
    invokeSweeper: () => Promise<any>;
  };
}>({
  tenantContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: 'playwright/.auth/user.json',
    });
    const page = await context.newPage();
    await use({ context, page });
    await context.close();
  },

  hostContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: 'playwright/.auth/user.json', // host is the default user in seed
    });
    const page = await context.newPage();
    await use({ context, page });
    await context.close();
  },

  user2Context: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: 'playwright/.auth/user2.json',
    });
    const page = await context.newPage();
    await use({ context, page });
    await context.close();
  },

  adminContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: 'playwright/.auth/admin.json',
    });
    const page = await context.newPage();
    await use({ context, page });
    await context.close();
  },

  api: async ({ page }, use) => {
    // Wraps stability-helpers testApi for DX
    await use({
      createExpiredHold: (listingId, email) =>
        createExpiredHold(page, listingId, email),
      cleanupBookings: (listingId) =>
        cleanupTestBookings(page, { listingId, resetSlots: true }),
      getSlotInfo: (listingId) =>
        getSlotInfoViaApi(page, listingId),
      invokeSweeper: () =>
        invokeSweeper(page),
    });
  },
});
```

### 4.3 External Service Mocking Strategy

The project already mocks map tiles. Additional mocking needed:

| Service | Current Mocking | New Mocking Needed |
|---|---|---|
| MapLibre tiles/styles/geocoding | Auto-mocked via `_mockMapTiles` fixture | None |
| Supabase image upload | Mocked in `CreateListingPage.mockImageUpload()` | Extend for failure/timeout scenarios |
| Radar.io (nearby places) | Not mocked (hits real API) | Mock via `page.route()` for CI stability |
| Google OAuth | Bypassed (credentials auth in E2E) | None |
| Turnstile CAPTCHA | Disabled via `TURNSTILE_ENABLED=false` | None |

---

## 5. Assertion Strategy

### 5.1 Core Assertion Principles

Every test must assert at **exactly one level** (pick the most meaningful):

1. **DOM state** (primary for E2E): Element visible, text content, order, count
2. **URL state**: Correct route, query parameters, hash
3. **Network state**: Correct API calls made, correct status codes
4. **Side effects** (via test API): DB records created/updated, notifications sent

Do NOT mix all four in a single test. Exception: booking lifecycle tests should assert both DOM + side effects because the state machine is safety-critical.

### 5.2 Assertion Patterns by Flow Type

**Search/Browse flows**: DOM assertions only
```typescript
await expect(page.locator('[data-testid="listing-card"]')).toHaveCount(12);
await expect(page).toHaveURL(/sort=price_asc/);
```

**Form submission flows**: Network + DOM
```typescript
const response = await page.waitForResponse(r => r.url().includes('/api/listings'));
expect(response.status()).toBe(201);
await expect(page).toHaveURL(/\/listings\/[a-zA-Z0-9]/);
```

**Booking lifecycle flows**: DOM + Side effects (test API)
```typescript
// Assert UI updated
await expect(page.getByText(/booking confirmed/i)).toBeVisible();
// Assert DB state via test API
const slotInfo = await testApi(page, 'getSlotInfo', { listingId });
expect(slotInfo.data.availableSlots).toBe(expectedSlots);
```

**Concurrent flows**: Side effects only (two contexts can't share DOM assertions)
```typescript
// Both users try to book — only one should succeed
const [res1, res2] = await Promise.allSettled([
  user1Page.waitForResponse(r => r.url().includes('/api/bookings')),
  user2Page.waitForResponse(r => r.url().includes('/api/bookings')),
]);
// Exactly one should be 201, the other 409
```

### 5.3 Performance Budgets

| Page | Load Time (3G) | Load Time (WiFi) | LCP | CLS | API Response |
|---|---|---|---|---|---|
| Homepage | <5s | <2s | <2.5s | <0.1 | N/A |
| Search | <5s | <2s | <2.5s | <0.1 | <500ms |
| Listing detail | <5s | <2s | <2.5s | <0.1 | <300ms |
| Messages | <5s | <2s | <3s | <0.1 | <500ms |
| Booking form | N/A | <1s | <2s | <0.05 | <300ms |
| Admin panel | N/A | <3s | <3s | <0.1 | <1s |

Note: Performance tests already exist in `tests/e2e/performance/`. Extend, don't duplicate.

### 5.4 Accessibility Standards

- **Standard**: WCAG 2.1 AA (already configured in `A11Y_CONFIG`)
- **Tool**: axe-core via `@axe-core/playwright` (already integrated)
- **Excluded**: Map canvases (third-party, `.maplibregl-canvas`)
- **Known acceptable**: `color-contrast`, `aria-prohibited-attr` (Radix UI framework artifacts)

---

## 6. CI Integration Plan

### 6.1 Current Pipeline (DO NOT MODIFY)

```yaml
# .github/workflows/playwright.yml
# 10 shards × 6 projects = ~60 test matrix cells
# Production build: next build + next start
# PostGIS + pgvector service container
# Blob reporter → merged HTML report
```

### 6.2 Shard Budget

Current: 189 spec files across 10 shards = ~19 specs/shard
Each shard has 30min timeout, 1 worker, 2 retries.

**Capacity analysis**: At 60s/test average and ~10 tests/spec, each shard can handle ~25-30 spec files. Current load is well within capacity.

**Recommendation**: Can add ~100 more spec files without changing shard count. If we exceed that, increase to 15 shards.

### 6.3 New Test Placement Rules

| Test Type | File Naming | Project(s) | Priority |
|---|---|---|---|
| Auth flow (anon) | `*.anon.spec.ts` | chromium-anon, firefox-anon, webkit-anon | P0 |
| Auth flow (user) | `*.spec.ts` | chromium, Mobile Chrome | P0 |
| Admin flow | `*.admin.spec.ts` | chromium-admin | P1 |
| Booking flow | `*.spec.ts` | chromium | P0 |
| Search flow (anon) | `*.anon.spec.ts` | chromium-anon | P0 |
| Mobile flow | `*.anon.spec.ts` or `*.spec.ts` | Mobile Chrome, Mobile Safari | P1 |
| Concurrent flow | `*.spec.ts` | chromium only | P1 |
| Visual regression | `*.visual.spec.ts` | chromium only | P2 |
| Performance | `*.perf.spec.ts` | chromium only | P2 |
| A11y audit | `*.a11y.spec.ts` or `*.anon.spec.ts` | chromium-anon | P1 |

### 6.4 Retry and Flake Strategy

Current: 2 retries on CI. This is appropriate.

**Flake prevention rules** (enforce in code review):
1. Never use `page.waitForTimeout()` — use `expect(locator).toBeVisible()` or `expect.poll()`
2. Always scope selectors to visible viewport using `searchResultsContainer()` pattern
3. Gate map-dependent assertions behind `isMapAvailable()` guards
4. Use `waitForHydration()` before interacting with SSR-streamed content
5. Use `waitForSortHydrated()` before interacting with sort controls
6. Mock all external services (no network-dependent assertions in CI)
7. Use `testApi()` for DB setup instead of navigating through UI in `beforeAll`

### 6.5 Artifact Collection

Already configured:
- **Trace**: on-first-retry (Playwright trace viewer)
- **Screenshot**: on-failure only
- **Video**: on-first-retry
- **HTML report**: merged across all shards, uploaded as artifact (14-day retention)
- **Blob reports**: per-shard, uploaded (7-day retention)
- **Test results JSON**: `test-results/results.json`

No changes needed.

---

## 7. Stability Contract

### 7.1 Priority Definitions

| Priority | Definition | Pass Rate Target | Example |
|---|---|---|---|
| **P0** | Critical user journey — revenue/safety impact if broken | 100% | Booking flow, auth, search results display |
| **P1** | Important feature — degraded UX if broken | 98% | Filters, messaging, reviews, profile |
| **P2** | Enhancement — noticeable but workaround exists | 95% | Visual regression, performance budgets, SEO |
| **P3** | Nice-to-have — cosmetic or minor UX | 90% | Animations, tooltips, edge-case empty states |

### 7.2 P0 Tests (must pass on every PR)

These tests already exist and should be marked as P0:

| Flow | Existing Spec | Tests |
|---|---|---|
| Search loads results | `search-smoke.spec.ts` | 5 active |
| Auth login/signup | `auth/login-signup.anon.spec.ts` | ~5 active |
| Listing detail renders | `listing-detail/listing-detail.spec.ts` | subset |
| Booking happy path | `booking/booking-flow.spec.ts` | 5 |
| Create listing | `create-listing/create-listing.spec.ts` | ~8 |
| Search P0 smoke | `search-p0-smoke.anon.spec.ts` | 6 active |

**P0 smoke workflow**: Already exists as `playwright-smoke.yml`. Should be expanded to include booking-flow and create-listing.

### 7.3 Skip Budget

| Current | Target (Phase 1) | Target (Phase 2) |
|---|---|---|
| ~1,178 skips | <900 skips | <600 skips |
| 41% skip rate | <35% skip rate | <25% skip rate |
| CI threshold: 1,200 | CI threshold: 1,000 | CI threshold: 700 |

---

## 8. Visual Regression & Accessibility

### 8.1 Visual Regression

Existing: 4 visual spec files (all tests currently skipped).

**Implementation approach**:
- Use `toHaveScreenshot()` with threshold: `maxDiffPixelRatio: 0.01`
- Store baselines per project (chromium baseline differs from Mobile Chrome)
- Run only on `chromium` project to avoid cross-browser rendering noise
- Focus on: filter modal, listing card grid, booking form, mobile bottom sheet

**Caution**: Visual regression tests are inherently flaky across environments. Keep the set small (~20 screenshots max) and use generous thresholds.

### 8.2 Keyboard Navigation

Existing: `search-a11y-keyboard.anon.spec.ts` (basic coverage).

**Gaps to fill**:
- Tab order through booking form
- Escape key handling in modals/dialogs
- Arrow key navigation in sort dropdown, filter checkboxes
- Focus trap in filter modal
- Skip links on every page

### 8.3 Screen Reader Compatibility

Already covered by axe-core scans:
- `a11y/axe-page-audit.anon.spec.ts` (anonymous pages)
- `a11y/axe-page-audit.auth.spec.ts` (authenticated pages)
- `a11y/axe-dynamic-states.spec.ts` (state changes)
- `a11y/wcag-gap-coverage.anon.spec.ts` / `admin.spec.ts`

**Gaps**: No explicit `aria-live` region verification for:
- Toast notifications (booking confirmed, message sent)
- Real-time message arrival
- Hold countdown timer
- Search result count updates

### 8.4 ARIA Verification

Add assertions for:
```typescript
// Sort dropdown
await expect(sortButton).toHaveAttribute('role', 'combobox');
await expect(sortButton).toHaveAttribute('aria-expanded', 'false');

// Filter modal
await expect(filterDialog).toHaveAttribute('role', 'dialog');
await expect(filterDialog).toHaveAttribute('aria-modal', 'true');

// Search results
await expect(resultsRegion).toHaveAttribute('aria-live', 'polite');

// Booking status
await expect(statusBadge).toHaveAttribute('role', 'status');
```

---

## 9. Testability Assessment & Playwright Limitations

### 9.1 Scenarios That ARE Testable with Playwright

| Scenario | Pattern |
|---|---|
| Two users booking simultaneously | Multi-context: `browser.newContext()` × 2, parallel actions |
| Session expiry mid-operation | Mock auth API to return 401: `page.route('**/api/auth/**', ...)` |
| Slow network / offline | `page.route()` with delay or abort |
| File upload | `page.setInputFiles()` on hidden file input |
| Date picker interaction | Click trigger → click calendar day (Radix UI pattern) |
| WebSocket/polling behavior | `page.route()` to intercept polling responses |
| Mobile bottom sheet | `page.setViewportSize()` + touch simulation |
| Map interactions (limited) | Only when WebGL available — guard with runtime skip |
| Booking state machine | UI actions + `testApi()` for DB verification |
| Admin actions | `chromium-admin` project with admin auth state |
| Toast notifications | `[data-sonner-toast]` selector (Sonner library) |

### 9.2 Scenarios That Are NOT Reliably Testable

| Scenario | Limitation | Alternative |
|---|---|---|
| WebGL map rendering in headless CI | No GPU → no WebGL → no map canvas | Unit test map logic; skip map visual assertions in CI |
| Real Stripe payments | Requires Stripe test mode + webhook tunnel | Mock Stripe API responses; test payment flow UI only |
| Email delivery | No email server in CI | Assert notification record via `testApi()` |
| SMS delivery | No SMS provider in CI | Assert notification record via `testApi()` |
| True concurrency (DB-level) | Playwright is sequential within a context | Use load testing (k6) for true concurrent DB operations |
| Browser memory leaks | Playwright doesn't expose memory metrics reliably | Use Chrome DevTools Protocol manually |
| True Server-Sent Events | Next.js RSC streaming doesn't expose SSE to Playwright route | Test polling fallback instead |
| Font rendering differences | Varies by OS/GPU | Skip visual regression for text-heavy pages |

### 9.3 Veto List (DO NOT attempt to automate)

1. **Map pixel-perfect rendering** — WebGL is not available in headless. Use `isMapAvailable()` guards.
2. **Cross-browser visual comparison** — Font rendering differs too much. Visual tests chromium only.
3. **Real payment processing** — Use mock API responses. Verify payment UI flow, not actual charge.
4. **Database deadlock testing** — k6 load tests are the right tool, not Playwright.
5. **Network partition simulation** — `page.route()` can simulate offline, but not split-brain.

---

## 10. Test Data Strategy

### 10.1 Seed Data (global-setup.ts → seed-e2e.js)

Current seed creates:
- 3 users: e2e-test (host), e2e-other (tenant), e2e-admin (admin)
- 15+ SF listings with varied prices, room types, amenities
- Reviews for some listings
- Conversations between users
- Blocked user relationship

**Gaps in seed data**:
- No HELD or PENDING bookings (needed for booking state tests)
- No expired holds (needed for sweeper tests)
- No notifications (needed for notification tests)
- No saved searches (needed for saved search tests)
- No recently viewed entries (needed for recently viewed tests)

**Fix**: Extend `seed-e2e.js` to create these entities, OR use `testApi()` in `beforeAll` blocks.

### 10.2 Test Data Isolation

Each test suite MUST clean up after itself:
```typescript
test.afterAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: TENANT_STATE });
  const page = await ctx.newPage();
  await cleanupTestBookings(page, { listingId, resetSlots: true });
  await ctx.close();
});
```

Never rely on test execution order. Never share mutable state between `test.describe` blocks.

---

## 11. Coverage Gap Analysis

Based on inputs from all teammates (USER_FLOW_SIMULATIONS.md, EDGE_CASE_MATRIX.md, CONCURRENCY_TEST_MATRIX.md, FEATURE_MAP.md), here is the gap analysis.

### 11.1 Flow-to-Existing-Coverage Mapping

The flow-strategist proposed 122 flows across 22 categories. Here's what's already covered vs what's missing:

| Flow Category | Proposed | Already Covered | Genuine Gaps | New Specs Needed |
|---|---|---|---|---|
| F1: Anonymous Visitor | 6 | 5 (homepage, search-p0-smoke, auth-boundary) | 1 (SEO metadata verification) | 0 — extend `seo/search-seo-meta.anon.spec.ts` |
| F2: Authentication | 8 | 6 (login-signup, verify, reset-password, auth-boundary) | 2 (social auth redirect, session refresh) | 0 — social auth is untestable (OAuth), session refresh covered in session-expiry/ |
| F3: Search & Discovery | 9 | 9 (search-smoke, search-filters/*, search-sort, pagination/*, search-stability/*) | 0 | 0 — ALREADY WELL COVERED |
| F4: Booking Lifecycle | 18 | 6 (booking/*) + many skipped | 6 (concurrent holds, accept-vs-cancel race, accept-vs-sweeper, price-change-during-booking, hold-expiry-during-checkout, state-machine-integrity) | 3 new specs (see below) |
| F5: Host Listing Management | 6 | 5 (create-listing/*, listing-edit/*, journeys/24) | 1 (listing status transitions) | 0 — extend listing-edit.spec.ts |
| F6: Host Booking Response | 5 | 3 (booking-host-actions, booking-state-guards) | 2 (reject-with-reason UI, multi-booking batch) | 0 — extend booking-host-actions.spec.ts |
| F7: Messaging | 9 | 4 (messaging/*) + many skipped | 2 (suspended user messaging BUG test, conversation dedup) | 1 new spec |
| F8: Reviews | 5 | 2 (journeys/07-reviews, journeys/23-review-lifecycle) | 0 | 0 — unskip existing |
| F9: Profile/Settings | 8 | 2 (profile/profile-edit, settings/settings) + many skipped | 2 (password change with session invalidation, account deletion) | 0 — unskip existing |
| F10: Notifications | 3 | 2 (notifications/*) + many skipped | 0 | 0 — unskip existing |
| F11: Saved Listings/Searches | 5 | 2 (saved/saved-searches, recently-viewed) + many skipped | 0 | 0 — unskip existing |
| F12: Verification | 5 | 2 (auth/verify, journeys/09) | 0 | 0 — unskip existing |
| F13: Admin | 8 | 3 (admin/*) + many skipped | 1 (admin-vs-host concurrent status change) | 0 — extend admin-boundary.spec.ts |
| F14: Destructive Actions | 5 | 1 (journeys/25-user-profile-blocking) | 2 (listing deletion with active bookings, cancel all bookings) | 1 new spec |
| F15: Cross-Feature | 6 | 2 (journeys/30-critical-simulations, journeys/20-critical-journeys) | 1 (notification failure after booking) | 0 — untestable without DB mock |
| F16: Mobile | 4 | 4 (mobile/*) + many skipped | 0 | 0 — unskip existing |
| F17: Error/Empty States | 3 | 2 (journeys/31-error-empty-state-journeys, search-error-resilience) | 0 | 0 |
| F18: Security | 10 | 3 (security/security-headers, booking-auth-boundaries, auth-boundary) | 3 (health endpoint check, unbounded limit param, map token exposure) | 1 new spec |
| F19: Infrastructure (cron) | 6 | 2 (stability/stability-contract, stability-phase2) | 2 (sweeper race, reconcile-slots) | 0 — extend stability-contract.spec.ts |
| F20: Feature Flags | 4 | 0 | 2 (nearby feature flag, semantic search flag) | 0 — API-level test, not E2E |
| **TOTALS** | **122** | **~75 active** | **~27 genuine gaps** | **6 new spec files** |

### 11.2 New Spec Files to Create

Based on the gap analysis, only **6 new spec files** are needed. Everything else is either already covered or can be added to existing specs.

#### NEW-1: `tests/e2e/concurrent/booking-race-conditions.spec.ts`
**Priority: P0**
**Covers**: F4.13 (concurrent holds), F4.14 (accept-vs-cancel), F4.15 (accept-vs-sweeper), F4.16 (price change during booking)
**Pattern**: Multi-context (`browser.newContext()` x2), parallel actions, `testApi()` for DB verification
**Tests**:
```
1. Two tenants booking last slot simultaneously → exactly one succeeds (S1)
2. Two tenants holding last slot simultaneously → exactly one gets hold (S2)
3. Host accepts while tenant cancels same booking → exactly one transition (S3)
4. Host accepts hold while sweeper expires it → no double state change (S5)
5. Host changes price while tenant submits booking → PRICE_CHANGED error (S6)
```
**Setup**: Use `testApi()` in `beforeAll` to create single-slot listing and bookings in specific states.
**Teardown**: `cleanupTestBookings()` in `afterAll`.

#### NEW-2: `tests/e2e/concurrent/conversation-dedup.spec.ts`
**Priority: P1 (P0 if EC-1 fix lands)**
**Covers**: F7.9 (duplicate conversation), S4 (concurrent conversation creation), S16 (triple-click)
**Pattern**: Single-context rapid-fire clicks + `testApi()` to count DB conversations
**Tests**:
```
1. Double-click "Contact Host" → only one conversation created
2. Rapid triple-click → only one conversation created
3. Two different users message same host → two separate conversations (expected)
```
**Note**: Tests 1-2 will FAIL until EC-1 is fixed. Use `test.fail()` annotation to document known bug.

#### NEW-3: `tests/e2e/booking/booking-hold-expiry.spec.ts`
**Priority: P0**
**Covers**: F4.17 (hold expires during checkout), F4.18 (state machine integrity)
**Pattern**: `testApi()` to create holds with specific `heldUntil` timestamps, then invoke sweeper
**Tests**:
```
1. Create expired hold → sweeper transitions to EXPIRED
2. Create active hold → UI shows countdown timer
3. Expired hold → "Request to Book" button appears (slot freed)
4. Slot math: multiple holds + bookings → availableSlots correct
```

#### NEW-4: `tests/e2e/booking/listing-deletion-cascade.spec.ts`
**Priority: P1**
**Covers**: F14.2 extended (EC-6: listing deletion with active bookings)
**Tests**:
```
1. Host deletes listing with PENDING bookings → bookings cascade-deleted (documents current behavior)
2. Admin deletes listing → bookings CANCELLED first, then deleted (verifies admin path is correct)
3. After deletion, tenant sees booking history preserved (if fix lands) or gone (current behavior)
```
**Note**: Test 1 documents the known bug. If EC-6 fix lands, update assertion.

#### NEW-5: `tests/e2e/security/api-abuse-prevention.spec.ts`
**Priority: P1**
**Covers**: F18.8 (health endpoint), F18.9 (unbounded limit), EC-8, EC-10
**Pattern**: Direct API calls via `page.request.get/post()`
**Tests**:
```
1. /api/health/ready returns 200 with no sensitive data
2. Notification API with limit=99999 → capped response (or documents current behavior)
3. Upload with oversized non-file form field → rejected before OOM (or documents risk)
4. Rate-limited endpoint returns 429 after threshold
```

#### NEW-6: `tests/e2e/concurrent/admin-host-race.spec.ts`
**Priority: P1**
**Covers**: F13.8, S7 (admin vs host concurrent listing status)
**Pattern**: Multi-context (admin + host), parallel status changes
**Tests**:
```
1. Admin pauses listing while host marks as RENTED → one wins, consistent state
2. Admin deletes listing while host edits → listing deleted, edit fails gracefully
```

### 11.3 Existing Specs to Unskip (Higher ROI Than New Specs)

These existing tests are skipped but the features they test ARE implemented. Unskipping them provides more coverage than writing new tests:

| Spec File | Skipped Tests | Fix Needed |
|---|---|---|
| `booking/booking-race-conditions.spec.ts` | 19 | Seed data: create HELD bookings in `beforeAll` via `testApi()` |
| `booking/booking-state-guards.spec.ts` | 11 | Same seed data fix |
| `booking/booking-host-actions.spec.ts` | 2 | Minor locator fix |
| `messaging/messaging-realtime.spec.ts` | 19 | Timing: replace `waitForTimeout` with `expect.poll()` |
| `messaging/messaging-resilience.spec.ts` | 21 | Network mock setup in `beforeEach` |
| `messaging/messaging-a11y.spec.ts` | 10 | Seed data: ensure conversations exist |
| `listing-detail/listing-detail.spec.ts` | 31 | Large — triage individually |
| `notifications/notifications.spec.ts` | 14 | Seed data: create notifications |
| `notifications/notifications-extended.spec.ts` | 15 | Same seed fix |
| `profile/profile-edit.spec.ts` | 7 | Hydration wait: add `waitForHydration()` |
| `saved/saved-searches.spec.ts` | 7 | Seed data: create saved searches |
| `settings/settings.spec.ts` | 5 | Hydration wait |
| **TOTAL** | **~161** | Reduces skip rate by ~14% |

### 11.4 Edge Case Tests That Need Fixes First (NOT new tests)

These edge cases from the edge-case-hunter need CODE FIXES, not just tests:

| Edge Case | Status | Test Strategy |
|---|---|---|
| EC-1: Conversation creation race | BROKEN | Write `test.fail()` test NOW, flip to `test()` after fix |
| EC-3: Accept booking on non-ACTIVE listing | BROKEN | Write `test.fail()` test NOW, flip after fix |
| EC-4: PENDING booking never expires | BROKEN (by design) | Write test documenting current behavior |
| EC-6: Listing deletion cascades bookings | BROKEN | Write test documenting current behavior |
| EC-8: Unbounded notification limit | BROKEN | API-level test in NEW-5 |
| EC-9: PATCH images can be empty | BROKEN | Unit test, not E2E |

### 11.5 Shard Impact Assessment

Current: 189 specs, 10 shards, ~19 specs/shard
New specs: +6
Unskipped specs: ~12 existing specs with ~161 newly-active tests
Total after changes: ~195 specs, ~1,177 active tests (from 1,016 active to ~1,177)

**Verdict: 10 shards is sufficient.** Each shard has capacity for ~30 specs. We're at ~19.5/shard after additions. No pipeline changes needed.

### 11.6 Testability Vetoes Applied to Teammate Proposals

| Proposed Flow | Veto | Reason | Alternative |
|---|---|---|---|
| F2.3: Google OAuth callback | VETOED | Cannot simulate real OAuth redirect in CI | Manual test checklist |
| F15.6: Notification DB failure | VETOED | Cannot reliably break DB mid-transaction from Playwright | Unit test with mocked Prisma |
| F19.3-F19.6: Cron job testing | PARTIAL VETO | Can test via `testApi()` trigger, NOT via actual cron schedule | Invoke sweeper/reconciler via test API; verify outcomes |
| F20.*: Feature flag behavior | VETOED for E2E | Feature flags are env vars set at build time | Test in unit/integration tests |
| S12: Sweeper vs sweeper (duplicate cron) | VETOED | Cannot spawn duplicate cron from Playwright | k6 load test or integration test |
| Map-dependent visual assertions | VETOED | WebGL unavailable in headless CI | Runtime skip guard |

---

## 12. Implementation Priorities

### Phase 1: Triage (highest ROI, no new code)
1. Run skip dashboard, categorize all 1,178 skips
2. Remove specs for non-existent features (~200 skips eliminated)
3. Fix seed data gaps (extends seed-e2e.js) (~150 skips eliminated)
4. Convert hardcoded skips to runtime guards (~100 skips eliminated)
5. Lower CI threshold to 1,000

### Phase 2: POM Expansion
1. Create `BasePage` with shared navbar/toast assertions
2. Create `SearchPage` POM (consolidates 50+ search specs)
3. Create `ListingDetailPage` POM
4. Create `MessagesPage` POM (wraps messaging-helpers)
5. Create `BookingsPage` POM

### Phase 3: Coverage Gaps (per teammate input)
1. New specs for uncovered P0 flows
2. New specs for P1 edge cases
3. Multi-context concurrency tests
4. Extended booking lifecycle tests

### Phase 4: Hardening
1. Reduce flake via explicit waits (target <2% flake rate)
2. Visual regression suite (small, stable set)
3. Performance budget enforcement
4. A11y gap closure
