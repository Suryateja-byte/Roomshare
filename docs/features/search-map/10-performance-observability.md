# Performance And Observability

| Area | Current evidence | Why it matters | Verification status |
|---|---|---|---|
| SSR rate limiting | `/search` checks `checkServerComponentRateLimit`. Evidence: `src/app/search/page.tsx`:L383-L402. | Protects expensive server-rendered search. | Code verified, not load-tested. |
| API rate limiting | Search/map/facets/geocoding/favorites APIs use rate-limit helpers. Evidence: `phase-4/04-auth-security-permissions.md`. | Protects public endpoints and saved-listing mutations. | Code verified, not stress-tested. |
| Bounds guards | Map/facet/data paths reject or constrain unbounded geography. Evidence: `evidence-register.md` C011. | Prevents full-map/full-table scans. | Code verified, tests not run. |
| V2/search-doc path | V2 service and search-doc queries are primary for list/map data. C063 now extracts the SSR/API/action fallback branches. Evidence: `evidence-register.md` C006, C009, C063. | Keeps search performance separate from legacy fallback. | Code and focused route/action tests verified; dedicated `/api/search/listings` fallback route test and service semantic-suite repair remain P2. |
| Legacy fallback | `getListingsPaginated` and `getMapListingsResult` remain fallback paths. Evidence: `phase-4/02-api-data-flow.md`. | Keeps feature degraded but usable when V2 fails. | Code verified, behavior not runtime-tested. |
| Cursor pagination | Keyset cursor helpers and V2 pagination exist. Evidence: `src/lib/search/cursor.ts`:L214-L580; `src/app/search/actions.ts`:L48-L300. | Avoids offset pagination drift/cost. | Tests discovered, not run. |
| Map clustering | Map uses clustering and marker memoization. Evidence: `src/components/Map.tsx`:L667-L786, L867-L1036, L4241-L4307. | Controls marker rendering cost. | Runtime/canvas not verified. |
| Persistent map wrapper | Map wrapper stays mounted and fetches map data independently. Evidence: `src/components/PersistentMapWrapper.tsx`:L4-L17, L382-L430. | Avoids repeated map initialization and separates marker fetches. | Code verified, browser not verified. |
| Map cache/SWR behavior | Wrapper has previous listings, spatial cache, request refs, timeout/retry state. Evidence: `src/components/PersistentMapWrapper.tsx`:L390-L430, L544-L588. | Reduces stale/blank map transitions. | Full cache behavior not traced. |
| Public cache headers | Search/map APIs set public cache headers; favorites uses private no-store. Evidence: `phase-4/04-auth-security-permissions.md`. | Balances cacheability and privacy. | Scanner fixture checks passed/failed as expected; real captured search/list/map payload scan passed after the P0 public payload fix. |
| Sentry/logging | Search page and APIs capture/log sanitized errors. Evidence: `phase-4/04-auth-security-permissions.md`. | Supports production debugging. | Need log payload audit. |
| Release gates | Search release-gate scripts exist. Evidence: `package.json` scripts, `manifest.json` tests, and `runtime-verification.md`. | Provides higher-level confidence before accepting docs. | `pnpm run test:e2e:search-release-gate` passed; build emitted warnings/logs noted in runtime verification. |

Recommended verification before accepting performance claims:

| Check | Command | Status |
|---|---|---|
| Public payload PII scan | `pnpm scan:public-payload-pii` | Failed with usage because no payload JSON was supplied |
| PII scanner clean fixture | `node scripts/scan-public-payload-pii.js scripts/fixtures/public-payload-clean.json` | Passed |
| PII scanner leak fixture | `node scripts/scan-public-payload-pii.js scripts/fixtures/public-payload-leak.json` | Failed as expected with exact address, unit, phone, and exact coordinate violations |
| Original real search/map payload PII scan | Temporary dev server capture of `/api/search/v2`, `/api/map-listings`, `/api/search/facets`, then `node scripts/scan-public-payload-pii.js /tmp/roomshare-search-v2.json /tmp/roomshare-map-listings.json /tmp/roomshare-facets.json` | Failed; search V2 reported 228 violations, map-listings 80, facets 0 |
| Fixed real search/list/map payload PII scan | Built local app capture of `/api/search/v2`, `/api/search/listings`, `/api/map-listings`, `/api/listings`, then `pnpm run scan:public-payload-pii -- /tmp/roomshare-payload-*.json` | Passed with `{"ok":true,"scannedFiles":4}` |
| Search release gate | `pnpm run test:e2e:search-release-gate` | Passed |
| Map/search E2E narrow pass | `pnpm exec playwright test tests/e2e/search/search-map-desktop.spec.ts --project=desktop-anonymous --reporter=list` and `pnpm exec playwright test tests/e2e/search/search-pagination.spec.ts --project=desktop-anonymous --reporter=list` | Passed as separate focused commands; C056 adds the latest desktop list/map parity rerun for `search-map-desktop.spec.ts` |
| Search service/API narrow pass | Focused Jest command for search V2, facets, map-listings, favorites, sanitization, and search params | Passed for selected API/unit files |
| P0 privacy-focused Jest pass | Focused sanitizer/API/search/load-more/scanner command | Passed: 10 suites, 129 tests |
