import { checkSuspension } from "@/lib/auth-helpers";
import { applySecurityHeaders } from "@/lib/csp-middleware";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Next.js 16 proxy entrypoint for apps rooted under src/app.
 *
 * This request pipeline keeps suspension enforcement and security headers
 * in one place without wrapping every request in auth().
 */
export async function proxy(request: NextRequest) {
  // Defence in depth: if suspension enforcement throws, do NOT let it propagate.
  // An uncaught throw here returns a 500 that skips applySecurityHeaders below,
  // stripping CSP/HSTS/X-Frame-Options — next.config.ts deliberately does not
  // emit CSP, so this proxy is the only place it is set. A logged, header-bearing
  // degradation beats a bare 500 with no security headers. Logged at `error`
  // because a silent enforcement failure is worse than the outage it replaces.
  let suspensionResponse: NextResponse | null = null;
  try {
    suspensionResponse = await checkSuspension(request);
  } catch (error) {
    logger.sync.error("[Proxy] checkSuspension threw; continuing unauthenticated", {
      error: sanitizeErrorMessage(error),
    });
  }
  if (suspensionResponse) {
    return suspensionResponse;
  }

  const { requestHeaders, responseHeaders, nonce } =
    applySecurityHeaders(request);

  if (nonce) {
    requestHeaders.set("x-nonce", nonce);
  }

  const requestId =
    request.headers.get("x-request-id") ||
    request.headers.get("x-vercel-id") ||
    crypto.randomUUID();
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  responseHeaders.forEach((value, key) => response.headers.set(key, value));
  response.headers.set("x-request-id", requestId);

  return response;
}

export const config = {
  matcher: [
    "/((?!api/health|_next/static|_next/image|_next/webpack-hmr|favicon.ico|sw.js|sw-version.js|manifest.json|icons).*)",
  ],
};
