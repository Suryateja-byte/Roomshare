jest.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

function createHeaders(init?: HeadersInit) {
  const headers = new Map<string, string>();
  if (init instanceof Headers) {
    init.forEach((value, key) => headers.set(key, value));
  } else if (Array.isArray(init)) {
    init.forEach(([key, value]) => headers.set(key, value));
  } else if (init) {
    Object.entries(init).forEach(([key, value]) => {
      headers.set(key, String(value));
    });
  }

  return {
    get: (key: string) => headers.get(key) ?? null,
    set: (key: string, value: string) => headers.set(key, value),
  };
}

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: ResponseInit) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: createHeaders(init?.headers),
    }),
  },
}));

jest.mock("@/lib/api-error-handler", () => ({
  captureApiError: jest.fn(() => ({
    status: 500,
    json: async () => ({ error: "Internal server error" }),
    headers: createHeaders(),
  })),
}));

import { GET } from "@/app/api/messages/realtime-token/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkSuspension } from "@/app/actions/suspension";
import { withRateLimit } from "@/lib/with-rate-limit";

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
}

describe("GET /api/messages/realtime-token", () => {
  const originalSecret = process.env.SUPABASE_JWT_SECRET;
  const mockSession = {
    user: { id: "user-123", name: "Test User" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPABASE_JWT_SECRET = "s".repeat(32);
    (auth as jest.Mock).mockResolvedValue(mockSession);
    (checkSuspension as jest.Mock).mockResolvedValue({ suspended: false });
    (withRateLimit as jest.Mock).mockResolvedValue(null);
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
      id: "conv-123",
      deletedAt: null,
      participants: [{ id: "user-123" }, { id: "other-user" }],
      deletions: [],
    });
  });

  afterAll(() => {
    process.env.SUPABASE_JWT_SECRET = originalSecret;
  });

  it("returns 429 before auth when the pre-auth limiter blocks", async () => {
    const rateLimited = {
      status: 429,
      json: async () => ({ error: "Too many requests" }),
      headers: createHeaders(),
    };
    (withRateLimit as jest.Mock).mockResolvedValueOnce(rateLimited);

    const request = new Request(
      "http://localhost/api/messages/realtime-token?conversationId=conv-123"
    );
    const response = await GET(request);

    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(auth).not.toHaveBeenCalled();
    expect(withRateLimit).toHaveBeenCalledWith(request, {
      type: "messagesPreAuth",
      endpoint: "/api/messages/realtime-token:pre-auth",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      new Request(
        "http://localhost/api/messages/realtime-token?conversationId=conv-123"
      )
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns 403 for suspended users", async () => {
    (checkSuspension as jest.Mock).mockResolvedValueOnce({
      suspended: true,
      error: "Account suspended",
    });

    const response = await GET(
      new Request(
        "http://localhost/api/messages/realtime-token?conversationId=conv-123"
      )
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Account suspended",
      code: "ACCOUNT_SUSPENDED",
    });
    expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase JWT signing is not configured", async () => {
    delete process.env.SUPABASE_JWT_SECRET;

    const response = await GET(
      new Request(
        "http://localhost/api/messages/realtime-token?conversationId=conv-123"
      )
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Realtime messaging is not configured",
    });
    expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns 400 when conversationId is invalid", async () => {
    const response = await GET(
      new Request("http://localhost/api/messages/realtime-token")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid input" });
  });

  it("returns 403 when the user cannot access the conversation", async () => {
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValueOnce({
      id: "conv-123",
      deletedAt: null,
      participants: [{ id: "other-user" }],
      deletions: [],
    });

    const response = await GET(
      new Request(
        "http://localhost/api/messages/realtime-token?conversationId=conv-123"
      )
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns a short-lived authenticated JWT scoped to the user and conversation", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/messages/realtime-token?conversationId=conv-123"
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");

    const body = await response.json();
    expect(body).toEqual({
      token: expect.any(String),
      expiresAt: expect.any(Number),
      expiresIn: 300,
    });

    const payload = decodeJwtPayload(String(body.token));
    expect(payload).toMatchObject({
      aud: "authenticated",
      role: "authenticated",
      sub: "user-123",
      roomshare_user_id: "user-123",
      roomshare_conversation_id: "conv-123",
    });
    expect(Number(payload.exp) - Number(payload.iat)).toBe(300);
    expect(String(body.token).split(".")).toHaveLength(3);
  });

  it("applies a user-scoped realtime token rate limit", async () => {
    const request = new Request(
      "http://localhost/api/messages/realtime-token?conversationId=conv-123"
    );

    await GET(request);

    expect(withRateLimit).toHaveBeenNthCalledWith(2, request, {
      type: "realtimeToken",
      endpoint: "/api/messages/realtime-token",
      getIdentifier: expect.any(Function),
    });
  });
});
