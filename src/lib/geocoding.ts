import { circuitBreakers, isCircuitOpenError } from "./circuit-breaker";
import { logger } from "./logger";
import { forwardGeocode } from "./geocoding/nominatim";

export type GeocodeResult =
  | { status: "success"; lat: number; lng: number }
  | { status: "not_found" }
  | { status: "error"; message: string };

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  try {
    return await circuitBreakers.nominatimGeocode.execute(async () => {
      const result = await forwardGeocode(address);

      if (!result) {
        logger.sync.warn("No geocoding results found");
        return { status: "not_found" as const };
      }

      return { status: "success" as const, lat: result.lat, lng: result.lng };
    });
  } catch (error) {
    if (isCircuitOpenError(error)) {
      throw error; // Let caller handle circuit breaker (503)
    }
    logger.sync.error("Error geocoding address", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: "error" as const, message: "Geocoding service error" };
  }
}
