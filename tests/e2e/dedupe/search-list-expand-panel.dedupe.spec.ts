import { test, expect, searchResultsContainer } from "../helpers";
import {
  DEDUPE_IDS,
  openGroupTrigger,
  searchUrls,
  waitForVisibleCards,
} from "./dedupe-helpers";

test("T-03: expanding the grouped dates panel shows all dates and routes to the selected sibling", async ({
  page,
}) => {
  await page.goto(searchUrls.cloneGroup, { waitUntil: "domcontentloaded" });
  await waitForVisibleCards(page);

  await (await openGroupTrigger(page)).click();

  const panel = searchResultsContainer(page).locator(
    '[data-testid="group-dates-panel"]'
  );
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-testid="group-dates-chip"]')).toHaveCount(4);

  const apr18Chip = panel.getByRole("button", { name: /available april 18, 2026/i });
  await apr18Chip.click();

  await page.waitForURL(`**/listings/${DEDUPE_IDS.apr18}`);
  await expect(page).toHaveURL(new RegExp(`/listings/${DEDUPE_IDS.apr18}$`));
});
