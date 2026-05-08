# Production Readiness Matrix

Status values:

- `NotStarted`: gate has not been run for this audit.
- `Pass`: gate passed with recorded evidence.
- `Fail`: gate failed and is release-blocking or needs triage.
- `Triaged`: failure or gap is accepted with rationale in the risk register.
- `Blocked`: gate cannot run because prerequisite setup is missing.
- `Advisory`: useful signal, not release-blocking.

| Area | Gate | Required evidence | Release blocking | Status | Evidence / notes |
| --- | --- | --- | --- | --- | --- |
| Baseline | Dirty worktree reconciled or intentionally preserved | `git status --short` captured | Yes | Pass | Current dirty worktree accepted as release candidate baseline by user. Branch `codex/search-ux-fixes`, HEAD `b3e3b0f4`, captured `2026-05-06T23:45:04Z`, 100 changed/untracked entries. |
| Dependencies | Lockfile install succeeds | `pnpm install --frozen-lockfile` | Yes | Pass | Passed. pnpm reused/downloaded packages and ran `prisma generate`. Warning: build scripts ignored for several packages; review during supply-chain slice. |
| Type safety | Typecheck passes | `pnpm run typecheck` | Yes | Pass | Passed. `prisma generate`, `next typegen`, and `tsc --noEmit` completed. |
| Lint | ESLint passes | `pnpm run lint` | Yes | Pass | Passed with 19 warnings and 0 errors. Warnings are advisory unless tied to concrete failures during audit. |
| Unit/API/component tests | Jest suite passes | `pnpm run test` | Yes | Fail | Failed: 8 suites failed, 16 tests failed, 7485 passed, 8 skipped. See `P1-TEST-001`. |
| Build | Production build passes | `pnpm run build` | Yes | Pass | Passed. Warnings: custom Cache-Control headers, Sentry/OpenTelemetry dynamic dependency warnings, edge runtime disables static generation for edge pages. |
| Public payload privacy | PII/public payload scan passes | `pnpm run scan:public-payload-pii -- <captured-payloads>` | Yes | Pass | Passed against real captured local payloads from `/api/search/v2`, `/api/search/listings`, `/api/map-listings`, and `/api/listings`: `{"ok":true,"scannedFiles":4}`. The no-arg scanner wrapper remains a separate follow-up under `P1-PRIVACY-001`; the concrete payload leak is fixed under `P0-PRIVACY-002`. |
| Dependency audit | No untriaged high/critical vulnerable dependencies | `pnpm audit --audit-level high` | Yes | Fail | Failed with 13 vulnerabilities: 6 high, 5 moderate, 2 low. High advisories include lodash/lodash-es and basic-ftp transitive paths under `@lhci/cli`. See `P1-SUPPLY-001`. |
| E2E smoke | Chromium Playwright suite passes | `pnpm run test:e2e:ci` | Yes | Blocked | Timed out after 10 minutes. Playwright artifact shows dedupe helper call `seedCollisionListings` failed with `{\"error\":\"Not found\"}` before timeout. A leftover Playwright process was stopped manually. See `P1-E2E-001`. |
| Search/map E2E | Search release gate passes | `pnpm run test:e2e:search-release-gate` | Yes | Pass | Passed after Docker/Postgres became reachable: 36 passed, 16 skipped across SSR/client search release gate runs. |
| Create listing E2E | Create-listing and dedupe suites pass | `pnpm exec playwright test tests/e2e/create-listing --project=chromium`; `pnpm exec playwright test tests/e2e/dedupe --project=chromium` | Yes | NotStarted | |
| Auth | Protected routes and actions verified | Code review plus regression tests | Yes | NotStarted | |
| Authorization | Users cannot access or mutate others' data | Code review plus tests | Yes | NotStarted | |
| Validation | Public inputs validated server-side | Zod/schema/action/API review plus tests | Yes | NotStarted | |
| Database | Constraints, indexes, cascades, and migrations safe | Prisma/migration review plus migration validation | Yes | NotStarted | |
| Business invariants | Listings, availability, contact, messaging, booking, and dedupe invariants hold | State-machine review plus tests | Yes | NotStarted | |
| Uploads/images | File type, size, storage permissions, and URL exposure safe | Upload review plus tests/mocks | Yes | NotStarted | |
| Security controls | OWASP ASVS-relevant controls checked | Review ledger, scanner evidence, tests | Yes | NotStarted | |
| Secrets | No secrets in repo, logs, or client bundle | Secret scan plus code/log review | Yes | NotStarted | |
| CI security | CodeQL, Dependabot alerts, dependency review, and secret scanning configured or triaged | GitHub settings/workflow evidence | Yes | NotStarted | |
| Observability | Sentry/logging/health checks active and safe | Staging evidence, runbook, log review | Yes | NotStarted | |
| Performance | Critical pages have acceptable performance | Lighthouse/load/manual evidence | Advisory | NotStarted | |
| Rollback | Rollback and migration plan exists | Runbook or deployment procedure | Yes | NotStarted | |
| Staging parity | Staging behaves like production for critical flows | Smoke test report and env review | Yes | NotStarted | |

## Release Candidate Rule

Declare release candidate only when:

- Every `Release blocking = Yes` row is `Pass` or `Triaged`.
- Every `Triaged` row links to a risk-register entry with owner, rationale,
  expiration or follow-up, and rollback/mitigation.
- No open `P0` or `P1` findings remain in `docs/review/review_ledger.md`.
- Fixed `P0` and `P1` findings have adversarial re-review evidence.
