import { test, expect, searchResultsContainer } from "../helpers";
import {
  openGroupTrigger,
  searchUrls,
  tabToLocator,
  waitForVisibleCards,
} from "./dedupe-helpers";

test("T-04: the grouped-date trigger and panel honor the keyboard contract", async ({
  page,
}) => {
  await page.goto(searchUrls.cloneGroup, { waitUntil: "domcontentloaded" });
  await waitForVisibleCards(page);

  const trigger = await openGroupTrigger(page);
  await tabToLocator(page, trigger);
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Enter");

  const panel = searchResultsContainer(page).locator(
    '[data-testid="group-dates-panel"]'
  );
  await expect(panel).toBeVisible();

  const firstChip = panel.locator('[data-testid="group-dates-chip"]').first();
  await expect(firstChip).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(firstChip).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
