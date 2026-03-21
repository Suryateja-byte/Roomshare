/**
 * Tests for unread count reads through the consolidated messages API route
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      count: jest.fn(),
    },
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
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

import { GET } from "@/app/api/messages/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const createMockRequest = () =>
  new Request("http://localhost/api/messages?view=unreadCount");

describe("GET /api/messages?view=unreadCount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns unread count for authenticated user", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: "user-123" } });
    (prisma.message.count as jest.Mock).mockResolvedValue(5);

    const response = await GET(createMockRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ count: 5 });
    expect(prisma.message.count).toHaveBeenCalledWith({
      where: {
        conversation: {
          participants: {
            some: { id: "user-123" },
          },
          deletedAt: null,
          deletions: { none: { userId: "user-123" } },
        },
        senderId: { not: "user-123" },
        read: false,
        deletedAt: null,
      },
    });
  });

  it("returns 0 when no unread messages exist", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: "user-123" } });
    (prisma.message.count as jest.Mock).mockResolvedValue(0);

    const response = await GET(createMockRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ count: 0 });
  });

  it("returns 401 when not authenticated", async () => {
    (auth as jest.Mock).mockResolvedValue(null);

    const response = await GET(createMockRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: "Unauthorized" });
    expect(prisma.message.count).not.toHaveBeenCalled();
  });

  it("returns 500 when the unread count query fails", async () => {
    (auth as jest.Mock).mockResolvedValue({ user: { id: "user-123" } });
    (prisma.message.count as jest.Mock).mockRejectedValue(
      new Error("DB Error")
    );

    const response = await GET(createMockRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: "Internal server error" });
  });
});
