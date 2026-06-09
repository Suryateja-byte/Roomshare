import { createHmac } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { checkSuspension } from "@/app/actions/suspension";
import { captureApiError } from "@/lib/api-error-handler";
import { getClientIP } from "@/lib/rate-limit";
import { withRateLimit } from "@/lib/with-rate-limit";
import {
  getAccessibleConversation,
  userCanAccessConversation,
} from "@/lib/messages";

const realtimeTokenQuerySchema = z.object({
  conversationId: z.string().trim().min(1).max(100),
});

const REALTIME_TOKEN_TTL_SECONDS = 5 * 60;

type JsonResponseBody = Record<string, unknown>;

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function jsonNoStore(
  body: JsonResponseBody,
  init?: ResponseInit
): NextResponse {
  return withNoStore(NextResponse.json(body, init));
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signSupabaseRealtimeJwt(input: {
  userId: string;
  conversationId: string;
  secret: string;
}): { token: string; expiresAt: number } {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + REALTIME_TOKEN_TTL_SECONDS;
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlJson({
    aud: "authenticated",
    role: "authenticated",
    sub: input.userId,
    roomshare_user_id: input.userId,
    roomshare_conversation_id: input.conversationId,
    iat: issuedAt,
    exp: expiresAt,
  });
  const unsignedToken = `${header}.${payload}`;
  const signature = createHmac("sha256", input.secret)
    .update(unsignedToken)
    .digest("base64url");

  return { token: `${unsignedToken}.${signature}`, expiresAt };
}

export async function GET(request: Request) {
  try {
    const preAuthRateLimitResponse = await withRateLimit(request, {
      type: "messagesPreAuth",
      endpoint: "/api/messages/realtime-token:pre-auth",
    });
    if (preAuthRateLimitResponse) {
      return withNoStore(preAuthRateLimitResponse);
    }

    const session = await auth();
    if (!session?.user?.id) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const suspension = await checkSuspension(userId);
    if (suspension.suspended) {
      return jsonNoStore(
        {
          error: suspension.error || "Account suspended",
          code: "ACCOUNT_SUSPENDED",
        },
        { status: 403 }
      );
    }

    const userRateLimitResponse = await withRateLimit(request, {
      type: "realtimeToken",
      endpoint: "/api/messages/realtime-token",
      getIdentifier: () => `${getClientIP(request)}:${userId}`,
    });
    if (userRateLimitResponse) {
      return withNoStore(userRateLimitResponse);
    }

    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret || secret.length < 32) {
      return jsonNoStore(
        { error: "Realtime messaging is not configured" },
        { status: 503 }
      );
    }

    const url = new URL(request.url);
    const parsedQuery = realtimeTokenQuerySchema.safeParse({
      conversationId: url.searchParams.get("conversationId"),
    });
    if (!parsedQuery.success) {
      return jsonNoStore({ error: "Invalid input" }, { status: 400 });
    }

    const { conversationId } = parsedQuery.data;
    const conversation = await getAccessibleConversation(conversationId, userId);
    if (!userCanAccessConversation(conversation, userId)) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 403 });
    }

    const signed = signSupabaseRealtimeJwt({
      userId,
      conversationId,
      secret,
    });

    return jsonNoStore({
      token: signed.token,
      expiresAt: signed.expiresAt,
      expiresIn: REALTIME_TOKEN_TTL_SECONDS,
    });
  } catch (error: unknown) {
    const response = captureApiError(error, {
      route: "/api/messages/realtime-token",
      method: "GET",
    });
    return withNoStore(response);
  }
}
