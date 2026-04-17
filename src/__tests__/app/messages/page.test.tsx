import React from "react";
import { render } from "@testing-library/react";
import ChatPage from "@/app/messages/[id]/page";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { listConversationMessages } from "@/lib/messages";

const mockChatWindow = jest.fn((props: Record<string, unknown>) => (
  <div data-testid="chat-window" data-props={JSON.stringify(props)} />
));

jest.mock("@/app/messages/[id]/ChatWindow", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => mockChatWindow(props),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: { findUnique: jest.fn() },
    booking: { findFirst: jest.fn() },
    report: { findFirst: jest.fn() },
    message: { findFirst: jest.fn() },
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/messages", () => ({
  listConversationMessages: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  features: {
    privateFeedback: true,
  },
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

describe("messages/[id]/page private feedback eligibility", () => {
  const session = {
    user: {
      id: "user-123",
      name: "Reporter",
      email: "reporter@example.com",
      emailVerified: new Date("2026-04-01T12:00:00.000Z"),
    },
  };

  const conversation = {
    id: "conversation-1",
    listing: {
      id: "listing-123",
      ownerId: "owner-456",
      title: "Sunny room",
    },
    participants: [
      { id: "user-123", name: "Reporter", image: null },
      { id: "owner-456", name: "Host", image: null },
    ],
    deletions: [],
    deletedAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(session);
    (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(
      conversation
    );
    (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.report.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.message.findFirst as jest.Mock).mockResolvedValue(null);
    (listConversationMessages as jest.Mock).mockResolvedValue([]);
  });

  it("passes hasPriorConversation=false when the reporter has not sent a message", async () => {
    render(
      await ChatPage({
        params: Promise.resolve({ id: "conversation-1" }),
      })
    );

    expect(prisma.message.findFirst).toHaveBeenCalledWith({
      where: {
        conversationId: "conversation-1",
        senderId: "user-123",
      },
      select: { id: true },
    });
    expect(mockChatWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        canLeavePrivateFeedback: false,
      })
    );
  });

  it("passes hasPriorConversation=true when the reporter has sent a message", async () => {
    (prisma.message.findFirst as jest.Mock).mockResolvedValue({
      id: "message-1",
    });

    render(
      await ChatPage({
        params: Promise.resolve({ id: "conversation-1" }),
      })
    );

    expect(mockChatWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        canLeavePrivateFeedback: true,
      })
    );
  });
});
