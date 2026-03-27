/**
 * P0-1: Conversation creation race condition
 *
 * Bug: chat.ts:77-103 — findFirst then create with NO transaction,
 * NO unique constraint on Conversation for [listingId, participants].
 * Two concurrent requests can create duplicate conversations, causing
 * permanent message splitting with no recovery path.
 *
 * This file documents the bug as test.fail() stubs. Once the fix lands
 * (wrap in $transaction(Serializable) + advisory lock, OR add partial
 * unique index), flip to test() and verify they pass.
 */
import { test, expect } from "../helpers/test-utils";
import { testApi } from "../helpers/stability-helpers";

test.describe("P0-1: Conversation creation race condition", () => {
  test.describe.configure({ mode: "serial", retries: 0 });

  test.fail(
    "parallel startConversation calls should not create duplicates",
    async ({ browser, page }) => {
      // Setup: find a listing
      const listing = await testApi(page, "findTestListing", {});
      expect(listing.ok).toBe(true);
      const listingId = listing.data.id;

      // Create two separate authenticated contexts
      const ctx1 = await browser.newContext({
        storageState: "playwright/.auth/user2.json",
      });
      const ctx2 = await browser.newContext({
        storageState: "playwright/.auth/user2.json",
      });

      const page1 = await ctx1.newPage();
      const page2 = await ctx2.newPage();

      // Fire two parallel startConversation requests via server action
      // Using direct API calls to bypass UI serialization
      const [res1, res2] = await Promise.all([
        page1.request.post("/api/conversations", {
          data: { listingId },
        }),
        page2.request.post("/api/conversations", {
          data: { listingId },
        }),
      ]);

      // Both should succeed (200/201) but return the SAME conversationId
      const data1 = await res1.json();
      const data2 = await res2.json();

      // The bug: data1.conversationId !== data2.conversationId (duplicates created)
      // After fix: both return the same conversation
      expect(data1.conversationId).toBe(data2.conversationId);

      await ctx1.close();
      await ctx2.close();
    }
  );
});
