import { test, expect, selectors, timeouts, tags, A11Y_CONFIG } from '../helpers';
import { Page, Browser, BrowserContext, Response } from '@playwright/test';

// --- Constants ---
export const MSG_SELECTORS = {
  page: '[data-testid="messages-page"]',
  conversationItem: '[data-testid="conversation-item"]',
  chatWindow: '[data-testid="chat-window"]',
  chatHeader: '[data-testid="chat-header"]',
  messagesContainer: '[data-testid="messages-container"]',
  messageBubble: '[data-testid="message-bubble"]',
  messageInput: '[data-testid="message-input"]',
  sendButton: '[data-testid="send-button"]',
  typingIndicator: '[data-testid="typing-indicator"]',
  connectionStatus: '[data-testid="connection-status"]',
  onlineStatus: '[data-testid="online-status"]',
  failedMessage: '[data-testid="failed-message"]',
  retryButton: '[data-testid="retry-button"]',
  charCounter: '[data-testid="char-counter"]',
  unreadBadge: '[data-testid="unread-badge"]',
} as const;

export const POLL_INTERVAL = {
  messagesPage: 3000,   // MessagesPageClient polling
  chatWindow: 5000,     // ChatWindow polling fallback
  unread: 30000,        // NavbarClient unread polling
} as const;

export const CHAR_LIMITS = {
  messagesPage: 1000,
  chatWindow: 500,
  apiMax: 2000,
} as const;

// --- Navigation ---

/** Navigate to /messages and wait for page ready */
export async function goToMessages(page: Page): Promise<boolean> {
  await page.goto('/messages');
  await page.waitForLoadState('domcontentloaded');
  const url = page.url();
  if (url.includes('/login') || url.includes('/auth')) return false;
  const messagesPage = page.locator(MSG_SELECTORS.page);
  await expect(messagesPage).toBeVisible({ timeout: 15_000 }).catch(() => {});
  return messagesPage.isVisible();
}

/** Open a specific conversation by clicking the nth item */
export async function openConversation(page: Page, index = 0): Promise<void> {
  const items = page.locator(MSG_SELECTORS.conversationItem);
  await expect(items.first()).toBeVisible({ timeout: 10_000 });
  await items.nth(index).click();
  await expect(page.locator(MSG_SELECTORS.messageInput)).toBeVisible({ timeout: 10_000 });
}

/** Navigate directly to a conversation by ID */
export async function goToConversation(page: Page, conversationId: string): Promise<boolean> {
  await page.goto(`/messages/${conversationId}`);
  await page.waitForLoadState('domcontentloaded');
  const url = page.url();
  if (url.includes('/login') || url.includes('/auth')) return false;
  const input = page.locator(MSG_SELECTORS.messageInput);
  return input.isVisible({ timeout: 10_000 }).catch(() => false);
}

// --- Messaging Actions ---

/** Type and send a message */
export async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.locator(MSG_SELECTORS.messageInput);
  await input.fill(text);
  const sendBtn = page.locator(MSG_SELECTORS.sendButton);
  await sendBtn.click();
}

/** Wait for a new message bubble containing the given text */
export async function waitForNewMessage(
  page: Page,
  text: string,
  timeout = 15_000,
): Promise<void> {
  const bubble = page.locator(MSG_SELECTORS.messageBubble).filter({ hasText: text });
  await expect(bubble.first()).toBeVisible({ timeout });
}

/** Get count of visible message bubbles */
export async function getMessageCount(page: Page): Promise<number> {
  return page.locator(MSG_SELECTORS.messageBubble).count();
}

/** Get unread badge count from navbar */
export async function getUnreadBadgeCount(page: Page): Promise<number | null> {
  const badge = page.locator(MSG_SELECTORS.unreadBadge);
  if (!(await badge.isVisible().catch(() => false))) return null;
  const text = await badge.textContent();
  return text ? parseInt(text, 10) : null;
}

// --- Multi-User Context ---

/** Create a second browser context with user2 auth */
export async function createUser2Context(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
}> {
  const context = await browser.newContext({
    storageState: 'playwright/.auth/user2.json',
  });
  const page = await context.newPage();
  return { context, page };
}

// --- Network Interception ---

/** Intercept /api/messages POST requests */
export async function interceptMessageSend(page: Page): Promise<{
  waitForSend: () => Promise<Response>;
}> {
  const responsePromise = page.waitForResponse(
    (resp) => resp.url().includes('/api/messages') && resp.request().method() === 'POST',
    { timeout: 15_000 },
  );
  return { waitForSend: () => responsePromise };
}

/** Mock message API to return an error for POST requests */
export async function mockMessageApiError(
  page: Page,
  status: number,
  body?: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/messages**', (route) => {
    if (route.request().method() === 'POST') {
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body ?? { error: `Mock ${status} error` }),
      });
    } else {
      route.continue();
    }
  });
}

/** Mock server action sendMessage to return an error */
export async function mockSendMessageError(
  page: Page,
  errorResponse: { error: string; code?: string },
): Promise<void> {
  // Server actions go through Next.js internal POST — intercept the actions endpoint
  await page.route('**/messages**', (route) => {
    const request = route.request();
    // Server actions use POST with Next-Action header
    if (request.method() === 'POST' && request.headers()['next-action']) {
      route.fulfill({
        status: 200,
        contentType: 'text/x-component',
        body: JSON.stringify(errorResponse),
      });
    } else {
      route.continue();
    }
  });
}

// Re-export for convenience
export { test, expect, tags, timeouts, selectors, A11Y_CONFIG };
