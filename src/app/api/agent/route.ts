import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { withRateLimit } from '@/lib/with-rate-limit';
import { logger } from '@/lib/logger';
import { isOriginAllowed, isHostAllowed } from '@/lib/origin-guard';

interface AgentRequest {
  question: string;
  lat: number;
  lng: number;
}

// ============ VALIDATION HELPERS ============

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !isNaN(lat) &&
    !isNaN(lng)
  );
}

const MAX_BODY_SIZE = 10_000; // 10KB

// ============ MAIN HANDLER ============

export async function POST(request: NextRequest) {
  // 1. ORIGIN/HOST ENFORCEMENT (exact match)
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

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

  // 3. RATE LIMITING
  const rateLimitResponse = await withRateLimit(request, { type: 'agent' });
  if (rateLimitResponse) return rateLimitResponse;

  // Session auth - require authenticated user for LLM endpoints
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    // 4. BODY SIZE GUARD
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_SIZE) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    // 5. PARSE JSON
    let body: AgentRequest;
    try {
      body = JSON.parse(raw) as AgentRequest;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { question, lat, lng } = body;

    // Validate question
    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { error: 'Question is required' },
        { status: 400 }
      );
    }

    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length < 2) {
      return NextResponse.json(
        { error: 'Question is too short' },
        { status: 400 }
      );
    }

    if (trimmedQuestion.length > 500) {
      return NextResponse.json(
        { error: 'Question is too long (max 500 characters)' },
        { status: 400 }
      );
    }

    // Validate coordinates
    if (!isValidCoordinate(lat, lng)) {
      return NextResponse.json(
        { error: 'Invalid coordinates' },
        { status: 400 }
      );
    }

    // Check for n8n webhook URL
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!webhookUrl) {
      logger.sync.error('N8N_WEBHOOK_URL is not configured');
      return NextResponse.json(
        { error: 'Service temporarily unavailable' },
        { status: 503 }
      );
    }

    // Forward request to n8n webhook with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const n8nResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: trimmedQuestion,
          lat,
          lng,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!n8nResponse.ok) {
        logger.sync.error('n8n webhook error', { status: n8nResponse.status });
        return NextResponse.json({
          answer: "I'm having trouble connecting to my knowledge service right now. Please try again in a moment, or feel free to explore the listing details and neighborhood information available on the page.",
          fallback: true
        });
      }

      const data = await n8nResponse.json();

      return NextResponse.json({
        answer: data.answer || data.response || data.message || 'No results found',
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json({
          answer: "The request took too long to process. Please try asking a simpler question, or check the listing details directly for the information you need.",
          fallback: true
        });
      }

      logger.sync.error('Agent webhook fetch error', { error: fetchError instanceof Error ? fetchError.message : 'Unknown error' });
      return NextResponse.json({
        answer: "I'm temporarily unable to process your question. Please try again shortly, or browse the available listing information on this page.",
        fallback: true
      });
    }
  } catch (error) {
    logger.sync.error('Agent API error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
