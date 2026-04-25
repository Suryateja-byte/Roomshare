# Phase 06: Monetization, Stripe, Entitlement

## Goal And Success Criteria

Complete the existing payments foundation into a canonical, replay-safe
monetization system for contact-host, phone reveal, and saved-search alert
gates. The phase is approved when Stripe webhook effects are exactly-once,
entitlement state is rebuildable from ledger truth, gated actions are always
server-evaluated, refund/chargeback/restoration paths are deterministic, and
the Phase 06 artifacts close with a Critic approval.

## Ordered Slices

1. Planning artifact and schema: add this artifact, additive migration, PGlite
   fixture coverage, `REVEAL_PHONE`, restoration/fraud fields, Stripe event
   processing fields, grant deltas, and indexes.
2. Stripe capture and async worker: keep raw-body signature verification in the
   route, persist `stripe_events`, enqueue `PAYMENT_WEBHOOK`, and process
   payment/refund/dispute/grant effects in the outbox worker serialized by
   user.
3. Checkout and abuse controls: add retry-safe Stripe idempotency keys, server
   catalog validation, payment kill switches, checkout throttles, free-credit
   farming signals, and log-safe abuse telemetry.
4. Entitlement and paywall enforcement: make paywall order explicit, wire
   `MESSAGE_START` and `REVEAL_PHONE`, add emergency-open/freeze behavior, and
   keep client entitlement state informational only.
5. Adjustments, restoration, alerts, runbooks: finish refund/chargeback math,
   banned-user auto-refund queueing, host-bounce/support restoration, alert
   deliver-time publish revalidation, and runbooks.
6. Closeout: run targeted/regression checks, write generator/review artifacts,
   add `APPROVED`, and advance state to Phase 07 pending after Critic approval.

## Invariants And Constraints

- Existing dirty worktree changes are preserved.
- Schema work is expand-only; destructive cleanup remains Phase 09.
- `CONTACT_PACK_3` stays the internal product code. Public text may say
  "Mini Pack".
- `REVEAL_PHONE` is a separate `ContactKind`; reveal consumption/restoration is
  independent from `MESSAGE_START`.
- Stripe price IDs and amounts are server authority. The client never supplies
  amount, currency, or entitlement grants.
- Production never grants from Stripe test-mode (`livemode=false`) events.
- Gated actions fail closed except the explicit `emergency_open_paywall` kill
  switch, which logs auditable emergency grants.
- Logs and audit details avoid PII; identifiers are hashed before telemetry
  labels.

## Acceptance Criteria

- Webhook replay and concurrent fulfillment produce exactly one payment effect
  and at most one entitlement grant.
- `payment_intent.succeeded` with wrong amount/currency/product refuses the
  grant and records an audit/telemetry signal.
- Pass extension starts from `max(now, current_active_window_end)` and stores
  grant deltas so refund/replay math is deterministic.
- Out-of-order refunds/disputes retry instead of granting or revoking against a
  missing payment.
- Chargeback open freezes new gated actions; won defrosts; lost fully revokes.
- Banned-user in-flight payment stores economic truth, queues auto-refund, and
  never grants entitlement.
- Free credits are consumed before paid packs; pass actions log zero-credit
  consumption.
- Host bounce, host ban, host mass deactivation, host ghost SLA, and support
  restoration each apply exactly once with audit evidence.
- Saved-search alert delivery skips tombstoned/unpublished targets.
- Kill switches `disable_payments`, `freeze_new_grants`, and
  `emergency_open_paywall` have focused tests and runbook coverage.

## Validation Commands

- `pnpm test -- --runTestsByPath src/__tests__/db/phase06-schema.test.ts --runInBand`
- Phase 06 targeted payments/contact/alert Jest set.
- Phase 05 targeted Jest set.
- Phase 04, Phase 03, and Phase 02 focused regression sets.
- `pnpm exec prisma validate`
- `pnpm typecheck`
- `pnpm lint`
- Optional: `pnpm test --runInBand`; record unrelated pre-existing failures.

## Rollback Notes

All Phase 06 schema changes are additive. Rollback is disabling payment flags
first (`KILL_SWITCH_DISABLE_PAYMENTS=true`, `ENABLE_CONTACT_PAYWALL=false`,
`ENABLE_CONTACT_PAYWALL_ENFORCEMENT=false`, `ENABLE_SEARCH_ALERT_PAYWALL=false`)
and leaving ledgers intact. If a full schema rollback is required in the
pre-launch dummy-data environment, drop Phase 06-only tables and columns using
the rollback comments in the migration; enum value removal requires restoring
from backup or rebuilding the enum in a maintenance window.

## Research Summary

- Stripe requires webhook signature verification against the raw request body.
- Stripe fulfillment handlers must be safe under repeated or concurrent calls
  for the same Checkout Session.
- Stripe POST requests support idempotency keys for safe retry after network or
  server failures.

Sources: https://docs.stripe.com/webhooks?lang=node,
https://docs.stripe.com/checkout/fulfillment,
https://docs.stripe.com/api/idempotent_requests?lang=nodejs.
