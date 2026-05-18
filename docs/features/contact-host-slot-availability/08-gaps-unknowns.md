# Gaps And Unknowns

This file lists claims that are not proven by the current evidence package or are contradicted by verification output.

## Verified Failure

| Area | Status | Evidence |
| --- | --- | --- |
| `evaluateListingContactable` ACTIVE fixture in `src/__tests__/lib/messaging/listing-contactable.test.ts` | FAILED: expected contactable, received `LISTING_UNAVAILABLE` for two expectations | E-TEST-005 |

## Not Verified

| Area | Status | Evidence |
| --- | --- | --- |
| Browser-rendered search/list/map/detail UI | NOT VERIFIED. Source and component tests were checked, but no browser run or screenshot was produced. | E-GAP-001 |
| Full Contact Host click to successful conversation creation | NOT VERIFIED. Source evidence exists for button and action behavior, but no browser E2E was run. | E-GAP-003 |
| Live production or staging database state | NOT VERIFIED. Schema and migration source were inspected, but no live DB was queried. | E-GAP-002 |
| Whether every historical booking artifact is absent from all non-source documentation | NOT VERIFIED. This report classified source/migration behavior; it did not exhaustively audit every doc file in the repo. | E-GAP-002 |
| Whether stale/freshness background jobs mutate rows as intended | UNKNOWN. Freshness fields and thresholds are documented from source, but background job execution was not traced in this package. | E-DM-001, E-RD-003 |
| Browser visual text fit, marker rendering, and responsive states | NOT VERIFIED. No Playwright screenshot or visual assertion was run. | E-GAP-001 |

## Follow-Up Candidates

These are not required to understand the current implementation, but they would close verification gaps:

- Add or update the contactability test fixture so ACTIVE-listing expectations are date-stable, or confirm that the current failure is intended product behavior.
- Run a browser E2E path for listing detail viewer-state, Contact Host disabled/enabled states, and successful conversation creation.
- Run a browser or component integration check for search/list/map display surfaces if UI-level proof is needed.
- Inspect deployed database migration status if this report is used for production readiness instead of source documentation.
