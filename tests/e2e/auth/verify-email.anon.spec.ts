/**
 * Verify Email — E2E Regression
 *
 * Coverage: legacy API link redirect + explicit user click requirement.
 *
 * .anon.spec.ts → runs on chromium-anon, firefox-anon, webkit-anon.
 */

import { test, expect, timeouts } from "../helpers";

const VALID_TOKEN = "a".repeat(64);

test.beforeEach(async () => {
  test.slow();
});

test.describe("VEC: Verify Email Confirm Flow", () => {
  test("VEC-01  old API link redirects without verifying until click", async ({
    page,
  }) => {
    let postCount = 0;

    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes("/api/auth/verify-email")
      ) {
        postCount += 1;
      }
    });

    await page.route("**/api/auth/verify-email*", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "verified",
            message: "Your email address has been verified.",
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.goto(`/api/auth/verify-email?token=${VALID_TOKEN}`);

    await expect(page).toHaveURL(
      new RegExp(`/verify-email\\?token=${VALID_TOKEN}$`)
    );
    await expect(
      page.getByRole("heading", { name: /Confirm your email/i })
    ).toBeVisible({ timeout: timeouts.navigation });

    expect(postCount).toBe(0);

    await page.getByRole("button", { name: /Verify Email/i }).click();

    await expect(
      page.getByRole("heading", { name: /Email verified/i })
    ).toBeVisible({ timeout: timeouts.navigation });
    expect(postCount).toBe(1);
  });
});
