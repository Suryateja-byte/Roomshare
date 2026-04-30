import { test, expect } from "@playwright/test";
import { disableAnimations } from "../helpers/visual-helpers";

test.describe("Home Hero — Responsive Visual Checks", () => {
  test("keeps primary hero controls above the fold", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "commit" });
    await page.waitForSelector('section[aria-label="Search for rooms"]');
    await disableAnimations(page);

    const hero = page.locator('section[aria-label="Search for rooms"]');
    const form = hero.locator('form[role="search"]').first();
    const image = hero.locator("picture.home-hero-photo img").first();

    await expect(hero).toBeVisible();
    await expect(form).toBeVisible({ timeout: 15_000 });

    const metrics = await page.evaluate(() => {
      const heroEl = document.querySelector(
        'section[aria-label="Search for rooms"]'
      ) as HTMLElement | null;
      const formEl = heroEl?.querySelector(
        'form[role="search"]'
      ) as HTMLElement | null;
      const imageEl = heroEl?.querySelector(
        "picture.home-hero-photo img"
      ) as HTMLImageElement | null;
      const heroRect = heroEl?.getBoundingClientRect();
      const formRect = formEl?.getBoundingClientRect();

      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        heroTop: heroRect?.top ?? Number.NaN,
        heroBottom: heroRect?.bottom ?? Number.NaN,
        formTop: formRect?.top ?? Number.NaN,
        formBottom: formRect?.bottom ?? Number.NaN,
        imageComplete: imageEl?.complete ?? false,
        imageNaturalWidth: imageEl?.naturalWidth ?? 0,
        imageCurrentSrc: imageEl?.currentSrc ?? "",
      };
    });

    expect(metrics.documentWidth).toBeLessThanOrEqual(
      metrics.viewportWidth + 2
    );
    expect(metrics.heroTop).toBeGreaterThanOrEqual(-2);
    expect(metrics.formTop).toBeGreaterThanOrEqual(-2);
    expect(metrics.formBottom).toBeLessThanOrEqual(metrics.viewportHeight + 2);
    expect(metrics.heroBottom).toBeGreaterThan(metrics.formBottom);
    expect(metrics.imageComplete).toBe(true);
    expect(metrics.imageNaturalWidth).toBeGreaterThan(0);
    expect(metrics.imageCurrentSrc).toMatch(
      /hero-living-room.*\.(avif|webp|png)(\?|$)/
    );
  });
});
