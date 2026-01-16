# E2E Failure Triage Report

Generated: 2026-01-06

## Summary

| Browser       | Pass | Fail | Failure Rate |
| ------------- | ---- | ---- | ------------ |
| Chromium      | 139  | 36   | 20.6%        |
| Firefox       | 136  | 39   | 22.3%        |
| Mobile Chrome | 142  | 33   | 18.9%        |
| WebKit        | 102  | 60   | 37.0%        |
| Mobile Safari | 98   | 62   | 38.8%        |

**Total Failures**: 230 (across all browsers)

## Failure Categories

### Bucket A: Real Product Bugs (Low Priority)

Tests failing consistently due to application issues, not test fragility.

| Pattern                        | Count | Browsers          | Examples                                  | Evidence                       |
| ------------------------------ | ----- | ----------------- | ----------------------------------------- | ------------------------------ |
| Page loaded with error         | 3     | chromium, firefox | View messages inbox, Full user flow       | Server error on page load      |
| strict mode: multiple elements | 8     | all               | Unread badge navigation, Booking calendar | Ambiguous selectors in prod UI |

**Total Bucket A**: ~11 failures (5%)

### Bucket B: Test Fragility (High Priority)

Tests failing due to timing, selectors, or test implementation issues.

| Pattern                       | Count | Browsers                         | Examples                           | Root Cause                      |
| ----------------------------- | ----- | -------------------------------- | ---------------------------------- | ------------------------------- |
| toBeVisible failed            | 110   | all                              | Filter search, 404 page, Gallery   | Race conditions, element timing |
| locator.click timeout         | 9     | all                              | Validation errors, Form submission | Element not ready/visible       |
| locator.fill timeout          | 9     | all                              | Address geocoding                  | Form field timing               |
| locator.getAttribute timeout  | 6     | chromium, firefox, Mobile Chrome | Keyboard navigation                | Focus timing                    |
| waitForSelector timeout       | 5     | all                              | Radar attribution                  | Map load timing                 |
| toBeEmpty/toBeAttached failed | 5     | chromium, firefox                | Edit listing, ARIA landmarks       | DOM state timing                |

**Total Bucket B**: ~144 failures (63%)

### Bucket C: Infra/WebKit Issues (Medium Priority)

Tests failing due to infrastructure or WebKit-specific limitations.

| Pattern                    | Count | Browsers                       | Examples                        | Root Cause             |
| -------------------------- | ----- | ------------------------------ | ------------------------------- | ---------------------- |
| TLS handshake error        | 31    | WebKit, Mobile Safari          | View listing, Recently viewed   | WebKit TLS negotiation |
| waitForURL timeout         | 20    | WebKit, Mobile Safari, Firefox | Signup flow, Login flow         | Navigation timing      |
| toHaveURL failed           | 6     | WebKit, Mobile Safari          | Home page flow, Protected route | Navigation race        |
| page.goto timeout          | 3     | Mobile Safari                  | Saved searches                  | Network timeout        |
| Test not found in worker   | 3     | WebKit, Mobile Chrome, Safari  | SQL injection test              | Playwright infra bug   |
| locator.clear timeout      | 2     | WebKit, Mobile Safari          | Edit review                     | WebKit input handling  |
| Menu strict mode violation | 2     | WebKit, Mobile Safari          | Mobile navigation               | WebKit DOM differences |

**Total Bucket C**: ~67 failures (29%)

### Unresolved (3%)

| Pattern            | Count | Evidence                 |
| ------------------ | ----- | ------------------------ |
| toEqual deep       | 4     | Console error assertions |
| Connection refused | 1     | Mobile Safari flaky      |

## Key Insights

1. **Tier 1 (Chromium + Firefox)**: Similar failure rates (~20-22%), tests failing here are genuine issues
2. **Tier 2 (WebKit + Mobile Safari)**: 37-39% failure rate - significantly higher
3. **No WebKit-only failures**: All WebKit failures also fail on at least one other browser
4. **Top Priority Fix**: `toBeVisible` timing issues (110 failures, 48% of all failures)

## Recommended Actions

### Immediate (Phase 1-2)

1. Add `@smoke` tag to 10-20 critical path tests with high stability
2. Configure CI: Tier 1 blocking, Tier 2 continue-on-error
3. Create sharded parallel runs for Tier 1

### Short-term (Phase 3)

1. Add `waitForStableUI()` helper to wait for animations/loading
2. Create `tapOrClick()` helper for mobile-safe interactions
3. Add `scrollAndInteract()` for viewport-dependent elements
4. Add explicit waits before visibility assertions

### Medium-term (Phase 4)

1. Add `ignoreHTTPSErrors: true` for WebKit projects
2. Consider separate WebKit timeout configuration
3. Track flaky tests with `@flaky` tag

## Tests to Tag as @smoke (Suggested)

Based on stability (passing on Tier 1) and business criticality:

1. J001: Home page discovery flow
2. J002: Search with filters
3. J003: View listing details
4. J004: User signup/login flow
5. J005: Create listing basic flow
6. J006: Send/receive message
7. J007: Save favorite listing
8. J010: Profile update
9. Nearby: Map loads and displays markers
10. Auth: Protected route redirects
