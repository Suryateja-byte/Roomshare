# Contact Host Browser Matrix Goal Progress

Date: 2026-05-11

Goal: close, reduce, or precisely block the Contact Host full browser matrix P1
gap with exact browser evidence.

## Checklist

- [x] Create or update this progress file with checklist and progress notes.
- [x] Audit `runtime-verification.md`, `11-test-traceability-matrix.md`,
  `12-gaps-unknowns-and-questions.md`, and
  `../documentation-inventory.md` for exact full browser matrix P1 wording.
- [x] Identify the focused Contact Host browser specs that should make up the
  matrix, especially listing-detail/contact-host runtime and messaging
  conversation specs.
- [x] Inspect Playwright config/projects to determine available browsers/projects:
  Chromium, Firefox, WebKit, Mobile Chrome, and any configured mobile/tablet
  projects.
- [x] Run the narrowest matrix first: focused Contact Host specs on missing
  browser projects.
- [x] If a browser is unavailable or install/setup is unsafe, document the exact
  blocker.
- [x] If tests fail, classify as product bug, test/setup issue,
  browser-specific assertion issue, fixture issue, or environment issue.
- [x] Apply only narrow test/setup fixes unless production behavior is proven
  wrong and explicitly approved.
- [x] Update Contact Host docs: `evidence-register.md`,
  `runtime-verification.md`, `verification.json`,
  `11-test-traceability-matrix.md`, `12-gaps-unknowns-and-questions.md`,
  `README.md` if status changes, `manifest.json` if test inventory changes,
  and `docs/features/documentation-inventory.md`.
- [x] Run JSON parse validation for `verification.json` and `manifest.json`.
- [x] Run `git diff --check` for touched files.
- [x] Run stale wording scan for old "full browser matrix unverified" language.
- [x] Final report states whether the browser matrix P1 is closed, reduced, or
  blocked.

## Configured Projects

Source: `playwright.config.ts`.

- Setup/support: `setup`
- Search-only harness projects: `desktop-anonymous`, `desktop-authenticated`,
  `mobile-anonymous`, `mobile-authenticated`, `failure-mocked`
- Focused Contact Host browser matrix projects: `chromium`, `firefox`,
  `webkit`, `Mobile Chrome`, `Mobile Safari`
- Anonymous/search-only projects: `chromium-anon`, `firefox-anon`,
  `webkit-anon`
- Commented/disabled: `chromium-admin`

The applicable matrix for the focused non-search Contact Host specs is
`chromium`, `firefox`, `webkit`, `Mobile Chrome`, and `Mobile Safari`.
Chromium already has current evidence in the existing documentation, so this
run prioritizes missing Firefox, WebKit, Mobile Chrome, and Mobile Safari
evidence first.

## Focused Specs

- `tests/e2e/listing-detail/contact-host-runtime.spec.ts`
  - Listing-detail contact-first CTA, checkout return / mocked paid unlock,
    paywall-required state, unavailable/migration/moderation disabled states,
    and anonymous sign-in CTA.
- `tests/e2e/journeys/22-messaging-conversations.spec.ts`
  - Existing thread send, listing-detail-to-contact-host-to-messages journey,
    and messages inbox/empty state.

## Audited P1 Wording

Before CH-E063 and CH-E065, the current-status docs listed the focused
Firefox/WebKit/mobile matrix as missing. Those statements are now superseded by
focused WebKit/Mobile Chrome/Mobile Safari pass evidence in CH-E063 and focused
Firefox pass evidence in CH-E065. Remaining matrix language is scoped to
broader non-focused/provider gaps; the practical combined Firefox two-spec run
now passes after CH-E065.

## Attempt Log

- `pnpm exec playwright test tests/e2e/listing-detail/contact-host-runtime.spec.ts --project=firefox --workers=1 --reporter=list`
  - Result: FAIL before app behavior.
  - Setup: global setup and reviewer auth setup ran; Playwright began 11 tests.
  - Exact blocker: `browserType.launch: Executable doesn't exist at /home/surya/.cache/ms-playwright/firefox-1511/firefox/firefox`; Playwright suggested `pnpm exec playwright install`.
  - Classification: environment/browser-install blocker, not product behavior,
    fixture behavior, or browser-specific assertion behavior.
  - Follow-up: do not install browsers in this task; continue with other
    configured projects to reduce the matrix if available.
- `pnpm exec playwright test tests/e2e/listing-detail/contact-host-runtime.spec.ts --project=webkit --workers=1 --reporter=list`
  - Result: FAIL after exercising expected listing-detail UI states.
  - Setup: global setup and reviewer auth setup ran; WebKit launched and began
    11 tests.
  - Failure summary: 5 failed. Representative failed contexts showed the
    expected checkout banner/dialog or unavailable warning/no-CTA UI, but
    `browserErrors.expectClean()` failed on `Failed to preconnect to
    https://qolpgfdmkqvxraafucvu.supabase.co/. Error: Error resolving
    "qolpgfdmkqvxraafucvu.supabase.co": Name or service not known`.
  - Classification: test/setup environment noise from WebKit DNS preconnect for
    Supabase, not product behavior, fixture behavior, or a browser-specific UI
    assertion failure.
  - Narrow fix applied: filter this exact Supabase preconnect DNS noise from
    `actionableBrowserErrors` in
    `tests/e2e/listing-detail/contact-host-runtime.spec.ts`.
- `pnpm exec playwright test tests/e2e/listing-detail/contact-host-runtime.spec.ts --project=webkit --workers=1 --reporter=list`
  - Result after narrow filter: FAIL, reduced to 1 failing test.
  - Failure summary: checkout-return test timed out waiting for
    `getByTestId("contact-host-sidebar")`; artifact showed the listing body but
    no sidebar at the first checkout-return assertion.
  - Classification: test/setup timing/settling issue until proven otherwise;
    the same checkout-return behavior had already passed in Chromium and the
    failed WebKit artifact did not show a product error state.
- `pnpm exec playwright test tests/e2e/listing-detail/contact-host-runtime.spec.ts --project=webkit --workers=1 --reporter=list -g "checkout return"`
  - Result: PASS. `.last-run.json` reported `status: passed`, `failedTests: []`.
  - Classification update: focused retry supports test/setup timing/settling
    classification for the prior isolated checkout-return miss.
- `pnpm exec playwright test tests/e2e/listing-detail/contact-host-runtime.spec.ts --project=webkit --workers=1 --reporter=list`
  - Result: PASS. `.last-run.json` reported `status: passed`, `failedTests: []`.
  - Evidence status: WebKit listing-detail Contact Host runtime matrix is
    passing after the narrow Supabase preconnect console-noise filter and the
    focused checkout-return timing retry.
- `pnpm exec playwright test tests/e2e/listing-detail/contact-host-runtime.spec.ts --project="Mobile Chrome" --workers=1 --reporter=list`
  - Result: PASS. `.last-run.json` reported `status: passed`, `failedTests: []`.
  - Evidence status: Mobile Chrome listing-detail Contact Host runtime matrix is
    passing.
- `pnpm exec playwright test tests/e2e/listing-detail/contact-host-runtime.spec.ts --project="Mobile Safari" --workers=1 --reporter=list`
  - Result: PASS. `.last-run.json` reported `status: passed`, `failedTests: []`.
  - Evidence status: Mobile Safari listing-detail Contact Host runtime matrix is
    passing.
- `pnpm exec playwright test tests/e2e/journeys/22-messaging-conversations.spec.ts --project=firefox --workers=1 --reporter=list`
  - Result: FAIL before app behavior.
  - Setup: global setup and reviewer auth setup ran; Playwright began 7 tests.
  - Exact blocker: `browserType.launch: Executable doesn't exist at /home/surya/.cache/ms-playwright/firefox-1511/firefox/firefox`; Playwright suggested `pnpm exec playwright install`.
  - Classification: environment/browser-install blocker, matching the
    listing-detail Firefox blocker.
- `pnpm exec playwright test tests/e2e/journeys/22-messaging-conversations.spec.ts --project=webkit --workers=1 --reporter=list`
  - Result: FAIL after exercising messaging routes.
  - Failure summary: 2 failed. J25 direct navigation to an existing
    conversation was interrupted by a concurrent navigation back to
    `/messages`; J26 direct listing navigation was interrupted by a concurrent
    navigation to the originating `/search` URL.
  - Classification: WebKit test/setup navigation race. The failures occurred
    during deterministic test navigation (`page.goto` / listing href helper),
    before a user-visible Contact Host assertion failed.
  - Narrow fix applied: retry direct test navigation when Playwright reports
    `net::ERR_ABORTED` or `is interrupted by another navigation` in
    `tests/e2e/helpers/navigation-helpers.ts` and
    `tests/e2e/journeys/22-messaging-conversations.spec.ts`.
- `pnpm exec playwright test tests/e2e/journeys/22-messaging-conversations.spec.ts --project=webkit --workers=1 --reporter=list -g "go to messages"`
  - Result: PASS. The focused J25 retry closed the WebKit direct conversation
    navigation race.
- `pnpm exec playwright test tests/e2e/journeys/22-messaging-conversations.spec.ts --project=webkit --workers=1 --reporter=list -g "search"`
  - Result: PASS. The focused J26 retry closed the WebKit listing href
    navigation race.
- `pnpm exec playwright test tests/e2e/journeys/22-messaging-conversations.spec.ts --project=webkit --workers=1 --reporter=list`
  - Result: PASS. WebKit messaging/conversation Contact Host matrix is passing
    after the narrow navigation retry.
- `pnpm exec playwright test tests/e2e/journeys/22-messaging-conversations.spec.ts --project="Mobile Chrome" --workers=1 --reporter=list`
  - Result: PASS. Mobile Chrome messaging/conversation Contact Host matrix is
    passing. Desktop-only J25 and the known Mobile Chrome inbox row skip remain
    expected harness behavior inside the spec.
- `pnpm exec playwright test tests/e2e/journeys/22-messaging-conversations.spec.ts --project="Mobile Safari" --workers=1 --reporter=list`
  - Result: PASS. `.last-run.json` reported `status: passed`,
    `failedTests: []`. Mobile Safari messaging/conversation Contact Host matrix
    is passing.

## Validation

- JSON parse validation passed:
  - `docs/features/contact-host/verification.json`: 17 claims parsed.
  - `docs/features/contact-host/manifest.json`: feature `contact-host` parsed.
- `git diff --check` passed for touched docs and focused E2E files.
- Stale wording scan for old broad full-browser-matrix unverified wording
  returned no matches. A broad `full browser matrix` scan now finds the phrase
  only in this goal/progress artifact's title/checklist context.

## Final Status

Historical CH-E063 status: reduced.

The focused Contact Host browser matrix now has passing WebKit, Mobile Chrome,
and Mobile Safari evidence for both focused listing-detail runtime and
messaging conversation specs. At the time of this CH-E063 artifact, Firefox was
blocked before app behavior by the missing Playwright executable at
`/home/surya/.cache/ms-playwright/firefox-1511/firefox/firefox`; no browser
install or system setup change was attempted in that slice.

Superseded Firefox status: CH-E064 in
`goal-progress-firefox-matrix.md` installed Playwright Firefox revision 1511
and reclassified Firefox from missing-executable blocked to focused test/setup
failures. CH-E065 in `goal-progress-firefox-stabilization.md` then fixed those
two focused Firefox failure classes; the listing-detail, messaging, and
practical combined Firefox runs now pass.
