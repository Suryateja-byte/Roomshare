import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { checkMetricsRateLimit } from '@/lib/rate-limit-redis';
import { getClientIP } from '@/lib/rate-limit';

/**
 * Metrics API Route - Privacy-Safe Logging
 *
 * SECURITY STACK (identical to /api/chat):
 * 1. Origin/Host enforcement (exact match from env allowlist)
 * 2. Content-Type: application/json enforcement
 * 3. Rate limit check (Redis-backed, separate prefix from chat)
 * 4. Body size guard (via request.text(), NOT Content-Length)
 * 5. Parse JSON from raw text
 * 6. Strict schema validation with types allowlist
 * 7. Compute HMAC - raw listingId NEVER stored
 * 8. Log safe metrics
 *
 * PRIVACY NOTES:
 * - Server computes HMAC of listingId using LOG_HMAC_SECRET
 * - Raw listingId is NEVER stored or logged
 * - Client NEVER sees LOG_HMAC_SECRET
 * - No user text, intent, or category is logged
 */

// CRITICAL: Force Node.js runtime for crypto HMAC support
export const runtime = 'nodejs';

const LOG_HMAC_SECRET = process.env.LOG_HMAC_SECRET || '';
const MAX_BODY_SIZE = 10_000; // Much smaller than chat - metrics should be tiny

// ============ ALLOWLISTED GOOGLE PLACE TYPES ============
// Only these types can be logged - prevents arbitrary string abuse
// NOTE: Intentionally excludes religion (church, mosque, synagogue) and
//       education (school, university) to prevent accidental logging if bug slips through
const ALLOWED_PLACE_TYPES = new Set([
  'restaurant',
  'cafe',
  'bar',
  'grocery_store',
  'supermarket',
  'pharmacy',
  'hospital',
  'doctor',
  'dentist',
  'gym',
  'park',
  'library',
  'bank',
  'atm',
  'gas_station',
  'parking',
  'bus_station',
  'subway_station',
  'train_station',
  'airport',
  'laundry',
  'dry_cleaner',
  'post_office',
  'shopping_mall',
  'convenience_store',
  'hardware_store',
  'pet_store',
  'movie_theater',
  'museum',
  'art_gallery',
]);

// ============ ORIGIN/HOST HELPERS ============

function getAllowedOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS || '';
  const parsed = origins.split(',').map((o) => o.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'development') {
    parsed.push('http://localhost:3000');
  }
  return parsed;
}

function getAllowedHosts(): string[] {
  const hosts = process.env.ALLOWED_HOSTS || '';
  const parsed = hosts.split(',').map((h) => h.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'development') {
    parsed.push('localhost:3000', 'localhost');
  }
  return parsed;
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return getAllowedOrigins().includes(origin);
}

function isHostAllowed(host: string | null): boolean {
  if (!host) return false;
  const allowed = getAllowedHosts();
  const hostWithoutPort = host.split(':')[0];
  return allowed.some((h) => h === host || h === hostWithoutPort);
}

// ============ HMAC ============

function hmacListingId(listingId: string): string {
  return crypto.createHmac('sha256', LOG_HMAC_SECRET).update(listingId).digest('hex').slice(0, 16);
}

// ============ STRICT SCHEMA VALIDATION ============

interface MetricsPayload {
  listingId: string;
  sid: string;
  route: 'nearby' | 'llm';
  blocked: boolean;
  type?: 'type' | 'text';
  types?: string[];
  count?: number;
}

function validatePayload(
  body: unknown
): { valid: true; payload: MetricsPayload } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid body' };
  }

  const obj = body as Record<string, unknown>;

  // Required fields
  if (typeof obj.listingId !== 'string' || obj.listingId.length > 64) {
    return { valid: false, error: 'Invalid listingId' };
  }
  if (typeof obj.sid !== 'string' || obj.sid.length > 64) {
    return { valid: false, error: 'Invalid sid' };
  }
  if (obj.route !== 'nearby' && obj.route !== 'llm') {
    return { valid: false, error: 'Invalid route' };
  }
  if (typeof obj.blocked !== 'boolean') {
    return { valid: false, error: 'Invalid blocked' };
  }

  // Optional: type
  if (obj.type !== undefined && obj.type !== 'type' && obj.type !== 'text') {
    return { valid: false, error: 'Invalid type enum' };
  }

  // Optional: types array (STRICT VALIDATION)
  if (obj.types !== undefined) {
    if (!Array.isArray(obj.types)) {
      return { valid: false, error: 'types must be array' };
    }
    if (obj.types.length > 8) {
      return { valid: false, error: 'types array too large (max 8)' };
    }
    for (const t of obj.types) {
      if (typeof t !== 'string') {
        return { valid: false, error: 'types must be strings' };
      }
      if (t.length > 32) {
        return { valid: false, error: 'type string too long (max 32)' };
      }
      if (!ALLOWED_PLACE_TYPES.has(t)) {
        return { valid: false, error: 'type not in allowlist' };
      }
    }
  }

  // Optional: count
  if (obj.count !== undefined) {
    if (
      typeof obj.count !== 'number' ||
      !Number.isFinite(obj.count) ||
      obj.count < 0 ||
      obj.count > 100
    ) {
      return { valid: false, error: 'Invalid count' };
    }
  }

  return {
    valid: true,
    payload: {
      listingId: obj.listingId as string,
      sid: obj.sid as string,
      route: obj.route as 'nearby' | 'llm',
      blocked: obj.blocked as boolean,
      type: obj.type as 'type' | 'text' | undefined,
      types: obj.types as string[] | undefined,
      count: obj.count as number | undefined,
    },
  };
}

// ============ MAIN HANDLER ============

export async function POST(request: Request) {
  try {
    // 1. ORIGIN/HOST ENFORCEMENT (exact match)
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');

    // In production, enforce origin/host
    if (process.env.NODE_ENV === 'production') {
      if (origin && !isOriginAllowed(origin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      if (!origin && !isHostAllowed(host)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // 2. CONTENT-TYPE ENFORCEMENT
    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return NextResponse.json({ error: 'Invalid content type' }, { status: 415 });
    }

    // 3. RATE LIMIT (Redis-backed, separate prefix from chat)
    const clientIP = getClientIP(request);
    const rateLimitResult = await checkMetricsRateLimit(clientIP);

    if (!rateLimitResult.success) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimitResult.retryAfter || 60),
        },
      });
    }

    // 4. BODY SIZE GUARD - DO NOT trust Content-Length!
    const raw = await request.text();
    if (raw.length > MAX_BODY_SIZE) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    // 5. PARSE JSON
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // 6. STRICT SCHEMA VALIDATION - NON-INFORMATIVE ERROR (reduces probing surface)
    const validation = validatePayload(body);
    if (!validation.valid) {
      // Generic error - do NOT return validation.error to reduce probing surface
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const payload = validation.payload;

    // 7. FAIL CLOSED - do not log if secret is missing
    if (!LOG_HMAC_SECRET) {
      // Accept request but skip logging entirely
      return NextResponse.json({ ok: true });
    }

    // 8. COMPUTE HMAC - raw listingId NEVER stored
    const safeLog = {
      ts: Date.now(),
      lid: hmacListingId(payload.listingId),
      sid: payload.sid,
      route: payload.route,
      blocked: payload.blocked,
      // Only include non-sensitive fields for allowed requests
      ...(payload.type && !payload.blocked && { type: payload.type }),
      ...(payload.types && !payload.blocked && { types: payload.types }),
      ...(payload.count !== undefined && !payload.blocked && { count: payload.count }),
    };

    // 8. Log to console in dev, send to analytics service in prod
    if (process.env.NODE_ENV === 'development') {
      console.log('[SafeMetrics]', safeLog);
    }

    // Production: send to Supabase, BigQuery, etc.
    // await analyticsService.log(safeLog);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
