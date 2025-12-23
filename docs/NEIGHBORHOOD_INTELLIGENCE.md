# Neighborhood Intelligence Feature

A Places-powered neighborhood exploration system integrated into the RoomShare listing chat interface.

## Overview

Neighborhood Intelligence allows users to discover nearby amenities (coffee shops, gyms, restaurants, etc.) from any listing page. The feature provides:

- **All Users**: Search for nearby places with distance context
- **Pro Users**: Interactive map, custom place list, and detailed place information

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    NeighborhoodChat.tsx                         │
│                  (Main chat orchestrator)                       │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                  NeighborhoodModule.tsx                         │
│            (Tier-aware component router)                        │
├─────────────────────┬───────────────────────────────────────────┤
│   Free Tier         │           Pro Tier                        │
├─────────────────────┼───────────────────────────────────────────┤
│ • ContextBar        │ • ContextBar                              │
│ • NearbyPlacesCard  │ • NeighborhoodPlaceList                   │
│ • ProUpgradeCTA     │ • NeighborhoodMap                         │
│                     │ • PlaceDetailsPanel                       │
└─────────────────────┴───────────────────────────────────────────┘
```

## Component Reference

### Core Components

| Component | Path | Purpose |
|-----------|------|---------|
| `NeighborhoodChat` | `src/app/messages/[id]/NeighborhoodChat.tsx` | Main chat orchestrator |
| `NeighborhoodModule` | `src/components/neighborhood/NeighborhoodModule.tsx` | Tier-aware rendering |
| `ContextBar` | `src/components/neighborhood/ContextBar.tsx` | Search metadata display |
| `NearbyPlacesCard` | `src/components/chat/NearbyPlacesCard.tsx` | Google Places UI Kit wrapper |

### Pro-Only Components

| Component | Path | Purpose |
|-----------|------|---------|
| `NeighborhoodMap` | `src/components/neighborhood/NeighborhoodMap.tsx` | Interactive Mapbox map |
| `NeighborhoodPlaceList` | `src/components/neighborhood/NeighborhoodPlaceList.tsx` | Custom place cards |
| `PlaceDetailsPanel` | `src/components/neighborhood/PlaceDetailsPanel.tsx` | Slide-in details panel |
| `ProUpgradeCTA` | `src/components/neighborhood/ProUpgradeCTA.tsx` | Upgrade prompt |

### Utility Modules

| Module | Path | Purpose |
|--------|------|---------|
| `distance.ts` | `src/lib/geo/distance.ts` | Haversine distance, walk time estimates |
| `subscription.ts` | `src/lib/subscription.ts` | Pro user detection, feature flags |
| `nearby-intent.ts` | `src/lib/nearby-intent.ts` | NLP query parsing |
| `neighborhoodCache.ts` | `src/lib/places/neighborhoodCache.ts` | Database caching layer |

## User Experience

### Free Users

1. User submits a query (e.g., "coffee shops nearby")
2. ContextBar shows: "5 places found | Within 1.0 mi | 0.2 mi - 0.8 mi | Sorted by distance"
3. Google Places UI Kit renders place cards with Google's native styling
4. ProUpgradeCTA appears with a blurred map preview encouraging upgrade

### Pro Users

1. User submits a query
2. ContextBar shows search metadata (same as free)
3. Custom place list shows each POI with:
   - Place name and type
   - Distance in miles/feet
   - Estimated walk time
   - Rating and "Open" badge
4. Interactive Mapbox map displays:
   - Listing location at center (home icon)
   - POI pins with clustering (15+ POIs)
   - 5/10/15 minute walkability rings
5. List and map sync on hover/click
6. Clicking a POI opens PlaceDetailsPanel with full information

## Environment Variables

```bash
# Google Places UI Kit (required)
NEXT_PUBLIC_GOOGLE_MAPS_UIKIT_KEY=<your-api-key>

# Mapbox (required for Pro map)
NEXT_PUBLIC_MAPBOX_TOKEN=<your-mapbox-token>

# Development: Force Pro features without subscription
NEXT_PUBLIC_FORCE_PRO_MODE=true
```

## Subscription Gating

```typescript
import { isProUser, getNeighborhoodProFeatures } from '@/lib/subscription';

// Check if user has Pro
const isPro = isProUser(user.subscriptionTier);

// Get feature flags
const features = getNeighborhoodProFeatures(tier);
// Returns: { showInteractiveMap, showCustomPlaceList, showPerItemDistance, ... }
```

The `NEXT_PUBLIC_FORCE_PRO_MODE=true` environment variable overrides subscription checks in development.

## Distance Utilities

```typescript
import {
  haversineMiles,
  formatDistance,
  estimateWalkMins,
  formatWalkTime,
  getWalkabilityRings,
} from '@/lib/geo/distance';

// Calculate distance between two points
const distance = haversineMiles(lat1, lng1, lat2, lng2);

// Format for display
formatDistance(0.5);  // "0.5 mi"
formatDistance(0.05); // "264 ft"

// Estimate walk time (3 mph average)
estimateWalkMins(0.5); // 10 minutes

// Get walkability ring definitions
getWalkabilityRings();
// [{ minutes: 5, meters: 402.336 }, { minutes: 10, meters: 804.672 }, ...]
```

## Caching

Results are cached in the database using Prisma:

```prisma
model NeighborhoodCache {
  id            String   @id @default(cuid())
  listingId     String
  queryHash     String   @unique
  normalizedQuery String
  radiusMeters  Int
  results       Json
  createdAt     DateTime @default(now())
  expiresAt     DateTime
}
```

- **TTL**: Up to 30 days (per Google Places ToS)
- **Cache Key**: Hash of `listingId + normalizedQuery + radiusMeters`
- **Cleanup**: CRON job clears expired entries

## Analytics Events

All events are tracked via `src/lib/analytics/neighborhood.ts`:

| Event | Trigger |
|-------|---------|
| `neighborhood_query` | Search submitted |
| `neighborhood_place_clicked` | POI selected from list or map |
| `neighborhood_map_interaction` | Map pan/zoom |
| `neighborhood_upgrade_clicked` | Pro upgrade CTA clicked |
| `neighborhood_directions_opened` | Directions button clicked |

## Testing

### Unit Tests

```bash
# Run distance utility tests
npm test -- src/__tests__/lib/geo/distance.test.ts
```

### Component Tests

```bash
# Run neighborhood component tests
npm test -- src/__tests__/components/neighborhood/
```

### E2E Tests

```bash
# Run E2E-style tests
npm test -- src/__tests__/e2e/neighborhood.e2e.test.ts
```

## Accessibility

All components are WCAG 2.1 AA compliant:

- **ContextBar**: `role="region"` with `aria-live="polite"` for dynamic updates
- **NeighborhoodPlaceList**: `role="listbox"` with keyboard navigation (Arrow keys, Home, End)
- **NeighborhoodMap**: `role="region"` with labeled markers
- **PlaceDetailsPanel**: Focus trap, Escape to close, `aria-modal="true"`

## Performance Considerations

1. **Lazy Loading**: Google Maps script loads only when needed
2. **Debouncing**: Queries debounced to prevent excessive API calls
3. **Progressive Radius**: Starts at 1600m, expands if no results
4. **Clustering**: Map clusters POIs when 15+ are displayed
5. **Dynamic Imports**: Map and Places components use `ssr: false`

## Troubleshooting

### "Mapbox Token Missing" Error

Ensure `NEXT_PUBLIC_MAPBOX_TOKEN` is set in your environment.

### Places Not Loading

1. Check `NEXT_PUBLIC_GOOGLE_MAPS_UIKIT_KEY` is valid
2. Verify API has Places API enabled in Google Cloud Console
3. Check browser console for CORS or quota errors

### Pro Features Not Showing

1. Set `NEXT_PUBLIC_FORCE_PRO_MODE=true` in development
2. Verify user has `subscriptionTier: 'pro'` in database
