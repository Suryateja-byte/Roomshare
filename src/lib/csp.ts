const CONNECT_SRC_ORIGINS = [
  "'self'",
  "https://photon.komoot.io",
  "https://nominatim.openstreetmap.org",
  "https://tile.openstreetmap.org",
  "https://*.tile.openstreetmap.org",
  "https://tiles.openfreemap.org",
  "https://maps.googleapis.com",
  "https://places.googleapis.com",
  "https://*.supabase.co",
  "https://api.groq.com",
  "wss://*.supabase.co",
  "https://api.radar.io",
  "https://tiles.stadiamaps.com",
  "https://api.stadiamaps.com",
  "https://challenges.cloudflare.com",
];


// SEC-002 FIX: Routes that render MapLibre maps and need 'unsafe-eval' for WebGL shaders
const MAP_PAGE_PATTERNS = [/^\/search/, /^\/listings\/[^/]+$/];

export function isMapPage(pathname: string): boolean {
  return MAP_PAGE_PATTERNS.some((p) => p.test(pathname));
}

export function buildCspHeader(
  nonce?: string,
  options?: { pathname?: string }
): string {
  const isDev = process.env.NODE_ENV !== "production";
  const needsUnsafeEval = isDev || isMapPage(options?.pathname ?? "");

  const scriptSrcTokens: string[] = ["'self'"];
  if (isDev) {
    scriptSrcTokens.push("'unsafe-inline'", "'unsafe-eval'");
  } else if (nonce) {
    scriptSrcTokens.push(`'nonce-${nonce}'`, "'strict-dynamic'");
    // SEC-002 FIX: Only include 'unsafe-eval' on map pages (MapLibre WebGL shaders)
    if (needsUnsafeEval) {
      scriptSrcTokens.push("'unsafe-eval'");
    }
  }
  scriptSrcTokens.push(
    "https://maps.googleapis.com",
    "https://challenges.cloudflare.com"
  );

  const directives: string[] = [
    "default-src 'self'",
    `script-src ${scriptSrcTokens.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "object-src 'none'",
    "font-src 'self' https://tiles.openfreemap.org",
    `connect-src ${CONNECT_SRC_ORIGINS.join(" ")}`,
    "worker-src 'self' blob:",
    "child-src blob:",
    "frame-src 'self' https://accounts.google.com https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
