# Test Traceability Matrix

This file separates release-blocking evidence from confidence-building inventory.
Phase 10/11/12 evidence records passing focused browser, API/unit, privacy, typecheck,
and release-gate commands. Broader non-gate suites remain useful, but they are not
treated as Phase 13 blockers unless product/release owners explicitly promote them.
See `runtime-verification.md`, `evidence-register.md` C034-C050, and `manifest.json`
test groups.

## Release-Blocking Tests

| Release behavior | Existing test / evidence | Command or source | Result | Remaining release note |
|---|---|---|---|---|
| `/search` renders without crash on seeded data | `tests/e2e/search/search-smoke.spec.ts` | `pnpm exec playwright test tests/e2e/search/search-smoke.spec.ts --project=desktop-anonymous --reporter=list` | Passed on rerun | Earlier transient page error did not reproduce; final smoke evidence is pass. |
| Filters update visible results and canonical URL state | `tests/e2e/search/search-filters.spec.ts` | `pnpm exec playwright test tests/e2e/search/search-filters.spec.ts --project=desktop-anonymous --reporter=list` | Passed | Broader legacy/root filter specs remain confidence-building. |
| Sort and load-more pagination stay coherent | `tests/e2e/search/search-pagination.spec.ts` | `pnpm exec playwright test tests/e2e/search/search-pagination.spec.ts --project=desktop-anonymous --reporter=list` | Passed | Root pagination/sort specs and map-bounds reset cases are P1 confidence gaps. |
| Desktop map/list focus and marker behavior | `tests/e2e/search/search-map-desktop.spec.ts` | `pnpm exec playwright test tests/e2e/search/search-map-desktop.spec.ts --project=desktop-anonymous --reporter=list` | Passed | Broader map/list sync journeys remain confidence-building. |
| Results-state, empty, loading, and recoverable search errors | `tests/e2e/search/search-results-states.spec.ts`; `tests/e2e/search-error-resilience.anon.spec.ts` | Focused Playwright commands recorded in `runtime-verification.md` | Passed | V1-only map API mock cases are skipped in V2 mode and remain P1 confidence gaps. |
| Invalid URL params keep page usable | `tests/e2e/search/search-url-state.spec.ts`; focused search-param Jest test | Focused Playwright command plus focused Jest command | Passed | Mobile-owned URL-state cross-checks remain confidence-building. |
| Saved listing anonymous redirect and authenticated persistence | `tests/e2e/search/search-saved-listing.spec.ts`; favorites API tests | Desktop anonymous and desktop authenticated Playwright commands; focused Jest command for favorites GET/POST | Passed | FavoriteButton component CSRF/header tests remain confidence-building. |
| Mobile map/list primary flow | `tests/e2e/search/search-map-mobile.spec.ts` | `pnpm exec playwright test tests/e2e/search/search-map-mobile.spec.ts --project=mobile-anonymous --reporter=list` | Passed | Broader mobile tools/screenshots remain confidence-building. |
| Map error/a11y behavior | `tests/e2e/map-errors-a11y.anon.spec.ts` | `pnpm exec playwright test tests/e2e/map-errors-a11y.anon.spec.ts --project=chromium-anon --reporter=list` | Passed | V1-only 500/429 mock cases skipped in V2 mode; keep as P1 if V1 path matters. |
| Public search/map API contract and helpers | Focused Jest command covering favorites, map listings, search facets, search V2, map payload sanitization, and search params | `pnpm test -- src/__tests__/api/favorites-get.test.ts src/__tests__/api/favorites.test.ts src/__tests__/api/map-listings-route.test.ts src/__tests__/api/map-listings.test.ts src/__tests__/api/search/facets/route.test.ts src/__tests__/api/search/v2/route.test.ts src/__tests__/lib/maps/sanitize-map-listings.test.ts src/__tests__/lib/search-params.test.ts` | Passed | Generated OpenAPI schemas remain out of scope for this docs gate. |
| Public payload PII/privacy | Focused P0 privacy suite, fixture scanner checks, real captured payload scan, GitHub Actions Public Payload PII Scan | Captured `/api/search/v2`, `/api/search/listings`, `/api/map-listings`, and `/api/listings` payload scan plus PR #119 checks | Passed after P0 fix | No-arg deterministic capture wrapper remains P1/P2 operational follow-up, not a Phase 13 blocker. |
| Full search release gate | `tests/e2e/search-release-gate/*` | `pnpm run test:e2e:search-release-gate` | Passed | SSR report: 27 expected/25 skipped/0 unexpected; client report: 36 expected/16 skipped/0 unexpected. |
| CI/release readiness checks for merged fix | PR #119 final GitHub Actions checks | Public Payload PII Scan, both search release gates, all 10 E2E shards, Stability E2E, Unit/API/Component/Type/Lint/Build, Search Smoke, Lighthouse, Vercel, and related search/filter checks | Passed | Evidence is external CI status already recorded in Phase 12 notes; this docs pass does not rerun CI. |

Release-blocking status: **satisfied for Phase 13 documentation acceptance** based on
the recorded Phase 10/11/12 evidence. The remaining unrun items below are
confidence-building unless a release owner explicitly promotes one to a blocker.

## Confidence-Building Tests And Gaps

| Area | Tests / grouped inventory | Status | Why it is not a Phase 13 blocker | Priority |
|---|---|---|---|---|
| Location autocomplete and free-text location warning | `tests/e2e/search/search-location.spec.ts`; `src/__tests__/components/LocationSearchInput/*`; `tests/e2e/search-location-warning.anon.spec.ts` | Not run in final gate | Core search/filter/map release gate passed; autocomplete specifics remain useful UX coverage. | P1 |
| Listing card/media failure behavior | `tests/e2e/search/search-listing-card.spec.ts`; component tests if added later | Not run | Source evidence documents image fallback and link behavior; no P0 unsupported claim depends on browser-proving broken image fallback. | P1 |
| Saved search | `tests/e2e/search/search-saved-search.spec.ts`; saved-search action/component tests; paywall tests | Not run | Docs mark checkout/paywall/auth branches partially traced and do not claim release-proof coverage. | P1 |
| Direct contact-host from search card | No direct test found | Not run | Current docs do not document direct search-card contact as current behavior; listing detail/contact belongs to separate feature pass. | P1 |
| Search-this-area | No current test found | Not run | Current docs document it as removed/not verified, not as current behavior. | P1 |
| Broader map/list sync | `tests/e2e/search-map-list-sync.anon.spec.ts`; `tests/e2e/journeys/list-map-sync.spec.ts`; `tests/e2e/map-*.spec.ts` | Not run, except focused desktop/mobile/map-error specs above | Focused map paths passed; broader sync/visual cases improve confidence and can catch regressions outside the final docs gate. | P1 |
| V1-only map API mock cases | Skipped branches inside `map-errors-a11y.anon.spec.ts` when V2 mode is active | Skipped | V2 mode is the current verified path; run only if V1 fallback path remains release-relevant. | P1 |
| Broader filter, pagination, URL, semantic, dedupe suites | `tests/e2e/search-filters/*.anon.spec.ts`; `tests/e2e/pagination/*.spec.ts`; `tests/e2e/search-url-*.spec.ts`; `tests/e2e/semantic-search/*.anon.spec.ts`; `tests/e2e/dedupe/search-list-*.dedupe.spec.ts` | Not run | Focused gate commands cover primary flows; these are wider regression nets. | P1 |
| Search service internals | `src/__tests__/lib/search/*.test.ts`; cursor/query/projection/dedupe/semantic/cache tests | Mostly not run, except focused search-params and selected API/unit files | Final docs cite focused API/unit evidence and mark deeper implementation parity as a gap. | P1 |
| Component/context/hook inventory | Search form/header/filter/result/map/save/favorite component tests and search/map contexts/hooks | Mostly not run | User-visible Playwright gate passed for critical flows; component inventory remains useful for narrowing regressions. | P2 |
| Fixtures/helpers/page objects | `tests/e2e/pages/*`, `tests/e2e/fixtures/*`, `tests/e2e/helpers/*`, `tests/e2e/utils/*` | Not run directly | These are support files, not standalone behavior claims. | P2 |
| Machine-readable exact test index | Generated file index from test discovery | Not generated | Manifest intentionally uses grouped test-family entries; exact per-file inventory can be generated later. | P2 |

## Traceability Summary

| Behavior | Release-blocking evidence | Confidence-building follow-up |
|---|---|---|
| Search render/filter/sort/pagination | Smoke, filters, pagination, release gate passed | Root filter/pagination/sort specs |
| Desktop/mobile map | Focused desktop, mobile, map error/a11y passed | Broader map/list sync, visual, V1-only mock cases |
| Empty/error/loading/invalid URL | Results-state, error-resilience, URL-state passed | Mobile URL-state cross-checks and wider journey specs |
| Saved listing | Anonymous/authenticated Playwright and favorites API tests passed | FavoriteButton component CSRF/header checks |
| Saved search | Not release-blocking under current docs because branches are marked partial | Saved-search E2E/action/component/paywall tests |
| Public payload/privacy | Fixed real payload scan, focused privacy suite, and PR #119 CI passed | No-arg deterministic payload-capture wrapper |
| API contracts | Focused API/unit tests passed; compact docs tables added | Formal generated schemas and broader API suites |

See `phase-4/05-test-traceability.md` and `manifest.json` for the broader
discovered inventory.
