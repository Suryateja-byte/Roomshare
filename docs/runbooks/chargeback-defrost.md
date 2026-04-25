# Chargeback Defrost Runbook

Phase 06 freezes entitlement grants when Stripe opens a chargeback and restores
or revokes them only from verified Stripe dispute events.

## Preconditions

- `/api/stripe/webhook` is receiving verified Stripe events.
- `PAYMENT_WEBHOOK` outbox rows are draining.
- `stripe_events.processing_status` has no stuck `PROCESSING` rows for the dispute.

## Defrost After a Won Dispute

1. Confirm the Stripe dispute is closed with outcome `won`.
2. Confirm the matching `payment_disputes` row has `status='WON'`.
3. Confirm the linked `entitlement_grants` row moved from `FROZEN` to `ACTIVE`
   or `EXPIRED` if the pass window elapsed while frozen.
4. Confirm `entitlement_state.freeze_reason='NONE'` after rebuild.
5. Confirm an `ENTITLEMENT_RESTORED` audit event exists for the grant.

## Lost Dispute

1. Confirm the Stripe dispute is closed with outcome other than `won`.
2. Confirm the matching `payment_disputes` row has `status='LOST'`.
3. Confirm the linked grant has `status='REVOKED'`.
4. Confirm `ENTITLEMENT_REVOKED` was audited.
5. Leave any refunds or manual remediation to support tooling; do not create
   manual credits outside the entitlement ledger.

## Stuck or Out-of-Order Events

- If a dispute event arrives before the payment/grant, Phase 06 marks the
  captured Stripe event retryable and sets `next_attempt_at`.
- Do not mark a retrying event processed manually unless the ledger was
  reconciled and an audit note exists.
- If emergency customer access is required, use the emergency open paywall
  runbook and schedule the post-flag fraud review.
