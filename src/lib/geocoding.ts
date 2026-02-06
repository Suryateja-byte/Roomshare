import { fetchWithTimeout, FetchTimeoutError } from './fetch-with-timeout';
import { circuitBreakers, isCircuitOpenError } from './circuit-breaker';
import { logger } from './logger';

// Timeout for geocoding requests (10 seconds)
const GEOCODING_TIMEOUT_MS = 10000;

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    const token = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    if (!token) {
        logger.sync.error("Mapbox token is missing");
        return null;
    }

    try {
        return await circuitBreakers.mapboxGeocode.execute(async () => {
            const encodedAddress = encodeURIComponent(address);
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${token}&limit=1`;

            const response = await fetchWithTimeout(url, { timeout: GEOCODING_TIMEOUT_MS });

            if (!response.ok) {
                logger.sync.error("Geocoding API error", {
                    status: response.status,
                    statusText: response.statusText,
                });
                return null;
            }

            const data = await response.json();

            if (data.features && data.features.length > 0) {
                const [lng, lat] = data.features[0].center;
                return { lat, lng };
            }

            // No results found
            logger.sync.warn("No geocoding results found");
            return null;
        });
    } catch (error) {
        if (isCircuitOpenError(error)) {
            logger.sync.warn('[Geocoding] Circuit breaker open, skipping geocode request');
            return null;
        }
        if (error instanceof FetchTimeoutError) {
            logger.sync.error('Geocoding request timed out', {
                timeoutMs: GEOCODING_TIMEOUT_MS,
            });
        } else {
            logger.sync.error("Error geocoding address", {
                error: error instanceof Error ? error.message : String(error),
            });
        }
        return null;
    }
}
