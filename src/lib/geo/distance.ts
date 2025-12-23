/**
 * Geographic distance utilities for Neighborhood Intelligence feature.
 * Uses Haversine formula for accurate great-circle distance calculations.
 */

const EARTH_RADIUS_METERS = 6_371_000;
const EARTH_RADIUS_MILES = 3_958.8;
const METERS_PER_MILE = 1_609.344;
const FEET_PER_MILE = 5_280;
const WALKING_SPEED_MPH = 3; // Average walking speed

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate the Haversine distance between two points in meters.
 * @param lat1 - Latitude of point 1 in degrees
 * @param lng1 - Longitude of point 1 in degrees
 * @param lat2 - Latitude of point 2 in degrees
 * @param lng2 - Longitude of point 2 in degrees
 * @returns Distance in meters
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Calculate the Haversine distance between two points in miles.
 * @param lat1 - Latitude of point 1 in degrees
 * @param lng1 - Longitude of point 1 in degrees
 * @param lat2 - Latitude of point 2 in degrees
 * @param lng2 - Longitude of point 2 in degrees
 * @returns Distance in miles
 */
export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}

/**
 * Format distance for display.
 * - Under 0.1 miles: show in feet (e.g., "850 ft")
 * - 0.1 miles and above: show in miles (e.g., "0.3 mi")
 * @param miles - Distance in miles
 * @returns Formatted distance string
 */
export function formatDistance(miles: number): string {
  if (miles < 0.1) {
    const feet = Math.round(miles * FEET_PER_MILE);
    return `${feet} ft`;
  }
  return `${miles.toFixed(1)} mi`;
}

/**
 * Estimate walking time in minutes based on distance.
 * Uses average walking speed of 3 mph (20 min/mile).
 * @param miles - Distance in miles
 * @returns Estimated walking time in minutes
 */
export function estimateWalkMins(miles: number): number {
  const hours = miles / WALKING_SPEED_MPH;
  return Math.round(hours * 60);
}

/**
 * Format walking time for display.
 * @param minutes - Walking time in minutes
 * @returns Formatted walk time string (e.g., "~6 min walk")
 */
export function formatWalkTime(minutes: number): string {
  if (minutes < 1) {
    return '< 1 min walk';
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) {
      return `~${hours} hr walk`;
    }
    return `~${hours} hr ${mins} min walk`;
  }
  return `~${minutes} min walk`;
}

/**
 * Convert walking minutes to meters (for radius calculations).
 * @param minutes - Walking time in minutes
 * @returns Distance in meters
 */
export function walkMinutesToMeters(minutes: number): number {
  const hours = minutes / 60;
  const miles = hours * WALKING_SPEED_MPH;
  return miles * METERS_PER_MILE;
}

/**
 * Convert meters to miles.
 * @param meters - Distance in meters
 * @returns Distance in miles
 */
export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

/**
 * Convert miles to meters.
 * @param miles - Distance in miles
 * @returns Distance in meters
 */
export function milesToMeters(miles: number): number {
  return miles * METERS_PER_MILE;
}

/**
 * Get walkability ring radii in meters.
 * Returns distances for 5, 10, and 15 minute walks.
 */
export function getWalkabilityRings(): { minutes: number; meters: number }[] {
  return [
    { minutes: 5, meters: walkMinutesToMeters(5) },   // ~402m
    { minutes: 10, meters: walkMinutesToMeters(10) }, // ~805m
    { minutes: 15, meters: walkMinutesToMeters(15) }, // ~1207m
  ];
}
