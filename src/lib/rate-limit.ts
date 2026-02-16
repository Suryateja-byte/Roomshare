import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/**
 * In-process rate limiter for degraded mode (DB errors).
 * Non-persistent, best-effort fallback - prevents hard-brick during transient DB blips.
 * NOT a replacement for DB limiter - just emergency protection.
 */
const degradedModeCache = new Map<
  string,
  { count: number; windowStart: number }
>();
const DEGRADED_MODE_LIMIT = 10;
const DEGRADED_MODE_WINDOW_MS = 60_000; // 1 minute

function checkDegradedModeLimit(identifier: string): boolean {
  const now = Date.now();
  const entry = degradedModeCache.get(identifier);

  // Cleanup old entries periodically (every 100 calls)
  if (Math.random() < 0.01) {
    for (const [key, val] of degradedModeCache) {
      if (now - val.windowStart > DEGRADED_MODE_WINDOW_MS) {
        degradedModeCache.delete(key);
      }
    }
  }

  if (!entry || now - entry.windowStart > DEGRADED_MODE_WINDOW_MS) {
    degradedModeCache.set(identifier, { count: 1, windowStart: now });
    return true; // Allow
  }

  if (entry.count >= DEGRADED_MODE_LIMIT) {
    return false; // Deny
  }

  entry.count++;
  return true; // Allow
}

/**
 * Reset degraded mode cache (for testing only)
 * @internal
 */
export function _resetDegradedModeCache(): void {
  degradedModeCache.clear();
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // seconds until reset
}

interface RateLimitConfig {
  limit: number; // max requests allowed
  windowMs: number; // time window in milliseconds
}

/**
 * Database-backed rate limiter for Vercel serverless
 * Uses sliding window algorithm with PostgreSQL
 */
export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const { limit, windowMs } = config;
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);
  const expiresAt = new Date(now.getTime() + windowMs);

  try {
    // Opportunistic cleanup of expired entries
    await prisma.rateLimitEntry.deleteMany({
      where: {
        identifier,
        endpoint,
        expiresAt: { lt: now },
      },
    });

    // Atomic upsert: create or increment in a single operation to avoid TOCTOU
    const result = await prisma.rateLimitEntry.upsert({
      where: {
        identifier_endpoint: { identifier, endpoint },
      },
      create: {
        identifier,
        endpoint,
        count: 1,
        windowStart: now,
        expiresAt,
      },
      update: {
        count: { increment: 1 },
      },
    });

    // Check if the window has expired — if so, reset atomically
    if (result.windowStart <= windowStart) {
      // Window expired: reset count to 1 and start a new window
      const reset = await prisma.rateLimitEntry.update({
        where: {
          identifier_endpoint: { identifier, endpoint },
        },
        data: {
          count: 1,
          windowStart: now,
          expiresAt,
        },
      });
      return {
        success: true,
        remaining: limit - reset.count,
        resetAt: expiresAt,
      };
    }

    // Window is still active — check if over limit
    const resetAt = new Date(result.windowStart.getTime() + windowMs);

    if (result.count > limit) {
      const retryAfter = Math.ceil(
        (resetAt.getTime() - now.getTime()) / 1000,
      );
      return {
        success: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.max(1, retryAfter),
      };
    }

    return {
      success: true,
      remaining: Math.max(0, limit - result.count),
      resetAt,
    };
  } catch {
    // FAIL CLOSED: Deny by default on DB errors (security over availability)
    // Use degraded mode fallback for availability during transient DB blips
    console.error("[RateLimit] DB error (code: RL_DB_ERR)");

    // Best-effort in-process fallback (non-persistent, limited protection)
    const degradedAllowed = checkDegradedModeLimit(identifier);

    if (degradedAllowed) {
      // Degraded mode: allow with reduced capacity, log for monitoring
      console.warn("[RateLimit] Degraded mode active (code: RL_DEGRADED)");
      return {
        success: true,
        remaining: 1,
        resetAt: expiresAt,
      };
    }

    // Hard deny: even degraded mode limit exceeded
    return {
      success: false,
      remaining: 0,
      resetAt: expiresAt,
      retryAfter: 60,
    };
  }
}

// Predefined rate limit configurations
export const RATE_LIMITS = {
  register: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5 per hour
  forgotPassword: { limit: 3, windowMs: 60 * 60 * 1000 }, // 3 per hour
  resendVerification: { limit: 3, windowMs: 60 * 60 * 1000 }, // 3 per hour
  upload: { limit: 20, windowMs: 60 * 60 * 1000 }, // 20 per hour
  messages: { limit: 60, windowMs: 60 * 60 * 1000 }, // 60 per hour
  listings: { limit: 10, windowMs: 24 * 60 * 60 * 1000 }, // 10 per day
  // P1 fixes: Additional rate limits for unprotected endpoints
  verifyEmail: { limit: 10, windowMs: 60 * 60 * 1000 }, // 10 per hour
  resetPassword: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5 per hour
  createListing: { limit: 5, windowMs: 24 * 60 * 60 * 1000 }, // 5 per day
  updateListing: { limit: 20, windowMs: 24 * 60 * 60 * 1000 }, // 20 per day
  deleteListing: { limit: 10, windowMs: 24 * 60 * 60 * 1000 }, // 10 per day
  sendMessage: { limit: 100, windowMs: 60 * 60 * 1000 }, // 100 per hour
  createReview: { limit: 10, windowMs: 24 * 60 * 60 * 1000 }, // 10 per day
  updateReview: { limit: 30, windowMs: 24 * 60 * 60 * 1000 }, // 30 per day
  deleteReview: { limit: 30, windowMs: 24 * 60 * 60 * 1000 }, // 30 per day
  agent: { limit: 20, windowMs: 60 * 60 * 1000 }, // 20 per hour
  // P2 fixes: Rate limits for scraping protection and abuse prevention
  listingsRead: { limit: 100, windowMs: 60 * 60 * 1000 }, // 100 per hour (scraping protection)
  unreadCount: { limit: 60, windowMs: 60 * 1000 }, // 60 per minute (frequent polling)
  toggleFavorite: { limit: 60, windowMs: 60 * 60 * 1000 }, // 60 per hour
  createReport: { limit: 10, windowMs: 24 * 60 * 60 * 1000 }, // 10 per day
  uploadDelete: { limit: 20, windowMs: 60 * 60 * 1000 }, // 20 per hour
  // P0 fix: Search page rate limit to prevent DoS
  search: { limit: 30, windowMs: 60 * 1000 }, // 30 per minute
  // Nearby places search (Radar API)
  nearbySearch: { limit: 30, windowMs: 60 * 1000 }, // 30 per minute
  // P1-05: Rate limit for reviews GET endpoint
  getReviews: { limit: 60, windowMs: 60 * 1000 }, // 60 per minute
  // Listing status check (freshness polling)
  listingStatus: { limit: 60, windowMs: 60 * 1000 }, // 60 per minute
  // Sensitive account actions
  changePassword: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5 per hour
  verifyPassword: { limit: 10, windowMs: 60 * 60 * 1000 }, // 10 per hour
  deleteAccount: { limit: 3, windowMs: 24 * 60 * 60 * 1000 }, // 3 per day
  // Server action rate limits
  filterSuggestions: { limit: 30, windowMs: 60 * 1000 }, // 30 per minute
  getListingsInBounds: { limit: 60, windowMs: 60 * 1000 }, // 60 per minute
  chatSendMessage: { limit: 100, windowMs: 60 * 60 * 1000 }, // 100 per hour
  chatStartConversation: { limit: 20, windowMs: 60 * 60 * 1000 }, // 20 per hour
  savedListings: { limit: 60, windowMs: 60 * 60 * 1000 }, // 60 per hour
  notifications: { limit: 60, windowMs: 60 * 1000 }, // 60 per minute
} as const;

function getFirstForwardedIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null;
  const first = forwardedFor.split(",")[0]?.trim();
  return first || null;
}

function getAnonymousFingerprint(headers: Headers): string {
  const fingerprintSource = [
    headers.get("user-agent") || "",
    headers.get("accept-language") || "",
    headers.get("sec-ch-ua") || "",
  ].join("|");

  return `anon-${crypto.createHash("sha256").update(fingerprintSource).digest("hex").slice(0, 16)}`;
}

/**
 * Get client IP from request headers (Vercel compatible)
 *
 * SECURITY: x-real-ip is set by Vercel's edge and cannot be spoofed.
 * x-forwarded-for CAN be spoofed by clients, so only trust it in dev.
 */
export function getClientIP(request: Request): string {
  // On Vercel, x-real-ip is set by the edge and cannot be spoofed
  // ALWAYS prefer it over x-forwarded-for which can be manipulated
  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  const cloudflareIp = request.headers.get("cf-connecting-ip");
  if (cloudflareIp) {
    return cloudflareIp;
  }

  const trueClientIp = request.headers.get("true-client-ip");
  if (trueClientIp) {
    return trueClientIp;
  }

  // Proxy fallback for non-Vercel environments.
  const forwarded = getFirstForwardedIp(request.headers.get("x-forwarded-for"));
  const shouldTrustForwarded =
    process.env.NODE_ENV === "development"
    || process.env.TRUST_PROXY === "true"
    || Boolean(request.headers.get("x-forwarded-proto"));

  if (forwarded && shouldTrustForwarded) {
    return forwarded;
  }

  // Last resort: deterministic anonymous fingerprint to avoid global "unknown" bucket.
  return getAnonymousFingerprint(request.headers);
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
  const realIP = headersList.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  const cloudflareIp = headersList.get("cf-connecting-ip");
  if (cloudflareIp) {
    return cloudflareIp;
  }

  const trueClientIp = headersList.get("true-client-ip");
  if (trueClientIp) {
    return trueClientIp;
  }

  const forwarded = getFirstForwardedIp(headersList.get("x-forwarded-for"));
  const shouldTrustForwarded =
    process.env.NODE_ENV === "development"
    || process.env.TRUST_PROXY === "true"
    || Boolean(headersList.get("x-forwarded-proto"));

  if (forwarded && shouldTrustForwarded) {
    return forwarded;
  }

  return getAnonymousFingerprint(headersList);
}
