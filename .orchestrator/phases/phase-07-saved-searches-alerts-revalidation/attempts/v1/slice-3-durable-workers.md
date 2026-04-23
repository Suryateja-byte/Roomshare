# Slice 3: Durable Match + Delivery Workers

## Slice Completed

Converted saved-search matching to enqueue durable alert delivery records and
outbox `ALERT_DELIVER` work instead of sending email/notifications directly
from match code. Added outbox kind support for `ALERT_MATCH` and
`ALERT_DELIVER`, plus a delivery worker entrypoint.

## Files Changed

- `src/lib/search-alerts.ts`
- `src/lib/outbox/append.ts`
- `src/lib/outbox/handlers.ts`
- `src/__tests__/lib/search-alerts.test.ts`
- `src/__tests__/lib/search-alerts-telemetry.test.ts`
- `src/__tests__/lib/outbox/handlers.test.ts`

## Checks Run

- `pnpm exec prisma generate` - passed.
- `pnpm test -- --runTestsByPath src/__tests__/actions/saved-search.test.ts src/__tests__/lib/search-alerts.test.ts src/__tests__/lib/search-alerts-telemetry.test.ts --runInBand` - passed, 3 suites / 62 tests.
- `pnpm test -- --runTestsByPath src/__tests__/lib/outbox/handlers.test.ts --runInBand` - passed, 1 suite / 18 tests.
- `pnpm exec tsc --noEmit --pretty false` - passed.

## Assumptions Followed

- Existing exported result shapes remain unchanged; `alertsSent` / `sent` now
  count queued durable deliveries.
- Match code still updates legacy `lastAlertAt` after enqueue to avoid repeated
  matching while the delivery record owns retry.
- Existing saved searches without subscription rows get an EMAIL subscription
  lazily during matching.

## Remaining Risks Or Blockers

- Kill-switch behavior and explicit revalidation/drop tests are completed in
  the next slice.
