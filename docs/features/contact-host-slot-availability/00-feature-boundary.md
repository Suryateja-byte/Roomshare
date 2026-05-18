# Feature Boundary

## Current Scope

This package documents the current multi-slot availability implementation as host-managed, contact-first availability. The current slot model is the `Listing` row fields for `totalSlots`, `availableSlots`, `openSlots`, `moveInDate`, `availableUntil`, `minStayMonths`, `lastConfirmedAt`, freshness timestamps, `statusReason`, `status`, and `version`. See E-DM-001.

The current write paths are create listing and host-managed listing PATCH. Create listing initializes the current availability fields, while PATCH validates and writes the host-managed availability contract. See E-WR-001 through E-WR-007.

The current read paths are public availability resolution, public listing/search query filters, search/list/map transformations, listing card presentation, slot badge presentation, viewer-state contracts, and Contact Host conversation startup. See E-RD-001 through E-RD-010, E-UI-001 through E-UI-005, and E-CT-001 through E-CT-008.

## Historical Scope

Booking-era storage and behavior are historical unless a current source file still uses them. Phase 09 drops `BookingAuditLog`, `Booking`, `listing_day_inventory`, booking-mode listing columns, and booking enum types. Current schema search found no `Booking` model or `BookingStatus` enum. See E-HIST-001 and E-HIST-002.

Compatibility helpers in `src/lib/availability.ts` still expose old-shaped functions and slot names, but the verified source reads listing row fields, reports `isCapacityReservation(): false`, and leaves inventory mutation helpers as no-ops. See E-HIST-003.

## Evidence Rule

Every current behavior claim in this package must cite an evidence id from `evidence-register.md`. Any behavior not backed by source, schema, migration, command output, or browser observation is listed in `08-gaps-unknowns.md` as `UNKNOWN` or `NOT VERIFIED`.

## Explicit Non-Goals

- No production API changes.
- No schema changes.
- No app behavior changes.
- No test changes.
- No migration changes.
- No attempt to re-enable booking, holds, or booking capacity.
