import { checkSuspension } from "@/lib/auth-helpers";
import { applySecurityHeaders } from "@/lib/csp-middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Next.js 16 proxy entrypoint for apps rooted under src/app.
 *
 * This request pipeline keeps suspension enforcement and security headers
 * in one place without wrapping every request in auth().
 */
export async function proxy(request: NextRequest) {
  const suspensionResponse = await checkSuspension(request);
  if (suspensionResponse) {
    return suspensionResponse;
  }

  const { requestHeaders, responseHeaders, nonce } = applySecurityHeaders(request);

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
    "/((?!api/health|_next/static|_next/image|favicon.ico|sw.js|sw-version.js|manifest.json|icons).*)",
  ],
};
