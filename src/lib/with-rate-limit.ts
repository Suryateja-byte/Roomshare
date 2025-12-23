import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, getClientIPFromHeaders, type RATE_LIMITS } from './rate-limit';
import { getRequestId } from './request-context';

type RateLimitKey = keyof typeof RATE_LIMITS;

interface RateLimitOptions {
    /** The rate limit configuration key from RATE_LIMITS */
    type: RateLimitKey;
    /** Custom identifier (overrides default IP-based) */
    getIdentifier?: (request: Request) => string | Promise<string>;
    /** Custom endpoint name (defaults to request path) */
    endpoint?: string;
}

/**
 * Wrapper function to add rate limiting to API route handlers
 *
 * @example
 * export async function POST(request: Request) {
 *   const rateLimitResponse = await withRateLimit(request, { type: 'register' });
 *   if (rateLimitResponse) return rateLimitResponse;
 *
 *   // Your handler logic...
 * }
 */
export async function withRateLimit(
    request: Request,
    options: RateLimitOptions
): Promise<NextResponse | null> {
    const { type, getIdentifier, endpoint } = options;

    // Import here to avoid circular dependency
    const { RATE_LIMITS } = await import('./rate-limit');
    const config = RATE_LIMITS[type];

    // Get identifier
    let identifier: string;
    if (getIdentifier) {
        identifier = await getIdentifier(request);
    } else {
        identifier = getClientIP(request);
    }

    // Get endpoint name
    const endpointName = endpoint || new URL(request.url).pathname;

    const result = await checkRateLimit(identifier, endpointName, config);

    if (!result.success) {
        // P2-05 FIX: Include x-request-id for complete request tracing on 429 responses
        return NextResponse.json(
            {
                error: 'Too many requests',
                message: 'Please wait before making more requests',
                retryAfter: result.retryAfter
            },
            {
                status: 429,
                headers: {
                    'Retry-After': String(result.retryAfter || 60),
                    'X-RateLimit-Limit': String(config.limit),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': result.resetAt.toISOString(),
                    'x-request-id': getRequestId(),
                }
            }
        );
    }

    return null; // No rate limit hit, proceed with handler
}

/**
 * Add rate limit headers to a successful response
 */
export function addRateLimitHeaders(
    response: NextResponse,
    remaining: number,
    limit: number,
    resetAt: Date
): NextResponse {
    response.headers.set('X-RateLimit-Limit', String(limit));
    response.headers.set('X-RateLimit-Remaining', String(remaining));
    response.headers.set('X-RateLimit-Reset', resetAt.toISOString());
    return response;
}

export interface ServerComponentRateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfter?: number;
}

/**
 * Check rate limit for Server Components (which can't access Request object)
 * Uses Headers object from next/headers instead.
 *
 * @example
 * import { headers } from 'next/headers';
 *
 * export default async function SearchPage() {
 *   const headersList = await headers();
 *   const rateLimit = await checkServerComponentRateLimit(headersList, 'search', '/search');
 *   if (!rateLimit.allowed) {
 *     return <RateLimitError retryAfter={rateLimit.retryAfter} />;
 *   }
 *   // Your page logic...
 * }
 */
export async function checkServerComponentRateLimit(
    headersList: Headers,
    type: RateLimitKey,
    endpoint: string
): Promise<ServerComponentRateLimitResult> {
    // Import here to avoid circular dependency
    const { RATE_LIMITS } = await import('./rate-limit');
    const config = RATE_LIMITS[type];

    // Get identifier from headers
    const identifier = getClientIPFromHeaders(headersList);

    const result = await checkRateLimit(identifier, endpoint, config);

    return {
        allowed: result.success,
        remaining: result.remaining,
        retryAfter: result.retryAfter,
    };
}
