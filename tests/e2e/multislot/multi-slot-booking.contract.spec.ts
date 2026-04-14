import {
  test as base,
  expect,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";

type BookingMode = "SHARED" | "WHOLE_UNIT";

type DateRange = {
  startDate: string;
  endDate: string;
};

type UserSeed = {
  id: string;
  email: string;
  password: string;
  storageStatePath: string;
};

type ListingSeed = {
  id: string;
  slug: string;
  title: string;
  totalSlots: number;
  bookingMode: BookingMode;
};

type BookingSeed = {
  id: string;
  status: string;
};

type AvailabilitySnapshot = {
  listingId: string;
  totalSlots: number;
  effectiveAvailableSlots: number;
  heldSlots: number;
  acceptedSlots: number;
  availabilityVersion: number;
};

type SeedApi = {
  reset(): Promise<void>;
  createUsers(): Promise<{
    host: UserSeed;
    tenantA: UserSeed;
    tenantB: UserSeed;
  }>;
  createListing(input: {
    hostId: string;
    title?: string;
    totalSlots: number;
    bookingMode?: BookingMode;
    availableSlots?: number;
  }): Promise<ListingSeed>;
  seedAccepted(input: {
    listingId: string;
    tenantId: string;
    range: DateRange;
    slotsRequested: number;
  }): Promise<BookingSeed>;
  seedHeld(input: {
    listingId: string;
    tenantId: string;
    range: DateRange;
    slotsRequested: number;
    ttlMinutes?: number;
    heldUntilIso?: string;
  }): Promise<BookingSeed>;
  seedPending(input: {
    listingId: string;
    tenantId: string;
    range: DateRange;
    slotsRequested: number;
  }): Promise<BookingSeed>;
  expireHoldNow(bookingId: string): Promise<void>;
  runSweeper(): Promise<void>;
  runReconcile(): Promise<void>;
  getAvailability(listingId: string, range: DateRange): Promise<AvailabilitySnapshot>;
  countBookings(input: {
    listingId: string;
    tenantId?: string;
    status?: string;
  }): Promise<number>;
  enableBarrier(input: { name: string; parties: number }): Promise<void>;
  disableBarrier(name: string): Promise<void>;
};

const RANGE_A: DateRange = {
  startDate: "2026-06-10",
  endDate: "2026-06-20",
};

const SF_BOUNDS = {
  minLat: "37.70",
  maxLat: "37.85",
  minLng: "-122.52",
  maxLng: "-122.35",
};

async function api<T>(
  request: APIRequestContext,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const headers = {
    Authorization: `Bearer ${process.env.E2E_TEST_SECRET}`,
  };

  const response =
    method === "GET"
      ? await request.get(path, { headers })
      : method === "POST"
        ? await request.post(path, { data: body, headers })
        : await request.delete(path, { headers });

  const text = await response.text();
  if (!response.ok()) {
    throw new Error(`${method} ${path} failed: ${response.status()} ${text}`);
  }

  return text ? (JSON.parse(text) as T) : (undefined as T);
}

const test = base.extend<{
  seed: SeedApi;
  users: { host: UserSeed; tenantA: UserSeed; tenantB: UserSeed };
  host: UserSeed;
  tenantA: UserSeed;
  tenantB: UserSeed;
}>({
  seed: async ({ request }, use) => {
    const seed: SeedApi = {
      reset: () => api(request, "DELETE", "/api/test/reset"),
      createUsers: () => api(request, "POST", "/api/test/setup/users"),
      createListing: (input) =>
        api(request, "POST", "/api/test/setup/listing", input),
      seedAccepted: (input) =>
        api(request, "POST", "/api/test/setup/booking", {
          ...input,
          status: "ACCEPTED",
        }),
      seedHeld: (input) =>
        api(request, "POST", "/api/test/setup/booking", {
          ...input,
          status: "HELD",
        }),
      seedPending: (input) =>
        api(request, "POST", "/api/test/setup/booking", {
          ...input,
          status: "PENDING",
        }),
      expireHoldNow: (bookingId) =>
        api(request, "POST", `/api/test/holds/${bookingId}/expire-now`),
      runSweeper: () =>
        api(request, "POST", "/api/test/cron/sweep-expired-holds"),
      runReconcile: () =>
        api(request, "POST", "/api/test/cron/reconcile-slots"),
      getAvailability: (listingId, range) =>
        api(
          request,
          "GET",
          `/api/test/availability?listingId=${listingId}&startDate=${range.startDate}&endDate=${range.endDate}`
        ),
      countBookings: async (input) => {
        const result = await api<{ count: number }>(
          request,
          "POST",
          "/api/test/bookings/count",
          input
        );
        return result.count;
      },
      enableBarrier: (input) =>
        api(request, "POST", "/api/test/barriers", input),
      disableBarrier: (name) =>
        api(request, "DELETE", `/api/test/barriers/${name}`),
    };

    await use(seed);
  },

  users: async ({ seed }, use) => {
    await use(await seed.createUsers());
  },

  host: async ({ users }, use) => {
    await use(users.host);
  },

  tenantA: async ({ users }, use) => {
    await use(users.tenantA);
  },

  tenantB: async ({ users }, use) => {
    await use(users.tenantB);
  },
});

function buildSearchUrl(
  projectName: string,
  range: DateRange,
  minSlots: number
): string {
  const params = new URLSearchParams({
    moveInDate: range.startDate,
    endDate: range.endDate,
    minSlots: String(minSlots),
    minLat: SF_BOUNDS.minLat,
    maxLat: SF_BOUNDS.maxLat,
    minLng: SF_BOUNDS.minLng,
    maxLng: SF_BOUNDS.maxLng,
  });

  if (projectName.includes("legacy")) {
    params.set("searchDoc", "0");
  } else {
    params.set("searchDoc", "1");
  }

  if (projectName.includes("semantic")) {
    params.set("what", "quiet");
    params.set("sort", "recommended");
  }

  return `/search?${params.toString()}`;
}

async function newAuthedPage(
  browser: Browser,
  storageStatePath: string
): Promise<Page> {
  const context = await browser.newContext({ storageState: storageStatePath });
  return context.newPage();
}

async function closePage(page: Page): Promise<void> {
  await page.context().close();
}

async function gotoListing(
  page: Page,
  listing: ListingSeed,
  range: DateRange
): Promise<void> {
  await page.goto(
    `/listings/${listing.slug}?startDate=${range.startDate}&endDate=${range.endDate}`,
    {
      waitUntil: "domcontentloaded",
    }
  );
  await expect(page.getByTestId("availability-badge")).toBeVisible();
}

async function gotoSearch(
  page: Page,
  projectName: string,
  range: DateRange,
  minSlots: number
): Promise<void> {
  await page.goto(buildSearchUrl(projectName, range, minSlots), {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("search-shell")).toBeVisible();
}

function listingCard(page: Page, listingId: string) {
  return page
    .locator(`[data-testid="listing-card"][data-listing-id="${listingId}"]`)
    .first();
}

async function expectListingVisible(page: Page, listingId: string) {
  await expect(listingCard(page, listingId)).toBeVisible();
}

async function expectListingHidden(page: Page, listingId: string) {
  await expect(listingCard(page, listingId)).toHaveCount(0);
}

async function selectSlots(page: Page, slots: number): Promise<void> {
  await page.getByTestId("slot-selector").selectOption(String(slots));
}

async function placeHold(page: Page): Promise<"success" | "error"> {
  await page.getByTestId("hold-button").click();

  return Promise.race([
    page
      .waitForURL(/\/bookings/, { timeout: 20_000 })
      .then(() => "success" as const),
    page
      .getByTestId("booking-success")
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => "success" as const),
    page
      .getByTestId("booking-error")
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => "error" as const),
  ]);
}

test.beforeEach(async ({ seed }) => {
  await seed.reset();
});

test.describe("Multi-slot booking contract", () => {
  test("search respects requested slot count for selected dates", async ({
    browser,
    seed,
    host,
    tenantA,
  }, testInfo) => {
    const listing = await seed.createListing({
      hostId: host.id,
      totalSlots: 4,
      bookingMode: "SHARED",
    });

    await seed.seedAccepted({
      listingId: listing.id,
      tenantId: tenantA.id,
      range: RANGE_A,
      slotsRequested: 2,
    });

    const page = await newAuthedPage(browser, tenantA.storageStatePath);
    await gotoSearch(page, testInfo.project.name, RANGE_A, 2);
    await expectListingVisible(page, listing.id);

    await seed.seedHeld({
      listingId: listing.id,
      tenantId: tenantA.id,
      range: RANGE_A,
      slotsRequested: 1,
      ttlMinutes: 15,
    });

    await gotoSearch(page, testInfo.project.name, RANGE_A, 2);
    await expectListingHidden(page, listing.id);

    await gotoSearch(page, testInfo.project.name, RANGE_A, 1);
    await expectListingVisible(page, listing.id);
    await closePage(page);
  });

  test("listing page and search agree on effective availability", async ({
    browser,
    seed,
    host,
    tenantA,
  }, testInfo) => {
    const listing = await seed.createListing({
      hostId: host.id,
      totalSlots: 4,
      bookingMode: "SHARED",
    });

    await seed.seedAccepted({
      listingId: listing.id,
      tenantId: tenantA.id,
      range: RANGE_A,
      slotsRequested: 1,
    });
    await seed.seedHeld({
      listingId: listing.id,
      tenantId: tenantA.id,
      range: RANGE_A,
      slotsRequested: 1,
      ttlMinutes: 15,
    });

    const searchPage = await newAuthedPage(browser, tenantA.storageStatePath);
    await gotoSearch(searchPage, testInfo.project.name, RANGE_A, 2);
    await expect(listingCard(searchPage, listing.id)).toContainText(
      /2.*available/i
    );

    const listingPage = await newAuthedPage(browser, tenantA.storageStatePath);
    await gotoListing(listingPage, listing, RANGE_A);
    await expect(listingPage.getByTestId("availability-badge")).toContainText(
      /2.*available/i
    );

    const snapshot = await seed.getAvailability(listing.id, RANGE_A);
    expect(snapshot.effectiveAvailableSlots).toBe(2);

    await closePage(searchPage);
    await closePage(listingPage);
  });

  test("hold decrements immediately for the selected range", async ({
    browser,
    seed,
    host,
    tenantA,
  }) => {
    const listing = await seed.createListing({
      hostId: host.id,
      totalSlots: 3,
      bookingMode: "SHARED",
    });

    const page = await newAuthedPage(browser, tenantA.storageStatePath);
    await gotoListing(page, listing, RANGE_A);
    await expect(page.getByTestId("availability-badge")).toContainText(
      /3.*available/i
    );

    const outcome = await placeHold(page);
    expect(outcome).toBe("success");

    await expect
      .poll(async () => {
        const snapshot = await seed.getAvailability(listing.id, RANGE_A);
        return snapshot.effectiveAvailableSlots;
      })
      .toBe(2);

    expect(
      await seed.countBookings({
        listingId: listing.id,
        tenantId: tenantA.id,
        status: "HELD",
      })
    ).toBe(1);

    await closePage(page);
  });

  test("hold expiry restores capacity exactly once", async ({
    seed,
    host,
    tenantA,
  }) => {
    const listing = await seed.createListing({
      hostId: host.id,
      totalSlots: 3,
      bookingMode: "SHARED",
    });

    const hold = await seed.seedHeld({
      listingId: listing.id,
      tenantId: tenantA.id,
      range: RANGE_A,
      slotsRequested: 1,
      ttlMinutes: 15,
    });

    expect((await seed.getAvailability(listing.id, RANGE_A)).effectiveAvailableSlots).toBe(2);

    await seed.expireHoldNow(hold.id);

    await expect
      .poll(async () => {
        const snapshot = await seed.getAvailability(listing.id, RANGE_A);
        return snapshot.effectiveAvailableSlots;
      })
      .toBe(3);

    await seed.runSweeper();
    await seed.runReconcile();

    const snapshotAfterSweeper = await seed.getAvailability(listing.id, RANGE_A);
    expect(snapshotAfterSweeper.effectiveAvailableSlots).toBe(3);
    expect(
      await seed.countBookings({
        listingId: listing.id,
        status: "HELD",
      })
    ).toBe(0);
    expect(
      await seed.countBookings({
        listingId: listing.id,
        status: "EXPIRED",
      })
    ).toBe(1);
  });

  test("pending bookings do not consume capacity", async ({
    browser,
    seed,
    host,
    tenantA,
  }, testInfo) => {
    const listing = await seed.createListing({
      hostId: host.id,
      totalSlots: 2,
      bookingMode: "SHARED",
    });

    await seed.seedPending({
      listingId: listing.id,
      tenantId: tenantA.id,
      range: RANGE_A,
      slotsRequested: 1,
    });

    const snapshot = await seed.getAvailability(listing.id, RANGE_A);
    expect(snapshot.effectiveAvailableSlots).toBe(2);

    const searchPage = await newAuthedPage(browser, tenantA.storageStatePath);
    await gotoSearch(searchPage, testInfo.project.name, RANGE_A, 2);
    await expectListingVisible(searchPage, listing.id);

    const listingPage = await newAuthedPage(browser, tenantA.storageStatePath);
    await gotoListing(listingPage, listing, RANGE_A);
    await expect(listingPage.getByTestId("availability-badge")).toContainText(
      /2.*available/i
    );

    await closePage(searchPage);
    await closePage(listingPage);
  });

  test("whole-unit listings hide the slot selector and show the whole-unit badge", async ({
    browser,
    seed,
    host,
    tenantA,
  }) => {
    const listing = await seed.createListing({
      hostId: host.id,
      totalSlots: 3,
      bookingMode: "WHOLE_UNIT",
    });

    const page = await newAuthedPage(browser, tenantA.storageStatePath);
    await gotoListing(page, listing, RANGE_A);

    await expect(page.getByTestId("whole-unit-badge")).toBeVisible();
    await expect(page.getByTestId("slot-selector")).toHaveCount(0);
    await closePage(page);
  });

  test("race: concurrent holds reserve capacity for only one browser flow", async ({
    browser,
    seed,
    host,
    tenantA,
    tenantB,
  }) => {
    const listing = await seed.createListing({
      hostId: host.id,
      totalSlots: 3,
      bookingMode: "SHARED",
    });

    await seed.seedAccepted({
      listingId: listing.id,
      tenantId: tenantA.id,
      range: RANGE_A,
      slotsRequested: 1,
    });

    await seed.enableBarrier({
      name: "booking:hold:before-availability-check",
      parties: 2,
    });

    const pageA = await newAuthedPage(browser, tenantA.storageStatePath);
    const pageB = await newAuthedPage(browser, tenantB.storageStatePath);

    try {
      await Promise.all([
        gotoListing(pageA, listing, RANGE_A),
        gotoListing(pageB, listing, RANGE_A),
      ]);
      await Promise.all([selectSlots(pageA, 2), selectSlots(pageB, 2)]);

      const outcomes = await Promise.all([placeHold(pageA), placeHold(pageB)]);
      expect(outcomes.sort()).toEqual(["error", "success"]);

      await expect
        .poll(async () => {
          return seed.countBookings({
            listingId: listing.id,
            status: "HELD",
          });
        })
        .toBe(1);

      const snapshot = await seed.getAvailability(listing.id, RANGE_A);
      expect(snapshot.effectiveAvailableSlots).toBe(0);
    } finally {
      await seed.disableBarrier("booking:hold:before-availability-check");
      await closePage(pageA);
      await closePage(pageB);
    }
  });
});
