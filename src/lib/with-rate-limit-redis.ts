/**
 * Redis-backed rate limiting wrapper for API routes.
 *
 * Uses Upstash Redis for distributed rate limiting with in-memory fallback.
 * On Redis errors, requests are limited by a local fallback limiter.
 */

import { NextResponse } from "next/server";
import {
  checkChatRateLimit,
  checkListingsReadRateLimit,
  checkMapRateLimit,
  checkMetricsRateLimit,
  checkSearchV2RateLimit,
  checkSearchCountRateLimit,
} from "./rate-limit-redis";
import { getClientIP } from "./rate-limit";
import { getRequestId } from "./request-context";

export type RedisRateLimitType =
  | "chat"
  | "map"
  | "metrics"
  | "search-count"
  | "search-v2"
  | "listings-read";

interface RateLimitRedisOptions {
  /** The rate limit type to check */
  type: RedisRateLimitType;
  /** Custom identifier (overrides default IP-based) */
  getIdentifier?: (request: Request) => string | Promise<string>;
}

// Rate limit configurations for response headers
const RATE_LIMIT_CONFIGS: Record<
  RedisRateLimitType,
  { burstLimit: number; sustainedLimit: number }
> = {
  chat: { burstLimit: 5, sustainedLimit: 30 },
  map: { burstLimit: 60, sustainedLimit: 300 },
  metrics: { burstLimit: 100, sustainedLimit: 500 },
  "search-count": { burstLimit: 30, sustainedLimit: 200 },
  "search-v2": { burstLimit: 60, sustainedLimit: 300 },
  "listings-read": { burstLimit: 30, sustainedLimit: 100 },
};

/**
 * Rate-limit guard for **high-traffic API route handlers** using Redis (Upstash).
 *
 * Provides lower-latency rate limiting than the DB-backed `withRateLimit` by using
 * Upstash Redis sliding-window counters. Falls back to an in-memory limiter when
 * Redis is unavailable.
 *
 * **When to use**: API route handlers for high-traffic endpoints where DB-backed
 * rate limiting would add too much latency (map, search, chat, metrics).
 * For lower-traffic endpoints, prefer `withRateLimit` from `@/lib/with-rate-limit`.
 *
 * **Interface contract**: Same as `withRateLimit` — returns `NextResponse | null`.
 * - `null` → request is within limits, proceed with handler logic.
 * - `NextResponse` → 429 response with rate-limit headers. Return it immediately.
 *
 * **Supported types**: 'chat', 'map', 'metrics', 'search-count', 'search-v2', 'listings-read'
 *
 * @param request - The incoming HTTP request (provides IP for identification)
 * @param options - Rate limit configuration (type key, optional custom identifier)
 * @returns `null` if allowed, or a 429 `NextResponse` if rate-limited
 *
 * @example
 * export async function GET(request: Request) {
 *   const rateLimitResponse = await withRateLimitRedis(request, { type: 'map' });
 *   if (rateLimitResponse) return rateLimitResponse;
 *
 *   // Your handler logic...
 * }
 */
export async function withRateLimitRedis(
  request: Request,
  options: RateLimitRedisOptions,
): Promise<NextResponse | null> {
  const { type, getIdentifier } = options;
  const config = RATE_LIMIT_CONFIGS[type];

  // Get identifier
  let identifier: string;
  if (getIdentifier) {
    identifier = await getIdentifier(request);
  } else {
    identifier = getClientIP(request);
  }

  // Check rate limit based on type
  let result;
  switch (type) {
    case "chat":
      result = await checkChatRateLimit(identifier);
      break;
    case "map":
      result = await checkMapRateLimit(identifier);
      break;
    case "metrics":
      result = await checkMetricsRateLimit(identifier);
      break;
    case "search-count":
      result = await checkSearchCountRateLimit(identifier);
      break;
    case "search-v2":
      result = await checkSearchV2RateLimit(identifier);
      break;
    case "listings-read":
      result = await checkListingsReadRateLimit(identifier);
      break;
  }

  if (!result.success) {
    return NextResponse.json(
      {
        error: "Too many requests",
        message: "Please wait before making more requests",
        retryAfter: result.retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfter || 60),
          "X-RateLimit-Limit": String(config.burstLimit),
          "X-RateLimit-Remaining": "0",
          "x-request-id": getRequestId(),
        },
      },
    );
  }

  return null; // No rate limit hit, proceed with handler
}

/**
 * Add rate limit headers to a successful response (Redis version).
 */
export function addRedisRateLimitHeaders(
  response: NextResponse,
  type: RedisRateLimitType,
): NextResponse {
  const config = RATE_LIMIT_CONFIGS[type];
  response.headers.set("X-RateLimit-Limit", String(config.burstLimit));
  // Note: Redis rate limiters don't expose remaining count easily
  // For now, we omit X-RateLimit-Remaining on success responses
  return response;
}
