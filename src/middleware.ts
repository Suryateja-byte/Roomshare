import { auth } from "@/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { runWithRequestContext } from '@/lib/request-context'

/**
 * Middleware with request correlation and context initialization
 * Adds x-request-id header to all requests for observability
 * Initializes AsyncLocalStorage context for middleware-level logging
 */
export default auth(async function middleware(request: NextRequest) {
    // Generate or propagate request ID
    const requestId = request.headers.get('x-request-id')
        || request.headers.get('x-vercel-id')
        || crypto.randomUUID()

    // Run within request context for middleware-level logging
    // Note: Context doesn't persist across Edge->Node runtime boundary
    // Header propagation is the primary mechanism for downstream handlers
    return runWithRequestContext(
        {
            requestId,
            path: request.nextUrl.pathname,
            method: request.method,
        },
        () => {
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
        }
    )
})

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
