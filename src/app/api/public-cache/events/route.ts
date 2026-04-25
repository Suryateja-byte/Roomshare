import { features } from "@/lib/env";
import { PublicCacheCursorError } from "@/lib/public-cache/cache-policy";
import { listPublicCacheInvalidationEventsAfter } from "@/lib/public-cache/events";
import { getPublicCacheStatePayload } from "@/lib/public-cache/state";
import { withRateLimit } from "@/lib/with-rate-limit";

function encodeSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sseResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET(request: Request) {
  const rateLimitResponse = await withRateLimit(request, {
    type: "publicCacheState",
    endpoint: "/api/public-cache/events",
  });
  if (rateLimitResponse) {
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    return rateLimitResponse;
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");

  try {
    const state = await getPublicCacheStatePayload();
    if (!features.publicCacheCoherence) {
      return sseResponse(`retry: 60000\n${encodeSse("public-cache.state", state)}`);
    }

    const events = await listPublicCacheInvalidationEventsAfter(cursor, 50);
    const body = [
      "retry: 60000\n\n",
      ...events.map((event) => encodeSse("public-cache.invalidate", event)),
      encodeSse("public-cache.state", state),
    ].join("");

    return sseResponse(body);
  } catch (error) {
    if (error instanceof PublicCacheCursorError) {
      return Response.json(
        { error: "invalid_cursor" },
        {
          status: 400,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    throw error;
  }
}
