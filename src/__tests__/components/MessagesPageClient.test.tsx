import type { ReactNode } from "react";
import "@testing-library/jest-dom";
import {
  render,
  screen,
  waitFor,
  act,
  cleanup,
  fireEvent,
} from "@testing-library/react";

const mockPush = jest.fn();
const mockSendMessage = jest.fn();
const mockSetTypingStatus = jest.fn();
const mockMarkAllMessagesAsRead = jest.fn();
const mockDeleteConversation = jest.fn();
const mockRouter = {
  push: mockPush,
};
const mockUseMediaQuery = jest.fn<boolean | undefined, [string]>();

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: (query: string) => mockUseMediaQuery(query),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock("@/app/actions/chat", () => ({
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  setTypingStatus: (...args: unknown[]) => mockSetTypingStatus(...args),
  markAllMessagesAsRead: (...args: unknown[]) =>
    mockMarkAllMessagesAsRead(...args),
  deleteConversation: (...args: unknown[]) => mockDeleteConversation(...args),
}));

jest.mock("@/app/actions/block", () => ({
  blockUser: jest.fn(),
  unblockUser: jest.fn(),
}));

jest.mock("@/hooks/useBlockStatus", () => ({
  useBlockStatus: () => ({
    blockStatus: "none",
    isBlocked: false,
    refetch: jest.fn(),
  }),
}));

jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({
    isOffline: false,
  }),
}));

jest.mock("@/components/UserAvatar", () => ({
  __esModule: true,
  default: ({ name }: { name?: string | null }) => (
    <div data-testid="user-avatar">{name ?? "avatar"}</div>
  ),
}));

jest.mock("@/components/chat/BlockedConversationBanner", () => ({
  __esModule: true,
  default: () => <div data-testid="blocked-banner">blocked</div>,
}));

jest.mock("@/components/CharacterCounter", () => ({
  __esModule: true,
  default: ({ current, max }: { current: number; max: number }) => (
    <div data-testid="character-counter">
      {current}/{max}
    </div>
  ),
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AlertDialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

import MessagesPageClient from "@/components/MessagesPageClient";

type MockMessage = {
  id: string;
  content: string;
  senderId: string;
  createdAt: string | Date;
  read?: boolean;
};

function createJsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function buildMessage(
  id: string,
  senderId: string,
  content: string
): MockMessage {
  return {
    id,
    senderId,
    content,
    createdAt: new Date(
      `2026-03-06T12:00:0${id.endsWith("2") ? "2" : "1"}Z`
    ).toISOString(),
    read: senderId === "user-123",
  };
}

describe("MessagesPageClient", () => {
  const fetchMock = jest.fn();
  const initialConversations = [
    {
      id: "conv-1",
      updatedAt: new Date("2026-03-06T11:59:00.000Z"),
      participants: [
        { id: "user-123", name: "Current User", image: null },
        { id: "other-user", name: "Other User", image: null },
      ],
      messages: [buildMessage("preview-1", "other-user", "Preview message")],
      listing: {
        title: "Test Listing",
      },
      unreadCount: 1,
    },
  ];

  beforeAll(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    mockUseMediaQuery.mockReturnValue(false);
    mockMarkAllMessagesAsRead.mockResolvedValue({ success: true, count: 0 });
    mockDeleteConversation.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("loads and polls messages through the safe GET endpoint and marks inbound messages as read", async () => {
    const firstInbound = buildMessage(
      "msg-1",
      "other-user",
      "Hello from inbox polling"
    );
    const secondInbound = buildMessage(
      "msg-2",
      "other-user",
      "Follow-up from inbox polling"
    );

    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/messages") {
        return createJsonResponse({ success: true, count: 1 });
      }
      if (url.includes("/api/messages?")) {
        if (url.includes("lastMessageId=msg-1")) {
          return createJsonResponse({
            messages: [secondInbound],
            typingUsers: [{ id: "other-user", name: "Other User" }],
            hasNewMessages: true,
          });
        }

        return createJsonResponse({
          messages: [firstInbound],
          typingUsers: [],
          hasNewMessages: true,
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <MessagesPageClient
        currentUserId="user-123"
        initialConversations={initialConversations}
      />
    );

    expect(
      (await screen.findAllByText("Hello from inbox polling")).length
    ).toBeGreaterThan(0);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/messages",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "markRead",
            conversationId: "conv-1",
          }),
        })
      );
    });

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(
      (await screen.findAllByText("Follow-up from inbox polling")).length
    ).toBeGreaterThan(0);
    expect(screen.getByTestId("typing-indicator")).toHaveTextContent(
      "Other User is typing..."
    );

    const pollingUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) =>
        url.includes("/api/messages?conversationId=conv-1&poll=1")
      );

    expect(pollingUrls.length).toBeGreaterThan(1);
    expect(pollingUrls.some((url) => url.includes("lastMessageId=msg-1"))).toBe(
      true
    );
  });

  it("aborts in-flight polling on unmount without logging a polling error", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/api/messages?")) {
        return new Promise((_, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error("Missing abort signal"));
            return;
          }

          signal.addEventListener(
            "abort",
            () => {
              reject(
                Object.assign(new Error("Request aborted"), {
                  name: "AbortError",
                })
              );
            },
            { once: true }
          );
        });
      }

      return createJsonResponse({ success: true, count: 0 });
    });

    const { unmount } = render(
      <MessagesPageClient
        currentUserId="user-123"
        initialConversations={initialConversations}
      />
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/messages?conversationId=conv-1&poll=1"),
        expect.objectContaining({ method: "GET" })
      );
    });

    unmount();

    await act(async () => {
      await Promise.resolve();
    });

    const loggedPollingError = errorSpy.mock.calls.some(
      ([message]) => message === "Polling error:"
    );

    expect(loggedPollingError).toBe(false);
    errorSpy.mockRestore();
  });

  it("keeps the inbox list visible first on mobile and routes taps to the thread page", async () => {
    mockUseMediaQuery.mockReturnValue(true);

    render(
      <MessagesPageClient
        currentUserId="user-123"
        initialConversations={initialConversations}
      />
    );

    expect(screen.queryByTestId("message-input")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/messages?conversationId=conv-1&poll=1"),
      expect.anything()
    );

    fireEvent.click(screen.getByTestId("conversation-item"));

    expect(mockPush).toHaveBeenCalledWith("/messages/conv-1");
  });
});
