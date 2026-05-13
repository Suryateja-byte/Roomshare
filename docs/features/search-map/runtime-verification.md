# Runtime Verification

Status: partially verified with post-merge fixed-code confirmation. The narrow `/search` smoke, filter/URL,
sort/load-more pagination, desktop map/list parity, results-state, URL-state, anonymous
saved-listing redirect, mobile map/list, and search error-resilience specs now
pass after Docker/Postgres became available. The map error/a11y suite,
authenticated saved-listing persistence path, focused API/unit Jest command,
P0 privacy-focused tests, full search release gate, and real captured
search/list/map public payload PII scan also pass. PR #119 was merged to
`main` as `89ad33ea58391452b03a2ff5c3a219503769edaa` on 2026-05-08, and all
PR checks were green after the P0 privacy fix and the follow-up E2E
stabilization. Commit `7e80c899` adds the focused desktop list/map parity
evidence recorded as C056. C058 adds focused `/api/map-listings` 500/429
browser proof from the existing desktop `failure-mocked` project. Non-gate
broader E2E coverage is still not run.

Date: 2026-05-07, with post-merge check update on 2026-05-08 and desktop list/map parity plus map API error updates on 2026-05-13.

Source of truth: mixed focused runtime evidence, post-merge `origin/main`
evidence at `89ad33ea58391452b03a2ff5c3a219503769edaa`, and explicitly marked
local discovery caveats. The local branch `codex/search-ux-fixes` is still
dirty and overlaps updated `main`, so the fixed-code confirmation below uses
`origin/main` and GitHub Actions evidence rather than a local merge into this
worktree. The desktop list/map parity code and test slice itself is committed
locally as `7e80c899`. Remaining dirty or untracked files are inventoried in
C057 and are not standalone passing evidence.

## Summary

Phase 10 was first blocked because local Postgres was unavailable at
`localhost:5433`. After Docker/Postgres was started, the Playwright webServer
became healthy, E2E seed completed, and the anonymous `/search` smoke test
reached the browser.

The first smoke run after Docker/Postgres became available failed after render.
`/search` returned `200`, rendered a results surface with `57` listings, and
showed no crash boundary in the page snapshot, but the browser emitted an
unhandled page error:

```text
Invalid or unexpected token
```

Server logs during that same run also showed an external Supabase DNS failure:

```text
TypeError: fetch failed
cause: getaddrinfo ENOTFOUND qolpgfdmkqvxraafucvu.supabase.co
```

That page error did not reproduce on the next focused diagnostic or on a direct
rerun of the same smoke command. The latest narrow smoke result is passing:

```text
1 passed (27.0s)
```

After the baseline smoke passed, the focused desktop-anonymous filter,
pagination, desktop map, results-state, URL-state, anonymous saved-listing
redirect, mobile-anonymous map/list, and chromium-anon search error-resilience
specs also passed. The chromium-anon map error/a11y suite,
desktop-authenticated saved-listing persistence path, and focused API/unit Jest
command also passed. The first real public-payload PII scan failed and led to
the P0 public payload fix. After the fix, focused privacy/API tests, typecheck,
the full search release-gate command, and a real captured payload scan for
`/api/search/v2`, `/api/search/listings`, `/api/map-listings`, and
`/api/listings` all passed. The merged PR #119 CI then confirmed the fixed
codebase with green public payload PII scan, search release gates, full E2E
shards including Shard 2/10, component/API/unit/type/lint/build checks, and
Vercel. The existing desktop `failure-mocked` Search Map project now also
passes H4/H5 for `/api/map-listings` 500 and 429 retryable browser behavior.
Non-gate broader E2E coverage is still not verified.

On 2026-05-13, the committed desktop parity slice `7e80c899` added
`SearchListResultsContext` and re-ran the focused desktop map spec. The rerun
passed with list-backed map filtering, marker/list focus, and pan/zoom URL state
covered by `tests/e2e/search/search-map-desktop.spec.ts`. The related
`SearchResultsClient` focused Jest command also passed 40 tests. The console
error fixture used by the new E2E support has broad benign filters for `404`,
`net::err`, and `failed to fetch`; that is acceptable evidence for this slice,
but should be tightened as a later harness-hardening task.

Also on 2026-05-13, the existing Search Map desktop `failure-mocked` project was
run with `ENABLE_SEARCH_SNAPSHOT_CONTRACT=false` to exercise the independent
`/api/map-listings` browser error path. H4 and H5 passed, covering 500 fallback
retry and 429 rate-limit retry behavior. The legacy skipped
`map-errors-a11y.anon.spec.ts` placeholders remain skipped, but the P1 map API
500/429 browser proof is now satisfied by C058.

## Post-Merge Fixed-Code Verification

| Item | Result | Evidence |
|---|---|---|
| P0 fix merged to `main` | Passed | PR #119 is `MERGED`; merge commit `89ad33ea58391452b03a2ff5c3a219503769edaa`; merged 2026-05-08T19:47:13Z. |
| Final PR checks | Passed | `gh pr checks 119 --repo Suryateja-byte/Roomshare` reported pass for API & Action Tests, Build, CI, Component Tests, Filter Regression Validation, Filter System Tests, Lighthouse Audit, Lint, Merge Playwright Reports, Migration Validation, Performance & Safety Tests, Public Payload PII Scan, both Search Release Gate jobs, Search Smoke Tests, Shards 1/10 through 10/10, Stability E2E Tests, Type Check, Unit Tests, Vercel Preview Comments, and Vercel. |
| Public search card sanitizer on fixed code | Verified by code on `origin/main` | `origin/main:src/lib/search/public-listing-payload.ts`:L35-L52 creates opaque `pg1_...` group IDs; L136-L177 emits public card fields, blanks `description`, coarsens coordinates through `toPublicCoordinates`, and does not serialize `ownerId`, address, or zip. |
| Public map sanitizer on fixed code | Verified by code on `origin/main` | `origin/main:src/lib/maps/sanitize-map-listings.ts`:L88-L170 validates/coarsens coordinates, normalizes availability, sets `statusReason: null`, and replaces group metadata through `toPublicGroupMetadata`. |
| V2 map partial-feature handling on fixed code | Verified by code and CI | `origin/main:src/lib/search/v2-map-data.ts`:L21-L57 adds safe number, slot, date, and coordinate guards; L76-L110 builds fallback public availability; L113-L183 filters invalid features, coarsens coordinates, strips raw group keys, preserves only public `pg1_...` context keys, and keeps pin tier. Regression test evidence: `origin/main:src/__tests__/lib/search/v2-map-data.test.ts`:L55-L119. |
| Listing management E2E follow-up | Verified by CI | `origin/main:tests/e2e/journeys/24-listing-management.spec.ts`:L25-L160 now verifies the current host-managed availability edit flow instead of stale title/price editing. `Shard 2/10` passed in PR #119 CI. |

## Environment Checks

| Check | Result |
|---|---|
| Node in WSL | `v22.22.0` |
| pnpm in WSL | `10.27.0` |
| Playwright in WSL | `1.59.1` |
| Playwright webServer command | `pnpm run dev` from `playwright.config.ts` |
| Playwright readiness URL | `http://localhost:3000/api/health/ready` |
| Required DB | Postgres at `localhost:5433` |
| Docker/Postgres after retry | `roomshare-db-1` healthy; `127.0.0.1:5433->5432/tcp` |
| E2E seed after retry | Completed; seed manifest written to `playwright/.cache/e2e-seed.json` |

## Commands Run

| Command | Result | Notes |
|---|---|---|
| `python3 .agents/skills/webapp-testing/scripts/with_server.py --help` | Passed | Required helper usage check before browser automation. |
| `node -v && pnpm -v && pnpm exec playwright --version` | Passed | Verified WSL runtime tooling. |
| `pnpm exec playwright test tests/e2e/search/search-smoke.spec.ts --project=desktop-anonymous --reporter=list` before Docker was available | Failed before test assertions | Next dev server started, but Playwright webServer readiness timed out because `/api/health/ready` returned `503`. |
| `docker ps --format ...` after Docker was enabled | Passed | `roomshare-db-1` was healthy and exposing `127.0.0.1:5433->5432/tcp`. |
| `pnpm exec playwright test tests/e2e/search/search-smoke.spec.ts --project=desktop-anonymous --reporter=list` after Docker was enabled | Failed after page render | `/api/health/ready` returned `200`; E2E seed completed; `/search?...` returned `200`; test failed at `assertNoUnhandledErrors` because `pageErrors` contained `Invalid or unexpected token`. |
| Focused direct Playwright diagnostic against `/search?...` | Passed diagnostic run | Rendered the page with no `pageErrors`; observed console/resource noise including map listing/session/image fetch failures. |
| `pnpm exec playwright test tests/e2e/search/search-smoke.spec.ts --project=desktop-anonymous --reporter=list` rerun after diagnostic | Passed | `/api/health/ready` returned `200`; E2E seed completed; `/search?...` returned `200`; result count was `57`; Playwright reported `1 passed (27.0s)`. |
| `pnpm exec playwright test tests/e2e/search/search-filters.spec.ts --project=desktop-anonymous --reporter=list` | Passed | Ran 2 desktop-anonymous filter tests covering primary filter families, canonical URL state, applied filter chips, and clear-all behavior. |
| `pnpm exec playwright test tests/e2e/search/search-pagination.spec.ts --project=desktop-anonymous --reporter=list` | Passed | Ran 4 desktop-anonymous sort/load-more tests covering sort reset, unique appended cards, retryable load-more failure, and retryable rate-limit messaging. |
| `pnpm exec playwright test tests/e2e/search/search-map-desktop.spec.ts --project=desktop-anonymous --reporter=list` | Passed | Playwright `.last-run.json` reported `status: passed` with no failed tests; desktop map preference, list-backed marker parity, marker/list focus, and pan/zoom URL state paths are covered by this spec for the desktop-anonymous project. Latest C056 rerun is tied to commit `7e80c899`. |
| `pnpm test -- src/__tests__/components/search/SearchResultsClient.test.tsx` | Passed | Focused Jest command passed 1 suite / 40 tests for the result-list client behavior adjacent to the list-result ID handoff. Latest C056 rerun is tied to commit `7e80c899`. |
| `ENABLE_SEARCH_SNAPSHOT_CONTRACT=false pnpm exec playwright test tests/e2e/search/search-map-desktop.spec.ts --project=failure-mocked --grep '@failure-mocked' --reporter=list` | Passed | Ran the two existing `failure-mocked` desktop tests: H4 `/api/map-listings` 500 fallback/retry and H5 429 rate-limit retry. Playwright reported `2 passed (43.2s)`. Evidence: C058. |
| `pnpm exec playwright test tests/e2e/search/search-results-states.spec.ts --project=desktop-anonymous --reporter=list` | Passed | Ran 4 desktop-anonymous result-state tests covering zero results, sparse results, result-cap guidance, and expanded near-match messaging. |
| `pnpm exec playwright test tests/e2e/search/search-url-state.spec.ts --project=desktop-anonymous --reporter=list` | Passed | Ran the desktop URL-state paths covering deep links, refresh/back/forward state, legacy params, invalid dates, and tampered cursors. The mobile-owned URL-state case is not covered by this project run. |
| `pnpm exec playwright test tests/e2e/search/search-saved-listing.spec.ts --project=desktop-anonymous --reporter=list` | Passed | Ran the desktop-anonymous saved-listing path; authenticated save persistence was skipped by project ownership, and anonymous favorite POST 401 redirected to `/login`. |
| `pnpm exec playwright test tests/e2e/search/search-saved-listing.spec.ts --project=desktop-authenticated --reporter=list` | Passed | Ran setup plus the desktop-authenticated saved-listing path; authenticated user save, reload persistence, unsave, `/search` URL retention, and no unhandled errors were covered. |
| `pnpm exec playwright test tests/e2e/search/search-map-mobile.spec.ts --project=mobile-anonymous --reporter=list` | Passed | Ran 3 mobile-anonymous tests covering bottom-sheet map/peek/list snap states, collapsed overlay budget/filter/back behavior, and recent-search rendering/removal. |
| `pnpm exec playwright test tests/e2e/search-error-resilience.anon.spec.ts --project=desktop-anonymous --reporter=list` | Failed before test execution | Playwright reported `No tests found`; `--list` showed this spec is owned by the `chromium-anon` project. |
| `pnpm exec playwright test tests/e2e/search-error-resilience.anon.spec.ts --project=chromium-anon --reporter=list` | Passed | Ran 25 chromium-anon tests covering zero-results guidance, client-side API error/recovery, slow/intermittent responses, rate-limit UI, error-boundary recovery, offline/network recovery, invalid parameters, load-more errors, and console monitoring. |
| `pnpm exec playwright test tests/e2e/map-errors-a11y.anon.spec.ts --project=chromium-anon --reporter=list` | Passed | Ran 11 chromium-anon map error/a11y tests. The suite passed with no failed tests; the 500 and 429 `/api/map-listings` mock tests are skipped in V2 mode by test design. |
| `pnpm test -- src/__tests__/api/favorites-get.test.ts src/__tests__/api/favorites.test.ts src/__tests__/api/map-listings-route.test.ts src/__tests__/api/map-listings.test.ts src/__tests__/api/search/facets/route.test.ts src/__tests__/api/search/v2/route.test.ts src/__tests__/lib/maps/sanitize-map-listings.test.ts src/__tests__/lib/search-params.test.ts` | Passed | Ran 8 Jest suites and 286 tests covering favorites GET/POST, map-listings routes/helpers, search facets, search V2 route, public map payload sanitization, and search param parsing. Console output included expected error-path logging from mocked DB/API failures; exit code was 0. |
| `pnpm scan:public-payload-pii` | Failed before scanning | The script exited with usage text because `scripts/scan-public-payload-pii.js` requires one or more payload JSON arguments. |
| `node scripts/scan-public-payload-pii.js scripts/fixtures/public-payload-clean.json` | Passed | Scanner reported `{"ok":true,"scannedFiles":1}`. This proves the scanner can pass a clean fixture, not that search/map runtime payloads are clean. |
| `node scripts/scan-public-payload-pii.js scripts/fixtures/public-payload-leak.json` | Failed as expected | Scanner reported forbidden exact address, unit, phone, and exact coordinate violations from the leak fixture. This proves the scanner catches the expected fixture leak pattern. |
| Temporary dev server payload capture plus `node scripts/scan-public-payload-pii.js /tmp/roomshare-search-v2.json /tmp/roomshare-map-listings.json /tmp/roomshare-facets.json` | Failed | Captured real JSON from `/api/search/v2`, `/api/map-listings`, and `/api/search/facets`. Scanner summary: search V2 payload had 228 violations (`unit_number_value`: 118, `raw_phone_value`: 62, `forbidden_public_key`: 48); map-listings payload had 80 violations (`raw_phone_value`: 26, `forbidden_public_key`: 54); facets payload had 0 violations. Examples include `lat`/`lng` public keys, image URL strings matching the phone regex, and group/snapshot keys matching unit-number patterns. These may include scanner false positives, but the scan is not clean. |
| `pnpm test -- src/__tests__/lib/search/public-listing-payload.test.ts src/__tests__/lib/maps/sanitize-map-listings.test.ts src/__tests__/lib/search/v2-map-data.test.ts src/__tests__/lib/search/search-v2-service.test.ts src/__tests__/app/search/actions.test.ts src/__tests__/api/search/v2/route.test.ts src/__tests__/api/map-listings.test.ts src/__tests__/api/map-listings-route.test.ts src/__tests__/api/listings.test.ts src/__tests__/scripts/scan-public-payload-pii.test.ts --runInBand` | Passed | P0 privacy-focused suite passed: 10 suites, 129 tests. |
| `pnpm run typecheck` | Passed | `prisma generate`, `next typegen`, and `tsc --noEmit` completed successfully. |
| `pnpm run test:e2e:search-release-gate` | Passed | Ran the SSR and client release-gate commands after Docker/Postgres became reachable. Playwright reported 36 passed and 16 skipped across the combined gate. The build emitted known Sentry/OpenTelemetry dynamic-dependency warnings and DB connection logs during static/build paths, but the command exited 0. |
| Built local app payload capture plus `pnpm run scan:public-payload-pii -- /tmp/roomshare-payload-search-v2.json /tmp/roomshare-payload-search-listings.json /tmp/roomshare-payload-map-listings.json /tmp/roomshare-payload-listings.json` | Passed | Captured real JSON from `/api/search/v2`, `/api/search/listings`, `/api/map-listings`, and `/api/listings`; scanner returned `{"ok":true,"scannedFiles":4}`. Temporary server and payload files were cleaned up. |
| `gh pr checks 119 --repo Suryateja-byte/Roomshare` after merge | Passed | Final PR #119 checks were green on the merged P0 fix, including Public Payload PII Scan, both Search Release Gate jobs, Shards 1/10 through 10/10, Type Check, Unit Tests, API & Action Tests, Component Tests, Lint, Build, Lighthouse, Stability E2E, Vercel, and related filter/search checks. |

## Previous Blockers And Failures

Initial infrastructure blocker:

```text
GET /api/health/ready 503
Can't reach database server at `localhost:5433`
Please make sure your database server is running at `localhost:5433`.
```

Previous transient runtime failure after Docker/Postgres was enabled:

```text
expect(filterBenignSearchPageErrors(pageErrors)).toEqual([])
Received: ["Invalid or unexpected token"]
```

Artifact:
`test-results/search-search-smoke-Group--8bb45-opens-search-without-errors-desktop-anonymous/error-context.md`

Latest rerun result:

```text
tests/e2e/search/search-smoke.spec.ts --project=desktop-anonymous
1 passed (27.0s)
```

## Flow Verification Results

| Flow | Documented behavior | Observed behavior | Match? | Evidence | Doc correction needed |
|---|---|---|---|---|---|
| `/search` initial render | `/search` should render a results or browse/location-required state. | Verified on latest narrow smoke rerun: `/search?...` returned `200`, found `57` listings, rendered listing cards, reloaded, and had no unhandled page errors. | Match | Passing smoke command | Keep the earlier failed run as historical evidence only. |
| Filter change updates URL/results | Filter changes should affect URL/search state. | Verified in focused desktop filter spec: primary filter families update canonical URL state, applied filters render, and clear actions remove params. | Match | Passing `search-filters.spec.ts` command | Keep broader cross-project coverage as a test gap. |
| Sort change resets pagination | Sort query changes should reset stale pagination/cursor state. | Verified in focused desktop pagination spec: load-more appends items, sort resets list count and cursor/page state, and no duplicate card ids appear. | Match | Passing `search-pagination.spec.ts` command | Keep non-desktop/bounds-reset coverage as a gap. |
| Map movement behavior | Map movement updates viewport/state and may fetch map listings. | Verified in focused desktop map spec: desktop split preference persisted, list-backed marker parity held, marker/list focus path ran, and pan/zoom updated canonical bounds while results and map shell stayed sane. Map error/a11y suite passed, and the desktop `failure-mocked` project now covers `/api/map-listings` 500/429 retryable errors. | Match | Passing `search-map-desktop.spec.ts`, `search-map-mobile.spec.ts`, `map-errors-a11y.anon.spec.ts`, and `search-map-desktop.spec.ts --project=failure-mocked --grep '@failure-mocked'` commands; `evidence-register.md` C056 and C058 | Keep broader non-gate map/list sync and visual specs as gaps. |
| Search this area | Not documented as current behavior. | Not run. | Not verified | Not run | No correction. |
| Empty results state | Empty/location-required states exist by code evidence. | Verified for desktop zero-results, sparse-results, result-cap, near-match, and broader zero-results guidance paths in focused result/error specs. Location-required route-by-route UX remains a narrower gap. | Partial match | Passing `search-results-states.spec.ts` and `search-error-resilience.anon.spec.ts` commands | Narrow the remaining gap to location-required variants and map-specific failures. |
| Invalid URL params handling | Parser normalizes/drops/rejects invalid values depending path. | Verified for desktop URL-state behavior covering deep links, refresh/back/forward, legacy params, invalid dates, tampered cursors, SQL-injection-like queries, extreme price values, and invalid bounds. The focused Jest command also passed `src/__tests__/lib/search-params.test.ts`. Mobile URL-state path was not run in this project. | Partial match | Passing `search-url-state.spec.ts`, `search-error-resilience.anon.spec.ts`, and focused Jest commands | Keep mobile and broader adversarial URL E2E specs as gaps. |
| API failure/resilience | Search/list requests should degrade to visible error, retry, loading, or recovery states instead of crashing. | Verified in focused chromium-anon resilience suite: client-side API errors, recovery, slow/intermittent responses, rate-limit UI, error-boundary retry, offline/network recovery, load-more errors, and console monitoring passed. Map error/a11y passed for V2-compatible paths, and C058 covers `/api/map-listings` 500/429 retryable browser behavior. | Match | Passing `search-error-resilience.anon.spec.ts`, `map-errors-a11y.anon.spec.ts`, and `failure-mocked` desktop map commands | Keep broader non-gate resilience journeys as confidence gaps. |
| Anonymous save listing | Favorite POST 401 should navigate to `/login`. | Verified in focused desktop-anonymous saved-listing spec using a mocked unauthorized `/api/favorites` response. The focused Jest command also passed favorites API GET/POST suites. | Match | Passing `search-saved-listing.spec.ts --project=desktop-anonymous`, `.last-run.json`, and focused Jest command | Keep FavoriteButton component and client CSRF-header tests as gaps. |
| Authenticated save listing | Logged-in users should be able to save, reload with saved state, and unsave a search result card. | Verified in focused desktop-authenticated saved-listing spec. The focused Jest command also passed favorites API GET/POST suites. | Match | Passing `search-saved-listing.spec.ts --project=desktop-authenticated`, `.last-run.json`, and focused Jest command | Keep FavoriteButton component and client CSRF-header tests as gaps. |
| Contact host entry point | Direct contact-host action from search cards was not verified by code evidence. | Search result cards rendered with listing detail links, favorite buttons, and show-on-map buttons in the snapshot; contact-host was not observed. | Partial | `error-context.md` page snapshot and passing smoke rerun | Keep contact-host as not verified from search cards. |
| Mobile map/list behavior | Mobile map/list state exists by code evidence. | Verified in focused mobile-anonymous map/list spec: bottom sheet moved through map/peek/list snap states, collapsed overlay applied budget/filter state, and recent searches rendered/removal worked. | Match | Passing `search-map-mobile.spec.ts` command and `.last-run.json` | Keep mobile URL-state cross-checks and broader mobile-map specs as gaps. |

## Required Next Step

Run the remaining confidence checks after the focused release evidence:

1. Remaining non-gate broader E2E checks from `11-test-traceability-matrix.md`.
2. Add a deterministic payload-capture wrapper so the public-payload PII scanner
   can run as a standard no-arg release gate instead of relying on manual `/tmp`
   payload captures.
