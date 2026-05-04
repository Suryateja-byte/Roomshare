import { expect, test } from "@playwright/test";

test.describe("Search location validation", () => {
  test("typed location without autocomplete selection shows warning and stays on the page", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .locator('button[data-hydrated][aria-label^="Filters"]')
      .waitFor({ state: "visible" });

    const locationInput = page.locator("#search-location");
    await expect(locationInput).toBeVisible();

    await locationInput.fill("San Francisco");
    await expect(locationInput).toHaveValue("San Francisco");
    await locationInput.press("Enter");

    await expect(
      page.getByText("Select a location from the dropdown for more accurate results")
    ).toBeVisible();
    await expect(locationInput).toHaveAttribute("aria-invalid", "true");
    await expect(locationInput).toHaveAttribute(
      "aria-errormessage",
      "location-warning"
    );
    await expect(page).not.toHaveURL(/\/search(?:\?|$)/);
    expect(pageErrors).toEqual([]);
  });
});
