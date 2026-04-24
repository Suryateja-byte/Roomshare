import { test, expect } from "../helpers";
import { searchUrls, waitForVisibleCards } from "./dedupe-helpers";

test.use({
  viewport: { width: 360, height: 740 },
});

test("T-14: mobile grouped dates open in a modal without changing the bottom-sheet snap state", async ({
  page,
}) => {
  await page.goto(searchUrls.cloneGroup, { waitUntil: "domcontentloaded" });
  await waitForVisibleCards(page);

  const snapContent = page.locator("[data-snap-current]").first();
  await expect(snapContent).toHaveAttribute("data-snap-current", "1");

  const trigger = page
    .locator('[data-testid="group-dates-trigger"]')
    .filter({ visible: true })
    .first();
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-haspopup", "dialog", {
    timeout: 15_000,
  });
  await trigger.evaluate((element) => (element as HTMLButtonElement).click());

  await expect(page.locator('[data-testid="group-dates-modal"]')).toBeVisible();
  await expect(snapContent).toHaveAttribute("data-snap-current", "1");

  await page.mouse.click(12, 12);

  await expect(page.locator('[data-testid="group-dates-modal"]')).toHaveCount(
    0,
    { timeout: 10_000 }
  );
  await expect(snapContent).toHaveAttribute("data-snap-current", "1");
});
