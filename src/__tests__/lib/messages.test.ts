/**
 * Direct unit tests for src/lib/messages.ts
 *
 * Tests the 4 exported functions in isolation:
 * - getAccessibleConversation: DB fetch with participant/deletion data
 * - userCanAccessConversation: Type-guard authorization check
 * - listConversationMessages: Paginated message retrieval with cursor
 * - markConversationMessagesAsReadForUser: Batch mark inbound as read
 *
 * Existing API route tests (messages.test.ts, messages-read.test.ts, etc.)
 * cover the HTTP layer. These tests cover the underlying logic directly.
 */

// Must mock before imports
const mockConversationFindUnique = jest.fn();
const mockMessageFindUnique = jest.fn();
const mockMessageFindMany = jest.fn();
const mockMessageUpdateMany = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findUnique: (...args: unknown[]) => mockConversationFindUnique(...args),
    },
    message: {
      findUnique: (...args: unknown[]) => mockMessageFindUnique(...args),
      findMany: (...args: unknown[]) => mockMessageFindMany(...args),
      updateMany: (...args: unknown[]) => mockMessageUpdateMany(...args),
    },
  },
}));

import {
  getAccessibleConversation,
  userCanAccessConversation,
  listConversationMessages,
  markConversationMessagesAsReadForUser,
  type AccessibleConversation,
} from "@/lib/messages";

const USER_ID = "user-123";
const OTHER_USER_ID = "user-456";
const CONVERSATION_ID = "conv-789";

/** Factory for a valid accessible conversation */
const makeConversation = (
  overrides: Partial<AccessibleConversation> = {}
): AccessibleConversation => ({
  id: CONVERSATION_ID,
  deletedAt: null,
  participants: [{ id: USER_ID }, { id: OTHER_USER_ID }],
  deletions: [],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getAccessibleConversation", () => {
  it("returns conversation with participants and deletions when found", async () => {
    const conversation = makeConversation();
    mockConversationFindUnique.mockResolvedValueOnce(conversation);

    const result = await getAccessibleConversation(CONVERSATION_ID, USER_ID);

    expect(result).toEqual(conversation);
    expect(mockConversationFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONVERSATION_ID },
        include: expect.objectContaining({
          participants: expect.any(Object),
          deletions: expect.objectContaining({
            where: { userId: USER_ID },
          }),
        }),
      })
    );
  });

  it("returns null when conversation not found", async () => {
    mockConversationFindUnique.mockResolvedValueOnce(null);

    const result = await getAccessibleConversation("nonexistent", USER_ID);

    expect(result).toBeNull();
  });

  it("includes participant IDs in the query", async () => {
    mockConversationFindUnique.mockResolvedValueOnce(makeConversation());

    await getAccessibleConversation(CONVERSATION_ID, USER_ID);

    const callArgs = mockConversationFindUnique.mock.calls[0][0];
    expect(callArgs.include.participants).toEqual({ select: { id: true } });
  });
});

describe("userCanAccessConversation", () => {
  it("returns true when user is participant, no deletions, not deleted", () => {
    const conversation = makeConversation();
    expect(userCanAccessConversation(conversation, USER_ID)).toBe(true);
  });

  it("returns false when conversation is null", () => {
    expect(userCanAccessConversation(null, USER_ID)).toBe(false);
  });

  it("returns false when conversation is soft-deleted (deletedAt set)", () => {
    const conversation = makeConversation({ deletedAt: new Date() });
    expect(userCanAccessConversation(conversation, USER_ID)).toBe(false);
  });

  it("returns false when user has deleted the conversation (deletions present)", () => {
    const conversation = makeConversation({
      deletions: [{ id: "deletion-1" }],
    });
    expect(userCanAccessConversation(conversation, USER_ID)).toBe(false);
  });

  it("returns false when user is not a participant", () => {
    const conversation = makeConversation({
      participants: [{ id: OTHER_USER_ID }], // user-123 not included
    });
    expect(userCanAccessConversation(conversation, USER_ID)).toBe(false);
  });

  it("acts as TypeScript type guard (narrows type)", () => {
    const conversation: AccessibleConversation | null = makeConversation();
    if (userCanAccessConversation(conversation, USER_ID)) {
      // If this compiles, the type guard works
      expect(conversation.id).toBe(CONVERSATION_ID);
      expect(conversation.participants).toBeDefined();
    } else {
      fail("Type guard should have returned true");
    }
  });
});

describe("listConversationMessages", () => {
  const mockMessages = [
    {
      id: "msg-1",
      conversationId: CONVERSATION_ID,
      content: "Hello",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      sender: { id: USER_ID, name: "Alice", image: null },
    },
    {
      id: "msg-2",
      conversationId: CONVERSATION_ID,
      content: "Hi there",
      createdAt: new Date("2026-01-01T00:01:00Z"),
      sender: { id: OTHER_USER_ID, name: "Bob", image: null },
    },
  ];

  it("returns all messages when no cursor provided", async () => {
    mockMessageFindMany.mockResolvedValueOnce(mockMessages);

    const result = await listConversationMessages(CONVERSATION_ID);

    expect(result).toEqual(mockMessages);
    const callArgs = mockMessageFindMany.mock.calls[0][0];
    expect(callArgs.where).toEqual({
      conversationId: CONVERSATION_ID,
      deletedAt: null,
    });
    expect(callArgs.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
  });

  it("returns messages after cursor when afterMessageId provided", async () => {
    const cursorMessage = {
      id: "msg-1",
      conversationId: CONVERSATION_ID,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    mockMessageFindUnique.mockResolvedValueOnce(cursorMessage);
    mockMessageFindMany.mockResolvedValueOnce([mockMessages[1]]);

    const result = await listConversationMessages(CONVERSATION_ID, {
      afterMessageId: "msg-1",
    });

    expect(result).toEqual([mockMessages[1]]);
    // Verify the OR clause for tie-breaking
    const callArgs = mockMessageFindMany.mock.calls[0][0];
    expect(callArgs.where.OR).toBeDefined();
    expect(callArgs.where.OR).toHaveLength(2);
  });

  it("returns empty array when cursor message not found", async () => {
    mockMessageFindUnique.mockResolvedValueOnce(null);

    const result = await listConversationMessages(CONVERSATION_ID, {
      afterMessageId: "nonexistent",
    });

    expect(result).toEqual([]);
    expect(mockMessageFindMany).not.toHaveBeenCalled();
  });

  it("returns empty array when cursor belongs to different conversation (abuse protection)", async () => {
    const cursorFromOtherConversation = {
      id: "msg-other",
      conversationId: "other-conv",
      createdAt: new Date(),
    };
    mockMessageFindUnique.mockResolvedValueOnce(cursorFromOtherConversation);

    const result = await listConversationMessages(CONVERSATION_ID, {
      afterMessageId: "msg-other",
    });

    expect(result).toEqual([]);
    expect(mockMessageFindMany).not.toHaveBeenCalled();
  });

  it("trims whitespace from afterMessageId", async () => {
    mockMessageFindUnique.mockResolvedValueOnce(null);

    await listConversationMessages(CONVERSATION_ID, {
      afterMessageId: "  msg-1  ",
    });

    expect(mockMessageFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "msg-1" },
      })
    );
  });

  it("uses tie-breaking: same createdAt ordered by id", async () => {
    const cursorMessage = {
      id: "msg-1",
      conversationId: CONVERSATION_ID,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    mockMessageFindUnique.mockResolvedValueOnce(cursorMessage);
    mockMessageFindMany.mockResolvedValueOnce([]);

    await listConversationMessages(CONVERSATION_ID, {
      afterMessageId: "msg-1",
    });

    const callArgs = mockMessageFindMany.mock.calls[0][0];
    const orClause = callArgs.where.OR;
    // First condition: createdAt > cursor.createdAt
    expect(orClause[0]).toEqual({
      createdAt: { gt: cursorMessage.createdAt },
    });
    // Second condition: same createdAt AND id > cursor.id
    expect(orClause[1]).toEqual({
      createdAt: cursorMessage.createdAt,
      id: { gt: "msg-1" },
    });
  });

  it("only returns non-deleted messages (deletedAt: null)", async () => {
    mockMessageFindMany.mockResolvedValueOnce([]);

    await listConversationMessages(CONVERSATION_ID);

    const callArgs = mockMessageFindMany.mock.calls[0][0];
    expect(callArgs.where.deletedAt).toBeNull();
  });
});

describe("markConversationMessagesAsReadForUser", () => {
  it("marks inbound unread messages as read", async () => {
    mockMessageUpdateMany.mockResolvedValueOnce({ count: 3 });

    const result = await markConversationMessagesAsReadForUser(
      CONVERSATION_ID,
      USER_ID
    );

    expect(result).toEqual({ count: 3 });
    expect(mockMessageUpdateMany).toHaveBeenCalledWith({
      where: {
        conversationId: CONVERSATION_ID,
        senderId: { not: USER_ID },
        read: false,
      },
      data: { read: true },
    });
  });

  it("does NOT mark own messages (senderId != userId filter)", async () => {
    mockMessageUpdateMany.mockResolvedValueOnce({ count: 0 });

    await markConversationMessagesAsReadForUser(CONVERSATION_ID, USER_ID);

    const callArgs = mockMessageUpdateMany.mock.calls[0][0];
    expect(callArgs.where.senderId).toEqual({ not: USER_ID });
  });

  it("only targets unread messages (read: false filter)", async () => {
    mockMessageUpdateMany.mockResolvedValueOnce({ count: 0 });

    await markConversationMessagesAsReadForUser(CONVERSATION_ID, USER_ID);

    const callArgs = mockMessageUpdateMany.mock.calls[0][0];
    expect(callArgs.where.read).toBe(false);
  });

  it("returns update count of zero when no unread messages", async () => {
    mockMessageUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await markConversationMessagesAsReadForUser(
      CONVERSATION_ID,
      USER_ID
    );

    expect(result.count).toBe(0);
  });
});
