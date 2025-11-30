import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, type RATE_LIMITS } from './rate-limit';

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
                    'X-RateLimit-Reset': result.resetAt.toISOString()
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
