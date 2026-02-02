# Search Ranking, Scoring & Filter Schema

Technical documentation for the Roomshare search ranking algorithm, filter validation schema, URL parameter handling, and related utilities.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Ranking System](#ranking-system)
  - [Types (`ranking/types.ts`)](#ranking-types)
  - [Scoring (`ranking/score.ts`)](#ranking-scoring)
  - [Ranking (`ranking/rank.ts`)](#ranking-functions)
  - [Entry Point (`ranking/index.ts`)](#ranking-entry-point)
- [Filter Schema (`filter-schema.ts`)](#filter-schema)
- [URL Parameter Parsing (`search-params.ts`)](#url-parameter-parsing)
- [Client Search Utilities (`search-utils.ts`)](#client-search-utilities)
- [Filter Chip Utilities (`filter-chip-utils.ts`)](#filter-chip-utilities)
- [Filter Regression Framework (`filter-regression.ts`)](#filter-regression-framework)
- [Search Alerts (`search-alerts.ts`)](#search-alerts)
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
ranking/score.ts          -- compute per-listing signal scores (0-1)
ranking/rank.ts           -- build score map, sort, debug output
ranking/index.ts          -- public API, feature flag gating
    |
    v
search-utils.ts           -- build search URLs from filter objects (client)
filter-chip-utils.ts      -- convert URL params to removable UI chips
filter-regression.ts      -- golden-file regression testing framework
search-alerts.ts          -- saved search alert processing (server)
```

Data flows from raw URL parameters through validation and normalization, then into ranking (for map pin tiering) and back to the client as filter chips and search URLs.

---

## Ranking System

### Ranking Types

**File**: `src/lib/search/ranking/types.ts`

**Purpose**: Type definitions for the heuristic ranking system. Designed for future ML extensibility.

#### Interfaces

| Interface | Purpose |
|-----------|---------|
| `RankingContext` | Search context passed to scoring: sort option, map center, median price, debug flag |
| `RankingWeights` | Per-signal weights (must sum to 1.0) |
| `SignalValues` | Individual signal scores, all normalized 0-1 |
| `DebugSignals` | Debug output per listing (id + signals + total). No PII. |
| `RankableListing` | Minimum listing fields required for scoring |
| `RankingConfig` | Version string + weights for A/B testing |

#### RankableListing Fields

```typescript
interface RankableListing {
  id: string;
  recommendedScore?: number | null;  // Pre-computed: avg_rating*20 + view_count*0.1 + review_count*5
  avgRating?: number | null;         // 0-5
  reviewCount?: number | null;
  price?: number | null;
  createdAt?: Date | string | null;
  lat?: number | null;
  lng?: number | null;
}
```

---

### Ranking Scoring

**File**: `src/lib/search/ranking/score.ts`

**Purpose**: Computes normalized (0-1) scores for each ranking signal. All signals are interpretable and tunable.

#### Default Weights

```typescript
const DEFAULT_WEIGHTS: RankingWeights = {
  quality:  0.25,  // Pre-computed recommended_score
  rating:   0.25,  // Rating with review confidence
  price:    0.15,  // Price competitiveness
  recency:  0.15,  // Listing freshness
  geo:      0.20,  // Distance from map center
};
// Sum = 1.0
```

#### Scoring Formula

The final score is a weighted sum of five normalized signals:

```
score = quality*0.25 + rating*0.25 + price*0.15 + recency*0.15 + geo*0.20
```

Each signal is independently normalized to the 0-1 range.

#### Signal Functions

##### `normalizeRecommendedScore(score)`

Sigmoid normalization for the pre-computed `recommended_score` field.

- **Input range**: 0-200 (typical), where `score = avg_rating*20 + view_count*0.1 + review_count*5`
- **Formula**: `1 / (1 + e^(-0.04 * (score - 50)))`
- **Midpoint**: 50 (score=50 maps to 0.5)
- **Missing data**: returns 0.3

```
score=0   -> ~0.12
score=25  -> ~0.27
score=50  -> 0.50
score=100 -> ~0.88
score=150 -> ~0.98
```

##### `normalizeRating(rating, reviewCount)`

Bayesian average to handle low review counts.

- **Prior**: 3.5 (neutral average)
- **Minimum reviews for full confidence**: 5
- **Formula**: `(3.5*5 + rating*count) / (5 + count) / 5`
- **Missing rating**: returns 0.5

Example: a listing with rating=5.0 and 1 review gets an adjusted rating of `(17.5 + 5) / 6 = 3.75`, normalized to 0.75.

##### `normalizePriceCompetitiveness(price, medianPrice)`

Gaussian decay from the local median price. Listings at the median score highest.

- **Formula**: `exp(-ln(price/median)^2 / (2 * 0.5^2))`
- **At median**: 1.0
- **At 2x median**: ~0.38
- **At 0.5x median**: ~0.38
- **Missing data**: returns 0.5

##### `normalizeRecency(createdAt)`

Exponential decay with a 30-day half-life.

- **Formula**: `0.5^(ageMs / halfLifeMs)`
- **Half-life**: 30 days
- **Brand new**: 1.0
- **30 days old**: 0.5
- **60 days old**: 0.25
- **90 days old**: 0.125
- **Missing data**: returns 0.5

##### `normalizeDistance(lat, lng, center)`

Exponential decay from the map center using Haversine distance.

- **Formula**: `0.5^(distanceKm / 5)`
- **Half-distance**: 5 km
- **At center**: 1.0
- **5 km away**: 0.5
- **10 km away**: 0.25
- **No center provided**: returns 0.5 (signal skipped)
- **Missing coordinates**: returns 0.3

#### Utility Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `computeScore` | `(listing, context, weights?) -> number` | Overall score (0-1) |
| `computeSignals` | `(listing, context) -> SignalValues` | All individual signals |
| `computeMedianPrice` | `(listings[]) -> number \| undefined` | Median price from listing array |
| `getBoundsCenter` | `(bounds) -> {lat, lng}` | Center point from SW/NE bounds |

---

### Ranking Functions

**File**: `src/lib/search/ranking/rank.ts`

**Purpose**: Converts scores to ranked lists and provides debug output.

#### Exported Functions

##### `buildScoreMap(listings, context, weights?)`

```typescript
function buildScoreMap<T extends RankableListing>(
  listings: T[],
  context: RankingContext,
  weights?: RankingWeights,
): Map<string, number>
```

Returns a `Map<listingId, score>` for all listings.

##### `rankListings(candidates, scoreMap)`

```typescript
function rankListings<T extends { id: string }>(
  candidates: T[],
  scoreMap: Map<string, number>,
): T[]
```

Returns a **new** array sorted by score descending. Tie-breaking is deterministic by `id.localeCompare()`.

##### `getDebugSignals(listings, scoreMap, context, limit?)`

```typescript
function getDebugSignals<T extends RankableListing>(
  listings: T[],
  scoreMap: Map<string, number>,
  context: RankingContext,
  limit?: number, // default 5
): DebugSignals[]
```

Returns debug info for the top N listings. All values rounded to 2 decimal places. Contains only IDs and normalized signals -- no PII.

---

### Ranking Entry Point

**File**: `src/lib/search/ranking/index.ts`

**Purpose**: Public API for the ranking module. Re-exports all types and functions; provides feature flag gating.

#### Feature Flag

```typescript
const RANKING_VERSION = "v1-heuristic";

function isRankingEnabled(urlRanker?: string | null): boolean
```

- Checks `features.searchRanking` env flag (default: `true`)
- URL override via `?ranker=1|true|0|false` is only allowed when `features.searchDebugRanking` is enabled (non-production)

#### Usage Pattern

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

## Filter Schema

**File**: `src/lib/filter-schema.ts`

**Purpose**: Canonical single source of truth for filter validation using Zod. Used by both URL parsing and server-side validation.

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

URL-friendly aliases are resolved to canonical values:

**Room Type Aliases**:
`private` -> `Private Room`, `shared` -> `Shared Room`, `entire` / `whole` / `studio` -> `Entire Place`

**Lease Duration Aliases**:
`mtm` -> `Month-to-month`, `3_months` -> `3 months`, `6_months` -> `6 months`, `12_months` / `1_year` -> `12 months`

### Validation Rules

| Field | Type | Rules |
|-------|------|-------|
| `query` | string | Trimmed, max 200 chars, empty becomes undefined |
| `minPrice` / `maxPrice` | number | Clamped to [0, 1,000,000,000]. `minPrice > maxPrice` throws error |
| `amenities` | string[] | Case-insensitive against allowlist, deduplicated, sorted, max 20 items |
| `houseRules` | string[] | Same as amenities |
| `languages` | string[] | Normalized via `normalizeLanguages()`, deduplicated, sorted, max 20 |
| `roomType` | enum | Case-insensitive, `any` treated as undefined |
| `leaseDuration` | enum | Case-insensitive with aliases, `any` treated as undefined |
| `genderPreference` | enum | Case-insensitive, `any` treated as undefined |
| `householdGender` | enum | Case-insensitive, `any` treated as undefined |
| `moveInDate` | string | `YYYY-MM-DD` format, must be today to 2 years in future, validated against calendar |
| `bounds` | object | `{minLat, maxLat, minLng, maxLng}`, clamped to [-90,90]/[-180,180]. **`minLat > maxLat` throws error**. lng NOT swapped (antimeridian support) |
| `sort` | enum | Case-insensitive |
| `page` | int | Clamped to [1, 100], default 1 |
| `limit` | int | Clamped to [1, 100], default 12 |

### Exported Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `normalizeFilters` | `(input: unknown) -> NormalizedFilters` | Canonical normalization. Trims, validates, deduplicates, sorts, clamps. **Throws on inverted ranges (price, lat)**. |
| `validateFilters` | `(input: unknown) -> Result` | Strict validation returning `{success, data}` or `{success: false, errors}` |
| `isEmptyFilters` | `(filters: NormalizedFilters) -> boolean` | True if no active filters (ignoring page/limit) |
| `filtersToSearchParams` | `(filters: NormalizedFilters) -> URLSearchParams` | Convert normalized filters back to URL params |

### Zod Schemas

```typescript
export const filterSchema: z.ZodObject<...>;       // All filter fields
export const paginationSchema: z.ZodObject<...>;    // page + limit
export const searchParamsSchema: z.ZodObject<...>;  // filterSchema.merge(paginationSchema)
```

### Range Validation Behavior (P1-13, P1-3)

**Consistent Error Handling**: All inverted ranges now throw validation errors instead of silent correction.

- **Price ranges**: `minPrice > maxPrice` throws `"minPrice cannot exceed maxPrice"`
- **Latitude ranges**: `minLat > maxLat` throws `"minLat cannot exceed maxLat"`
- **Longitude ranges**: NOT validated for inversion (supports antimeridian crossing)

This applies to:
- `normalizeFilters()` function (line 411-413 for price, line 656-658 for lat)
- `boundsSchema` transform (line 247-249)
- Zod schema validation

**Rationale**: Throwing errors provides better user feedback than silent swapping, which could mask client bugs or confuse users about their filter settings.

---

## URL Parameter Parsing

**File**: `src/lib/search-params.ts`

**Purpose**: Parses raw URL search parameters into validated, typed filter objects. Serves as the primary entry point for server-side search parameter handling.

### Key Types

```typescript
interface RawSearchParams {
  q?: string | string[];
  minPrice?: string | string[];
  maxPrice?: string | string[];
  amenities?: string | string[];
  // ... all filter params as string | string[]
  lat?: string | string[];     // Point-based location
  lng?: string | string[];
  nearMatches?: string | string[];
}

interface ParsedSearchParams {
  q?: string;
  requestedPage: number;
  sortOption: SortOption;
  filterParams: FilterParams;
  boundsRequired: boolean;  // true when text query exists without geographic bounds
  browseMode: boolean;      // true when no query and no bounds
}
```

### Exported Functions

#### `parseSearchParams(raw: RawSearchParams): ParsedSearchParams`

Main parser. Converts raw URL strings to validated filter params with these behaviors:

- **Inverted price ranges** (`minPrice > maxPrice`) **throw an error** (P1-13 fix, line 339-345)
- **Inverted latitude ranges** (`minLat > maxLat`) **throw an error** (P1-3 fix, line 355-361)
- If `lat`/`lng` provided without bounds, auto-generates bounds using `LAT_OFFSET_DEGREES` (0.09 degrees, ~10km radius)
- Default sort: `recommended`
- Sets `boundsRequired: true` when a text query has no geographic bounds (prevents full-table scans)
- Sets `browseMode: true` when no query and no bounds

#### `buildRawParamsFromSearchParams(searchParams: URLSearchParams): Record<string, string | string[]>`

Converts `URLSearchParams` to a raw params object, preserving duplicate keys as arrays.

```typescript
// ?amenities=Wifi&amenities=AC -> { amenities: ['Wifi', 'AC'] }
```

#### `getPriceParam(searchParams: URLSearchParams, type: 'min' | 'max'): number | undefined`

Reads price from URL with budget alias support. Canonical `minPrice`/`maxPrice` takes precedence over `minBudget`/`maxBudget`.

#### `validateSearchFilters(filters: unknown): FilterParams`

Server-side validation for untrusted input (e.g., client submissions stored in the database). Same validation logic as `parseSearchParams` but for object input rather than URL strings.

**Throws errors** on:
- Inverted price ranges (line 535-541)
- Inverted latitude ranges (line 648-650)

---

## Client Search Utilities

**File**: `src/lib/search-utils.ts`

**Purpose**: Client-safe utility for building search URLs from filter objects.

### Types

```typescript
interface SearchFilters {
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
  moveInDate?: string;
  leaseDuration?: string;
  houseRules?: string[];
  roomType?: string;
  languages?: string[];
  genderPreference?: string;
  householdGender?: string;
  lat?: number;
  lng?: number;
  minLat?: number; maxLat?: number;
  minLng?: number; maxLng?: number;
  sort?: string;
  city?: string;
}
```

### Exported Functions

#### `buildSearchUrl(filters: SearchFilters): string`

Builds a `/search?...` URL string. Array params (amenities, houseRules, languages) are appended as separate query params:

```
/search?amenities=Wifi&amenities=AC&minPrice=500
```

---

## Filter Chip Utilities

**File**: `src/components/filters/filter-chip-utils.ts`

**Purpose**: Converts URL search params into displayable, removable filter chips for the UI.

### Types

```typescript
interface FilterChipData {
  id: string;         // Unique key (e.g., "amenities:Wifi")
  label: string;      // Display text
  paramKey: string;   // URL param key
  paramValue?: string; // For array params: value to remove
}
```

### Preserved vs Filter Parameters

**Preserved** (kept on clear all): `q`, `lat`, `lng`, `minLat`, `maxLat`, `minLng`, `maxLng`, `sort`

**Filter params** (shown as chips): `minPrice`, `maxPrice`, `amenities`, `houseRules`, `languages`, `roomType`, `leaseDuration`, `moveInDate`, `nearMatches`

### Exported Functions

| Function | Purpose |
|----------|---------|
| `urlToFilterChips(searchParams)` | Convert URL params to chip array. Combines minPrice+maxPrice into a single "price-range" chip. Language codes are converted to display names. |
| `removeFilterFromUrl(searchParams, chip)` | Remove one filter, return new query string. Handles array params (removes single value from comma list). Resets page to 1. |
| `clearAllFilters(searchParams)` | Remove all filter params, preserve location + sort. |
| `hasFilterChips(searchParams)` | Boolean check for any active filter chips. |

### Price Display

- Combined range: `$500 - $2,000`
- Min only: `Min $500`
- Max only: `Max $2,000`

Budget aliases (`minBudget`/`maxBudget`) are handled transparently via `getPriceParam`.

---

## Filter Regression Framework

**File**: `src/lib/filter-regression.ts`

**Purpose**: Captures real-world filter patterns from production and replays them in tests to detect behavioral regressions.

### Core Concepts

1. **Scenario Capture**: Call `captureFilterScenario()` on search requests to record raw input, normalized filters, result IDs, and a behavior hash.
2. **Behavior Hash**: Deterministic hash of `{filters, resultCount, first10Ids, last10Ids}` for regression detection.
3. **Regression Testing**: Replay scenarios against the current implementation; detect normalization changes, result count changes, and performance regressions.

### Key Types

```typescript
interface FilterScenario {
  id: string;
  timestamp: string;
  rawInput: unknown;
  normalizedFilters: NormalizedFilters;
  resultCount: number;
  resultIds: string[];
  executionTimeMs: number;
  behaviorHash: string;
}

interface RegressionReport {
  scenarioId: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  expected: Partial<FilterScenario>;
  actual: Partial<FilterScenario>;
  diff?: Record<string, { expected: unknown; actual: unknown }>;
}
```

### Exported Functions

| Function | Purpose |
|----------|---------|
| `captureFilterScenario(rawInput, resultIds, executionTimeMs)` | Create a scenario from a search request |
| `createBehaviorHash(filters, resultIds)` | Deterministic hash for regression detection |
| `storeScenario` / `getScenario` / `getAllScenarios` / `clearScenarios` | In-memory scenario store |
| `exportScenarios()` / `importScenarios(json)` | JSON serialization for test fixtures |
| `runScenario(scenario, executor)` | Test one scenario, returns `RegressionReport` |
| `runRegressionSuite(executor)` | Test all stored scenarios, returns `RegressionSummary` |
| `createGoldenScenario(name, description, input)` | Create a golden scenario for stable tests |
| `validateGoldenScenario(golden)` | Check golden scenario against current normalization |
| `validateCriticalScenarios()` | Run all pre-defined critical scenarios |

### Regression Detection

- **Fail**: Normalization output changed OR behavior hash changed
- **Warning**: Result count changed (may be data-dependent) OR execution time > 2x baseline
- **Pass**: All checks match

### ScenarioSampler

Bucket-based sampling to capture diverse filter patterns without storing every request:

```typescript
const sampler = new ScenarioSampler(maxPerBucket = 10, maxTotal = 1000);
sampler.sample(scenario); // returns true if added
sampler.getCoverageStats(); // { "q-price-room": 5, "geo": 8, ... }
```

Bucket keys are derived from active filter types (e.g., `amen-geo-price`).

### Pre-defined Critical Scenarios

The `CRITICAL_SCENARIOS` array includes golden tests for:
- Empty filters
- Basic price filter
- Complex multi-filter combo
- Geographic bounds
- Antimeridian crossing (lng not swapped)
- Case-insensitive enums
- Array deduplication
- Malformed input resilience
- Extreme value clamping
- Whitespace trimming
- **Inverted price range** (expects error)
- **Inverted lat range** (expects error)

---

## Search Alerts

**File**: `src/lib/search-alerts.ts`

**Purpose**: Server-side processing of saved search alerts. Matches new listings against stored filter criteria and sends notifications.

### Exported Functions

#### `processSearchAlerts(): Promise<ProcessResult>`

Batch alert processor for DAILY and WEEKLY frequencies. Finds saved searches due for alerts, queries new matching listings, sends email notifications, and creates in-app notifications.

#### `triggerInstantAlerts(newListing: NewListingForAlert): Promise<{sent, errors}>`

Triggered when a new listing is created. Runs filter matching in-process against all INSTANT subscriptions.

### Filter Matching Logic (internal `matchesFilters`)

- **Price**: min/max inclusive range
- **City**: case-insensitive substring match
- **Room type, Lease duration, Gender preference, Household gender**: exact match
- **Move-in date**: listing available by target date (null = available anytime)
- **Amenities, House rules**: ALL required items must be present (AND logic)
- **Languages**: ANY listed language matches (OR logic)
- **Query**: case-insensitive substring match against title, description, city, state

---

## Constants Reference

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_SAFE_PRICE` | 1,000,000,000 | Upper price clamp |
| `MAX_SAFE_PAGE` | 100 | Max page number |
| `MAX_ARRAY_ITEMS` | 20 | Max items per array filter |
| `DEFAULT_PAGE_SIZE` | 12 | Default results per page |
| `MAX_PAGE_SIZE` | 100 | Max results per page |
| `MIN_QUERY_LENGTH` | 2 | Minimum search query length |
| `MAX_QUERY_LENGTH` | 200 | Maximum search query length |
| `LAT_OFFSET_DEGREES` | 0.09 | ~10km radius for point-to-bounds expansion |

---

## URL Parameter Encoding Reference

### Encoding (filters to URL)

| Filter | URL Parameter | Format | Example |
|--------|--------------|--------|---------|
| Text query | `q` | string | `q=downtown+studio` |
| Min price | `minPrice` (alias: `minBudget`) | number | `minPrice=500` |
| Max price | `maxPrice` (alias: `maxBudget`) | number | `maxPrice=2000` |
| Amenities | `amenities` | comma-separated or repeated | `amenities=Wifi,AC` |
| House rules | `houseRules` | comma-separated or repeated | `houseRules=Pets+allowed` |
| Languages | `languages` | comma-separated or repeated | `languages=en,es` |
| Room type | `roomType` | string (aliases accepted) | `roomType=private` |
| Lease duration | `leaseDuration` | string (aliases accepted) | `leaseDuration=6_months` |
| Gender preference | `genderPreference` | string | `genderPreference=FEMALE_ONLY` |
| Household gender | `householdGender` | string | `householdGender=MIXED` |
| Move-in date | `moveInDate` | YYYY-MM-DD | `moveInDate=2026-03-01` |
| Bounds | `minLat`, `maxLat`, `minLng`, `maxLng` | number | `minLat=37.7&maxLat=37.85` |
| Point location | `lat`, `lng` | number | `lat=37.77&lng=-122.42` |
| Sort | `sort` | enum | `sort=price_asc` |
| Page | `page` | integer | `page=2` |
| Near matches | `nearMatches` | `true`/`false`/`1` | `nearMatches=true` |

### Decoding Priority

1. Canonical param names take precedence over aliases (`minPrice` over `minBudget`)
2. First value used when duplicate keys exist (except arrays)
3. All enum values are case-insensitive
4. `any` is treated as "no filter" (returns undefined)
5. **Invalid ranges throw errors**: `minPrice > maxPrice` and `minLat > maxLat` cause validation errors
6. Longitude ranges NOT validated for inversion (supports antimeridian crossing)
