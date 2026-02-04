# Search Ranking, Scoring & Filter Schema

Technical documentation for the Roomshare search ranking algorithm, filter validation schema, URL parameter handling, full-text search, and query execution.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Data Model: listing_search_docs](#data-model-listing_search_docs)
- [Full-Text Search (FTS)](#full-text-search-fts)
- [Filter Schema](#filter-schema)
- [URL Parameter Parsing](#url-parameter-parsing)
- [Query Building & Execution](#query-building--execution)
- [Ranking System](#ranking-system)
- [Pagination](#pagination)
- [Sort Options](#sort-options)
- [Feature Flags](#feature-flags)
- [Filter UI Components](#filter-ui-components)
- [Client Utilities](#client-utilities)
- [Constants Reference](#constants-reference)

---

## Architecture Overview

```
URL query string
    |
    v
search-params.ts          -- parse & validate raw URL params
    |
    v
filter-schema.ts          -- Zod-based canonical validation + normalization
    |
    v
search-v2-service.ts      -- orchestrate list + map queries in parallel
    |
    v
search-doc-queries.ts     -- build SQL, execute against listing_search_docs
    |
    v
ranking/                  -- compute scores for map pin tiering
    |
    v
transform.ts              -- convert to v2 response (GeoJSON, pins, list items)
    |
    v
SearchV2Response          -- unified response to client
```

### Key Components

| File | Purpose |
|------|---------|
| `src/lib/search/search-v2-service.ts` | Main search entry point, orchestrates list + map queries |
| `src/lib/search/search-doc-queries.ts` | SQL query builder, executes against denormalized table |
| `src/lib/search-params.ts` | URL parameter parsing and validation |
| `src/lib/filter-schema.ts` | Zod schemas for canonical filter validation |
| `src/lib/search/ranking/` | Heuristic scoring for map pin tiering |
| `src/lib/search/transform.ts` | Response transformation (GeoJSON, pins, list) |
| `src/lib/search/cursor.ts` | Keyset cursor encoding/decoding |
| `src/lib/search/hash.ts` | Query hash generation for caching |

---

## Data Model: listing_search_docs

**File**: `prisma/migrations/20260110000000_search_doc/migration.sql`

A denormalized read model that replaces expensive JOINs (Listing + Location + Review) with single-table reads.

### Table Schema

```sql
CREATE TABLE "listing_search_docs" (
  -- Primary key (same as Listing.id)
  "id" TEXT NOT NULL PRIMARY KEY,

  -- From Listing
  "owner_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "images" TEXT[] NOT NULL DEFAULT '{}',
  "amenities" TEXT[] NOT NULL DEFAULT '{}',
  "house_rules" TEXT[] NOT NULL DEFAULT '{}',
  "household_languages" TEXT[] NOT NULL DEFAULT '{}',
  "primary_home_language" TEXT,
  "lease_duration" TEXT,
  "room_type" TEXT,
  "move_in_date" TIMESTAMPTZ,
  "total_slots" INTEGER NOT NULL,
  "available_slots" INTEGER NOT NULL,
  "view_count" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "listing_created_at" TIMESTAMPTZ NOT NULL,

  -- From Location (denormalized)
  "address" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "zip" TEXT NOT NULL,
  "location_geog" geography(Point, 4326),  -- PostGIS geography
  "lat" DOUBLE PRECISION,                   -- Precomputed for fast access
  "lng" DOUBLE PRECISION,

  -- From Review aggregation (precomputed)
  "avg_rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "review_count" INTEGER NOT NULL DEFAULT 0,

  -- Precomputed for sorting
  -- Formula: avg_rating * 20 + view_count * 0.1 + review_count * 5
  "recommended_score" DOUBLE PRECISION NOT NULL DEFAULT 0,

  -- Case-insensitive filter columns (lowercase for GIN containment)
  "amenities_lower" TEXT[] NOT NULL DEFAULT '{}',
  "house_rules_lower" TEXT[] NOT NULL DEFAULT '{}',
  "household_languages_lower" TEXT[] NOT NULL DEFAULT '{}',

  -- Full-text search (added in 20260116000000_search_doc_fts)
  "search_tsv" tsvector,

  -- Freshness tracking
  "doc_created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "doc_updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Indexes

| Index | Type | Columns | Purpose |
|-------|------|---------|---------|
| `search_doc_location_geog_idx` | GIST | `location_geog` | Spatial bounding box queries |
| `search_doc_status_idx` | B-tree | `status` (WHERE ACTIVE) | Filter active listings |
| `search_doc_price_idx` | B-tree | `price` | Price range queries |
| `search_doc_created_at_idx` | B-tree | `listing_created_at DESC` | Sort by newest |
| `search_doc_recommended_score_idx` | B-tree | `recommended_score DESC` | Sort by recommended |
| `search_doc_rating_idx` | B-tree | `avg_rating DESC, review_count DESC` | Sort by rating |
| `search_doc_amenities_gin_idx` | GIN | `amenities_lower` | Array containment |
| `search_doc_house_rules_gin_idx` | GIN | `house_rules_lower` | Array containment |
| `search_doc_languages_gin_idx` | GIN | `household_languages_lower` | Array overlap |
| `search_doc_tsv_gin_idx` | GIN | `search_tsv` | Full-text search |

### Recommended Score Formula

```
recommended_score = avg_rating * 20 + view_count * 0.1 + review_count * 5
```

Precomputed during sync to avoid runtime calculation.

---

## Full-Text Search (FTS)

**File**: `prisma/migrations/20260116000000_search_doc_fts/migration.sql`

### tsvector Column

The `search_tsv` column stores weighted tsvectors for full-text search:

```sql
search_tsv =
  setweight(to_tsvector('english', title), 'A') ||
  setweight(to_tsvector('english', city), 'B') ||
  setweight(to_tsvector('english', state), 'B') ||
  setweight(to_tsvector('english', description), 'C')
```

**Weights**:
- **A (highest)**: title
- **B (medium)**: city, state
- **C (lower)**: description

### Query Execution

**File**: `src/lib/search/search-doc-queries.ts` (lines 392-404)

```sql
-- FTS condition
d.search_tsv @@ plainto_tsquery('english', $N)
```

Uses `plainto_tsquery` which handles multi-word queries as AND by default.

### FTS Ranking in ORDER BY

**File**: `src/lib/search/search-doc-queries.ts` (lines 496-518)

When FTS is active, `ts_rank_cd` is added as a secondary sort factor:

```sql
ORDER BY
  d.recommended_score DESC,
  ts_rank_cd(d.search_tsv, plainto_tsquery('english', $N)) DESC,
  d.listing_created_at DESC,
  d.id ASC
```

This leverages tsvector weights for relevance ranking within the primary sort.

---

## Filter Schema

**File**: `src/lib/filter-schema.ts`

Canonical single source of truth for filter validation using Zod.

### Valid Enum Values

| Filter | Valid Values |
|--------|-------------|
| Amenities | `Wifi`, `AC`, `Parking`, `Washer`, `Dryer`, `Kitchen`, `Gym`, `Pool`, `Furnished` |
| House Rules | `Pets allowed`, `Smoking allowed`, `Couples allowed`, `Guests allowed` |
| Lease Duration | `any`, `Month-to-month`, `3 months`, `6 months`, `12 months`, `Flexible` |
| Room Type | `any`, `Private Room`, `Shared Room`, `Entire Place` |
| Gender Preference | `any`, `MALE_ONLY`, `FEMALE_ONLY`, `NO_PREFERENCE` |
| Household Gender | `any`, `ALL_MALE`, `ALL_FEMALE`, `MIXED` |
| Sort | `recommended`, `price_asc`, `price_desc`, `newest`, `rating` |

### Alias Mappings

**Room Type Aliases**:
- `private` / `private_room` / `privateroom` → `Private Room`
- `shared` / `shared_room` / `sharedroom` → `Shared Room`
- `entire` / `entire_place` / `entireplace` / `whole` / `studio` → `Entire Place`

**Lease Duration Aliases**:
- `mtm` / `month-to-month` / `month_to_month` → `Month-to-month`
- `3_months` / `3months` → `3 months`
- `6_months` / `6months` → `6 months`
- `12_months` / `12months` / `1_year` / `1year` → `12 months`

### Validation Rules

| Field | Type | Rules |
|-------|------|-------|
| `query` | string | Trimmed, max 200 chars, empty becomes undefined |
| `minPrice` / `maxPrice` | number | Clamped to [0, 1,000,000,000]. Throws error if `minPrice > maxPrice` |
| `amenities` | string[] | Case-insensitive against allowlist, deduplicated, sorted, max 20 items |
| `houseRules` | string[] | Same as amenities |
| `languages` | string[] | Normalized via `normalizeLanguages()`, deduplicated, sorted, max 20 |
| `roomType` | enum | Case-insensitive with aliases, `any` treated as undefined |
| `leaseDuration` | enum | Case-insensitive with aliases, `any` treated as undefined |
| `genderPreference` | enum | Case-insensitive, `any` treated as undefined |
| `householdGender` | enum | Case-insensitive, `any` treated as undefined |
| `moveInDate` | string | `YYYY-MM-DD` format, must be today to 2 years in future |
| `bounds` | object | `{minLat, maxLat, minLng, maxLng}`, clamped to [-90,90]/[-180,180]. Throws error if `minLat > maxLat`. Lng NOT validated for inversion (antimeridian support) |
| `sort` | enum | Case-insensitive |
| `page` | int | Clamped to [1, 100], default 1 |
| `limit` | int | Clamped to [1, 100], default 12 |

### Exported Functions

| Function | Purpose |
|----------|---------|
| `normalizeFilters(input)` | Canonical normalization. Throws on inverted ranges. |
| `validateFilters(input)` | Returns `{success, data}` or `{success: false, errors}` |
| `isEmptyFilters(filters)` | True if no active filters (ignoring page/limit) |
| `filtersToSearchParams(filters)` | Convert normalized filters to URLSearchParams |

---

## URL Parameter Parsing

**File**: `src/lib/search-params.ts`

### Key Types

```typescript
interface ParsedSearchParams {
  q?: string;
  requestedPage: number;
  sortOption: SortOption;
  filterParams: FilterParams;
  boundsRequired: boolean;  // true when text query exists without bounds
  browseMode: boolean;      // true when no query and no bounds
}
```

### Parsing Behavior

1. **Price ranges**: Throws error if `minPrice > maxPrice`
2. **Latitude ranges**: Throws error if `minLat > maxLat`
3. **Longitude ranges**: NOT validated (supports antimeridian crossing)
4. **Point-to-bounds**: If `lat`/`lng` provided without bounds, auto-generates ~10km radius bounds
5. **Default sort**: `recommended`
6. **Unbounded text search**: Sets `boundsRequired: true` (prevents full-table scans)

### URL Parameter Reference

| URL Parameter | Type | Format | Aliases |
|--------------|------|--------|---------|
| `q` | string | Text query | - |
| `minPrice` | number | Price in dollars | `minBudget` |
| `maxPrice` | number | Price in dollars | `maxBudget` |
| `amenities` | string[] | Comma-separated or repeated | - |
| `houseRules` | string[] | Comma-separated or repeated | - |
| `languages` | string[] | Comma-separated or repeated | - |
| `roomType` | string | Enum or alias | See aliases above |
| `leaseDuration` | string | Enum or alias | See aliases above |
| `genderPreference` | string | Enum value | - |
| `householdGender` | string | Enum value | - |
| `moveInDate` | string | `YYYY-MM-DD` | - |
| `minLat`, `maxLat`, `minLng`, `maxLng` | number | Bounding box | - |
| `lat`, `lng` | number | Center point (auto-generates bounds) | - |
| `sort` | string | Sort option | - |
| `page` | int | Page number | - |
| `nearMatches` | boolean | `true`/`false` | - |

---

## Query Building & Execution

**File**: `src/lib/search/search-doc-queries.ts`

### Base WHERE Conditions

Every search query includes:

```sql
WHERE d.available_slots > 0
  AND d.status = 'ACTIVE'
  AND d.lat IS NOT NULL
  AND d.lng IS NOT NULL
```

### Filter Conditions

| Filter | SQL Condition | Notes |
|--------|--------------|-------|
| Geographic bounds | `d.location_geog && ST_MakeEnvelope(...)::geography` | PostGIS geography operator |
| Price range | `d.price >= $N` / `d.price <= $N` | Inclusive |
| Text search | `d.search_tsv @@ plainto_tsquery('english', $N)` | FTS with weights |
| Room type | `LOWER(d.room_type) = LOWER($N)` | Case-insensitive |
| Lease duration | `LOWER(d.lease_duration) = LOWER($N)` | Case-insensitive |
| Move-in date | `d.move_in_date IS NULL OR d.move_in_date <= $N` | Available by target date |
| Languages | `d.household_languages_lower && $N::text[]` | OR logic (any match) |
| Amenities | `d.amenities_lower @> $N::text[]` | AND logic (all required) |
| House rules | `d.house_rules_lower @> $N::text[]` | AND logic (all required) |
| Gender preference | `d.gender_preference = $N` | Exact match |
| Household gender | `d.household_gender = $N` | Exact match |

### Antimeridian Handling

**File**: `src/lib/search/search-doc-queries.ts` (lines 364-379)

For bounding boxes that cross the antimeridian (minLng > maxLng):

```sql
(
  d.location_geog && ST_MakeEnvelope(minLng, minLat, 180, maxLat, 4326)::geography
  OR d.location_geog && ST_MakeEnvelope(-180, minLat, maxLng, maxLat, 4326)::geography
)
```

### Statement Timeout

**File**: `src/lib/search/search-doc-queries.ts` (lines 40-53)

All queries execute with a 5-second statement timeout:

```sql
SET LOCAL statement_timeout = '5000'
```

### Query Limits

| Query Type | Limit | Purpose |
|------------|-------|---------|
| Map markers | 200 | `MAX_MAP_MARKERS` |
| Hybrid count threshold | 100 | `HYBRID_COUNT_THRESHOLD` - if count > 100, return null |
| Unbounded browse | 48 | `MAX_UNBOUNDED_RESULTS` - cap for no-query, no-bounds |

---

## Ranking System

**Directory**: `src/lib/search/ranking/`

Heuristic scoring for map pin tiering when result count < 50.

### Default Weights

**File**: `src/lib/search/ranking/score.ts` (lines 19-25)

```typescript
const DEFAULT_WEIGHTS = {
  quality: 0.25,  // Pre-computed recommended_score
  rating: 0.25,   // Rating with review confidence
  price: 0.15,    // Price competitiveness
  recency: 0.15,  // Listing freshness
  geo: 0.2,       // Distance from center
};
// Sum = 1.0
```

### Scoring Formula

```
final_score = quality*0.25 + rating*0.25 + price*0.15 + recency*0.15 + geo*0.20
```

All signals are normalized to 0-1 range.

### Signal Functions

#### `normalizeRecommendedScore(score)`

Sigmoid normalization for the pre-computed `recommended_score` field.

- **Formula**: `1 / (1 + e^(-0.04 * (score - 50)))`
- **Midpoint**: 50 (score=50 maps to 0.5)
- **Missing data**: returns 0.3

| Score | Normalized |
|-------|------------|
| 0 | ~0.12 |
| 25 | ~0.27 |
| 50 | 0.50 |
| 100 | ~0.88 |
| 150 | ~0.98 |

#### `normalizeRating(rating, reviewCount)`

Bayesian average to handle low review counts.

- **Prior**: 3.5 (neutral average)
- **Minimum reviews for full confidence**: 5
- **Formula**: `(3.5*5 + rating*count) / (5 + count) / 5`
- **Missing rating**: returns 0.5

#### `normalizePriceCompetitiveness(price, medianPrice)`

Gaussian decay from the local median price.

- **Formula**: `exp(-ln(price/median)^2 / (2 * 0.5^2))`
- **At median**: 1.0
- **At 2x median**: ~0.38
- **At 0.5x median**: ~0.38
- **Missing data**: returns 0.5

#### `normalizeRecency(createdAt)`

Exponential decay with 30-day half-life.

- **Formula**: `0.5^(ageMs / halfLifeMs)`
- **Half-life**: 30 days

| Age | Normalized |
|-----|------------|
| Brand new | 1.0 |
| 30 days | 0.5 |
| 60 days | 0.25 |
| 90 days | 0.125 |

#### `normalizeDistance(lat, lng, center)`

Exponential decay from map center using Haversine distance.

- **Formula**: `0.5^(distanceKm / 5)`
- **Half-distance**: 5 km
- **Earth radius**: 6371 km

| Distance | Normalized |
|----------|------------|
| At center | 1.0 |
| 5 km | 0.5 |
| 10 km | 0.25 |
| 15 km | 0.125 |
| No center provided | 0.5 |

### Ranking Functions

| Function | Purpose |
|----------|---------|
| `buildScoreMap(listings, context, weights?)` | Returns `Map<listingId, score>` |
| `rankListings(candidates, scoreMap)` | Sort by score descending, tie-break by ID |
| `getDebugSignals(listings, scoreMap, context, limit?)` | Debug info for top N listings (default 5) |

### Feature Flag

**File**: `src/lib/search/ranking/index.ts` (lines 62-75)

```typescript
const RANKING_VERSION = "v1-heuristic";

function isRankingEnabled(urlRanker?: string | null): boolean
```

- Env flag: `features.searchRanking` (default: `true`)
- URL override: `?ranker=1|true|0|false` (only when `features.searchDebugRanking` is enabled)

---

## Pagination

### Offset-Based (Legacy)

**File**: `src/lib/search/hash.ts` (lines 112-133)

Simple base64url cursor encoding page number:

```typescript
encodeCursor(page: number): string  // { p: page } → base64url
decodeCursor(cursor: string): number | null
```

### Keyset-Based (v2)

**File**: `src/lib/search/cursor.ts`

Stable cursor-based pagination that prevents result drift.

#### Cursor Structure

```typescript
interface KeysetCursor {
  v: 1;                    // Version for future compatibility
  s: SortOption;           // Sort option to validate cursor matches query
  k: (string | null)[];    // Key values in ORDER BY sequence
  id: string;              // Tie-breaker listing ID
}
```

#### Expected Key Counts per Sort

| Sort Option | Keys | Columns |
|-------------|------|---------|
| `recommended` | 2 | recommended_score, listing_created_at |
| `newest` | 1 | listing_created_at |
| `price_asc` | 2 | price, listing_created_at |
| `price_desc` | 2 | price, listing_created_at |
| `rating` | 3 | avg_rating, review_count, listing_created_at |

#### Keyset WHERE Clause

**File**: `src/lib/search/search-doc-queries.ts` (lines 156-318)

Uses explicit OR-chains for mixed ASC/DESC sorts (NOT tuple comparison):

```sql
-- Example for recommended sort (DESC, DESC, ASC)
(
  (d.recommended_score < $1::float8)
  OR (d.recommended_score = $1::float8 AND d.listing_created_at < $2::timestamptz)
  OR (d.recommended_score = $1::float8 AND d.listing_created_at = $2::timestamptz AND d.id > $3)
)
```

#### Hybrid Pagination

- **First page**: Uses offset-based, returns keyset cursor for next page
- **Subsequent pages**: Uses keyset cursor for stable pagination
- **Legacy compatibility**: `decodeCursorAny()` detects and handles both formats

---

## Sort Options

**File**: `src/lib/search/search-doc-queries.ts` (lines 496-518)

### ORDER BY Clauses

| Sort Option | ORDER BY |
|-------------|----------|
| `recommended` | `recommended_score DESC, [ts_rank_cd DESC,] listing_created_at DESC, id ASC` |
| `newest` | `listing_created_at DESC, [ts_rank_cd DESC,] id ASC` |
| `price_asc` | `price ASC NULLS LAST, [ts_rank_cd DESC,] listing_created_at DESC, id ASC` |
| `price_desc` | `price DESC NULLS LAST, [ts_rank_cd DESC,] listing_created_at DESC, id ASC` |
| `rating` | `avg_rating DESC NULLS LAST, review_count DESC, [ts_rank_cd DESC,] listing_created_at DESC, id ASC` |

**Note**: `ts_rank_cd` is only included when FTS is active (query parameter provided).

---

## Feature Flags

### Search Doc (`ENABLE_SEARCH_DOC`)

**File**: `src/lib/search/search-doc-queries.ts` (lines 1339-1351)

- Env var: `ENABLE_SEARCH_DOC=true`
- URL override: `?searchDoc=1` or `?searchDoc=0`
- Default: `false` (controlled by env)

When disabled, falls back to slow LIKE queries on joined tables.

### Keyset Pagination (`ENABLE_SEARCH_KEYSET`)

Controlled by `features.searchKeyset` env flag.

### Ranking (`features.searchRanking`)

Default: `true`. Applies heuristic scoring for map pin tiering.

### Debug Ranking (`features.searchDebugRanking`)

Allows URL override for ranking (`?ranker=1`) and debug signals (`?debugRank=1`).

---

## Filter UI Components

### FilterModal

**File**: `src/components/search/FilterModal.tsx`

Slide-out drawer for detailed filters. Pure presentational component.

**Filter Sections**:
1. Price Range (PriceRangeFilter component)
2. Move-in Date (DatePicker)
3. Lease Duration (Select)
4. Room Type (Select with facet counts)
5. Amenities (Toggle chips with facet counts)
6. House Rules (Toggle chips with facet counts)
7. Languages (Searchable selection)
8. Gender Preference (Select)
9. Household Gender (Select)

### PriceRangeFilter

**File**: `src/components/search/PriceRangeFilter.tsx`

Dual-thumb slider with histogram visualization.

- Uses `@radix-ui/react-slider`
- Dynamic step: 10 (≤$1000), 25 (≤$5000), 50 (>$5000)
- Values ≥$10,000 shown as "Xk"

### PriceHistogram

**File**: `src/components/search/PriceHistogram.tsx`

Visual histogram showing price distribution.

- Default height: 80px
- Minimum bar height: 2px
- In-range bars: dark, out-of-range: light

### RecommendedFilters

**File**: `src/components/search/RecommendedFilters.tsx`

Contextual filter suggestion pills above search results.

**Default Suggestions** (max 5 shown):
- Furnished, Pet Friendly, Wifi, Parking, Washer
- Private Room, Entire Place
- Month-to-month
- Under $1000
- Couples OK

---

## Client Utilities

### Filter Chip Utilities

**File**: `src/components/filters/filter-chip-utils.ts`

| Function | Purpose |
|----------|---------|
| `urlToFilterChips(searchParams)` | Convert URL params to chip array |
| `removeFilterFromUrl(searchParams, chip)` | Remove one filter, return new query string |
| `clearAllFilters(searchParams)` | Remove all filter params, preserve location + sort |
| `hasFilterChips(searchParams)` | Boolean check for any active filter chips |

**Preserved params** (kept on clear all): `q`, `lat`, `lng`, `minLat`, `maxLat`, `minLng`, `maxLng`, `sort`

### Search URL Builder

**File**: `src/lib/search-utils.ts`

```typescript
buildSearchUrl(filters: SearchFilters): string
```

Builds `/search?...` URL string. Array params appended as separate query params.

---

## Constants Reference

**File**: `src/lib/constants.ts`

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_SAFE_PRICE` | 1,000,000,000 | Upper price clamp |
| `MAX_SAFE_PAGE` | 100 | Max page number |
| `MAX_ARRAY_ITEMS` | 20 | Max items per array filter |
| `DEFAULT_PAGE_SIZE` | 12 | Default results per page |
| `MAX_PAGE_SIZE` | 100 | Max results per page |
| `MIN_QUERY_LENGTH` | 2 | Minimum search query length |
| `MAX_QUERY_LENGTH` | 200 | Maximum search query length |
| `LAT_OFFSET_DEGREES` | 0.09 | ~10km radius for point-to-bounds |
| `MAX_LAT_SPAN` | 5 | Max latitude span (~550km) |
| `MAX_LNG_SPAN` | 5 | Max longitude span (~550km at equator) |
| `CLUSTER_THRESHOLD` | 50 | Use pins if < 50 results, else geojson clustering |
| `BOUNDS_EPSILON` | 0.001 | Bounds quantization (~100m precision) |
| `AREA_COUNT_DEBOUNCE_MS` | 600 | Debounce for area count on map move |
| `AREA_COUNT_CACHE_TTL_MS` | 30000 | Client cache for area count |

### Query Limits (search-doc-queries.ts)

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_MAP_MARKERS` | 200 | Max markers returned for map |
| `HYBRID_COUNT_THRESHOLD` | 100 | Return null count if > 100 |
| `MAX_UNBOUNDED_RESULTS` | 48 | Cap for unbounded browse (4 pages of 12) |
| `SEARCH_QUERY_TIMEOUT_MS` | 5000 | Statement timeout (5 seconds) |

---

## Query Hash

**File**: `src/lib/search/hash.ts`

Generates 16-character SHA256 hash from filter parameters for caching.

**Features**:
- Bounds quantized with `BOUNDS_EPSILON` (0.001) for ~100m cache tolerance
- Arrays sorted for order-independence
- Strings lowercased for case-insensitivity
- Excludes pagination params (page, limit, cursor)

```typescript
generateQueryHash(params: HashableFilterParams): string
```

---

## Response Transform

**File**: `src/lib/search/transform.ts`

### Mode Determination

- `mapListings.length >= 50` → `"geojson"` (Mapbox clustering)
- `mapListings.length < 50` → `"pins"` (individual tiered pins)

### GeoJSON Transform

Always returned. FeatureCollection with Point features containing:
- `id`, `title`, `price`, `image`, `availableSlots`, `ownerId`

### Pin Transform

Only when mode is `"pins"`. Includes:
- `id`, `lat`, `lng`, `price`
- `tier`: "primary" or "mini" (based on ranking)
- `stackCount`: number of listings at same location (if > 1)

Pin tiering uses `getPrimaryPinLimit()` (default 40, configurable via `NEXT_PUBLIC_PRIMARY_PINS` env var, clamped to 10-120).
