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
- [ranking/ -- Scoring & Ranking Module](#ranking-module)
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
     listPromise        mapPromise        (parallel via Promise.allSettled)
         |                   |
  SearchDoc queries    SearchDoc map query
         |                   |
  listing_search_docs  listing_search_docs
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Denormalized `listing_search_docs` table | No JOINs needed; precomputed scores, lat/lng, FTS vectors |
| Parallel list + map queries via `Promise.allSettled` | Reduces TTFB by running independent DB queries concurrently with partial failure tolerance |
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

Constants are re-exported from the canonical source `@/lib/constants`:

| Constant | Value | Purpose |
|----------|-------|---------|
| `CLUSTER_THRESHOLD` | `50` | Below this, return individual pins; at or above, use GeoJSON clustering |
| `BOUNDS_EPSILON` | `0.001` | ~100m quantization for cache key normalization |

```typescript
export { CLUSTER_THRESHOLD, BOUNDS_EPSILON } from "@/lib/constants";
```

### Key Types

```typescript
/** Mode determines whether pins array is included (always have geojson) */
type SearchV2Mode = "geojson" | "pins";

/** Properties for GeoJSON point features */
interface SearchV2FeatureProperties {
  id: string;
  title: string;
  price: number | null;
  image: string | null;
  availableSlots: number;
  ownerId: string;
}

/** A single point feature for the map */
type SearchV2Feature = Feature<Point, SearchV2FeatureProperties>;

/** GeoJSON FeatureCollection for Mapbox clustering */
type SearchV2GeoJSON = FeatureCollection<Point, SearchV2FeatureProperties>;

/** List item in v2 response */
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

/** Pin with tier information for sparse results */
interface SearchV2Pin {
  id: string;
  lat: number;
  lng: number;
  price?: number | null;
  tier?: "primary" | "mini";
  stackCount?: number;     // >1 when listings overlap at same coordinate
}

/** Debug signals for ranking (only in debug mode, no PII) */
interface SearchV2DebugSignals {
  id: string;
  quality: number;
  rating: number;
  price: number;
  recency: number;
  geo: number;
  total: number;
}

/** Metadata about the search response */
interface SearchV2Meta {
  queryHash: string;           // 16-char SHA256 hash
  generatedAt: string;         // ISO timestamp
  mode: SearchV2Mode;          // 'geojson' if >= 50, 'pins' if < 50
  rankingVersion?: string;     // debug only
  rankingEnabled?: boolean;    // debug only
  topSignals?: SearchV2DebugSignals[]; // debug only, capped at 5
}

/** List section of the response */
interface SearchV2List {
  items: SearchV2ListItem[];
  nextCursor: string | null;   // Base64url encoded cursor for next page
  total?: number | null;       // Exact if <=100, null if >100 (hybrid count)
}

/** Map section of the response */
interface SearchV2Map {
  geojson: SearchV2GeoJSON;    // ALWAYS present
  pins?: SearchV2Pin[];        // ONLY when mode='pins' (sparse, <50 mapListings)
}

/** Complete v2 search response */
interface SearchV2Response {
  meta: SearchV2Meta;
  list: SearchV2List;
  map: SearchV2Map;
}
```

---

## search-v2-service.ts

**Path**: `src/lib/search/search-v2-service.ts`
**Purpose**: Core search execution logic. Extracted from the API route handler so `page.tsx` can call it directly during SSR (avoids HTTP self-call overhead).

### Exported Interface

```typescript
interface SearchV2Params {
  /** Raw search params from URL (will be parsed internally) */
  rawParams: Record<string, string | string[] | undefined>;
  /** Items per page (optional, defaults to service's internal default) */
  limit?: number;
}

interface SearchV2Result {
  /** Full v2 response on success */
  response: SearchV2Response | null;
  /**
   * Raw paginated result with full ListingData for ListingCard rendering.
   * The v2 list.items is a simplified shape, but ListingCard needs full data.
   */
  paginatedResult: PaginatedResultHybrid<ListingData> | null;
  /** Error message if failed */
  error?: string;
  /**
   * True when the search was blocked because it had a text query but no
   * geographic bounds. UI should prompt user to select a location.
   */
  unboundedSearch?: boolean;
}

function executeSearchV2(params: SearchV2Params): Promise<SearchV2Result>
```

### Algorithm

1. **Parse & validate** URL params via `parseSearchParams()`
2. **Clamp bounds** if lat/lng span exceeds `MAX_LAT_SPAN` / `MAX_LNG_SPAN` (prevents expensive wide-area queries)
3. **Block unbounded searches**: text query with no geographic bounds returns `{ unboundedSearch: true }` immediately
4. **Resolve feature flags**: `isSearchDocEnabled()` and `features.searchKeyset`
5. **Decode cursor**: `decodeCursorAny()` handles both keyset and legacy `{p: N}` formats
6. **Execute queries in parallel** (`Promise.allSettled` for partial failure tolerance):
   - **List query**: keyset path (`getSearchDocListingsWithKeyset` / `getSearchDocListingsFirstPage`) or offset path (`getSearchDocListingsPaginated` / legacy `getListingsPaginated`)
   - **Map query**: `getSearchDocMapListings` or legacy `getMapListings`
7. **Handle partial failures**: If list or map query fails, log error and use empty result (graceful degradation)
8. **Determine mode**: `"pins"` if map count < 50, else `"geojson"`
9. **Generate query hash**: SHA256 of normalized filter params (excludes pagination)
10. **Compute ranking** (if enabled): builds score map for pin tiering when `isRankingEnabled()` and in pins mode
11. **Transform** results to v2 response shape
12. **Log latency**: JSON-formatted search_latency event with duration, counts, mode
13. **Return** response + raw `paginatedResult` (needed by `ListingCard` which requires full `ListingData`)

### Partial Failure Handling

```typescript
// Execute both queries concurrently with partial failure tolerance
const [listSettled, mapSettled] = await Promise.allSettled([
  listPromise,
  mapPromise,
]);

// Handle partial failures gracefully
if (listSettled.status === "fulfilled") {
  ({ listResult, nextCursor } = listSettled.value);
} else {
  console.error("[SearchV2] List query failed, returning empty results", {
    error: listSettled.reason instanceof Error ? listSettled.reason.message : "Unknown",
  });
  listResult = { items: [], hasNextPage: false, hasPrevPage: false, total: 0, totalPages: 0, page: 1, limit: 20 };
  nextCursor = null;
}
```

### Error Handling

Catches all errors at the top level, logs via `logger.sync.error` without PII, returns `{ response: null, paginatedResult: null, error: "Failed to fetch search results" }`.

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
  |-- Yes: executeSearchV2()
  |     |-- Success: extract v2MapData + paginatedResult
  |     \-- Fail: set fetchError, fall through to v1
  \-- No: skip to v1

No paginatedResult yet?
  \-- getListingsPaginated() [v1]
        |-- Success: return result (usedV1Fallback=true if v2 was attempted)
        \-- Fail: return empty result { items: [], total: 0 } + error message
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
| `isSearchDocEnabled(urlParam?)` | Check feature flag + URL override (reads directly from `process.env` for test isolation) |
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
    await tx.$executeRawUnsafe(
      `SET LOCAL statement_timeout = '${SEARCH_QUERY_TIMEOUT_MS}'`
    );
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

### Cache Key Generation

Three separate cache key generator functions ensure normalized, stable keys:

| Function | Includes | Excludes |
|----------|----------|----------|
| `createSearchDocListCacheKey` | All filters, page, limit, sort, nearMatches | - |
| `createSearchDocMapCacheKey` | All filters, bounds | page, limit |
| `createSearchDocCountCacheKey` | All filters, bounds, genderPreference, householdGender | page, limit (for cross-page caching) |

### Caching

All three main query functions use `unstable_cache` from Next.js with **60-second TTL**:

| Cache Key Prefix | Function |
|------------------|----------|
| `searchdoc-listings-paginated` | `getSearchDocListingsPaginated` |
| `searchdoc-map-listings` | `getSearchDocMapListings` |
| `searchdoc-limited-count` | `getSearchDocLimitedCount` |

Cache keys are generated from normalized filter params (sorted arrays, lowercased strings, fixed-precision bounds). The count cache key intentionally **excludes page and limit** for cross-page reuse.

### KeysetPaginatedResult Type

```typescript
export interface KeysetPaginatedResult<T> extends PaginatedResultHybrid<T> {
  nextCursor: string | null;
}
```

### Feature Flag Check

```typescript
export function isSearchDocEnabled(urlSearchDoc?: string | null): boolean {
  // URL override for testing (allows ?searchDoc=1 to enable on specific requests)
  if (urlSearchDoc === "1" || urlSearchDoc === "true") {
    return true;
  }
  if (urlSearchDoc === "0" || urlSearchDoc === "false") {
    return false;
  }

  // Read directly from process.env to avoid caching issues in tests
  return process.env.ENABLE_SEARCH_DOC === "true";
}
```

---

## cursor.ts

**Path**: `src/lib/search/cursor.ts`
**Purpose**: Keyset cursor encoding/decoding for stable pagination. **Browser-compatible** (no Node `Buffer` dependency).

### Browser-Compatible Base64url Encoding

```typescript
function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
  const base64 = btoa(binString);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(base64url: string): string {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (base64.length % 4)) % 4;
  base64 += "=".repeat(padLength);
  const binString = atob(base64);
  const bytes = Uint8Array.from(binString, (char) => char.codePointAt(0)!);
  return new TextDecoder().decode(bytes);
}
```

### Key Types

```typescript
type SortOption = "recommended" | "newest" | "price_asc" | "price_desc" | "rating";

const SORT_OPTIONS: readonly SortOption[] = [
  "recommended", "newest", "price_asc", "price_desc", "rating"
] as const;

interface KeysetCursor {
  v: 1;                    // Version for future format changes
  s: SortOption;           // Sort to validate cursor matches current query
  k: (string | null)[];    // Key values in ORDER BY column order (strings for float precision)
  id: string;              // Tie-breaker listing ID (CUID)
}

interface CursorRowData {
  id: string;
  listing_created_at: string;         // ISO date string
  recommended_score?: string | null;  // As string for float precision
  price?: string | null;              // As string for decimal precision
  avg_rating?: string | null;         // As string for float precision
  review_count?: string | null;       // As string (integer)
}
```

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
const KeysetCursorSchema = z
  .object({
    v: z.literal(1),
    s: z.enum(["recommended", "newest", "price_asc", "price_desc", "rating"]),
    k: z.array(z.union([z.string(), z.null()])),
    id: z.string().min(1),
  })
  .strict();
```

Invalid or mismatched cursors return `null` (graceful fallback to page 1).

### Cursor Detection (decodeCursorAny)

```typescript
function decodeCursorAny(
  cursorStr: string,
  expectedSort: SortOption,
):
  | { type: "keyset"; cursor: KeysetCursor }
  | { type: "legacy"; page: number }
  | null {
  // Try keyset first (newer format)
  const keysetCursor = decodeKeysetCursor(cursorStr, expectedSort);
  if (keysetCursor) {
    return { type: "keyset", cursor: keysetCursor };
  }

  // Fall back to legacy format
  const legacyPage = decodeLegacyCursor(cursorStr);
  if (legacyPage !== null) {
    return { type: "legacy", page: legacyPage };
  }

  return null;
}
```

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

```typescript
export {
  encodeKeysetCursor,
  decodeKeysetCursor,
  buildCursorFromRow,
  decodeCursorAny,
  decodeLegacyCursor,
  SORT_OPTIONS,
  type KeysetCursor,
  type SortOption,
  type CursorRowData,
} from "./cursor";
```

### HashableFilterParams Interface

```typescript
interface HashableFilterParams {
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
  houseRules?: string[];
  languages?: string[];
  roomType?: string;
  leaseDuration?: string;
  moveInDate?: string;
  bounds?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  nearMatches?: boolean;
}
```

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

### Legacy Cursor Encoding (Node.js Buffer)

```typescript
function encodeCursor(page: number): string {
  const payload = JSON.stringify({ p: page });
  return Buffer.from(payload).toString("base64url");
}

function decodeCursor(cursor: string): number | null {
  try {
    const payload = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(payload);
    if (typeof parsed?.p === "number" && parsed.p > 0) {
      return parsed.p;
    }
    return null;
  } catch {
    return null;
  }
}
```

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
function transformToListItem(listing: ListingData): SearchV2ListItem {
  const badges: string[] = [];

  // Add near-match badge if applicable
  if (listing.isNearMatch) {
    badges.push("near-match");
  }

  // Add multi-room badge if multiple slots
  if (listing.totalSlots > 1) {
    badges.push("multi-room");
  }

  return {
    id: listing.id,
    title: listing.title,
    price: listing.price,
    image: listing.images[0] ?? null,
    lat: listing.location.lat,
    lng: listing.location.lng,
    badges: badges.length > 0 ? badges : undefined,
  };
}
```

### Pin Tiering

When result count < `CLUSTER_THRESHOLD` (50):

1. Adapt listings to `MapMarkerListing` interface
2. Get primary limit via `getPrimaryPinLimit()` (respects `NEXT_PUBLIC_PRIMARY_PINS` env var)
3. Group by coordinate (handles stacked listings at same address)
4. Build rank map from score map (ranking-based) or position (fallback) via `buildRankMapFromScores()`
5. Compute tiered groups via `computeTieredGroups()`: `"primary"` for top-N, `"mini"` for rest
6. Select best listing per group via `getBestListingInGroup()` (lowest rank = highest score)
7. Primary limit defaults to 40, configurable via `NEXT_PUBLIC_PRIMARY_PINS` (clamped 10-120)

```typescript
function transformToPins(
  listings: MapListingData[],
  scoreMap?: Map<string, number>,
): SearchV2Pin[] {
  if (listings.length === 0) return [];

  const markerListings = listings.map(adaptToMarkerListing);
  const primaryLimit = getPrimaryPinLimit();
  const groups = groupListingsByCoord(markerListings);
  const rankMap = buildRankMapFromScores(markerListings, scoreMap);
  const tieredGroups = computeTieredGroups(groups, rankMap, primaryLimit);

  return tieredGroups.map((group) => {
    const bestListing = getBestListingInGroup(group.listings, rankMap);
    return {
      id: bestListing.id,
      lat: group.lat,
      lng: group.lng,
      price: bestListing.price,
      tier: group.tier,
      stackCount: group.listings.length > 1 ? group.listings.length : undefined,
    };
  });
}
```

---

## search-doc-dirty.ts

**Path**: `src/lib/search/search-doc-dirty.ts`
**Purpose**: Marks listings as "dirty" for async denormalization refresh via cron. **FULLY OPERATIONAL** - wired into production code.

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

**Status**: FULLY OPERATIONAL - The dirty flag system is connected to production code.

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
   |
2. API route/action performs mutation
   |
3. markListingDirty(id, reason).catch(() => {})  [fire-and-forget]
   |
4. INSERT ON CONFLICT updates listing_search_doc_dirty table
   |
5. Cron job (api/cron/refresh-search-docs) picks up dirty rows
   |
6. Denormalized listing_search_docs row refreshed
   |
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
| Price | "under $1000", "$800-$1200", "between $800 and $1200", "over $800", "min $800" | `minPrice`, `maxPrice` |
| Room type | "private room", "entire place", "studio", "shared room" | `roomType` |
| Amenities | "furnished", "wifi", "parking", "pool", "gym", "kitchen", "ac", "washer", "dryer" | `amenities[]` |
| House rules | "pet friendly", "smoking ok", "couples allowed", "guests allowed" | `houseRules[]` |
| Lease duration | "month-to-month", "6 month", "yearly", "flexible", "short-term" | `leaseDuration` |

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

## Ranking Module

**Path**: `src/lib/search/ranking/`
**Purpose**: Score-based ranking for map pin tiering. V1 uses heuristic signals; designed for future ML integration.

### Module Structure

| File | Purpose |
|------|---------|
| `index.ts` | Module entry point, exports, `isRankingEnabled()` |
| `types.ts` | Type definitions for ranking system |
| `score.ts` | Individual signal normalization functions |
| `rank.ts` | Score map building and ranking functions |

### Version

```typescript
export const RANKING_VERSION = "v1-heuristic";
```

### Feature Flag Check

```typescript
export function isRankingEnabled(urlRanker?: string | null): boolean {
  // URL override only allowed when debug mode is permitted
  if (features.searchDebugRanking) {
    if (urlRanker === "1" || urlRanker === "true") return true;
    if (urlRanker === "0" || urlRanker === "false") return false;
  }
  return features.searchRanking;
}
```

### Key Types

```typescript
interface RankingContext {
  sort: string;
  center?: { lat: number; lng: number };
  localMedianPrice?: number;
  debug?: boolean;
}

interface RankingWeights {
  quality: number;   // Pre-computed recommended_score
  rating: number;    // Rating with review confidence
  price: number;     // Price competitiveness
  recency: number;   // Listing freshness
  geo: number;       // Distance from center
}

interface SignalValues {
  quality: number;
  rating: number;
  price: number;
  recency: number;
  geo: number;
}

interface RankableListing {
  id: string;
  recommendedScore?: number | null;
  avgRating?: number | null;
  reviewCount?: number | null;
  price?: number | null;
  createdAt?: Date | string | null;
  lat?: number | null;
  lng?: number | null;
}
```

### Default Weights

```typescript
const DEFAULT_WEIGHTS: RankingWeights = {
  quality: 0.25,   // Pre-computed recommended_score
  rating: 0.25,    // Rating with review confidence
  price: 0.15,     // Price competitiveness
  recency: 0.15,   // Listing freshness
  geo: 0.2,        // Distance from center
};
```

Sum = 1.0 for normalized final scores.

### Signal Normalization

All signals are normalized to 0-1 range:

| Signal | Function | Algorithm |
|--------|----------|-----------|
| Quality | `normalizeRecommendedScore(score)` | Sigmoid (k=0.04, midpoint=50); 0.3 default for missing |
| Rating | `normalizeRating(rating, count)` | Bayesian average (prior=3.5, minReviews=5); 0.5 default |
| Price | `normalizePriceCompetitiveness(price, median)` | Gaussian decay from median (sigma=0.5); 0.5 default |
| Recency | `normalizeRecency(createdAt)` | Exponential decay (halfLife=30 days); 0.5 default |
| Geo | `normalizeDistance(lat, lng, center)` | Haversine + exponential decay (halfDistance=5km); 0.5 if no center |

### Exported Functions

```typescript
// From score.ts
function computeScore(listing: RankableListing, context: RankingContext, weights?: RankingWeights): number
function computeSignals(listing: RankableListing, context: RankingContext): SignalValues
function computeMedianPrice(listings: Array<{ price?: number | null }>): number | undefined
function getBoundsCenter(bounds: { sw: {...}, ne: {...} }): { lat: number; lng: number }

// From rank.ts
function buildScoreMap<T extends RankableListing>(listings: T[], context: RankingContext, weights?: RankingWeights): Map<string, number>
function rankListings<T extends { id: string }>(candidates: T[], scoreMap: Map<string, number>): T[]
function getDebugSignals<T extends RankableListing>(listings: T[], scoreMap: Map<string, number>, context: RankingContext, limit?: number): DebugSignals[]
```

### Usage Example

```typescript
import { isRankingEnabled, buildScoreMap, computeMedianPrice, getBoundsCenter } from '@/lib/search/ranking';

if (isRankingEnabled(params.ranker)) {
  const context = {
    sort: params.sort,
    center: getBoundsCenter(bounds),
    localMedianPrice: computeMedianPrice(mapListings),
  };
  const scoreMap = buildScoreMap(mapListings, context);
  // Pass scoreMap to transformToPins for score-based tiering
}
```

---

## Feature Flags

| Flag | Env Variable | URL Override | Effect |
|------|-------------|-------------|--------|
| SearchDoc | `ENABLE_SEARCH_DOC=true` | `?searchDoc=1` or `?searchDoc=0` | Use denormalized table vs legacy JOINs |
| Keyset pagination | `ENABLE_SEARCH_KEYSET=true` (via `features.searchKeyset`) | - | Keyset cursors vs offset pagination |
| Debug ranking | `features.searchDebugRanking` | `?debugRank=1` | Expose ranking signals in response meta |
| Ranker | `features.searchRanking` | `?ranker=1` (when debug enabled) | Enable score-based pin tiering |

---

## Performance Considerations

### Query Optimization

- **Denormalized table**: All search fields in `listing_search_docs` -- no JOINs at query time
- **PostGIS geography**: GIST-indexed `location_geog` column for spatial queries
- **GIN indexes**: Array containment (`@>`) and overlap (`&&`) for amenities, rules, languages
- **FTS with tsvector**: Pre-computed `search_tsv` column with weighted zones (A=title, B=city, C=description)
- **FTS ranking tie-breaker**: `ts_rank_cd()` used in ORDER BY when FTS is active
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
| `executeSearchV2` | Top-level try/catch + `Promise.allSettled` | Logs via `logger.sync.error` without PII; partial failures return empty results gracefully |
| `orchestrateSearch` | Fallback chain | v2 failure falls back to v1; v1 failure returns empty result |
| `search-doc-queries` | `wrapDatabaseError` | Wraps Prisma errors with operation context, calls `.log()` with safe metadata |
| `markListingDirty` | Fire-and-forget | Catches and logs errors; never propagates to calling mutation |
| Cursor decoding | Null returns | Invalid/malformed cursors return `null`; callers fall back to page 1 |
| `queryWithTimeout` | Transaction timeout | `SET LOCAL statement_timeout` prevents runaway queries |

All error logging follows the project rule of **no raw PII in logs** -- only operation names, boolean flags, and truncated IDs are logged.
