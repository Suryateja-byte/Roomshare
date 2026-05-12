/**
 * Tests for messages API route
 */

jest.mock("@/lib/prisma", () => {
  const mockPrisma: Record<string, any> = {
    conversation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    message: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    typingStatus: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    blockedUser: {
      findFirst: jest.fn(),
    },
    conversationDeletion: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(),
  };
  // $transaction passes mockPrisma as tx so existing assertions still work
  mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
  return { prisma: mockPrisma };
});

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
  checkEmailVerified: jest.fn().mockResolvedValue({ verified: true }),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: any, init?: { status?: number }) => {
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: new Map(),
      };
    },
  },
}));

// P1-4: Mock rate limiting to return null (allow request)
jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

const mockCreateInternalNotification = jest.fn();
jest.mock("@/lib/notifications", () => ({
  createInternalNotification: (...args: unknown[]) =>
    mockCreateInternalNotification(...args),
}));

const mockSendNotificationEmailWithPreference = jest.fn();
jest.mock("@/lib/email", () => ({
  sendNotificationEmailWithPreference: (...args: unknown[]) =>
    mockSendNotificationEmailWithPreference(...args),
}));

const mockScanOutboundMessageContent = jest.fn();
const mockRecordOutboundContentSoftFlag = jest.fn();
jest.mock("@/lib/messaging/outbound-content-guard", () => ({
  scanOutboundMessageContent: (...args: unknown[]) =>
    mockScanOutboundMessageContent(...args),
  recordOutboundContentSoftFlag: (...args: unknown[]) =>
    mockRecordOutboundContentSoftFlag(...args),
}));

import { GET, POST } from "@/app/api/messages/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkEmailVerified } from "@/app/actions/suspension";
import { withRateLimit } from "@/lib/with-rate-limit";

describe("Messages API", () => {
  const mockSession = {
    user: { id: "user-123", name: "Test User", email: "test@example.com" },
  };
  const originalNodeEnv = process.env.NODE_ENV;
  const freshLastConfirmedAt = () =>
    new Date(Date.now() - 24 * 60 * 60 * 1000);

  const setNodeEnv = (value: string) => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value,
      configurable: true,
    });
  };

  beforeEach(() => {
    setNodeEnv(originalNodeEnv || "test");
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(mockSession);
    // Mock user.findUnique for suspension check
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "user-123",
      isSuspended: false,
    });
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: "user-456", email: "recipient@example.com" },
    ]);
    (prisma.blockedUser.findFirst as jest.Mock).mockResolvedValue(null);
    mockCreateInternalNotification.mockResolvedValue({ success: true });
    mockSendNotificationEmailWithPreference.mockResolvedValue({
      success: true,
    });
    mockScanOutboundMessageContent.mockReturnValue([]);
  });

  afterAll(() => {
    setNodeEnv(originalNodeEnv || "test");
  });

  describe("GET", () => {
    it("returns 401 when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new Request("http://localhost/api/messages");
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it("applies pre-auth rate limit before calling auth()", async () => {
      // Mock withRateLimit to return a 429 response on the FIRST call (pre-auth)
      const mock429 = {
        status: 429,
        json: async () => ({ error: "Too many requests" }),
        headers: new Map(),
      };
      (withRateLimit as jest.Mock).mockResolvedValueOnce(mock429);

      const request = new Request("http://localhost/api/messages");
      const response = await GET(request);

      // Pre-auth rate limit should fire before auth()
      expect(response.status).toBe(429);
      expect(auth).not.toHaveBeenCalled();

      // Verify withRateLimit was called with messagesPreAuth type
      expect(withRateLimit).toHaveBeenCalledWith(request, {
        type: "messagesPreAuth",
        endpoint: "/api/messages:pre-auth",
      });
    });

    it("returns messages for specific conversation", async () => {
      const mockConversation = {
        id: "conv-123",
        participants: [{ id: "user-123" }, { id: "user-456" }],
        deletions: [],
      };
      const mockMessages = [
        {
          id: "msg-1",
          content: "Hello",
          sender: { id: "user-123", name: "User", image: null },
        },
        {
          id: "msg-2",
          content: "Hi",
          sender: { id: "user-456", name: "Other", image: null },
        },
      ];
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(
        mockConversation
      );
      (prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages);
      (prisma.message.count as jest.Mock).mockResolvedValue(2);

      const request = new Request(
        "http://localhost/api/messages?conversationId=conv-123"
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      const data = await response.json();
      expect(data.messages).toEqual(mockMessages);
    });

    it("returns unread count with a short private cache header", async () => {
      (prisma.message.count as jest.Mock).mockResolvedValue(3);

      const request = new Request(
        "http://localhost/api/messages?view=unreadCount"
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe(
        "private, max-age=10, stale-while-revalidate=20"
      );
      await expect(response.json()).resolves.toEqual({ count: 3 });
    });

    it("returns 403 when user is not participant", async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: "conv-123",
        participants: [{ id: "other-1" }, { id: "other-2" }],
        deletions: [],
      });

      const request = new Request(
        "http://localhost/api/messages?conversationId=conv-123"
      );
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it("supports safe polling reads without mutating message state", async () => {
      const mockConversation = {
        id: "conv-123",
        participants: [{ id: "user-123" }, { id: "user-456" }],
        deletions: [],
      };
      const cursorMessage = {
        id: "msg-1",
        conversationId: "conv-123",
        createdAt: new Date("2026-03-06T12:00:00.000Z"),
      };
      const polledMessages = [
        {
          id: "msg-2",
          content: "Hello after cursor",
          sender: { id: "user-456", name: "Other", image: null },
          createdAt: new Date("2026-03-06T12:01:00.000Z"),
        },
      ];

      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(
        mockConversation
      );
      (prisma.message.findUnique as jest.Mock).mockResolvedValue(cursorMessage);
      (prisma.message.findMany as jest.Mock).mockResolvedValue(polledMessages);
      (prisma.typingStatus.findMany as jest.Mock).mockResolvedValue([
        {
          user: { id: "user-456", name: "Other User" },
        },
      ]);

      const request = new Request(
        "http://localhost/api/messages?conversationId=conv-123&poll=1&lastMessageId=msg-1"
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      const data = await response.json();
      expect(data).toEqual({
        messages: polledMessages,
        typingUsers: [{ id: "user-456", name: "Other User" }],
        hasNewMessages: true,
      });
      expect(prisma.message.updateMany).not.toHaveBeenCalled();
      expect(prisma.message.count).not.toHaveBeenCalled();
    });

    it("returns all conversations when no conversationId", async () => {
      const mockConversations = [
        {
          id: "conv-1",
          participants: [
            { id: "user-123", name: "User", image: null },
            { id: "other-1", name: "Other 1", image: null },
          ],
          messages: [{ content: "Last message", createdAt: new Date() }],
          listing: { title: "Listing 1" },
        },
      ];
      (prisma.conversation.findMany as jest.Mock).mockResolvedValue(
        mockConversations
      );
      (prisma.conversation.count as jest.Mock).mockResolvedValue(1);

      const request = new Request("http://localhost/api/messages");
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      const data = await response.json();
      expect(data.conversations[0].id).toBe("conv-1");
    });

    it("handles database errors", async () => {
      (prisma.conversation.findMany as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const request = new Request("http://localhost/api/messages");
      const response = await GET(request);

      expect(response.status).toBe(500);
    });
  });

  describe("POST", () => {
    it("rejects mutation requests without an Origin header when CSRF is active", async () => {
      setNodeEnv("production");

      const request = new Request("http://localhost/api/messages", {
        method: "POST",
        headers: {
          host: "localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({ conversationId: "conv-123", content: "Hello" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "Forbidden: missing Origin header",
      });
      expect(auth).not.toHaveBeenCalled();
    });

    it("rejects mutation requests with a malformed Origin header when CSRF is active", async () => {
      setNodeEnv("production");

      const request = new Request("http://localhost/api/messages", {
        method: "POST",
        headers: {
          origin: "not a url",
          host: "localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({ conversationId: "conv-123", content: "Hello" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "Forbidden: malformed Origin header",
      });
      expect(auth).not.toHaveBeenCalled();
    });

    it("rejects mutation requests with a mismatched Origin header when CSRF is active", async () => {
      setNodeEnv("production");

      const request = new Request("http://localhost/api/messages", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          host: "localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({ conversationId: "conv-123", content: "Hello" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "Forbidden: Origin mismatch",
      });
      expect(auth).not.toHaveBeenCalled();
    });

    it("allows same-origin mutation requests through CSRF before auth", async () => {
      setNodeEnv("production");
      (auth as jest.Mock).mockResolvedValueOnce(null);

      const request = new Request("https://roomshare.test/api/messages", {
        method: "POST",
        headers: {
          origin: "https://roomshare.test",
          host: "roomshare.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ conversationId: "conv-123", content: "Hello" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
      expect(auth).toHaveBeenCalled();
    });

    it("allows localhost development mutation requests through CSRF before auth", async () => {
      setNodeEnv("development");
      (auth as jest.Mock).mockResolvedValueOnce(null);

      const request = new Request("http://127.0.0.1:3000/api/messages", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          host: "127.0.0.1:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ conversationId: "conv-123", content: "Hello" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
      expect(auth).toHaveBeenCalled();
    });

    it("returns 401 when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new Request("http://localhost/api/messages", {
        method: "POST",
        body: JSON.stringify({ conversationId: "conv-123", content: "Hello" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it("returns 400 when missing fields", async () => {
      const request = new Request("http://localhost/api/messages", {
        method: "POST",
        body: JSON.stringify({ conversationId: "conv-123" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it("returns 400 when direct send content exceeds the 1000-character API cap", async () => {
      const request = new Request("http://localhost/api/messages", {
        method: "POST",
        body: JSON.stringify({
          conversationId: "conv-123",
          content: "x".repeat(1001),
        }),
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Message must be 1000 characters or less.",
      });
      expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it("returns 403 when user is not participant", async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: "conv-123",
        participants: [{ id: "other-1" }, { id: "other-2" }],
      });

      const request = new Request("http://localhost/api/messages", {
        method: "POST",
        body: JSON.stringify({ conversationId: "conv-123", content: "Hello" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
    });

    it("returns 403 when email is not verified", async () => {
      (checkEmailVerified as jest.Mock).mockResolvedValueOnce({
        verified: false,
        error: "Please verify your email to continue",
      });

      const request = new Request("http://localhost/api/messages", {
        method: "POST",
        body: JSON.stringify({ conversationId: "conv-123", content: "Hello" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toMatch(/verify your email/i);
    });

    it("returns 403 when sender is blocked by recipient", async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: "conv-123",
        participants: [{ id: "user-123" }, { id: "user-456" }],
        listing: {
          status: "ACTIVE",
          statusReason: null,
          availableSlots: 1,
          totalSlots: 1,
          openSlots: 1,
          moveInDate: new Date("2026-05-01T00:00:00.000Z"),
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: freshLastConfirmedAt(),
        },
      });
      (prisma.blockedUser.findFirst as jest.Mock).mockResolvedValueOnce({
        blockerId: "user-456",
      });

      const request = new Request("http://localhost/api/messages", {
        method: "POST",
        body: JSON.stringify({ conversationId: "conv-123", content: "Hello" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe("This user has blocked you");
    });

    it("returns 403 when sender has blocked recipient", async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: "conv-123",
        participants: [{ id: "user-123" }, { id: "user-456" }],
        listing: {
          status: "ACTIVE",
          statusReason: null,
          availableSlots: 1,
          totalSlots: 1,
          openSlots: 1,
          moveInDate: new Date("2026-05-01T00:00:00.000Z"),
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: freshLastConfirmedAt(),
        },
      });
      (prisma.blockedUser.findFirst as jest.Mock).mockResolvedValueOnce({
        blockerId: "user-123",
      });

      const request = new Request("http://localhost/api/messages", {
        method: "POST",
        body: JSON.stringify({ conversationId: "conv-123", content: "Hello" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe(
        "You have blocked this user. Unblock them to interact."
      );
    });

    it("returns 403 when an existing thread targets a suspended host", async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: "conv-123",
        participants: [
          { id: "user-123", isSuspended: false },
          { id: "user-456", isSuspended: true },
        ],
        listing: {
          ownerId: "user-456",
          status: "ACTIVE",
          statusReason: null,
          availableSlots: 1,
          totalSlots: 1,
          openSlots: 1,
          moveInDate: new Date("2026-05-01T00:00:00.000Z"),
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: freshLastConfirmedAt(),
          owner: { isSuspended: true },
        },
      });

      const request = new Request("http://localhost/api/messages", {
        method: "POST",
        body: JSON.stringify({ conversationId: "conv-123", content: "Hello" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data).toEqual({
        error: "This host is not accepting contact right now.",
        code: "HOST_NOT_ACCEPTING_CONTACT",
      });
      expect(prisma.blockedUser.findFirst).not.toHaveBeenCalled();
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it("creates message successfully", async () => {
      const mockConversation = {
        id: "conv-123",
        participants: [{ id: "user-123" }, { id: "user-456" }],
        listing: {
          status: "ACTIVE",
          statusReason: null,
          availableSlots: 1,
          totalSlots: 1,
          openSlots: 1,
          moveInDate: new Date("2026-05-01T00:00:00.000Z"),
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: freshLastConfirmedAt(),
        },
      };
      const mockMessage = {
        id: "msg-new",
        content: "Hello",
        senderId: "user-123",
        sender: { id: "user-123", name: "User", image: null },
      };
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(
        mockConversation
      );
      (prisma.message.create as jest.Mock).mockResolvedValue(mockMessage);
      (prisma.conversation.update as jest.Mock).mockResolvedValue({});

      const request = new Request("http://localhost/api/messages", {
        method: "POST",
        body: JSON.stringify({ conversationId: "conv-123", content: "Hello" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(prisma.message.create).toHaveBeenCalled();
      expect(prisma.conversation.update).toHaveBeenCalled();
      expect(mockRecordOutboundContentSoftFlag).toHaveBeenCalledWith({
        conversationId: "conv-123",
        userId: "user-123",
        flagKinds: [],
      });
      expect(mockCreateInternalNotification).toHaveBeenCalledWith({
        userId: "user-456",
        type: "NEW_MESSAGE",
        title: "New Message",
        message: "Test User: Hello",
        link: "/messages/conv-123",
      });
      expect(mockSendNotificationEmailWithPreference).toHaveBeenCalledWith(
        "newMessage",
        "user-456",
        "recipient@example.com",
        {
          recipientName: "User",
          senderName: "Test User",
          conversationId: "conv-123",
        }
      );
    });

    it("records outbound soft flags for direct API sends", async () => {
      mockScanOutboundMessageContent.mockReturnValueOnce(["email", "phone"]);
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: "conv-123",
        participants: [{ id: "user-123" }, { id: "user-456" }],
        listing: {
          status: "ACTIVE",
          statusReason: null,
          availableSlots: 1,
          totalSlots: 1,
          openSlots: 1,
          moveInDate: new Date("2026-05-01T00:00:00.000Z"),
          availableUntil: null,
          minStayMonths: 1,
          lastConfirmedAt: freshLastConfirmedAt(),
        },
      });
      (prisma.message.create as jest.Mock).mockResolvedValue({
        id: "msg-new",
        content: "Email me at host@example.com or call 555-555-5555",
        senderId: "user-123",
      });
      (prisma.conversation.update as jest.Mock).mockResolvedValue({});

      const request = new Request("http://localhost/api/messages", {
        method: "POST",
        body: JSON.stringify({
          conversationId: "conv-123",
          content: "Email me at host@example.com or call 555-555-5555",
        }),
      });
      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(mockScanOutboundMessageContent).toHaveBeenCalledWith(
        "Email me at host@example.com or call 555-555-5555"
      );
      expect(mockRecordOutboundContentSoftFlag).toHaveBeenCalledWith({
        conversationId: "conv-123",
        userId: "user-123",
        flagKinds: ["email", "phone"],
      });
    });

    it.each(["PAUSED", "RENTED"] as const)(
      "returns 403 LISTING_UNAVAILABLE when conversation listing is %s",
      async (status) => {
        (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
          id: "conv-123",
          participants: [{ id: "user-123" }, { id: "user-456" }],
          listing: { status },
        });

        const request = new Request("http://localhost/api/messages", {
          method: "POST",
          body: JSON.stringify({
            conversationId: "conv-123",
            content: "Hello",
          }),
        });
        const response = await POST(request);

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data).toEqual({
          error: "This listing is not available for new messages right now.",
          code: "LISTING_UNAVAILABLE",
        });
        expect(prisma.message.create).not.toHaveBeenCalled();
      },
    );

    it("returns 403 MIGRATION_REVIEW when the listing is gated by migration review", async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: "conv-123",
        participants: [{ id: "user-123" }, { id: "user-456" }],
        listing: {
          status: "ACTIVE",
          statusReason: "MIGRATION_REVIEW",
          needsMigrationReview: true,
          availabilitySource: "HOST_MANAGED",
          availableSlots: 1,
          totalSlots: 1,
          openSlots: 1,
          moveInDate: new Date("2026-05-01T00:00:00.000Z"),
          availableUntil: new Date("2026-12-01T00:00:00.000Z"),
          minStayMonths: 1,
          lastConfirmedAt: new Date("2026-04-10T12:00:00.000Z"),
        },
      });

      const request = new Request("http://localhost/api/messages", {
        method: "POST",
        body: JSON.stringify({
          conversationId: "conv-123",
          content: "Hello",
        }),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data).toEqual({
        error: "This listing is temporarily unavailable.",
        code: "MIGRATION_REVIEW",
      });
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it("handles database errors", async () => {
      (prisma.conversation.findUnique as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const request = new Request("http://localhost/api/messages", {
        method: "POST",
        body: JSON.stringify({ conversationId: "conv-123", content: "Hello" }),
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
    });
  });
});
