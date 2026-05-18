# Write Paths

## Create Listing

Create listing initializes current availability fields on the listing row. The verified source sets `totalSlots`, mirrors that value into `availableSlots` and `openSlots`, sets `moveInDate`, leaves `availableUntil` null, sets `minStayMonths: 1`, writes `lastConfirmedAt`, and starts the row as active with no status reason. See E-WR-001.

This source evidence proves initialization behavior in the create route. It does not prove that every UI form or seed path always supplies every intended value; those paths were not exhaustively traced in this pass.

## Host-Managed PATCH

The host-managed PATCH contract accepts `expectedVersion`, `openSlots`, `totalSlots`, `moveInDate`, `availableUntil`, `minStayMonths`, and statuses `ACTIVE`, `PAUSED`, and `RENTED`. See E-WR-002.

PATCH validation rejects these invalid states:

- `openSlots > totalSlots`.
- ACTIVE listing with no open slots.
- ACTIVE listing without a move-in date.
- Past `availableUntil`.
- `availableUntil` before `moveInDate`.
- Invalid minimum stay.

See E-WR-003.

The route detects the host-managed path from `openSlots` or `status`. Some other availability keys are treated as retired unless the request uses the host-managed path. See E-WR-004.

## Concurrency And Canonical Writes

The route locks the listing row and compares `expectedVersion`; stale writes return a version conflict. See E-WR-005.

When the host-managed write succeeds, the route updates `status`, `statusReason`, `totalSlots`, `openSlots`, `availableSlots`, `moveInDate`, `availableUntil`, `minStayMonths`, `lastConfirmedAt`, freshness fields, and increments `version`. See E-WR-006.

Generic PATCH requests that include retired availability keys without using the host-managed path return `HOST_MANAGED_WRITE_PATH_REQUIRED`. See E-WR-007.

## Test Coverage

The targeted host-managed PATCH suite passed 11 tests. See E-TEST-004.

## Not Verified

No browser form submission was run for this report. Create and PATCH behavior is verified from source plus the targeted API test, not from a rendered browser workflow. See E-GAP-001.
