# CFM-1001 UI Cleanup Close-out

- Ticket: `CFM-1001`
- Deletion SHA: `CFM-701 = c6ef7c60`
- Scope note: CFM-701 already deleted the dead public booking UI and `/api/listings/[id]/availability`; CFM-1001 closes the ticket with verification, documentation, and a lint-time revival guard.

## Deleted Files

The primary deletions were shipped in `c6ef7c60`:

| Path | LOC |
|---|---:|
| `src/components/BookingForm.tsx` | 1,329 |
| `src/components/SlotSelector.tsx` | 66 |
| `src/hooks/useAvailability.ts` | 119 |
| `src/app/api/listings/[id]/availability/route.ts` | 114 |

## Retained Compatibility Fields

The following viewer-state fields remain intentionally retained for compatibility and observability. Future owner: `CFM-1002`.

- `canBook`
- `canHold`
- `bookingDisabledReason`

These stay in `src/app/api/listings/[id]/viewer-state/route.ts` so older client bundles keep a stable response shape while contact-first remains enforced.

Stage 1 status on 2026-04-22:

- `src/app/listings/[id]/ListingPageClient.tsx` no longer consumes these fields.
- The fields remain route-only during the required soak window before CFM-1002-C removes them from `/api/listings/[id]/viewer-state`.

Privacy-first contract status on 2026-04-23:

- Listing detail, messaging contactability, `viewer-state`, and `/api/listings/[id]/status` now use the privacy-first contract unconditionally.
- The retired rollout flags do not change runtime behavior anymore; only the CFM-1002-B/C gated cleanup remains in this family.

## Verification Sweep

Commands rerun on `2026-04-17` at the current `codex/contact-first-multislot` HEAD.

```text
$ ls src/components/BookingForm.tsx src/components/SlotSelector.tsx src/hooks/useAvailability.ts 2>&1
ls: cannot access 'src/components/BookingForm.tsx': No such file or directory
ls: cannot access 'src/components/SlotSelector.tsx': No such file or directory
ls: cannot access 'src/hooks/useAvailability.ts': No such file or directory

$ grep -rn 'BookingForm\|SlotSelector\|useAvailability' src/

$ grep -rn '/api/listings/.*/availability' src/ app/
grep: app/: No such file or directory
```

Interpretation:

- The deleted component and hook paths are still absent.
- The `src/` sweep for `BookingForm`, `SlotSelector`, and `useAvailability` returned no matches.
- The `/api/listings/.*/availability` sweep returned no `src/` matches; the only output was that the repo has no root-level `app/` directory.

## Revival Guard

Revival guard location at close-out: `eslint.config.mjs:50-78` (`no-restricted-imports`). This rule rejects:

- `@/components/BookingForm`
- `@/components/SlotSelector`
- `@/hooks/useAvailability`
- pattern group: `**/BookingForm`, `**/SlotSelector`, `**/useAvailability`

Message:

> CFM-701 retired this component/hook. See docs/migration/cfm-ui-cleanup-close-out.md.

## Rollback

Rollback the CFM-1001 close-out by reverting the commit that added the ESLint revival guard, this close-out doc, and the plan annotation.

```bash
git revert <cfm-1001-close-out-commit>
```

`c6ef7c60` remains the separate deletion commit if the business intentionally decides to restore public booking UI later.
