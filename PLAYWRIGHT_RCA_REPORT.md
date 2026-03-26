# Playwright CI Failure — Root Cause Analysis Report

**Date:** 2026-03-25
**Analyzed runs:** 23554403679, 23524954908, 23522964984, 23522253529, 23521550134, 23521425373, 23521199890, 23521199880 (failed); 23523894091, 23523239686 (passed)
**Team consensus:** UNANIMOUS (all 4 agents approved with refinements incorporated)
**Suite pass rate:** 15% (2/13 E2E test runs pass)

---

## Executive Summary

The Playwright E2E suite is failing at an 85% rate. The dominant root cause (~50-60% of failures) is **duplicate DOM elements in production builds** caused by React 19 + Next.js streaming SSR hydration, which was pre-existing as a flaky issue but made deterministic by the editorial-living-room redesign (PR #68, commit `8404c9f3`). A secondary cluster (~20% of failures) comes from **test infrastructure gaps** — most critically, the `/api/test-helpers` endpoint is silently disabled in CI because a `NODE_ENV !== "production"` guard blocks it in production builds. The remaining ~15-20% are **timing-sensitive tests** with hard-coded waits and polling race conditions. Fixing RC-1a (hydration duplication) and RC-2 (test-helpers guard) would bring the suite pass rate from ~15% to an estimated ~60-70%.

---

## Root Causes (ordered by impact — highest first)

### RC-1a: Duplicate DOM Elements — SSR/Hydration Duplication

- **Category:** APPLICATION_BUG + FRAMEWORK_BEHAVIOR
- **Impact:** 5+ selectors, ~50% of all test failures, affects every run since editorial redesign
- **Evidence:**
  - `strict mode violation: locator('#bio') resolved to 2 elements` — deterministic in runs 23554403679 (Shard 3, 7), 23524954908 (Shard 2, 7), 23522964984 (Shard 7)
  - `strict mode violation: locator('#currentPassword') resolved to 2 elements` — deterministic in runs 23554403679 (Shard 4), 23524954908 (Shard 7)
  - `strict mode violation: locator('[data-testid="filter-tabs"]') resolved to 2 elements` — in run 23524954908 (Shard 5)
  - `strict mode violation: getByText('Build trust by verifying your identity')` — run 23554403679 (Shard 1), run 23522253529 (Shard 4, Mobile Chrome)
  - Pre-editorial run 23412337032 had `#bio` strict mode violation as **flaky** (passed on retry). Post-editorial it became **deterministic** (fails all retries).
- **Affected tests:**
  - `tests/e2e/profile/profile-edit.spec.ts` — PE-05 (update bio), PE-06 (bio counter)
  - `tests/e2e/settings/settings.spec.ts` — ST-02 (4 settings sections)
  - `tests/e2e/verify/verify.spec.ts` — VF-02 (page header), VF-03 (verified badge)
  - `tests/e2e/search-filters/*.anon.spec.ts` — filter-tabs dependent tests
  - `tests/e2e/homepage/homepage.spec.ts` — HP-11 (user menu)
  - `tests/e2e/mobile/mobile-profile.spec.ts:72` — MP-04 (edit-profile-form resolves to 2 elements)
  - `tests/e2e/journeys/23-review-lifecycle.spec.ts:114` — J29 (search-results-container resolves to 2 elements)
- **Confidence:** HIGH — confirmed by ci-investigator (log evidence across 8 runs), log-analyst (error classification), codebase-analyst (source code tracing shows single-mount components), flakiness-detective (reliability matrix)
- **Agent agreement:** All 4 agents confirmed. Mechanism refined through challenge phase:
  - Codebase-analyst traced source code: `#bio` (EditProfileClient.tsx:371), `#currentPassword` (SettingsClient.tsx:291), verify text (verify/page.tsx:37) — each rendered exactly ONCE. No responsive dual-rendering exists.
  - CI-investigator found the issue was flaky pre-editorial (run 23412337032), then deterministic post-editorial — the editorial commit aggravated a pre-existing framework behavior.
  - Flakiness-detective confirmed both chromium (38 instances) and Mobile Chrome (28 instances) are equally affected, ruling out mobile-specific CSS show/hide theory.
  - **Root cause hypothesis:** React 19 (v19.2.0) + Next.js 16 production streaming SSR hydration briefly renders both Suspense fallback and resolved content simultaneously, creating duplicate DOM nodes with the same IDs. The editorial-living-room redesign (PR #68) changed component CSS classes and layout structure, likely altering Suspense boundary timing to make the transient duplication permanent in CI.
  - **Uncertainty:** The exact Suspense boundary or loading.tsx file causing the duplication has not been definitively identified. The `NotificationsSkeleton` was ruled out (does not contain `data-testid="filter-tabs"`). Further investigation needed.

### RC-1b: Duplicate DOM Elements — Test Data Collision

- **Category:** TEST_BUG
- **Impact:** 1 test, deterministic
- **Evidence:** `strict mode violation: getByText('E2E Reviewer') resolved to 2 elements` on listing detail page
- **Affected tests:** `tests/e2e/listing-detail/listing-detail.spec.ts` — review-related assertions
- **Confidence:** HIGH — codebase-analyst traced to `ListingPageClient.tsx:559` (host section) and `ReviewList.tsx:57` (review author). The E2E seed creates a user named "E2E Reviewer" who is both the listing host AND a reviewer. The name legitimately appears in two different page sections.
- **Agent agreement:** All 4 agents confirmed. This is a test data design issue, not an application bug.

### RC-1c: Duplicate DOM Elements — Multiple Navigation Mount Points

- **Category:** TEST_BUG / APPLICATION_BUG (disputed — see Dissenting Opinions)
- **Impact:** 1-2 tests, deterministic on search page
- **Evidence:** `strict mode violation: getByRole('link', { name: /^profile$/i }) resolved to 2 elements`
- **Affected tests:** `tests/e2e/homepage/homepage.spec.ts` — HP-11 (user menu profile link)
- **Confidence:** HIGH — codebase-analyst found 4 separate "Profile" link sources across navigation components: NavbarClient desktop dropdown, NavbarClient mobile menu, SearchHeaderWrapper user menu, UserMenu component. On the search page, both NavbarClient (root layout) and SearchHeaderWrapper (search layout) are mounted.
- **Agent agreement:** All 4 agents confirmed. The SearchHeaderWrapper.tsx +356-line change in the editorial commit likely introduced a duplicate user menu. Codebase-analyst notes this is the only RC-1 sub-cause directly attributable to the editorial commit's structural changes.

### RC-2: Test Infrastructure Gaps

- **Category:** ENVIRONMENT_MISMATCH + APPLICATION_BUG
- **Impact:** 3-5 tests, deterministic, high ROI fixes
- **Evidence:**
  - **Test-helpers API blocked:** `src/app/api/test-helpers/route.ts:13-18` has guard `process.env.NODE_ENV !== "production"`. CI runs `next build` + `next start` (forces `NODE_ENV=production`), so the endpoint returns 404 despite `E2E_TEST_HELPERS=true`. Confirmed by ci-investigator and codebase-analyst independently.
  - **Session expiry redirect broken (APPLICATION_BUG):** Tests SE-FM04 and SE-N05 expect redirect to `/login` after session expiry, but URL stays at `/settings`. Error: `expect(page.url()).toContain('/login')` fails. SE-N05 in run 23524954908 (Shard 8), SE-FM04 in run 23522253529 (Shard 4). CI-investigator confirmed `SESSION_EXPIRED` redirect is implemented in `MessagesPageClient.tsx` and `BookingForm.tsx` but **NOT** in `SettingsClient.tsx` or edit listing pages — this is a genuine application security gap, not just a test issue.
  - **Seed/migration failure (RESOLVED):** Runs 23521199880 and 23521199890 had ALL tests fail due to `PrismaClientKnownRequestError` — `User.passwordChangedAt` column referenced before migration ran. Fixed by commit `634e2905`.
  - **CDP cross-browser time bomb (LATENT):** `tests/e2e/map-interactions-edge.anon.spec.ts:191,229` uses `page.context().newCDPSession(page)` — Chromium-only API. This file matches `.anon.spec.ts` pattern, which runs on firefox-anon and webkit-anon projects. Will crash deterministically on those browsers.
- **Affected tests:**
  - `tests/e2e/booking/booking-host-actions.spec.ts` — "Test API not available" (5 sub-tests blocked)
  - `tests/e2e/stability/stability-contract.spec.ts` — test helper API calls return 404
  - `tests/e2e/settings/settings.spec.ts` — SE-FM04, SE-N05 (session expiry)
  - `tests/e2e/map-interactions-edge.anon.spec.ts` — CDP (latent, not yet failing)
- **Confidence:** HIGH for test-helpers API (exact code location confirmed). MEDIUM for session expiry (could be APPLICATION_BUG in auth middleware or TEST_BUG in test assumptions).
- **Agent agreement:** All 4 agents confirmed. CI-investigator discovered the NODE_ENV root cause. Codebase-analyst confirmed the code location. Log-analyst and flakiness-detective agree this should be prioritized over timing issues due to deterministic nature and low fix effort.

### RC-3: Timing-Sensitive Tests — Polling and Hard-Coded Waits

- **Category:** RACE_CONDITION + TIMEOUT
- **Impact:** 3-6 tests, flaky (20-80% pass rate)
- **Evidence:**
  - **Messaging polling (RT-F02):** `tests/e2e/messaging/messaging-realtime.spec.ts` — `waitFor` with 30s timeout for new message element. Fails in Shard 2 across 3 different runs. 12 `waitForTimeout` calls in messaging tests. ~20% pass rate.
  - **Touch interaction timeout:** `tests/e2e/mobile-interactions.anon.spec.ts` — `locator.tap` timeout after 15s. Bottom sheet expand/collapse buttons not tappable. Codebase-analyst found `_disableAnimations` fixture may not fully work with framer-motion.
  - **Search hydration timing (J16):** `waitFor` polling for input value after search page navigation. ~60% pass rate. Hydration timing differs between dev and production builds.
  - **Booking lifecycle refresh (J23):** `toBeTruthy` fails for booking state after cancellation. ~40% pass rate. Likely race between server state update and client poll.
  - **Performance budget (search-interaction-perf):** Latency over budget. ~50% pass rate. CI runners have variable performance.
  - **Listing detail share (LD-08):** Share dropdown not visible after click. ~60% pass rate. UI timing issue.
- **Affected tests:**
  - `tests/e2e/messaging/messaging-realtime.spec.ts:RT-F02`
  - `tests/e2e/mobile-interactions.anon.spec.ts` (touch-interactions)
  - `tests/e2e/search-journeys.spec.ts:J16`
  - `tests/e2e/booking/booking-lifecycle.spec.ts:J23`
  - `tests/e2e/performance/search-interaction-perf.spec.ts`
  - `tests/e2e/listing-detail/listing-detail.spec.ts:LD-08`
- **Confidence:** HIGH for RT-F02 (consistent failure pattern). MEDIUM for others (flaky by nature, harder to pin down).
- **Agent agreement:** All 4 agents confirmed timing issues exist. Log-analyst refined: RT-F02 is likely APPLICATION_BUG (messaging delivery not working) rather than pure race condition. Codebase-analyst identified systemic anti-patterns: 391 `waitForTimeout` calls across 105 files, 338 `page.evaluate()` calls bypassing auto-wait, 309 `test.slow()` calls masking performance issues.

### RC-4: Server Resource Exhaustion (Transient)

- **Category:** RESOURCE_STARVATION
- **Impact:** 2+ tests, transient (1 run)
- **Evidence:** `net::ERR_ABORTED` errors in run 23524954908 — server returned 503/connection dropped. Not reproduced in other runs.
- **Affected tests:** Variable — any test hitting the server during resource pressure
- **Confidence:** LOW — single occurrence, may be GitHub Actions runner instability
- **Agent agreement:** CI-investigator confirmed. Flakiness-detective and log-analyst agree this is transient and low priority. No action needed unless it recurs.

---

## Flakiness Assessment

| Test File | Test Name | Pass Rate (est.) | Classification | Root Cause |
|-----------|-----------|-----------------|----------------|------------|
| profile-edit.spec.ts | PE-05 (update bio) | 0% post-editorial | Always broken | RC-1a (hydration) |
| profile-edit.spec.ts | PE-06 (bio counter) | 0% post-editorial | Always broken | RC-1a (hydration) |
| settings.spec.ts | ST-02 (4 sections) | 0% post-editorial | Always broken | RC-1a (hydration) |
| verify.spec.ts | VF-02 (page header) | 0% post-editorial | Always broken | RC-1a (hydration) |
| verify.spec.ts | VF-03 (verified badge) | 0% post-editorial | Always broken | RC-1a (hydration) |
| homepage.spec.ts | HP-11 (user menu) | 0% post-editorial | Always broken | RC-1c (nav links) |
| listing-detail.spec.ts | review assertions | 0% | Always broken | RC-1b (test data) |
| booking-host-actions.spec.ts | all sub-tests | 0% in CI | Always broken | RC-2 (NODE_ENV guard) |
| settings.spec.ts | SE-FM04, SE-N05 | 0% | Always broken | RC-2 (session expiry) |
| mobile-interactions.anon.spec.ts | touch expand/collapse | 0% | Always broken | RC-3 (animation/tap) |
| messaging-realtime.spec.ts | RT-F02 | ~20% | Flaky | RC-3 (polling timeout) |
| booking-lifecycle.spec.ts | J23 | ~40% | Flaky | RC-3 (state refresh) |
| search-interaction-perf.spec.ts | latency budget | ~50% | Flaky | RC-3 (CI perf variance) |
| search-journeys.spec.ts | J16 | ~60% | Flaky | RC-3 (hydration timing) |
| listing-detail.spec.ts | LD-08 (share) | ~60% | Flaky | RC-3 (UI timing) |
| pagination-core.spec.ts | 3.1 (cap message) | ~70% | Flaky | RC-3 (data volume) |

---

## Environment Delta Analysis

| Setting | Local | CI | Impact |
|---------|-------|-----|--------|
| Server mode | `pnpm dev` (HMR, dev errors) | `next build` + `next start` (production) | Different SSR hydration, error pages, streaming behavior |
| NODE_ENV | `development` | `production` | **Blocks `/api/test-helpers` endpoint** |
| baseURL | `http://localhost:3000` | `http://127.0.0.1:3000` | IPv4-first DNS forced in config — mitigated |
| Turnstile | Enabled (test keys) | `TURNSTILE_ENABLED=false` | Different auth code paths |
| Rate limiting | Active | `E2E_DISABLE_RATE_LIMIT=true` | Different API behavior |
| Workers | 3 | 1 | Sequential execution in CI |
| Retries | 0 | 2 | Flaky tests masked locally |
| Browsers run | All 10 projects | 6 projects (chromium, chromium-admin, chromium-anon, Mobile Chrome, firefox-anon, webkit-anon) | firefox auth, webkit auth, Mobile Safari skipped in CI |
| Sharding | None | 10 shards | Test distribution varies per run |
| Node.js | User's version | v20 | Potential mismatch if local differs |
| Playwright | ^1.58.2 | ^1.58.2 (cached by version) | Consistent |

---

## Recommended Fix Plan (ordered by ROI)

### Fix 1: Remove NODE_ENV guard from test-helpers API — addresses RC-2

- **What to change:** In `src/app/api/test-helpers/route.ts:13-18`, change the `isEnabled()` function:
  ```typescript
  // Before (broken in CI):
  function isEnabled(): boolean {
    return (
      process.env.E2E_TEST_HELPERS === "true" &&
      process.env.NODE_ENV !== "production"
    );
  }

  // After (works in CI — still gated by E2E_TEST_HELPERS + E2E_TEST_SECRET):
  function isEnabled(): boolean {
    return process.env.E2E_TEST_HELPERS === "true";
  }
  ```
- **Why this fixes it:** The endpoint is already protected by `E2E_TEST_HELPERS` env var and `E2E_TEST_SECRET` header validation. The `NODE_ENV` check is redundant and actively blocks the endpoint in CI where `next start` forces `NODE_ENV=production`. Removing it unblocks all booking/stability tests that depend on `testApi()`.
- **Risk:** Low — the endpoint is still gated by two other checks. Ensure `E2E_TEST_HELPERS` is never set in actual production.
- **Estimated effort:** S (one-line change)
- **Tests to verify fix:** booking-host-actions.spec.ts, stability-contract.spec.ts

### Fix 2: Investigate and fix SSR hydration duplication — addresses RC-1a

- **What to change:** This requires investigation. Recommended approach:
  1. Run the production build locally: `pnpm build && E2E_BASE_URL=http://127.0.0.1:3000 pnpm start`
  2. Open Chrome DevTools on `/profile/edit`, `/settings`, `/verify` pages
  3. Search for duplicate `#bio`, `#currentPassword` elements in the DOM
  4. If duplicates found: trace which Suspense boundary or layout.tsx is causing dual rendering
  5. Fix: Either (a) ensure loading.tsx skeletons don't duplicate IDs from resolved components, (b) restructure Suspense boundaries to prevent fallback+content coexistence, or (c) use `useId()` for dynamic IDs
  6. If duplicates NOT found in DevTools (transient): Add `page.waitForLoadState('networkidle')` or a custom hydration-complete signal in tests before asserting on elements
- **Why this fixes it:** Eliminates the dominant failure mode (50%+ of all failures). The editorial commit (8404c9f3) made a pre-existing flaky hydration issue deterministic. Simply reverting the editorial changes would return to a flaky state, not fix the underlying problem.
- **Risk:** Medium — hydration behavior is framework-level. Changes could affect SSR performance or cause visual flash.
- **Estimated effort:** M-L (investigation needed, may require framework-level changes)
- **Tests to verify fix:** profile-edit PE-05/PE-06, settings ST-02, verify VF-02/VF-03, filter-tabs tests

### Fix 3: Fix test data collision for "E2E Reviewer" — addresses RC-1b

- **What to change:** In the E2E seed data, use different names for the host and reviewer on test listings. Or change the test selector from `getByText('E2E Reviewer')` to `getByText('Hosted by E2E Reviewer')` (scoped to the host section).
- **Why this fixes it:** The same user being both host and reviewer causes the name to appear twice legitimately. Using a more specific selector or different seed data eliminates the ambiguity.
- **Risk:** Low — isolated change to test data or test selectors.
- **Estimated effort:** S
- **Tests to verify fix:** listing-detail.spec.ts review assertions

### Fix 4: Scope navigation selectors for "Profile" link — addresses RC-1c

- **What to change:** In tests using `getByRole('link', { name: /^profile$/i })`, scope the locator to the visible navigation context:
  ```typescript
  // Before (matches multiple nav components):
  page.getByRole('link', { name: /^profile$/i })

  // After (scoped to specific nav):
  page.locator('nav[aria-label="Main"]').getByRole('link', { name: /^profile$/i })
  // Or:
  page.getByRole('link', { name: /^profile$/i }).first()
  ```
- **Why this fixes it:** Multiple navigation components (NavbarClient, SearchHeaderWrapper) each contain a "Profile" link. Scoping to the visible nav eliminates ambiguity.
- **Risk:** Low — test-only change.
- **Estimated effort:** S
- **Tests to verify fix:** homepage HP-11

### Fix 5: Guard CDP usage for Chromium-only execution — addresses RC-2 (latent)

- **What to change:** In `tests/e2e/map-interactions-edge.anon.spec.ts`, wrap CDP calls with browser detection:
  ```typescript
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP is Chromium-only');
  ```
- **Why this fixes it:** `newCDPSession` is a Chromium-only API. The test file matches `.anon.spec.ts` which runs on firefox-anon and webkit-anon projects. This will crash on those browsers.
- **Risk:** Low — reduces test coverage on Firefox/WebKit for this specific test, but the test cannot work there anyway.
- **Estimated effort:** S
- **Tests to verify fix:** map-interactions-edge.anon.spec.ts on firefox-anon and webkit-anon

### Fix 6: Increase messaging polling timeout or redesign — addresses RC-3

- **What to change:** In `tests/e2e/messaging/messaging-realtime.spec.ts`, either:
  - Increase the polling timeout from 30s to 60s (quick fix)
  - Replace polling with `page.waitForResponse()` on the messaging API endpoint (proper fix)
  - Remove 12 `waitForTimeout` calls and use proper Playwright auto-waiting
- **Why this fixes it:** The messaging realtime test (RT-F02) has an ~80% failure rate in CI due to polling timing. The 30s timeout is insufficient for CI where server response times are longer.
- **Risk:** Low for timeout increase. Medium for redesign (need to understand the messaging API flow).
- **Estimated effort:** S (timeout increase) or M (redesign)
- **Tests to verify fix:** messaging-realtime.spec.ts RT-F02

### Fix 7: Address session expiry redirect — addresses RC-2

- **What to change:** Investigate why session expiry does not trigger redirect to `/login`. Check:
  - Auth middleware at `src/middleware.ts` for session expiry handling
  - NextAuth configuration for session invalidation behavior
  - Whether the redirect works in dev mode but not production mode
- **Why this fixes it:** Tests SE-FM04 and SE-N05 expect redirect to `/login` after session expiry. If the redirect genuinely doesn't work, this is an application bug. If the test assumptions are wrong (session expiry works differently), the tests need updating.
- **Risk:** Medium — could be an auth middleware bug that also affects real users.
- **Estimated effort:** M (investigation needed)
- **Tests to verify fix:** settings.spec.ts SE-FM04, SE-N05

---

## Systemic Anti-Patterns (long-term health)

These are not direct causes of current failures but create ongoing flakiness risk:

| Anti-Pattern | Count | Files | Impact |
|--------------|-------|-------|--------|
| `waitForTimeout` (hard-coded waits) | 391 | 105 | Primary flakiness vector — fragile timing assumptions |
| `page.evaluate()` bypassing auto-wait | 338 | 82 | Loses Playwright's auto-waiting guarantees |
| `test.slow()` tripling timeout to 180s | 309 | 164 | Masks performance issues, wastes CI time |
| `test.skip` / `test.fixme` | 1,173 | 132 | Massive test debt — 1,173 known-broken scenarios |
| `.first()` workaround for strict mode | 104 | — | Masks duplicate DOM issues instead of fixing them |

---

## Shard Failure Distribution

| Shard | Failures / 13 runs | Failure Rate | Primary Cause |
|-------|-------------------|-------------|---------------|
| Shard 2 | 8 | 62% | RC-1a (profile-edit, verify, settings tests) |
| Shard 7 | 8 | 62% | RC-1a (profile-edit, homepage tests) |
| Shard 4 | 6 | 46% | RC-1a + RC-2 (settings, session expiry) |
| Shard 5 | 5 | 38% | RC-1a + RC-2 (verify, filter-tabs) |
| Shard 3 | 3 | 23% | RC-1a (profile-edit, flaky) |
| Shard 6 | 2 | 15% | RC-3 (messaging polling) |
| Shard 8 | 2 | 15% | RC-3 (timing issues) |
| Shard 1 | 1 | 8% | RC-3 (search hydration) |
| Shard 9 | 0 | 0% | Clean |
| Shard 10 | 0 | 0% | Clean |

---

## Dissenting Opinions

### On RC-1a mechanism (partially resolved)

**log-analyst** raised that the report should present both hypotheses for the duplicate DOM mechanism:
1. **Suspense hydration hypothesis** (codebase-analyst): Single-mount components appear twice during streaming SSR hydration in production builds. Supported by: source code shows single render, flakiness on desktop chromium (transient duplication).
2. **Layout structural change hypothesis** (flakiness-detective): The editorial redesign introduced actual structural duplication. Supported by: pre-editorial was flaky, post-editorial is deterministic, suggesting a permanent rendering change.

**Resolution:** Both may be partially correct. The underlying React 19/Next.js hydration behavior creates transient duplicates. The editorial redesign's CSS/structure changes made the transient duplication permanent or extended the window long enough for tests to always hit it. The report presents both hypotheses and recommends investigation (Fix 2) to determine the exact mechanism.

### On RC-1b/RC-1c classification

**flakiness-detective** classifies all strict mode violations as APPLICATION_BUG — the production app genuinely renders duplicate DOM elements, and tests correctly detect this. Adding `.first()` workarounds would mask a real production accessibility issue (duplicate form fields, duplicate navigation links, duplicate HTML IDs violate the spec).

**log-analyst** and **codebase-analyst** classify RC-1b (test data collision) and RC-1c (multiple nav links) as TEST_BUG — the "E2E Reviewer" duplication is a seed data issue, and multiple "Profile" links across nav components may be intentional design (mobile + desktop nav).

**Resolution:** The report marks RC-1b as TEST_BUG (seed data can be changed without production impact) and RC-1c as TEST_BUG / APPLICATION_BUG (the test selector should be scoped, but having 4 "Profile" links in the DOM is also a UX/accessibility concern worth reviewing).

### On RC-2 vs RC-3 priority

**log-analyst** and **ci-investigator** argue RC-2 (test infrastructure gaps) should rank higher than RC-3 (timing issues) because infrastructure gaps are deterministic, easier to fix, and higher ROI. **Codebase-analyst** keeps the original order but approves either ranking. **Flakiness-detective** keeps the original order.

**Resolution:** The report uses the log-analyst/ci-investigator ranking (RC-2 before RC-3) based on the ROI argument — deterministic failures with easy fixes should be prioritized over flaky tests with harder fixes.

---

## Raw Data Appendix

### Failed Run URLs
- https://github.com/Suryateja-byte/Roomshare/actions/runs/23554403679 (test/booking-e2e-gaps)
- https://github.com/Suryateja-byte/Roomshare/actions/runs/23524954908 (main)
- https://github.com/Suryateja-byte/Roomshare/actions/runs/23522964984 (feat/editorial-living-room, attempt 4)
- https://github.com/Suryateja-byte/Roomshare/actions/runs/23522253529 (feat/editorial-living-room)
- https://github.com/Suryateja-byte/Roomshare/actions/runs/23521550134 (feat/editorial-living-room)
- https://github.com/Suryateja-byte/Roomshare/actions/runs/23521425373 (fix/booking-deep-review, attempt 3)
- https://github.com/Suryateja-byte/Roomshare/actions/runs/23521199890 (fix/booking-deep-review, smoke)
- https://github.com/Suryateja-byte/Roomshare/actions/runs/23521199880 (fix/booking-deep-review, E2E)

### Passing Run URLs (for comparison)
- https://github.com/Suryateja-byte/Roomshare/actions/runs/23523894091 (main — passed)
- https://github.com/Suryateja-byte/Roomshare/actions/runs/23523239686 (fix/booking-deep-review — passed)

### Key Error Messages (deduplicated)
1. `strict mode violation: locator('#bio') resolved to 2 elements` (profile-edit)
2. `strict mode violation: locator('#currentPassword') resolved to 2 elements` (settings)
3. `strict mode violation: getByText('Build trust by verifying your identity') resolved to 2 elements` (verify)
4. `strict mode violation: locator('[data-testid="filter-tabs"]') resolved to 2 elements` (search filters)
5. `strict mode violation: getByRole('link', { name: /^profile$/i }) resolved to 2 elements` (homepage)
6. `strict mode violation: getByText('E2E Reviewer') resolved to 2 elements` (listing detail)
7. `Test API not available. Start the server with E2E_TEST_HELPERS=true` (booking-host-actions)
8. `expect(received).toContain('/login') — received: 'http://127.0.0.1:3000/settings'` (session expiry)
9. `Timeout 30000ms exceeded. locator('text=New message from') not found` (messaging polling)
10. `locator.tap: Timeout 15000ms exceeded` (touch interactions)
11. `net::ERR_ABORTED` (resource exhaustion, transient)
12. `PrismaClientKnownRequestError: column User.passwordChangedAt does not exist` (seed failure, resolved)

### Commit History of Breaking Changes
- `fd7c06b2` — feat: redesign search + listing pages (earliest editorial change, on feat/editorial-living-room branch)
- `4b0228c9` — feat: redesign remaining pages (editorial, structural changes)
- `729ea6bf` — feat: mobile responsive polish (editorial)
- `3da526fa`, `a00d4a21`, `937b21ca` — partial fix attempts (incomplete)
- `8404c9f3` — merge of editorial-living-room to main (PR #68, made hydration duplication deterministic)
- `c682e530` — test(booking): add 15 E2E tests (introduced booking-host-actions tests that depend on test-helpers API)
- `634e2905` — fix: seed migration issue (resolved RC-8 Prisma schema mismatch)

---

## Agent Approvals

### ci-investigator — APPROVED
> I approve this report. The evidence base is solid across all four investigations. Key refinement incorporated: RC-1 pre-existed as flaky before the editorial commit and was made deterministic by it. The fix strategy correctly targets the underlying hydration issue rather than just reverting the editorial changes.

### log-analyst — APPROVED
> I approve this report with the RC-1 sub-mechanism breakdown (RC-1a/1b/1c) and the RC-2/RC-3 priority swap. The core findings are accurate and actionable. Key contribution: the distinction between 1 root cause → many symptoms vs independent root causes is properly reflected.

### codebase-analyst — APPROVED
> I approve this report. The attribution of RC-1 correctly distinguishes between editorial-commit-caused issues (profile links, SearchHeaderWrapper) and other causes (test data, hydration). The test-helpers NODE_ENV guard fix (Fix 1) is the highest-ROI action item. The systemic anti-patterns section accurately reflects the codebase analysis.

### flakiness-detective — APPROVED
> I approve this report. The reliability matrix and shard distribution data are accurately represented. Key contribution: the pre-editorial flaky evidence (run 23412337032) and the retry analysis showing strict-mode violations never recover (0% retry recovery rate) are correctly incorporated. The dissenting opinion on APPLICATION_BUG vs TEST_BUG classification is fairly represented.
