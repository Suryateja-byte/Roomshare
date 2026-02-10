/**
 * P0-2: Dark Mode FOUC Prevention Guard Tests
 *
 * These tests verify that next-themes' built-in FOUC prevention is working correctly.
 * They test the CAUSE (init script presence, timing) rather than the EFFECT (pixel flash).
 *
 * Key constraint: next-themes already has built-in FOUC prevention via an injected script.
 * We should NOT add a second custom head script unless these tests fail.
 */
import { test, expect, tags } from "../helpers";

test.describe("P0-2: Dark Mode FOUC Prevention", () => {
  test.beforeEach(async () => {
    test.slow();
  });

  test(`${tags.smoke} - next-themes init script exists in SSR HTML`, async ({
    request,
  }) => {
    // Fetch SSR HTML directly (no JS execution)
    // Extended timeout for cold server starts
    const response = await request.get("/search", { timeout: 30000 });
    const html = await response.text();

    // next-themes injects a script that:
    // 1. Reads localStorage for theme
    // 2. Checks prefers-color-scheme
    // 3. Applies theme class/attribute before paint
    //
    // The script typically contains patterns like:
    // - localStorage.getItem
    // - prefers-color-scheme
    // - classList or setAttribute
    const hasThemeScript =
      html.includes("localStorage") &&
      (html.includes("prefers-color-scheme") ||
        html.includes("color-scheme")) &&
      (html.includes("classList") || html.includes("setAttribute"));

    expect(hasThemeScript).toBe(true);
  });

  test(`${tags.smoke} - dark class applied on load with system dark preference`, async ({
    page,
  }) => {
    // Emulate system dark preference
    await page.emulateMedia({ colorScheme: "dark" });

    await page.goto("/search");
    await page.waitForLoadState("domcontentloaded");

    // Verify dark class is present on html element
    const htmlClass = await page.evaluate(
      () => document.documentElement.className
    );
    expect(htmlClass).toContain("dark");
  });

  test(`${tags.smoke} - dark class applied on load with localStorage preference`, async ({
    page,
  }) => {
    // Set localStorage theme before navigation
    await page.addInitScript(() => {
      localStorage.setItem("theme", "dark");
    });

    await page.goto("/search");
    await page.waitForLoadState("domcontentloaded");

    // Verify dark class is present
    const htmlClass = await page.evaluate(
      () => document.documentElement.className
    );
    expect(htmlClass).toContain("dark");

    // Verify localStorage was read correctly
    const storedTheme = await page.evaluate(() =>
      localStorage.getItem("theme")
    );
    expect(storedTheme).toBe("dark");
  });

  test(`${tags.smoke} - light class/default when system prefers light`, async ({
    page,
  }) => {
    // Emulate system light preference
    await page.emulateMedia({ colorScheme: "light" });

    // Clear any localStorage theme
    await page.addInitScript(() => {
      localStorage.removeItem("theme");
    });

    await page.goto("/search");
    await page.waitForLoadState("domcontentloaded");

    // Verify dark class is NOT present (light mode)
    const htmlClass = await page.evaluate(
      () => document.documentElement.className
    );
    expect(htmlClass).not.toContain("dark");
  });

});
