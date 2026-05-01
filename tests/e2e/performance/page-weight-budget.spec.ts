/**
 * Page Weight Budget Tests
 *
 * Ensures total transfer size for key routes stays within the current
 * production bundle envelope.
 * Measures all network responses (JS, CSS, images, fonts, HTML)
 * to catch regressions in bundle size or unoptimized assets.
 */

import { test, expect } from "../helpers";

const PAGE_WEIGHT_BUDGET_KB = 2500;

const routes = [
  { url: "/", name: "homepage" },
  { url: "/about", name: "about" },
  { url: "/search?minLat=37.7&minLng=-122.5&maxLat=37.8&maxLng=-122.4", name: "search" },
];

for (const route of routes) {
  test(`page weight under ${PAGE_WEIGHT_BUDGET_KB}KB for ${route.name}`, async ({ page }) => {
    let totalBytes = 0;

    page.on("response", (response) => {
      const headers = response.headers();
      // Prefer content-length for accuracy; skip opaque responses
      const len = headers["content-length"];
      if (len) {
        totalBytes += parseInt(len, 10);
      }
    });

    await page.goto(route.url, { waitUntil: "load" });

    const totalKB = totalBytes / 1024;
    // Log for CI visibility
    // eslint-disable-next-line no-console
    console.log(`[page-weight] ${route.name} (${route.url}): ${Math.round(totalKB)}KB`);

    expect(
      totalKB,
      `${route.name} page weight was ${Math.round(totalKB)}KB, budget is ${PAGE_WEIGHT_BUDGET_KB}KB`
    ).toBeLessThan(PAGE_WEIGHT_BUDGET_KB);
  });
}
