import type { Page } from "@playwright/test";
import { expect } from "../helpers";
import { CreateListingPage, type CreateListingData } from "../page-objects/create-listing.page";
import { testApi } from "../helpers/stability-helpers";

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
    throw new Error(`seedCollisionListings failed: ${JSON.stringify(response.data)}`);
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

export async function openPreparedCreateListingPage(
  page: Page,
  data: CreateListingData
): Promise<CreateListingPage> {
  const createPage = new CreateListingPage(page);
  await createPage.goto();
  await createPage.fillRequiredFields(data);
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
