import { type Page, type Browser, type BrowserContext } from '@playwright/test';

/**
 * Select booking dates on a listing detail page.
 * Fills move-in date with a date 30 days from now.
 */
export async function selectBookingDates(page: Page): Promise<void> {
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const dateStr = futureDate.toISOString().split('T')[0];

  const dateInput = page.getByLabel(/move.*in|start.*date|check.*in/i)
    .or(page.locator('input[type="date"]'))
    .first();

  if (await dateInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await dateInput.fill(dateStr);
  }
}

/**
 * Create a booking as a specific user by opening a new browser context.
 * Returns the page for further assertions.
 */
export async function createBookingAsUser(
  browser: Browser,
  storageState: string,
  listingUrl: string
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto(listingUrl);
  await page.waitForLoadState('domcontentloaded');
  return { context, page };
}
