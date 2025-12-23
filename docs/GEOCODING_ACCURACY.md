# Geocoding Accuracy Comparison: Mapbox vs HERE

This document describes the geocoding accuracy test suite for comparing Mapbox and HERE geocoding services.

## Overview

The test suite compares three providers:
- **Mapbox Geocoding v5/v6** - Currently used in production
- **HERE Geocoding** - Alternative provider for evaluation
- **US Census Geocoder** - Independent baseline (not a ground truth, but a neutral reference)

## Quick Start

### 1. Set up environment variables

Add to your `.env` file:

```bash
# Already configured
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token

# Add for comparison testing
HERE_API_KEY=your-here-api-key
```

Get a free HERE API key from: https://developer.here.com/

### 2. Run the comparison

```bash
# Basic comparison (9 addresses, 12 POI keywords)
npm run geocode:compare

# Extended comparison (24 addresses across categories)
npm run geocode:compare:extended

# Export results as JSON
npm run geocode:compare:json > results.json

# Test specific category
npx ts-node scripts/geocode-accuracy-extended.ts --category=apartments
```

## Test Files

| File | Purpose |
|------|---------|
| `scripts/geocode-accuracy-check.ts` | Main comparison with POI search |
| `scripts/geocode-accuracy-extended.ts` | Extended address testing |
| `scripts/lib/geocoding-providers.ts` | Provider abstractions |
| `scripts/lib/haversine.ts` | Distance calculation |

## What Gets Tested

### Geocoding Accuracy

For each test address:
1. Geocode with Mapbox v6 (latest API)
2. Geocode with Mapbox v5 (legacy, currently in production)
3. Geocode with HERE Geocoding
4. Geocode with US Census Geocoder

Compare distances between providers and Census baseline.

### POI Search Quality

For each keyword (e.g., "indian grocery", "gym"):
1. Search with Mapbox Search Box API
2. Search with HERE Discover API

Score based on:
- Number of results
- Distance to closest result
- Name relevance

## Understanding Results

### Distance Metrics

- **< 10 meters**: Excellent - rooftop-level accuracy
- **10-50 meters**: Good - street-level accuracy
- **50-100 meters**: Acceptable - block-level accuracy
- **> 100 meters**: Poor - may indicate wrong location

### Winner Determination

The provider closest to the Census baseline wins. Ties are declared when providers are within 5 meters of each other.

### Sample Output

```
Address: 1121 Hidden Ridge, Irving, TX 75038
  Mapbox v6:   32.868534, -96.970234
  HERE:        32.868512, -96.970198
  Census:      32.868523, -96.970221

  Distance Deltas (to Census baseline):
    Mapbox v6 -> Census: 45 ft (13.72m)
    HERE      -> Census: 28 ft (8.54m)

  Winner (closer to Census): HERE
```

## Test Categories

The extended test includes:

| Category | Description | Count |
|----------|-------------|-------|
| `residential` | Standard home addresses | 5 |
| `apartments` | Multi-unit buildings | 5 |
| `commercial` | Office buildings, tech campuses | 5 |
| `rural` | Rural routes, county roads | 5 |
| `edge` | Famous landmarks, unusual addresses | 4 |

## Interpreting Recommendations

The script provides recommendations based on:

1. **Win rate** - Which provider wins more comparisons
2. **Average delta** - Which provider is closer to Census on average
3. **Category performance** - How each provider handles different address types

### Recommendation Examples

```
RECOMMENDATION: MAPBOX - Better accuracy and win rate

Reasons:
- Better geocoding accuracy in 6/9 address tests
- Better POI search relevance in 8/12 keyword tests
- Average geocoding delta from Census: 42 ft
- Already integrated in codebase
```

## API Documentation

### Mapbox

- Geocoding v6: https://docs.mapbox.com/api/search/geocoding/
- Search Box (POI): https://docs.mapbox.com/api/search/search-box/

### HERE

- Geocoding: https://developer.here.com/documentation/geocoding-search-api/
- Discover (POI): https://developer.here.com/documentation/geocoding-search-api/dev_guide/topics/endpoint-discover-brief.html

### US Census

- Geocoder: https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html

## Caveats

1. **Census is not ground truth** - Census uses address range interpolation, so results may be off by tens of meters. It's useful as an independent baseline, not as the definitive correct answer.

2. **POI coverage varies** - Both providers have different POI databases. "Better" depends on your specific use case.

3. **Rate limits** - Both APIs have rate limits. The scripts include delays to avoid hitting them.

4. **Regional differences** - Results may vary significantly by region. Test with addresses relevant to your use case.

## Making a Decision

Consider these factors:

| Factor | Mapbox | HERE |
|--------|--------|------|
| Already integrated | Yes | No |
| Geocoding accuracy | Test results | Test results |
| POI search | Test results | Test results |
| Map rendering | Excellent | Good |
| Pricing | Usage-based | Usage-based |
| Documentation | Excellent | Good |

If test results are similar, staying with Mapbox makes sense due to existing integration and excellent map rendering support.

## Extending the Tests

### Add new test addresses

Edit `TEST_ADDRESSES` in the script files:

```typescript
const TEST_ADDRESSES = [
  {
    address: 'Your New Address, City, ST ZIP',
    category: 'residential',
    expectedCity: 'City',
    expectedState: 'ST',
    notes: 'Description of why this address matters',
  },
  // ...
];
```

### Add new POI keywords

Edit `POI_KEYWORDS` in `geocode-accuracy-check.ts`:

```typescript
const POI_KEYWORDS = [
  'existing keyword',
  'your new keyword',
  // ...
];
```

### Add a new provider

1. Add functions to `scripts/lib/geocoding-providers.ts`
2. Update comparison logic in the main scripts
3. Add to the parallel Promise.all() calls

## Troubleshooting

### "Missing HERE_API_KEY"

```bash
# Add to .env
HERE_API_KEY=your-api-key-from-developer.here.com
```

### "HTTP 401" errors

- Check that API keys are valid and not expired
- Verify API key permissions include geocoding

### "Rate limit exceeded"

- Wait a few minutes and try again
- Reduce number of test addresses

### Census returns no result

- Census geocoder only works for US addresses
- Some rural/PO Box addresses may not match
