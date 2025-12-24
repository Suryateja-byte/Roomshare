import { prisma } from '@/lib/prisma';

interface RateLimitResult {
    success: boolean;
    remaining: number;
    resetAt: Date;
    retryAfter?: number; // seconds until reset
}

interface RateLimitConfig {
    limit: number;      // max requests allowed
    windowMs: number;   // time window in milliseconds
}

/**
 * Database-backed rate limiter for Vercel serverless
 * Uses sliding window algorithm with PostgreSQL
 */
export async function checkRateLimit(
    identifier: string,
    endpoint: string,
    config: RateLimitConfig
): Promise<RateLimitResult> {
    const { limit, windowMs } = config;
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs);
    const expiresAt = new Date(now.getTime() + windowMs);

    try {
        // Clean up expired entries for this identifier/endpoint (opportunistic cleanup)
        await prisma.rateLimitEntry.deleteMany({
            where: {
                identifier,
                endpoint,
                expiresAt: { lt: now }
            }
        });

        // Try to find existing entry within the current window
        const existing = await prisma.rateLimitEntry.findUnique({
            where: {
                identifier_endpoint: { identifier, endpoint }
            }
        });

        if (existing && existing.windowStart > windowStart) {
            // Entry exists and is within the current window
            if (existing.count >= limit) {
                const resetAt = new Date(existing.windowStart.getTime() + windowMs);
                const retryAfter = Math.ceil((resetAt.getTime() - now.getTime()) / 1000);
                return {
                    success: false,
                    remaining: 0,
                    resetAt,
                    retryAfter: Math.max(1, retryAfter)
                };
            }

            // Increment the count
            const updated = await prisma.rateLimitEntry.update({
                where: { id: existing.id },
                data: { count: existing.count + 1 }
            });

            const resetAt = new Date(existing.windowStart.getTime() + windowMs);
            return {
                success: true,
                remaining: Math.max(0, limit - updated.count),
                resetAt
            };
        }

        // Create new entry or reset the window
        await prisma.rateLimitEntry.upsert({
            where: {
                identifier_endpoint: { identifier, endpoint }
            },
            create: {
                identifier,
                endpoint,
                count: 1,
                windowStart: now,
                expiresAt
            },
            update: {
                count: 1,
                windowStart: now,
                expiresAt
            }
        });

        return {
            success: true,
            remaining: limit - 1,
            resetAt: expiresAt
        };
    } catch (error) {
        console.error('Rate limit check error:', error);
        // On error, allow the request but log it
        return {
            success: true,
            remaining: limit,
            resetAt: expiresAt
        };
    }
}

// Predefined rate limit configurations
export const RATE_LIMITS = {
    register: { limit: 5, windowMs: 60 * 60 * 1000 },           // 5 per hour
    forgotPassword: { limit: 3, windowMs: 60 * 60 * 1000 },     // 3 per hour
    resendVerification: { limit: 3, windowMs: 60 * 60 * 1000 }, // 3 per hour
    upload: { limit: 20, windowMs: 60 * 60 * 1000 },            // 20 per hour
    messages: { limit: 60, windowMs: 60 * 60 * 1000 },          // 60 per hour
    listings: { limit: 10, windowMs: 24 * 60 * 60 * 1000 },     // 10 per day
    // P1 fixes: Additional rate limits for unprotected endpoints
    verifyEmail: { limit: 10, windowMs: 60 * 60 * 1000 },       // 10 per hour
    resetPassword: { limit: 5, windowMs: 60 * 60 * 1000 },      // 5 per hour
    createListing: { limit: 5, windowMs: 24 * 60 * 60 * 1000 }, // 5 per day
    sendMessage: { limit: 100, windowMs: 60 * 60 * 1000 },      // 100 per hour
    createReview: { limit: 10, windowMs: 24 * 60 * 60 * 1000 }, // 10 per day
    agent: { limit: 20, windowMs: 60 * 60 * 1000 },             // 20 per hour
    // P2 fixes: Rate limits for scraping protection and abuse prevention
    listingsRead: { limit: 100, windowMs: 60 * 60 * 1000 },     // 100 per hour (scraping protection)
    unreadCount: { limit: 60, windowMs: 60 * 1000 },            // 60 per minute (frequent polling)
    toggleFavorite: { limit: 60, windowMs: 60 * 60 * 1000 },    // 60 per hour
    createReport: { limit: 10, windowMs: 24 * 60 * 60 * 1000 }, // 10 per day
    // P0 fix: Search page rate limit to prevent DoS
    search: { limit: 30, windowMs: 60 * 1000 },                   // 30 per minute
    // Nearby places search (Radar API)
    nearbySearch: { limit: 30, windowMs: 60 * 1000 },             // 30 per minute
} as const;

/**
 * Get client IP from request headers (Vercel compatible)
 *
 * SECURITY: x-real-ip is set by Vercel's edge and cannot be spoofed.
 * x-forwarded-for CAN be spoofed by clients, so only trust it in dev.
 */
export function getClientIP(request: Request): string {
    // On Vercel, x-real-ip is set by the edge and cannot be spoofed
    // ALWAYS prefer it over x-forwarded-for which can be manipulated
    const realIP = request.headers.get('x-real-ip');
    if (realIP) {
        return realIP;
    }

    // Fallback for non-Vercel environments (local dev only)
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded && process.env.NODE_ENV === 'development') {
        return forwarded.split(',')[0].trim();
    }

    // Fallback
    return 'unknown';
}

/**
 * Get client IP from Headers object (for Server Components)
 * Server Components cannot access the Request object directly,
 * so this version takes a Headers object from next/headers.
 *
 * SECURITY: Same trust model as getClientIP - prefer x-real-ip on Vercel.
 */
export function getClientIPFromHeaders(headersList: Headers): string {
    // On Vercel, x-real-ip is set by the edge and cannot be spoofed
    const realIP = headersList.get('x-real-ip');
    if (realIP) {
        return realIP;
    }

    // Fallback for non-Vercel environments (local dev only)
    const forwarded = headersList.get('x-forwarded-for');
    if (forwarded && process.env.NODE_ENV === 'development') {
        return forwarded.split(',')[0].trim();
    }

    // Fallback
    return 'unknown';
}
