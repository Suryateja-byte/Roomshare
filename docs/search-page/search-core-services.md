# Search Core Services & Business Logic

Technical documentation for the Roomshare search system's server-side services, query engine, pagination, and supporting utilities.

**Directory**: `src/lib/search/`

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Data Flow](#data-flow)
- [types.ts -- Shared Types & Constants](#typests)
- [search-v2-service.ts -- Core Search Executor](#search-v2-servicets)
- [search-orchestrator.ts -- v2/v1 Fallback](#search-orchestratorts)
- [search-doc-queries.ts -- Database Query Layer](#search-doc-queriests)
- [cursor.ts -- Keyset Cursor Pagination](#cursorts)
- [hash.ts -- Query Hash & Legacy Cursors](#hashts)
- [transform.ts -- Response Transformers](#transformts)
- [search-doc-dirty.ts -- Denormalization Sync](#search-doc-dirtyts)
- [natural-language-parser.ts -- NL Query Extraction](#natural-language-parserts)
- [split-stay.ts -- Split Stay Pairing](#split-stayts)
- [Feature Flags](#feature-flags)
- [Performance Considerations](#performance-considerations)
- [Error Handling Patterns](#error-handling-patterns)

---

## Architecture Overview

The search system is built around a **denormalized `listing_search_docs` table** that eliminates JOINs at query time. The primary entry point is `executeSearchV2()`, which runs list and map queries in parallel, transforms results into a unified response, and supports both offset-based and keyset cursor pagination.

```
                        page.tsx (SSR)
                             |
                     orchestrateSearch()
                       /           \
              executeSearchV2()     getListingsPaginated() [v1 fallback]
                /          \
     listPromise        mapPromise        (parallel)
         |                   |
  SearchDoc queries    SearchDoc map query
         |                   |
  listing_search_docs  listing_search_docs
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Denormalized `listing_search_docs` table | No JOINs needed; precomputed scores, lat/lng, FTS vectors |
| Parallel list + map queries | Reduces TTFB by running independent DB queries concurrently |
| Hybrid count (cap at 100) | Avoids expensive `COUNT(*)` for large result sets |
| Keyset pagination | Prevents result drift (duplicates/gaps) when data changes between pages |
| Bounds quantization (~100m) | Improves cache hit rate for nearby viewport positions |
| 5-second statement timeout | Prevents runaway queries from blocking the connection pool |
| `limit+1` pattern | Determines `hasNextPage` without a separate COUNT query |

---

## Data Flow

```
URL params
  --> parseSearchParams()                    [src/lib/search-params.ts]
  --> clampBoundsToMaxSpan()                 [validation]
  --> isSearchDocEnabled() / feature flags
  --> decodeCursorAny() / decodeCursor()     [pagination cursor]
  --> buildSearchDocWhereConditions()         [SQL WHERE builder]
  --> buildOrderByClause()                   [SQL ORDER BY with FTS ranking]
  --> queryWithTimeout()                     [5s timeout wrapper]
  --> Near-match expansion (if low results)
  --> transformToListItems() + transformToMapResponse()
  --> generateQueryHash()                    [cache key]
  --> Ranking / pin tiering (if enabled)
  --> SearchV2Response assembled
```

---

## types.ts

**Path**: `src/lib/search/types.ts`
**Purpose**: Shared types and constants for the v2 search API response format.

### Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `CLUSTER_THRESHOLD` | `50` | Below this, return individual pins; at or above, use GeoJSON clustering |
| `BOUNDS_EPSILON` | `0.001` | ~100m quantization for cache key normalization |

### Key Types

```typescript
type SearchV2Mode = "geojson" | "pins";

interface SearchV2Response {
  meta: SearchV2Meta;      // queryHash, generatedAt, mode, debug info
  list: SearchV2List;      // items[], nextCursor, total
  map: SearchV2Map;        // geojson (always), pins (when sparse)
}

interface SearchV2ListItem {
  id: string;
  title: string;
  price: number | null;
  image: string | null;
  lat: number;
  lng: number;
  badges?: string[];       // "near-match", "multi-room"
  scoreHint?: number | null;
}

interface SearchV2Pin {
  id: string;
  lat: number;
  lng: number;
  price?: number | null;
  tier?: "primary" | "mini";
  stackCount?: number;     // >1 when listings overlap at same coordinate
}
```

The `SearchV2Meta.total` field is `number | null` -- it is `null` when the result count exceeds the hybrid count threshold (100), avoiding expensive full COUNT queries.

---

## search-v2-service.ts

**Path**: `src/lib/search/search-v2-service.ts`
**Purpose**: Core search execution logic. Extracted from the API route handler so `page.tsx` can call it directly during SSR (avoids HTTP self-call overhead).

### Exported Interface

```typescript
interface SearchV2Params {
  rawParams: Record<string, string | string[] | undefined>;
  limit?: number;
}

interface SearchV2Result {
  response: SearchV2Response | null;
  paginatedResult: PaginatedResultHybrid<ListingData> | null;
  error?: string;
  unboundedSearch?: boolean;  // true when text query has no geo bounds
}

function executeSearchV2(params: SearchV2Params): Promise<SearchV2Result>
```

### Algorithm

1. **Parse & validate** URL params via `parseSearchParams()`
2. **Clamp bounds** if lat/lng span exceeds `MAX_LAT_SPAN` / `MAX_LNG_SPAN` (prevents expensive wide-area queries)
3. **Block unbounded searches**: text query with no geographic bounds returns `{ unboundedSearch: true }` immediately
4. **Resolve feature flags**: `isSearchDocEnabled()` and `features.searchKeyset`
5. **Decode cursor**: `decodeCursorAny()` handles both keyset and legacy `{p: N}` formats
6. **Execute queries in parallel** (`Promise.all`):
   - **List query**: keyset path (`getSearchDocListingsWithKeyset` / `getSearchDocListingsFirstPage`) or offset path (`getSearchDocListingsPaginated` / legacy `getListingsPaginated`)
   - **Map query**: `getSearchDocMapListings` or legacy `getMapListings`
7. **Determine mode**: `"pins"` if map count < 50, else `"geojson"`
8. **Generate query hash**: SHA256 of normalized filter params (excludes pagination)
9. **Compute ranking** (if enabled): builds score map for pin tiering
10. **Transform** results to v2 response shape
11. **Return** response + raw `paginatedResult` (needed by `ListingCard` which requires full `ListingData`)

### Error Handling

Catches all errors at the top level, logs without PII, returns `{ response: null, error: "Failed to fetch search results" }`.

---

## search-orchestrator.ts

**Path**: `src/lib/search/search-orchestrator.ts`
**Purpose**: v2-to-v1 fallback orchestration, extracted from `page.tsx` for testability.

### Exported Interface

```typescript
interface SearchOrchestrationResult {
  paginatedResult: PaginatedResultHybrid<ListingData>;
  v2MapData: V2MapData | null;
  fetchError: string | null;
  usedV1Fallback: boolean;
}

function orchestrateSearch(
  rawParams: Record<string, string>,
  filterParams: FilterParams,
  requestedPage: number,
  limit: number,
  useV2: boolean,
): Promise<SearchOrchestrationResult>
```

### Fallback Flow

```
useV2=true?
  ├── Yes: executeSearchV2()
  │     ├── Success: extract v2MapData + paginatedResult
  │     └── Fail: set fetchError, fall through to v1
  └── No: skip to v1

No paginatedResult yet?
  └── getListingsPaginated() [v1]
        ├── Success: return result (usedV1Fallback=true if v2 was attempted)
        └── Fail: return empty result { items: [], total: 0 } + error message
```

The empty fallback ensures the page always renders gracefully, even on total failure.

---

## search-doc-queries.ts

**Path**: `src/lib/search/search-doc-queries.ts`
**Purpose**: All SQL queries against the denormalized `listing_search_docs` table. This is the largest and most performance-critical file in the search system.

### Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `SEARCH_QUERY_TIMEOUT_MS` | `5000` | Statement timeout per query |
| `MAX_MAP_MARKERS` | `200` | Max results for map marker query |
| `HYBRID_COUNT_THRESHOLD` | `100` | Above this, total is reported as `null` |
| `MAX_UNBOUNDED_RESULTS` | `48` | Cap for browse-all (no query, no bounds) |

### Exported Functions

| Function | Description |
|----------|-------------|
| `isSearchDocEnabled(urlParam?)` | Check feature flag + URL override |
| `getSearchDocListingsPaginated(params)` | Offset-based paginated list query (cached 60s) |
| `getSearchDocListingsWithKeyset(params, cursor)` | Keyset cursor paginated list query |
| `getSearchDocListingsFirstPage(params)` | First page with keyset cursor for next page |
| `getSearchDocMapListings(params)` | Map markers query (cached 60s, max 200) |
| `getSearchDocLimitedCount(params)` | Hybrid count (exact if <=100, else null; cached 60s) |

### Query Architecture

#### `queryWithTimeout<T>(query, params)`

Wraps every raw query in a Prisma transaction with `SET LOCAL statement_timeout`. The timeout only applies to that transaction, preventing runaway queries without affecting the connection pool.

```typescript
async function queryWithTimeout<T>(query: string, params: unknown[]): Promise<T[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '5000'`);
    return tx.$queryRawUnsafe<T[]>(query, ...params);
  });
}
```

#### `buildSearchDocWhereConditions(filterParams)`

Builds parameterized SQL WHERE clauses from filter params. Returns `{ conditions[], params[], paramIndex, ftsQueryParamIndex }`.

**Filters supported**:

| Filter | SQL Approach | Index Used |
|--------|-------------|------------|
| Geographic bounds | `ST_MakeEnvelope(..., 4326)::geography` with `&&` overlap | GIST on `location_geog` |
| Antimeridian crossing | Split into two envelope checks | GIST |
| Price range | `d.price >= $N` / `d.price <= $N` | B-tree |
| Full-text search | `d.search_tsv @@ plainto_tsquery('english', $N)` | GIN on `search_tsv` |
| Room type | `LOWER(d.room_type) = LOWER($N)` | - |
| Lease duration | `LOWER(d.lease_duration) = LOWER($N)` | - |
| Move-in date | `d.move_in_date IS NULL OR d.move_in_date <= $N` | - |
| Languages | `d.household_languages_lower && $N::text[]` (OR/overlap) | GIN |
| Amenities | `d.amenities_lower @> $N::text[]` (AND/containment) | GIN |
| House rules | `d.house_rules_lower @> $N::text[]` (AND/containment) | GIN |
| Gender preference | `d.gender_preference = $N` (excludes 'any') | - |
| Household gender | `d.household_gender = $N` (excludes 'any') | - |

Base conditions always applied: `available_slots > 0`, `status = 'ACTIVE'`, `lat IS NOT NULL`, `lng IS NOT NULL`.

#### `buildOrderByClause(sort, ftsQueryParamIndex)`

Generates ORDER BY with optional `ts_rank_cd` tie-breaker when FTS is active. The FTS rank uses tsvector weights (A=title, B=city/state, C=description).

| Sort | ORDER BY |
|------|----------|
| `recommended` | `recommended_score DESC, [ts_rank_cd DESC,] listing_created_at DESC, id ASC` |
| `newest` | `listing_created_at DESC, [ts_rank_cd DESC,] id ASC` |
| `price_asc` | `price ASC NULLS LAST, [ts_rank_cd DESC,] listing_created_at DESC, id ASC` |
| `price_desc` | `price DESC NULLS LAST, [ts_rank_cd DESC,] listing_created_at DESC, id ASC` |
| `rating` | `avg_rating DESC NULLS LAST, review_count DESC, [ts_rank_cd DESC,] listing_created_at DESC, id ASC` |

Every ORDER BY ends with `id ASC` as a deterministic tie-breaker.

#### `buildKeysetWhereClause(cursor, sort, startParamIndex)`

Builds the keyset pagination WHERE clause using **explicit OR-chain logic** (not PostgreSQL tuple comparison, which only works for uniform ASC/ASC sort directions).

For `recommended` sort, the clause is:

```sql
(
  (d.recommended_score < $N::float8)
  OR (d.recommended_score = $N::float8 AND d.listing_created_at < $M::timestamptz)
  OR (d.recommended_score = $N::float8 AND d.listing_created_at = $M::timestamptz AND d.id > $P)
)
```

For sorts with NULLS LAST (`price_asc`, `price_desc`, `rating`), NULL cursor values are handled separately to avoid `d.price = NULL` always being false in SQL.

#### Hybrid Count Strategy

`getSearchDocLimitedCount()` uses a subquery with `LIMIT 101`:

```sql
SELECT COUNT(*) FROM (
  SELECT d.id FROM listing_search_docs d WHERE ... LIMIT 101
) subq
```

- If count <= 100: return exact count (enables page numbers in UI)
- If count > 100: return `null` (UI shows "Load more" without total)
- No query + no bounds: returns `null` immediately (prevents full-table scan)

#### Near-Match Expansion

When results on page 1 are below `LOW_RESULTS_THRESHOLD` and `nearMatches` is enabled:

1. `expandFiltersForNearMatches(params)` loosens one filter dimension (e.g., price range)
2. Runs a second query with expanded filters
3. Deduplicates against exact matches by ID
4. Tags results with `isNearMatch: true`
5. Merges: exact matches first, then near matches

Recursion is prevented by setting `nearMatches: false` on the expanded query.

### Caching

All three main query functions use `unstable_cache` from Next.js with **60-second TTL**:

| Cache Key Prefix | Function |
|------------------|----------|
| `searchdoc-listings-paginated` | `getSearchDocListingsPaginated` |
| `searchdoc-map-listings` | `getSearchDocMapListings` |
| `searchdoc-limited-count` | `getSearchDocLimitedCount` |

Cache keys are generated from normalized filter params (sorted arrays, lowercased strings, fixed-precision bounds). The count cache key intentionally **excludes page and limit** for cross-page reuse.

---

## cursor.ts

**Path**: `src/lib/search/cursor.ts`
**Purpose**: Keyset cursor encoding/decoding for stable pagination. Browser-compatible (no Node `Buffer` dependency).

### Cursor Format

```typescript
interface KeysetCursor {
  v: 1;                    // Version for future format changes
  s: SortOption;           // Sort to validate cursor matches current query
  k: (string | null)[];    // Key values in ORDER BY column order (strings for float precision)
  id: string;              // Tie-breaker listing ID (CUID)
}
```

Encoded as JSON, then base64url. Float/decimal values stored as **strings** to preserve exact DB representation across JSON roundtrips.

### Expected Key Counts Per Sort

| Sort | Keys | Columns |
|------|------|---------|
| `recommended` | 2 | `recommended_score`, `listing_created_at` |
| `newest` | 1 | `listing_created_at` |
| `price_asc` / `price_desc` | 2 | `price`, `listing_created_at` |
| `rating` | 3 | `avg_rating`, `review_count`, `listing_created_at` |

### Exported Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `encodeKeysetCursor` | `(cursor: KeysetCursor) => string` | JSON + base64url encode |
| `decodeKeysetCursor` | `(str: string, expectedSort?) => KeysetCursor \| null` | Decode + Zod validate + key count check |
| `buildCursorFromRow` | `(row: CursorRowData, sort: SortOption) => KeysetCursor` | Build cursor from last query row |
| `decodeCursorAny` | `(str: string, expectedSort: SortOption) => {type, ...} \| null` | Detect keyset vs legacy format |
| `decodeLegacyCursor` | `(str: string) => number \| null` | Decode legacy `{p: N}` cursor |
| `encodeStack` | `(cursors: string[]) => string` | Encode cursor array for back-navigation |
| `decodeStack` | `(encoded: string) => string[]` | Decode cursor array |

### Validation

Uses Zod for strict schema validation:

```typescript
const KeysetCursorSchema = z.object({
  v: z.literal(1),
  s: z.enum(["recommended", "newest", "price_asc", "price_desc", "rating"]),
  k: z.array(z.union([z.string(), z.null()])),
  id: z.string().min(1),
}).strict();
```

Invalid or mismatched cursors return `null` (graceful fallback to page 1).

---

## hash.ts

**Path**: `src/lib/search/hash.ts`
**Purpose**: Query hash generation for cache keys, legacy cursor encoding, and re-exports from `cursor.ts`.

### Exported Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `generateQueryHash` | `(params: HashableFilterParams) => string` | 16-char SHA256 hash of normalized filter params |
| `encodeCursor` | `(page: number) => string` | Legacy offset cursor (base64url of `{p: N}`) |
| `decodeCursor` | `(cursor: string) => number \| null` | Legacy offset cursor decode |

Also re-exports all keyset cursor utilities from `cursor.ts` for backward compatibility.

### Query Hash Algorithm

1. Normalize all params: lowercase strings, sorted arrays, quantized bounds
2. Bounds quantized with `BOUNDS_EPSILON` (0.001 degrees, ~100m) for cache stability
3. SHA256 hash of JSON-serialized normalized params
4. Truncated to first 16 hex characters

```typescript
function quantizeBound(value: number): number {
  return Math.round(value / BOUNDS_EPSILON) * BOUNDS_EPSILON;
}
```

Pagination params (page, limit, cursor) are **excluded** so the hash can be reused across pages.

---

## transform.ts

**Path**: `src/lib/search/transform.ts`
**Purpose**: Transforms database results into v2 API response shapes (list items, GeoJSON, tiered pins).

### Exported Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `determineMode` | `(count: number) => SearchV2Mode` | `"pins"` if < 50, else `"geojson"` |
| `shouldIncludePins` | `(count: number) => boolean` | `true` if < 50 |
| `transformToListItem` | `(listing: ListingData) => SearchV2ListItem` | Single item transform with badge logic |
| `transformToListItems` | `(listings: ListingData[]) => SearchV2ListItem[]` | Batch transform |
| `transformToGeoJSON` | `(listings: MapListingData[]) => SearchV2GeoJSON` | GeoJSON FeatureCollection for Mapbox clustering |
| `transformToPins` | `(listings: MapListingData[], scoreMap?) => SearchV2Pin[]` | Tiered pins with grouping + ranking |
| `transformToMapResponse` | `(listings: MapListingData[], scoreMap?) => { geojson, pins? }` | Combined: always geojson, pins only when sparse |

### Badge Logic

```typescript
// Badges added to list items:
if (listing.isNearMatch)    badges.push("near-match");
if (listing.totalSlots > 1) badges.push("multi-room");
```

### Pin Tiering

When result count < `CLUSTER_THRESHOLD` (50):

1. Adapt listings to `MapMarkerListing` interface
2. Group by coordinate (handles stacked listings at same address)
3. Build rank map from score map (ranking-based) or position (fallback)
4. Compute tiered groups: `"primary"` for top-N, `"mini"` for rest
5. Primary limit defaults to 40, configurable via `NEXT_PUBLIC_PRIMARY_PINS` (clamped 10-120)

---

## search-doc-dirty.ts

**Path**: `src/lib/search/search-doc-dirty.ts`
**Purpose**: Marks listings as "dirty" for async denormalization refresh via cron. **NOW FULLY OPERATIONAL** - wired into production code as of recent updates.

### Exported Functions

```typescript
type DirtyReason =
  | "listing_created"
  | "listing_updated"
  | "status_changed"
  | "view_count"
  | "review_changed";

function markListingDirty(listingId: string, reason: DirtyReason): Promise<void>
function markListingsDirty(listingIds: string[], reason: DirtyReason): Promise<void>
```

### Design

- Uses `INSERT ... ON CONFLICT (listing_id) DO UPDATE` for idempotency
- **Fire-and-forget**: errors are logged but never propagated (mutations must not fail due to dirty flag writes)
- Batch version uses `unnest($1::text[])` for efficient multi-row insert
- Truncated listing IDs in logs (`slice(0, 8) + "..."`) to avoid PII exposure
- Next cron run picks up dirty flags and refreshes the `listing_search_docs` rows

### Production Integration (WIRED)

**Status**: ✅ **FULLY OPERATIONAL** - The dirty flag system is now connected to production code.

The following mutation points now call `markListingDirty()` with fire-and-forget pattern (`.catch(() => {})`):

| Integration Point | File | Reason | Pattern |
|------------------|------|--------|---------|
| Listing creation (API) | `src/app/api/listings/route.ts` | `listing_created` | `markListingDirty(result.id, 'listing_created').catch(() => {})` |
| Listing update (API) | `src/app/api/listings/[id]/route.ts` | `listing_updated` | `markListingDirty(id, 'listing_updated').catch(() => {})` |
| Listing creation (action) | `src/app/actions/create-listing.ts` | `listing_created` | `markListingDirty(listing.id, 'listing_created').catch(() => {})` |
| Status changes | `src/app/actions/listing-status.ts` | `status_changed` | `markListingDirty(listingId, 'status_changed').catch(() => {})` |
| View count increments | `src/app/actions/listing-status.ts` | `view_count` | `markListingDirty(listingId, 'view_count').catch(() => {})` |
| Admin status changes | `src/app/actions/admin.ts` | `status_changed` | `markListingDirty(listingId, 'status_changed').catch(() => {})` |
| Review creation | `src/app/api/reviews/route.ts` | `review_changed` | `markListingDirty(listingId, 'review_changed').catch(() => {})` |
| Review updates | `src/app/api/reviews/route.ts` | `review_changed` | `markListingDirty(existingReview.listingId, 'review_changed').catch(() => {})` |
| Review deletion | `src/app/api/reviews/route.ts` | `review_changed` | `markListingDirty(existingReview.listingId, 'review_changed').catch(() => {})` |

**Integration Pattern**: All calls use the fire-and-forget pattern with `.catch(() => {})` to ensure parent mutations never fail due to dirty flag write failures. The function already logs errors internally via `console.error()` with truncated listing IDs for PII protection.

### Complete Workflow

```
1. User updates listing
   ↓
2. API route/action performs mutation
   ↓
3. markListingDirty(id, reason).catch(() => {})  [fire-and-forget]
   ↓
4. INSERT ON CONFLICT updates listing_search_doc_dirty table
   ↓
5. Cron job (api/cron/refresh-search-docs) picks up dirty rows
   ↓
6. Denormalized listing_search_docs row refreshed
   ↓
7. Next search query sees updated data (after 60s cache expiry)
```

---

## natural-language-parser.ts

**Path**: `src/lib/search/natural-language-parser.ts`
**Purpose**: Extracts structured filter params from natural language search queries using regex pattern matching (no LLM).

### Exported Functions

```typescript
interface ParsedNLQuery {
  location: string;
  minPrice?: string;
  maxPrice?: string;
  roomType?: string;
  amenities: string[];
  houseRules: string[];
  leaseDuration?: string;
}

function parseNaturalLanguageQuery(input: string): ParsedNLQuery | null
function nlQueryToSearchParams(parsed: ParsedNLQuery): URLSearchParams
```

### Pattern Categories

| Category | Examples | Output |
|----------|----------|--------|
| Price | "under $1000", "$800-$1200", "between $800 and $1200" | `minPrice`, `maxPrice` |
| Room type | "private room", "entire place", "studio" | `roomType` |
| Amenities | "furnished", "wifi", "parking", "pool" | `amenities[]` |
| House rules | "pet friendly", "smoking ok", "couples allowed" | `houseRules[]` |
| Lease duration | "month-to-month", "6 month", "yearly" | `leaseDuration` |

### Location Extraction

After extracting all structured data, the parser strips all recognized patterns from the input. The remaining text is treated as the location query. Returns `null` if no structured data was extracted (plain location search).

```
"furnished room under $1000 in Austin"
  --> { location: "Austin", maxPrice: "1000", amenities: ["Furnished"] }
```

---

## split-stay.ts

**Path**: `src/lib/search/split-stay.ts`
**Purpose**: Finds complementary listing pairs for long stays (6+ months).

### Exported Functions

```typescript
interface SplitStayPair {
  first: ListingData;
  second: ListingData;
  combinedPrice: number;  // Total for full stay
  splitLabel: string;     // e.g., "3 mo + 3 mo"
}

function findSplitStays(listings: ListingData[], stayMonths?: number): SplitStayPair[]
```

### Algorithm

1. Returns empty if `stayMonths < 6` or fewer than 2 listings
2. Filters to listings with `price > 0`, sorts by price ascending
3. Pairs cheapest with most expensive (budget + premium pairing)
4. Returns up to 2 pairs
5. Combined price: `first.price * halfMonths + second.price * remainderMonths`

This is a V1 implementation. The comment notes it requires date-aware availability data not yet in the schema for proper coverage validation.

---

## Feature Flags

| Flag | Env Variable | URL Override | Effect |
|------|-------------|-------------|--------|
| SearchDoc | `ENABLE_SEARCH_DOC=true` | `?searchDoc=1` | Use denormalized table vs legacy JOINs |
| Keyset pagination | `ENABLE_SEARCH_KEYSET=true` (via `features.searchKeyset`) | - | Keyset cursors vs offset pagination |
| Debug ranking | `features.searchDebugRanking` | `?debugRank=1` | Expose ranking signals in response meta |
| Ranker | `features` config | `?ranker=1` | Enable score-based pin tiering |

---

## Performance Considerations

### Query Optimization

- **Denormalized table**: All search fields in `listing_search_docs` -- no JOINs at query time
- **PostGIS geography**: GIST-indexed `location_geog` column for spatial queries
- **GIN indexes**: Array containment (`@>`) and overlap (`&&`) for amenities, rules, languages
- **FTS with tsvector**: Pre-computed `search_tsv` column with weighted zones (A=title, B=city, C=description)
- **Hybrid count**: Caps at `LIMIT 101` subquery instead of full `COUNT(*)`
- **limit+1 pattern**: Avoids separate count query to determine `hasNextPage`
- **5s statement timeout**: Prevents any single query from monopolizing a connection

### Caching

- **Next.js `unstable_cache`**: 60s TTL for list, map, and count queries
- **Normalized cache keys**: Sorted arrays, lowercased strings, fixed-precision bounds
- **Bounds quantization**: ~100m tolerance prevents cache thrashing on small map pans
- **Query hash excludes pagination**: Same hash across pages enables client-side cache validation
- **Count cache excludes page/limit**: Single count entry shared across all pages

### Pagination Performance

| Strategy | Pros | Cons |
|----------|------|------|
| Offset (legacy) | Simple, supports page numbers | Result drift on data changes, OFFSET N is O(N) |
| Keyset cursor | Stable results, O(1) seek | Forward-only (stack needed for back), no page numbers |

The system supports both simultaneously during migration, with `decodeCursorAny()` detecting the format.

### Resource Protection

- **Unbounded search blocked**: Text query without bounds returns early (`unboundedSearch: true`)
- **Bounds clamped**: Oversized viewport spans silently reduced to `MAX_LAT_SPAN` / `MAX_LNG_SPAN`
- **Unbounded browse capped**: No-query no-bounds limited to 48 results (4 pages of 12)
- **Page offset capped**: For unbounded browse, prevents `?page=1000` DOS via high OFFSET
- **Map markers capped**: Max 200 results regardless of query

---

## Error Handling Patterns

| Layer | Pattern | Detail |
|-------|---------|--------|
| `executeSearchV2` | Top-level try/catch | Logs via `logger.sync.error` without PII; returns `{ response: null, error }` |
| `orchestrateSearch` | Fallback chain | v2 failure falls back to v1; v1 failure returns empty result |
| `search-doc-queries` | `wrapDatabaseError` | Wraps Prisma errors with operation context, calls `.log()` with safe metadata |
| `markListingDirty` | Fire-and-forget | Catches and logs errors; never propagates to calling mutation |
| Cursor decoding | Null returns | Invalid/malformed cursors return `null`; callers fall back to page 1 |
| `queryWithTimeout` | Transaction timeout | `SET LOCAL statement_timeout` prevents runaway queries |

All error logging follows the project rule of **no raw PII in logs** -- only operation names, boolean flags, and truncated IDs are logged.
