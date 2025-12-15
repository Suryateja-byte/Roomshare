/**
 * Client-side metrics logging.
 *
 * IMPORTANT: No Node crypto import - uses globalThis.crypto for browser.
 * HMAC computation happens server-side via /api/metrics.
 *
 * PRIVACY NOTES:
 * - Client sends raw listingId to /api/metrics
 * - Server computes HMAC, discards raw listingId
 * - No user text, intent, or category is ever sent
 */

export interface ClientMetricsParams {
  /** Listing ID (will be HMAC'd server-side) */
  listingId: string;
  /** Route that triggered the metric */
  route: 'nearby' | 'llm';
  /** Whether the request was blocked by policy */
  isBlocked: boolean;
  /** Search type (only for allowed requests) */
  searchType?: 'type' | 'text';
  /** Included place types (only for allowed requests) */
  includedTypes?: string[];
  /** Result count (only for allowed requests) */
  resultCount?: number;
}

/**
 * Generate session ID using browser crypto (NOT Node crypto).
 * Stored in sessionStorage for the duration of the browser session.
 */
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const STORAGE_KEY = 'session-random';

  try {
    let sessionId = sessionStorage.getItem(STORAGE_KEY);
    if (!sessionId) {
      // Use globalThis.crypto for browser, with fallback
      if (globalThis.crypto?.randomUUID) {
        sessionId = globalThis.crypto.randomUUID();
      } else {
        // Fallback for older browsers
        sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      }
      sessionStorage.setItem(STORAGE_KEY, sessionId);
    }
    return sessionId;
  } catch {
    // Storage not available
    return `temp-${Date.now()}`;
  }
}

/**
 * Send metrics to server endpoint.
 * Server computes HMAC - client NEVER sees LOG_HMAC_SECRET.
 * Fire-and-forget: does not block UI.
 *
 * @param params - The metrics parameters to log
 */
export async function logSafeMetrics(params: ClientMetricsParams): Promise<void> {
  const { listingId, route, isBlocked, searchType, includedTypes, resultCount } = params;

  const payload = {
    listingId, // Server will HMAC this, then discard
    sid: getOrCreateSessionId(),
    route,
    blocked: isBlocked,
    // Only include non-sensitive fields for allowed requests
    ...(searchType && !isBlocked && { type: searchType }),
    ...(includedTypes && !isBlocked && { types: includedTypes }),
    ...(resultCount !== undefined && !isBlocked && { count: resultCount }),
  };

  // Fire-and-forget
  try {
    fetch('/api/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Silently ignore failures
    });
  } catch {
    // Silently ignore
  }
}

/**
 * Log a blocked request (Fair Housing policy violation).
 * Only logs that a block occurred - NO category or user text.
 *
 * @param listingId - The listing ID where the block occurred
 * @param route - The route that was blocked ('nearby' or 'llm')
 */
export async function logBlockedRequest(
  listingId: string,
  route: 'nearby' | 'llm'
): Promise<void> {
  await logSafeMetrics({
    listingId,
    route,
    isBlocked: true,
  });
}

/**
 * Log a successful/allowed search trigger.
 *
 * @param listingId - The listing ID where the search was triggered
 * @param searchType - The type of search ('type' or 'text')
 * @param includedTypes - Optional array of place types searched
 * @param resultCount - Optional count of results returned
 */
export async function logAllowedSearch(
  listingId: string,
  searchType: 'type' | 'text',
  includedTypes?: string[],
  resultCount?: number
): Promise<void> {
  await logSafeMetrics({
    listingId,
    route: 'nearby',
    isBlocked: false,
    searchType,
    includedTypes,
    resultCount,
  });
}

/**
 * Log an LLM chat interaction.
 *
 * @param listingId - The listing ID where the chat occurred
 * @param isBlocked - Whether the request was blocked
 */
export async function logLLMInteraction(
  listingId: string,
  isBlocked: boolean
): Promise<void> {
  await logSafeMetrics({
    listingId,
    route: 'llm',
    isBlocked,
  });
}
