import { streamText, tool, zodSchema, stepCountIs, type CoreMessage, type UIMessage } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { z } from 'zod';

// Extract text content from UI message parts
function getTextContent(msg: UIMessage): string {
  if (!msg.parts) return '';
  return msg.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

// Convert UI messages to CoreMessage format for Groq (preserving tool calls)
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
      // Only include assistant messages that have text content
      // Skip pure tool-call messages (Groq handles these internally)
      if (content) {
        result.push({ role: 'assistant', content });
      }
    }
    // Note: Tool call/result parts are handled by streamText internally
  }

  return result;
}

// Configure Groq provider
const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

// Haversine distance calculation (returns miles)
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Clean query by removing common filler words
function cleanQuery(query: string): string {
  const fillerWords = [
    'nearby',
    'near',
    'find',
    'closest',
    'close',
    'around',
    'here',
    'me',
    'local',
    'good',
    'best',
    'the',
    'a',
    'an',
    'any',
    'some',
    'where',
    'is',
    'are',
    'there',
  ];
  return query
    .toLowerCase()
    .replace(/[?.,!]/g, '')
    .split(' ')
    .filter((word) => !fillerWords.includes(word))
    .join(' ')
    .trim();
}

interface Place {
  name: string;
  address: string;
  distance: string;
}

// Search using Google Places API (New) Text Search
async function searchGooglePlaces(
  query: string,
  lat: number,
  lng: number
): Promise<Place[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error('Google Places API key not configured');
    return [];
  }

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify({
        textQuery: query,
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 5000,
          },
        },
      }),
    });

    if (!response.ok) {
      console.error('Google Places error:', response.status);
      return [];
    }

    const data = await response.json();
    const places = data.places || [];

    return places.slice(0, 5).map((place: {
      displayName?: { text: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
    }) => {
      const placeLat = place.location?.latitude ?? lat;
      const placeLng = place.location?.longitude ?? lng;
      const distance = calculateDistance(lat, lng, placeLat, placeLng);
      return {
        name: place.displayName?.text || 'Unknown',
        address: place.formattedAddress || '',
        distance: `${distance.toFixed(1)} miles`,
      };
    });
  } catch (error) {
    console.error('Google Places search error:', error);
    return [];
  }
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
      system:
        'You are a helpful local guide. Be friendly and concise. Always mention the distance to the closest option.',
      messages: simpleMessages,
      tools: {
        findPlaces: tool({
          description:
            'Search for nearby places like restaurants, grocery stores, parks, transit stations, hospitals, etc.',
          inputSchema: zodSchema(
            z.object({
              query: z.string().describe('The type of place to search for (e.g., "indian grocery", "park", "hospital")'),
            })
          ),
          execute: async ({ query }: { query: string }) => {
            const cleanedQuery = cleanQuery(query);
            const places = await searchGooglePlaces(cleanedQuery, latitude, longitude);

            if (places.length === 0) {
              return {
                success: false,
                message: `No places found matching "${query}" nearby.`,
              };
            }

            return {
              success: true,
              places,
              query: cleanedQuery,
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
