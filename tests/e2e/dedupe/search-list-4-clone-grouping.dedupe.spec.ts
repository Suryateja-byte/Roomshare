import { test, expect, searchResultsContainer } from "../helpers";
import {
  searchUrls,
  visibleMarkerCount,
  waitForVisibleCards,
} from "./dedupe-helpers";

test("T-02: a 4-clone owner group renders as one card and one pin", async ({
  page,
}) => {
  await page.goto(searchUrls.cloneGroup, { waitUntil: "domcontentloaded" });

  const cards = await waitForVisibleCards(page);
  await expect(cards).toHaveCount(1);

  const container = searchResultsContainer(page);
  await expect(container.getByText("Available May 20")).toBeVisible();
  await expect(
    container.locator('[data-testid="group-dates-trigger"]')
  ).toHaveText("View 3 more available dates");

  const markerCount = await visibleMarkerCount(page).catch(() => null);
  if (markerCount !== null) {
    expect(markerCount).toBe(1);
  }
});

test("T-02a: grouped desktop row card keeps trust and date controls aligned", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "desktop row alignment is covered by desktop projects");

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "roomshare-map-preference",
      JSON.stringify({ desktop: "split", mobile: "list" })
    );
  });

  await page.goto(searchUrls.cloneGroup, { waitUntil: "domcontentloaded" });

  const cards = await waitForVisibleCards(page);
  await expect(cards).toHaveCount(1);

  const card = cards.first();
  await expect(card).toBeVisible();
  await expect(
    card.locator('[data-testid="host-identity-badge"]')
  ).toBeVisible();

  const overflow = await card.evaluate(
    (element) => element.scrollWidth - element.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await expect
    .poll(
      async () => {
        const detailsBox = await card
          .locator('[data-testid="listing-card-details"]')
          .boundingBox();
        const actionBox = await card
          .locator('[data-testid="group-dates-action"]')
          .boundingBox();
        const triggerBox = await card
          .locator('[data-testid="group-dates-trigger"]')
          .boundingBox();
        const badgeBox = await card
          .locator('[data-testid="host-identity-badge"]')
          .boundingBox();
        const cardBox = await card.boundingBox();

        if (!detailsBox || !actionBox || !triggerBox || !badgeBox || !cardBox) {
          return Number.POSITIVE_INFINITY;
        }

        const triggerDeltaToDetails = Math.abs(triggerBox.x - detailsBox.x);
        const triggerDeltaToDetailsContent = Math.abs(
          triggerBox.x - (detailsBox.x + 16)
        );
        const triggerDelta = Math.min(
          triggerDeltaToDetails,
          triggerDeltaToDetailsContent
        );
        const badgeOverflow = Math.max(
          cardBox.x - badgeBox.x,
          badgeBox.x + badgeBox.width - (cardBox.x + cardBox.width + 1),
          0
        );

        return Math.max(triggerDelta, badgeOverflow);
      },
      {
        timeout: 15_000,
        message: "Expected grouped row controls to settle into alignment",
      }
    )
    .toBeLessThanOrEqual(2);
  await expect(card.locator('[data-testid="group-dates-trigger"]')).toHaveText(
    "View 3 more available dates"
  );

  const realConsoleErrors = consoleErrors.filter(
    (error) => !error.includes("Failed to load resource")
  );
  expect(pageErrors).toEqual([]);
  expect(realConsoleErrors).toEqual([]);
});
