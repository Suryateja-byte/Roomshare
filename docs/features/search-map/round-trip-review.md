# Round-Trip Reconstruction Review

Date: 2026-05-08

Scope: `docs/features/search-map/` only. Source code was not inspected for this
review. This is a documentation comprehension test: can a fresh reader rebuild
the feature model from the docs alone?

Remediation note: the two P0 gaps found by this Phase 11 review are now
addressed by `02-user-flows.md`, `04-runtime-sequences.md`, and
`13-url-search-param-reference.md`. The remaining P1 items below are still
follow-up documentation improvements.

## Overall Result

| Area | Result | Summary |
|---|---|---|
| Main user flows | Clear from docs | The primary `/search`, filter/sort, pagination, automatic map-pan search, listing-card, saved-listing, saved-search, and indirect listing-detail Contact Host handoff paths can be reconstructed. Direct Contact Host from search cards and a manual Search-this-area button/toggle are correctly excluded from current behavior. |
| Public API contracts | Partially clear | Endpoint list, high-level inputs, auth, errors, and verification status are clear. Exact response schemas, cache semantics, and per-field public/private payload contracts are still incomplete. |
| State machine | Partially clear | URL-first search, SSR search, client result state, V2 map data, load-more, and map pan/fetch loops are reconstructable. Error, empty, auth, save, mobile sheet, and privacy states are not integrated into the state-machine diagram. |
| URL/search param model | Clear after P0 follow-up | The docs make the URL the canonical committed search state, and `13-url-search-param-reference.md` now provides the exact param list, legacy aliases, allowed values, defaults, invalid-input handling, serialization, and reset rules. |
| Key invariants | Clear from docs | The invariants table is useful and grounded: URL-first state, bounded geography, auth-protected saved mutations, public payload privacy, source-extracted V2/search-doc versus legacy fallback states, automatic map-pan search separated from the removed manual Search-this-area control, and no active booking UX claim. |
| Error/empty/loading states | Partially clear | Important scenarios and test coverage are listed. Exact user-visible UI copy, route/API status behavior, retry behavior, and ownership by component/API are not always reconstructable without source. |
| Minimum test plan | Clear from docs | The test traceability matrix and runtime verification file give a practical P0/P1 test plan and clearly separate passed, not-run, skipped, and remaining coverage gaps. |

Verdict: **usable but not complete**. A developer can understand the feature
shape and current verified claims, but would still need source inspection to
implement against exact API payloads or URL param semantics.

## Reconstruction Notes

### 1. Main User Flows

Status: **clear from docs**.

A fresh reader can reconstruct these flows:

- User visits `/search`; the server parses URL params, applies rate limiting,
  runs V2 search first, may fall back to legacy data, and renders
  `SearchResultsClient` plus map handoff.
- User types/selects a location; autocomplete uses `/api/geocoding/autocomplete`
  and selected location data flows into `SearchForm`.
- User changes filters or sort; the committed state is represented in the URL
  and the route re-runs search.
- User clicks load more; `SearchResultsClient` calls `fetchMoreListings`, which
  validates/rate-limits cursor use and returns another page or error state.
- User pans/zooms the map; map bounds feed map listing fetch/update behavior.
- User clicks listing card; card navigates to listing detail.
- User clicks favorite; authenticated users save/unsave, anonymous users are
  redirected to login after a protected POST fails.
- User saves a search through the saved-search action, with auth/rate-limit
  validation.

Useful docs: `README.md`, `02-user-flows.md`, `03-interaction-census.md`,
`04-runtime-sequences.md`, `runtime-verification.md`.

Remaining ambiguity:

- Resolved P0 follow-up: `02-user-flows.md` and `04-runtime-sequences.md` now
  describe the current Phase 10 runtime status instead of saying browser
  behavior is still unverified.
- Contact-host is correctly marked as not directly verified from search cards,
  but the reader cannot reconstruct the handoff beyond “open listing detail.”
- Automatic map-pan search is documented as current source behavior, while the
  removed manual Search-this-area button/toggle is excluded from current
  behavior.

### 2. Public API Contracts

Status: **partially clear**.

A fresh reader can reconstruct the public/API surface:

- `/api/search/v2`: public, rate-limited, returns V2 list/map/meta or
  bounds-required state; `list.fullItems` is now described as public/sanitized.
- `/api/search/listings`: public, rate-limited, list/cursor/page response with
  V2/fallback behavior.
- `/api/search/facets`: public, rate-limited, returns facet counts/histogram.
- `/api/map-listings`: public, rate-limited, requires/derives bounded geography
  and returns map listing state.
- `/api/geocoding/autocomplete`: public, rate-limited autocomplete endpoint.
- `/api/favorites`: GET is public/optional-auth; POST is protected by CSRF,
  auth, rate limit, suspension, and schema validation.
- `fetchMoreListings` and `saveSearch` are server actions.

Useful docs: `05-api-contracts.md`, `08-auth-security-permissions.md`,
`public-payload-pii-triage.md`, `runtime-verification.md`.

Remaining ambiguity:

- Exact response object schemas are not fully extractable from docs alone.
- Error response shapes are summarized but not exact enough for a client
  implementer.
- Cache headers/public-vs-private response rules are described at a high level,
  but not as a route-by-route contract.
- The fixed public payload contract says private fields are sanitized, but the
  docs do not include a compact `PublicSearchListing` field table.

### 3. State Machine

Status: **partially clear**.

A fresh reader can reconstruct the main state loop:

```text
Raw URL -> parseSearchParams -> /search SSR -> SearchResultsClient
SearchResultsClient -> URL change -> Raw URL
SearchResultsClient -> fetchMoreListings -> SearchResultsClient
Server V2 map data -> map render -> pan/zoom -> map listing fetch -> map render
```

Useful docs: `07-state-management.md`,
`diagrams/state-machine-search-url-map.mmd`, `04-runtime-sequences.md`.

Remaining ambiguity:

- The state-machine diagram does not include empty, error, loading, rate-limit,
  invalid-param, save-listing, save-search, auth redirect, or mobile sheet
  states.
- Reset conditions are spread across `07-state-management.md`,
  `03-interaction-census.md`, and `12-gaps-unknowns-and-questions.md`.
- Cursor/query-hash reset behavior is identified as important, but not fully
  represented in the diagram.

### 4. URL/Search Param Model

Status: **clear after P0 follow-up**.

A fresh reader can reconstruct the concept:

- URL params are the canonical committed search input.
- `parseSearchParams` normalizes raw URL params into filters, sort, page,
  bounds, and bounds-required flags.
- Client filter controls hold draft state before applying changes to URL.
- Sort, load-more, root pagination reset, and map-bounds round-trip behavior
  have focused runtime coverage; broader cross-browser/mobile reset coverage
  remains confidence coverage.

Useful docs: `README.md`, `07-state-management.md`,
`13-url-search-param-reference.md`, `06-data-model-and-invariants.md`,
`09-errors-empty-loading-edge-cases.md`.

Remaining ambiguity:

- Resolved P0 follow-up: `13-url-search-param-reference.md` now provides a
  single URL param reference table with param name, aliases, type, allowed
  values, defaults, normalization/rejection behavior, and reset effects.
- The exact mapping from filter UI controls to URL params is not reconstructable
  without source.
- Bounds-required behavior is described, but route-by-route differences are not
  fully tabulated.

### 5. Key Invariants

Status: **clear from docs**.

A fresh reader can reconstruct these invariants:

- URL params are canonical committed search input.
- Text searches without usable bounds must not trigger unsafe unbounded scans.
- Map APIs need bounded or derived geography.
- V2/search-doc is primary, with source-extracted legacy fallback/control-state
  behavior in C063.
- Cursor/query hash state is intended to prevent stale pagination, though some
  reset behavior remains a gap.
- Saved listing mutation requires authentication.
- Public search/map cache responses must not expose user-specific saved state
  or private listing/location data.
- Public payloads should not expose exact coordinates, owner IDs, addresses,
  zips, raw group keys, or raw context keys.
- A manual Search-this-area button/toggle and direct search-card Contact Host
  must not be documented as current behavior without more evidence; current
  source-backed contact-host handoff is through listing detail.
- Booking references must remain labeled as current code/data history, not
  active booking UX.

Useful docs: `06-data-model-and-invariants.md`,
`08-auth-security-permissions.md`, `public-payload-pii-triage.md`,
`12-gaps-unknowns-and-questions.md`.

Remaining ambiguity:

- Some invariants are still “intended” or partially verified, especially
  cursor reset and V2/legacy parity.

### 6. Error, Empty, And Loading States

Status: **partially clear**.

A fresh reader can reconstruct major scenarios:

- No results, sparse results, result cap, and near-match states have focused
  browser coverage.
- Location query without bounds can produce a location/bounds-required state.
- Invalid bounds, huge bounds, invalid cursor, and rate limiting have parser,
  route, or runtime evidence.
- V2 unavailable can fall back or show unavailable state depending path.
- Map API/style/tile errors have focused map error/a11y coverage, and C058
  verifies `/api/map-listings` 500/429 retryable browser behavior.
- Anonymous favorite redirects to login; suspended favorite returns 403;
  save-search invalid/unauthorized returns errors.

Useful docs: `09-errors-empty-loading-edge-cases.md`,
`runtime-verification.md`, `11-test-traceability-matrix.md`.

Remaining ambiguity:

- Exact UI copy and selectors for each failure state are not always present.
- Loading state ownership is not summarized as a state machine.
- Retry behavior is documented for some paths, but not consistently across all
  API/map/autocomplete/save-search cases.

### 7. Minimum Test Plan

Status: **clear from docs**.

A fresh reader can reconstruct the minimum P0 plan:

- `/search` initial render.
- Filter changes update URL/results.
- Sort/load-more pagination behavior.
- Desktop and mobile map/list behavior.
- Empty/loading/error/invalid URL states.
- Anonymous and authenticated saved-listing behavior.
- Search V2, map-listings, facets, favorites, map payload sanitization, and
  search-param unit/API coverage.
- Public payload PII scan with captured real payloads.
- Full search release gate.

Useful docs: `11-test-traceability-matrix.md`, `runtime-verification.md`,
`10-performance-observability.md`.

Remaining ambiguity:

- Some rows still list broader commands as not run; that is honest, but the
  docs should distinguish “required before release” from “useful future
  confidence.”
- The no-arg public-payload scanner wrapper now passes checked-in public payload
  fixtures in C064. Live-server payload capture remains optional confidence
  coverage if release owners need runtime parity beyond fixtures.

## Required Documentation Fixes

| Priority | Status | Fix | Why |
|---|---|---|---|
| P0 | Addressed | Update stale browser-verification wording in `02-user-flows.md` and `04-runtime-sequences.md`. | It conflicted with the current Phase 10 and PR #119 verification evidence. |
| P0 | Addressed | Add a URL/search-param reference table. | Without it, a fresh reader could not reconstruct the exact URL model from docs alone. |
| P1 | Addressed | Add compact public response field tables for `/api/search/v2`, `/api/search/listings`, `/api/map-listings`, and `/api/favorites`. | `05-api-contracts.md` now includes response envelope, cache/header, and error tables. |
| P1 | Addressed | Expand the state-machine diagram or add a second diagram for error/loading/auth/save/mobile states. | `07-state-management.md` and `diagrams/state-machine-search-url-map.mmd` now cover loading, error, auth, save, listing-card/media, and mobile state families. |
| P1 | Addressed | Add a `PublicSearchListing` / public map payload field table after the P0 privacy fix. | `05-api-contracts.md` now documents `PublicSearchListing`, `SearchV2ListItem`, and `MapListingData` public payloads. |
| P1 | Addressed | Separate “release-blocking remaining tests” from “nice-to-have broader tests.” | `11-test-traceability-matrix.md` now separates release-blocking tests from confidence-building grouped inventory. |

## Final Assessment

The docs now pass the round-trip test for high-level feature understanding, P0
verification status, compact API/cache/payload reconstruction, state-machine
coverage, and release-blocking test traceability. Remaining work is limited to
P1/P2 confidence-building gaps already listed in `12-gaps-unknowns-and-questions.md`
and `unknowns.md`: broader non-gate map/list/filter/pagination/mobile coverage,
saved-search auth/paywall runtime coverage, optional direct search-card Contact
Host product work or full contact-host handoff browser proof, optional stale
Mapbox comment/fixture cleanup, C063 residual `/api/search/listings`
route-handler/service semantic-suite coverage, and optional generated
API/test-index artifacts.
