# Evidence-Gated Release Readiness Harness

This directory is the control surface for Roomshare production-readiness work.
It prevents open-ended "review everything" loops by requiring bounded review
slices, evidence-backed findings, one canonical issue ledger, and explicit
release gates.

## Operating Standard

Production-ready means:

> No known P0/P1 release-blocking issues remain, all critical flows are covered
> by tests, security and supply-chain scans are clean or explicitly triaged,
> staging behaves like production, rollback is ready, and observability is
> active.

No AI review can prove there are zero issues in a large codebase. The release
decision is based on gate evidence and triaged risk, not on "no more findings."

## Severity Model

| Severity | Meaning | Release decision |
| --- | --- | --- |
| P0 | Exploitable security issue, data corruption, auth bypass, production cannot build or deploy | Must fix before release |
| P1 | Serious regression, critical flow broken, missing validation on public surface, high-risk race condition | Must fix before release |
| P2 | Important reliability, UX, performance, observability, or test gap | Fix before scale or soon after launch |
| P3 | Cleanup, refactor, maintainability, non-critical polish | Backlog |

Every finding must include confidence: `High`, `Medium`, or `Low`.

## Evidence Contract

A confirmed finding must include all of this:

- Stable ID from `docs/review/review_ledger.md`.
- Severity and confidence.
- Exact file, function, route, action, component, migration, workflow, or test.
- Code, test, runtime, or scanner evidence.
- Concrete failure scenario.
- User, data, security, operational, or release impact.
- Reproduction steps or a regression test idea.
- Suggested fix direction.
- Duplicate status against the current ledger.

Speculative items belong in `docs/review/risk_register.md` as `HYPOTHESIS`,
not in the confirmed ledger.

## Required Files

- `docs/review/system_map.md`: filled during Phase 1 before specialist audit.
- `docs/review/review_ledger.md`: one canonical issue ledger and fix log.
- `docs/review/production_readiness_matrix.md`: release gates and evidence.
- `docs/review/risk_register.md`: hypotheses, accepted risks, unknowns, and
  re-review decisions.
- `docs/review/code_review.md`: this operating manual.

## Phase 0 - Freeze And Baseline

Do this before the actual audit starts:

1. Reconcile or intentionally preserve the current dirty worktree.
2. Create the audit branch from the intended baseline.
3. Install dependencies without changing the lockfile.
4. Run baseline gates and record results in the matrix.

Recommended commands for this repo:

```bash
git status --short
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run scan:public-payload-pii
pnpm audit --audit-level high
pnpm run test:e2e:ci
```

Search-specific gates:

```bash
pnpm run test:e2e:search-release-gate
pnpm exec playwright test tests/e2e/search --project=chromium
```

Create-listing gates:

```bash
pnpm exec playwright test tests/e2e/create-listing --project=chromium
pnpm exec playwright test tests/e2e/dedupe --project=chromium
```

Do not hide baseline failures. Record them as `Fail` or `Blocked` in the matrix
and add a ledger entry if they block reliable review.

## Phase 1 - System Map

Before recording findings, fill `docs/review/system_map.md` with:

1. System overview.
2. Route, API, and server-action map.
3. Auth and authorization boundaries.
4. Database model and migration map.
5. External dependency and environment map.
6. Critical user flows.
7. Critical invariants.
8. Review-slice DAG.
9. Unknowns and missing docs.

The map is read-only. It should identify where to review next, not fix code.

## Phase 2 - Specialist Audit Slices

Run bounded read-only reviews. Use real subagents only when the user explicitly
asks for delegation; otherwise run these sequentially in-thread.

| Slice | Primary focus |
| --- | --- |
| Auth/AuthZ/Sessions | login, signup, session lifetime, route guards, ownership checks |
| API validation/server actions | public inputs, schemas, CSRF-sensitive paths, error handling |
| Database/migrations/data integrity | constraints, indexes, cascades, unsafe migrations, Prisma usage |
| Business invariants/concurrency | listings, holds, bookings, messaging, duplicate prevention, races |
| Frontend/SSR/CSR/state/a11y | hydration, URL state, role/label semantics, crash states |
| Security/OWASP ASVS | injection, upload safety, privacy, secrets, abuse controls |
| Testing/CI/release gates | coverage, isolation, flake risk, missing blockers |
| Observability/performance/deployment | Sentry, logs, health, env vars, rollback, Lighthouse/load |
| Dependencies/supply chain/secrets | audit, lockfile, vulnerable packages, secret exposure |

Each slice writes proposed findings into the ledger only after deduplication and
self-challenge. Weak or speculative items go to the risk register.

## Phase 3 - Scanner And CI Evidence

AI review does not replace deterministic checks. Record evidence from:

- TypeScript typecheck.
- ESLint.
- Jest unit, API, component, integration, property, and regression tests.
- Next production build.
- Playwright E2E suites.
- PII/public payload scanner.
- Dependency audit.
- CodeQL or equivalent code scanning.
- Dependabot alerts and dependency review.
- Secret scanning and push protection where available.
- Migration validation.
- Staging smoke tests.

Release blockers must be tagged in the matrix.

## Fix Workflow

Fix exactly one P0/P1 issue at a time.

1. Restate the issue and evidence.
2. Choose the smallest safe fix.
3. Add or update a regression test when practical.
4. Edit only the relevant files.
5. Run the smallest relevant test first.
6. Run all relevant release gates.
7. Update `docs/review/review_ledger.md` with fix evidence.
8. Run adversarial re-review for fixed P0/P1 issues.

Use separate branches for independent fixes when practical. Do not allow
parallel writers in shared auth, routing, validation, Prisma, migration, or
critical state-machine areas.

## Master Audit Prompt

```text
I want a production-readiness audit of this repository.

Rules:
- Do not edit code in this phase.
- Do not give vague issues.
- Do not repeat duplicates.
- Do not mark speculative ideas as confirmed bugs.
- A finding is valid only if it has exact code evidence, failure mode, impact,
  and reproduction/test idea.
- Use severity P0/P1/P2/P3.
- P0/P1 are release blockers.
- P2/P3 are not release blockers unless they combine into a major risk.
- Challenge your own findings and remove weak ones.
- Write all confirmed results into docs/review/review_ledger.md.

Workflow:
1. Build docs/review/system_map.md.
2. Run bounded read-only specialist audits.
3. Deduplicate all findings.
4. Produce or update docs/review/production_readiness_matrix.md.
5. Produce a recommended fix order.
6. End with release blockers, non-blocking risks, missing verification gates,
   and exact next commands/tests to run.

Do not fix code until I explicitly ask.
```

## Primary References For Future Audit Research

Use primary sources when external standards, framework behavior, or security
guidance materially affects a finding or gate:

- OpenAI Codex best practices, models, config, subagents, onboarding, and
  GitHub review docs.
- Next.js production checklist.
- Playwright best practices.
- OWASP ASVS and OWASP Top 10.
- GitHub CodeQL, Dependabot, dependency review, and secret scanning docs.
- NIST SSDF.
- SLSA supply-chain guidance.
