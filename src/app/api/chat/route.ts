import { streamText, tool, zodSchema, stepCountIs, type CoreMessage, type UIMessage } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { checkChatRateLimit } from '@/lib/rate-limit-redis';
import { getClientIP } from '@/lib/rate-limit';
import { checkFairHousingPolicy, POLICY_REFUSAL_MESSAGE } from '@/lib/fair-housing-policy';
import { DEFAULT_TIMEOUTS } from '@/lib/timeout-wrapper';
import { logger, sanitizeErrorMessage } from '@/lib/logger';
import * as Sentry from '@sentry/nextjs';
import { isOriginAllowed, isHostAllowed } from '@/lib/origin-guard';

/**
 * Neighborhood Chat API Route
 *
 * SECURITY STACK (in order):
 * 1. Origin/Host enforcement (exact match from env allowlist)
 * 2. Content-Type: application/json enforcement
 * 3. Rate limit check (Redis-backed, burst + sustained)
 * 4. Body size guard (via request.text(), NOT Content-Length)
 * 5. Parse JSON from raw text
 * 6. Strict schema validation
 * 7. Coordinate validation (with range check)
 * 8. Extract latest user text
 * 9. Fair Housing gate (provider-independent)
 * 10. Call LLM / stream
 *
 * MIGRATION NOTE:
 * The findPlaces tool that called Google Places API has been removed.
 * Nearby place searches are now handled client-side using Google Places UI Kit.
 * See: src/components/chat/NearbyPlacesCard.tsx
 */

// CRITICAL: Force Node.js runtime for crypto compatibility
export const runtime = 'nodejs';

// ============ COORDINATE VALIDATION ============

function validateCoordinates(
  lat: unknown,
  lng: unknown
): { valid: boolean; lat?: number; lng?: number } {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { valid: false };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { valid: false };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false };
  }
  return { valid: true, lat, lng };
}

// ============ STRICT CHAT PAYLOAD VALIDATION ============

const MAX_MESSAGES = 50; // Prevent payload amplification
const MAX_USER_TEXT_LENGTH = 2000; // Cap user text length
const MAX_BODY_SIZE = 100_000; // 100KB max body size
const VALID_ROLES = new Set(['user', 'assistant']);

interface ChatMessage {
  role: 'user' | 'assistant';
  content: unknown;
  parts?: Array<{ type: string; text?: string; [key: string]: unknown }>;
}

interface ChatPayload {
  messages: ChatMessage[];
  latitude: number;
  longitude: number;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter(
        (part): part is { type: 'text'; text: string } =>
          part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string'
      )
      .map((part) => part.text)
      .join(' ');
  }
  return '';
}

function validateChatPayload(
  body: unknown
): { valid: true; payload: ChatPayload } | { valid: false } {
  if (!body || typeof body !== 'object') {
    return { valid: false };
  }

  const obj = body as Record<string, unknown>;

  // Validate messages array
  if (!Array.isArray(obj.messages)) {
    return { valid: false };
  }

  // Cap messages count (prevents payload amplification)
  if (obj.messages.length > MAX_MESSAGES) {
    return { valid: false };
  }

  // Validate each message
  const validatedMessages: ChatMessage[] = [];
  for (const msg of obj.messages) {
    if (!msg || typeof msg !== 'object') {
      return { valid: false };
    }
    const m = msg as Record<string, unknown>;

    // Role must be user or assistant
    if (!VALID_ROLES.has(m.role as string)) {
      return { valid: false };
    }

    // For user messages, validate text content length
    if (m.role === 'user' && m.content) {
      const textContent = extractTextFromContent(m.content);
      if (textContent.length > MAX_USER_TEXT_LENGTH) {
        return { valid: false };
      }
    }

    // Preserve both content and parts (AI SDK may send parts without content)
    validatedMessages.push({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      ...(Array.isArray(m.parts) && { parts: m.parts as ChatMessage['parts'] }),
    });
  }

  // Validate latitude and longitude exist (coordinate range checked separately)
  if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') {
    return { valid: false };
  }

  // Drop/ignore unexpected fields - only return validated fields
  return {
    valid: true,
    payload: {
      messages: validatedMessages,
      latitude: obj.latitude,
      longitude: obj.longitude,
    },
  };
}

// ============ MESSAGE CONVERSION ============

// Extract text content from UI message parts
function getTextContent(msg: UIMessage | ChatMessage): string {
  // Try content first (ChatMessage format)
  if ('content' in msg && msg.content !== undefined && msg.content !== null) {
    const text = extractTextFromContent(msg.content);
    if (text) return text;
  }
  // Fallback to parts (UIMessage format) - AI SDK may send parts without content
  if ('parts' in msg && Array.isArray(msg.parts)) {
    return (msg.parts as Array<{ type: string; text?: string }>)
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('');
  }
  return '';
}

// Convert UI messages to CoreMessage format for Groq
function convertToSimpleMessages(messages: ChatMessage[]): CoreMessage[] {
  const result: CoreMessage[] = [];

  for (const msg of messages) {
    const content = getTextContent(msg);
    if (content) {
      result.push({ role: msg.role, content });
    }
  }

  return result;
}

// ============ GROQ CONFIGURATION ============

// P1-12 FIX: Validate GROQ_API_KEY exists before creating client
const groqApiKey = process.env.GROQ_API_KEY;

const groq = groqApiKey
  ? createGroq({ apiKey: groqApiKey })
  : null;

// ============ PLACE TYPE MAPPING ============

const PLACE_TYPE_MAP: Record<string, string[]> = {
  gym: ['gym'],
  fitness: ['gym'],
  grocery: ['supermarket'],
  supermarket: ['supermarket'],
  restaurant: ['restaurant'],
  cafe: ['cafe'],
  coffee: ['cafe'],
  pharmacy: ['pharmacy'],
  hospital: ['hospital'],
  park: ['park'],
  transit: ['transit_station'],
  bus: ['bus_station'],
  train: ['train_station'],
  subway: ['subway_station'],
  bank: ['bank'],
  laundry: ['laundry'],
};

function determineSearchParams(query: string): {
  searchType: 'type' | 'text';
  includedTypes?: string[];
} {
  const lowerQuery = query.toLowerCase().trim();

  for (const [keyword, types] of Object.entries(PLACE_TYPE_MAP)) {
    if (lowerQuery.includes(keyword)) {
      return { searchType: 'type', includedTypes: types };
    }
  }

  return { searchType: 'text' };
}

// ============ MAIN HANDLER ============

export async function POST(request: Request) {
  try {
    // 0. SESSION AUTH - require authenticated user for LLM endpoints
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // 1. ORIGIN/HOST ENFORCEMENT (exact match)
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');

    // In production, enforce origin/host
    if (process.env.NODE_ENV === 'production') {
      if (origin && !isOriginAllowed(origin)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (!origin && !isHostAllowed(host)) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // 2. CONTENT-TYPE ENFORCEMENT
    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'Invalid content type' }), {
        status: 415,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. RATE LIMIT (Redis-backed, burst + sustained)
    const clientIP = getClientIP(request);
    const rateLimitResult = await checkChatRateLimit(clientIP);

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
      return new Response(JSON.stringify({ error: 'Request too large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 5. PARSE JSON from raw text - return 400 NOT 500
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 6. STRICT SCHEMA VALIDATION
    const validation = validateChatPayload(body);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const { messages, latitude, longitude } = validation.payload;

    // 7. COORDINATE VALIDATION (with range check)
    const coordResult = validateCoordinates(latitude, longitude);
    if (!coordResult.valid) {
      return new Response(JSON.stringify({ error: 'Invalid coordinates' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 8. EXTRACT LATEST USER TEXT (already bounded by validation)
    const lastUserMessage = messages.slice().reverse().find((m) => m.role === 'user');
    const userText = lastUserMessage ? getTextContent(lastUserMessage) : '';

    // 9. FAIR HOUSING GATE (provider-independent, before any model call)
    if (userText) {
      const policyCheck = checkFairHousingPolicy(userText);

      if (!policyCheck.allowed) {
        // Generic refusal - do NOT return category
        return new Response(
          JSON.stringify({
            error: 'request_blocked',
            message: POLICY_REFUSAL_MESSAGE,
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 10. CALL LLM
    const simpleMessages = convertToSimpleMessages(messages);

    // Safety check: ensure we have at least one message
    if (simpleMessages.length === 0) {
      logger.sync.error('[Chat] No valid messages after conversion', { messageCount: messages.length, route: '/api/chat' });
      return new Response(JSON.stringify({ error: 'No valid messages' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // P1-12 FIX: Check if AI chat is available (GROQ_API_KEY configured)
    if (!groq) {
      return new Response(JSON.stringify({ error: 'Chat service temporarily unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // P0-05 FIX: Add timeout protection to prevent indefinite LLM hangs
    // AbortController ensures we can cancel the stream if it takes too long
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, DEFAULT_TIMEOUTS.LLM_STREAM);

    try {
      const result = streamText({
        model: groq('llama-3.1-8b-instant'),
        system: `You are a helpful assistant for a room rental listing. You can answer general questions about the property and neighborhood.

For questions about nearby places (restaurants, gyms, grocery stores, transit, etc.), use the nearbyPlaceSearch tool. DO NOT try to provide specific place names, addresses, or distances - the tool will handle displaying that information.

Be friendly and concise. Focus on being helpful without making up specific information about places you don't know about.`,
        messages: simpleMessages,
        tools: {
          /**
           * Fallback tool for nearby place searches.
           * Returns a structured action that the client interprets to render
           * the NearbyPlacesCard component.
           *
           * CRITICAL: This tool does NOT call Google Places API.
           * It only returns the action metadata - no place data.
           */
          nearbyPlaceSearch: tool({
            description:
              'Trigger a search for nearby places like restaurants, gyms, grocery stores, parks, transit stations, etc. Use this when users ask about places near the listing.',
            inputSchema: zodSchema(
              z.object({
                query: z
                  .string()
                  .describe(
                    'The type of place or specific query (e.g., "gym", "indian grocery", "Starbucks")'
                  ),
              })
            ),
            execute: async ({ query }: { query: string }) => {
              const { searchType, includedTypes } = determineSearchParams(query);

              // Return structured action - NO place data
              return {
                action: 'NEARBY_UI_KIT',
                query,
                searchType,
                includedTypes,
                // The client will use these coordinates to configure the search
                coordinates: { lat: coordResult.lat, lng: coordResult.lng },
              };
            },
          }),
        },
        // Allow up to 5 steps for: 1) parse, 2) tool call, 3) receive results, 4) respond, 5) buffer
        stopWhen: stepCountIs(5),
        // P0-05 FIX: Pass abort signal to allow timeout cancellation
        abortSignal: abortController.signal,
      });

      // Clear timeout once we have a result object (stream has started)
      clearTimeout(timeoutId);

      return result.toUIMessageStreamResponse();
    } catch (streamError) {
      clearTimeout(timeoutId);

      // P0-05: Handle abort/timeout specifically
      if (streamError instanceof Error && streamError.name === 'AbortError') {
        logger.sync.error('[Chat] LLM streaming timed out', { timeoutMs: DEFAULT_TIMEOUTS.LLM_STREAM, route: '/api/chat' });
        return new Response(JSON.stringify({ error: 'Chat response timed out. Please try again.' }), {
          status: 504,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Re-throw other errors to be caught by outer catch
      throw streamError;
    }
  } catch (error) {
    // Log error without user content - sanitize for privacy
    logger.sync.error('[Chat] API error', {
      error: sanitizeErrorMessage(error),
      route: '/api/chat',
    });
    Sentry.captureException(error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
