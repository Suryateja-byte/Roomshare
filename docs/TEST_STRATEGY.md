# Test Strategy

> Comprehensive testing approach for the RoomShare search/filter system.

## Overview

The filter system has ~15 filters with potentially billions of combinations. Instead of exhaustive testing (impossible), we use a layered approach:

```
┌─────────────────────────────────────────────────────────┐
│                    E2E Tests (5-10)                     │  ← Critical user journeys
├─────────────────────────────────────────────────────────┤
│              Property-Based Tests (~100)                │  ← Invariant verification
├─────────────────────────────────────────────────────────┤
│         Pairwise Integration Tests (~150)               │  ← Filter combinations
├─────────────────────────────────────────────────────────┤
│              Unit Tests (~200)                          │  ← Individual filters
└─────────────────────────────────────────────────────────┘
```

---

## Test Categories

### 1. Unit Tests (Fast, ~200 tests)

**Purpose:** Test individual filter parsers, validators, and normalizers in isolation.

**Location:** `src/__tests__/lib/`

**What We Test:**
- `parseSearchParams()` - URL param parsing
- `validateSearchFilters()` - Server-side validation
- `normalizeFilters()` - Filter normalization
- `safeParseArray()` - Array parsing with allowlists
- `safeParseEnum()` - Enum validation
- `safeParseFloat()` / `safeParseInt()` - Number parsing
- `safeParseDate()` - Date validation
- Filter functions (`filterByPrice`, `filterByAmenities`, etc.)

**Test Cases Per Filter:**
| Case | Example |
|------|---------|
| Missing/undefined | `{}` |
| Null value | `{ minPrice: null }` |
| Empty string | `{ q: '' }` |
| Single valid value | `{ roomType: 'Private Room' }` |
| Multiple valid values | `{ amenities: ['Wifi', 'Pool'] }` |
| Boundary: minimum | `{ minPrice: 0 }` |
| Boundary: maximum | `{ minPrice: 1000000000 }` |
| Invalid type | `{ minPrice: 'abc' }` |
| Invalid enum | `{ roomType: 'InvalidType' }` |
| Special characters | `{ q: "'; DROP TABLE" }` |
| Unicode | `{ q: '北京' }` |
| Whitespace | `{ q: '  trimmed  ' }` |

**Run Command:**
```bash
npm test -- --testPathPattern="lib/.*\\.test\\.ts$"
```

---

### 2. Pairwise Integration Tests (~150 tests)

**Purpose:** Test filter combinations without exponential explosion.

**Location:** `src/__tests__/integration/pairwise-filters.test.ts`

**Why Pairwise:**
- 15 filters × multiple values each = billions of combinations
- Pairwise covers all 2-filter interactions with ~100-200 tests
- Catches ~70-90% of interaction bugs

**Implementation:**
```typescript
// Generate pairwise combinations
const filters = [
  { name: 'minPrice', values: [undefined, 0, 500, 1000] },
  { name: 'maxPrice', values: [undefined, 1000, 2000] },
  { name: 'roomType', values: [undefined, 'Private Room', 'Shared Room'] },
  { name: 'amenities', values: [undefined, ['Wifi'], ['Wifi', 'Pool']] },
  // ... etc
];

const pairwiseCombinations = generatePairwise(filters);
// Results in ~150 test cases covering all pairs
```

**High-Risk 3-wise Combinations:**
For critical filter interactions, we also test 3-way combinations:
- `(minPrice, maxPrice, sort)` - Price range with sorting
- `(bounds, query, roomType)` - Location + text + type
- `(amenities, houseRules, languages)` - All array filters together

**Run Command:**
```bash
npm test -- --testPathPattern="integration/pairwise"
```

---

### 3. Property-Based Tests (~100 properties)

**Purpose:** Verify invariants hold for any valid input.

**Location:** `src/__tests__/property/filter-properties.test.ts`

**Library:** `fast-check`

**Properties Tested:**
1. **Idempotence** - `normalize(normalize(x)) === normalize(x)`
2. **Order Independence** - Shuffled arrays yield same results
3. **Monotonicity** - More filters = fewer results (except OR-logic)
4. **Subset Rule** - Combined filters ⊆ individual filter results
5. **Pagination Consistency** - No duplicates, correct totals
6. **Count Consistency** - Total matches actual items
7. **Sorting Correctness** - Items sorted by specified key
8. **Safety** - Invalid inputs don't crash
9. **Determinism** - Same input = same output
10. **Bounds Integrity** - Results within geographic bounds
11. **Filter Match** - Every result matches all filters
12. **SQL Injection Resistance** - Malicious inputs handled safely

**Run Command:**
```bash
npm test -- --testPathPattern="property/"
```

---

### 4. E2E Tests (5-10 critical paths)

**Purpose:** Verify complete user journeys through the UI.

**Location:** `src/__tests__/e2e/` or `e2e/`

**Framework:** Playwright (existing in project)

**Critical Paths:**
1. **Basic Search** - Enter location → view results → paginate
2. **Multi-Filter Search** - Apply 3+ filters → verify results match
3. **URL Sync** - Apply filters → copy URL → paste → same results
4. **Filter Reset** - Apply filters → clear all → back to defaults
5. **Saved Search** - Apply filters → save → reload → same filters
6. **Sort Change** - Change sort → results reorder correctly
7. **Map/List Toggle** - Filters persist when switching views

**Run Command:**
```bash
npx playwright test e2e/
```

---

### 5. Performance Tests

**Purpose:** Ensure search remains fast under load.

**Location:** `src/__tests__/perf/` or `perf/`

**Framework:** Custom timing assertions (or k6 if available)

**Scenarios:**
| Scenario | Target | Query Type |
|----------|--------|------------|
| No filters | < 200ms | Baseline |
| Single filter | < 300ms | Typical |
| Complex (5+ filters) | < 500ms | Heavy |
| Large bounds | < 400ms | Geographic |
| Expensive sort (recommended) | < 400ms | Compute-heavy |

**Implementation:**
```typescript
describe('Performance', () => {
  it('complex filter query < 500ms', async () => {
    const start = performance.now();
    await search({
      bounds: SF_BOUNDS,
      minPrice: 500,
      amenities: ['Wifi', 'Parking'],
      languages: ['en', 'es'],
      roomType: 'Private Room',
    });
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(500);
  });
});
```

**Run Command:**
```bash
npm test -- --testPathPattern="perf/"
```

---

### 6. Regression Tests (Production-Driven)

**Purpose:** Replay real production queries to catch regressions.

**Location:** `src/__tests__/regression/`

**Process:**
1. Log normalized filter payloads in production (PII-safe)
2. Sample diverse queries weekly
3. Convert to test cases
4. Run against new code

**Log Format:**
```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "filters": {
    "bounds": { "minLat": 37.7, "maxLat": 37.8, "minLng": -122.5, "maxLng": -122.4 },
    "minPrice": 1000,
    "amenities": ["Wifi"]
  },
  "resultCount": 42,
  "responseTimeMs": 234
}
```

**Run Command:**
```bash
npm test -- --testPathPattern="regression/"
```

---

## Test Data

### Seeded Test Dataset

**Location:** `src/__tests__/fixtures/listings.ts`

**Requirements:**
- Deterministic (seeded random)
- Diverse enough to exercise all filters
- Small enough to be fast (~100 listings)

**Coverage:**
| Attribute | Values in Dataset |
|-----------|-------------------|
| Price | $0, $500, $1000, $1500, $2000, $5000 |
| Room Type | All 3 types |
| Amenities | All 8, various combinations |
| House Rules | All 4, various combinations |
| Languages | 10+ languages, various combinations |
| Locations | SF, LA, NYC, Tokyo (antimeridian test) |
| Dates | Past, today, future, far future |

---

## CI Integration

### GitHub Actions Workflow

**Location:** `.github/workflows/ci.yml`

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Unit Tests
        run: npm test -- --testPathPattern="lib/.*\\.test\\.ts$" --coverage

      - name: Integration Tests
        run: npm test -- --testPathPattern="integration/"

      - name: Property Tests
        run: npm test -- --testPathPattern="property/"

      - name: E2E Tests
        run: npx playwright test

      - name: Performance Tests
        run: npm test -- --testPathPattern="perf/"
```

### Pre-commit Hook

```bash
# Run fast unit tests before commit
npm test -- --testPathPattern="lib/.*\\.test\\.ts$" --bail
```

---

## Running Tests

### All Tests
```bash
npm test
```

### By Category
```bash
# Unit tests only (fast)
npm test -- --testPathPattern="lib/.*\\.test\\.ts$"

# Integration tests
npm test -- --testPathPattern="integration/"

# Property tests
npm test -- --testPathPattern="property/"

# E2E tests
npx playwright test

# Performance tests
npm test -- --testPathPattern="perf/"

# With coverage
npm test -- --coverage
```

### Watch Mode (Development)
```bash
npm test -- --watch --testPathPattern="lib/search"
```

### Debug Mode
```bash
# Run specific test with verbose output
npm test -- --verbose --testNamePattern="price range"
```

---

## Coverage Targets

| Category | Target | Rationale |
|----------|--------|-----------|
| Unit Tests | 90%+ lines | Core logic must be thoroughly tested |
| Integration | 80%+ filter combinations | Pairwise covers most interactions |
| Property | All 12 invariants | Mathematical guarantees |
| E2E | Critical paths only | Slow, focus on user journeys |
| Perf | P95 thresholds | Prevent performance regressions |

---

## Test Maintenance

### Adding New Filter
1. Add to `FILTER_SPEC.md`
2. Add unit tests for parser/validator
3. Add to pairwise generator
4. Add property test for filter match
5. Update E2E if UI-facing

### Debugging Flaky Tests
1. Check for time-dependent logic
2. Ensure deterministic seeding
3. Add explicit waits for async operations
4. Isolate database state

### Updating Test Data
1. Modify `src/__tests__/fixtures/listings.ts`
2. Ensure all filter values still have coverage
3. Re-run pairwise generator if filter values change
