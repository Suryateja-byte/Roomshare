# Map Tile Configuration

## Basemap Provider: Stadia Maps

We use [Stadia Maps](https://stadiamaps.com) Alidade Smooth style for basemap tiles in the Nearby Places feature.

### Why Stadia Maps?

- **Modern, clean design** - Optimized for data overlays and markers
- **Dark mode support** - Alidade Smooth Dark variant syncs with app theme
- **Vector tiles** - Crisp rendering at all zoom levels
- **MapLibre founding member** - Active open-source community involvement
- **Commercial-friendly licensing** - Clear terms for production use

### Why NOT OpenStreetMap Public Tile Servers?

The OSM public tile servers (`tile.openstreetmap.org`) have limitations:

- **Usage policy restrictions** - Not intended for commercial applications
- **Rate limits** - May affect production reliability
- **No dark mode** - Only single light theme available
- **Raster-only** - No vector tile support

## Setup

### 1. Create Account

Visit [client.stadiamaps.com](https://client.stadiamaps.com/) to create an account.

### 2. Production Authentication

**Option A: Domain Auth (Recommended)**

1. Add your production domain(s) in the Stadia Maps dashboard
2. No API key needed in your code - requests are authenticated by origin
3. Most secure option - no key exposed in client code

**Option B: API Key (Fallback)**

1. Generate an API key in the Stadia Maps dashboard
2. Add to environment: `NEXT_PUBLIC_STADIA_API_KEY=your-key`
3. Key is appended to style URL as `?api_key=YOUR_KEY`

### 3. Local Development

No API key required for `localhost` or `127.0.0.1`.

Stadia allows unauthenticated access for development environments.

## Style URLs

| Theme | URL |
|-------|-----|
| Light | `https://tiles.stadiamaps.com/styles/alidade_smooth.json` |
| Dark  | `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json` |

With API key: append `?api_key=YOUR_KEY`

## Attribution Requirements

Attribution is handled automatically by MapLibre's built-in `attributionControl`.

The style JSON contains complete attribution (Stadia Maps, OpenStreetMap, OpenMapTiles, etc.) with proper hyperlinks.

**Do not override or simplify the attribution** - let MapLibre render it directly from the style.

## Commercial Use

| Tier | Credits/Month | Commercial Allowed |
|------|---------------|-------------------|
| Free | 200,000 | No (evaluation/non-commercial only) |
| Starter | 1,000,000 | Yes |
| Standard | 5,000,000 | Yes |
| Professional | 20,000,000 | Yes |

For production commercial use, subscribe to a paid plan at [stadiamaps.com/pricing](https://stadiamaps.com/pricing/).

## Implementation Details

### Files

| File | Purpose |
|------|---------|
| `src/lib/maps/stadia.ts` | Helper for building Stadia style URLs |
| `src/components/nearby/NearbyPlacesMap.tsx` | Map component using Stadia basemap |
| `next.config.ts` | CSP headers for Stadia domains |
| `src/lib/env.ts` | Optional API key validation |

### CSP Configuration

Stadia domains are added to Content Security Policy:

- `connect-src`: `https://tiles.stadiamaps.com https://api.stadiamaps.com`
- `img-src`: Covered by existing `https:` wildcard

### Dark Mode

The map automatically uses the dark style when the app theme is dark:

```typescript
const { resolvedTheme } = useTheme(); // from next-themes
const isDarkMode = resolvedTheme === 'dark';
const styleUrl = getStadiaStyle(isDarkMode, apiKey);
```

The map recreates when theme changes to load the appropriate style.

## Related Documentation

- [Stadia Maps Alidade Smooth](https://docs.stadiamaps.com/map-styles/alidade-smooth/)
- [Stadia Maps Attribution Guide](https://stadiamaps.com/attribution/)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
- [Radar Places API](https://radar.com/documentation/api#search-places) (used for POI data)
