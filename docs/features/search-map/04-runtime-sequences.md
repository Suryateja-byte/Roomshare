# Runtime Sequences

These are code-evidence sequences with Phase 10 runtime evidence called out where it exists. Focused smoke, filter/URL, sort/load-more, desktop map, results-state, URL-state, saved-listing, mobile map/list, search error-resilience, map error/a11y, focused API/unit, release-gate, and captured public-payload PII checks have passed. V1-only map API mock cases and broader non-gate E2E coverage remain gaps.

## Primary Search Load

```mermaid
sequenceDiagram
  participant User
  participant SearchPage as "/search page"
  participant Parser as "parseSearchParams"
  participant V2 as "executeSearchV2"
  participant Legacy as "getListingsPaginated"
  participant Client as "SearchResultsClient"
  participant MapData as "V2MapDataSetter"

  User->>SearchPage: Visit /search?...
  SearchPage->>Parser: Parse raw URL params
  Parser-->>SearchPage: Normalized filters, sort, page, bounds flags
  SearchPage->>SearchPage: Check SSR rate limit
  SearchPage->>V2: Execute V2 search
  alt V2 usable
    V2-->>SearchPage: Listings, meta, map data, cursor
  else V2 fallback
    SearchPage->>Legacy: Fetch legacy paginated listings
    Legacy-->>SearchPage: Legacy listings and page data
  end
  SearchPage-->>Client: Render initial list props
  SearchPage-->>MapData: Hydrate V2 map data when present
```

Evidence: `evidence-register.md` C001-C007, C034, C045, C047.

## Filter Or Sort Change

```mermaid
sequenceDiagram
  participant User
  participant UI as "Filter/Sort UI"
  participant Query as "URL query helper"
  participant Router as "Next router"
  participant SearchPage as "/search page"

  User->>UI: Change filter or sort
  UI->>Query: Build next query params
  Query-->>Router: Push/replace search URL
  Router->>SearchPage: Navigate with new params
  SearchPage->>SearchPage: Re-parse and fetch results
```

Evidence: `src/components/SearchForm.tsx`:L733-L863; `src/components/SortSelect.tsx`:L61-L76; `phase-4/01-ui-interaction-census.md`; `runtime-verification.md`. Phase 10 verified desktop sort/load-more reset behavior, while bounds and broader reset coverage remain incomplete (`unknowns.md` G006).

## Pagination

```mermaid
sequenceDiagram
  participant User
  participant Client as "SearchResultsClient"
  participant Action as "fetchMoreListings"
  participant V2 as "executeSearchV2"

  User->>Client: Click Load more
  Client->>Action: Send cursor and raw search params
  Action->>Action: Validate cursor and rate limit
  Action->>V2: Execute V2 search with cursor
  alt V2 cursor result
    V2-->>Action: Listings, nextCursor, hasNextPage
    Action-->>Client: Appendable page result
  else invalid/rate-limited/V1 fallback
    Action-->>Client: Empty/no next cursor or error state
  end
```

Evidence: `src/components/search/SearchResultsClient.tsx`:L710-L872; `src/app/search/actions.ts`:L48-L300; `runtime-verification.md`; `evidence-register.md` C036.

## Map Bounds / Marker Fetch

```mermaid
sequenceDiagram
  participant User
  participant Map as "Map"
  participant Pan as "ActivePanBoundsContext"
  participant Wrapper as "PersistentMapWrapper"
  participant API as "/api/map-listings"

  User->>Map: Pan or zoom map
  Map->>Pan: Set active pan bounds
  Wrapper->>Pan: Read active pan bounds
  Wrapper->>API: Fetch map listings for bounds and filters
  API->>API: Validate or derive bounds
  API-->>Wrapper: Map listing state
  Wrapper-->>Map: Render listings/markers
```

Evidence: `src/components/Map.tsx`:L3614-L3650; `src/contexts/ActivePanBoundsContext.tsx`:L52-L68; `src/components/PersistentMapWrapper.tsx`:L382-L430; `src/app/api/map-listings/route.ts`:L230-L397; `runtime-verification.md`; `evidence-register.md` C037, C041, C043, C056. C056 verifies the focused desktop list-backed map parity path. V1-only map API mock cases and broader non-gate map/list synchronization coverage remain gaps.

## Save Listing

```mermaid
sequenceDiagram
  participant User
  participant Button as "FavoriteButton"
  participant API as "/api/favorites"
  participant DB as "SavedListing"

  User->>Button: Click favorite
  Button->>Button: Optimistically toggle saved state
  Button->>API: POST listingId
  API->>API: Validate CSRF, rate limit, auth, suspension, body
  alt authenticated
    API->>DB: Create or delete saved listing
    DB-->>API: Saved state
    API-->>Button: { saved }
  else unauthorized
    API-->>Button: 401
    Button->>Button: Revert and route to login
  end
```

Evidence: `src/components/FavoriteButton.tsx`:L43-L87; `src/app/api/favorites/route.ts`:L73-L171; `runtime-verification.md`; `evidence-register.md` C040, C044, C045.

## Contact Host Entry

```mermaid
sequenceDiagram
  participant User
  participant Card as "Search listing card"
  participant Detail as "Listing detail page"

  User->>Card: Click listing card
  Card-->>Detail: Navigate to /listings/{id}
  Note over Card,Detail: Direct contact-host button was not verified in search card files.
```

Evidence: `src/components/listings/ListingCard.tsx`:L349-L352, L492-L499; `evidence-register.md` C029.
