import { streamText, tool, zodSchema, stepCountIs, type CoreMessage, type UIMessage } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { z } from 'zod';

/**
 * Neighborhood Chat API Route
 *
 * MIGRATION NOTE:
 * The findPlaces tool that called Google Places API has been removed.
 * Nearby place searches are now handled client-side using Google Places UI Kit.
 * See: src/components/chat/NearbyPlacesCard.tsx
 *
 * This route now includes a nearbyPlaceSearch tool that returns a structured
 * NEARBY_UI_KIT action for cases where nearby intent slips past client-side detection.
 * The client interprets this action and renders the NearbyPlacesCard component.
 */

// Extract text content from UI message parts
function getTextContent(msg: UIMessage): string {
  if (!msg.parts) return '';
  return msg.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

// Convert UI messages to CoreMessage format for Groq
function convertToSimpleMessages(messages: UIMessage[]): CoreMessage[] {
  const result: CoreMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      const content = getTextContent(msg);
      if (content) {
        result.push({ role: 'user', content });
      }
    } else if (msg.role === 'assistant') {
      const content = getTextContent(msg);
      if (content) {
        result.push({ role: 'assistant', content });
      }
    }
  }

  return result;
}

// Configure Groq provider
const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Valid place types for nearby search.
 * Maps common terms to Google Places API types.
 */
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

/**
 * Determines the search type and included types for a query.
 */
function determineSearchParams(query: string): {
  searchType: 'type' | 'text';
  includedTypes?: string[];
} {
  const lowerQuery = query.toLowerCase().trim();

  // Check if query matches a known place type
  for (const [keyword, types] of Object.entries(PLACE_TYPE_MAP)) {
    if (lowerQuery.includes(keyword)) {
      return { searchType: 'type', includedTypes: types };
    }
  }

  // Default to text search for specific/unknown queries
  return { searchType: 'text' };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, latitude, longitude } = body;

    // Validate coordinates
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      isNaN(latitude) ||
      isNaN(longitude)
    ) {
      return new Response(JSON.stringify({ error: 'Invalid coordinates' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Convert UI messages to simple format for Groq
    const simpleMessages = convertToSimpleMessages(messages as UIMessage[]);

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
                .describe('The type of place or specific query (e.g., "gym", "indian grocery", "Starbucks")'),
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
              coordinates: { lat: latitude, lng: longitude },
            };
          },
        }),
      },
      // Allow up to 5 steps for: 1) parse, 2) tool call, 3) receive results, 4) respond, 5) buffer
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
