# Phase 10: Launch Hardening + Drills

## Goal And Success Criteria

Finish the contact-first migration by proving the Phase 01-09 system can be
operated safely at launch: runbooks are complete, kill switches are exercised,
drills produce deterministic evidence, public payloads are scanned for PII,
SLO alert stubs are repo-tracked, and the Definition-of-Done checklist maps
every launch item to a test, script, runbook, or human signoff.

Phase 10 is approved only when the launch-hardening checks pass, local
Postgres-backed E2E seed is unblocked or explicitly recorded with evidence, the
Critic signs off, and the final state records launch readiness rather than a
new implementation phase.

## Ordered Slices

1. Planning and prerequisite gate: create this spec, document infra preflight,
   and make the `localhost:5433` Postgres prerequisite explicit for final launch
   approval.
2. Runbooks and launch checklist: add missing launch runbooks, a kill-switch
   catalog, and `docs/launch/definition-of-done.md` with evidence links.
3. SLO and observability evidence: add Vercel/Sentry-ready SLO config stubs and
   parseability/completeness tests without requiring live credentials.
4. Drill and chaos harness: add deterministic repo-local helpers/tests for
   identity merge/split, embedding swap/rollback, restore smoke,
   emergency-open audit, degraded safe mode, and Phase 10 chaos scenarios.
5. PII scanner and CI gate: add a public-payload PII scanner, clean/leaking
   fixtures, tests, package script, and CI job wiring.
6. Closeout: run Phase 10 targeted checks plus focused regressions, write
   implementation/review artifacts, add `APPROVED`, and update state to
   launch-ready only after approval and human signoff evidence.

## Target Subsystems

- `.orchestrator/phases/phase-10-launch-hardening-drills/*`
- `docs/runbooks/*`, `docs/launch/*`, and `ops/slo/*`
- `src/lib/launch/*` and `src/__tests__/launch/*`
- `scripts/scan-public-payload-pii.js`, script fixtures, `package.json`, and
  CI workflow checks

## Invariants And Constraints

- No schema changes and no new production dependencies in this phase unless a
  hard blocker triggers a replan and explicit approval.
- Production feature enablement remains a human launch decision; Phase 10 proves
  gates and runbooks but does not auto-launch production traffic.
- Drill payloads, logs, fixtures, SLO stubs, and scanner output must avoid raw
  emails, raw phone numbers, exact addresses, unit numbers, precise coordinates,
  and private listing data.
- Vercel/Sentry alert mappings are repo-tracked stubs; no live PagerDuty or
  account credentials are required.
- Existing unrelated untracked local artifacts remain untouched.

## Acceptance Criteria

- Every Phase 10 kill switch has a catalog entry, operator procedure, expected
  degraded behavior, rollback step, and deterministic test reference.
- Identity MERGE and SPLIT drills produce zero anomalies for downstream
  contact, entitlement, saved item, review, and search-order state.
- Embedding shadow swap drill proves target version publication, stale previous
  version handling, rollback read-version behavior, and tombstone coverage
  during the swap window.
- Restore drill documents backup, restore, semantic smoke, and outbox replay
  posture with a deterministic smoke helper.
- Chaos scenarios produce documented degraded behavior, no data corruption, and
  no privacy-leak allowance.
- `ops/slo/` contains complete Vercel/Sentry-ready paging stubs for the launch
  categories from Phase 10.
- Emergency-open paywall drill proves `EMERGENCY_GRANT` audit creation,
  scheduled post-flag fraud audit, and normal enforcement restoration.
- PII scanner fails synthetic public-payload leaks and passes clean fixtures.
- CI runs the clean PII scanner gate.
- `docs/launch/definition-of-done.md` maps every §23 item to evidence and
  records human launch signoff.

## Validation Commands

- `pnpm test -- --runTestsByPath src/__tests__/launch/phase10-launch-hardening.test.ts --runInBand`
- Phase 09 targeted Jest set.
- Phase 08 public-cache focused set.
- Phase 07 saved-search/alerts focused set.
- Phase 06 payments/contact focused set.
- Phase 04 search focused set.
- Phase 02 projection/outbox focused set.
- `pnpm exec prisma validate`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm run scan:public-payload-pii -- scripts/fixtures/public-payload-clean.json`
- `pnpm run seed:e2e` after local Postgres is available on `localhost:5433`

## Rollback Notes

Phase 10 is additive launch hardening. Rollback is removal of the new docs,
tests, SLO stubs, PII scanner script/CI job, and launch orchestration artifacts.
Runtime behavior remains controlled by the Phase 01-09 feature flags and kill
switches. If a launch drill exposes unsafe behavior, keep production defaults
off and use degraded-safe mode: list-only search, semantic disabled, phone
reveal disabled, new publication disabled, payments frozen/disabled as needed,
alerts disabled, and public cache push paused.
