/**
 * rate-limit-client — Shared, module-level 429/rate-limit handling for client fetches.
 *
 * All hooks that hit search-related endpoints should use `rateLimitedFetch`
 * instead of raw `fetch`. When any endpoint returns 429, *every* consumer
 * backs off for the duration specified by `Retry-After`.
 *
 * Includes built-in timeout protection (default 15s) to prevent hanging requests
 * from keeping loading spinners stuck indefinitely. Throws FetchTimeoutError
 * (not AbortError) on timeout so callers that swallow AbortError still see the error.
 */

import { FetchTimeoutError } from "./fetch-with-timeout";

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

// ── Timeout defaults ────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15_000;

// ── Extended init type ──────────────────────────────────────────────────────

export interface RateLimitedFetchInit extends RequestInit {
  /** Timeout in milliseconds. Default: 15000 (15 seconds). Set 0 to disable. */
  timeout?: number;
}

// ── Core fetch wrapper ──────────────────────────────────────────────────────

/**
 * Drop-in replacement for `fetch` that:
 * 1. Rejects immediately with `RateLimitError` when globally throttled.
 * 2. On a 429 response, parses `Retry-After`, sets the shared backoff, and throws.
 * 3. Throws `FetchTimeoutError` if the request exceeds `timeout` ms.
 * 4. Otherwise returns the `Response` as-is.
 *
 * IMPORTANT: Timeout throws `FetchTimeoutError` (NOT `AbortError`) so that
 * callers with `if (err.name === "AbortError") return;` still see the error
 * and can reset loading state.
 */
export async function rateLimitedFetch(
  input: RequestInfo | URL,
  init?: RateLimitedFetchInit
): Promise<Response> {
  if (isThrottled()) {
    throw new RateLimitError(getRetryAfterMs());
  }

  const {
    timeout = DEFAULT_TIMEOUT_MS,
    signal: callerSignal,
    ...restInit
  } = init ?? {};

  // Set up timeout via internal AbortController + didTimeout flag
  let didTimeout = false;
  const timeoutController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (timeout > 0) {
    timeoutId = setTimeout(() => {
      didTimeout = true;
      timeoutController.abort();
    }, timeout);
  }

  // Link caller's signal to internal controller so caller abort still works
  if (callerSignal) {
    if (callerSignal.aborted) {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      timeoutController.abort();
    } else {
      callerSignal.addEventListener(
        "abort",
        () => {
          if (timeoutId !== undefined) clearTimeout(timeoutId);
          timeoutController.abort();
        },
        { once: true }
      );
    }
  }

  try {
    const res = await fetch(input, {
      ...restInit,
      signal: timeoutController.signal,
    });

    if (res.status === 429) {
      const retryAfterMs = parseRetryAfter(res.headers.get("Retry-After"));
      throttledUntil = Date.now() + retryAfterMs;
      throw new RateLimitError(retryAfterMs);
    }

    return res;
  } catch (err) {
    // Timeout-triggered abort → throw FetchTimeoutError (not AbortError)
    if (didTimeout && err instanceof Error && err.name === "AbortError") {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : String(input);
      throw new FetchTimeoutError(url, timeout);
    }
    // Caller-initiated abort or other errors → re-throw as-is
    throw err;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
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
