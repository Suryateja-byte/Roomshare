/**
 * Haversine distance calculation utility.
 * Calculates the great-circle distance between two points on Earth.
 */

/**
 * Calculate the haversine distance between two coordinates in meters.
 * @param lat1 - Latitude of first point
 * @param lon1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lon2 - Longitude of second point
 * @returns Distance in meters
 */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Convert meters to miles.
 */
export function metersToMiles(meters: number): number {
  return meters / 1609.344;
}

/**
 * Convert meters to feet.
 */
export function metersToFeet(meters: number): number {
  return meters * 3.28084;
}

/**
 * Format distance for display.
 * Shows feet for distances under 1000 feet, otherwise miles.
 */
export function formatDistance(meters: number): string {
  const feet = metersToFeet(meters);
  if (feet < 1000) {
    return `${Math.round(feet)} ft`;
  }
  const miles = metersToMiles(meters);
  return `${miles.toFixed(2)} mi`;
}
