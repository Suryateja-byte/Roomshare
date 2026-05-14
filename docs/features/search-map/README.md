# Search / Map / Listing Discovery

Status: evidence-backed draft from mixed committed/runtime evidence and
explicitly marked local discovery caveats, with post-merge fixed-code verification against `origin/main` at
`89ad33ea58391452b03a2ff5c3a219503769edaa`. Runtime browser behavior was
attempted in Phase 10; local Postgres is now available and the narrow smoke,
filter/URL, sort/load-more pagination, root pagination/sort reset,
map-bounds round-trip, desktop map/list parity, results-state, URL-state,
anonymous/authenticated saved-listing, mobile map/list, search
error-resilience, and map error/a11y specs now pass. A focused API/unit Jest
command for favorites, map listings, search facets, search V2, map payload
sanitization, and search params also passes. The full search release-gate
command also passes. The original real search/map public-payload PII scan
failed, but the P0 public payload fix now passes a real captured payload scan
for `/api/search/v2`, `/api/search/listings`, `/api/map-listings`, and
`/api/listings`; C064 adds a deterministic no-arg checked-in public payload
fixture gate; PR #119 is merged to `main` and all final PR checks pass.
The committed C056 slice (`7e80c899`) also verifies desktop list-backed map
parity with focused browser and `SearchResultsClient` Jest evidence. C057
narrows the old dirty-worktree source warning to a P2 branch-hygiene caveat:
remaining dirty or untracked files are local-only discovery inputs unless a
specific evidence row cites them.
The existing failure-mocked desktop map tests now verify `/api/map-listings`
500/429 browser retry behavior as C058. C062 verifies focused root
pagination/sort reset and map-bounds round-trip browser behavior. C063 extracts
the V2/search-doc versus legacy fallback contract and verifies the focused V2
route/load-more action checks, with a remaining service-suite semantic-test
residual. Non-gate broader E2E coverage is still not runtime-verified. See `runtime-verification.md` and
`public-payload-pii-triage.md`.

## Purpose

This feature lets users discover listings from `/search`, using URL-backed search params, server-rendered result data, client-side filter/sort/pagination controls, a persistent map, listing cards, saved listings, and the saved-search entry point. Evidence: `evidence-register.md` C001, C003, C013, C017, C018; `phase-4/02-api-data-flow.md` saved-search row.

## Current implementation summary

`/search` is the main SSR entry point. It parses URL params, applies a server-side rate limit, runs the V2 search path first when enabled, and falls back to legacy listing data when needed. C063 now documents which fallback/control state each search surface returns: SSR and `/api/search/listings` can serve `v1-fallback`/`degraded`, direct `/api/search/v2` returns V2 control or error envelopes without V1 fallback, and load-more returns a degraded non-appendable result when legacy fallback is reached. Evidence: `src/app/search/page.tsx`:L242-L623; `evidence-register.md` C001, C005, C006, C063.

The map is hosted by the `/search` layout and persistent map wrapper. The wrapper can use V2 map data or independently fetch `/api/map-listings`; the map component renders clusters, markers, selected listing previews, empty state, and error handling. Evidence: `src/app/search/layout.tsx`:L46-L93; `src/components/PersistentMapWrapper.tsx`:L4-L17, L365-L430; `src/components/Map.tsx`:L3876-L4573; `evidence-register.md` C013-C015.

Search cards link to listing detail pages and include favorite and show-on-map actions. The current contact-host handoff is source-verified as search card -> listing detail -> Contact Host CTA; this pass does not claim a direct search-card Contact Host CTA or a full browser journey to messages. Evidence: `src/components/listings/ListingCard.tsx`:L349-L352, L471-L499; `src/app/listings/[id]/ListingPageClient.tsx`:L505-L518, L529-L590, L1401-L1417; `src/components/ContactHostButton.tsx`:L98-L145, L156-L173; `evidence-register.md` C017, C060.

## Main entry points

| Area | Entry point | Evidence |
|---|---|---|
| Route | `/search` via `src/app/search/page.tsx` | `evidence-register.md` C001 |
| Layout | `src/app/search/layout.tsx` | `evidence-register.md` C013 |
| Results client | `src/components/search/SearchResultsClient.tsx` | `phase-4/03-state-model.md` result-list row |
| Search form | `src/components/SearchForm.tsx` | `phase-4/01-ui-interaction-census.md` location/filter rows |
| Map wrapper | `src/components/PersistentMapWrapper.tsx` | `evidence-register.md` C014 |
| Map | `src/components/Map.tsx` | `evidence-register.md` C015 |
| Listing card | `src/components/listings/ListingCard.tsx` | `evidence-register.md` C017 |
| APIs | `/api/search/v2`, `/api/search/listings`, `/api/search/facets`, `/api/map-listings`, `/api/geocoding/autocomplete`, `/api/favorites` | `phase-4/02-api-data-flow.md` |

## Source of truth

Committed search state is URL-first: raw URL params are parsed by `parseSearchParams`, producing normalized filters, sort, page, bounds, and bounds-required flags. Client components keep local pending or transient state for form fields, modal drafts, map viewport, selected listing, load-more cursor, and optimistic saved state. Evidence: `src/lib/search-params.ts`:L4-L47, L790-L906; `phase-4/03-state-model.md`.

## Key invariants

| Invariant | Evidence | Status |
|---|---|---|
| URL params are the canonical committed search input. | `evidence-register.md` C003 | Verified by code |
| Text searches without usable bounds can enter a bounds-required state instead of scanning everything. | `evidence-register.md` C004, C011 | Verified by code |
| V2/search-doc is primary, with explicit legacy fallback/control-state branches. | `evidence-register.md` C006, C009, C063 | Verified by code and focused route/action tests; full service parity remains P2 |
| Public search/map APIs are rate-limited. | `phase-4/04-auth-security-permissions.md` | Verified by code |
| Saved listing mutation requires auth on POST. | `evidence-register.md` C018-C019 | Verified by code |
| Runtime behavior and test status must be scoped to checks that actually ran. | `unknowns.md` G001-G002; `runtime-verification.md`; `evidence-register.md` C056, C062, C064 | Smoke/filter/pagination/root pagination-sort reset/map-bounds round-trip/desktop map-list parity/results-state/URL-state/saved-listing/mobile-map/error-resilience/map-error-a11y, focused API/unit Jest, release gate, real captured public-payload PII scan, and no-arg checked-in public payload fixture gate passed; non-gate broader E2E remains unverified |

## Quick links

- [Feature boundary](./00-feature-boundary.md)
- [Source map](./01-source-map.md)
- [User flows](./02-user-flows.md)
- [Interaction census](./03-interaction-census.md)
- [Runtime sequences](./04-runtime-sequences.md)
- [API contracts](./05-api-contracts.md)
- [Data model and invariants](./06-data-model-and-invariants.md)
- [State management](./07-state-management.md)
- [URL/search-param reference](./13-url-search-param-reference.md)
- [Auth/security/permissions](./08-auth-security-permissions.md)
- [Errors, empty, loading, edge cases](./09-errors-empty-loading-edge-cases.md)
- [Performance and observability](./10-performance-observability.md)
- [Test traceability matrix](./11-test-traceability-matrix.md)
- [Gaps and unknowns](./12-gaps-unknowns-and-questions.md)
- [Runtime verification](./runtime-verification.md)
- [Dirty worktree source inventory](./dirty-worktree-source-inventory.md)
- [Round-trip reconstruction review](./round-trip-review.md)
- [Public payload PII triage](./public-payload-pii-triage.md)
- [Evidence register](./evidence-register.md)
- [Manifest](./manifest.json)
