# Roomshare Exploratory QA Findings

Date: 2026-06-01

QA lead: Codex

Scope: local exploratory QA against `http://127.0.0.1:3000` using seeded E2E data. No production code was modified. This report is the requested QA artifact.

## Executive Summary

The local app started successfully on port 3000 after clearing the existing listener and seeding local QA data. The most serious confirmed risk is that client components did not become interactive in the tested local browser contexts: login buttons did not run their React handlers, hydration-gated listing detail content stayed blank, and authenticated/listing workflows stalled even though JavaScript chunks returned HTTP 200. This presents as broken sign-in, missing listing detail content, missing contact CTAs, and stale UI controls.

Chrome real-browser testing was attempted as requested, but local URLs were blocked by the user's Chrome profile/extension stack with `net::ERR_BLOCKED_BY_CLIENT` for `localhost`, `127.0.0.1`, and `0.0.0.0`. I used Playwright Chromium for local functional evidence after that blocker.

## App Stack And Structure

- Framework: Next.js App Router, React 19, TypeScript. Evidence: `package.json:8-13`, `package.json:80-85`, `src/app`.
- Auth: NextAuth/Auth.js v5 beta with Credentials and Google providers, JWT sessions, Prisma adapter. Evidence: `src/auth.ts:44-57`, `src/auth.ts:253-320`.
- Request layer/security: Next.js 16 proxy applies suspension checks and CSP/security headers. Evidence: `src/proxy.ts:12-45`, `src/lib/csp-middleware.ts:3-47`, `src/lib/csp.ts:56-98`.
- Database: Prisma/PostgreSQL with `@prisma/client`; local DB was `localhost:5433/roomshare` from env. Evidence: `package.json:59`, `prisma/schema.prisma`.
- Search/listing data: custom SQL and Prisma loaders in `src/lib/data.ts` and listing public detail loader in `src/lib/listings/public-detail.ts`.
- Testing: Playwright E2E with projects for setup, authenticated Chromium, anonymous Chromium, mobile, Firefox, WebKit; Jest/unit tests also present. Evidence: `playwright.config.ts:62-145`, `package.json:15-45`.
- Primary routes observed: `/`, `/search`, `/listings/[id]`, `/login`, `/signup`, `/saved`, `/saved-searches`, `/profile/edit`, `/messages`, `/settings`, `/listings/create`, `/listings/[id]/edit`, `/admin`, `/admin/users`, `/admin/listings`, `/admin/reports`, `/admin/verifications`.

## Local Server And QA Data

Server command used:

```bash
PORT=3000 E2E_TEST_HELPERS=true E2E_TEST_SECRET=roomshare-local-e2e-secret CURSOR_SECRET=roomshare-local-e2e-cursor-hmac-key-20260530 TURNSTILE_ENABLED=false NEXT_PUBLIC_TURNSTILE_SITE_KEY= E2E_TEST_EMAIL=e2e-test@roomshare.dev E2E_TEST_PASSWORD='TestPassword123!' E2E_ADMIN_EMAIL=e2e-admin@roomshare.dev E2E_ADMIN_PASSWORD='TestPassword123!' pnpm run dev
```

Health check:

```bash
curl http://127.0.0.1:3000/api/health/ready
# HTTP 200
```

Safe local QA accounts identified/seeded:

- Renter/seeker and host: `e2e-test@roomshare.dev` / `TestPassword123!`
- Second host/non-owner: `e2e-reviewer@roomshare.dev` / `TestPassword123!`
- Second renter/user: `e2e-other@roomshare.dev` / `TestPassword123!`
- Incomplete host: `e2e-incomplete-host@roomshare.dev` / `TestPassword123!`
- Admin seed account: `e2e-admin@roomshare.dev` / `TestPassword123!`

Seed manifest:

- `playwright/.cache/e2e-seed.json`
- Active listing used for detail checks: `Reviewer Nob Hill Apartment` -> `cmmoez9yl001osp1c3szthrjt`
- Test-data drift listing: `Sunny Mission Room` -> `e2e-sf-1-sunny-mission-room`, currently `PAUSED`; other duplicate rows with the same title are `RENTED`.

## Commands Run

| Command | Result |
| --- | --- |
| `pnpm run seed:e2e` with QA account env | Passed; seed manifest written |
| `pnpm exec playwright test --project=setup tests/e2e/auth.setup.ts --reporter=line --workers=1` | 4 passed, 1 skipped |
| `pnpm exec playwright test --project=chromium-anon tests/e2e/homepage/homepage.anon.spec.ts tests/e2e/search-p0-smoke.anon.spec.ts --reporter=line --workers=1` | 22 passed, 2 failed, 3 skipped |
| `pnpm exec playwright test --project=chromium-anon tests/e2e/auth/auth-boundary.anon.spec.ts --reporter=line --workers=1` | 7 passed |
| `pnpm exec playwright test --project=chromium-anon tests/e2e/auth/login-signup.anon.spec.ts --reporter=line --workers=1` | 3 passed, 6 failed |
| `pnpm exec playwright test --project=chromium --no-deps tests/e2e/listing-detail/listing-detail.spec.ts tests/e2e/listing-edit/listing-edit.spec.ts --reporter=line --workers=1` | Timed out after 6 minutes; listing detail failures captured |
| `pnpm exec playwright test --project=chromium --no-deps tests/e2e/create-listing/create-listing.spec.ts --reporter=line --workers=1` | Timed out after 5 minutes; validation/date-picker failures captured |
| `pnpm exec playwright test --project=chromium-anon tests/e2e/search-filters/filter-price.anon.spec.ts --reporter=line --workers=1` | 3 passed, 7 failed |
| Chrome plugin navigation to local URLs | Blocked by client: `net::ERR_BLOCKED_BY_CLIENT` |

## Findings

### RS-QA-001: Client-side hydration/interactivity is not reliable in local QA

Severity: P1

Area: client runtime, auth, listing detail, filters, create listing

Reproduction steps:

1. Open `http://127.0.0.1:3000/login`.
2. Wait for page load plus 5 seconds.
3. Inspect `#password` attributes and click the "Show password" button.
4. Open `http://127.0.0.1:3000/listings/cmmoez9yl001osp1c3szthrjt`.
5. Inspect the About, Amenities, price/contact sidebar, and button behavior.

Expected result:

- React effects run after hydration.
- Login password field receives the `name="password"` attribute.
- The show-password control toggles the input type.
- Listing detail renders description, amenity labels, price, availability/contact copy, and CTA.

Actual result:

- Login `#password` still had `name: null` after 5 seconds.
- Clicking "Show password" did not change the password input type.
- Listing detail sections rendered headings/icons but not the hydration-gated text.
- Console repeatedly logged HMR WebSocket failures: `ws://127.0.0.1:3000/_next/webpack-hmr... net::ERR_INVALID_HTTP_RESPONSE`.

Evidence:

- Direct Playwright probe: login password `name` remained `null`; `type` stayed `password` after clicking show password.
- Direct Playwright probe: listing body contained `About this place` and `What this place offers`, but not the seeded description or amenity labels.
- Source: `src/app/login/LoginClient.tsx:49-57` sets `hasHydrated` in `useEffect`; `src/app/login/LoginClient.tsx:219-225` only sets password `name` after hydration.
- Source: `src/app/listings/[id]/ListingPageClient.tsx:688-690` sets `hasHydrated`; `src/app/listings/[id]/ListingPageClient.tsx:1207-1209` hides description until hydration; `src/app/listings/[id]/ListingPageClient.tsx:1236-1238` hides amenity text until hydration.
- Source: `next.config.ts:158-166` customizes `_next/static` cache headers; server stderr also warned about custom cache headers on Next auto-generated resources.

Likely root cause:

Client component hydration or event handler attachment is failing or incomplete in the local dev runtime. The HMR WebSocket errors may be a symptom. Because several workflows depend on `hasHydrated`, SSR fallback output is missing essential user-facing content when hydration does not complete.

Recommended automated test:

- Add a small "hydration sentinel" E2E spec that loads `/login` and a listing detail page, waits for hydration, clicks a known client button, and asserts a client-rendered marker/attribute changes. Fail fast if React event handlers are not active.

### RS-QA-002: Login UI cannot complete credential sign-in or show credential errors

Severity: P1

Area: authentication, login

Reproduction steps:

1. Run `tests/e2e/auth/login-signup.anon.spec.ts` in `chromium-anon`.
2. Try valid credentials: `e2e-test@roomshare.dev` / `TestPassword123!`.
3. Try wrong-password and nonexistent-email scenarios.

Expected result:

- Valid credentials POST to Auth.js and redirect home or to the callback URL.
- Invalid credentials show the generic "Incorrect email or password" message.

Actual result:

- Valid login timed out waiting for `/api/auth`.
- Invalid login scenarios did not show the expected generic error.
- Direct form inspection showed the password input missing its `name` attribute after load, so `new FormData(e.currentTarget)` cannot collect the password.

Evidence:

- Test command result: `3 passed, 6 failed`.
- Error contexts under `test-results/auth-login-signup.anon-*`.
- Source: `src/app/login/LoginClient.tsx:70-97` submits credentials through `signIn("credentials")`.
- Source: `src/app/login/LoginClient.tsx:99-107` should show a generic invalid-credential message.
- Source: `src/app/login/LoginClient.tsx:219-225` gates `name="password"` on hydration.
- Source: `src/components/auth/AuthPageChrome.tsx:466-474` passes input props through to the native input.

Likely root cause:

The login form relies on client hydration before the password field becomes submittable. If hydration does not run, the form has no action and no valid password field name, so the React submit handler does not produce the expected Auth.js request or error state.

Recommended automated test:

- Add an E2E auth test that first asserts `input#password[name="password"]` and that the show-password button toggles type before submitting credentials.
- Add a component/unit test for `LoginClient` verifying the password input has a stable `name` in initial render.

### RS-QA-003: Signup UI fails key registration/error flows in browser tests

Severity: P1

Area: authentication, registration

Reproduction steps:

1. Run `tests/e2e/auth/login-signup.anon.spec.ts`.
2. Attempt valid signup.
3. Attempt duplicate-email signup.
4. Type a weak password and inspect the strength feedback.

Expected result:

- Valid signup POSTs to `/api/register`, creates a safe test account, and signs in or redirects.
- Duplicate signup POSTs to `/api/register` and shows a non-enumerating error.
- Weak password feedback appears before submit.

Actual result:

- Valid signup and duplicate signup timed out waiting for `/api/register`.
- Weak password feedback was not visible to the test.

Evidence:

- Failed tests: LS-06, LS-07, LS-08.
- Error contexts under `test-results/auth-login-signup.anon-*`.
- Source: `src/app/signup/SignUpClient.tsx:52-147` owns registration submit and `/api/register` fetch.
- Source: `src/app/signup/SignUpClient.tsx:254-257` renders `PasswordStrengthMeter`.
- Direct signup field probe showed password field names are present, so the failure is more likely submit-handler/hydration behavior than a missing `name` attribute.

Likely root cause:

Same client interactivity problem as RS-QA-001, with signup-specific impact. The password-strength meter and registration submit handler depend on hydrated client state.

Recommended automated test:

- Add a signup smoke that asserts password-strength copy changes after typing and that a valid submit observes exactly one `/api/register` request.

### RS-QA-004: Listing detail hides critical content and contact CTA for an active listing

Severity: P1

Area: listing detail, contact host, renter/host marketplace conversion

Reproduction steps:

1. Seed E2E data.
2. Open `http://127.0.0.1:3000/listings/cmmoez9yl001osp1c3szthrjt`.
3. Inspect the detail page as a non-owner or guest.

Expected result:

- Listing description: `Cozy apartment on Nob Hill. Great for visiting SF.`
- Price: `$1,500` or equivalent formatted monthly rent.
- Amenities: `WiFi`, `Furnished`, `Laundry`.
- Contact-first card and CTA visible for non-owner viewers.

Actual result:

- Page rendered title and location but the About paragraph was blank.
- Amenity cards rendered icons with no labels.
- Expected price/contact-first copy/Contact Host CTA was absent in the observed page state.

Evidence:

- Screenshot: `test-results/qa-listing-detail-contact-missing.png`.
- Direct DB read confirmed active listing data exists: title `Reviewer Nob Hill Apartment`, status `ACTIVE`, description, price `1500`, amenities `["WiFi","Furnished","Laundry"]`.
- Source: `src/lib/listings/public-detail.ts:10-50` selects description, price, amenities, status, owner and location.
- Source: `src/app/listings/[id]/page.tsx:351-365` passes description, price and amenities into `ListingPageClient`.
- Source: `src/app/listings/[id]/ListingPageClient.tsx:437-525` defines the price/contact-first sidebar.
- Source: `src/app/listings/[id]/ListingPageClient.tsx:1207-1209`, `src/app/listings/[id]/ListingPageClient.tsx:1236-1238`, `src/app/listings/[id]/ListingPageClient.tsx:1539-1555`.

Likely root cause:

Essential public listing content is gated behind client hydration even though it is already available to SSR. Contact CTA state also appears coupled to client session/viewer-state hydration. Any hydration failure produces a public detail page that is materially incomplete.

Recommended automated test:

- Add a public listing detail E2E smoke that asserts title, description, formatted price, each amenity label, availability state, and contact CTA for a seeded active listing.
- Add a non-owner authenticated variant using the reviewer/other account storage state.

### RS-QA-005: Listing share fallback does not expose a visible copy action in E2E

Severity: P2

Area: listing detail, sharing

Reproduction steps:

1. Open a seeded active listing detail page.
2. Click the share button.
3. Look for a fallback dropdown or "Copy Link" action.

Expected result:

- If native share is unavailable, a visible "Copy Link" fallback should open.

Actual result:

- Listing detail test `share button opens fallback dropdown` failed because "Copy Link" did not become visible.

Evidence:

- Error context: `test-results/listing-detail-listing-det-bd1d5-ton-opens-fallback-dropdown-chromium/error-context.md`.
- Source: `src/app/listings/[id]/ListingPageClient.tsx:1095-1098` renders `ShareListingButton`.

Likely root cause:

Likely same client interaction issue as RS-QA-001, or a fallback path that depends on unsupported browser APIs without a reliable visible alternate state.

Recommended automated test:

- Mock `navigator.share` unavailable and assert clicking Share shows a copy-link button and copies the current listing URL.

### RS-QA-006: Anonymous "Save Search" affordance was not visible in search smoke test

Severity: P2

Area: search, saved searches, auth/paywall redirect UX

Reproduction steps:

1. Run `tests/e2e/search-p0-smoke.anon.spec.ts` in `chromium-anon`.
2. Execute the anonymous save-search scenario.

Expected result:

- Anonymous users should see a "Save Search" affordance or equivalent, then be prompted to sign in without raw unauthorized UI.

Actual result:

- The test could not find the expected Save Search button.

Evidence:

- Failed test: S16b.
- Error context: `test-results/search-p0-smoke.anon-Searc-42b6e-in-without-raw-Unauthorized-chromium-anon/error-context.md`.
- Source: `src/components/search/SearchResultsToolbar.tsx:43` and `src/components/search/SearchResultsClient.tsx:1331` contain `SaveSearchButton`.
- Source: `src/components/SaveSearchButton.tsx:198-208` button uses `aria-label="Save search"` and hidden small-screen label text.

Likely root cause:

Potential responsive visibility mismatch, zero-results conditional rendering, or client hydration issue. Because the component exists in source, the failure is likely in render conditions or client state rather than a missing implementation.

Recommended automated test:

- Add explicit guest search tests at desktop and mobile widths that locate by `aria-label="Save search"`, click it, and assert the login prompt/redirect contract.

### RS-QA-007: Desktop price filter E2E contract is broken or out of sync with the UI

Severity: P2

Area: search filters, responsive desktop UX

Reproduction steps:

1. Run `tests/e2e/search-filters/filter-price.anon.spec.ts`.
2. Attempt to open desktop price filters through the expected Filters/More button.
3. Apply a price range and inspect applied chips.

Expected result:

- Desktop exposes a stable filter control.
- Applied price ranges show a removable chip or visible state.
- URL and results stay synchronized.

Actual result:

- 7 of 10 price filter tests failed.
- Most failures timed out waiting for `data-testid="quick-filter-more-filters"` or equivalent desktop Filters button.
- One failure showed the price URL/state applied, but the expected `$500 - $2,000` chip was not visible.

Evidence:

- Test command result: `3 passed, 7 failed`.
- Source: `src/components/search/DesktopQuickFilters.tsx:391-407` defines a `quick-filter-more-filters` control.
- Source: `src/components/search/DesktopHeaderSearch.tsx:496-531` renders inline budget fields in the desktop search header.
- Source: `src/components/search/InlineFilterStrip.tsx:248-258`, `src/components/search/InlineFilterStrip.tsx:590-597`, `src/components/search/InlineFilterStrip.tsx:700-712` controls desktop quick-filter/applied-chip rendering.

Likely root cause:

The desktop filter UX and tests have diverged, or hydration/responsive state prevents `DesktopQuickFilters` from rendering in the expected desktop mode. The app may still filter by URL, but the user-visible control contract is unstable.

Recommended automated test:

- Split tests for inline budget fields versus advanced filter drawer.
- Assert URL, result count behavior, visible budget summary, and removable chip state after applying min/max values.

### RS-QA-008: Create listing happy path and validation flows are blocked in E2E

Severity: P2

Area: host create listing

Reproduction steps:

1. Use authenticated host storage state.
2. Run `tests/e2e/create-listing/create-listing.spec.ts`.
3. Submit an empty form.
4. Attempt the happy path including move-in date selection.

Expected result:

- Empty submit shows visible field errors, including `#title-error`.
- Happy path can open the date picker, choose a date, submit, clear draft state, and redirect to `/listings/{id}`.

Actual result:

- Empty submit test did not see `#title-error`.
- Multiple happy/validation tests timed out waiting for the date-picker popover selector `[data-radix-popper-content-wrapper]`.
- The spec timed out after 5 minutes before validating publish.

Evidence:

- Error context: `test-results/create-listing-create-list-b8bd1-empty-form-submit-auth-core-chromium/error-context.md`.
- Source: `src/app/listings/create/CreateListingForm.tsx:976` references `title-error` in `aria-describedby`.
- Tests reference date-picker popover selectors under `tests/e2e/create-listing`.

Likely root cause:

Likely client interactivity/hydration issue plus possible stale selector assumptions around the current date picker. The validation UI exists in source, but the browser test did not observe it.

Recommended automated test:

- Add a minimal create-listing hydration smoke: submit empty form, assert first visible inline field error and focus movement.
- Add a date-picker component E2E helper that locates the trigger by role/label and asserts the Radix popover opens before filling the rest of the form.

### RS-QA-009: Search P0 smoke uses stale or non-public seed data

Severity: P3

Area: E2E seed data, search tests

Reproduction steps:

1. Run `tests/e2e/search-p0-smoke.anon.spec.ts`.
2. Observe S02 exact text query for `Sunny Mission Room`.
3. Inspect local DB seed rows for that title.

Expected result:

- The exact-title search fixture should target an active/public listing.

Actual result:

- Search returned zero results for `Sunny Mission Room`, which is correct for current data because the seed row `e2e-sf-1-sunny-mission-room` is `PAUSED`, and other rows with that title are `RENTED`.
- Exact-title search against active `Reviewer Nob Hill Apartment` did return results.

Evidence:

- Seed manifest maps `Sunny Mission Room` to `e2e-sf-1-sunny-mission-room`.
- Read-only Prisma probe found `Sunny Mission Room` rows with statuses `PAUSED` or `RENTED`.
- Source: `src/lib/listings/public-detail.ts:91-100` hides non-public listings for non-owner/non-admin viewers.

Likely root cause:

The search smoke fixture expectation drifted from the seed data lifecycle.

Recommended automated test:

- Update search smoke setup to query a known `ACTIVE` fixture, or have the test read the seed manifest plus status before choosing an exact-title query.

### RS-QA-010: Admin coverage exists in app but was not fully exercised

Severity: P3

Area: admin/moderator QA coverage

Reproduction steps:

1. Inspect routes and Playwright setup.
2. Seed admin account.
3. Check Playwright setup/admin project configuration.

Expected result:

- If admin routes are supported, QA should have a stable admin auth setup and smoke suite.

Actual result:

- Admin routes exist under `/admin`.
- Admin account is seeded.
- The auth setup reported 1 skipped test, and the admin Playwright project appears commented/skipped in current setup.
- Full admin/moderator workflow coverage was not completed in this pass.

Evidence:

- Admin routes under `src/app/admin`.
- Source: `src/auth.ts:237-242` enforces admin route access.
- Playwright setup result: 4 passed, 1 skipped.

Likely root cause:

Admin test setup exists but is not active in the current local QA workflow.

Recommended automated test:

- Enable a minimal admin storage-state setup and smoke test for `/admin`, `/admin/users`, `/admin/listings`, `/admin/reports`, and unauthorized non-admin redirects.

### RS-QA-011: Chrome real-browser local testing is blocked by the user's Chrome profile

Severity: P3

Area: QA tooling, Chrome plugin

Reproduction steps:

1. Use the Chrome plugin to navigate to `http://localhost:3000/`.
2. Repeat for `http://127.0.0.1:3000/` and `http://0.0.0.0:3000/`.

Expected result:

- Chrome opens the local app for logged-in manual QA.

Actual result:

- Each local URL failed with `net::ERR_BLOCKED_BY_CLIENT`.

Evidence:

- Chrome plugin navigation attempts returned `net::ERR_BLOCKED_BY_CLIENT`.
- In-app/local Playwright access to the same server worked, and `/api/health/ready` returned 200.

Likely root cause:

User Chrome profile extension, policy, or blocking rule prevents local navigation in the controlled Chrome session.

Recommended automated test:

- Not a product test. Add a QA runbook note: if Chrome profile blocks local URLs, use a clean Chrome profile or Playwright for unauthenticated/local validation and reserve profile Chrome for staging/prod authenticated checks.

### RS-QA-012: Dev runtime logs contain noisy warnings that can hide real client failures

Severity: P3

Area: local dev/test observability

Reproduction steps:

1. Start local dev server.
2. Load auth/search/listing pages.
3. Inspect server stderr and browser console.

Expected result:

- Local dev logs should make product errors easy to spot.

Actual result:

- Browser console repeatedly logged HMR WebSocket errors.
- Server stderr showed repeated Sentry/OpenTelemetry "Critical dependency" warnings.
- Auth.js debug-enabled warning appears in dev logs.
- Next.js warned about custom cache headers on auto-generated resources.

Evidence:

- Browser console: `/_next/webpack-hmr... net::ERR_INVALID_HTTP_RESPONSE`.
- Server stderr: `.codex-server-3000.current.err.log`.
- Source: `next.config.ts:158-166`, `next.config.ts:197-205` custom cache headers for `_next/static` and `_next/image`.

Likely root cause:

Dev-mode cache/header/Sentry instrumentation configuration emits noisy warnings. HMR connectivity may be blocked by local server/proxy/header behavior.

Recommended automated test:

- Add a local smoke that fails on non-HMR console errors but filters known dev-only warnings, plus a separate health check for HMR in dev if hot reload is part of the local workflow.

## Top 10 Risks

1. Users may be unable to sign in through the login UI because client handlers and the password field name are not active.
2. New users may be unable to register or see signup validation feedback.
3. Listing detail pages can ship incomplete public content when hydration fails.
4. Contact-host conversion is at risk because price/contact CTA may be missing for non-owner viewers.
5. Client-only/hydration-gated content is being used for data that should be safe and useful in SSR output.
6. Search saved-search affordance may be unavailable to anonymous users, weakening retargeting and alert conversion.
7. Desktop price filter UX/test contract is unstable, creating risk around search refinement and regression detection.
8. Host create-listing happy path is not currently provable by E2E due validation/date-picker blockers.
9. Search P0 smoke contains stale seed assumptions, which can hide real search regressions behind false failures.
10. Chrome profile blocking and noisy dev logs reduce confidence in exploratory QA unless the runbook/environment is tightened.

## Coverage Notes And Gaps

- Guest and anonymous auth-boundary routes were covered; `auth-boundary.anon.spec.ts` passed 7/7.
- Renter/seeker and host storage states were created by setup, but deep authenticated browser coverage was limited by hydration failures and Chrome local blocking.
- Second host/non-owner listing detail was exercised with `Reviewer Nob Hill Apartment`.
- Admin/moderator support exists, but admin flow testing was not completed because the current setup skipped one admin-related setup item.
- No fixes were made. Recommended next step is to approve a narrow fix plan for RS-QA-001/002/004 first, then rerun auth, listing detail, create-listing, and search filter suites.
