# Data Model And Invariants

## Data Model References

| Model / storage | Role in feature | Evidence |
|---|---|---|
| `Listing` | Primary listing data, location relation, and search-relevant indexes. | `prisma/schema.prisma`:L107-L156; `evidence-register.md` C025 |
| `Location` | Geospatial location model with coordinate index. | `prisma/schema.prisma`:L237-L247; `evidence-register.md` C025 |
| `SavedListing` | User/listing join model for favorites/saved listings. | `prisma/schema.prisma`:L159-L168; `evidence-register.md` C025 |
| `SavedSearch` | Persisted saved-search spec and hash. | `prisma/schema.prisma`:L397-L420; `evidence-register.md` C025 |
| `InventorySearchProjection` | Projection support for inventory/search paths. | `prisma/schema.prisma`:L1106-L1136; `evidence-register.md` C025 |
| `SemanticInventoryProjection` | Semantic search projection/index support. | `prisma/schema.prisma`:L1183-L1186; `evidence-register.md` C025 |
| `QuerySnapshot` | Query snapshot/cache support. | `prisma/schema.prisma`:L1207-L1211; `evidence-register.md` C025 |
| Search-doc migrations | Search document, FTS, composite indexes, gender columns, price decimals, projection versions. | `manifest.json` migrations; `evidence-register.md` C026 |

## Invariants

| Invariant | Why it matters | Enforced where | Evidence | Test coverage | Risk if broken |
|---|---|---|---|---|---|
| URL params are canonical committed search input. | Prevents drift between server, APIs, and client controls. | `parseSearchParams` and route callsites. | `evidence-register.md` C003, C045 | Desktop URL-state E2E and `src/__tests__/lib/search-params.test.ts` passed. | Wrong results, broken shared URLs. |
| Text search without usable bounds must not trigger an unbounded full scan. | Prevents expensive or unsafe broad searches. | `isBoundsRequired`, `/search`, facets, map bounds guards. | `evidence-register.md` C004, C011 | Unbounded-browse tests discovered, not run. | Performance issue or broad data exposure. |
| Map listing APIs require bounded geography or derived bounds. | Prevents full-table marker fetches. | `/api/map-listings`, `validateAndParseBounds`, bounds derivation. | `phase-4/02-api-data-flow.md`; `evidence-register.md` C045, C058 | Map API Jest suites passed; failure-mocked desktop browser tests verify 500/429 retry behavior. | Slow map, excess payload, API abuse. |
| V2/search-doc and legacy fallback both feed the list UI, but exact field parity still needs verification. | Keeps results usable during V2 fallback. | `SearchPage`, `/api/search/listings`, `executeSearchV2`, legacy data helpers. | `evidence-register.md` C006, C009; `unknowns.md` G007 | V2/fallback tests discovered, not run. | UI crashes or inconsistent cards. |
| Cursor/query hash state is intended to prevent reuse across incompatible searches, and focused reset behavior now has browser evidence. | Prevents stale pagination. | Cursor helpers, V2 service, and C062 focused root pagination/sort reset plus map-bounds round-trip runs. | `src/lib/search/cursor.ts`:L214-L580; `phase-4/03-state-model.md`; `unknowns.md` G006; `evidence-register.md` C062 | Root pagination/sort and map-bounds reset browser tests passed; broader cross-browser/mobile and non-gate pagination families remain confidence coverage. | Duplicate, missing, or wrong listings. |
| Saved listing mutation requires authenticated user context. | Prevents anonymous writes to user-specific state. | `/api/favorites` POST and saved-listings action. | `evidence-register.md` C018-C019, C040, C044-C045; `phase-4/04-auth-security-permissions.md` | Search-card saved-listing E2E and favorites API Jest suites passed; FavoriteButton component/client CSRF-header tests not run. | Unauthorized saved-listing writes. |
| Public cache responses are intended to avoid user-specific saved state. | Prevents privacy leaks. | Public cache headers in search/map APIs; private no-store favorites responses; public payload sanitizer. | `phase-4/04-auth-security-permissions.md`; `unknowns.md` G002; `evidence-register.md` C045-C050 | Focused API/sanitization tests passed; scanner fixture checks passed/failed as expected; real captured search/list/map payload scan passed after the P0 fix. | Saved-state or PII leakage. |
| Public search APIs should not expose full-fidelity listing coordinates when coarsened public coordinates are available. | Prevents precise listing-location exposure from public cached search responses. | `toPublicSearchListing`, `toPublicCoordinates`, and public response type changes. | `public-payload-pii-triage.md`; `evidence-register.md` C048-C050 | Original real public-payload scan failed; after remediation, real captured `/api/search/v2`, `/api/search/listings`, `/api/map-listings`, and `/api/listings` payloads scanned cleanly. | Precise location exposure through public search/list/map payloads. |
| Manual Search-this-area button/toggle must not be documented as current behavior; automatic search-as-move may be documented with C061 source evidence. | Avoids false docs while preserving the current map-pan search behavior. | Removed-flow comment plus current `executeMapSearch`/status-overlay source evidence. | `evidence-register.md` C016 and C061; `unknowns.md` G004 | Removed-toggle tests discovered but not run in this slice; no fresh browser pan/search-as-move proof. | Developer confusion and bad QA plans. |
| Booking fields must be labeled as current code/data references, not active booking UX. | Project direction is contact-host-first. | Parser/query/migration evidence only. | `evidence-register.md` C030; `unknowns.md` G010 | Not run. | Revives old booking assumptions. |
