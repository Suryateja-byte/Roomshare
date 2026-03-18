jest.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findUnique: jest.fn(),
    },
    message: {
      updateMany: jest.fn(),
    },
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(),
    }),
  },
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

import { POST } from "@/app/api/messages/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

describe("POST /api/messages?action=markRead", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "user-123" },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/messages", {
        method: "POST",
        body: JSON.stringify({
          action: "markRead",
          conversationId: "conv-123",
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 when conversationId is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/messages", {
        method: "POST",
        body: JSON.stringify({ action: "markRead" }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "conversationId is required",
    });
  });

  it("returns 403 when the user cannot access the conversation", async () => {
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
      id: "conv-123",
      deletedAt: null,
      participants: [{ id: "other-user" }],
      deletions: [],
    });

    const response = await POST(
      new Request("http://localhost/api/messages", {
        method: "POST",
        body: JSON.stringify({
          action: "markRead",
          conversationId: "conv-123",
        }),
      })
    );

    expect(response.status).toBe(403);
  });

  it("marks unread inbound messages as read for a valid participant", async () => {
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
      id: "conv-123",
      deletedAt: null,
      participants: [{ id: "user-123" }, { id: "other-user" }],
      deletions: [],
    });
    (prisma.message.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

    const response = await POST(
      new Request("http://localhost/api/messages", {
        method: "POST",
        body: JSON.stringify({
          action: "markRead",
          conversationId: "conv-123",
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, count: 2 });
    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: {
        conversationId: "conv-123",
        senderId: { not: "user-123" },
        read: false,
      },
      data: { read: true },
    });
  });
});
