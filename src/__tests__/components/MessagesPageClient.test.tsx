import type { AnchorHTMLAttributes, ReactNode } from "react";
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
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
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
import { toast } from "sonner";

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

function mockDesktopMatchMedia(matchesDesktop: boolean) {
  return jest.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches:
          query === "(min-width: 768px)" ? matchesDesktop : !matchesDesktop,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }) as MediaQueryList
  );
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
    window.history.replaceState(null, "", "/messages");
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

  it("keeps the inbox list visible first on mobile and exposes a native thread link", async () => {
    mockUseMediaQuery.mockReturnValue(true);
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/messages?")) {
        return createJsonResponse({
          messages: [],
          typingUsers: [],
          hasNewMessages: false,
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

    expect(screen.queryByTestId("message-input")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/messages?conversationId=conv-1&poll=1"),
      expect.anything()
    );

    const conversationLink = screen.getByTestId("conversation-item");

    expect(conversationLink).toBe(
      screen.getByRole("link", { name: /Other User/i })
    );
    expect(conversationLink).toHaveAttribute("href", "/messages/conv-1");
    expect(fireEvent.click(conversationLink)).toBe(false);
    expect(window.location.pathname).toBe("/messages/conv-1");
    await waitFor(() => {
      expect(screen.getByTestId("message-input")).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalledWith("/messages/conv-1");
  });

  it("opens the mobile thread while the mobile media hook is unresolved", async () => {
    mockUseMediaQuery.mockReturnValue(undefined);
    const matchMediaSpy = mockDesktopMatchMedia(false);
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/messages?")) {
        return createJsonResponse({
          messages: [],
          typingUsers: [],
          hasNewMessages: false,
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    try {
      render(
        <MessagesPageClient
          currentUserId="user-123"
          initialConversations={initialConversations}
        />
      );

      const conversationLink = screen.getByTestId("conversation-item");

      expect(conversationLink).toHaveAttribute("href", "/messages/conv-1");
      expect(fireEvent.click(conversationLink)).toBe(false);
      expect(window.location.pathname).toBe("/messages/conv-1");
      await waitFor(() => {
        expect(screen.getByTestId("message-input")).toBeInTheDocument();
      });
      expect(mockPush).not.toHaveBeenCalledWith("/messages/conv-1");
    } finally {
      matchMediaSpy.mockRestore();
    }
  });

  it("keeps desktop conversation selection in-page instead of following the thread link", async () => {
    mockUseMediaQuery.mockReturnValue(false);
    const matchMediaSpy = mockDesktopMatchMedia(true);
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/messages") {
        return createJsonResponse({ success: true, count: 0 });
      }
      if (url.includes("/api/messages?")) {
        return createJsonResponse({
          messages: [],
          typingUsers: [],
          hasNewMessages: false,
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    try {
      render(
        <MessagesPageClient
          currentUserId="user-123"
          initialConversations={initialConversations}
        />
      );

      const conversationLink = screen.getByTestId("conversation-item");

      expect(conversationLink).toBe(
        screen.getByRole("link", { name: /Other User/i })
      );
      expect(conversationLink).toHaveAttribute("href", "/messages/conv-1");
      expect(fireEvent.click(conversationLink)).toBe(false);
      await waitFor(() => {
        expect(screen.getByTestId("message-input")).toBeInTheDocument();
      });
      expect(mockPush).not.toHaveBeenCalledWith("/messages/conv-1");
    } finally {
      matchMediaSpy.mockRestore();
    }
  });

  it("uses the shared 1000-character inbox composer cap", async () => {
    mockUseMediaQuery.mockReturnValue(false);
    const matchMediaSpy = mockDesktopMatchMedia(true);
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/messages") {
        return createJsonResponse({ success: true, count: 0 });
      }
      if (url.includes("/api/messages?")) {
        return createJsonResponse({
          messages: [],
          typingUsers: [],
          hasNewMessages: false,
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    try {
      render(
        <MessagesPageClient
          currentUserId="user-123"
          initialConversations={initialConversations}
        />
      );

      fireEvent.click(screen.getByTestId("conversation-item"));
      const input = await screen.findByTestId("message-input");

      expect(input).toHaveAttribute("maxlength", "1000");

      fireEvent.change(input, { target: { value: "x".repeat(1000) } });

      expect(screen.getByTestId("character-counter")).toHaveTextContent(
        "1000/1000"
      );
    } finally {
      matchMediaSpy.mockRestore();
    }
  });

  it("sends a 1000-character inbox message", async () => {
    mockUseMediaQuery.mockReturnValue(false);
    const matchMediaSpy = mockDesktopMatchMedia(true);
    const content = "x".repeat(1000);
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/messages") {
        return createJsonResponse({ success: true, count: 0 });
      }
      if (url.includes("/api/messages?")) {
        return createJsonResponse({
          messages: [],
          typingUsers: [],
          hasNewMessages: false,
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    mockSendMessage.mockResolvedValue({
      id: "msg-sent",
      content,
      senderId: "user-123",
      conversationId: "conv-1",
      createdAt: new Date(),
      read: false,
    });

    try {
      render(
        <MessagesPageClient
          currentUserId="user-123"
          initialConversations={initialConversations}
        />
      );

      fireEvent.click(screen.getByTestId("conversation-item"));
      fireEvent.change(await screen.findByTestId("message-input"), {
        target: { value: content },
      });
      fireEvent.click(screen.getByTestId("send-button"));

      expect(mockSendMessage).toHaveBeenCalledWith("conv-1", content);
    } finally {
      matchMediaSpy.mockRestore();
    }
  });

  it("rejects a 1001-character inbox message before send", async () => {
    mockUseMediaQuery.mockReturnValue(false);
    const matchMediaSpy = mockDesktopMatchMedia(true);
    const content = "x".repeat(1001);
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/messages") {
        return createJsonResponse({ success: true, count: 0 });
      }
      if (url.includes("/api/messages?")) {
        return createJsonResponse({
          messages: [],
          typingUsers: [],
          hasNewMessages: false,
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    try {
      render(
        <MessagesPageClient
          currentUserId="user-123"
          initialConversations={initialConversations}
        />
      );

      fireEvent.click(screen.getByTestId("conversation-item"));
      fireEvent.change(await screen.findByTestId("message-input"), {
        target: { value: content },
      });
      fireEvent.click(screen.getByTestId("send-button"));

      expect(mockSendMessage).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith("Message too long", {
        description: "Maximum 1000 characters allowed.",
      });
    } finally {
      matchMediaSpy.mockRestore();
    }
  });
});
