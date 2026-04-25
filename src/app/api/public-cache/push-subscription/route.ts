import { auth } from "@/auth";
import { features } from "@/lib/env";
import {
  deactivatePublicCachePushSubscription,
  upsertPublicCachePushSubscription,
} from "@/lib/public-cache/push";
import { withRateLimit } from "@/lib/with-rate-limit";

function jsonNoStore(data: unknown, init?: { status?: number }) {
  return Response.json(data, {
    status: init?.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const rateLimitResponse = await withRateLimit(request, {
    type: "publicCacheState",
    endpoint: "/api/public-cache/push-subscription",
  });
  if (rateLimitResponse) {
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    return rateLimitResponse;
  }

  if (!features.publicCacheCoherence || features.disablePublicCachePush) {
    return jsonNoStore({ ok: false, reason: "push_disabled" }, { status: 503 });
  }

  const session = await auth();
  const body = await request.json().catch(() => null);
  const result = await upsertPublicCachePushSubscription({
    subscription: body?.subscription,
    userId: session?.user?.id ?? null,
  });

  if (!result.ok) {
    return jsonNoStore(result, {
      status: result.reason === "invalid_subscription" ? 422 : 503,
    });
  }

  return jsonNoStore({ ok: true });
}

export async function DELETE(request: Request) {
  const rateLimitResponse = await withRateLimit(request, {
    type: "publicCacheState",
    endpoint: "/api/public-cache/push-subscription",
  });
  if (rateLimitResponse) {
    rateLimitResponse.headers.set("Cache-Control", "no-store");
    return rateLimitResponse;
  }

  const body = await request.json().catch(() => null);
  const result = await deactivatePublicCachePushSubscription({
    endpoint: body?.endpoint,
  });

  if (!result.ok) {
    return jsonNoStore(result, { status: 422 });
  }

  return jsonNoStore({ ok: true });
}
