import mapboxgl from 'mapbox-gl';

/**
 * Mapbox GL Worker Initialization
 *
 * Sets the worker URL for CSP compliance. Must be same-origin (CORS restriction).
 * Worker file is copied from node_modules/mapbox-gl/dist/ to public/.
 *
 * Note: workerUrl exists at runtime but isn't in @types/mapbox-gl
 *
 * IMPORTANT: This must run before any map rendering to avoid
 * "Cannot read properties of undefined (reading 'send')" errors
 * that can occur during Turbopack HMR or initial page load.
 */
try {
  // Only set worker URL in browser environment
  if (typeof window !== 'undefined') {
    (mapboxgl as unknown as { workerUrl: string }).workerUrl = '/mapbox-gl-csp-worker.js';
  }
} catch (error) {
  // Log but don't crash - map may still work with default worker
  console.error('[MAPBOX] Failed to initialize worker URL:', error);
}

export default mapboxgl;
