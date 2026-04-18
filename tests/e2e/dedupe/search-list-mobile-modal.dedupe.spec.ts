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

  const trigger = page.locator('[data-testid="group-dates-trigger"]').first();
  await expect(trigger).toBeVisible();
  await trigger.click();

  await expect(page.locator('[data-testid="group-dates-modal"]')).toBeVisible();
  await expect(snapContent).toHaveAttribute("data-snap-current", "1");

  await page.getByRole("button", { name: /close/i }).click();

  await expect(page.locator('[data-testid="group-dates-modal"]')).toHaveCount(0);
  await expect(snapContent).toHaveAttribute("data-snap-current", "1");
});
