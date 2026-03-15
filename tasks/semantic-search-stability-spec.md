# Semantic Search — Stability Test Specification

## Purpose

"Stable" means: semantic search activates exactly when all preconditions are met (feature flag ON, GEMINI_API_KEY present, query >= 3 chars, sort = recommended), returns correctly ranked results using Reciprocal Rank Fusion of vector similarity and keyword scores, gracefully falls back to existing full-text search (FTS) when any precondition is missing or any subsystem fails, and never blocks, crashes, or returns incorrect results regardless of external service state. Embedding sync on listing create/update is fire-and-forget and never disrupts the primary write path. Similar listings on the detail page appear only when the feature flag is on and the listing has an embedding. The cron maintenance endpoint recovers stuck embeddings and is properly auth-gated. The query embedding cache reduces Gemini API calls without serving stale data.

**61 scenarios** across 9 categories. Priority breakdown: **P0** x29, **P1** x18, **P2** x14.

---

## Feature Flag Matrix

The three relevant environment variables are `ENABLE_SEMANTIC_SEARCH`, `GEMINI_API_KEY`, and `SEMANTIC_WEIGHT`. Their interaction determines system behavior.

| `ENABLE_SEMANTIC_SEARCH` | `GEMINI_API_KEY` | `SEMANTIC_WEIGHT` | Search behavior | Embedding sync on create/update | Similar listings section | Cron endpoint |
|---|---|---|---|---|---|---|
| `"true"` | Set (valid) | `0.6` (default) | Semantic search active for queries >= 3 chars + sort=recommended | Fire-and-forget sync runs | Visible (if embedding exists) | Runs recovery + reports status |
| `"true"` | Set (valid) | `0.0` | Hybrid search with 0% semantic weight (keyword-only RRF) | Fire-and-forget sync runs | Visible (if embedding exists) | Runs recovery + reports status |
| `"true"` | Set (valid) | `1.0` | Hybrid search with 100% semantic weight (vector-only RRF) | Fire-and-forget sync runs | Visible (if embedding exists) | Runs recovery + reports status |
| `"true"` | **Missing** | Any | `generateQueryEmbedding` throws "GEMINI_API_KEY is not configured" -> `semanticSearchQuery` catches, returns null -> falls back to FTS | `syncListingEmbedding` throws in `generateEmbedding` -> logged, status set to FAILED | Returns `[]` (no embeddings exist) | Runs recovery (no embeddings to process) |
| `"false"` or unset | Any | Any | `features.semanticSearch` is false -> `semanticSearchQuery` returns null immediately -> FTS used | `syncListingEmbedding` is never called (guarded by `features.semanticSearch` check in POST/PATCH handlers) | `getSimilarListings` returns `[]` immediately | Returns `{ skipped: true, reason: 'ENABLE_SEMANTIC_SEARCH is not true' }` |
| `"true"` | Set (valid) | Non-numeric / missing | `SEMANTIC_WEIGHT` defaults to `0.6` per `features.semanticWeight` getter | Sync runs normally | Visible | Runs normally |
| `"true"` | Set (valid) | `-0.5` (out of range) | `SEMANTIC_WEIGHT` defaults to `0.6` (out-of-range values are rejected, not clamped — same fallback as invalid/missing) | Sync runs normally | Visible | Runs normally |
| `"true"` | Set (valid) | `1.5` (out of range) | `SEMANTIC_WEIGHT` defaults to `0.6` (out-of-range values are rejected, not clamped — same fallback as invalid/missing) | Sync runs normally | Visible | Runs normally |

**Source**: `features.semanticSearch` reads `process.env.ENABLE_SEMANTIC_SEARCH === "true"` (src/lib/env.ts:467). `features.semanticWeight` returns `Number(process.env.SEMANTIC_WEIGHT)` with default 0.6 — out-of-range values (< 0 or > 1) are rejected and fall back to 0.6, not clamped to 0.0/1.0 (src/lib/env.ts:469-471). `GEMINI_API_KEY` is validated inside `getClient()` (src/lib/embeddings/gemini.ts:22-24).

---

## Test Scenarios

### Category 1: Semantic Search Activation

#### SS-01: Semantic search activates with valid query + recommended sort
- **ID**: SS-01
- **Title**: Semantic search returns ranked results for natural language query
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, `GEMINI_API_KEY` set, database has listings with embeddings (embedding_status='COMPLETED'), sort=recommended (default)
- **Steps**:
  1. Navigate to `/search?q=cozy+room+near+campus&bounds=...` (query >= 3 chars, no sort param so defaults to "recommended")
  2. Wait for search results to load
- **Expected Result**: Search results appear. Results are ordered by hybrid RRF score (semantic similarity + keyword rank). Listing cards render with title, price, location, images.
- **Failure Means**: `semanticSearchQuery()` is not being called, or the `search_listings_semantic` SQL function is not returning results, or `mapSemanticRowsToListingData` is failing to transform rows.
- **Priority**: P0
- **Layer**: [E2E/Playwright]

#### SS-02: Semantic search requires query length >= 3 characters
- **ID**: SS-02
- **Title**: Queries shorter than 3 characters fall back to FTS
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, `GEMINI_API_KEY` set
- **Steps**:
  1. Navigate to `/search?q=ab&bounds=...` (2-char query)
  2. Wait for results
- **Expected Result**: Results load via standard FTS path (not semantic). No Gemini API call is made. Results still appear (from existing search path).
- **Failure Means**: The `queryText.length < 3` guard in `semanticSearchQuery()` (search-doc-queries.ts:1519) is not working.
- **Priority**: P1
- **Layer**: [E2E/Playwright]

#### SS-03: Semantic search only activates when sort is "recommended"
- **ID**: SS-03
- **Title**: Non-recommended sort bypasses semantic search
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, `GEMINI_API_KEY` set
- **Steps**:
  1. Navigate to `/search?q=cozy+room&bounds=...&sort=price_asc`
  2. Wait for results
- **Expected Result**: Results are sorted by price ascending (not by semantic score). The semantic search branch in search-v2-service.ts (line 170-195) is not entered because `sortOption !== "recommended"`.
- **Failure Means**: The `sortOption === "recommended"` guard (search-v2-service.ts:174) is not working.
- **Priority**: P0
- **Layer**: [E2E/Playwright]

#### SS-04: Semantic search deactivated when feature flag is off
- **ID**: SS-04
- **Title**: ENABLE_SEMANTIC_SEARCH=false uses FTS for all queries
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=false` or unset
- **Steps**:
  1. Navigate to `/search?q=cozy+room+near+campus&bounds=...`
  2. Wait for results
- **Expected Result**: Results load via FTS. No Gemini API calls. `semanticSearchQuery()` returns null at line 1515 immediately.
- **Failure Means**: Feature flag check at `features.semanticSearch` (env.ts:467) is not evaluating correctly.
- **Priority**: P0
- **Layer**: [E2E/Playwright]

#### SS-05: Semantic search falls back to FTS when no embeddings exist
- **ID**: SS-05
- **Title**: Empty semantic results trigger FTS fallback
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, `GEMINI_API_KEY` set, but no listings have embedding_status='COMPLETED' (all embeddings are NULL)
- **Steps**:
  1. Navigate to `/search?q=cozy+room&bounds=...`
  2. Wait for results
- **Expected Result**: `semanticSearchQuery()` returns null (because SQL function returns 0 rows due to `sd.embedding IS NOT NULL` filter). FTS path runs and returns results. User sees listings.
- **Failure Means**: The `if (semanticRows && semanticRows.length > 0)` guard is not entered, but execution does not fall through to the existing FTS path as expected.
- **Priority**: P0
- **Layer**: [E2E/Playwright]

#### SS-06: Semantic search with bounds-only query (no text)
- **ID**: SS-06
- **Title**: Browse-mode (no query text) does not trigger semantic search
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`
- **Steps**:
  1. Navigate to `/search?bounds=...` (no `q` param)
  2. Wait for results
- **Expected Result**: Results load via standard path. Semantic branch is not entered because `filterParams.query` is falsy (search-v2-service.ts:172).
- **Failure Means**: The `filterParams.query` truthiness check is not guarding correctly.
- **Priority**: P1
- **Layer**: [E2E/Playwright]

#### SS-07: Query is capped at MAX_QUERY_LENGTH (200 chars)
- **ID**: SS-07
- **Title**: Extremely long queries are truncated before embedding generation
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, `GEMINI_API_KEY` set
- **Steps**:
  1. Navigate to `/search?q=<201+ character string>&bounds=...`
  2. Wait for results
- **Expected Result**: Search completes without error. The query is silently truncated to 200 characters (search-doc-queries.ts:1522). Results are returned.
- **Failure Means**: The `queryText.slice(0, MAX_QUERY_LENGTH)` cap is not applied, potentially causing Gemini API errors on very long inputs.
- **Priority**: P2
- **Layer**: [E2E/Playwright]

---

### Category 2: Search Results Quality

#### SS-08: Semantic results include all required listing fields
- **ID**: SS-08
- **Title**: Listing cards from semantic search display all fields correctly
- **Preconditions**: Semantic search active, results returned
- **Steps**:
  1. Perform a semantic search query
  2. Inspect listing cards in results
- **Expected Result**: Each listing card displays: title, price (formatted), location (city, state), images (carousel or placeholder), amenities (up to 2), available/total slots badge, and rating (if reviews exist). All fields are populated from `mapSemanticRowsToListingData` (search-doc-queries.ts:1587-1617).
- **Failure Means**: Field mapping in `mapSemanticRowsToListingData` has a bug, or `SemanticSearchRow` interface doesn't match the SQL function's `RETURNS TABLE`.
- **Priority**: P0
- **Layer**: [E2E/Playwright]

#### SS-09: Semantic search pagination works (Load More)
- **ID**: SS-09
- **Title**: Load More fetches additional semantic results with correct offset
- **Preconditions**: Semantic search returns more than 12 results (DEFAULT_PAGE_SIZE)
- **Steps**:
  1. Perform semantic search that yields > 12 results
  2. Click "Load More"
  3. Wait for additional results
- **Expected Result**: 12 more results load. No duplicates (deduplication via `seenIdsRef`). Cursor is page-based (encoded via `encodeCursor(page + 1)` at search-v2-service.ts:190). Total results can accumulate up to MAX_ACCUMULATED (60).
- **Failure Means**: The offset calculation `(page - 1) * pageSize` (search-v2-service.ts:177) is wrong, or cursor encoding/decoding for semantic path is broken.
- **Priority**: P0
- **Layer**: [E2E/Playwright]

#### SS-10: Semantic search respects all filter parameters
- **ID**: SS-10
- **Title**: Filters (price, amenities, room type, etc.) apply to semantic results
- **Preconditions**: Semantic search active
- **Steps**:
  1. Navigate to `/search?q=quiet+study+spot&bounds=...&minPrice=500&maxPrice=1500&roomType=PRIVATE`
  2. Wait for results
- **Expected Result**: All returned listings have price between $500-$1500 and room type = PRIVATE. The SQL function `search_listings_semantic` applies these as hard filters in the `filtered` CTE (migration SQL lines 128-152).
- **Failure Means**: Filter parameters are not being passed correctly to the SQL function via `queryWithTimeout` (search-doc-queries.ts:1539-1575), or the SQL WHERE clauses are incorrect.
- **Priority**: P0
- **Layer**: [E2E/Playwright]

#### SS-11: Semantic weight parameter affects ranking balance
- **ID**: SS-11
- **Title**: SEMANTIC_WEIGHT controls vector vs keyword ranking proportion
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, `SEMANTIC_WEIGHT=0.8`
- **Steps**:
  1. Perform a search with a query that has both semantic meaning and keyword matches
  2. Observe result ordering
- **Expected Result**: Results are ranked by RRF formula: `0.8 * (1/(60+semantic_rank)) + 0.2 * (1/(60+keyword_rank))`. Higher semantic weight means vector similarity dominates. The weight is passed as parameter 19 to the SQL function (search-doc-queries.ts:1571).
- **Failure Means**: `features.semanticWeight` is not reading the env var correctly, or the SQL function's RRF formula (migration SQL line 183-185) is wrong.
- **Priority**: P1
- **Layer**: [E2E/Playwright]

#### SS-12: Semantic search with geographic bounds
- **ID**: SS-12
- **Title**: Bounds filter correctly limits semantic results to viewport
- **Preconditions**: Semantic search active, listings with embeddings exist both inside and outside viewport bounds
- **Steps**:
  1. Navigate to `/search?q=cozy+room&bounds=37.7,-122.5,37.8,-122.3` (San Francisco area)
  2. Wait for results
- **Expected Result**: Only listings within the bounding box appear. The SQL function uses `ST_MakeEnvelope` on `location_geog` (migration SQL line 134-136).
- **Failure Means**: Geographic filter in the SQL function is not working, or bounds are not passed correctly.
- **Priority**: P0
- **Layer**: [E2E/Playwright]

---

### Category 3: Listing Lifecycle -> Embedding Sync

#### SS-13: Creating a listing triggers embedding generation
- **ID**: SS-13
- **Title**: POST /api/listings fires syncListingEmbedding when feature flag is on
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, `GEMINI_API_KEY` set, user authenticated
- **Steps**:
  1. Create a new listing via POST /api/listings with valid data
  2. Wait for response (201 Created)
  3. After a short delay, query `listing_search_docs` for the new listing's embedding_status
- **Expected Result**: Listing is created successfully (201). The `fireSideEffects` function calls `syncListingEmbedding(listing.id)` as fire-and-forget (route.ts:371-378). After the async operation completes, the listing's `embedding_status` transitions from PENDING -> PROCESSING -> COMPLETED. The `embedding` column contains a 768-dim vector. The `embedding_text` column contains composed text from `composeListingText`.
- **Failure Means**: The `features.semanticSearch` guard in `fireSideEffects` (route.ts:371) is not reached, or `syncListingEmbedding` fails silently.
- **Priority**: P0
- **Layer**: [API/Integration]

#### SS-14: Creating a listing does NOT trigger embedding when flag is off
- **ID**: SS-14
- **Title**: POST /api/listings skips embedding sync when ENABLE_SEMANTIC_SEARCH=false
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=false`, user authenticated
- **Steps**:
  1. Create a new listing via POST /api/listings
  2. Verify response is 201
- **Expected Result**: Listing created. `syncListingEmbedding` is never called (guarded by `features.semanticSearch` at route.ts:371). The listing's `embedding_status` remains 'PENDING', `embedding` is NULL.
- **Failure Means**: Feature flag guard is missing or broken.
- **Priority**: P0
- **Layer**: [API/Integration]

#### SS-15: Updating a listing re-syncs embedding
- **ID**: SS-15
- **Title**: PATCH /api/listings/[id] triggers embedding re-sync
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, `GEMINI_API_KEY` set, listing already has an embedding
- **Steps**:
  1. Update a listing's title and description via PATCH /api/listings/[id]
  2. Wait for response (200 OK)
  3. After a short delay, check the listing's embedding_status and embedding_text
- **Expected Result**: Listing updated (200). `syncListingEmbedding(id)` is called fire-and-forget ([id]/route.ts:583-584). The `embedding_text` column is updated to reflect new title/description. `embedding` is regenerated. `embedding_status` returns to COMPLETED.
- **Failure Means**: The post-update embedding sync ([id]/route.ts:583-584) is not running.
- **Priority**: P0
- **Layer**: [API/Integration]

#### SS-16: Embedding sync skips if text hasn't changed (dedup)
- **ID**: SS-16
- **Title**: No-op update does not regenerate embedding
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, listing has a COMPLETED embedding
- **Steps**:
  1. PATCH /api/listings/[id] with identical title and description (no content change)
  2. Observe embedding_updated_at timestamp
- **Expected Result**: `syncListingEmbedding` runs but exits early at the dedup check: `if (doc.embedding_text === embeddingText) return;` (sync.ts:87). The `embedding_updated_at` is not changed. No Gemini API call is made.
- **Failure Means**: The dedup check in sync.ts is not working correctly.
- **Priority**: P1
- **Layer**: [API/Integration]

#### SS-17: Embedding sync does not block listing creation on failure
- **ID**: SS-17
- **Title**: Gemini API failure during embedding sync does not prevent listing creation
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, `GEMINI_API_KEY` set to an invalid value
- **Steps**:
  1. Create a new listing via POST /api/listings
  2. Observe response
- **Expected Result**: Listing is created successfully (201). The `route.ts` `.catch()` handler (route.ts:372-377) only logs the error with `logger.sync.warn('Embedding sync failed')`. The `FAILED` status is set by `syncListingEmbedding`'s internal catch block in `sync.ts` (sync.ts:122-128), which also increments `embedding_attempts`. If `syncListingEmbedding` throws before reaching its internal catch (e.g., initial DB read fails), the status stays `PENDING` and will be recovered by the cron job.
- **Failure Means**: The fire-and-forget `.catch()` handler is not swallowing the error, causing the response to fail.
- **Priority**: P0
- **Layer**: [API/Integration]

#### SS-18: Concurrent embedding sync is prevented
- **ID**: SS-18
- **Title**: PROCESSING status prevents double-embed race condition
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, listing has `embedding_status='PROCESSING'`
- **Steps**:
  1. Trigger `syncListingEmbedding` while the listing is already in PROCESSING state
- **Expected Result**: The function exits early at the check `if (doc.embedding_status === 'PROCESSING') return;` (sync.ts:62). No duplicate Gemini API call is made.
- **Failure Means**: Race condition guard is broken, leading to wasted API calls or data corruption.
- **Priority**: P1
- **Layer**: [API/Integration]

#### SS-19: composeListingText produces correct embedding input
- **ID**: SS-19
- **Title**: All listing fields are included in composed embedding text
- **Preconditions**: Listing with all optional fields populated
- **Steps**:
  1. Create a listing with title, description, price, roomType, amenities, houseRules, leaseDuration, genderPreference, householdGender, householdLanguages, city, state, moveInDate, bookingMode, availableSlots, totalSlots
  2. Trigger embedding sync
  3. Read `embedding_text` from `listing_search_docs`
- **Expected Result**: The `embedding_text` contains all provided fields in structured format. Example: `"My Room Title My Room Description Room type: PRIVATE. $1200 per month. 2 of 4 slots available. Amenities: WiFi, Parking. House rules: No Smoking. Lease: MONTHLY. Gender preference: NO_PREFERENCE. Household gender: MIXED. Languages spoken: English, Spanish. Booking mode: SHARED. Located in Austin, Texas. Available from 2026-04-01."` (compose.ts:29-88).
- **Failure Means**: `composeListingText` is missing fields or formatting incorrectly, degrading embedding quality.
- **Priority**: P1
- **Layer**: [API/Integration]

---

### Category 4: Similar Listings (Detail Page)

#### SS-20: Similar listings section renders when feature flag is on and embeddings exist
- **ID**: SS-20
- **Title**: Listing detail page shows "Similar listings" with ListingCards
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, target listing has a COMPLETED embedding, other listings with COMPLETED embeddings exist with similarity > 0.3
- **Steps**:
  1. Navigate to `/listings/[id]` for a listing with an embedding
  2. Scroll down past the reviews section
- **Expected Result**: A "Similar listings" section appears with heading "Similar listings". Up to 4 `ListingCard` components render in a 2-column grid (ListingPageClient.tsx:493: `similarListings.slice(0, 4)`). Each card shows title, price, location, images, amenities, slots badge.
- **Failure Means**: `getSimilarListings()` is not being called (page.tsx:187), or the `get_similar_listings` SQL function is not returning results, or the prop mapping (page.tsx:195-208) is incorrect.
- **Priority**: P0
- **Layer**: [E2E/Playwright]

#### SS-21: Similar listings section hidden when feature flag is off
- **ID**: SS-21
- **Title**: No similar listings rendered when ENABLE_SEMANTIC_SEARCH=false
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=false`
- **Steps**:
  1. Navigate to `/listings/[id]`
  2. Check for "Similar listings" section
- **Expected Result**: The "Similar listings" heading does not appear. `getSimilarListings()` returns `[]` immediately at its first line: `if (!features.semanticSearch) return [];` (page.tsx:46). The conditional render `{similarListings && similarListings.length > 0 && ...}` (ListingPageClient.tsx:486) evaluates to false.
- **Failure Means**: Feature flag check in `getSimilarListings` is broken.
- **Priority**: P0
- **Layer**: [E2E/Playwright]

#### SS-22: Similar listings section hidden when target listing has no embedding
- **ID**: SS-22
- **Title**: No similar listings when current listing lacks an embedding vector
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, target listing has `embedding=NULL`
- **Steps**:
  1. Navigate to `/listings/[id]` where the listing has no embedding
- **Expected Result**: "Similar listings" section does not appear. The SQL function `get_similar_listings` checks `IF target_embedding IS NULL THEN RETURN; END IF;` (migration SQL line 261-263), returning 0 rows.
- **Failure Means**: SQL function NULL guard is not working.
- **Priority**: P1
- **Layer**: [E2E/Playwright]

#### SS-23: Similar listings section hidden when no similar listings meet threshold
- **ID**: SS-23
- **Title**: No section rendered when all similarities are below 0.3
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, target listing has embedding, but all other listings are very dissimilar (similarity < 0.3)
- **Steps**:
  1. Navigate to `/listings/[id]` for a listing with a unique topic (e.g., only listing about "underwater scuba storage")
- **Expected Result**: "Similar listings" section does not appear. SQL function filters by `(1 - (sd.embedding <=> target_embedding)) > similarity_threshold` (migration SQL line 62) with threshold=0.3.
- **Failure Means**: Similarity threshold filter in SQL function is broken.
- **Priority**: P1
- **Layer**: [E2E/Playwright]

#### SS-24: Similar listings gracefully handle SQL errors
- **ID**: SS-24
- **Title**: SQL function error returns empty array, page still renders
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, but `get_similar_listings` function is missing or broken
- **Steps**:
  1. Navigate to `/listings/[id]`
- **Expected Result**: Page renders normally without the "Similar listings" section. `getSimilarListings` catches the error (page.tsx:50-56), logs it via `logger.sync.error`, and returns `[]`.
- **Failure Means**: The try/catch in `getSimilarListings` is not catching the error, causing the entire page to crash.
- **Priority**: P0
- **Layer**: [E2E/Playwright]

#### SS-25: Similar listings excludes the current listing
- **ID**: SS-25
- **Title**: The current listing does not appear in its own similar listings
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, listing has embedding, similar listings exist
- **Steps**:
  1. Navigate to `/listings/[id]`
  2. Check the similar listings section
- **Expected Result**: The current listing's ID does not appear in the similar listings cards. The SQL function filters via `WHERE sd.id != target_listing_id` (migration SQL line 59).
- **Failure Means**: Self-exclusion filter in SQL function is broken.
- **Priority**: P0
- **Layer**: [E2E/Playwright]

#### SS-26: Similar listings only shows ACTIVE listings
- **ID**: SS-26
- **Title**: Paused or inactive listings are excluded from similar listings
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, similar listings include some with status='PAUSED'
- **Steps**:
  1. Navigate to `/listings/[id]`
  2. Check similar listings
- **Expected Result**: Only ACTIVE listings appear. SQL function filters `AND sd.status = 'ACTIVE'` (migration SQL line 60).
- **Failure Means**: Status filter in SQL is missing or wrong.
- **Priority**: P1
- **Layer**: [E2E/Playwright]

#### SS-27: Similar listings returns at most 6 results, UI shows at most 4
- **ID**: SS-27
- **Title**: Similar listings are capped at display count
- **Preconditions**: Many similar listings exist above threshold
- **Steps**:
  1. Navigate to a popular listing's detail page
- **Expected Result**: SQL function is called with `match_count=6` (page.tsx:48). The UI renders at most 4 cards: `similarListings.slice(0, 4)` (ListingPageClient.tsx:493).
- **Failure Means**: Cap logic is incorrect.
- **Priority**: P2
- **Layer**: [E2E/Playwright]

---

### Category 5: Query Caching

#### SS-28: Cache hit avoids Gemini API call
- **ID**: SS-28
- **Title**: Repeated identical queries use cached embeddings
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, `GEMINI_API_KEY` set
- **Steps**:
  1. Search for "cozy room near campus"
  2. Search for "cozy room near campus" again (same query, within 5 minutes)
- **Expected Result**: First search calls `generateQueryEmbedding` (cache miss). Second search returns cached embedding (cache hit). Same results appear. Observable by checking `queryCacheStats()` shows hits=1. No second Gemini API call.
- **Failure Means**: LRU cache in query-cache.ts is not storing or retrieving entries correctly.
- **Priority**: P1
- **Layer**: [API/Integration]

#### SS-29: Cache key is case-insensitive
- **ID**: SS-29
- **Title**: "Cozy Room" and "cozy room" produce the same cache key
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`
- **Steps**:
  1. Search for "Cozy Room Near Campus"
  2. Search for "cozy room near campus"
- **Expected Result**: Both queries resolve to the same cache key (`query.trim().toLowerCase()` at query-cache.ts:28). Second search is a cache hit.
- **Failure Means**: `cacheKey()` function is not normalizing correctly.
- **Priority**: P1
- **Layer**: [Unit]

#### SS-30: Cache entries expire after TTL (5 minutes)
- **ID**: SS-30
- **Title**: Stale cache entries are evicted after 5 minutes
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`
- **Steps**:
  1. Search for "cozy room"
  2. Wait > 5 minutes (TTL_MS = 300000)
  3. Search for "cozy room" again
- **Expected Result**: Second search triggers a fresh `generateQueryEmbedding` call (cache miss). The stale entry is deleted at the check `Date.now() - existing.createdAt < TTL_MS` (query-cache.ts:49).
- **Failure Means**: TTL expiry check is not working.
- **Priority**: P2
- **Layer**: [Unit]

#### SS-31: Cache evicts oldest entry at capacity (100 entries)
- **ID**: SS-31
- **Title**: LRU eviction when cache reaches MAX_ENTRIES=100
- **Preconditions**: Cache has 100 entries
- **Steps**:
  1. Perform 100 unique searches to fill the cache
  2. Perform a 101st unique search
- **Expected Result**: The oldest (first-inserted) entry is evicted via `evictOldest()` (query-cache.ts:32-36). Cache size remains at 100. The 101st query's embedding is stored.
- **Failure Means**: LRU eviction logic is broken, causing unbounded memory growth.
- **Priority**: P2
- **Layer**: [Unit]

#### SS-32: Cache miss on embedding generation failure still propagates error
- **ID**: SS-32
- **Title**: Gemini API error during cache miss propagates to caller
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, `GEMINI_API_KEY` invalid
- **Steps**:
  1. Perform a search query (first time, cache miss)
- **Expected Result**: `getCachedQueryEmbedding` calls `generateQueryEmbedding` which throws. The error propagates up to `semanticSearchQuery` where it's caught (search-doc-queries.ts:1578), logged, and null is returned. FTS fallback kicks in.
- **Failure Means**: Error is swallowed inside the cache layer, returning undefined/garbage instead of propagating.
- **Priority**: P1
- **Layer**: [Unit]

---

### Category 6: Cron Maintenance Endpoint

#### SS-33: Cron endpoint requires valid CRON_SECRET authentication
- **ID**: SS-33
- **Title**: GET /api/cron/embeddings-maintenance returns 401 without auth
- **Preconditions**: `CRON_SECRET` configured (>= 32 chars)
- **Steps**:
  1. GET /api/cron/embeddings-maintenance without Authorization header
- **Expected Result**: Returns 401 `{ error: 'Unauthorized' }`. `validateCronAuth` rejects the request (cron-auth.ts:28-29).
- **Failure Means**: Auth check is missing or bypassed.
- **Priority**: P0
- **Layer**: [API/Integration]

#### SS-34: Cron endpoint returns 500 when CRON_SECRET is not configured
- **ID**: SS-34
- **Title**: Missing CRON_SECRET returns server configuration error
- **Preconditions**: `CRON_SECRET` not set or < 32 chars
- **Steps**:
  1. GET /api/cron/embeddings-maintenance with any Authorization header
- **Expected Result**: Returns 500 `{ error: 'Server configuration error' }`. `validateCronAuth` detects missing/short secret (cron-auth.ts:18-20).
- **Failure Means**: Cron runs unauthenticated when secret is misconfigured.
- **Priority**: P0
- **Layer**: [API/Integration]

#### SS-35: Cron endpoint returns 500 when CRON_SECRET is a placeholder
- **ID**: SS-35
- **Title**: Placeholder CRON_SECRET values are rejected
- **Preconditions**: `CRON_SECRET` starts with "generate-" or "your-" or contains "change-in-production"
- **Steps**:
  1. GET /api/cron/embeddings-maintenance with Bearer token matching the placeholder secret
- **Expected Result**: Returns 500 `{ error: 'Server configuration error' }`. `validateCronAuth` detects placeholder (cron-auth.ts:23-25).
- **Failure Means**: Placeholder secrets are accepted, creating a security vulnerability.
- **Priority**: P0
- **Layer**: [API/Integration]

#### SS-36: Cron endpoint succeeds with valid auth and feature flag on
- **ID**: SS-36
- **Title**: Cron recovers stuck embeddings and reports status
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, `CRON_SECRET` configured, valid Authorization header
- **Steps**:
  1. Set a listing's `embedding_status='PROCESSING'` and `embedding_updated_at` to > 10 minutes ago
  2. GET /api/cron/embeddings-maintenance with `Authorization: Bearer <CRON_SECRET>`
- **Expected Result**: Returns 200 with JSON: `{ success: true, recovered: 1, status: { COMPLETED: N, PENDING: M, ... }, total: T, duration: "Xms" }`. The stuck listing's status is reset to PENDING. `recoverStuckEmbeddings(10)` (sync.ts:136-147) processes rows where `embedding_status='PROCESSING' AND embedding_updated_at < NOW() - 10 minutes`.
- **Failure Means**: Recovery logic or status reporting is broken.
- **Priority**: P0
- **Layer**: [API/Integration]

#### SS-37: Cron endpoint skips when feature flag is off
- **ID**: SS-37
- **Title**: Cron returns skipped response when ENABLE_SEMANTIC_SEARCH=false
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=false`, valid auth
- **Steps**:
  1. GET /api/cron/embeddings-maintenance with valid Authorization header
- **Expected Result**: Returns 200 with `{ skipped: true, reason: 'ENABLE_SEMANTIC_SEARCH is not true' }` (embeddings-maintenance/route.ts:18-19). No database queries are executed.
- **Failure Means**: Feature flag gate at route.ts:18 is not working.
- **Priority**: P0
- **Layer**: [API/Integration]

#### SS-38: Cron endpoint handles database errors gracefully
- **ID**: SS-38
- **Title**: Database error returns 500 with generic message, captures Sentry
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, valid auth, database is down or query fails
- **Steps**:
  1. GET /api/cron/embeddings-maintenance with valid auth while DB is unavailable
- **Expected Result**: Returns 500 with `{ success: false, error: 'Embeddings maintenance failed' }` (route.ts:63-66). Error is captured via `Sentry.captureException` with tag `cron: 'embeddings-maintenance'`. No PII in error response.
- **Failure Means**: Unhandled exception crashes the endpoint or leaks sensitive error details.
- **Priority**: P1
- **Layer**: [API/Integration]

#### SS-39: Cron reports correct embedding status distribution
- **ID**: SS-39
- **Title**: Status counts include all states including NULL
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, listings have mixed embedding_status values
- **Steps**:
  1. Ensure listings exist with status COMPLETED, PENDING, FAILED, PROCESSING, and some with NULL embedding_status
  2. GET /api/cron/embeddings-maintenance with valid auth
- **Expected Result**: Response `status` object contains counts for each state: `{ COMPLETED: X, PENDING: Y, FAILED: Z, NULL: W }`. The NULL key comes from `row.embedding_status ?? 'NULL'` (route.ts:39). `total` sums all counts.
- **Failure Means**: Status aggregation query or NULL handling is broken.
- **Priority**: P2
- **Layer**: [API/Integration]

---

### Category 7: Error Resilience

#### SS-40: Gemini API down — search gracefully falls back to FTS
- **ID**: SS-40
- **Title**: Gemini API 500 error triggers FTS fallback, not user-visible error
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, Gemini API is returning 500 errors
- **Steps**:
  1. Perform a search with a text query >= 3 chars
- **Expected Result**: `getCachedQueryEmbedding` calls `generateQueryEmbedding` which retries up to MAX_RETRIES=3 (gemini.ts:42) with exponential backoff (1s, 2s, 4s + jitter). After all retries fail, the error propagates to `semanticSearchQuery` which catches it (search-doc-queries.ts:1578-1582), logs `[semantic-search] Failed, falling back to FTS`, and returns null. The search-v2-service falls through to FTS at line 194. User sees results from FTS.
- **Failure Means**: Retry logic or fallback catch block is broken.
- **Priority**: P0
- **Layer**: [E2E/Playwright]

#### SS-41: Gemini API returns 401 — non-retryable, immediate fallback
- **ID**: SS-41
- **Title**: Authentication errors are not retried (400/401/403/404)
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, `GEMINI_API_KEY` is expired/revoked
- **Steps**:
  1. Perform a search
- **Expected Result**: `withRetry` in gemini.ts detects status 401 and throws immediately without retrying (gemini.ts:49: `if (status && [400, 401, 403, 404].includes(status)) throw err`). Error propagates to `semanticSearchQuery` catch block. Falls back to FTS.
- **Failure Means**: Non-retryable errors are being retried, wasting time before fallback.
- **Priority**: P1
- **Layer**: [E2E/Playwright]

#### SS-42: SQL function error — search falls back to FTS
- **ID**: SS-42
- **Title**: search_listings_semantic SQL error triggers FTS fallback
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, but the SQL function `search_listings_semantic` has been dropped or has a schema mismatch
- **Steps**:
  1. Perform a semantic search
- **Expected Result**: `queryWithTimeout` throws a database error. `semanticSearchQuery` catches it (search-doc-queries.ts:1578-1582), logs the error, returns null. FTS runs. User sees results.
- **Failure Means**: The catch block in `semanticSearchQuery` doesn't catch this category of error.
- **Priority**: P0
- **Layer**: [E2E/Playwright]

#### SS-43: Statement timeout (5s) prevents long-running semantic queries
- **ID**: SS-43
- **Title**: Slow semantic search query is killed after 5 seconds
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, database under heavy load causing slow queries
- **Steps**:
  1. Perform a semantic search query that takes > 5 seconds
- **Expected Result**: `queryWithTimeout` sets `SET LOCAL statement_timeout = 5000` (search-doc-queries.ts:110). PostgreSQL kills the query after 5s. The error is caught by `semanticSearchQuery` (search-doc-queries.ts:1578). Falls back to FTS.
- **Failure Means**: Statement timeout is not being applied, causing indefinite hangs.
- **Priority**: P0
- **Layer**: [Unit]

#### SS-44: Embedding generation failure during sync sets status to FAILED
- **ID**: SS-44
- **Title**: syncListingEmbedding handles Gemini errors gracefully
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, `GEMINI_API_KEY` configured but rate-limited (429)
- **Steps**:
  1. Create or update a listing, triggering `syncListingEmbedding`
  2. Gemini returns 429 (rate limit) after all retries exhausted
- **Expected Result**: The catch block in sync.ts:115-128 runs. `embedding_status` is set to 'FAILED'. `embedding_attempts` is incremented by 1. Error is logged via `logger.sync.error`. The listing creation/update response is not affected (fire-and-forget).
- **Failure Means**: Error handling in sync.ts catch block is broken, or the cleanup query at line 122-128 fails silently.
- **Priority**: P1
- **Layer**: [API/Integration]

#### SS-45: Cleanup query failure in syncListingEmbedding is swallowed
- **ID**: SS-45
- **Title**: Failed status update after embedding error does not throw
- **Preconditions**: Database temporarily unavailable during the catch block of syncListingEmbedding
- **Steps**:
  1. Trigger `syncListingEmbedding` where embedding generation fails AND the subsequent status update also fails
- **Expected Result**: The `.catch(() => {})` at sync.ts:128 swallows the cleanup failure. No unhandled promise rejection. The embedding_status may remain as PROCESSING (will be recovered by cron).
- **Failure Means**: Missing `.catch(() => {})` causes unhandled rejection.
- **Priority**: P2
- **Layer**: [Unit]

#### SS-46: search-v2-service handles overall semantic path exception
- **ID**: SS-46
- **Title**: Uncaught error in semantic path returns generic error response
- **Preconditions**: Any unexpected error in the semantic search pipeline
- **Steps**:
  1. Trigger an error that bypasses the catch in `semanticSearchQuery` (e.g., `mapSemanticRowsToListingData` throws on malformed data)
- **Expected Result**: The outer try/catch in `executeSearchV2` (search-v2-service.ts:438-449) catches the error, logs it via `logger.sync.error("SearchV2 service error")`, and returns `{ response: null, paginatedResult: null, error: "Failed to fetch search results" }`. No 500 crash page. No PII in logs.
- **Failure Means**: The outer error handler is not catching this class of error.
- **Priority**: P0
- **Layer**: [Unit]

#### SS-47: Gemini embedding returns empty values array
- **ID**: SS-47
- **Title**: Empty embedding response throws descriptive error
- **Preconditions**: Gemini API returns response with `embeddings: [{ values: [] }]`
- **Steps**:
  1. Trigger embedding generation where Gemini returns empty values
- **Expected Result**: `generateEmbedding` throws `"[embedding] No embedding returned from Gemini"` (gemini.ts:86). Error propagates to callers. For search: falls back to FTS. For sync: sets status to FAILED.
- **Failure Means**: Empty embedding is stored as a zero-length vector, causing SQL errors or meaningless similarity scores.
- **Priority**: P1
- **Layer**: [Unit]

#### SS-48: Gemini text input is truncated to MAX_INPUT_LENGTH (2000 chars)
- **ID**: SS-48
- **Title**: Very long listing descriptions are truncated before embedding
- **Preconditions**: Listing with description > 2000 characters
- **Steps**:
  1. Create a listing with a very long description
  2. Trigger embedding sync
- **Expected Result**: `generateEmbedding` truncates input to 2000 chars (gemini.ts:67: `text.slice(0, MAX_INPUT_LENGTH)`). Embedding is generated successfully. No API error.
- **Failure Means**: Truncation is not applied, causing Gemini API to reject the input (exceeding 2048 token limit).
- **Priority**: P2
- **Layer**: [Unit]

---

### Category 8: Performance Contracts

#### SS-49: Search query completes within statement timeout
- **ID**: SS-49
- **Title**: Semantic search queries complete within 5-second statement timeout
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, database has HNSW index on embeddings
- **Steps**:
  1. Perform multiple semantic search queries with various query texts and filter combinations
  2. Measure response times
- **Expected Result**: All search queries complete within 5 seconds (SEARCH_QUERY_TIMEOUT_MS = 5000). The HNSW index (`idx_search_docs_embedding_hnsw`) ensures vector similarity lookups are O(log n) not O(n).
- **Failure Means**: Missing HNSW index causes sequential scan, blowing the 5s timeout.
- **Priority**: P0
- **Layer**: [API/Integration]

#### SS-50: Query cache hit latency is near-zero
- **ID**: SS-50
- **Title**: Cached query embeddings return in < 1ms
- **Preconditions**: Query embedding already cached
- **Steps**:
  1. Perform a search (cache miss)
  2. Perform the same search again (cache hit)
  3. Compare total response times
- **Expected Result**: Cache hit avoids the ~200ms Gemini API call. The cache lookup is a Map.get() in memory (O(1)). The total search response time difference between cache miss and hit should be ~200ms or more.
- **Failure Means**: Cache is not being used, or Map operations are unexpectedly slow.
- **Priority**: P1
- **Layer**: [Unit]

#### SS-51: Embedding sync does not add latency to listing API responses
- **ID**: SS-51
- **Title**: POST /api/listings response time is unaffected by embedding sync
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`
- **Steps**:
  1. Measure POST /api/listings response time with `ENABLE_SEMANTIC_SEARCH=true`
  2. Measure POST /api/listings response time with `ENABLE_SEMANTIC_SEARCH=false`
- **Expected Result**: Response times are similar (within ~50ms). The embedding sync is fire-and-forget (`.catch()` pattern at route.ts:372), so the HTTP response is sent before embedding generation completes.
- **Failure Means**: `syncListingEmbedding` is being awaited instead of fire-and-forget.
- **Priority**: P0
- **Layer**: [API/Integration]

#### SS-52: Gemini retry backoff follows exponential pattern
- **ID**: SS-52
- **Title**: Retry delays are 1s, 2s, 4s with jitter (capped at 16s)
- **Preconditions**: Gemini API returns retryable error (e.g., 500 or 429)
- **Steps**:
  1. Trigger embedding generation where Gemini returns 500 repeatedly
  2. Observe retry timing
- **Expected Result**: Retries follow pattern: attempt 0 (immediate), attempt 1 (~1s + jitter), attempt 2 (~2s + jitter), attempt 3 (~4s + jitter). Formula: `min(1000 * 2^attempt + random*500, 16000)` (gemini.ts:52-54). Maximum total wait: ~7.5s + jitter for 3 retries.
- **Failure Means**: Retry timing is incorrect, causing either too-aggressive retries or excessive delays.
- **Priority**: P2
- **Layer**: [Unit]

#### SS-53: Cache memory stays bounded at ~600KB
- **ID**: SS-53
- **Title**: Query cache with 100 entries uses approximately 600KB
- **Preconditions**: Cache at capacity
- **Steps**:
  1. Fill cache to MAX_ENTRIES=100
  2. Observe memory usage
- **Expected Result**: Each entry stores a 768-float array (~6KB per entry per query-cache.ts:8). Total cache memory is approximately 100 * 6KB = 600KB. LRU eviction prevents unbounded growth.
- **Failure Means**: Cache entries are not being evicted, causing memory leak.
- **Priority**: P2
- **Layer**: [Unit]

#### SS-54: Overall search response with timeout wrapper
- **ID**: SS-54
- **Title**: Promise.allSettled with timeout wrapper prevents indefinite hangs
- **Preconditions**: Semantic search active
- **Steps**:
  1. Perform a search where the semantic list query hangs
- **Expected Result**: `withTimeout(listPromise, DEFAULT_TIMEOUTS.DATABASE, "search-list-query")` (search-v2-service.ts:254) kills the promise after the database timeout. `Promise.allSettled` captures the rejection. The error handler returns `{ error: "Search temporarily unavailable" }` (search-v2-service.ts:272-276).
- **Failure Means**: Timeout wrapper is not working, causing the search endpoint to hang indefinitely.
- **Priority**: P0
- **Layer**: [API/Integration]

---

### Category 9: Additional Scenarios

#### SS-55: Search degrades gracefully when GEMINI_API_KEY is missing but flag ON
- **ID**: SS-55
- **Title**: Search degrades gracefully when GEMINI_API_KEY is missing but ENABLE_SEMANTIC_SEARCH=true
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, `GEMINI_API_KEY` not set
- **Steps**:
  1. Search with a text query and sort=recommended
- **Expected Result**: Search returns FTS results (fallback). No error visible to user. Startup warning logged.
- **Failure Means**: Missing API key causes user-visible errors instead of graceful fallback.
- **Priority**: P1
- **Layer**: [E2E/Playwright]

#### SS-56: Show on map button no-op on similar listings
- **ID**: SS-56
- **Title**: Show on map button on similar listing cards is visually present but functionally inert
- **Preconditions**: Listing detail page with similar listings visible
- **Steps**:
  1. Click the MapPin button on a similar listing card
- **Expected Result**: Button is visible (MapPin icon). Clicking it has no visible effect — no map highlight, no scroll, no navigation. This is by design: the detail page has no ListingFocusProvider.
- **Failure Means**: Button triggers unexpected behavior or errors outside the search context.
- **Priority**: P2
- **Layer**: [E2E/Playwright]

#### SS-57: FavoriteButton on similar listing cards
- **ID**: SS-57
- **Title**: FavoriteButton on similar listing cards renders in unsaved state
- **Preconditions**: Listing detail page with similar listings visible
- **Steps**:
  1. Observe FavoriteButton on each similar listing card
- **Expected Result**: All heart icons render in the unsaved state (outline, not filled) because `initialIsSaved` is not passed. Clicking the button when authenticated calls `/api/favorites` and toggles state.
- **Failure Means**: Favorite state is incorrect or button fails on detail page.
- **Priority**: P2
- **Layer**: [E2E/Playwright]

#### SS-58: SearchResultsClient cursor reset on param change
- **ID**: SS-58
- **Title**: Changing search parameters after semantic search resets accumulated results
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`, user has performed a semantic search with results
- **Steps**:
  1. Search with query "cozy room" + sort=recommended.
  2. Click "Load more" to accumulate >12 results.
  3. Change a filter (e.g., add price range).
- **Expected Result**: SearchResultsClient remounts (keyed by searchParamsString), all accumulated listings reset, pagination cursor resets to null, results reload fresh from page 1.
- **Failure Means**: Stale semantic cursor leaks into a new FTS query, causing wrong results or errors.
- **Priority**: P0
- **Layer**: [E2E/Playwright]

#### SS-59: Concurrent cache race (documented behavior)
- **ID**: SS-59
- **Title**: Concurrent identical queries may cause duplicate Gemini calls (known, non-critical)
- **Preconditions**: Two identical search queries arrive simultaneously
- **Expected Result**: Both may miss cache, both call Gemini. Second result overwrites first harmlessly. No data corruption. At worst, one wasted API call.
- **Priority**: P2
- **Layer**: [Unit]

#### SS-60: XSS/injection in search query
- **ID**: SS-60
- **Title**: Search query with HTML/script tags is sanitized before embedding
- **Preconditions**: `ENABLE_SEMANTIC_SEARCH=true`
- **Steps**:
  1. Search with query `<script>alert(1)</script> cozy room`
- **Expected Result**: Query passes through `sanitizeSearchQuery()` which escapes special chars. Embedding is generated from sanitized text. No script execution in search results.
- **Priority**: P2
- **Layer**: [E2E/Playwright]

#### SS-61: Mobile vs desktop similar listings layout
- **ID**: SS-61
- **Title**: Similar listings section is responsive (1 column mobile, 2 columns desktop)
- **Preconditions**: Listing with similar listings visible
- **Steps**:
  1. View at mobile viewport (<640px) — cards in single column.
  2. View at desktop viewport (>=640px) — cards in 2-column grid.
- **Expected Result**: `grid-cols-1 sm:grid-cols-2` layout responds to viewport width. Section heading "Similar listings" visible at all sizes.
- **Priority**: P2
- **Layer**: [E2E/Playwright]
