/**
 * Rate Limiting - Barrel Export
 *
 * Re-exports both rate limiting patterns used in the Roomshare codebase.
 *
 * Pattern 1 - API Route Rate Limiting (withRateLimit / withRateLimitRedis):
 *   For Next.js API route handlers (route.ts) that have access to the Request object.
 *   Returns NextResponse | null. If non-null, return it immediately (429 response).
 *   Two backends:
 *     - withRateLimit: DB-backed (PostgreSQL via Prisma). Used for most endpoints.
 *     - withRateLimitRedis: Redis-backed (Upstash). Used for high-traffic endpoints.
 *
 * Pattern 2 - Server Component / Server Action Rate Limiting (checkServerComponentRateLimit):
 *   For Server Components and Server Actions that don't have a Request object.
 *   Uses headers() from next/headers instead.
 *   Returns { allowed: boolean, remaining: number, retryAfter?: number }.
 *
 * Core rate-counting logic:
 *   Both patterns delegate to checkRateLimit() in src/lib/rate-limit.ts, which uses
 *   a sliding-window algorithm backed by PostgreSQL. The Redis variant uses Upstash Redis
 *   with its own sliding-window implementation for lower latency.
 *
 * Client-side rate limit handling:
 *   For UI components that need to handle 429 responses, use useRateLimitHandler from
 *   src/hooks/useRateLimitHandler.ts.
 */

// --- API Route rate limiting (Request-based) ---
export { withRateLimit, addRateLimitHeaders, checkServerComponentRateLimit } from './with-rate-limit';
export type { ServerComponentRateLimitResult } from './with-rate-limit';

// --- Redis-backed rate limiting (high-traffic API routes) ---
export { withRateLimitRedis, addRedisRateLimitHeaders } from './with-rate-limit-redis';
export type { RedisRateLimitType } from './with-rate-limit-redis';

// --- Core rate limit configs and utilities ---
export { RATE_LIMITS, checkRateLimit, getClientIP, getClientIPFromHeaders } from './rate-limit';
