# Roomshare Search Page — Production Readiness Audit

**Date**: 2026-02-17
**Method**: 6 specialized Opus 4.6 agents auditing in parallel
**Scope**: 107+ source files across 6 domains
**Total Findings**: 130+

---

## Overall Production Readiness Score: 7.4 / 10

| Layer | Score | Agent | Key Risk |
|-------|-------|-------|----------|
| SSR / Page Structure | 7.0 | ssr-auditor | No SEO metadata, missing timeouts |
| API / Backend Services | 7.5 | api-auditor | Unsigned cursors, facets timeout gap |
| Client Components / UX | 7.5 | client-ux-auditor | SaveSearch a11y, filter param inconsistency |
| Map Integration | 7.0 | map-auditor | No WebGL recovery, 2192-line monolith |
| Filters / Pagination | 8.5 | filters-pagination-auditor | Dual validation systems, misleading context selectors |
| Security / Rate Limiting | 7.5 | security-auditor | IP spoofing vector, missing rate limits on saved searches |

---

## Detailed Dimension Scores

| Dimension | SSR | API | UX | Map | Filters | Security |
|-----------|-----|-----|-----|-----|---------|----------|
| Correctness | 7 | 8 | 8 | 7 | 9 | 8 |
| Error Handling | 7 | 7 | 9 | 6 | 8 | 8 |
| Security | 7 | 8 | 6 | 7 | 8 | 7 |
| Performance | 7 | 8 | 8 | 7 | 9 | 8 |
| Accessibility | 7 | — | 6 | 7 | — | — |
| Maintainability | 7 | 7 | 7 | 6 | 8 | 8 |

---

## Architecture Strengths

1. **V2/V1 fallback pattern** — graceful degradation with proper error isolation
2. **Multi-tier rate limiting** — Redis -> DB -> in-memory with fail-closed on cost-sensitive endpoints
3. **Keyset pagination** — correct implementation with +1 pattern, dedup via Set, 60-item cap
4. **Comprehensive input validation** — allowlists for all enums, numeric clamping, date validation, bounds enforcement
5. **Lazy map loading** — significant cost savings, only loads when user opts in
6. **Race condition handling** — AbortControllers, navigation version counters, stale response rejection, `isLoadingRef`
7. **Strong a11y foundation** — keyboard navigation, ARIA live regions, IME support, safe-area-inset handling
8. **Filter regression framework** — golden scenarios with behavior hashing for production regression detection
9. **Excellent test coverage** — 400+ tests across filters, pagination, edge cases, security scenarios

---

## CRITICAL Issues (9 total — must fix before production)

### C1. No `generateMetadata` — zero SEO on search page
- **Layer**: SSR
- **File**: `src/app/search/page.tsx` (missing export)
- **Description**: The search page has zero SEO configuration — no `generateMetadata`, no `metadata` export. Every other significant page in the app has metadata, but the search page — arguably the most important page for organic discovery — has none.
- **Impact**: No page title, no description, no canonical URLs, no Open Graph/Twitter cards, no `noindex` for filtered/paginated results. Search engines will index every filter combination as separate pages with duplicate/missing titles.
- **Fix**: Add `generateMetadata` that sets dynamic title based on query (e.g., "Rooms in San Francisco | Roomshare"), description from query + filter summary, canonical URL (strip pagination/cursor params), `noindex` for highly filtered/paginated results, and OG/Twitter cards.

### C2. `fetchMoreListings` server action has NO timeout protection
- **Layer**: SSR
- **File**: `src/app/search/actions.ts:52`
- **Description**: The V2 path calls `executeSearchV2()` directly without `withTimeout()`, unlike the SSR page which properly wraps both V2 and V1 paths with `withTimeout(fn, DEFAULT_TIMEOUTS.DATABASE, ...)`. A hung database or slow V2 query would cause the server action to hang indefinitely.
- **Impact**: Production server actions that hang without timeout can cause cascading failures — Node.js worker threads get exhausted, subsequent requests queue up, and the entire service becomes unresponsive.
- **Fix**: Wrap line 52 with `withTimeout(executeSearchV2({...}), DEFAULT_TIMEOUTS.DATABASE, 'fetchMore-V2')`.

### C3. `$queryRawUnsafe` used extensively with string-interpolated WHERE clauses
- **Layer**: API
- **Files**: `search-doc-queries.ts:274,310,346,380,437,570,654,806,1058,1242`, `facets/route.ts:274,310,346,380,437`
- **Description**: Multiple queries use `prisma.$queryRawUnsafe(query, ...params)` where the SQL query string is built via string interpolation of column names, WHERE conditions, and ORDER BY clauses. While the values are properly parameterized (no direct user input concatenation), the `$queryRawUnsafe` method name is a red flag and any future developer could accidentally concatenate user input into a condition string.
- **Impact**: Low probability today (parameterized correctly), but high blast radius if a future change introduces a bug.
- **Fix**: Add a comment block at each `buildSearchDocWhereConditions` / `buildFacetWhereConditions` documenting the security invariant. Consider adding a lint rule or code review checklist item.

### C4. No cursor signature/HMAC — cursor tampering enables data exfiltration
- **Layer**: API
- **File**: `search-doc-queries.ts:1001-1008`, `search-v2-service.ts:148-164`
- **Description**: Keyset cursors are base64-encoded JSON containing raw sort column values (`recommended_score`, `price`, `avg_rating`, `review_count`, `listing_created_at`, `id`). The `decodeCursorAny` function decodes and trusts these values without any signature verification. An attacker can craft arbitrary cursor values to skip pagination, enumerate all listings, and extract internal ranking scores.
- **Impact**: Information disclosure (ranking scores), potential enumeration of all listings bypassing intended pagination limits.
- **Fix**: HMAC-sign cursor strings using a server-side secret. On decode, verify the signature before trusting cursor values. Reject unsigned or tampered cursors with a 400 error.

### C5. SaveSearchButton modal has no focus trap or focus return
- **Layer**: Client/UX
- **File**: `src/components/SaveSearchButton.tsx:144-271`
- **Description**: The save-search modal renders a fixed overlay with `z-[1000]` but has no focus trap implementation. When opened, focus is not moved to the modal. Tab key can escape to background content. When closed, focus is not returned to the trigger button.
- **Impact**: WCAG 2.1 AA failure. Screen reader and keyboard users can interact with hidden background content.
- **Fix**: Add a focus trap (e.g., `@radix-ui/react-dialog` or manual trap). On open, move focus to the first interactive element. On close, restore focus to the trigger button.

### C6. SaveSearchButton modal missing aria attributes
- **Layer**: Client/UX
- **File**: `src/components/SaveSearchButton.tsx:153`
- **Description**: The modal div lacks `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`. The backdrop click handler exists but has no Escape key handler.
- **Impact**: Screen readers won't announce it as a dialog. No keyboard dismiss path. WCAG failure.
- **Fix**: Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to the h2. Add Escape key handler.

### C7. SaveSearchButton toggle switch missing ARIA role
- **Layer**: Client/UX
- **File**: `src/components/SaveSearchButton.tsx:197-205`
- **Description**: The email alerts toggle is a `<button>` with custom styling to look like a switch, but lacks `role="switch"` and `aria-checked`. Screen readers will not announce it as a toggle.
- **Impact**: WCAG failure — assistive tech users can't determine the toggle state.
- **Fix**: Add `role="switch"` and `aria-checked={alertEnabled}` to the toggle button.

### C8. Body scroll not locked when SaveSearchButton modal is open
- **Layer**: Client/UX
- **File**: `src/components/SaveSearchButton.tsx:144`
- **Description**: Unlike MobileSearchOverlay and MobileBottomSheet which properly lock body scroll, the SaveSearchButton modal does not lock body scroll. Users can scroll the background while the modal is open.
- **Impact**: Confusing UX on mobile — content scrolls behind the modal overlay.
- **Fix**: Add `useEffect` to set `document.body.style.overflow = 'hidden'` when `isOpen` is true.

### C9. No WebGL Context Loss Recovery
- **Layer**: Map
- **Files**: `src/components/Map.tsx`, `src/components/map/MapErrorBoundary.tsx`
- **Description**: There is no handler for WebGL context loss (`webglcontextlost` / `webglcontextrestored` events). MapLibre GL JS uses WebGL for rendering. On mobile devices, the OS can reclaim GPU memory when the app is backgrounded, causing the map canvas to go blank with no recovery mechanism.
- **Impact**: Users on mobile will see a blank map after switching apps and returning. No automatic recovery.
- **Fix**: Add `webglcontextlost`/`webglcontextrestored` event listeners on the map canvas. On loss, show a "Map paused" overlay. On restore, call `map.triggerRepaint()`. If restore doesn't fire within ~5s, force re-mount the map component.

---

## HIGH Issues (20 total — should fix, significant risk)

### H1. `parseSearchParams` throws on malformed input (inverted prices/lats)
- **Layer**: SSR
- **File**: `src/lib/search-params.ts:434` and `:451`
- **Description**: `parseSearchParams` throws `new Error("minPrice cannot exceed maxPrice")` for inverted ranges. Since `SearchPage` calls `parseSearchParams(rawParams)` without try/catch, this triggers the error boundary for any user who crafts a URL like `?minPrice=5000&maxPrice=100`.
- **Impact**: Any user can trigger a 500-like error page with a simple URL. Sentry event quota exhaustion.
- **Fix**: Normalize (swap min/max) instead of throwing, or catch and return graceful defaults.

### H2. No query length validation in `parseSearchParams`
- **Layer**: SSR / API / Security
- **File**: `src/lib/search-params.ts:404-406`
- **Description**: The `q` parameter is trimmed but not length-limited. `MAX_QUERY_LENGTH = 200` exists in `constants.ts` but `parseSearchParams` does not enforce it.
- **Impact**: Extremely long query strings can cause excessive memory usage, slow database text search, and potential ReDoS.
- **Fix**: Add `const q = query.slice(0, MAX_QUERY_LENGTH)` in `parseSearchParams`.

### H3. Rate-limited pages return HTTP 200 instead of 429
- **Layer**: SSR
- **File**: `src/app/search/page.tsx:102-120`
- **Description**: When rate-limited, the page renders a "Too Many Requests" UI but returns HTTP 200 (RSC page components can't set status codes).
- **Impact**: HTTP clients, bots, and monitoring tools won't detect rate limiting. A bot will see 200 and continue hammering.
- **Fix**: Consider redirecting to an API route that returns 429, or use Next.js middleware for rate limiting.

### H4. `analyzeFilterImpact` called without timeout
- **Layer**: SSR
- **File**: `src/app/search/page.tsx:255`
- **Description**: `analyzeFilterImpact(filterParams)` is called for zero-result searches without any timeout wrapper, unlike V2/V1 search paths which have `withTimeout()` protection.
- **Impact**: If the database is slow, this additional query could hang the SSR indefinitely on the zero-results path.
- **Fix**: Wrap with `withTimeout(analyzeFilterImpact(filterParams), DEFAULT_TIMEOUTS.DATABASE, 'analyzeFilterImpact')`.

### H5. `ITEMS_PER_PAGE` duplicated instead of using centralized constant
- **Layer**: SSR
- **Files**: `src/app/search/page.tsx:23` and `src/app/search/actions.ts:10`
- **Description**: Both files define `const ITEMS_PER_PAGE = 12` independently instead of importing `DEFAULT_PAGE_SIZE` from `src/lib/constants.ts`.
- **Impact**: If one file is updated without the other, SSR page size and "Load more" page size would diverge, causing duplicate or skipped listings.
- **Fix**: Import `DEFAULT_PAGE_SIZE` from `@/lib/constants` in both files.

### H6. `console.log` with raw JSON in production code
- **Layer**: API
- **File**: `search-v2-service.ts:402-409`
- **Description**: Search latency metric logged via `console.log(JSON.stringify({...}))` instead of structured `logger`. Bypasses log level controls and PII redaction safeguards.
- **Fix**: Replace with `logger.info("search_latency", { durationMs, listCount, mapCount, mode, cached: false })`.

### H7. Facets endpoint missing timeout protection
- **Layer**: API
- **File**: `facets/route.ts:480-500`
- **Description**: The facets endpoint runs 4 parallel + 1 sequential database queries without `withTimeout` or `queryWithTimeout`. `UNNEST` + `GROUP BY` queries on arrays can be expensive for large datasets.
- **Impact**: A single slow facet query blocks the request and ties up a serverless function instance.
- **Fix**: Wrap with `withTimeout(... , DEFAULT_TIMEOUTS.DATABASE)`.

### H8. Facets `$queryRawUnsafe` without statement timeout
- **Layer**: API
- **File**: `facets/route.ts:274,310,346,380,437`
- **Description**: Unlike `search-doc-queries.ts` which wraps queries in `queryWithTimeout` (with `SET LOCAL statement_timeout`), the facets route executes raw queries directly without any statement timeout.
- **Impact**: Database connection pool exhaustion; DoS via expensive facet queries.
- **Fix**: Use the same `queryWithTimeout` pattern from `search-doc-queries.ts`.

### H9. `listings/route.ts` GET uses DB-backed rate limiter, not Redis
- **Layer**: API
- **File**: `listings/route.ts:23`
- **Description**: The GET handler uses the PostgreSQL `RateLimitEntry` table for rate limiting instead of Redis like other search endpoints. For a read-heavy endpoint, every request creates a DB write.
- **Impact**: Under load, the rate limiter itself becomes a bottleneck.
- **Fix**: Migrate to `withRateLimitRedis` for consistency.

### H10. `listings/[id]/route.ts` PATCH has TOCTOU race condition
- **Layer**: API
- **File**: `listings/[id]/route.ts:238-249`
- **Description**: PATCH checks ownership with `findUnique` then updates in a separate transaction. Between the read and transaction, ownership could change. The DELETE handler correctly uses `FOR UPDATE` inside the transaction.
- **Fix**: Move the ownership check inside the transaction with `FOR UPDATE`, matching the DELETE pattern.

### H11. `processSearchAlerts` loads ALL saved searches unbounded
- **Layer**: API / Security
- **File**: `src/lib/search-alerts.ts:59-87`
- **Description**: `processSearchAlerts()` fetches ALL saved searches with `alertEnabled: true` without pagination or batch size limit. Each triggers a separate DB query and potentially an email.
- **Impact**: Memory exhaustion, thundering herd of DB queries, email service overwhelm, cron timeout.
- **Fix**: Add batch processing with LIMIT/OFFSET or cursor-based iteration. Process in chunks of 50-100.

### H12. CompactSearchPill filter count parsing diverges from canonical logic
- **Layer**: Client/UX
- **File**: `src/components/search/CompactSearchPill.tsx:41-55`
- **Description**: Filter count logic splits `amenities` and `houseRules` by comma (`split(',')`), but other components use `getAll()` for multi-value params.
- **Impact**: Filter count badge shows incorrect count on the compact desktop pill.
- **Fix**: Use `searchParams.getAll('amenities')` to match the pattern in CollapsedMobileSearch.

### H13. RecommendedFilters uses comma-joined array params inconsistently
- **Layer**: Client/UX
- **File**: `src/components/search/RecommendedFilters.tsx:26-32, 68-76`
- **Description**: `parseArrayParam` reads multi-value params by splitting on commas, and writes them back with `params.set(name, selected.join(','))`. But SearchForm appends each value as a separate URL param with `params.append('amenities', a)`.
- **Impact**: After clicking a recommended filter, the URL format changes from `amenities=Wifi&amenities=Parking` to `amenities=Wifi,Parking`, potentially breaking parsing.
- **Fix**: Use `params.append()` for each value instead of joining with commas.

### H14. MobileSearchOverlay doesn't use LocationSearchInput — no geocoding
- **Layer**: Client/UX
- **File**: `src/components/search/MobileSearchOverlay.tsx:97-108`
- **Description**: The mobile overlay has a plain text input that calls `onSearch(value)` without geocoding/autocomplete. Desktop has LocationSearchInput for this purpose.
- **Impact**: Performance risk (unbounded queries) and UX inconsistency.
- **Fix**: Replace the plain input with `LocationSearchInput`.

### H15. SuggestedSearches links don't include coordinates
- **Layer**: Client/UX
- **File**: `src/components/search/SuggestedSearches.tsx:40-48, 63-71`
- **Description**: Recent search and popular area links use `href={/search?q=${...}}` without lat/lng coordinates.
- **Impact**: Clicking these links triggers an unbounded text search, adding latency and potential errors.
- **Fix**: Include stored coordinates for recent searches. Add hardcoded coordinates for popular areas.

### H16. SearchForm `handleSearch` has 13+ dependencies
- **Layer**: Client/UX
- **File**: `src/components/SearchForm.tsx:423`
- **Description**: Any change to any of 13+ dependencies recreates the callback, which could trigger unexpected behavior with the debounce timeout.
- **Fix**: Read filter state from refs instead of having them as dependencies.

### H17. Duplicate Map Component — MapClient.tsx vs Map.tsx
- **Layer**: Map
- **File**: `src/components/map/MapClient.tsx` (641 lines)
- **Description**: `MapClient.tsx` is an older, simpler version of `Map.tsx` with divergent features. It lacks all production fixes present in Map.tsx.
- **Impact**: Developers may import the wrong component, introducing regressions.
- **Fix**: Remove `MapClient.tsx` if unused, or clearly mark as deprecated.

### H18. No maximum marker count limit
- **Layer**: Map
- **Files**: `src/components/Map.tsx:1805`, `src/app/api/map-listings/route.ts`
- **Description**: The API returns all listings within bounds without a LIMIT. The client renders all markers as individual DOM elements. With a dense city view at low zoom, hundreds of markers create hundreds of DOM nodes.
- **Impact**: Frame drops and memory spikes on low-end mobile devices.
- **Fix**: Server: add hard `LIMIT 200`. Client: consider supercluster with canvas-rendered markers for >100 points.

### H19. No per-user rate limiting on search — only per-IP
- **Layer**: Security
- **Files**: `src/app/api/search/v2/route.ts:64-67`, `src/app/api/map-listings/route.ts:34-37`
- **Description**: Search endpoints only rate limit by IP. No per-user tier differentiation. A corporate NAT can exhaust limits for all users behind that IP.
- **Fix**: For authenticated users, use `${ip}:${userId}` as the rate limit identifier.

### H20. Saved search server actions missing rate limiting
- **Layer**: Security
- **File**: `src/app/actions/saved-search.ts`
- **Description**: `saveSearch`, `deleteSavedSearch`, `toggleSearchAlert`, and `updateSavedSearchName` have auth checks but NO rate limiting.
- **Impact**: Authenticated users could spam mutations causing DB write amplification.
- **Fix**: Add rate limiting using `checkServerComponentRateLimit` or `withRateLimit` wrapper.

### H21. SearchResultsClient useEffect has triple dependency reset risk
- **Layer**: Filters/Pagination
- **File**: `src/components/search/SearchResultsClient.tsx:74-81`
- **Description**: The useEffect has dependencies `[searchParamsString, initialListings, initialNextCursor]`. Since `initialListings` is a new array reference on every SSR render, the effect fires unnecessarily, potentially losing "Load more" progress.
- **Fix**: Use `searchParamsString` as the sole reset trigger (component is already keyed by it).

---

## MEDIUM Issues (35 total — improvement opportunities)

### SSR Layer

| # | Issue | File |
|---|-------|------|
| M1 | No explicit `dynamic = 'force-dynamic'` export | `page.tsx` |
| M2 | `loading.tsx` skeleton shows redundant header | `PageSkeleton.tsx:170` |
| M3 | V2 override via `?v2=1` unrestricted in production | `page.tsx:171` |
| M4 | `withRetry` adds 200ms+ latency before V1 fallback | `page.tsx:27-46` |
| M5 | Layout z-index extremely high (1100) | `layout.tsx:46` |
| M6 | No Suspense boundaries for progressive streaming | `page.tsx` |
| M7 | Error boundary doesn't differentiate error types | `error.tsx` |
| M8 | `savedPromise` failure silently returns empty array (no logging) | `page.tsx:238` |
| M9 | SearchLayoutView trivial `handleSearch` wrapper | `SearchLayoutView.tsx:57` |
| M10 | `error.tsx` hardcodes header padding values | `error.tsx:21` |

### API Layer

| # | Issue | File |
|---|-------|------|
| M11 | Duplicate `computeRecommendedScore` implementation | `search-doc-sync.ts:52` vs `recommended-score.ts:10` |
| M12 | Feature flag bypass via URL params in production | `search-v2-service.ts:134`, `v2/route.ts:41` |
| M13 | `COUNT(*) OVER()` in map query is expensive | `search-doc-queries.ts:646` |
| M14 | No max query length validation in parseSearchParams | `search-params.ts:404` |
| M15 | `search-alerts.ts` uses ILIKE instead of FTS for text search | `search-alerts.ts:161` |
| M16 | `listings/route.ts` logs query text | `listings/route.ts:42` |
| M17 | `listings/route.ts` doesn't use `runWithRequestContext` | `listings/route.ts:21` |
| M18 | Inconsistent error response format across endpoints | Multiple API routes |
| M19 | Search count endpoint returns 200 for unbounded queries | `search-count/route.ts:56` |

### Client/UX Layer

| # | Issue | File |
|---|-------|------|
| M20 | SearchResultsClient doesn't use AbortController for load-more | `SearchResultsClient.tsx:132` |
| M21 | `splitStayPairs` useMemo uses length as proxy dependency | `SearchResultsClient.tsx:112` |
| M22 | MobileBottomSheet snap animation unit switching (px vs vh) | `MobileBottomSheet.tsx:307` |
| M23 | LocationSearchInput `suggestionsRef` across conditional renders | `LocationSearchInput.tsx:405` |
| M24 | SearchForm recent searches dropdown uses fragile setTimeout for blur | `SearchForm.tsx:637` |
| M25 | Duplicated filter-counting logic (3 components, divergent) | `CollapsedMobileSearch.tsx`, `CompactSearchPill.tsx` |
| M26 | FloatingMapButton hardcoded bottom position may not align with sheet | `FloatingMapButton.tsx:46` |
| M27 | Performance marks left in production code | `SearchResultsClient.tsx:138`, `SearchForm.tsx:381` |
| M28 | LowResultsGuidance calls `generateFilterSuggestions` without memoization | `LowResultsGuidance.tsx:102` |
| M29 | ZeroResultsSuggestions "Clear filters" and "Browse all" do the same thing | `ZeroResultsSuggestions.tsx:176` |

### Map Layer

| # | Issue | File |
|---|-------|------|
| M30 | Race condition in V2/V1 data path selection (200ms timeout) | `PersistentMapWrapper.tsx:529` |
| M31 | E2E testing globals not behind feature flag everywhere | `Map.tsx:999` |
| M32 | `useSearchParams()` direct usage creates re-render pressure | `Map.tsx:381`, `MapBoundsContext.tsx:269` |
| M33 | Console logging in production — googleMapsUiKitLoader | `googleMapsUiKitLoader.ts:96` |
| M34 | `pendingFocus` in SearchMapUIContext never expires | `SearchMapUIContext.tsx:76` |

### Security Layer

| # | Issue | File |
|---|-------|------|
| M35 | In-memory rate limit fallback has no size cap | `rate-limit-redis.ts:33` |
| M36 | Degraded mode cache in DB rate limiter also unbounded | `rate-limit.ts:10` |
| M37 | Search V2 route shares "map" rate limit bucket | `search/v2/route.ts:64` |
| M38 | Error messages in API routes could leak validation details | `search/v2/route.ts:137` |
| M39 | Search alerts email contains user's saved search name (no HTML escape) | `search-alerts.ts:182` |

### Filters/Pagination Layer

| # | Issue | File |
|---|-------|------|
| M40 | Dual validation systems — allowlists duplicated | `search-params.ts:201-278` vs `filter-schema.ts` |
| M41 | Gender/household chip display uses hardcoded map not allowlist | `filter-chip-utils.ts:266` |
| M42 | SearchV2DataContext selector hooks misleading (useContext re-renders all) | `SearchV2DataContext.tsx:173-220` |
| M43 | filter-suggestions.ts has loose Zod schema compared to filter-schema.ts | `filter-suggestions.ts:13` |
| M44 | `fetchMoreListings` passes raw params without full validation | `SearchResultsClient.tsx:118` |

---

## LOW Issues (24 total — nice-to-haves)

### SSR Layer
- L1: `PLACEHOLDER_IMAGES` duplicated between `page.tsx` and `ListingCard`
- L2: `SearchResultsLoadingWrapper` uses `useSearchParams()` triggering Suspense
- L3: SearchForm lazy-loaded without prefetch hint
- L4: `browseMode` message could be more actionable
- L5: No `not-found.tsx` for the search route
- L6: Layout has 6 nested providers
- L7: Keyboard shortcut 'M' for map toggle has no visual indicator

### API Layer
- L8: Cache key includes full JSON (no hash)
- L9: `listings/[id]` PATCH returns full listing object
- L10: `markListingDirty` catch is empty (no logging)
- L11: Price histogram has no LIMIT clause
- L12: `search-alerts.ts` `matchesFilters` doesn't validate bounds/location
- L13: No structured error codes across API routes

### Client/UX Layer
- L14: Popular areas in SuggestedSearches are hardcoded
- L15: LocationSearchInput clear button visual size vs touch target mismatch
- L16: MobileBottomSheet CSS custom properties non-standard React typing
- L17: SearchForm budget inputs lack `aria-describedby` connection
- L18: RecommendedFilters has no loading skeleton
- L19: `useRecentSearches` dual export of `getFilterSummary`
- L20: MobileSearchOverlay uses `defaultValue` (uncontrolled) input

### Map Layer
- L21: Dark mode style URL inconsistency (external vs local)
- L22: No `prefers-reduced-motion` for map animations
- L23: `clusterRadius: 50` may be too aggressive for dense areas
- L24: `mapRef` typed as `any` in MapClient.tsx (if kept)

### Security Layer
- L25: No CORS headers on search API routes
- L26: `sessionStorage`-based rate limit easily clearable
- L27: Anonymous fingerprint is deterministic and spoofable
- L28: Cache-Control allows CDN caching of search results (risk if personalized later)

### Filters/Pagination Layer
- L29: Sort validation case-sensitivity mismatch between parsers
- L30: Query length not capped in `parseSearchParams` (duplicate of H2)
- L31: `setIsV2Enabled` in useMemo deps is unnecessary
- L32: "All filters selected" optimization missing

---

## Recommended Fix Priority

### P0 — Fix before launch (Critical)

| # | Fix | Impact |
|---|-----|--------|
| 1 | Add `generateMetadata` to search page | SEO — no organic discovery without this |
| 2 | Add `withTimeout` to `fetchMoreListings` | Availability — can hang entire server |
| 3 | Fix SaveSearchButton modal accessibility | WCAG compliance — legal/ethical risk |
| 4 | Add WebGL context loss recovery to map | Mobile UX — blank map after backgrounding |
| 5 | HMAC-sign keyset cursors | Security — prevents data enumeration |

### P1 — Fix in first sprint (High)

| # | Fix | Impact |
|---|-----|--------|
| 6 | Normalize inverted params instead of throwing | Prevents user-triggered 500 errors |
| 7 | Add timeout protection to facets endpoint | Prevents DB connection pool exhaustion |
| 8 | Fix filter param format inconsistency | Prevents broken filter URLs |
| 9 | Add geocoding to MobileSearchOverlay | Prevents unbounded mobile queries |
| 10 | Add coordinates to SuggestedSearches links | Prevents full-table scans |
| 11 | Cap query length in `parseSearchParams` | Prevents memory/DoS abuse |
| 12 | Add rate limiting to saved search mutations | Prevents write amplification |
| 13 | Remove or gate duplicate `MapClient.tsx` | Prevents regression from wrong import |
| 14 | Add marker count limit (server + client) | Prevents mobile perf degradation |
| 15 | Fix SearchResultsClient useEffect dependency | Prevents lost "Load more" progress |

### P2 — Near-term improvements (Medium)

| # | Fix | Impact |
|---|-----|--------|
| 16 | Unify allowlists between `search-params.ts` and `filter-schema.ts` | Prevents validation drift |
| 17 | Gate feature flag URL overrides in production | Prevents force-disable of features |
| 18 | Standardize API error response format | Better client-side error handling |
| 19 | Extract shared filter count utility | Consistency across components |
| 20 | Fix SearchV2DataContext selector hook architecture | Prevent unnecessary re-renders |
| 21 | Add size cap to in-memory rate limit fallback | Prevent memory exhaustion under attack |
| 22 | Add progressive streaming with Suspense | Faster perceived load time |
| 23 | Differentiate error types in error boundary | Better user messaging |
| 24 | Remove console.log statements from production | Clean logging |

### P3 — Polish (Low)

| # | Fix | Impact |
|---|-----|--------|
| 25 | Add `prefers-reduced-motion` to map animations | Motion sensitivity compliance |
| 26 | Popular areas from DB instead of hardcoded | Personalization readiness |
| 27 | Budget input `aria-describedby` | Minor a11y improvement |
| 28 | Host dark mode map style locally | Resilience against CDN outage |
| 29 | Add structured error codes to API | Machine-readable error handling |
| 30 | Reduce cluster radius or make zoom-dependent | Better dense-area UX |

---

## Files Index (Essential files per layer)

### SSR/Page Layer
- `src/app/search/page.tsx` — Main search page (SSR entry)
- `src/app/search/actions.ts` — Server action for "Load more"
- `src/app/search/layout.tsx` — Persistent layout with map
- `src/app/search/error.tsx` — Error boundary
- `src/app/search/loading.tsx` — Loading skeleton

### API/Backend Layer
- `src/lib/search/search-doc-queries.ts` — Core query engine
- `src/lib/search/search-v2-service.ts` — Search orchestration
- `src/lib/search-params.ts` — Input validation/parsing
- `src/app/api/search/v2/route.ts` — Main search API
- `src/app/api/search/facets/route.ts` — Facets aggregation
- `src/lib/rate-limit.ts` — Rate limiting configuration

### Client/UX Layer
- `src/components/search/SearchResultsClient.tsx` — Client pagination, dedup, cap
- `src/components/SearchForm.tsx` — Main search form
- `src/components/LocationSearchInput.tsx` — Geocoding autocomplete
- `src/components/search/MobileBottomSheet.tsx` — Mobile results sheet
- `src/components/SaveSearchButton.tsx` — Save search modal

### Map Layer
- `src/components/Map.tsx` — Main map component (2,192 lines)
- `src/components/PersistentMapWrapper.tsx` — Data fetching, lazy loading
- `src/contexts/MapBoundsContext.tsx` — Bounds state, area count, banner
- `src/app/api/map-listings/route.ts` — Map data endpoint

### Filters/Pagination Layer
- `src/lib/filter-schema.ts` — Zod schema, allowlists (source of truth)
- `src/types/pagination.ts` — Keyset cursor encode/decode/validate
- `src/components/filters/filter-chip-utils.ts` — Filter display/removal
- `src/contexts/SearchV2DataContext.tsx` — V2 data sharing

### Security Layer
- `src/lib/rate-limit-redis.ts` — Redis rate limiting with fallback chain
- `src/lib/with-rate-limit-redis.ts` — Redis rate limit wrapper
- `src/lib/rate-limit.ts` — DB-backed rate limiter
- `src/app/actions/saved-search.ts` — Saved search mutations
