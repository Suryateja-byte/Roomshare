import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/with-rate-limit';
import { logger } from '@/lib/logger';

interface AgentRequest {
  question: string;
  lat: number;
  lng: number;
}

// Validate coordinate ranges
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

export async function POST(request: NextRequest) {
  // P1-7 FIX: Add rate limiting to prevent agent abuse
  const rateLimitResponse = await withRateLimit(request, { type: 'agent' });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = (await request.json()) as AgentRequest;
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
        // P1-24 FIX: Return graceful fallback with helpful message
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
        // P1-24 FIX: Return graceful fallback on timeout
        return NextResponse.json({
          answer: "The request took too long to process. Please try asking a simpler question, or check the listing details directly for the information you need.",
          fallback: true
        });
      }

      // P1-11 FIX: Handle fetch errors properly instead of re-throwing
      // P1-24 FIX: Return graceful fallback on connection failure
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
