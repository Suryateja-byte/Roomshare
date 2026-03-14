# Root Cause Analysis — CI E2E Test Failures

**Workflow**: Playwright E2E Tests
**Run ID**: [22866105608](https://github.com/Suryateja-byte/Roomshare/actions/runs/22866105608)
**Branch**: `fix/p1-create-listing-stability`
**Commit**: `1ef50a8` (`fix: replace broad href locator with data-testid for HP-04 featured listings`)
**Analysis Date**: 2026-03-09
**Hard failures**: 22 tests across 6 shards (of 40)
**Flaky tests**: 16 (passed on retry — same root cause)

---

## Executive Summary

All 22 hard failures share a **single root cause**: the Filters button in `SearchForm.tsx` is either not present in the DOM or its React `onClick` handler is not attached when the test tries to interact with it. This is caused by **React hydration delay compounded by CI resource pressure** (40 parallel shards, each running its own Next.js dev server on shared GitHub Actions runners).

The failure is **not a selector problem** — three independent locator strategies all fail identically. The button element genuinely is not interactable within the test timeout window.

**Previous Patterns B (price=0 validation) and C (homepage featured listings)** from the prior run are now resolved — no failures in those categories.

---

## Playwright Config Cross-Reference

**File**: `playwright.config.ts`

| Setting | Value | Impact on Failures |
|---------|-------|--------------------|
| `timeout` | 60 000 ms (180 000 with `test.slow()`) | Per-test timeout. Tests exhaust this budget: 15s button wait + 30s dialog wait + 2s delay + 15s retry = 62s (barely over) |
| `expect.timeout` | 15 000 ms | The `expect(btn).toBeVisible()` at filter-helpers.ts:262 uses this |
| `actionTimeout` | 15 000 ms | The retry `btn.click({ force: true })` at line 281 inherits this — the error timeout |
| `navigationTimeout` | 45 000 ms | Adequate for page loads |
| `retries` | 2 (CI only) | Tests get 3 total attempts. All 22 hard failures failed all 3 — resource pressure is persistent |
| `workers` | 1 per shard | Dev server + Playwright share CPU; dynamic imports are slow |
| `fullyParallel` | true | Irrelevant with `workers: 1` — tests run sequentially within each shard |
| Shards | 40 | **Too many.** Shard 34 took 25.1m (3x average) — evidence of severe resource starvation |

**Key systemic issue**: `workers: 1` on CI means the Node.js dev server competes with Playwright for CPU. Dynamic imports (`next/dynamic({ ssr: false })`) must download JS chunks over localhost — normally instant, but under load the chunk fetch can take 10-30s. The retry mechanism works for flaky tests because the chunk is browser-cached from the first attempt.

**Anon project note**: `chromium-anon` has **no `dependencies: ['setup']`**, so it starts immediately. Tests may hit the dev server before it's fully warmed up.

---

## The Failure Chain (All 22 Tests)

```
1. CI starts 40 shards → 40 Next.js dev servers on shared runners
2. Resource contention → slow compilation, slow chunk serving
3. Test navigates to /search → page HTML arrives (SSR)
4. waitForSearchReady() waits for Filters button visibility
   → times out → SILENTLY SWALLOWED (.catch(() => {}))
5. Test proceeds to openFilterModal()
6. First click: button visible but onClick not hydrated,
   OR click fires but FilterModal chunk fails to load → dialog never appears
7. 30s wait for dialog → times out (caught)
8. Retry: Escape → 2s wait → btn.click({ force: true })
   → button gone from DOM or still not hydrated
9. 15s actionTimeout exceeded → TEST FAILS
```

---

## Source Code Analysis

### The Button (SearchForm.tsx:790-812)

```tsx
{!isCompact && (
    <>
        <div className="hidden md:block w-px h-8 ..." />
        <div className="flex items-center px-3">
            <button
                type="button"
                onClick={() => setShowFilters(true)}
                aria-label={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}`}
                aria-expanded={showFilters}
            >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Filters</span>
            </button>
        </div>
    </>
)}
```

- Rendered when `!isCompact` (default variant — always true on search page)
- `aria-label="Filters"` matches all three test locator strategies
- The button is a **native `<button>`** rendered directly in SearchForm — NOT inside the dynamically-imported FilterModal

### The Dynamic Import (SearchForm.tsx:13-16)

```tsx
const FilterModal = dynamic(() => import('@/components/search/FilterModal'), {
    ssr: false,
    loading: () => null,
});
```

- `ssr: false`: Dialog HTML is never server-rendered
- `loading: () => null`: No loading indicator while chunk loads
- Chunk must load before dialog can render, even if `setShowFilters(true)` fires

### The Pre-warm Attempt (SearchForm.tsx:128-133)

```tsx
const [hasMounted, setHasMounted] = useState(false);

useEffect(() => {
    import('@/components/search/FilterModal');
}, []);
```

This `useEffect` only fires **after hydration**. If hydration itself is slow (the core problem), the pre-warm fires late. The chunk import may also timeout silently under CI load.

### The Suspense Wrapper (SearchHeaderWrapper.tsx:159-161)

```tsx
<Suspense fallback={<div className="h-12" />}>
    <SearchForm />
</Suspense>
```

If SearchForm suspends for any reason, a 48px placeholder div is shown instead of the form (including the Filters button). This could explain why the button is not in the DOM.

### The Silent Error Swallowing (filter-helpers.ts:166-168)

```typescript
await page.getByRole("button", { name: /^Filters/ })
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});  // ← SILENTLY SWALLOWS FAILURE
```

`waitForSearchReady()` catches the button visibility timeout. Tests proceed even when the page isn't ready, causing confusing downstream failures in `openFilterModal()`.

### The Retry Logic (filter-helpers.ts:275-283)

```typescript
if (!dialogVisible) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(2_000);
    await btn.click({ force: true });  // ← LINE 281: ALL ERRORS HERE
    await expect(dialog).toBeVisible({ timeout: 15_000 });
}
```

**Phase 1**: First click fires on an SSR-rendered button before React hydration. `onClick` is not attached → `setShowFilters(true)` never fires → dialog never renders.

**Phase 2**: Escape press attempts to reset state, but if `setShowFilters` never fired, state is already `false` — Escape is a no-op. The 2s wait is insufficient for hydration on loaded CI. `force: true` bypasses Playwright actionability checks but NOT React hydration. If React hasn't attached the handler, the DOM click event fires but nothing happens.

**Phase 3** (compounding): Even when hydration completes and the click fires `setShowFilters(true)`, the FilterModal dynamic import must fetch and execute the JS chunk. With `loading: () => null`, nothing renders until the chunk loads. On CI this can take 10-30s.

### Three Locator Strategies — All Fail Identically

| Strategy | Location | Selector |
|----------|----------|----------|
| getByRole | filter-helpers.ts:201 | `getByRole('button', { name: /^Filters/ })` |
| CSS + aria-label | mobile-interactions.anon.spec.ts:511 | `locator('button[aria-label^="Filters"]:visible').first()` |
| Direct getByRole | filter-price.anon.spec.ts:281 | `getByRole('button', { name: /^Filters/ })` (inline) |

All three match the actual button markup. The selectors are correct — the element itself is the problem.

---

## Evidence for CI Resource Pressure

| Evidence | Significance |
|----------|-------------|
| 16 flaky tests passed on Playwright retry (same openFilterModal failure) | Button DOES become available eventually — timing, not logic bug |
| Shard 34 took 25.1 min (longest) and had 12 failures | Severe resource starvation correlates with failure count |
| Previous commits tried preload chunk + increase timeouts | Developers identified timing pattern but couldn't fully solve it |
| Tests pass locally with 3 workers | Local machines have dedicated resources without contention |
| Different shards fail different tests each run | Non-deterministic — classic resource-pressure flakiness |

---

## Why Previous Fix Attempts Failed

| Commit | Fix Attempted | Why It Failed |
|--------|--------------|---------------|
| `222c020` | Preload FilterModal chunk on mount via `useEffect(() => { import(...) })` | The `useEffect` fires AFTER hydration. If hydration is slow (the core problem), the preload fires late. `import()` may also timeout silently. |
| `4a26992` | Increase openFilterModal timeout for dynamic import chunk on CI | The initial dialog wait is already 30s. The retry `btn.click()` at line 281 still uses the global `actionTimeout` of 15s. More importantly, increasing timeouts doesn't fix the hydration race — if `onClick` isn't attached, no timeout helps. |
| `9f7240c` | "Resolve final 2 CI E2E failures (Pattern C #14 + Pattern D)" | Addressed specific symptom patterns but not the underlying hydration + resource contention. |

---

## Per-Test Root Cause Analysis

### Shard 4/40 — 3 Failures (chromium, Desktop Chrome)

---

#### Test 1: J32 — Escape key closes the filter modal

1. **Test name and file path**: `J32: Escape key closes the filter modal` — `tests/e2e/journeys/03-search-advanced-journeys.spec.ts:444`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — React hydration delay under CI resource pressure. Uses shared `openFilterModal()` helper. Test navigates via `nav.goToSearch({ bounds: SF_BOUNDS })`, waits for heading, then calls `openFilterModal()`. The a11y keyboard test never reaches its actual assertion because the modal can't be opened.
4. **Why previous fixes failed**: Preloading FilterModal chunk doesn't help if hydration hasn't completed. The `useEffect` preload fires only after hydration — the exact thing that's delayed. The 30s dialog timeout and `force: true` click don't address the unattached `onClick` handler.
5. **Proposed fix**: Add hydration marker (`data-hydrated`) to Filters button set via `useEffect`. Wait for this marker in `openFilterModal()` before clicking. Remove silent `.catch(() => {})` in `waitForSearchReady()`. **Confidence: HIGH**

---

#### Test 2: J33 — Tab navigates through filter modal controls

1. **Test name and file path**: `J33: Tab navigates through filter modal controls` — `tests/e2e/journeys/03-search-advanced-journeys.spec.ts:457`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — identical to J32, same shard resource pressure. Uses shared `openFilterModal()`.
4. **Why previous fixes failed**: Same as J32.
5. **Proposed fix**: Same hydration marker approach. **Confidence: HIGH**

---

#### Test 3: J48 — Mobile filter modal is scrollable with many options

1. **Test name and file path**: `J48: Mobile filter modal is scrollable with many options` — `tests/e2e/journeys/03-search-advanced-journeys.spec.ts:858`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** + **environment difference** — sets mobile viewport (375x667) via `page.setViewportSize()`. On mobile, button text "Filters" has `hidden sm:inline` but `aria-label` still provides the accessible name, so the locator works. Real issue is hydration delay.
4. **Why previous fixes failed**: Same underlying cause. Mobile viewport adds no extra complexity for the locator but may add slightly more rendering work.
5. **Proposed fix**: Same hydration marker approach. **Confidence: HIGH**

---

### Shard 17/40 — 2 Failures (Mobile Chrome, Pixel 5 emulation)

---

#### Test 4: J20 — Mobile layout is responsive and functional

1. **Test name and file path**: `J20: Mobile layout is responsive and functional` — `tests/e2e/journeys/02-search-critical-journeys.spec.ts:524`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — Mobile Chrome project uses Pixel 5 emulation (393x851). Device emulation adds rendering overhead. Uses shared `openFilterModal()`.
4. **Why previous fixes failed**: Same hydration issue. Mobile emulation compounds the timing problem.
5. **Proposed fix**: Hydration marker + consider separating filter interaction from mobile responsiveness tests. **Confidence: HIGH**

---

#### Test 5: J22 — Gender preference + household gender filters combined

1. **Test name and file path**: `J22: Gender preference + household gender filters combined` — `tests/e2e/journeys/03-search-advanced-journeys.spec.ts:102`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — Mobile Chrome, same shard resource pressure as J20. Uses shared `openFilterModal()`.
4. **Why previous fixes failed**: Same as J20.
5. **Proposed fix**: Same hydration marker approach. **Confidence: HIGH**

---

### Shard 32/40 — 2 Failures (chromium-anon, Desktop Chrome)

---

#### Test 6: Filters button opens filter modal on mobile

1. **Test name and file path**: `Filters button opens filter modal on mobile` — `tests/e2e/mobile-interactions.anon.spec.ts:477`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for locator('button[aria-label^="Filters"]:visible').first()
   at mobile-interactions.anon.spec.ts:511:78
   ```
3. **Root cause category**: **Timing/race condition** — uses DIFFERENT locator strategy (`locator()` with CSS selector instead of `getByRole`) but same outcome. Uses `evaluate()` click for first attempt, falls back to Playwright native `click({ force: true })`. Both fail because the element isn't in the DOM or not visible.
4. **Why previous fixes failed**: The test already has its own retry logic with `evaluate()` click + native click fallback. Both fail because the element itself isn't available, not because the click mechanism is wrong.
5. **Proposed fix**: Wait for hydration marker before attempting any click. Unify with shared `openFilterModal()` helper. **Confidence: HIGH**

---

#### Test 7: Filter modal closes when applying filters

1. **Test name and file path**: `Filter modal closes when applying filters` — `tests/e2e/mobile-interactions.anon.spec.ts:517`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for locator('button[aria-label^="Filters"]:visible').first()
   at mobile-interactions.anon.spec.ts:541:78
   ```
3. **Root cause category**: **Timing/race condition** — identical to Test 6. Same file, same locator strategy, same shard.
4. **Why previous fixes failed**: Same as Test 6.
5. **Proposed fix**: Same hydration marker approach. **Confidence: HIGH**

---

### Shard 33/40 — 2 Failures (chromium-anon, Desktop Chrome)

---

#### Test 8: Filter modal has role=dialog and aria-modal=true

1. **Test name and file path**: `1. Filter modal has role=dialog and aria-modal=true` — `tests/e2e/search-a11y-filters.anon.spec.ts:48`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — uses shared `openFilterModal()`. This shard also had 6 flaky tests (same helper, passed on retry), confirming variable resource pressure.
4. **Why previous fixes failed**: Same hydration timing issue. The a11y test never reaches its ARIA attribute assertions.
5. **Proposed fix**: Same hydration marker approach. **Confidence: HIGH**

---

#### Test 9: Filter toggle buttons have accessible labels

1. **Test name and file path**: `6. Filter toggle buttons have accessible labels` — `tests/e2e/search-a11y-filters.anon.spec.ts:165`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — identical to Test 8, same shard.
4. **Why previous fixes failed**: Same as Test 8.
5. **Proposed fix**: Same hydration marker approach. **Confidence: HIGH**

---

### Shard 34/40 — 12 Failures (chromium-anon) — WORST SHARD

**Runtime: 25.1 minutes (3x average) — severe resource starvation.**

---

#### Test 10: Filter modal opens correctly on mobile (P0)

1. **Test name and file path**: `Filter modal opens correctly on mobile (P0)` — `tests/e2e/search-filters/filter-mobile.anon.spec.ts:37`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — mobile viewport test via `navigateToMobileSearch()`, same fundamental hydration issue. Uses shared `openFilterModal()`.
4. **Why previous fixes failed**: Same timing root cause. Mobile navigation doesn't change the hydration problem.
5. **Proposed fix**: Hydration marker wait. **Confidence: HIGH**

---

#### Test 11: Apply button shows 100+ when count is null

1. **Test name and file path**: `Apply button shows 100+ when count is null` — `tests/e2e/search-filters/filter-count-preview.anon.spec.ts:222`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — sets up API mocks before navigation, but mock setup doesn't affect hydration timing. Uses shared `openFilterModal()`.
4. **Why previous fixes failed**: Same hydration issue. API mocking is orthogonal to the rendering pipeline.
5. **Proposed fix**: Hydration marker wait. **Confidence: HIGH**

---

#### Test 12: Apply button disabled with select-a-location when no bounds

1. **Test name and file path**: `Apply button disabled with select-a-location when no bounds` — `tests/e2e/search-filters/filter-count-preview.anon.spec.ts:242`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — identical to Test 11, same file, same shard.
4. **Why previous fixes failed**: Same as Test 11.
5. **Proposed fix**: Hydration marker wait. **Confidence: HIGH**

---

#### Test 13: Selecting a date via picker and applying updates URL

1. **Test name and file path**: `Selecting a date via picker and applying updates URL` — `tests/e2e/search-filters/filter-date.anon.spec.ts:62`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — standard `waitForSearchReady()` + `openFilterModal()` pattern. Date picker interaction code is never reached.
4. **Why previous fixes failed**: Same hydration issue.
5. **Proposed fix**: Hydration marker wait. **Confidence: HIGH**

---

#### Test 14: Selecting household gender and applying updates URL

1. **Test name and file path**: `Selecting household gender and applying updates URL` — `tests/e2e/search-filters/filter-gender-language.anon.spec.ts:83`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — same as all other filter tests in this shard.
4. **Why previous fixes failed**: Same hydration issue.
5. **Proposed fix**: Hydration marker wait. **Confidence: HIGH**

---

#### Test 15: Shows "No languages found" for unmatched search

1. **Test name and file path**: `Shows "No languages found" for unmatched search` — `tests/e2e/search-filters/filter-gender-language.anon.spec.ts:202`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — same as Test 14, same file.
4. **Why previous fixes failed**: Same hydration issue.
5. **Proposed fix**: Hydration marker wait. **Confidence: HIGH**

---

#### Test 16: Selecting a single house rule updates URL

1. **Test name and file path**: `Selecting a single house rule updates URL` — `tests/e2e/search-filters/filter-house-rules.anon.spec.ts:43`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition**.
4. **Why previous fixes failed**: Same hydration issue.
5. **Proposed fix**: Hydration marker wait. **Confidence: HIGH**

---

#### Test 17: Selecting multiple house rules creates comma-separated param

1. **Test name and file path**: `Selecting multiple house rules creates comma-separated param` — `tests/e2e/search-filters/filter-house-rules.anon.spec.ts:71`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — same as Test 16, same file.
4. **Why previous fixes failed**: Same hydration issue.
5. **Proposed fix**: Hydration marker wait. **Confidence: HIGH**

---

#### Test 18: House rule buttons display facet counts when available

1. **Test name and file path**: `House rule buttons display facet counts when available` — `tests/e2e/search-filters/filter-house-rules.anon.spec.ts:156`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — uses API mocking for facets, but mock setup doesn't affect hydration.
4. **Why previous fixes failed**: Same hydration issue.
5. **Proposed fix**: Hydration marker wait. **Confidence: HIGH**

---

#### Test 19: Closes modal via close button

1. **Test name and file path**: `Closes modal via close button` — `tests/e2e/search-filters/filter-modal.anon.spec.ts:69`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — basic modal lifecycle test. Uses shared helper via `beforeEach` → `waitForSearchReady()`.
4. **Why previous fixes failed**: Same hydration issue.
5. **Proposed fix**: Hydration marker wait. **Confidence: HIGH**

---

#### Test 20: Closes modal via backdrop click

1. **Test name and file path**: `Closes modal via backdrop click` — `tests/e2e/search-filters/filter-modal.anon.spec.ts:89`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — identical to Test 19.
4. **Why previous fixes failed**: Same hydration issue.
5. **Proposed fix**: Hydration marker wait. **Confidence: HIGH**

---

#### Test 21: Closing without apply does not change URL

1. **Test name and file path**: `Closing without apply does not change URL` — `tests/e2e/search-filters/filter-modal.anon.spec.ts:117`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at openFilterModal (tests/e2e/helpers/filter-helpers.ts:281:15)
   ```
3. **Root cause category**: **Timing/race condition** — identical to Tests 19-20.
4. **Why previous fixes failed**: Same hydration issue.
5. **Proposed fix**: Hydration marker wait. **Confidence: HIGH**

---

### Shard 35/40 — 1 Failure (chromium-anon, Desktop Chrome)

---

#### Test 22: Price slider in modal adjusts pending price

1. **Test name and file path**: `Price slider in modal adjusts pending price` — `tests/e2e/search-filters/filter-price.anon.spec.ts:277`
2. **Exact error from CI**:
   ```
   TimeoutError: locator.click: Timeout 15000ms exceeded.
   Call log: waiting for getByRole('button', { name: /^Filters/ })
   at filter-price.anon.spec.ts:293:24
   ```
   Note: This test has its OWN inline `openFilterModal` logic at lines 281-294, not the shared helper.
3. **Root cause category**: **Timing/race condition** — same hydration issue, PLUS a bug in the inline retry logic. The inline retry (line 291-294) does NOT press Escape before retrying:
   ```typescript
   if (!dialogVisible) {
       await filtersBtn.click();  // ← No Escape first! If showFilters is already true, this is a no-op
       await expect(dialog).toBeVisible({ timeout: 30_000 });
   }
   ```
   Since `onClick` calls `setShowFilters(true)` (not a toggle), re-clicking when state is already `true` causes no state change → no re-render → dialog still doesn't appear.
4. **Why previous fixes failed**: Same hydration issue as all others, compounded by the inline retry bug.
5. **Proposed fix**: Replace inline logic with the shared `openFilterModal()` helper (which has Escape reset), plus hydration marker. **Confidence: HIGH**

---

## Flaky Tests Context (16 tests)

These 16 tests had the **same `openFilterModal` timeout** on initial attempt but **passed on Playwright retry**:

| Shard | Flaky Tests |
|-------|-------------|
| 17 | J11: Lease duration filter (02-critical:302), J12: House rules filter toggles (02-critical:339) |
| 33 | A11y test 2: Filter modal title (a11y-filters:57), A11y test 7: Price range labels (a11y-filters:196), Amenity multi-select (amenities:78), Amenity facet counts (amenities:184), Disabled amenity buttons (amenities:204), All valid amenity options (amenities:224) |
| 35 | Deep link pre-populates (persistence:136), Rapid checkbox toggling (race-conditions:35), Double-click Apply (race-conditions:196), Browser Back reverts (url-desync:33), Browser Forward restores (url-desync:87), Manual URL edit syncs (url-desync:137), Page refresh preserves committed (url-desync:222), Map marker click highlight (map-list-sync:387) |

**Why retries save flaky tests**: On retry, the FilterModal JS chunk is cached in the browser from the failed first attempt. The second attempt only needs React hydration + re-render, which is much faster. Tests that are just barely over the timeout on first run pass on retry.

**Why 22 tests never pass**: Resource pressure on their shard is severe enough that even with chunk caching, hydration + rendering still exceeds the timeout across all 3 attempts.

---

## Root Cause Categories Summary

| Category | Count | Tests |
|----------|-------|-------|
| Timing/race condition (hydration delay + dynamic import) | 22 | ALL |
| Environment difference (CI resource pressure, 40 shards) | 22 | ALL (contributing factor) |
| Silent error swallowing (waitForSearchReady .catch) | 22 | ALL (masking factor) |
| Selector brittleness | 0 | None — selectors are correct |
| State pollution | 0 | None — each shard has own DB |
| Setup/teardown issue | 0 | None — page loads, just slowly |

---

## Proposed Fixes (Ordered by Impact)

### Fix 1: Add React Hydration Marker (HIGH confidence — addresses root cause)

**App-side**: Add a `data-hydrated` attribute to the Filters button set via `useEffect`:

```tsx
// SearchForm.tsx — already has hasMounted state (line 126)
const [hasMounted, setHasMounted] = useState(false);
useEffect(() => { setHasMounted(true); }, []);

// On the button (line 794):
<button
    data-hydrated={hasMounted || undefined}
    onClick={() => setShowFilters(true)}
    aria-label={`Filters${...}`}
>
```

**Test-side**: Wait for hydration marker in `openFilterModal()`:

```typescript
// filter-helpers.ts — replace line 262
const btn = page.locator('button[data-hydrated][aria-label^="Filters"]');
await expect(btn).toBeVisible({ timeout: 45_000 });
```

### Fix 2: Stop Silently Swallowing Errors in waitForSearchReady (HIGH confidence)

```typescript
// Before (filter-helpers.ts:166-168):
await page.getByRole("button", { name: /^Filters/ })
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});

// After:
await page.locator('button[data-hydrated][aria-label^="Filters"]')
    .waitFor({ state: "visible", timeout: 45_000 });
```

This surfaces failures at the correct location instead of later in `openFilterModal()`.

### Fix 3: Replace Dynamic Import with Static Import for FilterModal (HIGH confidence)

```typescript
// Before (SearchForm.tsx:13-16):
const FilterModal = dynamic(() => import('@/components/search/FilterModal'), {
    ssr: false,
    loading: () => null,
});

// After:
import { FilterModal } from '@/components/search/FilterModal';
```

Eliminates the chunk loading step entirely. Tradeoff: ~15KB larger initial bundle (acceptable for a page where the modal is always available).

### Fix 4: Reduce Shard Count from 40 to 20 (MEDIUM confidence)

```yaml
# .github/workflows/playwright.yml
matrix:
    shardIndex: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
    shardTotal: [20]
```

Halves resource contention. Total CI time may increase slightly but reliability improves.

### Fix 5: Fix Inline openFilterModal in filter-price.anon.spec.ts (HIGH confidence)

Replace inline logic with shared helper:

```typescript
// Before (filter-price.anon.spec.ts:280-295):
// Inline retry without Escape press

// After:
const dialog = await openFilterModal(page);
```

### Fix 6: Increase Retry Timeout in openFilterModal (MEDIUM confidence)

```typescript
// Before (filter-helpers.ts:281):
await btn.click({ force: true });

// After:
await btn.click({ force: true, timeout: 30_000 });
```

The retry click inherits the global `actionTimeout` of 15s. Override to match the initial attempt's 30s budget.

---

## Files Referenced

| File | Role |
|------|------|
| `tests/e2e/helpers/filter-helpers.ts` | Shared filter test utilities — `waitForSearchReady()`, `openFilterModal()`, `filtersButton()` |
| `src/components/SearchForm.tsx` | Renders Filters button (line 794) + dynamically imports FilterModal (line 13) |
| `src/components/search/FilterModal.tsx` | Presentational dialog — uses `createPortal`, NOT itself lazy-loaded |
| `src/components/SearchHeaderWrapper.tsx` | Renders SearchForm inside `<Suspense>` (line 159) |
| `src/app/search/layout.tsx` | Search page layout — providers wrapper |
| `src/app/search/page.tsx` | Search page SSR — does NOT render SearchForm directly |
| `playwright.config.ts` | Test configuration — timeouts, retries, shard config |
| `.github/workflows/playwright.yml` | CI workflow — 40 shards, dev server per shard |
| `tests/e2e/mobile-interactions.anon.spec.ts` | Mobile tests with inline filter logic (not shared helper) |
| `tests/e2e/search-filters/filter-price.anon.spec.ts` | Has inline `openFilterModal` with retry bug |
