# Slice 05 Generator Note

## Slice Completed

Refunds, chargebacks, restorations, saved-alert delivery revalidation, and runbooks.

## Files Changed

- `src/lib/payments/entitlement-adjustments.ts`
- `src/lib/payments/webhook-worker.ts`
- `src/lib/payments/contact-restoration.ts`
- `src/lib/payments/telemetry.ts`
- `src/lib/search-alerts.ts`
- `src/__tests__/lib/payments/entitlement-adjustments.test.ts`
- `src/__tests__/lib/payments/contact-restoration.test.ts`
- `src/__tests__/lib/payments/webhook-worker.test.ts`
- `src/__tests__/lib/search-alerts.test.ts`
- `docs/runbooks/chargeback-defrost.md`
- `docs/runbooks/emergency-open-paywall.md`

## Checks Run

- `pnpm test -- --runTestsByPath src/__tests__/lib/payments/entitlement-adjustments.test.ts src/__tests__/lib/payments/contact-restoration.test.ts src/__tests__/lib/search-alerts.test.ts src/__tests__/lib/payments/webhook-worker.test.ts src/__tests__/lib/payments/contact-paywall.test.ts src/__tests__/lib/contact/phone-reveal.test.ts --runInBand`
- `pnpm typecheck`

## Assumptions Followed

- Out-of-order refund and dispute events are retryable until their payment and grant links exist.
- Chargeback open freezes the grant; won disputes restore active/non-expired grants; lost disputes revoke.
- Host-bounce and support restorations reuse the existing idempotent restoration ledger.
- Saved-search alerts revalidate public visibility immediately before delivery.

## Remaining Risks

- Refund execution for banned-user auto-refund queue items remains an operational worker follow-up.
- Support restoration has a programmatic helper; no admin UI is added in this phase.
