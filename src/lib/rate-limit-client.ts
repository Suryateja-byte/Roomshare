/**
 * rate-limit-client — Shared, module-level 429/rate-limit handling for client fetches.
 *
 * All hooks that hit search-related endpoints should use `rateLimitedFetch`
 * instead of raw `fetch`. When any endpoint returns 429, *every* consumer
 * backs off for the duration specified by `Retry-After`.
 */

// ── Module-level state (shared across all consumers) ────────────────────────

let throttledUntil = 0;

// ── Public helpers ──────────────────────────────────────────────────────────

/** Returns `true` when the global backoff window is still active. */
export function isThrottled(): boolean {
  return Date.now() < throttledUntil;
}

/** Milliseconds remaining in the current backoff window (0 if not throttled). */
export function getRetryAfterMs(): number {
  return Math.max(0, throttledUntil - Date.now());
}

/** Reset throttle state (useful for tests). */
export function resetThrottle(): void {
  throttledUntil = 0;
}

// ── Error class ─────────────────────────────────────────────────────────────

export class RateLimitError extends Error {
  retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(`Rate limited — retry after ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

// ── Core fetch wrapper ──────────────────────────────────────────────────────

/**
 * Drop-in replacement for `fetch` that:
 * 1. Rejects immediately with `RateLimitError` when globally throttled.
 * 2. On a 429 response, parses `Retry-After`, sets the shared backoff, and throws.
 * 3. Otherwise returns the `Response` as-is.
 */
export async function rateLimitedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (isThrottled()) {
    throw new RateLimitError(getRetryAfterMs());
  }

  const res = await fetch(input, init);

  if (res.status === 429) {
    const retryAfterMs = parseRetryAfter(res.headers.get("Retry-After"));
    throttledUntil = Date.now() + retryAfterMs;
    throw new RateLimitError(retryAfterMs);
  }

  return res;
}

// ── Internal helpers ────────────────────────────────────────────────────────

const DEFAULT_BACKOFF_MS = 60_000;

/**
 * Parse the `Retry-After` header value.
 * Supports both delta-seconds ("5") and HTTP-date formats.
 * Falls back to 60 s if missing or unparseable.
 */
function parseRetryAfter(value: string | null): number {
  if (!value) return DEFAULT_BACKOFF_MS;

  // Try numeric seconds first
  const seconds = Number(value);
  if (!Number.isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  // Try HTTP-date
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    const ms = date.getTime() - Date.now();
    return ms > 0 ? ms : DEFAULT_BACKOFF_MS;
  }

  return DEFAULT_BACKOFF_MS;
}
