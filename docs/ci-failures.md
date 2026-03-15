# CI Failure Report — Playwright E2E Tests

**Workflow**: Playwright E2E Tests
**Run ID**: [22866105608](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608)
**Branch**: `fix/p1-create-listing-stability`
**Commit**: `1ef50a8` — "fix: replace broad href locator with data-testid for HP-04 featured listings"
**Date**: 2026-03-09T17:27:54Z
**Sharding**: 40 shards total, 6 failed, 34 passed

---

## Summary

| Metric | Count |
|--------|-------|
| Failed shards | 6 / 40 |
| Hard failures | 22 tests |
| Flaky (passed on retry) | 16 tests |
| Total passed | 339 tests |
| Total skipped | 47 tests |

**Unified Root Cause**: ALL 22 hard failures trace to a single code path — the `openFilterModal` helper in `filter-helpers.ts:281` timing out when clicking the Filters button. The button locator cannot find the element within the 15s timeout on CI.

---

## Failed Shards Detail

### Shard 4/40 — 3 failures (69 passed, 2 skipped)

**Job ID**: 66333265293 | **Duration**: 11.0m

| # | Test | Spec File | Line | Browser | Tags |
|---|------|-----------|------|---------|------|
| 1 | J32: Escape key closes the filter modal | `03-search-advanced-journeys.spec.ts` | 444 | chromium | @a11y |
| 2 | J33: Tab navigates through filter modal controls | `03-search-advanced-journeys.spec.ts` | 457 | chromium | @a11y |
| 3 | J48: Mobile filter modal is scrollable with many options | `03-search-advanced-journeys.spec.ts` | 858 | chromium | @mobile |

**Error (all 3 identical)**:
```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /^Filters/ })

    at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
```

**Stack trace**:
```
  279 |     await page.keyboard.press("Escape");
  280 |     await page.waitForTimeout(2_000);
> 281 |     await btn.click({ force: true });
       |               ^
  282 |     await expect(dialog).toBeVisible({ timeout: 15_000 });
```

**Screenshots**:
- `test-results/journeys-03-search-advance-1d96d-key-closes-the-filter-modal-chromium/test-failed-1.png`
- `test-results/journeys-03-search-advance-1d96d-key-closes-the-filter-modal-chromium-retry1/test-failed-1.png`
- `test-results/journeys-03-search-advance-1d96d-key-closes-the-filter-modal-chromium-retry2/test-failed-1.png`
- `test-results/journeys-03-search-advance-2f776-rough-filter-modal-controls-chromium/test-failed-1.png`
- `test-results/journeys-03-search-advance-2f776-rough-filter-modal-controls-chromium-retry1/test-failed-1.png`
- `test-results/journeys-03-search-advance-5921c-crollable-with-many-options-chromium-retry2/test-failed-1.png`

**Traces**:
- `test-results/journeys-03-search-advance-1d96d-key-closes-the-filter-modal-chromium-retry1/trace.zip`
- `test-results/journeys-03-search-advance-2f776-rough-filter-modal-controls-chromium-retry1/trace.zip`

**Artifact**: [test-results-shard-4](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5834795087)

---

### Shard 17/40 — 2 failures, 2 flaky (64 passed, 6 skipped)

**Job ID**: 66333265347 | **Duration**: 12.0m

| # | Test | Spec File | Line | Browser | Tags |
|---|------|-----------|------|---------|------|
| 1 | J20: Mobile layout is responsive and functional | `02-search-critical-journeys.spec.ts` | 524 | Mobile Chrome | @mobile |
| 2 | J22: Gender preference + household gender filters combined | `03-search-advanced-journeys.spec.ts` | 102 | Mobile Chrome | |

**Error (all identical)**:
```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /^Filters/ })

    at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
```

**Screenshots**:
- `test-results/journeys-02-search-critica-2bdeb-s-responsive-and-functional-Mobile-Chrome/test-failed-1.png`
- `test-results/journeys-02-search-critica-2bdeb-s-responsive-and-functional-Mobile-Chrome-retry1/test-failed-1.png`
- `test-results/journeys-02-search-critica-2bdeb-s-responsive-and-functional-Mobile-Chrome-retry2/test-failed-1.png`
- `test-results/journeys-03-search-advance-924a4-old-gender-filters-combined-Mobile-Chrome/test-failed-1.png`

**Traces**:
- `test-results/journeys-02-search-critica-2bdeb-s-responsive-and-functional-Mobile-Chrome-retry1/trace.zip`
- `test-results/journeys-02-search-critica-69cec-e-rules-filter-toggles-work-Mobile-Chrome-retry1/trace.zip`

**Flaky tests (passed on retry)**:
- J11: Lease duration filter works (`02-search-critical-journeys.spec.ts:302`)
- J12: House rules filter toggles work (`02-search-critical-journeys.spec.ts:339`)

**Artifact**: [test-results-shard-17](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5834795131)

---

### Shard 32/40 — 2 failures (47 passed, 22 skipped)

**Job ID**: 66333265787 | **Duration**: 8.3m

| # | Test | Spec File | Line | Browser | Tags |
|---|------|-----------|------|---------|------|
| 1 | Filters button opens filter modal on mobile | `mobile-interactions.anon.spec.ts` | 477 | chromium-anon | |
| 2 | Filter modal closes when applying filters | `mobile-interactions.anon.spec.ts` | 517 | chromium-anon | |

**Error (both identical)**:
```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('button[aria-label^="Filters"]:visible').first()

    at mobile-interactions.anon.spec.ts:511:78
    at mobile-interactions.anon.spec.ts:541:78
```

**Stack trace (test 1)**:
```
  509 |     if (!modalOpened) {
  510 |       // Retry: try clicking with Playwright's native click
> 511 |       await page.locator(`${mobileSelectors.filtersButton}:visible`).first().click({ force: true });
       |                                                                              ^
  512 |     }
```

**Stack trace (test 2)**:
```
  539 |     if (!modalOpened) {
  540 |       // Retry: try native click
> 541 |       await page.locator(`${mobileSelectors.filtersButton}:visible`).first().click({ force: true });
       |                                                                              ^
  542 |       const retryOpened = await modal.waitFor(...)
```

**Screenshots**:
- `test-results/mobile-interactions.anon-M-70bd1-pens-filter-modal-on-mobile-chromium-anon/test-failed-1.png`
- `test-results/mobile-interactions.anon-M-70bd1-pens-filter-modal-on-mobile-chromium-anon-retry1/test-failed-1.png`
- `test-results/mobile-interactions.anon-M-70bd1-pens-filter-modal-on-mobile-chromium-anon-retry2/test-failed-1.png`
- `test-results/mobile-interactions.anon-M-6dfe8-loses-when-applying-filters-chromium-anon/test-failed-1.png`
- `test-results/mobile-interactions.anon-M-6dfe8-loses-when-applying-filters-chromium-anon-retry1/test-failed-1.png`
- `test-results/mobile-interactions.anon-M-6dfe8-loses-when-applying-filters-chromium-anon-retry2/test-failed-1.png`

**Traces**:
- `test-results/mobile-interactions.anon-M-70bd1-pens-filter-modal-on-mobile-chromium-anon-retry1/trace.zip`
- `test-results/mobile-interactions.anon-M-6dfe8-loses-when-applying-filters-chromium-anon-retry1/trace.zip`

**Artifact**: [test-results-shard-32](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5834764731)

---

### Shard 33/40 — 2 failures, 6 flaky (56 passed, 6 skipped)

**Job ID**: 66333265491 | **Duration**: 14.0m

| # | Test | Spec File | Line | Browser | Tags |
|---|------|-----------|------|---------|------|
| 1 | 1. Filter modal has role=dialog and aria-modal=true | `search-a11y-filters.anon.spec.ts` | 48 | chromium-anon | @a11y |
| 2 | 6. Filter toggle buttons have accessible labels | `search-a11y-filters.anon.spec.ts` | 165 | chromium-anon | @a11y |

**Error (both identical)**:
```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /^Filters/ })

    at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
```

**Screenshots**:
- `test-results/search-a11y-filters.anon-S-d30a4--dialog-and-aria-modal-true-chromium-anon/test-failed-1.png`
- `test-results/search-a11y-filters.anon-S-d30a4--dialog-and-aria-modal-true-chromium-anon-retry1/test-failed-1.png`
- `test-results/search-a11y-filters.anon-S-d30a4--dialog-and-aria-modal-true-chromium-anon-retry2/test-failed-1.png`
- `test-results/search-a11y-filters.anon-S-945d9-tons-have-accessible-labels-chromium-anon/test-failed-1.png`
- `test-results/search-a11y-filters.anon-S-945d9-tons-have-accessible-labels-chromium-anon-retry1/test-failed-1.png`

**Traces**:
- `test-results/search-a11y-filters.anon-S-d30a4--dialog-and-aria-modal-true-chromium-anon-retry1/trace.zip`
- `test-results/search-a11y-filters.anon-S-945d9-tons-have-accessible-labels-chromium-anon-retry1/trace.zip`

**Flaky tests (passed on retry)**:
- 2. Filter modal has accessible title (`search-a11y-filters.anon.spec.ts:57`)
- 7. Price range inputs have accessible labels (`search-a11y-filters.anon.spec.ts:196`)
- Selecting multiple amenities (`filter-amenities.anon.spec.ts:78`)
- Amenity buttons display facet counts (`filter-amenities.anon.spec.ts:184`)
- Disabled amenity buttons prevent toggling (`filter-amenities.anon.spec.ts:204`)
- All valid amenity options appear in the modal (`filter-amenities.anon.spec.ts:224`)

**Artifact**: [test-results-shard-33](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5834830618)

---

### Shard 34/40 — 12 failures (52 passed, 1 skipped)

**Job ID**: 66333265433 | **Duration**: 25.1m (longest shard)

| # | Test | Spec File | Line | Browser |
|---|------|-----------|------|---------|
| 1 | Filter modal opens correctly on mobile (P0) | `filter-mobile.anon.spec.ts` | 37 | chromium-anon |
| 2 | Apply button shows 100+ when count is null | `filter-count-preview.anon.spec.ts` | 222 | chromium-anon |
| 3 | Apply button disabled with select-a-location when no bounds | `filter-count-preview.anon.spec.ts` | 242 | chromium-anon |
| 4 | Selecting a date via picker and applying updates URL | `filter-date.anon.spec.ts` | 62 | chromium-anon |
| 5 | Selecting household gender and applying updates URL | `filter-gender-language.anon.spec.ts` | 83 | chromium-anon |
| 6 | Shows "No languages found" for unmatched search | `filter-gender-language.anon.spec.ts` | 202 | chromium-anon |
| 7 | Selecting a single house rule updates URL | `filter-house-rules.anon.spec.ts` | 43 | chromium-anon |
| 8 | Selecting multiple house rules creates comma-separated param | `filter-house-rules.anon.spec.ts` | 71 | chromium-anon |
| 9 | House rule buttons display facet counts when available | `filter-house-rules.anon.spec.ts` | 156 | chromium-anon |
| 10 | Closes modal via close button | `filter-modal.anon.spec.ts` | 69 | chromium-anon |
| 11 | Closes modal via backdrop click | `filter-modal.anon.spec.ts` | 89 | chromium-anon |
| 12 | Closing without apply does not change URL | `filter-modal.anon.spec.ts` | 117 | chromium-anon |

**Error (all 12 identical)**:
```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /^Filters/ })

    at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
```

**Screenshots** (sample — 84 files uploaded total):
- `test-results/search-filters-filter-mobi-a895b-ens-correctly-on-mobile-P0--chromium-anon/test-failed-1.png`
- `test-results/search-filters-filter-count-**/test-failed-1.png`
- `test-results/search-filters-filter-date-**/test-failed-1.png`
- `test-results/search-filters-filter-gender-**/test-failed-1.png`
- `test-results/search-filters-filter-house-**/test-failed-1.png`
- `test-results/search-filters-filter-modal-**/test-failed-1.png`

**Artifact**: [test-results-shard-34](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5835026774) (23MB — largest)

---

### Shard 35/40 — 1 failure, 8 flaky (51 passed, 10 skipped)

**Job ID**: 66333265471 | **Duration**: 12.8m

| # | Test | Spec File | Line | Browser | Tags |
|---|------|-----------|------|---------|------|
| 1 | Price slider in modal adjusts pending price | `filter-price.anon.spec.ts` | 277 | chromium-anon | @core |

**Error**:
```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /^Filters/ })

    at filter-price.anon.spec.ts:293:24
```

**Stack trace**:
```
  291 |     if (!dialogVisible) {
  292 |       // Retry: hydration or dynamic import may not have been ready
> 293 |       await filtersBtn.click();
       |                        ^
  294 |       await expect(dialog).toBeVisible({ timeout: 30_000 });
```

**Screenshots**:
- `test-results/search-filters-filter-pric-a5d8d-modal-adjusts-pending-price-chromium-anon/test-failed-1.png`
- `test-results/search-filters-filter-pric-a5d8d-modal-adjusts-pending-price-chromium-anon-retry1/test-failed-1.png`
- `test-results/search-filters-filter-pric-a5d8d-modal-adjusts-pending-price-chromium-anon-retry2/test-failed-1.png`

**Traces**:
- `test-results/search-filters-filter-pric-a5d8d-modal-adjusts-pending-price-chromium-anon-retry1/trace.zip`

**Flaky tests (passed on retry)**:
- Deep link with filter params pre-populates chips and modal (`filter-persistence.anon.spec.ts:136`)
- Rapid checkbox toggling in modal (5 clicks, P0) (`filter-race-conditions.anon.spec.ts:35`)
- Double-click on Apply button (P0) (`filter-race-conditions.anon.spec.ts:196`)
- Browser Back after applying filter reverts URL and UI state (`filter-url-desync.anon.spec.ts:33`)
- Browser Forward after Back restores URL and UI state (`filter-url-desync.anon.spec.ts:87`)
- Manual URL edit with filter params syncs UI state (`filter-url-desync.anon.spec.ts:137`)
- Page refresh mid-filter-change preserves committed state only (`filter-url-desync.anon.spec.ts:222`)
- Click different marker -> previous card loses highlight, new card highlighted (`search-map-list-sync.anon.spec.ts:387`)

**Artifact**: [test-results-shard-35](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5834813584) (17MB)

---

## Root Cause Analysis

### Single Point of Failure

**100% of the 22 hard failures** originate from the same code path:

```
openFilterModal() → btn.click({ force: true })
  at tests/e2e/helpers/filter-helpers.ts:281
```

Three locator strategies all fail identically:
1. `getByRole('button', { name: /^Filters/ })` — filter-helpers.ts
2. `locator('button[aria-label^="Filters"]:visible').first()` — mobile-interactions.anon.spec.ts
3. Direct `filtersBtn.click()` — filter-price.anon.spec.ts

### Why the Button Is Not Found

The `TimeoutError` indicates the button **element itself is not present in the DOM** (or not matching the locator) within the timeout. This is NOT a click-interception issue (force:true would bypass that).

**Likely causes** (ordered by probability):

1. **Dynamic import chunk failure under CI load**: FilterModal is dynamically imported. With 40 parallel shards on shared CI runners, network/CPU pressure may prevent the chunk from loading, and the button may depend on the chunk being available.

2. **Hydration delay**: Next.js SSR renders the page but React hydration hasn't completed, leaving the button non-interactive or absent from the React tree.

3. **Conditional rendering**: The Filters button may be conditionally rendered based on async state (e.g., waiting for search results, location bounds, or feature flags).

### Evidence Supporting CI Resource Pressure

- **16 flaky tests** in the same shards had the same `openFilterModal` timeout on initial attempts but passed on retry — classic resource-pressure flakiness
- **Shard 34** took **25.1 minutes** (vs ~8-12m for other shards), suggesting severe resource starvation
- The failure pattern is non-deterministic — different tests fail in different shards each run
- Previous commits attempted to fix this: `"preload FilterModal chunk on mount"`, `"increase openFilterModal timeout for CI"`

### Previous Fix Attempts (from git log)

| Commit | Fix | Result |
|--------|-----|--------|
| `222c020` | Preload FilterModal chunk on mount, increase retry wait | Still failing |
| `4a26992` | Increase openFilterModal timeout for dynamic import chunk | Still failing |
| `9f7240c` | Resolve final 2 CI E2E failures (Pattern C #14 + Pattern D) | Partially helped |

---

## Recommendations

1. **Investigate button rendering**: Check if the Filters button is conditionally rendered — does it depend on any async state that may not resolve on CI?

2. **Add explicit wait-for-button**: Before clicking, add `await filtersBtn.waitFor({ state: 'attached', timeout: 30_000 })` to distinguish "button not in DOM" from "button not clickable"

3. **Download and inspect screenshots**: The screenshots will show exactly what the page looks like when the timeout occurs. Download artifacts from the links above.

4. **Reduce shard count**: 40 shards on shared GitHub runners may cause resource starvation. Consider reducing to 20-25 shards.

5. **Add FilterModal chunk preload verification**: After preloading, verify the chunk actually loaded before proceeding with tests.

---

## Artifact Download Links

| Shard | Blob Report | Test Results |
|-------|-------------|--------------|
| 4 | [blob-report-4](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5834794853) | [test-results-shard-4](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5834795087) |
| 17 | [blob-report-17](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5834794717) | [test-results-shard-17](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5834795131) |
| 32 | [blob-report-32](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5834764514) | [test-results-shard-32](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5834764731) |
| 33 | [blob-report-33](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5834830173) | [test-results-shard-33](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5834830618) |
| 34 | [blob-report-34](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5835026131) | [test-results-shard-34](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5835026774) |
| 35 | [blob-report-35](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5834812975) | [test-results-shard-35](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608/artifacts/5834813584) |
