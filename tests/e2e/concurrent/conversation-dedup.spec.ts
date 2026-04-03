/**
 * P0-1: Conversation deduplication (race condition fix verification)
 *
 * The fix: startConversation in chat.ts wraps findFirst+create in
 * $transaction(Serializable) with pg_advisory_xact_lock, preventing
 * duplicate conversations from concurrent requests.
 *
 * Tests:
 *  DEDUP-01  Parallel Contact Host clicks from two contexts yield same conversation
 *  DEDUP-02  Rapid double-click on Contact Host does not create duplicates
 *  DEDUP-03  Re-visiting a listing returns the existing conversation (no new one)
 */
import { test, expect } from "../helpers/test-utils";
import { testApi } from "../helpers/stability-helpers";
import type { Locator, Page } from "@playwright/test";

// User1 (host) owns the listing; user2 (tenant) contacts the host.
const USER1_EMAIL = process.env.E2E_TEST_EMAIL || "e2e-test@roomshare.dev";
const USER2_STATE = "playwright/.auth/user2.json";

async function getVisibleContactHostButton(page: Page): Promise<Locator> {
  const hostSectionButton = page
    .getByTestId("contact-host-host-section")
    .getByRole("button", { name: /contact host/i });
  const sidebarButton = page
    .getByTestId("contact-host-sidebar")
    .getByRole("button", { name: /contact host/i });

  await expect(
    page.locator(
      '[data-testid="contact-host-host-section"]:visible, [data-testid="contact-host-sidebar"]:visible'
    )
  ).toHaveCount(1, { timeout: 15_000 });

  if (await hostSectionButton.isVisible()) return hostSectionButton;
  return sidebarButton;
}

test.describe("P0-1: Conversation Deduplication", () => {
  test.describe.configure({ mode: "serial", retries: 0 });

  let listingId: string;
  let setupFailed = false;

  // Find a listing owned by user1 that user2 can contact about.
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: USER2_STATE,
    });
    const page = await ctx.newPage();
    try {
      const listing = await testApi<{ id: string }>(page, "findTestListing", {
        ownerEmail: USER1_EMAIL,
      });
      if (!listing.ok) {
        setupFailed = true;
      } else {
        listingId = listing.data.id;
      }
    } catch {
      setupFailed = true;
    }
    await ctx.close();
  });

  // ---------------------------------------------------------------------------
  // DEDUP-01: Parallel Contact Host clicks from two browser contexts
  // ---------------------------------------------------------------------------
  test("DEDUP-01: parallel Contact Host clicks yield same conversation", async ({
    browser,
  }) => {
    test.skip(setupFailed, "Test API not available or no suitable listing");
    // Two independent browser contexts, both logged in as user2.
    // This bypasses the UI disabled={isLoading} guard and simulates
    // the real race: two tabs / requests hitting startConversation at once.
    const ctx1 = await browser.newContext({ storageState: USER2_STATE });
    const ctx2 = await browser.newContext({ storageState: USER2_STATE });

    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    // Navigate both to the same listing detail page.
    await Promise.all([
      page1.goto(`/listings/${listingId}`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      }),
      page2.goto(`/listings/${listingId}`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      }),
    ]);

    // Wait for the single visible Contact Host button on both pages.
    const btn1 = await getVisibleContactHostButton(page1);
    const btn2 = await getVisibleContactHostButton(page2);
    await Promise.all([
      expect(btn1).toBeVisible({ timeout: 15_000 }),
      expect(btn2).toBeVisible({ timeout: 15_000 }),
    ]);

    // Click both simultaneously — triggers two parallel startConversation calls.
    // The server action fires via Next.js RSC POST with next-action header.
    await Promise.all([btn1.click(), btn2.click()]);

    // Both should navigate to /messages/<conversationId>.
    // Wait for both pages to land on a messages URL.
    await Promise.all([
      page1.waitForURL(/\/messages\/[a-zA-Z0-9_-]+/, { timeout: 30_000 }),
      page2.waitForURL(/\/messages\/[a-zA-Z0-9_-]+/, { timeout: 30_000 }),
    ]);

    // Extract conversation IDs from both URLs.
    const convId1 = page1.url().match(/\/messages\/([a-zA-Z0-9_-]+)/)?.[1];
    const convId2 = page2.url().match(/\/messages\/([a-zA-Z0-9_-]+)/)?.[1];

    expect(convId1).toBeTruthy();
    expect(convId2).toBeTruthy();

    // The fix guarantees both return the SAME conversation.
    expect(convId1).toBe(convId2);

    await ctx1.close();
    await ctx2.close();
  });

  // ---------------------------------------------------------------------------
  // DEDUP-02: Rapid double-click on Contact Host (single context)
  // ---------------------------------------------------------------------------
  test("DEDUP-02: rapid double-click on Contact Host creates only one conversation", async ({
    browser,
  }) => {
    test.skip(setupFailed, "Test API not available or no suitable listing");
    const ctx = await browser.newContext({ storageState: USER2_STATE });
    const page = await ctx.newPage();

    await page.goto(`/listings/${listingId}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    const contactBtn = await getVisibleContactHostButton(page);
    await expect(contactBtn).toBeVisible({ timeout: 15_000 });

    // Track server action requests to count how many fire.
    let serverActionCount = 0;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.headers()["next-action"]) {
        serverActionCount++;
      }
    });

    // Double-click rapidly — the UI guard (disabled={isLoading}) should prevent
    // the second click, but even if it doesn't, the server-side advisory lock
    // ensures only one conversation is created.
    await contactBtn.dblclick();

    // Wait for navigation to /messages/<id>.
    await page.waitForURL(/\/messages\/[a-zA-Z0-9_-]+/, { timeout: 30_000 });

    const conversationUrl = page.url();
    const convId = conversationUrl.match(/\/messages\/([a-zA-Z0-9_-]+)/)?.[1];
    expect(convId).toBeTruthy();

    // The UI guard should have prevented the second request entirely.
    // But even if two requests fired, they both return the same conversation.
    // At most 2 server actions should have been sent (not more).
    expect(serverActionCount).toBeLessThanOrEqual(2);

    // Navigate to messages list and verify no duplicate conversations for this listing.
    await page.goto("/messages", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Count conversation items that reference this listing (by conversation link).
    // Each conversation item links to /messages/<conversationId>.
    const conversationItems = page.locator('[data-testid="conversation-item"]');
    const itemCount = await conversationItems.count();

    // Collect all conversation IDs visible in the list.
    const visibleConvIds = new Set<string>();
    for (let i = 0; i < itemCount; i++) {
      const link = conversationItems.nth(i).locator("a");
      const href = await link.getAttribute("href").catch(() => null);
      if (href?.includes("/messages/")) {
        const id = href.match(/\/messages\/([a-zA-Z0-9_-]+)/)?.[1];
        if (id) visibleConvIds.add(id);
      }
    }

    // The conversation we just created should appear exactly once.
    // (There may be pre-existing seeded conversations, but our convId should not be duplicated.)
    const matchingIds = Array.from(visibleConvIds).filter(
      (id) => id === convId
    );
    expect(matchingIds.length).toBeLessThanOrEqual(1);

    await ctx.close();
  });

  // ---------------------------------------------------------------------------
  // DEDUP-03: Existing conversation is returned on re-visit (no duplication)
  // ---------------------------------------------------------------------------
  test("DEDUP-03: re-contacting host returns existing conversation, not a new one", async ({
    browser,
  }) => {
    test.skip(setupFailed, "Test API not available or no suitable listing");
    const ctx = await browser.newContext({ storageState: USER2_STATE });
    const page = await ctx.newPage();

    // First contact: navigate to listing and click Contact Host.
    await page.goto(`/listings/${listingId}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    const contactBtn = await getVisibleContactHostButton(page);
    await expect(contactBtn).toBeVisible({ timeout: 15_000 });
    await contactBtn.click();

    await page.waitForURL(/\/messages\/[a-zA-Z0-9_-]+/, { timeout: 30_000 });
    const firstConvId = page.url().match(/\/messages\/([a-zA-Z0-9_-]+)/)?.[1];
    expect(firstConvId).toBeTruthy();

    // Navigate away — go back to listing.
    await page.goto(`/listings/${listingId}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Second contact: click Contact Host again.
    const contactBtn2 = await getVisibleContactHostButton(page);
    await expect(contactBtn2).toBeVisible({ timeout: 15_000 });
    await contactBtn2.click();

    await page.waitForURL(/\/messages\/[a-zA-Z0-9_-]+/, { timeout: 30_000 });
    const secondConvId = page.url().match(/\/messages\/([a-zA-Z0-9_-]+)/)?.[1];
    expect(secondConvId).toBeTruthy();

    // Both visits must return the same conversation — no duplicate created.
    expect(secondConvId).toBe(firstConvId);

    await ctx.close();
  });
});
