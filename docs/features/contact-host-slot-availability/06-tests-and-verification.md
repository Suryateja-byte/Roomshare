# Tests And Verification

## Runtime Note

The first direct PowerShell attempt for `pnpm test -- src/__tests__/lib/search/public-availability.test.ts --runInBand` failed because the repo was launched from a UNC path and the POSIX-style test script ran under Windows command handling. The observed failure included `UNC paths are not supported` and `'NODE_OPTIONS' is not recognized as an internal or external command`.

The targeted test commands were then run through WSL from `/home/surya/roomshare`. The command column below preserves the requested command; the runtime command column records the WSL wrapper used locally.

## Results

| Requested command | Runtime command | Result | Evidence |
| --- | --- | --- | --- |
| `pnpm test -- src/__tests__/lib/search/public-availability.test.ts --runInBand` | `wsl -d Ubuntu --cd /home/surya/roomshare -- pnpm test -- src/__tests__/lib/search/public-availability.test.ts --runInBand` | PASS: 15/15 tests passed | E-TEST-001 |
| `pnpm test -- src/__tests__/components/listings/SlotBadge.test.tsx --runInBand` | `wsl -d Ubuntu --cd /home/surya/roomshare -- pnpm test -- src/__tests__/components/listings/SlotBadge.test.tsx --runInBand` | PASS: 13/13 tests passed | E-TEST-002 |
| `pnpm test -- src/__tests__/components/ListingCard.test.tsx --runInBand` | `wsl -d Ubuntu --cd /home/surya/roomshare -- pnpm test -- src/__tests__/components/ListingCard.test.tsx --runInBand` | PASS: 50/50 tests passed | E-TEST-003 |
| `pnpm test -- src/__tests__/api/listings-host-managed-patch.test.ts --runInBand` | `wsl -d Ubuntu --cd /home/surya/roomshare -- pnpm test -- src/__tests__/api/listings-host-managed-patch.test.ts --runInBand` | PASS: 11/11 tests passed | E-TEST-004 |
| `pnpm test -- src/__tests__/lib/messaging/listing-contactable.test.ts --runInBand` | `wsl -d Ubuntu --cd /home/surya/roomshare -- pnpm test -- src/__tests__/lib/messaging/listing-contactable.test.ts --runInBand` | FAIL: 7/9 tests passed, 2/9 tests failed | E-TEST-005 |
| `pnpm test -- src/__tests__/api/listings-viewer-state-route.test.ts --runInBand` | `wsl -d Ubuntu --cd /home/surya/roomshare -- pnpm test -- src/__tests__/api/listings-viewer-state-route.test.ts --runInBand` | PASS: 11/11 tests passed | E-TEST-006 |

## Failing Contactability Details

The failing suite expected an ACTIVE listing fixture to be contactable. The fixture sets `status: ACTIVE`, `openSlots: 1`, `totalSlots: 1`, `moveInDate: 2026-05-01T00:00:00.000Z`, `availableUntil: null`, `minStayMonths: 1`, `lastConfirmedAt: 2026-04-20T12:00:00.000Z`, and `needsMigrationReview: false`. See `src/__tests__/lib/messaging/listing-contactable.test.ts:9-21`.

The first failed assertion expected `{ ok: true, listing: contactableListing }`, but received `{ ok: false, code: "LISTING_UNAVAILABLE", message: "This listing is not available for new messages right now." }`. The second failed assertion expected `result.ok` to be true for the same fixture with extra fields. See `src/__tests__/lib/messaging/listing-contactable.test.ts:24-32` and E-TEST-005.

This report does not reinterpret that failure as passing behavior. Any claim that the fixture is contactable as of 2026-05-16 is `NOT VERIFIED` and contradicted by the command output.

## Verification Coverage

Verified by source and targeted tests:

- Public availability resolution and search eligibility. See E-RD-001 through E-RD-007 and E-TEST-001.
- Slot badge presentation. See E-UI-001 through E-UI-003 and E-TEST-002.
- Listing card presentation. See E-UI-004, E-UI-005, and E-TEST-003.
- Host-managed PATCH behavior. See E-WR-002 through E-WR-007 and E-TEST-004.
- Viewer-state contact contract. See E-CT-001 through E-CT-004 and E-TEST-006.

Not verified in this pass:

- Browser-rendered search, map, listing card, and listing detail behavior. See E-GAP-001.
- Live deployed database schema/state. See E-GAP-002.
- Full Contact Host browser click through conversation creation. See E-GAP-003.
