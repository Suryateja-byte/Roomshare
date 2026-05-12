import fs from "node:fs";
import path from "node:path";

import type { ConsoleMessage, Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import { expect, test } from "../helpers";

const REVIEWER_LISTING_TITLE = "Reviewer Nob Hill Apartment";
const SUSPENDED_HOST_LISTING_TITLE = "E2E Suspended Host Contact Room";
const VIEWER_BLOCKS_HOST_LISTING_TITLE =
  "E2E Viewer Blocks Host Contact Room";
const HOST_BLOCKS_VIEWER_LISTING_TITLE =
  "E2E Host Blocks Viewer Contact Room";
const CHECKOUT_RETURN_SESSION_ID = "cs_e2e_contact_return";
const deterministicImageSvg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"><rect width="1" height="1" fill="#f8fafc"/></svg>'
);
const prisma = new PrismaClient();

const PAYWALL_REQUIRED_VIEWER_STATE = {
  isLoggedIn: true,
  hasBookingHistory: false,
  existingReview: null,
  primaryCta: "CONTACT_HOST",
  canContact: false,
  contactDisabledReason: "PAYWALL_REQUIRED",
  availabilitySource: "LEGACY_BOOKING",
  canBook: false,
  canHold: false,
  bookingDisabledReason: "CONTACT_ONLY",
  paywallSummary: {
    enabled: true,
    mode: "PAYWALL_REQUIRED",
    freeContactsRemaining: 0,
    packContactsRemaining: 0,
    activePassExpiresAt: null,
    requiresPurchase: true,
    offers: [
      {
        productCode: "CONTACT_PACK_3",
        label: "3 contacts",
        priceDisplay: "$4.99",
        description: "Unlock 3 additional message starts.",
      },
    ],
  },
  reviewEligibility: {
    canPublicReview: false,
    hasLegacyAcceptedBooking: false,
    canLeavePrivateFeedback: false,
    reason: "ACCEPTED_BOOKING_REQUIRED",
  },
};

const CONTACTABLE_VIEWER_STATE = {
  ...PAYWALL_REQUIRED_VIEWER_STATE,
  canContact: true,
  contactDisabledReason: null,
  paywallSummary: {
    ...PAYWALL_REQUIRED_VIEWER_STATE.paywallSummary,
    mode: "METERED",
    packContactsRemaining: 3,
    requiresPurchase: false,
    offers: [],
  },
};

const DISABLED_STATE_CASES = [
  {
    name: "unavailable listing",
    reason: "LISTING_UNAVAILABLE",
    publicStatus: "PAUSED",
  },
  {
    name: "migration-review listing",
    reason: "MIGRATION_REVIEW",
    publicStatus: "PAUSED",
  },
  {
    name: "moderation-locked listing",
    reason: "MODERATION_LOCKED",
    publicStatus: "PAUSED",
  },
] as const;

type DisabledStateReason = (typeof DISABLED_STATE_CASES)[number]["reason"];
type ContactRestrictionReason =
  | "VIEWER_SUSPENDED"
  | "HOST_SUSPENDED"
  | "VIEWER_BLOCKED_HOST"
  | "HOST_BLOCKED_VIEWER";

function disabledViewerState(contactDisabledReason: DisabledStateReason) {
  return {
    ...CONTACTABLE_VIEWER_STATE,
    canContact: false,
    contactDisabledReason,
    paywallSummary: null,
  };
}

function seededListingIdByTitle(title: string): string | null {
  const manifestPath = path.join(
    process.cwd(),
    "playwright/.cache/e2e-seed.json"
  );

  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    listingsByTitle?: Record<string, string>;
  };

  return manifest.listingsByTitle?.[title] ?? null;
}

function reviewerListingId(): string | null {
  return seededListingIdByTitle(REVIEWER_LISTING_TITLE);
}

async function resetListingDetailRateLimits(listingId: string) {
  await prisma.rateLimitEntry.deleteMany({
    where: {
      endpoint: {
        in: [
          `/api/listings/${listingId}/status`,
          `/api/listings/${listingId}/viewer-state`,
        ],
      },
    },
  });
}

function actionableBrowserErrors(errors: string[]) {
  return errors.filter((error) => {
    const normalized = error.toLowerCase();
    const isSupabasePreconnectDnsNoise =
      normalized.includes("failed to preconnect to https://") &&
      normalized.includes("supabase.co") &&
      normalized.includes("name or service not known");

    return (
      !normalized.includes("favicon") &&
      !normalized.includes("net::err_aborted") &&
      !normalized.includes("webpack-hmr") &&
      !isSupabasePreconnectDnsNoise
    );
  });
}

function captureBrowserErrors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const consoleHandler = (message: ConsoleMessage) => {
    if (message.type() === "error") {
      const location = message.location();
      consoleErrors.push(
        location.url ? `${message.text()} (${location.url})` : message.text()
      );
    }
  };
  const pageErrorHandler = (error: Error) => {
    pageErrors.push(error.message);
  };

  page.on("console", consoleHandler);
  page.on("pageerror", pageErrorHandler);

  return {
    dispose: () => {
      page.off("console", consoleHandler);
      page.off("pageerror", pageErrorHandler);
    },
    expectClean: () => {
      expect(actionableBrowserErrors(consoleErrors)).toEqual([]);
      expect(actionableBrowserErrors(pageErrors)).toEqual([]);
    },
  };
}

async function mockListingImages(page: Page) {
  await page.route("**/_next/image?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: deterministicImageSvg,
    })
  );
  await page.route("**/*supabase.co/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: deterministicImageSvg,
    })
  );
}

async function mockListingDetailBackgroundRequests(page: Page) {
  await page.route(
    (url) =>
      url.pathname.startsWith("/api/listings/") &&
      url.pathname.endsWith("/view"),
    (route) =>
      route.fulfill({
        status: 204,
        headers: { "Cache-Control": "private, no-store" },
        body: "",
      })
  );

  await page.route(
    (url) =>
      url.pathname === "/api/messages" &&
      url.searchParams.get("view") === "unreadCount",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 0 }),
      })
  );
}

async function mockCheckoutReturnViewerState(page: Page) {
  let viewerStateCalls = 0;

  await page.route("**/api/listings/*/viewer-state", async (route) => {
    viewerStateCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        viewerStateCalls === 1
          ? PAYWALL_REQUIRED_VIEWER_STATE
          : CONTACTABLE_VIEWER_STATE
      ),
    });
  });

  return {
    calls: () => viewerStateCalls,
  };
}

async function mockViewerState(page: Page, state: unknown) {
  let viewerStateCalls = 0;

  await page.route("**/api/listings/*/viewer-state", async (route) => {
    viewerStateCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state),
    });
  });

  return {
    calls: () => viewerStateCalls,
  };
}

async function mockListingStatus(
  page: Page,
  contactDisabledReason: DisabledStateReason | null,
  publicStatus = contactDisabledReason ? "PAUSED" : "AVAILABLE"
) {
  let statusCalls = 0;

  await page.route("**/api/listings/*/status", async (route) => {
    statusCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "mock-listing-status",
        canManage: false,
        availabilitySource: "LEGACY_BOOKING",
        publicStatus,
        searchEligible: contactDisabledReason === null,
        contactDisabledReason,
      }),
    });
  });

  return {
    calls: () => statusCalls,
  };
}

async function mockFulfilledCheckoutSession(page: Page, listingId: string) {
  let releaseCheckoutSession!: () => void;
  let checkoutSessionRequestUrl: string | null = null;
  const checkoutSessionGate = new Promise<void>((resolve) => {
    releaseCheckoutSession = resolve;
  });

  await page.route("**/api/payments/checkout-session?**", async (route) => {
    checkoutSessionRequestUrl = route.request().url();
    await checkoutSessionGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sessionId: CHECKOUT_RETURN_SESSION_ID,
        listingId,
        productCode: "CONTACT_PACK_3",
        checkoutStatus: "COMPLETE",
        paymentStatus: "PAID",
        fulfillmentStatus: "FULFILLED",
        requiresViewerStateRefresh: true,
      }),
    });
  });

  return {
    release: releaseCheckoutSession,
    requestUrl: () => checkoutSessionRequestUrl,
  };
}

async function openReviewerListing(page: Page, query = "") {
  return openSeededListing(page, REVIEWER_LISTING_TITLE, query);
}

async function openSeededListing(page: Page, title: string, query = "") {
  const listingId = seededListingIdByTitle(title);
  test.skip(!listingId, `${title} seed manifest entry missing`);
  if (!listingId) {
    throw new Error(`${title} seed manifest entry missing`);
  }

  await resetListingDetailRateLimits(listingId);
  await mockListingImages(page);
  await mockListingDetailBackgroundRequests(page);
  await page.goto(`/listings/${listingId}${query}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("heading", { name: title })
  ).toBeVisible({ timeout: 30_000 });

  return listingId;
}

async function expectContactRestrictionState({
  page,
  listingTitle,
  expectedReason,
  buttonLabel,
  message,
}: {
  page: Page;
  listingTitle: string;
  expectedReason: ContactRestrictionReason;
  buttonLabel: string;
  message: string;
}) {
  const listingId = seededListingIdByTitle(listingTitle);
  test.skip(!listingId, `${listingTitle} seed manifest entry missing`);
  if (!listingId) {
    throw new Error(`${listingTitle} seed manifest entry missing`);
  }

  await resetListingDetailRateLimits(listingId);
  const contactStartRequests: string[] = [];
  page.on("request", (request) => {
    const postData = request.postData() ?? "";
    if (request.method() === "POST" && postData.includes("startConversation")) {
      contactStartRequests.push(request.url());
    }
  });

  await mockListingImages(page);
  await mockListingDetailBackgroundRequests(page);
  const viewerStateResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/listings/${listingId}/viewer-state`),
    { timeout: 45_000 }
  );
  await page.goto(`/listings/${listingId}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: listingTitle })).toBeVisible({
    timeout: 30_000,
  });

  const viewerStateResponse = await viewerStateResponsePromise;
  expect(viewerStateResponse.status()).toBe(200);
  const viewerStatePayload = (await viewerStateResponse.json()) as {
    contactDisabledReason?: string | null;
    canContact?: boolean;
  };
  const serializedViewerState = JSON.stringify(viewerStatePayload);

  expect(viewerStatePayload.canContact).toBe(false);
  expect(viewerStatePayload.contactDisabledReason).toBe(expectedReason);
  expect(serializedViewerState).not.toContain("blockerId");
  expect(serializedViewerState).not.toContain("blockedId");
  expect(serializedViewerState).not.toContain("@roomshare.dev");

  const sidebar = page.getByTestId("contact-host-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByTestId("contact-host-disabled-state")).toBeVisible();
  const button = sidebar.getByRole("button", { name: buttonLabel });
  await expect(button).toBeVisible();
  await expect(button).toBeDisabled();
  await expect(sidebar.getByTestId("contact-host-disabled-copy")).toHaveText(
    message
  );

  await expect(page).toHaveURL(new RegExp(`/listings/${listingId}$`));
  await expect(page).not.toHaveURL(/\/messages\//);
  expect(contactStartRequests).toEqual([]);
  await expect(page.locator("body")).not.toContainText(
    /Application error|Unhandled Runtime Error|This page could not be found/i
  );
  await expect(page.locator("body")).not.toContainText(
    /HOST_BLOCKED_VIEWER|VIEWER_BLOCKED_HOST|blockerId|blockedId|has blocked you|blocked you/i
  );

  return { listingId, viewerStatePayload };
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("Contact Host listing detail runtime", () => {
  test.slow();

  test("authenticated non-owner sees contact-first sidebar CTA", async ({
    page,
  }) => {
    await openReviewerListing(page);

    await expect(page.getByText(/hosted by e2e reviewer/i).first()).toBeVisible(
      {
        timeout: 30_000,
      }
    );
    await expect(
      page.getByText(/contact host to confirm availability/i)
    ).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("availability-badge")).toBeVisible();
    await expect(
      page.getByText(/no booking request or hold is created from this page/i)
    ).toBeVisible();

    const sidebar = page.getByTestId("contact-host-sidebar");
    await expect(sidebar).toBeVisible();
    await expect(
      sidebar
        .getByRole("button", { name: /contact host|unlock to contact/i })
        .or(sidebar.getByRole("link", { name: /verify email|sign in/i }))
        .first()
    ).toBeVisible();
  });

  test("checkout return unlocks contact after fulfilled payment status", async ({
    page,
  }) => {
    const browserErrors = captureBrowserErrors(page);
    const listingId = reviewerListingId();
    test.skip(!listingId, "Reviewer listing seed manifest missing");
    if (!listingId) {
      throw new Error("Reviewer listing seed manifest missing");
    }

    try {
      const viewerState = await mockCheckoutReturnViewerState(page);
      const checkoutSession = await mockFulfilledCheckoutSession(
        page,
        listingId
      );

      await openReviewerListing(
        page,
        `?contactCheckout=success&session_id=${CHECKOUT_RETURN_SESSION_ID}&startDate=2026-05-01`
      );

      const sidebar = page.getByTestId("contact-host-sidebar");
      await expect(sidebar).toBeVisible();
      await expect(
        sidebar.getByRole("button", { name: /finalizing purchase/i })
      ).toBeVisible({ timeout: 30_000 });

      checkoutSession.release();

      await expect(page.getByTestId("checkout-return-banner")).toContainText(
        "Contact unlocked. You can message the host now.",
        { timeout: 30_000 }
      );
      await expect(
        sidebar.getByRole("button", { name: "Contact Host" })
      ).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveURL(
        new RegExp(`/listings/${listingId}\\?startDate=2026-05-01$`)
      );
      await expect
        .poll(() => viewerState.calls(), {
          message: "viewer-state should refresh after fulfilled checkout",
        })
        .toBeGreaterThanOrEqual(2);

      const checkoutRequestUrl = checkoutSession.requestUrl();
      expect(checkoutRequestUrl).toContain(
        `session_id=${CHECKOUT_RETURN_SESSION_ID}`
      );
      expect(checkoutRequestUrl).toContain(`listing_id=${listingId}`);
      expect(checkoutRequestUrl).toContain("context=CONTACT_HOST");
      await expect(page.locator("body")).not.toContainText(
        /Application error|Unhandled Runtime Error|This page could not be found/i
      );
      browserErrors.expectClean();
    } finally {
      browserErrors.dispose();
    }
  });
});

test.describe("Contact Host listing detail state matrix", () => {
  test.slow();

  test("state matrix: paywall-required viewer sees unlock dialog and contact start remains blocked", async ({
    page,
  }) => {
    const browserErrors = captureBrowserErrors(page);

    try {
      const viewerState = await mockViewerState(
        page,
        PAYWALL_REQUIRED_VIEWER_STATE
      );
      const listingStatus = await mockListingStatus(page, null);
      const listingId = await openReviewerListing(page);

      await expect
        .poll(() => viewerState.calls(), {
          message: "paywall-required viewer-state should be requested",
        })
        .toBeGreaterThanOrEqual(1);
      await expect
        .poll(() => listingStatus.calls(), {
          message: "listing status freshness route should be requested",
        })
        .toBeGreaterThanOrEqual(1);

      const sidebar = page.getByTestId("contact-host-sidebar");
      await expect(sidebar).toBeVisible();
      await expect(
        sidebar.getByRole("button", { name: "Unlock to Contact" })
      ).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveURL(new RegExp(`/listings/${listingId}$`));

      await sidebar.getByRole("button", { name: "Unlock to Contact" }).click();
      await expect(page.getByTestId("contact-paywall-dialog")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Unlock contact" })
      ).toBeVisible();
      await expect(
        page.getByTestId("checkout-offer-CONTACT_PACK_3")
      ).toContainText("3 contacts");
      await expect(
        page.getByTestId("checkout-offer-CONTACT_PACK_3")
      ).toContainText("$4.99");
      await expect(page).not.toHaveURL(/\/messages\//);
      await expect(page.locator("body")).not.toContainText(
        /Application error|Unhandled Runtime Error|This page could not be found/i
      );
      browserErrors.expectClean();
    } finally {
      browserErrors.dispose();
    }
  });

  for (const stateCase of DISABLED_STATE_CASES) {
    test(`state matrix: ${stateCase.name} shows unavailable warning and no contact CTA`, async ({
      page,
    }) => {
      const browserErrors = captureBrowserErrors(page);

      try {
        const viewerState = await mockViewerState(
          page,
          disabledViewerState(stateCase.reason)
        );
        const listingStatus = await mockListingStatus(
          page,
          stateCase.reason,
          stateCase.publicStatus
        );
        const listingId = await openReviewerListing(page);

        await expect
          .poll(() => viewerState.calls(), {
            message: `${stateCase.name} viewer-state should be requested`,
          })
          .toBeGreaterThanOrEqual(1);
        await expect
          .poll(() => listingStatus.calls(), {
            message: `${stateCase.name} status route should be requested`,
          })
          .toBeGreaterThanOrEqual(1);

        await expect(
          page.getByRole("heading", { name: "Listing Currently Unavailable" })
        ).toBeVisible({ timeout: 30_000 });
        await expect(
          page.getByText("This listing is temporarily unavailable right now.")
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Refresh Page" })
        ).toBeVisible();

        await expect(
          page.getByText(/contact host to confirm availability/i)
        ).toBeVisible();
        const sidebar = page.getByTestId("contact-host-sidebar");
        await expect(sidebar).toHaveCount(1);
        await expect(
          sidebar.getByRole("button", {
            name: /contact host|unlock to contact/i,
          })
        ).toHaveCount(0);
        await expect(
          sidebar.getByRole("link", { name: /sign in|verify email/i })
        ).toHaveCount(0);
        await expect(page).toHaveURL(new RegExp(`/listings/${listingId}$`));
        await expect(page).not.toHaveURL(/\/messages\//);
        await expect(page.locator("body")).not.toContainText(
          /Application error|Unhandled Runtime Error|This page could not be found/i
        );
        browserErrors.expectClean();
      } finally {
        browserErrors.dispose();
      }
    });
  }
});

test.describe("Contact Host listing detail suspended viewer state", () => {
  test.slow();
  test.use({ storageState: "playwright/.auth/suspended-viewer.json" });

  test("suspended viewer sees disabled contact CTA before click", async ({
    page,
  }) => {
    const browserErrors = captureBrowserErrors(page);

    try {
      await expectContactRestrictionState({
        page,
        listingTitle: REVIEWER_LISTING_TITLE,
        expectedReason: "VIEWER_SUSPENDED",
        buttonLabel: "Messaging Unavailable",
        message: "Your account cannot start new conversations right now.",
      });
      browserErrors.expectClean();
    } finally {
      browserErrors.dispose();
    }
  });
});

test.describe("Contact Host listing detail suspended and blocked states", () => {
  test.slow();

  const contactRestrictionCases = [
    {
      name: "suspended host",
      listingTitle: SUSPENDED_HOST_LISTING_TITLE,
      expectedReason: "HOST_SUSPENDED",
      buttonLabel: "Host Not Accepting Messages",
      message: "This host is not accepting new conversations right now.",
    },
    {
      name: "viewer blocks host",
      listingTitle: VIEWER_BLOCKS_HOST_LISTING_TITLE,
      expectedReason: "VIEWER_BLOCKED_HOST",
      buttonLabel: "Unblock Host to Contact",
      message: "Remove your block to start a new conversation with this host.",
    },
    {
      name: "host blocks viewer",
      listingTitle: HOST_BLOCKS_VIEWER_LISTING_TITLE,
      expectedReason: "HOST_BLOCKED_VIEWER",
      buttonLabel: "Contact Unavailable",
      message: "Messaging is unavailable for this listing right now.",
    },
  ] as const;

  for (const stateCase of contactRestrictionCases) {
    test(`${stateCase.name} shows disabled contact CTA before click`, async ({
      page,
    }) => {
      const browserErrors = captureBrowserErrors(page);

      try {
        await expectContactRestrictionState({
          page,
          listingTitle: stateCase.listingTitle,
          expectedReason: stateCase.expectedReason,
          buttonLabel: stateCase.buttonLabel,
          message: stateCase.message,
        });
        browserErrors.expectClean();
      } finally {
        browserErrors.dispose();
      }
    });
  }
});

test.describe("Contact Host listing detail runtime anonymous", () => {
  test.slow();
  test.use({ storageState: { cookies: [], origins: [] } });

  test("anonymous visitor sees sign-in-to-contact CTA", async ({ page }) => {
    await openReviewerListing(page);

    await expect(
      page.getByRole("link", { name: /sign in to contact host/i }).first()
    ).toBeVisible({ timeout: 45_000 });
  });
});
