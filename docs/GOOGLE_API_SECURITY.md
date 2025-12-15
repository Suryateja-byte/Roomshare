# Google Maps API Key Security Configuration

This document outlines the required security configuration for Google Maps Platform API keys used in RoomShare.

## Required GCP Console Settings

### 1. API Key Restrictions

#### Application Restrictions
**Set to: HTTP Referrers (websites)**

Add these patterns:
- `https://roomshare.com/*`
- `https://www.roomshare.com/*`
- `https://staging.roomshare.com/*`
- `http://localhost:3000/*` (development only)

#### API Restrictions
**Restrict to ONLY:**
- Maps JavaScript API
- Places API (New)

**Do NOT enable:**
- Directions API
- Distance Matrix API
- Routes API

### 2. Non-Google Map Restriction (CRITICAL)

**Rule:** Never use Routes API, Directions API, or Distance Matrix API content on any screen that also displays a non-Google map (e.g., Mapbox).

Since RoomShare uses Mapbox for map displays, the following are **PROHIBITED**:
- Displaying Google-calculated distances alongside Mapbox maps
- Showing Google-calculated travel times with Mapbox maps
- Using Google route polylines on Mapbox maps

**Our Approach:**
- We use Places UI Kit ONLY for nearby place discovery
- The DistanceRail component was removed because it calculated derived distances from Places coordinate data (ToS violation)
- No coordinate extraction from Places API results

### 3. ToS Compliance Notes

The following practices are **prohibited** under Google Maps Platform ToS:

1. **Extracting coordinates from Places API results** for use in distance calculations
2. **Storing place data** (names, addresses, ratings, coordinates) beyond caching limits
3. **Displaying Places data on non-Google maps** without proper attribution
4. **Calculating distances/routes** from Places coordinates using any method (including Haversine)

**Our Implementation:**
- NearbyPlacesCard renders Google's Places UI Kit components directly
- No coordinate extraction from `place.location` or `geometry`
- Google attribution component (`<gmp-place-attribution />`) always visible
- No place data stored or cached beyond the session

### 4. Quota Management

| API | Recommended Daily Limit |
|-----|-------------------------|
| Places API (New) | 10,000/day |
| Places API (New) | 100/minute |
| Maps JavaScript API | 50,000/day |

### 5. Budget Alerts

Create budget alerts in GCP Console at:
- 50% of monthly budget
- 75% of monthly budget
- 90% of monthly budget
- 100% of monthly budget

### 6. Monitoring

Enable the following in GCP Console:
- Usage anomaly detection
- Quota exhaustion alerts
- Billing anomaly alerts

## Environment Variables

```bash
# Browser key for Places UI Kit (HTTP referrer restricted)
NEXT_PUBLIC_GOOGLE_MAPS_UIKIT_KEY=your-browser-key

# Server key for backend scripts (IP restricted) - optional
GOOGLE_PLACES_API_KEY=your-server-key
```

## Security Checklist

- [ ] API key restricted to HTTP referrers (websites)
- [ ] Only Maps JavaScript API and Places API (New) enabled
- [ ] Directions/Distance Matrix/Routes APIs NOT enabled
- [ ] Daily quota limits configured
- [ ] Budget alerts configured
- [ ] No coordinate extraction in client code
- [ ] Google attribution visible on all Places UI Kit components
- [ ] No Places data displayed on Mapbox maps

## Related Files

- `src/components/chat/NearbyPlacesCard.tsx` - Places UI Kit integration
- `src/lib/googleMapsUiKitLoader.ts` - API key loading
- `docs/CHATBOT_ARCHITECTURE.md` - Full chatbot system documentation
