# Current Search Page Implementation

Last verified against code on 2026-04-09.

This document is the current-state reference for Roomshare search across the screens that users actually touch today:

- homepage search entry
- `/search` desktop
- `/search` mobile
- saved-search surfaces that reopen `/search`

It is intended to replace guesswork from older generated search docs. Those older docs are still useful for historical depth, but several implementation details have drifted.

## Scope

This doc covers:

- how search is entered
- how the `/search` route is laid out
- what renders on desktop vs mobile
- how filter, sort, map, and results state move through the system
- what is currently live versus what exists in code but is not wired

This doc does not attempt to re-document every low-level search algorithm in `src/lib/search/*`. It focuses on product-visible implementation and the files that own it.

## Current Architecture In One Pass

Search is a URL-first system with a persistent `/search` layout:

1. Search inputs write normalized state into the URL.
2. `/search/page.tsx` parses that URL and fetches the list payload on the server.
3. The search layout stays mounted across URL changes so the header and map do not remount.
4. The map fetches independently in `PersistentMapWrapper`.
5. The list is rendered by `SearchResultsClient`, which handles pagination, zero states, announcements, and optional client-side refreshes.

The important current reality is that V2 list search is live, but V2 map-data injection is not currently wired into the page render path. The list can come from V2, while the map still manages its own fetch path.

## Screen Inventory

### 1. Homepage hero search

Primary files:

- `src/app/page.tsx`
- `src/app/HomeClient.tsx`
- `src/components/SearchForm.tsx`

What happens:

- The homepage lazy-loads `SearchForm` with `variant="home"`.
- The home variant keeps the same search logic as the `/search` form, but uses a hero-specific visual treatment.
- Submitting the form navigates to `/search?...` with the same URL contract used everywhere else.
- If the lazy-loaded search form fails, the hero falls back to a plain CTA link to `/search`.

Why it matters:

- The homepage is not a separate search implementation.
- It is a styling and layout variant of the same `SearchForm` logic.

### 2. `/search` persistent shell

Primary files:

- `src/app/search/layout.tsx`
- `src/components/SearchHeaderWrapper.tsx`
- `src/components/SearchLayoutView.tsx`

What stays mounted:

- the fixed header
- the map shell
- provider state for transitions, mobile UI, list/map coordination, and filter state

Provider stack in practice:

- `SearchTransitionProvider`
- `FilterStateProvider`
- `MobileSearchProvider`
- `MapBoundsProvider`
- `ActivePanBoundsProvider`
- `ListingFocusProvider`
- `SearchV2DataProvider`
- `SearchMapUIProvider` inside `SearchLayoutView`

Why it matters:

- query-param navigations re-render the page segment, not the whole search shell
- the map stays alive between refinements
- the header height is measured dynamically and written to `--header-height`

### 3. `/search` desktop header

Primary files:

- `src/components/SearchHeaderWrapper.tsx`
- `src/components/search/DesktopHeaderSearch.tsx`

Current behavior:

- Desktop always uses `DesktopHeaderSearch`; it does not mount the full `SearchForm` in the header.
- When the page is not collapsed, the desktop header shows the full inline editor.
- When the header is collapsed, the desktop header switches to a compact summary pill with `Where` and `Vibe`.
- `Cmd/Ctrl+K` opens search.
- `DesktopHeaderSearch` owns a lighter-weight desktop header form:
  - location autocomplete
  - vibe text input
  - min/max budget
  - submit button
- On submit it builds search-intent params, normalizes price, optionally dispatches the map fly-to event, and navigates to `/search`.

Important distinction:

- The desktop header search is not the same component as the main `SearchForm`.
- It is a purpose-built compact header editor for the persistent search route.

### 4. `/search` mobile header

Primary files:

- `src/components/SearchHeaderWrapper.tsx`
- `src/components/CollapsedMobileSearch.tsx`
- `src/components/search/MobileSearchOverlay.tsx`

Current behavior:

- Mobile never shows the full inline `SearchForm` in the header.
- The fixed header shows `CollapsedMobileSearch`.
- Tapping the pill opens `MobileSearchOverlay`, rendered through a portal.
- The overlay contains:
  - back button
  - location autocomplete
  - min/max budget
  - filters button
  - search button
  - recent searches

Important distinction:

- The mobile header path is an Airbnb-style overlay flow.
- It replaced the older “expand inside the header” behavior.

### 5. `/search` desktop results screen

Primary files:

- `src/app/search/page.tsx`
- `src/components/SearchViewToggle.tsx`
- `src/components/search/InlineFilterStrip.tsx`
- `src/components/search/SearchResultsLoadingWrapper.tsx`
- `src/components/search/SearchResultsClient.tsx`

Desktop layout:

- left pane is the results list
- right pane is the map when enabled
- if the map is hidden, the list expands to full width and a floating `Show map` button appears

Desktop list column:

- `InlineFilterStrip`
- heading with result count and location
- desktop `SaveSearchButton`
- `SortSelect`
- loading wrapper
- results error boundary
- `SearchResultsClient`

Desktop width behavior:

- list is `60%` on medium desktop and `55%` on large desktop when map is visible
- map is `40%` / `45%`
- list becomes full-width when map is hidden

### 6. `/search` mobile results screen

Primary files:

- `src/components/SearchViewToggle.tsx`
- `src/components/search/MobileBottomSheet.tsx`
- `src/components/search/FloatingMapButton.tsx`
- `src/contexts/MobileSearchContext.tsx`

Mobile layout:

- the map is the background layer
- the results list lives inside a bottom sheet
- the sheet has three snap points:
  - map-focused
  - peek
  - expanded list
- a floating pill toggles between map-focused and list-focused states

Important mobile behavior:

- the current snap state is mirrored into `MobileSearchContext`
- the results header text comes from the list, but map states can override it
- marker selection can collapse the sheet back toward the map so preview cards remain visible

## Search Entry Components

### `SearchForm`

Primary file:

- `src/components/SearchForm.tsx`

Variants:

- `home`
- `default`
- `compact`

Current responsibilities:

- read search intent from URL
- manage location input and selected coordinates separately
- guard against unbounded text searches by requiring a selected location
- support semantic/vibe input through `what`
- maintain batched draft filter state through `useBatchedFilters`
- open the shared `FilterModal`
- save recent searches
- debounce navigations
- dispatch `MAP_FLY_TO_EVENT` after location changes
- preserve or reset bounds depending on whether the user changed filters or chose a new location

Current filter set owned here:

- price
- move-in date
- lease duration
- room type
- amenities
- house rules
- languages
- gender preference
- household gender
- min slots

Important implementation notes:

- The form keeps URL state as the source of truth, but uses pending draft state while the filter drawer is open.
- `where` and `what` are intentionally separate.
- The location warning is absolutely positioned so it does not change header height and accidentally trigger map-related URL churn.

### `DesktopHeaderSearch`

Primary file:

- `src/components/search/DesktopHeaderSearch.tsx`

Responsibilities:

- compact header-only desktop editor for `/search`
- sync from URL
- open/focus on keyboard shortcut
- submit directly to `/search`
- support collapsed-summary mode

### `MobileSearchOverlay`

Primary file:

- `src/components/search/MobileSearchOverlay.tsx`

Responsibilities:

- full-screen mobile portal overlay
- recent-search recall
- lightweight location + price edits
- open the shared filter drawer via callback from the header

## Results Screen Composition

### `page.tsx`

Primary file:

- `src/app/search/page.tsx`

Current responsibilities:

- generate metadata
- parse raw URL params with shared search-param utilities
- reject unbounded searches early
- apply SSR rate limiting
- attempt V2 list search first
- fall back to V1 search on failure
- compute total, near-match expansion, and normalized client key
- render the results shell

Current server-side states handled here:

- location-required prompt
- SSR rate-limit response
- V2 fallback to V1
- normal results render

### `SearchResultsClient`

Primary file:

- `src/components/search/SearchResultsClient.tsx`

Current responsibilities:

- render all listing cards
- optional client-side refresh path when `features.clientSideSearch` is on
- incremental “Show more places” pagination through the server action
- dedupe listings across pagination
- update mobile results label
- resolve saved-listing state for visible cards
- compute split-stay suggestions for longer stays
- render zero-result, sparse-result, and advisory states

Current result states inside the component:

- zero results
- browse suggestions when no query is active
- normal results
- near-match separator and explanatory text
- split-stay recommendations
- load-more
- accumulated-results cap
- load-more error
- end-of-results message
- desktop save-search CTA block

### `SearchResultsLoadingWrapper`

Primary file:

- `src/components/search/SearchResultsLoadingWrapper.tsx`

Current behavior:

- keeps the old list mounted during search transitions
- dims the list and shows a compact “Updating results…” status pill
- announces new result headings to screen readers after transitions finish
- only shifts focus when non-viewport filters change

### `SearchResultsErrorBoundary`

Primary file:

- `src/components/search/SearchResultsErrorBoundary.tsx`

Current behavior:

- catches render-time list failures
- shows inline retry UI
- forces a child remount on retry using `retryKey`

## Filters, Sort, And Search Controls

### `InlineFilterStrip`

Primary file:

- `src/components/search/InlineFilterStrip.tsx`

Desktop behavior:

- shows desktop quick filters for price, move-in, room type, duration, and advanced filters
- shows applied filter chips with remove and clear-all controls

Mobile behavior:

- only appears when the bottom sheet is in list mode
- surfaces a reduced set of primary pills plus the filters button
- also shows applied filter chips, but truncates them more aggressively

Important implementation note:

- While mounted on the results screen, `InlineFilterStrip` registers the highest-priority `openFilters` handler in `MobileSearchContext`, so mobile filter actions open the results-screen drawer instead of the header overlay path.

### `FilterModal`

Primary file:

- `src/components/search/FilterModal.tsx`

Current behavior:

- shared between the main search form and the results strip
- full-screen mobile drawer
- right-side desktop drawer
- pure presentational component; state lives in `SearchForm` or `InlineFilterStrip`
- supports dynamic count preview, histogram-backed pricing, and zero-count suggestion pills

### `SortSelect`

Primary file:

- `src/components/SortSelect.tsx`

Current behavior:

- mobile uses a bottom sheet
- desktop uses a Radix select
- changing sort resets pagination state in the URL

### `SaveSearchButton`

Primary file:

- `src/components/SaveSearchButton.tsx`

Current behavior:

- reads the current URL
- converts it back into validated search filters through `parseSearchParams`
- opens a modal to name the search and enable alerts
- appears both near the desktop heading and in the desktop post-results CTA block

## Map And Cross-Surface Coordination

### `PersistentMapWrapper`

Primary file:

- `src/components/PersistentMapWrapper.tsx`

Current responsibilities:

- stay mounted in the layout
- react to URL changes through `useSearchParams`
- lazy-load the heavy map implementation
- fetch map data independently
- debounce viewport-triggered fetches
- maintain a small spatial cache

### `SearchMapUIContext`

Primary file:

- `src/contexts/SearchMapUIContext.tsx`

Current responsibilities:

- coordinate “focus this listing on the map”
- request opening the map if hidden
- let map popups be dismissed by list-side actions

### `MapMovedBanner`

Primary file:

- `src/components/map/MapMovedBanner.tsx`

Current behavior:

- desktop list variant appears above results when the map moved but results are stale
- map variant appears floating on the map itself
- supports “Search this area” and reset

### Mobile map status surfaces

Primary files:

- `src/components/map/MobileMapStatusCard.tsx`
- `src/components/map/MapEmptyState.tsx`
- `src/components/Map.tsx`
- `src/contexts/MobileSearchContext.tsx`

Current behavior:

- On phones, the map can override the bottom-sheet header label to values like `Map moved` or `No places here`.
- When the phone map is stale or confirmed empty, the map prefers the map-focused mobile view and shows a status card above the map.
- The status card can:
  - search this area
  - reset map
  - zoom out
  - clear filters
  - enable near matches
  - remove suggestion filters

## Data Flow And API Reality

### URL contract

Core params used today include:

- `q`
- `where`
- `what`
- `minPrice`
- `maxPrice`
- `moveInDate`
- `leaseDuration`
- `roomType`
- `amenities`
- `houseRules`
- `languages`
- `genderPreference`
- `householdGender`
- `minSlots`
- `sort`
- `minLat`
- `maxLat`
- `minLng`
- `maxLng`
- `lat`
- `lng`
- `cursor`
- `page`

### Current list fetch path

Primary files:

- `src/app/search/page.tsx`
- `src/app/search/actions.ts`
- `src/app/api/search/listings/route.ts`
- `src/lib/search/search-v2-service.ts`

Current behavior:

- Initial list render is server-side in `page.tsx`.
- V2 is attempted first when enabled.
- V1 is the fallback path.
- “Show more places” uses the server action `fetchMoreListings`.
- When `features.clientSideSearch` is enabled, `SearchResultsClient` listens for URL changes and refreshes the list through `/api/search/listings` instead of waiting for another SSR pass.

### Current map fetch path

Primary files:

- `src/components/PersistentMapWrapper.tsx`
- `src/components/Map.tsx`

Current behavior:

- The map does not depend on the list payload being passed down from `page.tsx`.
- It watches URL params and fetches what it needs independently.

### Important current caveat: V2 map data setter is not live

Primary files:

- `src/components/search/V1PathResetSetter.tsx`
- `src/components/search/V2MapDataSetter.tsx`
- `src/contexts/SearchV2DataContext.tsx`

Current reality:

- `V1PathResetSetter` is rendered on every `/search` page render.
- `V2MapDataSetter` exists, but `page.tsx` does not currently render it.
- That means the V2 map-data-sharing path described in older docs is not live right now.
- The list can still use V2 search, but the map remains on its own fetch path.

## Results-State Matrix

### Desktop and mobile both support

- normal results
- loading overlay during navigation
- render error boundary
- zero results
- near-match disclosure
- save search
- sort
- filter chips
- load more

### Desktop-specific presentation

- split pane or list-only mode
- desktop quick filters
- heading row with `SaveSearchButton`
- post-results save-search CTA block

### Mobile-specific presentation

- collapsed header pill
- full-screen search overlay
- map-as-background layout
- draggable result sheet
- floating map/list toggle pill
- map-owned status-card overlays that can temporarily override the sheet header copy

## Non-`/search` Surfaces That Reopen Search

### Saved searches

Primary files:

- `src/app/saved-searches/page.tsx`
- `src/app/saved-searches/SavedSearchList.tsx`

Current behavior:

- Authenticated users manage saved searches here.
- Each saved search links back into `/search` using `buildSearchUrl(...)`.

### Saved listings

Primary files:

- `src/app/saved/page.tsx`
- `src/app/saved/SavedListingsClient.tsx`

Current behavior:

- Does not embed search UI.
- Provides `Find more` and empty-state links back to `/search`.

## What Changed Relative To Older Docs

These are the main drift points to keep in mind when reading older search docs:

- mobile header now uses `CollapsedMobileSearch` + `MobileSearchOverlay`
- desktop header uses `DesktopHeaderSearch`, not the full `SearchForm`
- `/search` uses a bottom-sheet mobile layout rather than a simple mobile list page
- `V2MapDataSetter` exists but is not wired into `page.tsx`
- the persistent layout uses dynamic header-height measurement rather than a fixed constant
- mobile map status can override bottom-sheet copy through `MobileSearchContext`

## File Map

Core route shell:

- `src/app/search/layout.tsx`
- `src/app/search/page.tsx`
- `src/app/search/loading.tsx`
- `src/app/search/error.tsx`
- `src/app/search/actions.ts`

Header and entry:

- `src/components/SearchHeaderWrapper.tsx`
- `src/components/SearchForm.tsx`
- `src/components/CollapsedMobileSearch.tsx`
- `src/components/search/DesktopHeaderSearch.tsx`
- `src/components/search/MobileSearchOverlay.tsx`

Results shell:

- `src/components/SearchLayoutView.tsx`
- `src/components/SearchViewToggle.tsx`
- `src/components/search/InlineFilterStrip.tsx`
- `src/components/search/FilterModal.tsx`
- `src/components/search/SearchResultsLoadingWrapper.tsx`
- `src/components/search/SearchResultsErrorBoundary.tsx`
- `src/components/search/SearchResultsClient.tsx`
- `src/components/SortSelect.tsx`
- `src/components/SaveSearchButton.tsx`

Map side:

- `src/components/PersistentMapWrapper.tsx`
- `src/components/Map.tsx`
- `src/components/map/MapMovedBanner.tsx`
- `src/components/map/MobileMapStatusCard.tsx`
- `src/components/map/MapEmptyState.tsx`

Shared state:

- `src/contexts/MobileSearchContext.tsx`
- `src/contexts/SearchTransitionContext.tsx`
- `src/contexts/SearchV2DataContext.tsx`
- `src/contexts/SearchMapUIContext.tsx`

Entry points outside `/search`:

- `src/app/HomeClient.tsx`
- `src/app/saved-searches/page.tsx`
- `src/app/saved-searches/SavedSearchList.tsx`
- `src/app/saved/SavedListingsClient.tsx`

## Recommended Source Of Truth Order

If you need to understand current behavior quickly, read files in this order:

1. `src/app/search/layout.tsx`
2. `src/components/SearchHeaderWrapper.tsx`
3. `src/components/SearchViewToggle.tsx`
4. `src/app/search/page.tsx`
5. `src/components/search/SearchResultsClient.tsx`
6. `src/components/search/InlineFilterStrip.tsx`
7. `src/components/SearchForm.tsx`
8. `src/components/PersistentMapWrapper.tsx`
9. `src/components/Map.tsx`

That path reflects the current runtime architecture more accurately than the older generated search docs.
