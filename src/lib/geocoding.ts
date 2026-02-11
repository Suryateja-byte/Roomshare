import { circuitBreakers, isCircuitOpenError } from './circuit-breaker';
import { logger } from './logger';
import { forwardGeocode } from './geocoding/nominatim';

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    try {
        return await circuitBreakers.nominatimGeocode.execute(async () => {
            const result = await forwardGeocode(address);

            if (!result) {
                // No results found
                logger.sync.warn("No geocoding results found");
                return null;
            }

            return result;
        });
    } catch (error) {
        if (isCircuitOpenError(error)) {
            logger.sync.warn('[Geocoding] Circuit breaker open, skipping geocode request');
            return null;
        }
        logger.sync.error("Error geocoding address", {
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}
