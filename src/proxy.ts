import { auth } from "@/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { checkSuspension } from "@/lib/auth-helpers"

/**
 * Proxy with request correlation (Next.js 16+ convention)
 *
 * This is the unified request handler that:
 * 1. Adds x-request-id header to all requests for observability
 * 2. Enforces suspension checks on protected routes (P0-01 fix)
 *
 * Uses header propagation for downstream handlers (AsyncLocalStorage
 * doesn't work in Edge Runtime and doesn't persist across runtime boundaries)
 */
export default auth(async function proxy(request: NextRequest) {
    // P0-01 FIX: Check suspension status for protected routes
    const suspensionResponse = await checkSuspension(request)
    if (suspensionResponse) {
        return suspensionResponse
    }

    // Generate or propagate request ID (using Web Crypto API for Edge compatibility)
    const requestId = request.headers.get('x-request-id')
        || request.headers.get('x-vercel-id')
        || crypto.randomUUID()

    // Clone headers and add request ID
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-request-id', requestId)

    // Create response with request ID in headers
    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    })

    // Add request ID to response headers for client correlation
    response.headers.set('x-request-id', requestId)

    return response
})

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
