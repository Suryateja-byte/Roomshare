import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkSuspension } from "@/lib/auth-helpers";
import { applySecurityHeaders } from "@/lib/csp-middleware";

export default auth(async function middleware(request: NextRequest) {
  // P0-01 FIX: Check suspension status for protected routes
  const suspensionResponse = await checkSuspension(request);
  if (suspensionResponse) return suspensionResponse;

  const { requestHeaders, responseHeaders } = applySecurityHeaders(request);

  // Generate or propagate request ID for observability
  const requestId =
    request.headers.get("x-request-id") ||
    request.headers.get("x-vercel-id") ||
    crypto.randomUUID();
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
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
