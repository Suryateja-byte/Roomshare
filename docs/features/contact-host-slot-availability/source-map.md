# Source Map

This file maps each source used by the report to the exact responsibility it proves. If a behavior is not listed here or in the evidence register, the final report treats it as `UNKNOWN` or `NOT VERIFIED`.

| Source | Lines | Classification | Responsibility |
| --- | ---: | --- | --- |
| `prisma/schema.prisma` | 107-140 | Current | Defines the current `Listing` row fields used by host-managed availability: slot counts, move-in window, freshness fields, status reason, status, and version. |
| `prisma/migrations/20260415000000_add_contact_first_listing_fields/migration.sql` | 1-8, 28-72 | Current migration basis | Adds contact-first availability fields and checks for minimum stay, open-slot range, and date ordering. |
| `prisma/migrations/20260509000000_phase09_cutover_retire_booking/migration.sql` | 1-18 | Historical boundary | Drops booking-era tables, listing booking columns, and booking enum types. |
| `src/lib/search/public-availability.ts` | 3-4, 20-28, 38-44, 92-95, 253-270, 285-355, 358-401, 420-428 | Current reader | Normalizes row fields into public availability, validates host-managed listings, ignores legacy snapshots in resolver output, and gates public search eligibility. |
| `src/lib/search/availability-presentation.ts` | 8-15, 46-89, 91-165, 217-249 | Current reader/UI bridge | Maps availability state into labels such as `Available`, `All N open`, `X of Y open`, `Filled`, `Paused`, and `Needs reconfirmation`. |
| `src/components/listings/SlotBadge.tsx` | 18-34, 49-64, 66-113, 116-121 | Current UI | Renders slot badges from `publicAvailability` first, with legacy slot props as fallback. |
| `src/components/listings/ListingCard.tsx` | 30-59, 320-331, 413-429, 530-536, 606-619 | Current UI | Feeds listing card badge, aria copy, and metadata rows from normalized public availability. |
| `src/lib/search/transform.ts` | 26-29, 46-61, 100-130, 156-188, 198-210 | Current reader | Builds public list item, GeoJSON, and marker structures with `publicAvailability.openSlots` and `publicAvailability.totalSlots`. |
| `src/lib/search-types.ts` | 56-110 | Current API shape | Defines public listing/search data fields and the privacy boundary for exact address and owner id. |
| `src/lib/data.ts` | 156-177 | Current query | Applies host-managed availability constraints to public listing query eligibility. |
| `src/lib/search/search-doc-queries.ts` | 758-788 | Current query | Applies host-managed availability constraints and projected slot counts in search document queries. |
| `src/app/api/listings/route.ts` | 417-444 | Current writer | Initializes newly created listings with `openSlots`, `availableSlots`, and freshness defaults. |
| `src/app/api/listings/[id]/route.ts` | 172-230, 237-255, 282-300, 645-680, 721-766, 810-818 | Current writer | Defines the host-managed PATCH schema, validation, row lock, version conflict guard, canonical update, and retired availability-key rejection. |
| `src/lib/listings/public-contact-contract.ts` | 14-36, 61-69, 85-105, 107-169, 183-225 | Current contact boundary | Builds privacy-first viewer contracts, exposes Contact Host states, and sets `canBook` and `canHold` to false. |
| `src/app/api/listings/[id]/viewer-state/route.ts` | 163-230, 305-369, 377-430 | Current contact boundary | Selects availability fields and returns private viewer state with contact contract, public availability, and `hasBookingHistory: false`. |
| `src/lib/messaging/listing-contactable.ts` | 35-64 | Current contact boundary | Gates messaging contactability using resolved public listing visibility and current listing status. |
| `src/components/ContactHostButton.tsx` | 32-40, 58-60, 98-145, 156-173 | Current UI/action bridge | Calls `startConversation`, handles disabled/unlock states, and labels the primary CTA as Contact Host or Unlock to Contact. |
| `src/app/actions/chat.ts` | 78-170, 170-260, 260-370 | Current action | Checks session, rate limit, email, listing contactability, block state, entitlement, and creates/resurrects a conversation. |
| `src/app/listings/[id]/ListingPageClient.tsx` | 540-590 | Current UI | Renders Contact Host button or disabled contact state on listing detail. |
| `src/lib/availability.ts` | 9-17, 30-56, 78-100, 132-166 | Compatibility | Reads host-managed row counts for snapshots while reservation/inventory functions are no-ops. |
| `src/__tests__/lib/search/public-availability.test.ts` | command output | Verification | Passed 15/15 tests for host-managed public availability resolution and search eligibility. |
| `src/__tests__/components/listings/SlotBadge.test.tsx` | command output | Verification | Passed 13/13 tests for slot badge labels and visual token behavior. |
| `src/__tests__/components/ListingCard.test.tsx` | command output | Verification | Passed 50/50 tests for listing card display, badge, and public availability behavior. |
| `src/__tests__/api/listings-host-managed-patch.test.ts` | command output | Verification | Passed 11/11 tests for host-managed PATCH behavior. |
| `src/__tests__/lib/messaging/listing-contactable.test.ts` | 9-32, command output | Verification gap | Failed 2/9 expectations because an ACTIVE fixture was resolved as `LISTING_UNAVAILABLE`; 7/9 tests passed. |
| `src/__tests__/api/listings-viewer-state-route.test.ts` | command output | Verification | Passed 11/11 tests for viewer-state contact contract behavior. |
