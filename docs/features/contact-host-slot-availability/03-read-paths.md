# Read Paths

## Public Availability Shape

Public availability exposes an availability source, open slots, total slots, available-from date, available-until date, minimum stay, and last-confirmed timestamp. The resolved form also includes effective available slots and public/search eligibility booleans. See E-RD-002.

The type still contains `LEGACY_BOOKING` and `HOST_MANAGED`, but the active resolver returns host-managed availability from listing row fields. See E-RD-001.

## Resolver Behavior

`buildPublicAvailability` uses `openSlots ?? availableSlots`, defaults the source to `HOST_MANAGED`, and normalizes date and minimum-stay fields. See E-RD-004.

The host-managed resolver applies the current validity rules for status, finite slot counts, slot range, move-in date, date window, minimum stay, and at least one open slot. See E-RD-005.

Legacy availability builder code still exists, but `resolvePublicAvailability` ignores `legacySnapshot` and returns host-managed availability from the listing. See E-RD-006.

Public search eligibility requires resolved search eligibility and excludes migration-review or public-search-blocked status reasons. See E-RD-007.

## Query And Search Data Paths

Public listing query conditions require non-null open slots, valid slot range, move-in date, valid minimum stay, valid date window, and non-stale last confirmation. See E-RD-008.

Search-document queries apply equivalent host-managed slot conditions and project effective available slots from `openSlots`. See E-RD-009.

Search/list/map transforms build public availability from row fields and expose `publicAvailability.openSlots` and `publicAvailability.totalSlots` in list item, GeoJSON, and marker structures. See E-RD-010.

## Verification

The public availability targeted suite passed 15 tests. See E-TEST-001.

The ListingCard suite passed 50 tests and covers card-level use of public availability. See E-TEST-003.

## Not Verified

Rendered search, map, and listing-detail behavior was not checked in a browser during this report. The source paths are verified, but browser observations are `NOT VERIFIED`. See E-GAP-001.
