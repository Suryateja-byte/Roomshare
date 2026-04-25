/**
 * Stability Test Helpers
 *
 * UI-level helpers + test API client for stability contract tests.
 * Test API route (src/app/api/test-helpers/route.ts) is gated by
 * E2E_TEST_HELPERS=true and provides DB queries/mutations for tests
 * that can't be done through the UI (e.g., creating expired holds).
 */

import { expect, type Page } from "@playwright/test";

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
  const emptyState = page
    .locator('[data-testid="empty-state"]')
    .filter({ hasText: /No booking requests yet|No bookings made yet/i });

  const readyState = page
    .locator('[data-testid="booking-item"]')
    .or(emptyState)
    .or(page.locator('[aria-label="Loading bookings"]'))
    .first();

  const settledState = page
    .locator('[data-testid="booking-item"]')
    .or(emptyState)
    .first();

  const openTab = async () => {
    const tabBtn = page
      .getByRole("button", { name: new RegExp(tab, "i") })
      .first();
    await tabBtn.waitFor({ state: "visible", timeout: 15_000 });
    await tabBtn.click();
  };

  await openTab();
  await page.reload({ waitUntil: "domcontentloaded" });
  await openTab();

  await expect(readyState).toBeVisible({ timeout: 15_000 });

  const loadingSkeleton = page.locator('[aria-label="Loading bookings"]').first();
  if (await loadingSkeleton.isVisible().catch(() => false)) {
    await expect(settledState).toBeVisible({ timeout: 15_000 });
  }

  // Click "All" filter to show all status bookings (page may have a filter active)
  const allFilter = page.getByRole("button", { name: /^all$/i }).first();
  if (await allFilter.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await allFilter.click();
    // Wait for filtered list to update after clicking "All"
    await expect(settledState).toBeVisible({ timeout: 10_000 });
  }
}

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
