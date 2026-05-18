# UI Behavior

## Presentation States

Availability presentation supports these states: `available`, `partial`, `filled`, `full`, `closed`, `paused`, and `needs-reconfirmation`. See E-UI-001.

The presentation layer emits these current labels from source:

| Condition class | Label examples | Evidence |
| --- | --- | --- |
| Needs reconfirmation | `Needs reconfirmation` | E-UI-002 |
| Closed | `Closed` | E-UI-002 |
| Paused | `Paused` | E-UI-002 |
| Full public status | `Full` | E-UI-002 |
| Single-slot open | `Available` | E-UI-002 |
| Single-slot filled | `Filled` | E-UI-002 |
| Multi-slot all open | `All N open` | E-UI-002 |
| Multi-slot partially open | `X of Y open` | E-UI-002 |

## SlotBadge

SlotBadge prefers `publicAvailability` when present and uses `getAvailabilityPresentation` to derive the rendered label. Legacy `availableSlots` and `totalSlots` props remain as fallback inputs. See E-UI-003.

The targeted SlotBadge suite passed 13 tests, including public availability precedence, stale/needs-reconfirmation labels, full/closed/paused labels, and visual-token checks. See E-TEST-002.

## ListingCard

ListingCard prefers `publicAvailability.openSlots` and `publicAvailability.totalSlots` when deriving effective slot counts, then renders SlotBadge from that data. See E-UI-004.

ListingCard accessibility copy and metadata rows include availability label and move-in/lease details. See E-UI-005.

The targeted ListingCard suite passed 50 tests, including public availability precedence, stale host-managed label, full/closed labels, date precedence, and aria-label slot count derivation. See E-TEST-003.

## Not Verified

This report did not run browser screenshots or Playwright checks for visual layout, overlap, map markers, or listing-detail rendering. Source and component tests are verified; rendered browser behavior is `NOT VERIFIED`. See E-GAP-001.
