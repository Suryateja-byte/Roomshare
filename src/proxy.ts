import { auth } from "@/auth";
import { checkSuspension } from "@/lib/auth-helpers";
import { applySecurityHeaders } from "@/lib/csp-middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Proxy with request correlation and security headers (Next.js 16+ convention).
 *
 * This is the unified request handler that:
 * 1. Enforces suspension checks on protected routes
 * 2. Adds CSP and related security headers
 * 3. Adds x-request-id to request and response for observability
 */
export default auth(async function proxy(request: NextRequest) {
  const suspensionResponse = await checkSuspension(request);
  if (suspensionResponse) {
    return suspensionResponse;
  }

  const { requestHeaders, responseHeaders } = applySecurityHeaders(request);

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
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|sw-version.js|manifest.json|icons/.*).*)",
  ],
};
