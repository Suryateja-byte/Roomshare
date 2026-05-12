# User Flows

These flows combine current code evidence with Phase 10 runtime evidence where it exists. Focused smoke, filter/URL, sort/load-more, desktop map, results-state, URL-state, saved-listing, mobile map/list, search error-resilience, map error/a11y, focused API/unit, release-gate, and captured public-payload PII checks have passed. V1-only map API mock cases and broader non-gate E2E coverage remain gaps.

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

## Filter And Sort Refinement

Filters are edited in `SearchForm` and filter UI components, then committed into search state through URL/query navigation. Sort is updated through `SortSelect` and `applySearchQueryChange`. Evidence: `src/components/SearchForm.tsx`:L733-L863, L1504-L1583; `src/components/search/FilterModal.tsx`:L30-L89, L240-L655; `src/components/SortSelect.tsx`:L61-L76; `phase-4/01-ui-interaction-census.md`.

Runtime status: Phase 10 verified desktop sort/load-more reset behavior. Code evidence also shows `applySearchQueryChange` clears `page` and `cursor` for location, filter, sort, map-pan, and saved-search reopen changes. Remaining gap: broader map-bounds reset coverage remains incomplete. Evidence: `runtime-verification.md`; `src/lib/search/search-query.ts`:L317-L375; `unknowns.md` G006.

## Pagination / Load More

`SearchResultsClient` owns client load-more state, calls `fetchMoreListings`, and updates `nextCursor`, loading, and error state. The server action validates cursors, rate-limits, calls V2 search with the cursor, and returns no cursor support for the V1 fallback. Evidence: `src/components/search/SearchResultsClient.tsx`:L710-L872; `src/app/search/actions.ts`:L48-L300; `evidence-register.md` C007.

## Map Discovery

The `/search` layout hosts a persistent map wrapper. `PersistentMapWrapper` can consume V2 map data or fetch `/api/map-listings`. `Map` renders clusters, markers, selected listing previews, and map empty/error states. Evidence: `src/app/search/layout.tsx`:L46-L93; `src/components/PersistentMapWrapper.tsx`:L4-L17, L365-L430; `src/components/Map.tsx`:L667-L786, L3655-L3749, L3876-L4573.

Runtime status: Phase 10 verified focused desktop map, mobile map/list, map error/a11y, and search release-gate paths. Remaining gap: V1-only map API mock cases and broader map/list synchronization coverage remain incomplete. Evidence: `runtime-verification.md`; `evidence-register.md` C037, C041, C043, C047; `unknowns.md` G001, G011.

## Listing Card To Detail

Listing cards build a listing detail href and render a `Link` to that target. They also include a `FavoriteButton` and a "Show on map" control when map focus is available. Evidence: `src/components/listings/ListingCard.tsx`:L349-L352, L471-L499; `evidence-register.md` C017.

## Saved Listing

Search result cards use `FavoriteButton`. The client optimistically toggles state and POSTs to `/api/favorites`. The API requires CSRF, rate limit, authentication, suspension check, and listing id validation. Evidence: `src/components/FavoriteButton.tsx`:L43-L87; `src/app/api/favorites/route.ts`:L73-L171; `evidence-register.md` C018-C019.

## Saved Search

`SaveSearchButton` reads current search params, opens a save-search modal, and calls the `saveSearch` server action. The server action requires auth, applies suspension and rate-limit checks, validates input, writes the saved search, and evaluates alert paywall state. Evidence: `src/components/SaveSearchButton.tsx`:L22-L35, L137-L178; `src/app/actions/saved-search.ts`:L67-L194; `phase-4/02-api-data-flow.md`.

## Contact Host Entry

Direct contact-host behavior was not verified from search cards. The code evidence found listing card links to listing detail pages, not a direct contact-host button in the inspected search card files. Evidence: `src/components/listings/ListingCard.tsx`:L349-L352, L492-L499; `evidence-register.md` C029; `unknowns.md` G003.
