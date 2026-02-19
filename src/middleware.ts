import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkSuspension } from "@/lib/auth-helpers";
import { applySecurityHeaders } from "@/lib/csp-middleware";
import { checkServerComponentRateLimit } from "@/lib/with-rate-limit";

export default auth(async function middleware(request: NextRequest) {
  // P0-01 FIX: Check suspension status for protected routes
  const suspensionResponse = await checkSuspension(request);
  if (suspensionResponse) return suspensionResponse;

  // Rate limit /search at middleware level so clients receive HTTP 429 (not SSR 200 fallback content)
  if (request.nextUrl.pathname === "/search") {
    const rateLimitResult = await checkServerComponentRateLimit(
      request.headers,
      "search",
      "/search",
    );
    if (!rateLimitResult.allowed) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: {
          "Retry-After": String(rateLimitResult.retryAfter ?? 60),
          "Content-Type": "text/plain",
        },
      });
    }
  }

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
