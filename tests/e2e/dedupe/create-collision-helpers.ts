import type { Page } from "@playwright/test";
import { expect } from "../helpers";
import {
  CreateListingPage,
  type CreateListingData,
} from "../page-objects/create-listing.page";
import { testApi } from "../helpers/stability-helpers";
import { signAddressSuggestionToken } from "../../../src/lib/geocoding/address-suggestion-token";

const OWNER_EMAIL = process.env.E2E_TEST_EMAIL || "e2e-test@roomshare.dev";

export const COLLISION_ADDRESS = {
  address: "1555 Market St",
  city: "San Francisco",
  state: "CA",
  zipCode: "94103",
} as const;

export const CROSS_OWNER_ADDRESS = {
  address: "88 3rd St",
  city: "San Francisco",
  state: "CA",
  zipCode: "94103",
} as const;

type CollisionAddress = {
  address: string;
  city: string;
  state: string;
  zipCode: string;
};

export async function seedCollisionListings(
  page: Page,
  params: {
    title: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    count?: number;
    createdAtOffsetsHours?: number[];
    moveInDateOffsetsDays?: number[];
  }
): Promise<string[]> {
  const response = await testApi<{ listingIds: string[] }>(
    page,
    "seedCollisionListings",
    {
      ownerEmail: OWNER_EMAIL,
      title: params.title,
      address: params.address ?? COLLISION_ADDRESS.address,
      city: params.city ?? COLLISION_ADDRESS.city,
      state: params.state ?? COLLISION_ADDRESS.state,
      zip: params.zipCode ?? COLLISION_ADDRESS.zipCode,
      count: params.count ?? 1,
      createdAtOffsetsHours: params.createdAtOffsetsHours ?? [1],
      moveInDateOffsetsDays: params.moveInDateOffsetsDays ?? [-1],
    }
  );

  if (!response.ok) {
    throw new Error(
      `seedCollisionListings failed: ${JSON.stringify(response.data)}`
    );
  }

  return response.data.listingIds;
}

export async function deleteListings(
  page: Page,
  listingIds: string[]
): Promise<void> {
  if (listingIds.length === 0) return;

  const response = await testApi<{ deleted: number }>(page, "deleteListings", {
    listingIds,
  });
  if (!response.ok) {
    throw new Error(`deleteListings failed: ${JSON.stringify(response.data)}`);
  }
}

export async function getListingCollisionState(
  page: Page,
  listingId: string
): Promise<{ id: string; normalizedAddress: string | null }> {
  const response = await testApi<{
    id: string;
    normalizedAddress: string | null;
  }>(page, "getListingCollisionState", {
    listingId,
  });

  if (!response.ok) {
    throw new Error(
      `getListingCollisionState failed: ${JSON.stringify(response.data)}`
    );
  }

  return response.data;
}

export function buildCollisionFormData(
  title: string,
  address: CollisionAddress = COLLISION_ADDRESS
): CreateListingData {
  const suffix = Date.now();

  return {
    title: `${title} ${suffix}`,
    description:
      "A valid collision-flow listing description with enough detail to pass client validation.",
    price: "1200",
    totalSlots: "2",
    address: address.address,
    city: address.city,
    state: address.state,
    zipCode: address.zipCode,
  };
}

async function getOwnerId(page: Page): Promise<string> {
  const sessionResponse = await page.request.get("/api/auth/session");
  if (sessionResponse.ok()) {
    const session = (await sessionResponse.json()) as {
      user?: { id?: string | null };
    };
    if (session.user?.id) {
      return session.user.id;
    }
  }

  const response = await testApi<{ id: string }>(page, "findUserByEmail", {
    email: OWNER_EMAIL,
  });

  if (!response.ok) {
    throw new Error(`findUserByEmail failed: ${JSON.stringify(response.data)}`);
  }

  return response.data.id;
}

async function mockAddressSuggestionForCollision(
  page: Page,
  data: CreateListingData
): Promise<void> {
  const ownerId = await getOwnerId(page);
  const issuedAt = Date.now();
  const addressSuggestionToken = signAddressSuggestionToken({
    provider: "google",
    precision: "PREMISE",
    sourceId: `e2e-collision:${data.address}:${data.zipCode}`,
    userId: ownerId,
    address: data.address,
    city: data.city,
    state: data.state,
    zip: data.zipCode,
    lat: 37.7861,
    lng: -122.4094,
    issuedAt,
    expiresAt: issuedAt + 15 * 60 * 1000,
  });

  await page.route(
    /\/api\/geocoding\/address-autocomplete(?:\?|$)/,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          suggestions: [
            {
              id: `e2e-collision-${data.zipCode}`,
              label: `${data.address}, ${data.city}, ${data.state} ${data.zipCode}`,
              primaryText: data.address,
              secondaryText: `${data.city}, ${data.state} ${data.zipCode}`,
              address: data.address,
              city: data.city,
              state: data.state,
              zip: data.zipCode,
              lat: 37.7861,
              lng: -122.4094,
              precision: "PREMISE",
              provider: "google",
              addressSuggestionToken,
            },
          ],
        }),
      });
    }
  );
}

async function selectCollisionAddressSuggestion(
  page: Page,
  createPage: CreateListingPage,
  data: CreateListingData
): Promise<void> {
  await mockAddressSuggestionForCollision(page, data);
  const suggestionsResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/geocoding/address-autocomplete") &&
      response.request().method() === "GET" &&
      response.status() === 200,
    { timeout: 15_000 }
  );
  await createPage.addressInput.fill(data.address);
  await suggestionsResponse;
  await expect(
    page.getByRole("listbox", { name: "Address suggestions" })
  ).toBeVisible();
  const providerSuggestion = page
    .getByRole("option")
    .filter({ hasText: data.address })
    .filter({ hasText: data.city })
    .first();
  await expect(providerSuggestion).toBeVisible();
  await providerSuggestion.click();
  await expect(createPage.addressInput).toHaveValue(data.address);
  await expect(createPage.cityInput).toHaveValue(data.city);
  await expect(createPage.stateInput).toHaveValue(data.state);
  await expect(createPage.zipInput).toHaveValue(data.zipCode);
}

export async function openPreparedCreateListingPage(
  page: Page,
  data: CreateListingData
): Promise<CreateListingPage> {
  const createPage = new CreateListingPage(page);
  await createPage.goto();
  await createPage.fillBasics(data);
  await selectCollisionAddressSuggestion(page, createPage, data);
  await createPage.fillOptionalFields({ moveInDate: "today" });
  await createPage.mockImageUpload();
  await createPage.uploadTestImage();
  await createPage.waitForUploadComplete();
  return createPage;
}

export async function expectCreatedListingId(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/listings\/(?!create)[^/?#]+/);
  const match = page.url().match(/\/listings\/([^/?#]+)/);
  if (!match) {
    throw new Error(`Could not extract listing id from URL: ${page.url()}`);
  }
  return match[1];
}
