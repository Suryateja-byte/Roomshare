# Goal Progress: CSRF Route Variants

Status: closed for deterministic route-handler Jest coverage on 2026-05-12.

## Scope

This slice covered the Contact Host mutation routes documented in this feature
package:

- `POST /api/messages`
- `POST /api/payments/checkout`

It did not run a live Next server or direct HTTP transport capture. Live-server
API parity remains a separate optional P2 confidence item.

## Evidence

- Source: `src/lib/csrf.ts` requires `Origin` for mutation requests, rejects
  malformed origins, rejects origin/host mismatch, allows strict same-origin,
  and allows localhost origin/host variants in development.
- Source: `src/app/api/messages/route.ts:295-296` calls `validateCsrf` before
  auth and body parsing.
- Source: `src/app/api/payments/checkout/route.ts:163-164` calls
  `validateCsrf` before rate limiting, auth, and checkout work.
- Test source: `src/__tests__/api/messages.test.ts:317-415` covers missing
  Origin, malformed Origin, mismatched Origin, valid same-origin, and
  localhost-development allowance.
- Test source: `src/__tests__/api/payments-checkout-route.test.ts:202-325`
  covers the same variants for checkout creation.
- Command: `pnpm test -- src/__tests__/api/messages.test.ts src/__tests__/api/payments-checkout-route.test.ts --runInBand`
  passed with 2 suites and 42 tests.

## Classification

Closed: route-level CSRF variant coverage is now proven for deterministic
route-handler Jest. The invalid-origin route tests fail before `auth()`, and the
checkout invalid-origin tests also fail before listing lookup. The valid
same-origin and localhost-development allowance tests reach `auth()` and return
`401` with auth mocked absent, which proves the CSRF helper allowed the request
to continue.

No production code changed.

## Remaining Separate Gaps

- Optional direct HTTP live-server API parity.
- Real payment-provider/webhook fulfillment.
- Email delivery runtime verification.
- Suspended/blocked listing-detail Chromium execution.
- Provider-level Supabase realtime/RLS.
