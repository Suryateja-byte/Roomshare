# Interaction Census

This census covers current interaction paths that read or write multi-slot availability. Historical booking interactions are listed only in the historical section and are not current product behavior unless a current source path still calls them.

| Interaction | Entry point | Current behavior | Evidence | Verification |
| --- | --- | --- | --- | --- |
| Host creates listing | `POST /api/listings` in `src/app/api/listings/route.ts` | New listing row receives `totalSlots`, `availableSlots`, `openSlots`, move-in date, null `availableUntil`, `minStayMonths: 1`, current `lastConfirmedAt`, active status, and null status reason. | E-WR-001 | Source verified |
| Host edits availability | `PATCH /api/listings/[id]` with host-managed availability body | Host-managed schema validates slot counts, status, date window, minimum stay, and optimistic version. The write updates canonical row fields and marks search sync dirty. | E-WR-002 through E-WR-007 | E-TEST-004 passed |
| Generic listing edit with retired availability keys | `PATCH /api/listings/[id]` without host-managed path | Retired availability keys are rejected with `HOST_MANAGED_WRITE_PATH_REQUIRED`. | E-WR-004, E-WR-007 | E-TEST-004 passed |
| Public availability resolution | `resolvePublicAvailability` | Resolver returns host-managed public availability from listing row fields and ignores legacy snapshots. | E-RD-001 through E-RD-007 | E-TEST-001 passed |
| Public listing/search query | `src/lib/data.ts` and search-doc query helpers | Public/search eligibility requires valid host-managed slot, date, minimum-stay, and freshness conditions. | E-RD-008, E-RD-009 | Partially covered by E-TEST-001 |
| Search/list/map transformation | `src/lib/search/transform.ts` | List items, GeoJSON, and markers carry `publicAvailability.openSlots` and `publicAvailability.totalSlots`. | E-RD-010 | Source verified |
| Slot badge rendering | `SlotBadge` | Badge labels are derived from public availability and presentation state. | E-UI-001 through E-UI-003 | E-TEST-002 passed |
| Listing card rendering | `ListingCard` | Card uses public availability for badge, aria copy, and availability metadata. | E-UI-004, E-UI-005 | E-TEST-003 passed |
| Viewer-state pre-click contract | `GET /api/listings/[id]/viewer-state` | Viewer state returns contact contract, public availability, and `hasBookingHistory: false`; it does not enable booking or holds. | E-CT-001 through E-CT-004 | E-TEST-006 passed |
| Listing detail CTA rendering | `ListingPageClient` | Detail page renders an enabled/unlockable Contact Host button or a disabled Contact Host state. | E-CT-006, E-CT-007 | Source verified |
| Contact Host button click | `ContactHostButton` | Button calls `startConversation`, handles unlock/disabled/loading states, and uses Contact Host labels. | E-CT-006 | Source verified |
| Conversation start | `startConversation` | Action checks auth, rate limit, suspension, email verification, listing contactability, ownership, host suspension, blocks, entitlement, then creates or reuses a conversation. | E-CT-008 | Source verified; full E2E NOT VERIFIED |
| Messaging contactability guard | `evaluateListingContactable` | Guard uses public visibility and status to allow or block contact. | E-CT-005 | E-TEST-005 failed 2/9; current ACTIVE fixture result needs follow-up |
| Booking/hold path | Retired schema/migrations and compatibility helpers | Booking tables and enum types are retired by Phase 09; compatibility helpers do not reserve capacity. | E-HIST-001 through E-HIST-003 | Source and migration verified |
