# Source Map

This file is the final-doc entry point for the Phase 1/2 source map. The detailed evidence table remains in `source-map.md`; this file groups the same evidence for readers.

| Area | Files | Responsibility | Evidence | Confidence |
|---|---|---|---|---|
| `/search` SSR route | `src/app/search/page.tsx` | Parses params, rate-limits, runs V2 search, falls back to legacy results, renders result shell. | `evidence-register.md` C001-C006 | Verified |
| `/search` layout | `src/app/search/layout.tsx` | Hosts persistent search layout, providers, header, and map/list regions. | `evidence-register.md` C013 | Verified |
| URL parsing | `src/lib/search-params.ts` | Canonical URL to normalized search filters, bounds, sort, and page state. | `evidence-register.md` C003-C004 | Verified |
| Results client | `src/components/search/SearchResultsClient.tsx` | Client list state, load-more, client refresh, saved IDs, empty/loading/error display. | `phase-4/03-state-model.md` | Verified by code |
| Search form and filters | `src/components/SearchForm.tsx`, `src/components/search/FilterModal.tsx`, `src/components/search/InlineFilterStrip.tsx`, `src/components/SortSelect.tsx` | Location, filters, sort, clear-all, warnings, and URL/filter mutation controls. | `phase-4/01-ui-interaction-census.md` | Partially verified |
| Map wrapper and map | `src/components/PersistentMapWrapper.tsx`, `src/components/Map.tsx` | Persistent map data fetch, V2 map handoff, markers, clusters, selected preview, map loading/error/empty states. | `evidence-register.md` C014-C015 | Verified by code |
| Listing cards | `src/components/listings/ListingCard.tsx`, `src/components/search/SplitStayCard.tsx` | Listing detail links, favorite button, show-on-map behavior, split-stay card variant. | `evidence-register.md` C017, C029 | Verified by code |
| Search APIs | `/api/search/v2`, `/api/search/listings`, `/api/search/facets`, `/api/map-listings`, `/api/geocoding/autocomplete`, `/api/favorites` | Public search/list/map/facet/geocoding APIs and protected favorite toggle. | `phase-4/02-api-data-flow.md`, `phase-4/04-auth-security-permissions.md` | Verified by code |
| Data helpers | `src/lib/search/search-v2-service.ts`, `src/lib/search/search-doc-queries.ts`, `src/lib/data.ts`, `src/lib/search/cursor.ts` | V2 orchestration, search-doc queries, legacy fallback, cursor helpers. | `evidence-register.md` C006-C012 | Verified by code |
| State contexts | `SearchV2DataContext`, `MapBoundsContext`, `ActivePanBoundsContext`, `ListingFocusContext`, `SearchMapUIContext`, `MobileSearchContext`, `SearchListResultsContext` | Client state for map data, movement, focus, map visibility, mobile sheet, and result IDs. | `phase-4/03-state-model.md`; `evidence-register.md` C056 | Verified by code and focused desktop parity test |
| Schema and migrations | `prisma/schema.prisma`, listed migrations | Search, saved listing/search, map/location, projection, semantic, and snapshot data model support. | `evidence-register.md` C025-C026 | Verified by code |
| Tests | Manifest grouped test entries | Unit, component, API, E2E, release-gate, performance, and public payload scan coverage. Focused browser/API checks, the release gate, and the real captured public-payload PII scan have since passed; broader non-gate E2E remains partial. | `manifest.json` tests, `phase-4/05-test-traceability.md`, `runtime-verification.md` | Partially verified |

See also: `source-map.md` for the larger file-by-file source table.
