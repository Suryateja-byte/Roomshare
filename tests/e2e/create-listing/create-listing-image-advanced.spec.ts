import { Buffer } from "node:buffer";
import { type Page } from "@playwright/test";
import { test, expect, tags } from "../helpers/test-utils";
import {
  CreateListingPage,
  type UploadFilePayload,
} from "../page-objects/create-listing.page";

type UploadResult =
  | { ok: true; url: string; delayMs?: number }
  | { ok: false; error: string; delayMs?: number };

function imagePayload(name: string, body = "test-image"): UploadFilePayload {
  return {
    name,
    mimeType: "image/jpeg",
    buffer: Buffer.from(body),
  };
}

async function mockUploadSequence(page: Page, results: UploadResult[]) {
  let attempt = 0;

  await page.route("**/api/upload", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    const result = results[Math.min(attempt, results.length - 1)];
    attempt += 1;

    if (result.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, result.delayMs));
    }

    if (result.ok) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: result.url }),
      });
      return;
    }

    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: result.error }),
    });
  });

  return () => attempt;
}

test.describe("Create Listing - Advanced Image Upload", () => {
  test.use({ storageState: "playwright/.auth/user.json" });

  test.beforeEach(async () => {
    test.slow();
  });

  test(`${tags.auth} uploads images by drag and drop`, async ({ page }) => {
    const createPage = new CreateListingPage(page);
    await createPage.mockImageUpload();
    await createPage.goto();

    await createPage.dropFilePayload(imagePayload("drag-drop.jpg"));

    await createPage.expectImagePreviewCount(1);
    await expect(page.getByText("1 image uploaded successfully")).toBeVisible();
  });

  test(`${tags.auth} file over 5MB shows error and is not uploaded`, async ({
    page,
  }) => {
    const createPage = new CreateListingPage(page);
    const getUploadAttempts = await mockUploadSequence(page, [
      {
        ok: true,
        url: "https://fake.supabase.co/storage/v1/object/public/images/listings/oversized/unexpected.jpg",
      },
    ]);

    await createPage.goto();
    await createPage.uploadFilePayload({
      name: "too-large.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 1),
    });

    await expect(page.getByText(/exceeded 5MB/i)).toBeVisible();
    await createPage.expectImagePreviewCount(0);
    expect(getUploadAttempts()).toBe(0);
  });

  test(`${tags.auth} retry all failed uploads succeeds`, async ({ page }) => {
    const createPage = new CreateListingPage(page);
    await mockUploadSequence(page, [
      { ok: false, error: "Upload failed one" },
      { ok: false, error: "Upload failed two" },
      {
        ok: true,
        url: "https://fake.supabase.co/storage/v1/object/public/images/listings/retry-all/one.jpg",
      },
      {
        ok: true,
        url: "https://fake.supabase.co/storage/v1/object/public/images/listings/retry-all/two.jpg",
      },
    ]);

    await createPage.goto();
    await createPage.uploadFilePayload([
      imagePayload("retry-all-one.jpg"),
      imagePayload("retry-all-two.jpg"),
    ]);

    await createPage.waitForUploadFailures(2);
    await createPage.retryAllFailedUploads();

    await expect(page.getByText("2 images uploaded successfully")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/failed to upload/i)).not.toBeVisible();
  });

  test(`${tags.auth} cancel upload removes pending upload safely`, async ({
    page,
  }) => {
    const createPage = new CreateListingPage(page);
    await mockUploadSequence(page, [
      {
        ok: true,
        url: "https://fake.supabase.co/storage/v1/object/public/images/listings/cancel/late.jpg",
        delayMs: 1_200,
      },
    ]);

    await createPage.goto();
    await createPage.uploadFilePayload(imagePayload("cancel-me.jpg"));

    await expect(page.locator("form .animate-spin").first()).toBeVisible();
    await createPage.cancelUploads();

    await createPage.expectImagePreviewCount(0);
    await expect(page.getByRole("button", { name: /publish/i })).toBeEnabled();
  });

  test(`${tags.auth} partial failed uploads can be fixed or published with successful photos`, async ({
    page,
  }) => {
    const createPage = new CreateListingPage(page);
    await mockUploadSequence(page, [
      {
        ok: true,
        url: "https://fake.supabase.co/storage/v1/object/public/images/listings/partial/success.jpg",
      },
      { ok: false, error: "Second upload failed" },
    ]);

    await createPage.goto();
    await createPage.fillRequiredFields({
      title: "Partial Upload Listing",
      description:
        "This listing proves partial upload confirmation keeps successful photos.",
      price: "1550",
      totalSlots: "2",
      address: "88 Partial Way",
      city: "San Francisco",
      state: "CA",
      zipCode: "94102",
    });
    await createPage.uploadFilePayload([
      imagePayload("partial-success.jpg"),
      imagePayload("partial-fail.jpg"),
    ]);
    await createPage.waitForUploadComplete(1);
    await createPage.waitForUploadFailures(1);

    const getBodies =
      await createPage.mockListingApiSuccessWithCapture("partial-success-id");

    await createPage.submit();
    await createPage.expectPartialUploadDialog();
    expect(getBodies()).toHaveLength(0);

    await createPage.goBackFromPartialUploadDialog();
    await expect(createPage.titleInput).toHaveValue("Partial Upload Listing");

    await createPage.submit();
    await createPage.expectPartialUploadDialog();

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/listings") &&
        response.request().method() === "POST"
    );
    await createPage.publishWithSuccessfulPhotos(1);
    const response = await responsePromise;

    expect(response.status()).toBe(201);
    expect(getBodies()).toHaveLength(1);
    expect(getBodies()[0].images).toEqual([
      "https://fake.supabase.co/storage/v1/object/public/images/listings/partial/success.jpg",
    ]);
    await createPage.expectSuccess();
  });

  test(`${tags.auth} removing uploaded image attempts storage delete`, async ({
    page,
  }) => {
    const createPage = new CreateListingPage(page);
    const deleteBodies: Array<{ path?: string }> = [];

    await page.route("**/api/upload", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            url: "https://fake.supabase.co/storage/v1/object/public/images/listings/delete-test/photo-1.jpg",
          }),
        });
        return;
      }

      if (route.request().method() === "DELETE") {
        const body = route.request().postData();
        deleteBodies.push(body ? JSON.parse(body) : {});
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
        return;
      }

      await route.continue();
    });

    await createPage.goto();
    await createPage.uploadFilePayload(imagePayload("delete-me.jpg"));
    await createPage.waitForUploadComplete();
    await createPage.removeImageAt(0);

    await createPage.expectImagePreviewCount(0);
    await expect(async () => {
      expect(deleteBodies[0]?.path).toBe("listings/delete-test/photo-1.jpg");
    }).toPass({ timeout: 5_000 });
  });

  test(`${tags.auth} set as main reorders submitted image URLs`, async ({
    page,
  }) => {
    const createPage = new CreateListingPage(page);
    await mockUploadSequence(page, [
      {
        ok: true,
        url: "https://fake.supabase.co/storage/v1/object/public/images/listings/main-order/photo-1.jpg",
      },
      {
        ok: true,
        url: "https://fake.supabase.co/storage/v1/object/public/images/listings/main-order/photo-2.jpg",
      },
    ]);

    await createPage.goto();
    await createPage.fillRequiredFields({
      title: "Main Photo Order",
      description:
        "This listing proves the selected main photo is submitted first.",
      price: "1650",
      totalSlots: "2",
      address: "55 Main Photo St",
      city: "San Francisco",
      state: "CA",
      zipCode: "94102",
    });
    await createPage.uploadFilePayload([
      imagePayload("main-one.jpg"),
      imagePayload("main-two.jpg"),
    ]);
    await createPage.waitForUploadComplete(2);
    await createPage.setImageAsMainAt(1);

    const getBodies =
      await createPage.mockListingApiSuccessWithCapture("main-order-id");
    await createPage.submitAndWaitForResponse();

    expect(getBodies()[0].images).toEqual([
      "https://fake.supabase.co/storage/v1/object/public/images/listings/main-order/photo-2.jpg",
      "https://fake.supabase.co/storage/v1/object/public/images/listings/main-order/photo-1.jpg",
    ]);
  });
});
