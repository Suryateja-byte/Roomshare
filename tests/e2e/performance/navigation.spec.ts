/**
 * Navigation Performance Regression
 *
 * Measures App Router link transitions without waiting for networkidle.
 * The assertions focus on regressions that make navigation feel broken:
 * full document reloads, HMR websocket errors, framework overlays, and very
 * slow route content visibility.
 */

import type { Locator, Page, Request, Response } from "@playwright/test";
import { test, expect, SF_BOUNDS } from "../helpers";

type FailureCollector = {
  consoleErrors: string[];
  pageErrors: string[];
};

type TransitionMetrics = {
  urlChangeMs: number;
  firstContentMs: number;
  mainRouteResponseMs: number | null;
  documentNavigations: string[];
};

function collectFailures(page: Page): FailureCollector {
  const failures: FailureCollector = {
    consoleErrors: [],
    pageErrors: [],
  };

  page.on("console", (message) => {
    if (message.type() === "error") {
      failures.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    failures.pageErrors.push(error.message);
  });

  return failures;
}

function relevantConsoleErrors(errors: string[]) {
  return errors.filter((message) =>
    /webpack-hmr|websocket.*hmr|error during websocket handshake|hydration|content security policy|csp|uncaught/i.test(
      message
    )
  );
}

function relevantPageErrors(errors: string[]) {
  return errors.filter((message) =>
    /webpack-hmr|websocket.*hmr|error during websocket handshake|hydration|content security policy|csp|uncaught|nextjs|chunk|router|app router/i.test(
      message
    )
  );
}

async function assertNoFrameworkFailure(
  page: Page,
  failures: FailureCollector
) {
  await expect(
    page.locator("[data-nextjs-dialog], [data-nextjs-dialog-overlay]")
  ).toHaveCount(0);
  expect(relevantPageErrors(failures.pageErrors)).toEqual([]);
  expect(relevantConsoleErrors(failures.consoleErrors)).toEqual([]);
}

async function waitForHydratedShell(page: Page) {
  await expect(
    page.locator(
      'header[data-auth-state="authenticated"], header[data-auth-state="unauthenticated"]'
    )
  ).toBeVisible({ timeout: 30_000 });
}

async function findVisibleListingDetailHref(page: Page) {
  const hrefHandle = await page.waitForFunction(
    () => {
      const links = Array.from(
        document.querySelectorAll<HTMLAnchorElement>(
          'main a[href^="/listings/"]'
        )
      );

      const link = links.find((element) => {
        const href = element.getAttribute("href") ?? "";
        if (
          href === "/listings/create" ||
          href.startsWith("/listings/create?")
        ) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      });

      return link?.getAttribute("href") ?? null;
    },
    undefined,
    { timeout: 30_000 }
  );

  return hrefHandle.jsonValue() as Promise<string>;
}

function listingDetailLinkByHref(page: Page, href: string) {
  return page.locator(`main a[href="${href}"]`).first();
}

async function measureLinkTransition(
  page: Page,
  action: () => Promise<void>,
  acceptsPath: (pathname: string) => boolean,
  firstContent: Locator
): Promise<TransitionMetrics> {
  const documentNavigations: string[] = [];
  const routeRequestStarts = new Map<Request, number>();
  let mainRouteResponseMs: number | null = null;

  const onRequest = (request: Request) => {
    const url = new URL(request.url());
    if (!acceptsPath(url.pathname)) {
      return;
    }

    if (request.isNavigationRequest()) {
      documentNavigations.push(request.url());
    }

    if (
      request.isNavigationRequest() ||
      request.resourceType() === "fetch" ||
      url.searchParams.has("_rsc")
    ) {
      routeRequestStarts.set(request, Date.now());
    }
  };

  const onResponse = (response: Response) => {
    const startedAt = routeRequestStarts.get(response.request());
    if (startedAt !== undefined && mainRouteResponseMs === null) {
      mainRouteResponseMs = Date.now() - startedAt;
    }
  };

  page.on("request", onRequest);
  page.on("response", onResponse);

  const start = Date.now();
  try {
    await action();
    await expect
      .poll(
        () => {
          const url = new URL(page.url());
          return {
            accepted: acceptsPath(url.pathname),
            pathname: url.pathname,
          };
        },
        { timeout: 30_000 }
      )
      .toMatchObject({ accepted: true });
    const urlChangeMs = Date.now() - start;

    await firstContent.waitFor({ state: "attached", timeout: 30_000 });
    const firstContentMs = Date.now() - start;

    return {
      urlChangeMs,
      firstContentMs,
      mainRouteResponseMs,
      documentNavigations,
    };
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
  }
}

test.describe("Navigation Performance Regression", () => {
  test.slow();
  test.use({ storageState: { cookies: [], origins: [] } });

  const searchUrl = `/search?minLat=${SF_BOUNDS.minLat}&maxLat=${SF_BOUNDS.maxLat}&minLng=${SF_BOUNDS.minLng}&maxLng=${SF_BOUNDS.maxLng}`;
  const navigationBudgetMs = process.env.CI ? 18_000 : 8_000;

  test("public links transition without full reload or HMR errors", async ({
    page,
  }) => {
    await page.goto("/search");
    await page.waitForLoadState("load");

    const failures = collectFailures(page);

    await page.goto("/");
    await page.waitForLoadState("load");
    await waitForHydratedShell(page);
    const browseRoomsLink = page
      .getByRole("link", { name: /find a room/i })
      .first();
    await browseRoomsLink.scrollIntoViewIfNeeded();
    await expect(browseRoomsLink).toBeVisible();

    const searchMetrics = await measureLinkTransition(
      page,
      async () => {
        await browseRoomsLink.click();
      },
      (pathname) => pathname === "/search",
      page.locator("main, [data-testid='search-results-container']").first()
    );

    console.log("[navigation-perf] / -> /search", searchMetrics);
    expect(searchMetrics.documentNavigations).toEqual([]);
    expect(searchMetrics.firstContentMs).toBeLessThan(navigationBudgetMs);

    await page.goto(searchUrl);
    await page.waitForLoadState("load");
    const detailHref = await findVisibleListingDetailHref(page);
    expect(detailHref).toMatch(/^\/listings\//);
    const detailPath = new URL(detailHref!, page.url()).pathname;

    await page.goto(detailHref!);
    await page.waitForLoadState("load");
    await page.goto(searchUrl);
    await page.waitForLoadState("load");
    await findVisibleListingDetailHref(page);
    const firstListingLink = listingDetailLinkByHref(page, detailHref);
    await expect(firstListingLink).toBeVisible({ timeout: 30_000 });

    const listingMetrics = await measureLinkTransition(
      page,
      async () => {
        await firstListingLink.click();
      },
      (pathname) => pathname === detailPath,
      page.locator("h1").first()
    );

    console.log("[navigation-perf] /search -> /listings/[id]", listingMetrics);
    expect(listingMetrics.documentNavigations).toEqual([]);
    expect(listingMetrics.firstContentMs).toBeLessThan(navigationBudgetMs);

    await assertNoFrameworkFailure(page, failures);
  });

  test("protected navbar link redirects without framework errors", async ({
    page,
  }) => {
    const failures = collectFailures(page);

    await page.goto("/");
    await page.waitForLoadState("load");
    await waitForHydratedShell(page);

    const messagesLink = page
      .getByRole("link", { name: /messages/i })
      .first();
    await expect(messagesLink).toBeVisible({ timeout: 30_000 });

    const metrics = await measureLinkTransition(
      page,
      async () => {
        await messagesLink.click();
      },
      (pathname) => pathname === "/messages" || pathname === "/login",
      page.locator("main, h1").first()
    );

    console.log("[navigation-perf] protected nav -> messages/login", metrics);
    expect(metrics.documentNavigations).toEqual([]);
    expect(metrics.firstContentMs).toBeLessThan(navigationBudgetMs);
    await assertNoFrameworkFailure(page, failures);
  });
});
