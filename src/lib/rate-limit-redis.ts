/**
 * Redis-backed rate limiting using Upstash.
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
    // Check burst limit first (more likely to be hit)
    const burstResult = await chatBurstLimiter.limit(ip);
    if (!burstResult.success) {
      return {
        success: false,
        retryAfter: Math.ceil((burstResult.reset - Date.now()) / 1000),
      };
    }

    // Check sustained limit
    const sustainedResult = await chatSustainedLimiter.limit(ip);
    if (!sustainedResult.success) {
      return {
        success: false,
        retryAfter: Math.ceil((sustainedResult.reset - Date.now()) / 1000),
      };
    }

    return { success: true };
  } catch (error) {
    console.error("[RateLimit] Redis error:", error);
    // FAIL CLOSED in production - security over availability
    if (process.env.NODE_ENV === "production") {
      return { success: false, retryAfter: 60 };
    }
    // Allow in development for local testing without Redis
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
    // Check burst limit first
    const burstResult = await metricsBurstLimiter.limit(ip);
    if (!burstResult.success) {
      return {
        success: false,
        retryAfter: Math.ceil((burstResult.reset - Date.now()) / 1000),
      };
    }

    // Check sustained limit
    const sustainedResult = await metricsSustainedLimiter.limit(ip);
    if (!sustainedResult.success) {
      return {
        success: false,
        retryAfter: Math.ceil((sustainedResult.reset - Date.now()) / 1000),
      };
    }

    return { success: true };
  } catch (error) {
    console.error("[RateLimit] Redis error:", error);
    // FAIL CLOSED in production - even for metrics
    if (process.env.NODE_ENV === "production") {
      return { success: false, retryAfter: 60 };
    }
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
    // Check burst limit first
    const burstResult = await mapBurstLimiter.limit(ip);
    if (!burstResult.success) {
      return {
        success: false,
        retryAfter: Math.ceil((burstResult.reset - Date.now()) / 1000),
      };
    }

    // Check sustained limit
    const sustainedResult = await mapSustainedLimiter.limit(ip);
    if (!sustainedResult.success) {
      return {
        success: false,
        retryAfter: Math.ceil((sustainedResult.reset - Date.now()) / 1000),
      };
    }

    return { success: true };
  } catch (error) {
    console.error("[RateLimit] Redis error:", error);
    // FAIL CLOSED in production
    if (process.env.NODE_ENV === "production") {
      return { success: false, retryAfter: 60 };
    }
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
    // Check burst limit first
    const burstResult = await searchCountBurstLimiter.limit(ip);
    if (!burstResult.success) {
      return {
        success: false,
        retryAfter: Math.ceil((burstResult.reset - Date.now()) / 1000),
      };
    }

    // Check sustained limit
    const sustainedResult = await searchCountSustainedLimiter.limit(ip);
    if (!sustainedResult.success) {
      return {
        success: false,
        retryAfter: Math.ceil((sustainedResult.reset - Date.now()) / 1000),
      };
    }

    return { success: true };
  } catch (error) {
    console.error("[RateLimit] Redis error:", error);
    // FAIL CLOSED in production
    if (process.env.NODE_ENV === "production") {
      return { success: false, retryAfter: 60 };
    }
    return { success: true };
  }
}
