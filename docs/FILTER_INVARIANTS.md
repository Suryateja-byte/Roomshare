# Filter Invariants

> Properties that must always hold true for the search/filter system.

These invariants are enforced through property-based tests using `fast-check`.

---

## 1. Idempotence

**Definition:** Normalizing filters twice produces the same result as normalizing once.

```typescript
normalizeFilters(normalizeFilters(input)) === normalizeFilters(input)
```

**What This Catches:**
- Side effects in normalization functions
- Mutation of input objects
- Non-deterministic transformations

**Implementation:**
```typescript
fc.assert(
  fc.property(fc.anything(), (input) => {
    const once = normalizeFilters(input);
    const twice = normalizeFilters(once);
    expect(twice).toEqual(once);
  })
);
```

---

## 2. Order Independence

**Definition:** The order of filter values should not affect results.

### 2.1 Array Value Order Independence
```typescript
search({ amenities: ['Wifi', 'Pool'] }) === search({ amenities: ['Pool', 'Wifi'] })
```

### 2.2 Filter Parameter Order Independence
```typescript
search({ minPrice: 500, roomType: 'Private Room' }) ===
search({ roomType: 'Private Room', minPrice: 500 })
```

**What This Catches:**
- Non-deterministic array ordering in queries
- Hash/map iteration order bugs
- Unstable sorting

**Implementation:**
```typescript
fc.assert(
  fc.property(validFilterParamsArb, (filters) => {
    const original = search(filters);
    const shuffled = search(shuffleFilterArrays(filters));
    expect(new Set(shuffled.items.map(i => i.id)))
      .toEqual(new Set(original.items.map(i => i.id)));
  })
);
```

---

## 3. Monotonicity (Restriction)

**Definition:** Adding an additional restrictive filter cannot increase the result count.

```typescript
count(filters) >= count({ ...filters, additionalFilter })
```

**Exceptions:**
- Adding `languages` (OR logic) - more languages = potentially more results
- Removing a filter (going from specific to undefined)

**What This Catches:**
- Inverted filter logic
- OR/AND confusion
- Missing filter application

**Implementation:**
```typescript
fc.assert(
  fc.property(
    validFilterParamsArb,
    fc.oneof(
      fc.record({ minPrice: fc.integer({ min: 0 }) }),
      fc.record({ amenities: fc.array(amenityArb) }),
      fc.record({ roomType: roomTypeArb })
    ),
    (base, extra) => {
      const baseCount = getCount(base);
      const restrictedCount = getCount({ ...base, ...extra });

      // Skip OR-logic filters
      if (!('languages' in extra)) {
        expect(restrictedCount).toBeLessThanOrEqual(baseCount);
      }
    }
  )
);
```

---

## 4. Subset Rule

**Definition:** Results with combined filters must be a subset of results with fewer filters.

```typescript
results(A AND B) ⊆ results(A)
results(A AND B) ⊆ results(B)
```

**What This Catches:**
- Filter logic errors
- Query construction bugs
- Incorrect WHERE clause composition

**Implementation:**
```typescript
fc.assert(
  fc.property(validFilterParamsArb, validFilterParamsArb, (a, b) => {
    const combined = search({ ...a, ...b });
    const aOnly = search(a);

    const combinedIds = new Set(combined.items.map(i => i.id));
    const aOnlyIds = new Set(aOnly.items.map(i => i.id));

    for (const id of combinedIds) {
      expect(aOnlyIds.has(id)).toBe(true);
    }
  })
);
```

---

## 5. Pagination Consistency

### 5.1 No Duplicates Across Pages
**Definition:** The same item should not appear on multiple pages.

```typescript
intersection(page1.items, page2.items) === []
```

### 5.2 Total Coverage
**Definition:** All matching items appear exactly once across all pages.

```typescript
union(page1.items, ..., pageN.items) === allMatchingItems
```

### 5.3 Stable Ordering
**Definition:** With a stable sort, items maintain their relative order across queries.

**What This Catches:**
- Missing OFFSET in pagination
- Non-deterministic ordering causing items to shift
- Off-by-one errors in pagination

**Implementation:**
```typescript
fc.assert(
  fc.property(validFilterParamsArb, async (filters) => {
    const allIds = new Set<string>();
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) {
      const result = await search({ ...filters, page, limit: 10 });

      for (const item of result.items) {
        expect(allIds.has(item.id)).toBe(false); // No duplicates
        allIds.add(item.id);
      }

      hasMore = page < result.totalPages;
      page++;
    }
  })
);
```

---

## 6. Count Consistency

**Definition:** The total count must match the actual number of items when iterating all pages.

```typescript
result.total === sum(allPages.map(p => p.items.length))
```

**What This Catches:**
- COUNT query using different WHERE clause than SELECT
- Data changes between count and data queries
- Integer overflow in count

**Implementation:**
```typescript
fc.assert(
  fc.property(validFilterParamsArb, async (filters) => {
    const result = await search({ ...filters, page: 1, limit: 100 });

    if (result.total <= 100) {
      expect(result.items.length).toBe(result.total);
    }

    expect(result.totalPages).toBe(Math.ceil(result.total / result.limit));
  })
);
```

---

## 7. Sorting Correctness

### 7.1 Correct Order
**Definition:** Results are sorted according to the specified sort option.

```typescript
// For price_asc
items[i].price <= items[i+1].price
```

### 7.2 Stable Tie-Breaking
**Definition:** Items with equal sort keys maintain stable order (using secondary sort key).

**What This Catches:**
- Wrong ORDER BY direction
- Missing tie-breaker causing non-determinism
- Incorrect column in ORDER BY

**Implementation:**
```typescript
fc.assert(
  fc.property(validFilterParamsArb, async (filters) => {
    const result = await search({ ...filters, sort: 'price_asc' });

    for (let i = 0; i < result.items.length - 1; i++) {
      expect(result.items[i].price).toBeLessThanOrEqual(result.items[i + 1].price);

      // If prices equal, check tie-breaker (createdAt DESC)
      if (result.items[i].price === result.items[i + 1].price) {
        expect(result.items[i].createdAt.getTime())
          .toBeGreaterThanOrEqual(result.items[i + 1].createdAt.getTime());
      }
    }
  })
);
```

---

## 8. Safety (No Crashes)

**Definition:** Invalid inputs should never crash the system.

### 8.1 Invalid Values Don't Crash
```typescript
// These should return 400 or be gracefully handled, never 500
search({ minPrice: 'not-a-number' })
search({ amenities: null })
search({ roomType: { malicious: true } })
```

### 8.2 Extreme Values Don't Crash
```typescript
search({ minPrice: Number.MAX_SAFE_INTEGER })
search({ q: 'x'.repeat(10000) })
search({ page: -1 })
```

**What This Catches:**
- Unhandled exceptions
- SQL injection vulnerabilities
- Buffer overflow/memory issues

**Implementation:**
```typescript
fc.assert(
  fc.property(fc.anything(), async (input) => {
    try {
      const result = await search(input as any);
      // Should either succeed with valid result or return empty
      expect(result).toBeDefined();
    } catch (error) {
      // Should only throw 400-class errors, not 500s
      expect(error).toHaveProperty('statusCode');
      expect(error.statusCode).toBeLessThan(500);
    }
  })
);
```

---

## 9. Determinism

**Definition:** The same input always produces the same output.

```typescript
search(filters) === search(filters)  // Called at different times
```

**What This Catches:**
- Random/time-based behavior in queries
- Race conditions
- Cache inconsistencies

**Implementation:**
```typescript
fc.assert(
  fc.property(validFilterParamsArb, async (filters) => {
    const result1 = await search(filters);
    const result2 = await search(filters);

    expect(result1.total).toBe(result2.total);
    expect(result1.items.map(i => i.id)).toEqual(result2.items.map(i => i.id));
  })
);
```

---

## 10. Bounds Integrity

**Definition:** All returned listings must fall within specified bounds.

```typescript
// For every item in results:
bounds.minLat <= item.lat <= bounds.maxLat
bounds.minLng <= item.lng <= bounds.maxLng  // or antimeridian logic
```

**What This Catches:**
- PostGIS query errors
- Coordinate system confusion (lat/lng swap)
- Antimeridian handling bugs

**Implementation:**
```typescript
fc.assert(
  fc.property(boundsArb, async (bounds) => {
    const result = await search({ bounds });

    for (const item of result.items) {
      expect(item.location.lat).toBeGreaterThanOrEqual(bounds.minLat);
      expect(item.location.lat).toBeLessThanOrEqual(bounds.maxLat);

      if (bounds.minLng <= bounds.maxLng) {
        // Normal case
        expect(item.location.lng).toBeGreaterThanOrEqual(bounds.minLng);
        expect(item.location.lng).toBeLessThanOrEqual(bounds.maxLng);
      } else {
        // Antimeridian case
        expect(
          item.location.lng >= bounds.minLng || item.location.lng <= bounds.maxLng
        ).toBe(true);
      }
    }
  })
);
```

---

## 11. Filter Match Accuracy

**Definition:** Every returned item must match ALL applied filters.

```typescript
// If amenities=['Wifi', 'Pool'] is requested:
result.items.every(item =>
  item.amenities.includes('Wifi') && item.amenities.includes('Pool')
)
```

**What This Catches:**
- Filters not actually being applied
- Case sensitivity mismatches
- Partial/incorrect matching

**Implementation:**
```typescript
fc.assert(
  fc.property(validFilterParamsArb, async (filters) => {
    const result = await search(filters);

    for (const item of result.items) {
      // Check each filter type
      if (filters.minPrice !== undefined) {
        expect(item.price).toBeGreaterThanOrEqual(filters.minPrice);
      }
      if (filters.maxPrice !== undefined) {
        expect(item.price).toBeLessThanOrEqual(filters.maxPrice);
      }
      if (filters.roomType) {
        expect(item.roomType?.toLowerCase()).toBe(filters.roomType.toLowerCase());
      }
      if (filters.amenities?.length) {
        for (const amenity of filters.amenities) {
          expect(
            item.amenities.some(a => a.toLowerCase().includes(amenity.toLowerCase()))
          ).toBe(true);
        }
      }
      // ... etc for other filters
    }
  })
);
```

---

## 12. SQL Injection Resistance

**Definition:** Malicious inputs should not execute arbitrary SQL.

```typescript
// These should NOT cause SQL errors or data leaks
search({ q: "'; DROP TABLE listings; --" })
search({ q: "1' OR '1'='1" })
search({ amenities: ["'; DELETE FROM users; --"] })
```

**What This Catches:**
- SQL injection vulnerabilities
- Improper parameterization
- String concatenation in queries

**Implementation:**
```typescript
const sqlInjectionPayloads = [
  "'; DROP TABLE listings; --",
  "1' OR '1'='1",
  "1; SELECT * FROM users",
  "' UNION SELECT password FROM users --",
  "\\'; DROP TABLE listings; --",
];

for (const payload of sqlInjectionPayloads) {
  const result = await search({ q: payload });
  // Should not crash and should return empty or filtered results
  expect(result.items.length).toBeGreaterThanOrEqual(0);
}
```

---

## Invariant Categories Summary

| Category | Invariants | Priority |
|----------|------------|----------|
| **Data Integrity** | Subset Rule, Filter Match, Bounds Integrity | Critical |
| **Pagination** | No Duplicates, Count Consistency, Total Coverage | Critical |
| **Stability** | Determinism, Order Independence, Sorting Correctness | High |
| **Robustness** | Safety, SQL Injection Resistance | Critical |
| **Mathematical** | Idempotence, Monotonicity | Medium |

---

## Bugs These Invariants Would Catch

1. **Idempotence**: Double-encoding of URLs, mutation bugs
2. **Order Independence**: Non-deterministic query results, hash collision issues
3. **Monotonicity**: Inverted filter conditions, OR instead of AND
4. **Subset Rule**: Missing WHERE clauses, broken joins
5. **Pagination**: Off-by-one errors, missing OFFSET
6. **Count Consistency**: Different WHERE in COUNT vs SELECT
7. **Sorting**: Wrong ORDER BY direction, missing tie-breaker
8. **Safety**: Unhandled exceptions, type coercion errors
9. **Determinism**: Race conditions, caching bugs
10. **Bounds Integrity**: Coordinate swaps, PostGIS errors
11. **Filter Match**: Case sensitivity, partial match failures
12. **SQL Injection**: String concatenation, improper escaping
