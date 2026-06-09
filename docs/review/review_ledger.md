# Review Ledger

This is the single source of truth for production-readiness findings and fix
evidence. Do not record duplicates. Do not record unsupported speculation as a
confirmed issue.

## Ledger Status

- Audit status: `AuthAuthorizationValidationAudited`
- Release candidate status: `NotReady`
- Open P0 count: `0`
- Open P1 count: `1`
- Last updated: `2026-06-05`

## Finding Schema

Each confirmed finding must use this shape:

```md
### P1-AUTH-001 - Short title

- Severity: P1
- Confidence: High
- Status: Open
- Duplicate status: Unique
- Slice: Auth/AuthZ/Sessions
- Exact location: `src/path/file.ts:functionName` or route/action/migration
- Evidence:
- Failure scenario:
- Impact:
- Reproduction or test idea:
- Suggested fix direction:
- False-positive challenge:
- Fix summary:
- Files changed:
- Tests added or updated:
- Commands run:
- Remaining risk:
- Adversarial re-review:
```

Allowed statuses:

- `Open`
- `InProgress`
- `FixedPendingReview`
- `VerifiedFixed`
- `PartiallyFixed`
- `Blocked`
- `Duplicate`
- `RejectedFalsePositive`
- `AcceptedRisk`

## Confirmed Findings

### P1-VALIDATION-001 - Upload type validation bypassed listing email verification

- Severity: P1
- Confidence: High
- Status: VerifiedFixed
- Duplicate status: Unique
- Slice: Auth/Authorization/Validation
- Exact location: `src/app/api/upload/route.ts:POST`
- Evidence: Before the fix, `/api/upload` read `type` directly from multipart
  form data and only called `checkEmailVerified` when `type === "listing"`.
  The same route mapped every non-`profile` value to the
  `listings/{userId}/...` storage folder. Existing regression coverage only
  asserted the literal `listing` and `profile` paths.
- Failure scenario: An authenticated but email-unverified user could submit a
  valid image with `type=avatar`, another arbitrary string, or an otherwise
  invalid type. That request skipped the listing email-verification gate and
  still stored the file under the listing image namespace.
- Impact: Listing publication and listing create remain separately gated, so
  this was not a full listing-publish bypass. It was still a release-blocking
  validation/auth gap because unverified users could write listing-scoped public
  images and bypass the upload policy enforced by the create-listing flow.
- Reproduction or test idea: Mock an authenticated, unsuspended,
  email-unverified user; POST a valid JPEG multipart request to `/api/upload`
  with `type=avatar`; assert `400`, no email-verification call, and no Sharp or
  Supabase storage work.
- Suggested fix direction: Validate upload type as a strict server-side enum
  before branching. Only allow `profile` and `listing`; reject missing or
  unknown types before email verification, image processing, or storage.
- False-positive challenge: Not a false positive. The route's control flow
  skipped the email check for arbitrary non-`listing` values, and the storage
  path fallback treated arbitrary non-`profile` values as listing uploads.
  Severity remains P1, not P0, because listing creation/publishing still has
  independent auth, email verification, and validation gates.
- Fix summary: Added a strict `z.enum(["profile", "listing"])` check before the
  email-verification branch and storage-path selection. Invalid or missing
  upload types now return `400` before policy or storage work.
- Files changed: `src/app/api/upload/route.ts`
- Tests added or updated: Added
  `src/__tests__/api/upload-integration.test.ts` coverage for arbitrary upload
  type rejection before email verification, Sharp processing, or Supabase
  storage.
- Commands run: `pnpm run test -- src/__tests__/api/upload-integration.test.ts --runInBand`
  passed with 22 tests; targeted Auth/AuthZ/Validation Jest run passed with 22
  suites and 449 tests; `pnpm run typecheck` passed after removing a stale,
  unreachable assertion from an E2E test file that had blocked the diagnostics
  fallback.
- Remaining risk: The broader uploads/images release row remains a later matrix
  slice; this finding covers the upload type/email-verification bypass found
  during Auth/Authorization/Validation review.
- Adversarial re-review: Pass. The invalid-type path is validated before
  `checkEmailVerified`, Sharp, and Supabase, and the existing verified
  `listing` and `profile` upload behaviors remain covered.

### P1-TEST-001 - Jest baseline gate fails

- Severity: P1
- Confidence: High
- Status: VerifiedFixed
- Duplicate status: Unique
- Slice: Testing/CI/release gates
- Exact location: `pnpm run test`
- Evidence: Command exited 1. Jest reported 8 failed suites, 16 failed tests,
  7485 passed tests, and 8 skipped tests.
- Testing/CI slice update: A focused rerun of three representative failing
  suites still failed: `src/__tests__/lib/search/search-query.test.ts`,
  `src/__tests__/lib/search/search-doc-queries.test.ts`, and
  `src/__tests__/lib/search-alerts.test.ts` had 8 failures and 102 passing
  tests.
- Root-cause evidence: Many failures are time-sensitive test-fixture failures.
  `src/lib/search-params.ts` rejects dates before the current day in
  `safeParseDate`, while failing tests use `2026-05-01`; the accepted baseline
  was captured on `2026-05-06T23:45:04Z`. Search projection fixtures also use
  `lastConfirmedAt: "2026-04-15T12:30:00.000Z"`, which crosses the
  21-day host-managed stale threshold by the current audit date.
- Failure scenario: The release candidate cannot pass the required unit, API,
  hook, and component regression suite.
- Impact: Release gate failure. The failed tests cover search pagination,
  search alerts, URL date filters, search projection mapping, query hashing,
  SlotBadge styling expectations, and search layout rendering.
- Reproduction or test idea: Run `pnpm run test`; then run the failing suites
  individually:
  `src/__tests__/lib/search/search-v2-service.test.ts`,
  `src/__tests__/lib/search-alerts.test.ts`,
  `src/__tests__/hooks/useBatchedFilters.test.ts`,
  `src/__tests__/lib/search/search-doc-queries.test.ts`,
  `src/__tests__/lib/search/hash.test.ts`,
  `src/__tests__/lib/search/search-query.test.ts`,
  `src/__tests__/components/SlotBadge.test.tsx`, and
  `src/__tests__/app/search/layout.test.tsx`.
- Suggested fix direction: First stabilize date-dependent tests by freezing time
  or using relative future fixtures. Then rerun the full failing-suite list to
  identify remaining non-time-based regressions, including SlotBadge styling and
  search layout rendering.
- False-positive challenge: Not a false positive as a release gate result; the
  command returned non-zero. Individual product impact still needs slice review.
- Fix summary: The remaining current Jest blocker was the async Next
  `SearchLayout` test harness. The test now mocks async `next/headers`,
  awaits the async layout component, and renders the resolved React tree without
  weakening production search validation.
- Files changed: `src/__tests__/app/search/layout.test.tsx`,
  `src/__tests__/components/CreateListingForm.test.tsx`,
  `src/__tests__/e2e/neighborhood.e2e.test.ts`
- Tests added or updated: Updated
  `src/__tests__/app/search/layout.test.tsx` and the CreateListingForm draft
  persistence test mock to match the production hook contract.
- Commands run: `pnpm run test`;
  `pnpm exec jest src/__tests__/lib/search/search-query.test.ts src/__tests__/lib/search/search-doc-queries.test.ts src/__tests__/lib/search-alerts.test.ts --runInBand --silent`;
  `pnpm exec jest src/__tests__/lib/search/search-v2-service.test.ts src/__tests__/lib/search-alerts.test.ts src/__tests__/hooks/useBatchedFilters.test.ts src/__tests__/lib/search/search-doc-queries.test.ts src/__tests__/lib/search/hash.test.ts src/__tests__/lib/search/search-query.test.ts src/__tests__/components/SlotBadge.test.tsx src/__tests__/app/search/layout.test.tsx --runInBand --silent`;
  `pnpm run test -- src/__tests__/components/CreateListingForm.test.tsx --runInBand`
  passed with 42 tests; `pnpm run test -- src/__tests__/performance/filter-performance.test.ts --runInBand`
  passed with 34 tests; `pnpm exec jest src/__tests__/e2e/neighborhood.e2e.test.ts --runInBand --testNamePattern="computes distances"`
  passed after median-sample hardening; `pnpm exec jest src/__tests__/components/CreateListingForm.test.tsx --runInBand --testNamePattern="displays email verification error"`
  passed after giving the async error-path test a 10s budget; `pnpm run test`
  passed on 2026-05-30 with 477 passed suites, 2 skipped suites, 7562 passed
  tests, and 8 skipped tests.
- Remaining risk: Non-Jest release gates are tracked separately below; this
  blocker no longer blocks the Jest baseline.
- Adversarial re-review: Pass. The production layout code was not changed; the
  test harness now matches the async layout contract, and the full Jest release
  gate passed.

### P1-SUPPLY-001 - Dependency audit reports untriaged high vulnerabilities

- Severity: P1
- Confidence: High
- Status: VerifiedFixed
- Duplicate status: Unique
- Slice: Dependencies/supply chain/secrets
- Exact location: `pnpm audit --audit-level high`
- Evidence: Command exited 1 with 13 vulnerabilities: 6 high, 5 moderate, and
  2 low. High findings include lodash/lodash-es code injection advisories and
  multiple `basic-ftp` advisories through `@lhci/cli` transitive dependency
  paths.
- Failure scenario: A release proceeds with known high-severity dependency
  advisories that are not patched, removed, scoped to dev-only, or explicitly
  accepted.
- Impact: Supply-chain release gate failure. The current evidence points to
  tooling transitive paths, but this still requires triage before release.
- Reproduction or test idea: Run `pnpm audit --audit-level high` and inspect
  advisories `GHSA-r5fr-rjxr-66jc`, `GHSA-6v7q-wjvx-w8wg`,
  `GHSA-chqc-8p9q-pq6q`, `GHSA-rp42-5vxx-qpwr`, and
  `GHSA-rpmf-866q-6p89`.
- Suggested fix direction: Triage whether affected packages are dev-only, update
  or replace vulnerable dependency chains, or document an accepted risk with
  evidence and expiration.
- False-positive challenge: Not a false positive as a scanner result; exploit
  reachability and release-blocking severity require supply-chain review.
- Fix summary: Removed unused dev-only `@lhci/cli`, upgraded `next` and
  `eslint-config-next` from 16.2.4 to 16.2.6, and forced vulnerable
  `fast-uri <=3.1.1` transitive ranges to 3.1.2 through pnpm overrides.
- Files changed: `package.json`, `pnpm-lock.yaml`
- Tests added or updated: None; supply-chain gate fix.
- Commands run: `pnpm audit --audit-level high` initially failed with high
  advisories; `pnpm install --fetch-retries 5 --fetch-retry-maxtimeout 120000 --fetch-timeout 300000`
  passed; `pnpm install --frozen-lockfile` passed; `pnpm why @lhci/cli fast-uri next eslint-config-next`
  confirmed `@lhci/cli` absent, `fast-uri` resolved to 3.1.2, and Next packages
  resolved to 16.2.6; `pnpm audit --audit-level high` passed on 2026-05-29 and
  reported 6 remaining non-blocking vulnerabilities: 1 low and 5 moderate;
  reran `pnpm audit --audit-level high` on 2026-05-30 and it still exited 0
  with only low/moderate findings.
- Remaining risk: Low/moderate advisories remain outside the high/critical
  release blocker threshold and still need normal dependency backlog triage.
- Adversarial re-review: Pass. No new production dependency was added, the
  unused Lighthouse CI CLI transitive chain was removed, and the high/critical
  audit gate now exits 0.

### P1-PRIVACY-001 - Public payload PII gate is not runnable without explicit payloads

- Severity: P1
- Confidence: High
- Status: PartiallyFixed
- Duplicate status: Unique
- Slice: Testing/CI/release gates
- Exact location: `pnpm run scan:public-payload-pii`
- Evidence: Command exited 1 with usage output:
  `Usage: node scripts/scan-public-payload-pii.js <payload.json> [more.json]`.
- Testing/CI slice update: The scanner itself works when passed existing
  fixtures. `node scripts/scan-public-payload-pii.js scripts/fixtures/public-payload-clean.json`
  returns `{ "ok": true, "scannedFiles": 1 }`; the leak fixture returns
  expected violations for exact address, unit number, phone, and exact point.
- Failure scenario: The privacy gate cannot produce pass/fail evidence from the
  standard release command because it has no default payload source.
- Impact: Release gate is blocked for public payload PII verification. This does
  not prove a PII leak, but it prevents evidence-backed release approval.
- Reproduction or test idea: Run `pnpm run scan:public-payload-pii` from the repo
  root.
- Suggested fix direction: Change the release gate to pass deterministic public
  payload fixtures, or add a wrapper script that generates/captures
  representative payload JSON before invoking the scanner.
- False-positive challenge: Not a product vulnerability finding yet; confirmed
  as a verification-gate blocker.
- Fix summary: The scanner remains an explicit-payload CLI, but the search/list/map public payload leak found during runtime verification was fixed through a shared public search payload sanitizer. Real local payloads from `/api/search/v2`, `/api/search/listings`, `/api/map-listings`, and `/api/listings` now scan cleanly when captured from the built app.
- Files changed: `scripts/scan-public-payload-pii.js`, `src/lib/search/public-listing-payload.ts`, `src/lib/search/types.ts`, `src/lib/search/search-response.ts`, `src/lib/search/search-v2-service.ts`, `src/lib/search/projection-search.ts`, `src/lib/search/transform.ts`, `src/lib/search/v2-map-data.ts`, `src/lib/maps/sanitize-map-listings.ts`, `src/app/search/page.tsx`, `src/app/search/actions.ts`, `src/app/api/search/listings/route.ts`, `src/app/api/listings/route.ts`, and focused regression tests.
- Tests added or updated: `src/__tests__/lib/search/public-listing-payload.test.ts`, `src/__tests__/lib/search/v2-map-data.test.ts`, `src/__tests__/scripts/scan-public-payload-pii.test.ts`, plus focused search/API/map tests.
- Commands run: `pnpm run scan:public-payload-pii`;
  `node scripts/scan-public-payload-pii.js scripts/fixtures/public-payload-clean.json`;
  `node scripts/scan-public-payload-pii.js scripts/fixtures/public-payload-leak.json`;
  `pnpm test -- src/__tests__/lib/search/public-listing-payload.test.ts src/__tests__/lib/maps/sanitize-map-listings.test.ts src/__tests__/lib/search/v2-map-data.test.ts src/__tests__/lib/search/search-v2-service.test.ts src/__tests__/app/search/actions.test.ts src/__tests__/api/search/v2/route.test.ts src/__tests__/api/map-listings.test.ts src/__tests__/api/map-listings-route.test.ts src/__tests__/api/listings.test.ts src/__tests__/scripts/scan-public-payload-pii.test.ts --runInBand`;
  `pnpm run typecheck`;
  `pnpm run test:e2e:search-release-gate`;
  `pnpm run scan:public-payload-pii -- /tmp/roomshare-payload-search-v2.json /tmp/roomshare-payload-search-listings.json /tmp/roomshare-payload-map-listings.json /tmp/roomshare-payload-listings.json`
- Remaining risk: The package script still requires explicit payload JSON files; a wrapper that captures deterministic payloads before scanning is still recommended before treating the no-arg privacy gate as fully fixed.
- Adversarial re-review: Pass for the concrete search/list/map payload leak. The fixed implementation sanitizes all discovered browser-visible public search/list/map payload boundaries and the real captured payload scan returned `{"ok":true,"scannedFiles":4}`.

### P0-PRIVACY-002 - Public search/list/map payloads exposed exact coordinates and raw grouping keys

- Severity: P0
- Confidence: High
- Status: VerifiedFixed
- Duplicate status: Unique
- Slice: Privacy/Search/Map public payloads
- Exact location: `/api/search/v2`, `/api/search/listings`, `/api/listings`, `/api/map-listings`, `/search` initial data, and `fetchMoreListings`
- Evidence: Runtime payload scan previously failed for real search/map JSON. Triage identified high-precision `list.fullItems.*.location.lat/lng` and raw `groupKey` / `contextKey` values as the real privacy risk.
- Failure scenario: Anonymous browser-visible search/list/map responses could expose exact listing coordinates or internal grouping identifiers.
- Impact: Public payload privacy leak for listing discovery surfaces.
- Reproduction or test idea: Capture public JSON from the search/list/map APIs and scan it with `scripts/scan-public-payload-pii.js`.
- Suggested fix direction: Sanitize every browser-visible public search/list/map payload through one shared transform while keeping internal DB/query data unchanged.
- False-positive challenge: Some original scanner hits were false positives from image URLs, coarsened coordinates, and snapshot version strings. The exact `fullItems` coordinates and raw grouping keys were not false positives.
- Fix summary: Added `toPublicSearchListing` / `toPublicGroupMetadata`, changed public response types to `PublicSearchListing`, sanitized SSR initial listings, V2 fullItems, client search-listing API responses, `/api/listings`, load-more server action responses, map metadata, and projection/search-doc response paths. Scanner logic now distinguishes safe coarsened coordinates, image URLs, snapshot versions, and opaque `pg1_` group ids from real leaks.
- Files changed: `src/lib/search/public-listing-payload.ts`, `src/lib/public-cache/cache-policy.ts`, `src/lib/search-types.ts`, `src/lib/search/types.ts`, `src/lib/search/search-response.ts`, `src/lib/search/search-v2-service.ts`, `src/lib/search/projection-search.ts`, `src/lib/search/transform.ts`, `src/lib/search/v2-map-data.ts`, `src/lib/maps/sanitize-map-listings.ts`, `src/app/search/page.tsx`, `src/app/search/actions.ts`, `src/app/api/search/listings/route.ts`, `src/app/api/listings/route.ts`, `scripts/scan-public-payload-pii.js`, and focused regression tests.
- Tests added or updated: Sanitizer unit tests, map sanitizer tests, client-safe V2 map conversion tests, search V2 service tests, search load-more tests, API listings tests, and scanner tests.
- Commands run: `pnpm test -- src/__tests__/lib/search/public-listing-payload.test.ts src/__tests__/lib/maps/sanitize-map-listings.test.ts src/__tests__/lib/search/v2-map-data.test.ts src/__tests__/lib/search/search-v2-service.test.ts src/__tests__/app/search/actions.test.ts src/__tests__/api/search/v2/route.test.ts src/__tests__/api/map-listings.test.ts src/__tests__/api/map-listings-route.test.ts src/__tests__/api/listings.test.ts src/__tests__/scripts/scan-public-payload-pii.test.ts --runInBand`; `pnpm run typecheck`; `pnpm run test:e2e:search-release-gate`; `pnpm run scan:public-payload-pii -- /tmp/roomshare-payload-search-v2.json /tmp/roomshare-payload-search-listings.json /tmp/roomshare-payload-map-listings.json /tmp/roomshare-payload-listings.json`
- Remaining risk: Broader non-gate E2E coverage and a no-arg deterministic scanner wrapper remain separate release-readiness work.
- Adversarial re-review: Approved. The real local payload scanner passed with `{"ok":true,"scannedFiles":4}`, and the search release gate passed after Docker/Postgres was available.

### P1-E2E-001 - Chromium E2E smoke gate times out

- Severity: P1
- Confidence: High
- Status: VerifiedFixed
- Duplicate status: Unique
- Slice: Testing/CI/release gates
- Exact location: `pnpm run test:e2e:ci`
- Evidence: Command timed out after 604 seconds. A leftover process remained:
  `node .../@playwright/test/cli.js test --project=chromium --reporter=list,html`;
  it was stopped manually after the timeout.
- Testing/CI slice update: `playwright-report/data/eadab5862d058d9e58eba62699dd382b983fb419.md`
  records a concrete failed test before timeout:
  `dedupe/create-collision-cross-owner-no-modal.dedupe.spec.ts` failed because
  `seedCollisionListings` returned `{"error":"Not found"}`. The helper route is
  `src/app/api/test-helpers/route.ts`, and it returns 404 unless
  `E2E_TEST_HELPERS === "true"` and the bearer token matches
  `E2E_TEST_SECRET`.
- Failure scenario: The release candidate cannot produce E2E smoke pass/fail
  evidence within the baseline command timeout.
- Impact: Release gate is blocked. Critical browser flows are not yet verified
  for this release candidate.
- Reproduction or test idea: Run `pnpm run test:e2e:ci` and inspect
  `playwright-report` and `test-results` artifacts. If the full suite is too
  large, run critical scoped suites after recording the full-suite blocker.
- Suggested fix direction: Align the release-gate command with the production
  deployment shape by building first, starting `next start`, waiting for
  `/api/health/ready`, and then running the Chromium suite against that
  production server with the existing gated E2E helper environment.
- False-positive challenge: Not a false positive as a baseline gate result; no
  passing E2E evidence was produced.
- Fix summary: User approved changing the E2E gate contract on 2026-05-30.
  `package.json` now routes `pnpm run test:e2e:ci` through
  `scripts/run-playwright-e2e-ci.mjs`. The runner executes `pnpm run build`,
  starts `pnpm exec next start --hostname 0.0.0.0`, waits for
  `/api/health/ready`, and then runs the Chromium Playwright suite with
  `--reporter=list,html --workers=1` unless narrower args are passed. The
  runner supplies the gated local E2E helper environment
  (`E2E_TEST_HELPERS=true` plus bearer secret), disables non-production rate
  limiting and Turnstile for the browser suite, blanks live third-party provider
  keys, uses local location/search provider settings, and does not print
  secrets. Deterministic production-run failures were fixed without hiding
  timeouts: load-more perf now uses the pagination mock, pagination no-next
  assertions use seeded `q=sunset` fixtures, the safety report flow seeds and
  deletes a unique listing while asserting the `/api/reports` response, and the
  production runner isolates Redis/rate-limit and external-provider state.
- Files changed: `package.json`, `scripts/run-playwright-e2e-ci.mjs`,
  `playwright.config.ts`, `src/app/api/test-helpers/route.ts`,
  `src/app/listings/create/CreateListingForm.tsx`,
  `tests/e2e/admin/admin-boundary.spec.ts`, `tests/e2e/auth.setup.ts`,
  `tests/e2e/auth/verify-expired.spec.ts`,
  `tests/e2e/dedupe/create-collision-helpers.ts`,
  `tests/e2e/dedupe/create-collision-cross-owner-no-modal.dedupe.spec.ts`,
  `tests/e2e/create-listing/create-listing-draft.spec.ts`,
  `tests/e2e/create-listing/create-listing-images.spec.ts`,
  `tests/e2e/create-listing/create-listing.perf.spec.ts`,
  `tests/e2e/create-listing/create-listing.visual.spec.ts`,
  create-listing visual snapshots,
  `tests/e2e/page-objects/create-listing.page.ts`,
  `tests/e2e/dedupe/dedupe-helpers.ts`,
  `tests/e2e/dedupe/search-list-expand-panel.dedupe.spec.ts`,
  `tests/e2e/dedupe/search-list-4-clone-grouping.dedupe.spec.ts`,
  `tests/e2e/a11y/listing-detail-a11y.spec.ts`,
  `tests/e2e/concurrent/conversation-dedup.spec.ts`,
  `tests/e2e/responsive/responsive-breakpoints.spec.ts`,
  `tests/e2e/journeys/30-critical-simulations.spec.ts`,
  `tests/e2e/journeys/31-error-empty-state-journeys.spec.ts`,
  `tests/e2e/journeys/28-safety-edge-cases.spec.ts`,
  `tests/e2e/pagination/pagination-core.spec.ts`,
  `tests/e2e/performance/search-interaction-perf.spec.ts`,
  `src/app/saved/SavedListingsClient.tsx`, and
  `docs/review/review_ledger.md`,
  `docs/review/production_readiness_matrix.md`
- Tests added or updated: Updated dedupe helper, collision cleanup, grouped date
  expansion, grouped row alignment, create-listing draft/image/visual/perf E2E
  tests, auth/admin navigation waits, listing-detail a11y contact CTA locator,
  conversation-dedup fixture selection, saved-listings sort label, carousel
  actionability guard, messages empty-state detection, and responsive image
  ratio handling.
- Commands run: `node --check scripts/run-playwright-e2e-ci.mjs` passed;
  `node scripts/run-playwright-e2e-ci.mjs tests/e2e/performance/search-interaction-perf.spec.ts --project=chromium --reporter=list --workers=1`
  passed with 7 passed and 3 skipped; `node scripts/run-playwright-e2e-ci.mjs tests/e2e/create-listing/create-listing.spec.ts tests/e2e/dedupe/create-collision-cross-owner-no-modal.dedupe.spec.ts --grep "F-001|T-20" --project=chromium --reporter=list --workers=1`
  passed with 6 passed and 1 skipped; `node scripts/run-playwright-e2e-ci.mjs tests/e2e/journeys/a11y-perf.spec.ts --project=chromium --reporter=list --workers=1`
  passed with 12 passed and 1 skipped; `node scripts/run-playwright-e2e-ci.mjs tests/e2e/mobile-bottom-sheet.spec.ts --project=chromium --reporter=list --workers=1`
  passed with 18 passed and 9 skipped; `node scripts/run-playwright-e2e-ci.mjs tests/e2e/pagination/pagination-core.spec.ts --grep "4.2 no end-of-results message when all results fit on first page" --project=chromium --reporter=list --workers=1`
  passed with 5 passed and 1 skipped; `node scripts/run-playwright-e2e-ci.mjs tests/e2e/pagination/pagination-core.spec.ts --project=chromium --reporter=list --workers=1`
  passed with 21 passed and 1 skipped; `node scripts/run-playwright-e2e-ci.mjs tests/e2e/journeys/28-safety-edge-cases.spec.ts --grep "J45: Report a Listing" --project=chromium --reporter=list --workers=1`
  passed with 5 passed and 1 skipped; `node scripts/run-playwright-e2e-ci.mjs tests/e2e/journeys/28-safety-edge-cases.spec.ts --project=chromium --reporter=list --workers=1`
  passed with 10 passed and 1 skipped; `pnpm run test:e2e:ci` passed on
  2026-05-30 under the production-build contract with exit code 0, 1026
  passed, 164 skipped, and 4 retry-recovered flaky tests in 35.1 minutes.
- Remaining risk: Four tests were flaky but recovered under Playwright retries:
  `J055-J056` offline message queue, `J34` empty messages state, `SS-05` saved
  search alert toggle, and `SE-C01` chat session-expiry send. The gate runner
  intentionally disables Turnstile, live third-party providers, and
  non-production rate limiting for deterministic local E2E coverage; those
  controls still require their own production/staging verification. Other
  release-blocking matrix rows remain `NotStarted`, so this does not make the
  project production-ready.
- Adversarial re-review: Pass. The final gate uses `next build` plus
  `next start`, so it verifies production bundles instead of masking dev-server
  compile latency. The previous helper 404 path is covered by explicitly
  setting helper env and bearer secret in the server process; the secret is not
  printed, and the helper route remains disabled/404 outside the gated E2E
  environment. Deterministic fixture changes target tests only and do not weaken
  production validation. Residual retry-recovered flakes are recorded as risk,
  not accepted-risk release exceptions.

### P1-PRIVACY-003 - Sentry captured raw PII-bearing exceptions without central scrubbing

- Severity: P1
- Confidence: High
- Status: Fixed on 2026-06-05
- Evidence: The original server Sentry `beforeSend` filter returned reportable
  events unchanged after noise filtering, and `src/lib/api-error-handler.ts`
  passed the original thrown `error` to `Sentry.captureException`. That meant
  PII in exception messages, stack strings, Sentry request data, breadcrumbs,
  contexts, tags, or `extra` could bypass the structured logger redaction path.
- Failure scenario: An API route catches an exception containing an email,
  phone number, street address, SQL fragment, connection string, local path, or
  auth/query token; the API response stays generic, but Sentry receives the raw
  exception or event payload.
- Impact: Sensitive user or infrastructure data could be retained in Sentry,
  increasing privacy and incident-response blast radius.
- Fix summary: Added a pure `src/lib/privacy-redaction.ts` module with shared
  redaction, Sentry event scrubbing, and sanitized exception helpers. `logger.ts`
  now re-exports the shared logger-compatible helpers. Server, edge, and client
  Sentry `beforeSend` hooks scrub reportable events; server transaction events
  are scrubbed after health-check filtering; server and edge explicitly set
  `sendDefaultPii: false`. `captureApiError` now sends a sanitized exception or
  value to Sentry while keeping the original logger behavior and generic API
  response.
- Files changed: `src/lib/privacy-redaction.ts`, `src/lib/logger.ts`,
  `src/lib/api-error-handler.ts`, `sentry.server.config.ts`,
  `sentry.edge.config.ts`, `sentry.client.config.ts`,
  `src/__tests__/lib/privacy-redaction.test.ts`,
  `src/__tests__/lib/api-error-handler.test.ts`, and
  `docs/review/review_ledger.md`.
- Tests added or updated: Added focused Sentry scrubber tests for exception
  values, request URL/query, headers, breadcrumbs, tags, extra, contexts, user
  fields, arrays, nested data, and max-depth handling. Updated API error-handler
  tests to assert Sentry receives sanitized copies rather than raw exceptions.
- Commands run: `pnpm test -- src/__tests__/lib/privacy-redaction.test.ts src/__tests__/lib/api-error-handler.test.ts src/__tests__/lib/logger.test.ts --runInBand`
  passed with 3 suites and 57 tests; `pnpm run typecheck` passed;
  `pnpm exec prettier --check sentry.server.config.ts sentry.edge.config.ts sentry.client.config.ts src/lib/privacy-redaction.ts src/lib/logger.ts src/lib/api-error-handler.ts src/__tests__/lib/privacy-redaction.test.ts src/__tests__/lib/api-error-handler.test.ts`
  passed.
- Remaining risk: No live Sentry project ingest test was run. Sentry
  project-side data scrubbing should remain enabled as defense in depth, but the
  app-level final `beforeSend` hook now scrubs the event before delivery.
- Adversarial re-review: Pass. The fixed path avoids sending
  `hint.originalException`, copies and sanitizes captured API errors without
  mutating originals, keeps existing non-actionable filters, and has focused
  tests proving obvious PII, SQL, paths, auth/query tokens, and user fields are
  removed from Sentry-shaped payloads.

## Deduplication Log

| Candidate ID | Duplicate of | Rationale | Decision |
| ------------ | ------------ | --------- | -------- |

## Fix Order

Fix order is determined after Phase 2 deduplication:

1. P0 issues.
2. P1 auth, authorization, privacy, data integrity, and build/deploy blockers.
3. Other P1 critical-flow regressions.
4. P2 issues that materially reduce launch confidence.
5. P3 backlog.

## Adversarial Re-Review Log

| Finding ID     | Reviewer     | Result  | Evidence                                                                                                                                                                                                                                                                    | Follow-up                                                                                                                        |
| -------------- | ------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| P0-PRIVACY-002 | Codex Critic | Pass    | Focused unit/API scanner tests passed, typecheck passed, search release gate passed, and captured public payload scan returned `{"ok":true,"scannedFiles":4}`.                                                                                                              | Add a deterministic scanner capture wrapper later so `scan:public-payload-pii` can run as a no-arg release gate.                 |
| P1-TEST-001    | Codex Critic | Pass    | Focused CreateListingForm, filter-performance, and neighborhood timing suites passed, then full `pnpm run test` passed with 477 passed suites and 7562 passed tests on 2026-05-30.                                                                                          | None for the Jest release blocker.                                                                                               |
| P1-SUPPLY-001  | Codex Critic | Pass    | `pnpm install --frozen-lockfile`, `pnpm why @lhci/cli fast-uri next eslint-config-next`, and `pnpm audit --audit-level high` passed after removing `@lhci/cli`, upgrading Next packages, and overriding vulnerable `fast-uri` ranges. Recheck on 2026-05-30 still exited 0. | Triage remaining low/moderate advisories as non-blocking backlog.                                                                |
| P1-E2E-001     | Codex Critic | Pass    | User approved the production-build E2E contract on 2026-05-30. `pnpm run test:e2e:ci` now builds, starts `next start`, waits for readiness, and passed with 1026 passed, 164 skipped, 4 retry-recovered flaky tests, and exit code 0 in 35.1 minutes.                  | Track the four retry-recovered flaky tests as reliability follow-up; continue remaining `NotStarted` matrix gates before any release claim. |
| P1-VALIDATION-001 | Codex Critic | Pass | `pnpm run test -- src/__tests__/api/upload-integration.test.ts --runInBand` passed with 22 tests; targeted Auth/AuthZ/Validation Jest run passed with 22 suites and 449 tests; `pnpm run typecheck` passed after the test-only unreachable-branch cleanup. | Continue with the separate uploads/images matrix row for storage permission and URL exposure review. |
| P1-PRIVACY-003 | Codex Critic | Pass | Focused privacy-redaction, api-error-handler, and logger tests passed with 57 tests; `pnpm run typecheck` passed; targeted Prettier check passed on the touched Sentry/privacy files. | Keep Sentry project-side data scrubbing enabled as defense in depth; no live Sentry ingest test was run. |
