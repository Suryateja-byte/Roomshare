/**
 * Redis-backed rate limiting using Upstash.
 *
 * P1-08 FIX: Added timeout and circuit breaker protection for Redis operations.
 *
 * Provides burst and sustained rate limiters for:
 * - Chat API: 5/min burst, 30/hour sustained
 * - Metrics API: 100/min burst, 500/hour sustained
 *
 * Uses sliding window algorithm for accurate rate limiting
 * across serverless function instances.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { withTimeout, DEFAULT_TIMEOUTS, isTimeoutError } from "./timeout-wrapper";
import { circuitBreakers, isCircuitOpenError } from "./circuit-breaker";

// Initialize Redis client
// Falls back gracefully if env vars not set (for local dev without Redis)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

// ============ CHAT LIMITERS ============

/**
 * Burst limiter: 5 requests per minute
 * Prevents rapid-fire requests from a single IP
 */
export const chatBurstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 m"),
  prefix: "chat-burst",
  analytics: true,
});

/**
 * Sustained limiter: 30 requests per hour
 * Prevents abuse over longer periods
 */
export const chatSustainedLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 h"),
  prefix: "chat-sustained",
  analytics: true,
});

// ============ METRICS LIMITERS ============

/**
 * Metrics burst limiter: 100 requests per minute
 * Higher than chat since metrics are lightweight fire-and-forget
 */
export const metricsBurstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 m"),
  prefix: "metrics-burst",
  analytics: true,
});

/**
 * Metrics sustained limiter: 500 requests per hour
 * Prevents logging abuse
 */
export const metricsSustainedLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(500, "1 h"),
  prefix: "metrics-sustained",
  analytics: true,
});

// ============ MAP LIMITERS ============

/**
 * Map burst limiter: 60 requests per minute
 * Allows frequent map interactions
 */
export const mapBurstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "map-burst",
  analytics: true,
});

/**
 * Map sustained limiter: 300 requests per hour
 * Prevents excessive map API usage
 */
export const mapSustainedLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(300, "1 h"),
  prefix: "map-sustained",
  analytics: true,
});

// ============ SEARCH COUNT LIMITERS ============

/**
 * Search count burst limiter: 30 requests per minute
 * Moderate rate for search count queries
 */
export const searchCountBurstLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  prefix: "search-count-burst",
  analytics: true,
});

/**
 * Search count sustained limiter: 200 requests per hour
 * Prevents search count abuse
 */
export const searchCountSustainedLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(200, "1 h"),
  prefix: "search-count-sustained",
  analytics: true,
});

// ============ PROTECTED RATE LIMIT HELPER ============

/**
 * P1-08 FIX: Wraps rate limit operations with timeout and circuit breaker protection.
 * - Circuit breaker prevents cascading failures when Redis is unhealthy
 * - Timeout prevents indefinite hangs on slow Redis operations
 */
async function protectedRateLimitCheck(
  limiter: Ratelimit,
  ip: string,
  operationName: string
): Promise<{ success: boolean; reset: number }> {
  return circuitBreakers.redis.execute(async () => {
    return withTimeout(
      limiter.limit(ip),
      DEFAULT_TIMEOUTS.REDIS,
      operationName
    );
  });
}

// ============ RATE LIMIT CHECK FUNCTIONS ============

export interface RateLimitResult {
  success: boolean;
  retryAfter?: number;
}

/**
 * Check chat rate limits (both burst and sustained).
 * Returns success: false if either limit is exceeded.
 *
 * @param ip - Client IP address
 * @returns Rate limit result with optional retry-after seconds
 */
export async function checkChatRateLimit(ip: string): Promise<RateLimitResult> {
  // Check if Redis is configured
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    // Skip rate limiting in development without Redis
    if (process.env.NODE_ENV === "development") {
      return { success: true };
    }
    // In production, fail closed (deny requests if Redis not configured)
    console.error("[RateLimit] Redis not configured in production");
    return { success: false, retryAfter: 60 };
  }

  try {
    // P1-08 FIX: Use protected rate limit check with timeout and circuit breaker
    // Check burst limit first (more likely to be hit)
    const burstResult = await protectedRateLimitCheck(
      chatBurstLimiter,
      ip,
      "chat-burst-limit"
    );
    if (!burstResult.success) {
      return {
        success: false,
        retryAfter: Math.ceil((burstResult.reset - Date.now()) / 1000),
      };
    }

    // Check sustained limit
    const sustainedResult = await protectedRateLimitCheck(
      chatSustainedLimiter,
      ip,
      "chat-sustained-limit"
    );
    if (!sustainedResult.success) {
      return {
        success: false,
        retryAfter: Math.ceil((sustainedResult.reset - Date.now()) / 1000),
      };
    }

    return { success: true };
  } catch (error) {
    // P1-08 FIX: Handle timeout and circuit breaker errors
    if (isTimeoutError(error)) {
      console.error("[RateLimit] Redis timeout:", error);
    } else if (isCircuitOpenError(error)) {
      console.error("[RateLimit] Circuit breaker open:", error);
    } else {
      console.error("[RateLimit] Redis error:", error);
    }
    // FAIL OPEN - availability over blocking all users when Redis is down
    console.warn("[RateLimit] Redis unavailable, failing open", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    return { success: true };
  }
}

/**
 * Check metrics rate limits (both burst and sustained).
 * Returns success: false if either limit is exceeded.
 *
 * @param ip - Client IP address
 * @returns Rate limit result with optional retry-after seconds
 */
export async function checkMetricsRateLimit(
  ip: string,
): Promise<RateLimitResult> {
  // Check if Redis is configured
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    // Skip rate limiting in development without Redis
    if (process.env.NODE_ENV === "development") {
      return { success: true };
    }
    // In production, fail closed
    console.error("[RateLimit] Redis not configured in production");
    return { success: false, retryAfter: 60 };
  }

  try {
    // P1-08 FIX: Use protected rate limit check with timeout and circuit breaker
    // Check burst limit first
    const burstResult = await protectedRateLimitCheck(
      metricsBurstLimiter,
      ip,
      "metrics-burst-limit"
    );
    if (!burstResult.success) {
      return {
        success: false,
        retryAfter: Math.ceil((burstResult.reset - Date.now()) / 1000),
      };
    }

    // Check sustained limit
    const sustainedResult = await protectedRateLimitCheck(
      metricsSustainedLimiter,
      ip,
      "metrics-sustained-limit"
    );
    if (!sustainedResult.success) {
      return {
        success: false,
        retryAfter: Math.ceil((sustainedResult.reset - Date.now()) / 1000),
      };
    }

    return { success: true };
  } catch (error) {
    // P1-08 FIX: Handle timeout and circuit breaker errors
    if (isTimeoutError(error)) {
      console.error("[RateLimit] Redis timeout:", error);
    } else if (isCircuitOpenError(error)) {
      console.error("[RateLimit] Circuit breaker open:", error);
    } else {
      console.error("[RateLimit] Redis error:", error);
    }
    // FAIL OPEN - availability over blocking all users when Redis is down
    console.warn("[RateLimit] Redis unavailable, failing open", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    return { success: true };
  }
}

/**
 * Check map rate limits (both burst and sustained).
 * Returns success: false if either limit is exceeded.
 *
 * @param ip - Client IP address
 * @returns Rate limit result with optional retry-after seconds
 */
export async function checkMapRateLimit(ip: string): Promise<RateLimitResult> {
  // Check if Redis is configured
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    // Skip rate limiting in development without Redis
    if (process.env.NODE_ENV === "development") {
      return { success: true };
    }
    // In production, fail closed
    console.error("[RateLimit] Redis not configured in production");
    return { success: false, retryAfter: 60 };
  }

  try {
    // P1-08 FIX: Use protected rate limit check with timeout and circuit breaker
    // Check burst limit first
    const burstResult = await protectedRateLimitCheck(
      mapBurstLimiter,
      ip,
      "map-burst-limit"
    );
    if (!burstResult.success) {
      return {
        success: false,
        retryAfter: Math.ceil((burstResult.reset - Date.now()) / 1000),
      };
    }

    // Check sustained limit
    const sustainedResult = await protectedRateLimitCheck(
      mapSustainedLimiter,
      ip,
      "map-sustained-limit"
    );
    if (!sustainedResult.success) {
      return {
        success: false,
        retryAfter: Math.ceil((sustainedResult.reset - Date.now()) / 1000),
      };
    }

    return { success: true };
  } catch (error) {
    // P1-08 FIX: Handle timeout and circuit breaker errors
    if (isTimeoutError(error)) {
      console.error("[RateLimit] Redis timeout:", error);
    } else if (isCircuitOpenError(error)) {
      console.error("[RateLimit] Circuit breaker open:", error);
    } else {
      console.error("[RateLimit] Redis error:", error);
    }
    // FAIL OPEN - availability over blocking all users when Redis is down
    console.warn("[RateLimit] Redis unavailable, failing open", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    return { success: true };
  }
}

/**
 * Check search count rate limits (both burst and sustained).
 * Returns success: false if either limit is exceeded.
 *
 * @param ip - Client IP address
 * @returns Rate limit result with optional retry-after seconds
 */
export async function checkSearchCountRateLimit(
  ip: string,
): Promise<RateLimitResult> {
  // Check if Redis is configured
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    // Skip rate limiting in development without Redis
    if (process.env.NODE_ENV === "development") {
      return { success: true };
    }
    // In production, fail closed
    console.error("[RateLimit] Redis not configured in production");
    return { success: false, retryAfter: 60 };
  }

  try {
    // P1-08 FIX: Use protected rate limit check with timeout and circuit breaker
    // Check burst limit first
    const burstResult = await protectedRateLimitCheck(
      searchCountBurstLimiter,
      ip,
      "search-count-burst-limit"
    );
    if (!burstResult.success) {
      return {
        success: false,
        retryAfter: Math.ceil((burstResult.reset - Date.now()) / 1000),
      };
    }

    // Check sustained limit
    const sustainedResult = await protectedRateLimitCheck(
      searchCountSustainedLimiter,
      ip,
      "search-count-sustained-limit"
    );
    if (!sustainedResult.success) {
      return {
        success: false,
        retryAfter: Math.ceil((sustainedResult.reset - Date.now()) / 1000),
      };
    }

    return { success: true };
  } catch (error) {
    // P1-08 FIX: Handle timeout and circuit breaker errors
    if (isTimeoutError(error)) {
      console.error("[RateLimit] Redis timeout:", error);
    } else if (isCircuitOpenError(error)) {
      console.error("[RateLimit] Circuit breaker open:", error);
    } else {
      console.error("[RateLimit] Redis error:", error);
    }
    // FAIL OPEN - availability over blocking all users when Redis is down
    console.warn("[RateLimit] Redis unavailable, failing open", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    return { success: true };
  }
}
