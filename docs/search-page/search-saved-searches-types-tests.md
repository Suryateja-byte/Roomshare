# Search, Saved Searches, Types, and E2E Test Coverage

Comprehensive documentation for the Roomshare search system covering saved searches, search alerts, type definitions, E2E test coverage, and maintenance tooling.

---

## Table of Contents

- [Saved Searches](#saved-searches)
  - [CRUD Flow](#crud-flow)
  - [Page Architecture](#page-architecture)
  - [Server Actions](#server-actions)
  - [Client Component: SavedSearchList](#client-component-savedsearchlist)
- [Search Alerts System](#search-alerts-system)
- [Type Definitions](#type-definitions)
  - [Listing Types](#listing-types)
  - [Pagination Types](#pagination-types)
  - [Nearby Places Types](#nearby-places-types)
  - [Search V2 Types](#search-v2-types)
  - [Filter Suggestions](#filter-suggestions)
- [Search V1/V2 Data Flow Components](#search-v1v2-data-flow-components)
- [Natural Language Parser](#natural-language-parser)
- [Split Stay Logic](#split-stay-logic)
- [Search Ranking System](#search-ranking-system)
- [Scripts and Maintenance Tooling](#scripts-and-maintenance-tooling)
- [Unit Test Coverage](#unit-test-coverage)
- [E2E Test Coverage](#e2e-test-coverage)

---

## Saved Searches

### CRUD Flow

The saved searches feature allows authenticated users to persist search criteria and receive alerts when new listings match.

**Data flow overview:**

```
User on /search page
  -> Clicks "Save Search" button
  -> saveSearch() server action validates + stores in DB
  -> revalidatePath('/saved-searches')

User on /saved-searches page
  -> getMySavedSearches() fetches all saved searches
  -> SavedSearchList renders list with actions
  -> User can: toggle alerts, delete, rename, or re-run a search
```

**Limits:** Each user can save a maximum of **10 searches**. Attempting to exceed this returns an error.

### Page Architecture

The `/saved-searches` route uses Next.js App Router conventions with three files:

| File | Purpose |
|------|---------|
| `page.tsx` | Server component. Authenticates user (redirects to `/login` if unauthenticated), fetches saved searches, renders empty state or `SavedSearchList`. |
| `loading.tsx` | Displays `SavedSearchesSkeleton` during server-side data fetching. |
| `error.tsx` | Client error boundary. Shows error message with "Try again" (reset) and "Start new search" actions. Logs error to console. |

**Page component (`/mnt/d/Documents/roomshare/src/app/saved-searches/page.tsx`):**

```tsx
export default async function SavedSearchesPage() {
    const session = await auth();
    if (!session?.user?.id) {
        redirect('/login?callbackUrl=/saved-searches');
    }
    const savedSearches = await getMySavedSearches();
    // Renders empty state or SavedSearchList
}
```

Key behaviors:
- Unauthenticated users are redirected to `/login` with a callback URL back to `/saved-searches`.
- Empty state shows a "Start Searching" link to `/search`.
- The `filters` field from the database (JSON) is cast to `SearchFilters` before passing to the client component.

### Server Actions

All server actions live in `/mnt/d/Documents/roomshare/src/app/actions/saved-search.ts`. Every action authenticates the user and scopes DB queries by `userId` to prevent unauthorized access.

#### `saveSearch(input: SaveSearchInput)`

Creates a new saved search.

```ts
interface SaveSearchInput {
    name: string;
    filters: SearchFilters;
    alertEnabled?: boolean;       // defaults to true
    alertFrequency?: AlertFrequency; // defaults to 'DAILY'
}
type AlertFrequency = 'INSTANT' | 'DAILY' | 'WEEKLY';
```

**Behavior:**
1. Authenticates user (returns `{ error: 'Unauthorized' }` if not logged in).
2. Checks count of existing saved searches; rejects if >= 10.
3. Validates filters via `validateSearchFilters()` to prevent malicious/malformed data.
4. Creates `SavedSearch` record in Prisma with the `query` extracted from validated filters.
5. Calls `revalidatePath('/saved-searches')`.
6. Returns `{ success: true, searchId }` on success.

#### `getMySavedSearches()`

Fetches all saved searches for the authenticated user, ordered by `createdAt DESC`. Returns an empty array if unauthenticated or on error.

#### `deleteSavedSearch(searchId: string)`

Deletes a saved search. The Prisma `where` clause includes both `id` and `userId`, ensuring users can only delete their own searches. Revalidates `/saved-searches` on success.

#### `toggleSearchAlert(searchId: string, enabled: boolean)`

Updates the `alertEnabled` field on a saved search. Same ownership guard via compound `where` clause.

#### `updateSavedSearchName(searchId: string, name: string)`

Updates the `name` field on a saved search. Same ownership guard.

**Error handling pattern** (all actions):
```ts
catch (error: unknown) {
    logger.sync.error('Failed to ...', {
        action: 'actionName',
        // context fields (no PII)
        error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { error: 'User-facing message' };
}
```

### Client Component: SavedSearchList

**File:** `/mnt/d/Documents/roomshare/src/app/saved-searches/SavedSearchList.tsx`

A `'use client'` component that manages the saved searches list with optimistic UI updates.

**Interface:**

```ts
interface SavedSearch {
    id: string;
    name: string;
    query: string | null;
    filters: SearchFilters;
    alertEnabled: boolean;
    lastAlertAt: Date | null;
    createdAt: Date;
}
```

**Features:**
- **Alert toggle**: Bell/BellOff icons; green highlight when enabled. Calls `toggleSearchAlert` server action and optimistically updates local state.
- **Delete**: Trash icon with browser `confirm()` dialog. Removes from local state on success.
- **View search**: "View" button that links to `buildSearchUrl(search.filters)` to re-run the search.
- **Filter summary**: `formatFilters()` renders a human-readable string from `SearchFilters` showing price range, room type, amenity count, and lease duration.
- **Loading states**: Per-item `loadingId` state shows a spinner on the active action button.

Each card displays:
- Search name (truncated)
- Filter summary
- Query text (if present)
- Created date
- Alert status indicator

---

## Search Alerts System

Alerts are configured per saved search with the following properties:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `alertEnabled` | `boolean` | `true` | Whether notifications are active |
| `alertFrequency` | `'INSTANT' \| 'DAILY' \| 'WEEKLY'` | `'DAILY'` | How often alerts are sent |
| `lastAlertAt` | `Date \| null` | `null` | Timestamp of the last sent alert |

**Alert toggle UI states:**
- Enabled: Green background (`bg-green-100`), green bell icon, "Alerts enabled" footer text.
- Disabled: Gray background (`bg-zinc-100`), muted bell-off icon.

The alert frequency is set at creation time via `saveSearch()`. The `toggleSearchAlert()` action only toggles the `alertEnabled` boolean. The actual alert delivery mechanism (email/push notification) is handled elsewhere in the system and is not part of these files.

---

## Type Definitions

### Listing Types

**File:** `/mnt/d/Documents/roomshare/src/types/listing.ts`

#### `PublicListing`

Cache-safe listing data transfer object. Contains **no user-specific data** and is safe for shared caches (CDN, `unstable_cache`).

```ts
export interface PublicListing {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  availableSlots: number;
  totalSlots: number;
  amenities: string[];
  houseRules: string[];
  householdLanguages: string[];
  primaryHomeLanguage?: string;
  leaseDuration?: string;
  roomType?: string;
  moveInDate?: Date;
  ownerId?: string;
  location: {
    address: string; city: string; state: string; zip: string;
    lat: number; lng: number;
  };
}
```

#### `PublicMapListing`

Minimal listing data for map markers. Also cache-safe.

```ts
export interface PublicMapListing {
  id: string;
  title: string;
  price: number;
  availableSlots: number;
  ownerId?: string;
  images: string[];
  location: { lat: number; lng: number; };
}
```

#### Cache Safety Utilities

Fields that must **never** appear in cached responses:

```ts
export const USER_SPECIFIC_FIELDS = [
  "isSaved", "viewedAt", "messageThread", "bookingStatus",
  "savedAt", "userNotes", "privateHostContact", "viewerSpecificRanking",
] as const;
```

Three utilities enforce cache safety:
- `isPublicListingSafe(obj)` -- type guard, returns `true` if no user-specific fields are present.
- `assertPublicListing(listing)` -- throws if user-specific fields are detected. Use at cache write boundaries.
- `assertPublicListings(listings)` -- validates an array, includes index in error message.

### Pagination Types

**File:** `/mnt/d/Documents/roomshare/src/types/pagination.ts`

Implements a **hybrid keyset/offset pagination** strategy:

| Sort Type | Pagination Method | Eligible Sorts |
|-----------|-------------------|----------------|
| Keyset | Cursor-based (no duplicates, no OFFSET degradation) | `newest`, `price_asc`, `price_desc` |
| Offset | Page-number-based (required for computed aggregates) | `recommended`, `rating` |

#### Key Types

```ts
export type KeysetSort = "newest" | "price_asc" | "price_desc";
export type OffsetSort = "recommended" | "rating";
export type SortOption = KeysetSort | OffsetSort;

export interface KeysetCursor {
  sortValue: number | string;  // price or createdAt ISO string
  id: string;                  // tie-breaking
  sort: KeysetSort;
}

export interface KeysetPaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
  hasPrevPage?: boolean;
  sort: KeysetSort;
  limit: number;
}

export interface OffsetPaginatedResult<T> {
  items: T[];
  total: number | null;     // exact if <= 100, null if > 100
  totalPages: number | null;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  page: number;             // 1-indexed
  limit: number;
  sort: OffsetSort;
}
```

#### Cursor Encoding

Cursors are encoded as **base64url** strings (URL-safe, no padding):

```ts
encodeCursor(cursor: KeysetCursor): string     // KeysetCursor -> base64url
decodeCursor(encoded: string): KeysetCursor | null  // base64url -> KeysetCursor (validated)
createCursorFromItem(item, sort): string       // listing -> encoded cursor
```

#### Type Guards

```ts
isKeysetEligible(sort: string): sort is KeysetSort
isKeysetResult<T>(result): result is KeysetPaginatedResult<T>  // checks for 'nextCursor'
isOffsetResult<T>(result): result is OffsetPaginatedResult<T>  // checks for 'page' + 'total'
```

### Nearby Places Types

**File:** `/mnt/d/Documents/roomshare/src/types/nearby.ts`

Types for the Nearby Places feature powered by the **Radar API**.

#### Core Types

```ts
export interface NearbyPlace {
  id: string; name: string; address: string; category: string;
  chain?: string; location: { lat: number; lng: number; };
  distanceMiles: number;
}

export interface NearbySearchRequest {
  listingLat: number; listingLng: number;
  query?: string; categories?: string[];
  radiusMeters: number; limit?: number;
}

export interface NearbySearchResponse {
  places: NearbyPlace[];
  meta: { cached: boolean; count: number; };
}
```

#### Category Chips

Six predefined category chips with Radar API categories:

| Label | Categories | Icon |
|-------|-----------|------|
| Grocery | `food-grocery`, `supermarket` | ShoppingCart |
| Restaurants | `restaurant`, `food-beverage` | Utensils |
| Shopping | `shopping-retail` | ShoppingBag |
| Gas Stations | `gas-station` | Fuel |
| Fitness | `gym`, `fitness-recreation` | Dumbbell |
| Pharmacy | `pharmacy` | Pill |

#### Radius Options

```ts
export const RADIUS_OPTIONS = [
  { label: '1 mi', meters: 1609 },
  { label: '2 mi', meters: 3218 },
  { label: '5 mi', meters: 8046 },
] as const;
```

#### Category Colors

`CATEGORY_COLORS` maps Radar API category strings to color configurations for both light and dark mode, including background, icon color, accent, and map marker colors. The `getCategoryColors(category)` function falls back to `'default'` colors with partial matching support.

### Search V2 Types

**File:** `/mnt/d/Documents/roomshare/src/lib/search/types.ts` (Lines 1-119)

The Search API v2 returns a unified response combining list results and map data in a single endpoint.

#### Constants

```ts
// Re-exported from @/lib/constants for backward compatibility
export const CLUSTER_THRESHOLD = 50;    // >= 50 listings = 'geojson' mode, < 50 = 'pins' mode
export const BOUNDS_EPSILON = 0.001;    // ~100m precision for cache key normalization
```

**Source file for constants:** `/mnt/d/Documents/roomshare/src/lib/constants.ts`

#### Response Structure

```ts
export interface SearchV2Response {
  meta: SearchV2Meta;   // queryHash, generatedAt, mode, debug signals
  list: SearchV2List;   // items[], nextCursor, total
  map: SearchV2Map;     // geojson (always), pins (when mode='pins')
}
```

**Mode determination:** If `mapListings.length >= 50`, mode is `'geojson'` (Mapbox clustering). Otherwise mode is `'pins'` (individual tiered markers).

**List items:**

```ts
export interface SearchV2ListItem {
  id: string; title: string; price: number | null; image: string | null;
  lat: number; lng: number;
  badges?: string[];        // e.g., 'near-match', 'multi-room'
  scoreHint?: number | null; // debug/sorting relevance
}
```

**Map pins (sparse mode):**

```ts
export interface SearchV2Pin {
  id: string; lat: number; lng: number;
  price?: number | null;
  tier?: "primary" | "mini";
  stackCount?: number;
}
```

**GeoJSON types:**

```ts
/** Properties for GeoJSON point features */
export interface SearchV2FeatureProperties {
  id: string;
  title: string;
  price: number | null;
  image: string | null;
  availableSlots: number;
  ownerId: string;
}

/** A single point feature for the map */
export type SearchV2Feature = Feature<Point, SearchV2FeatureProperties>;

/** GeoJSON FeatureCollection for Mapbox clustering */
export type SearchV2GeoJSON = FeatureCollection<Point, SearchV2FeatureProperties>;
```

**Debug signals** (when `?debugRank=1`):

```ts
export interface SearchV2DebugSignals {
  id: string; quality: number; rating: number;
  price: number; recency: number; geo: number; total: number;
}
```

**Metadata:**

```ts
export interface SearchV2Meta {
  /** 16-char SHA256 hash of query params (bounds quantized with BOUNDS_EPSILON) */
  queryHash: string;
  /** ISO timestamp when response was generated */
  generatedAt: string;
  /** Mode based on mapListings.length: 'geojson' if >= 50, 'pins' if < 50 */
  mode: SearchV2Mode;
  /** Ranking version (debug only, when ?debugRank=1) */
  rankingVersion?: string;
  /** Whether ranking was applied (debug only) */
  rankingEnabled?: boolean;
  /** Top signals for debugging (capped at 5, no PII, debug only) */
  topSignals?: SearchV2DebugSignals[];
}
```

### Filter Suggestions

**File:** `/mnt/d/Documents/roomshare/src/app/actions/filter-suggestions.ts`

A server action that lazily fetches filter suggestions when the user clicks "Show suggestions" on a zero-results page. This avoids computing suggestions automatically on every zero-result render, reducing DB load.

```ts
export async function getFilterSuggestions(
  params: FilterParams,
): Promise<FilterSuggestion[]> {
  return analyzeFilterImpact(params);
}
```

---

## Search V1/V2 Data Flow Components

Two client components manage the transition between the v1 and v2 search data pipelines:

### V2MapDataSetter

**File:** `/mnt/d/Documents/roomshare/src/components/search/V2MapDataSetter.tsx`

Rendered by `page.tsx` when v2 search succeeds. Injects v2 map data into `SearchV2DataContext` so `PersistentMapWrapper` can consume it.

```
page.tsx (server) -> V2MapDataSetter (client) -> context -> PersistentMapWrapper
```

Sets `isV2Enabled = true` and `v2MapData = data`. Cleanup is intentionally omitted to avoid a race condition during "search as I move" where URL changes frequently.

### V1PathResetSetter

**File:** `/mnt/d/Documents/roomshare/src/components/search/V1PathResetSetter.tsx`

The mirror of `V2MapDataSetter`. When v2 fails and v1 fallback runs, this component resets:
- `isV2Enabled = false` (stops `PersistentMapWrapper`'s race guard from waiting)
- `v2MapData = null` (clears stale data)

This prevents a deadlock where the map wrapper loops waiting for v2 data that will never arrive.

---

## Natural Language Parser

**File:** `/mnt/d/Documents/roomshare/src/lib/search/natural-language-parser.ts` (Lines 1-230)

Extracts structured filter params from natural language queries using pattern matching and keyword extraction (no LLM needed).

### Interface

```ts
export interface ParsedNLQuery {
  location: string;
  minPrice?: string;
  maxPrice?: string;
  roomType?: string;
  amenities: string[];
  houseRules: string[];
  leaseDuration?: string;
}
```

### Supported Patterns

#### Price Patterns
| Pattern | Example | Extraction |
|---------|---------|------------|
| under/below/less than/max/up to | "under $1000" | `maxPrice: "1000"` |
| over/above/more than/min/at least | "over $800" | `minPrice: "800"` |
| range with dash/to | "$800-$1200" | `minPrice: "800", maxPrice: "1200"` |
| between X and Y | "between $800 and $1200" | `minPrice: "800", maxPrice: "1200"` |

#### Room Type Patterns
| Pattern | Extracted Value |
|---------|-----------------|
| private room, private | `"Private Room"` |
| shared room, shared | `"Shared Room"` |
| entire place, whole place, entire home, full apartment, studio | `"Entire Place"` |

#### Amenity Patterns (Lines 74-84)
Recognized: wifi/wi-fi/internet, ac/air conditioning, parking/garage, washer/laundry, dryer, kitchen/cook, gym/fitness, pool/swimming, furnished/furniture

#### House Rule Patterns (Lines 86-91)
Recognized: pet friendly/pets allowed/dog/cat, smoking ok/allowed, couples ok/allowed, guests ok/allowed

#### Lease Duration Patterns (Lines 93-118)
| Pattern | Extracted Value |
|---------|-----------------|
| month-to-month, mtm, monthly, short-term, temporary | `"Month-to-month"` |
| flexible, flex | `"Flexible"` |
| 3 month | `"3 months"` |
| 6 month | `"6 months"` |
| 12 month, 1 year, yearly, annual | `"12 months"` |

### URL Conversion

```ts
export function nlQueryToSearchParams(parsed: ParsedNLQuery): URLSearchParams
```

Converts parsed query to URL search params, omitting empty fields.

---

## Split Stay Logic

**File:** `/mnt/d/Documents/roomshare/src/lib/search/split-stay.ts` (Lines 1-56)

Finds complementary listing pairs for long stays where no single listing covers all dates.

### Interface

```ts
export interface SplitStayPair {
  first: ListingData;
  second: ListingData;
  /** Total combined price for the full stay */
  combinedPrice: number;
  /** Label like "2 weeks + 2 weeks" */
  splitLabel: string;
}
```

### Function

```ts
export function findSplitStays(
  listings: ListingData[],
  stayMonths?: number,
): SplitStayPair[]
```

**Behavior:**
- Returns empty array if `stayMonths < 6` or `listings.length < 2`
- Sorts listings by price to pair budget-friendly with premium options
- Returns up to 2 pairs maximum
- Generates label like `"3 mo + 3 mo"` for a 6-month stay
- Calculates `combinedPrice` as: `first.price * halfMonths + second.price * remainderMonths`

---

## Search Ranking System

**Directory:** `/mnt/d/Documents/roomshare/src/lib/search/ranking/`

Heuristic-based ranking system that scores listings for map pin tiering and search result ordering.

### Types

**File:** `/mnt/d/Documents/roomshare/src/lib/search/ranking/types.ts` (Lines 1-96)

```ts
export interface RankingContext {
  sort: string;
  center?: { lat: number; lng: number };
  localMedianPrice?: number;
  debug?: boolean;
}

export interface RankingWeights {
  quality: number;  // Pre-computed from SearchDoc
  rating: number;   // With review count confidence adjustment
  price: number;    // Relative to local median
  recency: number;  // Listing age decay
  geo: number;      // Distance from map center
}

export interface RankableListing {
  id: string;
  recommendedScore?: number | null;
  avgRating?: number | null;
  reviewCount?: number | null;
  price?: number | null;
  createdAt?: Date | string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface DebugSignals {
  id: string;
  quality: number;
  rating: number;
  price: number;
  recency: number;
  geo: number;
  total: number;
}
```

### Scoring Functions

**File:** `/mnt/d/Documents/roomshare/src/lib/search/ranking/score.ts`

| Function | Description |
|----------|-------------|
| `normalizeRecommendedScore(score)` | Normalizes 0-100+ score to 0-1, returns 0.3 for null/negative |
| `normalizeRating(rating, reviewCount)` | Bayesian average with prior of 3.5 |
| `normalizePriceCompetitiveness(price, median)` | Gaussian decay around median price |
| `normalizeRecency(date)` | Exponential decay with 30-day half-life |
| `normalizeDistance(lat, lng, center)` | Exponential decay with 5km half-life |
| `computeMedianPrice(listings)` | Ignores null/zero prices |
| `getBoundsCenter(bounds)` | Returns center point of bounds |
| `computeScore(listing, context)` | Weighted combination of all signals |
| `computeSignals(listing, context)` | Returns individual signal values |

**Default Weights** (sum to 1.0):
- `quality`: 0.35
- `rating`: 0.25
- `price`: 0.15
- `recency`: 0.15
- `geo`: 0.10

### Ranking Functions

**File:** `/mnt/d/Documents/roomshare/src/lib/search/ranking/rank.ts`

| Function | Description |
|----------|-------------|
| `buildScoreMap(listings, context)` | Returns `Map<id, score>` for all listings |
| `rankListings(items, scoreMap)` | Sorts by score descending, stable tie-break by id |
| `getDebugSignals(listings, scoreMap, context, limit)` | Returns top N debug signals (no PII) |

---

## Scripts and Maintenance Tooling

### backfill-search-docs.ts

**File:** `/mnt/d/Documents/roomshare/src/scripts/backfill-search-docs.ts`

Populates the `listing_search_docs` table from existing `Listing`, `Location`, and `Review` data. Used for initial population and disaster recovery.

**Usage:**

```bash
# Preview (no database changes)
npx ts-node src/scripts/backfill-search-docs.ts --dry-run

# Execute backfill
npx ts-node src/scripts/backfill-search-docs.ts --i-understand

# Custom batch size
npx ts-node src/scripts/backfill-search-docs.ts --i-understand --batch-size 50
```

**Properties:**
- **Batch processing**: Default batch size of 100, configurable via `--batch-size`.
- **Idempotent**: Uses `ON CONFLICT (id) DO UPDATE` (upsert). Safe to re-run.
- **Safety flag**: Requires `--i-understand` for writes. Without it, the script exits with an error.
- **Dry-run mode**: `--dry-run` previews what would happen without writing.
- **Progress logging**: Logs batch progress and a summary with statistics.
- **Error resilience**: Continues to next batch on failure; reports all errors at the end.

**What it computes:**

For each listing with a location:
1. Joins `Listing` + `Location` + `Review` tables via raw SQL.
2. Computes `recommended_score = avg_rating * 20 + view_count * 0.1 + review_count * 5`.
3. Creates lowercase arrays for case-insensitive filtering (`amenities_lower`, `house_rules_lower`, `household_languages_lower`).
4. Stores geography data via `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`.

**Output stats:**

```
SUMMARY
  Mode: DRY-RUN | LIVE
  Listings processed: N
  Search docs created/updated: N
  Listings skipped (no location): N
  Errors: N
```

---

## Unit Test Coverage

Comprehensive unit tests ensure search system correctness, idempotence, and security.

### Search Module Tests

**Directory:** `/mnt/d/Documents/roomshare/src/__tests__/lib/search/`

#### Cursor Tests

**File:** `cursor.test.ts` (42 tests)

Tests keyset cursor encoding, decoding, and cursor building for stable pagination.

| Coverage Area | Test Count |
|---------------|------------|
| Encode/decode roundtrip | 8 |
| Decode validation | 8 |
| Key count validation per sort | 5 |
| `buildCursorFromRow` | 7 |
| `decodeLegacyCursor` | 5 |
| `decodeCursorAny` | 5 |
| `SORT_OPTIONS` constant | 2 |

**Key scenarios:**
- Validates version, sort option, id presence, key count
- Returns null for invalid base64, malformed JSON, wrong version
- Validates cursor sort matches expected sort
- Legacy cursor detection and fallback

#### FTS Database Tests

**File:** `fts-db.test.ts` (7 tests)

Database assertions verifying Full-Text Search infrastructure against PostgreSQL.

**Gate:** `RUN_DB_ASSERTIONS=1 pnpm test src/__tests__/lib/search/fts-db.test.ts`

| Check | Description |
|-------|-------------|
| CHECK 1 | Trigger populates `search_tsv` on INSERT |
| CHECK 2 | GIN index `search_doc_tsv_gin_idx` exists |
| CHECK 3 | Null-safe tsvector build (COALESCE protection) |
| CHECK 4 | `plainto_tsquery` AND semantics, case-insensitive |
| CHECK 6 | Trigger is column-specific (UPDATE OF clause) |

#### FTS Query Tests

**File:** `fts-query.test.ts` (15 tests)

Tests FTS query helpers (`sanitizeSearchQuery`, `isValidQuery`).

| Coverage Area | Test Count |
|---------------|------------|
| Query sanitization | 5 |
| Query validation | 4 |
| Edge cases (case, whitespace, numbers, hyphens) | 6 |

#### Hash Tests

**File:** `hash.test.ts` (25 tests)

Tests query hash generation and cursor encoding for pagination.

| Coverage Area | Test Count |
|---------------|------------|
| Hash generation | 12 |
| Bounds quantization | 3 |
| Cursor encoding | 3 |
| Cursor decoding | 7 |

**Key scenarios:**
- Same hash for same params in different order
- Same hash for arrays in different order
- Case-insensitive for query, roomType, leaseDuration
- Bounds quantization within BOUNDS_EPSILON

#### Keyset Pagination Tests

**File:** `keyset-pagination.test.ts` (12 tests)

Integration tests for keyset pagination service layer.

| Coverage Area | Test Count |
|---------------|------------|
| Service layer keyset integration | 8 |
| Keyset disabled fallback | 1 |
| Cursor building | 3 |

**Key scenarios:**
- First page vs cursor-based subsequent pages
- No duplicate items across pages
- Legacy cursor migration to keyset
- Sort mismatch validation

#### Search Doc Dirty Tests

**File:** `search-doc-dirty.test.ts` (8 tests)

Tests `markListingDirty` and `markListingsDirty` functions.

| Coverage Area | Test Count |
|---------------|------------|
| `markListingDirty` | 3 |
| `markListingsDirty` | 5 |

#### Search Doc Queries Tests

**File:** `search-doc-queries.test.ts` (10 tests)

Tests feature flag logic for SearchDoc queries.

| Coverage Area | Test Count |
|---------------|------------|
| URL override precedence | 4 |
| Environment variable fallback | 4 |
| Edge cases | 2 |

#### Search Orchestrator Tests

**File:** `search-orchestrator.test.ts` (5 tests)

Tests v2 to v1 fallback behavior.

| Coverage Area | Test Count |
|---------------|------------|
| v2 null response fallback | 1 |
| v2 success (no v1 call) | 1 |
| v2 disabled direct v1 | 1 |
| Both v1 and v2 fail | 1 |
| Non-Error v1 exception | 1 |

#### Transform Tests

**File:** `transform.test.ts` (32 tests)

Tests data transformation from existing shapes to v2 response format.

| Coverage Area | Test Count |
|---------------|------------|
| `determineMode` | 3 |
| `shouldIncludePins` | 4 |
| `transformToListItem` | 5 |
| `transformToListItems` | 2 |
| `transformToGeoJSON` | 6 |
| `transformToPins` | 8 |
| `transformToMapResponse` | 6 |

**Key scenarios:**
- GeoJSON coordinate order [lng, lat]
- Pin tiering (primary vs mini)
- Pin stacking at same coordinates
- Threshold boundary behavior (49 vs 50 listings)

#### Hybrid Count Threshold Tests

**File:** `hybrid-count-threshold.test.ts` (12 tests)

Tests HYBRID_COUNT_THRESHOLD (100) behavior in `getSearchDocLimitedCount()`.

| Coverage Area | Test Count |
|---------------|------------|
| Threshold behavior | 6 |
| Filters interaction | 3 |
| Text search + hybrid count | 3 |

**Key scenarios:**
- Returns exact count when count <= 100
- Returns null when count > 100
- Boundary cases at 100 and 101
- LIMIT 101 subquery pattern verification

#### Unbounded Browse Protection Tests

**File:** `unbounded-browse-protection.test.ts` (21 tests)

Tests protection against full-table scans on browse-all queries.

| Coverage Area | Test Count |
|---------------|------------|
| `getSearchDocLimitedCount` | 4 |
| `getSearchDocMapListings` | 4 |
| `getSearchDocListingsPaginated` | 4 |
| FeaturedListings compatibility | 1 |
| V1 fallback protection | 8 |

**Key constants:**
- `MAX_UNBOUNDED_RESULTS = 48` (4 pages of 12 items)
- `MAX_BROWSE_PAGES = 4`

### Ranking Module Tests

**Directory:** `/mnt/d/Documents/roomshare/src/lib/search/ranking/__tests__/`

#### Rank Tests

**File:** `rank.test.ts` (17 tests)

| Coverage Area | Test Count |
|---------------|------------|
| `buildScoreMap` | 4 |
| `rankListings` | 7 |
| `getDebugSignals` | 6 |

**Key scenarios:**
- Score determinism
- Stable tie-break by id
- Does not modify original array
- Debug signals capped at limit, no PII

#### Score Tests

**File:** `score.test.ts` (38 tests)

| Coverage Area | Test Count |
|---------------|------------|
| `normalizeRecommendedScore` | 5 |
| `normalizeRating` | 6 |
| `normalizePriceCompetitiveness` | 5 |
| `normalizeRecency` | 7 |
| `normalizeDistance` | 5 |
| `computeMedianPrice` | 5 |
| `getBoundsCenter` | 1 |
| `computeScore` | 4 |
| `computeSignals` | 2 |

**Key scenarios:**
- Bayesian average for ratings
- Symmetric price decay in log space
- 30-day half-life for recency
- 5km half-life for distance
- Weights sum to 1.0

### Natural Language Parser Tests

**File:** `/mnt/d/Documents/roomshare/src/lib/search/__tests__/natural-language-parser.test.ts` (18 tests)

| Coverage Area | Test Count |
|---------------|------------|
| Empty/plain location input | 3 |
| Price extraction | 5 |
| Room type extraction | 2 |
| Amenity extraction | 1 |
| House rules extraction | 1 |
| Lease duration extraction | 2 |
| Location extraction | 2 |
| `nlQueryToSearchParams` | 2 |

### Filter Schema Tests

**File:** `/mnt/d/Documents/roomshare/src/__tests__/lib/filter-schema.test.ts`

Tests the canonical filter schema and `normalizeFilters()` function.

**Coverage areas:**
- **Basic normalization** (10 tests): Handles undefined, null, empty objects, non-object inputs
- **Query string normalization** (6 tests): Whitespace trimming, unicode preservation, empty string removal
- **Price filters** (10 tests): Valid prices, negative clamping, MAX_SAFE_PRICE limits, **P1-13 fix**: throws error when `minPrice > maxPrice` (security), exact price filter, decimal prices
- **Amenities** (8 tests): Valid amenities, case normalization, invalid value dropping, deduplication, comma-separated strings, MAX_ARRAY_ITEMS limiting
- **House Rules** (3 tests): Valid rules, case normalization, invalid value filtering
- **Languages** (6 tests): Language code validation, legacy name normalization, case handling, deduplication
- **Enum fields** (15 tests): roomType, leaseDuration, genderPreference, householdGender with "any" handling and case normalization
- **Date validation** (9 tests): Valid future dates, past date rejection, 2-year future limit, invalid format/date handling
- **Bounds validation** (10 tests): Valid bounds, lat/lng clamping to valid ranges, **P1-13 fix**: throws error on inverted lat bounds, antimeridian handling
- **Sort options** (4 tests): All valid sorts, case normalization, invalid value handling
- **Pagination** (7 tests): Default values, page/limit clamping, string parsing
- **Idempotence** (1 test): Normalizing twice yields same result
- **validateFilters** (3 tests): Success cases, graceful invalid handling, **P1-13 fix**: returns error for inverted price ranges
- **isEmptyFilters** (6 tests): Default filter detection, query/price/amenity detection, sort/pagination ignoring
- **filtersToSearchParams** (3 tests): URL param conversion, default omission, bounds inclusion
- **Security tests** (6 tests): SQL injection, XSS, prototype pollution, long queries, nested objects

**Total:** 100+ test cases

### useBatchedFilters Hook Tests

**File:** `/mnt/d/Documents/roomshare/src/__tests__/hooks/useBatchedFilters.test.ts`

Tests the batched filter state management hook used for debounced filter updates.

**Coverage areas:**
- **readFiltersFromURL** (13 tests): URL param parsing, scalar/array params, clamping, validation, aliases, deduplication, invalid value filtering
- **isDirty computation** (4 tests): Pending vs committed state equality, scalar/array differences, order independence
- **Commit URL building** (3 tests): Filter param building, non-filter preservation, pagination deletion
- **Reset behavior** (1 test): Restoring committed values
- **setPending merging** (3 tests): Partial updates, overwrites, rapid update handling

**Total:** 24 test cases

### Property-Based Filter Tests

**File:** `/mnt/d/Documents/roomshare/src/__tests__/property/filter-properties.test.ts`

Property-based tests using `fast-check` to verify filter invariants hold for **any** valid input.

**12 Core Invariants tested:**
1. **Idempotence** (2 properties): Normalizing twice = normalizing once, no input mutation
2. **Order Independence** (3 properties): Array filter order doesn't affect results, applying filters in different order yields same results
3. **Monotonicity** (4 properties): Adding filters reduces or maintains result count
4. **Subset Rule** (1 property): Combined filter results are subset of individual filter results
5. **Pagination Consistency** (2 properties): No duplicates across pages, total coverage
6. **Count Consistency** (1 property): Total matches actual item count
7. **Sorting Correctness** (4 properties): price_asc, price_desc, newest, rating all sort correctly
8. **Safety** (4 properties): Graceful handling of arbitrary input, extreme numbers, inverted ranges throw, malformed objects
9. **Determinism** (2 properties): Same input always produces same output
10. **Bounds Integrity** (2 properties): All results fall within bounds, inverted lat throws
11. **Filter Match Accuracy** (4 properties): Price, roomType, amenities, languages all match correctly
12. **SQL Injection Resistance** (3 properties): SQL injection payloads don't crash or bypass validation

**Fuzz Testing** (2 tests): Random filter combinations, completely random objects

**Total:** 100+ property tests (each with 20-200 random inputs)

---

## E2E Test Coverage

Four Playwright test suites cover the search and saved searches features. All tests use custom helper fixtures (`nav`, `assert`, `network`) and shared selectors/constants from `tests/e2e/helpers`.

### Suite 1: Discovery and Search Journeys

**File:** `tests/e2e/journeys/01-discovery-search.spec.ts`

| Journey | Description | Tags |
|---------|-------------|------|
| J001 | Home page discovery flow: featured listings, click listing, back nav, search CTA | anon, mobile, a11y |
| J001b | Empty state when no featured listings (mocked) | anon |
| J002 | Price filter via URL params, UI reflection, refresh persistence | anon, mobile |
| J002b | Zero results shows "No matches" heading or "0 places" indicator | anon |
| J003 | Listing detail: heading, price, image gallery, amenities, host link | anon, a11y |
| J003b | 404 for non-existent listing | anon |
| J004 | Map view: toggle, markers, popup on marker click | anon, slow |
| J005 | Sort by price and date via select dropdown | anon |
| J006 | Pagination: next/previous page navigation | anon, mobile |
| J007-J010 | Search page accessibility: form labels, input labeling | a11y |

**Total:** 11 journeys

### Suite 2: Critical Search Page Journeys

**File:** `tests/e2e/journeys/02-search-critical-journeys.spec.ts`

| Journey | Description |
|---------|-------------|
| J1 | Search page loads with result count heading and listing cards |
| J2 | Price filters applied via URL, reflected in inputs |
| J3 | Room type category tabs filter results and update URL |
| J4 | Filter modal: select amenity (Wifi), apply, URL updates |
| J5 | Clear all filters resets URL params |
| J6 | Sort by price low-to-high (desktop only) |
| J7 | Pagination: next page, back to page 1 |
| J8 | Zero results shows suggestions and "Clear all filters" link |
| J9 | Clicking listing card navigates to detail page |
| J10 | Browser back preserves filter params |
| J11 | Lease duration filter via Radix select in modal |
| J12 | House rules filter toggle (Pets allowed) |
| J13 | Gender preference filter via Radix select |
| J14 | Filter pill removal via X button |
| J15 | Text search query (`q=cozy`) shows results |
| J16 | Page refresh preserves filters and sort |
| J17 | Map toggle shows/hides map view |
| J18 | Search without bounds shows location prompt |
| J19 | Rate limit (429 mock) shows friendly error |
| J20 | Mobile layout: responsive cards, filter modal open/close |
| J-A11Y | Accessibility: aria-live, pagination aria labels |

**Total:** 21 journeys

### Suite 3: Advanced Search Page Journeys

**File:** `tests/e2e/journeys/03-search-advanced-journeys.spec.ts`

**Section A: Multi-Filter Combinations (J21-J25)**

| Journey | Description |
|---------|-------------|
| J21 | Combined price + amenity + lease duration filters |
| J22 | Gender preference + household gender combination |
| J23 | Multiple amenities and house rules toggled with aria-pressed |
| J24 | Room type tab + price + sort all combined |
| J25 | Apply multiple filters then clear all resets everything |

**Section B: Form Validation and Edge Cases (J26-J31)**

| Journey | Description |
|---------|-------------|
| J26 | Price auto-swap when min exceeds max |
| J27 | Past move-in date in URL is stripped on load |
| J28 | Valid future move-in date in URL is preserved |
| J29 | Price inputs handle zero and empty values |
| J30 | Negative price in URL is clamped to 0 |
| J31 | XSS payloads in URL params do not execute (no alert dialogs) |

**Section C: Keyboard and Accessibility (J32-J36)**

| Journey | Description |
|---------|-------------|
| J32 | Escape key closes filter modal |
| J33 | Tab navigation through filter modal (focus trap) |
| J34 | Screen reader announcements via aria-live |
| J35 | Amenity toggle buttons report correct aria-pressed state |
| J36 | Pagination controls have proper ARIA attributes |

**Section D: Pagination and Navigation (J37-J41)**

| Journey | Description |
|---------|-------------|
| J37 | Previous button disabled on first page |
| J38 | Page 2 preserves all active filters |
| J39 | Browser back from page 2 returns to page 1 |
| J40 | "Showing X to Y of Z" text is correct |
| J41 | Direct page number navigation |

**Section E: State Persistence and URL Sync (J42-J46)**

| Journey | Description |
|---------|-------------|
| J42 | Deep link with every filter type loads correctly |
| J43 | Filter pills appear for active filters with remove buttons |
| J44 | Removing one filter pill keeps other filters intact |
| J45 | Forward/back navigation through filter change history |
| J46 | Changing sort resets pagination to page 1 |

**Section F: Responsive and Mobile (J47-J50)**

| Journey | Description |
|---------|-------------|
| J47 | Tablet viewport (768px) layout |
| J48 | Mobile filter modal is scrollable |
| J49 | Wide desktop (1920px) full layout |
| J50 | Mobile pagination touch targets (>= 36px) |

**Section G: Performance and Loading States (J51-J53)**

| Journey | Description |
|---------|-------------|
| J51 | Loading indicator (aria-busy) during search transitions |
| J52 | No layout shift on initial load (min-height on filter bar) |
| J53 | Rapid sequential filter changes handle gracefully (no crash) |

**Section H: Language Filters (J54-J55)**

| Journey | Description |
|---------|-------------|
| J54 | Language filter search, select, and apply |
| J55 | Select and deselect multiple languages |

**Total:** 35+ journeys

### Suite 4: Favorites and Saved Searches Journeys

**File:** `tests/e2e/journeys/04-favorites-saved-searches.spec.ts`

All tests use **authenticated storage state** (`playwright/.auth/user.json`).

| Journey | Description | Tags |
|---------|-------------|------|
| J027 | Toggle favorite on listing card (aria-pressed state change) | auth, mobile |
| J027b | View saved listings page (heading, listings or empty state) | auth |
| J028 | Remove listing from saved page (unsave button, count decreases) | auth |
| J029 | Save search with filters: name input, alert frequency, confirmation toast | auth |
| J030 | View saved searches page: heading, search items or empty state | auth |
| J031 | Delete saved search with confirmation dialog | auth |
| J032 | Run saved search: click navigates to `/search?...` | auth |
| J033 | Toggle search alerts (checkbox state change) | auth |
| J035-J036 | View recently viewed listings (populate history, check page) | auth |

**Total:** 9 journeys

### Test Coverage Summary

| Category | Journey Count | Key Assertions |
|----------|--------------|----------------|
| Discovery and home page | 11 | Page load, empty state, 404 |
| Search filters (basic) | 21 | Price, room type, amenities, lease, sort |
| Search filters (advanced) | 35+ | Multi-filter combos, edge cases, validation |
| Accessibility | 11 | aria-pressed, aria-live, focus trap, ARIA labels |
| Pagination | 8 | Next/prev, page numbers, filter preservation |
| State persistence | 6 | Deep links, URL sync, forward/back history |
| Responsive/mobile | 5 | Mobile, tablet, desktop viewports, touch targets |
| Performance | 3 | Loading states, CLS, rapid filter changes |
| Security | 1 | XSS payload rejection |
| Map | 2 | Map toggle, marker interaction |
| Favorites | 3 | Save/unsave, view saved, remove |
| Saved searches | 6 | Create, view, delete, run, toggle alerts |
| Recently viewed | 1 | View history page |
| **Total E2E** | **~113** | Comprehensive coverage across all features |

### Additional Unit Test Coverage

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `cursor.test.ts` | 42 | Keyset cursor encoding/decoding/validation |
| `fts-db.test.ts` | 7 | FTS database assertions |
| `fts-query.test.ts` | 15 | FTS query helpers |
| `hash.test.ts` | 25 | Query hash and cursor encoding |
| `keyset-pagination.test.ts` | 12 | Keyset pagination integration |
| `search-doc-dirty.test.ts` | 8 | Dirty flag helpers |
| `search-doc-queries.test.ts` | 10 | Feature flag logic |
| `search-orchestrator.test.ts` | 5 | v2/v1 fallback |
| `transform.test.ts` | 32 | Data transformation |
| `hybrid-count-threshold.test.ts` | 12 | Hybrid count optimization |
| `unbounded-browse-protection.test.ts` | 21 | Browse protection |
| `rank.test.ts` | 17 | Ranking functions |
| `score.test.ts` | 38 | Scoring functions |
| `natural-language-parser.test.ts` | 18 | NL parsing |
| `filter-schema.test.ts` | 100+ | Filter normalization, validation, security |
| `useBatchedFilters.test.ts` | 24 | Hook state management, URL parsing |
| `filter-properties.test.ts` | 100+ | Property-based tests for 12 invariants |
| **Total Unit** | **~486** | Comprehensive search system validation |

### Combined Test Coverage

**Total Tests:** ~599 (113 E2E + 486 unit)
**Coverage Areas:** Filter system, search UX, saved searches, pagination, accessibility, security, performance, ranking, FTS, natural language parsing
**Test Strategies:** Unit, integration, E2E, property-based, fuzz testing, database assertions
