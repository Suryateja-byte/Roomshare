# Current Multi-Slot Availability Report

## Executive Summary

The current multi-slot system is implemented as host-managed, contact-first availability on the `Listing` row. The current row fields include total slot count, open slot count, move-in window, minimum stay, confirmation freshness, status reason, status, and optimistic version. See E-DM-001.

Create listing and host-managed PATCH are the current write paths. Create listing initializes `openSlots` and `availableSlots` from `totalSlots`; PATCH validates slot counts, date windows, status, minimum stay, and version before writing canonical availability fields. See E-WR-001 through E-WR-007.

Public availability is resolved from host-managed listing fields. Although the public availability type still contains a legacy source name, the active resolver ignores legacy snapshots and returns host-managed availability. Public search eligibility and search document queries also use host-managed slot, date, minimum-stay, and freshness conditions. See E-RD-001 through E-RD-010.

The active user path is Contact Host, not booking. Viewer contracts set `canBook: false` and `canHold: false`, expose contact CTA states, return `hasBookingHistory: false` in viewer-state responses, and start conversations through `ContactHostButton` and `startConversation`. See E-CT-001 through E-CT-008.

Booking-era tables, inventory storage, booking-mode columns, and booking enum types are historical. Phase 09 drops them, and the current Prisma schema search found no `Booking` model or `BookingStatus` enum. See E-HIST-001 and E-HIST-002.

## Verification Status

Five targeted suites passed: public availability, SlotBadge, ListingCard, host-managed PATCH, and viewer-state. See E-TEST-001 through E-TEST-004 and E-TEST-006.

One targeted suite failed: `src/__tests__/lib/messaging/listing-contactable.test.ts` passed 7 tests and failed 2 ACTIVE-listing expectations because the function returned `LISTING_UNAVAILABLE`. The fixture uses `moveInDate: 2026-05-01` and `lastConfirmedAt: 2026-04-20` while this report was generated on 2026-05-16. See E-TEST-005.

Rendered browser behavior for search, map, and listing detail was not verified in this pass. Live deployed database state was not inspected. Full browser E2E Contact Host conversation creation was not run. See E-GAP-001 through E-GAP-003.

## Package Contents

| File | Purpose |
| --- | --- |
| `manifest.json` | Inventory of sources, tests, external methodology references, historical artifacts, and known gaps. |
| `source-map.md` | Source-by-source map of responsibilities and scope classification. |
| `evidence-register.md` | Claim-to-evidence register for source lines, migrations, command output, and verification gaps. |
| `interaction-census.md` | Current write, read, UI, contact, and historical interaction paths. |
| `00-feature-boundary.md` | Scope, historical boundary, and evidence rules. |
| `01-data-model.md` | Current listing-row slot fields and database constraints. |
| `02-write-paths.md` | Create listing and host-managed PATCH behavior. |
| `03-read-paths.md` | Public availability, search/list/map data, and query filters. |
| `04-contact-host-boundary.md` | Contact Host contract, disabled booking/holds, viewer-state, and conversation start. |
| `05-ui-behavior.md` | SlotBadge and ListingCard labels and states. |
| `06-tests-and-verification.md` | Commands run, pass/fail results, and verification notes. |
| `07-historical-booking-retirement.md` | Booking-era artifacts classified as historical. |
| `08-gaps-unknowns.md` | Unknown, not verified, and failing-test areas. |
| `verification.json` | Machine-readable verification summary. |
| `diagrams/contact-first-availability.mmd` | Minimal flow diagram for the current architecture boundary. |

## Methodology References

This package follows the repo feature documentation harness and uses source-first verification. The plan also supplied these methodology references: [OpenAI Codex documentation updates](https://developers.openai.com/codex/use-cases/update-documentation), [OpenAI Codex large-codebase onboarding](https://developers.openai.com/codex/use-cases/codebase-onboarding), [GPT-5.5 announcement](https://openai.com/index/introducing-gpt-5-5/), [GPT-5.5 model docs](https://developers.openai.com/api/docs/models/gpt-5.5), [Google developer style guide](https://developers.google.com/style/), and [C4 diagrams](https://c4model.com/diagrams).
