/**
 * Redis-backed rate limiting using Upstash.
 *
 * P1-08 FIX: Added timeout and circuit breaker protection for Redis operations.
 * P1-09 FIX: Added in-memory rate limit fallback when Redis is unavailable.
 *            Instead of failing open (allowing all requests), the fallback uses
 *            a simple Map-based sliding window to maintain rate limiting.
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

// ============ IN-MEMORY RATE LIMIT FALLBACK ============
// P1-09 FIX: Provides rate limiting when Redis is unavailable
// Uses a simple Map-based sliding window implementation

interface InMemoryRateLimitEntry {
  count: number;
  resetAt: number;
}

// Separate maps for different rate limit types (burst vs sustained)
const inMemoryRateLimits = new Map<string, InMemoryRateLimitEntry>();

// Clean up expired entries periodically to prevent memory leaks
const CLEANUP_INTERVAL_MS = 60000; // 1 minute
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanupInterval() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    // Use forEach instead of for...of to avoid downlevelIteration requirement
    inMemoryRateLimits.forEach((entry, key) => {
      if (now >= entry.resetAt) {
        inMemoryRateLimits.delete(key);
      }
    });
  }, CLEANUP_INTERVAL_MS);
  // Don't block Node.js from exiting
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

// Start cleanup on module load
startCleanupInterval();

/**
 * Check rate limit using in-memory fallback.
 * Uses a simple fixed window algorithm (sufficient for fallback purposes).
 *
 * @param key - Unique key combining type and IP
 * @param limit - Maximum requests allowed in window
 * @param windowMs - Window duration in milliseconds
 * @returns Result with success status and optional retryAfter seconds
 */
function checkInMemoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = inMemoryRateLimits.get(key);

  // No existing entry or window expired - start fresh
  if (!entry || now >= entry.resetAt) {
    inMemoryRateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true };
  }

  // Check if limit exceeded
  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return {
      success: false,
      retryAfter: Math.max(1, retryAfter), // At least 1 second
    };
  }

  // Increment count
  entry.count++;
  return { success: true };
}

// Rate limit configurations matching Redis limiters
const RATE_LIMITS = {
  chat: {
    burst: { limit: 5, windowMs: 60 * 1000 }, // 5/min
    sustained: { limit: 30, windowMs: 60 * 60 * 1000 }, // 30/hour
  },
  metrics: {
    burst: { limit: 100, windowMs: 60 * 1000 }, // 100/min
    sustained: { limit: 500, windowMs: 60 * 60 * 1000 }, // 500/hour
  },
  map: {
    burst: { limit: 60, windowMs: 60 * 1000 }, // 60/min
    sustained: { limit: 300, windowMs: 60 * 60 * 1000 }, // 300/hour
  },
  searchCount: {
    burst: { limit: 30, windowMs: 60 * 1000 }, // 30/min
    sustained: { limit: 200, windowMs: 60 * 60 * 1000 }, // 200/hour
  },
} as const;

/**
 * Check both burst and sustained limits using in-memory fallback.
 * Returns the more restrictive result.
 */
function checkInMemoryRateLimits(
  type: keyof typeof RATE_LIMITS,
  ip: string
): { success: boolean; retryAfter?: number } {
  const config = RATE_LIMITS[type];

  // Check burst limit first (more likely to be hit)
  const burstResult = checkInMemoryRateLimit(
    `${type}-burst:${ip}`,
    config.burst.limit,
    config.burst.windowMs
  );
  if (!burstResult.success) {
    return burstResult;
  }

  // Check sustained limit
  const sustainedResult = checkInMemoryRateLimit(
    `${type}-sustained:${ip}`,
    config.sustained.limit,
    config.sustained.windowMs
  );
  return sustainedResult;
}

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
    // P1-09 FIX: Use in-memory fallback instead of failing open
    console.warn("[RateLimit] Redis unavailable, using in-memory fallback", {
      error: error instanceof Error ? error.message : "Unknown",
      ip: ip.substring(0, 8) + "...", // Partial IP for debugging (no full PII)
    });
    return checkInMemoryRateLimits("chat", ip);
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
    // P1-09 FIX: Use in-memory fallback instead of failing open
    console.warn("[RateLimit] Redis unavailable, using in-memory fallback", {
      error: error instanceof Error ? error.message : "Unknown",
      ip: ip.substring(0, 8) + "...", // Partial IP for debugging (no full PII)
    });
    return checkInMemoryRateLimits("metrics", ip);
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
    // P1-09 FIX: Use in-memory fallback instead of failing open
    console.warn("[RateLimit] Redis unavailable, using in-memory fallback", {
      error: error instanceof Error ? error.message : "Unknown",
      ip: ip.substring(0, 8) + "...", // Partial IP for debugging (no full PII)
    });
    return checkInMemoryRateLimits("map", ip);
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
    // P1-09 FIX: Use in-memory fallback instead of failing open
    console.warn("[RateLimit] Redis unavailable, using in-memory fallback", {
      error: error instanceof Error ? error.message : "Unknown",
      ip: ip.substring(0, 8) + "...", // Partial IP for debugging (no full PII)
    });
    return checkInMemoryRateLimits("searchCount", ip);
  }
}
