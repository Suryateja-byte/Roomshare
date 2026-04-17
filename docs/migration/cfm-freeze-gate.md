# CFM Freeze Gate Runbook

## Purpose

The CFM freeze gate is the global stop for new public booking and hold creation during the contact-first migration. When enabled, `createBooking` and `createHold` short-circuit at action entry and return a stable `CONTACT_ONLY` domain response before auth, suspension, email, rate-limit, or transaction work. The freeze does not mutate existing booking rows, does not disable `/bookings` lifecycle actions for legacy rows, and does not replace per-listing `HOST_MANAGED_BOOKING_FORBIDDEN` checks when the global flag is off. The flag is flipped by the release operator or on-call owner during cutover.

## Flag Name And Location

- Feature getter: `features.contactFirstListings`
- Source: [`src/lib/env.ts`](/home/surya/roomshare/src/lib/env.ts:512)
- Environment variable: `ENABLE_CONTACT_FIRST_LISTINGS`
- Enabled value: `"true"`
- Disabled value: any value other than `"true"`; normal deployment uses `"false"` or the variable is unset

## Flip Procedure

1. Confirm the intended cutover window and the target freeze timestamp.
2. Set `ENABLE_CONTACT_FIRST_LISTINGS=true` in the target environment.
3. Deploy the application so the new process environment is picked up.
4. Verify the deployment is serving the freeze response from `createBooking` and `createHold`.
5. Watch the monitoring signals in the next section for at least one deploy cycle.

Recommended environment order:

1. `preview`
2. `staging`
3. `production`

Notes:

- `preview` validates the build and client action contract on a disposable deployment.
- `staging` is the manual approval gate in CI and should be the final dress rehearsal.
- `production` should only be flipped after staging shows `CONTACT_ONLY` responses and no leak counter activity.
- No database migration or data backfill is part of the freeze flip.

## Rollback

1. Set `ENABLE_CONTACT_FIRST_LISTINGS=false` in the affected environment.
2. Redeploy.
3. Re-run the same smoke checks used at cutover.
4. Keep watching the leak and viewer-state counters until traffic stabilizes.

Rollback is configuration-only. There is no schema change, no data migration, and no booking-row repair step tied to this flag.

## Monitoring Signals

Relevant signals from [`docs/migration/cfm-observability.md`](/home/surya/roomshare/docs/migration/cfm-observability.md:73):

- `cfm.booking.create_blocked_count{reason=contact_only|freeze|invalid}`
  Indicates create attempts that the contact-first gate rejected. Expected to be non-zero after cutover.
- `cfm.booking.post_freeze_write_count{kind=booking|hold}`
  This runbook uses the observability spec's exact name instead of inventing `cfm.booking.create.completed`. The action logs include `contactFirstFlag`; when that field is `true`, any emitted success line is a freeze leak.
- `cfm.viewer_state.can_book_true_count`
  Should remain `0` after freeze. Any increment means the client was told booking is still allowed.
- `cfm.viewer_state.can_hold_true_count`
  Should remain `0` after freeze. Any increment means the client was told holds are still allowed.

Operator interpretation:

- `cfm.booking.create_blocked_count` increasing is healthy after cutover.
- `cfm.booking.post_freeze_write_count` is only healthy when `contactFirstFlag=false`. Treat any event with `contactFirstFlag=true` as an incident.
- `cfm.viewer_state.can_book_true_count > 0` or `cfm.viewer_state.can_hold_true_count > 0` is a contract leak even if writes stay blocked.

## Error Codes Returned While Freeze Is Active

During the freeze, the create actions return the same response for authenticated and unauthenticated callers because the gate runs before auth and verification checks.

| Code | Meaning | Caller response |
| --- | --- | --- |
| `CONTACT_ONLY` | Global contact-first freeze is active for new booking and hold creation. | Hide booking/hold success UX, show the message/contact-host path, and do not retry automatically. |

Notes:

- `SESSION_EXPIRED`, suspension, email-verification, and rate-limit responses are intentionally bypassed while the freeze is on.
- `HOST_MANAGED_BOOKING_FORBIDDEN` remains the per-listing guard when the global freeze is off.

## What Remains Enabled During Freeze

- `/bookings` interactive lifecycle on existing rows remains enabled through [`src/app/actions/manage-booking.ts`](/home/surya/roomshare/src/app/actions/manage-booking.ts:88).
- Hold expiry and cleanup remain enabled through [`src/app/api/cron/sweep-expired-holds/route.ts`](/home/surya/roomshare/src/app/api/cron/sweep-expired-holds/route.ts:1).
- Legacy drain remains enabled through `manage-booking.ts::updateBookingStatus`, including accept, reject, cancel, and expiry handling for rows that already exist.
- Search doc dirtying and other read-model maintenance continue normally; the freeze only blocks new public create paths.

## Known Non-Frozen Paths

Public create callers:

- [`src/components/BookingForm.tsx`](/home/surya/roomshare/src/components/BookingForm.tsx:519) calls `createBooking`.
- [`src/components/BookingForm.tsx`](/home/surya/roomshare/src/components/BookingForm.tsx:1066) calls `createHold`.

These public callers are frozen by the gate because they go through the server actions directly.

Intentional bypasses that do not call `createBooking` or `createHold`:

- [`src/app/api/test-helpers/route.ts`](/home/surya/roomshare/src/app/api/test-helpers/route.ts:157) creates expired/held/pending/accepted booking rows directly for test setup.
- [`src/app/api/test/[...slug]/route.ts`](/home/surya/roomshare/src/app/api/test/[...slug]/route.ts:244) can seed booking rows directly for integration and cron tests.

Operational notes:

- Those helper routes are test/support tooling, not public booking entrypoints.
- Both test helper surfaces are blocked in `VERCEL_ENV=production`, so they are not a production cutover bypass.
- No production cron route or `/bookings` lifecycle action calls `createBooking` or `createHold`.

## Reviewer Checklist

- Verify `createBooking` checks `features.contactFirstListings` before `auth()`, suspension, email, rate-limit, or transaction work.
- Verify `createHold` checks `features.contactFirstListings` before `auth()`, rate-limit, suspension, email, or transaction work.
- Verify both create helpers still return the same `CONTACT_ONLY` payload shape.
- Verify `HOST_MANAGED_BOOKING_FORBIDDEN` is unchanged and still fires when the global freeze is off.
- Verify successful row creation logs `cfm.booking.post_freeze_write_count` with `kind`, `availabilitySource`, `contactFirstFlag`, and `bookingIdHash`.
- Verify `/bookings` lifecycle actions, sweeper cron, and legacy drain paths remain untouched by the freeze patch.
- Verify the new freeze tests cover unauthenticated and authenticated freeze-on calls plus freeze-off host-managed rejection for both actions.
