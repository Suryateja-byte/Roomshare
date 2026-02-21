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
 * Rate-limit guard for **API route handlers** (route.ts files).
 *
 * Uses the DB-backed (PostgreSQL) sliding-window rate limiter. For high-traffic
 * endpoints (map, search, chat), prefer `withRateLimitRedis` from
 * `@/lib/with-rate-limit-redis` which uses Upstash Redis for lower latency.
 *
 * **When to use**: Any Next.js API route handler that has a `Request` object.
 * For Server Components / Server Actions, use `checkServerComponentRateLimit` instead.
 *
 * **Interface contract**: Returns `NextResponse | null`.
 * - `null` → request is within limits, proceed with handler logic.
 * - `NextResponse` → 429 response with rate-limit headers. Return it immediately.
 *
 * @param request - The incoming HTTP request (provides IP for identification)
 * @param options - Rate limit configuration (type key, optional custom identifier/endpoint)
 * @returns `null` if allowed, or a 429 `NextResponse` if rate-limited
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
 * Rate-limit guard for **Server Components and Server Actions**.
 *
 * Server Components and Server Actions don't have access to the `Request` object,
 * so this variant accepts a `Headers` object from `next/headers` instead.
 *
 * Uses the same DB-backed (PostgreSQL) sliding-window rate limiter as `withRateLimit`.
 *
 * **When to use**: Any Server Component (page.tsx) or Server Action (actions/*.ts)
 * that needs rate limiting. For API route handlers, use `withRateLimit` instead.
 *
 * **Interface contract**: Returns `{ allowed: boolean, remaining: number, retryAfter?: number }`.
 * - `allowed: true` → request is within limits, proceed.
 * - `allowed: false` → rate-limited. Use `retryAfter` to inform the user.
 *
 * **Test/E2E bypass**: Automatically bypasses rate limiting when `NODE_ENV === 'test'`
 * or `E2E_DISABLE_RATE_LIMIT === 'true'` to avoid flaky CI runs.
 *
 * @param headersList - Headers object from `await headers()` (next/headers)
 * @param type - Rate limit configuration key from RATE_LIMITS
 * @param endpoint - Endpoint identifier for the rate limit bucket
 * @returns Rate limit check result with allowed status and remaining count
 *
 * @example
 * // In a Server Action
 * import { headers } from 'next/headers';
 * import { checkServerComponentRateLimit } from '@/lib/with-rate-limit';
 *
 * export async function createListing(formData: FormData) {
 *   const headersList = await headers();
 *   const rateLimit = await checkServerComponentRateLimit(headersList, 'createListing', '/actions/create-listing');
 *   if (!rateLimit.allowed) {
 *     return { error: 'Too many requests', retryAfter: rateLimit.retryAfter };
 *   }
 *   // Action logic...
 * }
 *
 * @example
 * // In a Server Component
 * import { headers } from 'next/headers';
 *
 * export default async function SearchPage() {
 *   const headersList = await headers();
 *   const rateLimit = await checkServerComponentRateLimit(headersList, 'search', '/search');
 *   if (!rateLimit.allowed) {
 *     return <RateLimitError retryAfter={rateLimit.retryAfter} />;
 *   }
 *   // Page logic...
 * }
 */
export async function checkServerComponentRateLimit(
    headersList: Headers,
    type: RateLimitKey,
    endpoint: string
): Promise<ServerComponentRateLimitResult> {
    // Test environments can opt out to avoid cross-shard contention in CI E2E runs.
    if (
        process.env.NODE_ENV === 'test' ||
        process.env.E2E_DISABLE_RATE_LIMIT === 'true'
    ) {
        return { allowed: true, remaining: 999, retryAfter: undefined };
    }

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
