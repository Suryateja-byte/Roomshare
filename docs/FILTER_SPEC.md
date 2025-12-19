# Filter Specification

> Single source of truth for all search filters in RoomShare.

## Overview

RoomShare supports ~15 primary filters across 4 categories:
- **Text Search** (1 filter)
- **Range Filters** (3 filters: price min/max, geographic bounds)
- **Enum Filters** (5 filters: room type, lease duration, gender preferences)
- **Array Filters** (3 filters: amenities, house rules, languages)
- **Date Filters** (1 filter: move-in date)
- **Pagination/Sorting** (3 params: page, limit, sort)

---

## Filter Definitions

### 1. Query (Text Search)

| Property | Value |
|----------|-------|
| **Name** | `query` / `q` |
| **Type** | `string` |
| **Allowed Values** | Any string, 1-200 characters |
| **Default** | `undefined` (no filter applied) |
| **Empty Behavior** | Whitespace-only → treated as undefined |
| **Invalid Behavior** | N/A (strings always accepted) |
| **Case Sensitivity** | Case-insensitive matching |
| **Minimum Length** | 2 characters for search execution |

**Matching Logic:**
- Searches across: `title`, `description`, `city`, `state`
- Uses SQL `LIKE` with `%pattern%` wildcards
- Sanitizes input to prevent SQL injection

**Examples:**
```
q=downtown         → matches "Downtown Austin", "downtown", etc.
q=San+Francisco    → matches "San Francisco, CA"
q=a                → ignored (< 2 chars)
q=   downtown      → trimmed to "downtown"
```

---

### 2. Price Range

| Property | Value |
|----------|-------|
| **Names** | `minPrice`, `maxPrice` |
| **Type** | `number` (float) |
| **Allowed Values** | 0 to 1,000,000,000 |
| **Default** | `undefined` (no filter applied) |
| **Empty Behavior** | Empty string → undefined |
| **Invalid Behavior** | Non-numeric, NaN, Infinity → undefined |

**Normalization Rules:**
1. Negative values clamped to 0
2. Values > MAX_SAFE_PRICE (1B) clamped to MAX_SAFE_PRICE
3. If minPrice > maxPrice, values are **swapped**
4. Decimal values preserved (e.g., 99.99)

**Examples:**
```
minPrice=500&maxPrice=1000  → $500-$1000
minPrice=2000&maxPrice=1000 → swapped to $1000-$2000
minPrice=-100               → clamped to 0
minPrice=Infinity           → undefined
```

---

### 3. Amenities

| Property | Value |
|----------|-------|
| **Name** | `amenities` |
| **Type** | `string[]` |
| **Allowed Values** | `Wifi`, `AC`, `Parking`, `Washer`, `Dryer`, `Kitchen`, `Gym`, `Pool` |
| **Default** | `undefined` (no filter applied) |
| **Empty Behavior** | Empty array → undefined |
| **Invalid Behavior** | Invalid values silently dropped |
| **Max Items** | 20 |

**Combination Logic:** **AND** - Listing must have ALL selected amenities

**Matching:** Case-insensitive partial match (e.g., "Pool" matches "Pool Access")

**Examples:**
```
amenities=Wifi,Parking        → must have BOTH Wifi AND Parking
amenities=wifi                → normalized to "Wifi"
amenities=Wifi,Invalid,Pool   → Invalid dropped, filters by Wifi AND Pool
amenities=Wifi&amenities=Pool → same as Wifi,Pool
```

---

### 4. House Rules

| Property | Value |
|----------|-------|
| **Name** | `houseRules` |
| **Type** | `string[]` |
| **Allowed Values** | `Pets allowed`, `Smoking allowed`, `Couples allowed`, `Guests allowed` |
| **Default** | `undefined` (no filter applied) |
| **Empty Behavior** | Empty array → undefined |
| **Invalid Behavior** | Invalid values silently dropped |
| **Max Items** | 20 |

**Combination Logic:** **AND** - Listing must have ALL selected house rules

**Examples:**
```
houseRules=Pets+allowed                    → listings allowing pets
houseRules=Pets+allowed,Smoking+allowed    → must allow BOTH
houseRules=pets+allowed                    → normalized to "Pets allowed"
```

---

### 5. Languages

| Property | Value |
|----------|-------|
| **Name** | `languages` |
| **Type** | `string[]` (ISO 639-1 codes) |
| **Allowed Values** | ~50 language codes (see `src/lib/languages.ts`) |
| **Default** | `undefined` (no filter applied) |
| **Empty Behavior** | Empty array → undefined |
| **Invalid Behavior** | Invalid codes silently dropped |
| **Max Items** | 20 |

**Combination Logic:** **OR** - Listing must speak ANY of the selected languages

**Legacy Support:** Display names converted to codes (e.g., "English" → "en")

**Examples:**
```
languages=en,es         → speaks English OR Spanish
languages=English       → converted to "en"
languages=en,xyz        → xyz dropped, filters by English only
languages=EN            → normalized to "en"
```

---

### 6. Room Type

| Property | Value |
|----------|-------|
| **Name** | `roomType` |
| **Type** | `string` (enum) |
| **Allowed Values** | `any`, `Private Room`, `Shared Room`, `Entire Place` |
| **Default** | `undefined` (no filter applied) |
| **Empty Behavior** | Empty string → undefined |
| **Invalid Behavior** | Invalid value → undefined |
| **Case Sensitivity** | Case-insensitive matching |

**Special Value:** `any` → treated as undefined (no filter)

**Examples:**
```
roomType=Private+Room    → exact match "Private Room"
roomType=private+room    → normalized to "Private Room"
roomType=any             → no filter applied
roomType=Studio          → invalid, ignored
```

---

### 7. Lease Duration

| Property | Value |
|----------|-------|
| **Name** | `leaseDuration` |
| **Type** | `string` (enum) |
| **Allowed Values** | `any`, `Month-to-month`, `3 months`, `6 months`, `12 months`, `Flexible` |
| **Default** | `undefined` (no filter applied) |
| **Empty Behavior** | Empty string → undefined |
| **Invalid Behavior** | Invalid value → undefined |
| **Case Sensitivity** | Case-insensitive matching |

**Examples:**
```
leaseDuration=6+months      → exact match "6 months"
leaseDuration=Month-to-month → flexible lease
leaseDuration=any           → no filter applied
```

---

### 8. Gender Preference

| Property | Value |
|----------|-------|
| **Name** | `genderPreference` |
| **Type** | `string` (enum) |
| **Allowed Values** | `any`, `MALE_ONLY`, `FEMALE_ONLY`, `NO_PREFERENCE` |
| **Default** | `undefined` (no filter applied) |
| **Empty Behavior** | Empty string → undefined |
| **Invalid Behavior** | Invalid value → undefined |
| **Case Sensitivity** | Case-insensitive matching |

**Examples:**
```
genderPreference=FEMALE_ONLY     → only female-preferred listings
genderPreference=NO_PREFERENCE   → gender-neutral listings
genderPreference=any             → no filter applied
```

---

### 9. Household Gender

| Property | Value |
|----------|-------|
| **Name** | `householdGender` |
| **Type** | `string` (enum) |
| **Allowed Values** | `any`, `ALL_MALE`, `ALL_FEMALE`, `MIXED` |
| **Default** | `undefined` (no filter applied) |
| **Empty Behavior** | Empty string → undefined |
| **Invalid Behavior** | Invalid value → undefined |
| **Case Sensitivity** | Case-insensitive matching |

**Examples:**
```
householdGender=ALL_FEMALE  → all-female households
householdGender=MIXED       → mixed-gender households
householdGender=any         → no filter applied
```

---

### 10. Move-In Date

| Property | Value |
|----------|-------|
| **Name** | `moveInDate` |
| **Type** | `string` (date) |
| **Format** | `YYYY-MM-DD` |
| **Allowed Values** | Today to 2 years in future |
| **Default** | `undefined` (no filter applied) |
| **Empty Behavior** | Empty string → undefined |
| **Invalid Behavior** | Invalid date → undefined |

**Matching Logic:**
- Listings with `moveInDate <= filter date` OR `moveInDate IS NULL`
- Past dates are rejected

**Examples:**
```
moveInDate=2025-02-01  → available by Feb 1, 2025
moveInDate=2024-01-01  → past date, ignored
moveInDate=2030-01-01  → > 2 years, ignored
moveInDate=2025-13-01  → invalid month, ignored
```

---

### 11. Geographic Bounds

| Property | Value |
|----------|-------|
| **Names** | `minLat`, `maxLat`, `minLng`, `maxLng` (explicit) OR `lat`, `lng` (center point) |
| **Type** | `number` (float) |
| **Allowed Values** | Lat: -90 to 90, Lng: -180 to 180 |
| **Default** | `undefined` (no filter applied) |
| **Empty Behavior** | Incomplete bounds → undefined |
| **Invalid Behavior** | Out of range → clamped |

**Modes:**
1. **Explicit Bounds**: All 4 corners specified
2. **Center Point**: `lat`/`lng` creates a ~10km bounding box

**Normalization Rules:**
1. Latitude values clamped to [-90, 90]
2. Longitude values clamped to [-180, 180]
3. If minLat > maxLat, values are **swapped**
4. Longitude NOT swapped (allows antimeridian crossing)

**Antimeridian Support:**
- When `minLng > maxLng` (e.g., 170 to -170), treated as crossing the International Date Line
- Query splits into: `lng >= minLng OR lng <= maxLng`

**Examples:**
```
minLat=37&maxLat=38&minLng=-123&maxLng=-122  → San Francisco area
lat=37.7749&lng=-122.4194                      → ~10km box around SF
minLat=40&maxLat=30&...                        → swapped to minLat=30
minLng=170&maxLng=-170                         → Pacific crossing (valid)
```

---

### 12. Sort

| Property | Value |
|----------|-------|
| **Name** | `sort` |
| **Type** | `string` (enum) |
| **Allowed Values** | `recommended`, `price_asc`, `price_desc`, `newest`, `rating` |
| **Default** | `recommended` |
| **Invalid Behavior** | Invalid value → defaults to `recommended` |

**Sort Implementations:**
- `recommended`: `(avg_rating * 20 + view_count * 0.1 + review_count * 5) DESC, createdAt DESC`
- `price_asc`: `price ASC, createdAt DESC`
- `price_desc`: `price DESC, createdAt DESC`
- `newest`: `createdAt DESC, id ASC` (stable)
- `rating`: `avg_rating DESC, review_count DESC, createdAt DESC`

---

### 13. Pagination

| Property | Value |
|----------|-------|
| **Names** | `page`, `limit` |
| **Type** | `number` (integer) |
| **Allowed Values** | page: 1-100, limit: 1-100 |
| **Defaults** | page: 1, limit: 12 |
| **Invalid Behavior** | Clamped to valid range |

**Normalization:**
- page < 1 → 1
- page > MAX_SAFE_PAGE (100) → 100
- page > totalPages → totalPages

---

## Filter Combination Rules

### Cross-Filter Logic

All filters are combined with **AND** logic:
```
results = listings WHERE
  (query matches) AND
  (price in range) AND
  (has ALL amenities) AND
  (has ALL house rules) AND
  (speaks ANY language) AND
  (room type matches) AND
  (lease duration matches) AND
  (gender preferences match) AND
  (move-in date valid) AND
  (within bounds)
```

### Base Conditions (Always Applied)

```sql
WHERE
  "availableSlots" > 0
  AND status = 'ACTIVE'
  AND coords IS NOT NULL
  AND coords != (0, 0)
  AND lat BETWEEN -90 AND 90
  AND lng BETWEEN -180 AND 180
```

---

## Interaction Rules

### Price + Sort
- `sort=price_asc` with `minPrice`/`maxPrice` works correctly
- Results filtered first, then sorted

### Bounds + Query
- Geographic filter applied at SQL level
- Text search applied within geographic results
- Both use parameterized queries (no injection risk)

### Pagination + Filters
- **Count query** and **data query** use identical WHERE clause
- `page` is clamped to valid range based on `total` count
- `totalPages = ceil(total / limit)`

### Empty Results
When filters return 0 results:
- System suggests removing filters
- `analyzeFilterImpact()` calculates effect of each filter
- UI shows "Try removing X filter" suggestions

---

## API Endpoints

### GET /search
Main search page - Server-rendered with filters from URL query params.

### GET /api/listings
Legacy API - Returns all active listings (limited filtering).

### POST /api/saved-search
Save search filters - Validates using `validateSearchFilters()`.

---

## Implementation Files

| File | Purpose |
|------|---------|
| `src/lib/search-params.ts` | Filter parsing, validation, constants |
| `src/lib/data.ts` | Query building, database access |
| `src/lib/languages.ts` | Language code normalization |
| `src/lib/schemas.ts` | Zod schemas for validation |
| `src/app/search/page.tsx` | Search page component |
| `src/components/SearchForm.tsx` | Filter UI component |

---

## Constants Reference

```typescript
// Price limits
MAX_SAFE_PRICE = 1_000_000_000  // $1 billion
MAX_SAFE_PAGE = 100

// Array limits
MAX_ARRAY_ITEMS = 20

// Query limits
MIN_QUERY_LENGTH = 2
MAX_QUERY_LENGTH = 200

// Result limits
MAX_RESULTS_CAP = 500
MAX_MAP_MARKERS = 200
```
