# Review Ledger

This is the single source of truth for production-readiness findings and fix
evidence. Do not record duplicates. Do not record unsupported speculation as a
confirmed issue.

## Ledger Status

- Audit status: `Phase2TestingCiAudited`
- Release candidate status: `NotReady`
- Open P0 count: `0`
- Open P1 count: `3`
- Last updated: `2026-05-08`

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

### P1-TEST-001 - Jest baseline gate fails

- Severity: P1
- Confidence: High
- Status: Open
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
- Fix summary:
- Files changed:
- Tests added or updated:
- Commands run: `pnpm run test`;
  `pnpm exec jest src/__tests__/lib/search/search-query.test.ts src/__tests__/lib/search/search-doc-queries.test.ts src/__tests__/lib/search-alerts.test.ts --runInBand --silent`
- Remaining risk: Full test suite is not a passing release gate.
- Adversarial re-review:

### P1-SUPPLY-001 - Dependency audit reports untriaged high vulnerabilities

- Severity: P1
- Confidence: High
- Status: Open
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
- Fix summary:
- Files changed:
- Tests added or updated:
- Commands run: `pnpm audit --audit-level high`
- Remaining risk: No supply-chain exception or mitigation has been recorded.
- Adversarial re-review:

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
- Status: Open
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
- Suggested fix direction: First align local release-gate environment with CI
  (`E2E_TEST_HELPERS=true`, `E2E_TEST_SECRET`, seeded DB, and feature flags) or
  gate helper-dependent specs out of the local smoke command. Then split full
  E2E from the release smoke so one failing helper path cannot hide suite-wide
  progress behind a timeout.
- False-positive challenge: Not a false positive as a baseline gate result; no
  passing E2E evidence was produced.
- Fix summary:
- Files changed:
- Tests added or updated:
- Commands run: `pnpm run test:e2e:ci`
- Remaining risk: Browser release smoke coverage is missing.
- Adversarial re-review:

## Deduplication Log

| Candidate ID | Duplicate of | Rationale | Decision |
| --- | --- | --- | --- |

## Fix Order

Fix order is determined after Phase 2 deduplication:

1. P0 issues.
2. P1 auth, authorization, privacy, data integrity, and build/deploy blockers.
3. Other P1 critical-flow regressions.
4. P2 issues that materially reduce launch confidence.
5. P3 backlog.

## Adversarial Re-Review Log

| Finding ID | Reviewer | Result | Evidence | Follow-up |
| --- | --- | --- | --- | --- |
| P0-PRIVACY-002 | Codex Critic | Pass | Focused unit/API scanner tests passed, typecheck passed, search release gate passed, and captured public payload scan returned `{"ok":true,"scannedFiles":4}`. | Add a deterministic scanner capture wrapper later so `scan:public-payload-pii` can run as a no-arg release gate. |
