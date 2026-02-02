# Search API Routes & Server Endpoints

Comprehensive reference for all API routes that power the Roomshare search experience: listing search, map data, faceted filtering, counts, and background data refresh.

---

## Table of Contents

- [GET /api/search/v2](#get-apisearchv2)
- [GET /api/search/facets](#get-apisearchfacets)
- [GET /api/search-count](#get-apisearch-count)
- [GET /api/map-listings](#get-apimap-listings)
- [GET /api/listings](#get-apilistings)
- [POST /api/listings](#post-apilistings)
- [PATCH /api/listings/[id]](#patch-apilistingsid)
- [POST /api/reviews](#post-apireviews)
- [PUT /api/reviews](#put-apireviews)
- [DELETE /api/reviews](#delete-apireviews)
- [GET /api/cron/refresh-search-docs](#get-apicronrefresh-search-docs)
- [GET /api/cron/search-alerts](#get-apicronsearch-alerts)
- [Rate Limiting Summary](#rate-limiting-summary)
- [Shared Infrastructure](#shared-infrastructure)

---

## GET /api/search/v2

**File**: `src/app/api/search/v2/route.ts`

**Purpose**: Unified search endpoint returning both list results and map data in a single response. Delegates to `search-v2-service.ts` for searchDoc-based querying, keyset pagination, and ranking.

### Feature Flag

The endpoint is gated behind a feature flag. It is enabled when either condition is true:

- `ENABLE_SEARCH_V2` env var is truthy (checked via `features.searchV2`)
- URL param `?v2=1` or `?v2=true` is present (testing override)

If disabled, returns `404`.

### Request

| Param | Type | Description |
|-------|------|-------------|
| `v2` | `string` | Optional. `"1"` or `"true"` to enable the endpoint for testing. |
| All standard search/filter params | various | Passed through `buildRawParamsFromSearchParams()` to the v2 service. Includes `q`, `minPrice`, `maxPrice`, `amenities`, `houseRules`, `roomType`, `leaseDuration`, `moveInDate`, `languages`, bounds (`minLat`, `maxLat`, `minLng`, `maxLng` or `lat`/`lng`), `sort`, cursor params, etc. |

### Response

**200 OK -- Normal results**:

```jsonc
{
  "list": { /* paginated listing results */ },
  "map": {
    "geojson": { /* GeoJSON FeatureCollection -- ALWAYS present */ },
    "pins": [ /* tiered pins -- ONLY when mode='pins' */ ]
  },
  "meta": {
    "mode": "geojson" | "pins",  // "geojson" when >=50 mapListings, "pins" otherwise
    "queryHash": "...",
    "generatedAt": "2026-01-31T..."
  }
}
```

**200 OK -- Unbounded search** (text query without geographic bounds):

```json
{
  "unboundedSearch": true,
  "list": null,
  "map": null,
  "meta": { "mode": "pins", "queryHash": null, "generatedAt": "..." }
}
```

This signals the client to prompt the user for a location. Not an error.

**Other status codes**:

| Status | Condition |
|--------|-----------|
| 404 | v2 feature flag disabled |
| 429 | Rate limited |
| 503 | Service returned an error or `result.response` is null |
| 500 | Unhandled exception |

### Caching

```
Cache-Control: public, s-maxage=60, max-age=30, stale-while-revalidate=120
```

CDN caches for 60s, browser for 30s, with stale-while-revalidate up to 120s. Unbounded search responses use `no-cache, no-store`.

### Rate Limiting

Uses Redis-backed rate limiting (`withRateLimitRedis`) with type `"map"` (burst: 60 req, sustained: 300 req).

### Key Code

```ts
// Feature flag check
function isV2Enabled(request: NextRequest): boolean {
  if (features.searchV2) return true;
  const v2Param = request.nextUrl.searchParams.get("v2");
  return v2Param === "1" || v2Param === "true";
}

// Delegation to shared service
const rawParams = buildRawParamsFromSearchParams(searchParams);
const result = await executeSearchV2({ rawParams });
```

### Service Layer Connection

- `buildRawParamsFromSearchParams()` from `@/lib/search-params` -- normalizes URL params
- `executeSearchV2()` from `@/lib/search/search-v2-service` -- orchestrates searchDoc queries, keyset pagination, ranking, GeoJSON generation

---

## GET /api/search/facets

**File**: `src/app/api/search/facets/route.ts`

**Purpose**: Returns facet counts for all filter options (amenities, house rules, room types, price ranges, price histogram) based on current filter state. Used by the filter drawer to show how many listings match each option.

### Request

All standard search/filter params as query string. Supports repeated params and CSV values.

| Param | Type | Description |
|-------|------|-------------|
| `q` | `string` | Text search query |
| `minPrice` / `maxPrice` | `number` | Price range |
| `amenities` | `string[]` | Selected amenities |
| `houseRules` | `string[]` | Selected house rules |
| `roomType` | `string` | Room type filter |
| `leaseDuration` | `string` | Lease duration filter |
| `moveInDate` | `string` | `YYYY-MM-DD` format |
| `languages` | `string[]` | Household languages |
| `minLat`, `maxLat`, `minLng`, `maxLng` | `number` | Explicit bounds |
| `lat`, `lng` | `number` | Center point (derives ~10km bounds) |

### Response Shape

```ts
interface FacetsResponse {
  amenities: Record<string, number>;    // e.g. { "Wifi": 45, "Parking": 23 }
  houseRules: Record<string, number>;   // e.g. { "Pets allowed": 30 }
  roomTypes: Record<string, number>;    // e.g. { "Private Room": 50 }
  priceRanges: {
    min: number | null;
    max: number | null;
    median: number | null;
  };
  priceHistogram: {
    bucketWidth: number;
    buckets: { min: number; max: number; count: number }[];
  } | null;
}
```

| Status | Condition |
|--------|-----------|
| 200 | Success |
| 400 | Query present but no bounds (DoS prevention) or invalid coordinates |
| 429 | Rate limited |
| 500 | Server error |

### Sticky Faceting

Each facet query **excludes its own filter** from the WHERE clause. For example, the amenities facet query omits the amenities filter so users can see counts for all amenity options even when some are already selected. This is the standard "sticky faceting" UX pattern.

### Price Histogram

**New Feature**: The facets endpoint now includes a price histogram with adaptive bucket sizing. The histogram:

- Uses sticky faceting (excludes price filter to show full distribution)
- Computes adaptive bucket widths based on price range for optimal visual density
- Returns null if no valid price range exists

**Adaptive histogram bucket widths**:

| Range | Bucket Width |
|-------|-------------|
| 0 -- 1000 | 50 |
| 1001 -- 5000 | 250 |
| 5001 -- 10000 | 500 |
| 10001+ | 1000 |

### Validation and Abuse Protection

1. **Text query without bounds is rejected** (400) to prevent full-table scans.
2. **Invalid coordinates** (NaN/Infinity) are rejected (400).
3. **Oversized bounds** are silently clamped to `MAX_LAT_SPAN` / `MAX_LNG_SPAN` limits.
4. Antimeridian-crossing bounds are handled with split envelope queries.

### Caching

- Server-side: `unstable_cache` with 30-second TTL, keyed by normalized filter params.
- Client headers: `Cache-Control: private, no-store` (client handles its own debouncing).

### Rate Limiting

Uses Redis-backed rate limiting (`withRateLimitRedis`) with type `"search-count"` (burst: 30 req, sustained: 200 req).

### Database Queries

All queries run against the `listing_search_docs` materialized table. Four parallel queries plus a sequential histogram:

1. **Amenities**: `unnest(d.amenities)` with `GROUP BY` / `COUNT(DISTINCT d.id)`, `LIMIT 100`
2. **House Rules**: Same pattern with `unnest(d.house_rules)`
3. **Room Types**: `GROUP BY d.room_type`
4. **Price Ranges**: `MIN`, `MAX`, `percentile_cont(0.5)` aggregate
5. **Price Histogram** (runs after price ranges): Adaptive bucket width based on range, using `floor(d.price / bucketWidth)` bucketing

```sql
-- Example: amenities facet query
SELECT amenity, COUNT(DISTINCT d.id) as count
FROM listing_search_docs d, unnest(d.amenities) AS amenity
WHERE d.available_slots > 0 AND d.status = 'ACTIVE'
  AND d.lat IS NOT NULL AND d.lng IS NOT NULL
  AND d.location_geog && ST_MakeEnvelope(...)::geography
GROUP BY amenity ORDER BY count DESC LIMIT 100
```

### Text Search

Uses PostgreSQL full-text search: `d.search_tsv @@ plainto_tsquery('english', $n)` for semantic consistency with the main search endpoint.

---

## GET /api/search-count

**File**: `src/app/api/search-count/route.ts`

**Purpose**: Returns a count of listings matching given filters. Used by the filter drawer to show "Show X listings" button text.

### Request

Same filter params as `/api/search/facets` via `buildRawParamsFromSearchParams()` and `parseSearchParams()`.

### Response

```jsonc
// Count <= 100
{ "count": 42 }

// Count > 100 (capped for performance)
{ "count": null }

// Query without bounds
{ "count": null, "boundsRequired": true }

// No query, no bounds (browse mode)
{ "count": null, "browseMode": true }
```

| Status | Condition |
|--------|-----------|
| 200 | Always for valid requests (even unbounded returns 200 with flags) |
| 429 | Rate limited |
| 500 | Server error |

### Key Behavior

- `dynamic = "force-dynamic"` disables Next.js static caching.
- Delegates to `getLimitedCount()` from `@/lib/data` which returns exact count up to 100, or `null` beyond.
- Unbounded text searches return `{ count: null, boundsRequired: true }` instead of executing.
- Browse mode (no query, no bounds) returns `{ count: null, browseMode: true }`.

### Caching

`Cache-Control: private, no-store` on all responses. Client handles debouncing and in-memory caching.

### Rate Limiting

Uses Redis-backed rate limiting (`withRateLimitRedis`) with type `"search-count"` (burst: 30 req, sustained: 200 req).

---

## GET /api/map-listings

**File**: `src/app/api/map-listings/route.ts`

**Purpose**: Fetches map marker data for the persistent map component. Returns listings with coordinates and minimal display data for map pins.

### Request

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `minLat`, `maxLat`, `minLng`, `maxLng` | `number` | One of bounds or lat/lng | Explicit viewport bounds |
| `lat`, `lng` | `number` | One of bounds or lat/lng | Center point; derives ~10km radius bounds |
| All standard filter params | various | No | Same filters as search |

### Bounds Resolution

1. Tries explicit `minLat/maxLat/minLng/maxLng` first via `validateAndParseBounds()`.
2. Falls back to `lat/lng` with a ~10km radius (using `LAT_OFFSET_DEGREES` constant, adjusted by `cos(lat)` for longitude).
3. If neither available, returns `400`.

### Response

```json
{
  "listings": [
    {
      "id": "...",
      "lat": 37.7749,
      "lng": -122.4194,
      "price": 1200,
      "title": "...",
      "images": ["..."],
      "roomType": "Private Room"
    }
  ]
}
```

| Status | Condition |
|--------|-----------|
| 200 | Success |
| 400 | No valid bounds or lat/lng |
| 429 | Rate limited |
| 500 | Server error |

### Caching

```
Cache-Control: public, s-maxage=60, max-age=30, stale-while-revalidate=120
```

Map markers are not user-specific, so CDN caching is safe.

### Rate Limiting

Uses Redis-backed rate limiting (`withRateLimitRedis`) with type `"map"` (burst: 60 req, sustained: 300 req).

### Service Layer

Delegates to `getMapListings()` from `@/lib/data` with the full filter params including validated bounds.

---

## GET /api/listings

**File**: `src/app/api/listings/route.ts`

**Purpose**: General-purpose listing fetch. Simpler than `/api/search/v2`; used for basic listing queries outside the search page context.

### Request

| Param | Type | Description |
|-------|------|-------------|
| `q` | `string` | Optional text query |

### Response

**200 OK**: Array of listing objects.

```
Cache-Control: public, max-age=60, stale-while-revalidate=300
```

### Rate Limiting

Uses in-memory rate limiting (`withRateLimit`) with type `"listingsRead"` (not Redis-backed).

---

## POST /api/listings

**File**: `src/app/api/listings/route.ts`

**Purpose**: Create a new listing. Requires authentication.

### Request Body

```json
{
  "title": "string (required)",
  "description": "string",
  "price": "number (required, > 0)",
  "address": "string (required)",
  "city": "string (required)",
  "state": "string (required)",
  "zip": "string (required)",
  "totalSlots": "number (default 1)",
  "amenities": "string[] | comma-separated string",
  "houseRules": "string[] | comma-separated string",
  "householdLanguages": "string[] (ISO codes)",
  "genderPreference": "string | null",
  "householdGender": "string | null",
  "leaseDuration": "string",
  "roomType": "string",
  "moveInDate": "ISO date string",
  "images": "string[]"
}
```

### Validation

1. **Authentication**: Requires active session via `auth()`.
2. **Required fields**: `title`, `price`, `address`, `city`, `state`, `zip`.
3. **Numeric validation**: `price > 0`, `totalSlots > 0`.
4. **Language codes**: Validated against `householdLanguagesSchema` (zod) and `isValidLanguageCode()`.
5. **Compliance check**: Description checked for discriminatory language via `checkListingLanguageCompliance()`.
6. **Geocoding**: Address geocoded via `geocodeAddress()`; fails if geocoding returns no results.

### Response

| Status | Condition |
|--------|-----------|
| 201 | Listing created. Returns the listing object. `Cache-Control: no-store`. |
| 400 | Validation failure (missing fields, invalid price, bad geocode, compliance fail) |
| 401 | Not authenticated |
| 429 | Rate limited |
| 500 | Server error (details exposed only in development) |

### Database Operations

Runs in a Prisma `$transaction`:
1. Creates `Listing` record.
2. Creates `Location` record.
3. Updates Location with PostGIS geometry: `ST_SetSRID(ST_GeomFromText('POINT(lng lat)'), 4326)`.

### Search Doc Integration

**Fire-and-forget**: After successful listing creation, calls `markListingDirty(result.id, 'listing_created').catch(() => {})` to queue the listing for search doc refresh. Non-blocking operation.

### Rate Limiting

Uses in-memory rate limiting (`withRateLimit`) with type `"createListing"`.

### Privacy

- Logs only non-sensitive metadata (field presence, truncated userId).
- Never logs full request body.

---

## PATCH /api/listings/[id]

**File**: `src/app/api/listings/[id]/route.ts`

**Purpose**: Update an existing listing. Requires authentication and ownership.

### Request Body

Same fields as POST /api/listings, all optional. Only provided fields are updated.

### Validation

1. **Authentication**: Requires active session via `auth()`.
2. **Ownership**: Verifies user is the listing owner.
3. **Numeric validation**: `price > 0`, `totalSlots > 0` if provided.
4. **Language codes**: Validated if provided.
5. **Compliance check**: Description checked if provided.
6. **Geocoding**: Only if address fields change; geocodes before transaction.

### Response

| Status | Condition |
|--------|-----------|
| 200 | Listing updated. Returns the updated listing object. |
| 400 | Validation failure (invalid price, bad geocode, compliance fail) |
| 401 | Not authenticated |
| 403 | User is not the listing owner |
| 404 | Listing not found |
| 500 | Server error |

### Database Operations

Runs in a Prisma `$transaction`:
1. Updates `Listing` record with provided fields.
2. If address changed: updates `Location` record and PostGIS geometry.
3. Intelligently adjusts `availableSlots` when `totalSlots` changes.

### Search Doc Integration

**Fire-and-forget**: After successful update, calls `markListingDirty(id, 'listing_updated').catch(() => {})` to queue the listing for search doc refresh. Non-blocking operation.

---

## POST /api/reviews

**File**: `src/app/api/reviews/route.ts`

**Purpose**: Create a review for a listing or user. Requires authentication and booking history for listing reviews.

### Request Body

```json
{
  "listingId": "string (optional)",
  "targetUserId": "string (optional)",
  "rating": "number (1-5, required)",
  "comment": "string (required, max 5000 chars)"
}
```

Must specify either `listingId` or `targetUserId`.

### Validation

1. **Authentication**: Requires active session.
2. **Suspension check**: Blocked if account is suspended.
3. **Zod validation**: Request body validated with `createReviewSchema`.
4. **Duplicate prevention**: Checks for existing review from this user.
5. **Booking requirement**: For listing reviews, requires booking history.

### Response

| Status | Condition |
|--------|-----------|
| 201 | Review created successfully. |
| 400 | Invalid request body. |
| 401 | Not authenticated. |
| 403 | Account suspended or no booking history. |
| 409 | Duplicate review (already reviewed this listing/user). |
| 429 | Rate limited. |
| 500 | Server error. |

### Search Doc Integration

**Fire-and-forget**: After successful review creation for a listing, calls `markListingDirty(listingId, 'review_changed').catch(() => {})` to queue the listing for search doc refresh (updates avg_rating and review_count). Non-blocking operation.

### Notifications

Sends in-app and email notifications to the listing owner asynchronously (fire-and-forget pattern). Does not block response.

### Rate Limiting

Uses in-memory rate limiting (`withRateLimit`) with type `"createReview"`.

---

## PUT /api/reviews

**File**: `src/app/api/reviews/route.ts`

**Purpose**: Update an existing review. Only the author can update their own review.

### Request Body

```json
{
  "reviewId": "string (required)",
  "rating": "number (1-5, required)",
  "comment": "string (required, max 5000 chars)"
}
```

### Validation

1. **Authentication**: Requires active session.
2. **Zod validation**: Request body validated with `updateReviewSchema`.
3. **Ownership**: Verifies user is the review author.

### Response

| Status | Condition |
|--------|-----------|
| 200 | Review updated successfully. |
| 400 | Invalid request body. |
| 401 | Not authenticated. |
| 403 | User is not the review author. |
| 404 | Review not found. |
| 500 | Server error. |

### Search Doc Integration

**Fire-and-forget**: If the review is for a listing, calls `markListingDirty(existingReview.listingId, 'review_changed').catch(() => {})` to queue the listing for search doc refresh. Non-blocking operation.

---

## DELETE /api/reviews

**File**: `src/app/api/reviews/route.ts`

**Purpose**: Delete an existing review. Only the author can delete their own review.

### Request

Query parameter: `reviewId` (required)

### Validation

1. **Authentication**: Requires active session.
2. **Ownership**: Verifies user is the review author.

### Response

| Status | Condition |
|--------|-----------|
| 200 | Review deleted successfully. |
| 400 | Missing reviewId parameter. |
| 401 | Not authenticated. |
| 403 | User is not the review author. |
| 404 | Review not found. |
| 500 | Server error. |

### Search Doc Integration

**Fire-and-forget**: If the review was for a listing, calls `markListingDirty(existingReview.listingId, 'review_changed').catch(() => {})` to queue the listing for search doc refresh. Non-blocking operation.

---

## GET /api/cron/refresh-search-docs

**File**: `src/app/api/cron/refresh-search-docs/route.ts`

**Purpose**: Processes the `listing_search_doc_dirty` queue and upserts the `listing_search_docs` materialized table. This is the mechanism that keeps search data in sync with the source `Listing` table.

### Authentication

Bearer token via `Authorization: Bearer <CRON_SECRET>` header. Defense-in-depth checks:
- Secret must be configured and >= 32 characters.
- Rejects placeholder values (`"change-in-production"`, `"your-..."`, `"generate-..."`).

### Response

```json
{
  "success": true,
  "processed": 15,
  "orphans": 2,
  "errors": 0,
  "durationMs": 340,
  "timestamp": "2026-01-31T12:00:00.000Z"
}
```

| Status | Condition |
|--------|-----------|
| 200 | Processed (even if some errors; check `success` field) |
| 401 | Invalid or missing bearer token |
| 500 | CRON_SECRET misconfigured or unhandled error |

### Processing Pipeline

1. **Fetch dirty IDs**: `SELECT listing_id FROM listing_search_doc_dirty ORDER BY marked_at ASC LIMIT 100` (oldest-first fairness).
2. **Fetch listing data**: JOIN `Listing` + `Location` + `Review` aggregation for dirty IDs. Extracts coordinates via `ST_X`/`ST_Y`.
3. **Upsert search docs**: `INSERT ... ON CONFLICT (id) DO UPDATE` into `listing_search_docs`. Computes:
   - `recommended_score = avg_rating * 20 + view_count * 0.1 + review_count * 5`
   - Lowercase arrays for case-insensitive filtering
   - PostGIS geography point
4. **Clear dirty flags**: Deletes processed entries from `listing_search_doc_dirty`.
5. **Handle orphans**: Dirty flags for deleted listings -- removes both the search doc and the dirty flag.

### Performance

- Batch size: 100 per invocation.
- Recommended schedule: every 5 minutes.
- Individual listing errors are caught and logged without blocking the batch.

---

## GET /api/cron/search-alerts

**File**: `src/app/api/cron/search-alerts/route.ts`

**Purpose**: Processes saved search alerts -- notifies users when new listings match their saved search criteria.

### Authentication

Same `Authorization: Bearer <CRON_SECRET>` pattern with identical defense-in-depth validation as the refresh-search-docs cron.

### HTTP Methods

Supports both `GET` and `POST` (POST delegates to GET).

### Response

```json
{
  "success": true,
  "duration": "340ms",
  "...": "additional fields from processSearchAlerts()"
}
```

| Status | Condition |
|--------|-----------|
| 200 | Success |
| 401 | Unauthorized |
| 500 | Configuration error or processing failure |

### Service Layer

Delegates entirely to `processSearchAlerts()` from `@/lib/search-alerts`.

---

## Rate Limiting Summary

| Endpoint | Type | Backend | Burst | Sustained |
|----------|------|---------|-------|-----------|
| `/api/search/v2` | `map` | Redis (Upstash) | 60 | 300 |
| `/api/search/facets` | `search-count` | Redis | 30 | 200 |
| `/api/search-count` | `search-count` | Redis | 30 | 200 |
| `/api/map-listings` | `map` | Redis | 60 | 300 |
| `/api/listings` GET | `listingsRead` | In-memory | -- | -- |
| `/api/listings` POST | `createListing` | In-memory | -- | -- |
| `/api/listings/[id]` PATCH | None | N/A | -- | -- |
| `/api/reviews` POST | `createReview` | In-memory | -- | -- |
| `/api/reviews` PUT | None | N/A | -- | -- |
| `/api/reviews` DELETE | None | N/A | -- | -- |
| `/api/reviews` GET | `getReviews` | In-memory | 60/min | -- |
| Cron endpoints | N/A | Bearer token auth | -- | -- |

Redis-backed rate limiting is **fail-closed** in production: if Redis is unavailable, requests are denied (429) to prevent abuse.

---

## Shared Infrastructure

### Request Context

All endpoints (except cron) use `createContextFromHeaders()` and `runWithRequestContext()` to establish a request context with a unique `x-request-id` header for tracing.

### Parameter Parsing

`buildRawParamsFromSearchParams()` and `parseSearchParams()` from `@/lib/search-params` provide canonical parsing for all search/filter parameters. This ensures consistent filter interpretation across `/api/search/v2`, `/api/search/facets`, `/api/search-count`, and `/api/map-listings`.

### Search Document Table

The `listing_search_docs` table is the primary read-side table for all search queries. It is a denormalized projection of `Listing` + `Location` + `Review` data, maintained by the `/api/cron/refresh-search-docs` endpoint via a dirty-flag sweeper pattern. Key columns:

- `search_tsv`: PostgreSQL `tsvector` for full-text search
- `location_geog`: PostGIS geography for spatial queries
- `amenities_lower`, `house_rules_lower`, `household_languages_lower`: Pre-computed lowercase arrays for case-insensitive filtering
- `recommended_score`: Pre-computed ranking score
- `available_slots`, `status`: Used as base WHERE conditions (`available_slots > 0 AND status = 'ACTIVE'`)

### Search Doc Dirty Flag System

The dirty flag system (`listing_search_doc_dirty` table) tracks which listings need their search docs refreshed. The system is wired into all listing and review mutation routes:

**Listing Mutations**:
- **POST /api/listings**: Marks new listing dirty with reason `'listing_created'`
- **PATCH /api/listings/[id]**: Marks updated listing dirty with reason `'listing_updated'`
- **DELETE /api/listings/[id]**: Does not mark dirty (listing is deleted, search doc removed by cron orphan handler)

**Review Mutations** (all mark associated listing dirty with reason `'review_changed'`):
- **POST /api/reviews**: Triggers refresh to update `avg_rating` and `review_count`
- **PUT /api/reviews**: Triggers refresh when rating changes
- **DELETE /api/reviews**: Triggers refresh when review is removed

All calls use fire-and-forget pattern: `markListingDirty(id, reason).catch(() => {})` to avoid blocking the mutation response.

### Bounds Validation

`validateAndParseBounds()` from `@/lib/validation` handles coordinate validation. `clampBoundsToMaxSpan()` enforces maximum viewport size. `crossesAntimeridian()` from `@/lib/data` detects and handles antimeridian-crossing bounds with split envelope queries.
