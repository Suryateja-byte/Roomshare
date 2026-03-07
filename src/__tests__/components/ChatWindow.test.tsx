import type { ReactNode } from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';

const mockPush = jest.fn();
const mockSendMessage = jest.fn();
const mockCreateChatChannel = jest.fn();
const mockSafeRemoveChannel = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock('use-debounce', () => ({
  useDebouncedCallback: (callback: (...args: unknown[]) => void) => callback,
}));

jest.mock('@/app/actions/chat', () => ({
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}));

jest.mock('@/app/actions/block', () => ({
  blockUser: jest.fn(),
  unblockUser: jest.fn(),
}));

jest.mock('@/hooks/useBlockStatus', () => ({
  useBlockStatus: () => ({
    blockStatus: 'none',
    isBlocked: false,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/hooks/useRateLimitHandler', () => ({
  useRateLimitHandler: () => ({
    isRateLimited: false,
    retryAfter: 0,
    handleError: jest.fn(() => false),
    reset: jest.fn(),
  }),
}));

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({
    isOffline: false,
  }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: null,
  createChatChannel: (...args: unknown[]) => mockCreateChatChannel(...args),
  broadcastTyping: jest.fn(),
  trackPresence: jest.fn(),
  safeRemoveChannel: (...args: unknown[]) => mockSafeRemoveChannel(...args),
}));

jest.mock('@/components/UserAvatar', () => ({
  __esModule: true,
  default: ({ name }: { name?: string | null }) => (
    <div data-testid="user-avatar">{name ?? 'avatar'}</div>
  ),
}));

jest.mock('@/components/chat/BlockedConversationBanner', () => ({
  __esModule: true,
  default: () => <div data-testid="blocked-banner">blocked</div>,
}));

jest.mock('@/components/CharacterCounter', () => ({
  __esModule: true,
  default: ({ current, max }: { current: number; max: number }) => (
    <div data-testid="character-counter">
      {current}/{max}
    </div>
  ),
}));

jest.mock('@/components/RateLimitCountdown', () => ({
  __esModule: true,
  default: () => <div data-testid="rate-limit-countdown">rate limit</div>,
}));

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/ui/alert-dialog', () => ({
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
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import ChatWindow from '@/app/messages/[id]/ChatWindow';

type MockMessage = {
  id: string;
  content: string;
  senderId: string;
  createdAt: string | Date;
  sender?: {
    name: string | null;
    image: string | null;
  };
};

function createJsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function buildMessage(id: string, senderId: string, content: string): MockMessage {
  return {
    id,
    senderId,
    content,
    createdAt: new Date(`2026-03-06T12:00:0${id.endsWith('2') ? '2' : '1'}Z`).toISOString(),
    sender: {
      name: senderId === 'other-user' ? 'Other User' : 'Current User',
      image: null,
    },
  };
}

describe('Route ChatWindow', () => {
  const fetchMock = jest.fn();

  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('shows polling mode when realtime is unavailable and never shows connecting', async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/messages?')) {
        return createJsonResponse({ messages: [], hasNewMessages: false });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(
      <ChatWindow
        initialMessages={[]}
        conversationId="conv-123"
        currentUserId="user-123"
        currentUserName="Current User"
        otherUserId="other-user"
        otherUserName="Other User"
        otherUserImage={null}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/messages?conversationId=conv-123&poll=1'),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    expect(screen.getByTestId('connection-status')).toHaveTextContent('Polling for updates');
    expect(screen.queryByText('Connecting...')).not.toBeInTheDocument();
    expect(mockCreateChatChannel).not.toHaveBeenCalled();
  });

  it('polls with lastMessageId, merges incremental messages, and marks inbound messages as read', async () => {
    const firstInbound = buildMessage('msg-1', 'other-user', 'Hello from polling');
    const secondInbound = buildMessage('msg-2', 'other-user', 'Second poll result');

    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url === '/api/messages') {
        return createJsonResponse({ success: true, count: 1 });
      }
      if (url.includes('/api/messages?')) {
        if (url.includes('lastMessageId=msg-1')) {
          return createJsonResponse({ messages: [secondInbound], hasNewMessages: true });
        }
        return createJsonResponse({ messages: [firstInbound], hasNewMessages: true });
      }
      throw new Error(`Unexpected fetch: ${url} ${String(init?.method ?? '')}`);
    });

    render(
      <ChatWindow
        initialMessages={[]}
        conversationId="conv-123"
        currentUserId="user-123"
        currentUserName="Current User"
        otherUserId="other-user"
        otherUserName="Other User"
        otherUserImage={null}
      />,
    );

    expect(await screen.findByText('Hello from polling')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/messages',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            action: 'markRead',
            conversationId: 'conv-123',
          }),
        }),
      );
    });

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(await screen.findByText('Second poll result')).toBeInTheDocument();

    const pollUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes('/api/messages?conversationId=conv-123&poll=1'));

    expect(pollUrls[0]).toContain('conversationId=conv-123');
    expect(pollUrls.some((url) => url.includes('lastMessageId=msg-1'))).toBe(true);
    expect(screen.getAllByTestId('message-bubble')).toHaveLength(2);
  });

  it('aborts in-flight polling on unmount without logging a polling error', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/api/messages?')) {
        return new Promise((_, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error('Missing abort signal'));
            return;
          }

          signal.addEventListener(
            'abort',
            () => {
              reject(Object.assign(new Error('Request aborted'), { name: 'AbortError' }));
            },
            { once: true },
          );
        });
      }
      return createJsonResponse({ success: true, count: 0 });
    });

    const { unmount } = render(
      <ChatWindow
        initialMessages={[]}
        conversationId="conv-123"
        currentUserId="user-123"
        currentUserName="Current User"
        otherUserId="other-user"
        otherUserName="Other User"
        otherUserImage={null}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/messages?conversationId=conv-123&poll=1'),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    unmount();

    await act(async () => {
      await Promise.resolve();
    });

    const loggedPollingError = errorSpy.mock.calls.some(
      ([message]) => message === 'Polling error:',
    );

    expect(loggedPollingError).toBe(false);
    errorSpy.mockRestore();
  });
});
