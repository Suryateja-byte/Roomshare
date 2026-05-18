# Data Model

## Current Listing Fields

The current multi-slot model lives on `Listing`. The schema fields in scope are listed below. See E-DM-001.

| Field | Current role | Evidence |
| --- | --- | --- |
| `totalSlots` | Total capacity count for the listing row. | E-DM-001 |
| `availableSlots` | Compatibility/shadow slot count still present on the current row. Create and PATCH keep it aligned with current slot writes. | E-DM-001, E-WR-001, E-WR-006 |
| `openSlots` | Host-managed open slot count used by current readers and writers. | E-DM-001, E-RD-004, E-WR-006 |
| `moveInDate` | Required by current host-managed validity when a listing is active and public. | E-DM-001, E-RD-005, E-WR-003 |
| `availableUntil` | Optional end date for the availability window; validation rejects past dates and dates before `moveInDate`. | E-DM-001, E-DM-003, E-WR-003 |
| `minStayMonths` | Minimum stay requirement; current validation and migration constraints require at least one month. | E-DM-001, E-DM-003, E-WR-003 |
| `lastConfirmedAt` | Freshness timestamp used by public availability and search eligibility. | E-DM-001, E-RD-003, E-RD-008 |
| `statusReason` | Reason field used by current availability/status presentation and public search blocking. | E-DM-001, E-RD-007, E-WR-006 |
| `freshnessReminderSentAt`, `staleAt`, `autoPausedAt` | Freshness bookkeeping fields on the current row. | E-DM-001 |
| `status` | Listing status used by host-managed validity, contactability, and PATCH writes. | E-DM-001, E-RD-005, E-CT-005 |
| `version` | Optimistic concurrency field used by host-managed PATCH. | E-DM-001, E-WR-005, E-WR-006 |

## Migration Constraints

The contact-first migration added host-managed availability fields and introduced constraints for minimum stay, open-slot range, and date ordering. See E-DM-002 and E-DM-003.

The same migration added indexes for open slots, last confirmation, status reason, and availability windows. See E-DM-004.

## Current Validity Rules

Host-managed public availability is valid only when the listing is active, slot counts are finite, `totalSlots >= 1`, `0 <= openSlots <= totalSlots`, a move-in date exists, the optional `availableUntil` date is valid, `minStayMonths >= 1`, and at least one slot is open. See E-RD-005.

Freshness windows are defined as 14 days for reminder, 21 days for stale, and 30 days for auto-pause due. See E-RD-003.

## Historical Data Not In The Current Model

`Booking`, `BookingAuditLog`, `listing_day_inventory`, `booking_mode`, `hold_ttl_minutes`, `BookingStatus`, and `ListingAvailabilitySource` are historical for this report because Phase 09 drops them. Current schema search found no `Booking` model or `BookingStatus` enum. See E-HIST-001 and E-HIST-002.

## Not Verified

The live deployed database was not inspected, so this report verifies schema and migration source, not the state of any production or staging database. See E-GAP-002.
