import { test, expect } from "@playwright/test";
import { disableAnimations } from "../helpers/visual-helpers";

const publicRoutes = [
  { name: "homepage", url: "/" },
  {
    name: "search",
    url: "/search?minLat=37.7&minLng=-122.5&maxLat=37.8&maxLng=-122.4",
  },
  { name: "about", url: "/about" },
  { name: "login", url: "/login" },
  { name: "signup", url: "/signup" },
  { name: "forgot-password", url: "/forgot-password" },
  { name: "terms", url: "/terms" },
  { name: "privacy", url: "/privacy" },
] as const;

test.describe("Project Viewport Responsive Coverage", () => {
  for (const route of publicRoutes) {
    test(`${route.name} has no document horizontal overflow`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(route.url, { waitUntil: "commit" });
      await page.waitForSelector("body");
      await disableAnimations(page);

      const metrics = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        bodyWidth: document.body.scrollWidth,
      }));

      expect(metrics.documentWidth).toBeLessThanOrEqual(
        metrics.viewportWidth + 2
      );
      expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth + 2);
    });
  }
});
