/**
 * Stability Test Helpers
 *
 * UI-level helpers + test API client for stability contract tests.
 * Test API route (src/app/api/test-helpers/route.ts) is gated by
 * E2E_TEST_HELPERS=true and provides DB queries/mutations for tests
 * that can't be done through the UI (e.g., creating expired holds).
 */

import { expect, type Page, type TestInfo } from "@playwright/test";

// ─── Test API Client ────────────────────────────────────────────

/**
 * Call the test-helpers API route. Returns { ok, status, data }.
 * Requires E2E_TEST_HELPERS=true on the server.
 */
export async function testApi<T = unknown>(
  page: Page,
  action: string,
  params: Record<string, unknown> = {}
): Promise<{ ok: boolean; status: number; data: T }> {
  const response = await page.request.post("/api/test-helpers", {
    data: { action, params },
    headers: {
      Authorization: `Bearer ${process.env.E2E_TEST_SECRET}`,
    },
    timeout: 30_000,
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    // Non-JSON response (404 HTML page, route not compiled)
    return {
      ok: false,
      status: response.status(),
      data: { error: "Non-JSON response" } as unknown as T,
    };
  }
  return { ok: response.ok(), status: response.status(), data: data as T };
}

/**
 * Create an already-expired hold via test API (for expiry tests).
 */
export async function createExpiredHold(
  page: Page,
  listingId: string,
  tenantEmail: string,
  slotsRequested = 1,
  minutesAgo = 5
): Promise<{ bookingId: string; heldUntil: string; slotsRequested: number }> {
  const res = await testApi<{
    bookingId: string;
    heldUntil: string;
    slotsRequested: number;
  }>(page, "createExpiredHold", {
    listingId,
    tenantEmail,
    slotsRequested,
    minutesAgo,
  });
  if (!res.ok)
    throw new Error(`createExpiredHold failed: ${JSON.stringify(res.data)}`);
  return res.data;
}

/**
 * Create a HELD booking with future heldUntil (for HoldCountdown tests).
 */
export async function createHeldBooking(
  page: Page,
  listingId: string,
  tenantEmail: string,
  slotsRequested = 1,
  ttlMinutes = 15
): Promise<{ bookingId: string; heldUntil: string; slotsRequested: number }> {
  const res = await testApi<{
    bookingId: string;
    heldUntil: string;
    slotsRequested: number;
  }>(page, "createHeldBooking", {
    listingId,
    tenantEmail,
    slotsRequested,
    ttlMinutes,
  });
  if (!res.ok)
    throw new Error(`createHeldBooking failed: ${JSON.stringify(res.data)}`);
  return res.data;
}

/**
 * Clean up test bookings via test API.
 */
export async function cleanupTestBookings(
  page: Page,
  opts: { listingId?: string; bookingIds?: string[]; resetSlots?: boolean }
): Promise<number> {
  const res = await testApi<{ deleted: number }>(
    page,
    "cleanupTestBookings",
    opts
  );
  if (!res.ok)
    throw new Error(`cleanupTestBookings failed: ${JSON.stringify(res.data)}`);
  return res.data.deleted;
}

/**
 * Get slot info for a listing via test API.
 */
export async function getSlotInfoViaApi(
  page: Page,
  listingId: string
): Promise<{ availableSlots: number; totalSlots: number }> {
  const res = await testApi<{ availableSlots: number; totalSlots: number }>(
    page,
    "getListingSlots",
    { listingId }
  );
  if (!res.ok)
    throw new Error(`getSlotInfo failed: ${JSON.stringify(res.data)}`);
  return res.data;
}

/**
 * Invoke the sweep-expired-holds cron endpoint.
 */
export async function invokeSweeper(page: Page): Promise<{
  success: boolean;
  expired: number;
  skipped: boolean;
  reason?: string;
}> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret)
    throw new Error("CRON_SECRET env var required for sweeper invocation");
  const response = await page.request.get("/api/cron/sweep-expired-holds", {
    headers: { Authorization: `Bearer ${cronSecret}` },
    timeout: 30_000,
  });
  return (await response.json()) as {
    success: boolean;
    expired: number;
    skipped: boolean;
    reason?: string;
  };
}

// ─── Phase 2 API Helpers ────────────────────────────────────────

export async function getGroundTruthSlots(
  page: Page,
  listingId: string
): Promise<number> {
  const res = await testApi<{ expected: number }>(page, "getGroundTruthSlots", {
    listingId,
  });
  if (!res.ok)
    throw new Error(`getGroundTruthSlots failed: ${JSON.stringify(res.data)}`);
  return res.data.expected;
}

export async function updateListingPrice(
  page: Page,
  listingId: string,
  newPrice: number
): Promise<{ oldPrice: number }> {
  const res = await testApi<{ oldPrice: number }>(page, "updateListingPrice", {
    listingId,
    newPrice,
  });
  if (!res.ok)
    throw new Error(`updateListingPrice failed: ${JSON.stringify(res.data)}`);
  return res.data;
}

export async function createPendingBooking(
  page: Page,
  listingId: string,
  tenantEmail: string
): Promise<{ bookingId: string }> {
  const res = await testApi<{ bookingId: string }>(
    page,
    "createPendingBooking",
    { listingId, tenantEmail }
  );
  if (!res.ok)
    throw new Error(`createPendingBooking failed: ${JSON.stringify(res.data)}`);
  return res.data;
}

export async function createAcceptedBooking(
  page: Page,
  listingId: string,
  tenantEmail: string,
  slotsRequested = 1
): Promise<{ bookingId: string }> {
  const res = await testApi<{ bookingId: string }>(
    page,
    "createAcceptedBooking",
    {
      listingId,
      tenantEmail,
      slotsRequested,
    }
  );
  if (!res.ok)
    throw new Error(
      `createAcceptedBooking failed: ${JSON.stringify(res.data)}`
    );
  return res.data;
}

export async function setListingBookingMode(
  page: Page,
  listingId: string,
  mode: string
): Promise<void> {
  const res = await testApi(page, "setListingBookingMode", { listingId, mode });
  if (!res.ok)
    throw new Error(
      `setListingBookingMode failed: ${JSON.stringify(res.data)}`
    );
}

// ─── Phase 2 UI Helpers ─────────────────────────────────────────

/**
 * Switch to Sent or Received tab on /bookings page.
 * Waits for hydration, clicks tab, then clicks "All" status filter to show all bookings.
 */
export async function navigateToBookingsTab(
  page: Page,
  tab: "sent" | "received"
): Promise<void> {
  // Wait for page hydration — tab button must be visible
  const tabBtn = page
    .getByRole("button", { name: new RegExp(tab, "i") })
    .first();
  await tabBtn.waitFor({ state: "visible", timeout: 15_000 });
  await tabBtn.click();
  // Wait for tab panel content to render after tab switch
  await expect(
    page
      .locator('[data-testid="booking-item"]')
      .or(page.locator("text=No bookings"))
      .or(page.locator('[role="tabpanel"]'))
      .first()
  ).toBeVisible({ timeout: 15_000 });

  // Click "All" filter to show all status bookings (page may have a filter active)
  const allFilter = page.getByRole("button", { name: /^all$/i }).first();
  if (await allFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await allFilter.click();
    // Wait for filtered list to update after clicking "All"
    await expect(
      page
        .locator('[data-testid="booking-item"]')
        .or(page.locator("text=No bookings"))
    ).toBeVisible({ timeout: 10_000 });
  }
}

/**
 * Track server action requests. Returns a getter for the count.
 */
export function setupRequestCounter(page: Page): { getCount: () => number } {
  let count = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.headers()["next-action"]) {
      count++;
    }
  });
  return { getCount: () => count };
}

// ─── Slot Badge Parsing ─────────────────────────────────────────

export interface SlotBadgeInfo {
  available: number;
  total: number;
  text: string;
}

/**
 * Read the slot badge from the current listing detail page.
 * Parses "X of Y open", "All X open", "Available", "Filled".
 */
export async function readSlotBadge(page: Page): Promise<SlotBadgeInfo | null> {
  const badge = page.locator('[data-testid="slot-badge"]');
  const visible = await badge.isVisible({ timeout: 5_000 }).catch(() => false);
  if (!visible) return null;

  const text = ((await badge.textContent()) || "").trim();

  // "X of Y open"
  const xOfY = text.match(/(\d+)\s+of\s+(\d+)\s+open/i);
  if (xOfY)
    return { available: parseInt(xOfY[1]), total: parseInt(xOfY[2]), text };

  // "All X open"
  const allX = text.match(/All\s+(\d+)\s+open/i);
  if (allX)
    return { available: parseInt(allX[1]), total: parseInt(allX[1]), text };

  // "Available" (single slot)
  if (/available/i.test(text)) return { available: 1, total: 1, text };

  // "Filled"
  if (/filled/i.test(text)) return { available: 0, total: 0, text };

  return { available: -1, total: -1, text };
}

/**
 * Navigate to a listing and read its slot badge.
 */
export async function getSlotBadgeForListing(
  page: Page,
  listingId: string
): Promise<SlotBadgeInfo | null> {
  await page.goto(`/listings/${listingId}`);
  await page.waitForLoadState("domcontentloaded");
  return readSlotBadge(page);
}

// ─── Session Storage ────────────────────────────────────────────

export async function clearBookingSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith("booking_"))
      .forEach((k) => sessionStorage.removeItem(k));
  });
}

export async function clearBookingSessionForListing(
  page: Page,
  listingId: string
): Promise<void> {
  await page.evaluate((id) => {
    sessionStorage.removeItem(`booking_submitted_${id}`);
    sessionStorage.removeItem(`booking_pending_key_${id}`);
    sessionStorage.removeItem(`booking_key_${id}`);
  }, listingId);
}

// ─── Date Selection ─────────────────────────────────────────────

const PROJECT_OFFSETS: Record<string, number> = {
  chromium: 24,
  firefox: 26,
  webkit: 28,
  "Mobile Chrome": 30,
  "Mobile Safari": 32,
};

export function getMonthOffset(testInfo: TestInfo, testIndex = 0): number {
  const base = PROJECT_OFFSETS[testInfo.project.name] ?? 24;
  const retryOffset = testInfo.retry * 5;
  // Use seconds-of-day for unique offset per run (avoids leftover collisions)
  const now = new Date();
  const secondsOfDay =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const timeJitter = secondsOfDay % 60; // 0-59 range — gives 5 years of unique months
  return base + retryOffset + testIndex * 3 + timeJitter;
}

/**
 * Select start and end dates using the Radix calendar popover.
 */
export async function selectStabilityDates(
  page: Page,
  monthOffset: number
): Promise<void> {
  // Matches the proven pattern from 21-booking-lifecycle.spec.ts

  // --- Start date ---
  const startTrigger = page.locator("#booking-start-date");
  // Wait for Radix hydration first (SSR placeholder lacks data-state)
  await page
    .locator("#booking-start-date[data-state]")
    .waitFor({ state: "attached", timeout: 15_000 });
  await startTrigger.scrollIntoViewIfNeeded();
  await startTrigger.click();

  const nextMonthBtnStart = page.locator('button[aria-label="Next month"]');
  await nextMonthBtnStart.waitFor({ state: "visible", timeout: 10_000 });
  for (let i = 0; i < monthOffset; i++) {
    await nextMonthBtnStart.click();
    // Wait for the calendar to re-render after month navigation
    await nextMonthBtnStart.waitFor({ state: "visible", timeout: 10_000 });
  }

  const day1Start = page
    .locator(
      '[data-radix-popper-content-wrapper] button, [class*="popover"] button'
    )
    .filter({ hasText: /^1$/ })
    .first();
  await day1Start.waitFor({ state: "visible", timeout: 5_000 });
  await day1Start.click();
  // Wait for start date to be selected (popover closes or date input updates)
  await expect(startTrigger).not.toHaveText("", { timeout: 5_000 });

  // --- End date ---
  const endTrigger = page.locator("#booking-end-date");
  await endTrigger.scrollIntoViewIfNeeded();
  await page
    .locator("#booking-end-date[data-state]")
    .waitFor({ state: "attached", timeout: 10_000 });
  await endTrigger.click();
  // Wait for end date popover to open
  const nextMonthBtnEnd = page.locator('button[aria-label="Next month"]');
  await nextMonthBtnEnd.waitFor({ state: "visible", timeout: 10_000 });

  // End date picker opens at CURRENT month, navigate monthOffset + 2 to land after start
  for (let i = 0; i < monthOffset + 2; i++) {
    await nextMonthBtnEnd.click();
    // Wait for the calendar to re-render after month navigation
    await nextMonthBtnEnd.waitFor({ state: "visible", timeout: 10_000 });
  }

  const day1End = page
    .locator(
      '[data-radix-popper-content-wrapper] button, [class*="popover"] button'
    )
    .filter({ hasText: /^1$/ })
    .first();
  await day1End.waitFor({ state: "visible", timeout: 5_000 });
  await day1End.click();
  // Wait for end date to be selected (popover closes or date input updates)
  await expect(endTrigger).not.toHaveText("", { timeout: 5_000 });
}

// ─── UI Interaction Helpers ─────────────────────────────────────

/**
 * Submit a booking through the full UI flow (click Book → confirm modal).
 * Returns true if success message appeared, false if error appeared.
 */
export async function submitBookingViaUI(page: Page): Promise<boolean> {
  const bookBtn = page
    .locator("main")
    .getByRole("button", { name: /request to book/i })
    .first();

  await bookBtn.waitFor({ state: "visible", timeout: 10_000 });
  await bookBtn.click();

  // Wait for confirmation modal
  const modal = page.locator('[role="dialog"][aria-modal="true"]');
  try {
    await modal.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    // Modal didn't appear — check for validation error
    return false;
  }

  // Confirm in modal
  const confirmBtn = modal.getByRole("button", { name: /confirm/i });
  await confirmBtn.click();

  // Wait for outcome — check for success text or toast
  const success = page.getByText(/request sent|booking confirmed|submitted/i);
  const successToast = page.locator('[data-sonner-toast][data-type="success"]');
  // Wait for any outcome
  try {
    await page.waitForFunction(
      () => {
        const body = document.body.innerText;
        return /request sent|booking confirmed|submitted|already have|error|failed/i.test(
          body
        );
      },
      { timeout: 60_000 }
    );
  } catch {
    // Timeout — check what's visible
  }

  const isSuccess =
    (await success.isVisible().catch(() => false)) ||
    (await successToast.isVisible().catch(() => false));
  return isSuccess;
}

/**
 * Extract listing ID from the current page URL.
 */
export function extractListingId(page: Page): string | null {
  const match = page.url().match(/\/listings\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Find a listing not owned by the current user by browsing search results.
 * Returns the listing URL or null.
 */
/**
 * Find a bookable listing URL. Uses `nthCard` to pick different listings
 * for different tests (avoids booking collisions between tests).
 */
export async function findBookableListingUrl(
  page: Page,
  nthCard = 0
): Promise<string | null> {
  // Go to search with SF bounds — shows seed listings
  await page.goto("/search?bounds=37.7,-122.52,37.85,-122.35", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });

  // Wait for listing cards to render
  const cards = page.locator('a[href*="/listings/"]');

  try {
    await cards.first().waitFor({ state: "attached", timeout: 30_000 });
  } catch {
    return null;
  }

  const count = await cards.count();
  const index = Math.min(nthCard, count - 1);
  return cards.nth(index).getAttribute("href");
}
