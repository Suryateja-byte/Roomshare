# Historical Booking Retirement

## Retired Artifacts

The Phase 09 migration classifies booking-era persistence as retired by dropping `BookingAuditLog`, `Booking`, and `listing_day_inventory`. It also drops listing columns `availabilitySource`, `needsMigrationReview`, `booking_mode`, and `hold_ttl_minutes`, plus `BookingStatus` and `ListingAvailabilitySource` enum types. See E-HIST-001.

Current schema search found no `Booking` model and no `BookingStatus` enum in `prisma/schema.prisma`. See E-HIST-002.

## How To Treat Old Booking Terms

Any old references to booking slots, held slots, accepted slots, `slotsRequested`, daily inventory, booking capacity, booking status transitions, or hold expiration must be treated as historical unless a current source path proves active use.

The compatibility availability helper still exposes old-shaped snapshot fields and function names, but verified source shows that it reads listing row slot fields, returns `isCapacityReservation(): false`, and leaves inventory mutation helpers as no-ops. See E-HIST-003.

## Current Replacement Boundary

The current replacement is not a booking state machine. It is host-managed listing availability plus Contact Host messaging:

- Current slot state lives on `Listing`. See E-DM-001.
- Current writes are create listing and host-managed PATCH. See E-WR-001 through E-WR-007.
- Current reads resolve host-managed public availability. See E-RD-001 through E-RD-010.
- Current viewer contracts disable booking and holds while enabling Contact Host states. See E-CT-001 through E-CT-008.

## Not Verified

This report did not inspect production or staging database migration history. It verifies migration and schema source, not whether every deployed database has completed Phase 09. See E-GAP-002.
