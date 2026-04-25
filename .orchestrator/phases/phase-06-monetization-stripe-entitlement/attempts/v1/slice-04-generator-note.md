# Slice 04 Generator Note

## Slice Completed

Entitlement paywall ordering, `REVEAL_PHONE` contact-kind wiring, and emergency-open behavior.

## Files Changed

- `src/lib/payments/contact-paywall.ts`
- `src/lib/payments/emergency-open.ts`
- `src/lib/payments/checkout-session-status.ts`
- `src/lib/payments/telemetry.ts`
- `src/app/api/payments/checkout/route.ts`
- `src/app/api/payments/checkout-session/route.ts`
- `src/lib/contact/phone-reveal.ts`
- `src/__tests__/lib/payments/contact-paywall.test.ts`
- `src/__tests__/lib/contact/phone-reveal.test.ts`

## Checks Run

- `pnpm test -- --runTestsByPath src/__tests__/lib/payments/contact-paywall.test.ts src/__tests__/lib/contact/phone-reveal.test.ts src/__tests__/api/payments-checkout-route.test.ts src/__tests__/api/payments-checkout-session-route.test.ts src/__tests__/lib/payments/checkout-session-status.test.ts src/__tests__/lib/payments/webhook-worker.test.ts --runInBand`
- `pnpm typecheck`

## Assumptions Followed

- `REVEAL_PHONE` burns and restores separately from `MESSAGE_START`.
- Paywall order is freeze gate, active pass, free credits, paid pack credits, then purchase-required response.
- Emergency-open grants are audit-only bypasses and do not mutate contact consumption.

## Remaining Risks

- Restoration and refund math are completed in the next slice.
- Emergency-open post-flag audit scheduling is currently represented by `fraud_audit_jobs`; worker execution is reserved for operational follow-up.
