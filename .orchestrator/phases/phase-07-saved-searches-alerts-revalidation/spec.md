# Phase 07: Saved Searches + Alerts Revalidation

## Goal And Success Criteria

Upgrade saved-search alerts into an additive, rollback-safe, durable system. The
phase is approved when saved searches carry canonical query metadata, alert
subscriptions and delivery attempts are replay-safe, matching and delivery can
pause independently through a kill switch, and every outbound alert is
revalidated against current preferences, entitlement, subscription state, and
public target visibility.

## Ordered Slices

1. Schema and fixtures: add this artifact, an expand-only migration, Prisma
   models, PGlite fixture coverage, status/drop constraints, idempotency
   indexes, and legacy-row compatibility tests.
2. Canonical saved-search contract: write normalized search spec/hash/version
   metadata on save, mirror legacy alert fields into EMAIL subscriptions, and
   keep existing actions and UI response shapes backward-compatible.
3. Durable match and delivery workers: create delivery records from daily and
   instant alert matching, enqueue `ALERT_DELIVER`, and make matching safe under
   retries through stable idempotency keys.
4. Final revalidation and safety: before sending, re-check user preferences,
   pass/paywall state, subscription state, target public visibility, and kill
   switch state; drop unsafe targets with auditable reasons and no outbound
   link.
5. Closeout: add runbook coverage, run targeted and regression checks, write
   generator/review artifacts, add `APPROVED`, and advance state to Phase 08
   pending after Critic approval.

## Target Subsystems

- `prisma/schema.prisma`, additive migration SQL, and PGlite test fixtures.
- Saved-search server actions, parser/canonicalization helpers, and alert
  paywall integration.
- `src/lib/search-alerts.ts` and outbox append/handler routing for
  `ALERT_MATCH` and `ALERT_DELIVER`.
- `src/lib/env.ts` for `KILL_SWITCH_DISABLE_ALERTS`.
- Saved-search/search-alert/outbox/schema tests and a saved-alert runbook.

## Invariants And Constraints

- Preserve existing dirty worktree changes and existing public UI contracts.
- Keep Phase 07 additive only; destructive cleanup is reserved for Phase 09.
- Public browsing/search remains free; only saved-search alert delivery is
  pass-gated.
- Existing saved searches remain readable without a mandatory backfill; missing
  canonical metadata is repaired lazily on save/read/match.
- Logs and audit details avoid PII; user emails are never logged.
- No new production dependency is introduced.

## Acceptance Criteria

- Legacy `SavedSearch` rows without Phase 07 metadata still load and can be
  matched or repaired lazily.
- New saved searches persist normalized spec JSON, query hash, current
  embedding/ranker versions, identity epoch floor, and an EMAIL subscription.
- Toggling alerts mirrors both legacy fields and subscription state.
- Daily and instant alert matching create durable delivery records and do not
  send directly from match code.
- Delivery retry cannot send duplicates for the same
  user/search/subscription/target/version window.
- Delivery drops targets that are missing, tombstoned, suppressed,
  unpublished, stale-epoch, paywall-locked, preference-disabled, or paused by
  `disable_alerts`.
- `ALERT_MATCH` and `ALERT_DELIVER` are handled by the outbox drain worker.

## Validation Commands

- `pnpm test -- --runTestsByPath src/__tests__/db/phase07-schema.test.ts --runInBand`
- Phase 07 targeted saved-search/search-alert/outbox Jest set.
- Existing saved-search, search-alert, payments alert-paywall, and outbox
  handler tests.
- Phase 06 targeted Jest set.
- Phase 04 search focused set.
- `pnpm exec prisma validate`
- `pnpm typecheck`
- `pnpm lint`
- Optional: `pnpm test --runInBand`; record unrelated existing failures.

## Rollback Notes

Rollback is operationally first: set `KILL_SWITCH_DISABLE_ALERTS=true` to stop
matching and delivery while leaving saved searches and pending records intact.
The migration is expand-only; in the pre-launch dummy-data environment, full
schema rollback is dropping Phase 07-only indexes, `alert_deliveries`,
`alert_subscriptions`, and Phase 07-only `SavedSearch` columns. Existing legacy
`SavedSearch` fields are not removed or renamed.

## Research Summary

No external browsing was required. The plan is based on the repo-local master
plan v10, the approved Phase 04 query-hash/snapshot contract, and the approved
Phase 06 alert paywall and deliver-time visibility revalidation foundation.
