import { test, expect, tags } from "../helpers/test-utils";
import { CreateListingPage } from "../page-objects/create-listing.page";

test.describe("Create Listing — Mobile Account Menu Focus", () => {
  test.use({
    storageState: "playwright/.auth/user.json",
    viewport: { width: 390, height: 844 },
  });

  test.beforeEach(async () => {
    test.slow();
  });

  test(`mobile account menu traps focus until closed ${tags.auth} ${tags.mobile} ${tags.a11y}`, async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const clp = new CreateListingPage(page);
    await clp.goto();

    const menuButton = page.getByRole("button", { name: "Open menu" });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    const dialog = page.getByRole("dialog", { name: "Navigation menu" });
    await expect(dialog).toBeVisible();

    const closeButton = dialog.getByRole("button", { name: "Close menu" });
    const messagesLink = dialog.getByRole("link", { name: "Messages" });
    const settingsLink = dialog.getByRole("link", { name: "Settings" });
    const listRoomLink = dialog.getByRole("link", { name: "List a Room" });
    const logoutButton = dialog.getByRole("button", { name: "Log out" });

    await expect(closeButton).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(messagesLink).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(settingsLink).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(listRoomLink).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(logoutButton).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(closeButton).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(logoutButton).toBeFocused();

    await expect(clp.form).toBeVisible();
    expect(pageErrors).toHaveLength(0);

    const realConsoleErrors = consoleErrors.filter(
      (error) =>
        !error.includes("webpack") &&
        !error.includes("HMR") &&
        !error.includes("hydrat") &&
        !error.includes("favicon") &&
        !error.includes("ResizeObserver") &&
        !error.includes("Failed to load resource") &&
        !error.includes("net::ERR")
    );
    expect(realConsoleErrors).toHaveLength(0);
  });
});
