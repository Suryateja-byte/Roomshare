import { buildCspHeader } from "@/lib/csp";

export function applySecurityHeaders(request: { headers: Headers }) {
  const isDev = process.env.NODE_ENV !== "production";
  const nonce = isDev
    ? undefined
    : crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  const cspHeader = buildCspHeader(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", cspHeader);

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Security-Policy", cspHeader);
  responseHeaders.set("X-Frame-Options", "DENY");
  // HSTS is production-only. Setting it on local HTTP can cause browsers
  // to force HTTPS for localhost/127.0.0.1 and break dev access.
  if (!isDev) {
    responseHeaders.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }
  responseHeaders.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self), interest-cohort=()"
  );
  responseHeaders.set("X-XSS-Protection", "1; mode=block");
  responseHeaders.set("X-DNS-Prefetch-Control", "on");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("Referrer-Policy", "origin-when-cross-origin");
  // Cross-origin isolation (Phase 2 security hardening)
  // COEP omitted — require-corp breaks third-party resources
  // (Google Maps tiles, Supabase images, Google OAuth avatars)
  responseHeaders.set("Cross-Origin-Resource-Policy", "same-origin");
  responseHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

  return { requestHeaders, responseHeaders, nonce };
}
