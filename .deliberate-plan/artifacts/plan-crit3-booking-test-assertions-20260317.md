# CRIT-3 Fix Plan: Meaningless Assertions in Booking Race Condition Tests

**Task Type**: FIX
**Confidence Score**: 🟢 4.6/5.0 (HIGH)
**Date**: 2026-03-17
**File**: `tests/e2e/booking/booking-race-conditions.spec.ts`

---

## 1. Executive Summary

Two `expect(true).toBeTruthy()` assertions in RC-07 (expired session test) provide zero actual coverage of edge case behavior. The test always passes regardless of what the app actually does. Additionally, the `selectDates()` helper uses 5 `waitForTimeout` calls that cause flakiness, and 19 `test.skip` guards hide precondition failures rather than failing loudly. This plan replaces meaningless assertions with real behavioral checks, hardens the test helper, and audits the full file.

---

## 2. Confidence Score Breakdown

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Research Grounding | 15% | 5 | Playwright best practices well-known; no exotic patterns needed |
| Codebase Accuracy | 25% | 5 | All file paths, line numbers, component behavior verified via Read/Grep |
| Assumption Freedom | 20% | 4 | One assumption: Radix popover `data-state` transitions are reliable replacements for waitForTimeout |
| Completeness | 15% | 5 | All 3 issue categories addressed: assertions, timeouts, skips |
| Harsh Critic Verdict | 15% | 4 | CONDITIONAL PASS — see Section 6 |
| Specificity | 10% | 5 | Every replacement assertion specified with exact locators |

**Weighted Score**: 0.15×5 + 0.25×5 + 0.20×4 + 0.15×5 + 0.15×4 + 0.10×5 = 4.6

---

## 3. Root Cause Analysis

### 3.1 The Meaningless Assertions (Lines 580, 583)

**Location**: RC-07 test ("expired session — booking attempt redirects to login"), lines 566-584.

**Current code structure**:
```typescript
if (hasLoginGate) {
    // ✅ GOOD: Real assertions — verifies login gate visible + form disabled
    await expect(loginGate).toBeVisible();
    const form = page.locator('form').filter({ has: page.locator('#booking-start-date') }).first();
    if (await form.isVisible().catch(() => false)) {
        const classes = await form.getAttribute('class') || '';
        expect(classes).toContain('pointer-events-none');
    }
} else if (hasBookBtn) {
    // ❌ BAD: Line 580 — book button visible to anon user, no real check
    expect(true).toBeTruthy();
} else {
    // ❌ BAD: Line 583 — no UI at all, no real check
    expect(true).toBeTruthy();
}
```

**Why they exist**: The original author handled 3 possible states for an unauthenticated user viewing a listing but only wrote real assertions for the first branch. The other two branches were placeholder "pass" markers.

**What should actually be verified**:

- **Line 580 branch** (`hasBookBtn` visible to anon): This is the "unlikely edge case" per the comment. If the book button IS visible to an unauthenticated user, the test should click it and verify the server rejects with SESSION_EXPIRED (rendered as an auth error or redirect to login). The BookingForm component categorizes `SESSION_EXPIRED` as `errorType: 'auth'` (BookingForm.tsx:178).

- **Line 583 branch** (no booking UI): The listing is PAUSED or RENTED. The test should verify the status message is shown: "This listing is temporarily unavailable" (PAUSED) or "This room is currently rented out" (RENTED). These are rendered at BookingForm.tsx:502-509.

### 3.2 The `waitForTimeout` Flakiness (selectDates helper, lines 29-72)

Five `waitForTimeout` calls in the `selectDates()` helper with fixed delays (250ms, 500ms, 300ms):
- Line 40: `waitForTimeout(250)` — after clicking "Next month" button
- Line 49: `waitForTimeout(500)` — after clicking start day
- Line 56: `waitForTimeout(300)` — before end date picker interaction
- Line 62: `waitForTimeout(250)` — after clicking "Next month" for end date
- Line 71: `waitForTimeout(500)` — after clicking end day

These are fragile because Radix DatePicker animations take variable time depending on CI load.

### 3.3 The `test.skip` Guards (19 occurrences)

All 19 are **conditional skips** for missing test preconditions (e.g., "Reviewer listing not found"). These are NOT the problem — they are correct Playwright patterns for E2E tests that depend on seed data. The real issue is that some skip conditions are too broad and silently hide infrastructure failures.

**Categorization**:
- **Acceptable skips** (keep): `test.skip(!listingUrl, 'Reviewer listing not found')` — listing genuinely may not exist in some environments
- **Concerning skips** (tighten): `test.skip(!canBookA || !canBookB, 'Booking button not visible')` — this could hide a real bug where the booking form broke

---

## 4. Implementation Steps

### Step 1: Fix Line 580 — Replace meaningless assertion with actual SESSION_EXPIRED verification

**File**: `tests/e2e/booking/booking-race-conditions.spec.ts`
**Lines**: 576-580

**Replace**:
```typescript
} else if (hasBookBtn) {
    // If somehow the book button is visible, clicking should fail gracefully
    // (server action returns SESSION_EXPIRED)
    // This path is unlikely but handles edge cases
    expect(true).toBeTruthy();
```

**With**:
```typescript
} else if (hasBookBtn) {
    // Book button visible to anon user — click and verify graceful failure.
    // Server action returns SESSION_EXPIRED → BookingForm shows auth error or redirects.
    await requestBtn.click();

    // Wait for either: auth error message, redirect to login, or error alert
    const authError = page.getByText(/sign in|log in|session expired|unauthorized/i).first();
    const errorAlert = page.locator('[role="alert"]').first();
    const loginRedirect = page.waitForURL(/\/(login|signin|auth)/, { timeout: 10_000 }).catch(() => null);

    // At least one of these outcomes should occur
    const hasAuthError = await authError.isVisible({ timeout: 10_000 }).catch(() => false);
    const hasErrorAlert = await errorAlert.isVisible({ timeout: 3_000 }).catch(() => false);
    const redirected = /\/(login|signin|auth)/.test(page.url());

    expect(hasAuthError || hasErrorAlert || redirected).toBeTruthy();
```

**Rationale**:
- BookingForm.tsx:178 categorizes `SESSION_EXPIRED` as auth error
- The component either shows an auth error message or the session check redirects to login
- We test all three possible correct outcomes

**Risk**: LOW — this branch is rarely hit; adding a real assertion can only improve coverage.

### Step 2: Fix Line 583 — Replace meaningless assertion with status message verification

**File**: `tests/e2e/booking/booking-race-conditions.spec.ts`
**Lines**: 581-583

**Replace**:
```typescript
} else {
    // Page loaded but no booking UI — listing may be PAUSED/RENTED
    expect(true).toBeTruthy();
}
```

**With**:
```typescript
} else {
    // No booking UI — listing is PAUSED or RENTED. Verify status message shown.
    // BookingForm renders "temporarily unavailable" (PAUSED) or "currently rented out" (RENTED)
    const statusMessage = page.getByText(/temporarily unavailable|currently rented out|not available/i).first();
    const hasStatusMessage = await statusMessage.isVisible({ timeout: 5_000 }).catch(() => false);

    // The page should show SOME explanation — either a status message or the listing itself
    // is in a state where booking is not offered (no form, no gate, no button)
    const pageContent = await page.locator('main').textContent() || '';
    expect(
        hasStatusMessage ||
        /paused|rented|unavailable|not available/i.test(pageContent)
    ).toBeTruthy();
}
```

**Rationale**:
- BookingForm.tsx:502-509 renders specific status messages for PAUSED/RENTED
- We verify the user sees an explanation, not a blank/broken page
- Fallback to text content check handles cases where the message is outside a standard element

**Risk**: LOW — read-only assertion on existing content.

### Step 3: Harden selectDates() — Replace waitForTimeout with proper waits

**File**: `tests/e2e/booking/booking-race-conditions.spec.ts`
**Lines**: 29-72 (the `selectDates` function)

**Replace the entire `selectDates` function with**:
```typescript
async function selectDates(page: import('@playwright/test').Page, startMonths: number) {
  // --- Start date ---
  const startDateTrigger = page.locator('#booking-start-date');
  await page.locator('#booking-start-date[data-state]').waitFor({ state: 'visible', timeout: 15_000 });
  await startDateTrigger.click({ force: true });

  const nextMonthBtnStart = page.locator('button[aria-label="Next month"]');
  await nextMonthBtnStart.waitFor({ state: 'visible', timeout: 10_000 });
  for (let i = 0; i < startMonths; i++) {
    await nextMonthBtnStart.dispatchEvent('click');
    // Wait for month transition animation to complete (Radix calendar re-renders)
    await page.waitForFunction(
      () => !document.querySelector('[data-radix-popper-content-wrapper] [data-disabled]'),
      { timeout: 2_000 }
    ).catch(() => {}); // Fallback: if no data-disabled detected, proceed
  }

  const startDayBtn = page
    .locator('[data-radix-popper-content-wrapper] button, [class*="popover"] button')
    .filter({ hasText: /^1$/ })
    .first();
  await startDayBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await startDayBtn.dispatchEvent('click');

  // Wait for popover to close after date selection
  await expect(page.locator('[data-radix-popper-content-wrapper]')).not.toBeVisible({ timeout: 5_000 }).catch(() => {});

  // --- End date ---
  const endDateTrigger = page.locator('#booking-end-date');
  await page.locator('#booking-end-date[data-state]').waitFor({ state: 'visible', timeout: 10_000 });
  await endDateTrigger.click({ force: true });

  // Wait for the end-date popover to open
  await page.locator('[data-radix-popper-content-wrapper]').waitFor({ state: 'visible', timeout: 5_000 });

  const nextMonthBtnEnd = page.locator('button[aria-label="Next month"]');
  await nextMonthBtnEnd.waitFor({ state: 'visible', timeout: 10_000 });
  for (let i = 0; i < startMonths + 2; i++) {
    await nextMonthBtnEnd.dispatchEvent('click');
    await page.waitForFunction(
      () => !document.querySelector('[data-radix-popper-content-wrapper] [data-disabled]'),
      { timeout: 2_000 }
    ).catch(() => {});
  }

  const endDayBtn = page
    .locator('[data-radix-popper-content-wrapper] button, [class*="popover"] button')
    .filter({ hasText: /^1$/ })
    .first();
  await endDayBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await endDayBtn.dispatchEvent('click');

  // Wait for popover to close
  await expect(page.locator('[data-radix-popper-content-wrapper]')).not.toBeVisible({ timeout: 5_000 }).catch(() => {});
}
```

**Changes**:
- Replace `waitForTimeout(250)` after month navigation → `waitForFunction` checking Radix animation state
- Replace `waitForTimeout(500)` after day selection → `waitFor` on popover close
- Replace `waitForTimeout(300)` before end date interaction → `waitFor` on popover visibility

**Risk**: MEDIUM — Radix `data-disabled` attribute during transitions needs verification. The `.catch(() => {})` fallback ensures if the attribute isn't present, the test proceeds (slightly slower but not broken).

**Mitigation**: If the `waitForFunction` approach proves flaky in CI, fall back to a shorter fixed delay (100ms) as a pragmatic middle ground. The key improvement is replacing the 500ms waits, not eliminating all timing entirely.

### Step 4: Audit — Verify no other expect(true)/expect(false) patterns

**Already confirmed**: Grep found exactly 2 instances of `expect(true).toBeTruthy()` (lines 580, 583). No `expect(false)` found. No other meaningless assertions.

**Additional patterns to check** (for completeness during implementation):
```bash
# Run during implementation to double-check
grep -n 'expect(true)\|expect(false)\|toBeTruthy()\s*;$' tests/e2e/booking/booking-race-conditions.spec.ts
```

The `expect(concurrentError).toBeTruthy()` at line 653 is NOT meaningless — it's inside an `if (concurrentError)` guard where `concurrentError` is the actual check result.

### Step 5: Tighten critical test.skip guards

**Do NOT change**: The `test.skip(!listingUrl, ...)` guards. These are correct — the test seed data may not be present.

**Tighten these two** (add console warnings for CI observability):

1. **Line 182**: `test.skip(!canBookA || !canBookB, ...)` — Add `console.warn` before skipping:
```typescript
if (!canBookA || !canBookB) {
    console.warn(`[RC-01] Booking button visibility: A=${canBookA}, B=${canBookB}. Listing URL: ${listingUrl}`);
}
test.skip(!canBookA || !canBookB, 'Booking button not visible for one or both users');
```

2. **Line 494**: Same pattern for RC-06:
```typescript
if (!canA || !canB) {
    console.warn(`[RC-06] Booking button visibility: A=${canA}, B=${canB}. Listing URL: ${listingUrl}`);
}
test.skip(!canA || !canB, 'Booking button not visible');
```

**Rationale**: When tests skip in CI, the warnings appear in the log, making it visible whether the skip is due to missing data vs a real UI regression.

### Step 6: Verify no missing race condition scenarios

**Current coverage audit**:

| Scenario | Test | Status |
|----------|------|--------|
| Two users book simultaneously | RC-01 | ✅ Covered with real assertions |
| Overlapping date ranges | RC-02 | ✅ Covered with real assertions |
| Same user, same dates, duplicate | RC-03 | ✅ Covered — verifies error alert + text |
| Double-click submit | RC-04 | ✅ Covered — verifies single success |
| Accept + Cancel race (optimistic lock) | RC-05 | ✅ Covered — verifies no crashes |
| Last-slot booking race | RC-06 | ✅ Covered with real assertions |
| Expired session | RC-07 | ❌ **FIX IN STEPS 1-2** |
| Optimistic locking on status update | RC-08 | ✅ Covered — verifies no crashes + concurrent error handling |
| Idempotency key / retry | RC-09 | ✅ Covered — verifies key generation, persistence, cleanup |

**Missing scenarios** (from CLAUDE.md reliability rules):
- ❌ **Expired hold** — not covered in this file (may be in stability tests)
- ❌ **Rollback when downstream fails** — not covered (hard to E2E test, better as integration test)

**Recommendation**: Do NOT add new test scenarios in this PR. The scope is fixing existing broken assertions. The expired hold scenario should be tracked as a separate issue (it's partially covered in `stability-helpers.ts:createExpiredHold`).

---

## 5. Dependency Graph

```
Step 4 (audit) → independent, do first to confirm scope
Step 1 (fix line 580) → independent
Step 2 (fix line 583) → independent
Step 3 (harden selectDates) → independent (touches different lines)
Step 5 (tighten skips) → independent
All steps → Step 7 (verification)
```

Steps 1-5 can be done in any order. Steps 1 and 2 are in the same function block (RC-07 test) so they'll be in a single edit.

---

## 6. Harsh Critic Report

### Verdict: CONDITIONAL PASS

**🟠 MAJOR: selectDates `waitForFunction` may not work with all Radix versions**
- The `data-disabled` attribute during calendar transitions is Radix-version-specific
- **Mitigation**: The `.catch(() => {})` fallback ensures graceful degradation. If this proves flaky, replace with `page.waitForTimeout(100)` (still 2-5x better than current 250-500ms)

**🟡 MINOR: Line 580 branch may never execute in practice**
- If the booking form correctly gates on `isLoggedIn`, an anon user never sees the book button
- **Mitigation**: The assertion still adds value — if someone breaks the auth gate, this test catches it instead of silently passing

**🟡 MINOR: Console.warn in test.skip guards adds noise**
- **Mitigation**: Only fires when skip actually triggers; CI log filtering can suppress if needed

**⚪ NIT: Could use the existing `session-expiry-helpers.ts` for RC-07**
- The existing `expectLoginRedirect` helper is cleaner than inline checks
- **Decision**: Acceptable to use inline for now since RC-07 has a different flow (starts unauthenticated, doesn't expire mid-session)

---

## 7. Test Strategy & Verification

### Pre-implementation
```bash
# Confirm current test passes (baseline)
npx playwright test tests/e2e/booking/booking-race-conditions.spec.ts --reporter=list
```

### Post-implementation
```bash
# Run the specific test file
npx playwright test tests/e2e/booking/booking-race-conditions.spec.ts --reporter=list

# Run with retries to check for flakiness
npx playwright test tests/e2e/booking/booking-race-conditions.spec.ts --retries=3 --reporter=list

# Run just RC-07 in isolation
npx playwright test tests/e2e/booking/booking-race-conditions.spec.ts -g "RC-07" --reporter=list
```

### CI verification
- The test file already has `test.slow()` (3x timeout = 180s)
- Playwright config has `retries: 2` in CI
- After merge: monitor the first 3 CI runs for RC-07 specifically

### Success criteria
1. No `expect(true).toBeTruthy()` remaining in the file
2. RC-07 still passes in all 3 branches (login gate / book button / no UI)
3. `selectDates()` has zero `waitForTimeout` calls
4. `npx playwright test booking-race-conditions --retries=3` passes 3/3
5. No regression in other RC tests (RC-01 through RC-09)

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| selectDates waitForFunction flaky on slow CI | Medium | Medium | Fallback to 100ms fixed delay |
| Line 580 branch assertions too strict | Low | Low | Multiple OR conditions for flexible matching |
| Line 583 branch text content changes | Low | Low | Regex is broad: `/temporarily unavailable\|currently rented out\|not available/i` |
| Radix popover doesn't use `data-radix-popper-content-wrapper` | Very Low | Medium | Already verified via existing test code (same selector used elsewhere) |

---

## 9. Rollback Plan

All changes are in a single test file. Rollback = `git checkout HEAD -- tests/e2e/booking/booking-race-conditions.spec.ts`.

No production code, no DB changes, no schema changes. Risk is limited to test reliability.

---

## 10. Files Changed

| File | Lines | Change |
|------|-------|--------|
| `tests/e2e/booking/booking-race-conditions.spec.ts` | 29-72 | Replace `selectDates()` helper — remove 5 `waitForTimeout` calls |
| `tests/e2e/booking/booking-race-conditions.spec.ts` | 576-584 | Replace 2 `expect(true).toBeTruthy()` with real behavioral assertions |
| `tests/e2e/booking/booking-race-conditions.spec.ts` | ~182, ~494 | Add `console.warn` before `test.skip` for CI observability |

**Total diff**: ~60 lines changed in 1 file. No new files.

---

## 11. Open Questions

1. **Q**: Should we use the existing `expectLoginRedirect` helper from `session-expiry-helpers.ts` for the RC-07 line 580 fix?
   **Default**: No — RC-07 starts unauthenticated (no session to expire), so the flow is different from mid-session expiry. Inline assertions are clearer for this case.

2. **Q**: Should we add the "expired hold" race condition test (missing from the file)?
   **Default**: No — out of scope for this fix. Track as a separate issue. The `stability-helpers.ts` already has `createExpiredHold` infrastructure.
