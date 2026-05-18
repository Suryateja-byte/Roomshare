import type { Page } from "@playwright/test";

export async function mockSearchApiFailure(
  page: Page,
  options: { status?: number; body?: unknown } = {}
) {
  await page.route("**/api/search/v2**", async (route) => {
    await route.fulfill({
      status: options.status ?? 500,
      contentType: "application/json",
      body: JSON.stringify(
        options.body ?? {
          error: "E2E mocked search failure",
        }
      ),
    });
  });
}

export async function mockSearchRateLimit(page: Page) {
  await mockSearchApiFailure(page, {
    status: 429,
    body: {
      error: "Too many search requests. Please try again shortly.",
      retryAfter: 30,
    },
  });
}

export async function mockCheckoutForSearchAlerts(
  page: Page,
  options: { checkoutUrl?: string } = {}
) {
  const requests: unknown[] = [];

  await page.route("**/api/payments/checkout**", async (route) => {
    const postData = route.request().postData();
    if (postData) {
      try {
        requests.push(JSON.parse(postData));
      } catch {
        requests.push(postData);
      }
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        checkoutUrl: options.checkoutUrl ?? "/checkout/mock-search-alerts",
      }),
    });
  });

  return {
    requests,
  };
}
