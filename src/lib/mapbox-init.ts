import mapboxgl from 'mapbox-gl';

// Set Mapbox GL worker URL - must be same-origin (CORS restriction)
// Worker file is copied from node_modules/mapbox-gl/dist/ to public/
// Note: workerUrl exists at runtime but isn't in @types/mapbox-gl
(mapboxgl as unknown as { workerUrl: string }).workerUrl = '/mapbox-gl-csp-worker.js';

export default mapboxgl;
