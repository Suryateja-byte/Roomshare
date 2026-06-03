import {
  test,
  expect,
  SF_BOUNDS,
  searchResultsContainer,
} from "./helpers";
import type { Page } from "@playwright/test";

const boundsQS = `minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;

const HYDRATION_FAILURE_PATTERNS = [
  /Hydration failed/i,
  /server rendered HTML didn't match/i,
  /hydrated but some attributes of the server rendered HTML didn't match/i,
  /react\.dev\/link\/hydration-mismatch/i,
];

function captureHydrationFailures(page: Page) {
  const failures: string[] = [];

  const recordIfHydrationFailure = (text: string) => {
    if (
      HYDRATION_FAILURE_PATTERNS.some((pattern) => pattern.test(text)) &&
      !failures.includes(text)
    ) {
      failures.push(text);
    }
  };

  page.on("console", (message) => {
    recordIfHydrationFailure(message.text());
  });
  page.on("pageerror", (error) => {
    recordIfHydrationFailure(error.message);
  });

  return failures;
}

function expectNoHydrationFailures(failures: string[]) {
  expect(failures).toEqual([]);
}

test.describe("Hydration console guard", () => {
  test("login renders without React hydration mismatch errors", async ({
    page,
  }) => {
    const failures = captureHydrationFailures(page);

    await page.goto("/login");
    const loginForm = page.getByTestId("login-form");
    await expect(loginForm).toBeAttached();
    await expect(loginForm).toHaveAttribute("method", "post");
    await expect(loginForm).toHaveAttribute(
      "data-turnstile-enabled",
      /^(true|false)$/
    );
    await expect(page.locator('input[name="password"]')).toHaveAttribute(
      "name",
      "password"
    );

    expectNoHydrationFailures(failures);
  });

  test("search renders results without React hydration mismatch errors", async ({
    page,
  }) => {
    const failures = captureHydrationFailures(page);

    await page.goto(`/search?${boundsQS}`);
    const cards = searchResultsContainer(page).locator(
      '[data-testid="listing-card"]'
    );
    await expect(cards.first()).toBeAttached({ timeout: 30_000 });

    expectNoHydrationFailures(failures);
  });
});
