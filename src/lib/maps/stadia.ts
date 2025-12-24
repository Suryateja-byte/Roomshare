/**
 * Stadia Maps configuration
 *
 * Provides style URLs for Alidade Smooth basemap with dark mode support.
 * Uses vector tiles via style JSON URL (MapLibre compatible).
 *
 * COMMERCIAL USE: Free tier is non-commercial/evaluation only.
 * For production, use a paid plan (Starter+) or domain auth.
 *
 * AUTHENTICATION:
 * - localhost/127.0.0.1: No API key required
 * - Production (recommended): Domain auth at client.stadiamaps.com
 * - Production (fallback): API key via query string
 *
 * ATTRIBUTION: MapLibre's built-in attributionControl reads from style JSON.
 * Do not override or simplify - let the control render complete attribution.
 *
 * @see https://docs.stadiamaps.com/map-styles/alidade-smooth/
 * @see https://stadiamaps.com/attribution/
 */

const STADIA_BASE = 'https://tiles.stadiamaps.com/styles';

export type StadiaStyle = 'alidade_smooth' | 'alidade_smooth_dark';

/**
 * Build Stadia Maps style URL with optional API key
 *
 * @param style - The Stadia style name
 * @param apiKey - Optional API key (for non-domain-auth production)
 * @returns Complete style JSON URL
 */
export function getStadiaStyleUrl(
  style: StadiaStyle = 'alidade_smooth',
  apiKey?: string
): string {
  const baseUrl = `${STADIA_BASE}/${style}.json`;
  return apiKey ? `${baseUrl}?api_key=${apiKey}` : baseUrl;
}

/**
 * Get appropriate style based on dark mode preference
 *
 * @param isDarkMode - Whether to use dark mode style
 * @param apiKey - Optional API key (for non-domain-auth production)
 * @returns Complete style JSON URL
 */
export function getStadiaStyle(isDarkMode: boolean, apiKey?: string): string {
  const style: StadiaStyle = isDarkMode ? 'alidade_smooth_dark' : 'alidade_smooth';
  return getStadiaStyleUrl(style, apiKey);
}

/**
 * Stadia Maps domains for CSP configuration
 * Add these to both connect-src and img-src
 */
export const STADIA_DOMAINS = [
  'https://tiles.stadiamaps.com',
  'https://api.stadiamaps.com',
] as const;
