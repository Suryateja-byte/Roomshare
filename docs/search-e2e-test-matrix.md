# /search E2E Test Matrix And Setup Plan

Status: setup artifact only. Do not add broad scenario tests until this matrix is
reviewed and the harness slice is stable.

## Goal

Create a production-grade Playwright E2E harness for the `/search` page and
map/list experience. The suite must cover user-visible search behavior, URL
state, auth and paywall behavior, pagination and cursor behavior, mobile and
desktop map behavior, failure states, and security edge cases without turning
the suite into one large browser script.

## Success Criteria

- Every requested scenario has exactly one primary coverage owner in the matrix.
- Secondary coverage is cross-referenced but does not become duplicate primary
  coverage.
- Anonymous, authenticated, desktop, mobile, failure-mode, and security flows
  are separated unless they share setup naturally.
- External map/geocoding/payment/rate-limit behavior is mocked in E2E.
- Tests assert user-visible behavior, sane canonical URLs, and absence of page
  crashes/unhandled page errors.
- No real payment provider or third-party geocoding/tile dependency is required
  in CI.

## Current Repo Audit

- `playwright.config.ts` already uses Playwright Test, global E2E seeding,
  traces on first retry, screenshots on failure, and videos on first retry.
- Existing projects include authenticated desktop browsers, authenticated
  mobile browsers, and anonymous desktop browser projects.
- `tests/e2e/global-setup.ts` runs `scripts/seed-e2e.js` unless
  `SKIP_E2E_SEED` is set.
- `tests/e2e/auth.setup.ts` creates storage states for the default user,
  `user2`, and reviewer users.
- `tests/e2e/helpers/test-utils.ts` already centralizes base fixtures, stable
  selectors, animation disabling, map request mocking, navigation helpers, and
  assertion helpers.
- `tests/e2e/helpers/map-mock-helpers.ts` already mocks external map style,
  tile, Photon, and Nominatim traffic.
- Existing related specs include search smoke, search filters, semantic search,
  pagination, map interactions, map persistence, mobile bottom sheet, saved
  searches, listing carousel, dedupe/grouped dates, URL state, and security
  smoke coverage.

## Setup Gaps To Close Before Broad Tests

- Add logical project coverage for the target harness names:
  `desktop-anonymous`, `desktop-authenticated`, `mobile-anonymous`,
  `mobile-authenticated`, and `failure-mocked`.
- Keep compatibility with current project names until old specs are migrated:
  `chromium-anon`, `chromium`, `Mobile Chrome`, and `Mobile Safari`.
- Add dedicated search page objects instead of expanding generic helpers.
- Add fixture boundaries for anonymous/auth state, deterministic search seeds,
  failure mocks, and console/page error capture.
- Extend seed data only where existing `scripts/seed-e2e.js` cannot prove the
  scenario deterministically.

## Planned File Structure

```txt
tests/e2e/search/
  search-smoke.spec.ts
  search-location.spec.ts
  search-budget-validation.spec.ts
  search-filters.spec.ts
  search-results-states.spec.ts
  search-pagination.spec.ts
  search-listing-card.spec.ts
  search-saved-listing.spec.ts
  search-saved-search.spec.ts
  search-map-desktop.spec.ts
  search-map-mobile.spec.ts
  search-url-state.spec.ts
  search-security.spec.ts
  search-resilience.spec.ts

tests/e2e/fixtures/
  auth.fixture.ts
  search-data.fixture.ts
  mapbox.fixture.ts
  network-errors.fixture.ts
  console-errors.fixture.ts

tests/e2e/pages/
  SearchPage.ts
  FilterModal.ts
  MapPanel.ts
  MobileSearchOverlay.ts
  ListingCard.ts
  SavedSearchModal.ts

tests/e2e/utils/
  urlAssertions.ts
  cursorAssertions.ts
  seedSearchData.ts
  resetE2EData.ts
```

Mapbox naming is retained for workflow compatibility, but the repo currently
uses MapLibre/OpenFreeMap/Stadia/Photon/Nominatim mocks. The fixture should
cover the actual providers in this codebase and expose neutral map/geocoding
helpers to tests.

## Project Matrix

| Logical project         | Current mapping                      | User state                   | Viewport                     | Purpose                                                        |
| ----------------------- | ------------------------------------ | ---------------------------- | ---------------------------- | -------------------------------------------------------------- |
| `desktop-anonymous`     | `chromium-anon` now, new alias later | Anonymous                    | Desktop Chrome               | Browse, location, filters, URL, security happy/failure paths   |
| `desktop-authenticated` | `chromium` now, new alias later      | `playwright/.auth/user.json` | Desktop Chrome               | Save listing, saved search, paywall entry points               |
| `mobile-anonymous`      | New project needed                   | Anonymous                    | Pixel/iPhone-equivalent      | Mobile map/list, overlay, anonymous redirects                  |
| `mobile-authenticated`  | `Mobile Chrome` now, new alias later | `playwright/.auth/user.json` | Pixel/iPhone-equivalent      | Mobile saved/search flows and bottom sheet                     |
| `failure-mocked`        | New project or grep-tagged specs     | Mostly anonymous             | Desktop and mobile as needed | API failure, rate-limit, checkout, map failure, invalid bounds |

## Deterministic Seed Inventory

| Seed item                     | Current status                                                               | Purpose                                      |
| ----------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| `anon` state                  | Browser context with no `storageState` exists                                | Anonymous `/search`, anonymous save redirect |
| `renter_basic`                | `E2E_TEST_EMAIL` user seeded                                                 | Save/unsave listing, save search             |
| `renter_paywalled`            | Gap or mock-only candidate                                                   | Saved-search alert checkout/login path       |
| `listing_exact_irving_budget` | Partially present via Sunset/Inner Sunset listings                           | Location + budget + filters                  |
| `listing_near_match`          | Existing filter near-match specs likely use current seed                     | Expanded near-match advisory                 |
| `listing_sparse_region`       | Gap or mock-only candidate                                                   | Sparse results expansion                     |
| `listing_grouped_dates`       | Present as `E2E Dedupe Clone Group` seeds                                    | Desktop panel and mobile grouped-date modal  |
| `listing_multi_month_price`   | Existing list UX toggle coverage; deterministic date range may need seed     | Monthly vs total price toggle                |
| `listing_carousel_images`     | Existing listings have multiple default images                               | Carousel drag without navigation             |
| `listing_all_filters`         | Existing SF listings cover many facets; languages/gender may need seed check | Amenities, rules, languages, gender filters  |
| `zero_result_region`          | Prefer request mock or impossible URL filter                                 | Zero-state clear path                        |
| `many_results_cursor_page`    | Existing SF seed has more than 12 listings                                   | Show more, cursor, duplicate guard, cap      |

## External Mocks

| Dependency             | Mock plan                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Geocoding/autocomplete | Extend current Photon/Nominatim route mocks from `map-mock-helpers.ts`; add scenario-specific selected-location fixture data.                  |
| Map tiles/styles       | Keep minimal MapLibre style/tile mocks; add explicit failure fixture that fulfills 500/429/loading states.                                     |
| Search/list APIs       | Use `page.route` or request-level mocks only for failure/rate-limit/cap states that are hard to seed deterministically.                        |
| Payments/checkout      | Intercept `/api/payments/checkout` and `/api/payments/checkout-session`; never allow real Stripe URLs in CI except as mocked redirect strings. |
| Rate limits            | Prefer deterministic API route fulfillment with 429 and retry-after metadata for E2E; keep burst behavior in API/unit tests.                   |

## Primary Coverage Matrix

### Group A - Search Page Baseline

| ID  | Scenario                                                                        | User/project                   | Seed/mocks                                         | Actions                       | Assertions                                                                                                               | Likely files                                                                             | Priority |
| --- | ------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------- |
| A1  | Anonymous opens `/search` and sees valid results or browse-state without errors | Anonymous, `desktop-anonymous` | SF listings, map mocks, console/page-error fixture | Go to `/search`, refresh once | HTTP 200, results or browse empty state, no crash boundary, no unhandled page/page-console error, sane URL after refresh | `search-smoke.spec.ts`, `SearchPage.ts`, `console-errors.fixture.ts`, `urlAssertions.ts` | P0       |

Secondary references: existing `tests/e2e/search-p0-smoke.anon.spec.ts` and
`tests/e2e/search-smoke.spec.ts`.

### Group B - Location, Query, And Header Search

| ID  | Scenario                                                                                        | User/project                   | Seed/mocks                                             | Actions                                                           | Assertions                                                                                                                 | Likely files                                                                        | Priority |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| B1  | User searches by selected location from autocomplete                                            | Anonymous, `desktop-anonymous` | Geocoding fixture with San Francisco/Irving suggestion | Type location, select suggestion, submit                          | Selected suggestion creates canonical location/bounds params, visible results update, selected label persists after reload | `search-location.spec.ts`, `SearchPage.ts`, `mapbox.fixture.ts`, `urlAssertions.ts` | P0       |
| B2  | User types a location but does not select a suggestion and gets location-required warning/state | Anonymous, `desktop-anonymous` | No special seed                                        | Type location text, press Enter without selecting                 | Visible warning, input invalid state, no unwanted `/search` navigation, no page error                                      | `search-location.spec.ts`, `SearchPage.ts`                                          | P0       |
| B3  | User searches with "vibe" / semantic query when enabled                                         | Anonymous, `desktop-anonymous` | Semantic-enabled env or mocked semantic API response   | Enter natural-language query and submit                           | Semantic query runs or disabled state is explicit, URL is canonical, results/empty state is visible                        | `search-location.spec.ts`, `SearchPage.ts`, `urlAssertions.ts`                      | P1       |
| B4  | User uses desktop collapsed header search after scroll                                          | Anonymous, `desktop-anonymous` | SF listings, recent-search fixture optional            | Scroll until header collapses, open/edit collapsed search, submit | Collapsed control is reachable, search updates URL/results, focus and visible state remain sane                            | `search-location.spec.ts`, `SearchPage.ts`                                          | P1       |

Secondary references: existing `search-location-warning.anon.spec.ts`,
`semantic-search/*`, and `DesktopHeaderSearch` component tests.

Current implementation note: `/search` uses an internal scrolling layout, so the
desktop header does not reliably enter the browser-window collapsed summary
state in E2E. The harness tests the rendered desktop header after results
scroll, while `DesktopHeaderSearch` unit tests cover the collapsed summary
expand/edit behavior.

### Group C - Budget And Filters

| ID  | Scenario                                                                                                                                                                            | User/project                                          | Seed/mocks                                   | Actions                                    | Assertions                                                                                                                | Likely files                                                             | Priority |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| C1  | User searches with min/max budget, including `min > max`, negative values, and empty values                                                                                         | Anonymous, `desktop-anonymous` and API/contract tests | SF price spread                              | Apply valid budget, then invalid variants  | Valid range filters results; invalid values show validation or canonical correction; empty values remove params; no crash | `search-budget-validation.spec.ts`, `FilterModal.ts`, `urlAssertions.ts` | P0       |
| C2  | User opens filters and applies price, move-in date, end date, lease duration, room type, min open spots, amenities, house rules, languages, gender preference, and household gender | Anonymous, `desktop-anonymous`                        | `listing_all_filters` seed or seed extension | Open modal, set every filter family, apply | Chips or summaries appear, canonical params are present, results update, selected location is retained                    | `search-filters.spec.ts`, `FilterModal.ts`, `SearchPage.ts`              | P0       |
| C3  | User clears filters from modal/chips and URL stays canonical                                                                                                                        | Anonymous, `desktop-anonymous`                        | Same as C2                                   | Clear one chip, clear all in modal, reload | Removed filters disappear from UI and URL; remaining params stay canonical; results update                                | `search-filters.spec.ts`, `FilterModal.ts`, `urlAssertions.ts`           | P0       |

Secondary references: existing `tests/e2e/search-filters/*` and
`tests/e2e/journeys/search-budget-params.spec.ts`.

### Group D - Results States

| ID  | Scenario                                                                   | User/project                   | Seed/mocks                                    | Actions                                     | Assertions                                                                                                      | Likely files                                                 | Priority |
| --- | -------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------- |
| D1  | User hits zero results and sees suggestions or clear-filters path          | Anonymous, `desktop-anonymous` | Impossible filter or mocked zero response     | Navigate/apply no-match filters             | Zero state is visible, suggestions or clear-filters action exists, clear path restores sane URL/results         | `search-results-states.spec.ts`, `SearchPage.ts`             | P0       |
| D2  | User gets sparse results and sees expansion suggestions                    | Anonymous, `desktop-anonymous` | Sparse seed or mocked sparse response         | Search sparse region/filter combination     | Sparse advisory/expansion suggestion visible only for sparse state, URL remains canonical                       | `search-results-states.spec.ts`, `SearchPage.ts`             | P1       |
| D3  | User reaches result cap and gets refine-search prompt                      | Anonymous, `failure-mocked`    | Mocked capped response or many-result fixture | Navigate to broad search with cap condition | Refine-search prompt is visible, no infinite loading, URL does not gain invalid cursor                          | `search-results-states.spec.ts`, `network-errors.fixture.ts` | P1       |
| D4  | User sees near-match separator and advisory text when results are expanded | Anonymous, `desktop-anonymous` | Near-match seed or mocked expanded response   | Search exact + expanded match scenario      | Separator and advisory appear only when expanded results exist; exact results remain grouped above near matches | `search-results-states.spec.ts`, `SearchPage.ts`             | P1       |

Secondary references: existing `filter-dead-ends`, `filter-near-matches`, and
search release-gate helpers.

### Group E - Sort And Pagination

| ID  | Scenario                                                                                                  | User/project                                         | Seed/mocks                                           | Actions                                      | Assertions                                                                                                          | Likely files                                                                    | Priority |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| E1  | User sorts results and pagination resets correctly                                                        | Anonymous, `desktop-anonymous`                       | Many SF listings                                     | Load page 2/cursor, change sort              | Cursor is removed/reset, first page re-renders, URL has canonical sort, no duplicate cards                          | `search-pagination.spec.ts`, `SearchPage.ts`, `cursorAssertions.ts`             | P0       |
| E2  | User clicks "Show more places"; no duplicates, correct cursor behavior, retry works on failure/rate-limit | Anonymous, `desktop-anonymous` plus `failure-mocked` | Many SF listings; mocked 500/429 next-page responses | Click show more, then run failure retry path | Appended cards have unique IDs, next cursor changes or ends cleanly, failure state is user-readable, retry succeeds | `search-pagination.spec.ts`, `network-errors.fixture.ts`, `cursorAssertions.ts` | P0       |

Secondary references: existing `tests/e2e/pagination/*`,
`search-sort-ordering.anon.spec.ts`, and pagination mock factory.

### Group F - Listing Cards, Media, Dates, And Price Display

| ID  | Scenario                                                                   | User/project                                          | Seed/mocks                           | Actions                                             | Assertions                                                                                                      | Likely files                                                        | Priority |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------- |
| F1  | User toggles monthly vs total price for multi-month searches               | Anonymous, `desktop-anonymous` and `mobile-anonymous` | Multi-month date range with listings | Apply multi-month dates, toggle total price         | Toggle is visible, price labels change predictably, selection persists per expected storage/session behavior    | `search-listing-card.spec.ts`, `ListingCard.ts`                     | P1       |
| F2  | User opens a listing card and date params carry through to listing detail  | Anonymous, `desktop-anonymous`                        | Listing with date availability       | Search with move-in/end dates, click card           | Detail URL includes expected date params and listing page route loads; browser back/forward is owned by Group J | `search-listing-card.spec.ts`, `ListingCard.ts`, `urlAssertions.ts` | P0       |
| F3  | User uses image carousel without accidental navigation while dragging      | Anonymous, `desktop-anonymous`                        | Listing with multiple images         | Drag carousel inside card                           | URL does not change on drag, carousel image/dot changes or remains stable without click navigation              | `search-listing-card.spec.ts`, `ListingCard.ts`                     | P1       |
| F4  | User opens grouped listing dates on desktop panel and mobile modal         | Anonymous, `desktop-anonymous` and `mobile-anonymous` | `E2E Dedupe Clone Group` seed        | Open grouped dates affordance on desktop and mobile | Desktop panel/mobile modal appears with alternate dates and accessible labels                                   | `search-listing-card.spec.ts`, `ListingCard.ts`, `MapPanel.ts`      | P1       |
| F5  | User selects grouped alternate dates and lands on correct listing/date URL | Anonymous, `desktop-anonymous` and `mobile-anonymous` | `E2E Dedupe Clone Group` seed        | Pick alternate date from grouped UI                 | Navigates to the expected date-specific sibling listing URL; back/forward is owned by Group J                   | `search-listing-card.spec.ts`, `ListingCard.ts`, `urlAssertions.ts` | P1       |

Secondary references: existing `tests/e2e/list-ux.spec.ts`,
`tests/e2e/journeys/listing-carousel.spec.ts`, and `tests/e2e/dedupe/*`.

### Group G - Save Listing And Saved Search

| ID  | Scenario                                                                           | User/project                                              | Seed/mocks                                    | Actions                                                                 | Assertions                                                                                                       | Likely files                                                                      | Priority |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| G1  | User saves/unsaves a listing while logged in                                       | Authenticated, `desktop-authenticated`                    | `renter_basic`, reviewer-owned listing        | Click save, reload, click unsave                                        | Saved state persists after reload; unsave removes state; no auth redirect                                        | `search-saved-listing.spec.ts`, `ListingCard.ts`, `auth.fixture.ts`               | P0       |
| G2  | Anonymous user tries to save a listing and is redirected to login                  | Anonymous, `desktop-anonymous`                            | Reviewer-owned listing                        | Click save as anonymous                                                 | Redirects to login/signup with return path back to listing/search context                                        | `search-saved-listing.spec.ts`, `ListingCard.ts`, `auth.fixture.ts`               | P0       |
| G3  | User saves a search, names it, toggles alerts, selects alert frequency             | Authenticated, `desktop-authenticated`                    | `renter_basic`, existing saved-search setup   | Open save search modal, enter name, toggle alerts, pick frequency, save | Modal validates name/frequency, toast or saved state visible, saved search can reopen filters                    | `search-saved-search.spec.ts`, `SavedSearchModal.ts`, `auth.fixture.ts`           | P0       |
| G4  | User attempts saved-search alerts when paywalled and can go to checkout/login path | Authenticated or anonymous depending UI, `failure-mocked` | `renter_paywalled` or mocked paywall response | Save search with alerts enabled under locked state                      | Paywall message is visible, checkout/login path appears, `/api/payments/checkout` is mocked, no real Stripe call | `search-saved-search.spec.ts`, `SavedSearchModal.ts`, `network-errors.fixture.ts` | P1       |

Secondary references: existing `tests/e2e/saved/saved-searches.spec.ts`,
`tests/e2e/journeys/04-favorites-saved-searches.spec.ts`, and
`SaveSearchButton` component/API tests.

### Group H - Desktop Map/List

| ID  | Scenario                                                                        | User/project                   | Seed/mocks                        | Actions                                            | Assertions                                                                               | Likely files                                                             | Priority |
| --- | ------------------------------------------------------------------------------- | ------------------------------ | --------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| H1  | User uses desktop map/list split view, hides/shows map, and preference persists | Anonymous, `desktop-anonymous` | SF listings, map mocks            | Toggle map hidden/shown, reload                    | Split view renders, hidden preference persists, show restores map/list layout            | `search-map-desktop.spec.ts`, `MapPanel.ts`                              | P0       |
| H2  | User taps/clicks map marker and corresponding listing focuses/scrolls           | Anonymous, `desktop-anonymous` | SF listings, map markers          | Click first visible marker                         | Matching listing card is focused/selected/scrolled, URL/list state remains sane          | `search-map-desktop.spec.ts`, `MapPanel.ts`, `ListingCard.ts`            | P0       |
| H3  | User pans/zooms map and list/map stay in sync                                   | Anonymous, `desktop-anonymous` | SF listings, map mocks            | Pan/zoom map, apply search-area action if required | Bounds/list URL update consistently, no stale marker/list mismatch, loading resolves     | `search-map-desktop.spec.ts`, `MapPanel.ts`, `urlAssertions.ts`          | P1       |
| H4  | User handles map API loading and server failure states                          | Anonymous, `failure-mocked`    | Failure mocks for map/search APIs | Delay first map request, return 500, click retry   | Loading state is visible, retryable fallback appears, retry resolves without stack trace | `search-map-desktop.spec.ts`, `MapPanel.ts`, `network-errors.fixture.ts` | P0       |
| H5  | User handles map API rate limit state                                           | Anonymous, `failure-mocked`    | Failure mocks for map/search APIs | Return 429 twice, click retry                      | Rate-limit message is user-readable, retry resolves without stack trace                  | `search-map-desktop.spec.ts`, `MapPanel.ts`, `network-errors.fixture.ts` | P0       |
| H6  | User handles invalid oversized map bounds                                       | Anonymous, `desktop-anonymous` | Oversized bounds URL              | Open `/search` with too-large bounds               | Zoom-in guidance or safe map shell remains visible, URL remains sane, no stack trace     | `search-map-desktop.spec.ts`, `MapPanel.ts`, `urlAssertions.ts`          | P0       |

Secondary references: existing `map-*` specs, `map-errors-a11y.anon.spec.ts`,
`map-bounds-roundtrip.anon.spec.ts`, and `map-loading.anon.spec.ts`.

### Group I - Mobile Map/List And Mobile Search

| ID  | Scenario                                                                                 | User/project                  | Seed/mocks                                      | Actions                                                           | Assertions                                                                                                | Likely files                                                                                | Priority |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| I1  | User uses mobile map/list bottom sheet snap states: map, peek, list                      | Anonymous, `mobile-anonymous` | SF listings, map mocks                          | Open mobile search, drag/click sheet controls through snap states | Snap states are reachable and reflected by accessible/data state, map remains interactive when collapsed  | `search-map-mobile.spec.ts`, `MobileSearchOverlay.ts`, `MapPanel.ts`                        | P0       |
| I2  | User uses mobile collapsed search overlay for budget, filters, and back                  | Anonymous, `mobile-anonymous` | SF listings                                     | Open overlay, edit budget, open/close filters, submit, press back | Back closes overlay before leaving page; budget params update canonically; URL remains desktop-compatible | `search-map-mobile.spec.ts`, `MobileSearchOverlay.ts`, `FilterModal.ts`, `urlAssertions.ts` | P0       |
| I3  | User uses mobile collapsed search overlay recent searches and remove recent search entry | Anonymous, `mobile-anonymous` | Recent-search localStorage fixture, SF listings | Open overlay, verify recent search, remove it                     | Recent removal works visibly and clears localStorage without leaving `/search`                            | `search-map-mobile.spec.ts`, `MobileSearchOverlay.ts`                                       | P1       |

Secondary references: existing `mobile-bottom-sheet.spec.ts`,
`mobile-toggle.anon.spec.ts`, `mobile-ux.anon.spec.ts`,
`search-filters/filter-mobile.anon.spec.ts`, and `MobileSearchOverlay` tests.

### Group J - URL State, Security, And Abuse

| ID  | Scenario                                                                                                         | User/project                                           | Seed/mocks       | Actions                                                                                                    | Assertions                                                                                                             | Likely files                                                    | Priority |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------- |
| J1  | URL deep links, back/forward, legacy params, invalid date/cursor deep links, and refresh all preserve sane state | Anonymous, `desktop-anonymous` and `mobile-anonymous`  | SF listings      | Open deep links, navigate filters, back/forward, refresh, try legacy params and invalid date/cursor values | Canonical URL state is preserved/normalized, visible UI matches URL, no crash or stack trace                           | `search-url-state.spec.ts`, `urlAssertions.ts`, `SearchPage.ts` | P0       |
| J2  | Security: XSS query values do not break search                                                                   | Anonymous, `desktop-anonymous`                         | None             | Navigate with encoded XSS values                                                                           | No dialog fires, unsafe strings render escaped or not at all, no injected script/event attributes, page remains usable | `search-security.spec.ts`, `console-errors.fixture.ts`          | P0       |
| J3  | Security: whitespace-only query does not break search                                                            | Anonymous, `desktop-anonymous` plus API/contract tests | None             | Navigate/API request with whitespace query                                                                 | Query trims to empty, bounded browse or location-required state appears, no full-table-style result explosion          | `search-security.spec.ts`, `urlAssertions.ts`                   | P0       |
| J4  | Security: cursor tampering does not break search                                                                 | Anonymous, `desktop-anonymous` plus API/contract tests | Many SF listings | Navigate/API request with malformed/base64/HTML cursor                                                     | No 500, response/page falls back or shows safe error, URL canonicalizes or drops cursor                                | `search-security.spec.ts`, `cursorAssertions.ts`                | P0       |
| J5  | Security: excessive arrays are capped or rejected safely                                                         | Anonymous, `desktop-anonymous` plus API/contract tests | None             | Navigate/API request with excessive repeated params                                                        | App shows safe visible state, arrays are capped/rejected, no stack trace, URL canonicalizes                            | `search-security.spec.ts`, `urlAssertions.ts`                   | P1       |
| J6  | Security: rate-limit bursts do not break search                                                                  | Anonymous, `failure-mocked` plus API/contract tests    | Rate-limit mock  | Trigger deterministic 429 burst path                                                                       | User-readable rate-limit state appears, retry countdown/path works, no unhandled rejection                             | `search-security.spec.ts`, `network-errors.fixture.ts`          | P1       |

Secondary references: existing `search-url-*`, `semantic-search-xss`,
`search-error-resilience.anon.spec.ts`, and API/unit security tests.

## Implementation Order

1. Harness aliases and fixtures only:
   - add logical Playwright projects or a dedicated config wrapper
   - add fixtures for auth, search data, map/geocoding mocks, network failures,
     and console/page errors
   - add page objects and URL/cursor assertions
   - add one P0 smoke proving A1
2. Group B and C:
   - location/query/header search
   - budget/filter apply/clear
3. Group D and E:
   - result states
   - sort/show-more/cursor behavior
4. Group F:
   - cards, carousel, dates, grouped listings, total price
5. Group G:
   - saved listings/searches and paywall path with checkout mocks
6. Group H and I:
   - desktop map/list
   - mobile map/list and mobile overlay
7. Group J:
   - URL/security/abuse suite and API/contract coverage cross-check
8. Reviewer pass:
   - compare implemented specs against this matrix
   - identify duplicates, missing flows, brittle selectors, sleeps, shared state,
     and real external dependency leaks

## Validation Commands

Run narrow commands first, then expand:

```bash
pnpm playwright test tests/e2e/search/search-smoke.spec.ts --project=desktop-anonymous
pnpm playwright test tests/e2e/search/search-location.spec.ts --project=desktop-anonymous
pnpm playwright test tests/e2e/search/search-filters.spec.ts --project=desktop-anonymous
pnpm playwright test tests/e2e/search --project=desktop-anonymous
pnpm playwright test tests/e2e/search --project=desktop-authenticated
pnpm playwright test tests/e2e/search --project=mobile-anonymous
pnpm playwright test tests/e2e/search --project=mobile-authenticated
pnpm playwright test tests/e2e/search --project=failure-mocked
```

Until the logical project aliases exist, use the current repo mappings:

```bash
pnpm playwright test tests/e2e/search-p0-smoke.anon.spec.ts --project=chromium-anon
pnpm playwright test tests/e2e/search-smoke.spec.ts --project=chromium
pnpm playwright test tests/e2e/mobile-bottom-sheet.spec.ts --project="Mobile Chrome"
pnpm playwright test tests/e2e/saved/saved-searches.spec.ts --project=chromium
```

## Rollback Notes

- Setup docs can be reverted by removing this file and the E2E section in
  `AGENTS.md`.
- Harness additions should be isolated under `tests/e2e/search`,
  `tests/e2e/fixtures`, `tests/e2e/pages`, and `tests/e2e/utils`.
- Any future seed additions should be idempotent and scoped to deterministic
  `e2e-*` records so they can be deleted without affecting local manual data.

## Research Summary

No browsing was required for this setup slice. The plan uses the user's supplied
workflow, the repo's existing Playwright setup, and the local implementation
triad rules. Future slices that change external API behavior, payment behavior,
or Playwright configuration semantics should consult primary documentation
before implementation if local patterns are insufficient.
