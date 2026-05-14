# Public Payload PII Scan Triage

Source of truth: current dirty documentation worktree, Phase 10 runtime payload
capture, and post-merge `origin/main` evidence for PR #119 at
`89ad33ea58391452b03a2ff5c3a219503769edaa`.

## Commands

| Command | Result | Evidence |
|---|---|---|
| `pnpm scan:public-payload-pii` | Failed before scanning because no payload JSON was supplied. | `runtime-verification.md`; `evidence-register.md` C046 |
| `pnpm run scan:public-payload-pii` after C064 | Passed with checked-in public payload fixtures. | `runtime-verification.md`; `evidence-register.md` C064 |
| `pnpm run scan:public-payload-pii -- scripts/fixtures/public-payload-leak.json` after C064 | Failed as expected. | `runtime-verification.md`; `evidence-register.md` C064 |
| `node scripts/scan-public-payload-pii.js scripts/fixtures/public-payload-clean.json` | Passed. | `runtime-verification.md`; `evidence-register.md` C046 |
| `node scripts/scan-public-payload-pii.js scripts/fixtures/public-payload-leak.json` | Failed as expected. | `runtime-verification.md`; `evidence-register.md` C046 |
| Temporary dev server capture of `/api/search/v2`, `/api/map-listings`, and `/api/search/facets`, then `node scripts/scan-public-payload-pii.js /tmp/roomshare-search-v2.json /tmp/roomshare-map-listings.json /tmp/roomshare-facets.json` | Failed. | `runtime-verification.md`; `evidence-register.md` C048 |
| Built local app capture of `/api/search/v2`, `/api/search/listings`, `/api/map-listings`, and `/api/listings`, then `pnpm run scan:public-payload-pii -- /tmp/roomshare-payload-search-v2.json /tmp/roomshare-payload-search-listings.json /tmp/roomshare-payload-map-listings.json /tmp/roomshare-payload-listings.json` | Passed. | `runtime-verification.md`; `evidence-register.md` C050 |
| `gh pr checks 119 --repo Suryateja-byte/Roomshare` after PR #119 merge | Passed. | `runtime-verification.md`; `evidence-register.md` C052 |

## Result Summary

| Payload | Scanner result | Summary |
|---|---|---|
| `/api/search/v2` | Failed | 228 total scanner violations: 118 `unit_number_value`, 62 `raw_phone_value`, 48 `forbidden_public_key`. |
| `/api/map-listings` | Failed | 80 total scanner violations: 26 `raw_phone_value`, 54 `forbidden_public_key`. |
| `/api/search/facets` | Passed | 0 scanner violations. |
| `/api/search/v2`, `/api/search/listings`, `/api/map-listings`, `/api/listings` after fix | Passed | Real captured local payloads scanned cleanly with `{"ok":true,"scannedFiles":4}`. |
| Checked-in generic and Search Map public payload fixtures after C064 | Passed | Deterministic no-arg gate scanned five fixture files with `{"ok":true,"scannedFiles":5}`. |
| PR #119 fixed code on `main` | Passed | GitHub Actions reported green Public Payload PII Scan, both Search Release Gate jobs, Shards 1/10 through 10/10, Unit/API/Component/Type/Lint/Build checks, Stability E2E, Search Smoke, Lighthouse, Vercel, and related filter/search checks. |

## Triage

| Finding group | Example path | Example value shape | Classification | Why | Evidence |
|---|---|---|---|---|---|
| Coarsened public list coordinates | `list.items.*.lat`, `list.items.*.lng` | `37.79`, `-122.41` | Likely scanner false positive | `transformToListItem` intentionally calls `toPublicCoordinates`, which rounds to 2 decimals before returning list-item coordinates. | `src/lib/search/transform.ts`:L99-L120; `src/lib/search/public-coordinates.ts`:L1-L18 |
| Coarsened public map coordinates | `data.listings.*.location.lat`, `data.listings.*.location.lng` | `37.76`, `-122.41` | Likely scanner false positive | `sanitizeMapListing` validates coordinates and returns `toPublicCoordinates` output for map listing locations. | `src/lib/maps/sanitize-map-listings.ts`:L87-L164; `src/lib/search/public-coordinates.ts`:L1-L18 |
| Full-fidelity search V2 card coordinates | `list.fullItems.*.location.lat`, `list.fullItems.*.location.lng` | `37.7861`, `-122.4094` | Potential real privacy risk | Search V2 includes `fullItems: listResult.items`, and `SearchV2List.fullItems` is typed as full-fidelity `ListingData[]`. `ListingData.location` contains numeric `lat` and `lng`; captured payload examples showed higher precision than the 2-decimal public coordinate helper. | `src/lib/search/search-v2-service.ts`:L1127-L1130; `src/lib/search/types.ts`:L134-L138; `src/lib/search-types.ts`:L56-L81 |
| Image URLs matching phone regex | `list.items.*.image`, `data.listings.*.images.*` | Unsplash URL containing long digits | Likely scanner false positive | The scanner uses a broad phone-number regex over all string values. Captured examples were image URLs, not phone fields. | `scripts/scan-public-payload-pii.js`:L18-L20; `runtime-verification.md` |
| Group and context keys matching unit regex | `groupKey`, `groupSummary.groupKey`, `groupContext.contextKey` | `e2e-unit-...:1` | Needs product/privacy decision | The scanner flags the value because it contains a unit-like token. This may be a non-PII grouping key, but it exposes an internal unit identity-style identifier in public payloads. | `runtime-verification.md`; `evidence-register.md` C048 |
| Snapshot version matching unit regex | `meta.snapshotVersion` | `phase04-unit-v1` | Likely scanner false positive | The value is a response contract/version string, not a unit number or user data. | `runtime-verification.md`; `evidence-register.md` C048 |

## Impact Trace

| Area | Evidence | Impact |
|---|---|---|
| Search V2 main service | `src/lib/search/search-v2-service.ts`:L1127-L1130 sets `fullItems: listResult.items`. | Current public V2 response includes full-fidelity list item objects in addition to public list-item summaries. |
| Snapshot/cursor response path | `src/lib/search/search-v2-service.ts`:L521-L524 sets `fullItems: items`. | Cursor/snapshot responses can carry the same full-fidelity payload shape. |
| Projection search path | `src/lib/search/projection-search.ts`:L722-L729 sets `fullItems: items`. | Projection-backed V2 responses also preserve full-fidelity items. |
| Response type | `src/lib/search/types.ts`:L134-L138 types `fullItems` as `ListingData[]`. | The public API contract currently describes `fullItems` as full-fidelity card payload data. |
| Listing data type | `src/lib/search-types.ts`:L56-L81 includes `location.lat` and `location.lng` on `ListingData`. | `fullItems` can expose listing coordinates unless transformed before response serialization. |
| Client consumer | `src/components/search/SearchResultsClient.tsx`:L433-L471 reads `searchResponse.list.fullItems ?? []` and uses it for displayed listings, totals, dedupe, and group-key tracking. | Removing `fullItems` without updating the client would likely break client-side V2 refresh/list rendering. |
| Existing tests | `src/__tests__/lib/search/projection-search.test.ts`:L198-L202 and L393-L397 assert `fullItems` behavior. | A fix will need test updates; most API/E2E assertions inspect `list.items`, but some unit tests encode `fullItems` as expected behavior. |

## Remediation Options

| Option | What changes | Privacy effect | Compatibility risk | Recommendation |
|---|---|---|---|---|
| A. Remove `fullItems` from `/api/search/v2` responses. | Stop returning `list.fullItems`; update `SearchResultsClient` to render from `list.items` or another public card payload. | Strongest reduction in public payload surface. | High: current client uses `fullItems`, and tests assert it. | Not first choice unless the client can be migrated carefully. |
| B. Keep `fullItems`, but transform it to a public card payload. | Replace raw `ListingData[]` with a sanitized card shape that coarsens coordinates and excludes fields not needed by search cards. | Good: fixes high-precision coordinate exposure while preserving a client-friendly payload. | Medium: type and tests must change, but client behavior can stay similar. | Preferred fix path. |
| C. Keep current response and tune scanner allowlists only. | Allow `lat`/`lng`, image URLs, group keys, or specific paths in scanner config. | Weak for `fullItems` because high-precision coordinates would remain. | Low short-term, high privacy risk. | Only acceptable for proven false positives, not for high-precision `fullItems` coordinates. |
| D. Make `fullItems` authenticated/private only. | Public callers receive `list.items`; trusted first-party/authenticated clients receive richer payload. | Strong for anonymous public API. | Medium-high: requires auth/cache contract changes and careful public/private cache separation. | Consider only if richer first-party data is truly needed. |

## Current Conclusion

The original public-payload scan was **not clean**. The concrete privacy risk
was fixed by transforming browser-visible search/list/map payloads to public
card/map shapes: exact coordinates are coarsened, raw group/context keys are
replaced with opaque `pg1_...` identifiers, and private listing fields are not
serialized to public discovery responses. A later real local payload scan
passed for `/api/search/v2`, `/api/search/listings`, `/api/map-listings`, and
`/api/listings`. The fix is now merged to `main` in PR #119 at
`89ad33ea58391452b03a2ff5c3a219503769edaa`, and the final PR checks all pass.

## Recommended Next Step

Keep the fixed scanner evidence attached to the P0 privacy fix. C064 adds the
standard no-arg fixture gate for local and CI use. Add live-server payload
capture later only if release owners require runtime parity beyond checked-in
fixture coverage.
