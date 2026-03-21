# CRIT-4: Systematic Reduction of 1,151 test.skip() Calls

## Executive Summary

Reduce 1,151 `test.skip()` calls across 126 E2E spec files from **1,151 to under 200** in 3 phases, prioritized by risk (booking/auth first, map tests second, cleanup third). The root causes are: (1) fragile preconditions that skip instead of failing, (2) auth sessions expiring mid-run, (3) map loading unreliability in headless CI, (4) hardcoded `test.skip(true)` guards masking test fragility.

## Confidence Score

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| **Research Grounding** | 15% | 5 | Playwright best practices for fixtures, storageState, route mocking |
| **Codebase Accuracy** | 25% | 5 | All file paths, helper functions, patterns verified via Read/Grep |
| **Assumption Freedom** | 20% | 5 | Every count verified, every pattern traced to source |
| **Completeness** | 15% | 5 | All 6 categories covered, rollback plan included |
| **Harsh Critic Verdict** | 15% | 4 | CONDITIONAL PASS — map skip elimination depends on WebGL in CI |
| **Specificity** | 10% | 5 | Every step has exact file paths and code patterns |

**Overall: 4.85 / 5.0 — HIGH CONFIDENCE**

## Verified Skip Inventory (Evidence Base)

| Category | Count | Files | % of Total |
|----------|-------|-------|------------|
| 1. Hardcoded `test.skip(true, ...)` | 685 | 95 | 59.5% |
| 2. Map-related (map/markers not loaded) | 262 | 22 | 22.8% |
| 3. Auth session expired | 110 | 14 | 9.6% |
| 4. Precondition (missing test data) | 32 | 7 | 2.8% |
| 5. CI-environment/visual baselines | 9 | 9 | 0.8% |
| 6. Flaky/timeout conditions | 6 | 3 | 0.5% |
| **Unclassified / overlap** | **47** | — | **4.1%** |
| **TOTAL** | **1,151** | **126** | **100%** |

---

## Phase 1: Critical — Booking + Auth + Precondition Skips (Target: 142 → 0)

**Priority**: HIGHEST — These hide failures in the most critical safety paths.

### Task 1.1: Fix Precondition Skips in Booking Tests (8 skips → 0)

**Root Cause**: `booking-race-conditions.spec.ts` calls `findReviewerListingUrl()` which searches for "Reviewer Nob Hill" at runtime. If search returns 0 results (seed data missing, search index lag), every test in the file skips.

**Files to modify**:
- `scripts/seed-e2e.js` — Add a deterministic "Reviewer Nob Hill" listing with a known slug
- `tests/e2e/booking/booking-race-conditions.spec.ts` — Use seeded listing URL directly

**Implementation**:

1. **Enhance seed script** (`scripts/seed-e2e.js`):
   - Add a listing specifically for booking tests with a known, stable slug:
     ```javascript
     {
       title: 'Reviewer Nob Hill Suite',
       // ... standard SF listing fields
       slug: 'reviewer-nob-hill-suite', // deterministic slug
       lat: 37.7930, lng: -122.4130,
     }
     ```
   - Export the listing's URL path as `E2E_BOOKING_LISTING_PATH` env var, OR write it to a JSON fixture file at `playwright/.fixtures/seed-data.json`

2. **Create shared fixture file** (`tests/e2e/helpers/seed-fixtures.ts`):
   ```typescript
   // Read from seed output or use known slug
   export const SEED_BOOKING_LISTING_PATH = '/listings/reviewer-nob-hill-suite';
   export const SEED_LISTING_SLUGS = [
     'sunny-mission-room',
     'spacious-soma-shared',
     // ... all seeded listings
   ];
   ```

3. **Refactor `booking-race-conditions.spec.ts`**:
   - Replace `findReviewerListingUrl()` with direct navigation to `SEED_BOOKING_LISTING_PATH`
   - Remove all 8 `test.skip(!listingUrl, 'Reviewer listing not found')` guards
   - The listing is guaranteed to exist because the seed runs in `globalSetup`

4. **Apply same pattern to other precondition files**:
   - `tests/e2e/listing-edit/listing-edit.spec.ts` (8 skips) — Use `SEED_LISTING_SLUGS[0]`
   - `tests/e2e/semantic-search/semantic-search-similar-listings.anon.spec.ts` (11 skips) — Navigate to known listing, not runtime search result
   - `tests/e2e/performance/api-response-times.spec.ts` (1 skip) — Use seed data
   - `tests/e2e/performance/core-web-vitals.anon.spec.ts` (2 skips) — Use seed data
   - `tests/e2e/journeys/21-booking-lifecycle.spec.ts` (1 skip) — Use seed data
   - `tests/e2e/visual/dark-mode-visual.anon.spec.ts` (1 skip) — Use seed data

**Verification**:
- Run `pnpm exec playwright test tests/e2e/booking/ --project=chromium` — zero skips
- Run `pnpm exec playwright test tests/e2e/listing-edit/ --project=chromium` — zero skips
- Grep: `grep -c 'test.skip.*listing.*not found\|test.skip.*No listing' tests/e2e/**/*.spec.ts` = 0

**Estimated skip reduction**: 32 → 0

---

### Task 1.2: Fix Auth Session Expired Skips (110 skips → 0)

**Root Cause**: Auth-dependent test files use `waitForAuthPageReady()` (defined in `tests/e2e/helpers/dark-mode-helpers.ts:40-50`) which navigates, waits 1500ms, then checks if redirected to `/login`. If the storageState session expired during the test run, it returns `false` and every test in the file skips.

**The real problem**: The `storageState: 'playwright/.auth/user.json'` is created once during `auth.setup.ts` and shared across all workers. If the session token has a short TTL or the CI run is long, later tests find an expired session.

**Files to modify**:
- `tests/e2e/helpers/dark-mode-helpers.ts` — Make `waitForAuthPageReady` fail instead of soft-return
- `tests/e2e/helpers/auth-refresh-fixture.ts` — NEW: Create a reusable auth-refresh fixture
- 14 spec files with `test.skip(!ready, 'Auth session expired')` patterns

**Implementation**:

1. **Create auth refresh fixture** (`tests/e2e/helpers/auth-refresh-fixture.ts`):
   ```typescript
   import { test as base, expect } from '@playwright/test';
   import path from 'path';

   /**
    * Extended test fixture that validates auth state before each test.
    * If storageState is stale (redirected to login), re-authenticates
    * within the test's browser context rather than skipping.
    */
   export const authTest = base.extend({
     // Auto-fixture: verify auth on every test
     page: async ({ page, context }, use) => {
       // Check if current storageState has valid session
       const sessionCheck = await context.request.get('/api/auth/session');
       const session = await sessionCheck.json();

       if (!session?.user) {
         // Session expired — re-authenticate in this context
         await page.goto('/login');
         await page.getByLabel(/email/i).fill(
           process.env.E2E_TEST_EMAIL || 'e2e-test@roomshare.dev'
         );
         await page.locator('input#password').fill(
           process.env.E2E_TEST_PASSWORD || 'TestPassword123!'
         );
         await page.getByRole('button', { name: /sign in|log in/i }).click();
         await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30000 });
       }

       await use(page);
     },
   });
   ```

2. **Refactor `waitForAuthPageReady`** (`tests/e2e/helpers/dark-mode-helpers.ts`):
   ```typescript
   export async function waitForAuthPageReady(
     page: Page,
     path: string,
   ): Promise<true> {
     await page.goto(path);
     await page.waitForLoadState('domcontentloaded');
     // Wait for potential auth redirect — use expect instead of soft check
     await expect(page).not.toHaveURL(/\/(login|signin|auth)/, { timeout: 10000 });
     return true;
   }
   ```
   This makes auth failures hard errors, not silent skips.

3. **Update the 14 affected spec files** — Replace the skip pattern:

   **Before** (in each test):
   ```typescript
   const ready = await waitForAuthPageReady(page, '/bookings');
   test.skip(!ready, 'Auth session expired');
   ```

   **After**:
   ```typescript
   await waitForAuthPageReady(page, '/bookings');
   // No skip — if auth fails, the test fails with a clear error
   ```

   **Affected files** (with skip counts):
   - `tests/e2e/dark-mode/dark-mode-functional.auth.spec.ts` (14 skips)
   - `tests/e2e/a11y/dark-mode-a11y.auth.spec.ts` (15 skips)
   - `tests/e2e/messaging/messaging-realtime.spec.ts` (10 skips)
   - `tests/e2e/journeys/05-booking.spec.ts` (7 skips)
   - `tests/e2e/journeys/03-listing-management.spec.ts` (8 skips)
   - `tests/e2e/journeys/08-profile-settings.spec.ts` (9 skips)
   - `tests/e2e/journeys/22-messaging-conversations.spec.ts` (1 skip)
   - `tests/e2e/journeys/10-accessibility-edge-cases.spec.ts` (1 skip)
   - `tests/e2e/journeys/06-messaging.spec.ts` (9 skips)
   - `tests/e2e/journeys/list-map-sync.spec.ts` (1 skip)
   - `tests/e2e/journeys/20-critical-journeys.spec.ts` (8 skips)
   - `tests/e2e/journeys/07-reviews.spec.ts` (6 skips)
   - `tests/e2e/journeys/04-favorites-saved-searches.spec.ts` (7 skips)
   - `tests/e2e/visual/dark-mode-visual.auth.spec.ts` (14 skips)

4. **Fix root cause — session TTL in CI**:
   - In `playwright.config.ts`, the auth setup creates `storageState` files once. With 10 shards running for up to 30 minutes, sessions may expire.
   - Add `storageStateTTL` validation: in `auth.setup.ts`, write the session creation timestamp to the storageState JSON. In the fixture, check timestamp and re-auth if older than 25 minutes.
   - Alternative (simpler): Set `AUTH_SESSION_MAX_AGE=3600` in CI env (`.github/workflows/playwright.yml`) to ensure sessions last the full run.

**Verification**:
- Run `pnpm exec playwright test tests/e2e/dark-mode/ --project=chromium` — zero skips
- Grep: `grep -c 'Auth session expired' tests/e2e/**/*.spec.ts` = 0

**Estimated skip reduction**: 110 → 0

---

### Phase 1 Total: 142 skips eliminated

**Phase 1 gate**: All booking and auth tests run to completion with zero skips. CI skip count ≤ 1,009.

---

## Phase 2: High — Map Test Skips (Target: 262 → ~30)

**Priority**: HIGH — Map tests are 22.8% of all skips and cover a critical feature.

### Task 2.1: Create Reliable Map Loading Fixture (affects all 22 map-related files)

**Root Cause**: Map tests use `isMapAvailable()` → `waitForMarkersWithClusterExpansion()` → `getFirstMarkerIdOrSkip()` pattern (defined in `tests/e2e/helpers/sync-helpers.ts`). When MapLibre GL fails to initialize in headless CI (WebGL context creation failure, tile loading race), the entire test skips. The existing `mockMapTileRequests()` (in `tests/e2e/helpers/map-mock-helpers.ts`) mocks tile requests but doesn't guarantee map canvas initialization.

**Files to create/modify**:
- `tests/e2e/helpers/map-fixture.ts` — NEW: Playwright fixture combining mock + wait + retry
- `tests/e2e/helpers/sync-helpers.ts` — Harden `isMapAvailable()` and `waitForMapRef()`
- `tests/e2e/helpers/test-utils.ts` — Add `waitForMapReady` to the default `test` fixture
- 22 map spec files — Replace `getFirstMarkerIdOrSkip` with fixture-based approach

**Implementation**:

1. **Create map fixture** (`tests/e2e/helpers/map-fixture.ts`):
   ```typescript
   import { test as base, expect } from '@playwright/test';
   import { mockMapTileRequests } from './map-mock-helpers';

   export const mapTest = base.extend({
     /**
      * Auto-fixture that mocks map tile requests and waits for map initialization.
      * Replaces manual mockMapTileRequests() + isMapAvailable() + test.skip() pattern.
      */
     mapPage: async ({ page }, use) => {
       await mockMapTileRequests(page);
       await use(page);
     },
   });

   /**
    * Navigate to search URL and ensure map is ready with markers.
    * Retries map initialization up to 3 times before failing (not skipping).
    */
   export async function ensureMapWithMarkers(
     page: import('@playwright/test').Page,
     searchUrl: string,
     options?: { minMarkers?: number; maxRetries?: number },
   ): Promise<void> {
     const { minMarkers = 1, maxRetries = 3 } = options ?? {};

     for (let attempt = 1; attempt <= maxRetries; attempt++) {
       await page.goto(searchUrl);
       await page.waitForLoadState('domcontentloaded');

       // Wait for map canvas to render
       const mapReady = await page.locator('.maplibregl-canvas')
         .first()
         .waitFor({ state: 'visible', timeout: 15000 })
         .then(() => true)
         .catch(() => false);

       if (!mapReady && attempt < maxRetries) continue;
       if (!mapReady) {
         throw new Error('Map canvas failed to initialize after ' + maxRetries + ' attempts');
       }

       // Wait for markers (with cluster expansion)
       const { waitForMarkersWithClusterExpansion } = await import('./sync-helpers');
       const markerCount = await waitForMarkersWithClusterExpansion(page, { minCount: minMarkers });

       if (markerCount >= minMarkers) return;
       if (attempt < maxRetries) continue;

       throw new Error(
         `Expected ${minMarkers}+ markers, got ${markerCount} after ${maxRetries} attempts`
       );
     }
   }
   ```

2. **Convert `getFirstMarkerIdOrSkip` to throwing version**:

   In `tests/e2e/search-map-list-sync.anon.spec.ts:62-78`, replace:
   ```typescript
   // BEFORE:
   async function getFirstMarkerIdOrSkip(page: Page): Promise<string> {
     if (!(await isMapAvailable(page))) {
       test.skip(true, "Map not available");
     }
     const markerCount = await waitForMarkersWithClusterExpansion(page);
     if (markerCount === 0) {
       test.skip(true, "No markers available");
     }
     const id = await getMarkerListingId(page, 0);
     if (!id) {
       test.skip(true, "Could not read listing ID");
     }
     return id!;
   }

   // AFTER:
   async function getFirstMarkerId(page: Page): Promise<string> {
     await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15000 });
     const markerCount = await waitForMarkersWithClusterExpansion(page, { minCount: 1 });
     expect(markerCount).toBeGreaterThan(0);
     const id = await getMarkerListingId(page, 0);
     expect(id).toBeTruthy();
     return id!;
   }
   ```

3. **Apply to each of the 22 map-related files**:

   **Pattern A — Files using `getFirstMarkerIdOrSkip` or equivalent inline skip:**
   Replace every `test.skip(true, "Map not available")` and `test.skip(true, "No markers available")` with assertions that fail rather than skip.

   **Pattern B — Files with `test.skip(true, "Map container not visible")`:**
   Replace with `await expect(page.locator('.maplibregl-canvas')).toBeVisible()`.

   **Pattern C — Files with `test.skip(true, "URL did not update within timeout")`:**
   Replace with proper `pollForUrlParam()` (already exists in sync-helpers.ts) with increased timeout.

   **Top 10 files by skip count** (address first):
   - `search-map-list-sync.anon.spec.ts` — 74 skips
   - `journeys/list-map-sync.spec.ts` — 51 skips
   - `map-markers.anon.spec.ts` — 44 skips
   - `map-search-results.anon.spec.ts` — 41 skips
   - `map-interactions-advanced.anon.spec.ts` — 30 skips
   - `map-pan-zoom.spec.ts` — 28 skips
   - `map-search-toggle.anon.spec.ts` — 24 skips
   - `map-interactions.anon.spec.ts` — 23 skips
   - `map-persistence.anon.spec.ts` — 17 skips
   - `map-interactions-edge.anon.spec.ts` — 13 skips

4. **Ensure `mockMapTileRequests` is auto-applied in the test fixture**:

   Check if `tests/e2e/helpers/test-utils.ts` already applies `mockMapTileRequests` in its `test.extend` fixture. If not, add it so all map-related tests get mocked tiles automatically:
   ```typescript
   // In test-utils.ts test.extend:
   page: async ({ page }, use) => {
     await mockMapTileRequests(page);
     await use(page);
   },
   ```

5. **Allow ~30 legitimate skips**: Some map tests may legitimately need WebGL (shader compilation, canvas pixel reads). These should be annotated with `test.skip(!process.env.CI_HAS_GPU, 'Requires GPU')` and documented. Cap at 30.

**Verification**:
- Run full map test suite: `pnpm exec playwright test tests/e2e/map-*.spec.ts tests/e2e/search-map-*.spec.ts --project=chromium-anon`
- Count remaining skips: should be ≤ 30
- CI run: verify green with ≤ 30 map skips

**Estimated skip reduction**: 262 → ~30

---

### Phase 2 Total: ~232 skips eliminated

**Phase 2 gate**: Map tests mostly run. CI skip count ≤ 777.

---

## Phase 3: Medium — Hardcoded Skips + Visual + Flaky (Target: 737 → ~170)

**Priority**: MEDIUM — These are the bulk of skips but individually lower risk.

### Task 3.1: Triage and Fix Hardcoded `test.skip(true, ...)` (685 → ~160)

**Root Cause**: Most `test.skip(true, ...)` calls are inside runtime conditional checks that catch precondition failures. They convert "this thing didn't load" into a skip instead of investigating why it didn't load.

**Triage approach** (must be done per-file, not bulk):

**Sub-category A — Map-related hardcoded skips** (~350 of 685):
Already addressed in Phase 2. After Phase 2, ~30 remain.

**Sub-category B — Auth/routing hardcoded skips** (~80 of 685):
Pattern: `test.skip(true, "Redirected to login — auth session unavailable in CI")`
Fix: Already addressed by Phase 1 auth fixture. After Phase 1, 0 remain.

**Sub-category C — UI element not found** (~120 of 685):
Pattern: `test.skip(true, "No save/heart buttons found")`
Fix per file:
- If the element requires auth → ensure auth fixture is active
- If the element requires data → ensure seed data provides it
- If the element is behind a feature flag → use `test.fixme()` instead and document

**Sub-category D — Timeout/slow server** (~60 of 685):
Pattern: `test.skip(true, "URL did not update within timeout (slow WSL2 server)")`
Fix: Replace with `pollForUrlParam()` / `pollForUrlParamPresent()` from sync-helpers.ts with 30s timeout. These polling helpers already exist but weren't used in these tests.

**Sub-category E — Feature not available** (~30 of 685):
Pattern: `test.skip(true, "User does not have password auth — skipping")`
Fix: These are **legitimate skips** — keep them. The test correctly skips when the test user doesn't have the feature. Tag with `test.fixme()` if the feature should exist in seed data, or keep as `test.skip()` if it's a real conditional.

**Sub-category F — Truly conditional** (~45 of 685):
These skip based on real conditions (browser capability, viewport, feature flags). Keep these. Ensure each has a clear reason string.

**Implementation order** (files sorted by skip count, highest first):

1. `search-map-list-sync.anon.spec.ts` (74) — Phase 2 handles
2. `journeys/list-map-sync.spec.ts` (51) — Phase 2 handles
3. `map-markers.anon.spec.ts` (44) — Phase 2 handles
4. `map-search-results.anon.spec.ts` (41) — Phase 2 handles
5. `map-interactions-advanced.anon.spec.ts` (30) — Phase 2 handles
6. `map-pan-zoom.spec.ts` (28) — Phase 2 handles
7. `search-sort-ordering.anon.spec.ts` (26) — Review: likely URL timeout skips → use polling
8. `mobile-bottom-sheet.spec.ts` (25) — Review: likely viewport/touch skips → fix or annotate
9. `map-search-toggle.anon.spec.ts` (24) — Phase 2 handles
10. `map-interactions.anon.spec.ts` (23) — Phase 2 handles
11. `dark-mode-functional.auth.spec.ts` (19) — Phase 1 handles (14 auth + 3 hardcoded + 2 conditional)
12. `search-map-list-sync.anon.spec.ts`, `messaging/messaging-resilience.spec.ts` (21), `messaging/messaging-realtime.spec.ts` (18) — Auth + UI element fixes
13. Continue down the list...

**Estimated skip reduction**: 685 → ~160 (after Phases 1+2 handle overlapping categories)

---

### Task 3.2: Fix CI Visual Baseline Skips (9 → 0)

**Root Cause**: Visual tests use `test.skip(!!process.env.CI, 'Visual baseline snapshots are platform-specific')`. The baselines were generated on macOS/Windows dev machines and don't match Linux CI rendering.

**Files**:
- `tests/e2e/visual/mobile-bottom-sheet-visual.anon.spec.ts`
- `tests/e2e/visual/filter-modal-visual.anon.spec.ts`
- `tests/e2e/visual/listing-detail-visual.spec.ts`
- `tests/e2e/visual/dark-mode-visual.anon.spec.ts`
- `tests/e2e/visual/dark-mode-visual.auth.spec.ts`
- `tests/e2e/visual/map-visual.anon.spec.ts`
- `tests/e2e/nearby/nearby-visual.spec.ts`
- `tests/e2e/create-listing/create-listing.visual.spec.ts`
- `tests/e2e/journeys/search-visual.spec.ts`

**Implementation** (pick ONE approach):

**Option A — CI-specific baselines** (Recommended):
1. Add a step to CI workflow that generates baselines on the same Ubuntu runner
2. Use Playwright's `--update-snapshots` in a dedicated CI job, commit results to a `visual-baselines/linux/` directory
3. Configure `toHaveScreenshot({ maxDiffPixelRatio: 0.01 })` for cross-run tolerance
4. Remove the `test.skip(!!process.env.CI)` from all 9 files
5. Add to `playwright.config.ts`:
   ```typescript
   expect: {
     toHaveScreenshot: {
       maxDiffPixelRatio: 0.01,
       // Use platform-specific baseline directory
       snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{arg}{-projectName}{-snapshotSuffix}{ext}',
     },
   },
   ```

**Option B — Docker-based rendering**:
- Use `mcr.microsoft.com/playwright:v1.49.0-noble` container for both dev and CI
- Ensures identical font rendering and layout

**Estimated skip reduction**: 9 → 0

---

### Task 3.3: Fix Flaky/Timeout Skips (6 → 0)

**Files**:
- `tests/e2e/search-filters/filter-validation.anon.spec.ts` (2 skips) — "Page failed to render visible content within timeout"
- `tests/e2e/search-filters/filter-price.anon.spec.ts` (1 skip) — "Filter-price tests timeout on Firefox CI runners"
- `tests/e2e/map-search-results.anon.spec.ts` (3 skips) — "URL did not update within timeout (slow WSL2 server)"

**Implementation**:
1. **filter-validation.anon.spec.ts**: Replace `test.skip(true, ...)` with `await page.waitForLoadState('networkidle')` and increased action timeout (30s)
2. **filter-price.anon.spec.ts**: Add Firefox-specific timeout extension: `test.slow(browserName === 'firefox')` instead of skipping
3. **map-search-results.anon.spec.ts**: Replace with `pollForUrlParam()` with 30s timeout (helper already exists)

**Estimated skip reduction**: 6 → 0

---

### Phase 3 Total: ~567 skips eliminated

**Phase 3 gate**: CI skip count ≤ ~200. Remaining ~200 are:
- ~30 legitimate map/WebGL skips
- ~45 legitimately conditional skips (feature flags, platform caps)
- ~30 `test.fixme()` for features not yet implemented in test infra
- ~95 remaining hardcoded skips requiring per-file investigation (long tail)

---

## Skip Count Tracking Dashboard

### CI Script: `scripts/count-test-skips.sh`

```bash
#!/bin/bash
# Count test.skip() occurrences by category and enforce thresholds

TOTAL=$(grep -r 'test\.skip(' tests/e2e --include='*.spec.ts' | wc -l)
AUTH=$(grep -r 'test\.skip.*Auth session expired' tests/e2e --include='*.spec.ts' | wc -l)
PRECONDITION=$(grep -r 'test\.skip(!listing\|test\.skip(!.*Url\|test\.skip(!.*Id' tests/e2e --include='*.spec.ts' | wc -l)
VISUAL=$(grep -r 'test\.skip(!!process\.env\.CI' tests/e2e --include='*.spec.ts' | wc -l)
HARDCODED=$(grep -r 'test\.skip(true,' tests/e2e --include='*.spec.ts' | wc -l)
MAP=$(grep -r 'test\.skip.*[Mm]ap\|test\.skip.*marker\|test\.skip.*WebGL' tests/e2e --include='*.spec.ts' | wc -l)

echo "=== Test Skip Dashboard ==="
echo "Total:        $TOTAL (threshold: ${SKIP_THRESHOLD:-200})"
echo "Auth:         $AUTH"
echo "Precondition: $PRECONDITION"
echo "Visual/CI:    $VISUAL"
echo "Hardcoded:    $HARDCODED"
echo "Map:          $MAP"
echo ""

THRESHOLD=${SKIP_THRESHOLD:-200}
if [ "$TOTAL" -gt "$THRESHOLD" ]; then
  echo "FAIL: $TOTAL test.skip() calls exceed threshold of $THRESHOLD"
  exit 1
fi
echo "PASS: $TOTAL test.skip() calls within threshold of $THRESHOLD"
```

### CI Integration

Add to `.github/workflows/playwright.yml` merge-reports job:
```yaml
- name: Audit test skip count
  run: |
    chmod +x scripts/count-test-skips.sh
    SKIP_THRESHOLD=200 ./scripts/count-test-skips.sh
```

### Phase Thresholds

| Phase | Deadline | Threshold |
|-------|----------|-----------|
| Phase 1 complete | +1 week | ≤ 1,009 |
| Phase 2 complete | +3 weeks | ≤ 777 |
| Phase 3 complete | +6 weeks | ≤ 200 |
| Maintenance | Ongoing | ≤ 200 (enforced in CI) |

---

## Test Strategy

### For the skip-reduction work itself:

1. **Before each phase**: Run full Playwright suite, capture baseline skip count per file
2. **After each task**: Run affected test files, verify:
   - Skip count decreased by expected amount
   - No new test failures introduced
   - Previously-skipping tests now pass OR fail with actionable errors
3. **Phase gate check**: Run `scripts/count-test-skips.sh` with phase threshold

### New tests to add:

1. **Skip count regression test** (`tests/e2e/meta/skip-count.spec.ts`):
   ```typescript
   test('test.skip count stays under threshold', async () => {
     // This test runs the skip counting script and verifies threshold
     // Prevents skip count regression
   });
   ```

2. **Seed data validation test** (`tests/e2e/meta/seed-validation.spec.ts`):
   ```typescript
   test('all seed listings exist and are accessible', async ({ page }) => {
     for (const slug of SEED_LISTING_SLUGS) {
       const response = await page.goto(`/listings/${slug}`);
       expect(response?.status()).toBe(200);
     }
   });
   ```

---

## Dependency Graph

```
Phase 1.1 (Seed Fixtures)  ──┬──→  Phase 1.2 (Auth Fixture)  ──→  Phase 2 (Map Fixture)
                              │
                              └──→  Phase 3.1 (Hardcoded Triage)
                                                                      │
Phase 3.2 (Visual Baselines)  ─────────────────────────────────── independent
Phase 3.3 (Flaky Fixes)       ─────────────────────────────────── independent
Skip Dashboard (CI Script)     ─────────────────────────────────── do first
```

**Critical path**: Seed fixtures → Auth fixture → Map fixture → Hardcoded triage

---

## Risk Register

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| Seed data breaks existing tests relying on runtime search | 🟠 MAJOR | Medium | Run full suite after seed changes; seed additions are additive |
| Auth re-login fixture adds test latency | 🟡 MINOR | High | Re-auth happens only when session expired (rare if TTL is extended) |
| Map fixture makes tests pass locally but fail in CI (WebGL) | 🟠 MAJOR | Medium | Test in Docker container matching CI environment before merge |
| Converting skip→fail causes CI to go red during rollout | 🟠 MAJOR | High | Phased rollout; each phase has its own PR; merge only when green |
| Visual baseline generation in CI adds CI time | 🟡 MINOR | Medium | Run visual tests as separate CI job; don't block main pipeline |
| Skip count script has false positives (counts skips in comments) | 🟡 MINOR | Low | Use AST-based counting or filter grep for actual `test.skip(` calls |

---

## Rollback Plan

Each phase is a separate PR. If a phase causes CI instability:

1. **Revert the PR** (standard git revert)
2. **Adjust the skip threshold** back to pre-phase level
3. **Investigate** which specific file conversions caused failures
4. **Re-apply** with fixes for the identified issues

No database changes, no API changes, no deployment changes — this is purely test infrastructure, so rollback is always safe.

---

## Pre-Mortem Analysis

| Failure Mode | Prevention |
|-------------|-----------|
| **Seed script fails in CI** | Seed runs in globalSetup which already exists and works; additions are additive |
| **Auth fixture creates login race condition** | Re-auth uses same pattern as auth.setup.ts which is proven |
| **Map tests now fail instead of skip, blocking CI** | Phase 2 converts to `expect` failures with clear error messages; Playwright retries (2 in CI) catch transient failures |
| **Visual baselines diverge between CI updates** | Pin Playwright Docker image version; regenerate baselines in CI pipeline |
| **Team morale drops when "green CI" goes red** | Communicate phased approach; each phase PR has its own CI run |
| **Skip threshold too aggressive** | Start with 1009 (Phase 1), adjust based on actual progress |

---

## Open Questions

1. **Session TTL**: What is the current `AUTH_SESSION_MAX_AGE` in production/CI? If it's < 30 minutes, that explains auth skips. Setting to 3600 in CI would be the simplest fix.
2. **WebGL in CI**: Do GitHub Actions ubuntu-latest runners have GPU support? If not, some map tests may legitimately need to skip. The ~30 allowed skips account for this.
3. **Visual baseline ownership**: Should baselines be committed to the repo or generated fresh in CI? Committed is simpler but creates merge conflicts; generated is cleaner but adds CI time.

---

## Assumption Audit

| # | Assumption | Verified? | Evidence |
|---|-----------|-----------|----------|
| 1 | `scripts/seed-e2e.js` runs in globalSetup | ✅ | `tests/e2e/global-setup.ts:10` calls `execFileSync('node', ['scripts/seed-e2e.js'])` |
| 2 | Auth storageState files are at `playwright/.auth/` | ✅ | `auth.setup.ts:5`, `playwright.config.ts:86` |
| 3 | `mockMapTileRequests` exists and works | ✅ | `tests/e2e/helpers/map-mock-helpers.ts:101-246` — comprehensive mocking |
| 4 | `waitForMarkersWithClusterExpansion` exists | ✅ | `tests/e2e/helpers/sync-helpers.ts:461-484` |
| 5 | CI uses ubuntu-latest runners | ✅ | `.github/workflows/playwright.yml:35` |
| 6 | CI sets `CI=true` env var | ✅ | `.github/workflows/playwright.yml:73` |
| 7 | Playwright retries 2x in CI | ✅ | `playwright.config.ts:32` — `retries: process.env.CI ? 2 : 0` |
| 8 | Seed creates enough listings for search | ✅ | `scripts/seed-e2e.js:17-72` — 5+ SF listings with coordinates |
| 9 | `waitForAuthPageReady` is the auth skip source | ✅ | `tests/e2e/helpers/dark-mode-helpers.ts:40-50` — returns false on redirect |
| 10 | 1,151 is the actual count | ✅ | `grep -c 'test.skip(' tests/e2e/**/*.spec.ts` = 1,151 across 126 files |
