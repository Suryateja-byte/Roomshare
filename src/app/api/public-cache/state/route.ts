import { NextResponse } from "next/server";
import { getPublicCacheStatePayload } from "@/lib/public-cache/state";
import { withRateLimit } from "@/lib/with-rate-limit";

function jsonNoStore(data: unknown, init?: { status?: number }) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const rateLimitResponse = await withRateLimit(request, {
    type: "publicCacheState",
    endpoint: "/api/public-cache/state",
  });
  if (rateLimitResponse) {
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    return rateLimitResponse;
  }

  return jsonNoStore(await getPublicCacheStatePayload());
}
