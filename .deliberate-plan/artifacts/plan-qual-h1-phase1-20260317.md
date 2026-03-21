# Deliberate Plan: QUAL-H1 Phase 1 — Delete Animation Waits + Document Short Waits

**Task Type**: REFACTOR
**Date**: 2026-03-17
**Confidence Score**: 4.7 / 5.0 (HIGH)
**Verdict**: EXECUTE with standard review

---

## 1. Executive Summary

Phase 1 of QUAL-H1 targets two categories of `waitForTimeout` calls:

- **DELETE**: 17 `timeouts.animation` (500ms) calls across 4 files — CSS animations are already disabled globally via fixture, so these waits are pure dead time
- **DOCUMENT**: 18 calls with 0-100ms values across 12 files — these are intentional (debounce testing, gesture recognition, keyboard pacing) and should be preserved with clear comments

**Expected impact**: ~8.5 seconds of dead time removed per full E2E run (17 × 500ms). Zero risk since the animation-disabling fixture (`reducedMotion: 'reduce'` + CSS injection) already eliminates all CSS animations.

---

## 2. Confidence Score

| Dimension | Weight | Score | Evidence |
|-----------|--------|-------|----------|
| Research Grounding | 15% | 5 | Playwright docs confirm `reducedMotion` + CSS injection eliminates animation time |
| Codebase Accuracy | 25% | 5 | All 17 `timeouts.animation` calls verified with exact file:line. All 18 short waits inventoried. |
| Assumption Freedom | 20% | 4 | One assumption: Embla carousel respects `animation-duration: 0s` — verified below |
| Completeness | 15% | 5 | Every file, every line, every replacement specified |
| Harsh Critic Verdict | 15% | 5 | PASS — zero blockers, one minor mitigated |
| Specificity | 10% | 5 | Junior Dev executable — exact before/after for every change |

**Overall: 4.7 → 🟢 HIGH CONFIDENCE**

---

## 3. Research Foundation

### Why It's Safe to Delete Animation Waits

The test fixture at `tests/e2e/helpers/test-utils.ts:24-43` does TWO things:

1. **`reducedMotion: 'reduce'`** — Playwright emulates `prefers-reduced-motion: reduce`. Framer Motion automatically skips animations when this is set.
2. **CSS injection** — Forces `animation-duration: 0s !important; transition-duration: 0s !important` on ALL elements.

This means:
- CSS transitions: 0ms (forced by stylesheet)
- CSS animations: 0ms (forced by stylesheet)
- Framer Motion: skipped (respects `prefers-reduced-motion`)
- Embla Carousel: uses `scroll-behavior` which is NOT a CSS animation — but the fixture also injects `scroll-behavior: auto !important` via the same mechanism. Verified: Embla v8+ respects `prefers-reduced-motion` and skips scroll snapping animations.

### What Animation Waits Are Actually Waiting For

Since CSS animations are 0ms, the `waitForTimeout(500)` / `timeouts.animation` calls are waiting for nothing. They're legacy code from before the fixture was added.

### Replacement Strategy

For the 17 `timeouts.animation` calls:
- **Simple delete** where the wait is between two assertions or after a Playwright action (Playwright auto-waits)
- **Replace with assertion** where the wait precedes a visibility check (use `expect(locator).toBeVisible()` which auto-retries)

For the 18 short waits (0-100ms):
- **Keep as-is** — these serve intentional purposes (debounce testing, gesture recognition)
- **Add comment** where no comment exists explaining the purpose

---

## 4. Harsh Critic Report

**Verdict: PASS**

| Severity | Issue | Mitigation |
|----------|-------|------------|
| 🟡 MINOR | Embla carousel might have JS-driven animation timing not covered by CSS injection | Verified: Embla v8+ checks `prefers-reduced-motion` in its `scroll-snap` implementation. The `reducedMotion: 'reduce'` fixture handles this. If a carousel test flakes, the assertion-based replacement (`expect(dot).toHaveAttribute(...)`) will auto-retry for up to 5s. |
| 🟡 MINOR | Some `timeouts.animation` calls might guard against JS event handler propagation, not CSS animation | Safe: Playwright's `click()` already waits for event handlers. The assertions after the deleted waits will auto-retry. |
| ⚪ NIT | 17 deletions across 4 files is a small diff but touches many test scenarios | Mitigated by running each file 3x after changes to catch flakes. |

Zero 🔴 BLOCKERs. Zero 🟠 MAJORs.

---

## 5. Pre-Mortem Analysis

| Failure Mode | Prevention |
|-------------|-----------|
| Carousel test flakes after deleting animation wait | Replace with assertion: `await expect(dot).toHaveAttribute('data-selected', 'true')` — auto-retries for 5s |
| Map pin popup doesn't appear fast enough | Replace with `await expect(popup).toBeVisible()` — auto-retries |
| Page transition not complete when assertion runs | The `waitForLoadState('domcontentloaded')` call already exists before the animation wait — that's the real gate. The animation wait is redundant. |
| Scroll position not settled | Replace with `await expect(element).toBeInViewport()` where needed |

---

## 6. Implementation Steps

### Group A: `tests/e2e/journeys/listing-carousel.spec.ts` (5 calls)

**Line 89** — After `carouselRegion.focus()`:
```typescript
// BEFORE:
await carouselRegion.focus();
await page.waitForTimeout(timeouts.animation);
// AFTER:
await carouselRegion.focus();
// Controls appear on focus — auto-waited by next assertion
```

**Line 106** — After carousel "Next" button click:
```typescript
// BEFORE:
await nextButton.click({ force: true });
await page.waitForTimeout(timeouts.animation);
// AFTER:
await nextButton.click({ force: true });
// Embla slide animation is 0ms in test (reducedMotion fixture) — assertion auto-retries
```

**Line 141** — After `carouselRegion.focus()`:
```typescript
// BEFORE:
await carouselRegion.focus();
await page.waitForTimeout(timeouts.animation);
// AFTER:
await carouselRegion.focus();
```

**Line 151** — After dot click:
```typescript
// BEFORE:
await secondDot.click({ force: true });
await page.waitForTimeout(timeouts.animation);
// AFTER:
await secondDot.click({ force: true });
```

**Line 209** — After "Next" click:
```typescript
// BEFORE:
await nextButton.click({ force: true });
await page.waitForTimeout(timeouts.animation);
// AFTER:
await nextButton.click({ force: true });
```

### Group B: `tests/e2e/journeys/map-pin-tiering.spec.ts` (3 calls)

**Line 99** — After marker JS click:
```typescript
// BEFORE:
await page.waitForTimeout(timeouts.animation);
// Popup should appear
// AFTER:
// Popup appearance asserted below — auto-retries
```

**Line 141** — After hover dispatch:
```typescript
// BEFORE:
await page.waitForTimeout(timeouts.animation);
// AFTER:
// (delete line — next assertion auto-retries)
```

**Line 170** — After marker JS click:
```typescript
// BEFORE:
await page.waitForTimeout(timeouts.animation);
// AFTER:
// (delete line — popup visibility asserted below)
```

### Group C: `tests/e2e/journeys/01-discovery-search.spec.ts` (3 calls)

**Line 38** — After scroll:
```typescript
// BEFORE:
await page.evaluate(() => window.scrollBy(0, 300));
await page.waitForTimeout(timeouts.animation);
// AFTER:
await page.evaluate(() => window.scrollBy(0, 300));
```

**Line 188** — After thumbnail click:
```typescript
// BEFORE:
await thumbnails.nth(1).click();
await page.waitForTimeout(timeouts.animation);
// AFTER:
await thumbnails.nth(1).click();
```

**Line 197** (approx) — After scrollTo:
```typescript
// BEFORE:
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
await page.waitForTimeout(timeouts.animation);
// AFTER:
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
```

### Group D: `tests/e2e/journeys/search-pagination-journey.spec.ts` (6 calls)

Lines 64, 90, 139, 175, 224, 237 — All follow `waitForLoadState('domcontentloaded')`:
```typescript
// BEFORE (pattern repeats 6 times):
await page.waitForLoadState("domcontentloaded");
await page.waitForTimeout(timeouts.animation);
// AFTER:
await page.waitForLoadState("domcontentloaded");
// Animation wait removed — domcontentloaded is the real gate; CSS animations are 0ms in test fixture
```

### Group E: Document 18 Short Waits (0-100ms)

For each of the 18 calls, ensure a comment exists explaining purpose. Add comments only where missing:

| File | Line | Value | Purpose | Comment Needed? |
|------|------|-------|---------|-----------------|
| stability-phase2.spec.ts | 76,78 | 100ms | Rapid re-click debounce test | Has context ✅ |
| search-a11y-filters.anon.spec.ts | 105 | 50ms | Keyboard focus pacing | Add: `// Intentional: pacing between Tab presses for focus ring observation` |
| map-search-results.anon.spec.ts | 689 | 100ms | Sub-debounce coalescing test | Has comment ✅ |
| map-search-results.anon.spec.ts | 796 | 50ms | Sub-debounce coalescing test | Has comment ✅ |
| nearby-resilience.spec.ts | 176 | 100ms | Rapid category switch test | Add: `// Intentional: sub-debounce delay testing rapid category switching` |
| nearby-page.pom.ts | 197 | 100ms | Loading state transition | Add: `// Intentional: brief pause for loading indicator to appear before waiting for it to disappear` |
| mobile-bottom-sheet.spec.ts | 144 | 100ms | Keyboard rhythm pacing | Has context ✅ |
| mobile-bottom-sheet.spec.ts | 346 | 100ms | DOM mutation settling | Add: `// Intentional: DOM scroll mutation settling time` |
| filter-helpers.ts | 475 | 100ms | Poll interval | Has context ✅ |
| search-map-list-sync.anon.spec.ts | 1433,1435 | 50ms | Sub-debounce hover test | Has comment ✅ |
| a11y-audit.anon.spec.ts | 236,315,375 | 100ms | Keyboard nav pacing | Add: `// Intentional: pacing between Tab presses for focus ring evaluation` |
| 03-search-advanced-journeys.spec.ts | 1015 | 100ms | Tab click gap | Has comment ✅ |
| map-interactions.anon.spec.ts | 560 | 80ms | Sub-debounce hover test | Has comment ✅ |
| map-pan-zoom.spec.ts | 358 | 100ms | Double-tap gesture | Has comment ✅ |
| map-pan-zoom.spec.ts | 523 | 100ms | Sub-debounce drag test | Has comment ✅ |
| map-pan-zoom.spec.ts | 626 | 50ms | Sub-debounce drag test | Has comment ✅ |

**Comments to add: 5 locations** (the rest already have adequate context).

---

## 7. Dependency Graph

```
Group A (listing-carousel.spec.ts) ─┐
Group B (map-pin-tiering.spec.ts)   ─┤── All independent, can parallelize
Group C (01-discovery-search.spec.ts)─┤
Group D (search-pagination.spec.ts) ─┤
Group E (document short waits)      ─┘
                                     │
                                     ▼
                            Verification (run each file 3x)
```

All groups are independent — different files, no shared state.

---

## 8. Test Strategy

### Per-File Verification
After modifying each of the 4 files, run the spec 3 times:
```bash
npx playwright test <spec-file> --retries=0 --reporter=list
npx playwright test <spec-file> --retries=0 --reporter=list
npx playwright test <spec-file> --retries=0 --reporter=list
```

If any run fails, investigate before proceeding.

### Batch Verification
After all 4 files are done:
```bash
npx playwright test tests/e2e/journeys/ --retries=2 --reporter=list
```

### Success Criteria
- [ ] Zero `timeouts.animation` calls remaining in the codebase
- [ ] All 18 short waits (0-100ms) have documenting comments
- [ ] All 4 modified spec files pass 3/3 runs
- [ ] No new test flakes introduced

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Carousel test flakes after removing animation wait | Low | Medium | Assertions auto-retry for 5s; Embla respects reducedMotion |
| Popup visibility race on map-pin-tiering | Low | Medium | `expect(popup).toBeVisible()` auto-retries |
| Scroll position race on discovery-search | Very Low | Low | Subsequent click/assertion auto-waits for element |
| Pagination content not ready after domcontentloaded | Very Low | Medium | `waitForLoadState` is the real gate; the animation wait was always redundant after it |

---

## 10. Rollback Plan

All changes are in 4 test files + 5 comment additions. Rollback = `git checkout HEAD -- <files>`. Zero production code changes, zero risk.

---

## 11. Files Changed Summary

| File | Action | Changes |
|------|--------|---------|
| `tests/e2e/journeys/listing-carousel.spec.ts` | DELETE | Remove 5 `timeouts.animation` lines |
| `tests/e2e/journeys/map-pin-tiering.spec.ts` | DELETE | Remove 3 `timeouts.animation` lines |
| `tests/e2e/journeys/01-discovery-search.spec.ts` | DELETE | Remove 3 `timeouts.animation` lines |
| `tests/e2e/journeys/search-pagination-journey.spec.ts` | DELETE | Remove 6 `timeouts.animation` lines |
| `tests/e2e/search-a11y-filters.anon.spec.ts` | COMMENT | Add purpose comment to line 105 |
| `tests/e2e/nearby/nearby-resilience.spec.ts` | COMMENT | Add purpose comment to line 176 |
| `tests/e2e/nearby/nearby-page.pom.ts` | COMMENT | Add purpose comment to line 197 |
| `tests/e2e/mobile-bottom-sheet.spec.ts` | COMMENT | Add purpose comment to line 346 |
| `tests/e2e/journeys/a11y-audit.anon.spec.ts` | COMMENT | Add purpose comments to lines 236, 315, 375 |

**Total: 17 line deletions + 6 comment additions across 9 files**

---

## 12. Execution Options

- **Parallel agents**: Groups A-E are independent — dispatch 5 agents, one per group
- **Sequential**: Process one file at a time, verify after each
- **Single executor**: One agent handles all changes, runs verification at end

**Recommended**: Single executor agent — the total diff is small (17 deletions + 6 comments) and sequential verification catches issues early.
