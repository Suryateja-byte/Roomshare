/**
 * Logging for nearby search triggers.
 *
 * COMPLIANCE NOTES:
 * - NO place names, addresses, or ratings are logged
 * - Only trigger metadata: user, session, listing, intent type
 * - Fire-and-forget: does not block UI
 * - If storing lat/lng, must enforce 30-day deletion (not implemented here)
 */

export interface NearbySearchLogParams {
  /** User ID if authenticated */
  userId?: string;
  /** Session ID for anonymous tracking */
  sessionId: string;
  /** Listing ID where the search was triggered */
  listingId: string;
  /** The normalized intent (e.g., "gym", "indian grocery") */
  intent: string;
  /** Type of search performed */
  searchType: 'type' | 'text';
  /** Optional: was the search blocked by policy */
  blocked?: boolean;
  /** Optional: block reason category */
  blockReason?: string;
}

/**
 * Generate a session ID for anonymous tracking.
 * Stored in sessionStorage for the duration of the browser session.
 */
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') {
    return 'server-side';
  }

  const STORAGE_KEY = 'nearby-search-session-id';

  try {
    let sessionId = sessionStorage.getItem(STORAGE_KEY);
    if (!sessionId) {
      sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      sessionStorage.setItem(STORAGE_KEY, sessionId);
    }
    return sessionId;
  } catch {
    // Storage not available
    return `temp_${Date.now()}`;
  }
}

/**
 * Log a nearby search trigger.
 *
 * This is a fire-and-forget function - it does not block the UI
 * and failures are silently ignored.
 *
 * Currently logs to console in development. Can be extended to
 * log to Supabase or other analytics services in production.
 *
 * @param params - The search parameters to log
 */
export async function logNearbySearch(params: NearbySearchLogParams): Promise<void> {
  const { userId, sessionId, listingId, intent, searchType, blocked, blockReason } = params;

  const logEntry = {
    timestamp: new Date().toISOString(),
    userId: userId || 'anonymous',
    sessionId,
    listingId,
    intent,
    searchType,
    blocked: blocked || false,
    blockReason: blockReason || null,
  };

  // Development logging
  if (process.env.NODE_ENV === 'development') {
    console.log('[NearbySearch]', logEntry);
  }

  // Production logging to Supabase could be added here
  // Example (not implemented to avoid requiring additional setup):
  //
  // try {
  //   await fetch('/api/log-nearby-search', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify(logEntry),
  //   });
  // } catch {
  //   // Silently ignore logging failures
  // }
}

/**
 * Log a blocked search (Fair Housing policy violation).
 */
export async function logBlockedSearch(
  listingId: string,
  intent: string,
  blockReason: string,
  userId?: string
): Promise<void> {
  const sessionId = getOrCreateSessionId();

  await logNearbySearch({
    userId,
    sessionId,
    listingId,
    intent,
    searchType: 'text', // Blocked searches don't have a search type
    blocked: true,
    blockReason,
  });
}

/**
 * Log a successful search trigger.
 */
export async function logSearchTrigger(
  listingId: string,
  intent: string,
  searchType: 'type' | 'text',
  userId?: string
): Promise<void> {
  const sessionId = getOrCreateSessionId();

  await logNearbySearch({
    userId,
    sessionId,
    listingId,
    intent,
    searchType,
    blocked: false,
  });
}
