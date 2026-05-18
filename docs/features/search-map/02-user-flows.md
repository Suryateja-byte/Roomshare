# User Flows

These flows combine current code evidence with Phase 10 runtime evidence where it exists. Focused smoke, filter/URL, sort/load-more, root pagination/sort reset, map-bounds round-trip, desktop map, results-state, URL-state, saved-listing, saved-search owner-project browser paths, listing-card owner-project browser paths, security owner-project browser paths, C068 location owner-project browser paths, mobile map/list, search error-resilience, map error/a11y, focused API/unit, release-gate, captured public-payload PII checks, failure-mocked `/api/map-listings` 500/429 browser checks, C065 broader chromium-anon map/list/map-tools browser checks, C066 saved-search owner-project browser checks, and C067 listing-card/security owner-project browser checks have passed. C066 passed with `7 passed`, `2 skipped`, and `.last-run.json` passed/no failures; the skips are expected cross-project ownership skips. C067 listing-card passed with `7 passed`, `7 skipped`, and security passed with `5 passed`, `5 skipped`; those skips are expected cross-project ownership skips. C068 passed focused B1 with `1 passed` and the full location spec with `4 passed`; `.last-run.json` reported passed/no failures. Non-map broader E2E outside the C066/C067/C068 owner-project specs, skipped map cases, and non-Chromium/provider breadth remain gaps.

## Primary Search Load

1. User visits `/search` with URL params.
2. `SearchPage` parses params with `parseSearchParams`.
3. The page applies SSR rate limiting.
4. The page calls `executeSearchV2`; if that path is unavailable, legacy `getListingsPaginated` can be used.
5. The page renders toolbar/filter UI, `SearchResultsClient`, and V2 map data handoff.

Evidence: `src/app/search/page.tsx`:L242-L623; `src/lib/search-params.ts`:L790-L906; `evidence-register.md` C001-C006.

## Location Search

1. User types into `LocationSearchInput`.
2. The component fetches suggestions from `/api/geocoding/autocomplete`.
3. Selecting a suggestion sends normalized location data to `SearchForm`.
4. `SearchForm` updates selected coordinates and dispatches the map fly-to event.
5. Submitting can navigate to a search URL with location/coordinate state.

Evidence: `src/components/LocationSearchInput.tsx`:L173-L236, L342-L405, L479-L501; `src/components/SearchForm.tsx`:L410-L430, L487-L659; `phase-4/01-ui-interaction-census.md`.

Runtime status: C068 verifies `tests/e2e/search/search-location.spec.ts` under `desktop-anonymous` after a test-only `SearchPage` page-object wait-ordering fix. Focused B1 passed with `1 passed` in `1.0m`, and the full spec passed with `4 passed` in `55.7s`; `.last-run.json` reported passed/no failures. Direct component/provider/geolocation variants remain P2 confidence coverage. Evidence: `evidence-register.md` C068; `runtime-verification.md`.

## Filter And Sort Refinement

Filters are edited in `SearchForm` and filter UI components, then committed into search state through URL/query navigation. Sort is updated through `SortSelect` and `applySearchQueryChange`. Evidence: `src/components/SearchForm.tsx`:L733-L863, L1504-L1583; `src/components/search/FilterModal.tsx`:L30-L89, L240-L655; `src/components/SortSelect.tsx`:L61-L76; `phase-4/01-ui-interaction-census.md`.

Runtime status: Phase 10 verified desktop sort/load-more reset behavior, and C062 verifies focused root pagination/sort reset plus map-bounds round-trip behavior. Code evidence also shows `applySearchQueryChange` clears `page` and `cursor` for location, filter, sort, map-pan, and saved-search reopen changes. Remaining broader cross-browser/mobile and non-gate pagination families are confidence coverage. Evidence: `runtime-verification.md`; `src/lib/search/search-query.ts`:L317-L375; `unknowns.md` G006; `evidence-register.md` C062.

## Pagination / Load More

`SearchResultsClient` owns client load-more state, calls `fetchMoreListings`, and updates `nextCursor`, loading, and error state. The server action validates cursors, rate-limits, calls V2 search with the cursor, and returns no cursor support for the V1 fallback. Evidence: `src/components/search/SearchResultsClient.tsx`:L710-L872; `src/app/search/actions.ts`:L48-L300; `evidence-register.md` C007.

## Map Discovery

The `/search` layout hosts a persistent map wrapper. `PersistentMapWrapper` can consume V2 map data or fetch `/api/map-listings`. `Map` renders clusters, markers, selected listing previews, and map empty/error states. Evidence: `src/app/search/layout.tsx`:L46-L93; `src/components/PersistentMapWrapper.tsx`:L4-L17, L365-L430; `src/components/Map.tsx`:L667-L786, L3655-L3749, L3876-L4573.

Runtime status: Phase 10 verified focused desktop map, mobile map/list, map error/a11y, and search release-gate paths. C056 adds committed focused desktop list/map parity evidence, C058 verifies `/api/map-listings` 500/429 browser retry behavior, and C065 verifies broader chromium-anon anonymous list/map sync, map controls/POI behavior, map search/result sync including rapid panning debounce, mobile preview, mobile map tools, and visual state. Remaining map gaps are skipped cases, non-Chromium/browser-provider breadth, live provider-network visual breadth, and unrun journey variants. Evidence: `runtime-verification.md`; `evidence-register.md` C037, C041, C043, C047, C056, C058, C065; `unknowns.md` G001, G011.

## Listing Card To Detail

Listing cards build a listing detail href and render a `Link` to that target. They also include a `FavoriteButton` and a "Show on map" control when map focus is available. Evidence: `src/components/listings/ListingCard.tsx`:L349-L352, L471-L499; `evidence-register.md` C017.

Runtime status: C067 verifies the owner-project listing-card browser paths across `desktop-anonymous` and `mobile-anonymous` with `7 passed`, `7 skipped`, runtime about `1.4m`. The run covers desktop/mobile listing-card price/date/detail-link/carousel/grouped-date panel/modal routing behavior. Broken-image/media-failure component variants remain P2 confidence coverage. Evidence: `evidence-register.md` C067; `runtime-verification.md`.

## Saved Listing

Search result cards use `FavoriteButton`. The client optimistically toggles state and POSTs to `/api/favorites`. The API requires CSRF, rate limit, authentication, suspension check, and listing id validation. Evidence: `src/components/FavoriteButton.tsx`:L43-L87; `src/app/api/favorites/route.ts`:L73-L171; `evidence-register.md` C018-C019.

## Saved Search

`SaveSearchButton` reads current search params, opens a save-search modal, and calls the `saveSearch` server action. The server action requires auth, applies suspension and rate-limit checks, validates input, writes the saved search, and evaluates alert paywall state. Evidence: `src/components/SaveSearchButton.tsx`:L22-L35, L137-L178; `src/app/actions/saved-search.ts`:L67-L194; `phase-4/02-api-data-flow.md`.

Runtime status: C066 verifies the owner-project browser paths. G3 passed under `desktop-authenticated`, covering named saved search creation, alerts toggle, weekly frequency, success toast, no crash, and sane URL. G4 passed under `failure-mocked`, covering paywalled search-alert checkout handoff with `purchaseContext: SEARCH_ALERTS`, `productCode: MOVERS_PASS_30D`, and `/checkout/mock-search-alerts`. Remaining saved-search residuals are P2 confidence work for direct action/component tests, saved-searches page variants, and broader journeys. Evidence: `evidence-register.md` C066; `runtime-verification.md`; `11-test-traceability-matrix.md`.

## Contact Host Entry

Current source evidence shows an indirect handoff: Search Map result cards and split-stay halves link to `/listings/{id}` with valid date params preserved, and the listing detail page owns the Contact Host CTA through `MessagingCta` and `ContactHostButton`. This is source/static evidence only; this pass did not run a full browser journey from search to listing detail to messages. Evidence: `src/components/search/SearchResultsClient.tsx`:L1179-L1184, L1213-L1218; `src/lib/search/listing-detail-link.ts`:L78-L95; `src/components/listings/ListingCard.tsx`:L349-L352, L471-L499; `src/components/search/SplitStayCard.tsx`:L64-L74, L155-L176; `src/app/listings/[id]/ListingPageClient.tsx`:L505-L518, L529-L590, L1401-L1417; `src/components/ContactHostButton.tsx`:L98-L145, L156-L173; `evidence-register.md` C060; `unknowns.md` G003.
