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
  try {
    await page.goto('/messages', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch {
    return false;
  }
  const url = page.url();
  if (url.includes('/login') || url.includes('/auth')) return false;
  const messagesPage = page.locator(MSG_SELECTORS.page);
  try {
    await expect(messagesPage).toBeVisible({ timeout: 15_000 });
  } catch {
    return false;
  }
  return true;
}

/** Open a specific conversation by clicking the nth item */
export async function openConversation(page: Page, index = 0): Promise<void> {
  const viewport = page.viewportSize();
  const isMobile = !!viewport && viewport.width < 768;

  // On mobile, sidebar may be hidden if a conversation is auto-selected
  if (isMobile) {
    const sidebar = page.locator(MSG_SELECTORS.conversationItem).first();
    const sidebarVisible = await sidebar.isVisible().catch(() => false);
    if (!sidebarVisible) {
      const backBtn = page.locator('[data-testid="back-button"], button[aria-label="Back"], nav button').first();
      const backVisible = await backBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      if (backVisible) await backBtn.click();
    }
  }

  const items = page.locator(MSG_SELECTORS.conversationItem);
  await expect(items.first()).toBeVisible({ timeout: 15_000 });

  // Ensure the target item is visible before clicking
  await items.nth(index).waitFor({ state: 'visible', timeout: 10_000 });
  await items.nth(index).click();
  // Defense-in-depth: detect if we opened a blocked conversation (no data-testid on banner)
  const messageInput = page.locator(MSG_SELECTORS.messageInput);
  const blockedBanner = page.getByText(/you have blocked|you can no longer send messages/i);
  await expect(messageInput.or(blockedBanner)).toBeVisible({ timeout: 10_000 });
  if (await blockedBanner.isVisible()) {
    throw new Error(`Opened a blocked conversation at index ${index}. Seed data ordering may be wrong.`);
  }
  // Allow useBlockStatus() async resolution to settle — if it swaps input for banner, catch it
  await page.waitForTimeout(500);
  if (await blockedBanner.isVisible()) {
    throw new Error(`Blocked conversation banner appeared after delay at index ${index}. The blocked-user seed may conflict with this conversation.`);
  }
}

/** Navigate directly to a conversation by ID */
export async function goToConversation(page: Page, conversationId: string): Promise<boolean> {
  try {
    await page.goto(`/messages/${conversationId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch {
    return false;
  }
  const url = page.url();
  if (url.includes('/login') || url.includes('/auth')) return false;
  const input = page.locator(MSG_SELECTORS.messageInput);
  return input.isVisible({ timeout: 10_000 }).catch(() => false);
}

// --- Messaging Actions ---

/** Type and send a message.
 *  Uses pressSequentially to reliably trigger React's onChange on controlled inputs.
 *  fill() alone can fail to update React state because it sets the DOM value
 *  without dispatching the synthetic events React listens for. */
export async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.locator(MSG_SELECTORS.messageInput);
  // Ensure input is visible and enabled before interacting
  await expect(input).toBeVisible({ timeout: 15_000 });
  await expect(input).toBeEnabled({ timeout: 5_000 });
  await input.click();
  await input.fill('');
  await input.pressSequentially(text, { delay: 30 });
  await expect(input).toHaveValue(text, { timeout: 15_000 });
  const sendBtn = page.locator(MSG_SELECTORS.sendButton);
  await expect(sendBtn).toBeVisible({ timeout: 15_000 });
  await expect(sendBtn).toBeEnabled({ timeout: 15_000 });
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

/**
 * Encode a value as an RSC Flight response (matches Next.js 14/15 format).
 * Row 0 references the result in row 1 via `$@1`.
 */
function encodeAsRSCResponse(value: unknown): string {
  const row0 = JSON.stringify({ a: "$@1", f: "", b: "development" });
  const row1 = JSON.stringify(value);
  return `0:${row0}\n1:${row1}\n`;
}

/** Mock server action sendMessage to return an error (one-shot) */
export async function mockSendMessageError(
  page: Page,
  errorResponse: { error: string; code?: string },
): Promise<void> {
  let intercepted = false;
  // Server actions go through Next.js internal POST — intercept the actions endpoint
  await page.route('**/messages**', (route) => {
    const request = route.request();
    // Server actions use POST with Next-Action header (one-shot: only first POST)
    if (!intercepted && request.method() === 'POST' && request.headers()['next-action']) {
      intercepted = true;
      route.fulfill({
        status: 200,
        contentType: 'text/x-component',
        body: encodeAsRSCResponse(errorResponse),
      });
    } else {
      route.continue();
    }
  });
}

// Re-export for convenience
export { test, expect, tags, timeouts, selectors, A11Y_CONFIG };
